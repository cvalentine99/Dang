/**
 * Splunk Router — tRPC procedures for Splunk ES ticket creation.
 *
 * Provides:
 * - testConnection: Test Splunk HEC connectivity
 * - createTicket: Manually create a single Splunk ES notable event from a completed triage
 * - batchCreateTickets: Manually batch-create Splunk tickets for all eligible completed triages
 * - getBatchProgress: Poll batch operation progress
 * - getConfig: Get current Splunk configuration (token masked)
 * - listTicketArtifacts: Query the audit trail of all ticket creation attempts (success + failure)
 * - getTicketArtifact: Get a single ticket artifact by ID
 *
 * This is manual ticket creation from completed triage reports.
 * Every ticket is explicitly triggered by an analyst — no background automation.
 * Both success and failure are recorded in the ticket_artifacts table as forensic audit trail.
 *
 * Workflow lineage (ticket_artifacts):
 *   ticket → triageId → triage_objects (primary linkage to the triage that produced the ticket data)
 *   ticket → pipelineRunId → pipeline_runs (linkage to the run that executed the triage)
 *   ticket → queueItemId → alert_queue (linkage to the original queue item)
 *   ticket → alertId (direct Wazuh alert cross-reference)
 *
 * Feature-gated: createTicket/batchCreateTickets require admin role.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  testSplunkConnection,
  createSplunkTicket,
  getEffectiveSplunkConfig,
  isSplunkEnabled,
} from "./splunkService";
import { getDb } from "../db";
import { alertQueue, ticketArtifacts, pipelineRuns } from "../../drizzle/schema";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";

/**
 * In-memory batch progress tracker.
 * Tracks the current state of a running batch ticket operation.
 * Auto-expires after 5 minutes of inactivity.
 */
interface BatchProgress {
  batchId: string;
  status: "idle" | "running" | "completed" | "failed";
  total: number;
  completed: number;
  sent: number;
  failed: number;
  currentAlert: string;
  currentIndex: number;
  startedAt: number;
  updatedAt: number;
  results: Array<{ id: number; alertId: string; ticketId?: string; error?: string }>;
}

const BATCH_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

let currentBatch: BatchProgress = {
  batchId: "",
  status: "idle",
  total: 0,
  completed: 0,
  sent: 0,
  failed: 0,
  currentAlert: "",
  currentIndex: 0,
  startedAt: 0,
  updatedAt: 0,
  results: [],
};

function resetBatch(): void {
  currentBatch = {
    batchId: "",
    status: "idle",
    total: 0,
    completed: 0,
    sent: 0,
    failed: 0,
    currentAlert: "",
    currentIndex: 0,
    startedAt: 0,
    updatedAt: 0,
    results: [],
  };
}

function isBatchExpired(): boolean {
  if (currentBatch.status === "idle") return false;
  return Date.now() - currentBatch.updatedAt > BATCH_EXPIRY_MS;
}

// Exported for testing
export function _getBatchProgressForTest(): BatchProgress {
  return { ...currentBatch };
}

