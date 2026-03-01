/**
 * Response Actions Router — first-class, structured, queryable, stateful, auditable.
 *
 * Every response action is a dedicated DB row with its own lifecycle.
 * Every state transition is logged to the audit table.
 * Nothing lives inside LLM markdown output.
 *
 * Direction 5: All state transitions are delegated to the centralized state machine
 * in stateMachine.ts. This router is the API surface; the state machine is the enforcer.
 *
 * State Machine:
 *   proposed → approved → executed
 *   proposed → rejected
 *   proposed → deferred → proposed (re-propose)
 *   approved → rejected (revoke approval)
 *
 * Endpoints:
 *   Mutations: propose, approve, reject, execute, defer, repropose, bulkApprove
 *   Queries:   getById, getByCase, listAll, stats, auditTrail
 */

import { z } from "zod";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { nanoid } from "nanoid";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  responseActions,
  responseActionAudit,
  RESPONSE_ACTION_CATEGORIES,
  RESPONSE_ACTION_STATES,
  RESPONSE_ACTION_URGENCY,
} from "../../drizzle/schema";
import {
  transitionActionState,
  approveAction,
  rejectAction,
  executeAction,
  deferAction,
  reproposeAction,
} from "./stateMachine";

// ═══════════════════════════════════════════════════════════════════════════════
// Router
// ═══════════════════════════════════════════════════════════════════════════════

