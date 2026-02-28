/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Agentic Pipeline tRPC Router
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Exposes the agentic SOC pipeline stages as tRPC procedures.
 * All mutations require authentication. Queries are protected.
 *
 * Endpoints:
 *   Triage:       triageAlert, getTriageById, listTriages, triageStats
 *   Correlation:  correlateFromTriage, getCorrelationById, listCorrelations
 *   Feedback:     submitFeedback, getFeedback
 *   Auto-Triage:  autoTriageQueueItem, getAutoTriageStatus
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  runTriageAgent,
  getTriageById,
  listTriages,
  getTriageStats,
} from "./triageAgent";
import {
  runCorrelationAgent,
  getCorrelationById,
  getCorrelationByTriageId,
  listCorrelations,
} from "./correlationAgent";
import {
  runHypothesisAgent,
  getLivingCaseBySessionId,
  getLivingCaseById,
  listLivingCases,
  getLivingCaseByCorrelationId,
} from "./hypothesisAgent";
import { getDb } from "../db";
import { triageObjects, alertQueue, correlationBundles, livingCaseState } from "../../drizzle/schema";
import { eq, desc, sql, and } from "drizzle-orm";

export const pipelineRouter = router({
  // ═══════════════════════════════════════════════════════════════════════════
  // TRIAGE ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Run the triage agent on a raw Wazuh alert. Returns the canonical TriageObject. */
  triageAlert: protectedProcedure
    .input(z.object({
      rawAlert: z.record(z.string(), z.unknown()),
      alertQueueItemId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await runTriageAgent({
        rawAlert: input.rawAlert,
        userId: ctx.user.id,
        alertQueueItemId: input.alertQueueItemId,
      });

      if (!result.success) {
        return {
          success: false as const,
          error: result.error ?? "Triage failed",
          triageId: result.triageId,
          latencyMs: result.latencyMs,
        };
      }

      return {
        success: true as const,
        triageObject: result.triageObject!,
        triageId: result.triageId!,
        dbId: result.dbId,
        latencyMs: result.latencyMs,
        tokensUsed: result.tokensUsed,
      };
    }),

  /** Get a specific triage object by its triageId. */
  getTriageById: protectedProcedure
    .input(z.object({ triageId: z.string() }))
    .query(async ({ input }) => {
      const row = await getTriageById(input.triageId);
      if (!row) return { found: false as const };
      return { found: true as const, triage: row };
    }),

  /** List triage objects with optional filters. */
  listTriages: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
      severity: z.enum(["critical", "high", "medium", "low", "info"]).optional(),
      route: z.enum(["A_DUPLICATE_NOISY", "B_LOW_CONFIDENCE", "C_HIGH_CONFIDENCE", "D_LIKELY_BENIGN"]).optional(),
      status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
      agentId: z.string().optional(),
      feedbackOnly: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      return listTriages(input);
    }),

  /** Get aggregate triage statistics (severity, route, status distributions). */
  triageStats: protectedProcedure
    .query(async () => {
      const stats = await getTriageStats();
      return stats ?? {
        total: 0,
        bySeverity: {},
        byRoute: {},
        byStatus: {},
      };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // CORRELATION ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Run the correlation agent on a completed triage object. */
  correlateFromTriage: protectedProcedure
    .input(z.object({
      triageId: z.string().min(1),
      /** Override lookback window (hours). Default: 24 */
      lookbackHours: z.number().int().min(1).max(168).optional(),
      /** Include OTX threat intel lookups */
      includeThreatIntel: z.boolean().optional(),
      /** Max items per retrieval source */
      maxPerSource: z.number().int().min(5).max(100).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Retrieve the triage object
      const triageRow = await getTriageById(input.triageId);
      if (!triageRow) {
        return { success: false as const, error: "Triage object not found" };
      }
      if (triageRow.status !== "completed") {
        return { success: false as const, error: `Triage is not completed (status: ${triageRow.status})` };
      }

      const triageObject = triageRow.triageData;
      if (!triageObject) {
        return { success: false as const, error: "Triage object has no data" };
      }

      try {
        const result = await runCorrelationAgent({
          triageId: input.triageId,
          lookbackHours: input.lookbackHours,
          includeThreatIntel: input.includeThreatIntel,
          maxAlertsPerSource: input.maxPerSource,
        });

        return {
          success: true as const,
          correlationBundle: result.bundle,
          correlationId: result.correlationId,
          latencyMs: result.latencyMs,
          tokensUsed: result.tokensUsed,
          evidencePackSize: result.evidencePackSize,
        };
      } catch (err) {
        return {
          success: false as const,
          error: (err as Error).message,
          latencyMs: 0,
        };
      }
    }),

  /** Get a specific correlation bundle by its correlationId. */
  getCorrelationById: protectedProcedure
    .input(z.object({ correlationId: z.string() }))
    .query(async ({ input }) => {
      const row = await getCorrelationById(input.correlationId);
      if (!row) return { found: false as const };
      return { found: true as const, correlation: row };
    }),

  /** Get a correlation bundle by its source triage ID. */
  getCorrelationByTriageId: protectedProcedure
    .input(z.object({ triageId: z.string() }))
    .query(async ({ input }) => {
      const row = await getCorrelationByTriageId(input.triageId);
      if (!row) return { found: false as const };
      return { found: true as const, correlation: row };
    }),

  /** List correlation bundles with optional filters. */
  listCorrelations: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).default(0),
      triageId: z.string().optional(),
      status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
    }))
    .query(async ({ input }) => {
      return listCorrelations(input);
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYST FEEDBACK ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Submit analyst feedback on a triage result (confirm, override severity/route, add notes). */
  submitFeedback: protectedProcedure
    .input(z.object({
      triageId: z.string().min(1),
      /** Confirm the AI triage is correct */
      confirmed: z.boolean().optional(),
      /** Override the AI-assigned severity */
      severityOverride: z.enum(["critical", "high", "medium", "low", "info"]).optional(),
      /** Override the AI-assigned route */
      routeOverride: z.enum(["A_DUPLICATE_NOISY", "B_LOW_CONFIDENCE", "C_HIGH_CONFIDENCE", "D_LIKELY_BENIGN"]).optional(),
      /** Analyst notes explaining the override or confirming the triage */
      notes: z.string().max(4000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Find the triage object
      const [row] = await db
        .select({ id: triageObjects.id, triageId: triageObjects.triageId })
        .from(triageObjects)
        .where(eq(triageObjects.triageId, input.triageId))
        .limit(1);

      if (!row) {
        return { success: false as const, error: "Triage object not found" };
      }

      // Build the update
      const updateData: Record<string, unknown> = {
        analystUserId: ctx.user.id,
        feedbackAt: new Date(),
      };

      if (input.confirmed !== undefined) {
        updateData.analystConfirmed = input.confirmed ? 1 : 0;
      }
      if (input.severityOverride) {
        updateData.analystSeverityOverride = input.severityOverride;
      }
      if (input.routeOverride) {
        updateData.analystRouteOverride = input.routeOverride;
      }
      if (input.notes !== undefined) {
        updateData.analystNotes = input.notes;
      }

      await db
        .update(triageObjects)
        .set(updateData)
        .where(eq(triageObjects.id, row.id));

      return {
        success: true as const,
        triageId: input.triageId,
        feedback: {
          confirmed: input.confirmed ?? false,
          severityOverride: input.severityOverride ?? null,
          routeOverride: input.routeOverride ?? null,
          notes: input.notes ?? null,
          analystId: ctx.user.id,
          feedbackAt: new Date().toISOString(),
        },
      };
    }),

  /** Get analyst feedback for a specific triage. */
  getFeedback: protectedProcedure
    .input(z.object({ triageId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { found: false as const };

      const [row] = await db
        .select({
          triageId: triageObjects.triageId,
          analystConfirmed: triageObjects.analystConfirmed,
          analystSeverityOverride: triageObjects.analystSeverityOverride,
          analystRouteOverride: triageObjects.analystRouteOverride,
          analystNotes: triageObjects.analystNotes,
          analystUserId: triageObjects.analystUserId,
          feedbackAt: triageObjects.feedbackAt,
        })
        .from(triageObjects)
        .where(eq(triageObjects.triageId, input.triageId))
        .limit(1);

      if (!row) return { found: false as const };
      if (!row.feedbackAt) return { found: false as const, triageExists: true };

      return {
        found: true as const,
        feedback: {
          confirmed: row.analystConfirmed === 1,
          severityOverride: row.analystSeverityOverride,
          routeOverride: row.analystRouteOverride,
          notes: row.analystNotes,
          analystUserId: row.analystUserId,
          feedbackAt: row.feedbackAt?.toISOString() ?? null,
        },
      };
    }),

  /** Get feedback statistics — how many triages confirmed, overridden, etc. */
  feedbackStats: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return { total: 0, confirmed: 0, overridden: 0, pending: 0 };

      const [stats] = await db
        .select({
          total: sql<number>`COUNT(*)`,
          confirmed: sql<number>`SUM(CASE WHEN analystConfirmed = 1 THEN 1 ELSE 0 END)`,
          overridden: sql<number>`SUM(CASE WHEN analystSeverityOverride IS NOT NULL OR analystRouteOverride IS NOT NULL THEN 1 ELSE 0 END)`,
          withFeedback: sql<number>`SUM(CASE WHEN feedbackAt IS NOT NULL THEN 1 ELSE 0 END)`,
        })
        .from(triageObjects)
        .where(eq(triageObjects.status, "completed"));

      return {
        total: stats?.total ?? 0,
        confirmed: stats?.confirmed ?? 0,
        overridden: stats?.overridden ?? 0,
        pending: (stats?.total ?? 0) - (stats?.withFeedback ?? 0),
      };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO-TRIAGE ON WALTER QUEUE INTAKE
  // ═══════════════════════════════════════════════════════════════════════════

  /** Trigger auto-triage on a queued alert (runs triage pipeline in background). */
  autoTriageQueueItem: protectedProcedure
    .input(z.object({
      queueItemId: z.number().int(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get the queue item
      const [item] = await db
        .select()
        .from(alertQueue)
        .where(eq(alertQueue.id, input.queueItemId))
        .limit(1);

      if (!item) {
        return { success: false as const, error: "Queue item not found" };
      }

      // Check if already triaged
      if (item.pipelineTriageId) {
        return {
          success: true as const,
          alreadyTriaged: true,
          triageId: item.pipelineTriageId,
        };
      }

      // Mark as running
      await db
        .update(alertQueue)
        .set({ autoTriageStatus: "running" })
        .where(eq(alertQueue.id, input.queueItemId));

      try {
        // Build the raw alert from queue item
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

        // Run the triage agent
        const result = await runTriageAgent({
          rawAlert,
          userId: ctx.user.id,
          alertQueueItemId: item.id,
        });

        if (result.success && result.triageId) {
          // Update queue item with triage link
          await db
            .update(alertQueue)
            .set({
              pipelineTriageId: result.triageId,
              autoTriageStatus: "completed",
            })
            .where(eq(alertQueue.id, input.queueItemId));

          return {
            success: true as const,
            alreadyTriaged: false,
            triageId: result.triageId,
            triageObject: result.triageObject,
            latencyMs: result.latencyMs,
          };
        } else {
          await db
            .update(alertQueue)
            .set({ autoTriageStatus: "failed" })
            .where(eq(alertQueue.id, input.queueItemId));

          return {
            success: false as const,
            error: result.error ?? "Triage pipeline failed",
          };
        }
      } catch (err) {
        await db
          .update(alertQueue)
          .set({ autoTriageStatus: "failed" })
          .where(eq(alertQueue.id, input.queueItemId));

        return {
          success: false as const,
          error: `Auto-triage error: ${(err as Error).message}`,
        };
      }
    }),

  /** Get auto-triage status for a queue item. */
  getAutoTriageStatus: protectedProcedure
    .input(z.object({ queueItemId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { found: false as const };

      const [item] = await db
        .select({
          id: alertQueue.id,
          alertId: alertQueue.alertId,
          autoTriageStatus: alertQueue.autoTriageStatus,
          pipelineTriageId: alertQueue.pipelineTriageId,
        })
        .from(alertQueue)
        .where(eq(alertQueue.id, input.queueItemId))
        .limit(1);

      if (!item) return { found: false as const };

      // If we have a triage ID, fetch the triage summary
      let triageSummary = null;
      if (item.pipelineTriageId) {
        const triageRow = await getTriageById(item.pipelineTriageId);
        if (triageRow) {
          triageSummary = {
            triageId: triageRow.triageId,
            severity: triageRow.severity,
            route: triageRow.route,
            summary: triageRow.summary,
            alertFamily: triageRow.alertFamily,
            status: triageRow.status,
            analystConfirmed: triageRow.analystConfirmed === 1,
          };
        }
      }

      return {
        found: true as const,
        autoTriageStatus: item.autoTriageStatus,
        pipelineTriageId: item.pipelineTriageId,
        triageSummary,
      };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // HYPOTHESIS / LIVING CASE ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Run the hypothesis agent on a completed correlation bundle. Produces a LivingCaseObject. */
  generateHypothesis: protectedProcedure
    .input(z.object({
      correlationId: z.string().min(1),
      /** Optional: merge into an existing investigation session */
      existingSessionId: z.number().int().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const result = await runHypothesisAgent({
          correlationId: input.correlationId,
          existingSessionId: input.existingSessionId,
        });

        return {
          success: true as const,
          caseId: result.caseId,
          sessionId: result.sessionId,
          livingCase: result.livingCase,
          latencyMs: result.latencyMs,
          tokensUsed: result.tokensUsed,
          isNewSession: result.isNewSession,
        };
      } catch (err) {
        return {
          success: false as const,
          error: (err as Error).message,
          latencyMs: 0,
        };
      }
    }),

  /** Get a living case by its database ID. */
  getLivingCaseById: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const row = await getLivingCaseById(input.id);
      if (!row) return { found: false as const };
      return { found: true as const, livingCase: row };
    }),

  /** Get a living case by its investigation session ID. */
  getLivingCaseBySessionId: protectedProcedure
    .input(z.object({ sessionId: z.number().int() }))
    .query(async ({ input }) => {
      const row = await getLivingCaseBySessionId(input.sessionId);
      if (!row) return { found: false as const };
      return { found: true as const, livingCase: row };
    }),

  /** Get a living case linked to a specific correlation bundle. */
  getLivingCaseByCorrelationId: protectedProcedure
    .input(z.object({ correlationId: z.string() }))
    .query(async ({ input }) => {
      const row = await getLivingCaseByCorrelationId(input.correlationId);
      if (!row) return { found: false as const };
      return { found: true as const, livingCase: row };
    }),

  /** List all living cases with pagination. */
  listLivingCases: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      return listLivingCases(input);
    }),

  /** Update a recommended action's state (approve, reject, defer). */
  updateActionState: protectedProcedure
    .input(z.object({
      caseId: z.number().int(),
      actionIndex: z.number().int().min(0),
      newState: z.enum(["approved", "rejected", "deferred"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [row] = await db
        .select()
        .from(livingCaseState)
        .where(eq(livingCaseState.id, input.caseId))
        .limit(1);

      if (!row) return { success: false as const, error: "Living case not found" };

      const caseData = row.caseData as any;
      if (!caseData?.recommendedActions?.[input.actionIndex]) {
        return { success: false as const, error: "Action not found at specified index" };
      }

      caseData.recommendedActions[input.actionIndex].state = input.newState;
      caseData.recommendedActions[input.actionIndex].decidedBy = `user:${ctx.user.id}`;
      caseData.recommendedActions[input.actionIndex].decidedAt = new Date().toISOString();
      caseData.lastUpdatedAt = new Date().toISOString();
      caseData.lastUpdatedBy = "analyst_manual";

      await db
        .update(livingCaseState)
        .set({
          caseData,
          pendingActionCount: caseData.recommendedActions.filter(
            (a: any) => a.state === "proposed"
          ).length,
          approvalRequiredCount: caseData.recommendedActions.filter(
            (a: any) => a.requiresApproval && a.state === "proposed"
          ).length,
          lastUpdatedBy: "analyst_manual",
        })
        .where(eq(livingCaseState.id, input.caseId));

      return { success: true as const, caseId: input.caseId };
    }),

  /** Record a completed investigative pivot on a living case. */
  recordPivot: protectedProcedure
    .input(z.object({
      caseId: z.number().int(),
      action: z.string().min(1).max(1000),
      finding: z.string().min(1).max(4000),
      impactedTheory: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [row] = await db
        .select()
        .from(livingCaseState)
        .where(eq(livingCaseState.id, input.caseId))
        .limit(1);

      if (!row) return { success: false as const, error: "Living case not found" };

      const caseData = row.caseData as any;
      if (!caseData.completedPivots) caseData.completedPivots = [];

      caseData.completedPivots.push({
        action: input.action,
        performedAt: new Date().toISOString(),
        performedBy: `user:${ctx.user.id}`,
        finding: input.finding,
        impactedTheory: input.impactedTheory,
      });

      caseData.lastUpdatedAt = new Date().toISOString();
      caseData.lastUpdatedBy = "analyst_manual";

      await db
        .update(livingCaseState)
        .set({
          caseData,
          completedPivotCount: caseData.completedPivots.length,
          lastUpdatedBy: "analyst_manual",
        })
        .where(eq(livingCaseState.id, input.caseId));

      return { success: true as const, pivotCount: caseData.completedPivots.length };
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTO-TRIAGE BULK OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /** Bulk auto-triage all pending queue items. */
  autoTriageAllPending: protectedProcedure
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get all queued items without a triage
      const pendingItems = await db
        .select({ id: alertQueue.id, alertId: alertQueue.alertId })
        .from(alertQueue)
        .where(
          and(
            eq(alertQueue.autoTriageStatus, "pending"),
            sql`${alertQueue.pipelineTriageId} IS NULL`
          )
        )
        .limit(10);

      if (pendingItems.length === 0) {
        return { success: true as const, triaged: 0, message: "No pending items to triage" };
      }

      let triaged = 0;
      let failed = 0;
      const results: Array<{ queueItemId: number; alertId: string; triageId?: string; error?: string }> = [];

      for (const item of pendingItems) {
        try {
          // Mark as running
          await db
            .update(alertQueue)
            .set({ autoTriageStatus: "running" })
            .where(eq(alertQueue.id, item.id));

          // Get full item data
          const [fullItem] = await db
            .select()
            .from(alertQueue)
            .where(eq(alertQueue.id, item.id))
            .limit(1);

          if (!fullItem) continue;

          const rawAlert = fullItem.rawJson ?? {
            id: fullItem.alertId,
            rule: {
              id: fullItem.ruleId,
              description: fullItem.ruleDescription,
              level: fullItem.ruleLevel,
            },
            agent: {
              id: fullItem.agentId,
              name: fullItem.agentName,
            },
            timestamp: fullItem.alertTimestamp,
          };

          const result = await runTriageAgent({
            rawAlert,
            userId: ctx.user.id,
            alertQueueItemId: item.id,
          });

          if (result.success && result.triageId) {
            await db
              .update(alertQueue)
              .set({
                pipelineTriageId: result.triageId,
                autoTriageStatus: "completed",
              })
              .where(eq(alertQueue.id, item.id));

            triaged++;
            results.push({ queueItemId: item.id, alertId: item.alertId, triageId: result.triageId });
          } else {
            await db
              .update(alertQueue)
              .set({ autoTriageStatus: "failed" })
              .where(eq(alertQueue.id, item.id));

            failed++;
            results.push({ queueItemId: item.id, alertId: item.alertId, error: result.error });
          }
        } catch (err) {
          await db
            .update(alertQueue)
            .set({ autoTriageStatus: "failed" })
            .where(eq(alertQueue.id, item.id));

          failed++;
          results.push({ queueItemId: item.id, alertId: item.alertId, error: (err as Error).message });
        }
      }

      return {
        success: true as const,
        triaged,
        failed,
        total: pendingItems.length,
        results,
      };
    }),
});
