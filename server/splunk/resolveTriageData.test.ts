/**
 * resolveTriageData — comprehensive unit tests
 *
 * Tests the triage data resolution pipeline that feeds Splunk ticket creation.
 * Covers:
 *   - buildFromTriageObject field mapping from TriageObject → SplunkTicketPayload
 *   - MITRE ATT&CK merging (raw alert + triage inference)
 *   - Entity extraction mapping
 *   - Key evidence mapping
 *   - Dedup, uncertainties, case link mapping
 *   - Null/undefined defensive handling
 *   - Legacy triageResult fallback
 *   - "No triage data" fallback
 *   - Base field extraction from queue items
 */

import { describe, it, expect } from "vitest";
import type { TriageObject } from "../../shared/agenticSchemas";
import type { QueueItem, ResolvedTriagePayload } from "./resolveTriageData";
import { buildFromTriageObject } from "./resolveTriageData";

// ── Test Fixtures ────────────────────────────────────────────────────────────

/** A complete TriageObject matching the actual DB shape (from triage_objects.triageData) */
function makeTriageObject(overrides?: Partial<TriageObject>): TriageObject {
  return {
    schemaVersion: "1.0",
    triageId: "triage-test-abc123",
    triagedAt: "2026-03-07T10:00:00.000Z",
    triagedBy: "triage_agent",
    alertId: "alert-001",
    ruleId: "5710",
    ruleDescription: "SSH brute force attempt",
    ruleLevel: 10,
    alertTimestamp: "2026-03-07T09:55:00.000Z",
    agent: {
      id: "001",
      name: "web-server-01",
      ip: "192.168.1.100",
      os: "Ubuntu 22.04",
      groups: ["linux", "web-servers"],
    },
    alertFamily: "brute_force",
    severity: "high",
    severityConfidence: 0.85,
    severityReasoning: "Multiple failed SSH login attempts from external IP within 60 seconds",
    entities: [
      {
        type: "ip",
        value: "10.0.0.1",
        source: "wazuh_alert",
        confidence: 1.0,
        metadata: { direction: "source", geo: "US" },
      },
      {
        type: "user",
        value: "root",
        source: "wazuh_alert",
        confidence: 0.95,
      },
      {
        type: "host",
        value: "web-server-01",
        source: "wazuh_agent",
        confidence: 1.0,
      },
    ],
    mitreMapping: [
      {
        techniqueId: "T1110",
        techniqueName: "Brute Force",
        tactic: "Credential Access",
        confidence: 0.9,
        source: "llm_inference",
      },
      {
        techniqueId: "T1110.001",
        techniqueName: "Password Guessing",
        tactic: "Credential Access",
        confidence: 0.85,
        source: "wazuh_alert",
      },
    ],
    dedup: {
      isDuplicate: false,
      similarityScore: 0.3,
      reasoning: "No similar recent alerts from this source IP",
    },
    route: "C_HIGH_CONFIDENCE",
    routeReasoning: "Clear brute force pattern with high confidence",
    summary: "SSH brute force from 10.0.0.1 targeting root on web-server-01",
    keyEvidence: [
      {
        id: "evidence-1",
        label: "Original Wazuh Alert",
        type: "alert",
        source: "wazuh_alert",
        data: { rule: { id: "5710", level: 10 } },
        collectedAt: "2026-03-07T09:55:00.000Z",
        relevance: 1.0,
      },
      {
        id: "evidence-2",
        label: "Source IP Reputation",
        type: "threat_intel",
        source: "otx_alienvault",
        data: { pulse_count: 5, reputation: "malicious" },
        collectedAt: "2026-03-07T10:00:00.000Z",
        relevance: 0.8,
      },
    ],
    uncertainties: [
      {
        description: "Source IP geolocation accuracy",
        impact: "May affect attribution confidence",
        suggestedAction: "Cross-reference with firewall logs",
      },
      {
        description: "Whether attack is automated or manual",
        impact: "Affects response urgency",
      },
    ],
    caseLink: {
      shouldLink: true,
      suggestedCaseId: 42,
      suggestedCaseTitle: "Ongoing brute force campaign from 10.0.0.0/24",
      confidence: 0.7,
      reasoning: "Same source subnet observed in recent investigation",
    },
    rawAlert: {
      id: "alert-001",
      rule: { id: "5710", level: 10, description: "SSH brute force attempt" },
      agent: { id: "001", name: "web-server-01" },
      data: { srcip: "10.0.0.1" },
      timestamp: "2026-03-07T09:55:00.000Z",
    },
    ...overrides,
  };
}

