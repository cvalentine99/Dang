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
import {
  assembleLivingCaseReportData,
  generateReport,
  type ReportType,
} from "./livingCaseReportService";
import { getDb } from "../db";
import { triageObjects, alertQueue, correlationBundles, livingCaseState, pipelineRuns, responseActions } from "../../drizzle/schema";
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

  /**
   * Direction 10: Detailed feedback analytics for SOC managers.
   * Returns severity override distribution, route override patterns,
   * per-analyst activity, and AI accuracy metrics.
   */
  feedbackAnalytics: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return null;

      // 1. Overall feedback coverage
      const [coverage] = await db.select({
        total: sql<number>`COUNT(*)`,
        withFeedback: sql<number>`SUM(CASE WHEN feedbackAt IS NOT NULL THEN 1 ELSE 0 END)`,
        confirmed: sql<number>`SUM(CASE WHEN analystConfirmed = 1 THEN 1 ELSE 0 END)`,
        rejected: sql<number>`SUM(CASE WHEN analystConfirmed = 0 AND feedbackAt IS NOT NULL THEN 1 ELSE 0 END)`,
        severityOverridden: sql<number>`SUM(CASE WHEN analystSeverityOverride IS NOT NULL THEN 1 ELSE 0 END)`,
        routeOverridden: sql<number>`SUM(CASE WHEN analystRouteOverride IS NOT NULL THEN 1 ELSE 0 END)`,
        withNotes: sql<number>`SUM(CASE WHEN analystNotes IS NOT NULL AND analystNotes != '' THEN 1 ELSE 0 END)`,
      }).from(triageObjects).where(eq(triageObjects.status, "completed"));

      // 2. Severity override distribution: AI severity → analyst override
      const severityOverrides = await db.select({
        aiSeverity: triageObjects.severity,
        analystSeverity: triageObjects.analystSeverityOverride,
        count: sql<number>`COUNT(*)`,
      }).from(triageObjects)
        .where(sql`analystSeverityOverride IS NOT NULL`)
        .groupBy(triageObjects.severity, triageObjects.analystSeverityOverride);

      // 3. Route override distribution
      const routeOverrides = await db.select({
        aiRoute: triageObjects.route,
        analystRoute: triageObjects.analystRouteOverride,
        count: sql<number>`COUNT(*)`,
      }).from(triageObjects)
        .where(sql`analystRouteOverride IS NOT NULL`)
        .groupBy(triageObjects.route, triageObjects.analystRouteOverride);

      // 4. Feedback by severity (how often each AI severity gets confirmed vs overridden)
      const bySeverity = await db.select({
        severity: triageObjects.severity,
        total: sql<number>`COUNT(*)`,
        confirmed: sql<number>`SUM(CASE WHEN analystConfirmed = 1 THEN 1 ELSE 0 END)`,
        overridden: sql<number>`SUM(CASE WHEN analystSeverityOverride IS NOT NULL THEN 1 ELSE 0 END)`,
        pending: sql<number>`SUM(CASE WHEN feedbackAt IS NULL THEN 1 ELSE 0 END)`,
      }).from(triageObjects)
        .where(eq(triageObjects.status, "completed"))
        .groupBy(triageObjects.severity);

      // 5. Per-analyst activity
      const byAnalyst = await db.select({
        analystUserId: triageObjects.analystUserId,
        feedbackCount: sql<number>`COUNT(*)`,
        confirmations: sql<number>`SUM(CASE WHEN analystConfirmed = 1 THEN 1 ELSE 0 END)`,
        severityOverrides: sql<number>`SUM(CASE WHEN analystSeverityOverride IS NOT NULL THEN 1 ELSE 0 END)`,
        routeOverrides: sql<number>`SUM(CASE WHEN analystRouteOverride IS NOT NULL THEN 1 ELSE 0 END)`,
        notesWritten: sql<number>`SUM(CASE WHEN analystNotes IS NOT NULL AND analystNotes != '' THEN 1 ELSE 0 END)`,
      }).from(triageObjects)
        .where(sql`feedbackAt IS NOT NULL`)
        .groupBy(triageObjects.analystUserId);

      // 6. Recent feedback activity (last 20)
      const recentFeedback = await db.select({
        triageId: triageObjects.triageId,
        alertId: triageObjects.alertId,
        aiSeverity: triageObjects.severity,
        aiRoute: triageObjects.route,
        analystConfirmed: triageObjects.analystConfirmed,
        analystSeverityOverride: triageObjects.analystSeverityOverride,
        analystRouteOverride: triageObjects.analystRouteOverride,
        analystNotes: triageObjects.analystNotes,
        analystUserId: triageObjects.analystUserId,
        feedbackAt: triageObjects.feedbackAt,
        ruleId: triageObjects.ruleId,
        ruleDescription: triageObjects.ruleDescription,
      }).from(triageObjects)
        .where(sql`feedbackAt IS NOT NULL`)
        .orderBy(desc(triageObjects.feedbackAt))
        .limit(20);

      return {
        coverage: {
          total: coverage?.total ?? 0,
          withFeedback: coverage?.withFeedback ?? 0,
          confirmed: coverage?.confirmed ?? 0,
          rejected: coverage?.rejected ?? 0,
          severityOverridden: coverage?.severityOverridden ?? 0,
          routeOverridden: coverage?.routeOverridden ?? 0,
          withNotes: coverage?.withNotes ?? 0,
          coverageRate: coverage?.total ? ((coverage.withFeedback ?? 0) / coverage.total) * 100 : 0,
          confirmationRate: coverage?.withFeedback ? ((coverage.confirmed ?? 0) / coverage.withFeedback) * 100 : 0,
        },
        severityOverrides,
        routeOverrides,
        bySeverity,
        byAnalyst,
        recentFeedback,
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

  /**
   * @deprecated — REMOVED. Use responseActions.approve / .reject / .defer instead.
   * Action state is managed exclusively in the response_actions table.
   * The old endpoint mutated caseData JSON directly (split-brain).
   * See: Direction 1 of SOC code review.
   */

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

  // ═══════════════════════════════════════════════════════════════════════════
  // FULL PIPELINE CHAIN
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Run the full 4-stage pipeline: triage → correlation → hypothesis → response actions.
   * Tracks progress in the pipeline_runs table. Each stage is independent — if a
   * later stage fails, earlier results are preserved.
   */
  runFullPipeline: protectedProcedure
    .input(z.object({
      rawAlert: z.record(z.string(), z.unknown()),
      queueItemId: z.number().int().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const runId = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const alertId = String(input.rawAlert.id ?? input.rawAlert.alertId ?? "unknown");
      const startTime = Date.now();

      // Create pipeline run record
      const [runRow] = await db.insert(pipelineRuns).values({
        runId,
        queueItemId: input.queueItemId ?? null,
        alertId,
        currentStage: "triage",
        status: "running",
        triggeredBy: `user:${ctx.user.id}`,
      }).$returningId();

      const result: {
        runId: string;
        stages: {
          triage: { status: string; triageId?: string; latencyMs?: number; error?: string };
          correlation: { status: string; correlationId?: string; latencyMs?: number; error?: string };
          hypothesis: { status: string; caseId?: number; sessionId?: number; latencyMs?: number; error?: string };
          responseActions: { status: string; count?: number; actionIds?: string[]; error?: string };
        };
        totalLatencyMs: number;
        status: string;
      } = {
        runId,
        stages: {
          triage: { status: "pending" },
          correlation: { status: "pending" },
          hypothesis: { status: "pending" },
          responseActions: { status: "pending" },
        },
        totalLatencyMs: 0,
        status: "running",
      };

      // ── Stage 1: Triage ──────────────────────────────────────────────────
      try {
        await db.update(pipelineRuns)
          .set({ currentStage: "triage", triageStatus: "running" })
          .where(eq(pipelineRuns.id, runRow.id));

        const triageResult = await runTriageAgent({
          rawAlert: input.rawAlert,
          userId: ctx.user.id,
          alertQueueItemId: input.queueItemId,
        });

        if (!triageResult.success || !triageResult.triageId) {
          throw new Error(triageResult.error ?? "Triage failed");
        }

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
        }).where(eq(pipelineRuns.id, runRow.id));

        // Update queue item if applicable
        if (input.queueItemId) {
          await db.update(alertQueue).set({
            pipelineTriageId: triageResult.triageId,
            autoTriageStatus: "completed",
          }).where(eq(alertQueue.id, input.queueItemId));
        }
      } catch (err) {
        result.stages.triage = { status: "failed", error: (err as Error).message };
        result.status = "partial";
        await db.update(pipelineRuns).set({
          triageStatus: "failed",
          status: "partial",
          error: (err as Error).message,
          totalLatencyMs: Date.now() - startTime,
          completedAt: new Date(),
        }).where(eq(pipelineRuns.id, runRow.id));
        result.totalLatencyMs = Date.now() - startTime;
        return result;
      }

      // ── Stage 2: Correlation ─────────────────────────────────────────────
      try {
        await db.update(pipelineRuns)
          .set({ correlationStatus: "running" })
          .where(eq(pipelineRuns.id, runRow.id));

        const corrResult = await runCorrelationAgent({
          triageId: result.stages.triage.triageId!,
        });

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
        }).where(eq(pipelineRuns.id, runRow.id));
      } catch (err) {
        result.stages.correlation = { status: "failed", error: (err as Error).message };
        result.status = "partial";
        await db.update(pipelineRuns).set({
          correlationStatus: "failed",
          status: "partial",
          error: (err as Error).message,
          totalLatencyMs: Date.now() - startTime,
          completedAt: new Date(),
        }).where(eq(pipelineRuns.id, runRow.id));
        result.totalLatencyMs = Date.now() - startTime;
        return result;
      }

      // ── Stage 3: Hypothesis + Response Actions ───────────────────────────
      try {
        await db.update(pipelineRuns)
          .set({ hypothesisStatus: "running" })
          .where(eq(pipelineRuns.id, runRow.id));

        const hypoResult = await runHypothesisAgent({
          correlationId: result.stages.correlation.correlationId!,
        });

        result.stages.hypothesis = {
          status: "completed",
          caseId: hypoResult.caseId,
          sessionId: hypoResult.sessionId,
          latencyMs: hypoResult.latencyMs,
        };

        // Response actions are already materialized by the hypothesis agent
        const actionIds = hypoResult.materializedActionIds ?? [];
        result.stages.responseActions = {
          status: actionIds.length > 0 ? "completed" : "skipped",
          count: actionIds.length,
          actionIds,
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
        }).where(eq(pipelineRuns.id, runRow.id));
      } catch (err) {
        result.stages.hypothesis = { status: "failed", error: (err as Error).message };
        result.status = "partial";
        await db.update(pipelineRuns).set({
          hypothesisStatus: "failed",
          status: "partial",
          error: (err as Error).message,
          totalLatencyMs: Date.now() - startTime,
          completedAt: new Date(),
        }).where(eq(pipelineRuns.id, runRow.id));
        result.totalLatencyMs = Date.now() - startTime;
        return result;
      }

      result.totalLatencyMs = Date.now() - startTime;
      result.status = "completed";
      return result;
    }),

  /** Get a pipeline run by runId. */
  getPipelineRun: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [row] = await db
        .select()
        .from(pipelineRuns)
        .where(eq(pipelineRuns.runId, input.runId))
        .limit(1);
      return row ?? null;
    }),

  /** List recent pipeline runs. */
  listPipelineRuns: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).default(0),
      status: z.enum(["running", "completed", "failed", "partial"]).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { runs: [], total: 0 };

      const conditions = input.status
        ? [eq(pipelineRuns.status, input.status)]
        : [];

      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(pipelineRuns)
        .where(conditions.length ? and(...conditions) : undefined);

      const rows = await db
        .select()
        .from(pipelineRuns)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(pipelineRuns.startedAt))
        .limit(input.limit)
        .offset(input.offset);

      return {
        runs: rows,
        total: countResult?.count ?? 0,
      };
    }),

  /** Pipeline run stats. */
  pipelineRunStats: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return null;

      const [stats] = await db.select({
        total: sql<number>`COUNT(*)`,
        completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
        partial: sql<number>`SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END)`,
        failed: sql<number>`SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)`,
        running: sql<number>`SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END)`,
        avgLatencyMs: sql<number>`AVG(totalLatencyMs)`,
      }).from(pipelineRuns);

      return stats;
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORT GENERATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Replay a failed or partial pipeline run from the first failed stage.
   * Re-uses artifacts from completed stages (triage ID, correlation ID) and
   * re-runs only the stages that failed or were not reached.
   */
  replayPipelineRun: protectedProcedure
    .input(z.object({
      runId: z.string(),
      fromStage: z.enum(["triage", "correlation", "hypothesis"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // 1. Fetch the original run
      const [originalRun] = await db
        .select()
        .from(pipelineRuns)
        .where(eq(pipelineRuns.runId, input.runId))
        .limit(1);

      if (!originalRun) {
        throw new Error(`Pipeline run '${input.runId}' not found`);
      }

      if (originalRun.status === "running") {
        throw new Error("Cannot replay a currently running pipeline");
      }

      // 2. Determine which stage to start from
      const stageOrder = ["triage", "correlation", "hypothesis"] as const;
      let startStage = input.fromStage;

      if (!startStage) {
        // Auto-detect: find the first failed stage
        if (originalRun.triageStatus === "failed") startStage = "triage";
        else if (originalRun.correlationStatus === "failed") startStage = "correlation";
        else if (originalRun.hypothesisStatus === "failed") startStage = "hypothesis";
        else if (originalRun.responseActionsStatus === "failed") startStage = "hypothesis"; // re-run hypothesis to re-materialize
        else {
          throw new Error("No failed stage found — pipeline completed successfully");
        }
      }

      // 3. Validate we have the prerequisites for the starting stage
      const startIdx = stageOrder.indexOf(startStage);
      if (startStage === "correlation" && !originalRun.triageId) {
        throw new Error("Cannot replay from correlation — no triage ID from original run");
      }
      if (startStage === "hypothesis" && !originalRun.correlationId) {
        throw new Error("Cannot replay from hypothesis — no correlation ID from original run");
      }

      // 4. Create a new pipeline run record for the replay
      const replayRunId = `replay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const startTime = Date.now();

      const [replayRow] = await db.insert(pipelineRuns).values({
        runId: replayRunId,
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
        correlationStatus: startIdx > 1 ? "completed" : (startIdx > 0 ? "pending" : "pending"),
        correlationLatencyMs: startIdx > 1 ? originalRun.correlationLatencyMs : null,
      }).$returningId();

      const result: {
        replayRunId: string;
        originalRunId: string;
        startedFromStage: string;
        stages: {
          triage: { status: string; triageId?: string; latencyMs?: number; error?: string; reused?: boolean };
          correlation: { status: string; correlationId?: string; latencyMs?: number; error?: string; reused?: boolean };
          hypothesis: { status: string; caseId?: number; sessionId?: number; latencyMs?: number; error?: string };
          responseActions: { status: string; count?: number; actionIds?: string[]; error?: string };
        };
        totalLatencyMs: number;
        status: string;
      } = {
        replayRunId,
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
            // Fetch the triage object and extract raw alert from triageData
            const [triageRow] = await db.select().from(triageObjects).where(eq(triageObjects.triageId, originalRun.triageId)).limit(1);
            const triageData = triageRow?.triageData as any;
            rawAlert = triageData?.rawAlert as Record<string, unknown> | null;
          }

          if (!rawAlert) {
            throw new Error("Cannot replay triage — original raw alert not found");
          }

          await db.update(pipelineRuns)
            .set({ currentStage: "triage", triageStatus: "running" })
            .where(eq(pipelineRuns.id, replayRow.id));

          const triageResult = await runTriageAgent({
            rawAlert,
            userId: ctx.user.id,
            alertQueueItemId: originalRun.queueItemId ?? undefined,
          });

          if (!triageResult.success || !triageResult.triageId) {
            throw new Error(triageResult.error ?? "Triage failed");
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
          }).where(eq(pipelineRuns.id, replayRow.id));
        } catch (err) {
          result.stages.triage = { status: "failed", error: (err as Error).message };
          result.status = "partial";
          await db.update(pipelineRuns).set({
            triageStatus: "failed",
            status: "partial",
            error: (err as Error).message,
            totalLatencyMs: Date.now() - startTime,
            completedAt: new Date(),
          }).where(eq(pipelineRuns.id, replayRow.id));
          result.totalLatencyMs = Date.now() - startTime;
          return result;
        }
      }

      // ── Stage 2: Correlation (if needed) ────────────────────────────────
      if (startIdx <= 1) {
        try {
          if (!currentTriageId) throw new Error("No triage ID available for correlation");

          await db.update(pipelineRuns)
            .set({ correlationStatus: "running", currentStage: "correlation" })
            .where(eq(pipelineRuns.id, replayRow.id));

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
          }).where(eq(pipelineRuns.id, replayRow.id));
        } catch (err) {
          result.stages.correlation = { status: "failed", error: (err as Error).message };
          result.status = "partial";
          await db.update(pipelineRuns).set({
            correlationStatus: "failed",
            status: "partial",
            error: (err as Error).message,
            totalLatencyMs: Date.now() - startTime,
            completedAt: new Date(),
          }).where(eq(pipelineRuns.id, replayRow.id));
          result.totalLatencyMs = Date.now() - startTime;
          return result;
        }
      }

      // ── Stage 3: Hypothesis + Response Actions ──────────────────────────
      try {
        if (!currentCorrelationId) throw new Error("No correlation ID available for hypothesis");

        await db.update(pipelineRuns)
          .set({ hypothesisStatus: "running", currentStage: "hypothesis" })
          .where(eq(pipelineRuns.id, replayRow.id));

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
        result.stages.responseActions = {
          status: actionIds.length > 0 ? "completed" : "skipped",
          count: actionIds.length,
          actionIds,
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
        }).where(eq(pipelineRuns.id, replayRow.id));
      } catch (err) {
        result.stages.hypothesis = { status: "failed", error: (err as Error).message };
        result.status = "partial";
        await db.update(pipelineRuns).set({
          hypothesisStatus: "failed",
          status: "partial",
          error: (err as Error).message,
          totalLatencyMs: Date.now() - startTime,
          completedAt: new Date(),
        }).where(eq(pipelineRuns.id, replayRow.id));
        result.totalLatencyMs = Date.now() - startTime;
        return result;
      }

      result.totalLatencyMs = Date.now() - startTime;
      result.status = "completed";
      return result;
    }),

  /**
   * Direction 6: Pipeline Artifacts — full lineage drill-down.
   * Fetches the complete artifact chain for a pipeline run:
   *   raw alert → triage output → correlation bundle → hypothesis/living case → materialized actions
   * Plus per-stage latency, token usage, and failure indicators.
   */
  getPipelineArtifacts: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      // 1. Fetch the pipeline run
      const [run] = await db
        .select()
        .from(pipelineRuns)
        .where(eq(pipelineRuns.runId, input.runId))
        .limit(1);

      if (!run) return null;

      // 2. Fetch raw alert from alert queue (if available)
      let rawAlert: Record<string, unknown> | null = null;
      if (run.queueItemId) {
        const [queueItem] = await db
          .select()
          .from(alertQueue)
          .where(eq(alertQueue.id, run.queueItemId))
          .limit(1);
        if (queueItem?.rawJson) {
          rawAlert = typeof queueItem.rawJson === "string"
            ? JSON.parse(queueItem.rawJson)
            : queueItem.rawJson as Record<string, unknown>;
        }
      }

      // 3. Fetch triage artifact
      let triageArtifact: Record<string, unknown> | null = null;
      if (run.triageId) {
        const [triageRow] = await db
          .select()
          .from(triageObjects)
          .where(eq(triageObjects.triageId, run.triageId))
          .limit(1);
        if (triageRow) {
          triageArtifact = {
            triageId: triageRow.triageId,
            severity: triageRow.severity,
            route: triageRow.route,
            status: triageRow.status,
            agentId: triageRow.agentId,
            ruleId: triageRow.ruleId,
            triageData: triageRow.triageData,
            createdAt: triageRow.createdAt,
          };
        }
      }

      // 4. Fetch correlation artifact
      let correlationArtifact: Record<string, unknown> | null = null;
      if (run.correlationId) {
        const [corrRow] = await db
          .select()
          .from(correlationBundles)
          .where(eq(correlationBundles.correlationId, run.correlationId))
          .limit(1);
        if (corrRow) {
          correlationArtifact = {
            correlationId: corrRow.correlationId,
            sourceTriageId: corrRow.sourceTriageId,
            relatedAlertCount: corrRow.relatedAlertCount,
            discoveredEntityCount: corrRow.discoveredEntityCount,
            bundleData: corrRow.bundleData,
            createdAt: corrRow.createdAt,
          };
        }
      }

      // 5. Fetch living case / hypothesis artifact
      let hypothesisArtifact: Record<string, unknown> | null = null;
      if (run.livingCaseId) {
        const [caseRow] = await db
          .select()
          .from(livingCaseState)
          .where(eq(livingCaseState.sessionId, run.livingCaseId))
          .limit(1);
        if (caseRow) {
          hypothesisArtifact = {
            caseId: caseRow.sessionId,
            caseData: caseRow.caseData,
            workingTheory: caseRow.workingTheory,
            theoryConfidence: caseRow.theoryConfidence,
            sourceTriageId: caseRow.sourceTriageId,
            sourceCorrelationId: caseRow.sourceCorrelationId,
            completedPivotCount: caseRow.completedPivotCount,
            evidenceGapCount: caseRow.evidenceGapCount,
            pendingActionCount: caseRow.pendingActionCount,
            createdAt: caseRow.createdAt,
            updatedAt: caseRow.updatedAt,
          };
        }
      }

      // 6. Fetch materialized response actions
      let actionsArtifact: Array<Record<string, unknown>> = [];
      if (run.livingCaseId) {
        const actionRows = await db
          .select()
          .from(responseActions)
          .where(eq(responseActions.caseId, run.livingCaseId))
          .orderBy(desc(responseActions.createdAt));
        actionsArtifact = actionRows.map((a) => ({
          actionId: a.actionId,
          category: a.category,
          title: a.title,
          description: a.description,
          state: a.state,
          urgency: a.urgency,
          targetType: a.targetType,
          targetValue: a.targetValue,
          requiresApproval: a.requiresApproval,
          proposedBy: a.proposedBy,
          approvedBy: a.approvedBy,
          executedBy: a.executedBy,
          semanticWarning: a.semanticWarning,
          createdAt: a.createdAt,
        }));
      }

      // 7. Build lineage summary
      const lineage = {
        alertId: run.alertId,
        triageId: run.triageId,
        correlationId: run.correlationId,
        livingCaseId: run.livingCaseId,
        responseActionsCount: actionsArtifact.length,
      };

      // 8. Build per-stage metrics
      const stageMetrics = {
        triage: {
          status: run.triageStatus,
          latencyMs: run.triageLatencyMs,
          hasArtifact: !!triageArtifact,
        },
        correlation: {
          status: run.correlationStatus,
          latencyMs: run.correlationLatencyMs,
          hasArtifact: !!correlationArtifact,
        },
        hypothesis: {
          status: run.hypothesisStatus,
          latencyMs: run.hypothesisLatencyMs,
          hasArtifact: !!hypothesisArtifact,
        },
        responseActions: {
          status: run.responseActionsStatus,
          count: actionsArtifact.length,
          hasArtifact: actionsArtifact.length > 0,
        },
      };

      return {
        run,
        lineage,
        stageMetrics,
        artifacts: {
          rawAlert,
          triage: triageArtifact,
          correlation: correlationArtifact,
          hypothesis: hypothesisArtifact,
          actions: actionsArtifact,
        },
      };
    }),

  /** Generate a structured report from a Living Case. */
  generateCaseReport: protectedProcedure
    .input(z.object({
      caseId: z.number().int(),
      reportType: z.enum(["full", "executive", "handoff", "escalation", "tuning"]).default("full"),
    }))
    .mutation(async ({ input, ctx }) => {
      const data = await assembleLivingCaseReportData(
        input.caseId,
        ctx.user.id,
        input.reportType as ReportType,
      );

      if (!data) {
        return {
          success: false as const,
          error: "Living case not found or no data available",
          markdown: null,
          reportType: input.reportType,
        };
      }

      const markdown = generateReport(data);

      return {
        success: true as const,
        markdown,
        reportType: input.reportType,
        caseId: input.caseId,
        generatedAt: data.generatedAt,
      };
    }),
});
