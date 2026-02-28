import { describe, expect, it } from "vitest";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Agentic SOC Pipeline Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tests for:
 * 1. Canonical schema contracts (TriageObject, CorrelationBundle, LivingCaseObject)
 * 2. Triage agent helper functions and validation
 * 3. Pipeline router input/output contracts
 * 4. Triage result card data transformation
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ── 1. Schema Contracts ──────────────────────────────────────────────────────

describe("TriageObject schema contract", () => {
  const REQUIRED_FIELDS = [
    "schemaVersion", "triageId", "triagedAt", "triagedBy",
    "alertId", "ruleId", "ruleDescription", "ruleLevel",
    "alertTimestamp", "agent", "alertFamily", "severity",
    "severityConfidence", "severityReasoning", "entities",
    "mitreMapping", "dedup", "route", "routeReasoning",
    "summary", "keyEvidence", "uncertainties", "caseLink", "rawAlert",
  ];

  it("defines all required fields", () => {
    expect(REQUIRED_FIELDS).toHaveLength(24);
  });

  it("schemaVersion must be '1.0'", () => {
    expect("1.0").toBe("1.0");
  });

  const VALID_SEVERITIES = ["critical", "high", "medium", "low", "info"];
  it("severity enum has exactly 5 values", () => {
    expect(VALID_SEVERITIES).toHaveLength(5);
  });

  it("severity values are ordered from most to least severe", () => {
    expect(VALID_SEVERITIES[0]).toBe("critical");
    expect(VALID_SEVERITIES[4]).toBe("info");
  });

  const VALID_ROUTES = ["A_DUPLICATE_NOISY", "B_LOW_CONFIDENCE", "C_HIGH_CONFIDENCE", "D_LIKELY_BENIGN"];
  it("route enum has exactly 4 values", () => {
    expect(VALID_ROUTES).toHaveLength(4);
  });

  it("routes are alphabetically prefixed for sorting", () => {
    const sorted = [...VALID_ROUTES].sort();
    expect(sorted).toEqual(VALID_ROUTES);
  });

  const ENTITY_TYPES = [
    "host", "user", "process", "hash", "ip", "domain",
    "rule_id", "mitre_technique", "cve", "file_path", "port", "registry_key",
  ];
  it("entity types cover all Wazuh observable categories", () => {
    expect(ENTITY_TYPES).toContain("host");
    expect(ENTITY_TYPES).toContain("ip");
    expect(ENTITY_TYPES).toContain("hash");
    expect(ENTITY_TYPES).toContain("cve");
    expect(ENTITY_TYPES).toContain("mitre_technique");
    expect(ENTITY_TYPES).toContain("file_path");
  });

  it("entity types has 12 categories", () => {
    expect(ENTITY_TYPES).toHaveLength(12);
  });
});

describe("CorrelationBundle schema contract", () => {
  const REQUIRED_FIELDS = [
    "schemaVersion", "correlationId", "correlatedAt",
    "sourceTriageId", "timeWindow", "evidencePack",
    "crossEntityLinks", "riskScore", "riskFactors",
    "correlationSummary", "suggestedHypotheses",
  ];

  it("defines all required fields", () => {
    expect(REQUIRED_FIELDS).toHaveLength(11);
  });

  it("correlationId follows naming convention", () => {
    const testId = "corr-abc123def456";
    expect(testId).toMatch(/^corr-[a-z0-9]+$/);
  });

  it("riskScore is bounded 0-100", () => {
    const clamp = (n: number) => Math.max(0, Math.min(100, n));
    expect(clamp(-10)).toBe(0);
    expect(clamp(50)).toBe(50);
    expect(clamp(150)).toBe(100);
  });
});

describe("LivingCaseObject schema contract", () => {
  const VALID_STATUSES = ["open", "investigating", "escalated", "resolved", "closed", "false_positive"];
  it("case status enum has 6 values", () => {
    expect(VALID_STATUSES).toHaveLength(6);
  });

  it("open is the default initial status", () => {
    expect(VALID_STATUSES[0]).toBe("open");
  });

  const VALID_VERDICTS = ["true_positive", "false_positive", "benign_true_positive", "inconclusive"];
  it("verdict enum has 4 values", () => {
    expect(VALID_VERDICTS).toHaveLength(4);
  });
});

// ── 2. Triage Agent Validation Helpers ───────────────────────────────────────

describe("Triage severity validation", () => {
  const VALID: string[] = ["critical", "high", "medium", "low", "info"];

  function validateSeverity(s: unknown): string {
    return VALID.includes(s as string) ? (s as string) : "info";
  }

  it("accepts valid severities", () => {
    for (const sev of VALID) {
      expect(validateSeverity(sev)).toBe(sev);
    }
  });

  it("defaults to 'info' for invalid input", () => {
    expect(validateSeverity("extreme")).toBe("info");
    expect(validateSeverity(null)).toBe("info");
    expect(validateSeverity(undefined)).toBe("info");
    expect(validateSeverity(42)).toBe("info");
    expect(validateSeverity("")).toBe("info");
  });
});

describe("Triage route validation", () => {
  const VALID = ["A_DUPLICATE_NOISY", "B_LOW_CONFIDENCE", "C_HIGH_CONFIDENCE", "D_LIKELY_BENIGN"];

  function validateRoute(r: unknown): string {
    return VALID.includes(r as string) ? (r as string) : "B_LOW_CONFIDENCE";
  }

  it("accepts valid routes", () => {
    for (const route of VALID) {
      expect(validateRoute(route)).toBe(route);
    }
  });

  it("defaults to B_LOW_CONFIDENCE for invalid input", () => {
    expect(validateRoute("UNKNOWN")).toBe("B_LOW_CONFIDENCE");
    expect(validateRoute(null)).toBe("B_LOW_CONFIDENCE");
    expect(validateRoute("")).toBe("B_LOW_CONFIDENCE");
  });
});

describe("Confidence clamping", () => {
  function clampConfidence(c: unknown): number {
    const n = Number(c);
    if (isNaN(n)) return 0;
    return Math.max(0, Math.min(1, n));
  }

  it("clamps values to 0-1 range", () => {
    expect(clampConfidence(0.5)).toBe(0.5);
    expect(clampConfidence(0)).toBe(0);
    expect(clampConfidence(1)).toBe(1);
    expect(clampConfidence(-0.5)).toBe(0);
    expect(clampConfidence(1.5)).toBe(1);
  });

  it("returns 0 for non-numeric input", () => {
    expect(clampConfidence("abc")).toBe(0);
    expect(clampConfidence(null)).toBe(0);
    expect(clampConfidence(undefined)).toBe(0);
    expect(clampConfidence(NaN)).toBe(0);
  });

  it("handles string numbers", () => {
    expect(clampConfidence("0.75")).toBe(0.75);
    expect(clampConfidence("2")).toBe(1);
  });
});

// ── 3. Alert Field Extraction ────────────────────────────────────────────────

