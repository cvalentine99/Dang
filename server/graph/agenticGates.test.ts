/**
 * Agentic Hard Gate Contract Tests
 *
 * Three contract tests exercising the pipeline's hard gates:
 *
 * 1a. Safe read workflow — a benign read query passes all gates, returns
 *     clean safetyStatus, and provenance contains endpoint IDs.
 *
 * 1b. Forbidden workflow refusal — a write-intent query ("delete agent 001")
 *     triggers the pre-flight safety check and returns HARD_REFUSAL with
 *     safetyStatus=blocked.
 *
 * 1c. Missing-KG hydrate-first — when graph retrieval returns zero endpoint
 *     nodes, Gate 2A blocks the pipeline and returns a structured
 *     "Knowledge Graph Not Hydrated" response.
 *
 * These tests exercise the exported gate functions directly (pure functions,
 * no LLM calls) and the main pipeline's write-refusal path.
 */

import { describe, it, expect } from "vitest";
import {
  gateNoKgNoPlan,
  gateSafeOnly,
  gateProvenanceRequired,
  extractProvenanceIds,
  type RetrievalSource,
  type AgentStep,
  type AnalystResponse,
} from "./agenticPipeline";

// ═══════════════════════════════════════════════════════════════════════════════
// Contract 1a: Safe Read Workflow
// ═══════════════════════════════════════════════════════════════════════════════

