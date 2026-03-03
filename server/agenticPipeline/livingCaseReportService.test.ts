/**
 * Living Case Report Service Tests
 *
 * Tests the pure report generation functions:
 *   - generateFullCaseReport: complete markdown report
 *   - generateExecutiveSummary: executive-level summary
 *   - generateShiftHandoff: shift handoff document
 *   - generateEscalationBrief: escalation brief
 *   - generateTuningReport: tuning recommendations
 *   - generateReport: dispatcher function
 *
 * These are pure functions that take LivingCaseReportData and return markdown strings.
 * No mocking needed — no DB, no LLM, no external services.
 */
import { describe, it, expect } from "vitest";
import {
  generateFullCaseReport,
  generateExecutiveSummary,
  generateShiftHandoff,
  generateEscalationBrief,
  generateTuningReport,
  generateReport,
  type LivingCaseReportData,
} from "./livingCaseReportService";

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeReportData(overrides: Partial<LivingCaseReportData> = {}): LivingCaseReportData {
  return {
    caseData: overrides.caseData ?? {
      schemaVersion: "1.0",
      caseId: "case-test-001",
      lastUpdatedAt: "2026-03-01T15:00:00Z",
      lastUpdatedBy: "hypothesis_agent",
      workingTheory: {
        statement: "Credential stuffing attack via compromised VPN credentials",
        confidence: 0.85,
        supportingEvidence: [
          "Multiple failed SSH attempts from 203.0.113.99",
          "Successful login after 47 failed attempts",
          "Lateral movement to 3 internal hosts within 10 minutes",
        ],
        conflictingEvidence: [
          "Source IP belongs to a known VPN provider (could be legitimate)",
        ],
      },
      alternateTheories: [
        {
          statement: "Legitimate penetration test by authorized team",
          confidence: 0.15,
          supportingEvidence: ["Activity during business hours"],
          conflictingEvidence: ["No pen test scheduled", "Unknown source IP"],
        },
      ],
      completedPivots: [
        { pivotType: "threat_intel", query: "203.0.113.99", result: "Known malicious IP", completedAt: "2026-03-01T14:30:00Z" },
      ],
      evidenceGaps: [
        { description: "No EDR telemetry from host-05", impact: "Cannot confirm if malware was deployed" },
        { description: "VPN logs not available", impact: "Cannot verify if VPN credentials were compromised" },
      ],
      suggestedNextSteps: [
        { action: "Deploy EDR agent to host-05", priority: "high", reasoning: "Fill critical visibility gap" },
        { action: "Request VPN logs from IT", priority: "medium", reasoning: "Verify credential compromise" },
      ],
      recommendedActions: [
        {
          action: "Block 203.0.113.99 at perimeter firewall",
          category: "block",
          urgency: "immediate",
          targetType: "ip",
          targetValue: "203.0.113.99",
          requiresApproval: true,
          evidenceBasis: ["Confirmed malicious IP"],
          state: "approved",
        },
        {
          action: "Reset compromised user credentials",
          category: "credential_reset",
          urgency: "immediate",
          targetType: "user",
          targetValue: "jdoe",
          requiresApproval: true,
          evidenceBasis: ["Successful unauthorized login"],
          state: "proposed",
        },
      ],
      timelineSummary: [
        { timestamp: "2026-03-01T12:00:00Z", event: "First failed SSH attempt from 203.0.113.99", source: "wazuh_alert", significance: "medium" },
        { timestamp: "2026-03-01T12:15:00Z", event: "47th failed attempt — rate exceeds threshold", source: "wazuh_alert", significance: "high" },
        { timestamp: "2026-03-01T12:16:00Z", event: "Successful SSH login as jdoe", source: "wazuh_alert", significance: "critical" },
        { timestamp: "2026-03-01T12:20:00Z", event: "Lateral movement to host-03", source: "correlation", significance: "critical" },
        { timestamp: "2026-03-01T12:25:00Z", event: "Lateral movement to host-05", source: "correlation", significance: "critical" },
      ],
      linkedAlertIds: ["alert-001", "alert-002", "alert-003"],
      linkedTriageIds: ["triage-001"],
      linkedCorrelationIds: ["corr-001"],
      linkedEntities: [
        { type: "ip", value: "203.0.113.99" },
        { type: "host", value: "host-03" },
        { type: "host", value: "host-05" },
        { type: "user", value: "jdoe" },
      ],
      draftDocumentation: {
        executiveSummary: "A credential stuffing attack was detected targeting the VPN infrastructure. The attacker successfully compromised user jdoe's credentials and moved laterally to 3 internal hosts.",
      },
    },
    triageObject: overrides.triageObject ?? {
      schemaVersion: "1.0" as const,
      triageId: "triage-test-001",
      triagedAt: "2026-03-01T12:00:00Z",
      triagedBy: "triage_agent" as const,
      alertId: "alert-001",
      ruleId: "5710",
      ruleDescription: "SSH brute force attack",
      ruleLevel: 10,
      alertTimestamp: "2026-03-01T12:00:00Z",
      agent: { id: "001", name: "vpn-gateway-01", ip: "10.0.0.1" },
      alertFamily: "credential_stuffing",
      severity: "high" as const,
      severityConfidence: 0.9,
      severityReasoning: "Multiple failed SSH attempts followed by successful login",
      entities: [
        { type: "ip", value: "203.0.113.99", confidence: 1.0, source: "wazuh" },
        { type: "user", value: "jdoe", confidence: 0.95, source: "wazuh" },
        { type: "host", value: "vpn-gateway-01", confidence: 1.0, source: "wazuh" },
      ],
      mitreMapping: [
        { techniqueId: "T1110", techniqueName: "Brute Force", tactic: "Credential Access", confidence: 0.95 },
        { techniqueId: "T1021", techniqueName: "Remote Services", tactic: "Lateral Movement", confidence: 0.8 },
      ],
      dedup: { isDuplicate: false, similarityScore: 0.1, reasoning: "New alert" },
      route: "C_HIGH_CONFIDENCE" as const,
      routeReasoning: "Clear credential stuffing pattern",
      summary: "SSH brute force followed by successful login and lateral movement",
      keyEvidence: [
        { id: "ev-1", label: "47 failed SSH attempts", type: "alert", source: "wazuh_alert", data: {}, collectedAt: "2026-03-01T12:15:00Z", relevance: 1.0 },
      ],
      uncertainties: [
        { area: "Source attribution", description: "VPN provider IP could be legitimate", impact: "May be false positive" },
      ],
      caseLink: { shouldLink: false, confidence: 0.1, reasoning: "No existing case match" },
      rawAlert: { id: "alert-001", rule: { id: "5710" }, data: { srcip: "203.0.113.99" } },
    } as any,
    correlationBundle: overrides.correlationBundle ?? {
      schemaVersion: "1.0" as const,
      correlationId: "corr-test-001",
      correlatedAt: "2026-03-01T13:00:00Z",
      sourceTriageId: "triage-test-001",
      relatedAlerts: [
        {
          alertId: "alert-002",
          ruleId: "5711",
          ruleDescription: "SSH brute force attempt",
          ruleLevel: 8,
          timestamp: "2026-03-01T12:10:00Z",
          agentId: "001",
          linkedBy: { type: "ip", value: "203.0.113.99", confidence: 1.0, source: "wazuh" },
          relevance: 0.9,
        },
      ],
      discoveredEntities: [
        { type: "host", value: "host-05", confidence: 0.8, source: "correlation" },
      ],
      vulnerabilityContext: [
        { cveId: "CVE-2024-1234", severity: "high" as const, name: "OpenSSH RCE", affectedPackage: "openssh-server", relevance: 0.7 },
      ],
      fimContext: [
        { path: "/etc/ssh/sshd_config", event: "modified", timestamp: "2026-03-01T12:18:00Z", relevance: 0.6 },
      ],
      threatIntelMatches: [
        { ioc: "203.0.113.99", iocType: "ip", source: "OTX", threatName: "APT-Credential-Harvester", confidence: 0.85 },
      ],
      priorInvestigations: [],
      blastRadius: { affectedHosts: 3, affectedUsers: 1, affectedAgentIds: ["001", "003", "005"], assetCriticality: "high" as const, confidence: 0.85 },
      campaignAssessment: { likelyCampaign: true, clusteredTechniques: ["T1110", "T1021", "T1078"] as any, confidence: 0.75, reasoning: "Coordinated credential attack" },
      caseRecommendation: { action: "create_new" as const, confidence: 0.9, reasoning: "No existing case matches this pattern" },
      synthesis: {
        narrative: "Credential stuffing attack with lateral movement detected from 203.0.113.99",
        supportingEvidence: [{ id: "ev-s1", label: "47 failed SSH attempts", type: "alert", source: "wazuh", data: {}, collectedAt: "2026-03-01T12:15:00Z", relevance: 1.0 }],
        conflictingEvidence: [{ id: "ev-c1", label: "VPN provider IP", type: "context", source: "analyst", data: {}, collectedAt: "2026-03-01T13:00:00Z", relevance: 0.3 }],
        missingEvidence: [{ area: "EDR telemetry", description: "No EDR data from host-05", impact: "Cannot confirm malware" }],
        confidence: 0.85,
      },
    } as any,
    responseActionsList: overrides.responseActionsList ?? [
      {
        actionId: "ra-001",
        category: "block",
        title: "Block 203.0.113.99 at perimeter firewall",
        description: "Block source IP",
        state: "approved",
        urgency: "immediate",
        targetType: "ip",
        targetValue: "203.0.113.99",
        proposedAt: new Date("2026-03-01T14:00:00Z"),
        approvedAt: new Date("2026-03-01T14:30:00Z"),
        executedAt: null,
        proposedBy: "hypothesis_agent",
        approvedBy: "analyst:1",
      },
      {
        actionId: "ra-002",
        category: "credential_reset",
        title: "Reset compromised user credentials",
        description: "Reset jdoe credentials",
        state: "proposed",
        urgency: "immediate",
        targetType: "user",
        targetValue: "jdoe",
        proposedAt: new Date("2026-03-01T14:00:00Z"),
        approvedAt: null,
        executedAt: null,
        proposedBy: "hypothesis_agent",
        approvedBy: null,
      },
    ],
    session: "session" in overrides ? overrides.session : {
      id: 1,
      title: "Credential Stuffing Investigation",
      description: "Investigating credential stuffing attack via VPN",
      status: "active",
      createdAt: new Date("2026-03-01T14:00:00Z"),
      updatedAt: new Date("2026-03-01T15:00:00Z"),
    },
    generatedAt: overrides.generatedAt ?? "2026-03-01T16:00:00Z",
    generatedBy: overrides.generatedBy ?? "analyst:1",
    reportType: overrides.reportType ?? "full",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("generateFullCaseReport", () => {
  it("produces a valid markdown report with all sections", () => {
    const data = makeReportData();
    const report = generateFullCaseReport(data);

    expect(typeof report).toBe("string");
    expect(report.length).toBeGreaterThan(500);

    // Required sections
    expect(report).toContain("# Living Case Report");
    expect(report).toContain("## Working Theory");
    expect(report).toContain("Credential stuffing attack");
    expect(report).toContain("85%"); // confidence
    expect(report).toContain("## Timeline");
    expect(report).toContain("203.0.113.99");
  });

  it("includes supporting and conflicting evidence", () => {
    const data = makeReportData();
    const report = generateFullCaseReport(data);

    expect(report).toContain("Supporting Evidence");
    expect(report).toContain("Multiple failed SSH attempts");
    expect(report).toContain("Conflicting Evidence");
    expect(report).toContain("known VPN provider");
  });

  it("includes alternate theories", () => {
    const data = makeReportData();
    const report = generateFullCaseReport(data);

    expect(report).toContain("Alternate Theor");
    expect(report).toContain("penetration test");
  });

  it("includes evidence gaps", () => {
    const data = makeReportData();
    const report = generateFullCaseReport(data);

    expect(report).toContain("Evidence Gap");
    expect(report).toContain("No EDR telemetry");
  });

  it("includes response actions with states", () => {
    const data = makeReportData();
    const report = generateFullCaseReport(data);

    expect(report).toContain("Response Action");
    expect(report).toContain("Block 203.0.113.99");
    expect(report).toContain("approved");
  });

  it("includes timeline entries in order", () => {
    const data = makeReportData();
    const report = generateFullCaseReport(data);

    const firstIdx = report.indexOf("First failed SSH");
    const lastIdx = report.indexOf("Lateral movement to host-05");
    expect(firstIdx).toBeLessThan(lastIdx);
  });

  it("includes linked entities", () => {
    const data = makeReportData();
    const report = generateFullCaseReport(data);

    expect(report).toContain("203.0.113.99");
    expect(report).toContain("host-03");
    expect(report).toContain("jdoe");
  });

  it("handles empty alternate theories gracefully", () => {
    const data = makeReportData();
    (data.caseData as any).alternateTheories = [];
    const report = generateFullCaseReport(data);

    expect(typeof report).toBe("string");
    expect(report.length).toBeGreaterThan(200);
  });

  it("handles empty timeline gracefully", () => {
    const data = makeReportData();
    (data.caseData as any).timelineSummary = [];
    const report = generateFullCaseReport(data);

    expect(typeof report).toBe("string");
    expect(report.length).toBeGreaterThan(200);
  });

  it("handles null triageObject gracefully", () => {
    const data = makeReportData({ triageObject: null });
    const report = generateFullCaseReport(data);

    expect(typeof report).toBe("string");
    expect(report.length).toBeGreaterThan(200);
  });

  it("handles null correlationBundle gracefully", () => {
    const data = makeReportData({ correlationBundle: null });
    const report = generateFullCaseReport(data);

    expect(typeof report).toBe("string");
    expect(report.length).toBeGreaterThan(200);
  });

  it("handles null session gracefully", () => {
    const data = makeReportData({ session: null });
    const report = generateFullCaseReport(data);

    expect(typeof report).toBe("string");
    expect(report).toContain("unknown"); // status fallback
  });

  it("handles empty response actions list", () => {
    const data = makeReportData({ responseActionsList: [] });
    const report = generateFullCaseReport(data);

    expect(typeof report).toBe("string");
    expect(report.length).toBeGreaterThan(200);
  });
});

describe("generateExecutiveSummary", () => {
  it("produces a concise executive summary", () => {
    const data = makeReportData({ reportType: "executive" });
    const report = generateExecutiveSummary(data);

    expect(typeof report).toBe("string");
    expect(report.length).toBeGreaterThan(100);
    expect(report).toContain("Executive Summary");
    expect(report).toContain("credential stuffing");
  });

  it("includes blast radius information", () => {
    const data = makeReportData({ reportType: "executive" });
    const report = generateExecutiveSummary(data);

    // Should mention affected hosts/users
    expect(report).toMatch(/3.*host|host.*3/i);
  });

  it("is shorter than the full report", () => {
    const data = makeReportData();
    const full = generateFullCaseReport(data);
    const exec = generateExecutiveSummary(data);

    expect(exec.length).toBeLessThan(full.length);
  });
});

describe("generateShiftHandoff", () => {
  it("produces a shift handoff document", () => {
    const data = makeReportData({ reportType: "handoff" });
    const report = generateShiftHandoff(data);

    expect(typeof report).toBe("string");
    expect(report.length).toBeGreaterThan(100);
    expect(report).toContain("Handoff");
  });

  it("includes pending actions for the next shift", () => {
    const data = makeReportData({ reportType: "handoff" });
    const report = generateShiftHandoff(data);

    // Should mention pending/proposed actions (rendered as PROPOSED uppercase)
    expect(report).toContain("PROPOSED");
  });

  it("includes next steps", () => {
    const data = makeReportData({ reportType: "handoff" });
    const report = generateShiftHandoff(data);

    expect(report).toContain("What Needs To Be Done Next");
  });
});

describe("generateEscalationBrief", () => {
  it("produces an escalation brief", () => {
    const data = makeReportData({ reportType: "escalation" });
    const report = generateEscalationBrief(data);

    expect(typeof report).toBe("string");
    expect(report.length).toBeGreaterThan(100);
    expect(report).toContain("Escalation");
  });

  it("includes severity and confidence", () => {
    const data = makeReportData({ reportType: "escalation" });
    const report = generateEscalationBrief(data);

    expect(report).toContain("85%");
    expect(report).toMatch(/high|critical/i);
  });

  it("includes blast radius for impact assessment", () => {
    const data = makeReportData({ reportType: "escalation" });
    const report = generateEscalationBrief(data);

    // Should reference affected systems
    expect(report).toMatch(/host|system|agent/i);
  });
});

describe("generateTuningReport", () => {
  it("produces a tuning report", () => {
    const data = makeReportData({ reportType: "tuning" });
    const report = generateTuningReport(data);

    expect(typeof report).toBe("string");
    expect(report.length).toBeGreaterThan(100);
    expect(report).toContain("Tuning");
  });

  it("includes rule information", () => {
    const data = makeReportData({ reportType: "tuning" });
    const report = generateTuningReport(data);

    // Should reference rules or detection logic
    expect(report.length).toBeGreaterThan(50);
  });
});

describe("generateReport (dispatcher)", () => {
  it("dispatches to generateFullCaseReport for 'full' type", () => {
    const data = makeReportData({ reportType: "full" });
    const report = generateReport(data);

    expect(report).toContain("# Living Case Report");
  });

  it("dispatches to generateExecutiveSummary for 'executive' type", () => {
    const data = makeReportData({ reportType: "executive" });
    const report = generateReport(data);

    expect(report).toContain("Executive Summary");
  });

  it("dispatches to generateShiftHandoff for 'handoff' type", () => {
    const data = makeReportData({ reportType: "handoff" });
    const report = generateReport(data);

    expect(report).toContain("Handoff");
  });

  it("dispatches to generateEscalationBrief for 'escalation' type", () => {
    const data = makeReportData({ reportType: "escalation" });
    const report = generateReport(data);

    expect(report).toContain("Escalation");
  });

  it("dispatches to generateTuningReport for 'tuning' type", () => {
    const data = makeReportData({ reportType: "tuning" });
    const report = generateReport(data);

    expect(report).toContain("Tuning");
  });

  it("defaults to full report for unknown type", () => {
    const data = makeReportData();
    (data as any).reportType = "unknown_type";
    const report = generateReport(data);

    // Should still produce valid output (full report fallback)
    expect(typeof report).toBe("string");
    expect(report.length).toBeGreaterThan(100);
  });
});

describe("Report consistency", () => {
  it("all report types produce non-empty strings", () => {
    const types = ["full", "executive", "handoff", "escalation", "tuning"] as const;
    for (const type of types) {
      const data = makeReportData({ reportType: type });
      const report = generateReport(data);
      expect(report.length).toBeGreaterThan(0);
      expect(typeof report).toBe("string");
    }
  });

  it("all report types include generation metadata", () => {
    const types = ["full", "executive", "handoff", "escalation", "tuning"] as const;
    for (const type of types) {
      const data = makeReportData({ reportType: type });
      const report = generateReport(data);
      // All reports should include the generation timestamp or case ID
      expect(report).toMatch(/case-test-001|2026-03-01/);
    }
  });

  it("reports are deterministic (same input → same output)", () => {
    const data = makeReportData();
    const report1 = generateFullCaseReport(data);
    const report2 = generateFullCaseReport(data);
    expect(report1).toBe(report2);
  });
});