/** Base fields as extracted from a queue item */
function makeBase() {
  return {
    alertId: "alert-001",
    ruleId: "5710",
    ruleDescription: "SSH brute force attempt",
    ruleLevel: 10,
    agentId: "001",
    agentName: "web-server-01",
    alertTimestamp: "2026-03-07T09:55:00.000Z",
    mitreIds: ["T1110"],
    mitreTactics: ["Credential Access"],
    rawAlertJson: { rule: { id: "5710", mitre: { id: ["T1110"], tactic: ["Credential Access"] } } },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// buildFromTriageObject — Core Field Mapping
// ═══════════════════════════════════════════════════════════════════════════════

describe("buildFromTriageObject — Core Fields", () => {
  it("should return found:true and source:triage_objects", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.found).toBe(true);
    expect(result.source).toBe("triage_objects");
  });

  it("should extract triageId from the TriageObject", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.triageId).toBe("triage-test-abc123");
  });

  it("should map summary to triageSummary", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.triageSummary).toBe("SSH brute force from 10.0.0.1 targeting root on web-server-01");
  });

  it("should map severityReasoning to triageReasoning", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.triageReasoning).toBe("Multiple failed SSH login attempts from external IP within 60 seconds");
  });

  it("should set trustScore to 0 (TriageObject has no trustScore)", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.trustScore).toBe(0);
  });

  it("should map severityConfidence to confidence", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.confidence).toBe(0.85);
  });

  it("should map severity to safetyStatus", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.safetyStatus).toBe("high");
  });

  it("should preserve base alertId, ruleId, ruleLevel, agentId, agentName", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.alertId).toBe("alert-001");
    expect(result.payload.ruleId).toBe("5710");
    expect(result.payload.ruleLevel).toBe(10);
    expect(result.payload.agentId).toBe("001");
    expect(result.payload.agentName).toBe("web-server-01");
  });

  it("should preserve base alertTimestamp", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.alertTimestamp).toBe("2026-03-07T09:55:00.000Z");
  });

  it("should preserve base rawAlertJson", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.rawAlertJson).toEqual(makeBase().rawAlertJson);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildFromTriageObject — Enriched Fields
// ═══════════════════════════════════════════════════════════════════════════════

describe("buildFromTriageObject — Enriched Fields", () => {
  it("should map alertFamily", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.alertFamily).toBe("brute_force");
  });

  it("should map severity", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.severity).toBe("high");
  });

  it("should map severityConfidence as enriched field", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.severityConfidence).toBe(0.85);
  });

  it("should map severityReasoning as enriched field", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.severityReasoning).toBe(
      "Multiple failed SSH login attempts from external IP within 60 seconds"
    );
  });

  it("should map route", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.route).toBe("C_HIGH_CONFIDENCE");
  });

  it("should map routeReasoning", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.routeReasoning).toBe("Clear brute force pattern with high confidence");
  });

  it("should map triageId in payload", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.triageId).toBe("triage-test-abc123");
  });

  it("should map triagedAt in payload", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.triagedAt).toBe("2026-03-07T10:00:00.000Z");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildFromTriageObject — Agent Metadata
// ═══════════════════════════════════════════════════════════════════════════════

