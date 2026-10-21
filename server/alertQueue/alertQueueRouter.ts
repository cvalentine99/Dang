/**
 * Alert Queue Router — tRPC procedures for the 10-deep alert queue.
 *
 * Queue processing runs TRIAGE ONLY via runTriageAgent(). It creates a
 * triageObjects row and a pipelineRuns row (status: "partial"). Downstream
 * stages (correlation, hypothesis, response actions) are NOT triggered here —
 * they must be invoked separately from the Triage Pipeline page or via
 * runFullPipeline.
 *
 * Provides:
 * - list: Get all queued/completed items (ordered by severity desc within status groups)
 * - enqueue: Add an alert to the queue (max 10, lowest-severity evicted)
 * - remove: Remove/dismiss an item from the queue
 * - process: Trigger triage-only on a queued item (human-initiated, creates pipelineRuns row)
 * - getTriageResult: Get the triage result for a completed item
 * - count: Get the current queue depth
 */

import { requireDb } from "../dbGuard";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { alertQueue, pipelineRuns } from "../../drizzle/schema";
import { eq, desc, asc, sql, and, inArray, gte } from "drizzle-orm";
import { runTriageAgent } from "../agenticPipeline/triageAgent";
import { getEffectiveIndexerConfig, indexerSearch, INDEX_PATTERNS } from "../indexer/indexerClient";

const MAX_QUEUE_DEPTH = 10;

// ── Indexer confirmation for enqueue ─────────────────────────────────────────
// Fetch the alert document by _id so severity and payload come from the source of
// truth rather than the request body. Returns null when the indexer is not
// configured, unreachable, or has no such document.
async function lookupAlertInIndexer(alertId: string): Promise<{
  ruleLevel: number;
  ruleId: string;
  ruleDescription?: string;
  agentId?: string;
  agentName?: string;
  alertTimestamp?: string;
  rawJson: Record<string, unknown>;
} | null> {
  try {
    const config = await getEffectiveIndexerConfig();
    if (!config) return null;
    const res = await indexerSearch(
      config,
      INDEX_PATTERNS.ALERTS,
      { size: 1, query: { ids: { values: [alertId] } } } as unknown as Parameters<typeof indexerSearch>[2],
      "alert-queue-enqueue",
    );
    const hit = res?.hits?.hits?.[0];
    const src = hit?._source as Record<string, unknown> | undefined;
    if (!src) return null;
    const rule = (src.rule ?? {}) as Record<string, unknown>;
    const agent = (src.agent ?? {}) as Record<string, unknown>;
    const level = Number(rule.level);
    if (!Number.isInteger(level) || level < 0 || level > 15) return null;
    return {
      ruleLevel: level,
      ruleId: String(rule.id ?? ""),
      ruleDescription: typeof rule.description === "string" ? rule.description : undefined,
      agentId: typeof agent.id === "string" ? agent.id : undefined,
      agentName: typeof agent.name === "string" ? agent.name : undefined,
      alertTimestamp: typeof src.timestamp === "string" ? src.timestamp : undefined,
      rawJson: src,
    };
  } catch (err) {
    console.warn("[AlertQueue] indexer lookup failed for", alertId, (err as Error).message);
    return null;
  }
}

