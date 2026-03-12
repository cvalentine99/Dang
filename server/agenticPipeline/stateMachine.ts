/**
 * Direction 5: Centralized State Machine for Response Actions
 *
 * This module is the SINGLE source of truth for all response action state transitions.
 * Every mutation that changes action state MUST go through this module.
 *
 * Invariants enforced:
 *   1. requiresApproval=true cannot skip proposed→approved→executed
 *   2. Rejected actions are terminal — cannot be executed
 *   3. Executed actions are terminal — cannot be modified
 *   4. Deferred actions require a reason
 *   5. Rejected actions require a reason
 *   6. Every state transition writes an audit row
 *   7. Every action tied to a case must have a valid caseId
 *   8. Only valid transitions are allowed (no arbitrary jumps)
 *
 * State Machine:
 *   proposed → approved → executed
 *   proposed → rejected (terminal)
 *   proposed → deferred → proposed (re-propose)
 *   approved → rejected (revoke approval, terminal)
 *   approved → executed (terminal)
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  responseActions,
  responseActionAudit,
  livingCaseState,
} from "../../drizzle/schema";
import type { LivingCaseObject } from "../../shared/agenticSchemas";

/**
 * Database handle type — works with both the root db and a transaction handle.
 * Every internal function accepts this so the entire transition can run inside
 * a single transaction.
 *
 * The root db has `$client: Pool` but a transaction handle (`MySqlTransaction`)
 * does not. TxLike is inferred from the transaction callback parameter so it
 * always matches the actual drizzle-orm version installed.
 */
type DbRoot = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type TxLike = Parameters<Parameters<DbRoot['transaction']>[0]>[0];
type DbLike = DbRoot | TxLike;

// ── Types ───────────────────────────────────────────────────────────────────

export type ActionState = "proposed" | "approved" | "rejected" | "executed" | "deferred";

export const TERMINAL_STATES: readonly ActionState[] = ["rejected", "executed"] as const;

export interface TransitionRequest {
  actionId: string;
  targetState: ActionState;
  performedBy: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  /**
   * When true, skip the case-summary recompute after this transition.
   * Used by bulk operations that recompute once at the end instead of N times.
   * The caller MUST call syncCaseSummaryAfterTransition() after the batch.
   */
  skipCaseSync?: boolean;
}

export interface TransitionResult {
  success: boolean;
  error?: string;
  invariantViolation?: string;
  action?: typeof responseActions.$inferSelect;
  fromState?: string;
  toState?: string;
}

// ── Valid Transitions ───────────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<ActionState, ActionState[]> = {
  proposed: ["approved", "rejected", "deferred"],
  approved: ["executed", "rejected"],
  deferred: ["proposed"],
  rejected: [],   // terminal
  executed: [],   // terminal
};

export function isValidTransition(from: string, to: string): boolean {
  return (VALID_TRANSITIONS[from as ActionState] ?? []).includes(to as ActionState);
}

export function isTerminalState(state: string): boolean {
  return TERMINAL_STATES.includes(state as ActionState);
}

export function getAllowedTransitions(state: string): ActionState[] {
  return VALID_TRANSITIONS[state as ActionState] ?? [];
}

// ── Invariant Checks ────────────────────────────────────────────────────────

interface InvariantCheckResult {
  valid: boolean;
  violation?: string;
}

/**
 * Checks all Direction 5 invariants before allowing a transition.
 * Returns { valid: true } if all pass, or { valid: false, violation: "..." } if any fail.
 */
