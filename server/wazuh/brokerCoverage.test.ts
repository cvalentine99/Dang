import { describe, it, expect, beforeAll } from "vitest";
import { generateCoverageReport, type CoverageReport, type WiringLevel } from "./brokerCoverage";
import {
  brokerParams,
  EXPERIMENTAL_CISCAT_RESULTS_CONFIG,
  CISCAT_CONFIG,
} from "./paramBroker";

// ── Coverage Report Tests ────────────────────────────────────────────────────

describe("brokerCoverage — generateCoverageReport", () => {
  let report: CoverageReport;

  beforeAll(() => {
    report = generateCoverageReport();
  });

  it("returns a valid report structure", () => {
    expect(report).toBeDefined();
    expect(report.specVersion).toBe("4.14.3");
    expect(report.analyzedAt).toBeTruthy();
    expect(new Date(report.analyzedAt).getTime()).not.toBeNaN();
  });

  it("has a positive total procedure count", () => {
    expect(report.totalProcedures).toBeGreaterThan(0);
  });

  it("counts sum to total", () => {
    expect(report.brokerWired + report.manualParam + report.passthrough).toBe(report.totalProcedures);
  });

  it("has broker-wired endpoints", () => {
    expect(report.brokerWired).toBeGreaterThan(0);
  });

  it("has manual-param endpoints", () => {
    expect(report.manualParam).toBeGreaterThan(0);
  });

  it("has passthrough endpoints", () => {
    expect(report.passthrough).toBeGreaterThan(0);
  });

  it("calculates broker coverage percentage correctly", () => {
    const expected = Math.round((report.brokerWired / report.totalProcedures) * 100);
    expect(report.brokerCoveragePercent).toBe(expected);
  });

  it("calculates param coverage percentage correctly", () => {
    const expected = Math.round(((report.brokerWired + report.manualParam) / report.totalProcedures) * 100);
    expect(report.paramCoveragePercent).toBe(expected);
  });

  it("has broker configs", () => {
    expect(report.totalBrokerConfigs).toBeGreaterThan(0);
    expect(report.brokerConfigs.length).toBe(report.totalBrokerConfigs);
  });

  it("has total broker params", () => {
    expect(report.totalBrokerParams).toBeGreaterThan(0);
    const sum = report.brokerConfigs.reduce((s, c) => s + c.totalParams, 0);
    expect(report.totalBrokerParams).toBe(sum);
  });

  it("has categories", () => {
    expect(report.categories.length).toBeGreaterThan(0);
  });

  it("category totals sum to overall total", () => {
    const catTotal = report.categories.reduce((s, c) => s + c.total, 0);
    expect(catTotal).toBe(report.totalProcedures);
  });

  it("category broker+manual+passthrough sums match category total", () => {
    for (const cat of report.categories) {
      expect(cat.brokerWired + cat.manualParam + cat.passthrough).toBe(cat.total);
    }
  });

  it("every endpoint has required fields", () => {
    for (const ep of report.endpoints) {
      expect(ep.procedure).toBeTruthy();
      expect(ep.wazuhPath).toBeTruthy();
      expect(ep.method).toBe("GET");
      expect(["broker", "manual", "passthrough"]).toContain(ep.wiringLevel);
      expect(ep.category).toBeTruthy();
      expect(typeof ep.paramCount).toBe("number");
    }
  });

  it("broker-wired endpoints have brokerConfig set", () => {
    const brokerEndpoints = report.endpoints.filter(e => e.wiringLevel === "broker");
    for (const ep of brokerEndpoints) {
      expect(ep.brokerConfig).toBeTruthy();
    }
  });

  it("non-broker endpoints have no brokerConfig", () => {
    const nonBroker = report.endpoints.filter(e => e.wiringLevel !== "broker");
    for (const ep of nonBroker) {
      expect(ep.brokerConfig).toBeFalsy();
    }
  });

  it("every broker config has valid structure", () => {
    for (const config of report.brokerConfigs) {
      expect(config.name).toBeTruthy();
      expect(config.endpoint).toBeTruthy();
      expect(config.totalParams).toBeGreaterThan(0);
      expect(config.totalParams).toBe(config.universalParams.length + config.specificParams.length);
    }
  });

  it("includes the expCiscatResults endpoint", () => {
    const ep = report.endpoints.find(e => e.procedure === "expCiscatResults");
    expect(ep).toBeDefined();
    expect(ep!.wiringLevel).toBe("broker");
    expect(ep!.brokerConfig).toBe("EXPERIMENTAL_CISCAT_RESULTS_CONFIG");
    expect(ep!.wazuhPath).toBe("/experimental/ciscat/results");
    expect(ep!.category).toBe("Experimental");
  });

  it("includes the ciscatResults endpoint", () => {
    const ep = report.endpoints.find(e => e.procedure === "ciscatResults");
    expect(ep).toBeDefined();
    expect(ep!.wiringLevel).toBe("broker");
    expect(ep!.brokerConfig).toBe("CISCAT_CONFIG");
  });

  it("includes EXPERIMENTAL_CISCAT_RESULTS_CONFIG in broker configs", () => {
    const config = report.brokerConfigs.find(c => c.name === "EXPERIMENTAL_CISCAT_RESULTS_CONFIG");
    expect(config).toBeDefined();
    expect(config!.endpoint).toBe("/experimental/ciscat/results");
    expect(config!.totalParams).toBeGreaterThanOrEqual(10);
  });

  it("category coverage percentages are between 0 and 100", () => {
    for (const cat of report.categories) {
      expect(cat.coveragePercent).toBeGreaterThanOrEqual(0);
      expect(cat.coveragePercent).toBeLessThanOrEqual(100);
    }
  });
});