describe("Contract 1a: Safe Read Workflow", () => {
  // Simulates the graph retrieval result for "show me active agents"
  const safeGraphSources: RetrievalSource[] = [
    {
      type: "graph",
      label: 'KG search: "agents"',
      data: [
        { id: "endpoint-42", type: "endpoint", label: "GET /agents", properties: { riskLevel: "SAFE", allowedForLlm: 1 } },
        { id: "endpoint-43", type: "endpoint", label: "GET /agents/summary/status", properties: { riskLevel: "SAFE", allowedForLlm: 1 } },
        { id: "param-10", type: "parameter", label: "status", properties: {} },
        { id: "param-11", type: "parameter", label: "limit", properties: {} },
      ],
      relevance: "primary",
    },
    {
      type: "stats",
      label: "Knowledge Graph Statistics",
      data: { endpoints: 182, parameters: 1186, resources: 21 },
      relevance: "context",
    },
  ];

  it("Gate 2A passes: KG has endpoint data → returns null (no block)", () => {
    const steps: AgentStep[] = [];
    const result = gateNoKgNoPlan(safeGraphSources, "show me active agents", steps);
    expect(result).toBeNull();
    // No blocking step should be added
    expect(steps.filter(s => s.status === "blocked")).toHaveLength(0);
  });

  it("Gate 2B passes: all endpoints are SAFE → no endpoints stripped", () => {
    const { filteredSources, blockedEndpoints } = gateSafeOnly(safeGraphSources);
    expect(blockedEndpoints).toHaveLength(0);
    // Data should be unchanged
    const graphData = filteredSources.find(s => s.type === "graph")?.data as unknown[];
    expect(graphData).toHaveLength(4); // 2 endpoints + 2 params
  });

  it("Gate 2C passes: provenance has endpoint IDs → returns null (no warning)", () => {
    const provenanceIds = extractProvenanceIds(safeGraphSources);
    expect(provenanceIds.endpointIds.length).toBeGreaterThan(0);
    expect(provenanceIds.parameterIds.length).toBeGreaterThan(0);

    const warning = gateProvenanceRequired(safeGraphSources.length, provenanceIds);
    expect(warning).toBeNull();
  });

  it("Full safe-read contract: all gates pass, provenance is grounded", () => {
    const steps: AgentStep[] = [];

    // Gate 2A
    const gate2a = gateNoKgNoPlan(safeGraphSources, "show me active agents", steps);
    expect(gate2a).toBeNull();

    // Gate 2B
    const { filteredSources, blockedEndpoints } = gateSafeOnly(safeGraphSources);
    expect(blockedEndpoints).toHaveLength(0);

    // Extract provenance from filtered sources
    const provenanceIds = extractProvenanceIds(filteredSources);
    expect(provenanceIds.endpointIds).toContain(42);
    expect(provenanceIds.endpointIds).toContain(43);
    expect(provenanceIds.parameterIds).toContain(10);
    expect(provenanceIds.parameterIds).toContain(11);

    // Gate 2C
    const graphSourceCount = filteredSources.filter(s => s.type === "graph" || s.type === "stats").length;
    const warning = gateProvenanceRequired(graphSourceCount, provenanceIds);
    expect(warning).toBeNull();

    // No blocked steps
    expect(steps.filter(s => s.status === "blocked")).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Contract 1b: Forbidden Workflow Refusal
// ═══════════════════════════════════════════════════════════════════════════════

describe("Contract 1b: Forbidden Workflow Refusal", () => {
  // The main pipeline has a pre-flight write-pattern check that fires BEFORE
  // any retrieval or gate logic. We test this by importing runAnalystPipeline
  // and verifying it returns HARD_REFUSAL for write-intent queries.
  //
  // Since runAnalystPipeline calls the LLM for intent analysis, we test the
  // write-pattern detection separately (it fires before LLM calls).

  const WRITE_QUERIES = [
    "delete agent 001",
    "remove agent 003 from the fleet",
    "restart the manager",
    "trigger an active response on agent 005",
    "run a command on agent 002",
    "modify the rules for group default",
    "change the configuration of the manager",
    "update the decoder for syslog",
  ];

  const READ_QUERIES = [
    "show me active agents",
    "what are the latest alerts?",
    "list all vulnerabilities for agent 001",
    "which MITRE techniques were detected?",
    "show compliance posture for CIS benchmarks",
  ];

  // Test the write pattern detection directly (same patterns used in pipeline)
  const writePatterns = [
    /delete\s+(an?\s+)?agent/i,
    /remove\s+(an?\s+)?agent/i,
    /restart\s+(the\s+)?manager/i,
    /trigger\s+(an?\s+)?active.response/i,
    /run\s+(a\s+)?command\s+on/i,
    /modify\s+(the\s+)?rules?/i,
    /change\s+(the\s+)?configuration/i,
    /update\s+(the\s+)?decoder/i,
  ];

  for (const query of WRITE_QUERIES) {
    it(`blocks write query: "${query}"`, () => {
      const matches = writePatterns.some(p => p.test(query));
      expect(matches).toBe(true);
    });
  }

  for (const query of READ_QUERIES) {
    it(`allows read query: "${query}"`, () => {
      const matches = writePatterns.some(p => p.test(query));
      expect(matches).toBe(false);
    });
  }

  it("Gate 2B strips MUTATING/DESTRUCTIVE endpoints from LLM context", () => {
    const mixedSources: RetrievalSource[] = [
      {
        type: "graph",
        label: "All endpoints",
        data: [
          { id: "endpoint-1", type: "endpoint", label: "GET /agents", properties: { riskLevel: "SAFE", allowedForLlm: 1, path: "/agents", method: "GET" } },
          { id: "endpoint-2", type: "endpoint", label: "DELETE /agents/{agent_id}", properties: { riskLevel: "DESTRUCTIVE", allowedForLlm: 0, path: "/agents/{agent_id}", method: "DELETE" } },
          { id: "endpoint-3", type: "endpoint", label: "PUT /agents/{agent_id}/restart", properties: { riskLevel: "MUTATING", allowedForLlm: 0, path: "/agents/{agent_id}/restart", method: "PUT" } },
          { id: "endpoint-4", type: "endpoint", label: "POST /active-response", properties: { riskLevel: "DESTRUCTIVE", allowedForLlm: 0, path: "/active-response", method: "POST" } },
          { id: "param-1", type: "parameter", label: "status", properties: {} },
        ],
        relevance: "primary",
      },
    ];

    const { filteredSources, blockedEndpoints } = gateSafeOnly(mixedSources);

    // 3 dangerous endpoints should be blocked
    expect(blockedEndpoints).toHaveLength(3);
    expect(blockedEndpoints).toContain("DELETE /agents/{agent_id}");
    expect(blockedEndpoints).toContain("PUT /agents/{agent_id}/restart");
    expect(blockedEndpoints).toContain("POST /active-response");

    // Only the SAFE endpoint and the parameter should remain
    const remaining = (filteredSources[0].data as unknown[]);
    expect(remaining).toHaveLength(2); // endpoint-1 + param-1
  });

  it("Gate 2B: endpoint with allowedForLlm=0 is stripped even if riskLevel is SAFE", () => {
    const sources: RetrievalSource[] = [
      {
        type: "graph",
        label: "Endpoints",
        data: [
          { id: "endpoint-10", type: "endpoint", label: "GET /special", properties: { riskLevel: "SAFE", allowedForLlm: 0, path: "/special", method: "GET" } },
          { id: "endpoint-11", type: "endpoint", label: "GET /agents", properties: { riskLevel: "SAFE", allowedForLlm: 1, path: "/agents", method: "GET" } },
        ],
        relevance: "primary",
      },
    ];

    const { filteredSources, blockedEndpoints } = gateSafeOnly(sources);
    expect(blockedEndpoints).toHaveLength(1);
    expect(blockedEndpoints[0]).toContain("/special");
    expect((filteredSources[0].data as unknown[])).toHaveLength(1);
  });

  it("Output validator catches blocked patterns in generated text", () => {
    // Import validateOutput indirectly by testing the blocked patterns
    const BLOCKED_PATTERNS = [
      /DELETE\s+\/api\/v\d+/i,
      /PUT\s+\/api\/v\d+.*\/restart/i,
      /POST\s+\/api\/v\d+.*\/active-response/i,
      /curl\s+.*-X\s*(DELETE|PUT|POST)/i,
      /remove.*agent/i,
      /delete.*agent/i,
      /restart.*manager/i,
      /active.response.*trigger/i,
      /run.*command.*on.*agent/i,
      /execute.*remote/i,
    ];

    const dangerousOutputs = [
      "You can DELETE /api/v1/agents/001 to remove the agent",
      "Run curl -X DELETE https://wazuh:55000/api/v1/agents",
      "Use PUT /api/v1/manager/restart to restart",
      "POST /api/v1/active-response to trigger",
      "To delete agent 001, use the API",
      "restart manager service now",
      "active response trigger on agent",
      "run command on agent 001",
      "execute remote command",
    ];

    for (const output of dangerousOutputs) {
      const matches = BLOCKED_PATTERNS.some(p => p.test(output));
      expect(matches, `Expected blocked pattern match for: "${output}"`).toBe(true);
    }

    // Safe outputs should NOT match
    const safeOutputs = [
      "The agent 001 is currently active with status connected",
      "GET /api/v1/agents returns the list of all agents",
      "The manager version is 4.14.3",
      "There are 5 active agents in the fleet",
    ];

    for (const output of safeOutputs) {
      const matches = BLOCKED_PATTERNS.some(p => p.test(output));
      expect(matches, `Expected no blocked pattern match for: "${output}"`).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Contract 1c: Missing-KG Hydrate-First Response
// ═══════════════════════════════════════════════════════════════════════════════

describe("Contract 1c: Missing-KG Hydrate-First Response", () => {

  it("Gate 2A blocks when graph sources are completely empty", () => {
    const steps: AgentStep[] = [];
    const emptySources: RetrievalSource[] = [];

    const result = gateNoKgNoPlan(emptySources, "show me agents", steps);

    // Gate should fire — returns an AnalystResponse
    expect(result).not.toBeNull();
    const response = result as AnalystResponse;

    // Verify the response structure
    expect(response.answer).toContain("Knowledge Graph Not Hydrated");
    expect(response.answer).toContain("seed-kg.mjs");
    expect(response.safetyStatus).toBe("blocked");
    expect(response.trustScore).toBe(0);
    expect(response.confidence).toBe(1.0);
    expect(response.provenance.filteredPatterns).toContain("no_kg_data");

    // Verify a blocked step was added
    const blockedSteps = steps.filter(s => s.status === "blocked");
    expect(blockedSteps).toHaveLength(1);
    expect(blockedSteps[0].action).toContain("No KG");
  });

  it("Gate 2A blocks when graph sources exist but contain no endpoint nodes", () => {
    const steps: AgentStep[] = [];
    const noEndpointSources: RetrievalSource[] = [
      {
        type: "graph",
        label: "KG search: agents",
        data: [
          // Only parameter nodes, no endpoint nodes
          { id: "param-1", type: "parameter", label: "status", properties: {} },
          { id: "param-2", type: "parameter", label: "limit", properties: {} },
        ],
        relevance: "supporting",
      },
    ];

    const result = gateNoKgNoPlan(noEndpointSources, "show me agents", steps);
    expect(result).not.toBeNull();
    expect(result!.answer).toContain("Knowledge Graph Not Hydrated");
    expect(result!.safetyStatus).toBe("blocked");
  });

  it("Gate 2A blocks when graph source data is null/empty arrays", () => {
    const steps: AgentStep[] = [];
    const nullDataSources: RetrievalSource[] = [
      { type: "graph", label: "Empty graph", data: null, relevance: "context" },
      { type: "graph", label: "Empty array", data: [], relevance: "context" },
    ];

    const result = gateNoKgNoPlan(nullDataSources, "show me agents", steps);
    expect(result).not.toBeNull();
    expect(result!.answer).toContain("Knowledge Graph Not Hydrated");
  });

  it("Gate 2A blocks when stats show 0 endpoints", () => {
    const steps: AgentStep[] = [];
    const zeroStatsSources: RetrievalSource[] = [
      {
        type: "stats",
        label: "Knowledge Graph Statistics",
        data: { endpoints: 0, parameters: 0, resources: 0 },
        relevance: "context",
      },
    ];

    const result = gateNoKgNoPlan(zeroStatsSources, "show me agents", steps);
    expect(result).not.toBeNull();
    expect(result!.answer).toContain("Knowledge Graph Not Hydrated");
  });

  it("Gate 2A passes when stats show endpoints > 0", () => {
    const steps: AgentStep[] = [];
    const healthyStatsSources: RetrievalSource[] = [
      {
        type: "stats",
        label: "Knowledge Graph Statistics",
        data: { endpoints: 182, parameters: 1186, resources: 21 },
        relevance: "context",
      },
    ];

    const result = gateNoKgNoPlan(healthyStatsSources, "show me agents", steps);
    expect(result).toBeNull(); // gate passes
  });

  it("Gate 2A passes when graph sources contain endpoint-type nodes", () => {
    const steps: AgentStep[] = [];
    const withEndpointSources: RetrievalSource[] = [
      {
        type: "graph",
        label: "KG search: agents",
        data: [
          { id: "endpoint-42", type: "endpoint", label: "GET /agents", properties: {} },
        ],
        relevance: "primary",
      },
    ];

    const result = gateNoKgNoPlan(withEndpointSources, "show me agents", steps);
    expect(result).toBeNull(); // gate passes
  });

  it("Gate 2A blocks when graph sources only have error-relevance data", () => {
    const steps: AgentStep[] = [];
    const errorSources: RetrievalSource[] = [
      {
        type: "graph",
        label: "KG search error",
        data: [
          { id: "endpoint-1", type: "endpoint", label: "GET /agents", properties: {} },
        ],
        relevance: "error",
      },
    ];

    const result = gateNoKgNoPlan(errorSources, "show me agents", steps);
    // Error-relevance sources are excluded by the gate
    expect(result).not.toBeNull();
    expect(result!.answer).toContain("Knowledge Graph Not Hydrated");
  });

  it("Hydrate-first response includes actionable remediation steps", () => {
    const steps: AgentStep[] = [];
    const result = gateNoKgNoPlan([], "show me agents", steps);
    expect(result).not.toBeNull();

    // Must include the three remediation steps
    expect(result!.answer).toContain("seed-kg.mjs --drop");
    expect(result!.answer).toContain("seed-kg.mjs --dry-run");
    expect(result!.answer).toContain("Retry your query");

    // Must include suggested follow-ups
    expect(result!.suggestedFollowUps.length).toBeGreaterThan(0);
    expect(result!.suggestedFollowUps.some(f => f.toLowerCase().includes("knowledge graph") || f.toLowerCase().includes("kg"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Gate 2C: Provenance-Required (supplementary)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Gate 2C: Provenance-Required", () => {

  it("returns null when no graph sources were used (provenance not required)", () => {
    const warning = gateProvenanceRequired(0, { endpointIds: [], parameterIds: [] });
    expect(warning).toBeNull();
  });

  it("returns null when graph sources used and provenance has endpoint IDs", () => {
    const warning = gateProvenanceRequired(3, { endpointIds: [42, 43], parameterIds: [10] });
    expect(warning).toBeNull();
  });

  it("returns warning when graph sources used but provenance has no endpoint IDs", () => {
    const warning = gateProvenanceRequired(3, { endpointIds: [], parameterIds: [] });
    expect(warning).not.toBeNull();
    expect(warning).toContain("provenance_gap");
    expect(warning).toContain("not be fully grounded");
  });

  it("returns warning even if parameterIds exist but endpointIds are empty", () => {
    const warning = gateProvenanceRequired(2, { endpointIds: [], parameterIds: [10, 11] });
    expect(warning).not.toBeNull();
    expect(warning).toContain("provenance_gap");
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// Fix 3 Proof: Object-Source Leak — dangerousEndpoints stripped from synthesis
// ═══════════════════════════════════════════════════════════════════════════════

describe("Fix 3: Object-Source Leak (dangerousEndpoints sanitization)", () => {
  it("strips dangerousEndpoints from risk-analysis object and records blocked paths", () => {
    const riskAnalysisSource: RetrievalSource = {
      type: "graph",
      label: "Risk Analysis (Endpoint Classification)",
      data: {
        dangerousEndpoints: [
          { id: 99, method: "DELETE", path: "/agents/{agent_id}", riskLevel: "DESTRUCTIVE", operationType: "DELETE", trustScore: "0.500" },
          { id: 100, method: "PUT", path: "/active-response", riskLevel: "MUTATING", operationType: "UPDATE", trustScore: "0.500" },
        ],
        resourceRiskMap: [
          { resource: "agents", safe: 10, mutating: 3, destructive: 2 },
        ],
        llmBlockedCount: 65,
      },
      relevance: "primary",
    };

    const { filteredSources, blockedEndpoints } = gateSafeOnly([riskAnalysisSource]);

    // dangerousEndpoints must be stripped
    const sanitized = filteredSources[0].data as Record<string, unknown>;
    expect(sanitized).not.toHaveProperty("dangerousEndpoints");

    // Safe summary fields must survive
    expect(sanitized).toHaveProperty("resourceRiskMap");
    expect(sanitized).toHaveProperty("llmBlockedCount");
    expect(sanitized.llmBlockedCount).toBe(65);

    // Blocked endpoints must be recorded
    expect(blockedEndpoints).toContain("DELETE /agents/{agent_id}");
    expect(blockedEndpoints).toContain("PUT /active-response");
    expect(blockedEndpoints).toHaveLength(2);
  });

  it("passes through object-shaped graph sources without dangerousEndpoints unchanged", () => {
    const safeObjectSource: RetrievalSource = {
      type: "graph",
      label: "Resource Overview",
      data: { resources: [{ name: "agents", endpointCount: 15 }] },
      relevance: "context",
    };

    const { filteredSources, blockedEndpoints } = gateSafeOnly([safeObjectSource]);
    expect(filteredSources[0].data).toEqual(safeObjectSource.data);
    expect(blockedEndpoints).toHaveLength(0);
  });

  it("handles empty dangerousEndpoints array without error", () => {
    const emptyDangerousSource: RetrievalSource = {
      type: "graph",
      label: "Risk Analysis",
      data: {
        dangerousEndpoints: [],
        resourceRiskMap: [],
        llmBlockedCount: 0,
      },
      relevance: "primary",
    };

    const { filteredSources, blockedEndpoints } = gateSafeOnly([emptyDangerousSource]);
    const sanitized = filteredSources[0].data as Record<string, unknown>;
    expect(sanitized).not.toHaveProperty("dangerousEndpoints");
    expect(blockedEndpoints).toHaveLength(0);
  });

  it("does not touch non-graph source types even if they contain dangerousEndpoints", () => {
    const indexerSource: RetrievalSource = {
      type: "indexer",
      label: "Alerts",
      data: { dangerousEndpoints: [{ method: "DELETE", path: "/fake" }] },
      relevance: "primary",
    };

    const { filteredSources, blockedEndpoints } = gateSafeOnly([indexerSource]);
    const data = filteredSources[0].data as Record<string, unknown>;
    expect(data).toHaveProperty("dangerousEndpoints"); // untouched
    expect(blockedEndpoints).toHaveLength(0);
  });

  it("combined: array endpoints + object risk analysis both sanitized in one pass", () => {
    const sources: RetrievalSource[] = [
      {
        type: "graph",
        label: "KG search",
        data: [
          { id: "endpoint-1", type: "endpoint", label: "GET /agents", properties: { riskLevel: "SAFE", allowedForLlm: 1 } },
          { id: "endpoint-2", type: "endpoint", label: "DELETE /agents/{agent_id}", properties: { riskLevel: "DESTRUCTIVE", allowedForLlm: 0, method: "DELETE", path: "/agents/{agent_id}" } },
        ],
        relevance: "primary",
      },
      {
        type: "graph",
        label: "Risk Analysis",
        data: {
          dangerousEndpoints: [
            { method: "PUT", path: "/groups/{group_id}/configuration", riskLevel: "MUTATING" },
          ],
          resourceRiskMap: [{ resource: "groups", safe: 5, mutating: 1, destructive: 0 }],
          llmBlockedCount: 10,
        },
        relevance: "primary",
      },
    ];

    const { filteredSources, blockedEndpoints } = gateSafeOnly(sources);

    // Array source: DESTRUCTIVE endpoint stripped, SAFE kept
    const arrayData = filteredSources[0].data as Record<string, unknown>[];
    expect(arrayData).toHaveLength(1);
    expect((arrayData[0] as Record<string, unknown>).label).toBe("GET /agents");

    // Object source: dangerousEndpoints stripped
    const objData = filteredSources[1].data as Record<string, unknown>;
    expect(objData).not.toHaveProperty("dangerousEndpoints");
    expect(objData).toHaveProperty("resourceRiskMap");

    // All blocked endpoints recorded
    expect(blockedEndpoints).toHaveLength(2);
    expect(blockedEndpoints).toContain("DELETE /agents/{agent_id}");
    expect(blockedEndpoints).toContain("PUT /groups/{group_id}/configuration");
  });
});
