/**
 * Parameter Broker — unit tests
 *
 * Proves the forwarding contract:
 *   - Accepted params are forwarded with correct Wazuh outbound names
 *   - Aliases resolve to the canonical param
 *   - Unsupported params are detected and returned
 *   - Type coercion works for string, number, boolean, csv
 *   - Empty/null/undefined values are omitted (not forwarded as empty strings)
 *
 * Also proves the endpoint-specific configs for all 11 wired endpoints:
 *   /agents, /rules, /groups, /cluster/nodes, /sca/{agent_id}, /manager/configuration,
 *   /syscollector/{agent_id}/packages, /ports, /processes, /services
 */
import { describe, it, expect } from "vitest";
import {
  brokerParams,
  AGENTS_CONFIG,
  RULES_CONFIG,
  GROUPS_CONFIG,
  CLUSTER_NODES_CONFIG,
  SCA_POLICIES_CONFIG,
  SCA_CHECKS_CONFIG,
  MANAGER_CONFIG,
  UNIVERSAL_PARAMS,
  SYSCOLLECTOR_PACKAGES_CONFIG,
  SYSCOLLECTOR_PORTS_CONFIG,
  SYSCOLLECTOR_PROCESSES_CONFIG,
  SYSCOLLECTOR_SERVICES_CONFIG,
} from "./paramBroker";

