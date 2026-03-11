/**
 * Correlation Agent Tests — Split-Brain Repair Edition
 *
 * All mock LLM responses now use the RAW LLM shape (as defined by
 * CORRELATION_JSON_SCHEMA in correlationAgent.ts), NOT the canonical
 * CorrelationBundle shape. The normalizer converts raw → canonical.
 *
 * Test categories:
 *   1. Normalizer unit tests (no DB required)
 *   2. Zod validation tests (no DB required)
 *   3. Integration tests (DB required, mocked LLM/indexer/wazuh/otx)
 *
 * What is real:
 *   - The normalizer code paths
 *   - The Zod schema validation
 *   - The database (real MySQL, for integration tests)
 *
 * What is mocked:
 *   - LLM (returns structured JSON in raw LLM shape)
 *   - Wazuh API, Indexer, OTX
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import type { LLMCorrelationRaw } from "./types/LLMCorrelationRaw";
import { parseLLMCorrelation } from "./types/LLMCorrelationRaw";
import { normalizeCorrelationBundle } from "./normalizeCorrelationBundle";

// ── Mock external services ──────────────────────────────────────────────────
const mockLLMResponse = vi.fn();
vi.mock("../llm/llmService", () => ({
  invokeLLMWithFallback: (...args: any[]) => mockLLMResponse(...args),
  getEffectiveLLMConfig: async () => ({ host: "mock", port: 0, model: "mock", enabled: true }),
  isCustomLLMEnabled: async () => true,
}));

const mockIndexerSearch = vi.fn().mockResolvedValue({ hits: { hits: [], total: { value: 0 } } });
vi.mock("../indexer/indexerClient", () => ({
  getEffectiveIndexerConfig: async () => ({ host: "mock", port: 9200, user: "admin", pass: "admin", protocol: "https" }),
  indexerSearch: (...args: any[]) => mockIndexerSearch(...args),
  indexerGet: async () => ({}),
}));

vi.mock("../wazuh/wazuhClient", () => ({
  wazuhGet: async () => ({ data: { affected_items: [] } }),
  getEffectiveWazuhConfig: async () => ({ host: "mock", port: 55000, user: "admin", pass: "admin", protocol: "https" }),
}));

const mockOtxGet = vi.fn().mockResolvedValue({});
vi.mock("../otx/otxClient", () => ({
  otxGet: (...args: any[]) => mockOtxGet(...args),
  isOtxConfigured: () => false,
}));

const HAS_DB = !!process.env.DATABASE_URL;

// ── Raw LLM Fixture (matches CORRELATION_JSON_SCHEMA) ───────────────────────

/**
 * Build a mock LLM response in the RAW shape — string arrays for blastRadius,
 * campaignName (not campaignLabel), indicators (not clusteredTechniques),
 * top-level confidence/summary/evidenceSummary/inferenceSummary/uncertainties.
 */
function makeRawLLMResponse(overrides: Partial<LLMCorrelationRaw> = {}) {
  const raw: LLMCorrelationRaw = {
    correlationId: "will-be-overridden",
    sourceTriageId: "will-be-overridden",
    relatedAlerts: overrides.relatedAlerts ?? [],
    discoveredEntities: overrides.discoveredEntities ?? [],
    blastRadius: overrides.blastRadius ?? {
      affectedHosts: ["db-server-01"],
      affectedUsers: ["root"],
      affectedServices: ["mysql"],
      assetCriticality: "medium",
    },
    campaignAssessment: overrides.campaignAssessment ?? {
      likelyCampaign: false,
      campaignName: null,
      confidence: 0.2,
      reasoning: "No campaign indicators",
      indicators: [],
    },
    caseRecommendation: overrides.caseRecommendation ?? {
      action: "create_new",
      mergeTargetId: null,
      mergeTargetTitle: null,
      reasoning: "New investigation needed",
      confidence: 0.7,
    },
    riskScore: overrides.riskScore ?? 45,
    summary: overrides.summary ?? "File modification detected on db-server-01",
    evidenceSummary: overrides.evidenceSummary ?? "FIM alert on /etc/passwd with hash change",
    inferenceSummary: overrides.inferenceSummary ?? "Likely unauthorized modification",
    uncertainties: overrides.uncertainties ?? [
      { description: "No threat intel available", impact: "Cannot assess if this is malicious", suggestedAction: "Check OTX manually" },
    ],
    confidence: overrides.confidence ?? 0.65,
    mitreMapping: overrides.mitreMapping ?? [
      { techniqueId: "T1565.001", techniqueName: "Stored Data Manipulation", tactic: "Impact", confidence: 0.8 },
    ],
  };
  return {
    choices: [{ message: { content: JSON.stringify(raw) } }],
    usage: { prompt_tokens: 1500, completion_tokens: 500 },
  };
}

