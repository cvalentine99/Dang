/**
 * Response Actions Router — first-class, structured, queryable, stateful, auditable.
 *
 * Every response action is a dedicated DB row with its own lifecycle.
 * Every state transition is logged to the audit table.
 * Nothing lives inside LLM markdown output.
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
import { eq, and, desc, sql, inArray, count } from "drizzle-orm";
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

// ── Valid State Transitions ──────────────────────────────────────────────────
const VALID_TRANSITIONS: Record<string, string[]> = {
  proposed: ["approved", "rejected", "deferred"],
  approved: ["executed", "rejected"],
  deferred: ["proposed"],
  // rejected and executed are terminal states
  rejected: [],
  executed: [],
};

function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Audit Logger ─────────────────────────────────────────────────────────────
async function logAudit(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  opts: {
    actionDbId: number;
    actionIdStr: string;
    fromState: string;
    toState: string;
    performedBy: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }
) {
  await db.insert(responseActionAudit).values({
    actionId: opts.actionDbId,
    actionIdStr: opts.actionIdStr,
    fromState: opts.fromState,
    toState: opts.toState,
    performedBy: opts.performedBy,
    reason: opts.reason ?? null,
    metadata: opts.metadata ?? null,
  });
}

// ── Transition Helper ────────────────────────────────────────────────────────
async function transitionState(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  opts: {
    actionId: string;
    targetState: typeof RESPONSE_ACTION_STATES[number];
    userId: number;
    reason?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<{ success: boolean; error?: string; action?: typeof responseActions.$inferSelect }> {
  // Fetch current action
  const [action] = await db
    .select()
    .from(responseActions)
    .where(eq(responseActions.actionId, opts.actionId))
    .limit(1);

  if (!action) {
    return { success: false, error: `Action ${opts.actionId} not found` };
  }

  if (!isValidTransition(action.state, opts.targetState)) {
    return {
      success: false,
      error: `Invalid transition: ${action.state} → ${opts.targetState}. Allowed: ${VALID_TRANSITIONS[action.state]?.join(", ") || "none (terminal state)"}`,
    };
  }

  // ── Direction 5 Invariants ─────────────────────────────────────────────────

  // Invariant 1: requiresApproval=true cannot go proposed→executed without approved step.
  // The state machine already enforces proposed→approved→executed, but guard explicitly.
  if (
    opts.targetState === "executed" &&
    action.requiresApproval === 1 &&
    action.state !== "approved"
  ) {
    return {
      success: false,
      error: `Action requires approval before execution. Current state: ${action.state}. Must be approved first.`,
    };
  }

  // Invariant 2: Deferred actions require a reason.
  if (opts.targetState === "deferred" && (!opts.reason || opts.reason.trim().length === 0)) {
    return {
      success: false,
      error: "Deferred actions require a reason. Provide a reason explaining why this action is being deferred.",
    };
  }

  // Invariant 3: Rejected actions require a reason.
  if (opts.targetState === "rejected" && (!opts.reason || opts.reason.trim().length === 0)) {
    return {
      success: false,
      error: "Rejected actions require a reason. Provide a reason explaining why this action is being rejected.",
    };
  }

  const fromState = action.state;
  const performer = `user:${opts.userId}`;
  const now = new Date();

  // Build the update payload based on target state
  const updatePayload: Record<string, unknown> = { state: opts.targetState };

  switch (opts.targetState) {
    case "approved":
      updatePayload.approvedBy = performer;
      updatePayload.approvedAt = now;
      updatePayload.decidedBy = performer;
      updatePayload.decidedAt = now;
      break;
    case "rejected":
      updatePayload.decidedBy = performer;
      updatePayload.decidedAt = now;
      updatePayload.decisionReason = opts.reason ?? null;
      break;
    case "executed":
      updatePayload.executedBy = performer;
      updatePayload.executedAt = now;
      break;
    case "deferred":
      updatePayload.decidedBy = performer;
      updatePayload.decidedAt = now;
      updatePayload.decisionReason = opts.reason ?? null;
      break;
    case "proposed":
      // Re-propose from deferred — clear previous decision
      updatePayload.decidedBy = null;
      updatePayload.decidedAt = null;
      updatePayload.decisionReason = null;
      break;
  }

  await db
    .update(responseActions)
    .set(updatePayload as any)
    .where(eq(responseActions.id, action.id));

  // Log audit trail
  await logAudit(db, {
    actionDbId: action.id,
    actionIdStr: action.actionId,
    fromState,
    toState: opts.targetState,
    performedBy: performer,
    reason: opts.reason,
    metadata: opts.metadata,
  });

  // Return updated action
  const [updated] = await db
    .select()
    .from(responseActions)
    .where(eq(responseActions.id, action.id))
    .limit(1);

  return { success: true, action: updated };
}

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

      // Log creation audit
      await logAudit(db, {
        actionDbId: inserted.id,
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

  // ── Approve ────────────────────────────────────────────────────────────────
  approve: protectedProcedure
    .input(z.object({
      actionId: z.string().min(1),
      reason: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return transitionState(db, {
        actionId: input.actionId,
        targetState: "approved",
        userId: ctx.user.id,
        reason: input.reason,
      });
    }),

  // ── Reject ─────────────────────────────────────────────────────────────────
  reject: protectedProcedure
    .input(z.object({
      actionId: z.string().min(1),
      reason: z.string().min(1).max(2000),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return transitionState(db, {
        actionId: input.actionId,
        targetState: "rejected",
        userId: ctx.user.id,
        reason: input.reason,
      });
    }),

  // ── Execute ────────────────────────────────────────────────────────────────
  execute: protectedProcedure
    .input(z.object({
      actionId: z.string().min(1),
      executionResult: z.string().max(5000).optional(),
      executionSuccess: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const result = await transitionState(db, {
        actionId: input.actionId,
        targetState: "executed",
        userId: ctx.user.id,
        metadata: {
          executionResult: input.executionResult,
          executionSuccess: input.executionSuccess,
        },
      });

      if (result.success && result.action) {
        // Also store execution result on the action itself
        await db
          .update(responseActions)
          .set({
            executionResult: input.executionResult ?? null,
            executionSuccess: input.executionSuccess ? 1 : 0,
          })
          .where(eq(responseActions.actionId, input.actionId));
      }

      return result;
    }),

  // ── Defer ──────────────────────────────────────────────────────────────────
  defer: protectedProcedure
    .input(z.object({
      actionId: z.string().min(1),
      reason: z.string().min(1).max(2000),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return transitionState(db, {
        actionId: input.actionId,
        targetState: "deferred",
        userId: ctx.user.id,
        reason: input.reason,
      });
    }),

  // ── Re-propose (from deferred) ────────────────────────────────────────────
  repropose: protectedProcedure
    .input(z.object({
      actionId: z.string().min(1),
      reason: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      return transitionState(db, {
        actionId: input.actionId,
        targetState: "proposed",
        userId: ctx.user.id,
        reason: input.reason ?? "Re-proposed from deferred",
      });
    }),

  // ── Bulk Approve ───────────────────────────────────────────────────────────
  bulkApprove: protectedProcedure
    .input(z.object({
      actionIds: z.array(z.string().min(1)).min(1).max(50),
      reason: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const results: Array<{ actionId: string; success: boolean; error?: string }> = [];
      for (const actionId of input.actionIds) {
        const result = await transitionState(db, {
          actionId,
          targetState: "approved",
          userId: ctx.user.id,
          reason: input.reason ?? "Bulk approved",
        });
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
      ]);

      const byState: Record<string, number> = {};
      for (const row of byStateResult) byState[row.state] = row.count;

      const byCategory: Record<string, number> = {};
      for (const row of byCategoryResult) byCategory[row.category] = row.count;

      const byUrgency: Record<string, number> = {};
      for (const row of byUrgencyResult) byUrgency[row.urgency] = row.count;

      return {
        total: totalResult[0]?.total ?? 0,
        byState,
        byCategory,
        byUrgency,
        pendingApproval: pendingApprovalResult[0]?.count ?? 0,
        avgTimeToApproval: null, // TODO: compute from audit trail
        avgTimeToExecution: null,
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
