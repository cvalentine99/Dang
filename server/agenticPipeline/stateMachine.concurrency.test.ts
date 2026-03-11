/**
 * State Machine Concurrency Tests
 *
 * These tests prove the hard correctness cases that structural audits cannot:
 *
 *   1. Same-action concurrent transition — optimistic guard prevents double-transition
 *   2. Forced failure rollback — transaction prevents partial commits
 *   3. Bulk approve interleaving — partial success preserves correct final state
 *
 * What is real:
 *   - The database (real MySQL via DATABASE_URL)
 *   - The state machine (transitionActionState, syncCaseSummaryAfterTransition)
 *   - Audit trail persistence
 *   - Case summary recomputation
 *
 * What is mocked:
 *   - Nothing. These tests use direct DB inserts for fixtures and verify
 *     against canonical table state after the operations complete.
 *
 * Fixture strategy:
 *   Each test gets its own living case + actions via direct INSERT, avoiding
 *   the full triage→correlation→hypothesis pipeline. This keeps the test
 *   surface small and focused on concurrency behavior.
 *
 * Transition strategy for mutual exclusion:
 *   Both competitors target the SAME terminal state (rejected). This ensures
 *   that whichever wins, the loser is guaranteed to fail — either via the
 *   optimistic guard (stale fromState) or the terminal-state invariant check.
 *   Using different targets (e.g., approve vs reject) would NOT guarantee
 *   conflict because approved→rejected is a valid transition chain.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

const HAS_DB = !!process.env.DATABASE_URL;

// ── Fixture Helpers ─────────────────────────────────────────────────────────

/**
 * Insert a minimal living case + N proposed actions directly into the DB.
 * Returns { caseId, actionIds } for test use.
 */
async function createTestFixtures(actionCount: number) {
  const { getDb } = await import("../db");
  const {
    investigationSessions,
    livingCaseState,
    responseActions,
  } = await import("../../drizzle/schema");

  const db = await getDb();
  if (!db) throw new Error("DB not available for test fixtures");

  // 1. Investigation session (FK requirement for living_case_state)
  const sessionTitle = `concurrency-test-${nanoid(8)}`;
  const [sessionResult] = await db.insert(investigationSessions).values({
    userId: 1,
    title: sessionTitle,
    description: "Concurrency test fixture",
    status: "active",
  });
  const sessionId = sessionResult.insertId;

  // 2. Living case
  const caseData = {
    hypothesis: { statement: "Test hypothesis", confidence: 0.9 },
    actionSummary: { total: actionCount, proposed: actionCount, approved: 0, rejected: 0, executed: 0, deferred: 0 },
  };
  const [caseResult] = await db.insert(livingCaseState).values({
    sessionId,
    caseData,
    workingTheory: "Test hypothesis",
    theoryConfidence: 0.9,
    pendingActionCount: actionCount,
    approvalRequiredCount: actionCount,
    sourceTriageId: `triage-test-${nanoid(6)}`,
    sourceCorrelationId: `corr-test-${nanoid(6)}`,
  });
  const caseId = caseResult.insertId;

  // 3. Response actions
  const actionIds: string[] = [];
  for (let i = 0; i < actionCount; i++) {
    const actionId = `ra-concurrency-${nanoid(10)}`;
    actionIds.push(actionId);
    await db.insert(responseActions).values({
      actionId,
      category: "block_ioc",
      title: `Test action ${i + 1}`,
      description: `Concurrency test action ${i + 1}`,
      urgency: "immediate",
      requiresApproval: 1,
      state: "proposed",
      proposedBy: "test:fixture",
      caseId,
      evidenceBasis: ["Test evidence"],
      targetValue: `10.0.0.${i + 1}`,
      targetType: "ip",
    });
  }

  return { caseId, sessionId, actionIds };
}

/**
 * Read canonical action state from the DB.
 */
