/**
 * Tests for shared/agenticZodSchemas.ts — runtime validation guards.
 *
 * Verifies that the Zod schemas correctly validate post-normalized payloads
 * before DB writes. Tests both valid and invalid fixtures, boundary conditions,
 * and the adapted optional-field semantics for NEW's CorrelationBundle.
 */

import { describe, it, expect } from "vitest";
import {
  TriageObjectSchema,
  CorrelationBundleSchema,
  LivingCaseObjectSchema,
  validateTriageObject,
  validateCorrelationBundle,
  validateLivingCaseObject,
  assertValidTriageObject,
  assertValidCorrelationBundle,
  assertValidLivingCaseObject,
} from "../../shared/agenticZodSchemas";

// ── Fixtures ──────────────────────────────────────────────────────────────

const VALID_TRIAGE: Record<string, unknown> = {
  schemaVersion: "1.0",
  triageId: "triage-abc123",
  triagedAt: "2025-01-15T12:00:00Z",
  triagedBy: "triage_agent",
  alertId: "alert-001",
  ruleId: "550",
  ruleDescription: "Brute force attempt",
  ruleLevel: 10,
  alertTimestamp: "2025-01-15T11:59:00Z",
  agent: { id: "001", name: "web-server-1" },
  alertFamily: "brute_force",
  severity: "high",
  severityConfidence: 0.85,
  severityReasoning: "Multiple failed SSH attempts from same source IP",
  entities: [
    { type: "ip", value: "192.168.1.100", source: "wazuh_alert", confidence: 1.0 },
    { type: "user", value: "root", source: "wazuh_alert", confidence: 1.0 },
  ],
  mitreMapping: [
    { techniqueId: "T1110", techniqueName: "Brute Force", tactic: "Credential Access", confidence: 0.9, source: "wazuh_alert" },
  ],
  dedup: { isDuplicate: false, similarityScore: 0.2, reasoning: "No similar recent triages" },
  route: "C_HIGH_CONFIDENCE",
  routeReasoning: "Clear brute force pattern",
  summary: "Multiple SSH brute force attempts detected against root account.",
  keyEvidence: [
    { id: "ev-1", label: "Raw Alert", type: "alert", source: "wazuh_alert", data: { srcip: "192.168.1.100" }, collectedAt: "2025-01-15T12:00:00Z" },
  ],
  uncertainties: [
    { description: "Source IP may be NAT gateway", impact: "May be multiple attackers" },
  ],
  caseLink: { shouldLink: false, confidence: 0.3, reasoning: "No related active cases" },
  rawAlert: { id: "alert-001", rule: { id: "550" } },
};

const VALID_CORRELATION: Record<string, unknown> = {
  schemaVersion: "1.0",
  correlationId: "corr-abc123",
  correlatedAt: "2025-01-15T12:05:00Z",
  sourceTriageId: "triage-abc123",
  relatedAlerts: [],
  discoveredEntities: [],
  // NEW optional fields — omitted to test optional semantics
  blastRadius: {
    affectedHosts: 1,
    affectedUsers: 1,
    assetCriticality: "medium",
    confidence: 0.7,
  },
  campaignAssessment: {
    likelyCampaign: false,
    clusteredTechniques: [],
    confidence: 0.2,
    reasoning: "Isolated incident",
  },
  caseRecommendation: {
    action: "create_new",
    confidence: 0.8,
    reasoning: "No existing case to merge into",
  },
  synthesis: {
    narrative: "Isolated brute force attempt with no related activity.",
    supportingEvidence: [],
    conflictingEvidence: [],
    missingEvidence: [],
    confidence: 0.65,
  },
};

