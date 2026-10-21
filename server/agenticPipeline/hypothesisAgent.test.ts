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

/**
 * FIXED 2026-10-21 (found by the H-T1 burn-down; kept for history):
 * materializeResponseActions() (hypothesisAgent.ts ~L1332) resolves the DB
 * category from livingCase.recommendedActions[].category, but
 * assembleLivingCase() (~L697, DISPLAY_CATEGORY_MAP) has already collapsed that
 * field to the display bucket "immediate" | "next" | "optional". None of those
 * is in RESPONSE_ACTION_CATEGORIES, and since C10 removed the urgency-word
 * synonyms, EVERY model-proposed action is skipped as "Unclassifiable category"
 * — zero response_actions rows are ever materialized (rematerializeResponseActions
 * reads the same snapshot field). Fix: assembleLivingCase now stamps `dbCategory`
 * (the resolved DB enum) next to the display bucket and the materializer reads it.
 */
const MATERIALIZATION_BUG =
  "BUG: materializeResponseActions reads the display-bucketed snapshot category (immediate|next|optional) so every action is skipped as unclassifiable";

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
          category: "isolate_host",
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
    correlationId: "x",
    sourceTriageId: "x",
    relatedAlerts: [],
    discoveredEntities: [],
    blastRadius: {
      affectedHosts: ["web-server-01", "db-server-01"],
      affectedUsers: ["admin"],
      affectedServices: ["ssh", "rdp"],
      assetCriticality: "high",
    },
    campaignAssessment: {
      likelyCampaign: true,
      campaignName: "Credential Reuse Campaign",
      confidence: 0.7,
      reasoning: "Credential reuse across hosts",
      indicators: ["T1021", "T1078"],
    },
    caseRecommendation: {
      action: "create_new",
      mergeTargetId: null,
      mergeTargetTitle: null,
      confidence: 0.85,
      reasoning: "New investigation",
    },
    riskScore: 72,
    summary: "Lateral movement via remote services",
    evidenceSummary: "Alert shows remote service access across multiple hosts",
    inferenceSummary: "No conflicting evidence",
    uncertainties: [],
    confidence: 0.8,
    mitreMapping: [
      { techniqueId: "T1021", techniqueName: "Remote Services", tactic: "Lateral Movement", confidence: 0.9 },
    ],
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

      const result = await runHypothesisAgent({ correlationId: testCorrelationId, userId: 1 });
      testCaseId = result.caseId;
      testSessionId = result.sessionId;

      expect(result.caseId).toBeGreaterThan(0);
      expect(result.isNewSession).toBe(true);
      expect(result.latencyMs).toBeGreaterThan(0);
      expect(result.tokensUsed).toBe(2800); // 2000 + 800
      // C10: the snapshot marks every model-proposed action as requiring approval
      expect(result.livingCase.recommendedActions.length).toBe(1);
      expect(result.livingCase.recommendedActions.every((a) => a.requiresApproval)).toBe(true);

      // C9: the new investigation session is attributed to the triggering analyst
      const { getDb } = await import("../db");
      const { investigationSessions } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      const [session] = await db!.select({ userId: investigationSessions.userId })
        .from(investigationSessions)
        .where(eq(investigationSessions.id, result.sessionId));
      expect(session.userId).toBe(1);
    }
  );

  it.skipIf(!HAS_DB)(
    "materializes the recommended action as a response_actions row on case creation (dbCategory carried through the snapshot)",
    async () => {
      const { getDb } = await import("../db");
      const { responseActions } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      const rows = await db!.select().from(responseActions).where(eq(responseActions.caseId, testCaseId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        category: "isolate_host",
        state: "proposed",
        requiresApproval: 1,
        proposedBy: "hypothesis_agent",
        targetValue: "host-05",
      });
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
            category: "disable_account",
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
        userId: 1, // C9: must be the session's owner (created above as user 1)
      });

      // Should reuse the same session and case state
      expect(result.sessionId).toBe(testSessionId);
      expect(result.caseId).toBe(testCaseId);
      expect(result.isNewSession).toBe(false);
    }
  );

  it.skipIf(!HAS_DB)(
    "does not merge into another analyst's session (C9): existingSessionId owned by someone else opens a new session",
    async () => {
      const { runHypothesisAgent } = await import("./hypothesisAgent");
      mockLLMResponse.mockResolvedValueOnce(makeHypothesisLLMResponse());

      // testSessionId is owned by user 1; user 2 must not be able to merge into it
      const result = await runHypothesisAgent({
        correlationId: testCorrelationId,
        existingSessionId: testSessionId,
        userId: 2,
      });

      expect(result.sessionId).not.toBe(testSessionId);
      expect(result.caseId).not.toBe(testCaseId);
      expect(result.isNewSession).toBe(true);
    }
  );

  it.skipIf(!HAS_DB)(
    "materializes the merge run's new action (credential reset) alongside the first run's",
    async () => {
      const { getDb } = await import("../db");
      const { responseActions } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      const rows = await db!.select().from(responseActions).where(eq(responseActions.caseId, testCaseId));
      const categories = rows.map((r) => r.category).sort();
      expect(categories).toEqual(["disable_account", "isolate_host"]);
      const reset = rows.find((r) => r.category === "disable_account");
      expect(reset).toMatchObject({ state: "proposed", requiresApproval: 1, targetValue: "admin" });
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
    "materializes response actions with correct initial state (proposed, requiresApproval=1 regardless of model output)",
    async () => {
      const correlationId = await createIsolatedCorrelation("hypo-test-actions-state-1");
      const { runHypothesisAgent } = await import("./hypothesisAgent");
      mockLLMResponse.mockResolvedValueOnce(makeHypothesisLLMResponse({
        recommendedActions: [
          // Model says no approval needed for a watchlist add — C10 ignores that.
          { action: "Add host-05 to the watchlist", category: "add_watchlist", urgency: "optional", targetType: "host", targetValue: "host-05", requiresApproval: false, evidenceBasis: ["Suspicious connections"] },
          // Urgency words are NOT categories: this one is unclassifiable and must be skipped, not stored as custom.
          { action: "Do something vague", category: "immediate", urgency: "immediate", targetType: "host", targetValue: "host-05", requiresApproval: false, evidenceBasis: [] },
        ],
      }));
      const result = await runHypothesisAgent({ correlationId, userId: 1 });

      const { getDb } = await import("../db");
      const { responseActions } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      const rows = await db!.select().from(responseActions).where(eq(responseActions.caseId, result.caseId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ category: "add_watchlist", state: "proposed", requiresApproval: 1 });
      // The unclassifiable one is reported, never silently dropped
      expect(result.materializePartialFailure?.failed.some((f) => /Unclassifiable category 'immediate'/.test(f.error))).toBe(true);
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

      const result = await runHypothesisAgent({ correlationId, userId: 1 });

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
        // C12: at least one alternate theory is required for a valid hypothesis
        alternateTheories: [
          { statement: "Benign misconfiguration", confidence: 0.1, supportingEvidence: [], conflictingEvidence: [] },
        ],
        evidenceGaps: [
          { description: "No network context", impact: "Cannot assess scope" },
          { description: "No endpoint data", impact: "Cannot confirm activity" },
        ],
        recommendedActions: [],
        suggestedNextSteps: [
          { action: "Gather more data before acting", priority: "medium", reasoning: "Low confidence" },
        ],
      }));

      const result = await runHypothesisAgent({ correlationId: corr.correlationId, userId: 1 });

      expect(result.caseId).toBeGreaterThan(0);
      expect(result.livingCase.workingTheory.confidence).toBe(0.1);
      expect(result.materializedActionIds.length).toBe(0);
    }
  );

  it.skipIf(!HAS_DB)(
    "fails (does not fabricate a case) when the LLM returns no alternate theories (C12)",
    async () => {
      const { runTriageAgent } = await import("./triageAgent");
      const { runCorrelationAgent } = await import("./correlationAgent");
      const { runHypothesisAgent } = await import("./hypothesisAgent");

      mockLLMResponse.mockResolvedValueOnce(TRIAGE_LLM_RESPONSE);
      const triage = await runTriageAgent({
        rawAlert: {
          id: `hypo-test-no-alt-${Date.now()}`,
          timestamp: new Date().toISOString(),
          rule: { id: "100", level: 3, description: "Low-level alert" },
          agent: { id: "099", name: "test-host" },
          data: {},
        },
        userId: 1,
      });
      mockLLMResponse.mockResolvedValueOnce(CORRELATION_LLM_RESPONSE);
      const corr = await runCorrelationAgent({ triageId: triage.triageId! });

      mockLLMResponse.mockResolvedValueOnce(makeHypothesisLLMResponse({ alternateTheories: [] }));
      await expect(
        runHypothesisAgent({ correlationId: corr.correlationId, userId: 1 })
      ).rejects.toThrow(/not a valid hypothesis/);
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
