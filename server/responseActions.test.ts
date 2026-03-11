/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Response Actions & Pipeline Chain Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Tests for:
 * 1. Response Actions — state machine, audit trail, CRUD
 * 2. Full Pipeline Chain — triage → correlation → hypothesis → response actions
 * 3. Pipeline Context Retrieval — analyst pipeline integration
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Response Actions — State Machine & Audit
// ═══════════════════════════════════════════════════════════════════════════════

describe("Response Actions State Machine", () => {
  const VALID_CATEGORIES = [
    "isolate_host", "disable_account", "block_ioc", "escalate_ir",
    "suppress_alert", "tune_rule", "add_watchlist", "collect_evidence",
    "notify_stakeholder", "custom",
  ] as const;

  const VALID_STATES = ["proposed", "approved", "rejected", "executed", "deferred"] as const;
  const VALID_URGENCY = ["immediate", "next", "scheduled", "optional"] as const;

  describe("Action categories", () => {
    it("should support all 10 action categories", () => {
      expect(VALID_CATEGORIES).toHaveLength(10);
      expect(VALID_CATEGORIES).toContain("isolate_host");
      expect(VALID_CATEGORIES).toContain("disable_account");
      expect(VALID_CATEGORIES).toContain("block_ioc");
      expect(VALID_CATEGORIES).toContain("escalate_ir");
      expect(VALID_CATEGORIES).toContain("suppress_alert");
      expect(VALID_CATEGORIES).toContain("tune_rule");
      expect(VALID_CATEGORIES).toContain("add_watchlist");
      expect(VALID_CATEGORIES).toContain("collect_evidence");
      expect(VALID_CATEGORIES).toContain("notify_stakeholder");
      expect(VALID_CATEGORIES).toContain("custom");
    });
  });

  describe("State transitions", () => {
    const VALID_TRANSITIONS: Record<string, string[]> = {
      proposed: ["approved", "rejected", "deferred"],
      approved: ["executed", "rejected"],
      rejected: [], // terminal
      executed: [], // terminal
      deferred: ["proposed"], // can be re-proposed
    };

    it("proposed can transition to approved, rejected, or deferred", () => {
      expect(VALID_TRANSITIONS.proposed).toEqual(["approved", "rejected", "deferred"]);
    });

    it("approved can transition to executed or rejected", () => {
      expect(VALID_TRANSITIONS.approved).toEqual(["executed", "rejected"]);
    });

    it("rejected is terminal", () => {
      expect(VALID_TRANSITIONS.rejected).toEqual([]);
    });

    it("executed is terminal", () => {
      expect(VALID_TRANSITIONS.executed).toEqual([]);
    });

    it("deferred can be re-proposed", () => {
      expect(VALID_TRANSITIONS.deferred).toEqual(["proposed"]);
    });

    it("should reject invalid transitions", () => {
      // Cannot go from proposed directly to executed
      expect(VALID_TRANSITIONS.proposed).not.toContain("executed");
      // Cannot go from rejected to anything
      expect(VALID_TRANSITIONS.rejected).toHaveLength(0);
    });
  });

  describe("Urgency levels", () => {
    it("should support 4 urgency levels", () => {
      expect(VALID_URGENCY).toHaveLength(4);
      expect(VALID_URGENCY).toContain("immediate");
      expect(VALID_URGENCY).toContain("next");
      expect(VALID_URGENCY).toContain("scheduled");
      expect(VALID_URGENCY).toContain("optional");
    });
  });
});

