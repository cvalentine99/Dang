/**
 * API Contract Gap Report v4.14.3 — Verification Tests
 *
 * Tests every finding (C-1..C-5, H-1..H-12, M-1..M-18, L-1..L-6)
 * to prove the fix is structurally correct:
 *   - Broker configs exist and forward the right params
 *   - Router input schemas accept the newly-added params
 *   - No duplicate property names
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  brokerParams,
  RULES_FILES_CONFIG,
  DECODERS_FILES_CONFIG,
  LISTS_CONFIG,
  LISTS_FILES_CONFIG,
  MITRE_TACTICS_CONFIG,
  MITRE_GROUPS_CONFIG,
  MITRE_MITIGATIONS_CONFIG,
  MITRE_SOFTWARE_CONFIG,
  MITRE_REFERENCES_CONFIG,
  GROUP_FILES_CONFIG,
  SYSCOLLECTOR_HOTFIXES_CONFIG,
  SYSCOLLECTOR_NETADDR_CONFIG,
  SYSCOLLECTOR_NETIFACE_CONFIG,
  SYSCOLLECTOR_NETPROTO_CONFIG,
  ROOTCHECK_CONFIG,
  type EndpointParamConfig,
} from "./paramBroker";

// ═══════════════════════════════════════════════════════════════════════════════
// CRITICAL FINDINGS
// ═══════════════════════════════════════════════════════════════════════════════

describe("C-1: /security/resources uses resource_list (not resource)", () => {
  it("router should reference resource_list param name", async () => {
    // Structural test: read the router source and verify the param name
    const fs = await import("fs");
    const src = fs.readFileSync("server/wazuh/wazuhRouter.ts", "utf-8");
    // Find the securityResources endpoint
    const match = src.match(/securityResources[\s\S]*?proxyGet\(["']\/security\/resources["'][\s\S]*?\)/);
    expect(match).toBeTruthy();
    // Must contain resource_list, not just resource
    expect(match![0]).toContain("resource_list");
  });
});

describe("C-2: /tasks/status accepts all 12+ spec params", () => {
  it("router should accept agents_list, command, node, module, status, pagination, sort, search, select, q", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/wazuh/wazuhRouter.ts", "utf-8");
    const match = src.match(/taskStatus[\s\S]*?\.query/);
    expect(match).toBeTruthy();
    const block = match![0];
    for (const param of ["agents_list", "command", "node", "module", "status", "sort", "search", "select", "q"]) {
      expect(block).toContain(param);
    }
  });
});

describe("C-3: ROOTCHECK_CONFIG — pci_dss and cis restored per spec v4.14.3", () => {
  it("should forward pci_dss (restored per spec v4.14.3)", () => {
    const result = brokerParams(ROOTCHECK_CONFIG, { pci_dss: "11.5" });
    expect(result.unsupportedParams).not.toContain("pci_dss");
    expect(result.forwardedQuery).toHaveProperty("pci_dss", "11.5");
  });

  it("should forward cis (restored per spec v4.14.3)", () => {
    const result = brokerParams(ROOTCHECK_CONFIG, { cis: "1.1.1" });
    expect(result.unsupportedParams).not.toContain("cis");
    expect(result.forwardedQuery).toHaveProperty("cis", "1.1.1");
  });

  it("should still forward valid rootcheck params", () => {
    const result = brokerParams(ROOTCHECK_CONFIG, {
      limit: 10,
      offset: 0,
      sort: "+date_last",
      search: "test",
      status: "outstanding",
    });
    expect(result.forwardedQuery.limit).toBe("10");
    expect(result.forwardedQuery.sort).toBe("+date_last");
    expect(result.forwardedQuery.status).toBe("outstanding");
    expect(result.unsupportedParams).toHaveLength(0);
  });
});

describe("C-4: Security individual resource GET endpoints exist", () => {
  it("router should have securityUser, securityRole, securityPolicy, securityRule endpoints", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/wazuh/wazuhRouter.ts", "utf-8");
    for (const endpoint of ["securityUserById:", "securityRoleById:", "securityPolicyById:", "securityRuleById:"]) {
      expect(src).toContain(endpoint);
    }
    // Verify they hit the right Wazuh paths
    expect(src).toContain("/security/users/${");
    expect(src).toContain("/security/roles/${");
    expect(src).toContain("/security/policies/${");
    expect(src).toContain("/security/rules/${");
  });
});

describe("C-5: Cluster/Manager API config endpoints exist", () => {
  it("router should have clusterRulesetSync, clusterApiConfig, managerApiConfig", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/wazuh/wazuhRouter.ts", "utf-8");
    expect(src).toContain("clusterRulesetSync");
    expect(src).toContain("clusterApiConfig");
    expect(src).toContain("managerApiConfig");
    expect(src).toContain("/cluster/ruleset/synchronization");
    expect(src).toContain("/cluster/api/config");
    expect(src).toContain("/manager/api/config");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HIGH FINDINGS — Broker configs
// ═══════════════════════════════════════════════════════════════════════════════

describe("H-1: RULES_FILES_CONFIG", () => {
  it("forwards sort, search, filename, relative_dirname, status, q, select, distinct", () => {
    const result = brokerParams(RULES_FILES_CONFIG, {
      limit: 10, offset: 0, sort: "+filename", search: "test",
      filename: "0010-rules_config.xml", relative_dirname: "ruleset/rules",
      status: "enabled", q: "filename~test", select: "filename,status", distinct: true,
    });
    expect(result.forwardedQuery.sort).toBe("+filename");
    expect(result.forwardedQuery.filename).toBe("0010-rules_config.xml");
    expect(result.forwardedQuery.relative_dirname).toBe("ruleset/rules");
    expect(result.forwardedQuery.status).toBe("enabled");
    expect(result.forwardedQuery.q).toBe("filename~test");
    expect(result.unsupportedParams).toHaveLength(0);
  });
});

describe("H-2: DECODERS_FILES_CONFIG", () => {
  it("forwards sort, search, filename, relative_dirname, status, q, select, distinct", () => {
    const result = brokerParams(DECODERS_FILES_CONFIG, {
      limit: 10, offset: 0, sort: "+filename", search: "syslog",
      filename: "0005-wazuh_decoders.xml", relative_dirname: "ruleset/decoders",
      status: "enabled", q: "filename~syslog", select: "filename", distinct: false,
    });
    expect(result.forwardedQuery.filename).toBe("0005-wazuh_decoders.xml");
    expect(result.forwardedQuery.relative_dirname).toBe("ruleset/decoders");
    expect(result.unsupportedParams).toHaveLength(0);
  });
});

describe("H-3: LISTS_CONFIG", () => {
  it("forwards sort, search, select, filename, relative_dirname, q, distinct", () => {
    const result = brokerParams(LISTS_CONFIG, {
      limit: 10, offset: 0, sort: "+filename", search: "audit",
      filename: "audit-keys", relative_dirname: "etc/lists", q: "filename~audit",
      select: "filename,relative_dirname", distinct: true,
    });
    expect(result.forwardedQuery.filename).toBe("audit-keys");
    expect(result.forwardedQuery.relative_dirname).toBe("etc/lists");
    expect(result.unsupportedParams).toHaveLength(0);
  });
});

describe("H-4: LISTS_FILES_CONFIG", () => {
  it("forwards sort, search, filename, relative_dirname", () => {
    const result = brokerParams(LISTS_FILES_CONFIG, {
      limit: 10, offset: 0, sort: "+filename", search: "test",
      filename: "audit-keys", relative_dirname: "etc/lists",
    });
    expect(result.forwardedQuery.filename).toBe("audit-keys");
    expect(result.unsupportedParams).toHaveLength(0);
  });
});

describe("H-5: MITRE_TACTICS_CONFIG", () => {
  it("forwards all 8 params including mitre_tactic_ids", () => {
    const result = brokerParams(MITRE_TACTICS_CONFIG, {
      limit: 10, offset: 0, sort: "+name", search: "initial",
      select: "name,id", q: "name~initial", distinct: true,
      mitre_tactic_ids: "TA0001,TA0002",
    });
    expect(result.forwardedQuery.tactic_ids).toBe("TA0001,TA0002");
    expect(result.unsupportedParams).toHaveLength(0);
  });
});

describe("H-6: MITRE_GROUPS_CONFIG", () => {
  it("forwards mitre_group_ids", () => {
    const result = brokerParams(MITRE_GROUPS_CONFIG, {
      limit: 10, offset: 0, mitre_group_ids: "G0001",
    });
    expect(result.forwardedQuery.group_ids).toBe("G0001");
    expect(result.unsupportedParams).toHaveLength(0);
  });
});

describe("H-7: MITRE_MITIGATIONS_CONFIG", () => {
  it("forwards mitre_mitigation_ids", () => {
    const result = brokerParams(MITRE_MITIGATIONS_CONFIG, {
      limit: 10, offset: 0, mitre_mitigation_ids: "M1036",
    });
    expect(result.forwardedQuery.mitigation_ids).toBe("M1036");
    expect(result.unsupportedParams).toHaveLength(0);
  });
});

describe("H-8: MITRE_SOFTWARE_CONFIG", () => {
  it("forwards mitre_software_ids", () => {
    const result = brokerParams(MITRE_SOFTWARE_CONFIG, {
      limit: 10, offset: 0, mitre_software_ids: "S0001",
    });
    expect(result.forwardedQuery.software_ids).toBe("S0001");
    expect(result.unsupportedParams).toHaveLength(0);
  });
});

describe("H-9: MITRE_REFERENCES_CONFIG", () => {
  it("forwards mitre_reference_ids", () => {
    const result = brokerParams(MITRE_REFERENCES_CONFIG, {
      limit: 10, offset: 0, mitre_reference_ids: "R0001",
    });
    expect(result.forwardedQuery.reference_ids).toBe("R0001");
    expect(result.unsupportedParams).toHaveLength(0);
  });
});

describe("H-10: GROUP_FILES_CONFIG", () => {
  it("forwards sort, search, select, q, distinct, hash", () => {
    const result = brokerParams(GROUP_FILES_CONFIG, {
      limit: 10, offset: 0, sort: "+filename", search: "agent",
      select: "filename,hash", q: "filename~agent", distinct: true, hash: "abc123",
    });
    expect(result.forwardedQuery.hash).toBe("abc123");
    expect(result.unsupportedParams).toHaveLength(0);
  });
});

describe("H-11: SYSCOLLECTOR_NETIFACE_CONFIG", () => {
  it("forwards 14+ field filters", () => {
    const result = brokerParams(SYSCOLLECTOR_NETIFACE_CONFIG, {
      limit: 10, offset: 0, name: "eth0", adapter: "Intel",
      type: "ethernet", state: "up", mtu: "1500",
      "tx.packets": "100", "rx.packets": "200",
      "tx.bytes": "1000", "rx.bytes": "2000",
      "tx.errors": "0", "rx.errors": "0",
      "tx.dropped": "0", "rx.dropped": "0",
      mac: "00:11:22:33:44:55",
    });
    expect(result.forwardedQuery.name).toBe("eth0");
    expect(result.forwardedQuery.mac).toBe("00:11:22:33:44:55");
    expect(result.forwardedQuery["tx.packets"]).toBe("100");
    expect(result.unsupportedParams).toHaveLength(0);
  });
});

describe("H-12: SYSCOLLECTOR_NETADDR_CONFIG", () => {
  it("forwards iface, proto, address, broadcast, netmask", () => {
    const result = brokerParams(SYSCOLLECTOR_NETADDR_CONFIG, {
      limit: 10, offset: 0, iface: "eth0", proto: "ipv4",
      address: "192.168.1.1", broadcast: "192.168.1.255", netmask: "255.255.255.0",
    });
    expect(result.forwardedQuery.iface).toBe("eth0");
    expect(result.forwardedQuery.proto).toBe("ipv4");
    expect(result.forwardedQuery.address).toBe("192.168.1.1");
    expect(result.unsupportedParams).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MEDIUM FINDINGS — Structural verification
// ═══════════════════════════════════════════════════════════════════════════════

describe("M-1 through M-18: Router input schemas accept expanded params", () => {
  let src: string;

  // Read once for all tests
  beforeAll(async () => {
    const fs = await import("fs");
    src = fs.readFileSync("server/wazuh/wazuhRouter.ts", "utf-8");
  });

  it("M-1: agentsOutdated accepts sort, search, select, q", () => {
    const block = extractProcedureBlock(src, "agentsOutdated");
    for (const p of ["sort", "search", "select", "q"]) {
      expect(block).toContain(p);
    }
  });

  it("M-2: agentsNoGroup accepts sort, search, select, q", () => {
    const block = extractProcedureBlock(src, "agentsNoGroup");
    for (const p of ["sort", "search", "select", "q"]) {
      expect(block).toContain(p);
    }
  });

  it("M-3: agentsStatsDistinct accepts offset, limit, sort, search, q", () => {
    const block = extractProcedureBlock(src, "agentsStatsDistinct");
    for (const p of ["sort", "search", "q"]) {
      expect(block).toContain(p);
    }
    // limit/offset may be provided via paginationSchema.shape spread
    const hasPagination = block.includes("limit") || block.includes("paginationSchema");
    expect(hasPagination).toBe(true);
  });

  it("M-4: agentDaemonStats accepts daemons_list", () => {
    const block = extractProcedureBlock(src, "agentDaemonStats");
    expect(block).toContain("daemons_list");
  });

  it("M-5: clusterHealthcheck accepts nodes_list", () => {
    const block = extractProcedureBlock(src, "clusterHealthcheck");
    expect(block).toContain("nodes_list");
  });

  it("M-6: clusterNodeDaemonStats accepts daemons_list", () => {
    const block = extractProcedureBlock(src, "clusterNodeDaemonStats");
    expect(block).toContain("daemons_list");
  });

  it("M-7: ruleGroups accepts offset, limit, sort, search", () => {
    const block = extractProcedureBlock(src, "ruleGroups");
    for (const p of ["sort", "search", "limit", "offset"]) {
      expect(block).toContain(p);
    }
  });

  it("M-8: rulesByRequirement accepts offset, limit, sort, search", () => {
    const block = extractProcedureBlock(src, "rulesByRequirement");
    for (const p of ["sort", "search", "limit", "offset"]) {
      expect(block).toContain(p);
    }
  });

  it("M-9: decoderParents accepts sort, select", () => {
    const block = extractProcedureBlock(src, "decoderParents");
    expect(block).toContain("sort");
    expect(block).toContain("select");
  });

  it("M-10: groupConfiguration accepts offset, limit", () => {
    const block = extractProcedureBlock(src, "groupConfiguration");
    expect(block).toContain("limit");
    expect(block).toContain("offset");
  });

  it("M-11: groupFileContent accepts type_agents, raw", () => {
    const block = extractProcedureBlock(src, "groupFileContent");
    expect(block).toContain("type_agents");
    expect(block).toContain("raw");
  });

  it("M-12: agentHotfixes uses SYSCOLLECTOR_HOTFIXES_CONFIG broker", () => {
    const block = extractProcedureBlock(src, "agentHotfixes");
    expect(block).toContain("SYSCOLLECTOR_HOTFIXES_CONFIG");
  });

  it("M-13: agentNetproto uses SYSCOLLECTOR_NETPROTO_CONFIG broker", () => {
    const block = extractProcedureBlock(src, "agentNetproto");
    expect(block).toContain("SYSCOLLECTOR_NETPROTO_CONFIG");
  });

  it("M-14: agentUsers accepts sort, search, q, distinct", () => {
    const block = extractProcedureBlock(src, "agentUsers");
    for (const p of ["sort", "search", "q", "distinct"]) {
      expect(block).toContain(p);
    }
  });

  it("M-15: agentGroups2 accepts sort, search, q, distinct", () => {
    const block = extractProcedureBlock(src, "agentGroups2");
    for (const p of ["sort", "search", "q", "distinct"]) {
      expect(block).toContain(p);
    }
  });

  it("M-16: agentBrowserExtensions accepts sort, search, q, distinct", () => {
    const block = extractProcedureBlock(src, "agentBrowserExtensions");
    for (const p of ["sort", "search", "q", "distinct"]) {
      expect(block).toContain(p);
    }
  });

  it("M-17: expSyscollectorNetaddr accepts proto, address, broadcast, netmask", () => {
    const block = extractProcedureBlock(src, "expSyscollectorNetaddr");
    for (const p of ["proto", "address", "broadcast", "netmask"]) {
      expect(block).toContain(p);
    }
  });

  it("M-18: expSyscollectorNetiface accepts 14 field filters", () => {
    const block = extractProcedureBlock(src, "expSyscollectorNetiface");
    for (const p of ["name", "adapter", "type", "state", "mtu", "tx.packets", "rx.packets", "tx.bytes", "rx.bytes", "tx.errors", "rx.errors", "tx.dropped", "rx.dropped", "mac"]) {
      expect(block).toContain(p);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LOW FINDINGS
// ═══════════════════════════════════════════════════════════════════════════════

describe("L-1 through L-6: Low findings structural verification", () => {
  let src: string;

  beforeAll(async () => {
    const fs = await import("fs");
    src = fs.readFileSync("server/wazuh/wazuhRouter.ts", "utf-8");
  });

  it("L-1: ruleFileContent accepts raw, get_dirnames_path", () => {
    const block = extractProcedureBlock(src, "ruleFileContent");
    expect(block).toContain("raw");
    expect(block).toContain("get_dirnames_path");
  });

  it("L-2: decoderFileContent accepts raw, relative_dirname (broker-wired via DECODER_FILE_CONTENT_CONFIG)", () => {
    const block = extractProcedureBlock(src, "decoderFileContent");
    expect(block).toContain("raw");
    expect(block).toContain("relative_dirname");
    expect(block).toContain("DECODER_FILE_CONTENT_CONFIG");
  });

  it("L-3: listsFileContent accepts raw", () => {
    const block = extractProcedureBlock(src, "listsFileContent");
    expect(block).toContain("raw");
  });

  it("L-4: agentHardware accepts select", () => {
    const block = extractProcedureBlock(src, "agentHardware");
    expect(block).toContain("select");
  });

  it("L-5: agentOs accepts select", () => {
    const block = extractProcedureBlock(src, "agentOs");
    expect(block).toContain("select");
  });

  it("L-6: expSyscollectorHotfixes accepts hotfix field filter", () => {
    const block = extractProcedureBlock(src, "expSyscollectorHotfixes");
    expect(block).toContain("hotfix");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BROKER CONFIG COMPLETENESS — Ensure new configs have all UNIVERSAL_PARAMS
// ═══════════════════════════════════════════════════════════════════════════════

describe("New broker configs include universal params", () => {
  const universalParamNames = ["limit", "offset", "sort", "search", "q"];

  const configs = [
    { name: "RULES_FILES_CONFIG", config: RULES_FILES_CONFIG },
    { name: "DECODERS_FILES_CONFIG", config: DECODERS_FILES_CONFIG },
    { name: "LISTS_CONFIG", config: LISTS_CONFIG },
    { name: "MITRE_TACTICS_CONFIG", config: MITRE_TACTICS_CONFIG },
    { name: "MITRE_GROUPS_CONFIG", config: MITRE_GROUPS_CONFIG },
    { name: "MITRE_MITIGATIONS_CONFIG", config: MITRE_MITIGATIONS_CONFIG },
    { name: "MITRE_SOFTWARE_CONFIG", config: MITRE_SOFTWARE_CONFIG },
    { name: "MITRE_REFERENCES_CONFIG", config: MITRE_REFERENCES_CONFIG },
    { name: "GROUP_FILES_CONFIG", config: GROUP_FILES_CONFIG },
    { name: "SYSCOLLECTOR_HOTFIXES_CONFIG", config: SYSCOLLECTOR_HOTFIXES_CONFIG },
    { name: "SYSCOLLECTOR_NETADDR_CONFIG", config: SYSCOLLECTOR_NETADDR_CONFIG },
    { name: "SYSCOLLECTOR_NETIFACE_CONFIG", config: SYSCOLLECTOR_NETIFACE_CONFIG },
    { name: "SYSCOLLECTOR_NETPROTO_CONFIG", config: SYSCOLLECTOR_NETPROTO_CONFIG },
  ];

  for (const { name, config } of configs) {
    it(`${name} has all universal params`, () => {
      const paramNames = Object.keys((config as EndpointParamConfig).params);
      for (const up of universalParamNames) {
        expect(paramNames).toContain(up);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// NO DUPLICATE PROPERTIES
// ═══════════════════════════════════════════════════════════════════════════════

describe("No duplicate procedure names in router", () => {
  it("wazuhRouter.ts has no duplicate property names", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/wazuh/wazuhRouter.ts", "utf-8");
    // Extract all top-level procedure names (lines like "  procedureName: wazuhProcedure")
    const procedureRegex = /^\s{2}(\w+):\s*wazuhProcedure/gm;
    const names: string[] = [];
    let match;
    while ((match = procedureRegex.exec(src)) !== null) {
      names.push(match[1]);
    }
    const duplicates = names.filter((name, idx) => names.indexOf(name) !== idx);
    expect(duplicates).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract a procedure block from the router source by name.
 * Returns the text from "procedureName: wazuhProcedure" to the next procedure or section comment.
 */
function extractProcedureBlock(src: string, name: string): string {
  const startIdx = src.indexOf(`${name}: wazuhProcedure`);
  if (startIdx === -1) {
    const altIdx = src.indexOf(`${name}: wazuhProcedure`);
    if (altIdx === -1) return "";
    return src.slice(altIdx, altIdx + 800);
  }
  // Find the next procedure or section boundary
  const rest = src.slice(startIdx);
  // Look for the next procedure definition (2-space indent + word + colon + wazuhProcedure)
  const nextProcMatch = rest.slice(50).match(/\n  \w+: wazuhProcedure/);
  const nextSectionMatch = rest.slice(50).match(/\n  \/\/ ═/);
  let endIdx = rest.length;
  if (nextProcMatch?.index) endIdx = Math.min(endIdx, nextProcMatch.index + 50);
  if (nextSectionMatch?.index) endIdx = Math.min(endIdx, nextSectionMatch.index + 50);
  return rest.slice(0, endIdx);
}
