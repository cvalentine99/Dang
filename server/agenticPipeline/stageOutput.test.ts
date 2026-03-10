/**
 * Stage Output Validation Tests
 *
 * These tests import and call the REAL agent functions (runTriageAgent,
 * runCorrelationAgent, runHypothesisAgent) with the LLM mocked to return
 * realistic structured JSON responses.
 *
 * What is real:
 *   - The agent function code paths (parsing, validation, entity extraction, DB writes)
 *   - The database (real MySQL via DATABASE_URL)
 *   - The output schema validation (checked field-by-field against agenticSchemas.ts)
 *
 * What is mocked:
 *   - invokeLLMWithFallback — returns realistic structured JSON matching each agent's schema
 *   - External services (Wazuh API, Indexer, OTX) — not available in test environment
 *
 * Why mock the LLM:
 *   The LLM is a non-deterministic external service. Mocking it with realistic responses
 *   lets us test that the agent's own logic (parsing, validation, normalization, persistence)
 *   produces correct schema-conforming output. This is the boundary we control.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type {
  TriageObject,
  CorrelationBundle,
  LivingCaseObject,
  AgenticSeverity,
  TriageRoute,
  ExtractedEntity,
  MitreMapping,
  EvidenceItem,
  Uncertainty,
} from "../../shared/agenticSchemas";

// ── Mock the LLM before importing agents ────────────────────────────────────
// The mock must be hoisted before any agent module is imported.

const mockLLMResponse = vi.fn();

vi.mock("../llm/llmService", () => ({
  invokeLLMWithFallback: (...args: any[]) => mockLLMResponse(...args),
  getEffectiveLLMConfig: async () => ({ host: "mock", port: 0, model: "mock", enabled: true }),
  isCustomLLMEnabled: async () => true,
}));

// Mock indexer (correlation agent needs it)
vi.mock("../indexer/indexerClient", () => ({
  getEffectiveIndexerConfig: async () => ({ host: "mock", port: 9200, user: "admin", pass: "admin", protocol: "https" }),
  indexerSearch: async () => ({ hits: { hits: [], total: { value: 0 } } }),
  INDEX_PATTERNS: { ALERTS: "wazuh-alerts-*", VULNS: "wazuh-states-vulnerabilities-*" },
}));

// Mock Wazuh client (correlation agent needs it)
vi.mock("../wazuh/wazuhClient", () => ({
  getEffectiveWazuhConfig: async () => ({ host: "mock", port: 55000, user: "mock", pass: "mock" }),
  wazuhGet: async () => ({ data: { affected_items: [] } }),
}));

// Mock OTX (correlation agent needs it)
vi.mock("../otx/otxClient", () => ({
  isOtxConfigured: () => false,
  otxGet: async () => ({}),
}));

// ── Import the real agent functions ─────────────────────────────────────────

import { runTriageAgent, type TriageResult } from "./triageAgent";
import { runCorrelationAgent, type CorrelationAgentResult } from "./correlationAgent";

const HAS_DB = !!process.env.DATABASE_URL;

// ── Realistic LLM response fixtures ────────────────────────────────────────
// These match the JSON schemas the agents send via response_format.

const REALISTIC_TRIAGE_LLM_RESPONSE = {
  choices: [{
    message: {
      content: JSON.stringify({
        alertFamily: "brute_force",
        severity: "high",
        severityConfidence: 0.85,
        severityReasoning: "Multiple failed SSH authentication attempts from external IP 203.0.113.42 targeting root account, consistent with brute force attack pattern.",
        entities: [
          { type: "ip", value: "203.0.113.42", confidence: 1.0 },
          { type: "user", value: "root", confidence: 1.0 },
          { type: "host", value: "web-server-01", confidence: 0.95 },
        ],
        mitreMapping: [
          { techniqueId: "T1110.001", techniqueName: "Password Guessing", tactic: "Credential Access", confidence: 0.9 },
        ],
        dedup: {
          isDuplicate: false,
          similarityScore: 0.3,
          reasoning: "No recent similar triage objects found for this agent and rule combination.",
        },
        route: "C_HIGH_CONFIDENCE",
        routeReasoning: "Clear brute force indicators with high confidence. Should proceed to correlation.",
        summary: "SSH brute force attempt detected from 203.0.113.42 targeting root on web-server-01. Multiple failed authentication attempts observed. MITRE T1110.001 (Password Guessing) mapped with high confidence.",
        uncertainties: [
          { description: "Cannot determine if source IP is a known threat actor", impact: "May underestimate severity if this is a known APT" },
        ],
        caseLink: {
          shouldLink: false,
          confidence: 0.2,
          reasoning: "No active investigations match this alert pattern.",
        },
      }),
    },
  }],
  usage: { prompt_tokens: 1200, completion_tokens: 400 },
};

const REALISTIC_CORRELATION_LLM_RESPONSE = {
  choices: [{
    message: {
      content: JSON.stringify({
        correlationId: "will-be-overridden",
        sourceTriageId: "will-be-overridden",
        relatedAlerts: [],
        discoveredEntities: [
          { type: "ip", value: "203.0.113.43", source: "llm_inference", confidence: 0.6 },
        ],
        blastRadius: {
          affectedHosts: ["agent-001"],
          affectedUsers: ["root"],
          affectedServices: ["sshd"],
          assetCriticality: "medium",
        },
        campaignAssessment: {
          likelyCampaign: false,
          campaignName: null,
          confidence: 0.3,
          reasoning: "Single-source attack, no campaign indicators.",
          indicators: [],
        },
        caseRecommendation: {
          action: "create_new",
          mergeTargetId: null,
          mergeTargetTitle: null,
          confidence: 0.8,
          reasoning: "No existing case matches. Recommend new investigation.",
        },
        riskScore: 55,
        summary: "SSH brute force from 203.0.113.42 targeting root on agent 001. No related alerts found in the lookback window. No vulnerability context available. Recommend creating a new investigation case.",
        evidenceSummary: "Source alert shows SSH brute force attempt",
        inferenceSummary: "No conflicting evidence found",
        uncertainties: [
          { description: "No threat intel data available", impact: "Cannot assess if source IP is known malicious", suggestedAction: "Check OTX or VirusTotal" },
        ],
        confidence: 0.75,
        mitreMapping: [
          { techniqueId: "T1110", techniqueName: "Brute Force", tactic: "Credential Access", confidence: 0.9 },
        ],
      }),
    },
  }],
  usage: { prompt_tokens: 2000, completion_tokens: 600 },
};

// ── A realistic Wazuh alert ────────────────────────────────────────────────

const REALISTIC_WAZUH_ALERT = {
  id: "1709312456.123456",
  timestamp: "2026-03-01T10:30:00.000Z",
  rule: {
    id: "5710",
    level: 10,
    description: "sshd: Attempt to login using a non-existent user",
    mitre: {
      id: ["T1110.001"],
      technique: ["Password Guessing"],
      tactic: ["Credential Access"],
    },
  },
  agent: {
    id: "001",
    name: "web-server-01",
    ip: "192.168.1.10",
  },
  data: {
    srcip: "203.0.113.42",
    srcuser: "root",
    dstuser: "nonexistent_user",
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: Triage Agent — Real function, mocked LLM, real DB
// ═══════════════════════════════════════════════════════════════════════════════

describe("runTriageAgent (real function, mocked LLM)", () => {

  it.skipIf(!HAS_DB)(
    "produces a valid TriageObject from a realistic Wazuh alert",
    async () => {
      // Configure the LLM mock to return our realistic response
      mockLLMResponse.mockResolvedValueOnce(REALISTIC_TRIAGE_LLM_RESPONSE);

      // Call the REAL runTriageAgent function
      const result: TriageResult = await runTriageAgent({
        rawAlert: REALISTIC_WAZUH_ALERT,
        userId: 1,
      });

      // ── Verify success ────────────────────────────────────────────────
      expect(result.success).toBe(true);
      expect(result.triageObject).toBeDefined();
      expect(result.triageId).toBeDefined();
      expect(result.latencyMs).toBeGreaterThan(0);

      const triage = result.triageObject!;

      // ── Validate TriageObject schema conformance ──────────────────────
      // These are the required fields from shared/agenticSchemas.ts

      // Schema version
      expect(triage.schemaVersion).toBe("1.0");

      // Identity fields (preserved from raw alert)
      expect(triage.triageId).toMatch(/^triage-/);
      expect(triage.triagedAt).toBeDefined();
      expect(triage.triagedBy).toBe("triage_agent");
      expect(triage.alertId).toBe("1709312456.123456");
      expect(triage.ruleId).toBe("5710");
      expect(triage.ruleDescription).toBe("sshd: Attempt to login using a non-existent user");
      expect(triage.ruleLevel).toBe(10);

      // Agent info (extracted from raw alert by real code)
      expect(triage.agent.id).toBe("001");
      expect(triage.agent.name).toBe("web-server-01");
      expect(triage.agent.ip).toBe("192.168.1.10");

      // Classification (from LLM response, validated by real code)
      expect(triage.alertFamily).toBe("brute_force");
      const validSeverities: AgenticSeverity[] = ["critical", "high", "medium", "low", "info"];
      expect(validSeverities).toContain(triage.severity);
      expect(triage.severity).toBe("high");
      expect(triage.severityConfidence).toBeGreaterThanOrEqual(0);
      expect(triage.severityConfidence).toBeLessThanOrEqual(1);
      expect(triage.severityReasoning).toContain("SSH");

      // Entities (merged: Wazuh-native + LLM-inferred by real code)
      expect(triage.entities.length).toBeGreaterThan(0);
      // The real code extracts Wazuh-native entities (agent ID, srcip, srcuser, dstuser)
      // AND merges LLM-inferred entities — verify both sources are present
      const entityValues = triage.entities.map(e => e.value);
      expect(entityValues).toContain("203.0.113.42"); // from data.srcip (Wazuh-native)
      expect(entityValues).toContain("root"); // from data.srcuser (Wazuh-native)
      expect(entityValues).toContain("001"); // agent ID (Wazuh-native)
      // Every entity has required fields
      for (const entity of triage.entities) {
        expect(entity.type).toBeDefined();
        expect(entity.value).toBeDefined();
        expect(entity.source).toBeDefined();
        expect(typeof entity.confidence).toBe("number");
      }

      // MITRE mappings (merged: Wazuh-native from rule.mitre + LLM)
      expect(triage.mitreMapping.length).toBeGreaterThan(0);
      const techniqueIds = triage.mitreMapping.map(m => m.techniqueId);
      expect(techniqueIds).toContain("T1110.001"); // from rule.mitre (Wazuh-native)
      for (const mapping of triage.mitreMapping) {
        expect(mapping.techniqueId).toBeDefined();
        expect(mapping.techniqueName).toBeDefined();
        expect(mapping.tactic).toBeDefined();
        expect(typeof mapping.confidence).toBe("number");
      }

      // Dedup
      expect(typeof triage.dedup.isDuplicate).toBe("boolean");
      expect(typeof triage.dedup.similarityScore).toBe("number");
      expect(typeof triage.dedup.reasoning).toBe("string");

      // Route
      const validRoutes: TriageRoute[] = ["A_DUPLICATE_NOISY", "B_LOW_CONFIDENCE", "C_HIGH_CONFIDENCE", "D_LIKELY_BENIGN"];
      expect(validRoutes).toContain(triage.route);
      expect(triage.route).toBe("C_HIGH_CONFIDENCE");
      expect(triage.routeReasoning).toBeDefined();

      // Summary
      expect(triage.summary.length).toBeGreaterThan(10);

      // Key evidence
      expect(triage.keyEvidence.length).toBeGreaterThan(0);
      expect(triage.keyEvidence[0].type).toBe("alert");
      expect(triage.keyEvidence[0].source).toBe("wazuh_alert");

      // Uncertainties
      expect(Array.isArray(triage.uncertainties)).toBe(true);

      // Case link
      expect(typeof triage.caseLink.shouldLink).toBe("boolean");
      expect(typeof triage.caseLink.confidence).toBe("number");
      expect(typeof triage.caseLink.reasoning).toBe("string");

      // Raw alert preserved
      expect(triage.rawAlert).toEqual(REALISTIC_WAZUH_ALERT);
    }
  );

  it.skipIf(!HAS_DB)(
    "validates severity and route even when LLM returns invalid values",
    async () => {
      // Return invalid severity and route to test the validation logic
      const badResponse = JSON.parse(JSON.stringify(REALISTIC_TRIAGE_LLM_RESPONSE));
      const content = JSON.parse(badResponse.choices[0].message.content);
      content.severity = "INVALID_SEVERITY";
      content.route = "INVALID_ROUTE";
      content.severityConfidence = 999; // out of range
      badResponse.choices[0].message.content = JSON.stringify(content);

      mockLLMResponse.mockResolvedValueOnce(badResponse);

      const result = await runTriageAgent({
        rawAlert: REALISTIC_WAZUH_ALERT,
        userId: 1,
      });

      expect(result.success).toBe(true);
      const triage = result.triageObject!;

      // The real validation code should normalize these
      expect(triage.severity).toBe("info"); // fallback for invalid severity
      expect(triage.route).toBe("B_LOW_CONFIDENCE"); // fallback for invalid route
      expect(triage.severityConfidence).toBeLessThanOrEqual(1); // clamped
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: Correlation Agent — Real function, mocked LLM + external services
// ═══════════════════════════════════════════════════════════════════════════════

describe("runCorrelationAgent (real function, mocked LLM)", () => {

  // We need a real triage row in the DB for the correlation agent to load
  let testTriageId: string;

  beforeAll(async () => {
    if (!HAS_DB) return;

    // Create a triage row via the real triage agent
    mockLLMResponse.mockResolvedValueOnce(REALISTIC_TRIAGE_LLM_RESPONSE);
    const triageResult = await runTriageAgent({
      rawAlert: REALISTIC_WAZUH_ALERT,
      userId: 1,
    });
    expect(triageResult.success).toBe(true);
    testTriageId = triageResult.triageId!;
  });

  it.skipIf(!HAS_DB)(
    "produces a valid CorrelationBundle from a real triage object",
    async () => {
      mockLLMResponse.mockResolvedValueOnce(REALISTIC_CORRELATION_LLM_RESPONSE);

      const result: CorrelationAgentResult = await runCorrelationAgent({
        triageId: testTriageId,
        lookbackHours: 24,
        maxAlertsPerSource: 10,
        includeThreatIntel: false,
      });

      // ── Verify structure ──────────────────────────────────────────────
      expect(result.correlationId).toMatch(/^corr-/);
      expect(result.latencyMs).toBeGreaterThan(0);

      const bundle = result.bundle;

      // The real code overrides these from the input
      expect(bundle.correlationId).toBe(result.correlationId);
      expect(bundle.sourceTriageId).toBe(testTriageId);

      // Related alerts (empty because indexer is mocked)
      expect(Array.isArray(bundle.relatedAlerts)).toBe(true);

      // Discovered entities
      expect(Array.isArray(bundle.discoveredEntities)).toBe(true);

      // Blast radius
      expect(bundle.blastRadius).toBeDefined();
      expect(typeof bundle.blastRadius.affectedHosts).toBe("number");
      expect(typeof bundle.blastRadius.affectedUsers).toBe("number");
      expect(Array.isArray(bundle.blastRadius.affectedAgentIds)).toBe(true);
      const validCriticality = ["critical", "high", "medium", "low", "unknown"];
      expect(validCriticality).toContain(bundle.blastRadius.assetCriticality);

      // Campaign assessment
      expect(bundle.campaignAssessment).toBeDefined();
      expect(typeof bundle.campaignAssessment.likelyCampaign).toBe("boolean");
      expect(typeof bundle.campaignAssessment.reasoning).toBe("string");

      // Case recommendation
      expect(bundle.caseRecommendation).toBeDefined();
      const validActions = ["merge_existing", "create_new", "defer_to_analyst"];
      expect(validActions).toContain(bundle.caseRecommendation.action);

      // Synthesis
      expect(bundle.synthesis).toBeDefined();
      expect(bundle.synthesis.narrative.length).toBeGreaterThan(10);
      expect(typeof bundle.synthesis.confidence).toBe("number");
      expect(Array.isArray(bundle.synthesis.supportingEvidence)).toBe(true);
      expect(Array.isArray(bundle.synthesis.conflictingEvidence)).toBe(true);
      expect(Array.isArray(bundle.synthesis.missingEvidence)).toBe(true);
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST: Hypothesis Agent — Real function, mocked LLM
// ═══════════════════════════════════════════════════════════════════════════════
// Note: The hypothesis agent requires a completed correlation bundle in the DB.
// We chain: triage → correlation → hypothesis, all using real DB + mocked LLM.

describe("runHypothesisAgent (real function, mocked LLM)", () => {

  let testCorrelationId: string;

  beforeAll(async () => {
    if (!HAS_DB) return;

    // Step 1: Create triage
    mockLLMResponse.mockResolvedValueOnce(REALISTIC_TRIAGE_LLM_RESPONSE);
    const triageResult = await runTriageAgent({
      rawAlert: REALISTIC_WAZUH_ALERT,
      userId: 1,
    });
    expect(triageResult.success).toBe(true);

    // Step 2: Create correlation
    mockLLMResponse.mockResolvedValueOnce(REALISTIC_CORRELATION_LLM_RESPONSE);
    const corrResult = await runCorrelationAgent({
      triageId: triageResult.triageId!,
      lookbackHours: 24,
      includeThreatIntel: false,
    });
    testCorrelationId = corrResult.correlationId;
  });

  it.skipIf(!HAS_DB)(
    "produces a valid LivingCaseObject from a real correlation bundle",
    async () => {
      // Realistic hypothesis LLM response
      const hypothesisLLMResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              workingTheory: {
                statement: "An external attacker at 203.0.113.42 is conducting an SSH brute force attack against the root account on web-server-01.",
                confidence: 0.85,
                supportingEvidence: ["Multiple failed SSH login attempts", "External source IP", "Targeting privileged account"],
                conflictingEvidence: ["No successful login detected yet"],
              },
              alternateTheories: [{
                statement: "Automated vulnerability scanner performing credential testing",
                confidence: 0.3,
                supportingEvidence: ["Systematic nature of attempts"],
                whyLessLikely: "Scanner would typically target multiple services, not just SSH",
              }],
              evidenceGaps: [{
                description: "No threat intel data for source IP",
                impact: "Cannot determine if this is a known threat actor",
                suggestedAction: "Query VirusTotal and AbuseIPDB for 203.0.113.42",
                priority: "high",
              }],
              suggestedNextSteps: [{
                action: "Block 203.0.113.42 at the firewall",
                rationale: "Prevent continued brute force attempts",
                priority: "high",
                effort: "quick",
              }],
              recommendedActions: [{
                action: "Block source IP 203.0.113.42",
                category: "immediate",
                urgency: "high",
                targetType: "ip",
                targetValue: "203.0.113.42",
                requiresApproval: true,
                evidenceBasis: ["Multiple failed SSH attempts from this IP"],
              }],
              timelineSummary: [{
                timestamp: "2026-03-01T10:30:00.000Z",
                event: "SSH brute force detected on web-server-01",
                source: "wazuh_alert",
                significance: "high",
              }],
              draftDocumentation: {
                shiftHandoff: "Active SSH brute force from 203.0.113.42 targeting root on web-server-01. Recommend blocking source IP.",
                executiveSummary: "External SSH brute force attack detected. No successful compromise confirmed.",
              },
            }),
          },
        }],
        usage: { prompt_tokens: 3000, completion_tokens: 800 },
      };

      mockLLMResponse.mockResolvedValueOnce(hypothesisLLMResponse);

      const { runHypothesisAgent } = await import("./hypothesisAgent");
      const result = await runHypothesisAgent({
        correlationId: testCorrelationId,
      });

      // ── Verify structure ──────────────────────────────────────────────
      expect(result.livingCase).toBeDefined();
      const lc = result.livingCase;

      // Schema version
      expect(lc.schemaVersion).toBe("1.0");

      // Case identity
      expect(typeof lc.caseId).toBe("number");
      expect(lc.caseId).toBeGreaterThan(0);
      expect(lc.lastUpdatedAt).toBeDefined();
      expect(lc.lastUpdatedBy).toBe("hypothesis_agent");

      // Working theory
      expect(lc.workingTheory).toBeDefined();
      expect(lc.workingTheory.statement.length).toBeGreaterThan(10);
      expect(typeof lc.workingTheory.confidence).toBe("number");
      expect(lc.workingTheory.confidence).toBeGreaterThanOrEqual(0);
      expect(lc.workingTheory.confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(lc.workingTheory.supportingEvidence)).toBe(true);
      expect(Array.isArray(lc.workingTheory.conflictingEvidence)).toBe(true);

      // Alternate theories
      expect(Array.isArray(lc.alternateTheories)).toBe(true);
      if (lc.alternateTheories.length > 0) {
        const alt = lc.alternateTheories[0];
        expect(alt.statement.length).toBeGreaterThan(0);
        expect(typeof alt.confidence).toBe("number");
        expect(typeof alt.whyLessLikely).toBe("string");
      }

      // Evidence gaps
      expect(Array.isArray(lc.evidenceGaps)).toBe(true);
      if (lc.evidenceGaps.length > 0) {
        const gap = lc.evidenceGaps[0];
        expect(gap.description.length).toBeGreaterThan(0);
        expect(["critical", "high", "medium", "low"]).toContain(gap.priority);
      }

      // Suggested next steps
      expect(Array.isArray(lc.suggestedNextSteps)).toBe(true);
      if (lc.suggestedNextSteps.length > 0) {
        const step = lc.suggestedNextSteps[0];
        expect(step.action.length).toBeGreaterThan(0);
        expect(["critical", "high", "medium", "low"]).toContain(step.priority);
        expect(["quick", "moderate", "deep_dive"]).toContain(step.effort);
      }

      // Recommended actions
      expect(Array.isArray(lc.recommendedActions)).toBe(true);
      if (lc.recommendedActions.length > 0) {
        const action = lc.recommendedActions[0];
        expect(action.action.length).toBeGreaterThan(0);
        // Code review remediation: category uses display-only enum per LivingCaseObject interface
        expect(["immediate", "next", "optional"]).toContain(action.category);
        expect(typeof action.requiresApproval).toBe("boolean");
        expect(action.state).toBe("proposed"); // all new actions start as proposed
      }

      // Timeline summary
      expect(Array.isArray(lc.timelineSummary)).toBe(true);
      if (lc.timelineSummary.length > 0) {
        const entry = lc.timelineSummary[0];
        expect(entry.timestamp).toBeDefined();
        expect(entry.event.length).toBeGreaterThan(0);
        expect(["critical", "high", "medium", "low"]).toContain(entry.significance);
      }

      // Linked artifacts (populated from real triage + correlation data)
      expect(Array.isArray(lc.linkedAlertIds)).toBe(true);
      expect(lc.linkedAlertIds.length).toBeGreaterThan(0);
      expect(Array.isArray(lc.linkedTriageIds)).toBe(true);
      expect(lc.linkedTriageIds.length).toBeGreaterThan(0);
      expect(Array.isArray(lc.linkedCorrelationIds)).toBe(true);
      expect(lc.linkedCorrelationIds.length).toBeGreaterThan(0);
      expect(lc.linkedCorrelationIds).toContain(testCorrelationId);

      // Linked entities (merged from triage + correlation by real code)
      expect(Array.isArray(lc.linkedEntities)).toBe(true);

      // Draft documentation
      expect(lc.draftDocumentation).toBeDefined();
    }
  );
});