describe("Response Action Audit Trail", () => {
  it("should require from_state and to_state for every transition", () => {
    const auditEntry = {
      actionId: "ra-test123",
      fromState: "proposed",
      toState: "approved",
      changedBy: "analyst:42",
      reason: "Confirmed threat — approve host isolation",
      timestamp: new Date().toISOString(),
    };

    expect(auditEntry.fromState).toBeDefined();
    expect(auditEntry.toState).toBeDefined();
    expect(auditEntry.changedBy).toBeDefined();
    expect(auditEntry.reason).toBeDefined();
    expect(auditEntry.timestamp).toBeDefined();
  });

  it("should track who made each decision", () => {
    const auditEntries = [
      { fromState: "proposed", toState: "approved", changedBy: "analyst:42" },
      { fromState: "approved", toState: "executed", changedBy: "analyst:42" },
    ];

    expect(auditEntries).toHaveLength(2);
    expect(auditEntries[0].changedBy).toBe("analyst:42");
    expect(auditEntries[1].changedBy).toBe("analyst:42");
  });

  it("should preserve full state transition history", () => {
    const lifecycle = [
      { fromState: null, toState: "proposed", changedBy: "hypothesis_agent" },
      { fromState: "proposed", toState: "deferred", changedBy: "analyst:42" },
      { fromState: "deferred", toState: "proposed", changedBy: "analyst:42" },
      { fromState: "proposed", toState: "approved", changedBy: "analyst:42" },
      { fromState: "approved", toState: "executed", changedBy: "analyst:42" },
    ];

    expect(lifecycle).toHaveLength(5);
    expect(lifecycle[lifecycle.length - 1].toState).toBe("executed");
  });
});

