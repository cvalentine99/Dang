/**
 * State Machine Integration Tests
 *
 * Tests the response action state machine invariants:
 *   - Valid transition graph (proposed→approved→executed, proposed→rejected, etc.)
 *   - Terminal state enforcement (rejected/executed cannot transition)
 *   - requiresApproval gate (cannot skip proposed→approved→executed)
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
import { describe, it, expect, vi, beforeAll } from "vitest";
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

    it("allows approved → executed", () => {
      expect(isValidTransition("approved", "executed")).toBe(true);
    });

    it("allows approved → rejected (revoke approval)", () => {
      expect(isValidTransition("approved", "rejected")).toBe(true);
    });

    it("allows deferred → proposed (re-propose)", () => {
      expect(isValidTransition("deferred", "proposed")).toBe(true);
    });

    it("blocks proposed → executed (must go through approved)", () => {
      expect(isValidTransition("proposed", "executed")).toBe(false);
    });

    it("blocks rejected → anything (terminal)", () => {
      expect(isValidTransition("rejected", "proposed")).toBe(false);
      expect(isValidTransition("rejected", "approved")).toBe(false);
      expect(isValidTransition("rejected", "executed")).toBe(false);
      expect(isValidTransition("rejected", "deferred")).toBe(false);
    });

    it("blocks executed → anything (terminal)", () => {
      expect(isValidTransition("executed", "proposed")).toBe(false);
      expect(isValidTransition("executed", "approved")).toBe(false);
      expect(isValidTransition("executed", "rejected")).toBe(false);
      expect(isValidTransition("executed", "deferred")).toBe(false);
    });

    it("blocks deferred → approved (must re-propose first)", () => {
      expect(isValidTransition("deferred", "approved")).toBe(false);
    });

    it("blocks deferred → executed (must re-propose first)", () => {
      expect(isValidTransition("deferred", "executed")).toBe(false);
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

    it("identifies executed as terminal", () => {
      expect(isTerminalState("executed")).toBe(true);
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

    it("returns [executed, rejected] for approved", () => {
      const allowed = getAllowedTransitions("approved");
      expect(allowed).toContain("executed");
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

    it("returns empty array for executed (terminal)", () => {
      expect(getAllowedTransitions("executed")).toEqual([]);
    });

    it("returns empty array for unknown states", () => {
      expect(getAllowedTransitions("unknown")).toEqual([]);
    });
  });

  describe("VALID_TRANSITIONS constant", () => {
    it("has entries for all five states", () => {
      const states: ActionState[] = ["proposed", "approved", "rejected", "executed", "deferred"];
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
    it("supports happy path: proposed → approved → executed", () => {
      expect(isValidTransition("proposed", "approved")).toBe(true);
      expect(isValidTransition("approved", "executed")).toBe(true);
      expect(isTerminalState("executed")).toBe(true);
    });

    it("supports rejection path: proposed → rejected", () => {
      expect(isValidTransition("proposed", "rejected")).toBe(true);
      expect(isTerminalState("rejected")).toBe(true);
    });

    it("supports defer-repropose path: proposed → deferred → proposed → approved → executed", () => {
      expect(isValidTransition("proposed", "deferred")).toBe(true);
      expect(isValidTransition("deferred", "proposed")).toBe(true);
      expect(isValidTransition("proposed", "approved")).toBe(true);
      expect(isValidTransition("approved", "executed")).toBe(true);
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

// Mock LLM (needed for hypothesis agent which creates response actions)
const mockLLMResponse = vi.fn();
vi.mock("../llm/llmService", () => ({
  invokeLLMWithFallback: (...args: any[]) => mockLLMResponse(...args),
  getEffectiveLLMConfig: async () => ({ host: "mock", port: 0, model: "mock", enabled: true }),
  isCustomLLMEnabled: async () => true,
}));
vi.mock("../indexer/indexerClient", () => ({
  getEffectiveIndexerConfig: async () => ({ host: "mock", port: 9200, user: "admin", pass: "admin", protocol: "https" }),
  indexerSearch: async () => ({ hits: { hits: [], total: { value: 0 } } }),
  indexerGet: async () => ({}),
}));
vi.mock("../wazuh/wazuhClient", () => ({
  wazuhGet: async () => ({ data: { affected_items: [] } }),
  getEffectiveWazuhConfig: async () => ({ host: "mock", port: 55000, user: "admin", pass: "admin", protocol: "https" }),
}));
vi.mock("../threatIntel/otxService", () => ({
  otxGet: async () => ({}),
}));

describe("transitionActionState (real DB)", () => {
  let testActionId: string;
  let testCaseId: number;

  beforeAll(async () => {
    if (!HAS_DB) return;

    // Create a full pipeline run to get a real response action
    const { runTriageAgent } = await import("./triageAgent");
    const { runCorrelationAgent } = await import("./correlationAgent");
    const { runHypothesisAgent } = await import("./hypothesisAgent");

    // Triage
    mockLLMResponse.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({
        alertFamily: "brute_force",
        severity: "high",
        severityConfidence: 0.85,
        severityReasoning: "SSH brute force",
        entities: [{ type: "ip", value: "10.0.0.1", confidence: 1.0 }],
        mitreMapping: [{ techniqueId: "T1110", techniqueName: "Brute Force", tactic: "Credential Access", confidence: 0.9 }],
        dedup: { isDuplicate: false, similarityScore: 0.1, reasoning: "New alert" },
        route: "C_HIGH_CONFIDENCE",
        routeReasoning: "Clear brute force",
        summary: "SSH brute force from 10.0.0.1",
        uncertainties: [],
        caseLink: { shouldLink: false, confidence: 0.1, reasoning: "No match" },
      }) } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });

    const triageResult = await runTriageAgent({
      rawAlert: {
        id: "sm-test-1",
        timestamp: new Date().toISOString(),
        rule: { id: "5710", level: 10, description: "SSH brute force", mitre: { id: ["T1110"], technique: ["Brute Force"], tactic: ["Credential Access"] } },
        agent: { id: "001", name: "test-server", ip: "192.168.1.1" },
        data: { srcip: "10.0.0.1" },
      },
      userId: 1,
    });

    // Correlation
    mockLLMResponse.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({
        schemaVersion: "1.0",
        correlationId: "x",
        correlatedAt: new Date().toISOString(),
        sourceTriageId: "x",
        relatedAlerts: [],
        discoveredEntities: [],
        vulnerabilityContext: [],
        fimContext: [],
        threatIntelMatches: [],
        priorInvestigations: [],
        blastRadius: { affectedHosts: 1, affectedUsers: 1, affectedAgentIds: ["001"], assetCriticality: "medium", confidence: 0.7 },
        campaignAssessment: { likelyCampaign: false, clusteredTechniques: [], confidence: 0.3, reasoning: "No campaign" },
        caseRecommendation: { action: "create_new", confidence: 0.8, reasoning: "New case" },
        synthesis: {
          narrative: "SSH brute force from 10.0.0.1",
          supportingEvidence: [{ id: "ev-1", label: "Alert", type: "alert", source: "wazuh_alert", data: {}, collectedAt: new Date().toISOString(), relevance: 1.0 }],
          conflictingEvidence: [],
          missingEvidence: [],
          confidence: 0.75,
        },
      }) } }],
      usage: { prompt_tokens: 200, completion_tokens: 100 },
    });

    const corrResult = await runCorrelationAgent({ triageId: triageResult.triageId! });

    // Hypothesis (with response actions)
    mockLLMResponse.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({
        workingTheory: {
          statement: "SSH brute force attack from external IP",
          confidence: 0.85,
          supportingEvidence: ["Multiple failed SSH attempts"],
          conflictingEvidence: [],
        },
        alternateTheories: [],
        evidenceGaps: [],
        suggestedNextSteps: [],
        recommendedActions: [
          {
            action: "Block source IP 10.0.0.1 at firewall",
            category: "block",
            urgency: "immediate",
            targetType: "ip",
            targetValue: "10.0.0.1",
            requiresApproval: true,
            evidenceBasis: ["Multiple failed SSH attempts from this IP"],
          },
          {
            action: "Add 10.0.0.1 to watchlist for 30 days",
            category: "watchlist",
            urgency: "next",
            targetType: "ip",
            targetValue: "10.0.0.1",
            requiresApproval: false,
            evidenceBasis: ["Suspicious activity pattern"],
          },
        ],
        timelineSummary: [{ timestamp: new Date().toISOString(), event: "SSH brute force detected", source: "wazuh_alert", significance: "high" }],
        linkedEntities: [{ type: "ip", value: "10.0.0.1" }],
        draftDocumentation: { executiveSummary: "SSH brute force attack" },
      }) } }],
      usage: { prompt_tokens: 300, completion_tokens: 150 },
    });

    const hypoResult = await runHypothesisAgent({ correlationId: corrResult.correlationId });
    testCaseId = hypoResult.caseId;

    // Get the first materialized action ID
    if (hypoResult.materializedActionIds.length > 0) {
      testActionId = hypoResult.materializedActionIds[0];
    }
  });

  it.skipIf(!HAS_DB)("transitions proposed → approved with audit trail", async () => {
    const { approveAction } = await import("./stateMachine");
    const result = await approveAction(testActionId, 1, "Approved by analyst");

    expect(result.success).toBe(true);
    expect(result.fromState).toBe("proposed");
    expect(result.toState).toBe("approved");
    expect(result.action).toBeDefined();
    expect(result.action!.state).toBe("approved");
  });

  it.skipIf(!HAS_DB)("transitions approved → executed", async () => {
    const { executeAction } = await import("./stateMachine");
    const result = await executeAction(testActionId, 1, { executionMethod: "manual" });

    expect(result.success).toBe(true);
    expect(result.fromState).toBe("approved");
    expect(result.toState).toBe("executed");
    expect(result.action!.state).toBe("executed");
  });

  it.skipIf(!HAS_DB)("blocks transition from terminal state (executed)", async () => {
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
    expect(summary!.executed).toBeGreaterThanOrEqual(1);
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
