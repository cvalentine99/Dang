/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Resume Pipeline Helper — shared core logic for pipeline continuation/replay
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Extracted from pipelineRouter.ts to eliminate duplication between
 * resumePipelineRun and continuePipelineRun. Both procedures delegate here.
 *
 * This is a plain async function (not a tRPC procedure), so it avoids
 * the circular self-reference problem that prevented using createCaller().
 *
 * Stage detection priority:
 *   1. Explicit fromStage override (if provided by caller)
 *   2. First failed stage (for failed runs — "replay" semantics)
 *   3. First pending stage (for partial/triage-only runs — "continue" semantics)
 *   4. Throws if no actionable stage found (run already completed successfully)
 */

import { TRPCError } from "@trpc/server";
import { eq, and, ne, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  pipelineRuns,
  alertQueue,
  triageObjects,
  correlationBundles,
  livingCaseState,
} from "../../drizzle/schema";
import { runTriageAgent } from "./triageAgent";
import { runCorrelationAgent } from "./correlationAgent";
import { runHypothesisAgent, rematerializeResponseActions } from "./hypothesisAgent";

/** The stage names in pipeline execution order. */
const STAGE_ORDER = ["triage", "correlation", "hypothesis", "response_actions"] as const;
type StageName = (typeof STAGE_ORDER)[number];

/** Input shape — matches the tRPC input schema. */
export interface ResumePipelineInput {
  runId: string;
  fromStage?: StageName;
}

/** Context shape — the subset of tRPC context we need. */
export interface ResumePipelineContext {
  user: { id: number };
}

/** Per-stage result shape. */
interface StageResult {
  status: string;
  triageId?: string;
  correlationId?: string;
  caseId?: number;
  sessionId?: number;
  latencyMs?: number;
  error?: string;
  reused?: boolean;
  count?: number;
  actionIds?: string[];
}

/** Full result shape returned by executeResumePipeline. */
export interface ResumePipelineResult {
  resumedRunId: string;
  originalRunId: string;
  startedFromStage: string;
  stages: {
    triage: StageResult;
    correlation: StageResult;
    hypothesis: StageResult;
    responseActions: StageResult;
  };
  totalLatencyMs: number;
  status: string;
}

/**
 * Core pipeline resume/continue logic.
 *
 * Called by both `resumePipelineRun` (canonical) and `continuePipelineRun` (alias).
 * The `runIdPrefix` parameter controls the generated run ID prefix:
 *   - "replay" for resumePipelineRun (failed-run replay)
 *   - "continue" for continuePipelineRun (partial-run continuation)
 */
