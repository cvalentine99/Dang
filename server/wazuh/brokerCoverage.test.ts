import { describe, it, expect, beforeAll } from "vitest";
import { generateCoverageReport, type CoverageReport, type WiringLevel } from "./brokerCoverage";
import {
  brokerParams,
  EXPERIMENTAL_CISCAT_RESULTS_CONFIG,
  CISCAT_CONFIG,
  MANAGER_STATS_CONFIG,
  MANAGER_VERSION_CHECK_CONFIG,
  CLUSTER_HEALTHCHECK_CONFIG,
  CLUSTER_NODE_STATS_CONFIG,
  CLUSTER_NODE_DAEMON_STATS_CONFIG,
  AGENTS_SUMMARY_CONFIG,
  AGENT_DAEMON_STATS_CONFIG,
  RULE_GROUPS_CONFIG,
  RULES_BY_REQUIREMENT_CONFIG,
  GROUP_CONFIGURATION_CONFIG,
  LISTS_FILE_CONTENT_CONFIG,
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
    // Batch 1 promotion — manual → broker (11 endpoints)
    "managerStats",
    "managerVersionCheck",
    "clusterHealthcheck",
    "clusterNodeStats",
    "clusterNodeDaemonStats",
    "agentsSummary",
    "agentDaemonStats",
    "ruleGroups",
    "rulesByRequirement",
    "groupConfiguration",
    "listsFileContent",
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
  // After Batch 1 promotion, 5 manual endpoints remain (need alias additions or spec fixes)
  const expectedManual: Array<{ proc: string; reason: string }> = [
    { proc: "daemonStats", reason: "inline daemons_list join (input key mismatch: daemons vs daemons_list)" },
    { proc: "agentsUpgradeResult", reason: "inline 12-param assembly (needs os_* aliases)" },
    { proc: "ruleFileContent", reason: "inline raw + get_dirnames_path (param name mismatch)" },
    { proc: "groupFileContent", reason: "inline type_agents + raw (needs type_agents alias)" },
    { proc: "securityResources", reason: "inline resource param (outbound name mismatch)" },
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

// ── Registry ↔ Router Structural Parity Guard ────────────────────────────────
// This test detects drift between the tRPC router (wazuhRouter.ts) and the
// ENDPOINT_REGISTRY in brokerCoverage.ts. It catches two failure modes:
//   1. A new procedure is added to the router but NOT to the registry (missing)
//   2. A registry entry references a procedure that no longer exists (ghost)
//
// This is a STRUCTURAL guard — it only checks presence, not wiring level.
// Classification truth is verified by the tests above.

describe("brokerCoverage — registry ↔ router structural parity", () => {
  /**
   * Procedures in wazuhRouter.ts that are intentionally excluded from
   * ENDPOINT_REGISTRY because they are NOT Wazuh API proxy endpoints.
   *
   * Each exclusion must have a documented reason. If you add a new procedure
   * to the router and it IS a Wazuh API endpoint, add it to ENDPOINT_REGISTRY
   * instead of adding it here.
   */
  const INTENTIONALLY_EXCLUDED = new Set([
    // ── Meta / infrastructure procedures (not Wazuh API proxies) ──
    "brokerCoverage",   // Returns broker coverage analysis report
    "brokerPlayground", // Dev tool for testing broker param configs
    "brokerConfigList", // Returns list of broker configs for UI

    // ── Cache management procedures (internal plumbing, not Wazuh API) ──
    "cacheStats",       // Returns request cache statistics
    "cacheClear",       // Clears the request cache (mutation)
    "cacheSetTtl",      // Sets cache TTL (mutation)
    "cacheSetEnabled",  // Enables/disables cache (mutation)

    // ── Sensitive admin-only procedures (special handling, not standard reads) ──
    "agentKey",         // Reveals agent registration key; admin-only with audit trail

    // ── Auth-related procedures (not standard Wazuh data endpoints) ──
    "securityTokenInfo", // GET /security/user/authenticate — token introspection
  ]);

  let routerProcedures: Set<string>;
  let registryProcedures: Set<string>;

  beforeAll(() => {
    // Extract procedure names from wazuhRouter.ts source using regex.
    // Pattern: "  procedureName: wazuhProcedure|protectedProcedure|adminProcedure"
    const routerPath = path.resolve(__dirname, "wazuhRouter.ts");
    const routerSource = fs.readFileSync(routerPath, "utf-8");

    const procedurePattern = /^\s{2}(\w+):\s+(?:wazuhProcedure|protectedProcedure|adminProcedure)/gm;
    routerProcedures = new Set<string>();
    let match;
    while ((match = procedurePattern.exec(routerSource)) !== null) {
      routerProcedures.add(match[1]);
    }

    // Extract procedure names from the coverage report (which reads ENDPOINT_REGISTRY)
    const report = generateCoverageReport();
    registryProcedures = new Set(report.endpoints.map(e => e.procedure));
  });

  it("discovers a reasonable number of router procedures", () => {
    // Sanity check: the router should have many procedures. If this fails,
    // the regex pattern may need updating to match a new procedure style.
    expect(routerProcedures.size).toBeGreaterThan(80);
  });

  it("registry has a reasonable number of entries", () => {
    expect(registryProcedures.size).toBeGreaterThan(80);
  });

  it("every router procedure is either in the registry or intentionally excluded", () => {
    const missing: string[] = [];
    for (const proc of routerProcedures) {
      if (!registryProcedures.has(proc) && !INTENTIONALLY_EXCLUDED.has(proc)) {
        missing.push(proc);
      }
    }

    if (missing.length > 0) {
      throw new Error(
        `${missing.length} router procedure(s) missing from ENDPOINT_REGISTRY in brokerCoverage.ts:\n` +
        missing.map(p => `  - ${p}`).join("\n") +
        "\n\nIf this is a Wazuh API endpoint, add it to ENDPOINT_REGISTRY.\n" +
        "If it is NOT a Wazuh API endpoint (meta, cache, admin), add it to INTENTIONALLY_EXCLUDED in this test."
      );
    }
  });

  it("every registry entry corresponds to an actual router procedure", () => {
    const ghosts: string[] = [];
    for (const proc of registryProcedures) {
      if (!routerProcedures.has(proc)) {
        ghosts.push(proc);
      }
    }

    if (ghosts.length > 0) {
      throw new Error(
        `${ghosts.length} ghost entry/entries in ENDPOINT_REGISTRY — procedure(s) not found in wazuhRouter.ts:\n` +
        ghosts.map(p => `  - ${p}`).join("\n") +
        "\n\nRemove these from ENDPOINT_REGISTRY or re-add the procedures to the router."
      );
    }
  });

  it("every intentionally excluded procedure actually exists in the router", () => {
    // Guard against stale exclusions — if an excluded procedure is removed
    // from the router, the exclusion should be removed too.
    const stale: string[] = [];
    for (const proc of INTENTIONALLY_EXCLUDED) {
      if (!routerProcedures.has(proc)) {
        stale.push(proc);
      }
    }

    if (stale.length > 0) {
      throw new Error(
        `${stale.length} stale exclusion(s) — procedure(s) no longer exist in wazuhRouter.ts:\n` +
        stale.map(p => `  - ${p}`).join("\n") +
        "\n\nRemove these from INTENTIONALLY_EXCLUDED."
      );
    }
  });

  it("no intentionally excluded procedure is also in the registry (double-entry)", () => {
    // If a procedure is both excluded AND in the registry, something is wrong.
    const doubleEntries: string[] = [];
    for (const proc of INTENTIONALLY_EXCLUDED) {
      if (registryProcedures.has(proc)) {
        doubleEntries.push(proc);
      }
    }

    if (doubleEntries.length > 0) {
      throw new Error(
        `${doubleEntries.length} procedure(s) are both in INTENTIONALLY_EXCLUDED and ENDPOINT_REGISTRY:\n` +
        doubleEntries.map(p => `  - ${p}`).join("\n") +
        "\n\nRemove from INTENTIONALLY_EXCLUDED if it belongs in the registry, or vice versa."
      );
    }
  });
});

// ── Batch 1 Promotion Verification ─────────────────────────────────────────
// These tests verify that the 11 endpoints promoted in Batch 1 are:
//   1. Classified as "broker" in ENDPOINT_REGISTRY
//   2. Have the correct brokerConfig name
//   3. Actually call brokerParams() in wazuhRouter.ts
//   4. Route params through the broker correctly

describe("Batch 1 promotion — manual → broker (11 endpoints)", () => {
  let report: CoverageReport;
  let routerSource: string;

  beforeAll(() => {
    report = generateCoverageReport();
    const routerPath = path.resolve(__dirname, "wazuhRouter.ts");
    routerSource = fs.readFileSync(routerPath, "utf-8");
  });

  const batch1Endpoints: Array<{
    procedure: string;
    brokerConfig: string;
    configRef: import("./paramBroker").EndpointParamConfig;
    wazuhPath: string;
  }> = [
    { procedure: "managerStats", brokerConfig: "MANAGER_STATS_CONFIG", configRef: MANAGER_STATS_CONFIG, wazuhPath: "/manager/stats" },
    { procedure: "managerVersionCheck", brokerConfig: "MANAGER_VERSION_CHECK_CONFIG", configRef: MANAGER_VERSION_CHECK_CONFIG, wazuhPath: "/manager/version/check" },
    { procedure: "clusterHealthcheck", brokerConfig: "CLUSTER_HEALTHCHECK_CONFIG", configRef: CLUSTER_HEALTHCHECK_CONFIG, wazuhPath: "/cluster/healthcheck" },
    { procedure: "clusterNodeStats", brokerConfig: "CLUSTER_NODE_STATS_CONFIG", configRef: CLUSTER_NODE_STATS_CONFIG, wazuhPath: "/cluster/{node_id}/stats" },
    { procedure: "clusterNodeDaemonStats", brokerConfig: "CLUSTER_NODE_DAEMON_STATS_CONFIG", configRef: CLUSTER_NODE_DAEMON_STATS_CONFIG, wazuhPath: "/cluster/{node_id}/daemons/stats" },
    { procedure: "agentsSummary", brokerConfig: "AGENTS_SUMMARY_CONFIG", configRef: AGENTS_SUMMARY_CONFIG, wazuhPath: "/agents/summary" },
    { procedure: "agentDaemonStats", brokerConfig: "AGENT_DAEMON_STATS_CONFIG", configRef: AGENT_DAEMON_STATS_CONFIG, wazuhPath: "/agents/{agent_id}/daemons/stats" },
    { procedure: "ruleGroups", brokerConfig: "RULE_GROUPS_CONFIG", configRef: RULE_GROUPS_CONFIG, wazuhPath: "/rules/groups" },
    { procedure: "rulesByRequirement", brokerConfig: "RULES_BY_REQUIREMENT_CONFIG", configRef: RULES_BY_REQUIREMENT_CONFIG, wazuhPath: "/rules/requirement/{requirement}" },
    { procedure: "groupConfiguration", brokerConfig: "GROUP_CONFIGURATION_CONFIG", configRef: GROUP_CONFIGURATION_CONFIG, wazuhPath: "/groups/{group_id}/configuration" },
    { procedure: "listsFileContent", brokerConfig: "LISTS_FILE_CONTENT_CONFIG", configRef: LISTS_FILE_CONTENT_CONFIG, wazuhPath: "/lists/files/{filename}" },
  ];

  for (const ep of batch1Endpoints) {
    describe(ep.procedure, () => {
      it("is classified as broker in ENDPOINT_REGISTRY", () => {
        const entry = report.endpoints.find(e => e.procedure === ep.procedure);
        expect(entry).toBeDefined();
        expect(entry!.wiringLevel).toBe("broker");
      });

      it(`has brokerConfig = ${ep.brokerConfig}`, () => {
        const entry = report.endpoints.find(e => e.procedure === ep.procedure);
        expect(entry!.brokerConfig).toBe(ep.brokerConfig);
      });

      it("calls brokerParams() in wazuhRouter.ts", () => {
        const regex = new RegExp(`\\b${ep.procedure}:\\s`, "m");
        const match = regex.exec(routerSource);
        expect(match).toBeTruthy();
        const start = match!.index;
        const rest = routerSource.slice(start + match![0].length);
        const nextProc = /\n\s{2}\w+:\s(?:wazuhProcedure|protectedProcedure|adminProcedure)/m.exec(rest);
        const body = routerSource.slice(start, nextProc ? start + match![0].length + nextProc.index : start + 2000);
        expect(body).toContain("brokerParams(");
      });

      it("broker config endpoint matches registry wazuhPath", () => {
        expect(ep.configRef.endpoint).toBe(ep.wazuhPath);
      });
    });
  }

  // ── Structural guard: registry broker label requires real brokerParams() call ──
  it("every broker-labeled endpoint actually calls brokerParams() in the router", () => {
    const brokerEndpoints = report.endpoints.filter(e => e.wiringLevel === "broker");
    const failures: string[] = [];

    for (const ep of brokerEndpoints) {
      const regex = new RegExp(`\\b${ep.procedure}:\\s`, "m");
      const match = regex.exec(routerSource);
      if (!match) {
        failures.push(`${ep.procedure}: procedure not found in router source`);
        continue;
      }
      const start = match.index;
      const rest = routerSource.slice(start + match[0].length);
      const nextProc = /\n\s{2}\w+:\s(?:wazuhProcedure|protectedProcedure|adminProcedure)/m.exec(rest);
      const body = routerSource.slice(start, nextProc ? start + match[0].length + nextProc.index : start + 2000);
      if (!body.includes("brokerParams(")) {
        failures.push(`${ep.procedure}: labeled broker but does NOT call brokerParams()`);
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `${failures.length} endpoint(s) labeled "broker" without a real brokerParams() callsite:\n` +
        failures.map(f => `  - ${f}`).join("\n") +
        "\n\nDo not relabel an endpoint as broker until the router actually calls brokerParams()."
      );
    }
  });

  it("coverage counts reflect Batch 1 promotion: 73 broker, 5 manual, 43 passthrough", () => {
    expect(report.brokerWired).toBe(73);
    expect(report.manualParam).toBe(5);
    expect(report.passthrough).toBe(43);
    expect(report.totalProcedures).toBe(121);
  });
});

// ── Anti-Drift Guard: brokerParams forwarding contract for Batch 1 configs ──

describe("Batch 1 — brokerParams forwarding contract", () => {
  it("MANAGER_STATS_CONFIG forwards date param", () => {
    const result = brokerParams(MANAGER_STATS_CONFIG, { date: "2026-03-15" });
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.forwardedQuery.date).toBe("2026-03-15");
  });

  it("MANAGER_VERSION_CHECK_CONFIG forwards force_query param", () => {
    const result = brokerParams(MANAGER_VERSION_CHECK_CONFIG, { force_query: true });
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.forwardedQuery.force_query).toBe("true");
  });

  it("CLUSTER_HEALTHCHECK_CONFIG forwards nodes_list as csv", () => {
    const result = brokerParams(CLUSTER_HEALTHCHECK_CONFIG, { nodes_list: ["node1", "node2"] });
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.forwardedQuery.nodes_list).toBe("node1,node2");
  });

  it("CLUSTER_NODE_STATS_CONFIG forwards date param", () => {
    const result = brokerParams(CLUSTER_NODE_STATS_CONFIG, { date: "2026-03-15" });
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.forwardedQuery.date).toBe("2026-03-15");
  });

  it("CLUSTER_NODE_DAEMON_STATS_CONFIG forwards daemons_list as csv", () => {
    const result = brokerParams(CLUSTER_NODE_DAEMON_STATS_CONFIG, { daemons_list: ["wazuh-modulesd", "wazuh-analysisd"] });
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.forwardedQuery.daemons_list).toBe("wazuh-modulesd,wazuh-analysisd");
  });

  it("AGENTS_SUMMARY_CONFIG forwards agents_list as csv", () => {
    const result = brokerParams(AGENTS_SUMMARY_CONFIG, { agents_list: ["001", "002"] });
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.forwardedQuery.agents_list).toBe("001,002");
  });

  it("AGENT_DAEMON_STATS_CONFIG forwards daemons_list as csv", () => {
    const result = brokerParams(AGENT_DAEMON_STATS_CONFIG, { daemons_list: "wazuh-modulesd" });
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.forwardedQuery.daemons_list).toBe("wazuh-modulesd");
  });

  it("RULE_GROUPS_CONFIG forwards pagination and sort/search", () => {
    const result = brokerParams(RULE_GROUPS_CONFIG, { offset: 0, limit: 50, sort: "+name", search: "web" });
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.forwardedQuery.offset).toBe("0");
    expect(result.forwardedQuery.limit).toBe("50");
    expect(result.forwardedQuery.sort).toBe("+name");
    expect(result.forwardedQuery.search).toBe("web");
  });

  it("RULES_BY_REQUIREMENT_CONFIG forwards pagination and sort/search", () => {
    const result = brokerParams(RULES_BY_REQUIREMENT_CONFIG, { offset: 10, limit: 25, sort: "-level", search: "pci" });
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.forwardedQuery.offset).toBe("10");
    expect(result.forwardedQuery.limit).toBe("25");
    expect(result.forwardedQuery.sort).toBe("-level");
    expect(result.forwardedQuery.search).toBe("pci");
  });

  it("GROUP_CONFIGURATION_CONFIG forwards pagination", () => {
    const result = brokerParams(GROUP_CONFIGURATION_CONFIG, { offset: 0, limit: 100 });
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.forwardedQuery.offset).toBe("0");
    expect(result.forwardedQuery.limit).toBe("100");
  });

  it("LISTS_FILE_CONTENT_CONFIG forwards raw param", () => {
    const result = brokerParams(LISTS_FILE_CONTENT_CONFIG, { raw: true });
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.forwardedQuery.raw).toBe("true");
  });

  it("LISTS_FILE_CONTENT_CONFIG omits raw when false (flag semantics)", () => {
    const result = brokerParams(LISTS_FILE_CONTENT_CONFIG, { raw: false });
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.forwardedQuery).not.toHaveProperty("raw");
  });

  it("all Batch 1 configs reject unsupported params", () => {
    const configs = [
      MANAGER_STATS_CONFIG, MANAGER_VERSION_CHECK_CONFIG, CLUSTER_HEALTHCHECK_CONFIG,
      CLUSTER_NODE_STATS_CONFIG, CLUSTER_NODE_DAEMON_STATS_CONFIG, AGENTS_SUMMARY_CONFIG,
      AGENT_DAEMON_STATS_CONFIG, RULE_GROUPS_CONFIG, RULES_BY_REQUIREMENT_CONFIG,
      GROUP_CONFIGURATION_CONFIG, LISTS_FILE_CONTENT_CONFIG,
    ];
    for (const config of configs) {
      const result = brokerParams(config, { bogus_param: "test" });
      expect(result.unsupportedParams).toContain("bogus_param");
      expect(result.forwardedQuery).not.toHaveProperty("bogus_param");
    }
  });
});
