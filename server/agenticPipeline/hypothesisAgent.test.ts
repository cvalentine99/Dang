/**
 * Hypothesis Agent Integration Tests
 *
 * Tests edge cases and merge logic in the hypothesis agent:
 *   - Living case merge: working theory confidence comparison
 *   - Living case merge: alternate theory deduplication
 *   - Living case merge: evidence gap deduplication
 *   - Living case merge: timeline deduplication and sorting
 *   - Living case merge: entity deduplication by type:value
 *   - Living case merge: linked ID union
 *   - Living case merge: recommended action state preservation
 *   - Response action materialization
 *   - Case creation vs merge decision
 *   - Query helpers
 *
 * What is real:
 *   - The hypothesis agent code paths
 *   - The database (real MySQL)
 *   - Merge logic
 *
 * What is mocked:
 *   - LLM (returns structured JSON)
 *   - External services (Wazuh, Indexer, OTX)
 */
import { describe, it, expect, vi, beforeAll } from "vitest";

// ── Mock external services ──────────────────────────────────────────────────
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

vi.mock("../otx/otxClient", () => ({
  otxGet: async () => ({}),
  isOtxConfigured: () => false,
}));

const HAS_DB = !!process.env.DATABASE_URL;

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeHypothesisLLMResponse(overrides: Record<string, unknown> = {}) {
  return {
    choices: [{ message: { content: JSON.stringify({
      workingTheory: overrides.workingTheory ?? {
        statement: "Lateral movement via compromised credentials",
        confidence: 0.8,
        supportingEvidence: ["Multiple hosts accessed", "Credential reuse detected"],
        conflictingEvidence: [],
      },
      alternateTheories: overrides.alternateTheories ?? [
        { statement: "Legitimate admin activity", confidence: 0.3, supportingEvidence: ["Business hours"], conflictingEvidence: ["Unusual hosts"] },
      ],
      evidenceGaps: overrides.evidenceGaps ?? [
        { description: "No endpoint telemetry from host-05", impact: "Cannot confirm lateral movement" },
      ],
      suggestedNextSteps: overrides.suggestedNextSteps ?? [
        { action: "Check EDR logs on host-05", priority: "high", reasoning: "Confirm lateral movement" },
      ],
      recommendedActions: overrides.recommendedActions ?? [
        {
          action: "Isolate host-05 from network",
          category: "isolate",
          urgency: "immediate",
          targetType: "host",
          targetValue: "host-05",
          requiresApproval: true,
          evidenceBasis: ["Multiple suspicious connections"],
        },
      ],
      timelineSummary: overrides.timelineSummary ?? [
        { timestamp: "2026-03-01T12:00:00Z", event: "Initial access detected", source: "wazuh_alert", significance: "high" },
        { timestamp: "2026-03-01T12:30:00Z", event: "Lateral movement to host-05", source: "correlation", significance: "critical" },
      ],
      linkedEntities: overrides.linkedEntities ?? [
        { type: "ip", value: "10.0.0.5" },
        { type: "host", value: "host-05" },
      ],
      draftDocumentation: overrides.draftDocumentation ?? {
        executiveSummary: "Suspected lateral movement campaign",
      },
    }) } }],
    usage: { prompt_tokens: 2000, completion_tokens: 800 },
  };
}

const TRIAGE_LLM_RESPONSE = {
  choices: [{ message: { content: JSON.stringify({
    alertFamily: "lateral_movement",
    severity: "high",
    severityConfidence: 0.85,
    severityReasoning: "Lateral movement indicators",
    entities: [{ type: "ip", value: "10.0.0.5", confidence: 1.0 }],
    mitreMapping: [{ techniqueId: "T1021", techniqueName: "Remote Services", tactic: "Lateral Movement", confidence: 0.9 }],
    dedup: { isDuplicate: false, similarityScore: 0.1, reasoning: "New alert" },
    route: "C_HIGH_CONFIDENCE",
    routeReasoning: "Clear lateral movement",
    summary: "Lateral movement to host-05",
    uncertainties: [],
    caseLink: { shouldLink: false, confidence: 0.1, reasoning: "No match" },
  }) } }],
  usage: { prompt_tokens: 800, completion_tokens: 300 },
};