export const responseActionsRouter = router({
  // ── Propose a new response action ──────────────────────────────────────────
  propose: protectedProcedure
    .input(z.object({
      category: z.enum(RESPONSE_ACTION_CATEGORIES as unknown as [string, ...string[]]),
      title: z.string().min(1).max(512),
      description: z.string().max(5000).optional(),
      urgency: z.enum(RESPONSE_ACTION_URGENCY as unknown as [string, ...string[]]).default("next"),
      requiresApproval: z.boolean().default(true),
      evidenceBasis: z.array(z.string()).optional(),
      playbookRef: z.string().max(256).optional(),
      targetValue: z.string().max(512).optional(),
      targetType: z.string().max(64).optional(),
      caseId: z.number().int().optional(),
      correlationId: z.string().optional(),
      triageId: z.string().optional(),
      linkedAlertIds: z.array(z.string()).optional(),
      linkedAgentIds: z.array(z.string()).optional(),
      /** If proposed by an agent, specify the agent name */
      proposedByAgent: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const actionId = `ra-${nanoid(12)}`;
      const proposedBy = input.proposedByAgent ?? `user:${ctx.user.id}`;

      await db.insert(responseActions).values({
        actionId,
        category: input.category as any,
        title: input.title,
        description: input.description ?? null,
        urgency: input.urgency as any,
        requiresApproval: input.requiresApproval ? 1 : 0,
        state: "proposed",
        proposedBy,
        evidenceBasis: input.evidenceBasis ?? null,
        playbookRef: input.playbookRef ?? null,
        targetValue: input.targetValue ?? null,
        targetType: input.targetType ?? null,
        caseId: input.caseId ?? null,
        correlationId: input.correlationId ?? null,
        triageId: input.triageId ?? null,
        linkedAlertIds: input.linkedAlertIds ?? null,
        linkedAgentIds: input.linkedAgentIds ?? null,
      });

      // Fetch the inserted row
      const [inserted] = await db
        .select()
        .from(responseActions)
        .where(eq(responseActions.actionId, actionId))
        .limit(1);

      // Log creation audit via the centralized state machine's audit pattern
      await db.insert(responseActionAudit).values({
        actionId: inserted.id,
        actionIdStr: actionId,
        fromState: "none",
        toState: "proposed",
        performedBy: proposedBy,
        reason: "Action proposed",
        metadata: {
          category: input.category,
          urgency: input.urgency,
          requiresApproval: input.requiresApproval,
          targetValue: input.targetValue,
          targetType: input.targetType,
        },
      });

      return { success: true as const, actionId, action: inserted };
    }),

  // ── Approve ── (delegates to centralized state machine) ───────────────────
  approve: protectedProcedure
    .input(z.object({
      actionId: z.string().min(1),
      reason: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return approveAction(input.actionId, ctx.user.id, input.reason);
    }),

  // ── Reject ── (delegates to centralized state machine) ────────────────────
  reject: protectedProcedure
    .input(z.object({
      actionId: z.string().min(1),
      reason: z.string().min(1).max(2000),
    }))
    .mutation(async ({ input, ctx }) => {
      return rejectAction(input.actionId, ctx.user.id, input.reason);
    }),

  // ── Execute ── (delegates to centralized state machine) ───────────────────
  execute: protectedProcedure
    .input(z.object({
      actionId: z.string().min(1),
      executionResult: z.string().max(5000).optional(),
      executionSuccess: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await executeAction(input.actionId, ctx.user.id, {
        executionResult: input.executionResult,
        executionSuccess: input.executionSuccess,
      });

      if (result.success && result.action) {
        // Also store execution result on the action itself
        const db = await getDb();
        if (db) {
          await db
            .update(responseActions)
            .set({
              executionResult: input.executionResult ?? null,
              executionSuccess: input.executionSuccess ? 1 : 0,
            })
            .where(eq(responseActions.actionId, input.actionId));
        }
      }

      return result;
    }),

  // ── Defer ── (delegates to centralized state machine) ─────────────────────
  defer: protectedProcedure
    .input(z.object({
      actionId: z.string().min(1),
      reason: z.string().min(1).max(2000),
    }))
    .mutation(async ({ input, ctx }) => {
      return deferAction(input.actionId, ctx.user.id, input.reason);
    }),

  // ── Re-propose (from deferred) ── (delegates to centralized state machine)
  repropose: protectedProcedure
    .input(z.object({
      actionId: z.string().min(1),
      reason: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return reproposeAction(input.actionId, ctx.user.id, input.reason);
    }),

  // ── Bulk Approve ── (delegates each to centralized state machine) ─────────
  bulkApprove: protectedProcedure
    .input(z.object({
      actionIds: z.array(z.string().min(1)).min(1).max(50),
      reason: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const results: Array<{ actionId: string; success: boolean; error?: string }> = [];
      for (const actionId of input.actionIds) {
        const result = await approveAction(actionId, ctx.user.id, input.reason ?? "Bulk approved");
        results.push({ actionId, success: result.success, error: result.error });
      }

      return {
        success: true as const,
        approved: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
      };
    }),

  // ── Get by ID ──────────────────────────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ actionId: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { found: false as const };

      const [action] = await db
        .select()
        .from(responseActions)
        .where(eq(responseActions.actionId, input.actionId))
        .limit(1);

      if (!action) return { found: false as const };
      return { found: true as const, action };
    }),

  // ── Get by Case ────────────────────────────────────────────────────────────
  getByCase: protectedProcedure
    .input(z.object({
      caseId: z.number().int(),
      state: z.enum(RESPONSE_ACTION_STATES as unknown as [string, ...string[]]).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { actions: [] };

      const conditions = [eq(responseActions.caseId, input.caseId)];
      if (input.state) {
        conditions.push(eq(responseActions.state, input.state as any));
      }

      const actions = await db
        .select()
        .from(responseActions)
        .where(and(...conditions))
        .orderBy(
          sql`FIELD(${responseActions.urgency}, 'immediate', 'next', 'scheduled', 'optional')`,
          desc(responseActions.proposedAt)
        );

      return { actions };
    }),

  // ── List All (with filters) ────────────────────────────────────────────────
  listAll: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
      state: z.enum(RESPONSE_ACTION_STATES as unknown as [string, ...string[]]).optional(),
      category: z.enum(RESPONSE_ACTION_CATEGORIES as unknown as [string, ...string[]]).optional(),
      urgency: z.enum(RESPONSE_ACTION_URGENCY as unknown as [string, ...string[]]).optional(),
      requiresApproval: z.boolean().optional(),
      caseId: z.number().int().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { actions: [], total: 0 };

      const conditions: ReturnType<typeof eq>[] = [];
      if (input.state) conditions.push(eq(responseActions.state, input.state as any));
      if (input.category) conditions.push(eq(responseActions.category, input.category as any));
      if (input.urgency) conditions.push(eq(responseActions.urgency, input.urgency as any));
      if (input.requiresApproval !== undefined) {
        conditions.push(eq(responseActions.requiresApproval, input.requiresApproval ? 1 : 0));
      }
      if (input.caseId) conditions.push(eq(responseActions.caseId, input.caseId));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [actions, totalResult] = await Promise.all([
        db
          .select()
          .from(responseActions)
          .where(whereClause)
          .orderBy(
            sql`FIELD(${responseActions.state}, 'proposed', 'approved', 'deferred', 'executed', 'rejected')`,
            sql`FIELD(${responseActions.urgency}, 'immediate', 'next', 'scheduled', 'optional')`,
            desc(responseActions.proposedAt)
          )
          .limit(input.limit)
          .offset(input.offset),
        db
          .select({ total: count() })
          .from(responseActions)
          .where(whereClause),
      ]);

      return { actions, total: totalResult[0]?.total ?? 0 };
    }),

  // ── Pending Approval Queue ─────────────────────────────────────────────────
  pendingApproval: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return { actions: [], total: 0 };

      const actions = await db
        .select()
        .from(responseActions)
        .where(
          and(
            eq(responseActions.state, "proposed"),
            eq(responseActions.requiresApproval, 1)
          )
        )
        .orderBy(
          sql`FIELD(${responseActions.urgency}, 'immediate', 'next', 'scheduled', 'optional')`,
          desc(responseActions.proposedAt)
        );

      return { actions, total: actions.length };
    }),

  // ── Statistics ─────────────────────────────────────────────────────────────
  stats: protectedProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return {
        total: 0, byState: {}, byCategory: {}, byUrgency: {},
        pendingApproval: 0, avgTimeToApproval: null, avgTimeToExecution: null,
      };

      const [
        totalResult,
        byStateResult,
        byCategoryResult,
        byUrgencyResult,
        pendingApprovalResult,
        avgApprovalResult,
        avgExecutionResult,
      ] = await Promise.all([
        db.select({ total: count() }).from(responseActions),
        db
          .select({
            state: responseActions.state,
            count: count(),
          })
          .from(responseActions)
          .groupBy(responseActions.state),
        db
          .select({
            category: responseActions.category,
            count: count(),
          })
          .from(responseActions)
          .groupBy(responseActions.category),
        db
          .select({
            urgency: responseActions.urgency,
            count: count(),
          })
          .from(responseActions)
          .groupBy(responseActions.urgency),
        db
          .select({ count: count() })
          .from(responseActions)
          .where(
            and(
              eq(responseActions.state, "proposed"),
              eq(responseActions.requiresApproval, 1)
            )
          ),
        // Compute avg time from proposed → approved (seconds)
        db.select({
          avgSeconds: sql<number>`AVG(TIMESTAMPDIFF(SECOND, ${responseActions.proposedAt}, ${responseActions.approvedAt}))`,
        })
          .from(responseActions)
          .where(sql`${responseActions.approvedAt} IS NOT NULL`),
        // Compute avg time from approved → executed (seconds)
        db.select({
          avgSeconds: sql<number>`AVG(TIMESTAMPDIFF(SECOND, ${responseActions.approvedAt}, ${responseActions.executedAt}))`,
        })
          .from(responseActions)
          .where(sql`${responseActions.executedAt} IS NOT NULL AND ${responseActions.approvedAt} IS NOT NULL`),
      ]);

      const byState: Record<string, number> = {};
      for (const row of byStateResult) byState[row.state] = row.count;

      const byCategory: Record<string, number> = {};
      for (const row of byCategoryResult) byCategory[row.category] = row.count;

      const byUrgency: Record<string, number> = {};
      for (const row of byUrgencyResult) byUrgency[row.urgency] = row.count;

      // Convert seconds to human-readable or null if no data
      const rawApprovalSec = avgApprovalResult[0]?.avgSeconds ?? null;
      const rawExecutionSec = avgExecutionResult[0]?.avgSeconds ?? null;

      return {
        total: totalResult[0]?.total ?? 0,
        byState,
        byCategory,
        byUrgency,
        pendingApproval: pendingApprovalResult[0]?.count ?? 0,
        avgTimeToApproval: rawApprovalSec != null ? Math.round(rawApprovalSec) : null, // seconds, null if no approved actions yet
        avgTimeToExecution: rawExecutionSec != null ? Math.round(rawExecutionSec) : null, // seconds, null if no executed actions yet
      };
    }),

  // ── Audit Trail ────────────────────────────────────────────────────────────
  auditTrail: protectedProcedure
    .input(z.object({
      actionId: z.string().min(1),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { entries: [] };

      const entries = await db
        .select()
        .from(responseActionAudit)
        .where(eq(responseActionAudit.actionIdStr, input.actionId))
        .orderBy(desc(responseActionAudit.performedAt));

      return { entries };
    }),

  // ── Full Audit Log (all actions) ───────────────────────────────────────────
  fullAuditLog: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(500).default(100),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { entries: [], total: 0 };

      const [entries, totalResult] = await Promise.all([
        db
          .select()
          .from(responseActionAudit)
          .orderBy(desc(responseActionAudit.performedAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ total: count() }).from(responseActionAudit),
      ]);

      return { entries, total: totalResult[0]?.total ?? 0 };
    }),
});
