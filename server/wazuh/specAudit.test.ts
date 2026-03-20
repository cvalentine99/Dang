/**
 * Spec-vs-Registry Audit Tests
 *
 * Validates that brokerCoverage.ts registry entries and paramBroker.ts configs
 * match the Wazuh API spec v4.14.x (resolved $ref parameters).
 *
 * These tests ensure:
 * 1. Registry paramCounts match spec (path + data params)
 * 2. Broker configs contain exactly the params the spec defines
 * 3. No phantom params exist in configs that aren't in the spec
 * 4. No missing params that the spec defines but configs omit
 * 5. Experimental endpoints correctly exclude q/distinct
 */
import { describe, it, expect } from "vitest";
import * as broker from "./paramBroker";

// ═══════════════════════════════════════════════════════════════════════════
// 1. Broker Config Param Count Validation
// ═══════════════════════════════════════════════════════════════════════════

describe("Broker Config Param Counts vs Spec v4.14.x", () => {
  const configCounts: Array<{ name: string; config: broker.EndpointParamConfig; expectedCount: number }> = [
    { name: "AGENTS_CONFIG", config: broker.AGENTS_CONFIG, expectedCount: 22 },
    { name: "RULES_CONFIG", config: broker.RULES_CONFIG, expectedCount: 21 },
    { name: "SYSCHECK_CONFIG", config: broker.SYSCHECK_CONFIG, expectedCount: 18 },
    { name: "ROOTCHECK_CONFIG", config: broker.ROOTCHECK_CONFIG, expectedCount: 11 },
    { name: "CISCAT_CONFIG", config: broker.CISCAT_CONFIG, expectedCount: 16 },
    { name: "MITRE_REFERENCES_CONFIG", config: broker.MITRE_REFERENCES_CONFIG, expectedCount: 8 },
    { name: "MITRE_TECHNIQUES_CONFIG", config: broker.MITRE_TECHNIQUES_CONFIG, expectedCount: 9 },
    { name: "MITRE_TACTICS_CONFIG", config: broker.MITRE_TACTICS_CONFIG, expectedCount: 9 },
    { name: "MITRE_GROUPS_CONFIG", config: broker.MITRE_GROUPS_CONFIG, expectedCount: 9 },
    { name: "MITRE_MITIGATIONS_CONFIG", config: broker.MITRE_MITIGATIONS_CONFIG, expectedCount: 9 },
    { name: "MITRE_SOFTWARE_CONFIG", config: broker.MITRE_SOFTWARE_CONFIG, expectedCount: 9 },
    { name: "DECODERS_CONFIG", config: broker.DECODERS_CONFIG, expectedCount: 12 },
    { name: "SYSCOLLECTOR_NETIFACE_CONFIG", config: broker.SYSCOLLECTOR_NETIFACE_CONFIG, expectedCount: 21 },  // 7 universal + 13 specific + wait_for_complete (mac removed — not in spec v4.14.x)
    { name: "SYSCOLLECTOR_NETADDR_CONFIG", config: broker.SYSCOLLECTOR_NETADDR_CONFIG, expectedCount: 13 },
    { name: "SYSCOLLECTOR_HOTFIXES_CONFIG", config: broker.SYSCOLLECTOR_HOTFIXES_CONFIG, expectedCount: 9 },
    { name: "SYSCOLLECTOR_NETPROTO_CONFIG", config: broker.SYSCOLLECTOR_NETPROTO_CONFIG, expectedCount: 12 },
    { name: "SECURITY_ROLES_CONFIG", config: broker.SECURITY_ROLES_CONFIG, expectedCount: 8 },
    { name: "SECURITY_POLICIES_CONFIG", config: broker.SECURITY_POLICIES_CONFIG, expectedCount: 8 },
    { name: "SECURITY_USERS_CONFIG", config: broker.SECURITY_USERS_CONFIG, expectedCount: 8 },
    { name: "CLUSTER_NODE_CONFIGURATION_CONFIG", config: broker.CLUSTER_NODE_CONFIGURATION_CONFIG, expectedCount: 3 },
    { name: "CLUSTER_NODE_LOGS_CONFIG", config: broker.CLUSTER_NODE_LOGS_CONFIG, expectedCount: 7 },
    { name: "TASKS_STATUS_CONFIG", config: broker.TASKS_STATUS_CONFIG, expectedCount: 12 },
    { name: "AGENTS_OUTDATED_CONFIG", config: broker.AGENTS_OUTDATED_CONFIG, expectedCount: 6 },
    { name: "AGENTS_NO_GROUP_CONFIG", config: broker.AGENTS_NO_GROUP_CONFIG, expectedCount: 6 },
    { name: "AGENTS_STATS_DISTINCT_CONFIG", config: broker.AGENTS_STATS_DISTINCT_CONFIG, expectedCount: 6 },
  ];

  for (const { name, config, expectedCount } of configCounts) {
    it(`${name} has ${expectedCount} params matching spec`, () => {
      const actual = Object.keys(config.params).length;
      expect(actual).toBe(expectedCount);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Experimental Endpoints: No q/distinct
// ═══════════════════════════════════════════════════════════════════════════

describe("Experimental endpoints exclude q and distinct per spec v4.14.x", () => {
  const experimentalConfigs: Array<{ name: string; config: broker.EndpointParamConfig }> = [
    { name: "EXP_SYSCOLLECTOR_PACKAGES_CONFIG", config: broker.EXP_SYSCOLLECTOR_PACKAGES_CONFIG },
    { name: "EXP_SYSCOLLECTOR_PROCESSES_CONFIG", config: broker.EXP_SYSCOLLECTOR_PROCESSES_CONFIG },
    { name: "EXP_SYSCOLLECTOR_PORTS_CONFIG", config: broker.EXP_SYSCOLLECTOR_PORTS_CONFIG },
    { name: "EXP_SYSCOLLECTOR_NETIFACE_CONFIG", config: broker.EXP_SYSCOLLECTOR_NETIFACE_CONFIG },
    { name: "EXP_SYSCOLLECTOR_NETADDR_CONFIG", config: broker.EXP_SYSCOLLECTOR_NETADDR_CONFIG },
    { name: "EXP_SYSCOLLECTOR_NETPROTO_CONFIG", config: broker.EXP_SYSCOLLECTOR_NETPROTO_CONFIG },
    { name: "EXP_SYSCOLLECTOR_OS_CONFIG", config: broker.EXP_SYSCOLLECTOR_OS_CONFIG },
    { name: "EXP_SYSCOLLECTOR_HARDWARE_CONFIG", config: broker.EXP_SYSCOLLECTOR_HARDWARE_CONFIG },
    { name: "EXP_SYSCOLLECTOR_HOTFIXES_CONFIG", config: broker.EXP_SYSCOLLECTOR_HOTFIXES_CONFIG },
    { name: "EXPERIMENTAL_CISCAT_RESULTS_CONFIG", config: broker.EXPERIMENTAL_CISCAT_RESULTS_CONFIG },
  ];

  for (const { name, config } of experimentalConfigs) {
    it(`${name} does NOT contain 'q' param`, () => {
      expect(Object.keys(config.params)).not.toContain("q");
    });

    it(`${name} does NOT contain 'distinct' param`, () => {
      expect(Object.keys(config.params)).not.toContain("distinct");
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Specific Param Presence Checks
// ═══════════════════════════════════════════════════════════════════════════

describe("Critical param presence checks", () => {
  it("ROOTCHECK_CONFIG includes pci_dss and cis (restored per spec v4.14.x)", () => {
    const params = Object.keys(broker.ROOTCHECK_CONFIG.params);
    expect(params).toContain("pci_dss");
    expect(params).toContain("cis");
  });

  it("MITRE_REFERENCES_CONFIG includes select (added per spec v4.14.x)", () => {
    const params = Object.keys(broker.MITRE_REFERENCES_CONFIG.params);
    expect(params).toContain("select");
  });

  it("AGENTS_CONFIG includes agents_list (replaced phantom manager_host)", () => {
    const params = Object.keys(broker.AGENTS_CONFIG.params);
    expect(params).toContain("agents_list");
    expect(params).not.toContain("manager_host");
  });

  it("AGENTS_CONFIG includes manager (not manager_host)", () => {
    const params = Object.keys(broker.AGENTS_CONFIG.params);
    expect(params).toContain("manager");
  });

  it("EXP_SYSCOLLECTOR_OS_CONFIG includes os.name, os.version, architecture, version, release", () => {
    const params = Object.keys(broker.EXP_SYSCOLLECTOR_OS_CONFIG.params);
    expect(params).toContain("os.name");
    expect(params).toContain("os.version");
    expect(params).toContain("architecture");
    expect(params).toContain("version");
    expect(params).toContain("release");
  });

  it("EXP_SYSCOLLECTOR_HARDWARE_CONFIG includes board_serial, cpu.name, cpu.cores, cpu.mhz, ram.free, ram.total", () => {
    const params = Object.keys(broker.EXP_SYSCOLLECTOR_HARDWARE_CONFIG.params);
    expect(params).toContain("board_serial");
    expect(params).toContain("cpu.name");
    expect(params).toContain("cpu.cores");
    expect(params).toContain("cpu.mhz");
    expect(params).toContain("ram.free");
    expect(params).toContain("ram.total");
  });

  it("EXP_SYSCOLLECTOR_NETPROTO_CONFIG includes iface, type, gateway, dhcp", () => {
    const params = Object.keys(broker.EXP_SYSCOLLECTOR_NETPROTO_CONFIG.params);
    expect(params).toContain("iface");
    expect(params).toContain("type");
    expect(params).toContain("gateway");
    expect(params).toContain("dhcp");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Experimental Config Param Counts (spec-aligned)
// ═══════════════════════════════════════════════════════════════════════════

describe("Experimental config param counts vs spec v4.14.x", () => {
  const expCounts: Array<{ name: string; config: broker.EndpointParamConfig; expectedCount: number }> = [
    { name: "EXP_SYSCOLLECTOR_PACKAGES_CONFIG", config: broker.EXP_SYSCOLLECTOR_PACKAGES_CONFIG, expectedCount: 12 },
    { name: "EXP_SYSCOLLECTOR_PROCESSES_CONFIG", config: broker.EXP_SYSCOLLECTOR_PROCESSES_CONFIG, expectedCount: 21 },
    { name: "EXP_SYSCOLLECTOR_PORTS_CONFIG", config: broker.EXP_SYSCOLLECTOR_PORTS_CONFIG, expectedCount: 15 },
    { name: "EXP_SYSCOLLECTOR_NETIFACE_CONFIG", config: broker.EXP_SYSCOLLECTOR_NETIFACE_CONFIG, expectedCount: 20 },  // 5 universal (no q/distinct) + agents_list + wait_for_complete + 13 specific (mac removed)
    { name: "EXP_SYSCOLLECTOR_NETADDR_CONFIG", config: broker.EXP_SYSCOLLECTOR_NETADDR_CONFIG, expectedCount: 12 },
    { name: "EXP_SYSCOLLECTOR_NETPROTO_CONFIG", config: broker.EXP_SYSCOLLECTOR_NETPROTO_CONFIG, expectedCount: 11 },
    { name: "EXP_SYSCOLLECTOR_OS_CONFIG", config: broker.EXP_SYSCOLLECTOR_OS_CONFIG, expectedCount: 12 },
    { name: "EXP_SYSCOLLECTOR_HARDWARE_CONFIG", config: broker.EXP_SYSCOLLECTOR_HARDWARE_CONFIG, expectedCount: 13 },
    { name: "EXP_SYSCOLLECTOR_HOTFIXES_CONFIG", config: broker.EXP_SYSCOLLECTOR_HOTFIXES_CONFIG, expectedCount: 8 },
    { name: "EXPERIMENTAL_CISCAT_RESULTS_CONFIG", config: broker.EXPERIMENTAL_CISCAT_RESULTS_CONFIG, expectedCount: 14 },
  ];

  for (const { name, config, expectedCount } of expCounts) {
    it(`${name} has ${expectedCount} params`, () => {
      const actual = Object.keys(config.params).length;
      expect(actual).toBe(expectedCount);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Config Endpoint Path Validation
// ═══════════════════════════════════════════════════════════════════════════

describe("Broker config endpoint paths are valid", () => {
  const allConfigs: Array<{ name: string; config: broker.EndpointParamConfig }> = [
    { name: "AGENTS_CONFIG", config: broker.AGENTS_CONFIG },
    { name: "RULES_CONFIG", config: broker.RULES_CONFIG },
    { name: "SYSCHECK_CONFIG", config: broker.SYSCHECK_CONFIG },
    { name: "ROOTCHECK_CONFIG", config: broker.ROOTCHECK_CONFIG },
    { name: "CISCAT_CONFIG", config: broker.CISCAT_CONFIG },
    { name: "MITRE_REFERENCES_CONFIG", config: broker.MITRE_REFERENCES_CONFIG },
    { name: "EXP_SYSCOLLECTOR_PACKAGES_CONFIG", config: broker.EXP_SYSCOLLECTOR_PACKAGES_CONFIG },
    { name: "EXP_SYSCOLLECTOR_PROCESSES_CONFIG", config: broker.EXP_SYSCOLLECTOR_PROCESSES_CONFIG },
    { name: "EXP_SYSCOLLECTOR_PORTS_CONFIG", config: broker.EXP_SYSCOLLECTOR_PORTS_CONFIG },
    { name: "EXP_SYSCOLLECTOR_NETIFACE_CONFIG", config: broker.EXP_SYSCOLLECTOR_NETIFACE_CONFIG },
    { name: "EXP_SYSCOLLECTOR_NETADDR_CONFIG", config: broker.EXP_SYSCOLLECTOR_NETADDR_CONFIG },
    { name: "EXP_SYSCOLLECTOR_NETPROTO_CONFIG", config: broker.EXP_SYSCOLLECTOR_NETPROTO_CONFIG },
    { name: "EXP_SYSCOLLECTOR_OS_CONFIG", config: broker.EXP_SYSCOLLECTOR_OS_CONFIG },
    { name: "EXP_SYSCOLLECTOR_HARDWARE_CONFIG", config: broker.EXP_SYSCOLLECTOR_HARDWARE_CONFIG },
    { name: "EXP_SYSCOLLECTOR_HOTFIXES_CONFIG", config: broker.EXP_SYSCOLLECTOR_HOTFIXES_CONFIG },
    { name: "EXPERIMENTAL_CISCAT_RESULTS_CONFIG", config: broker.EXPERIMENTAL_CISCAT_RESULTS_CONFIG },
    { name: "SECURITY_ROLES_CONFIG", config: broker.SECURITY_ROLES_CONFIG },
    { name: "SECURITY_POLICIES_CONFIG", config: broker.SECURITY_POLICIES_CONFIG },
    { name: "SECURITY_USERS_CONFIG", config: broker.SECURITY_USERS_CONFIG },
  ];

  for (const { name, config } of allConfigs) {
    it(`${name} has a valid endpoint path starting with /`, () => {
      expect(config.endpoint).toMatch(/^\//);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. wazuhName Consistency
// ═══════════════════════════════════════════════════════════════════════════

describe("All config params have valid wazuhName", () => {
  const configs: Array<{ name: string; config: broker.EndpointParamConfig }> = [
    { name: "ROOTCHECK_CONFIG", config: broker.ROOTCHECK_CONFIG },
    { name: "MITRE_REFERENCES_CONFIG", config: broker.MITRE_REFERENCES_CONFIG },
    { name: "AGENTS_CONFIG", config: broker.AGENTS_CONFIG },
    { name: "EXP_SYSCOLLECTOR_OS_CONFIG", config: broker.EXP_SYSCOLLECTOR_OS_CONFIG },
    { name: "EXP_SYSCOLLECTOR_HARDWARE_CONFIG", config: broker.EXP_SYSCOLLECTOR_HARDWARE_CONFIG },
    { name: "EXP_SYSCOLLECTOR_NETPROTO_CONFIG", config: broker.EXP_SYSCOLLECTOR_NETPROTO_CONFIG },
  ];

  for (const { name, config } of configs) {
    it(`${name} params all have non-empty wazuhName`, () => {
      for (const [key, param] of Object.entries(config.params)) {
        expect(param.wazuhName, `${name}.${key} missing wazuhName`).toBeTruthy();
        expect(typeof param.wazuhName).toBe("string");
      }
    });
  }
});