// ── EXPERIMENTAL_CISCAT_RESULTS_CONFIG Broker Tests ──────────────────────────

describe("EXPERIMENTAL_CISCAT_RESULTS_CONFIG", () => {
  it("has the correct endpoint path", () => {
    expect(EXPERIMENTAL_CISCAT_RESULTS_CONFIG.endpoint).toBe("/experimental/ciscat/results");
  });

  it("supports universal params (minus q/distinct per spec v4.14.3)", () => {
    const paramNames = Object.keys(EXPERIMENTAL_CISCAT_RESULTS_CONFIG.params);
    expect(paramNames).toContain("offset");
    expect(paramNames).toContain("limit");
    expect(paramNames).toContain("sort");
    expect(paramNames).toContain("search");
    expect(paramNames).toContain("select");
    // Experimental endpoints do NOT support q/distinct per spec v4.14.3
    expect(paramNames).not.toContain("q");
    expect(paramNames).not.toContain("distinct");
  });

  it("supports agents_list filter", () => {
    const paramNames = Object.keys(EXPERIMENTAL_CISCAT_RESULTS_CONFIG.params);
    expect(paramNames).toContain("agents_list");
    expect(EXPERIMENTAL_CISCAT_RESULTS_CONFIG.params.agents_list.wazuhName).toBe("agents_list");
    expect(EXPERIMENTAL_CISCAT_RESULTS_CONFIG.params.agents_list.type).toBe("csv");
  });

  it("supports CIS-CAT field filters", () => {
    const paramNames = Object.keys(EXPERIMENTAL_CISCAT_RESULTS_CONFIG.params);
    expect(paramNames).toContain("benchmark");
    expect(paramNames).toContain("profile");
    expect(paramNames).toContain("pass");
    expect(paramNames).toContain("fail");
    expect(paramNames).toContain("error");
    expect(paramNames).toContain("notchecked");
    expect(paramNames).toContain("unknown");
    expect(paramNames).toContain("score");
  });

  it("brokerParams forwards all recognized params correctly", () => {
    const result = brokerParams(EXPERIMENTAL_CISCAT_RESULTS_CONFIG, {
      offset: 0,
      limit: 10,
      sort: "+benchmark",
      search: "CIS",
      benchmark: "CIS_Ubuntu",
      profile: "Level 1",
      pass: 50,
      fail: 2,
      agents_list: "001,002,003",
    });

    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.forwardedQuery.offset).toBe("0");
    expect(result.forwardedQuery.limit).toBe("10");
    expect(result.forwardedQuery.sort).toBe("+benchmark");
    expect(result.forwardedQuery.search).toBe("CIS");
    expect(result.forwardedQuery.benchmark).toBe("CIS_Ubuntu");
    expect(result.forwardedQuery.profile).toBe("Level 1");
    expect(result.forwardedQuery.pass).toBe("50");
    expect(result.forwardedQuery.fail).toBe("2");
    expect(result.forwardedQuery.agents_list).toBe("001,002,003");
  });

  it("rejects unsupported params", () => {
    const result = brokerParams(EXPERIMENTAL_CISCAT_RESULTS_CONFIG, {
      offset: 0,
      limit: 10,
      bogus_param: "test",
    });

    expect(result.unsupportedParams).toContain("bogus_param");
    expect(result.forwardedQuery).not.toHaveProperty("bogus_param");
  });

  it("has the same CIS-CAT field filters as per-agent CISCAT_CONFIG (minus q/distinct per spec v4.14.3)", () => {
    const expParams = Object.keys(EXPERIMENTAL_CISCAT_RESULTS_CONFIG.params);
    const perAgentParams = Object.keys(CISCAT_CONFIG.params);

    // All per-agent CIS-CAT field params should also be in experimental,
    // EXCEPT q and distinct which the experimental endpoint does not support per spec v4.14.3
    const experimentalExcluded = ["q", "distinct", "wait_for_complete"];
    for (const p of perAgentParams) {
      if (experimentalExcluded.includes(p)) continue;
      expect(expParams).toContain(p);
    }

    // Experimental has agents_list that per-agent doesn't
    expect(expParams).toContain("agents_list");
    expect(perAgentParams).not.toContain("agents_list");

    // Confirm experimental does NOT have q/distinct
    expect(expParams).not.toContain("q");
    expect(expParams).not.toContain("distinct");
  });
});

