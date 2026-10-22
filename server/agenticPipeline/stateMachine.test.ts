/**
 * State Machine Integration Tests
 *
 * Tests the response action state machine invariants:
 *   - Valid transition graph (proposed→approved→acknowledged, proposed→rejected, etc.)
 *   - Terminal state enforcement (rejected/acknowledged cannot transition)
 *   - requiresApproval gate (cannot skip proposed→approved→acknowledged)
 *   - Reason requirements for reject/defer
 *   - Audit trail creation on every transition
 *   - Case summary recomputation after transitions
 *
 * What is real:
 *   - The state machine logic (isValidTransition, getAllowedTransitions, isTerminalState)
 *   - The database (real MySQL via DATABASE_URL)
 *   - Audit row creation
 *   - Case summary recomputation
 *
 * What is mocked:
 *   - Nothing for pure function tests
 *   - LLM (for DB-dependent tests that need a case + action setup)
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  isValidTransition,
  isTerminalState,
  getAllowedTransitions,
  VALID_TRANSITIONS,
  TERMINAL_STATES,
  type ActionState,
} from "./stateMachine";

// ═══════════════════════════════════════════════════════════════════════════════
// PURE FUNCTION TESTS — No DB required
// ═══════════════════════════════════════════════════════════════════════════════

describe("State Machine — Pure Functions", () => {
  describe("isValidTransition", () => {
    it("allows proposed → approved", () => {
      expect(isValidTransition("proposed", "approved")).toBe(true);
    });

    it("allows proposed → rejected", () => {
      expect(isValidTransition("proposed", "rejected")).toBe(true);
    });

    it("allows proposed → deferred", () => {
      expect(isValidTransition("proposed", "deferred")).toBe(true);
    });

    it("allows approved → acknowledged", () => {
      expect(isValidTransition("approved", "acknowledged")).toBe(true);
    });

    it("allows approved → rejected (revoke approval)", () => {
      expect(isValidTransition("approved", "rejected")).toBe(true);
    });

    it("allows deferred → proposed (re-propose)", () => {
      expect(isValidTransition("deferred", "proposed")).toBe(true);
    });

    it("blocks proposed → acknowledged (must go through approved)", () => {
      expect(isValidTransition("proposed", "acknowledged")).toBe(false);
    });

    it("blocks rejected → anything (terminal)", () => {
      expect(isValidTransition("rejected", "proposed")).toBe(false);
      expect(isValidTransition("rejected", "approved")).toBe(false);
      expect(isValidTransition("rejected", "acknowledged")).toBe(false);
      expect(isValidTransition("rejected", "deferred")).toBe(false);
    });

    it("blocks acknowledged → anything (terminal)", () => {
      expect(isValidTransition("acknowledged", "proposed")).toBe(false);
      expect(isValidTransition("acknowledged", "approved")).toBe(false);
      expect(isValidTransition("acknowledged", "rejected")).toBe(false);
      expect(isValidTransition("acknowledged", "deferred")).toBe(false);
    });

    it("blocks deferred → approved (must re-propose first)", () => {
      expect(isValidTransition("deferred", "approved")).toBe(false);
    });

    it("blocks deferred → acknowledged (must re-propose first)", () => {
      expect(isValidTransition("deferred", "acknowledged")).toBe(false);
    });

    it("handles unknown states gracefully", () => {
      expect(isValidTransition("unknown", "proposed")).toBe(false);
      expect(isValidTransition("proposed", "unknown")).toBe(false);
      expect(isValidTransition("", "")).toBe(false);
    });
  });

  describe("isTerminalState", () => {
    it("identifies rejected as terminal", () => {
      expect(isTerminalState("rejected")).toBe(true);
    });

    it("identifies acknowledged as terminal", () => {
      expect(isTerminalState("acknowledged")).toBe(true);
    });

    it("identifies proposed as non-terminal", () => {
      expect(isTerminalState("proposed")).toBe(false);
    });

    it("identifies approved as non-terminal", () => {
      expect(isTerminalState("approved")).toBe(false);
    });

    it("identifies deferred as non-terminal", () => {
      expect(isTerminalState("deferred")).toBe(false);
    });

    it("handles unknown states as non-terminal", () => {
      expect(isTerminalState("unknown")).toBe(false);
      expect(isTerminalState("")).toBe(false);
    });
  });

  describe("getAllowedTransitions", () => {
    it("returns [approved, rejected, deferred] for proposed", () => {
      const allowed = getAllowedTransitions("proposed");
      expect(allowed).toContain("approved");
      expect(allowed).toContain("rejected");
      expect(allowed).toContain("deferred");
      expect(allowed).toHaveLength(3);
    });

    it("returns [acknowledged, rejected] for approved", () => {
      const allowed = getAllowedTransitions("approved");
      expect(allowed).toContain("acknowledged");
      expect(allowed).toContain("rejected");
      expect(allowed).toHaveLength(2);
    });

    it("returns [proposed] for deferred", () => {
      const allowed = getAllowedTransitions("deferred");
      expect(allowed).toEqual(["proposed"]);
    });

    it("returns empty array for rejected (terminal)", () => {
      expect(getAllowedTransitions("rejected")).toEqual([]);
    });

    it("returns empty array for acknowledged (terminal)", () => {
      expect(getAllowedTransitions("acknowledged")).toEqual([]);
    });

    it("returns empty array for unknown states", () => {
      expect(getAllowedTransitions("unknown")).toEqual([]);
    });
  });

  describe("VALID_TRANSITIONS constant", () => {
    it("has entries for all five states", () => {
      const states: ActionState[] = ["proposed", "approved", "rejected", "acknowledged", "deferred"];
      for (const state of states) {
        expect(VALID_TRANSITIONS).toHaveProperty(state);
        expect(Array.isArray(VALID_TRANSITIONS[state])).toBe(true);
      }
    });

    it("terminal states have empty transition arrays", () => {
      for (const state of TERMINAL_STATES) {
        expect(VALID_TRANSITIONS[state]).toEqual([]);
      }
    });

    it("all target states in transitions are valid ActionStates", () => {
      const allStates = new Set(Object.keys(VALID_TRANSITIONS));
      for (const [, targets] of Object.entries(VALID_TRANSITIONS)) {
        for (const target of targets) {
          expect(allStates.has(target)).toBe(true);
        }
      }
    });
  });

  describe("Full lifecycle paths", () => {
    it("supports happy path: proposed → approved → acknowledged", () => {
      expect(isValidTransition("proposed", "approved")).toBe(true);
      expect(isValidTransition("approved", "acknowledged")).toBe(true);
      expect(isTerminalState("acknowledged")).toBe(true);
    });

    it("supports rejection path: proposed → rejected", () => {
      expect(isValidTransition("proposed", "rejected")).toBe(true);
      expect(isTerminalState("rejected")).toBe(true);
    });

    it("supports defer-repropose path: proposed → deferred → proposed → approved → acknowledged", () => {
      expect(isValidTransition("proposed", "deferred")).toBe(true);
      expect(isValidTransition("deferred", "proposed")).toBe(true);
      expect(isValidTransition("proposed", "approved")).toBe(true);
      expect(isValidTransition("approved", "acknowledged")).toBe(true);
    });

    it("supports late rejection: proposed → approved → rejected", () => {
      expect(isValidTransition("proposed", "approved")).toBe(true);
      expect(isValidTransition("approved", "rejected")).toBe(true);
      expect(isTerminalState("rejected")).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DB-DEPENDENT TESTS — transitionActionState with real DB
// ═══════════════════════════════════════════════════════════════════════════════

const HAS_DB = !!process.env.DATABASE_URL;

describe("transitionActionState (real DB)", () => {
  let testActionId: string;
  let testCaseId: number;

  // Fixture rows are created directly (not via runHypothesisAgent): this suite
  // exercises the state machine, and the materialization path is covered (and
  // currently it.todo — see hypothesisAgent.test.ts MATERIALIZATION_BUG) elsewhere.
  async function insertProposedAction(caseId: number, title: string): Promise<string> {
    const { getDb } = await import("../db");
    const { responseActions } = await import("../../drizzle/schema");
    const db = (await getDb())!;
    const actionId = `ra-smtest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(responseActions).values({
      actionId,
      category: "block_ioc",
      title,
      urgency: "immediate",
      requiresApproval: 1, // C10: every model-proposed action requires approval
      state: "proposed",
      proposedBy: "hypothesis_agent",
      caseId,
      evidenceBasis: ["Multiple failed SSH attempts from this IP"],
      targetType: "ip",
      targetValue: "10.0.0.1",
    });
    return actionId;
  }

  beforeAll(async () => {
    if (!HAS_DB) return;
    const { getDb } = await import("../db");
    const { investigationSessions, livingCaseState } = await import("../../drizzle/schema");
    const db = (await getDb())!;

    const [session] = await db.insert(investigationSessions).values({
      userId: 1, // owner column is NOT NULL (C9)
      title: `State machine test ${Date.now()}`,
      description: "State machine fixture",
      status: "active",
    }).$returningId();

    const [caseRow] = await db.insert(livingCaseState).values({
      sessionId: session.id,
      caseData: { workingTheory: { statement: "SSH brute force", confidence: 0.85 } } as any,
      workingTheory: "SSH brute force",
      theoryConfidence: 0.85,
    }).$returningId();
    testCaseId = caseRow.id;

    testActionId = await insertProposedAction(testCaseId, "Block source IP 10.0.0.1 at firewall");
  });

  it.skipIf(!HAS_DB)("transitions proposed → approved with audit trail", async () => {
    const { approveAction } = await import("./stateMachine");
    const result = await approveAction(testActionId, 1, "Approved by analyst");

    expect(result.success).toBe(true);
    expect(result.fromState).toBe("proposed");
    expect(result.toState).toBe("approved");
    expect(result.action).toBeDefined();
    expect(result.action!.state).toBe("approved");

    // Invariant 6: every transition writes an audit row
    const { getDb } = await import("../db");
    const { responseActionAudit } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const audits = await (await getDb())!.select()
      .from(responseActionAudit)
      .where(eq(responseActionAudit.actionIdStr, testActionId));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      fromState: "proposed",
      toState: "approved",
      performedBy: "user:1",
      reason: "Approved by analyst",
    });
  });

  it.skipIf(!HAS_DB)("requires approval before acknowledging and a reason to reject/defer", async () => {
    const { acknowledgeAction, rejectAction, deferAction } = await import("./stateMachine");
    const actionId = await insertProposedAction(testCaseId, "Add 10.0.0.1 to watchlist");

    const ack = await acknowledgeAction(actionId, 1, { executionOutcome: "success", executionResult: "done" });
    expect(ack.success).toBe(false);
    expect(ack.fromState).toBe("proposed");

    const rej = await rejectAction(actionId, 1, "  ");
    expect(rej.success).toBe(false);
    expect(rej.invariantViolation).toMatch(/require a reason/);

    const def = await deferAction(actionId, 1, "");
    expect(def.success).toBe(false);
    expect(def.invariantViolation).toMatch(/require a reason/);

    const rejOk = await rejectAction(actionId, 1, "False positive — internal scanner");
    expect(rejOk.success).toBe(true);
    expect(rejOk.action!.state).toBe("rejected");
    expect(rejOk.action!.decisionReason).toBe("False positive — internal scanner");
  });

  it.skipIf(!HAS_DB)("refuses to acknowledge without an outcome and a non-empty result", async () => {
    const { acknowledgeAction } = await import("./stateMachine");
    await expect(
      acknowledgeAction(testActionId, 1, { executionOutcome: "success", executionResult: "   " }),
    ).rejects.toThrow(/non-empty executionResult/);
    await expect(
      acknowledgeAction(testActionId, 1, { executionOutcome: "bogus" as any, executionResult: "done" }),
    ).rejects.toThrow(/executionOutcome/);

    // Nothing was written — still approved
    const { getDb } = await import("../db");
    const { responseActions } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await (await getDb())!.select({ state: responseActions.state })
      .from(responseActions).where(eq(responseActions.actionId, testActionId));
    expect(row.state).toBe("approved");
  });

  it.skipIf(!HAS_DB)("transitions approved → acknowledged with the analyst's attestation", async () => {
    const { acknowledgeAction } = await import("./stateMachine");
    const result = await acknowledgeAction(testActionId, 1, {
      executionOutcome: "success",
      executionResult: "Blocked 10.0.0.1 on perimeter firewall (rule 4021)",
    });

    expect(result.success).toBe(true);
    expect(result.fromState).toBe("approved");
    expect(result.toState).toBe("acknowledged");
    expect(result.action!.state).toBe("acknowledged");
    expect(result.action!.executionOutcome).toBe("success");
    expect(result.action!.executionResult).toBe("Blocked 10.0.0.1 on perimeter firewall (rule 4021)");
    expect(result.action!.executedBy).toBe("user:1");
  });

  it.skipIf(!HAS_DB)("blocks transition from terminal state (acknowledged)", async () => {
    const { approveAction } = await import("./stateMachine");
    const result = await approveAction(testActionId, 1);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it.skipIf(!HAS_DB)("recomputes case summary after transitions", async () => {
    const { recomputeCaseSummary } = await import("./stateMachine");
    const summary = await recomputeCaseSummary(testCaseId);

    expect(summary).toBeDefined();
    expect(summary!.total).toBeGreaterThanOrEqual(1);
    expect(summary!.total).toBe(2);
    expect(summary!.acknowledged).toBe(1);
    expect(summary!.rejected).toBe(1);
    // All states should be non-negative
    expect(summary!.proposed).toBeGreaterThanOrEqual(0);
    expect(summary!.approved).toBeGreaterThanOrEqual(0);
    expect(summary!.rejected).toBeGreaterThanOrEqual(0);
    expect(summary!.deferred).toBeGreaterThanOrEqual(0);
  });

  it.skipIf(!HAS_DB)("returns error for non-existent action ID", async () => {
    const { transitionActionState } = await import("./stateMachine");
    const result = await transitionActionState({
      actionId: "ra-nonexistent-000000",
      targetState: "approved",
      performedBy: "user:1",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