export async function executeResumePipeline(
  input: ResumePipelineInput,
  ctx: ResumePipelineContext,
  runIdPrefix: "replay" | "continue" = "replay",
): Promise<ResumePipelineResult> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  // 1. Fetch the original run
  const [originalRun] = await db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.runId, input.runId))
    .limit(1);

  if (!originalRun) {
    throw new TRPCError({ code: "NOT_FOUND", message: `Pipeline run '${input.runId}' not found` });
  }

  if (originalRun.status === "running") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot resume a currently running pipeline" });
  }

  // ── Audit #26: Dedup guard — prevent double-resume on same pipeline run ──
  // NOTE: The actual guard + INSERT are wrapped in a transaction below (see
  // "Atomic dedup guard" section) to eliminate the TOCTOU race.

  // 2. Determine which stage to start from
  let startStage = input.fromStage;

  if (!startStage) {
    // Auto-detect: check for failed/running stages, then pending stages.
    // BUG-02 Fix: "running" stage statuses are now treated as actionable.
    // After stale cleanup, stage columns may still read "running" from old data;
    // treating them as actionable allows resume to recover these dirty rows.
    //
    // Priority 1: Find the first failed or stale-running stage
    if (originalRun.triageStatus === "failed" || originalRun.triageStatus === "running") startStage = "triage";
    else if (originalRun.correlationStatus === "failed" || originalRun.correlationStatus === "running") startStage = "correlation";
    else if (originalRun.hypothesisStatus === "failed" || originalRun.hypothesisStatus === "running") startStage = "hypothesis";
    else if (
      originalRun.responseActionsStatus === "failed" ||
      originalRun.responseActionsStatus === "partial" ||
      originalRun.responseActionsStatus === "running"
    ) {
      // Response-actions-only recovery: hypothesis succeeded, only re-materialize actions.
      // Do NOT re-run hypothesis — that would duplicate the session/case.
      startStage = "response_actions";
    }
    // Priority 2: Find the first pending stage (for partial/triage-only runs)
    else if (originalRun.triageStatus === "pending") startStage = "triage";
    else if (originalRun.correlationStatus === "pending") startStage = "correlation";
    else if (originalRun.hypothesisStatus === "pending") startStage = "hypothesis";
    else {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No actionable stage found — all stages already completed" });
    }
  }

  // 3. Validate prerequisites for the starting stage
  const startIdx = STAGE_ORDER.indexOf(startStage);
  if (startStage === "correlation" && !originalRun.triageId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot resume from correlation — no triage ID from original run" });
  }
  if (startStage === "hypothesis" && !originalRun.correlationId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot resume from hypothesis — no correlation ID from original run" });
  }
  if (startStage === "response_actions" && !originalRun.livingCaseId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot resume response actions — no living case ID from original run" });
  }
  if (startStage === "response_actions" && !originalRun.correlationId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot resume response actions — no correlation ID from original run" });
  }

  // ── BUG-06 Fix: Authoritative artifact validation ──────────────────────────
  // Don't trust non-null IDs on pipeline_runs alone. Verify the referenced
  // artifacts still exist in their source tables and are in acceptable states.
  // This prevents phantom references from carrying forward on resume.
  if (startIdx > 0 && originalRun.triageId) {
    const [triageRow] = await db
      .select({ triageId: triageObjects.triageId })
      .from(triageObjects)
      .where(eq(triageObjects.triageId, originalRun.triageId))
      .limit(1);
    if (!triageRow) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Cannot resume — referenced triage artifact '${originalRun.triageId}' no longer exists in triage_objects`,
      });
    }
  }
  if (startIdx > 1 && originalRun.correlationId) {
    const [corrRow] = await db
      .select({ correlationId: correlationBundles.correlationId, status: correlationBundles.status })
      .from(correlationBundles)
      .where(eq(correlationBundles.correlationId, originalRun.correlationId))
      .limit(1);
    if (!corrRow) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Cannot resume — referenced correlation artifact '${originalRun.correlationId}' no longer exists in correlation_bundles`,
      });
    }
    if (corrRow.status !== "completed") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Cannot resume — referenced correlation artifact '${originalRun.correlationId}' is in '${corrRow.status}' state, expected 'completed'`,
      });
    }
  }
  if (startIdx > 2 && originalRun.livingCaseId) {
    const [caseRow] = await db
      .select({ id: livingCaseState.id })
      .from(livingCaseState)
      .where(eq(livingCaseState.id, originalRun.livingCaseId))
      .limit(1);
    if (!caseRow) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Cannot resume — referenced living case artifact '${originalRun.livingCaseId}' no longer exists in living_case_state`,
      });
    }
  }

  // 4. Atomic dedup guard + create new pipeline run record.
  //    Wrapped in a transaction with FOR UPDATE to eliminate the TOCTOU race:
  //    the gap lock prevents a concurrent INSERT while this tx holds the lock.
  const resumedRunId = `${runIdPrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const startTime = Date.now();

  const [resumedRow] = await db.transaction(async (tx) => {
    // ── Stale-run TTL: mark runs stuck in "running" for >15 minutes as failed.
    // Mirrors the cleanup in runFullPipeline — without this, crashed pipelines
    // permanently block their alertId via the dedup guard.
    const STALE_RUN_TTL_MS = 15 * 60 * 1000;
    const staleCutoff = new Date(Date.now() - STALE_RUN_TTL_MS);
    await tx.update(pipelineRuns)
      .set({
        status: "failed",
        error: "Pipeline run timed out (stale TTL exceeded)",
        completedAt: new Date(),
        currentStage: "failed",
        triageStatus: sql`CASE WHEN ${pipelineRuns.triageStatus} = 'running' THEN 'failed' ELSE ${pipelineRuns.triageStatus} END`,
        correlationStatus: sql`CASE WHEN ${pipelineRuns.correlationStatus} = 'running' THEN 'failed' ELSE ${pipelineRuns.correlationStatus} END`,
        hypothesisStatus: sql`CASE WHEN ${pipelineRuns.hypothesisStatus} = 'running' THEN 'failed' ELSE ${pipelineRuns.hypothesisStatus} END`,
        responseActionsStatus: sql`CASE WHEN ${pipelineRuns.responseActionsStatus} = 'running' THEN 'failed' ELSE ${pipelineRuns.responseActionsStatus} END`,
      })
      .where(
        and(
          eq(pipelineRuns.status, "running"),
          sql`${pipelineRuns.startedAt} < ${staleCutoff}`,
        )
      );

    // Dedup guard: check for in-flight runs on the same alert
    const alertIdVal = originalRun.alertId ?? "";
    if (alertIdVal && alertIdVal !== "unknown") {
      const existingRows = await tx
        .select({ id: pipelineRuns.id, runId: pipelineRuns.runId })
        .from(pipelineRuns)
        .where(
          and(
            eq(pipelineRuns.status, "running"),
            ne(pipelineRuns.runId, input.runId),
            eq(pipelineRuns.alertId, alertIdVal),
          )
        )
        .limit(1)
        .for("update");

      if (existingRows.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Another pipeline run '${existingRows[0].runId}' is already in-flight for alert '${originalRun.alertId}'. Wait for it to complete or cancel it first.`,
        });
      }
    }

    return tx.insert(pipelineRuns).values({
      runId: resumedRunId,
      queueItemId: originalRun.queueItemId,
      alertId: originalRun.alertId,
      currentStage: startStage,
      status: "running",
      triggeredBy: `user:${ctx.user.id}`,
      // Carry forward completed stages — use spread to omit fields (defaults to NULL)
      // instead of explicit null to avoid Drizzle null-serialization bug on int columns
      ...(startIdx > 0 ? {
        triageId: originalRun.triageId,
        triageLatencyMs: originalRun.triageLatencyMs,
      } : {}),
      triageStatus: startIdx > 0 ? "completed" : "pending",
      ...(startIdx > 1 ? {
        correlationId: originalRun.correlationId,
        correlationLatencyMs: originalRun.correlationLatencyMs,
      } : {}),
      correlationStatus: startIdx > 1 ? "completed" : "pending",
      // For response_actions-only recovery (startIdx=3): hypothesis is already completed
      ...(startIdx > 2 ? {
        livingCaseId: originalRun.livingCaseId,
        hypothesisLatencyMs: originalRun.hypothesisLatencyMs,
      } : {}),
      hypothesisStatus: startIdx > 2 ? "completed" : "pending",
    }).$returningId();
  });

  const result: ResumePipelineResult = {
    resumedRunId,
    originalRunId: input.runId,
    startedFromStage: startStage,
    stages: {
      triage: startIdx > 0
        ? { status: "completed", triageId: originalRun.triageId ?? undefined, reused: true }
        : { status: "pending" },
      correlation: startIdx > 1
        ? { status: "completed", correlationId: originalRun.correlationId ?? undefined, reused: true }
        : { status: "pending" },
      hypothesis: startIdx > 2
        ? { status: "completed", caseId: originalRun.livingCaseId ?? undefined, reused: true }
        : { status: "pending" },
      responseActions: { status: "pending" },
    },
    totalLatencyMs: 0,
    status: "running",
  };

  let currentTriageId = originalRun.triageId;
  let currentCorrelationId = originalRun.correlationId;

  // ── Stage 1: Triage (if needed) ─────────────────────────────────────
  if (startIdx <= 0) {
    try {
      // We need the original raw alert — fetch from queue or triage
      let rawAlert: Record<string, unknown> | null = null;

      if (originalRun.queueItemId) {
        const [qItem] = await db.select().from(alertQueue).where(eq(alertQueue.id, originalRun.queueItemId)).limit(1);
        rawAlert = qItem?.rawJson as Record<string, unknown> | null;
      }

      if (!rawAlert && originalRun.triageId) {
        const [triageRow] = await db.select().from(triageObjects).where(eq(triageObjects.triageId, originalRun.triageId)).limit(1);
        const triageData = triageRow?.triageData as unknown as Record<string, unknown> | null;
        rawAlert = (triageData?.rawAlert as Record<string, unknown>) ?? null;
      }

      if (!rawAlert) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Cannot resume triage — original raw alert not found" });
      }

      await db.update(pipelineRuns)
        .set({ currentStage: "triage", triageStatus: "running" })
        .where(eq(pipelineRuns.id, resumedRow.id));

      const triageResult = await runTriageAgent({
        rawAlert,
        userId: ctx.user.id,
        alertQueueItemId: originalRun.queueItemId ?? undefined,
      });

      if (!triageResult.success || !triageResult.triageId) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: triageResult.error ?? "Triage failed" });
      }

      currentTriageId = triageResult.triageId;
      result.stages.triage = {
        status: "completed",
        triageId: triageResult.triageId,
        latencyMs: triageResult.latencyMs,
      };

      await db.update(pipelineRuns).set({
        triageId: triageResult.triageId,
        triageStatus: "completed",
        triageLatencyMs: triageResult.latencyMs,
        currentStage: "correlation",
      }).where(eq(pipelineRuns.id, resumedRow.id));
    } catch (err) {
      result.stages.triage = { status: "failed", error: (err as Error).message };
      result.status = "partial";
      await db.update(pipelineRuns).set({
        triageStatus: "failed",
        status: "partial",
        error: (err as Error).message,
        totalLatencyMs: Date.now() - startTime,
        completedAt: new Date(),
      }).where(eq(pipelineRuns.id, resumedRow.id));
      result.totalLatencyMs = Date.now() - startTime;
      return result;
    }
  }

  // ── Stage 2: Correlation (if needed) ────────────────────────────────
  if (startIdx <= 1) {
    try {
      if (!currentTriageId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No triage ID available for correlation" });

      await db.update(pipelineRuns)
        .set({ correlationStatus: "running", currentStage: "correlation" })
        .where(eq(pipelineRuns.id, resumedRow.id));

      const corrResult = await runCorrelationAgent({
        triageId: currentTriageId,
      });

      currentCorrelationId = corrResult.correlationId;
      result.stages.correlation = {
        status: "completed",
        correlationId: corrResult.correlationId,
        latencyMs: corrResult.latencyMs,
      };

      await db.update(pipelineRuns).set({
        correlationId: corrResult.correlationId,
        correlationStatus: "completed",
        correlationLatencyMs: corrResult.latencyMs,
        currentStage: "hypothesis",
      }).where(eq(pipelineRuns.id, resumedRow.id));
    } catch (err) {
      result.stages.correlation = { status: "failed", error: (err as Error).message };
      result.status = "partial";
      await db.update(pipelineRuns).set({
        correlationStatus: "failed",
        status: "partial",
        error: (err as Error).message,
        totalLatencyMs: Date.now() - startTime,
        completedAt: new Date(),
      }).where(eq(pipelineRuns.id, resumedRow.id));
      result.totalLatencyMs = Date.now() - startTime;
      return result;
    }
  }

  // ── Stage 3: Hypothesis + Response Actions ──────────────────────────
  // Skip if we're doing response-actions-only recovery (startIdx === 3)
  if (startIdx <= 2) {
    // BUG-01 Fix: If the original run already created a living case (e.g., hypothesis
    // succeeded but response actions failed), look up its sessionId and pass it as
    // existingSessionId so runHypothesisAgent reuses the session instead of creating a new one.
    let existingSessionId: number | undefined;
    if (originalRun.livingCaseId) {
      const [existingCase] = await db
        .select({ sessionId: livingCaseState.sessionId })
        .from(livingCaseState)
        .where(eq(livingCaseState.id, originalRun.livingCaseId))
        .limit(1);
      existingSessionId = existingCase?.sessionId ?? undefined;
    }

    // BUG-04 Fix: Hoist hypothesis result state so catch block can preserve
    // truth-bearing fields if post-materialization sync throws.
    let hypothesisLivingCaseId: number | undefined;
    let hypothesisLatencyMs: number | undefined;
    let hypothesisSessionId: number | undefined;
    let hypothesisActionIds: string[] | undefined;
    let hypothesisPartialFailure: typeof result.stages.responseActions | undefined;

    try {
      if (!currentCorrelationId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No correlation ID available for hypothesis" });

      await db.update(pipelineRuns)
        .set({ hypothesisStatus: "running", currentStage: "hypothesis" })
        .where(eq(pipelineRuns.id, resumedRow.id));

      const hypoResult = await runHypothesisAgent({
        correlationId: currentCorrelationId,
        userId: ctx.user.id,
        existingSessionId,
      });

      // BUG-04: Capture truth-bearing fields immediately after successful hypothesis
      hypothesisLivingCaseId = hypoResult.caseId;
      hypothesisLatencyMs = hypoResult.latencyMs;
      hypothesisSessionId = hypoResult.sessionId;

      result.stages.hypothesis = {
        status: "completed",
        caseId: hypoResult.caseId,
        sessionId: hypoResult.sessionId,
        latencyMs: hypoResult.latencyMs,
      };

      const actionIds = hypoResult.materializedActionIds ?? [];
      hypothesisActionIds = actionIds;
      const partialFailure = hypoResult.materializePartialFailure;
      result.stages.responseActions = {
        status: partialFailure
          ? "partial"
          : actionIds.length > 0 ? "completed" : "skipped",
        count: actionIds.length,
        actionIds,
        ...(partialFailure ? { partialFailure } : {}),
      };
      hypothesisPartialFailure = result.stages.responseActions;

      await db.update(pipelineRuns).set({
        livingCaseId: hypoResult.caseId,
        hypothesisStatus: "completed",
        hypothesisLatencyMs: hypoResult.latencyMs,
        responseActionsCount: actionIds.length,
        responseActionsStatus: partialFailure
          ? "partial"
          : actionIds.length > 0 ? "completed" : "skipped",
        currentStage: "completed",
        status: partialFailure ? "partial" : "completed",
        error: partialFailure
          ? `Response action partial failure: ${partialFailure.failed?.length ?? 0} of ${partialFailure.attempted ?? actionIds.length} actions failed`
          : null,
        totalLatencyMs: Date.now() - startTime,
        completedAt: new Date(),
      }).where(eq(pipelineRuns.id, resumedRow.id));
    } catch (err) {
      // BUG-04 Fix: If hypothesis itself succeeded (livingCaseId captured) but
      // post-materialization sync threw, preserve the truth-bearing fields so
      // response-action recovery/rematerialization is reachable on next resume.
      if (hypothesisLivingCaseId) {
        // Hypothesis succeeded — only bookkeeping/sync failed
        result.stages.hypothesis = {
          status: "completed",
          caseId: hypothesisLivingCaseId,
          sessionId: hypothesisSessionId,
          latencyMs: hypothesisLatencyMs,
        };
        result.stages.responseActions = hypothesisPartialFailure ?? {
          status: "failed",
          error: (err as Error).message,
        };
        result.status = "partial";
        await db.update(pipelineRuns).set({
          livingCaseId: hypothesisLivingCaseId,
          hypothesisStatus: "completed",
          hypothesisLatencyMs: hypothesisLatencyMs ?? null,
          responseActionsStatus: "failed",
          responseActionsCount: hypothesisActionIds?.length ?? 0,
          status: "partial",
          error: `Post-materialization sync failed: ${(err as Error).message}`,
          totalLatencyMs: Date.now() - startTime,
          completedAt: new Date(),
        }).where(eq(pipelineRuns.id, resumedRow.id));
      } else {
        // Hypothesis itself failed — no truth to preserve
        result.stages.hypothesis = { status: "failed", error: (err as Error).message };
        result.status = "partial";
        await db.update(pipelineRuns).set({
          hypothesisStatus: "failed",
          status: "partial",
          error: (err as Error).message,
          totalLatencyMs: Date.now() - startTime,
          completedAt: new Date(),
        }).where(eq(pipelineRuns.id, resumedRow.id));
      }
      result.totalLatencyMs = Date.now() - startTime;
      return result;
    }
  }

  // ── Stage 4: Response-Actions-Only Recovery ───────────────────────────
  // When hypothesis succeeded but response action materialization failed/partial,
  // re-materialize from the existing living case without re-running the LLM.
  if (startIdx === 3) {
    try {
      await db.update(pipelineRuns)
        .set({ responseActionsStatus: "running", currentStage: "response_actions" })
        .where(eq(pipelineRuns.id, resumedRow.id));

      const remat = await rematerializeResponseActions({
        livingCaseId: originalRun.livingCaseId!,
        correlationId: originalRun.correlationId!,
      });

      const actionIds = remat.actionIds;
      const partialFailure = remat.partialFailure;
      result.stages.responseActions = {
        status: partialFailure
          ? "partial"
          : actionIds.length > 0 ? "completed" : "skipped",
        count: actionIds.length,
        actionIds,
        ...(partialFailure ? { partialFailure } : {}),
      };

      await db.update(pipelineRuns).set({
        livingCaseId: originalRun.livingCaseId,
        responseActionsCount: actionIds.length,
        responseActionsStatus: partialFailure
          ? "partial"
          : actionIds.length > 0 ? "completed" : "skipped",
        currentStage: "completed",
        status: partialFailure ? "partial" : "completed",
        error: partialFailure
          ? `Response action partial failure: ${partialFailure.failed?.length ?? 0} of ${partialFailure.attempted ?? actionIds.length} actions failed`
          : null,
        totalLatencyMs: Date.now() - startTime,
        completedAt: new Date(),
      }).where(eq(pipelineRuns.id, resumedRow.id));
    } catch (err) {
      result.stages.responseActions = { status: "failed", error: (err as Error).message };
      result.status = "partial";
      await db.update(pipelineRuns).set({
        responseActionsStatus: "failed",
        status: "partial",
        error: (err as Error).message,
        totalLatencyMs: Date.now() - startTime,
        completedAt: new Date(),
      }).where(eq(pipelineRuns.id, resumedRow.id));
      result.totalLatencyMs = Date.now() - startTime;
      return result;
    }
  }

  result.totalLatencyMs = Date.now() - startTime;
  result.status = "completed";
  return result;
}