export const alertQueueRouter = router({
  /**
   * List all queue items. Returns queued items first, then completed/failed.
   */
  list: protectedProcedure.query(async () => {
    const db = await requireDb();

    const items = await db
      .select()
      .from(alertQueue)
      .orderBy(
        sql`FIELD(${alertQueue.status}, 'processing', 'queued', 'completed', 'failed', 'dismissed')`,
        desc(alertQueue.ruleLevel),
        asc(alertQueue.queuedAt)
      )
      .limit(20);

    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(alertQueue)
      .where(inArray(alertQueue.status, ["queued", "processing"]));

    return {
      items,
      total: countResult?.count ?? 0,
    };
  }),

  /**
   * Get current queue depth (queued + processing items only).
   */
  count: protectedProcedure.query(async () => {
    const db = await requireDb();

    const [result] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(alertQueue)
      .where(inArray(alertQueue.status, ["queued", "processing"]));

    return { count: result?.count ?? 0 };
  }),

  /**
   * Enqueue an alert for structured triage.
   * Max 10 items — lowest-severity queued item is evicted (dismissed) when full.
   * Prevents duplicate alertId from being queued.
   * Priority: higher ruleLevel = higher priority in the queue.
   */
  enqueue: protectedProcedure
    .input(z.object({
      alertId: z.string().min(1).max(128),
      ruleId: z.string().min(1).max(32),
      ruleDescription: z.string().optional(),
      ruleLevel: z.number().int().min(0).max(15).default(0),
      agentId: z.string().max(16).optional(),
      agentName: z.string().max(128).optional(),
      alertTimestamp: z.string().max(64).optional(),
      rawJson: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input: clientInput, ctx }) => {
      const db = await requireDb();

      // Check for duplicate (same alertId already queued/processing)
      const [existing] = await db
        .select({ id: alertQueue.id })
        .from(alertQueue)
        .where(
          and(
            eq(alertQueue.alertId, clientInput.alertId),
            inArray(alertQueue.status, ["queued", "processing"])
          )
        )
        .limit(1);

      if (existing) {
        return { success: false, message: "Alert already in queue", id: existing.id };
      }

      // Server-authoritative alert facts. The client's ruleLevel/rawJson are hints only:
      // a forged ruleLevel could evict every real alert, and rawJson feeds the triage
      // prompt. When the indexer holds the alert, its document wins; when it cannot be
      // confirmed, the hint is kept but may never evict another alert.
      const confirmed = await lookupAlertInIndexer(clientInput.alertId);
      const input = confirmed
        ? { ...clientInput, ...confirmed }
        : clientInput;
      const severityConfirmed = confirmed !== null;

      // Check queue depth — evict oldest if at max
      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(alertQueue)
        .where(inArray(alertQueue.status, ["queued", "processing"]));

      const currentCount = countResult?.count ?? 0;

      if (currentCount >= MAX_QUEUE_DEPTH) {
        // Find the lowest-severity queued item (not processing) and dismiss it.
        // If same severity, evict the oldest (FIFO within same level).
        const [lowestPriority] = await db
          .select({ id: alertQueue.id, ruleLevel: alertQueue.ruleLevel })
          .from(alertQueue)
          .where(eq(alertQueue.status, "queued"))
          .orderBy(asc(alertQueue.ruleLevel), asc(alertQueue.queuedAt))
          .limit(1);

        if (lowestPriority) {
          // Only evict if the incoming alert is higher or equal severity — and only when
          // that severity came from the indexer, not from the caller.
          if (!severityConfirmed) {
            return { success: false, message: "Queue is full — alert severity could not be confirmed against the indexer, so nothing was evicted", id: null };
          }
          if (input.ruleLevel >= lowestPriority.ruleLevel) {
            await db
              .update(alertQueue)
              .set({ status: "dismissed" })
              .where(eq(alertQueue.id, lowestPriority.id));
          } else {
            // Incoming alert is lower severity than everything in queue — reject
            return { success: false, message: "Queue is full — all queued alerts have higher severity", id: null };
          }
        } else {
          // All 10 are processing — reject
          return { success: false, message: "Queue is full (all items are being processed)", id: null };
        }
      }

      // Insert the new alert
      try {
        const [result] = await db.insert(alertQueue).values({
          alertId: input.alertId,
          ruleId: input.ruleId,
          ruleDescription: input.ruleDescription ?? null,
          ruleLevel: input.ruleLevel,
          agentId: input.agentId ?? null,
          agentName: input.agentName ?? null,
          alertTimestamp: input.alertTimestamp ?? null,
          rawJson: input.rawJson ?? null,
          status: "queued",
          queuedBy: ctx.user?.id ?? null,
        });

        return { success: true, message: "Alert queued for structured triage", id: result.insertId };
      } catch (err) {
        const msg = (err as Error).message ?? String(err);
        console.error("[AlertQueue] INSERT failed:", msg, {
          alertId: input.alertId,
          ruleId: input.ruleId,
          agentId: input.agentId,
          ruleLevel: input.ruleLevel,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to insert alert into queue: ${msg.slice(0, 200)}`,
        });
      }
    }),

  /**
   * Remove/dismiss a queue item.
   */
  remove: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();

      await db
        .update(alertQueue)
        .set({ status: "dismissed" })
        .where(eq(alertQueue.id, input.id));

      return { success: true };
    }),

  /**
   * Process a queued alert — runs structured triage only.
   * This is human-initiated: analyst clicks "Structured Triage" on a queue item.
   *
   * What this does:
   *   1. Calls runTriageAgent() → creates a triageObjects row
   *   2. Links the triage back to this queue item via pipelineTriageId
   *   3. Inserts a pipelineRuns row so the Pipeline Inspector can see it
   *
   * What this does NOT do:
   *   - Correlation, hypothesis, or living case creation
   *   - Those are triggered separately from the Triage Pipeline page
   *     or via runFullPipeline()
   */
  process: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();

      // Get the queue item
      const [item] = await db
        .select()
        .from(alertQueue)
        .where(eq(alertQueue.id, input.id))
        .limit(1);

      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Queue item not found" });
      if (item.status !== "queued") throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot process item with status: ${item.status}` });

      // Check if already triaged via the pipeline
      if (item.pipelineTriageId) {
        return {
          success: true,
          alreadyTriaged: true,
          triageId: item.pipelineTriageId,
          triageResult: item.triageResult,
        };
      }

      // Atomic claim: UPDATE with WHERE status='queued' so only one caller wins.
      // This prevents two analysts from both starting triage on the same item.
      const [claimResult] = await db
        .update(alertQueue)
        .set({
          status: "processing",
          processedAt: new Date(),
          autoTriageStatus: "running",
        })
        .where(and(eq(alertQueue.id, input.id), eq(alertQueue.status, "queued")));

      const [resultHeader] = claimResult as unknown as [{ affectedRows: number }];
      if (!resultHeader || resultHeader.affectedRows === 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Queue item is already being processed by another session" });
      }

      // Build the raw alert from queue item (same pattern as autoTriageQueueItem)
      const rawAlert = item.rawJson ?? {
        id: item.alertId,
        rule: {
          id: item.ruleId,
          description: item.ruleDescription,
          level: item.ruleLevel,
        },
        agent: {
          id: item.agentId,
          name: item.agentName,
        },
        timestamp: item.alertTimestamp,
      };

      try {
        // Run the UNIFIED triage agent — creates a triageObjects row
        const result = await runTriageAgent({
          rawAlert,
          userId: ctx.user.id,
          alertQueueItemId: item.id,
        });

        if (result.success && result.triageId) {
          // Build a summary triageResult for backward compatibility
          // (legacy UI rendering of inline triage data)
          const triageResult = {
            answer: result.triageObject
              ? `**Severity:** ${result.triageObject.severity} (${((result.triageObject.severityConfidence ?? 0) * 100).toFixed(0)}% confidence)\n**Route:** ${result.triageObject.route}\n**Alert Family:** ${result.triageObject.alertFamily}\n\n${result.triageObject.severityReasoning ?? ""}\n\n**Recommended Actions:**\n${((result.triageObject as unknown as Record<string, unknown>).recommendedActions as string[] ?? []).map((a: string) => `- ${a}`).join("\n")}`
              : "Triage completed — view details on the Triage Pipeline page.",
            reasoning: result.triageObject?.severityReasoning ?? "Triage completed via unified pipeline",
            trustScore: result.triageObject?.severityConfidence ?? undefined,
            confidence: result.triageObject?.severityConfidence ?? undefined,
            // Link to the structured pipeline
            pipelineTriageId: result.triageId,
            severity: result.triageObject?.severity ?? undefined,
            route: result.triageObject?.route ?? undefined,
          };

          // Insert a pipelineRuns row with status: "partial"
          const runId = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
          // completedAt is NULL because the run is NOT complete —
          // only triage is done. Downstream stages (correlation, hypothesis,
          // response actions) are still pending and require analyst advancement.
          // totalLatencyMs records triage latency only, not overall run time.
          //
          // Use transaction for atomic DB updates after triage
          await db.transaction(async (tx) => {
            await tx.insert(pipelineRuns).values({
              runId,
              queueItemId: item.id,
              alertId: item.alertId,
              currentStage: "triage",
              status: "partial",
              triageId: result.triageId,
              triageStatus: "completed",
              triageLatencyMs: result.latencyMs ?? null,
              totalLatencyMs: result.latencyMs ?? null,
              correlationStatus: "pending",
              hypothesisStatus: "pending",
              responseActionsStatus: "pending",
              triggeredBy: ctx.user.name ?? ctx.user.openId ?? "queue",
              startedAt: new Date(),
              completedAt: null,  // NOT complete — awaiting analyst advancement
            });

            // Update queue item with triage link + backward-compatible result
            await tx
              .update(alertQueue)
              .set({
                status: "completed",
                pipelineTriageId: result.triageId,
                autoTriageStatus: "completed",
                triageResult,
                completedAt: new Date(),
              })
              .where(eq(alertQueue.id, input.id));
          });

          return {
            success: true,
            triageId: result.triageId,
            triageResult,
            latencyMs: result.latencyMs,
          };
        } else {
          // Triage failed — still insert a pipelineRuns row so the failure is visible
          const failRunId = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
          // Use transaction for atomic DB updates after triage failure
          await db.transaction(async (tx) => {
            await tx.insert(pipelineRuns).values({
              runId: failRunId,
              queueItemId: item.id,
              alertId: item.alertId,
              currentStage: "failed",
              status: "failed",
              triageStatus: "failed",
              correlationStatus: "pending",
              hypothesisStatus: "pending",
              responseActionsStatus: "pending",
              triggeredBy: ctx.user.name ?? ctx.user.openId ?? "queue",
              error: result.error ?? "Triage pipeline failed",
              startedAt: new Date(),
              completedAt: new Date(),
            });

            await tx
              .update(alertQueue)
              .set({
                status: "failed",
                autoTriageStatus: "failed",
                triageResult: {
                  answer: `Triage failed: ${result.error ?? "Unknown error"}`,
                  reasoning: "Pipeline error during structured triage",
                },
                completedAt: new Date(),
              })
              .where(eq(alertQueue.id, input.id));
          });

          return {
            success: false,
            error: result.error ?? "Triage pipeline failed",
          };
        }
      } catch (err) {
        // Mark as failed
        await db
          .update(alertQueue)
          .set({
            status: "failed",
            autoTriageStatus: "failed",
            triageResult: {
              answer: `Analysis failed: ${(err as Error).message}`,
              reasoning: "Pipeline error during structured triage",
            },
            completedAt: new Date(),
          })
          .where(eq(alertQueue.id, input.id));

        throw err;
      }
    }),

  /**
   * Get the triage result for a completed queue item.
   */
  getTriageResult: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const db = await requireDb();

      const [item] = await db
        .select()
        .from(alertQueue)
        .where(eq(alertQueue.id, input.id))
        .limit(1);

      return item ?? null;
    }),

  /**
   * Get recently queued alerts since a given timestamp.
   * Used by the global QueueNotifier to detect new arrivals and trigger notifications.
   * Returns alerts queued within the last N seconds, ordered by severity desc.
   */
  recentAlerts: protectedProcedure
    .input(z.object({
      /** ISO timestamp — return alerts queued after this time */
      since: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();

      const sinceDate = new Date(input.since);

      const alerts = await db
        .select({
          id: alertQueue.id,
          alertId: alertQueue.alertId,
          ruleId: alertQueue.ruleId,
          ruleDescription: alertQueue.ruleDescription,
          ruleLevel: alertQueue.ruleLevel,
          agentId: alertQueue.agentId,
          agentName: alertQueue.agentName,
          status: alertQueue.status,
          queuedAt: alertQueue.queuedAt,
        })
        .from(alertQueue)
        .where(
          and(
            gte(alertQueue.queuedAt, sinceDate),
            inArray(alertQueue.status, ["queued", "processing"])
          )
        )
        .orderBy(desc(alertQueue.ruleLevel), desc(alertQueue.queuedAt))
        .limit(10);

      return { alerts };
    }),

  /**
   * Clear all dismissed/completed/failed items from the queue.
   */
  clearHistory: adminProcedure.mutation(async () => {
    const db = await requireDb();

    try {
      await db
        .delete(alertQueue)
        .where(inArray(alertQueue.status, ["completed", "failed", "dismissed"]));
    } catch (err) {
      // ticket_artifacts.queueItemId → alert_queue(id) is ON DELETE RESTRICT (0020):
      // history that produced a Splunk ticket is part of the forensic record.
      const msg = (err as Error).message ?? String(err);
      if (/foreign key|ER_ROW_IS_REFERENCED/i.test(msg)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Some history items are referenced by ticket artifacts and cannot be deleted.",
        });
      }
      throw err;
    }

    return { success: true };
  }),
});