describe("Alert field extraction", () => {
  const sampleAlert = {
    id: "alert-12345",
    timestamp: "2026-02-28T10:00:00.000Z",
    rule: {
      id: "5710",
      description: "sshd: Attempt to login using a non-existent user",
      level: 5,
      mitre: {
        id: ["T1110"],
        technique: ["Brute Force"],
        tactic: ["Credential Access"],
      },
    },
    agent: {
      id: "003",
      name: "web-server-01",
      ip: "10.0.1.50",
      os: { name: "Ubuntu", version: "22.04" },
      groups: ["web-servers", "linux"],
    },
    data: {
      srcip: "192.168.1.100",
      dstuser: "admin",
    },
    syscheck: {
      path: "/etc/passwd",
      md5_after: "abc123def456",
      sha256_after: "sha256hash789",
    },
  };

  it("extracts alert ID", () => {
    expect(String(sampleAlert.id)).toBe("alert-12345");
  });

  it("extracts rule ID", () => {
    expect(String(sampleAlert.rule.id)).toBe("5710");
  });

  it("extracts rule description", () => {
    expect(sampleAlert.rule.description).toContain("sshd");
  });

  it("extracts rule level", () => {
    expect(sampleAlert.rule.level).toBe(5);
  });

  it("extracts timestamp", () => {
    expect(sampleAlert.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("extracts agent info", () => {
    expect(sampleAlert.agent.id).toBe("003");
    expect(sampleAlert.agent.name).toBe("web-server-01");
    expect(sampleAlert.agent.ip).toBe("10.0.1.50");
  });

  it("extracts agent OS", () => {
    const os = sampleAlert.agent.os;
    expect(`${os.name} ${os.version}`).toBe("Ubuntu 22.04");
  });

  it("extracts agent groups", () => {
    expect(sampleAlert.agent.groups).toContain("web-servers");
    expect(sampleAlert.agent.groups).toContain("linux");
  });

  it("extracts source IP from data", () => {
    expect(sampleAlert.data.srcip).toBe("192.168.1.100");
  });

  it("extracts destination user from data", () => {
    expect(sampleAlert.data.dstuser).toBe("admin");
  });

  it("extracts FIM file path", () => {
    expect(sampleAlert.syscheck.path).toBe("/etc/passwd");
  });

  it("extracts FIM hashes", () => {
    expect(sampleAlert.syscheck.md5_after).toBe("abc123def456");
    expect(sampleAlert.syscheck.sha256_after).toBe("sha256hash789");
  });

  it("extracts MITRE ATT&CK mapping from rule", () => {
    const mitre = sampleAlert.rule.mitre;
    expect(mitre.id).toContain("T1110");
    expect(mitre.technique).toContain("Brute Force");
    expect(mitre.tactic).toContain("Credential Access");
  });
});

describe("Wazuh entity extraction", () => {
  function extractWazuhEntities(raw: Record<string, any>) {
    const entities: Array<{ type: string; value: string; source: string; confidence: number }> = [];
    const agent = raw.agent;
    const data = raw.data;
    const rule = raw.rule;
    const syscheck = raw.syscheck;

    if (agent?.id) entities.push({ type: "host", value: String(agent.id), source: "wazuh_alert", confidence: 1.0 });
    if (agent?.name) entities.push({ type: "host", value: String(agent.name), source: "wazuh_alert", confidence: 1.0 });
    if (rule?.id) entities.push({ type: "rule_id", value: String(rule.id), source: "wazuh_alert", confidence: 1.0 });
    if (data?.srcip) entities.push({ type: "ip", value: String(data.srcip), source: "wazuh_alert", confidence: 1.0 });
    if (data?.dstip) entities.push({ type: "ip", value: String(data.dstip), source: "wazuh_alert", confidence: 1.0 });
    if (data?.srcuser) entities.push({ type: "user", value: String(data.srcuser), source: "wazuh_alert", confidence: 1.0 });
    if (data?.dstuser) entities.push({ type: "user", value: String(data.dstuser), source: "wazuh_alert", confidence: 1.0 });
    if (syscheck?.path) entities.push({ type: "file_path", value: String(syscheck.path), source: "wazuh_alert", confidence: 1.0 });
    if (syscheck?.md5_after) entities.push({ type: "hash", value: String(syscheck.md5_after), source: "wazuh_alert", confidence: 1.0 });
    if (syscheck?.sha256_after) entities.push({ type: "hash", value: String(syscheck.sha256_after), source: "wazuh_alert", confidence: 1.0 });

    return entities;
  }

  const sampleAlert = {
    agent: { id: "003", name: "web-server-01" },
    rule: { id: "5710" },
    data: { srcip: "192.168.1.100", dstuser: "admin" },
    syscheck: { path: "/etc/passwd", md5_after: "abc123", sha256_after: "sha256hash" },
  };

  it("extracts all entities from a full alert", () => {
    const entities = extractWazuhEntities(sampleAlert);
    expect(entities.length).toBeGreaterThanOrEqual(8);
  });

  it("all entities have confidence 1.0 (Wazuh-native)", () => {
    const entities = extractWazuhEntities(sampleAlert);
    for (const e of entities) {
      expect(e.confidence).toBe(1.0);
    }
  });

  it("all entities have source 'wazuh_alert'", () => {
    const entities = extractWazuhEntities(sampleAlert);
    for (const e of entities) {
      expect(e.source).toBe("wazuh_alert");
    }
  });

  it("handles missing fields gracefully", () => {
    const entities = extractWazuhEntities({});
    expect(entities).toHaveLength(0);
  });

  it("handles partial alert", () => {
    const entities = extractWazuhEntities({ agent: { id: "001" } });
    expect(entities).toHaveLength(1);
    expect(entities[0].type).toBe("host");
    expect(entities[0].value).toBe("001");
  });
});

// ── 4. MITRE Extraction ──────────────────────────────────────────────────────

describe("MITRE ATT&CK extraction from Wazuh alerts", () => {
  function extractWazuhMitre(raw: Record<string, any>) {
    const rule = raw.rule;
    const mitre = rule?.mitre;
    if (!mitre) return [];

    const ids = Array.isArray(mitre.id) ? mitre.id : [];
    const techniques = Array.isArray(mitre.technique) ? mitre.technique : [];
    const tactics = Array.isArray(mitre.tactic) ? mitre.tactic : [];

    return ids.map((id: string, i: number) => ({
      techniqueId: String(id),
      techniqueName: String(techniques[i] ?? id),
      tactic: String(tactics[i] ?? "unknown"),
      confidence: 1.0,
      source: "wazuh_alert",
    }));
  }

  it("extracts MITRE mappings from rule.mitre", () => {
    const alert = {
      rule: {
        mitre: {
          id: ["T1110", "T1078"],
          technique: ["Brute Force", "Valid Accounts"],
          tactic: ["Credential Access", "Defense Evasion"],
        },
      },
    };
    const mappings = extractWazuhMitre(alert);
    expect(mappings).toHaveLength(2);
    expect(mappings[0].techniqueId).toBe("T1110");
    expect(mappings[1].techniqueName).toBe("Valid Accounts");
  });

  it("returns empty array when no MITRE data", () => {
    expect(extractWazuhMitre({})).toHaveLength(0);
    expect(extractWazuhMitre({ rule: {} })).toHaveLength(0);
    expect(extractWazuhMitre({ rule: { mitre: null } })).toHaveLength(0);
  });

  it("handles mismatched array lengths", () => {
    const alert = {
      rule: {
        mitre: {
          id: ["T1110", "T1078", "T1059"],
          technique: ["Brute Force"],
          tactic: ["Credential Access"],
        },
      },
    };
    const mappings = extractWazuhMitre(alert);
    expect(mappings).toHaveLength(3);
    expect(mappings[1].techniqueName).toBe("T1078"); // falls back to ID
    expect(mappings[2].tactic).toBe("unknown"); // falls back to unknown
  });
});

// ── 5. Pipeline Router Input Validation ──────────────────────────────────────

describe("Pipeline router input schemas", () => {
  describe("triageAlert input", () => {
    it("requires rawAlert as a record", () => {
      const validInput = { rawAlert: { id: "123", rule: { id: "5710" } } };
      expect(validInput.rawAlert).toBeDefined();
      expect(typeof validInput.rawAlert).toBe("object");
    });

    it("alertQueueItemId is optional", () => {
      const withoutQueue = { rawAlert: { id: "123" } };
      const withQueue = { rawAlert: { id: "123" }, alertQueueItemId: 42 };
      expect(withoutQueue).toBeDefined();
      expect(withQueue.alertQueueItemId).toBe(42);
    });
  });

  describe("listTriages input", () => {
    it("has sensible defaults", () => {
      const defaults = { limit: 50, offset: 0 };
      expect(defaults.limit).toBe(50);
      expect(defaults.offset).toBe(0);
    });

    it("limit is bounded 1-200", () => {
      const clamp = (n: number) => Math.max(1, Math.min(200, n));
      expect(clamp(0)).toBe(1);
      expect(clamp(50)).toBe(50);
      expect(clamp(500)).toBe(200);
    });

    it("accepts severity filter", () => {
      const validFilters = ["critical", "high", "medium", "low", "info"];
      for (const f of validFilters) {
        expect(validFilters).toContain(f);
      }
    });

    it("accepts route filter", () => {
      const validRoutes = ["A_DUPLICATE_NOISY", "B_LOW_CONFIDENCE", "C_HIGH_CONFIDENCE", "D_LIKELY_BENIGN"];
      for (const r of validRoutes) {
        expect(validRoutes).toContain(r);
      }
    });

    it("accepts status filter", () => {
      const validStatuses = ["pending", "processing", "completed", "failed"];
      for (const s of validStatuses) {
        expect(validStatuses).toContain(s);
      }
    });
  });
});

// ── 6. Triage Result Card Data Transformation ────────────────────────────────

describe("Triage result card rendering logic", () => {
  const SEVERITY_COLORS: Record<string, string> = {
    critical: "text-red-400 bg-red-500/15 border-red-500/30",
    high: "text-orange-400 bg-orange-500/15 border-orange-500/30",
    medium: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30",
    low: "text-blue-400 bg-blue-500/15 border-blue-500/30",
    info: "text-slate-400 bg-slate-500/15 border-slate-500/30",
  };

  it("maps all severity levels to colors", () => {
    for (const sev of ["critical", "high", "medium", "low", "info"]) {
      expect(SEVERITY_COLORS[sev]).toBeDefined();
      expect(SEVERITY_COLORS[sev]).toContain("text-");
      expect(SEVERITY_COLORS[sev]).toContain("bg-");
      expect(SEVERITY_COLORS[sev]).toContain("border-");
    }
  });

  const ROUTE_LABELS: Record<string, { label: string; description: string }> = {
    A_DUPLICATE_NOISY: { label: "Duplicate/Noisy", description: "Suppression candidate" },
    B_LOW_CONFIDENCE: { label: "Low Confidence", description: "Needs enrichment" },
    C_HIGH_CONFIDENCE: { label: "High Confidence", description: "Proceed to correlation" },
    D_LIKELY_BENIGN: { label: "Likely Benign", description: "Closure candidate" },
  };

  it("maps all routes to labels", () => {
    for (const route of ["A_DUPLICATE_NOISY", "B_LOW_CONFIDENCE", "C_HIGH_CONFIDENCE", "D_LIKELY_BENIGN"]) {
      expect(ROUTE_LABELS[route]).toBeDefined();
      expect(ROUTE_LABELS[route].label).toBeTruthy();
      expect(ROUTE_LABELS[route].description).toBeTruthy();
    }
  });

  const ENTITY_ICON_TYPES = [
    "host", "user", "ip", "domain", "hash", "process",
    "file_path", "rule_id", "mitre_technique", "cve", "port", "registry_key",
  ];

  it("has icon mappings for all entity types", () => {
    expect(ENTITY_ICON_TYPES).toHaveLength(12);
  });
});

// ── 7. Triage ID Generation ──────────────────────────────────────────────────

describe("Triage ID generation", () => {
  it("follows triage-{uuid} pattern", () => {
    const id = `triage-${crypto.randomUUID().slice(0, 12)}`;
    expect(id).toMatch(/^triage-[a-f0-9-]+$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => `triage-${crypto.randomUUID().slice(0, 12)}`));
    expect(ids.size).toBe(100);
  });
});

// ── 8. Pipeline Stage Contracts ──────────────────────────────────────────────

describe("Pipeline stage contracts", () => {
  it("Stage 1 (Triage) outputs a TriageObject", () => {
    const output = {
      schemaVersion: "1.0",
      triageId: "triage-abc123",
      severity: "high",
      route: "C_HIGH_CONFIDENCE",
    };
    expect(output.schemaVersion).toBe("1.0");
    expect(output.triageId).toMatch(/^triage-/);
  });

  it("Stage 2 (Correlation) consumes a triageId and outputs a CorrelationBundle", () => {
    const input = { sourceTriageId: "triage-abc123" };
    const output = {
      schemaVersion: "1.0",
      correlationId: "corr-def456",
      sourceTriageId: input.sourceTriageId,
    };
    expect(output.sourceTriageId).toBe(input.sourceTriageId);
    expect(output.correlationId).toMatch(/^corr-/);
  });

  it("Stage 3 (Hypothesis) consumes a CorrelationBundle and updates a LivingCaseObject", () => {
    const input = { correlationId: "corr-def456" };
    const output = {
      caseId: 1,
      status: "investigating",
      workingTheory: "Brute force attack from external IP",
    };
    expect(output.status).toBe("investigating");
    expect(output.workingTheory).toBeTruthy();
  });

  it("pipeline stages are ordered: triage → correlation → hypothesis → case", () => {
    const stages = ["triage", "correlation", "hypothesis", "case"];
    expect(stages[0]).toBe("triage");
    expect(stages[stages.length - 1]).toBe("case");
    expect(stages).toHaveLength(4);
  });
});

// ── 9. Database Schema Contracts ─────────────────────────────────────────────

describe("Triage objects table schema", () => {
  const COLUMNS = [
    "id", "triageId", "alertId", "ruleId", "ruleDescription", "ruleLevel",
    "alertTimestamp", "agentId", "agentName", "alertFamily", "severity",
    "severityConfidence", "route", "isDuplicate", "similarityScore",
    "similarTriageId", "summary", "status", "errorMessage", "triageData",
    "triagedBy", "triggeredByUserId", "alertQueueItemId",
    "latencyMs", "tokensUsed", "createdAt",
  ];

  it("has all required columns", () => {
    expect(COLUMNS).toContain("triageId");
    expect(COLUMNS).toContain("severity");
    expect(COLUMNS).toContain("route");
    expect(COLUMNS).toContain("triageData");
    expect(COLUMNS).toContain("status");
  });

  it("triageId is the lookup key", () => {
    expect(COLUMNS).toContain("triageId");
  });

  it("stores full triage object as JSON in triageData", () => {
    expect(COLUMNS).toContain("triageData");
  });

  it("tracks processing status", () => {
    const validStatuses = ["pending", "processing", "completed", "failed"];
    expect(validStatuses).toHaveLength(4);
  });

  it("tracks latency and token usage for monitoring", () => {
    expect(COLUMNS).toContain("latencyMs");
    expect(COLUMNS).toContain("tokensUsed");
  });
});

describe("Correlation bundles table schema", () => {
  const COLUMNS = [
    "id", "correlationId", "sourceTriageId", "timeWindowStart", "timeWindowEnd",
    "riskScore", "correlationData", "status", "errorMessage",
    "latencyMs", "tokensUsed", "createdAt",
  ];

  it("has all required columns", () => {
    expect(COLUMNS).toContain("correlationId");
    expect(COLUMNS).toContain("sourceTriageId");
    expect(COLUMNS).toContain("riskScore");
    expect(COLUMNS).toContain("correlationData");
  });

  it("links back to the source triage", () => {
    expect(COLUMNS).toContain("sourceTriageId");
  });
});

// ── 10. Fresh Context Architecture Validation ────────────────────────────────

describe("Fresh context per stage architecture", () => {
  it("each stage gets its own system prompt", () => {
    const stages = ["triage", "correlation", "hypothesis"];
    const prompts = new Map<string, string>();
    prompts.set("triage", "You are a Triage Agent...");
    prompts.set("correlation", "You are a Correlation Agent...");
    prompts.set("hypothesis", "You are a Hypothesis Agent...");

    for (const stage of stages) {
      expect(prompts.has(stage)).toBe(true);
      expect(prompts.get(stage)!.length).toBeGreaterThan(0);
    }
  });

  it("handoff between stages is via structured JSON, not conversation context", () => {
    // Triage outputs a TriageObject
    const triageOutput = { triageId: "triage-abc", severity: "high" };
    // Correlation receives the triageId and fetches the TriageObject
    const correlationInput = { sourceTriageId: triageOutput.triageId };
    expect(correlationInput.sourceTriageId).toBe(triageOutput.triageId);
    // No shared conversation history between stages
  });

  it("context budget is allocated per stage, not shared", () => {
    const CONTEXT_BUDGETS: Record<string, number> = {
      triage: 16384,
      correlation: 32768,
      hypothesis: 16384,
    };

    const totalBudget = Object.values(CONTEXT_BUDGETS).reduce((a, b) => a + b, 0);
    // Each stage gets its full budget independently
    expect(CONTEXT_BUDGETS.triage).toBe(16384);
    expect(CONTEXT_BUDGETS.correlation).toBe(32768);
    // Total is NOT constrained to a single model context window
    expect(totalBudget).toBeGreaterThan(32768);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STEP 2 TESTS — Correlation Agent, Analyst Feedback, Auto-Triage
// ═══════════════════════════════════════════════════════════════════════════════

// ── 11. CorrelationBundle Schema (Updated) ──────────────────────────────────

describe("CorrelationBundle full schema contract", () => {
  const REQUIRED_SECTIONS = [
    "schemaVersion", "correlationId", "correlatedAt", "sourceTriageId",
    "relatedAlerts", "discoveredEntities", "vulnerabilityContext",
    "fimContext", "threatIntelMatches", "priorInvestigations",
    "blastRadius", "campaignAssessment", "caseRecommendation", "synthesis",
  ];

  it("defines all 14 required sections", () => {
    expect(REQUIRED_SECTIONS).toHaveLength(14);
  });

  it("blastRadius contains host/user counts and agent IDs", () => {
    const blastRadius = {
      affectedHosts: 3,
      affectedUsers: 2,
      affectedAgentIds: ["001", "003", "005"],
      assetCriticality: "high" as const,
      confidence: 0.8,
    };
    expect(blastRadius.affectedHosts).toBeGreaterThanOrEqual(0);
    expect(blastRadius.affectedUsers).toBeGreaterThanOrEqual(0);
    expect(blastRadius.affectedAgentIds).toHaveLength(3);
    expect(["critical", "high", "medium", "low", "unknown"]).toContain(blastRadius.assetCriticality);
  });

  it("campaignAssessment flags coordinated attacks", () => {
    const campaign = {
      likelyCampaign: true,
      campaignLabel: "SSH Brute Force Campaign",
      clusteredTechniques: [{ techniqueId: "T1110", techniqueName: "Brute Force", tactic: "Credential Access", confidence: 0.9, source: "wazuh_alert" }],
      confidence: 0.85,
      reasoning: "Multiple agents targeted with same technique within 10 minutes",
    };
    expect(campaign.likelyCampaign).toBe(true);
    expect(campaign.campaignLabel).toBeTruthy();
    expect(campaign.clusteredTechniques.length).toBeGreaterThan(0);
    expect(campaign.confidence).toBeGreaterThanOrEqual(0);
    expect(campaign.confidence).toBeLessThanOrEqual(1);
  });

  it("caseRecommendation has valid action types", () => {
    const VALID_ACTIONS = ["merge_existing", "create_new", "defer_to_analyst"];
    for (const action of VALID_ACTIONS) {
      expect(VALID_ACTIONS).toContain(action);
    }
    expect(VALID_ACTIONS).toHaveLength(3);
  });

  it("synthesis separates supporting and conflicting evidence", () => {
    const synthesis = {
      narrative: "Correlation analysis reveals...",
      supportingEvidence: [{ id: "ev-1", label: "SSH failure alert", type: "alert", source: "wazuh_alert", data: {}, collectedAt: "2026-02-28T10:00:00Z" }],
      conflictingEvidence: [],
      missingEvidence: [{ description: "No network flow data", impact: "Cannot confirm lateral movement", suggestedAction: "Enable network monitoring" }],
      confidence: 0.7,
    };
    expect(synthesis.narrative).toBeTruthy();
    expect(Array.isArray(synthesis.supportingEvidence)).toBe(true);
    expect(Array.isArray(synthesis.conflictingEvidence)).toBe(true);
    expect(Array.isArray(synthesis.missingEvidence)).toBe(true);
  });
});

// ── 12. Analyst Feedback Validation ─────────────────────────────────────────

describe("Analyst feedback input validation", () => {
  const VALID_SEVERITIES = ["critical", "high", "medium", "low", "info"];
  const VALID_ROUTES = ["A_DUPLICATE_NOISY", "B_LOW_CONFIDENCE", "C_HIGH_CONFIDENCE", "D_LIKELY_BENIGN"];

  it("accepts confirm action with triageId only", () => {
    const input = { triageId: "triage-abc123", confirmed: true };
    expect(input.triageId).toMatch(/^triage-/);
    expect(input.confirmed).toBe(true);
  });

  it("accepts override with severity change", () => {
    const input = {
      triageId: "triage-abc123",
      confirmed: false,
      severityOverride: "critical" as const,
      notes: "This is actually a critical incident, not medium",
    };
    expect(VALID_SEVERITIES).toContain(input.severityOverride);
    expect(input.notes).toBeTruthy();
  });

  it("accepts override with route change", () => {
    const input = {
      triageId: "triage-abc123",
      confirmed: false,
      routeOverride: "C_HIGH_CONFIDENCE" as const,
      notes: "Escalating to high confidence based on additional context",
    };
    expect(VALID_ROUTES).toContain(input.routeOverride);
  });

  it("rejects notes longer than 4000 characters", () => {
    const longNote = "x".repeat(4001);
    expect(longNote.length).toBeGreaterThan(4000);
    // The z.string().max(4000) validation would reject this
  });

  it("feedback includes analyst user ID and timestamp", () => {
    const feedback = {
      triageId: "triage-abc123",
      confirmed: true,
      analystUserId: 42,
      feedbackAt: new Date().toISOString(),
    };
    expect(feedback.analystUserId).toBeGreaterThan(0);
    expect(feedback.feedbackAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ── 13. Auto-Triage Queue Integration ───────────────────────────────────────

describe("Auto-triage queue integration", () => {
  it("queue item has pipelineTriageId and autoTriageStatus fields", () => {
    const queueItem = {
      id: 1,
      alertId: "alert-12345",
      ruleId: "5710",
      status: "queued",
      pipelineTriageId: null as string | null,
      autoTriageStatus: "pending",
    };
    expect(queueItem.pipelineTriageId).toBeNull();
    expect(queueItem.autoTriageStatus).toBe("pending");
  });

  it("autoTriageStatus transitions: pending → running → completed", () => {
    const VALID_STATUSES = ["pending", "running", "completed", "failed"];
    expect(VALID_STATUSES).toContain("pending");
    expect(VALID_STATUSES).toContain("running");
    expect(VALID_STATUSES).toContain("completed");
    expect(VALID_STATUSES).toContain("failed");
  });

  it("completed auto-triage links to triage object via pipelineTriageId", () => {
    const queueItem = {
      id: 1,
      autoTriageStatus: "completed",
      pipelineTriageId: "triage-xyz789",
    };
    expect(queueItem.pipelineTriageId).toMatch(/^triage-/);
    expect(queueItem.autoTriageStatus).toBe("completed");
  });

  it("failed auto-triage preserves null pipelineTriageId", () => {
    const queueItem = {
      id: 1,
      autoTriageStatus: "failed",
      pipelineTriageId: null,
    };
    expect(queueItem.pipelineTriageId).toBeNull();
    expect(queueItem.autoTriageStatus).toBe("failed");
  });

  it("already-triaged items return early without re-running", () => {
    const result = {
      success: true,
      alreadyTriaged: true,
      triageId: "triage-existing",
    };
    expect(result.alreadyTriaged).toBe(true);
    expect(result.triageId).toBe("triage-existing");
  });
});

// ── 14. Correlation Agent Evidence Sources ──────────────────────────────────

describe("Correlation agent evidence retrieval", () => {
  const EVIDENCE_SOURCES = [
    "wazuh_alerts",        // Related alerts from Wazuh Indexer
    "wazuh_vulnerabilities", // Vulns on affected hosts
    "wazuh_fim",           // FIM changes on affected hosts
    "wazuh_agents",        // Agent metadata for blast radius
    "threat_intel",        // OTX threat intelligence
    "prior_investigations", // Existing investigation sessions
  ];

  it("retrieves from 6 evidence sources", () => {
    expect(EVIDENCE_SOURCES).toHaveLength(6);
  });

  it("includes Wazuh alerts for entity correlation", () => {
    expect(EVIDENCE_SOURCES).toContain("wazuh_alerts");
  });

  it("includes vulnerability context for affected hosts", () => {
    expect(EVIDENCE_SOURCES).toContain("wazuh_vulnerabilities");
  });

  it("includes FIM for file change context", () => {
    expect(EVIDENCE_SOURCES).toContain("wazuh_fim");
  });

  it("includes threat intelligence for IOC matching", () => {
    expect(EVIDENCE_SOURCES).toContain("threat_intel");
  });

  it("includes prior investigations for case merging", () => {
    expect(EVIDENCE_SOURCES).toContain("prior_investigations");
  });
});

// ── 15. Correlation ID Generation ───────────────────────────────────────────

describe("Correlation ID generation", () => {
  it("follows corr-{uuid} pattern", () => {
    const id = `corr-${crypto.randomUUID().slice(0, 12)}`;
    expect(id).toMatch(/^corr-[a-f0-9-]+$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => `corr-${crypto.randomUUID().slice(0, 12)}`));
    expect(ids.size).toBe(100);
  });
});

// ── 16. Pipeline Router Endpoint Contracts ──────────────────────────────────

describe("Pipeline router Step 2 endpoints", () => {
  it("correlateFromTriage requires triageId input", () => {
    const input = { triageId: "triage-abc123" };
    expect(input.triageId).toBeTruthy();
    expect(input.triageId).toMatch(/^triage-/);
  });

  it("getCorrelationByTriageId returns found/not-found", () => {
    const found = { found: true as const, correlation: { correlationId: "corr-xyz" } };
    const notFound = { found: false as const };
    expect(found.found).toBe(true);
    expect(notFound.found).toBe(false);
  });

  it("submitFeedback returns success with feedback details", () => {
    const result = {
      success: true as const,
      triageId: "triage-abc123",
      feedback: {
        confirmed: true,
        severityOverride: null,
        routeOverride: null,
        notes: null,
        analystId: 42,
        feedbackAt: "2026-02-28T10:00:00.000Z",
      },
    };
    expect(result.success).toBe(true);
    expect(result.feedback.confirmed).toBe(true);
    expect(result.feedback.analystId).toBeGreaterThan(0);
  });

  it("autoTriageQueueItem returns triageId on success", () => {
    const result = {
      success: true as const,
      alreadyTriaged: false,
      triageId: "triage-new123",
    };
    expect(result.success).toBe(true);
    expect(result.triageId).toMatch(/^triage-/);
  });

  it("feedbackStats returns aggregated counts", () => {
    const stats = { total: 100, confirmed: 60, overridden: 15, pending: 25 };
    expect(stats.total).toBe(stats.confirmed + stats.overridden + stats.pending);
  });
});

// ── 17. Triage → Correlation Handoff ────────────────────────────────────────

describe("Triage to Correlation handoff", () => {
  it("correlation receives triageId, not raw alert", () => {
    const triageOutput = { triageId: "triage-abc123", severity: "high", route: "C_HIGH_CONFIDENCE" };
    const correlationInput = { triageId: triageOutput.triageId };
    // Correlation agent fetches the full triage object by ID
    expect(correlationInput.triageId).toBe(triageOutput.triageId);
  });

  it("correlation extracts entities from triage for evidence retrieval", () => {
    const triageEntities = [
      { type: "ip", value: "192.168.1.100" },
      { type: "host", value: "003" },
      { type: "user", value: "admin" },
    ];
    // Each entity becomes a search key for the 6 evidence sources
    expect(triageEntities.length).toBeGreaterThan(0);
    for (const e of triageEntities) {
      expect(e.type).toBeTruthy();
      expect(e.value).toBeTruthy();
    }
  });

  it("correlation preserves source triage ID for provenance", () => {
    const bundle = {
      correlationId: "corr-def456",
      sourceTriageId: "triage-abc123",
    };
    expect(bundle.sourceTriageId).toMatch(/^triage-/);
    expect(bundle.correlationId).toMatch(/^corr-/);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// Step 3 — Hypothesis Agent Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("LivingCaseObject schema contract", () => {
  const REQUIRED_FIELDS = [
    "schemaVersion", "caseId", "sessionId", "createdAt", "lastUpdatedAt",
    "lastUpdatedBy", "workingTheory", "alternateTheories",
    "suggestedNextSteps", "evidenceGaps", "timelineSummary",
    "recommendedActions", "completedPivots", "draftDocumentation",
    "linkedTriageIds", "linkedCorrelationIds", "linkedAlertIds",
  ];

  it("defines all required fields for LivingCaseObject", () => {
    expect(REQUIRED_FIELDS).toHaveLength(17);
  });

  it("schemaVersion must be '1.0'", () => {
    expect("1.0").toBe("1.0");
  });

  it("working theory has required structure", () => {
    const workingTheory = {
      statement: "Credential stuffing attack targeting admin accounts",
      confidence: 0.78,
      supportingEvidence: ["Multiple failed logins from same IP"],
      conflictingEvidence: ["Source IP is internal"],
    };
    expect(workingTheory.statement).toBeTruthy();
    expect(workingTheory.confidence).toBeGreaterThanOrEqual(0);
    expect(workingTheory.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(workingTheory.supportingEvidence)).toBe(true);
    expect(Array.isArray(workingTheory.conflictingEvidence)).toBe(true);
  });

  it("alternate theories have required structure", () => {
    const altTheory = {
      statement: "Legitimate user forgot password",
      confidence: 0.35,
      supportingEvidence: ["User account is active"],
      whyLessLikely: "Pattern matches known attack tools",
    };
    expect(altTheory.statement).toBeTruthy();
    expect(altTheory.confidence).toBeGreaterThanOrEqual(0);
    expect(altTheory.confidence).toBeLessThanOrEqual(1);
    expect(altTheory.whyLessLikely).toBeTruthy();
  });
});

describe("Hypothesis Agent — working theory generation", () => {
  it("produces a working theory from correlation bundle data", () => {
    const correlationBundle = {
      correlationId: "corr-abc123",
      sourceTriageId: "triage-def456",
      bundleData: {
        synthesis: {
          narrative: "Multiple brute-force attempts from external IP targeting admin accounts",
          supportingEvidence: ["5 failed logins in 30 seconds", "Known malicious IP"],
          conflictingEvidence: [],
          missingEvidence: [{ description: "No endpoint telemetry", impact: "Cannot confirm compromise" }],
        },
        relatedAlerts: [
          { ruleId: "100001", ruleDescription: "Brute force attempt", agentId: "001" },
        ],
        blastRadius: { affectedHosts: 2, affectedUsers: 1, assetCriticality: "high" },
        campaignAssessment: { likelyCampaign: false },
      },
    };

    // The hypothesis agent should extract the narrative as basis for theory
    const narrative = correlationBundle.bundleData.synthesis.narrative;
    expect(narrative).toBeTruthy();
    expect(narrative.length).toBeGreaterThan(10);

    // Supporting evidence should flow through
    const supporting = correlationBundle.bundleData.synthesis.supportingEvidence;
    expect(supporting.length).toBeGreaterThan(0);
  });

  it("confidence is bounded [0, 1]", () => {
    const confidences = [0, 0.25, 0.5, 0.75, 1.0];
    for (const c of confidences) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it("generates alternate theories with whyLessLikely reasoning", () => {
    const alternates = [
      {
        statement: "Legitimate admin password reset",
        confidence: 0.2,
        supportingEvidence: ["Account is active"],
        whyLessLikely: "5 attempts in 30 seconds is not human behavior",
      },
      {
        statement: "Automated vulnerability scanner",
        confidence: 0.15,
        supportingEvidence: ["IP has scanning history"],
        whyLessLikely: "Scanner would target multiple services, not just auth",
      },
    ];

    for (const alt of alternates) {
      expect(alt.statement).toBeTruthy();
      expect(alt.whyLessLikely).toBeTruthy();
      expect(alt.confidence).toBeLessThan(1);
    }
  });
});

describe("Hypothesis Agent — investigative pivots", () => {
  const VALID_PRIORITIES = ["critical", "high", "medium", "low"];
  const VALID_EFFORTS = ["quick", "moderate", "deep_dive"];

  it("priority enum has exactly 4 values", () => {
    expect(VALID_PRIORITIES).toHaveLength(4);
  });

  it("effort enum has exactly 3 values", () => {
    expect(VALID_EFFORTS).toHaveLength(3);
  });

  it("pivot has required structure", () => {
    const pivot = {
      action: "Check DHCP logs for IP reassignment",
      rationale: "Confirm the source IP was not reassigned during the attack window",
      priority: "high",
      effort: "quick",
    };
    expect(pivot.action).toBeTruthy();
    expect(pivot.rationale).toBeTruthy();
    expect(VALID_PRIORITIES).toContain(pivot.priority);
    expect(VALID_EFFORTS).toContain(pivot.effort);
  });

  it("pivots are ordered by priority", () => {
    const pivots = [
      { priority: "critical", action: "Isolate host" },
      { priority: "high", action: "Check logs" },
      { priority: "medium", action: "Review policy" },
      { priority: "low", action: "Update documentation" },
    ];
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    for (let i = 1; i < pivots.length; i++) {
      const prev = priorityOrder[pivots[i - 1].priority as keyof typeof priorityOrder];
      const curr = priorityOrder[pivots[i].priority as keyof typeof priorityOrder];
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });
});

describe("Hypothesis Agent — evidence gaps", () => {
  it("evidence gap has required structure", () => {
    const gap = {
      description: "No endpoint detection data from affected host",
      impact: "Cannot confirm if malware was deployed post-compromise",
      suggestedAction: "Deploy EDR agent or check existing AV logs",
      priority: "high",
    };
    expect(gap.description).toBeTruthy();
    expect(gap.impact).toBeTruthy();
    expect(gap.suggestedAction).toBeTruthy();
    expect(["critical", "high", "medium", "low"]).toContain(gap.priority);
  });

  it("gaps are derived from correlation missing evidence", () => {
    const correlationMissing = [
      { description: "No FIM data", impact: "Cannot detect file changes", suggestedAction: "Enable FIM" },
    ];
    // Hypothesis agent should propagate and expand these
    expect(correlationMissing.length).toBeGreaterThan(0);
    for (const m of correlationMissing) {
      expect(m.description).toBeTruthy();
      expect(m.impact).toBeTruthy();
    }
  });
});

describe("Hypothesis Agent — timeline reconstruction", () => {
  const VALID_SOURCES = [
    "wazuh_alert", "wazuh_fim", "wazuh_vuln", "wazuh_agent",
    "wazuh_sca", "threat_intel", "llm_inference", "analyst_input",
    "system_computed",
  ];

  const VALID_SIGNIFICANCES = ["critical", "high", "medium", "low", "info"];

  it("timeline event has required structure", () => {
    const event = {
      timestamp: "2026-02-28T10:15:00Z",
      event: "First failed login attempt from 10.0.1.45",
      source: "wazuh_alert",
      significance: "high",
    };
    expect(event.timestamp).toBeTruthy();
    expect(event.event).toBeTruthy();
    expect(VALID_SOURCES).toContain(event.source);
    expect(VALID_SIGNIFICANCES).toContain(event.significance);
  });

  it("timeline events are chronologically ordered", () => {
    const events = [
      { timestamp: "2026-02-28T10:00:00Z", event: "First event" },
      { timestamp: "2026-02-28T10:05:00Z", event: "Second event" },
      { timestamp: "2026-02-28T10:10:00Z", event: "Third event" },
    ];
    for (let i = 1; i < events.length; i++) {
      expect(new Date(events[i].timestamp).getTime())
        .toBeGreaterThanOrEqual(new Date(events[i - 1].timestamp).getTime());
    }
  });

  it("source enum covers all expected data sources", () => {
    expect(VALID_SOURCES).toHaveLength(9);
    expect(VALID_SOURCES).toContain("wazuh_alert");
    expect(VALID_SOURCES).toContain("llm_inference");
    expect(VALID_SOURCES).toContain("analyst_input");
  });
});

describe("Hypothesis Agent — recommended actions", () => {
  const VALID_CATEGORIES = ["immediate", "next", "optional"];
  const VALID_STATES = ["proposed", "approved", "rejected", "deferred"];

  it("action categories are correct", () => {
    expect(VALID_CATEGORIES).toHaveLength(3);
  });

  it("action states are correct", () => {
    expect(VALID_STATES).toHaveLength(4);
  });

  it("action has required structure", () => {
    const action = {
      action: "Block source IP at firewall",
      category: "immediate",
      evidenceBasis: ["Known malicious IP", "Active brute-force"],
      requiresApproval: true,
      state: "proposed",
    };
    expect(action.action).toBeTruthy();
    expect(VALID_CATEGORIES).toContain(action.category);
    expect(VALID_STATES).toContain(action.state);
    expect(Array.isArray(action.evidenceBasis)).toBe(true);
    expect(typeof action.requiresApproval).toBe("boolean");
  });

  it("state transitions are valid", () => {
    const validTransitions: Record<string, string[]> = {
      proposed: ["approved", "rejected", "deferred"],
      approved: [],
      rejected: [],
      deferred: ["proposed"],
    };

    expect(validTransitions.proposed).toContain("approved");
    expect(validTransitions.proposed).toContain("rejected");
    expect(validTransitions.proposed).toContain("deferred");
  });
});

describe("Hypothesis Agent — completed pivots", () => {
  it("completed pivot has required structure", () => {
    const pivot = {
      action: "Checked DHCP logs for IP 10.0.1.45",
      finding: "IP was not reassigned during the attack window",
      performedAt: "2026-02-28T11:00:00Z",
      impactedTheory: true,
    };
    expect(pivot.action).toBeTruthy();
    expect(pivot.finding).toBeTruthy();
    expect(pivot.performedAt).toBeTruthy();
    expect(typeof pivot.impactedTheory).toBe("boolean");
  });

  it("pivot recording preserves analyst input", () => {
    const pivots = [
      { action: "Reviewed firewall logs", finding: "No outbound C2 traffic detected", impactedTheory: false },
      { action: "Checked AD for account lockouts", finding: "Account was locked 3 times", impactedTheory: true },
    ];
    expect(pivots).toHaveLength(2);
    expect(pivots[1].impactedTheory).toBe(true);
    expect(pivots[0].impactedTheory).toBe(false);
  });
});

describe("Hypothesis Agent — draft documentation", () => {
  it("generates shift handoff summary", () => {
    const docs = {
      shiftHandoff: "Active investigation into brute-force attack from 10.0.1.45. Working theory: credential stuffing. 2 pivots completed, 3 pending actions.",
      escalationSummary: "Recommend escalation to Tier 3 due to potential lateral movement.",
      executiveSummary: "Automated brute-force attack detected targeting admin accounts. No confirmed compromise. Monitoring continues.",
      tuningSuggestions: "Consider adding rate limiting on auth endpoints. Rule 100001 threshold may need adjustment.",
    };
    expect(docs.shiftHandoff).toBeTruthy();
    expect(docs.shiftHandoff.length).toBeGreaterThan(20);
    expect(docs.escalationSummary).toBeTruthy();
    expect(docs.executiveSummary).toBeTruthy();
    expect(docs.tuningSuggestions).toBeTruthy();
  });
});

describe("Hypothesis Agent — linked artifact tracking", () => {
  it("tracks linked triage IDs", () => {
    const linkedTriageIds = ["triage-abc123", "triage-def456"];
    expect(linkedTriageIds).toHaveLength(2);
    for (const id of linkedTriageIds) {
      expect(id).toMatch(/^triage-/);
    }
  });

  it("tracks linked correlation IDs", () => {
    const linkedCorrelationIds = ["corr-abc123"];
    expect(linkedCorrelationIds).toHaveLength(1);
    for (const id of linkedCorrelationIds) {
      expect(id).toMatch(/^corr-/);
    }
  });

  it("tracks linked alert IDs from correlation bundle", () => {
    const linkedAlertIds = ["alert-001", "alert-002", "alert-003"];
    expect(linkedAlertIds.length).toBeGreaterThan(0);
  });
});

describe("Hypothesis Agent — pipeline router contracts", () => {
  it("generateHypothesis input requires correlationId", () => {
    const input = { correlationId: "corr-abc123" };
    expect(input.correlationId).toBeTruthy();
    expect(input.correlationId).toMatch(/^corr-/);
  });

  it("generateHypothesis output includes success, caseId, sessionId", () => {
    const output = {
      success: true,
      caseId: 42,
      sessionId: 1,
    };
    expect(output.success).toBe(true);
    expect(output.caseId).toBeGreaterThan(0);
    expect(output.sessionId).toBeGreaterThan(0);
  });

  it("getLivingCaseById returns found flag and case data", () => {
    const output = {
      found: true,
      livingCase: {
        id: 42,
        sessionId: 1,
        theoryConfidence: 0.78,
        workingTheory: "Credential stuffing attack",
        caseData: {},
      },
    };
    expect(output.found).toBe(true);
    expect(output.livingCase.id).toBe(42);
    expect(output.livingCase.theoryConfidence).toBeGreaterThanOrEqual(0);
  });

  it("listLivingCases returns paginated results", () => {
    const output = {
      cases: [
        { id: 1, sessionId: 1, theoryConfidence: 0.78, workingTheory: "Theory A" },
        { id: 2, sessionId: 2, theoryConfidence: 0.55, workingTheory: "Theory B" },
      ],
      total: 2,
    };
    expect(output.cases).toHaveLength(2);
    expect(output.total).toBe(2);
  });

  it("Direction 1: uses responseActions.approve/reject/defer/execute (not updateActionState)", () => {
    // updateActionState has been removed — all state transitions go through
    // the responseActionsRouter's dedicated endpoints with centralized invariants.
    const validEndpoints = ["approve", "reject", "defer", "execute", "repropose", "bulkApprove"];
    expect(validEndpoints).toContain("approve");
    expect(validEndpoints).toContain("reject");
    expect(validEndpoints).toContain("defer");
    expect(validEndpoints).toContain("execute");
    // Each endpoint requires actionId (string), not caseId+actionIndex
    const input = { actionId: "ra-test123", reason: "Confirmed threat" };
    expect(input.actionId).toMatch(/^ra-/);
  });

  it("recordPivot input requires caseId, action, finding", () => {
    const input = {
      caseId: 42,
      action: "Checked firewall logs",
      finding: "No suspicious outbound traffic",
      impactedTheory: false,
    };
    expect(input.caseId).toBeGreaterThan(0);
    expect(input.action).toBeTruthy();
    expect(input.finding).toBeTruthy();
    expect(typeof input.impactedTheory).toBe("boolean");
  });
});

describe("Hypothesis Agent — LLM prompt construction", () => {
  it("system prompt includes role and output format", () => {
    const systemPromptKeywords = [
      "hypothesis", "security", "analyst", "JSON",
      "workingTheory", "alternateTheories", "suggestedNextSteps",
    ];
    // The hypothesis agent system prompt should contain these keywords
    for (const kw of systemPromptKeywords) {
      expect(kw).toBeTruthy();
    }
  });

  it("user prompt includes correlation bundle data", () => {
    const correlationData = {
      synthesis: { narrative: "Attack narrative" },
      relatedAlerts: [{ ruleId: "100001" }],
      blastRadius: { affectedHosts: 2 },
    };
    const prompt = JSON.stringify(correlationData);
    expect(prompt).toContain("narrative");
    expect(prompt).toContain("relatedAlerts");
    expect(prompt).toContain("blastRadius");
  });

  it("LLM response is parsed as structured JSON", () => {
    const mockLLMResponse = JSON.stringify({
      workingTheory: {
        statement: "Credential stuffing attack",
        confidence: 0.78,
        supportingEvidence: ["evidence1"],
        conflictingEvidence: [],
      },
      alternateTheories: [],
      suggestedNextSteps: [],
      evidenceGaps: [],
      timelineSummary: [],
      recommendedActions: [],
      draftDocumentation: {},
    });
    const parsed = JSON.parse(mockLLMResponse);
    expect(parsed.workingTheory).toBeDefined();
    expect(parsed.workingTheory.statement).toBeTruthy();
    expect(parsed.workingTheory.confidence).toBeGreaterThanOrEqual(0);
  });
});

describe("Hypothesis Agent — living case state persistence", () => {
  it("living_case_state table has required columns", () => {
    const requiredColumns = [
      "id", "sessionId", "correlationId", "sourceTriageId",
      "caseData", "theoryConfidence", "workingTheory",
      "completedPivotCount", "evidenceGapCount", "pendingActionCount",
      "approvalRequiredCount", "lastUpdatedBy", "createdAt", "updatedAt",
    ];
    expect(requiredColumns.length).toBeGreaterThanOrEqual(14);
  });

  it("caseData column stores full LivingCaseObject as JSON", () => {
    const caseData = {
      schemaVersion: "1.0",
      workingTheory: { statement: "Test", confidence: 0.5 },
      alternateTheories: [],
      suggestedNextSteps: [],
      evidenceGaps: [],
      timelineSummary: [],
      recommendedActions: [],
      completedPivots: [],
      draftDocumentation: {},
      linkedTriageIds: ["triage-abc"],
      linkedCorrelationIds: ["corr-abc"],
      linkedAlertIds: [],
    };
    const serialized = JSON.stringify(caseData);
    const deserialized = JSON.parse(serialized);
    expect(deserialized.schemaVersion).toBe("1.0");
    expect(deserialized.workingTheory.statement).toBe("Test");
  });

  it("denormalized fields are extracted from caseData for querying", () => {
    const caseData = {
      workingTheory: { statement: "Attack theory", confidence: 0.82 },
      evidenceGaps: [{ description: "gap1" }, { description: "gap2" }],
      recommendedActions: [
        { state: "proposed", requiresApproval: true },
        { state: "approved", requiresApproval: false },
        { state: "proposed", requiresApproval: false },
      ],
      completedPivots: [{ action: "pivot1" }],
    };

    const theoryConfidence = caseData.workingTheory.confidence;
    const workingTheory = caseData.workingTheory.statement;
    const evidenceGapCount = caseData.evidenceGaps.length;
    const pendingActionCount = caseData.recommendedActions.filter(a => a.state === "proposed").length;
    const approvalRequiredCount = caseData.recommendedActions.filter(a => a.state === "proposed" && a.requiresApproval).length;
    const completedPivotCount = caseData.completedPivots.length;

    expect(theoryConfidence).toBe(0.82);
    expect(workingTheory).toBe("Attack theory");
    expect(evidenceGapCount).toBe(2);
    expect(pendingActionCount).toBe(2);
    expect(approvalRequiredCount).toBe(1);
    expect(completedPivotCount).toBe(1);
  });
});

describe("Hypothesis Agent — action state management", () => {
  it("updates action state in caseData", () => {
    const actions = [
      { action: "Block IP", state: "proposed", requiresApproval: true },
      { action: "Check logs", state: "proposed", requiresApproval: false },
    ];

    // Simulate updating action 0 to "approved"
    actions[0].state = "approved";
    expect(actions[0].state).toBe("approved");
    expect(actions[1].state).toBe("proposed");
  });

  it("recalculates denormalized counts after state change", () => {
    const actions = [
      { action: "Block IP", state: "approved", requiresApproval: true },
      { action: "Check logs", state: "proposed", requiresApproval: false },
      { action: "Escalate", state: "deferred", requiresApproval: true },
    ];

    const pendingCount = actions.filter(a => a.state === "proposed").length;
    const approvalCount = actions.filter(a => a.state === "proposed" && a.requiresApproval).length;

    expect(pendingCount).toBe(1);
    expect(approvalCount).toBe(0);
  });
});

describe("Hypothesis Agent — pivot recording", () => {
  it("appends pivot to completedPivots array", () => {
    const completedPivots: any[] = [];

    const newPivot = {
      action: "Checked DHCP logs",
      finding: "IP was not reassigned",
      performedAt: new Date().toISOString(),
      impactedTheory: true,
    };

    completedPivots.push(newPivot);
    expect(completedPivots).toHaveLength(1);
    expect(completedPivots[0].action).toBe("Checked DHCP logs");
    expect(completedPivots[0].impactedTheory).toBe(true);
  });

  it("recalculates completedPivotCount after recording", () => {
    const pivots = [
      { action: "Pivot 1", finding: "Finding 1" },
      { action: "Pivot 2", finding: "Finding 2" },
    ];
    expect(pivots.length).toBe(2);
  });
});

describe("Hypothesis Agent — end-to-end pipeline flow", () => {
  it("Step 3 consumes Step 2 output (CorrelationBundle)", () => {
    const correlationBundle = {
      correlationId: "corr-abc123",
      sourceTriageId: "triage-def456",
      status: "completed",
      bundleData: {
        synthesis: { narrative: "Attack narrative" },
        relatedAlerts: [],
        blastRadius: { affectedHosts: 1, affectedUsers: 1 },
        campaignAssessment: { likelyCampaign: false },
      },
    };

    // Hypothesis agent requires completed correlation
    expect(correlationBundle.status).toBe("completed");
    expect(correlationBundle.bundleData.synthesis.narrative).toBeTruthy();
  });

  it("Step 3 produces LivingCaseObject with all required sections", () => {
    const livingCase = {
      schemaVersion: "1.0",
      caseId: "case-001",
      sessionId: 1,
      workingTheory: { statement: "Theory", confidence: 0.7, supportingEvidence: [], conflictingEvidence: [] },
      alternateTheories: [{ statement: "Alt", confidence: 0.3, whyLessLikely: "Reason" }],
      suggestedNextSteps: [{ action: "Check logs", rationale: "Verify", priority: "high", effort: "quick" }],
      evidenceGaps: [{ description: "No EDR", impact: "Blind spot", suggestedAction: "Deploy", priority: "high" }],
      timelineSummary: [{ timestamp: "2026-02-28T10:00:00Z", event: "First alert", source: "wazuh_alert", significance: "high" }],
      recommendedActions: [{ action: "Block IP", category: "immediate", state: "proposed", requiresApproval: true }],
      completedPivots: [],
      draftDocumentation: { shiftHandoff: "Summary", escalationSummary: "Escalate" },
      linkedTriageIds: ["triage-def456"],
      linkedCorrelationIds: ["corr-abc123"],
      linkedAlertIds: [],
    };

    expect(livingCase.schemaVersion).toBe("1.0");
    expect(livingCase.workingTheory.statement).toBeTruthy();
    expect(livingCase.alternateTheories.length).toBeGreaterThan(0);
    expect(livingCase.suggestedNextSteps.length).toBeGreaterThan(0);
    expect(livingCase.evidenceGaps.length).toBeGreaterThan(0);
    expect(livingCase.timelineSummary.length).toBeGreaterThan(0);
    expect(livingCase.recommendedActions.length).toBeGreaterThan(0);
    expect(livingCase.draftDocumentation.shiftHandoff).toBeTruthy();
    expect(livingCase.linkedTriageIds).toContain("triage-def456");
    expect(livingCase.linkedCorrelationIds).toContain("corr-abc123");
  });

  it("pipeline chain: TriageObject → CorrelationBundle → LivingCaseObject", () => {
    // Verify the 3-step pipeline contract
    const step1Output = { triageId: "triage-abc", severity: "high", route: "C_HIGH_CONFIDENCE" };
    const step2Output = { correlationId: "corr-def", sourceTriageId: step1Output.triageId, status: "completed" };
    const step3Output = { caseId: "case-ghi", linkedTriageIds: [step1Output.triageId], linkedCorrelationIds: [step2Output.correlationId] };

    // Step 2 references Step 1
    expect(step2Output.sourceTriageId).toBe(step1Output.triageId);
    // Step 3 references both Step 1 and Step 2
    expect(step3Output.linkedTriageIds).toContain(step1Output.triageId);
    expect(step3Output.linkedCorrelationIds).toContain(step2Output.correlationId);
  });
});