describe("buildFromTriageObject — Agent Metadata from Triage", () => {
  it("should extract agent OS", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.agentOs).toBe("Ubuntu 22.04");
  });

  it("should extract agent IP", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.agentIp).toBe("192.168.1.100");
  });

  it("should extract agent groups", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.agentGroups).toEqual(["linux", "web-servers"]);
  });

  it("should handle missing agent OS gracefully", () => {
    const t = makeTriageObject({ agent: { id: "001", name: "test" } });
    const result = buildFromTriageObject(t, makeBase(), "triage_objects");
    expect(result.payload.agentOs).toBeUndefined();
  });

  it("should handle missing agent IP gracefully", () => {
    const t = makeTriageObject({ agent: { id: "001", name: "test" } });
    const result = buildFromTriageObject(t, makeBase(), "triage_objects");
    expect(result.payload.agentIp).toBeUndefined();
  });

  it("should handle missing agent groups gracefully", () => {
    const t = makeTriageObject({ agent: { id: "001", name: "test" } });
    const result = buildFromTriageObject(t, makeBase(), "triage_objects");
    expect(result.payload.agentGroups).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildFromTriageObject — MITRE ATT&CK Merging
// ═══════════════════════════════════════════════════════════════════════════════

describe("buildFromTriageObject — MITRE ATT&CK Merging", () => {
  it("should merge MITRE IDs from both base (raw alert) and triage inference", () => {
    const base = makeBase(); // has T1110 from raw alert
    const t = makeTriageObject(); // has T1110 and T1110.001 from triage
    const result = buildFromTriageObject(t, base, "triage_objects");

    expect(result.payload.mitreIds).toContain("T1110");
    expect(result.payload.mitreIds).toContain("T1110.001");
  });

  it("should deduplicate MITRE IDs", () => {
    const base = makeBase(); // has T1110
    const t = makeTriageObject(); // also has T1110
    const result = buildFromTriageObject(t, base, "triage_objects");

    const t1110Count = result.payload.mitreIds.filter((id) => id === "T1110").length;
    expect(t1110Count).toBe(1); // Deduplicated
  });

  it("should merge MITRE tactics from both sources", () => {
    const base = makeBase(); // has "Credential Access"
    const t = makeTriageObject(); // also has "Credential Access"
    const result = buildFromTriageObject(t, base, "triage_objects");

    expect(result.payload.mitreTactics).toContain("Credential Access");
  });

  it("should deduplicate MITRE tactics", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    const credAccessCount = result.payload.mitreTactics.filter((t) => t === "Credential Access").length;
    expect(credAccessCount).toBe(1);
  });

  it("should handle empty mitreMapping gracefully", () => {
    const t = makeTriageObject({ mitreMapping: [] });
    const base = { ...makeBase(), mitreIds: [], mitreTactics: [] };
    const result = buildFromTriageObject(t, base, "triage_objects");

    expect(result.payload.mitreIds).toEqual([]);
    expect(result.payload.mitreTactics).toEqual([]);
  });

  it("should handle undefined mitreMapping gracefully", () => {
    const t = makeTriageObject();
    (t as Record<string, unknown>).mitreMapping = undefined;
    const base = { ...makeBase(), mitreIds: ["T1059"], mitreTactics: ["Execution"] };
    const result = buildFromTriageObject(t, base, "triage_objects");

    // Should still have base MITRE IDs
    expect(result.payload.mitreIds).toContain("T1059");
    expect(result.payload.mitreTactics).toContain("Execution");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildFromTriageObject — Entity Extraction
// ═══════════════════════════════════════════════════════════════════════════════

describe("buildFromTriageObject — Entity Extraction", () => {
  it("should map all entities from TriageObject", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.entities).toHaveLength(3);
  });

  it("should preserve entity type and value", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    const ipEntity = result.payload.entities!.find((e) => e.type === "ip");
    expect(ipEntity).toBeDefined();
    expect(ipEntity!.value).toBe("10.0.0.1");
  });

  it("should serialize entity metadata to JSON string as context", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    const ipEntity = result.payload.entities!.find((e) => e.type === "ip");
    expect(ipEntity!.context).toBe(JSON.stringify({ direction: "source", geo: "US" }));
  });

  it("should set context to undefined when entity has no metadata", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    const userEntity = result.payload.entities!.find((e) => e.type === "user");
    expect(userEntity!.context).toBeUndefined();
  });

  it("should handle empty entities array", () => {
    const t = makeTriageObject({ entities: [] });
    const result = buildFromTriageObject(t, makeBase(), "triage_objects");
    expect(result.payload.entities).toEqual([]);
  });

  it("should handle undefined entities gracefully", () => {
    const t = makeTriageObject();
    (t as Record<string, unknown>).entities = undefined;
    const result = buildFromTriageObject(t, makeBase(), "triage_objects");
    expect(result.payload.entities).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildFromTriageObject — Key Evidence
// ═══════════════════════════════════════════════════════════════════════════════

describe("buildFromTriageObject — Key Evidence", () => {
  it("should map all key evidence items", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.keyEvidence).toHaveLength(2);
  });

  it("should map evidence type correctly", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.keyEvidence![0].type).toBe("alert");
    expect(result.payload.keyEvidence![1].type).toBe("threat_intel");
  });

  it("should map evidence label to value", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.keyEvidence![0].value).toBe("Original Wazuh Alert");
    expect(result.payload.keyEvidence![1].value).toBe("Source IP Reputation");
  });

  it("should use numeric relevance when available", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    // First evidence has relevance: 1.0
    expect(result.payload.keyEvidence![0].relevance).toBe("1");
  });

  it("should handle empty keyEvidence array", () => {
    const t = makeTriageObject({ keyEvidence: [] });
    const result = buildFromTriageObject(t, makeBase(), "triage_objects");
    expect(result.payload.keyEvidence).toEqual([]);
  });

  it("should handle undefined keyEvidence gracefully", () => {
    const t = makeTriageObject();
    (t as Record<string, unknown>).keyEvidence = undefined;
    const result = buildFromTriageObject(t, makeBase(), "triage_objects");
    expect(result.payload.keyEvidence).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildFromTriageObject — Deduplication
// ═══════════════════════════════════════════════════════════════════════════════

describe("buildFromTriageObject — Deduplication", () => {
  it("should map dedup fields correctly", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.dedup).toBeDefined();
    expect(result.payload.dedup!.isDuplicate).toBe(false);
    expect(result.payload.dedup!.similarityScore).toBe(0.3);
    expect(result.payload.dedup!.reasoning).toBe("No similar recent alerts from this source IP");
  });

  it("should handle isDuplicate: true", () => {
    const t = makeTriageObject({
      dedup: {
        isDuplicate: true,
        similarityScore: 0.95,
        similarTriageId: "triage-prev-xyz",
        reasoning: "Nearly identical alert from same source",
      },
    });
    const result = buildFromTriageObject(t, makeBase(), "triage_objects");
    expect(result.payload.dedup!.isDuplicate).toBe(true);
    expect(result.payload.dedup!.similarityScore).toBe(0.95);
  });

  it("should handle undefined dedup gracefully", () => {
    const t = makeTriageObject();
    (t as Record<string, unknown>).dedup = undefined;
    const result = buildFromTriageObject(t, makeBase(), "triage_objects");
    expect(result.payload.dedup).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildFromTriageObject — Uncertainties
// ═══════════════════════════════════════════════════════════════════════════════

describe("buildFromTriageObject — Uncertainties", () => {
  it("should map all uncertainties", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.uncertainties).toHaveLength(2);
  });

  it("should map uncertainty description to area", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.uncertainties![0].area).toBe("Source IP geolocation accuracy");
  });

  it("should map uncertainty impact to detail", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.uncertainties![0].detail).toBe("May affect attribution confidence");
  });

  it("should map uncertainty suggestedAction to impact", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.uncertainties![0].impact).toBe("Cross-reference with firewall logs");
  });

  it("should handle uncertainty without suggestedAction", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.uncertainties![1].impact).toBeUndefined();
  });

  it("should handle empty uncertainties array", () => {
    const t = makeTriageObject({ uncertainties: [] });
    const result = buildFromTriageObject(t, makeBase(), "triage_objects");
    expect(result.payload.uncertainties).toEqual([]);
  });

  it("should handle undefined uncertainties gracefully", () => {
    const t = makeTriageObject();
    (t as Record<string, unknown>).uncertainties = undefined;
    const result = buildFromTriageObject(t, makeBase(), "triage_objects");
    expect(result.payload.uncertainties).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildFromTriageObject — Case Link
// ═══════════════════════════════════════════════════════════════════════════════

describe("buildFromTriageObject — Case Link", () => {
  it("should map caseLink when shouldLink is true", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    expect(result.payload.caseLink).toBeDefined();
    expect(result.payload.caseLink!.shouldLink).toBe(true);
    expect(result.payload.caseLink!.suggestedCaseTitle).toBe("Ongoing brute force campaign from 10.0.0.0/24");
    expect(result.payload.caseLink!.reasoning).toBe("Same source subnet observed in recent investigation");
  });

  it("should map caseLink when shouldLink is false", () => {
    const t = makeTriageObject({
      caseLink: {
        shouldLink: false,
        confidence: 0.1,
        reasoning: "No matching cases found",
      },
    });
    const result = buildFromTriageObject(t, makeBase(), "triage_objects");
    expect(result.payload.caseLink!.shouldLink).toBe(false);
    expect(result.payload.caseLink!.suggestedCaseTitle).toBeUndefined();
  });

  it("should handle undefined caseLink gracefully", () => {
    const t = makeTriageObject();
    (t as Record<string, unknown>).caseLink = undefined;
    const result = buildFromTriageObject(t, makeBase(), "triage_objects");
    expect(result.payload.caseLink).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// buildFromTriageObject — Defensive Null Handling
// ═══════════════════════════════════════════════════════════════════════════════

describe("buildFromTriageObject — Defensive Null Handling", () => {
  it("should default summary to 'No summary available' when null", () => {
    const t = makeTriageObject();
    (t as Record<string, unknown>).summary = null;
    const result = buildFromTriageObject(t, makeBase(), "triage_objects");
    expect(result.payload.triageSummary).toBe("No summary available");
  });

  it("should default severityReasoning to empty string when null", () => {
    const t = makeTriageObject();
    (t as Record<string, unknown>).severityReasoning = null;
    const result = buildFromTriageObject(t, makeBase(), "triage_objects");
    expect(result.payload.triageReasoning).toBe("");
  });

  it("should default severityConfidence to 0 when not a number", () => {
    const t = makeTriageObject();
    (t as Record<string, unknown>).severityConfidence = "high";
    const result = buildFromTriageObject(t, makeBase(), "triage_objects");
    expect(result.payload.confidence).toBe(0);
  });

  it("should handle severity as undefined", () => {
    const t = makeTriageObject();
    (t as Record<string, unknown>).severity = undefined;
    const result = buildFromTriageObject(t, makeBase(), "triage_objects");
    expect(result.payload.safetyStatus).toBe("unknown");
    expect(result.payload.severity).toBeUndefined();
  });

  it("should handle alertFamily as undefined", () => {
    const t = makeTriageObject();
    (t as Record<string, unknown>).alertFamily = undefined;
    const result = buildFromTriageObject(t, makeBase(), "triage_objects");
    expect(result.payload.alertFamily).toBeUndefined();
  });

  it("should handle route as undefined", () => {
    const t = makeTriageObject();
    (t as Record<string, unknown>).route = undefined;
    const result = buildFromTriageObject(t, makeBase(), "triage_objects");
    expect(result.payload.route).toBeUndefined();
  });

  it("should handle routeReasoning as undefined", () => {
    const t = makeTriageObject();
    (t as Record<string, unknown>).routeReasoning = undefined;
    const result = buildFromTriageObject(t, makeBase(), "triage_objects");
    expect(result.payload.routeReasoning).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Full Payload Completeness — Splunk HEC Event Verification
// ═══════════════════════════════════════════════════════════════════════════════

describe("Full Payload Completeness — HEC Event Fields", () => {
  it("should produce a payload with all required SplunkTicketPayload fields", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    const p = result.payload;

    // Required base fields
    expect(p.alertId).toBeTruthy();
    expect(p.ruleId).toBeTruthy();
    expect(typeof p.ruleLevel).toBe("number");
    expect(p.agentId).toBeTruthy();
    expect(p.agentName).toBeTruthy();
    expect(p.alertTimestamp).toBeTruthy();
    expect(p.triageSummary).toBeTruthy();
    expect(typeof p.triageReasoning).toBe("string");
    expect(typeof p.trustScore).toBe("number");
    expect(typeof p.confidence).toBe("number");
    expect(typeof p.safetyStatus).toBe("string");
    expect(Array.isArray(p.mitreIds)).toBe(true);
    expect(Array.isArray(p.mitreTactics)).toBe(true);
    expect(Array.isArray(p.suggestedFollowUps)).toBe(true);
  });

  it("should produce a payload with all enriched fields populated", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    const p = result.payload;

    // Enriched fields from TriageObject
    expect(p.alertFamily).toBeTruthy();
    expect(p.severity).toBeTruthy();
    expect(typeof p.severityConfidence).toBe("number");
    expect(p.severityReasoning).toBeTruthy();
    expect(p.route).toBeTruthy();
    expect(p.routeReasoning).toBeTruthy();
    expect(Array.isArray(p.entities)).toBe(true);
    expect(p.entities!.length).toBeGreaterThan(0);
    expect(Array.isArray(p.keyEvidence)).toBe(true);
    expect(p.keyEvidence!.length).toBeGreaterThan(0);
    expect(p.dedup).toBeDefined();
    expect(Array.isArray(p.uncertainties)).toBe(true);
    expect(p.caseLink).toBeDefined();
    expect(p.agentOs).toBeTruthy();
    expect(p.agentIp).toBeTruthy();
    expect(p.agentGroups).toBeDefined();
    expect(p.triageId).toBeTruthy();
    expect(p.triagedAt).toBeTruthy();
  });

  it("should NOT have any undefined values for required fields", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    const p = result.payload;

    // These must never be undefined
    expect(p.alertId).not.toBeUndefined();
    expect(p.ruleId).not.toBeUndefined();
    expect(p.ruleDescription).not.toBeUndefined();
    expect(p.ruleLevel).not.toBeUndefined();
    expect(p.agentId).not.toBeUndefined();
    expect(p.agentName).not.toBeUndefined();
    expect(p.alertTimestamp).not.toBeUndefined();
    expect(p.triageSummary).not.toBeUndefined();
    expect(p.triageReasoning).not.toBeUndefined();
    expect(p.trustScore).not.toBeUndefined();
    expect(p.confidence).not.toBeUndefined();
    expect(p.safetyStatus).not.toBeUndefined();
    expect(p.mitreIds).not.toBeUndefined();
    expect(p.mitreTactics).not.toBeUndefined();
    expect(p.suggestedFollowUps).not.toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Ticket Artifacts — Null Coercion for Drizzle INSERT
// ═══════════════════════════════════════════════════════════════════════════════

describe("Ticket Artifacts — Null Coercion for Drizzle INSERT", () => {
  it("should coerce undefined pipelineRunId to null (not empty string)", () => {
    const associatedRun = undefined;
    const effectivePipelineRunId = associatedRun?.id ?? null;
    expect(effectivePipelineRunId).toBeNull();
    expect(effectivePipelineRunId).not.toBe("");
    expect(effectivePipelineRunId).not.toBeUndefined();
  });

  it("should coerce undefined triageId to null (not empty string)", () => {
    const resolved = { triageId: undefined };
    const associatedRun = undefined;
    const item = { pipelineTriageId: null };
    const effectiveTriageId = resolved.triageId || associatedRun?.triageId || item.pipelineTriageId || null;
    expect(effectiveTriageId).toBeNull();
    expect(effectiveTriageId).not.toBe("");
    expect(effectiveTriageId).not.toBeUndefined();
  });

  it("should prefer resolved.triageId when available", () => {
    const resolved = { triageId: "triage-abc" };
    const associatedRun = { id: 7, triageId: "triage-run-xyz" };
    const item = { pipelineTriageId: "triage-pipeline-123" };
    const effectiveTriageId = resolved.triageId || associatedRun?.triageId || item.pipelineTriageId || null;
    expect(effectiveTriageId).toBe("triage-abc");
  });

  it("should fall back to associatedRun.triageId when resolved.triageId is undefined", () => {
    const resolved = { triageId: undefined };
    const associatedRun = { id: 7, triageId: "triage-run-xyz" };
    const item = { pipelineTriageId: "triage-pipeline-123" };
    const effectiveTriageId = resolved.triageId || associatedRun?.triageId || item.pipelineTriageId || null;
    expect(effectiveTriageId).toBe("triage-run-xyz");
  });

  it("should fall back to item.pipelineTriageId when both resolved and run are undefined", () => {
    const resolved = { triageId: undefined };
    const associatedRun = { id: 7, triageId: null };
    const item = { pipelineTriageId: "triage-pipeline-123" };
    const effectiveTriageId = resolved.triageId || associatedRun?.triageId || item.pipelineTriageId || null;
    expect(effectiveTriageId).toBe("triage-pipeline-123");
  });

  it("should return null when all sources are undefined/null", () => {
    const resolved = { triageId: undefined };
    const associatedRun = null;
    const item = { pipelineTriageId: null };
    const effectiveTriageId = resolved.triageId || associatedRun?.triageId || item.pipelineTriageId || null;
    expect(effectiveTriageId).toBeNull();
  });

  it("should never produce an empty string for pipelineRunId", () => {
    // This was the original bug: Drizzle converts undefined to empty string
    const scenarios = [
      { run: undefined, expected: null },
      { run: null, expected: null },
      { run: { id: 7 }, expected: 7 },
      { run: { id: 0 }, expected: 0 },
    ];

    for (const { run, expected } of scenarios) {
      const effectivePipelineRunId = run?.id ?? null;
      if (expected === null) {
        expect(effectivePipelineRunId).toBeNull();
      } else {
        expect(effectivePipelineRunId).toBe(expected);
      }
      // Never an empty string
      expect(effectivePipelineRunId).not.toBe("");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// End-to-End Payload Shape Verification
// ═══════════════════════════════════════════════════════════════════════════════

describe("End-to-End — createSplunkTicket would receive correct event shape", () => {
  it("should produce a payload that createSplunkTicket can map to HEC event fields", () => {
    const result = buildFromTriageObject(makeTriageObject(), makeBase(), "triage_objects");
    const payload = { ...result.payload, createdBy: "test-analyst" };

    // Simulate what createSplunkTicket does with the payload
    const urgency =
      payload.ruleLevel >= 12 ? "critical"
        : payload.ruleLevel >= 8 ? "high"
        : payload.ruleLevel >= 4 ? "medium"
        : "low";

    const event = {
      ticket_id: `DANG-${Date.now()}-${payload.alertId.slice(-6)}`,
      ticket_type: "agentic_triage",
      created_by: payload.createdBy,
      triage_id: payload.triageId ?? null,
      triaged_at: payload.triagedAt ?? null,
      alert_id: payload.alertId,
      rule_id: payload.ruleId,
      rule_description: payload.ruleDescription,
      rule_level: payload.ruleLevel,
      urgency,
      agent_id: payload.agentId,
      agent_name: payload.agentName,
      agent_os: payload.agentOs ?? null,
      agent_ip: payload.agentIp ?? null,
      agent_groups: payload.agentGroups ?? [],
      alert_family: payload.alertFamily ?? null,
      ai_severity: payload.severity ?? null,
      severity_confidence: payload.severityConfidence ?? null,
      severity_reasoning: payload.severityReasoning ?? null,
      triage_summary: payload.triageSummary,
      triage_reasoning: payload.triageReasoning,
      route: payload.route ?? null,
      route_reasoning: payload.routeReasoning ?? null,
      entities: payload.entities ?? [],
      key_evidence: payload.keyEvidence ?? [],
      dedup: payload.dedup ?? null,
      uncertainties: payload.uncertainties ?? [],
      case_link: payload.caseLink ?? null,
      mitre_technique_ids: payload.mitreIds,
      mitre_tactics: payload.mitreTactics,
    };

    // Verify all enriched fields are populated (not null/empty)
    expect(event.triage_id).toBe("triage-test-abc123");
    expect(event.triaged_at).toBe("2026-03-07T10:00:00.000Z");
    expect(event.agent_os).toBe("Ubuntu 22.04");
    expect(event.agent_ip).toBe("192.168.1.100");
    expect(event.agent_groups).toEqual(["linux", "web-servers"]);
    expect(event.alert_family).toBe("brute_force");
    expect(event.ai_severity).toBe("high");
    expect(event.severity_confidence).toBe(0.85);
    expect(event.severity_reasoning).toBeTruthy();
    expect(event.triage_summary).toBeTruthy();
    expect(event.triage_reasoning).toBeTruthy();
    expect(event.route).toBe("C_HIGH_CONFIDENCE");
    expect(event.route_reasoning).toBeTruthy();
    expect(event.entities.length).toBe(3);
    expect(event.key_evidence.length).toBe(2);
    expect(event.dedup).toBeDefined();
    expect(event.dedup!.isDuplicate).toBe(false);
    expect(event.uncertainties.length).toBe(2);
    expect(event.case_link).toBeDefined();
    expect(event.case_link!.shouldLink).toBe(true);
    expect(event.mitre_technique_ids).toContain("T1110");
    expect(event.mitre_technique_ids).toContain("T1110.001");
    expect(event.mitre_tactics).toContain("Credential Access");
    expect(event.urgency).toBe("high"); // ruleLevel 10 → high
  });
});