// ═══════════════════════════════════════════════════════════════════════════════
// BROKER CORE — unit tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("brokerParams core", () => {
  it("forwards recognized params with correct Wazuh outbound names", () => {
    const result = brokerParams(AGENTS_CONFIG, {
      limit: 50,
      offset: 10,
      status: "active",
    });
    expect(result.forwardedQuery).toEqual({
      limit: "50",
      offset: "10",
      status: "active",
    });
    expect(result.recognizedParams).toContain("limit");
    expect(result.recognizedParams).toContain("offset");
    expect(result.recognizedParams).toContain("status");
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("detects and returns unsupported params", () => {
    const result = brokerParams(AGENTS_CONFIG, {
      limit: 10,
      bogus_param: "hello",
      another_fake: 42,
    });
    expect(result.unsupportedParams).toContain("bogus_param");
    expect(result.unsupportedParams).toContain("another_fake");
    expect(result.recognizedParams).toContain("limit");
    // Unsupported params must NOT appear in forwardedQuery
    expect(result.forwardedQuery).not.toHaveProperty("bogus_param");
    expect(result.forwardedQuery).not.toHaveProperty("another_fake");
  });

  it("omits null, undefined, and empty-string values from forwarded query", () => {
    const result = brokerParams(AGENTS_CONFIG, {
      limit: 10,
      status: null,
      search: undefined,
      sort: "",
    });
    expect(result.forwardedQuery).toEqual({ limit: "10" });
    // limit and sort are recognized (sort has a value that coerces to null)
    // null and undefined values are skipped before reaching the coercer
    expect(result.recognizedParams).toContain("limit");
    expect(result.recognizedParams).toContain("sort");
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("resolves aliases to canonical Wazuh param names", () => {
    const result = brokerParams(AGENTS_CONFIG, {
      os_platform: "ubuntu",
    });
    // os_platform is an alias for "os.platform" → wazuhName "os.platform"
    expect(result.forwardedQuery).toEqual({ "os.platform": "ubuntu" });
    expect(result.recognizedParams).toContain("os_platform");
    expect(result.unsupportedParams).toHaveLength(0);
  });

  it("coerces number values to strings", () => {
    const result = brokerParams(AGENTS_CONFIG, { limit: 100, offset: 0 });
    expect(result.forwardedQuery.limit).toBe("100");
    expect(result.forwardedQuery.offset).toBe("0");
  });

  it("coerces boolean true to string 'true'", () => {
    const result = brokerParams(AGENTS_CONFIG, { distinct: true });
    expect(result.forwardedQuery.distinct).toBe("true");
  });

  // Fix #4: distinct: false should be omitted (flag semantics)
  it("does NOT forward distinct=false to Wazuh (flag semantics)", () => {
    const result = brokerParams(AGENTS_CONFIG, { distinct: false });
    expect(result.forwardedQuery).not.toHaveProperty("distinct");
    // false is a valid omission, not an error
    expect(result.errors).toHaveLength(0);
    // but it IS recognized
    expect(result.recognizedParams).toContain("distinct");
  });

  // Fix #3: coerceBoolean rejects truthy strings
  it("coerceBoolean rejects truthy strings like 'yes'", () => {
    const result = brokerParams(AGENTS_CONFIG, { distinct: "yes" as any });
    expect(result.forwardedQuery).not.toHaveProperty("distinct");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("coerceBoolean rejects string 'no' (does not silently coerce to true)", () => {
    const result = brokerParams(AGENTS_CONFIG, { distinct: "no" as any });
    expect(result.forwardedQuery).not.toHaveProperty("distinct");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("coerceBoolean rejects string 'false' (does not silently coerce to true)", () => {
    const result = brokerParams(AGENTS_CONFIG, { distinct: "false" as any });
    expect(result.forwardedQuery).not.toHaveProperty("distinct");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("coerceBoolean accepts numeric 1 as true", () => {
    const result = brokerParams(AGENTS_CONFIG, { distinct: 1 as any });
    expect(result.forwardedQuery.distinct).toBe("true");
    expect(result.errors).toHaveLength(0);
  });

  it("coerceBoolean treats numeric 0 as false (omitted)", () => {
    const result = brokerParams(AGENTS_CONFIG, { distinct: 0 as any });
    expect(result.forwardedQuery).not.toHaveProperty("distinct");
    expect(result.errors).toHaveLength(0);
  });

  it("coerces csv (array) values to comma-separated strings", () => {
    const result = brokerParams(AGENTS_CONFIG, { select: ["name", "ip", "status"] });
    expect(result.forwardedQuery.select).toBe("name,ip,status");
  });

  it("coerces csv (string) values pass-through", () => {
    const result = brokerParams(AGENTS_CONFIG, { select: "name,ip" });
    expect(result.forwardedQuery.select).toBe("name,ip");
  });

  // Fix #1/#2: NaN coercion records an error instead of silently dropping
  it("records an error when a number param receives a non-numeric value", () => {
    const result = brokerParams(AGENTS_CONFIG, { limit: "not-a-number" });
    expect(result.forwardedQuery).not.toHaveProperty("limit");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("limit");
    expect(result.errors[0]).toContain("not-a-number");
  });

  it("records an error when a number param receives NaN", () => {
    const result = brokerParams(AGENTS_CONFIG, { limit: NaN });
    expect(result.forwardedQuery).not.toHaveProperty("limit");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("errors[] is empty when all values are valid", () => {
    const result = brokerParams(AGENTS_CONFIG, { limit: 50, offset: 10, status: "active" });
    expect(result.errors).toHaveLength(0);
  });

  it("errors[] is empty when no params are provided", () => {
    const result = brokerParams(AGENTS_CONFIG, {});
    expect(result.errors).toHaveLength(0);
  });

  it("errors[] accumulates multiple coercion failures", () => {
    const result = brokerParams(AGENTS_CONFIG, { limit: "bad", offset: "worse" });
    expect(result.errors.length).toBe(2);
    expect(result.errors[0]).toContain("limit");
    expect(result.errors[1]).toContain("offset");
  });

  it("returns empty result for empty input", () => {
    const result = brokerParams(AGENTS_CONFIG, {});
    expect(result.forwardedQuery).toEqual({});
    expect(result.recognizedParams).toHaveLength(0);
    expect(result.unsupportedParams).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FIX A1: os_platform → os.platform
// ═══════════════════════════════════════════════════════════════════════════════

describe("Fix A1: os_platform → os.platform", () => {
  it("maps os_platform alias to outbound os.platform", () => {
    const result = brokerParams(AGENTS_CONFIG, { os_platform: "ubuntu" });
    expect(result.forwardedQuery["os.platform"]).toBe("ubuntu");
    expect(result.forwardedQuery).not.toHaveProperty("os_platform");
    expect(result.recognizedParams).toContain("os_platform");
  });

  it("maps osPlatform alias to outbound os.platform", () => {
    const result = brokerParams(AGENTS_CONFIG, { osPlatform: "windows" });
    expect(result.forwardedQuery["os.platform"]).toBe("windows");
  });

  it("maps platform alias to outbound os.platform", () => {
    const result = brokerParams(AGENTS_CONFIG, { platform: "darwin" });
    expect(result.forwardedQuery["os.platform"]).toBe("darwin");
  });

  it("accepts the canonical os.platform name directly", () => {
    const result = brokerParams(AGENTS_CONFIG, { "os.platform": "centos" });
    expect(result.forwardedQuery["os.platform"]).toBe("centos");
  });

  it("maps os_name alias to outbound os.name", () => {
    const result = brokerParams(AGENTS_CONFIG, { os_name: "Ubuntu" });
    expect(result.forwardedQuery["os.name"]).toBe("Ubuntu");
  });

  it("maps os_version alias to outbound os.version", () => {
    const result = brokerParams(AGENTS_CONFIG, { os_version: "22.04" });
    expect(result.forwardedQuery["os.version"]).toBe("22.04");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FIX A2: search and q are distinct, not conflated
// ═══════════════════════════════════════════════════════════════════════════════

describe("Fix A2: search and q are distinct", () => {
  it("forwards search as native Wazuh search (not rewritten to q)", () => {
    const result = brokerParams(AGENTS_CONFIG, { search: "webserver" });
    expect(result.forwardedQuery.search).toBe("webserver");
    // Must NOT have q — search is its own parameter
    expect(result.forwardedQuery).not.toHaveProperty("q");
  });

  it("forwards q as its own parameter", () => {
    const result = brokerParams(AGENTS_CONFIG, { q: "status=active" });
    expect(result.forwardedQuery.q).toBe("status=active");
    expect(result.forwardedQuery).not.toHaveProperty("search");
  });

  it("forwards both search and q independently when both provided", () => {
    const result = brokerParams(AGENTS_CONFIG, {
      search: "webserver",
      q: "os.platform=ubuntu",
    });
    expect(result.forwardedQuery.search).toBe("webserver");
    expect(result.forwardedQuery.q).toBe("os.platform=ubuntu");
  });

  it("does NOT rewrite search into q=name~... pattern", () => {
    const result = brokerParams(AGENTS_CONFIG, { search: "myhost" });
    // The old buggy behavior was: q: "name~myhost"
    // The correct behavior is: search: "myhost"
    expect(result.forwardedQuery.search).toBe("myhost");
    if (result.forwardedQuery.q) {
      expect(result.forwardedQuery.q).not.toContain("name~");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// /agents endpoint config — full parameter coverage
// ═══════════════════════════════════════════════════════════════════════════════

describe("/agents endpoint config", () => {
  it("accepts all spec-defined parameters", () => {
    const fullInput = {
      limit: 100,
      offset: 0,
      sort: "+name",
      search: "test",
      select: "name,ip,status",
      q: "status=active",
      distinct: true,
      status: "active",
      "os.platform": "ubuntu",
      "os.version": "22.04",
      "os.name": "Ubuntu",
      older_than: "7d",
      agents_list: "001,002,003",
      version: "Wazuh v4.14.3",
      group: "default",
      node_name: "node01",
      name: "agent-001",
      ip: "192.168.1.100",
      registerIP: "192.168.1.100",
      group_config_status: "synced",
    };
    const result = brokerParams(AGENTS_CONFIG, fullInput);
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.recognizedParams.length).toBe(Object.keys(fullInput).length);
  });

  it("rejects parameters not in the /agents spec", () => {
    const result = brokerParams(AGENTS_CONFIG, {
      limit: 10,
      filename: "rules.xml",      // belongs to /rules, not /agents
      pci_dss: "10.6.1",          // belongs to /rules, not /agents
    });
    expect(result.unsupportedParams).toContain("filename");
    expect(result.unsupportedParams).toContain("pci_dss");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// /rules endpoint config
// ═══════════════════════════════════════════════════════════════════════════════

describe("/rules endpoint config", () => {
  it("accepts all spec-defined parameters", () => {
    const fullInput = {
      limit: 100,
      offset: 0,
      sort: "+level",
      search: "ssh",
      select: "id,level,description",
      q: "level>10",
      distinct: true,
      status: "enabled",
      group: "syslog",
      level: "4-8",
      filename: "0010-rules_config.xml",
      relative_dirname: "ruleset/rules",
      pci_dss: "10.6.1",
      gdpr: "IV_35.7.d",
      gpg13: "7.1",
      hipaa: "164.312.b",
      "nist-800-53": "AU.6",
      tsc: "CC7.2",
      mitre: "T1059",
    };
    const result = brokerParams(RULES_CONFIG, fullInput);
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.recognizedParams.length).toBe(Object.keys(fullInput).length);
  });

  it("maps nist_800_53 alias to nist-800-53", () => {
    const result = brokerParams(RULES_CONFIG, { nist_800_53: "AU.6" });
    expect(result.forwardedQuery["nist-800-53"]).toBe("AU.6");
    expect(result.recognizedParams).toContain("nist_800_53");
  });

  it("maps relativeDirname alias to relative_dirname", () => {
    const result = brokerParams(RULES_CONFIG, { relativeDirname: "ruleset/rules" });
    expect(result.forwardedQuery.relative_dirname).toBe("ruleset/rules");
  });

  it("rejects parameters not in the /rules spec", () => {
    const result = brokerParams(RULES_CONFIG, {
      limit: 10,
      "os.platform": "ubuntu",  // belongs to /agents, not /rules
      registerIP: "1.2.3.4",    // belongs to /agents, not /rules
    });
    expect(result.unsupportedParams).toContain("os.platform");
    expect(result.unsupportedParams).toContain("registerIP");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// /groups endpoint config
// ═══════════════════════════════════════════════════════════════════════════════

describe("/groups endpoint config", () => {
  it("accepts universal params plus hash", () => {
    const result = brokerParams(GROUPS_CONFIG, {
      limit: 50,
      offset: 0,
      sort: "+name",
      search: "web",
      q: "name=default",
      hash: "md5",
    });
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.forwardedQuery.hash).toBe("md5");
    expect(result.forwardedQuery.search).toBe("web");
  });

  it("rejects endpoint-specific params from other endpoints", () => {
    const result = brokerParams(GROUPS_CONFIG, {
      limit: 10,
      level: "4",           // belongs to /rules
      "os.platform": "ubuntu", // belongs to /agents
    });
    expect(result.unsupportedParams).toContain("level");
    expect(result.unsupportedParams).toContain("os.platform");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// /cluster/nodes endpoint config
// ═══════════════════════════════════════════════════════════════════════════════

describe("/cluster/nodes endpoint config", () => {
  it("accepts universal params plus type", () => {
    const result = brokerParams(CLUSTER_NODES_CONFIG, {
      limit: 10,
      offset: 0,
      sort: "+name",
      search: "worker",
      type: "worker",
    });
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.forwardedQuery.type).toBe("worker");
    expect(result.forwardedQuery.search).toBe("worker");
  });

  it("maps node_type alias to type", () => {
    const result = brokerParams(CLUSTER_NODES_CONFIG, { node_type: "master" });
    expect(result.forwardedQuery.type).toBe("master");
    expect(result.recognizedParams).toContain("node_type");
  });

  it("maps nodeType alias to type", () => {
    const result = brokerParams(CLUSTER_NODES_CONFIG, { nodeType: "worker" });
    expect(result.forwardedQuery.type).toBe("worker");
  });

  it("rejects parameters not in the /cluster/nodes spec", () => {
    const result = brokerParams(CLUSTER_NODES_CONFIG, {
      limit: 10,
      status: "active",      // belongs to /agents, not /cluster/nodes
      level: "4",            // belongs to /rules
    });
    expect(result.unsupportedParams).toContain("status");
    expect(result.unsupportedParams).toContain("level");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// /sca/{agent_id} endpoint config
// ═══════════════════════════════════════════════════════════════════════════════

describe("/sca/{agent_id} policies config", () => {
  it("accepts universal params plus name, description, references", () => {
    const result = brokerParams(SCA_POLICIES_CONFIG, {
      limit: 50,
      offset: 0,
      search: "cis",
      name: "CIS Benchmark for Debian 10",
      description: "security",
      references: "https://www.cisecurity.org",
    });
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.forwardedQuery.name).toBe("CIS Benchmark for Debian 10");
    expect(result.forwardedQuery.description).toBe("security");
    expect(result.forwardedQuery.references).toBe("https://www.cisecurity.org");
  });

  it("maps policyName alias to name", () => {
    const result = brokerParams(SCA_POLICIES_CONFIG, { policyName: "CIS Debian" });
    expect(result.forwardedQuery.name).toBe("CIS Debian");
  });

  it("rejects parameters not in the /sca spec", () => {
    const result = brokerParams(SCA_POLICIES_CONFIG, {
      limit: 10,
      level: "4",           // belongs to /rules
      "os.platform": "ubuntu", // belongs to /agents
    });
    expect(result.unsupportedParams).toContain("level");
    expect(result.unsupportedParams).toContain("os.platform");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// /sca/{agent_id}/checks/{policy_id} endpoint config
// ═══════════════════════════════════════════════════════════════════════════════

describe("/sca/{agent_id}/checks/{policy_id} config", () => {
  it("accepts all spec-defined check parameters", () => {
    const fullInput = {
      limit: 100,
      offset: 0,
      sort: "+title",
      search: "password",
      q: "result=failed",
      title: "Ensure password expiration",
      description: "password policy",
      rationale: "security best practice",
      remediation: "Set PASS_MAX_DAYS",
      command: "grep PASS_MAX_DAYS",
      reason: "not configured",
      file: "/etc/login.defs",
      process: "sshd",
      directory: "/etc/ssh",
      registry: "HKLM\\Software",
      references: "CIS 5.4.1.1",
      result: "failed",
      condition: "all",
    };
    const result = brokerParams(SCA_CHECKS_CONFIG, fullInput);
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.recognizedParams.length).toBe(Object.keys(fullInput).length);
  });

  it("maps full_path alias to file", () => {
    const result = brokerParams(SCA_CHECKS_CONFIG, { full_path: "/etc/passwd" });
    expect(result.forwardedQuery.file).toBe("/etc/passwd");
  });

  it("rejects parameters not in the /sca checks spec", () => {
    const result = brokerParams(SCA_CHECKS_CONFIG, {
      limit: 10,
      "os.platform": "ubuntu",  // belongs to /agents
      pci_dss: "10.6.1",        // belongs to /rules
    });
    expect(result.unsupportedParams).toContain("os.platform");
    expect(result.unsupportedParams).toContain("pci_dss");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Cross-endpoint isolation — params from one endpoint must not leak to another
// ═══════════════════════════════════════════════════════════════════════════════

describe("cross-endpoint isolation", () => {
  const crossTestCases = [
    { name: "/agents", config: AGENTS_CONFIG, foreign: { level: "4", filename: "rules.xml", hash: "md5" } },
    { name: "/rules", config: RULES_CONFIG, foreign: { "os.platform": "ubuntu", registerIP: "1.2.3.4", hash: "md5" } },
    { name: "/groups", config: GROUPS_CONFIG, foreign: { level: "4", "os.platform": "ubuntu", result: "failed" } },
    { name: "/cluster/nodes", config: CLUSTER_NODES_CONFIG, foreign: { status: "active", level: "4", result: "failed" } },
    { name: "/sca policies", config: SCA_POLICIES_CONFIG, foreign: { level: "4", "os.platform": "ubuntu", filename: "rules.xml" } },
    { name: "/sca checks", config: SCA_CHECKS_CONFIG, foreign: { "os.platform": "ubuntu", level: "4", hash: "md5" } },
  ];

  for (const tc of crossTestCases) {
    it(`${tc.name} rejects foreign params: ${Object.keys(tc.foreign).join(", ")}`, () => {
      const result = brokerParams(tc.config, tc.foreign);
      for (const key of Object.keys(tc.foreign)) {
        expect(result.unsupportedParams).toContain(key);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// Universal params are present in all endpoint configs
// ═══════════════════════════════════════════════════════════════════════════════

describe("universal params present in all configs", () => {
  const configs = [
    { name: "/agents", config: AGENTS_CONFIG },
    { name: "/rules", config: RULES_CONFIG },
    { name: "/groups", config: GROUPS_CONFIG },
    { name: "/cluster/nodes", config: CLUSTER_NODES_CONFIG },
    { name: "/sca policies", config: SCA_POLICIES_CONFIG },
    { name: "/sca checks", config: SCA_CHECKS_CONFIG },
  ];

  const universalKeys = Object.keys(UNIVERSAL_PARAMS);

  for (const { name, config } of configs) {
    for (const key of universalKeys) {
      it(`${name} includes universal param "${key}"`, () => {
        expect(config.params).toHaveProperty(key);
        expect(config.params[key].wazuhName).toBe(UNIVERSAL_PARAMS[key as keyof typeof UNIVERSAL_PARAMS].wazuhName);
      });
    }
  }
});


// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — /rules compliance filter family
// ═══════════════════════════════════════════════════════════════════════════════

describe("/rules compliance filter family", () => {
  const complianceFilters = [
    { key: "pci_dss", value: "10.6.1", wazuhName: "pci_dss" },
    { key: "gdpr", value: "IV_35.7.d", wazuhName: "gdpr" },
    { key: "hipaa", value: "164.312.b", wazuhName: "hipaa" },
    { key: "nist-800-53", value: "AU.6", wazuhName: "nist-800-53" },
    { key: "tsc", value: "CC7.2", wazuhName: "tsc" },
    { key: "gpg13", value: "7.1", wazuhName: "gpg13" },
    { key: "mitre", value: "T1059", wazuhName: "mitre" },
  ];

  for (const { key, value, wazuhName } of complianceFilters) {
    it(`forwards ${key} as ${wazuhName}`, () => {
      const result = brokerParams(RULES_CONFIG, { [key]: value });
      expect(result.forwardedQuery[wazuhName]).toBe(value);
      expect(result.recognizedParams).toContain(key);
      expect(result.unsupportedParams).toHaveLength(0);
    });
  }

  it("forwards nist_800_53 alias to nist-800-53", () => {
    const result = brokerParams(RULES_CONFIG, { nist_800_53: "AU.6" });
    expect(result.forwardedQuery["nist-800-53"]).toBe("AU.6");
    expect(result.recognizedParams).toContain("nist_800_53");
  });

  it("forwards all 7 compliance filters simultaneously", () => {
    const input: Record<string, string> = {};
    for (const { key, value } of complianceFilters) {
      input[key] = value;
    }
    const result = brokerParams(RULES_CONFIG, input);
    expect(result.recognizedParams.length).toBe(complianceFilters.length);
    expect(result.unsupportedParams).toHaveLength(0);
    for (const { wazuhName, value } of complianceFilters) {
      expect(result.forwardedQuery[wazuhName]).toBe(value);
    }
  });

  it("compliance filters do NOT leak to /agents", () => {
    for (const { key, value } of complianceFilters) {
      const result = brokerParams(AGENTS_CONFIG, { [key]: value });
      expect(result.unsupportedParams).toContain(key);
    }
  });

  it("compliance filters do NOT leak to /groups", () => {
    for (const { key, value } of complianceFilters) {
      const result = brokerParams(GROUPS_CONFIG, { [key]: value });
      expect(result.unsupportedParams).toContain(key);
    }
  });

  it("compliance filters do NOT leak to /cluster/nodes", () => {
    for (const { key, value } of complianceFilters) {
      const result = brokerParams(CLUSTER_NODES_CONFIG, { [key]: value });
      expect(result.unsupportedParams).toContain(key);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — /rules severity/group/classification filters
// ═══════════════════════════════════════════════════════════════════════════════

describe("/rules severity/group/classification filters", () => {
  it("forwards level as string", () => {
    const result = brokerParams(RULES_CONFIG, { level: "4-8" });
    expect(result.forwardedQuery.level).toBe("4-8");
    expect(result.recognizedParams).toContain("level");
  });

  it("forwards group filter", () => {
    const result = brokerParams(RULES_CONFIG, { group: "syslog" });
    expect(result.forwardedQuery.group).toBe("syslog");
  });

  it("forwards filename filter", () => {
    const result = brokerParams(RULES_CONFIG, { filename: "0010-rules_config.xml" });
    expect(result.forwardedQuery.filename).toBe("0010-rules_config.xml");
  });

  it("forwards relative_dirname filter", () => {
    const result = brokerParams(RULES_CONFIG, { relative_dirname: "ruleset/rules" });
    expect(result.forwardedQuery.relative_dirname).toBe("ruleset/rules");
  });

  it("maps relativeDirname alias to relative_dirname", () => {
    const result = brokerParams(RULES_CONFIG, { relativeDirname: "ruleset/rules" });
    expect(result.forwardedQuery.relative_dirname).toBe("ruleset/rules");
  });

  it("forwards status filter (enabled/disabled/all)", () => {
    const result = brokerParams(RULES_CONFIG, { status: "enabled" });
    expect(result.forwardedQuery.status).toBe("enabled");
  });

  it("level does NOT leak to /agents", () => {
    const result = brokerParams(AGENTS_CONFIG, { level: "4" });
    expect(result.unsupportedParams).toContain("level");
  });

  it("filename does NOT leak to /agents", () => {
    const result = brokerParams(AGENTS_CONFIG, { filename: "rules.xml" });
    expect(result.unsupportedParams).toContain("filename");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — /manager/configuration precision params
// ═══════════════════════════════════════════════════════════════════════════════

describe("/manager/configuration precision params", () => {
  it("forwards section param", () => {
    const result = brokerParams(MANAGER_CONFIG, { section: "global" });
    expect(result.forwardedQuery.section).toBe("global");
    expect(result.recognizedParams).toContain("section");
    expect(result.unsupportedParams).toHaveLength(0);
  });

  it("forwards field param", () => {
    const result = brokerParams(MANAGER_CONFIG, { field: "jsonout_output" });
    expect(result.forwardedQuery.field).toBe("jsonout_output");
    expect(result.recognizedParams).toContain("field");
  });

  it("forwards raw as boolean", () => {
    const result = brokerParams(MANAGER_CONFIG, { raw: true });
    expect(result.forwardedQuery.raw).toBe("true");
    expect(result.recognizedParams).toContain("raw");
  });

  it("forwards distinct param", () => {
    const result = brokerParams(MANAGER_CONFIG, { distinct: true });
    expect(result.forwardedQuery.distinct).toBe("true");
    expect(result.recognizedParams).toContain("distinct");
  });

  it("forwards section + field together for precise fetch", () => {
    const result = brokerParams(MANAGER_CONFIG, {
      section: "ruleset",
      field: "decoder_dir",
    });
    expect(result.forwardedQuery.section).toBe("ruleset");
    expect(result.forwardedQuery.field).toBe("decoder_dir");
    expect(result.recognizedParams).toContain("section");
    expect(result.recognizedParams).toContain("field");
    expect(result.unsupportedParams).toHaveLength(0);
  });

  it("forwards section + field but omits raw=false (flag semantics)", () => {
    const result = brokerParams(MANAGER_CONFIG, {
      section: "alerts",
      field: "log_alert_level",
      raw: false,
    });
    expect(result.forwardedQuery.section).toBe("alerts");
    expect(result.forwardedQuery.field).toBe("log_alert_level");
    // raw: false should be omitted per flag semantics
    expect(result.forwardedQuery).not.toHaveProperty("raw");
    // All three are recognized even though raw is omitted
    expect(result.recognizedParams.length).toBe(3);
  });

  it("rejects universal query params NOT in the spec for this endpoint", () => {
    const result = brokerParams(MANAGER_CONFIG, {
      offset: 0,
      limit: 10,
      sort: "+name",
      search: "global",
      select: "section",
      q: "section=global",
    });
    expect(result.unsupportedParams).toContain("offset");
    expect(result.unsupportedParams).toContain("limit");
    expect(result.unsupportedParams).toContain("sort");
    expect(result.unsupportedParams).toContain("search");
    expect(result.unsupportedParams).toContain("select");
    expect(result.unsupportedParams).toContain("q");
    expect(Object.keys(result.forwardedQuery)).toHaveLength(0);
  });

  it("rejects agent-specific params", () => {
    const result = brokerParams(MANAGER_CONFIG, {
      "os.platform": "ubuntu",
      status: "active",
      ip: "192.168.1.1",
    });
    expect(result.unsupportedParams).toContain("os.platform");
    expect(result.unsupportedParams).toContain("status");
    expect(result.unsupportedParams).toContain("ip");
  });

  it("rejects rules-specific params", () => {
    const result = brokerParams(MANAGER_CONFIG, {
      level: "4",
      pci_dss: "10.6.1",
      mitre: "T1059",
    });
    expect(result.unsupportedParams).toContain("level");
    expect(result.unsupportedParams).toContain("pci_dss");
    expect(result.unsupportedParams).toContain("mitre");
  });

  it("returns empty forwarded query for empty input", () => {
    const result = brokerParams(MANAGER_CONFIG, {});
    expect(result.forwardedQuery).toEqual({});
    expect(result.recognizedParams).toHaveLength(0);
    expect(result.unsupportedParams).toHaveLength(0);
  });

  it("accepts all valid section enum values", () => {
    const validSections = [
      "active-response", "agentless", "alerts", "auth", "client", "client_buffer",
      "cluster", "command", "database_output", "email_alerts", "global", "integration",
      "labels", "localfile", "logging", "remote", "reports", "rootcheck", "ruleset",
      "sca", "socket", "syscheck", "syslog_output", "vulnerability-detection", "indexer",
      "aws-s3", "azure-logs", "cis-cat", "docker-listener", "open-scap", "osquery", "syscollector",
    ];
    for (const section of validSections) {
      const result = brokerParams(MANAGER_CONFIG, { section });
      expect(result.forwardedQuery.section).toBe(section);
      expect(result.recognizedParams).toContain("section");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — SCA expanded filter verification
// ═══════════════════════════════════════════════════════════════════════════════

describe("/sca/{agent_id} expanded filters", () => {
  it("forwards name filter", () => {
    const result = brokerParams(SCA_POLICIES_CONFIG, { name: "CIS Benchmark for Debian 10" });
    expect(result.forwardedQuery.name).toBe("CIS Benchmark for Debian 10");
  });

  it("forwards description filter", () => {
    const result = brokerParams(SCA_POLICIES_CONFIG, { description: "security hardening" });
    expect(result.forwardedQuery.description).toBe("security hardening");
  });

  it("forwards references filter", () => {
    const result = brokerParams(SCA_POLICIES_CONFIG, { references: "https://www.cisecurity.org" });
    expect(result.forwardedQuery.references).toBe("https://www.cisecurity.org");
  });

  it("maps policyName alias to name", () => {
    const result = brokerParams(SCA_POLICIES_CONFIG, { policyName: "CIS Ubuntu" });
    expect(result.forwardedQuery.name).toBe("CIS Ubuntu");
    expect(result.recognizedParams).toContain("policyName");
  });

  it("supports all universal params", () => {
    const result = brokerParams(SCA_POLICIES_CONFIG, {
      offset: 0,
      limit: 50,
      sort: "+name",
      search: "cis",
      q: "name~CIS",
      select: ["name", "description"],
      distinct: true,
    });
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.forwardedQuery.offset).toBe("0");
    expect(result.forwardedQuery.limit).toBe("50");
    expect(result.forwardedQuery.sort).toBe("+name");
    expect(result.forwardedQuery.search).toBe("cis");
    expect(result.forwardedQuery.q).toBe("name~CIS");
    expect(result.forwardedQuery.select).toBe("name,description");
    expect(result.forwardedQuery.distinct).toBe("true");
  });
});

describe("/sca/{agent_id}/checks/{policy_id} expanded filters", () => {
  const checkFilters = [
    { key: "title", value: "Ensure password expiration" },
    { key: "description", value: "password policy" },
    { key: "rationale", value: "security best practice" },
    { key: "remediation", value: "Set PASS_MAX_DAYS" },
    { key: "command", value: "grep PASS_MAX_DAYS" },
    { key: "reason", value: "not configured" },
    { key: "file", value: "/etc/login.defs" },
    { key: "process", value: "sshd" },
    { key: "directory", value: "/etc/ssh" },
    { key: "registry", value: "HKLM\\Software" },
    { key: "references", value: "CIS 5.4.1.1" },
    { key: "result", value: "failed" },
    { key: "condition", value: "all" },
  ];

  for (const { key, value } of checkFilters) {
    it(`forwards ${key} filter`, () => {
      const result = brokerParams(SCA_CHECKS_CONFIG, { [key]: value });
      expect(result.forwardedQuery[key]).toBe(value);
      expect(result.recognizedParams).toContain(key);
      expect(result.unsupportedParams).toHaveLength(0);
    });
  }

  it("maps full_path alias to file", () => {
    const result = brokerParams(SCA_CHECKS_CONFIG, { full_path: "/etc/passwd" });
    expect(result.forwardedQuery.file).toBe("/etc/passwd");
    expect(result.recognizedParams).toContain("full_path");
  });

  it("forwards all check filters simultaneously", () => {
    const input: Record<string, string> = {};
    for (const { key, value } of checkFilters) {
      input[key] = value;
    }
    const result = brokerParams(SCA_CHECKS_CONFIG, input);
    expect(result.recognizedParams.length).toBe(checkFilters.length);
    expect(result.unsupportedParams).toHaveLength(0);
  });

  it("search and q remain distinct in SCA checks", () => {
    const result = brokerParams(SCA_CHECKS_CONFIG, {
      search: "password",
      q: "result=failed",
    });
    expect(result.forwardedQuery.search).toBe("password");
    expect(result.forwardedQuery.q).toBe("result=failed");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — /manager/configuration does NOT have universal query family
// (This is a spec-truth test: the endpoint only supports distinct, not the full set)
// ═══════════════════════════════════════════════════════════════════════════════

describe("/manager/configuration universal param scoping", () => {
  it("has distinct but NOT offset/limit/sort/search/select/q", () => {
    expect(MANAGER_CONFIG.params).toHaveProperty("distinct");
    expect(MANAGER_CONFIG.params).not.toHaveProperty("offset");
    expect(MANAGER_CONFIG.params).not.toHaveProperty("limit");
    expect(MANAGER_CONFIG.params).not.toHaveProperty("sort");
    expect(MANAGER_CONFIG.params).not.toHaveProperty("search");
    expect(MANAGER_CONFIG.params).not.toHaveProperty("select");
    expect(MANAGER_CONFIG.params).not.toHaveProperty("q");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — Cross-endpoint isolation updated with MANAGER_CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

describe("Phase 2 cross-endpoint isolation", () => {
  it("/manager/configuration rejects all /agents params", () => {
    const agentParams = { "os.platform": "ubuntu", status: "active", ip: "1.2.3.4", registerIP: "1.2.3.4", group_config_status: "synced" };
    const result = brokerParams(MANAGER_CONFIG, agentParams);
    for (const key of Object.keys(agentParams)) {
      expect(result.unsupportedParams).toContain(key);
    }
  });

  it("/manager/configuration rejects all /rules params", () => {
    const rulesParams = { level: "4", filename: "rules.xml", pci_dss: "10.6.1", gdpr: "IV_35.7.d", mitre: "T1059" };
    const result = brokerParams(MANAGER_CONFIG, rulesParams);
    for (const key of Object.keys(rulesParams)) {
      expect(result.unsupportedParams).toContain(key);
    }
  });

  it("/manager/configuration rejects all /sca params", () => {
    const scaParams = { title: "test", rationale: "reason", remediation: "fix", command: "cmd" };
    const result = brokerParams(MANAGER_CONFIG, scaParams);
    for (const key of Object.keys(scaParams)) {
      expect(result.unsupportedParams).toContain(key);
    }
  });

  it("/agents rejects /manager/configuration precision params", () => {
    const result = brokerParams(AGENTS_CONFIG, { section: "global", field: "jsonout_output", raw: true });
    expect(result.unsupportedParams).toContain("section");
    expect(result.unsupportedParams).toContain("field");
    expect(result.unsupportedParams).toContain("raw");
  });

  it("/rules rejects /manager/configuration precision params", () => {
    const result = brokerParams(RULES_CONFIG, { section: "global", field: "jsonout_output", raw: true });
    expect(result.unsupportedParams).toContain("section");
    expect(result.unsupportedParams).toContain("field");
    expect(result.unsupportedParams).toContain("raw");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REVIEW FIX #5 — status CSV array capability
// ═══════════════════════════════════════════════════════════════════════════════

describe("Fix #5: status CSV array capability", () => {
  it("coerces status array to csv for multi-status filter", () => {
    const result = brokerParams(AGENTS_CONFIG, { status: ["active", "disconnected"] });
    expect(result.forwardedQuery.status).toBe("active,disconnected");
    expect(result.recognizedParams).toContain("status");
    expect(result.errors).toHaveLength(0);
  });

  it("coerces status single string pass-through", () => {
    const result = brokerParams(AGENTS_CONFIG, { status: "active" });
    expect(result.forwardedQuery.status).toBe("active");
  });

  it("coerces status three-value array", () => {
    const result = brokerParams(AGENTS_CONFIG, { status: ["active", "disconnected", "pending"] });
    expect(result.forwardedQuery.status).toBe("active,disconnected,pending");
  });

  it("omits status when empty array is provided", () => {
    const result = brokerParams(AGENTS_CONFIG, { status: [] });
    expect(result.forwardedQuery).not.toHaveProperty("status");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REVIEW FIX #6 — level custom serializer handles both number and string
// ═══════════════════════════════════════════════════════════════════════════════

describe("Fix #6: level custom serializer", () => {
  it("serializes numeric level to string", () => {
    const result = brokerParams(RULES_CONFIG, { level: 4 as any });
    expect(result.forwardedQuery.level).toBe("4");
    expect(result.errors).toHaveLength(0);
  });

  it("serializes string level range pass-through", () => {
    const result = brokerParams(RULES_CONFIG, { level: "2-4" });
    expect(result.forwardedQuery.level).toBe("2-4");
    expect(result.errors).toHaveLength(0);
  });

  it("serializes single string level pass-through", () => {
    const result = brokerParams(RULES_CONFIG, { level: "8" });
    expect(result.forwardedQuery.level).toBe("8");
  });

  it("handles NaN level with error", () => {
    const result = brokerParams(RULES_CONFIG, { level: NaN as any });
    expect(result.forwardedQuery).not.toHaveProperty("level");
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REVIEW — errors[] contract is alive and populated
// ═══════════════════════════════════════════════════════════════════════════════

describe("errors[] contract verification", () => {
  it("errors[] is always an array (never undefined)", () => {
    const result = brokerParams(AGENTS_CONFIG, {});
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it("errors[] contains descriptive messages for coercion failures", () => {
    const result = brokerParams(AGENTS_CONFIG, { limit: "abc" });
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toBe('limit: could not coerce "abc" to number');
  });

  it("errors[] is separate from unsupportedParams", () => {
    const result = brokerParams(AGENTS_CONFIG, { limit: "bad", bogus: "param" });
    // limit is recognized but fails coercion → errors
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("limit");
    // bogus is unrecognized → unsupportedParams
    expect(result.unsupportedParams).toContain("bogus");
    // They don't overlap
    expect(result.unsupportedParams).not.toContain("limit");
  });

  it("boolean coercion errors are recorded for ambiguous string values", () => {
    const result = brokerParams(MANAGER_CONFIG, { raw: "yes" as any });
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("raw");
    expect(result.forwardedQuery).not.toHaveProperty("raw");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — SYSCOLLECTOR ENDPOINT CONFIGS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Phase 3: /syscollector/{agent_id}/packages", () => {
  it("forwards all field-specific params with correct outbound names", () => {
    const result = brokerParams(SYSCOLLECTOR_PACKAGES_CONFIG, {
      vendor: "Canonical",
      name: "openssl",
      architecture: "amd64",
      format: "deb",
      version: "1.1.1",
    });
    expect(result.forwardedQuery).toEqual({
      vendor: "Canonical",
      name: "openssl",
      architecture: "amd64",
      format: "deb",
      version: "1.1.1",
    });
    expect(result.unsupportedParams).toEqual([]);
  });

  it("resolves package_name alias to name", () => {
    const result = brokerParams(SYSCOLLECTOR_PACKAGES_CONFIG, {
      package_name: "nginx",
    });
    expect(result.forwardedQuery).toEqual({ name: "nginx" });
    expect(result.unsupportedParams).toEqual([]);
  });

  it("resolves file_format alias to format", () => {
    const result = brokerParams(SYSCOLLECTOR_PACKAGES_CONFIG, {
      file_format: "rpm",
    });
    expect(result.forwardedQuery).toEqual({ format: "rpm" });
    expect(result.unsupportedParams).toEqual([]);
  });

  it("resolves package_version alias to version", () => {
    const result = brokerParams(SYSCOLLECTOR_PACKAGES_CONFIG, {
      package_version: "2.0.0",
    });
    expect(result.forwardedQuery).toEqual({ version: "2.0.0" });
    expect(result.unsupportedParams).toEqual([]);
  });

  it("resolves arch alias to architecture", () => {
    const result = brokerParams(SYSCOLLECTOR_PACKAGES_CONFIG, {
      arch: "x86_64",
    });
    expect(result.forwardedQuery).toEqual({ architecture: "x86_64" });
    expect(result.unsupportedParams).toEqual([]);
  });

  it("includes universal params", () => {
    const result = brokerParams(SYSCOLLECTOR_PACKAGES_CONFIG, {
      offset: 10,
      limit: 50,
      sort: "+name",
      search: "ssl",
      q: "vendor=Canonical",
    });
    expect(result.forwardedQuery).toEqual({
      offset: "10",
      limit: "50",
      sort: "+name",
      search: "ssl",
      q: "vendor=Canonical",
    });
  });

  it("rejects unsupported params", () => {
    const result = brokerParams(SYSCOLLECTOR_PACKAGES_CONFIG, {
      vendor: "Canonical",
      bogus_field: "nope",
    });
    expect(result.unsupportedParams).toEqual(["bogus_field"]);
    expect(result.forwardedQuery).toEqual({ vendor: "Canonical" });
  });
});

describe("Phase 3: /syscollector/{agent_id}/ports", () => {
  it("forwards all field-specific params", () => {
    const result = brokerParams(SYSCOLLECTOR_PORTS_CONFIG, {
      pid: "1234",
      protocol: "tcp",
      "local.ip": "127.0.0.1",
      "local.port": "8080",
      "remote.ip": "10.0.0.1",
      tx_queue: "0",
      state: "listening",
      process: "nginx",
    });
    expect(result.forwardedQuery).toEqual({
      pid: "1234",
      protocol: "tcp",
      "local.ip": "127.0.0.1",
      "local.port": "8080",
      "remote.ip": "10.0.0.1",
      tx_queue: "0",
      state: "listening",
      process: "nginx",
    });
    expect(result.unsupportedParams).toEqual([]);
  });

  it("resolves local_ip alias to local.ip", () => {
    const result = brokerParams(SYSCOLLECTOR_PORTS_CONFIG, {
      local_ip: "192.168.1.1",
    });
    expect(result.forwardedQuery).toEqual({ "local.ip": "192.168.1.1" });
    expect(result.unsupportedParams).toEqual([]);
  });

  it("resolves local_port alias to local.port", () => {
    const result = brokerParams(SYSCOLLECTOR_PORTS_CONFIG, {
      local_port: "443",
    });
    expect(result.forwardedQuery).toEqual({ "local.port": "443" });
    expect(result.unsupportedParams).toEqual([]);
  });

  it("resolves remote_ip alias to remote.ip", () => {
    const result = brokerParams(SYSCOLLECTOR_PORTS_CONFIG, {
      remote_ip: "10.0.0.5",
    });
    expect(result.forwardedQuery).toEqual({ "remote.ip": "10.0.0.5" });
    expect(result.unsupportedParams).toEqual([]);
  });

  it("rejects unsupported params", () => {
    const result = brokerParams(SYSCOLLECTOR_PORTS_CONFIG, {
      protocol: "tcp",
      rx_queue: "not_in_spec",
    });
    expect(result.unsupportedParams).toEqual(["rx_queue"]);
    expect(result.forwardedQuery).toEqual({ protocol: "tcp" });
  });
});

describe("Phase 3: /syscollector/{agent_id}/processes", () => {
  it("forwards all field-specific params", () => {
    const result = brokerParams(SYSCOLLECTOR_PROCESSES_CONFIG, {
      pid: "42",
      state: "S",
      ppid: "1",
      egroup: "root",
      euser: "root",
      fgroup: "root",
      name: "sshd",
      nlwp: "1",
      pgrp: "42",
      priority: "20",
      rgroup: "root",
      ruser: "root",
      sgroup: "root",
      suser: "root",
    });
    expect(result.forwardedQuery).toEqual({
      pid: "42",
      state: "S",
      ppid: "1",
      egroup: "root",
      euser: "root",
      fgroup: "root",
      name: "sshd",
      nlwp: "1",
      pgrp: "42",
      priority: "20",
      rgroup: "root",
      ruser: "root",
      sgroup: "root",
      suser: "root",
    });
    expect(result.unsupportedParams).toEqual([]);
  });

  it("resolves process_pid alias to pid", () => {
    const result = brokerParams(SYSCOLLECTOR_PROCESSES_CONFIG, {
      process_pid: "99",
    });
    expect(result.forwardedQuery).toEqual({ pid: "99" });
    expect(result.unsupportedParams).toEqual([]);
  });

  it("resolves process_state alias to state", () => {
    const result = brokerParams(SYSCOLLECTOR_PROCESSES_CONFIG, {
      process_state: "R",
    });
    expect(result.forwardedQuery).toEqual({ state: "R" });
    expect(result.unsupportedParams).toEqual([]);
  });

  it("resolves process_name alias to name", () => {
    const result = brokerParams(SYSCOLLECTOR_PROCESSES_CONFIG, {
      process_name: "nginx",
    });
    expect(result.forwardedQuery).toEqual({ name: "nginx" });
    expect(result.unsupportedParams).toEqual([]);
  });

  it("rejects unsupported params", () => {
    const result = brokerParams(SYSCOLLECTOR_PROCESSES_CONFIG, {
      name: "sshd",
      cpu_percent: "50",
      memory_rss: "1024",
    });
    expect(result.unsupportedParams).toEqual(["cpu_percent", "memory_rss"]);
    expect(result.forwardedQuery).toEqual({ name: "sshd" });
  });
});

describe("Phase 3: /syscollector/{agent_id}/services", () => {
  it("forwards universal params only (no field-specific filters in spec)", () => {
    const result = brokerParams(SYSCOLLECTOR_SERVICES_CONFIG, {
      offset: 0,
      limit: 100,
      sort: "+name",
      search: "ssh",
      q: "state=running",
    });
    expect(result.forwardedQuery).toEqual({
      offset: "0",
      limit: "100",
      sort: "+name",
      search: "ssh",
      q: "state=running",
    });
    expect(result.unsupportedParams).toEqual([]);
  });

  it("rejects any field-specific param since spec defines none", () => {
    const result = brokerParams(SYSCOLLECTOR_SERVICES_CONFIG, {
      limit: 50,
      name: "sshd",
      state: "running",
    });
    expect(result.unsupportedParams).toEqual(["name", "state"]);
    expect(result.forwardedQuery).toEqual({ limit: "50" });
  });
});

describe("Phase 3: Cross-endpoint isolation — syscollector", () => {
  it("packages rejects ports-specific params", () => {
    const result = brokerParams(SYSCOLLECTOR_PACKAGES_CONFIG, {
      protocol: "tcp",
      "local.port": "8080",
    });
    expect(result.unsupportedParams).toContain("protocol");
    expect(result.unsupportedParams).toContain("local.port");
  });

  it("ports rejects packages-specific params", () => {
    const result = brokerParams(SYSCOLLECTOR_PORTS_CONFIG, {
      vendor: "Canonical",
      architecture: "amd64",
    });
    expect(result.unsupportedParams).toContain("vendor");
    expect(result.unsupportedParams).toContain("architecture");
  });

  it("processes rejects ports-specific params", () => {
    const result = brokerParams(SYSCOLLECTOR_PROCESSES_CONFIG, {
      protocol: "tcp",
      "local.ip": "127.0.0.1",
    });
    expect(result.unsupportedParams).toContain("protocol");
    expect(result.unsupportedParams).toContain("local.ip");
  });

  it("services rejects all field-specific params from other endpoints", () => {
    const result = brokerParams(SYSCOLLECTOR_SERVICES_CONFIG, {
      vendor: "Canonical",
      pid: "42",
      euser: "root",
    });
    expect(result.unsupportedParams).toContain("vendor");
    expect(result.unsupportedParams).toContain("pid");
    expect(result.unsupportedParams).toContain("euser");
  });
});

describe("Phase 3: Universal params present in all syscollector configs", () => {
  const configs = [
    { name: "packages", config: SYSCOLLECTOR_PACKAGES_CONFIG },
    { name: "ports", config: SYSCOLLECTOR_PORTS_CONFIG },
    { name: "processes", config: SYSCOLLECTOR_PROCESSES_CONFIG },
    { name: "services", config: SYSCOLLECTOR_SERVICES_CONFIG },
  ];
  const universalKeys = Object.keys(UNIVERSAL_PARAMS);

  for (const { name, config } of configs) {
    it(`${name} config includes all ${universalKeys.length} universal params`, () => {
      for (const key of universalKeys) {
        expect(config.params).toHaveProperty(key);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// KG-ONLY PARAM WIRING — Batch 1: New params in existing configs
// ═══════════════════════════════════════════════════════════════════════════════

import {
  MANAGER_LOGS_CONFIG,
  GROUP_AGENTS_CONFIG,
  SYSCHECK_CONFIG,
  MITRE_TECHNIQUES_CONFIG,
  DECODERS_CONFIG,
  ROOTCHECK_CONFIG,
  CISCAT_CONFIG,
} from "./paramBroker";

describe("KG wiring: agents — manager param", () => {
  it("forwards manager hostname filter", () => {
    const result = brokerParams(AGENTS_CONFIG, { manager: "wazuh-manager-01" });
    expect(result.forwardedQuery.manager).toBe("wazuh-manager-01");
    expect(result.recognizedParams).toContain("manager");
    expect(result.unsupportedParams).toHaveLength(0);
  });
});

describe("KG wiring: rules — rule_ids param", () => {
  it("forwards rule_ids as csv string", () => {
    const result = brokerParams(RULES_CONFIG, { rule_ids: "100,200,300" });
    expect(result.forwardedQuery.rule_ids).toBe("100,200,300");
    expect(result.recognizedParams).toContain("rule_ids");
  });

  it("forwards rule_ids array as csv", () => {
    const result = brokerParams(RULES_CONFIG, { rule_ids: ["100", "200"] });
    expect(result.forwardedQuery.rule_ids).toBe("100,200");
  });

  it("maps ruleIds alias to rule_ids", () => {
    const result = brokerParams(RULES_CONFIG, { ruleIds: "500" });
    expect(result.forwardedQuery.rule_ids).toBe("500");
    expect(result.recognizedParams).toContain("ruleIds");
  });
});

describe("KG wiring: groups — groups_list param", () => {
  it("forwards groups_list as csv string", () => {
    const result = brokerParams(GROUPS_CONFIG, { groups_list: "default,webservers" });
    expect(result.forwardedQuery.groups_list).toBe("default,webservers");
    expect(result.recognizedParams).toContain("groups_list");
  });

  it("forwards groups_list array as csv", () => {
    const result = brokerParams(GROUPS_CONFIG, { groups_list: ["default", "dmz"] });
    expect(result.forwardedQuery.groups_list).toBe("default,dmz");
  });

  it("maps groupsList alias to groups_list", () => {
    const result = brokerParams(GROUPS_CONFIG, { groupsList: "default" });
    expect(result.forwardedQuery.groups_list).toBe("default");
  });
});

describe("KG wiring: clusterNodes — nodes_list param", () => {
  it("forwards nodes_list as csv string", () => {
    const result = brokerParams(CLUSTER_NODES_CONFIG, { nodes_list: "node01,node02" });
    expect(result.forwardedQuery.nodes_list).toBe("node01,node02");
    expect(result.recognizedParams).toContain("nodes_list");
  });

  it("forwards nodes_list array as csv", () => {
    const result = brokerParams(CLUSTER_NODES_CONFIG, { nodes_list: ["master", "worker01"] });
    expect(result.forwardedQuery.nodes_list).toBe("master,worker01");
  });

  it("maps nodesList alias to nodes_list", () => {
    const result = brokerParams(CLUSTER_NODES_CONFIG, { nodesList: "master" });
    expect(result.forwardedQuery.nodes_list).toBe("master");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// KG-ONLY PARAM WIRING — Batch 2: New broker configs
// ═══════════════════════════════════════════════════════════════════════════════

describe("KG wiring: MANAGER_LOGS_CONFIG", () => {
  it("forwards level and tag filters", () => {
    const result = brokerParams(MANAGER_LOGS_CONFIG, {
      level: "error",
      tag: "wazuh-modulesd:syscollector",
    });
    expect(result.forwardedQuery.level).toBe("error");
    expect(result.forwardedQuery.tag).toBe("wazuh-modulesd:syscollector");
    expect(result.unsupportedParams).toHaveLength(0);
  });

  it("includes all universal params", () => {
    const universalKeys = Object.keys(UNIVERSAL_PARAMS);
    for (const key of universalKeys) {
      expect(MANAGER_LOGS_CONFIG.params).toHaveProperty(key);
    }
  });

  it("rejects foreign params", () => {
    const result = brokerParams(MANAGER_LOGS_CONFIG, {
      "os.platform": "ubuntu",
      benchmark: "CIS",
    });
    expect(result.unsupportedParams).toContain("os.platform");
    expect(result.unsupportedParams).toContain("benchmark");
  });
});

describe("KG wiring: GROUP_AGENTS_CONFIG", () => {
  it("forwards status filter as csv", () => {
    const result = brokerParams(GROUP_AGENTS_CONFIG, {
      status: "active,disconnected",
    });
    expect(result.forwardedQuery.status).toBe("active,disconnected");
    expect(result.recognizedParams).toContain("status");
  });

  it("forwards status array as csv", () => {
    const result = brokerParams(GROUP_AGENTS_CONFIG, {
      status: ["active", "pending"],
    });
    expect(result.forwardedQuery.status).toBe("active,pending");
  });

  it("includes all universal params", () => {
    const universalKeys = Object.keys(UNIVERSAL_PARAMS);
    for (const key of universalKeys) {
      expect(GROUP_AGENTS_CONFIG.params).toHaveProperty(key);
    }
  });

  it("rejects foreign params", () => {
    const result = brokerParams(GROUP_AGENTS_CONFIG, {
      level: "4",
      benchmark: "CIS",
    });
    expect(result.unsupportedParams).toContain("level");
    expect(result.unsupportedParams).toContain("benchmark");
  });
});

describe("KG wiring: SYSCHECK_CONFIG", () => {
  it("forwards all field-specific filters", () => {
    const result = brokerParams(SYSCHECK_CONFIG, {
      type: "file",
      hash: "abc123",
      file: "/etc/passwd",
      arch: "x64",
      "value.name": "Start",
      "value.type": "REG_DWORD",
      summary: true,
      md5: "d41d8cd98f00b204e9800998ecf8427e",
      sha1: "da39a3ee5e6b4b0d3255bfef95601890afd80709",
      sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    });
    expect(result.forwardedQuery.type).toBe("file");
    expect(result.forwardedQuery.hash).toBe("abc123");
    expect(result.forwardedQuery.file).toBe("/etc/passwd");
    expect(result.forwardedQuery.arch).toBe("x64");
    expect(result.forwardedQuery["value.name"]).toBe("Start");
    expect(result.forwardedQuery["value.type"]).toBe("REG_DWORD");
    expect(result.forwardedQuery.summary).toBe("true");
    expect(result.forwardedQuery.md5).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(result.forwardedQuery.sha1).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709");
    expect(result.forwardedQuery.sha256).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(result.unsupportedParams).toHaveLength(0);
  });

  it("maps full_path alias to file", () => {
    const result = brokerParams(SYSCHECK_CONFIG, { full_path: "/var/log/syslog" });
    expect(result.forwardedQuery.file).toBe("/var/log/syslog");
  });

  it("maps valueName alias to value.name", () => {
    const result = brokerParams(SYSCHECK_CONFIG, { valueName: "ImagePath" });
    expect(result.forwardedQuery["value.name"]).toBe("ImagePath");
  });

  it("maps valueType alias to value.type", () => {
    const result = brokerParams(SYSCHECK_CONFIG, { valueType: "REG_SZ" });
    expect(result.forwardedQuery["value.type"]).toBe("REG_SZ");
  });

  it("maps architecture alias to arch", () => {
    const result = brokerParams(SYSCHECK_CONFIG, { architecture: "x86" });
    expect(result.forwardedQuery.arch).toBe("x86");
  });

  it("includes all universal params", () => {
    const universalKeys = Object.keys(UNIVERSAL_PARAMS);
    for (const key of universalKeys) {
      expect(SYSCHECK_CONFIG.params).toHaveProperty(key);
    }
  });

  it("rejects foreign params", () => {
    const result = brokerParams(SYSCHECK_CONFIG, {
      "os.platform": "ubuntu",
      benchmark: "CIS",
      vendor: "Canonical",
    });
    expect(result.unsupportedParams).toContain("os.platform");
    expect(result.unsupportedParams).toContain("benchmark");
    expect(result.unsupportedParams).toContain("vendor");
  });
});

describe("KG wiring: MITRE_TECHNIQUES_CONFIG", () => {
  it("forwards technique_ids as csv string", () => {
    const result = brokerParams(MITRE_TECHNIQUES_CONFIG, {
      technique_ids: "T1059,T1078,T1548",
    });
    expect(result.forwardedQuery.technique_ids).toBe("T1059,T1078,T1548");
    expect(result.recognizedParams).toContain("technique_ids");
  });

  it("forwards technique_ids array as csv", () => {
    const result = brokerParams(MITRE_TECHNIQUES_CONFIG, {
      technique_ids: ["T1059", "T1078"],
    });
    expect(result.forwardedQuery.technique_ids).toBe("T1059,T1078");
  });

  it("maps techniqueIds alias to technique_ids", () => {
    const result = brokerParams(MITRE_TECHNIQUES_CONFIG, { techniqueIds: "T1059" });
    expect(result.forwardedQuery.technique_ids).toBe("T1059");
  });

  it("includes all universal params", () => {
    const universalKeys = Object.keys(UNIVERSAL_PARAMS);
    for (const key of universalKeys) {
      expect(MITRE_TECHNIQUES_CONFIG.params).toHaveProperty(key);
    }
  });

  it("rejects foreign params", () => {
    const result = brokerParams(MITRE_TECHNIQUES_CONFIG, {
      "os.platform": "ubuntu",
      level: "4",
    });
    expect(result.unsupportedParams).toContain("os.platform");
    expect(result.unsupportedParams).toContain("level");
  });
});

describe("KG wiring: DECODERS_CONFIG", () => {
  it("forwards all field-specific filters", () => {
    const result = brokerParams(DECODERS_CONFIG, {
      decoder_names: "syslog,json",
      filename: "0005-wazuh_decoders.xml",
      relative_dirname: "ruleset/decoders",
      status: "enabled",
    });
    expect(result.forwardedQuery.decoder_names).toBe("syslog,json");
    expect(result.forwardedQuery.filename).toBe("0005-wazuh_decoders.xml");
    expect(result.forwardedQuery.relative_dirname).toBe("ruleset/decoders");
    expect(result.forwardedQuery.status).toBe("enabled");
    expect(result.unsupportedParams).toHaveLength(0);
  });

  it("forwards decoder_names array as csv", () => {
    const result = brokerParams(DECODERS_CONFIG, {
      decoder_names: ["syslog", "json", "ossec"],
    });
    expect(result.forwardedQuery.decoder_names).toBe("syslog,json,ossec");
  });

  it("maps decoderNames alias to decoder_names", () => {
    const result = brokerParams(DECODERS_CONFIG, { decoderNames: "syslog" });
    expect(result.forwardedQuery.decoder_names).toBe("syslog");
  });

  it("maps relativeDirname alias to relative_dirname", () => {
    const result = brokerParams(DECODERS_CONFIG, { relativeDirname: "etc/decoders" });
    expect(result.forwardedQuery.relative_dirname).toBe("etc/decoders");
  });

  it("includes all universal params", () => {
    const universalKeys = Object.keys(UNIVERSAL_PARAMS);
    for (const key of universalKeys) {
      expect(DECODERS_CONFIG.params).toHaveProperty(key);
    }
  });

  it("rejects foreign params", () => {
    const result = brokerParams(DECODERS_CONFIG, {
      "os.platform": "ubuntu",
      benchmark: "CIS",
      level: "4",
    });
    expect(result.unsupportedParams).toContain("os.platform");
    expect(result.unsupportedParams).toContain("benchmark");
    expect(result.unsupportedParams).toContain("level");
  });
});

describe("KG wiring: ROOTCHECK_CONFIG", () => {
  it("forwards valid field-specific filters including pci_dss/cis (restored per spec v4.14.3)", () => {
    const result = brokerParams(ROOTCHECK_CONFIG, {
      status: "outstanding",
      pci_dss: "2.2",
      cis: "1.4",
    });
    expect(result.forwardedQuery.status).toBe("outstanding");
    // pci_dss and cis ARE in the Wazuh v4.14.3 spec for /rootcheck/{agent_id}
    expect(result.unsupportedParams).not.toContain("pci_dss");
    expect(result.unsupportedParams).not.toContain("cis");
    expect(result.forwardedQuery).toHaveProperty("pci_dss", "2.2");
    expect(result.forwardedQuery).toHaveProperty("cis", "1.4");
  });

  it("includes all universal params", () => {
    const universalKeys = Object.keys(UNIVERSAL_PARAMS);
    for (const key of universalKeys) {
      expect(ROOTCHECK_CONFIG.params).toHaveProperty(key);
    }
  });

  it("rejects foreign params", () => {
    const result = brokerParams(ROOTCHECK_CONFIG, {
      "os.platform": "ubuntu",
      benchmark: "CIS",
      vendor: "Canonical",
    });
    expect(result.unsupportedParams).toContain("os.platform");
    expect(result.unsupportedParams).toContain("benchmark");
    expect(result.unsupportedParams).toContain("vendor");
  });
});

describe("KG wiring: CISCAT_CONFIG", () => {
  it("forwards all field-specific filters", () => {
    const result = brokerParams(CISCAT_CONFIG, {
      benchmark: "CIS Ubuntu Linux 22.04 LTS Benchmark",
      profile: "xccdf_org.cisecurity.benchmarks_profile_Level_1",
      pass: 85,
      fail: 10,
      error: 2,
      notchecked: 3,
      unknown: 0,
      score: 85,
    });
    expect(result.forwardedQuery.benchmark).toBe("CIS Ubuntu Linux 22.04 LTS Benchmark");
    expect(result.forwardedQuery.profile).toBe("xccdf_org.cisecurity.benchmarks_profile_Level_1");
    expect(result.forwardedQuery.pass).toBe("85");
    expect(result.forwardedQuery.fail).toBe("10");
    expect(result.forwardedQuery.error).toBe("2");
    expect(result.forwardedQuery.notchecked).toBe("3");
    expect(result.forwardedQuery.unknown).toBe("0");
    expect(result.forwardedQuery.score).toBe("85");
    expect(result.unsupportedParams).toHaveLength(0);
  });

  it("includes all universal params", () => {
    const universalKeys = Object.keys(UNIVERSAL_PARAMS);
    for (const key of universalKeys) {
      expect(CISCAT_CONFIG.params).toHaveProperty(key);
    }
  });

  it("rejects foreign params", () => {
    const result = brokerParams(CISCAT_CONFIG, {
      "os.platform": "ubuntu",
      level: "4",
      vendor: "Canonical",
    });
    expect(result.unsupportedParams).toContain("os.platform");
    expect(result.unsupportedParams).toContain("level");
    expect(result.unsupportedParams).toContain("vendor");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// KG wiring: Universal params present in ALL new configs
// ═══════════════════════════════════════════════════════════════════════════════

describe("KG wiring: universal params in all new configs", () => {
  const newConfigs = [
    { name: "/manager/logs", config: MANAGER_LOGS_CONFIG },
    { name: "/groups/{group_id}/agents", config: GROUP_AGENTS_CONFIG },
    { name: "/syscheck/{agent_id}", config: SYSCHECK_CONFIG },
    { name: "/mitre/techniques", config: MITRE_TECHNIQUES_CONFIG },
    { name: "/decoders", config: DECODERS_CONFIG },
    { name: "/rootcheck/{agent_id}", config: ROOTCHECK_CONFIG },
    { name: "/ciscat/{agent_id}/results", config: CISCAT_CONFIG },
  ];

  const universalKeys = Object.keys(UNIVERSAL_PARAMS);

  for (const { name, config } of newConfigs) {
    for (const key of universalKeys) {
      it(`${name} includes universal param "${key}"`, () => {
        expect(config.params).toHaveProperty(key);
        expect(config.params[key].wazuhName).toBe(
          UNIVERSAL_PARAMS[key as keyof typeof UNIVERSAL_PARAMS].wazuhName
        );
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// KG wiring: Cross-endpoint isolation — new configs
// ═══════════════════════════════════════════════════════════════════════════════

describe("KG wiring: cross-endpoint isolation — new configs", () => {
  it("MANAGER_LOGS rejects agents-specific params", () => {
    const result = brokerParams(MANAGER_LOGS_CONFIG, {
      "os.platform": "ubuntu",
      registerIP: "1.2.3.4",
      manager: "wazuh-01",
    });
    expect(result.unsupportedParams).toContain("os.platform");
    expect(result.unsupportedParams).toContain("registerIP");
    expect(result.unsupportedParams).toContain("manager");
  });

  it("SYSCHECK rejects rules-specific params", () => {
    const result = brokerParams(SYSCHECK_CONFIG, {
      level: "4",
      pci_dss: "10.6.1",
      rule_ids: "100",
    });
    expect(result.unsupportedParams).toContain("level");
    expect(result.unsupportedParams).toContain("pci_dss");
    expect(result.unsupportedParams).toContain("rule_ids");
  });

  it("DECODERS rejects syscheck-specific params", () => {
    const result = brokerParams(DECODERS_CONFIG, {
      arch: "x64",
      md5: "abc",
      sha256: "def",
    });
    expect(result.unsupportedParams).toContain("arch");
    expect(result.unsupportedParams).toContain("md5");
    expect(result.unsupportedParams).toContain("sha256");
  });

  it("ROOTCHECK rejects ciscat-specific params", () => {
    const result = brokerParams(ROOTCHECK_CONFIG, {
      benchmark: "CIS",
      profile: "Level_1",
      score: 85,
    });
    expect(result.unsupportedParams).toContain("benchmark");
    expect(result.unsupportedParams).toContain("profile");
    expect(result.unsupportedParams).toContain("score");
  });

  it("CISCAT rejects rootcheck-specific params", () => {
    const result = brokerParams(CISCAT_CONFIG, {
      cis: "1.4",
    });
    expect(result.unsupportedParams).toContain("cis");
  });

  it("MITRE_TECHNIQUES rejects decoders-specific params", () => {
    const result = brokerParams(MITRE_TECHNIQUES_CONFIG, {
      decoder_names: "syslog",
      relative_dirname: "ruleset/decoders",
    });
    expect(result.unsupportedParams).toContain("decoder_names");
    expect(result.unsupportedParams).toContain("relative_dirname");
  });
});