export function checkInvariants(
  action: typeof responseActions.$inferSelect,
  targetState: ActionState,
  reason?: string
): InvariantCheckResult {
  // Invariant 1: Terminal states cannot transition
  if (isTerminalState(action.state)) {
    return {
      valid: false,
      violation: `Action is in terminal state "${action.state}" — no further transitions allowed.`,
    };
  }

  // Invariant 2: Valid transition check
  if (!isValidTransition(action.state, targetState)) {
    const allowed = getAllowedTransitions(action.state);
    return {
      valid: false,
      violation: `Invalid transition: ${action.state} → ${targetState}. Allowed: ${allowed.join(", ") || "none (terminal state)"}`,
    };
  }

  // Invariant 3: requiresApproval=true cannot skip proposed→approved→executed
  if (
    targetState === "executed" &&
    action.requiresApproval === 1 &&
    action.state !== "approved"
  ) {
    return {
      valid: false,
      violation: `Action requires approval before execution. Current state: ${action.state}. Must be approved first.`,
    };
  }

  // Invariant 4: Deferred actions require a reason
  if (targetState === "deferred" && (!reason || reason.trim().length === 0)) {
    return {
      valid: false,
      violation: "Deferred actions require a reason. Provide a reason explaining why this action is being deferred.",
    };
  }

  // Invariant 5: Rejected actions require a reason
  if (targetState === "rejected" && (!reason || reason.trim().length === 0)) {
    return {
      valid: false,
      violation: "Rejected actions require a reason. Provide a reason explaining why this action is being rejected.",
    };
  }

  // Invariant 6: Actions with a caseId must reference a valid case
  // (This is enforced at propose-time, not transition-time, but we guard here too)
  // No-op for transitions — caseId is immutable after creation.

  return { valid: true };
}

// ── Audit Logger ────────────────────────────────────────────────────────────

/**
 * Invariant 6: Every state transition writes an audit row. No exceptions.
 */