const TRIAGE_LLM_RESPONSE = {
  choices: [{ message: { content: JSON.stringify({
    alertFamily: "file_integrity",
    severity: "medium",
    severityConfidence: 0.7,
    severityReasoning: "File modification on critical system file",
    entities: [
      { type: "host", value: "db-server-01", confidence: 1.0 },
      { type: "file_path", value: "/etc/passwd", confidence: 1.0 },
    ],
    mitreMapping: [{ techniqueId: "T1565.001", techniqueName: "Stored Data Manipulation", tactic: "Impact", confidence: 0.8 }],
    dedup: { isDuplicate: false, similarityScore: 0.2, reasoning: "New FIM alert" },
    route: "C_HIGH_CONFIDENCE",
    routeReasoning: "Critical file modified",
    summary: "File /etc/passwd modified on db-server-01",
    uncertainties: [],
    caseLink: { shouldLink: false, confidence: 0.1, reasoning: "No match" },
  }) } }],
  usage: { prompt_tokens: 800, completion_tokens: 300 },
};

const WAZUH_ALERT_FIM = {
  id: "corr-test-fim-1",
  timestamp: new Date().toISOString(),
  rule: { id: "550", level: 7, description: "File integrity monitoring: file modified", mitre: { id: ["T1565.001"], technique: ["Stored Data Manipulation"], tactic: ["Impact"] } },
  agent: { id: "003", name: "db-server-01", ip: "192.168.1.30" },
  data: { srcip: "192.168.1.30" },
  syscheck: { path: "/etc/passwd", md5_after: "abc123def456", sha256_after: "sha256hash789" },
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1. NORMALIZER UNIT TESTS (no DB required)
// ═══════════════════════════════════════════════════════════════════════════════

describe("normalizeCorrelationBundle — deterministic mapping", () => {
  const fixedDate = new Date("2026-03-07T12:00:00.000Z");
  const opts = { correlationId: "corr-test-001", triageId: "triage-test-001", now: fixedDate };

  it("maps blastRadius.affectedHosts from string[] to count (number)", () => {
    const raw = parseLLMCorrelation({
      ...JSON.parse(makeRawLLMResponse().choices[0].message.content),
      blastRadius: {
        affectedHosts: ["Alpha", "Bravo", "Charlie"],
        affectedUsers: ["cvalentine", "root"],
        affectedServices: ["mysql", "ssh"],
        assetCriticality: "high",
      },
    });
    const bundle = normalizeCorrelationBundle(raw, opts);

    expect(bundle.blastRadius.affectedHosts).toBe(3);
    expect(typeof bundle.blastRadius.affectedHosts).toBe("number");
  });

  it("maps blastRadius.affectedUsers from string[] to count (number)", () => {
    const raw = parseLLMCorrelation({
      ...JSON.parse(makeRawLLMResponse().choices[0].message.content),
      blastRadius: {
        affectedHosts: ["Alpha"],
        affectedUsers: ["cvalentine", "root"],
        affectedServices: [],
        assetCriticality: "medium",
      },
    });
    const bundle = normalizeCorrelationBundle(raw, opts);

    expect(bundle.blastRadius.affectedUsers).toBe(2);
    expect(typeof bundle.blastRadius.affectedUsers).toBe("number");
  });

  it("drops affectedServices (not in canonical schema)", () => {
    const raw = parseLLMCorrelation({
      ...JSON.parse(makeRawLLMResponse().choices[0].message.content),
      blastRadius: {
        affectedHosts: ["Alpha"],
        affectedUsers: [],
        affectedServices: ["mysql", "ssh", "nginx"],
        assetCriticality: "medium",
      },
    });
    const bundle = normalizeCorrelationBundle(raw, opts);

    // affectedServices should not exist on the canonical bundle
    expect((bundle.blastRadius as any).affectedServices).toBeUndefined();
  });

  it("sets affectedAgentIds to empty array (not populated from hostnames)", () => {
    const raw = parseLLMCorrelation(JSON.parse(makeRawLLMResponse().choices[0].message.content));
    const bundle = normalizeCorrelationBundle(raw, opts);

    expect(bundle.blastRadius.affectedAgentIds).toEqual([]);
  });

  it("maps campaignAssessment.campaignName → campaignLabel", () => {
    const raw = parseLLMCorrelation({
      ...JSON.parse(makeRawLLMResponse().choices[0].message.content),
      campaignAssessment: {
        likelyCampaign: true,
        campaignName: "Operation Midnight",
        confidence: 0.8,
        reasoning: "Multiple correlated signals",
        indicators: ["T1059", "T1053.005"],
      },
    });
    const bundle = normalizeCorrelationBundle(raw, opts);

    expect(bundle.campaignAssessment.campaignLabel).toBe("Operation Midnight");
    expect((bundle.campaignAssessment as any).campaignName).toBeUndefined();
  });

  it("maps campaignAssessment.indicators → clusteredTechniques (MITRE IDs only)", () => {
    const raw = parseLLMCorrelation({
      ...JSON.parse(makeRawLLMResponse().choices[0].message.content),
      campaignAssessment: {
        likelyCampaign: true,
        campaignName: "Test Campaign",
        confidence: 0.7,
        reasoning: "Test",
        indicators: ["T1059", "T1053.005", "not-a-technique", "suspicious-ip"],
      },
    });
    const bundle = normalizeCorrelationBundle(raw, opts);

    // Only valid MITRE technique IDs should be mapped
    expect(bundle.campaignAssessment.clusteredTechniques).toHaveLength(2);
    expect(bundle.campaignAssessment.clusteredTechniques[0].techniqueId).toBe("T1059");
    expect(bundle.campaignAssessment.clusteredTechniques[1].techniqueId).toBe("T1053.005");
    // Non-technique indicators are dropped
    expect((bundle.campaignAssessment as any).indicators).toBeUndefined();
  });

  it("maps top-level confidence → synthesis.confidence", () => {
    const raw = parseLLMCorrelation({
      ...JSON.parse(makeRawLLMResponse().choices[0].message.content),
      confidence: 0.42,
    });
    const bundle = normalizeCorrelationBundle(raw, opts);

    expect(bundle.synthesis.confidence).toBe(0.42);
  });

  it("maps top-level summary → synthesis.narrative", () => {
    const raw = parseLLMCorrelation({
      ...JSON.parse(makeRawLLMResponse().choices[0].message.content),
      summary: "Critical file tampering detected across 3 hosts",
    });
    const bundle = normalizeCorrelationBundle(raw, opts);

    expect(bundle.synthesis.narrative).toBe("Critical file tampering detected across 3 hosts");
  });

  it("maps top-level evidenceSummary → synthesis.supportingEvidence[0].data.text", () => {
    const raw = parseLLMCorrelation({
      ...JSON.parse(makeRawLLMResponse().choices[0].message.content),
      evidenceSummary: "FIM alert with hash mismatch on /etc/shadow",
    });
    const bundle = normalizeCorrelationBundle(raw, opts);

    expect(bundle.synthesis.supportingEvidence).toHaveLength(1);
    expect(bundle.synthesis.supportingEvidence[0].data.text).toBe("FIM alert with hash mismatch on /etc/shadow");
    expect(bundle.synthesis.supportingEvidence[0].source).toBe("llm_inference");
  });

  it("maps top-level inferenceSummary → synthesis.conflictingEvidence[0].data.text", () => {
    const raw = parseLLMCorrelation({
      ...JSON.parse(makeRawLLMResponse().choices[0].message.content),
      inferenceSummary: "Likely authorized maintenance window",
    });
    const bundle = normalizeCorrelationBundle(raw, opts);

    expect(bundle.synthesis.conflictingEvidence).toHaveLength(1);
    expect(bundle.synthesis.conflictingEvidence[0].data.text).toBe("Likely authorized maintenance window");
  });

  it("maps top-level uncertainties → synthesis.missingEvidence", () => {
    const raw = parseLLMCorrelation({
      ...JSON.parse(makeRawLLMResponse().choices[0].message.content),
      uncertainties: [
        { description: "No OTX data", impact: "Cannot verify IOCs", suggestedAction: "Manual lookup" },
        { description: "Missing FIM baseline", impact: "Cannot determine if change is expected", suggestedAction: "Check baseline" },
      ],
    });
    const bundle = normalizeCorrelationBundle(raw, opts);

    expect(bundle.synthesis.missingEvidence).toHaveLength(2);
    expect(bundle.synthesis.missingEvidence[0].description).toBe("No OTX data");
    expect(bundle.synthesis.missingEvidence[1].description).toBe("Missing FIM baseline");
  });

  it("normalizes invalid assetCriticality to 'unknown'", () => {
    const raw = parseLLMCorrelation({
      ...JSON.parse(makeRawLLMResponse().choices[0].message.content),
      blastRadius: {
        affectedHosts: ["Alpha"],
        affectedUsers: [],
        affectedServices: [],
        assetCriticality: "SUPER_CRITICAL_EXTREME",
      },
    });
    const bundle = normalizeCorrelationBundle(raw, opts);

    expect(bundle.blastRadius.assetCriticality).toBe("unknown");
  });

  it("normalizes invalid caseRecommendation action to 'defer_to_analyst'", () => {
    const raw = parseLLMCorrelation({
      ...JSON.parse(makeRawLLMResponse().choices[0].message.content),
      caseRecommendation: {
        action: "DESTROY_EVERYTHING",
        mergeTargetId: null,
        mergeTargetTitle: null,
        reasoning: "Test",
        confidence: 0.5,
      },
    });
    const bundle = normalizeCorrelationBundle(raw, opts);

    expect(bundle.caseRecommendation.action).toBe("defer_to_analyst");
  });

  it("stamps correlationId and triageId from opts, not from LLM output", () => {
    const raw = parseLLMCorrelation(JSON.parse(makeRawLLMResponse().choices[0].message.content));
    const bundle = normalizeCorrelationBundle(raw, {
      correlationId: "corr-authoritative",
      triageId: "triage-authoritative",
      now: fixedDate,
    });

    expect(bundle.correlationId).toBe("corr-authoritative");
    expect(bundle.sourceTriageId).toBe("triage-authoritative");
  });

  it("sets schemaVersion to '1.0'", () => {
    const raw = parseLLMCorrelation(JSON.parse(makeRawLLMResponse().choices[0].message.content));
    const bundle = normalizeCorrelationBundle(raw, opts);

    expect(bundle.schemaVersion).toBe("1.0");
  });

  it("handles empty blastRadius arrays correctly", () => {
    const raw = parseLLMCorrelation({
      ...JSON.parse(makeRawLLMResponse().choices[0].message.content),
      blastRadius: {
        affectedHosts: [],
        affectedUsers: [],
        affectedServices: [],
        assetCriticality: "low",
      },
    });
    const bundle = normalizeCorrelationBundle(raw, opts);

    expect(bundle.blastRadius.affectedHosts).toBe(0);
    expect(bundle.blastRadius.affectedUsers).toBe(0);
  });

  it("normalizes discoveredEntities with invalid types to 'host'", () => {
    const raw = parseLLMCorrelation({
      ...JSON.parse(makeRawLLMResponse().choices[0].message.content),
      discoveredEntities: [
        { type: "INVALID_TYPE", value: "test", confidence: 0.5, source: "llm_inference" },
      ],
    });
    const bundle = normalizeCorrelationBundle(raw, opts);

    expect(bundle.discoveredEntities[0].type).toBe("host");
  });

  it("normalizes discoveredEntities with invalid source to 'llm_inference'", () => {
    const raw = parseLLMCorrelation({
      ...JSON.parse(makeRawLLMResponse().choices[0].message.content),
      discoveredEntities: [
        { type: "ip", value: "10.0.0.1", confidence: 0.5, source: "UNKNOWN_SOURCE" },
      ],
    });
    const bundle = normalizeCorrelationBundle(raw, opts);

    expect(bundle.discoveredEntities[0].source).toBe("llm_inference");
  });

  it("clamps confidence to [0, 1] range", () => {
    const raw = parseLLMCorrelation({
      ...JSON.parse(makeRawLLMResponse().choices[0].message.content),
      discoveredEntities: [
        { type: "ip", value: "10.0.0.1", confidence: 5.0, source: "llm_inference" },
      ],
    });
    const bundle = normalizeCorrelationBundle(raw, opts);

    // Zod allows any number, normalizer clamps to [0, 1]
    expect(bundle.discoveredEntities[0].confidence).toBe(1);
  });

  it("clamps negative confidence to 0", () => {
    const raw = parseLLMCorrelation({
      ...JSON.parse(makeRawLLMResponse().choices[0].message.content),
      discoveredEntities: [
        { type: "ip", value: "10.0.0.1", confidence: -0.5, source: "llm_inference" },
      ],
    });
    const bundle = normalizeCorrelationBundle(raw, opts);

    expect(bundle.discoveredEntities[0].confidence).toBe(0);
  });

  it("maps null campaignName to undefined campaignLabel", () => {
    const raw = parseLLMCorrelation({
      ...JSON.parse(makeRawLLMResponse().choices[0].message.content),
      campaignAssessment: {
        likelyCampaign: false,
        campaignName: null,
        confidence: 0.1,
        reasoning: "No campaign",
        indicators: [],
      },
    });
    const bundle = normalizeCorrelationBundle(raw, opts);

    expect(bundle.campaignAssessment.campaignLabel).toBeUndefined();
  });

  it("initializes vulnerabilityContext, fimContext, threatIntelMatches, priorInvestigations as empty arrays", () => {
    const raw = parseLLMCorrelation(JSON.parse(makeRawLLMResponse().choices[0].message.content));
    const bundle = normalizeCorrelationBundle(raw, opts);

    expect(bundle.vulnerabilityContext).toEqual([]);
    expect(bundle.fimContext).toEqual([]);
    expect(bundle.threatIntelMatches).toEqual([]);
    expect(bundle.priorInvestigations).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. ZOD VALIDATION TESTS (no DB required)
// ═══════════════════════════════════════════════════════════════════════════════

describe("parseLLMCorrelation — Zod validation", () => {
  it("accepts a valid raw LLM payload", () => {
    const rawJson = JSON.parse(makeRawLLMResponse().choices[0].message.content);
    expect(() => parseLLMCorrelation(rawJson)).not.toThrow();
  });

  it("rejects payload missing required field (blastRadius)", () => {
    const rawJson = JSON.parse(makeRawLLMResponse().choices[0].message.content);
    delete rawJson.blastRadius;
    expect(() => parseLLMCorrelation(rawJson)).toThrow();
  });

  it("rejects payload where blastRadius.affectedHosts is a number instead of string[]", () => {
    const rawJson = JSON.parse(makeRawLLMResponse().choices[0].message.content);
    rawJson.blastRadius.affectedHosts = 3; // number, not string[]
    expect(() => parseLLMCorrelation(rawJson)).toThrow();
  });

  it("rejects payload where confidence is a string instead of number", () => {
    const rawJson = JSON.parse(makeRawLLMResponse().choices[0].message.content);
    rawJson.confidence = "high"; // string, not number
    expect(() => parseLLMCorrelation(rawJson)).toThrow();
  });

  it("rejects payload missing required nested field (campaignAssessment.likelyCampaign)", () => {
    const rawJson = JSON.parse(makeRawLLMResponse().choices[0].message.content);
    delete rawJson.campaignAssessment.likelyCampaign;
    expect(() => parseLLMCorrelation(rawJson)).toThrow();
  });

  it("rejects payload where relatedAlerts items miss required fields", () => {
    const rawJson = JSON.parse(makeRawLLMResponse().choices[0].message.content);
    rawJson.relatedAlerts = [{ alertId: "a1" }]; // missing ruleId, ruleDescription, etc.
    expect(() => parseLLMCorrelation(rawJson)).toThrow();
  });

  it("rejects completely empty object", () => {
    expect(() => parseLLMCorrelation({})).toThrow();
  });

  it("rejects null", () => {
    expect(() => parseLLMCorrelation(null)).toThrow();
  });

  it("rejects string", () => {
    expect(() => parseLLMCorrelation("not an object")).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. INTEGRATION TESTS (DB required, mocked LLM/indexer/wazuh/otx)
// ═══════════════════════════════════════════════════════════════════════════════

describe("runCorrelationAgent — integration with normalizer", () => {
  let testTriageId: string;

  beforeAll(async () => {
    if (!HAS_DB) return;

    // Create a triage row for the correlation agent to load
    const { runTriageAgent } = await import("./triageAgent");
    mockLLMResponse.mockResolvedValueOnce(TRIAGE_LLM_RESPONSE);
    const result = await runTriageAgent({ rawAlert: WAZUH_ALERT_FIM, userId: 1 });
    expect(result.success).toBe(true);
    testTriageId = result.triageId!;
  });

  it.skipIf(!HAS_DB)(
    "produces canonical bundle with numeric blastRadius from raw string[] LLM output",
    async () => {
      const { runCorrelationAgent } = await import("./correlationAgent");

      const response = makeRawLLMResponse({
        blastRadius: {
          affectedHosts: ["Alpha", "Bravo"],
          affectedUsers: ["cvalentine", "root"],
          affectedServices: ["mysql"],
          assetCriticality: "high",
        },
      });
      mockLLMResponse.mockResolvedValueOnce(response);

      const result = await runCorrelationAgent({ triageId: testTriageId });

      // PROOF: blastRadius.affectedHosts is a number (count), not string[]
      expect(result.bundle.blastRadius.affectedHosts).toBe(2);
      expect(typeof result.bundle.blastRadius.affectedHosts).toBe("number");
      expect(result.bundle.blastRadius.affectedUsers).toBe(2);
      expect(typeof result.bundle.blastRadius.affectedUsers).toBe("number");
    }
  );

  it.skipIf(!HAS_DB)(
    "produces canonical bundle with synthesis.confidence from raw top-level confidence",
    async () => {
      const { runCorrelationAgent } = await import("./correlationAgent");

      const response = makeRawLLMResponse({ confidence: 0.88 });
      mockLLMResponse.mockResolvedValueOnce(response);

      const result = await runCorrelationAgent({ triageId: testTriageId });

      // PROOF: confidence is at synthesis.confidence, not top-level
      expect(result.bundle.synthesis.confidence).toBe(0.88);
    }
  );

  it.skipIf(!HAS_DB)(
    "produces canonical bundle with synthesis.narrative from raw top-level summary",
    async () => {
      const { runCorrelationAgent } = await import("./correlationAgent");

      const response = makeRawLLMResponse({ summary: "Multi-host compromise detected" });
      mockLLMResponse.mockResolvedValueOnce(response);

      const result = await runCorrelationAgent({ triageId: testTriageId });

      expect(result.bundle.synthesis.narrative).toBe("Multi-host compromise detected");
    }
  );

  it.skipIf(!HAS_DB)(
    "maps campaignName to campaignLabel in canonical bundle",
    async () => {
      const { runCorrelationAgent } = await import("./correlationAgent");

      const response = makeRawLLMResponse({
        campaignAssessment: {
          likelyCampaign: true,
          campaignName: "Operation Midnight",
          confidence: 0.9,
          reasoning: "Coordinated activity across 3 hosts",
          indicators: ["T1059", "T1053.005"],
        },
      });
      mockLLMResponse.mockResolvedValueOnce(response);

      const result = await runCorrelationAgent({ triageId: testTriageId });

      expect(result.bundle.campaignAssessment.campaignLabel).toBe("Operation Midnight");
      expect((result.bundle.campaignAssessment as any).campaignName).toBeUndefined();
    }
  );

  it.skipIf(!HAS_DB)(
    "normalizes invalid assetCriticality to 'unknown' in canonical bundle",
    async () => {
      const { runCorrelationAgent } = await import("./correlationAgent");

      const response = makeRawLLMResponse({
        blastRadius: {
          affectedHosts: ["Alpha"],
          affectedUsers: [],
          affectedServices: [],
          assetCriticality: "INVALID_CRITICALITY",
        },
      });
      mockLLMResponse.mockResolvedValueOnce(response);

      const result = await runCorrelationAgent({ triageId: testTriageId });

      expect(result.bundle.blastRadius.assetCriticality).toBe("unknown");
    }
  );

  it.skipIf(!HAS_DB)(
    "normalizes invalid caseRecommendation action to 'defer_to_analyst'",
    async () => {
      const { runCorrelationAgent } = await import("./correlationAgent");

      const response = makeRawLLMResponse({
        caseRecommendation: {
          action: "INVALID_ACTION",
          mergeTargetId: null,
          mergeTargetTitle: null,
          reasoning: "Test invalid action",
          confidence: 0.5,
        },
      });
      mockLLMResponse.mockResolvedValueOnce(response);

      const result = await runCorrelationAgent({ triageId: testTriageId });

      expect(result.bundle.caseRecommendation.action).toBe("defer_to_analyst");
    }
  );

  it.skipIf(!HAS_DB)(
    "produces valid bundle when indexer returns zero related alerts",
    async () => {
      const { runCorrelationAgent } = await import("./correlationAgent");

      mockIndexerSearch.mockResolvedValue({ hits: { hits: [], total: { value: 0 } } });
      mockLLMResponse.mockResolvedValueOnce(makeRawLLMResponse());

      const result = await runCorrelationAgent({
        triageId: testTriageId,
        lookbackHours: 1,
        maxAlertsPerSource: 5,
      });

      expect(result.correlationId).toMatch(/^corr-/);
      expect(Array.isArray(result.bundle.relatedAlerts)).toBe(true);
      expect(result.bundle.sourceTriageId).toBe(testTriageId);
      expect(result.latencyMs).toBeGreaterThan(0);
    }
  );

  it.skipIf(!HAS_DB)(
    "merges LLM-discovered entities with Wazuh-native entities",
    async () => {
      const { runCorrelationAgent } = await import("./correlationAgent");

      const response = makeRawLLMResponse({
        discoveredEntities: [
          { type: "ip", value: "10.20.30.40", confidence: 0.7, source: "llm_inference" },
          { type: "domain", value: "evil.example.com", confidence: 0.5, source: "llm_inference" },
        ],
      });
      mockLLMResponse.mockResolvedValueOnce(response);

      const result = await runCorrelationAgent({ triageId: testTriageId });

      expect(Array.isArray(result.bundle.discoveredEntities)).toBe(true);
      const entityValues = result.bundle.discoveredEntities.map(e => e.value);
      expect(entityValues).toContain("10.20.30.40");
      expect(entityValues).toContain("evil.example.com");
    }
  );

  it.skipIf(!HAS_DB)(
    "preserves sourceTriageId from input, not from LLM",
    async () => {
      const { runCorrelationAgent } = await import("./correlationAgent");

      mockLLMResponse.mockResolvedValueOnce(makeRawLLMResponse());

      const result = await runCorrelationAgent({ triageId: testTriageId });

      expect(result.bundle.sourceTriageId).toBe(testTriageId);
    }
  );

  it.skipIf(!HAS_DB)(
    "generates unique correlationId for each run",
    async () => {
      const { runCorrelationAgent } = await import("./correlationAgent");

      mockLLMResponse.mockResolvedValueOnce(makeRawLLMResponse());
      const result1 = await runCorrelationAgent({ triageId: testTriageId });

      mockLLMResponse.mockResolvedValueOnce(makeRawLLMResponse());
      const result2 = await runCorrelationAgent({ triageId: testTriageId });

      expect(result1.correlationId).not.toBe(result2.correlationId);
      expect(result1.correlationId).toMatch(/^corr-/);
      expect(result2.correlationId).toMatch(/^corr-/);
    }
  );

  it.skipIf(!HAS_DB)(
    "reports token usage from LLM response",
    async () => {
      const { runCorrelationAgent } = await import("./correlationAgent");

      mockLLMResponse.mockResolvedValueOnce(makeRawLLMResponse());

      const result = await runCorrelationAgent({ triageId: testTriageId });

      expect(result.tokensUsed).toBe(2000); // 1500 prompt + 500 completion
    }
  );
});

describe("Correlation query helpers", () => {
  it.skipIf(!HAS_DB)(
    "getCorrelationByTriageId returns null for non-existent ID",
    async () => {
      const { getCorrelationByTriageId } = await import("./correlationAgent");
      const result = await getCorrelationByTriageId("nonexistent-triage-id");
      expect(result).toBeNull();
    }
  );

  it.skipIf(!HAS_DB)(
    "getCorrelationById returns null for non-existent ID",
    async () => {
      const { getCorrelationById } = await import("./correlationAgent");
      const result = await getCorrelationById("nonexistent-corr-id");
      expect(result).toBeNull();
    }
  );

  it.skipIf(!HAS_DB)(
    "listCorrelations returns paginated results",
    async () => {
      const { listCorrelations } = await import("./correlationAgent");
      const result = await listCorrelations({ limit: 5, offset: 0 });

      expect(result).toHaveProperty("bundles");
      expect(result).toHaveProperty("total");
      expect(Array.isArray(result.bundles)).toBe(true);
      expect(typeof result.total).toBe("number");
    }
  );

  it.skipIf(!HAS_DB)(
    "getCorrelationStats returns aggregate statistics",
    async () => {
      const { getCorrelationStats } = await import("./correlationAgent");
      const stats = await getCorrelationStats();

      expect(stats).toHaveProperty("total");
      expect(typeof stats.total).toBe("number");
    }
  );
});
