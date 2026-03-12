import { describe, it, expect, beforeAll } from "vitest";
import { generateCoverageReport, type CoverageReport, type WiringLevel } from "./brokerCoverage";
import {
  brokerParams,
  EXPERIMENTAL_CISCAT_RESULTS_CONFIG,
  CISCAT_CONFIG,
} from "./paramBroker";
import * as fs from "node:fs";
import * as path from "node:path";

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

  it("has manual-param endpoints (truthful classification)", () => {
    expect(report.manualParam).toBeGreaterThan(0);
  });

  it("has passthrough endpoints (truthful classification)", () => {
    expect(report.passthrough).toBeGreaterThan(0);
  });

  it("broker coverage is less than 100% (truthful — not all endpoints call brokerParams)", () => {
    expect(report.brokerCoveragePercent).toBeLessThan(100);
    expect(report.brokerCoveragePercent).toBeGreaterThan(40);
  });

  it("calculates broker coverage percentage correctly", () => {
    const expected = Math.round((report.brokerWired / report.totalProcedures) * 100);
    expect(report.brokerCoveragePercent).toBe(expected);
  });

  it("calculates param coverage percentage correctly", () => {
    const expected = Math.round(((report.brokerWired + report.manualParam) / report.totalProcedures) * 100);
    expect(report.paramCoveragePercent).toBe(expected);
  });

  it("reports endpoint coverage as total/total", () => {
    expect(report.endpointCoverage).toBe(`${report.totalProcedures}/${report.totalProcedures}`);
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
      expect(config.totalParams).toBeGreaterThanOrEqual(0);
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
    { procedure: "securityUserById", wazuhPath: "/security/users" },
    { procedure: "securityRoleById", wazuhPath: "/security/roles" },
    { procedure: "securityPolicyById", wazuhPath: "/security/policies" },
    { procedure: "securityRuleById", wazuhPath: "/security/rules" },
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

// ── Classification Truth Regression Tests ────────────────────────────────────
// These tests verify that the ENDPOINT_REGISTRY classifications match the
// actual runtime wiring in wazuhRouter.ts. They read the source file and
// check whether each spot-checked procedure actually calls brokerParams().

describe("brokerCoverage — classification matches wazuhRouter.ts runtime", () => {
  let routerSource: string;
  let report: CoverageReport;

  beforeAll(() => {
    const routerPath = path.resolve(__dirname, "wazuhRouter.ts");
    routerSource = fs.readFileSync(routerPath, "utf-8");
    report = generateCoverageReport();
  });

  /**
   * Extract the query handler body for a given procedure name.
   * Looks for "procedureName:" or "procedureName :" and grabs text until the
   * next top-level procedure definition (pattern: /^\s+\w+:\s/m after the match).
   */
  function getProcedureBody(name: string): string {
    // Match the procedure definition start
    const regex = new RegExp(`\\b${name}:\\s`, "m");
    const match = regex.exec(routerSource);
    if (!match) return "";
    const start = match.index;
    // Find the next procedure definition (a word followed by colon at start of line after whitespace)
    const rest = routerSource.slice(start + match[0].length);
    // Look for the next top-level procedure: line starting with optional whitespace, then word + colon
    const nextProcMatch = /\n\s{2}\w+:\s(?:wazuhProcedure|protectedProcedure|adminProcedure)/m.exec(rest);
    const end = nextProcMatch ? start + match[0].length + nextProcMatch.index : start + 2000;
    return routerSource.slice(start, end);
  }

  // ── Broker-wired procedures: MUST contain brokerParams() call ──
  const expectedBroker: string[] = [
    "managerConfiguration",
    "managerLogs",
    "clusterNodes",
    "agents",
    "agentGroups",
    "agentsOutdated",
    "agentsNoGroup",
    "agentsStatsDistinct",
    "agentGroupMembers",
    "agentPackages",
    "agentPorts",
    "agentProcesses",
    "rules",
    "rulesFiles",
    "mitreTactics",
    "mitreTechniques",
    "scaPolicies",
    "scaChecks",
    "ciscatResults",
    "syscheckFiles",
    "rootcheckResults",
    "decoders",
    "decoderFiles",
    "decoderParents",
    "decoderFileContent",
    "taskStatus",
    "securityRoles",
    "securityPolicies",
    "securityUsers",
    "securityConfig",
    "securityCurrentUser",
    "securityRbacRules",
    "securityActions",
    "lists",
    "listsFiles",
    "clusterNodeConfiguration",
    "clusterNodeLogs",
    "expCiscatResults",
  ];

  for (const proc of expectedBroker) {
    it(`${proc} is classified as broker AND calls brokerParams() at runtime`, () => {
      const ep = report.endpoints.find(e => e.procedure === proc);
      expect(ep).toBeDefined();
      expect(ep!.wiringLevel).toBe("broker");

      const body = getProcedureBody(proc);
      expect(body).toBeTruthy();
      expect(body).toContain("brokerParams(");
    });
  }

  // ── Manual procedures: MUST NOT contain brokerParams() call ──
  const expectedManual: Array<{ proc: string; reason: string }> = [
    { proc: "managerStats", reason: "inline date param" },
    { proc: "daemonStats", reason: "inline daemons_list join" },
    { proc: "managerVersionCheck", reason: "inline force_query param" },
    { proc: "clusterHealthcheck", reason: "inline nodes_list join" },
    { proc: "clusterNodeStats", reason: "inline date param" },
    { proc: "clusterNodeDaemonStats", reason: "inline daemons_list join" },
    { proc: "agentsSummary", reason: "inline agents_list join" },
    { proc: "agentDaemonStats", reason: "inline daemons_list join" },
    { proc: "agentsUpgradeResult", reason: "inline 12-param assembly" },
    { proc: "ruleGroups", reason: "inline pagination + sort/search" },
    { proc: "rulesByRequirement", reason: "inline pagination + sort/search" },
    { proc: "ruleFileContent", reason: "inline raw + get_dirnames_path" },
    { proc: "groupConfiguration", reason: "inline pagination" },
    { proc: "groupFileContent", reason: "inline type_agents + raw" },
    { proc: "listsFileContent", reason: "inline raw param" },
    { proc: "securityResources", reason: "inline resource param" },
  ];

  for (const { proc, reason } of expectedManual) {
    it(`${proc} is classified as manual (${reason}) and does NOT call brokerParams()`, () => {
      const ep = report.endpoints.find(e => e.procedure === proc);
      expect(ep).toBeDefined();
      expect(ep!.wiringLevel).toBe("manual");

      const body = getProcedureBody(proc);
      expect(body).toBeTruthy();
      expect(body).not.toContain("brokerParams(");
    });
  }

  // ── Passthrough procedures: MUST NOT contain brokerParams() call ──
  const expectedPassthrough: string[] = [
    "status",
    "isConfigured",
    "managerInfo",
    "managerStatus",
    "managerConfigValidation",
    "statsHourly",
    "statsWeekly",
    "analysisd",
    "remoted",
    "managerLogsSummary",
    "managerApiConfig",
    "clusterStatus",
    "clusterLocalInfo",
    "clusterLocalConfig",
    "clusterRulesetSync",
    "clusterApiConfig",
    "clusterConfigValidation",
    "clusterNodeInfo",
    "clusterNodeStatsHourly",
    "clusterNodeStatus",
    "clusterNodeLogsSummary",
    "clusterNodeStatsAnalysisd",
    "clusterNodeStatsRemoted",
    "clusterNodeStatsWeekly",
    "agentSummaryStatus",
    "agentSummaryOs",
    "agentOverview",
    "agentsUninstallPermission",
    "apiInfo",
    "agentById",
    "agentStats",
    "agentConfig",
    "agentGroupSync",
    "mitreMetadata",
    "securityUserById",
    "securityRoleById",
    "securityPolicyById",
    "securityRuleById",
    "securityCurrentUserPolicies",
    "syscheckLastScan",
    "rootcheckLastScan",
  ];

  for (const proc of expectedPassthrough) {
    it(`${proc} is classified as passthrough and does NOT call brokerParams()`, () => {
      const ep = report.endpoints.find(e => e.procedure === proc);
      expect(ep).toBeDefined();
      expect(ep!.wiringLevel).toBe("passthrough");

      const body = getProcedureBody(proc);
      expect(body).toBeTruthy();
      expect(body).not.toContain("brokerParams(");
    });
  }
});