async function logAudit(
  db: DbLike,
  opts: {
    actionDbId: number;
    actionIdStr: string;
    fromState: string;
    toState: string;
    performedBy: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
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

// ── Central Transition Function ─────────────────────────────────────────────

/**
 * The ONE function that performs state transitions for response actions.
 * All state changes MUST go through this function.
 *
 * Guarantees:
 *   - All invariants are checked INSIDE the transaction (no stale reads)
 *   - UPDATE uses an optimistic guard: WHERE id = ? AND state = fromState
 *     so concurrent transitions on the same action fail cleanly instead of stomping
 *   - An audit row is written for every successful transition
 *   - Action mutation + audit + case summary recompute are ATOMIC (single transaction)
 *   - The updated action is returned
 *
 * Concurrency model:
 *   InnoDB row locks on the UPDATE mean a second concurrent transaction on the
 *   same action will block until the first commits. When it resumes, the WHERE
 *   guard on `state = fromState` no longer matches, affectedRows = 0, and the
 *   second transaction gets a clean conflict error — no stomping, no silent
 *   double-transition.
 */
export async function transitionActionState(
  req: TransitionRequest
): Promise<TransitionResult> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database not available" };

  // Everything that reads or writes happens inside one transaction.
  // The action fetch, invariant check, update, audit, and summary sync are all
  // serialized under the same tx — no stale-state window.
  return db.transaction(async (tx) => {
    // 1. Fetch current action INSIDE the transaction.
    //    InnoDB's row lock on the subsequent UPDATE guarantees that if two
    //    transactions race, the second one blocks here until the first commits.
    const [action] = await tx
      .select()
      .from(responseActions)
      .where(eq(responseActions.actionId, req.actionId))
      .limit(1);

    if (!action) {
      return { success: false, error: `Action ${req.actionId} not found` };
    }

    // 2. Check all invariants (pure logic, but on fresh data from inside the tx)
    const invariantCheck = checkInvariants(action, req.targetState, req.reason);
    if (!invariantCheck.valid) {
      return {
        success: false,
        error: invariantCheck.violation,
        invariantViolation: invariantCheck.violation,
        fromState: action.state,
        toState: req.targetState,
      };
    }

    // 3. Build update payload
    const fromState = action.state;
    const now = new Date();
    const updatePayload: Record<string, unknown> = { state: req.targetState };

    switch (req.targetState) {
      case "approved":
        updatePayload.approvedBy = req.performedBy;
        updatePayload.approvedAt = now;
        updatePayload.decidedBy = req.performedBy;
        updatePayload.decidedAt = now;
        break;
      case "rejected":
        updatePayload.decidedBy = req.performedBy;
        updatePayload.decidedAt = now;
        updatePayload.decisionReason = req.reason ?? null;
        break;
      case "executed":
        updatePayload.executedBy = req.performedBy;
        updatePayload.executedAt = now;
        // Audit #48: Merge execution result metadata into the atomic UPDATE
        // so executionResult/executionSuccess are written in the same transaction
        // as the state transition — no orphaned "executed" rows without results.
        if (req.metadata?.executionResult !== undefined) {
          updatePayload.executionResult = req.metadata.executionResult as string;
        }
        if (req.metadata?.executionSuccess !== undefined) {
          updatePayload.executionSuccess = req.metadata.executionSuccess ? 1 : 0;
        }
        break;
      case "deferred":
        updatePayload.decidedBy = req.performedBy;
        updatePayload.decidedAt = now;
        updatePayload.decisionReason = req.reason ?? null;
        break;
      case "proposed":
        // Re-propose from deferred — clear previous decision
        updatePayload.decidedBy = null;
        updatePayload.decidedAt = null;
        updatePayload.decisionReason = null;
        break;
    }

    // 4. Apply transition with OPTIMISTIC CONCURRENCY GUARD.
    //    WHERE state = fromState ensures that if another transaction committed
    //    a state change between our read and this write, we get affectedRows=0
    //    instead of silently stomping. InnoDB's row-level lock on UPDATE means
    //    the second transaction blocks until the first commits, then the WHERE
    //    clause evaluates against the committed state.
    const updateResult = await tx
      .update(responseActions)
      .set(updatePayload as Partial<typeof responseActions.$inferInsert>)
      .where(
        and(
          eq(responseActions.id, action.id),
          eq(responseActions.state, fromState),
        )
      );

    // Check affectedRows — 0 means someone else changed the state first.
    // drizzle-orm/mysql2 returns [ResultSetHeader, FieldPacket[]] from mysql2.
    // ResultSetHeader.affectedRows tells us if the WHERE guard matched.
    const affectedRows = (updateResult as unknown as [{ affectedRows: number }])?.[0]?.affectedRows ?? 0;

    if (affectedRows === 0) {
      // Lost the race — another transaction committed a different transition.
      // Return a clean conflict error; the caller can re-fetch and retry.
      //
      // UI CONTRACT: The error string starts with "Conflict:" so the frontend
      // can distinguish race-lost errors from other failures and show a
      // "refresh and retry" prompt instead of a generic error toast.
      // If you change this prefix, update the UI error handler too.
      return {
        success: false,
        error: `Conflict: action ${req.actionId} state changed concurrently (expected "${fromState}"). Refresh and retry.`,
        fromState,
        toState: req.targetState,
      };
    }

    // 5. Write audit row (ALWAYS, only on successful transition)
    await logAudit(tx, {
      actionDbId: action.id,
      actionIdStr: action.actionId,
      fromState,
      toState: req.targetState,
      performedBy: req.performedBy,
      reason: req.reason,
      metadata: req.metadata,
    });

    // 6. Recompute case summary (unless caller will do it in batch)
    if (action.caseId && !req.skipCaseSync) {
      await syncCaseSummaryAtomic(tx as DbLike, action.caseId);
    }

    // 7. Return updated action (read inside tx for consistency)
    const [updated] = await tx
      .select()
      .from(responseActions)
      .where(eq(responseActions.id, action.id))
      .limit(1);

    return {
      success: true,
      action: updated,
      fromState,
      toState: req.targetState,
    };
  });
}

// ── Case Summary Recompute ──────────────────────────────────────────────────

/**
 * Recomputes pendingActionCount, approvalRequiredCount, and actionSummary
 * from the response_actions table — the SINGLE source of truth.
 *
 * This function is called after every state transition to keep
 * living_case_state and LivingCaseObject.actionSummary in sync.
 *
 * This eliminates the "denormalized counter drift" problem where
 * snapshot-based counters set at hypothesis time go stale after
 * approve/reject/defer/execute transitions.
 */
export interface CaseSummary {
  total: number;
  proposed: number;
  approved: number;
  rejected: number;
  executed: number;
  deferred: number;
}

/**
 * Count actions by state for a case. Accepts a db/tx handle so it can
 * run inside the caller's transaction.
 */
export async function recomputeCaseSummary(caseId: number, tx?: DbLike): Promise<CaseSummary | null> {
  const db = tx ?? await getDb();
  if (!db) return null;

  // Count actions by state for this case — derived from response_actions, not snapshots
  const rows = await db
    .select({
      state: responseActions.state,
      count: sql<number>`COUNT(*)`.as("count"),
    })
    .from(responseActions)
    .where(eq(responseActions.caseId, caseId))
    .groupBy(responseActions.state);

  const summary: CaseSummary = {
    total: 0,
    proposed: 0,
    approved: 0,
    rejected: 0,
    executed: 0,
    deferred: 0,
  };

  for (const row of rows) {
    const count = Number(row.count);
    summary.total += count;
    if (row.state in summary) {
      (summary as unknown as Record<string, number>)[row.state] = count;
    }
  }

  return summary;
}

/**
 * Atomic case summary sync — runs inside the caller's transaction.
 * Recomputes counters from response_actions and writes living_case_state
 * in ONE UPDATE (not two), ensuring counters and caseData.actionSummary
 * are always coherent.
 */
async function syncCaseSummaryAtomic(tx: DbLike, caseId: number): Promise<void> {
  if (!caseId) return;

  const summary = await recomputeCaseSummary(caseId, tx);
  if (!summary) return;

  const [caseRow] = await tx
    .select()
    .from(livingCaseState)
    .where(eq(livingCaseState.id, caseId))
    .limit(1)
    .for("update");

  if (!caseRow) return;

  const approvalRequired = await getApprovalRequiredCount(tx, caseId);

  // Merge caseData.actionSummary update into the same write as the counter update.
  // This was previously two separate UPDATEs — a drift window between them.
  const caseData = (caseRow.caseData ?? {}) as LivingCaseObject & { actionSummary?: CaseSummary };
  caseData.actionSummary = summary;

  // Refresh denormalized workingTheory/theoryConfidence from caseData
  // so they stay in sync with the canonical JSON blob after every state transition.
  const refreshedTheory = caseData.workingTheory?.statement ?? caseRow.workingTheory;
  const refreshedConfidence = caseData.workingTheory?.confidence ?? caseRow.theoryConfidence;

  await tx
    .update(livingCaseState)
    .set({
      pendingActionCount: summary.proposed,
      approvalRequiredCount: approvalRequired,
      caseData,
      workingTheory: refreshedTheory,
      theoryConfidence: refreshedConfidence,
    })
    .where(eq(livingCaseState.id, caseId));
}

/**
 * Public entry point for case summary sync — used by external callers
 * (e.g. bulkApprove after its batch loop). Gets its own db handle if
 * no transaction is provided.
 *
 * For single transitions, prefer letting transitionActionState() handle
 * the sync inside its transaction.
 */
export async function syncCaseSummaryAfterTransition(caseId: number): Promise<void> {
  const db = await getDb();
  if (!db || !caseId) return;

  // Wrap in its own transaction so the recompute + write are atomic
  await db.transaction(async (tx) => {
    await syncCaseSummaryAtomic(tx as DbLike, caseId);
  });
}

/**
 * Count actions that require approval and are still in proposed state.
 * Derived from response_actions, not from snapshot.
 */
async function getApprovalRequiredCount(
  db: DbLike,
  caseId: number
): Promise<number> {
  const [result] = await db
    .select({
      count: sql<number>`COUNT(*)`.as("count"),
    })
    .from(responseActions)
    .where(
      sql`${responseActions.caseId} = ${caseId} AND ${responseActions.requiresApproval} = 1 AND ${responseActions.state} = 'proposed'`
    );

  return Number(result?.count ?? 0);
}

// ── Convenience Wrappers ────────────────────────────────────────────────────

export async function approveAction(actionId: string, userId: number, reason?: string) {
  return transitionActionState({
    actionId,
    targetState: "approved",
    performedBy: `user:${userId}`,
    reason,
  });
}

export async function rejectAction(actionId: string, userId: number, reason: string) {
  return transitionActionState({
    actionId,
    targetState: "rejected",
    performedBy: `user:${userId}`,
    reason,
  });
}

export async function executeAction(actionId: string, userId: number, metadata?: Record<string, unknown>) {
  return transitionActionState({
    actionId,
    targetState: "executed",
    performedBy: `user:${userId}`,
    metadata,
  });
}

export async function deferAction(actionId: string, userId: number, reason: string) {
  return transitionActionState({
    actionId,
    targetState: "deferred",
    performedBy: `user:${userId}`,
    reason,
  });
}

export async function reproposeAction(actionId: string, userId: number, reason?: string) {
  return transitionActionState({
    actionId,
    targetState: "proposed",
    performedBy: `user:${userId}`,
    reason: reason ?? "Re-proposed from deferred",
  });
}