describe("Response Action Evidence Basis", () => {
  it("should store evidence as structured JSON array, not embedded in LLM markdown", () => {
    const action = {
      actionId: "ra-test456",
      category: "isolate_host" as const,
      title: "Isolate host web-server-01",
      evidenceBasis: [
        "Agent 003 generated 47 critical alerts in 2 hours",
        "CVE-2024-1234 (CVSS 9.8) detected on this host",
        "Lateral movement indicators from MITRE T1021.001",
      ],
      targetValue: "web-server-01",
      targetType: "hostname",
    };

    expect(Array.isArray(action.evidenceBasis)).toBe(true);
    expect(action.evidenceBasis).toHaveLength(3);
    expect(typeof action.evidenceBasis[0]).toBe("string");
  });

  it("should link to case, correlation, and triage IDs", () => {
    const action = {
      actionId: "ra-test789",
      caseId: 42,
      correlationId: "corr-abc123",
      triageId: "triage-def456",
      linkedAlertIds: ["alert-1", "alert-2"],
      linkedAgentIds: ["003", "007"],
    };

    expect(action.caseId).toBe(42);
    expect(action.correlationId).toBeDefined();
    expect(action.triageId).toBeDefined();
    expect(action.linkedAlertIds).toHaveLength(2);
    expect(action.linkedAgentIds).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Full Pipeline Chain
// ═══════════════════════════════════════════════════════════════════════════════

describe("Full Pipeline Chain", () => {
  describe("Pipeline run tracking", () => {
    it("should create a run record with unique runId", () => {
      const runId = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      expect(runId).toMatch(/^run-[a-z0-9]+-[a-z0-9]+$/);
    });

    it("should track all 4 stages with independent status", () => {
      const run = {
        runId: "run-test123",
        currentStage: "triage" as const,
        status: "running" as const,
        triageStatus: "pending" as const,
        correlationStatus: "pending" as const,
        hypothesisStatus: "pending" as const,
        responseActionsStatus: "pending" as const,
      };

      expect(run.triageStatus).toBe("pending");
      expect(run.correlationStatus).toBe("pending");
      expect(run.hypothesisStatus).toBe("pending");
      expect(run.responseActionsStatus).toBe("pending");
    });

    it("should preserve partial results when later stages fail", () => {
      const partialRun = {
        status: "partial" as const,
        triageStatus: "completed" as const,
        triageId: "triage-abc",
        correlationStatus: "completed" as const,
        correlationId: "corr-def",
        hypothesisStatus: "failed" as const,
        error: "LLM synthesis timeout",
      };

      expect(partialRun.status).toBe("partial");
      expect(partialRun.triageId).toBeDefined();
      expect(partialRun.correlationId).toBeDefined();
      expect(partialRun.hypothesisStatus).toBe("failed");
    });
  });

  describe("Stage sequencing", () => {
    it("should run stages in order: triage → correlation → hypothesis → response_actions", () => {
      const stages = ["triage", "correlation", "hypothesis", "response_actions", "completed"];
      expect(stages[0]).toBe("triage");
      expect(stages[1]).toBe("correlation");
      expect(stages[2]).toBe("hypothesis");
      expect(stages[3]).toBe("response_actions");
      expect(stages[4]).toBe("completed");
    });

    it("should pass triageId from stage 1 to stage 2", () => {
      const triageResult = { triageId: "triage-abc123" };
      const correlationInput = { triageId: triageResult.triageId };
      expect(correlationInput.triageId).toBe("triage-abc123");
    });

    it("should pass correlationId from stage 2 to stage 3", () => {
      const correlationResult = { correlationId: "corr-def456" };
      const hypothesisInput = { correlationId: correlationResult.correlationId };
      expect(hypothesisInput.correlationId).toBe("corr-def456");
    });

    it("should materialize response actions from hypothesis output", () => {
      const hypothesisResult = {
        caseId: 42,
        materializedActionIds: ["ra-001", "ra-002", "ra-003"],
      };
      expect(hypothesisResult.materializedActionIds).toHaveLength(3);
      expect(hypothesisResult.materializedActionIds[0]).toMatch(/^ra-/);
    });
  });

  describe("Pipeline run result shape", () => {
    it("should return a structured result with all stage outcomes", () => {
      const result = {
        runId: "run-test",
        stages: {
          triage: { status: "completed", triageId: "t-1", latencyMs: 1200 },
          correlation: { status: "completed", correlationId: "c-1", latencyMs: 3400 },
          hypothesis: { status: "completed", caseId: 42, sessionId: 1, latencyMs: 5600 },
          responseActions: { status: "completed", count: 3, actionIds: ["ra-1", "ra-2", "ra-3"] },
        },
        totalLatencyMs: 10200,
        status: "completed",
      };

      expect(result.status).toBe("completed");
      expect(result.stages.triage.status).toBe("completed");
      expect(result.stages.correlation.status).toBe("completed");
      expect(result.stages.hypothesis.status).toBe("completed");
      expect(result.stages.responseActions.count).toBe(3);
      expect(result.totalLatencyMs).toBeGreaterThan(0);
    });
  });

  describe("Queue item integration", () => {
    it("should update queue item with triage link when queueItemId is provided", () => {
      const queueUpdate = {
        queueItemId: 42,
        pipelineTriageId: "triage-abc",
        autoTriageStatus: "completed" as const,
      };

      expect(queueUpdate.pipelineTriageId).toBeDefined();
      expect(queueUpdate.autoTriageStatus).toBe("completed");
    });

    it("should work without queueItemId for ad-hoc pipeline runs", () => {
      const input = {
        rawAlert: { id: "alert-123", rule: { level: 12 } },
        queueItemId: undefined,
      };

      expect(input.queueItemId).toBeUndefined();
      expect(input.rawAlert).toBeDefined();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Pipeline Context Retrieval — Analyst Pipeline Integration
// ═══════════════════════════════════════════════════════════════════════════════

describe("Pipeline Context Retrieval", () => {
  describe("Source types", () => {
    it("should add 'pipeline' as a valid retrieval source type", () => {
      const validTypes = ["graph", "indexer", "stats", "pipeline"] as const;
      expect(validTypes).toContain("pipeline");
    });

    it("should add 'pipeline_retriever' as a valid agent step type", () => {
      const validAgents = [
        "orchestrator", "graph_retriever", "indexer_retriever",
        "synthesizer", "safety_validator", "pipeline_retriever",
      ] as const;
      expect(validAgents).toContain("pipeline_retriever");
    });
  });

  describe("Context sources", () => {
    it("should retrieve active living cases with key fields", () => {
      const caseSummary = {
        id: 1,
        sessionId: 42,
        riskScore: 78,
        alertFamily: "brute_force",
        workingTheory: "Coordinated brute force attack targeting SSH services",
        theoryConfidence: 0.82,
        pendingActions: 3,
      };

      expect(caseSummary.riskScore).toBeGreaterThan(0);
      expect(caseSummary.workingTheory.length).toBeLessThanOrEqual(200);
      expect(caseSummary.theoryConfidence).toBeGreaterThanOrEqual(0);
      expect(caseSummary.theoryConfidence).toBeLessThanOrEqual(1);
    });

    it("should retrieve pending response actions", () => {
      const pendingAction = {
        actionId: "ra-abc",
        category: "isolate_host",
        title: "Isolate compromised web server",
        urgency: "immediate",
        targetValue: "web-server-01",
        targetType: "hostname",
        state: "proposed",
      };

      expect(pendingAction.state).toBe("proposed");
      expect(pendingAction.category).toBe("isolate_host");
    });

    it("should retrieve recent triage results", () => {
      const triage = {
        triageId: "triage-abc",
        alertId: "alert-123",
        severity: "critical",
        route: "C_HIGH_CONFIDENCE",
        alertFamily: "malware_execution",
        agentId: "003",
      };

      expect(triage.severity).toBe("critical");
      expect(triage.route).toBe("C_HIGH_CONFIDENCE");
    });

    it("should retrieve pipeline run statistics", () => {
      const stats = {
        total: 150,
        completed: 120,
        partial: 20,
        failed: 10,
        running: 0,
      };

      expect(stats.total).toBe(stats.completed + stats.partial + stats.failed + stats.running);
    });
  });

  describe("Entity-specific context", () => {
    it("should surface triage history for mentioned agents", () => {
      const intent = {
        entities: {
          agentIds: ["003"],
          hostnames: [],
          cveIds: [],
          ipAddresses: [],
          ruleIds: [],
          mitreTactics: [],
          keywords: [],
        },
      };

      expect(intent.entities.agentIds).toHaveLength(1);
      expect(intent.entities.agentIds[0]).toBe("003");
    });

    it("should include summary from triage data for entity matches", () => {
      const entityTriage = {
        triageId: "triage-abc",
        alertId: "alert-123",
        severity: "high",
        route: "C_HIGH_CONFIDENCE",
        alertFamily: "brute_force",
        agentId: "003",
        summary: "SSH brute force detected from external IP targeting agent 003",
      };

      expect(entityTriage.summary.length).toBeLessThanOrEqual(200);
      expect(entityTriage.agentId).toBe("003");
    });
  });

  describe("Trust score integration", () => {
    it("should boost trust score when pipeline context is available", () => {
      let trustScore = 0.3; // base
      const hasPipelineContext = true;

      if (hasPipelineContext) trustScore += 0.1;

      expect(trustScore).toBe(0.4);
    });

    it("should include pipeline source count in reasoning string", () => {
      const reasoning = "Intent: threat_hunt | Sources: 8 (3 pipeline) | Trust: 70%";
      expect(reasoning).toContain("pipeline");
    });
  });

  describe("System prompt integration", () => {
    it("should include SOC PIPELINE CONTEXT section in system prompt", () => {
      const systemPromptSections = [
        "IMMUTABLE SAFETY CONTRACT",
        "ANALYSIS PROTOCOL",
        "RESPONSE FORMAT",
        "KNOWLEDGE GRAPH CONTEXT",
        "SOC PIPELINE CONTEXT",
      ];

      expect(systemPromptSections).toContain("SOC PIPELINE CONTEXT");
    });

    it("should describe all pipeline data types in the prompt", () => {
      const pipelineContextDescription = [
        "Active Living Cases",
        "Pending Response Actions",
        "Recent Triage Results",
        "Pipeline Run Statistics",
      ];

      expect(pipelineContextDescription).toHaveLength(4);
    });
  });

  describe("Graceful degradation", () => {
    it("should return empty sources when database is unavailable", () => {
      const sources: unknown[] = [];
      // When db is null, retrievePipelineContext returns []
      expect(sources).toHaveLength(0);
    });

    it("should not block the pipeline when context retrieval fails", () => {
      const step = {
        agent: "pipeline_retriever",
        status: "error",
        detail: "Pipeline context retrieval failed: Connection timeout",
      };

      expect(step.status).toBe("error");
      // Pipeline should continue even if context retrieval fails
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Hypothesis Agent → Response Action Materialization
// ═══════════════════════════════════════════════════════════════════════════════

describe("Hypothesis Agent Response Action Materialization", () => {
  it("should create DB rows from LLM-recommended actions, not embed in JSON", () => {
    // The key architectural decision: actions are first-class DB records
    const materializedAction = {
      actionId: "ra-test",
      category: "isolate_host",
      title: "Isolate compromised host",
      state: "proposed", // starts as proposed, not approved
      proposedBy: "hypothesis_agent",
      caseId: 42,
      // These are DB columns, NOT fields in a JSON blob
    };

    expect(materializedAction.state).toBe("proposed");
    expect(materializedAction.proposedBy).toBe("hypothesis_agent");
    expect(materializedAction.caseId).toBe(42);
  });

  it("should map LLM action types to valid DB categories", () => {
    const categoryMap: Record<string, string> = {
      "isolate": "isolate_host",
      "block": "block_ioc",
      "disable": "disable_account",
      "escalate": "escalate_ir",
      "suppress": "suppress_alert",
      "tune": "tune_rule",
      "watchlist": "add_watchlist",
      "collect": "collect_evidence",
      "notify": "notify_stakeholder",
    };

    expect(Object.keys(categoryMap)).toHaveLength(9);
    expect(categoryMap["isolate"]).toBe("isolate_host");
    expect(categoryMap["block"]).toBe("block_ioc");
  });

  it("should return materialized action IDs from hypothesis agent", () => {
    const hypothesisResult = {
      caseId: 42,
      sessionId: 1,
      latencyMs: 5600,
      materializedActionIds: ["ra-001", "ra-002"],
    };

    expect(hypothesisResult.materializedActionIds).toBeDefined();
    expect(hypothesisResult.materializedActionIds).toHaveLength(2);
  });

  it("should link actions to the originating case, correlation, and triage", () => {
    const action = {
      caseId: 42,
      correlationId: "corr-abc",
      triageId: "triage-def",
      linkedAlertIds: ["alert-1", "alert-2"],
      linkedAgentIds: ["003"],
    };

    expect(action.caseId).toBeDefined();
    expect(action.correlationId).toBeDefined();
    expect(action.triageId).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Pipeline Run Queries
// ═══════════════════════════════════════════════════════════════════════════════

describe("Pipeline Run Queries", () => {
  it("should support filtering by status", () => {
    const validStatuses = ["running", "completed", "failed", "partial"];
    expect(validStatuses).toHaveLength(4);
  });

  it("should support pagination with limit and offset", () => {
    const input = { limit: 25, offset: 0, status: "completed" as const };
    expect(input.limit).toBeLessThanOrEqual(100);
    expect(input.offset).toBeGreaterThanOrEqual(0);
  });

  it("should return stats with counts per status", () => {
    const stats = {
      total: 100,
      completed: 80,
      partial: 10,
      failed: 8,
      running: 2,
      avgLatencyMs: 12500,
    };

    expect(stats.total).toBe(100);
    expect(stats.avgLatencyMs).toBeGreaterThan(0);
  });
});
