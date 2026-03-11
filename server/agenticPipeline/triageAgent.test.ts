/**
 * Triage Agent Integration Tests
 *
 * Tests edge cases and extraction logic in the triage agent:
 *   - Entity extraction from various Wazuh alert types (SSH, FIM, minimal)
 *   - MITRE mapping extraction from Wazuh-native fields
 *   - Severity validation and normalization
 *   - Route validation and normalization
 *   - Confidence clamping (out-of-range values)
 *   - Dedup detection handling
 *   - Key evidence construction
 *   - Minimal alert handling (missing fields)
 *   - Query helpers (getTriageById, listTriages, getTriageStats)
 *
 * What is real:
 *   - The triage agent code paths (parsing, validation, entity extraction, DB writes)
 *   - The database (real MySQL)
 *
 * What is mocked:
 *   - LLM (returns structured JSON)
 *   - External services (Wazuh, Indexer, OTX)
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import type { AgenticSeverity, TriageRoute } from "../../shared/agenticSchemas";

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

vi.mock("../threatIntel/otxService", () => ({
  otxGet: async () => ({}),
}));

const HAS_DB = !!process.env.DATABASE_URL;

// ── Alert fixtures ──────────────────────────────────────────────────────────

const SSH_BRUTE_FORCE_ALERT = {
  id: "triage-test-ssh-1",
  timestamp: "2026-03-01T12:00:00.000Z",
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
  agent: { id: "010", name: "prod-web-01", ip: "192.168.10.10" },
  data: { srcip: "203.0.113.99", srcuser: "admin", dstuser: "nobody" },
};

const FIM_ALERT = {
  id: "triage-test-fim-1",
  timestamp: "2026-03-01T13:00:00.000Z",
  rule: {
    id: "550",
    level: 7,
    description: "File integrity monitoring: file modified",
    mitre: {
      id: ["T1565.001"],
      technique: ["Stored Data Manipulation"],
      tactic: ["Impact"],
    },
  },
  agent: { id: "020", name: "db-server-02", ip: "192.168.20.20" },
  data: {},
  syscheck: {
    path: "/etc/shadow",
    md5_after: "d41d8cd98f00b204e9800998ecf8427e",
    sha256_after: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
};

const MINIMAL_ALERT = {
  id: "triage-test-min-1",
  timestamp: "2026-03-01T14:00:00.000Z",
  rule: { id: "100", level: 2, description: "Generic low-level alert" },
  agent: { id: "030", name: "test-host" },
  data: {},
};

const NETWORK_ALERT = {
  id: "triage-test-net-1",
  timestamp: "2026-03-01T15:00:00.000Z",
  rule: {
    id: "87700",
    level: 12,
    description: "Suricata: ET TROJAN detected",
    mitre: {
      id: ["T1071.001", "T1573"],
      technique: ["Web Protocols", "Encrypted Channel"],
      tactic: ["Command and Control", "Command and Control"],
    },
  },
  agent: { id: "040", name: "ids-sensor-01", ip: "10.0.0.50" },
  data: { srcip: "192.168.1.100", dstip: "198.51.100.42", srcuser: "jdoe" },
};

function makeTriageLLMResponse(overrides: Record<string, unknown> = {}) {
  return {
    choices: [{ message: { content: JSON.stringify({
      alertFamily: overrides.alertFamily ?? "brute_force",
      severity: overrides.severity ?? "high",
      severityConfidence: overrides.severityConfidence ?? 0.85,
      severityReasoning: overrides.severityReasoning ?? "Clear attack pattern",
      entities: overrides.entities ?? [
        { type: "ip", value: "203.0.113.99", confidence: 1.0 },
      ],
      mitreMapping: overrides.mitreMapping ?? [
        { techniqueId: "T1110.001", techniqueName: "Password Guessing", tactic: "Credential Access", confidence: 0.9 },
      ],
      dedup: overrides.dedup ?? { isDuplicate: false, similarityScore: 0.1, reasoning: "New alert" },
      route: overrides.route ?? "C_HIGH_CONFIDENCE",
      routeReasoning: overrides.routeReasoning ?? "Clear indicators",
      summary: overrides.summary ?? "SSH brute force detected",
      uncertainties: overrides.uncertainties ?? [],
      caseLink: overrides.caseLink ?? { shouldLink: false, confidence: 0.1, reasoning: "No match" },
    }) } }],
    usage: { prompt_tokens: 1000, completion_tokens: 300 },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("runTriageAgent — entity extraction", () => {
  it.skipIf(!HAS_DB)(
    "extracts IP, user, host, and rule_id entities from SSH alert",
    async () => {
      const { runTriageAgent } = await import("./triageAgent");
      mockLLMResponse.mockResolvedValueOnce(makeTriageLLMResponse());

      const result = await runTriageAgent({ rawAlert: SSH_BRUTE_FORCE_ALERT, userId: 1 });
      expect(result.success).toBe(true);

      const triage = result.triageObject!;
      const entityTypes = triage.entities.map(e => e.type);
      const entityValues = triage.entities.map(e => e.value);

      // Wazuh-native entities
      expect(entityTypes).toContain("ip");
      expect(entityValues).toContain("203.0.113.99"); // srcip
      expect(entityTypes).toContain("user");
      expect(entityValues).toContain("admin"); // srcuser
      expect(entityTypes).toContain("host");
      expect(entityValues).toContain("prod-web-01"); // agent name
      expect(entityTypes).toContain("rule_id");
      expect(entityValues).toContain("5710"); // rule id
    }
  );

  it.skipIf(!HAS_DB)(
    "extracts file_path and hash entities from FIM alert",
    async () => {
      const { runTriageAgent } = await import("./triageAgent");
      mockLLMResponse.mockResolvedValueOnce(makeTriageLLMResponse({
        alertFamily: "file_integrity",
        severity: "medium",
        severityConfidence: 0.7,
        severityReasoning: "Critical file modified",
        entities: [{ type: "file_path", value: "/etc/shadow", confidence: 1.0 }],
        summary: "FIM alert on /etc/shadow",
      }));

      const result = await runTriageAgent({ rawAlert: FIM_ALERT, userId: 1 });
      expect(result.success).toBe(true);

      const triage = result.triageObject!;
      const entityTypes = triage.entities.map(e => e.type);
      const entityValues = triage.entities.map(e => e.value);

      expect(entityTypes).toContain("file_path");
      expect(entityValues).toContain("/etc/shadow");
      expect(entityTypes).toContain("hash");
      // Should have both MD5 and SHA256
      const hashEntities = triage.entities.filter(e => e.type === "hash");
      expect(hashEntities.length).toBeGreaterThanOrEqual(2);
    }
  );

  it.skipIf(!HAS_DB)(
    "extracts multiple IPs from network alert (srcip + dstip)",
    async () => {
      const { runTriageAgent } = await import("./triageAgent");
      mockLLMResponse.mockResolvedValueOnce(makeTriageLLMResponse({
        alertFamily: "network_trojan",
        severity: "critical",
        severityConfidence: 0.9,
        entities: [
          { type: "ip", value: "192.168.1.100", confidence: 1.0 },
          { type: "ip", value: "198.51.100.42", confidence: 1.0 },
        ],
        summary: "Suricata trojan detection",
      }));

      const result = await runTriageAgent({ rawAlert: NETWORK_ALERT, userId: 1 });
      expect(result.success).toBe(true);

      const triage = result.triageObject!;
      const ipEntities = triage.entities.filter(e => e.type === "ip");
      const ipValues = ipEntities.map(e => e.value);

      expect(ipValues).toContain("192.168.1.100"); // srcip
      expect(ipValues).toContain("198.51.100.42"); // dstip
    }
  );

  it.skipIf(!HAS_DB)(
    "handles minimal alert with no data fields gracefully",
    async () => {
      const { runTriageAgent } = await import("./triageAgent");
      mockLLMResponse.mockResolvedValueOnce(makeTriageLLMResponse({
        alertFamily: "generic",
        severity: "low",
        severityConfidence: 0.5,
        entities: [],
        summary: "Generic low-level alert",
        route: "D_LIKELY_BENIGN",
        routeReasoning: "Low severity, no indicators",
      }));

      const result = await runTriageAgent({ rawAlert: MINIMAL_ALERT, userId: 1 });
      expect(result.success).toBe(true);

      const triage = result.triageObject!;
      // Should still have at least host and rule_id from Wazuh-native extraction
      const entityTypes = triage.entities.map(e => e.type);
      expect(entityTypes).toContain("host");
      expect(entityTypes).toContain("rule_id");
    }
  );
});

describe("runTriageAgent — MITRE mapping extraction", () => {
  it.skipIf(!HAS_DB)(
    "extracts MITRE mappings from Wazuh-native rule.mitre fields",
    async () => {
      const { runTriageAgent } = await import("./triageAgent");
      mockLLMResponse.mockResolvedValueOnce(makeTriageLLMResponse());

      const result = await runTriageAgent({ rawAlert: SSH_BRUTE_FORCE_ALERT, userId: 1 });
      expect(result.success).toBe(true);

      const triage = result.triageObject!;
      const techniqueIds = triage.mitreMapping.map(m => m.techniqueId);

      // T1110.001 should be present from Wazuh-native extraction
      expect(techniqueIds).toContain("T1110.001");
    }
  );

  it.skipIf(!HAS_DB)(
    "extracts multiple MITRE techniques from multi-technique alert",
    async () => {
      const { runTriageAgent } = await import("./triageAgent");
      mockLLMResponse.mockResolvedValueOnce(makeTriageLLMResponse({
        alertFamily: "network_trojan",
        severity: "critical",
        mitreMapping: [
          { techniqueId: "T1071.001", techniqueName: "Web Protocols", tactic: "Command and Control", confidence: 0.85 },
          { techniqueId: "T1573", techniqueName: "Encrypted Channel", tactic: "Command and Control", confidence: 0.8 },
        ],
        summary: "Multi-technique detection",
      }));

      const result = await runTriageAgent({ rawAlert: NETWORK_ALERT, userId: 1 });
      expect(result.success).toBe(true);

      const triage = result.triageObject!;
      const techniqueIds = triage.mitreMapping.map(m => m.techniqueId);

      // Should have both Wazuh-native and LLM-provided techniques
      expect(techniqueIds).toContain("T1071.001");
      expect(techniqueIds).toContain("T1573");
    }
  );

  it.skipIf(!HAS_DB)(
    "handles alert with no MITRE data in rule",
    async () => {
      const { runTriageAgent } = await import("./triageAgent");
      mockLLMResponse.mockResolvedValueOnce(makeTriageLLMResponse({
        alertFamily: "generic",
        severity: "low",
        mitreMapping: [],
        summary: "No MITRE data",
        route: "D_LIKELY_BENIGN",
      }));

      const result = await runTriageAgent({ rawAlert: MINIMAL_ALERT, userId: 1 });
      expect(result.success).toBe(true);

      const triage = result.triageObject!;
      // mitreMapping should still be a valid array (possibly empty)
      expect(Array.isArray(triage.mitreMapping)).toBe(true);
    }
  );
});

describe("runTriageAgent — validation and normalization", () => {
  it.skipIf(!HAS_DB)(
    "normalizes invalid severity to 'info'",
    async () => {
      const { runTriageAgent } = await import("./triageAgent");
      mockLLMResponse.mockResolvedValueOnce(makeTriageLLMResponse({
        severity: "SUPER_CRITICAL",
        severityConfidence: 0.9,
      }));

      const result = await runTriageAgent({ rawAlert: SSH_BRUTE_FORCE_ALERT, userId: 1 });
      expect(result.success).toBe(true);

      const validSeverities: AgenticSeverity[] = ["critical", "high", "medium", "low", "info"];
      expect(validSeverities).toContain(result.triageObject!.severity);
      expect(result.triageObject!.severity).toBe("info"); // fallback
    }
  );

  it.skipIf(!HAS_DB)(
    "normalizes invalid route to 'B_LOW_CONFIDENCE'",
    async () => {
      const { runTriageAgent } = await import("./triageAgent");
      mockLLMResponse.mockResolvedValueOnce(makeTriageLLMResponse({
        route: "INVALID_ROUTE",
      }));

      const result = await runTriageAgent({ rawAlert: SSH_BRUTE_FORCE_ALERT, userId: 1 });
      expect(result.success).toBe(true);

      const validRoutes: TriageRoute[] = ["A_DUPLICATE_NOISY", "B_LOW_CONFIDENCE", "C_HIGH_CONFIDENCE", "D_LIKELY_BENIGN"];
      expect(validRoutes).toContain(result.triageObject!.route);
      expect(result.triageObject!.route).toBe("B_LOW_CONFIDENCE"); // fallback
    }
  );

  it.skipIf(!HAS_DB)(
    "clamps confidence > 1.0 to 1.0",
    async () => {
      const { runTriageAgent } = await import("./triageAgent");
      mockLLMResponse.mockResolvedValueOnce(makeTriageLLMResponse({
        severityConfidence: 999,
      }));

      const result = await runTriageAgent({ rawAlert: SSH_BRUTE_FORCE_ALERT, userId: 1 });
      expect(result.success).toBe(true);
      expect(result.triageObject!.severityConfidence).toBeLessThanOrEqual(1);
    }
  );

  it.skipIf(!HAS_DB)(
    "clamps negative confidence to 0",
    async () => {
      const { runTriageAgent } = await import("./triageAgent");
      mockLLMResponse.mockResolvedValueOnce(makeTriageLLMResponse({
        severityConfidence: -5,
      }));

      const result = await runTriageAgent({ rawAlert: SSH_BRUTE_FORCE_ALERT, userId: 1 });
      expect(result.success).toBe(true);
      expect(result.triageObject!.severityConfidence).toBeGreaterThanOrEqual(0);
    }
  );

  it.skipIf(!HAS_DB)(
    "clamps NaN confidence to 0",
    async () => {
      const { runTriageAgent } = await import("./triageAgent");
      mockLLMResponse.mockResolvedValueOnce(makeTriageLLMResponse({
        severityConfidence: "not_a_number",
      }));

      const result = await runTriageAgent({ rawAlert: SSH_BRUTE_FORCE_ALERT, userId: 1 });
      expect(result.success).toBe(true);
      expect(result.triageObject!.severityConfidence).toBe(0);
    }
  );
});

describe("runTriageAgent — key evidence and raw alert preservation", () => {
  it.skipIf(!HAS_DB)(
    "preserves raw alert exactly as provided",
    async () => {
      const { runTriageAgent } = await import("./triageAgent");
      mockLLMResponse.mockResolvedValueOnce(makeTriageLLMResponse());

      const result = await runTriageAgent({ rawAlert: SSH_BRUTE_FORCE_ALERT, userId: 1 });
      expect(result.success).toBe(true);

      // rawAlert should be preserved verbatim
      expect(result.triageObject!.rawAlert).toEqual(SSH_BRUTE_FORCE_ALERT);
    }
  );

  it.skipIf(!HAS_DB)(
    "constructs key evidence from raw alert",
    async () => {
      const { runTriageAgent } = await import("./triageAgent");
      mockLLMResponse.mockResolvedValueOnce(makeTriageLLMResponse());

      const result = await runTriageAgent({ rawAlert: SSH_BRUTE_FORCE_ALERT, userId: 1 });
      expect(result.success).toBe(true);

      const triage = result.triageObject!;
      expect(triage.keyEvidence.length).toBeGreaterThan(0);
      expect(triage.keyEvidence[0].type).toBe("alert");
      expect(triage.keyEvidence[0].source).toBe("wazuh_alert");
      expect(triage.keyEvidence[0].data).toBeDefined();
    }
  );
});

describe("runTriageAgent — dedup handling", () => {
  it.skipIf(!HAS_DB)(
    "handles duplicate detection from LLM",
    async () => {
      const { runTriageAgent } = await import("./triageAgent");
      mockLLMResponse.mockResolvedValueOnce(makeTriageLLMResponse({
        dedup: {
          isDuplicate: true,
          similarityScore: 0.95,
          reasoning: "Nearly identical to triage-test-ssh-1",
        },
        route: "A_DUPLICATE_NOISY",
        routeReasoning: "Duplicate of existing triage",
      }));

      const result = await runTriageAgent({ rawAlert: SSH_BRUTE_FORCE_ALERT, userId: 1 });
      expect(result.success).toBe(true);

      const triage = result.triageObject!;
      expect(triage.dedup.isDuplicate).toBe(true);
      expect(triage.dedup.similarityScore).toBeGreaterThan(0.9);
      expect(triage.route).toBe("A_DUPLICATE_NOISY");
    }
  );
});

describe("runTriageAgent — token counting", () => {
  it.skipIf(!HAS_DB)(
    "reports correct token usage",
    async () => {
      const { runTriageAgent } = await import("./triageAgent");
      mockLLMResponse.mockResolvedValueOnce({
        ...makeTriageLLMResponse(),
        usage: { prompt_tokens: 500, completion_tokens: 200 },
      });

      const result = await runTriageAgent({ rawAlert: SSH_BRUTE_FORCE_ALERT, userId: 1 });
      expect(result.success).toBe(true);
      expect(result.tokensUsed).toBe(700);
    }
  );

  it.skipIf(!HAS_DB)(
    "handles missing usage gracefully",
    async () => {
      const { runTriageAgent } = await import("./triageAgent");
      const response = makeTriageLLMResponse();
      delete (response as any).usage;
      mockLLMResponse.mockResolvedValueOnce(response);

      const result = await runTriageAgent({ rawAlert: SSH_BRUTE_FORCE_ALERT, userId: 1 });
      expect(result.success).toBe(true);
      expect(result.tokensUsed).toBe(0);
    }
  );
});

describe("Triage query helpers", () => {
  it.skipIf(!HAS_DB)(
    "getTriageById returns null for non-existent ID",
    async () => {
      const { getTriageById } = await import("./triageAgent");
      const result = await getTriageById("nonexistent-triage-id");
      expect(result).toBeNull();
    }
  );

  it.skipIf(!HAS_DB)(
    "listTriages returns paginated results",
    async () => {
      const { listTriages } = await import("./triageAgent");
      const result = await listTriages({ limit: 5, offset: 0 });

      expect(result).toHaveProperty("triages");
      expect(result).toHaveProperty("total");
      expect(Array.isArray(result.triages)).toBe(true);
      expect(typeof result.total).toBe("number");
    }
  );

  it.skipIf(!HAS_DB)(
    "getTriageStats returns aggregate statistics",
    async () => {
      const { getTriageStats } = await import("./triageAgent");
      const stats = await getTriageStats();

      expect(stats).toHaveProperty("total");
      expect(typeof stats.total).toBe("number");
    }
  );
});