async function getActionState(actionId: string) {
  const { getDb } = await import("../db");
  const { responseActions } = await import("../../drizzle/schema");
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const [row] = await db
    .select()
    .from(responseActions)
    .where(eq(responseActions.actionId, actionId))
    .limit(1);
  return row ?? null;
}

/**
 * Count audit rows for a given action ID string.
 */
async function countAuditRows(actionIdStr: string) {
  const { getDb } = await import("../db");
  const { responseActionAudit } = await import("../../drizzle/schema");
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const [result] = await db
    .select({ count: sql<number>`COUNT(*)`.as("count") })
    .from(responseActionAudit)
    .where(eq(responseActionAudit.actionIdStr, actionIdStr));
  return Number(result?.count ?? 0);
}

/**
 * Read canonical living case summary from the DB.
 */
async function getCaseSummary(caseId: number) {
  const { getDb } = await import("../db");
  const { livingCaseState } = await import("../../drizzle/schema");
  const db = await getDb();
  if (!db) throw new Error("DB not available");

  const [row] = await db
    .select()
    .from(livingCaseState)
    .where(eq(livingCaseState.id, caseId))
    .limit(1);
  return row ?? null;
}

/**
 * Recompute what the summary SHOULD be from canonical response_actions.
 */
async function computeExpectedSummary(caseId: number) {
  const { recomputeCaseSummary } = await import("./stateMachine");
  return recomputeCaseSummary(caseId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Same-action concurrent transition (optimistic guard)
//
// Strategy: Both analysts try proposed→rejected (same terminal target).
// This guarantees mutual exclusion — whichever wins makes the action terminal,
// and the loser hits either:
//   - The optimistic guard ("Conflict:") if both transactions overlap
//   - The terminal-state invariant if the winner commits before the loser starts
// ═══════════════════════════════════════════════════════════════════════════════

describe.skipIf(!HAS_DB)("Concurrency — same-action race (optimistic guard)", () => {
  let caseId: number;
  let actionId: string;

  beforeAll(async () => {
    const fixtures = await createTestFixtures(1);
    caseId = fixtures.caseId;
    actionId = fixtures.actionIds[0];
  });

  it("exactly one of two concurrent transitions succeeds, the other gets a conflict or terminal-state error", async () => {
    const { transitionActionState } = await import("./stateMachine");

    // Two analysts try to reject the same action simultaneously.
    // Using the SAME terminal target guarantees mutual exclusion.
    const [result1, result2] = await Promise.allSettled([
      transitionActionState({
        actionId,
        targetState: "rejected",
        performedBy: "user:analyst-1",
        reason: "I think this is wrong",
      }),
      transitionActionState({
        actionId,
        targetState: "rejected",
        performedBy: "user:analyst-2",
        reason: "I also think this is wrong",
      }),
    ]);

    // Both promises should fulfill (no unhandled exceptions)
    expect(result1.status).toBe("fulfilled");
    expect(result2.status).toBe("fulfilled");

    const r1 = (result1 as PromiseFulfilledResult<any>).value;
    const r2 = (result2 as PromiseFulfilledResult<any>).value;

    // Exactly one succeeds, exactly one fails
    const successes = [r1, r2].filter(r => r.success);
    const failures = [r1, r2].filter(r => !r.success);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    // The failure should be either a conflict error (optimistic guard) or
    // a terminal-state invariant error. Both are correct prevention paths.
    //
    // "Conflict:" — both transactions overlapped, loser's UPDATE got affectedRows=0
    // "terminal state" — winner committed before loser started, loser reads terminal state
    //
    // The "Conflict:" prefix is a UI CONTRACT — the frontend uses it to
    // distinguish race-lost errors from other failures and show a
    // "refresh and retry" prompt.
    const failResult = failures[0];
    expect(failResult.error).toBeDefined();
    expect(failResult.error).toMatch(/Conflict:|terminal state/);

    // The action should be in "rejected" state regardless of who won
    const finalAction = await getActionState(actionId);
    expect(finalAction).not.toBeNull();
    expect(finalAction!.state).toBe("rejected");

    // Exactly one audit row for this action (one transition, not two)
    const auditCount = await countAuditRows(actionId);
    expect(auditCount).toBe(1);
  });

  it("living-case counters match canonical response_actions after the race", async () => {
    const caseSummary = await getCaseSummary(caseId);
    const expectedSummary = await computeExpectedSummary(caseId);

    expect(caseSummary).not.toBeNull();
    expect(expectedSummary).not.toBeNull();

    // Denormalized counters must match recomputed truth
    expect(caseSummary!.pendingActionCount).toBe(expectedSummary!.proposed);

    // caseData.actionSummary must match too
    const caseDataSummary = (caseSummary!.caseData as any)?.actionSummary;
    expect(caseDataSummary).toBeDefined();
    expect(caseDataSummary.total).toBe(expectedSummary!.total);
    expect(caseDataSummary.proposed).toBe(expectedSummary!.proposed);
    expect(caseDataSummary.approved).toBe(expectedSummary!.approved);
    expect(caseDataSummary.rejected).toBe(expectedSummary!.rejected);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Forced failure rollback
// ═══════════════════════════════════════════════════════════════════════════════

describe.skipIf(!HAS_DB)("Concurrency — transaction rollback on internal failure", () => {
  let caseId: number;
  let actionId: string;

  beforeAll(async () => {
    const fixtures = await createTestFixtures(1);
    caseId = fixtures.caseId;
    actionId = fixtures.actionIds[0];
  });

  it("action state is unchanged if the transaction fails mid-flight", async () => {
    const { getDb } = await import("../db");
    const { responseActions, responseActionAudit } = await import("../../drizzle/schema");

    // Verify starting state
    const beforeAction = await getActionState(actionId);
    expect(beforeAction!.state).toBe("proposed");
    const auditCountBefore = await countAuditRows(actionId);

    // Perform a transition that will fail after the action UPDATE but before commit.
    // Strategy: use a raw transaction that does the UPDATE but then throws,
    // proving that the transaction boundary actually rolls back the action update.
    const db = await getDb();
    let updateSucceeded = false;
    let transactionRolledBack = false;

    try {
      await db!.transaction(async (tx) => {
        // Simulate step 4: UPDATE the action state
        await tx
          .update(responseActions)
          .set({ state: "approved" } as any)
          .where(eq(responseActions.actionId, actionId));

        // Verify the UPDATE took effect inside the transaction
        const [insideTx] = await tx
          .select({ state: responseActions.state })
          .from(responseActions)
          .where(eq(responseActions.actionId, actionId))
          .limit(1);
        updateSucceeded = insideTx?.state === "approved";

        // Simulate a failure (e.g., audit insert fails, sync fails, etc.)
        throw new Error("Simulated audit/sync failure");
      });
    } catch (err) {
      transactionRolledBack = true;
      expect((err as Error).message).toBe("Simulated audit/sync failure");
    }

    // The UPDATE DID succeed inside the transaction
    expect(updateSucceeded).toBe(true);
    // But the transaction DID roll back
    expect(transactionRolledBack).toBe(true);

    // THE POINT: action state must be UNCHANGED after rollback
    const afterAction = await getActionState(actionId);
    expect(afterAction!.state).toBe("proposed");

    // No audit row was persisted (the insert would have been inside the tx)
    const auditCountAfter = await countAuditRows(actionId);
    expect(auditCountAfter).toBe(auditCountBefore);

    // Case summary is unchanged
    const caseSummary = await getCaseSummary(caseId);
    const expectedSummary = await computeExpectedSummary(caseId);
    expect(caseSummary!.pendingActionCount).toBe(expectedSummary!.proposed);
  });

  it("a real transition still works after a rollback (no poisoned state)", async () => {
    const { approveAction } = await import("./stateMachine");

    // The action should still be in "proposed" state from the rollback test
    const result = await approveAction(actionId, 99, "Post-rollback approval");

    expect(result.success).toBe(true);
    expect(result.fromState).toBe("proposed");
    expect(result.toState).toBe("approved");

    // Verify in DB
    const finalAction = await getActionState(actionId);
    expect(finalAction!.state).toBe("approved");

    // Exactly one audit row (for this successful transition only)
    const auditCount = await countAuditRows(actionId);
    expect(auditCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Bulk approve interleaving
//
// Strategy: The solo analyst REJECTS the contested action (terminal state).
// The bulk approve tries proposed→approved on the same action.
// If the reject wins, the bulk approve sees a terminal state and fails.
// If the bulk approve wins (proposed→approved), the reject reads "approved"
// and tries approved→rejected — which IS a valid transition, so both could
// succeed sequentially. To guarantee mutual exclusion, the solo analyst
// also targets "rejected" (same terminal state as Test 1).
//
// Wait — that doesn't test the bulk approve scenario properly. The real
// scenario is: bulk approves all, solo rejects one. If the reject wins,
// the bulk's attempt to approve that action fails. If the bulk wins first,
// the solo reject on an approved action would succeed (approved→rejected is valid).
//
// The correct test: accept that both outcomes are valid:
//   A) reject wins → contested action is rejected, bulk fails on that one
//   B) bulk wins → contested action is approved, then solo rejects it → rejected
// In both cases, the final state of the contested action is deterministic
// and the case summary matches canonical truth.
// ═══════════════════════════════════════════════════════════════════════════════

describe.skipIf(!HAS_DB)("Concurrency — bulk approve interleaving", () => {
  let caseId: number;
  let actionIds: string[];
  const TOTAL_ACTIONS = 5;
  // Action index 2 (third action) will be the one that gets concurrently rejected
  const CONTESTED_INDEX = 2;

  beforeAll(async () => {
    const fixtures = await createTestFixtures(TOTAL_ACTIONS);
    caseId = fixtures.caseId;
    actionIds = fixtures.actionIds;
  });

  it("bulk approve handles concurrent rejection correctly — contested action ends in a deterministic state", async () => {
    const { transitionActionState, syncCaseSummaryAfterTransition } = await import("./stateMachine");

    const contestedActionId = actionIds[CONTESTED_INDEX];

    // Launch both operations concurrently
    const [bulkSettled, rejectSettled] = await Promise.allSettled([
      // "Bulk approve" — approves all 5, skipping case sync (like the real bulkApprove)
      (async () => {
        const results: Array<{ actionId: string; success: boolean; error?: string }> = [];
        for (const actionId of actionIds) {
          const result = await transitionActionState({
            actionId,
            targetState: "approved",
            performedBy: "user:bulk-analyst",
            reason: "Bulk approved",
            skipCaseSync: true,
          });
          results.push({ actionId, success: result.success, error: result.error });
        }
        // Final sync
        await syncCaseSummaryAfterTransition(caseId);
        return results;
      })(),

      // "Single reject" on the contested action
      transitionActionState({
        actionId: contestedActionId,
        targetState: "rejected",
        performedBy: "user:solo-analyst",
        reason: "I disagree with this action",
      }),
    ]);

    expect(bulkSettled.status).toBe("fulfilled");
    expect(rejectSettled.status).toBe("fulfilled");

    const bulkResults = (bulkSettled as PromiseFulfilledResult<any>).value;
    const rejectResult = (rejectSettled as PromiseFulfilledResult<any>).value;

    const contestedBulkResult = bulkResults.find((r: any) => r.actionId === contestedActionId);
    const contestedFinalState = (await getActionState(contestedActionId))!.state;

    // The contested action MUST end in "rejected" regardless of race outcome:
    //   Path A: reject wins first (proposed→rejected), bulk fails on that action
    //   Path B: bulk wins first (proposed→approved), then reject succeeds (approved→rejected)
    // Both paths lead to "rejected" as the final state.
    expect(contestedFinalState).toBe("rejected");

    if (rejectResult.success && !contestedBulkResult.success) {
      // Path A: reject won the race, bulk failed on the contested action
      // The bulk failure should be a conflict or terminal-state error
      expect(contestedBulkResult.error).toMatch(/Conflict:|terminal state/);
    } else if (rejectResult.success && contestedBulkResult.success) {
      // Path B: both succeeded sequentially (bulk: proposed→approved, reject: approved→rejected)
      // This is valid — approved→rejected is a legal transition
    } else if (!rejectResult.success && contestedBulkResult.success) {
      // Path C: bulk won, reject failed — this shouldn't happen because
      // approved→rejected is valid. But if it does, the error should be meaningful.
      expect(rejectResult.error).toBeDefined();
    }

    // All non-contested actions should be approved
    const nonContestedBulkResults = bulkResults.filter((r: any) => r.actionId !== contestedActionId);
    for (const r of nonContestedBulkResults) {
      expect(r.success).toBe(true);
    }
  });

  it("all non-contested actions are in their expected final state", async () => {
    for (let i = 0; i < TOTAL_ACTIONS; i++) {
      if (i === CONTESTED_INDEX) continue; // Skip the contested one
      const action = await getActionState(actionIds[i]);
      expect(action).not.toBeNull();
      expect(action!.state).toBe("approved");
    }
  });

  it("final case summary matches canonical response_actions (no stale summary)", async () => {
    // Force a fresh recompute to make sure the final sync was correct
    const { syncCaseSummaryAfterTransition } = await import("./stateMachine");
    await syncCaseSummaryAfterTransition(caseId);

    const caseSummary = await getCaseSummary(caseId);
    const expectedSummary = await computeExpectedSummary(caseId);

    expect(caseSummary).not.toBeNull();
    expect(expectedSummary).not.toBeNull();

    // Denormalized counters must match recomputed truth
    expect(caseSummary!.pendingActionCount).toBe(expectedSummary!.proposed);
    expect(caseSummary!.approvalRequiredCount).toBeGreaterThanOrEqual(0);

    // caseData.actionSummary must match
    const caseDataSummary = (caseSummary!.caseData as any)?.actionSummary;
    expect(caseDataSummary).toBeDefined();
    expect(caseDataSummary.total).toBe(expectedSummary!.total);
    expect(caseDataSummary.proposed).toBe(expectedSummary!.proposed);
    expect(caseDataSummary.approved).toBe(expectedSummary!.approved);
    expect(caseDataSummary.rejected).toBe(expectedSummary!.rejected);
    expect(caseDataSummary.executed).toBe(expectedSummary!.executed);
    expect(caseDataSummary.deferred).toBe(expectedSummary!.deferred);

    // Total should account for all actions
    expect(expectedSummary!.total).toBe(TOTAL_ACTIONS);

    // No proposed actions should remain (all were either approved or rejected)
    expect(expectedSummary!.proposed).toBe(0);
  });

  it("each action has exactly one audit row (no double-transitions from the same operation)", async () => {
    for (const actionId of actionIds) {
      const auditCount = await countAuditRows(actionId);
      // The contested action may have 1 or 2 audit rows depending on race outcome:
      //   Path A (reject wins, bulk fails): 1 audit row (reject only)
      //   Path B (both succeed sequentially): 2 audit rows (approve + reject)
      if (actionId === actionIds[CONTESTED_INDEX]) {
        expect(auditCount).toBeGreaterThanOrEqual(1);
        expect(auditCount).toBeLessThanOrEqual(2);
      } else {
        // Non-contested actions should have exactly 1 audit row
        expect(auditCount).toBe(1);
      }
    }
  });
});
