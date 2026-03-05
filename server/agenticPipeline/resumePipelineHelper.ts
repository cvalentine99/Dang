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
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  pipelineRuns,
  alertQueue,
  triageObjects,
} from "../../drizzle/schema";
import { runTriageAgent } from "./triageAgent";
import { runCorrelationAgent } from "./correlationAgent";
import { runHypothesisAgent } from "./hypothesisAgent";

/** The stage names in pipeline execution order. */
const STAGE_ORDER = ["triage", "correlation", "hypothesis"] as const;
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

  // 2. Determine which stage to start from
  let startStage = input.fromStage;

  if (!startStage) {
    // Auto-detect: first check for failed stages, then pending stages
    // Priority 1: Find the first failed stage (for failed runs)
    if (originalRun.triageStatus === "failed") startStage = "triage";
    else if (originalRun.correlationStatus === "failed") startStage = "correlation";
    else if (originalRun.hypothesisStatus === "failed") startStage = "hypothesis";
    else if (originalRun.responseActionsStatus === "failed") startStage = "hypothesis"; // re-run hypothesis to re-materialize
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

  // 4. Create a new pipeline run record
  const resumedRunId = `${runIdPrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const startTime = Date.now();

  const [resumedRow] = await db.insert(pipelineRuns).values({
    runId: resumedRunId,
    queueItemId: originalRun.queueItemId,
    alertId: originalRun.alertId,
    currentStage: startStage,
    status: "running",
    triggeredBy: `user:${ctx.user.id}`,
    // Carry forward completed stages
    triageId: startIdx > 0 ? originalRun.triageId : null,
    triageStatus: startIdx > 0 ? "completed" : "pending",
    triageLatencyMs: startIdx > 0 ? originalRun.triageLatencyMs : null,
    correlationId: startIdx > 1 ? originalRun.correlationId : null,
    correlationStatus: startIdx > 1 ? "completed" : "pending",
    correlationLatencyMs: startIdx > 1 ? originalRun.correlationLatencyMs : null,
  }).$returningId();

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
      hypothesis: { status: "pending" },
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
        const triageData = triageRow?.triageData as any;
        rawAlert = triageData?.rawAlert as Record<string, unknown> | null;
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
  try {
    if (!currentCorrelationId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No correlation ID available for hypothesis" });

    await db.update(pipelineRuns)
      .set({ hypothesisStatus: "running", currentStage: "hypothesis" })
      .where(eq(pipelineRuns.id, resumedRow.id));

    const hypoResult = await runHypothesisAgent({
      correlationId: currentCorrelationId,
    });

    result.stages.hypothesis = {
      status: "completed",
      caseId: hypoResult.caseId,
      sessionId: hypoResult.sessionId,
      latencyMs: hypoResult.latencyMs,
    };

    const actionIds = hypoResult.materializedActionIds ?? [];
    const partialFailure = hypoResult.materializePartialFailure;
    result.stages.responseActions = {
      status: partialFailure
        ? "partial"
        : actionIds.length > 0 ? "completed" : "skipped",
      count: actionIds.length,
      actionIds,
      ...(partialFailure ? { partialFailure } : {}),
    };

    await db.update(pipelineRuns).set({
      livingCaseId: hypoResult.caseId,
      hypothesisStatus: "completed",
      hypothesisLatencyMs: hypoResult.latencyMs,
      responseActionsCount: actionIds.length,
      responseActionsStatus: actionIds.length > 0 ? "completed" : "skipped",
      currentStage: "completed",
      status: "completed",
      totalLatencyMs: Date.now() - startTime,
      completedAt: new Date(),
    }).where(eq(pipelineRuns.id, resumedRow.id));
  } catch (err) {
    result.stages.hypothesis = { status: "failed", error: (err as Error).message };
    result.status = "partial";
    await db.update(pipelineRuns).set({
      hypothesisStatus: "failed",
      status: "partial",
      error: (err as Error).message,
      totalLatencyMs: Date.now() - startTime,
      completedAt: new Date(),
    }).where(eq(pipelineRuns.id, resumedRow.id));
    result.totalLatencyMs = Date.now() - startTime;
    return result;
  }

  result.totalLatencyMs = Date.now() - startTime;
  result.status = "completed";
  return result;
}