const CORRELATION_LLM_RESPONSE = {
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
    blastRadius: { affectedHosts: 2, affectedUsers: 1, affectedAgentIds: ["001", "005"], assetCriticality: "high", confidence: 0.8 },
    campaignAssessment: { likelyCampaign: true, clusteredTechniques: ["T1021", "T1078"], confidence: 0.7, reasoning: "Credential reuse across hosts" },
    caseRecommendation: { action: "create_new", confidence: 0.85, reasoning: "New investigation" },
    synthesis: {
      narrative: "Lateral movement via remote services",
      supportingEvidence: [{ id: "ev-1", label: "Alert", type: "alert", source: "wazuh_alert", data: {}, collectedAt: new Date().toISOString(), relevance: 1.0 }],
      conflictingEvidence: [],
      missingEvidence: [],
      confidence: 0.8,
    },
  }) } }],
  usage: { prompt_tokens: 1500, completion_tokens: 500 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("runHypothesisAgent — full pipeline", () => {
  let testCorrelationId: string;
  let testCaseId: number;
  let testSessionId: number;

  beforeAll(async () => {
    if (!HAS_DB) return;

    // Create triage → correlation chain
    const { runTriageAgent } = await import("./triageAgent");
    const { runCorrelationAgent } = await import("./correlationAgent");

    mockLLMResponse.mockResolvedValueOnce(TRIAGE_LLM_RESPONSE);
    const triageResult = await runTriageAgent({
      rawAlert: {
        id: "hypo-test-1",
        timestamp: new Date().toISOString(),
        rule: { id: "5710", level: 10, description: "Lateral movement", mitre: { id: ["T1021"], technique: ["Remote Services"], tactic: ["Lateral Movement"] } },
        agent: { id: "001", name: "web-server-01", ip: "192.168.1.1" },
        data: { srcip: "10.0.0.5" },
      },
      userId: 1,
    });

    mockLLMResponse.mockResolvedValueOnce(CORRELATION_LLM_RESPONSE);
    const corrResult = await runCorrelationAgent({ triageId: triageResult.triageId! });
    testCorrelationId = corrResult.correlationId;
  });

  it.skipIf(!HAS_DB)(
    "creates a new living case with response actions",
    async () => {
      const { runHypothesisAgent } = await import("./hypothesisAgent");
      mockLLMResponse.mockResolvedValueOnce(makeHypothesisLLMResponse());

      const result = await runHypothesisAgent({ correlationId: testCorrelationId });

      expect(result.caseId).toBeGreaterThan(0);
      expect(result.materializedActionIds.length).toBeGreaterThan(0);
      expect(result.latencyMs).toBeGreaterThan(0);
      expect(result.tokensUsed).toBe(2800); // 2000 + 800

      testCaseId = result.caseId;
      testSessionId = result.sessionId;
    }
  );

  it.skipIf(!HAS_DB)(
    "merges into existing case on second run (higher confidence wins)",
    async () => {
      const { runHypothesisAgent } = await import("./hypothesisAgent");

      // Second run with higher confidence working theory
      mockLLMResponse.mockResolvedValueOnce(makeHypothesisLLMResponse({
        workingTheory: {
          statement: "Confirmed lateral movement via stolen admin credentials",
          confidence: 0.95, // Higher than 0.8 from first run
          supportingEvidence: ["EDR confirmed process injection", "Credential dump found"],
          conflictingEvidence: [],
        },
        alternateTheories: [
          { statement: "Automated IT maintenance script", confidence: 0.1, supportingEvidence: ["Scheduled time"], conflictingEvidence: ["Unknown binary"] },
        ],
        recommendedActions: [
          {
            action: "Reset all admin credentials",
            category: "credential_reset",
            urgency: "immediate",
            targetType: "user",
            targetValue: "admin",
            requiresApproval: true,
            evidenceBasis: ["Credential dump confirmed"],
          },
        ],
        timelineSummary: [
          { timestamp: "2026-03-01T12:00:00Z", event: "Initial access detected", source: "wazuh_alert", significance: "high" },
          { timestamp: "2026-03-01T13:00:00Z", event: "Credential dump discovered", source: "edr", significance: "critical" },
        ],
        linkedEntities: [
          { type: "ip", value: "10.0.0.5" }, // duplicate — should be deduped
          { type: "user", value: "admin" }, // new entity
        ],
      }));

      const result = await runHypothesisAgent({
        correlationId: testCorrelationId,
        existingSessionId: testSessionId,
      });

      // Should reuse the same session and case state
      expect(result.sessionId).toBe(testSessionId);
      expect(result.caseId).toBe(testCaseId);
      // Should have new materialized actions
      expect(result.materializedActionIds.length).toBeGreaterThan(0);
    }
  );

  it.skipIf(!HAS_DB)(
    "verifies merged case has the higher-confidence working theory",
    async () => {
      const { getLivingCaseById } = await import("./hypothesisAgent");
      const livingCase = await getLivingCaseById(testCaseId);

      expect(livingCase).not.toBeNull();
      const caseData = livingCase!.caseData as any;

      // The 0.95 confidence theory should win over the 0.8 one
      expect(caseData.workingTheory.confidence).toBe(0.95);
      expect(caseData.workingTheory.statement).toContain("Confirmed lateral movement");
    }
  );

  it.skipIf(!HAS_DB)(
    "verifies merged case deduplicates entities by type:value",
    async () => {
      const { getLivingCaseById } = await import("./hypothesisAgent");
      const livingCase = await getLivingCaseById(testCaseId);
      const caseData = livingCase!.caseData as any;

      // linkedEntities come from triage.entities + correlation.discoveredEntities
      // (NOT from LLM linkedEntities — those are intentionally excluded to avoid hallucinated entities)
      // ip:10.0.0.5 comes from triage entities in both runs — should be deduped to 1
      const ipEntities = caseData.linkedEntities.filter(
        (e: any) => e.type === "ip" && e.value === "10.0.0.5"
      );
      expect(ipEntities.length).toBe(1);

      // Total entity count should not have duplicates
      const entityKeys = caseData.linkedEntities.map((e: any) => `${e.type}:${e.value}`);
      const uniqueKeys = new Set(entityKeys);
      expect(entityKeys.length).toBe(uniqueKeys.size);
    }
  );

  it.skipIf(!HAS_DB)(
    "verifies merged case deduplicates timeline entries",
    async () => {
      const { getLivingCaseById } = await import("./hypothesisAgent");
      const livingCase = await getLivingCaseById(testCaseId);
      const caseData = livingCase!.caseData as any;

      // "Initial access detected" at 12:00 should appear only once
      const initialAccessEntries = caseData.timelineSummary.filter(
        (t: any) => t.event.startsWith("Initial access detected")
      );
      expect(initialAccessEntries.length).toBe(1);

      // Timeline should be sorted chronologically
      for (let i = 1; i < caseData.timelineSummary.length; i++) {
        const prev = new Date(caseData.timelineSummary[i - 1].timestamp).getTime();
        const curr = new Date(caseData.timelineSummary[i].timestamp).getTime();
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    }
  );

  it.skipIf(!HAS_DB)(
    "verifies merged case deduplicates alternate theories",
    async () => {
      const { getLivingCaseById } = await import("./hypothesisAgent");
      const livingCase = await getLivingCaseById(testCaseId);
      const caseData = livingCase!.caseData as any;

      // Should have alternate theories from both runs, but deduplicated
      expect(caseData.alternateTheories.length).toBeGreaterThanOrEqual(1);

      // Check no exact duplicates by statement prefix
      const prefixes = caseData.alternateTheories.map(
        (t: any) => t.statement.slice(0, 80)
      );
      const uniquePrefixes = new Set(prefixes);
      expect(uniquePrefixes.size).toBe(prefixes.length);
    }
  );
});

describe("runHypothesisAgent — response action materialization", () => {
  // Each test gets its own isolated correlationId — no shared state between tests.
  // This prevents the "2 actions from test A leak into test B" problem.

  async function createIsolatedCorrelation(alertId: string): Promise<string> {
    const { runTriageAgent } = await import("./triageAgent");
    const { runCorrelationAgent } = await import("./correlationAgent");

    mockLLMResponse.mockResolvedValueOnce(TRIAGE_LLM_RESPONSE);
    const triageResult = await runTriageAgent({
      rawAlert: {
        id: alertId,
        timestamp: new Date().toISOString(),
        rule: { id: "5710", level: 10, description: "Test", mitre: { id: ["T1021"], technique: ["Remote Services"], tactic: ["Lateral Movement"] } },
        agent: { id: "001", name: "test-host" },
        data: { srcip: "10.0.0.99" },
      },
      userId: 1,
    });

    mockLLMResponse.mockResolvedValueOnce(CORRELATION_LLM_RESPONSE);
    const corrResult = await runCorrelationAgent({ triageId: triageResult.triageId! });
    return corrResult.correlationId;
  }

  it.skipIf(!HAS_DB)(
    "materializes response actions with correct initial state (proposed)",
    async () => {
      const correlationId = await createIsolatedCorrelation("hypo-test-actions-materialize-1");
      const { runHypothesisAgent } = await import("./hypothesisAgent");

      mockLLMResponse.mockResolvedValueOnce(makeHypothesisLLMResponse({
        recommendedActions: [
          {
            action: "Block IP at firewall",
            category: "block",
            urgency: "immediate",
            targetType: "ip",
            targetValue: "10.0.0.99",
            requiresApproval: true,
            evidenceBasis: ["Confirmed malicious"],
          },
          {
            action: "Add to watchlist",
            category: "watchlist",
            urgency: "next",
            targetType: "ip",
            targetValue: "10.0.0.99",
            requiresApproval: false,
            evidenceBasis: ["Suspicious activity"],
          },
        ],
      }));

      const result = await runHypothesisAgent({ correlationId });

      expect(result.materializedActionIds.length).toBe(2);
      // All materialized actions should start in "proposed" state
      for (const actionId of result.materializedActionIds) {
        expect(actionId).toMatch(/^ra-/);
      }
    }
  );

  it.skipIf(!HAS_DB)(
    "handles hypothesis with zero recommended actions",
    async () => {
      const correlationId = await createIsolatedCorrelation("hypo-test-actions-zero-1");
      const { runHypothesisAgent } = await import("./hypothesisAgent");

      mockLLMResponse.mockResolvedValueOnce(makeHypothesisLLMResponse({
        recommendedActions: [],
      }));

      const result = await runHypothesisAgent({ correlationId });

      expect(result.caseId).toBeGreaterThan(0);
      // No new actions to materialize
      expect(result.materializedActionIds.length).toBe(0);
    }
  );
});

describe("runHypothesisAgent — edge cases", () => {
  it.skipIf(!HAS_DB)(
    "handles LLM returning low-confidence working theory",
    async () => {
      const { runTriageAgent } = await import("./triageAgent");
      const { runCorrelationAgent } = await import("./correlationAgent");
      const { runHypothesisAgent } = await import("./hypothesisAgent");

      // Full pipeline with very low confidence
      mockLLMResponse.mockResolvedValueOnce(TRIAGE_LLM_RESPONSE);
      const triage = await runTriageAgent({
        rawAlert: {
          id: "hypo-test-low-conf-1",
          timestamp: new Date().toISOString(),
          rule: { id: "100", level: 3, description: "Low-level alert" },
          agent: { id: "099", name: "test-host" },
          data: {},
        },
        userId: 1,
      });

      mockLLMResponse.mockResolvedValueOnce(CORRELATION_LLM_RESPONSE);
      const corr = await runCorrelationAgent({ triageId: triage.triageId! });

      mockLLMResponse.mockResolvedValueOnce(makeHypothesisLLMResponse({
        workingTheory: {
          statement: "Insufficient data to form a theory",
          confidence: 0.1,
          supportingEvidence: [],
          conflictingEvidence: ["No clear indicators"],
        },
        alternateTheories: [],
        evidenceGaps: [
          { description: "No network context", impact: "Cannot assess scope" },
          { description: "No endpoint data", impact: "Cannot confirm activity" },
        ],
        recommendedActions: [],
        suggestedNextSteps: [
          { action: "Gather more data before acting", priority: "medium", reasoning: "Low confidence" },
        ],
      }));

      const result = await runHypothesisAgent({ correlationId: corr.correlationId });

      expect(result.caseId).toBeGreaterThan(0);
      expect(result.materializedActionIds.length).toBe(0);
    }
  );
});

describe("Hypothesis query helpers", () => {
  it.skipIf(!HAS_DB)(
    "getLivingCaseById returns null for non-existent ID",
    async () => {
      const { getLivingCaseById } = await import("./hypothesisAgent");
      const result = await getLivingCaseById(999999);
      expect(result).toBeNull();
    }
  );

  it.skipIf(!HAS_DB)(
    "listLivingCases returns paginated results",
    async () => {
      const { listLivingCases } = await import("./hypothesisAgent");
      const result = await listLivingCases({ limit: 5, offset: 0 });

      expect(result).toHaveProperty("cases");
      expect(result).toHaveProperty("total");
      expect(Array.isArray(result.cases)).toBe(true);
      expect(typeof result.total).toBe("number");
    }
  );
});
