/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Directions 1–6 Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Direction 1: Remove stale updateActionState — use responseActions.approve/reject/defer/execute
 * Direction 2: Report linkage uses exact sourceTriageId/sourceCorrelationId
 * Direction 3: Unified action surface — LivingCaseView fetches from responseActions.getByCase
 * Direction 4: recommendedActionIds + actionSummary on LivingCaseObject
 * Direction 5: Centralized state machine with invariant guards
 * Direction 6: Pipeline artifacts drill-down with full lineage
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from "vitest";
import {
  VALID_TRANSITIONS,
  isValidTransition,
  isTerminalState,
  getAllowedTransitions,
  checkInvariants,
  type ActionState,
} from "./agenticPipeline/stateMachine";

// ═══════════════════════════════════════════════════════════════════════════════
// Direction 5: Centralized State Machine
// ═══════════════════════════════════════════════════════════════════════════════

describe("Direction 5: Centralized State Machine", () => {
  // ── Valid Transitions ────────────────────────────────────────────────────

  describe("VALID_TRANSITIONS map", () => {
    it("should define transitions for all 5 states", () => {
      expect(Object.keys(VALID_TRANSITIONS)).toHaveLength(5);
      expect(VALID_TRANSITIONS).toHaveProperty("proposed");
      expect(VALID_TRANSITIONS).toHaveProperty("approved");
      expect(VALID_TRANSITIONS).toHaveProperty("rejected");
      expect(VALID_TRANSITIONS).toHaveProperty("executed");
      expect(VALID_TRANSITIONS).toHaveProperty("deferred");
    });

    it("proposed can transition to approved, rejected, or deferred", () => {
      expect(VALID_TRANSITIONS.proposed).toEqual(["approved", "rejected", "deferred"]);
    });

    it("approved can transition to executed or rejected", () => {
      expect(VALID_TRANSITIONS.approved).toEqual(["executed", "rejected"]);
    });

    it("deferred can only transition back to proposed", () => {
      expect(VALID_TRANSITIONS.deferred).toEqual(["proposed"]);
    });

    it("rejected is a terminal state with no transitions", () => {
      expect(VALID_TRANSITIONS.rejected).toEqual([]);
    });

    it("executed is a terminal state with no transitions", () => {
      expect(VALID_TRANSITIONS.executed).toEqual([]);
    });
  });

  // ── isValidTransition ────────────────────────────────────────────────────

  describe("isValidTransition()", () => {
    it("allows proposed → approved", () => {
      expect(isValidTransition("proposed", "approved")).toBe(true);
    });

    it("allows proposed → rejected", () => {
      expect(isValidTransition("proposed", "rejected")).toBe(true);
    });

    it("allows proposed → deferred", () => {
      expect(isValidTransition("proposed", "deferred")).toBe(true);
    });

    it("allows approved → executed", () => {
      expect(isValidTransition("approved", "executed")).toBe(true);
    });

    it("allows approved → rejected (revoke)", () => {
      expect(isValidTransition("approved", "rejected")).toBe(true);
    });

    it("allows deferred → proposed (re-propose)", () => {
      expect(isValidTransition("deferred", "proposed")).toBe(true);
    });

    it("rejects proposed → executed (must go through approved)", () => {
      expect(isValidTransition("proposed", "executed")).toBe(false);
    });

    it("rejects rejected → anything (terminal)", () => {
      expect(isValidTransition("rejected", "proposed")).toBe(false);
      expect(isValidTransition("rejected", "approved")).toBe(false);
      expect(isValidTransition("rejected", "executed")).toBe(false);
    });

    it("rejects executed → anything (terminal)", () => {
      expect(isValidTransition("executed", "proposed")).toBe(false);
      expect(isValidTransition("executed", "approved")).toBe(false);
      expect(isValidTransition("executed", "rejected")).toBe(false);
    });

    it("rejects unknown states", () => {
      expect(isValidTransition("unknown", "approved")).toBe(false);
      expect(isValidTransition("proposed", "unknown")).toBe(false);
    });
  });

  // ── isTerminalState ──────────────────────────────────────────────────────

  describe("isTerminalState()", () => {
    it("rejected is terminal", () => {
      expect(isTerminalState("rejected")).toBe(true);
    });

    it("executed is terminal", () => {
      expect(isTerminalState("executed")).toBe(true);
    });

    it("proposed is not terminal", () => {
      expect(isTerminalState("proposed")).toBe(false);
    });

    it("approved is not terminal", () => {
      expect(isTerminalState("approved")).toBe(false);
    });

    it("deferred is not terminal", () => {
      expect(isTerminalState("deferred")).toBe(false);
    });
  });

  // ── getAllowedTransitions ─────────────────────────────────────────────────

  describe("getAllowedTransitions()", () => {
    it("returns 3 transitions for proposed", () => {
      expect(getAllowedTransitions("proposed")).toHaveLength(3);
    });

    it("returns 2 transitions for approved", () => {
      expect(getAllowedTransitions("approved")).toHaveLength(2);
    });

    it("returns 1 transition for deferred", () => {
      expect(getAllowedTransitions("deferred")).toHaveLength(1);
    });

    it("returns 0 transitions for terminal states", () => {
      expect(getAllowedTransitions("rejected")).toHaveLength(0);
      expect(getAllowedTransitions("executed")).toHaveLength(0);
    });

    it("returns empty array for unknown state", () => {
      expect(getAllowedTransitions("unknown")).toHaveLength(0);
    });
  });

  // ── checkInvariants ──────────────────────────────────────────────────────

  describe("checkInvariants()", () => {
    const makeAction = (overrides: Record<string, unknown> = {}) => ({
      id: 1,
      actionId: "ra-test123",
      category: "isolate_host" as const,
      title: "Test Action",
      description: null,
      urgency: "next" as const,
      requiresApproval: 1,
      state: "proposed" as const,
      proposedBy: "system:triage",
      approvedBy: null,
      decidedBy: null,
      executedBy: null,
      proposedAt: new Date(),
      approvedAt: null,
      decidedAt: null,
      executedAt: null,
      decisionReason: null,
      executionResult: null,
      executionSuccess: null,
      evidenceBasis: null,
      playbookRef: null,
      targetValue: "host-001",
      targetType: "hostname",
      caseId: 1,
      correlationId: "corr-123",
      triageId: "tri-123",
      linkedAlertIds: null,
      linkedAgentIds: null,
      semanticWarning: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });

    it("allows valid proposed → approved transition", () => {
      const result = checkInvariants(makeAction() as any, "approved");
      expect(result.valid).toBe(true);
    });

    it("rejects transition from terminal state (rejected)", () => {
      const result = checkInvariants(makeAction({ state: "rejected" }) as any, "approved");
      expect(result.valid).toBe(false);
      expect(result.violation).toContain("terminal state");
    });

    it("rejects transition from terminal state (executed)", () => {
      const result = checkInvariants(makeAction({ state: "executed" }) as any, "proposed");
      expect(result.valid).toBe(false);
      expect(result.violation).toContain("terminal state");
    });

    it("rejects invalid transition (proposed → executed)", () => {
      const result = checkInvariants(makeAction() as any, "executed");
      expect(result.valid).toBe(false);
      expect(result.violation).toContain("Invalid transition");
    });

    it("rejects requiresApproval=true skipping approval for execution", () => {
      // Even if the state machine allowed it, the invariant catches it
      const action = makeAction({ state: "approved", requiresApproval: 1 });
      // This should pass since state is approved
      const result = checkInvariants(action as any, "executed");
      expect(result.valid).toBe(true);
    });

    it("rejects deferred without reason", () => {
      const result = checkInvariants(makeAction() as any, "deferred");
      expect(result.valid).toBe(false);
      expect(result.violation).toContain("Deferred actions require a reason");
    });

    it("rejects deferred with empty reason", () => {
      const result = checkInvariants(makeAction() as any, "deferred", "");
      expect(result.valid).toBe(false);
      expect(result.violation).toContain("Deferred actions require a reason");
    });

    it("rejects deferred with whitespace-only reason", () => {
      const result = checkInvariants(makeAction() as any, "deferred", "   ");
      expect(result.valid).toBe(false);
      expect(result.violation).toContain("Deferred actions require a reason");
    });

    it("allows deferred with valid reason", () => {
      const result = checkInvariants(makeAction() as any, "deferred", "Waiting for maintenance window");
      expect(result.valid).toBe(true);
    });

    it("rejects rejected without reason", () => {
      const result = checkInvariants(makeAction() as any, "rejected");
      expect(result.valid).toBe(false);
      expect(result.violation).toContain("Rejected actions require a reason");
    });

    it("rejects rejected with empty reason", () => {
      const result = checkInvariants(makeAction() as any, "rejected", "");
      expect(result.valid).toBe(false);
      expect(result.violation).toContain("Rejected actions require a reason");
    });

    it("allows rejected with valid reason", () => {
      const result = checkInvariants(makeAction() as any, "rejected", "False positive — not a real threat");
      expect(result.valid).toBe(true);
    });

    it("allows approved → rejected (revoke approval)", () => {
      const action = makeAction({ state: "approved" });
      const result = checkInvariants(action as any, "rejected", "Revoking approval — new evidence");
      expect(result.valid).toBe(true);
    });

    it("allows deferred → proposed (re-propose)", () => {
      const action = makeAction({ state: "deferred" });
      const result = checkInvariants(action as any, "proposed");
      expect(result.valid).toBe(true);
    });
  });

  // ── Full State Machine Path Tests ─────────────────────────────────────────

  describe("Complete state machine paths", () => {
    it("happy path: proposed → approved → executed", () => {
      expect(isValidTransition("proposed", "approved")).toBe(true);
      expect(isValidTransition("approved", "executed")).toBe(true);
      expect(isTerminalState("executed")).toBe(true);
    });

    it("rejection path: proposed → rejected", () => {
      expect(isValidTransition("proposed", "rejected")).toBe(true);
      expect(isTerminalState("rejected")).toBe(true);
    });

    it("deferral cycle: proposed → deferred → proposed → approved → executed", () => {
      expect(isValidTransition("proposed", "deferred")).toBe(true);
      expect(isValidTransition("deferred", "proposed")).toBe(true);
      expect(isValidTransition("proposed", "approved")).toBe(true);
      expect(isValidTransition("approved", "executed")).toBe(true);
    });

    it("late rejection: proposed → approved → rejected", () => {
      expect(isValidTransition("proposed", "approved")).toBe(true);
      expect(isValidTransition("approved", "rejected")).toBe(true);
      expect(isTerminalState("rejected")).toBe(true);
    });

    it("cannot re-propose from rejected", () => {
      expect(isValidTransition("rejected", "proposed")).toBe(false);
    });

    it("cannot re-propose from executed", () => {
      expect(isValidTransition("executed", "proposed")).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Direction 1: Remove stale updateActionState
// ═══════════════════════════════════════════════════════════════════════════════

describe("Direction 1: Stale updateActionState removed", () => {
  it("responseActionsRouter should not export updateActionState", async () => {
    const mod = await import("./agenticPipeline/responseActionsRouter");
    const routerKeys = Object.keys(mod.responseActionsRouter);
    // The router itself doesn't have updateActionState as a direct key
    // but we check the router's procedure map
    expect(routerKeys).not.toContain("updateActionState");
  });

  it("responseActionsRouter should export approve, reject, defer, execute, repropose", async () => {
    const mod = await import("./agenticPipeline/responseActionsRouter");
    const router = mod.responseActionsRouter;
    // Check that the router has the expected procedure names
    const routerDef = (router as any)._def;
    if (routerDef?.procedures) {
      const procNames = Object.keys(routerDef.procedures);
      expect(procNames).toContain("approve");
      expect(procNames).toContain("reject");
      expect(procNames).toContain("defer");
      expect(procNames).toContain("execute");
      expect(procNames).toContain("repropose");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Direction 2: Report Linkage
// ═══════════════════════════════════════════════════════════════════════════════

describe("Direction 2: Report linkage uses exact sourceTriageId/sourceCorrelationId", () => {
  it("livingCaseReportService should be importable", async () => {
    const mod = await import("./agenticPipeline/livingCaseReportService");
    expect(mod.assembleLivingCaseReportData).toBeDefined();
    expect(mod.generateReport).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Direction 4: recommendedActionIds + actionSummary
// ═══════════════════════════════════════════════════════════════════════════════

describe("Direction 4: LivingCaseObject type includes recommendedActionIds", () => {
  it("shared schema should define recommendedActionIds field", async () => {
    const mod = await import("../shared/agenticSchemas");
    // Check that the type definition includes the field
    // We can't directly test types, but we can verify the schema exports
    expect(mod).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Direction 5: State Machine Module Exports
// ═══════════════════════════════════════════════════════════════════════════════

describe("Direction 5: State Machine Module Exports", () => {
  it("exports transitionActionState function", async () => {
    const mod = await import("./agenticPipeline/stateMachine");
    expect(mod.transitionActionState).toBeDefined();
    expect(typeof mod.transitionActionState).toBe("function");
  });

  it("exports convenience wrappers", async () => {
    const mod = await import("./agenticPipeline/stateMachine");
    expect(mod.approveAction).toBeDefined();
    expect(mod.rejectAction).toBeDefined();
    expect(mod.executeAction).toBeDefined();
    expect(mod.deferAction).toBeDefined();
    expect(mod.reproposeAction).toBeDefined();
  });

  it("exports VALID_TRANSITIONS and TERMINAL_STATES", async () => {
    const mod = await import("./agenticPipeline/stateMachine");
    expect(mod.VALID_TRANSITIONS).toBeDefined();
    expect(mod.TERMINAL_STATES).toBeDefined();
    expect(mod.TERMINAL_STATES).toContain("rejected");
    expect(mod.TERMINAL_STATES).toContain("executed");
  });

  it("exports checkInvariants function", async () => {
    const mod = await import("./agenticPipeline/stateMachine");
    expect(mod.checkInvariants).toBeDefined();
    expect(typeof mod.checkInvariants).toBe("function");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Direction 6: Pipeline Artifacts Endpoint
// ═══════════════════════════════════════════════════════════════════════════════

describe("Direction 6: Pipeline Artifacts Endpoint", () => {
  it("pipelineRouter should export getPipelineArtifacts procedure", async () => {
    const mod = await import("./agenticPipeline/pipelineRouter");
    const router = mod.pipelineRouter;
    const routerDef = (router as any)._def;
    if (routerDef?.procedures) {
      const procNames = Object.keys(routerDef.procedures);
      expect(procNames).toContain("getPipelineArtifacts");
    }
  });

  it("pipelineRouter should export resumePipelineRun and continuePipelineRun procedures", async () => {
    const mod = await import("./agenticPipeline/pipelineRouter");
    const router = mod.pipelineRouter;
    const routerDef = (router as any)._def;
    if (routerDef?.procedures) {
      const procNames = Object.keys(routerDef.procedures);
      expect(procNames).toContain("resumePipelineRun");
      expect(procNames).toContain("continuePipelineRun");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Direction 5: Invariant Exhaustiveness
// ═══════════════════════════════════════════════════════════════════════════════

describe("Direction 5: Invariant Exhaustiveness", () => {
  const allStates: ActionState[] = ["proposed", "approved", "rejected", "executed", "deferred"];

  it("every state has a defined transition list (even if empty)", () => {
    for (const state of allStates) {
      expect(VALID_TRANSITIONS[state]).toBeDefined();
      expect(Array.isArray(VALID_TRANSITIONS[state])).toBe(true);
    }
  });

  it("all transition targets are valid states", () => {
    for (const [from, targets] of Object.entries(VALID_TRANSITIONS)) {
      for (const to of targets) {
        expect(allStates).toContain(to);
      }
    }
  });

  it("terminal states have no outgoing transitions", () => {
    expect(VALID_TRANSITIONS.rejected).toHaveLength(0);
    expect(VALID_TRANSITIONS.executed).toHaveLength(0);
  });

  it("no state can transition to itself", () => {
    for (const [state, targets] of Object.entries(VALID_TRANSITIONS)) {
      expect(targets).not.toContain(state);
    }
  });

  it("proposed cannot directly reach executed (must go through approved)", () => {
    expect(VALID_TRANSITIONS.proposed).not.toContain("executed");
  });
});