export const splunkRouter = router({
  /**
   * Get current Splunk configuration (token masked for security).
   */
  getConfig: protectedProcedure.query(async () => {
    const config = await getEffectiveSplunkConfig();
    return {
      host: config.host,
      port: config.port,
      hecPort: config.hecPort,
      protocol: config.protocol,
      enabled: config.enabled,
      hasToken: !!config.hecToken,
      tokenPreview: config.hecToken
        ? `${config.hecToken.slice(0, 8)}...${config.hecToken.slice(-4)}`
        : "",
    };
  }),

  /**
   * Test Splunk HEC connectivity.
   */
  testConnection: protectedProcedure.mutation(async () => {
    return testSplunkConnection();
  }),

  /**
   * Check if Splunk integration is available.
   */
  isEnabled: protectedProcedure.query(async () => {
    const enabled = await isSplunkEnabled();
    return { enabled };
  }),

  /**
   * Create a Splunk ES ticket from a completed triage report.
   * Manual trigger only — analyst clicks "Create Ticket" in the UI.
   * Records a ticket_artifact row for both success and failure (audit trail).
   * Requires admin role (ticket creation is a privileged action).
   */
  createTicket: protectedProcedure
    .input(
      z.object({
        /** Alert queue item ID */
        queueItemId: z.number().int(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Feature gate: require admin role
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Creating Splunk tickets requires admin role",
        });
      }

      // Check if Splunk is enabled
      const enabled = await isSplunkEnabled();
      if (!enabled) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Splunk integration is not configured or enabled",
        });
      }

      // Get the queue item with triage result
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [item] = await db
        .select()
        .from(alertQueue)
        .where(eq(alertQueue.id, input.queueItemId))
        .limit(1);

      if (!item) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Queue item not found" });
      }

      if (item.status !== "completed") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Can only create tickets for completed triage reports",
        });
      }

      const triage = item.triageResult as Record<string, unknown> | null;
      if (!triage) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No triage result available for this queue item",
        });
      }

      // Extract MITRE data from raw alert JSON
      const rawJson = (item.rawJson as Record<string, unknown>) ?? {};
      const rule = (rawJson.rule as Record<string, unknown>) ?? {};
      const mitre = (rule.mitre as Record<string, unknown>) ?? {};
      const mitreIds = Array.isArray(mitre.id) ? (mitre.id as string[]) : [];
      const mitreTactics = Array.isArray(mitre.tactic) ? (mitre.tactic as string[]) : [];

      // Create the Splunk ticket
      const result = await createSplunkTicket({
        alertId: item.alertId,
        ruleId: item.ruleId,
        ruleDescription: item.ruleDescription ?? "Unknown",
        ruleLevel: item.ruleLevel,
        agentId: item.agentId ?? "Unknown",
        agentName: item.agentName ?? "Unknown",
        alertTimestamp: item.alertTimestamp ?? new Date().toISOString(),
        triageSummary: (triage.answer as string) ?? "No summary available",
        triageReasoning: (triage.reasoning as string) ?? "",
        trustScore: (triage.trustScore as number) ?? 0,
        confidence: (triage.confidence as number) ?? 0,
        safetyStatus: (triage.safetyStatus as string) ?? "unknown",
        mitreIds,
        mitreTactics,
        suggestedFollowUps: (triage.suggestedFollowUps as string[]) ?? [],
        rawAlertJson: rawJson,
        createdBy: ctx.user?.name ?? ctx.user?.email ?? "unknown",
      });

      // Look up the associated pipeline run + triageId for first-class artifact linkage
      // Workflow lineage: ticket → triage → alert (via triageId)
      //                   ticket → pipelineRun (via pipelineRunId)
      //                   ticket → queueItem (via queueItemId)
      const [associatedRun] = await db
        .select({ id: pipelineRuns.id, triageId: pipelineRuns.triageId })
        .from(pipelineRuns)
        .where(eq(pipelineRuns.queueItemId, input.queueItemId))
        .orderBy(sql`${pipelineRuns.startedAt} DESC`)
        .limit(1);

      // Record the ticket artifact — both success and failure get recorded
      // This is the first-class audit trail for ticket creation
      await db.insert(ticketArtifacts).values({
        ticketId: result.ticketId ?? `failed-${Date.now()}`,
        system: "splunk_es",
        queueItemId: input.queueItemId,
        pipelineRunId: associatedRun?.id ?? null,
        triageId: associatedRun?.triageId ?? item.pipelineTriageId ?? null,
        alertId: item.alertId,
        ruleId: item.ruleId,
        ruleLevel: item.ruleLevel,
        createdBy: ctx.user?.name ?? ctx.user?.email ?? "unknown",
        success: result.success === true && !!result.ticketId,
        statusMessage: result.message,
        rawResponse: { ticketId: result.ticketId, message: result.message },
        httpStatusCode: null,
      });

      // If successful, also update the queue item with ticket info (legacy linkage)
      if (result.success && result.ticketId) {
        const existingTriage = (item.triageResult as Record<string, unknown>) ?? {};
        const updatedTriage = {
          ...existingTriage,
          splunkTicketId: result.ticketId,
          splunkTicketCreatedAt: new Date().toISOString(),
          splunkTicketCreatedBy: ctx.user?.name ?? ctx.user?.email,
        } as unknown as typeof item.triageResult;
        await db
          .update(alertQueue)
          .set({ triageResult: updatedTriage })
          .where(eq(alertQueue.id, input.queueItemId));
      }

      // Explicit success/failure return — never ambiguous
      // The UI must be able to distinguish these without guessing
      if (result.success && result.ticketId) {
        return {
          success: true as const,
          ticketId: result.ticketId,
          message: result.message,
        };
      }

      // HEC returned a non-throwing failure (e.g., 403, timeout, disabled)
      // Return success:false explicitly so the UI shows an error state
      return {
        success: false as const,
        ticketId: null,
        message: result.message || "Splunk HEC did not confirm ticket creation",
      };
    }),

  /**
   * Get current batch ticket creation progress.
   * Polled by the frontend during batch operations.
   */
  batchProgress: protectedProcedure.query(async () => {
    // Auto-expire stale batches
    if (isBatchExpired()) {
      resetBatch();
    }
    return {
      batchId: currentBatch.batchId,
      status: currentBatch.status,
      total: currentBatch.total,
      completed: currentBatch.completed,
      sent: currentBatch.sent,
      failed: currentBatch.failed,
      currentAlert: currentBatch.currentAlert,
      currentIndex: currentBatch.currentIndex,
      percentage: currentBatch.total > 0
        ? Math.round((currentBatch.completed / currentBatch.total) * 100)
        : 0,
    };
  }),

  /**
   * Get the Splunk ES base URL for constructing deep links.
   * Returns the URL pattern for Incident Review page.
   */
  getSplunkBaseUrl: protectedProcedure.query(async () => {
    const config = await getEffectiveSplunkConfig();
    if (!config.enabled || !config.host) {
      return { url: null, enabled: false };
    }
    // Splunk Web runs on port 8000 by default (not the management port 8089)
    const webPort = config.port === "8089" ? "8000" : config.port;
    const baseUrl = `${config.protocol}://${config.host}:${webPort}`;
    return {
      url: baseUrl,
      enabled: true,
      // Full deep link pattern: {baseUrl}/en-US/app/SplunkEnterpriseSecuritySuite/incident_review?search=ticket_id%3D{ticketId}
      incidentReviewUrl: `${baseUrl}/en-US/app/SplunkEnterpriseSecuritySuite/incident_review`,
    };
  }),

  /**
   * Batch create Splunk ES tickets for all completed triage reports
   * that don't already have a ticket. Requires admin role.
   * Updates in-memory progress tracker for real-time polling.
   */
  batchCreateTickets: protectedProcedure
    .mutation(async ({ ctx }) => {
      // Feature gate: require admin role
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Creating Splunk tickets requires admin role",
        });
      }

      // Prevent concurrent batches
      if (currentBatch.status === "running") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A batch ticket creation is already in progress",
        });
      }

      // Check if Splunk is enabled
      const enabled = await isSplunkEnabled();
      if (!enabled) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Splunk integration is not configured or enabled",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      // Get all completed items with triage results
      const completedItems = await db
        .select()
        .from(alertQueue)
        .where(eq(alertQueue.status, "completed"));

      // Filter to items that have triage results but no existing Splunk ticket
      const eligibleItems = completedItems.filter((item) => {
        const triage = item.triageResult as Record<string, unknown> | null;
        if (!triage || !triage.answer) return false;
        if (triage.splunkTicketId) return false;
        return true;
      });

      if (eligibleItems.length === 0) {
        return {
          success: true,
          total: 0,
          sent: 0,
          skipped: completedItems.length,
          failed: 0,
          message: "No eligible triage reports found (all already have tickets or no triage data)",
        };
      }

      // Initialize batch progress
      const batchId = `batch-${Date.now()}`;
      currentBatch = {
        batchId,
        status: "running",
        total: eligibleItems.length,
        completed: 0,
        sent: 0,
        failed: 0,
        currentAlert: eligibleItems[0]?.alertId ?? "",
        currentIndex: 0,
        startedAt: Date.now(),
        updatedAt: Date.now(),
        results: [],
      };

      let sent = 0;
      let failed = 0;
      const results: Array<{ id: number; alertId: string; ticketId?: string; error?: string }> = [];

      for (let i = 0; i < eligibleItems.length; i++) {
        const item = eligibleItems[i];

        // Update progress: currently processing this item
        currentBatch.currentIndex = i + 1;
        currentBatch.currentAlert = item.alertId;
        currentBatch.updatedAt = Date.now();

        try {
          const triage = item.triageResult as Record<string, unknown>;
          const rawJson = (item.rawJson as Record<string, unknown>) ?? {};
          const rule = (rawJson.rule as Record<string, unknown>) ?? {};
          const mitre = (rule.mitre as Record<string, unknown>) ?? {};
          const mitreIds = Array.isArray(mitre.id) ? (mitre.id as string[]) : [];
          const mitreTactics = Array.isArray(mitre.tactic) ? (mitre.tactic as string[]) : [];

          const result = await createSplunkTicket({
            alertId: item.alertId,
            ruleId: item.ruleId,
            ruleDescription: item.ruleDescription ?? "Unknown",
            ruleLevel: item.ruleLevel,
            agentId: item.agentId ?? "Unknown",
            agentName: item.agentName ?? "Unknown",
            alertTimestamp: item.alertTimestamp ?? new Date().toISOString(),
            triageSummary: (triage.answer as string) ?? "No summary available",
            triageReasoning: (triage.reasoning as string) ?? "",
            trustScore: (triage.trustScore as number) ?? 0,
            confidence: (triage.confidence as number) ?? 0,
            safetyStatus: (triage.safetyStatus as string) ?? "unknown",
            mitreIds,
            mitreTactics,
            suggestedFollowUps: (triage.suggestedFollowUps as string[]) ?? [],
            rawAlertJson: rawJson,
            createdBy: ctx.user?.name ?? ctx.user?.email ?? "unknown",
          });

          // Look up associated pipeline run + triageId for first-class artifact linkage
          const [associatedRun] = await db
            .select({ id: pipelineRuns.id, triageId: pipelineRuns.triageId })
            .from(pipelineRuns)
            .where(eq(pipelineRuns.queueItemId, item.id))
            .orderBy(sql`${pipelineRuns.startedAt} DESC`)
            .limit(1);

          // Record ticket artifact — both success and failure, with full workflow lineage
          await db.insert(ticketArtifacts).values({
            ticketId: result.ticketId ?? `failed-${Date.now()}`,
            system: "splunk_es",
            queueItemId: item.id,
            pipelineRunId: associatedRun?.id ?? null,
            triageId: associatedRun?.triageId ?? item.pipelineTriageId ?? null,
            alertId: item.alertId,
            ruleId: item.ruleId,
            ruleLevel: item.ruleLevel,
            createdBy: ctx.user?.name ?? ctx.user?.email ?? "unknown",
            success: result.success === true && !!result.ticketId,
            statusMessage: result.message,
            rawResponse: { ticketId: result.ticketId, message: result.message },
            httpStatusCode: null,
          });

          if (result.success && result.ticketId) {
            const updatedTriage = {
              ...triage,
              splunkTicketId: result.ticketId,
              splunkTicketCreatedAt: new Date().toISOString(),
              splunkTicketCreatedBy: ctx.user?.name ?? ctx.user?.email,
            } as unknown as typeof item.triageResult;
            await db
              .update(alertQueue)
              .set({ triageResult: updatedTriage })
              .where(eq(alertQueue.id, item.id));

            sent++;
            results.push({ id: item.id, alertId: item.alertId, ticketId: result.ticketId });
            currentBatch.sent = sent;
          } else {
            failed++;
            results.push({ id: item.id, alertId: item.alertId, error: result.message });
            currentBatch.failed = failed;
          }
        } catch (err) {
          // Record failed ticket artifact for exception-path failures too
          try {
            await db.insert(ticketArtifacts).values({
              ticketId: `exception-${Date.now()}`,
              system: "splunk_es",
              queueItemId: item.id,
              pipelineRunId: null,
              triageId: item.pipelineTriageId ?? null,
              alertId: item.alertId,
              ruleId: item.ruleId,
              ruleLevel: item.ruleLevel,
              createdBy: ctx.user?.name ?? ctx.user?.email ?? "unknown",
              success: false,
              statusMessage: err instanceof Error ? err.message : "Unknown error",
              rawResponse: null,
              httpStatusCode: null,
            });
          } catch { /* don't let artifact recording break the batch loop */ }

          failed++;
          results.push({
            id: item.id,
            alertId: item.alertId,
            error: err instanceof Error ? err.message : "Unknown error",
          });
          currentBatch.failed = failed;
        }

        // Update progress: item completed
        currentBatch.completed = i + 1;
        currentBatch.results = results;
        currentBatch.updatedAt = Date.now();
      }

      const skipped = completedItems.length - eligibleItems.length;

      // Mark batch as completed
      currentBatch.status = failed === eligibleItems.length ? "failed" : "completed";
      currentBatch.currentAlert = "";
      currentBatch.updatedAt = Date.now();

      return {
        success: failed === 0,
        total: eligibleItems.length,
        sent,
        skipped,
        failed,
        message: `Batch complete: ${sent} tickets created, ${skipped} skipped (already ticketed), ${failed} failed`,
        results,
      };
    }),

  /**
   * List ticket artifacts — the audit trail for all ticket creation attempts.
   * Returns both successful and failed ticket creation records with workflow lineage.
   * Ordered by most recent first.
   */
  listTicketArtifacts: protectedProcedure
    .input(
      z.object({
        /** Filter by queue item ID */
        queueItemId: z.number().int().optional(),
        /** Filter by system */
        system: z.enum(["splunk_es", "jira", "servicenow", "custom"]).optional(),
        /** Filter by success/failure */
        success: z.boolean().optional(),
        /** Pagination */
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const conditions = [];
      if (input.queueItemId !== undefined) {
        conditions.push(eq(ticketArtifacts.queueItemId, input.queueItemId));
      }
      if (input.system !== undefined) {
        conditions.push(eq(ticketArtifacts.system, input.system));
      }
      if (input.success !== undefined) {
        conditions.push(eq(ticketArtifacts.success, input.success));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await db
        .select()
        .from(ticketArtifacts)
        .where(whereClause)
        .orderBy(sql`${ticketArtifacts.createdAt} DESC`)
        .limit(input.limit)
        .offset(input.offset);

      return { artifacts: rows, count: rows.length };
    }),

  /**
   * Batch-query ticket artifact counts for a list of pipeline run IDs.
   * Returns a map of { pipelineRunId: { total, success, failed } }.
   * Used by Pipeline Inspector to show Tickets badges without N+1 queries.
   */
  ticketArtifactCounts: protectedProcedure
    .input(
      z.object({
        pipelineRunIds: z.array(z.number().int()).min(1).max(200),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const rows = await db
        .select({
          pipelineRunId: ticketArtifacts.pipelineRunId,
          total: sql<number>`COUNT(*)`,
          success: sql<number>`SUM(CASE WHEN ${ticketArtifacts.success} = true THEN 1 ELSE 0 END)`,
          failed: sql<number>`SUM(CASE WHEN ${ticketArtifacts.success} = false THEN 1 ELSE 0 END)`,
        })
        .from(ticketArtifacts)
        .where(inArray(ticketArtifacts.pipelineRunId, input.pipelineRunIds))
        .groupBy(ticketArtifacts.pipelineRunId);

      const counts: Record<number, { total: number; success: number; failed: number }> = {};
      for (const row of rows) {
        if (row.pipelineRunId != null) {
          counts[row.pipelineRunId] = {
            total: Number(row.total),
            success: Number(row.success),
            failed: Number(row.failed),
          };
        }
      }

      return { counts };
    }),

  /**
   * Get a single ticket artifact by ID — full detail view for audit inspection.
   */
  getTicketArtifact: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      }

      const [artifact] = await db
        .select()
        .from(ticketArtifacts)
        .where(eq(ticketArtifacts.id, input.id))
        .limit(1);

      if (!artifact) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ticket artifact not found" });
      }

      return artifact;
    }),
});