// ── Specific Endpoint Presence Tests ─────────────────────────────────────────

describe("brokerCoverage — specific endpoint presence", () => {
  let report: CoverageReport;

  beforeAll(() => {
    report = generateCoverageReport();
  });

  const expectedEndpoints = [
    // Critical fixes from gap report
    { procedure: "securityResources", wazuhPath: "/security/resources" },
    { procedure: "taskStatus", wazuhPath: "/tasks/status" },
    { procedure: "securityUserById", wazuhPath: "/security/users/{user_id}" },
    { procedure: "securityRoleById", wazuhPath: "/security/roles/{role_id}" },
    { procedure: "securityPolicyById", wazuhPath: "/security/policies/{policy_id}" },
    { procedure: "securityRuleById", wazuhPath: "/security/rules/{rule_id}" },
    { procedure: "clusterRulesetSync", wazuhPath: "/cluster/ruleset/synchronization" },
    { procedure: "clusterApiConfig", wazuhPath: "/cluster/api/config" },
    { procedure: "managerApiConfig", wazuhPath: "/manager/api/config" },
    // High fixes — new broker configs
    { procedure: "rulesFiles", wazuhPath: "/rules/files" },
    { procedure: "decoderFiles", wazuhPath: "/decoders/files" },
    { procedure: "lists", wazuhPath: "/lists" },
    { procedure: "listsFiles", wazuhPath: "/lists/files" },
    { procedure: "mitreTactics", wazuhPath: "/mitre/tactics" },
    { procedure: "mitreGroups", wazuhPath: "/mitre/groups" },
    { procedure: "mitreMitigations", wazuhPath: "/mitre/mitigations" },
    { procedure: "mitreSoftware", wazuhPath: "/mitre/software" },
    { procedure: "mitreReferences", wazuhPath: "/mitre/references" },
    { procedure: "groupFiles", wazuhPath: "/groups/{group_id}/files" },
    // New experimental endpoint
    { procedure: "expCiscatResults", wazuhPath: "/experimental/ciscat/results" },
  ];

  for (const expected of expectedEndpoints) {
    it(`includes ${expected.procedure} → ${expected.wazuhPath}`, () => {
      const ep = report.endpoints.find(e => e.procedure === expected.procedure);
      expect(ep).toBeDefined();
      expect(ep!.wazuhPath).toBe(expected.wazuhPath);
    });
  }
});

// ── Category Completeness Tests ──────────────────────────────────────────────

describe("brokerCoverage — category completeness", () => {
  let report: CoverageReport;

  beforeAll(() => {
    report = generateCoverageReport();
  });

  const expectedCategories = [
    "Manager", "Cluster", "Agents", "Syscollector", "Experimental",
    "Rules", "MITRE", "SCA", "CIS-CAT", "Syscheck", "Rootcheck",
    "Decoders", "Tasks", "Security", "Lists", "Groups",
  ];

  for (const cat of expectedCategories) {
    it(`includes category: ${cat}`, () => {
      const found = report.categories.find(c => c.category === cat);
      expect(found).toBeDefined();
      expect(found!.total).toBeGreaterThan(0);
    });
  }
});