const VALID_LIVING_CASE: Record<string, unknown> = {
  schemaVersion: "1.0",
  caseId: 42,
  lastUpdatedAt: "2025-01-15T12:10:00Z",
  lastUpdatedBy: "hypothesis_agent",
  workingTheory: {
    statement: "Automated brute force attack against SSH",
    confidence: 0.8,
    supportingEvidence: ["Multiple failed auth from same IP"],
    conflictingEvidence: [],
  },
  alternateTheories: [
    { statement: "Misconfigured service", confidence: 0.15, supportingEvidence: [], whyLessLikely: "Pattern matches attack" },
  ],
  completedPivots: [],
  evidenceGaps: [],
  suggestedNextSteps: [],
  recommendedActions: [
    {
      action: "Block source IP",
      category: "immediate",
      urgency: "immediate",
      requiresApproval: true,
      evidenceBasis: ["brute force pattern"],
      state: "proposed",
    },
  ],
  timelineSummary: [],
  linkedAlertIds: ["alert-001"],
  linkedTriageIds: ["triage-abc123"],
  linkedCorrelationIds: ["corr-abc123"],
  linkedEntities: [
    { type: "ip", value: "192.168.1.100", source: "wazuh_alert", confidence: 1.0 },
  ],
  draftDocumentation: {
    shiftHandoff: "SSH brute force investigation in progress",
  },
};

// ── TriageObject Tests ───────────────────────────────────────────────────

