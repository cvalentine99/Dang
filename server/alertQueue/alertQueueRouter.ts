/**
 * Alert Queue Router — tRPC procedures for the 10-deep alert-to-Walter queue.
 *
 * Provides:
 * - list: Get all queued/completed items (ordered by severity desc within status groups)
 * - enqueue: Add an alert to the queue (max 10, lowest-severity evicted)
 * - remove: Remove/dismiss an item from the queue
 * - process: Trigger Walter analysis on a queued item (human-initiated)
 * - getTriageResult: Get the triage result for a completed item
 * - count: Get the current queue depth
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { alertQueue } from "../../drizzle/schema";
import { eq, desc, asc, sql, and, inArray, gte } from "drizzle-orm";
import { runAnalystPipeline, type AnalystMessage } from "../graph/agenticPipeline";

const MAX_QUEUE_DEPTH = 10;

export const alertQueueRouter = router({
  /**
   * List all queue items. Returns queued items first, then completed/failed.
   */
  list: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { items: [], total: 0 };

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
    const db = await getDb();
    if (!db) return { count: 0 };

    const [result] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(alertQueue)
      .where(inArray(alertQueue.status, ["queued", "processing"]));

    return { count: result?.count ?? 0 };
  }),

  /**
   * Enqueue an alert for Walter analysis.
   * Max 10 items — lowest-severity queued item is evicted (dismissed) when full.
   * Prevents duplicate alertId from being queued.
   * Priority: higher ruleLevel = higher priority in the queue.
   */
  enqueue: protectedProcedure
    .input(z.object({
      alertId: z.string().min(1),
      ruleId: z.string(),
      ruleDescription: z.string().optional(),
      ruleLevel: z.number().int().min(0).max(15).default(0),
      agentId: z.string().optional(),
      agentName: z.string().optional(),
      alertTimestamp: z.string().optional(),
      rawJson: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Check for duplicate (same alertId already queued/processing)
      const [existing] = await db
        .select({ id: alertQueue.id })
        .from(alertQueue)
        .where(
          and(
            eq(alertQueue.alertId, input.alertId),
            inArray(alertQueue.status, ["queued", "processing"])
          )
        )
        .limit(1);

      if (existing) {
        return { success: false, message: "Alert already in queue", id: existing.id };
      }

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
          // Only evict if the incoming alert is higher or equal severity
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

      return { success: true, message: "Alert queued for Walter analysis", id: result.insertId };
    }),

  /**
   * Remove/dismiss a queue item.
   */
  remove: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db
        .update(alertQueue)
        .set({ status: "dismissed" })
        .where(eq(alertQueue.id, input.id));

      return { success: true };
    }),

  /**
   * Process a queued alert — triggers Walter's agentic pipeline.
   * This is human-initiated: analyst clicks the queue item to start analysis.
   * Returns the full triage result.
   */
  process: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Get the queue item
      const [item] = await db
        .select()
        .from(alertQueue)
        .where(eq(alertQueue.id, input.id))
        .limit(1);

      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Queue item not found" });
      if (item.status !== "queued") throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot process item with status: ${item.status}` });

      // Mark as processing
      await db
        .update(alertQueue)
        .set({ status: "processing", processedAt: new Date() })
        .where(eq(alertQueue.id, input.id));

      // Build the context prompt for Walter
      const alertContext = buildAlertContextPrompt(item);

      try {
        // Run Walter's agentic pipeline with the alert context
        const result = await runAnalystPipeline(alertContext, []);

        // Store the triage result
        const triageResult = {
          answer: result.answer,
          reasoning: result.reasoning,
          trustScore: result.trustScore,
          confidence: result.confidence,
          safetyStatus: result.safetyStatus,
          agentSteps: result.agentSteps as unknown as Array<Record<string, unknown>>,
          sources: result.sources as unknown as Array<Record<string, unknown>>,
          suggestedFollowUps: result.suggestedFollowUps,
          provenance: result.provenance as unknown as Record<string, unknown>,
        };

        await db
          .update(alertQueue)
          .set({
            status: "completed",
            triageResult,
            completedAt: new Date(),
          })
          .where(eq(alertQueue.id, input.id));

        return { success: true, triageResult };
      } catch (err) {
        // Mark as failed
        await db
          .update(alertQueue)
          .set({
            status: "failed",
            triageResult: {
              answer: `Analysis failed: ${(err as Error).message}`,
              reasoning: "Pipeline error during alert triage",
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
      const db = await getDb();
      if (!db) return null;

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
      const db = await getDb();
      if (!db) return { alerts: [] };

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
  clearHistory: protectedProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

    await db
      .delete(alertQueue)
      .where(inArray(alertQueue.status, ["completed", "failed", "dismissed"]));

    return { success: true };
  }),
});

/**
 * Build a rich context prompt from the alert data for Walter's pipeline.
 */
function buildAlertContextPrompt(item: {
  alertId: string;
  ruleId: string;
  ruleDescription: string | null;
  ruleLevel: number;
  agentId: string | null;
  agentName: string | null;
  alertTimestamp: string | null;
  rawJson: Record<string, unknown> | null;
}): string {
  const parts: string[] = [
    `Triage the following Wazuh alert and provide a comprehensive security analysis:`,
    ``,
    `**Alert ID:** ${item.alertId}`,
    `**Rule ID:** ${item.ruleId}`,
    `**Rule Description:** ${item.ruleDescription ?? "Unknown"}`,
    `**Severity Level:** ${item.ruleLevel}/15`,
    `**Agent:** ${item.agentId ?? "Unknown"} (${item.agentName ?? "Unknown"})`,
    `**Timestamp:** ${item.alertTimestamp ?? "Unknown"}`,
  ];

  if (item.rawJson) {
    const rule = item.rawJson.rule as Record<string, unknown> | undefined;
    const data = item.rawJson.data as Record<string, unknown> | undefined;
    const mitre = (rule?.mitre as Record<string, unknown>) ?? {};

    if (mitre.id) {
      parts.push(`**MITRE ATT&CK:** ${Array.isArray(mitre.id) ? mitre.id.join(", ") : mitre.id}`);
    }
    if (mitre.tactic) {
      parts.push(`**Tactics:** ${Array.isArray(mitre.tactic) ? mitre.tactic.join(", ") : mitre.tactic}`);
    }
    if (data?.srcip) {
      parts.push(`**Source IP:** ${data.srcip}`);
    }
    if (data?.dstip) {
      parts.push(`**Destination IP:** ${data.dstip}`);
    }
    if (rule?.groups) {
      parts.push(`**Rule Groups:** ${Array.isArray(rule.groups) ? rule.groups.join(", ") : rule.groups}`);
    }

    parts.push(``);
    parts.push(`**Full Alert JSON:**`);
    parts.push("```json");
    parts.push(JSON.stringify(item.rawJson, null, 2).slice(0, 4000)); // Cap at 4K chars
    parts.push("```");
  }

  parts.push(``);
  parts.push(`Please provide:`);
  parts.push(`1. Severity assessment and risk classification`);
  parts.push(`2. MITRE ATT&CK technique analysis (if applicable)`);
  parts.push(`3. Potential impact and affected assets`);
  parts.push(`4. Recommended investigation steps`);
  parts.push(`5. Related indicators of compromise (IOCs)`);
  parts.push(`6. Suggested remediation actions`);

  return parts.join("\n");
}