describe("TriageObjectSchema", () => {
  it("accepts a valid triage object", () => {
    const result = validateTriageObject(VALID_TRIAGE);
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const invalid = { ...VALID_TRIAGE, triageId: undefined };
    const result = validateTriageObject(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects invalid severity enum", () => {
    const invalid = { ...VALID_TRIAGE, severity: "extreme" };
    const result = validateTriageObject(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects confidence out of bounds", () => {
    const invalid = { ...VALID_TRIAGE, severityConfidence: 1.5 };
    const result = validateTriageObject(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects negative confidence", () => {
    const invalid = { ...VALID_TRIAGE, severityConfidence: -0.1 };
    const result = validateTriageObject(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects invalid route enum", () => {
    const invalid = { ...VALID_TRIAGE, route: "E_UNKNOWN" };
    const result = validateTriageObject(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects ruleLevel > 15", () => {
    const invalid = { ...VALID_TRIAGE, ruleLevel: 16 };
    const result = validateTriageObject(invalid);
    expect(result.success).toBe(false);
  });

  it("assertValidTriageObject throws on invalid data", () => {
    expect(() => assertValidTriageObject({})).toThrow("TriageObject validation failed");
  });

  it("assertValidTriageObject passes on valid data", () => {
    expect(() => assertValidTriageObject(VALID_TRIAGE)).not.toThrow();
  });

  it("includes field paths in error messages", () => {
    const result = validateTriageObject({ ...VALID_TRIAGE, severity: 123 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("severity");
    }
  });
});

// ── CorrelationBundle Tests ──────────────────────────────────────────────

describe("CorrelationBundleSchema", () => {
  it("accepts a valid correlation bundle with optional fields omitted", () => {
    const result = validateCorrelationBundle(VALID_CORRELATION);
    expect(result.success).toBe(true);
  });

  it("accepts a correlation bundle with optional context arrays present", () => {
    const withContext = {
      ...VALID_CORRELATION,
      vulnerabilityContext: [{ cveId: "CVE-2024-1234", severity: "high", name: "Test Vuln", relevance: 0.9 }],
      fimContext: [{ path: "/etc/passwd", event: "modified", timestamp: "2025-01-15T12:00:00Z", relevance: 0.8 }],
      threatIntelMatches: [{ ioc: "1.2.3.4", iocType: "ip", source: "OTX", confidence: 0.7 }],
      priorInvestigations: [{ investigationId: 1, title: "Prior SSH attack", status: "active", linkReason: "Same IP", relevance: 0.85 }],
    };
    const result = validateCorrelationBundle(withContext);
    expect(result.success).toBe(true);
  });

  it("accepts optional affectedAgentIds in blastRadius", () => {
    const withAgentIds = {
      ...VALID_CORRELATION,
      blastRadius: { ...VALID_CORRELATION.blastRadius as object, affectedAgentIds: ["001", "002"] },
    };
    const result = validateCorrelationBundle(withAgentIds);
    expect(result.success).toBe(true);
  });

  it("validates blastRadius.affectedHosts as number, not string[]", () => {
    const invalid = {
      ...VALID_CORRELATION,
      blastRadius: { ...VALID_CORRELATION.blastRadius as object, affectedHosts: ["host1"] },
    };
    const result = validateCorrelationBundle(invalid);
    expect(result.success).toBe(false);
  });

  it("validates blastRadius.affectedUsers as number, not string[]", () => {
    const invalid = {
      ...VALID_CORRELATION,
      blastRadius: { ...VALID_CORRELATION.blastRadius as object, affectedUsers: ["user1"] },
    };
    const result = validateCorrelationBundle(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects invalid caseRecommendation action", () => {
    const invalid = {
      ...VALID_CORRELATION,
      caseRecommendation: { ...VALID_CORRELATION.caseRecommendation as object, action: "delete" },
    };
    const result = validateCorrelationBundle(invalid);
    expect(result.success).toBe(false);
  });

  it("assertValidCorrelationBundle throws on invalid data", () => {
    expect(() => assertValidCorrelationBundle({})).toThrow("CorrelationBundle validation failed");
  });
});

// ── LivingCaseObject Tests ───────────────────────────────────────────────

describe("LivingCaseObjectSchema", () => {
  it("accepts a valid living case object", () => {
    const result = validateLivingCaseObject(VALID_LIVING_CASE);
    expect(result.success).toBe(true);
  });

  it("accepts optional recommendedActionIds", () => {
    const withIds = { ...VALID_LIVING_CASE, recommendedActionIds: ["ra-001", "ra-002"] };
    const result = validateLivingCaseObject(withIds);
    expect(result.success).toBe(true);
  });

  it("accepts optional actionSummary", () => {
    const withSummary = {
      ...VALID_LIVING_CASE,
      actionSummary: { total: 1, proposed: 1, approved: 0, rejected: 0, executed: 0, deferred: 0 },
    };
    const result = validateLivingCaseObject(withSummary);
    expect(result.success).toBe(true);
  });

  it("rejects invalid recommendedActions category", () => {
    const invalid = {
      ...VALID_LIVING_CASE,
      recommendedActions: [
        { ...((VALID_LIVING_CASE.recommendedActions as unknown[])[0] as object), category: "urgent" },
      ],
    };
    const result = validateLivingCaseObject(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects invalid recommendedActions state", () => {
    const invalid = {
      ...VALID_LIVING_CASE,
      recommendedActions: [
        { ...((VALID_LIVING_CASE.recommendedActions as unknown[])[0] as object), state: "cancelled" },
      ],
    };
    const result = validateLivingCaseObject(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects invalid lastUpdatedBy", () => {
    const invalid = { ...VALID_LIVING_CASE, lastUpdatedBy: "unknown_agent" };
    const result = validateLivingCaseObject(invalid);
    expect(result.success).toBe(false);
  });

  it("assertValidLivingCaseObject throws on invalid data", () => {
    expect(() => assertValidLivingCaseObject({})).toThrow("LivingCaseObject validation failed");
  });

  it("confidence bounds are enforced at 0.0-1.0", () => {
    const invalidHigh = {
      ...VALID_LIVING_CASE,
      workingTheory: { ...VALID_LIVING_CASE.workingTheory as object, confidence: 2.0 },
    };
    expect(validateLivingCaseObject(invalidHigh).success).toBe(false);

    const invalidLow = {
      ...VALID_LIVING_CASE,
      workingTheory: { ...VALID_LIVING_CASE.workingTheory as object, confidence: -1 },
    };
    expect(validateLivingCaseObject(invalidLow).success).toBe(false);
  });
});
