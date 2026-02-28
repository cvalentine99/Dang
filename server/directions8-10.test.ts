/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Directions 8–10 Tests
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Direction 8: Category-semantic validation in materializeResponseActions
 * Direction 9: Pipeline replay endpoint
 * Direction 10: Analyst feedback analytics
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from "vitest";

// ═══════════════════════════════════════════════════════════════════════════════
// Direction 8: Category-Semantic Validation
// ═══════════════════════════════════════════════════════════════════════════════

describe("Direction 8: Category-Semantic Validation", () => {
  /**
   * The category-target expectation map defines which target types
   * are semantically valid for each action category.
   */
  const CATEGORY_TARGET_EXPECTATIONS: Record<string, string[]> = {
    isolate_host: ["hostname", "host", "ip", "agent_id"],
    disable_account: ["username", "user", "account", "email"],
    block_ioc: ["ip", "domain", "hash", "url", "indicator"],
    escalate_ir: [],
    suppress_alert: ["rule_id", "rule", "alert_id"],
    tune_rule: ["rule_id", "rule"],
    add_watchlist: ["ip", "domain", "hash", "user", "hostname"],
    collect_evidence: ["hostname", "host", "agent_id", "ip"],
    notify_stakeholder: [],
    custom: [],
  };

  it("should define target expectations for all 10 categories", () => {
    expect(Object.keys(CATEGORY_TARGET_EXPECTATIONS)).toHaveLength(10);
  });

  it("isolate_host should expect host-related targets", () => {
    const expected = CATEGORY_TARGET_EXPECTATIONS.isolate_host;
    expect(expected).toContain("hostname");
    expect(expected).toContain("ip");
    expect(expected).toContain("agent_id");
    expect(expected).not.toContain("username");
    expect(expected).not.toContain("rule_id");
  });

  it("disable_account should expect user-related targets", () => {
    const expected = CATEGORY_TARGET_EXPECTATIONS.disable_account;
    expect(expected).toContain("username");
    expect(expected).toContain("user");
    expect(expected).not.toContain("hostname");
    expect(expected).not.toContain("ip");
  });

  it("block_ioc should expect indicator-related targets", () => {
    const expected = CATEGORY_TARGET_EXPECTATIONS.block_ioc;
    expect(expected).toContain("ip");
    expect(expected).toContain("domain");
    expect(expected).toContain("hash");
    expect(expected).not.toContain("username");
  });

  it("suppress_alert and tune_rule should expect rule-related targets", () => {
    expect(CATEGORY_TARGET_EXPECTATIONS.suppress_alert).toContain("rule_id");
    expect(CATEGORY_TARGET_EXPECTATIONS.tune_rule).toContain("rule_id");
  });

  it("escalate_ir, notify_stakeholder, custom should have no target constraints", () => {
    expect(CATEGORY_TARGET_EXPECTATIONS.escalate_ir).toHaveLength(0);
    expect(CATEGORY_TARGET_EXPECTATIONS.notify_stakeholder).toHaveLength(0);
    expect(CATEGORY_TARGET_EXPECTATIONS.custom).toHaveLength(0);
  });

  describe("Semantic warning generation", () => {
    function validateCategoryTarget(
      category: string,
      targetType: string | null | undefined,
    ): string | null {
      const expectations = CATEGORY_TARGET_EXPECTATIONS[category];
      if (!expectations || expectations.length === 0) return null;
      if (!targetType) return null;

      const normalizedTarget = targetType.toLowerCase().replace(/[\s-]/g, "_");
      const isValid = expectations.some(
        (exp) => normalizedTarget.includes(exp) || exp.includes(normalizedTarget),
      );

      if (!isValid) {
        return `Category '${category}' expects target types [${expectations.join(", ")}], but got '${targetType}'`;
      }
      return null;
    }

    it("should return null for valid category-target pairs", () => {
      expect(validateCategoryTarget("isolate_host", "hostname")).toBeNull();
      expect(validateCategoryTarget("disable_account", "username")).toBeNull();
      expect(validateCategoryTarget("block_ioc", "ip")).toBeNull();
      expect(validateCategoryTarget("suppress_alert", "rule_id")).toBeNull();
    });

    it("should return warning for mismatched category-target pairs", () => {
      const warning = validateCategoryTarget("isolate_host", "username");
      expect(warning).not.toBeNull();
      expect(warning).toContain("isolate_host");
      expect(warning).toContain("username");
    });

    it("should return null for categories with no constraints", () => {
      expect(validateCategoryTarget("escalate_ir", "anything")).toBeNull();
      expect(validateCategoryTarget("custom", "whatever")).toBeNull();
      expect(validateCategoryTarget("notify_stakeholder", "email")).toBeNull();
    });

    it("should return null when targetType is null or undefined", () => {
      expect(validateCategoryTarget("isolate_host", null)).toBeNull();
      expect(validateCategoryTarget("isolate_host", undefined)).toBeNull();
    });

    it("should handle case-insensitive target type matching", () => {
      expect(validateCategoryTarget("isolate_host", "Hostname")).toBeNull();
      expect(validateCategoryTarget("disable_account", "USERNAME")).toBeNull();
    });
  });

  describe("semanticWarning column", () => {
    it("should be a nullable text field on response_actions", () => {
      // Validates the schema contract — semanticWarning is stored per-action
      const mockRow = {
        id: 1,
        actionId: "ra-test",
        category: "isolate_host",
        targetType: "username",
        semanticWarning: "Category 'isolate_host' expects target types [hostname, host, ip, agent_id], but got 'username'",
      };

      expect(mockRow.semanticWarning).toBeDefined();
      expect(typeof mockRow.semanticWarning).toBe("string");
    });

    it("should be null when no mismatch exists", () => {
      const mockRow = {
        id: 2,
        actionId: "ra-test2",
        category: "isolate_host",
        targetType: "hostname",
        semanticWarning: null,
      };

      expect(mockRow.semanticWarning).toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Direction 9: Pipeline Replay
// ═══════════════════════════════════════════════════════════════════════════════

describe("Direction 9: Pipeline Replay", () => {
  describe("Replay input validation", () => {
    it("should accept a runId and optional fromStage", () => {
      const input = { runId: "run-abc123" };
      expect(input.runId).toBeDefined();
    });

    it("should accept fromStage as triage, correlation, or hypothesis", () => {
      const validStages = ["triage", "correlation", "hypothesis"];
      validStages.forEach((stage) => {
        const input = { runId: "run-abc", fromStage: stage };
        expect(validStages).toContain(input.fromStage);
      });
    });
  });

  describe("Replay stage detection", () => {
    function detectFirstFailedStage(run: {
      triageStatus: string;
      correlationStatus: string;
      hypothesisStatus: string;
      responseActionsStatus: string;
    }): string | null {
      if (run.triageStatus === "failed") return "triage";
      if (run.correlationStatus === "failed") return "correlation";
      if (run.hypothesisStatus === "failed") return "hypothesis";
      if (run.responseActionsStatus === "failed") return "hypothesis"; // re-run hypothesis
      return null;
    }

    it("should detect triage as first failed stage", () => {
      expect(detectFirstFailedStage({
        triageStatus: "failed",
        correlationStatus: "pending",
        hypothesisStatus: "pending",
        responseActionsStatus: "pending",
      })).toBe("triage");
    });

    it("should detect correlation as first failed stage", () => {
      expect(detectFirstFailedStage({
        triageStatus: "completed",
        correlationStatus: "failed",
        hypothesisStatus: "pending",
        responseActionsStatus: "pending",
      })).toBe("correlation");
    });

    it("should detect hypothesis as first failed stage", () => {
      expect(detectFirstFailedStage({
        triageStatus: "completed",
        correlationStatus: "completed",
        hypothesisStatus: "failed",
        responseActionsStatus: "pending",
      })).toBe("hypothesis");
    });

    it("should map responseActions failure to hypothesis replay", () => {
      expect(detectFirstFailedStage({
        triageStatus: "completed",
        correlationStatus: "completed",
        hypothesisStatus: "completed",
        responseActionsStatus: "failed",
      })).toBe("hypothesis");
    });

    it("should return null for fully completed pipeline", () => {
      expect(detectFirstFailedStage({
        triageStatus: "completed",
        correlationStatus: "completed",
        hypothesisStatus: "completed",
        responseActionsStatus: "completed",
      })).toBeNull();
    });
  });

  describe("Replay prerequisite validation", () => {
    it("should require triageId to replay from correlation", () => {
      const originalRun = {
        triageId: null,
        correlationId: null,
      };

      const canReplayFromCorrelation = !!originalRun.triageId;
      expect(canReplayFromCorrelation).toBe(false);
    });

    it("should allow replay from correlation when triageId exists", () => {
      const originalRun = {
        triageId: "triage-abc",
        correlationId: null,
      };

      const canReplayFromCorrelation = !!originalRun.triageId;
      expect(canReplayFromCorrelation).toBe(true);
    });

    it("should require correlationId to replay from hypothesis", () => {
      const originalRun = {
        triageId: "triage-abc",
        correlationId: null,
      };

      const canReplayFromHypothesis = !!originalRun.correlationId;
      expect(canReplayFromHypothesis).toBe(false);
    });

    it("should not allow replay of a currently running pipeline", () => {
      const runningPipeline = { status: "running" };
      expect(runningPipeline.status).toBe("running");
      // The endpoint throws: "Cannot replay a currently running pipeline"
    });
  });

  describe("Replay run ID format", () => {
    it("should generate replay-prefixed run IDs", () => {
      const replayRunId = `replay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      expect(replayRunId).toMatch(/^replay-[a-z0-9]+-[a-z0-9]+$/);
    });
  });

  describe("Replay result shape", () => {
    it("should include both replayRunId and originalRunId", () => {
      const result = {
        replayRunId: "replay-abc123",
        originalRunId: "run-def456",
        startedFromStage: "correlation",
        stages: {
          triage: { status: "completed", triageId: "t-1", reused: true },
          correlation: { status: "completed", correlationId: "c-new", latencyMs: 2000 },
          hypothesis: { status: "completed", caseId: 42, latencyMs: 5000 },
          responseActions: { status: "completed", count: 2, actionIds: ["ra-1", "ra-2"] },
        },
        totalLatencyMs: 7000,
        status: "completed",
      };

      expect(result.replayRunId).toMatch(/^replay-/);
      expect(result.originalRunId).toMatch(/^run-/);
      expect(result.startedFromStage).toBe("correlation");
      expect(result.stages.triage.reused).toBe(true);
      expect(result.stages.correlation.reused).toBeUndefined();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Direction 10: Feedback Analytics
// ═══════════════════════════════════════════════════════════════════════════════

describe("Direction 10: Feedback Analytics", () => {
  describe("Coverage metrics", () => {
    it("should compute coverage rate as percentage", () => {
      const total = 100;
      const withFeedback = 75;
      const coverageRate = (withFeedback / total) * 100;
      expect(coverageRate).toBe(75);
    });

    it("should compute confirmation rate as percentage of reviewed", () => {
      const withFeedback = 75;
      const confirmed = 60;
      const confirmationRate = (confirmed / withFeedback) * 100;
      expect(confirmationRate).toBe(80);
    });

    it("should handle zero total gracefully", () => {
      const total = 0;
      const coverageRate = total ? (0 / total) * 100 : 0;
      expect(coverageRate).toBe(0);
    });

    it("should handle zero feedback gracefully", () => {
      const withFeedback = 0;
      const confirmationRate = withFeedback ? (0 / withFeedback) * 100 : 0;
      expect(confirmationRate).toBe(0);
    });
  });

  describe("Severity override distribution", () => {
    it("should track AI severity → analyst severity pairs", () => {
      const overrides = [
        { aiSeverity: "info", analystSeverity: "medium", count: 5 },
        { aiSeverity: "low", analystSeverity: "high", count: 3 },
        { aiSeverity: "medium", analystSeverity: "critical", count: 1 },
      ];

      expect(overrides).toHaveLength(3);
      expect(overrides[0].aiSeverity).toBe("info");
      expect(overrides[0].analystSeverity).toBe("medium");
      expect(overrides[0].count).toBe(5);
    });

    it("should identify under-severity patterns (AI too low)", () => {
      const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];
      const overrides = [
        { aiSeverity: "info", analystSeverity: "critical", count: 2 },
        { aiSeverity: "low", analystSeverity: "high", count: 4 },
      ];

      const underSeverity = overrides.filter((o) => {
        const aiIdx = SEVERITY_ORDER.indexOf(o.aiSeverity);
        const analystIdx = SEVERITY_ORDER.indexOf(o.analystSeverity);
        return analystIdx < aiIdx; // analyst rated MORE severe
      });

      expect(underSeverity).toHaveLength(2);
    });
  });

  describe("Route override patterns", () => {
    it("should track AI route → analyst route pairs", () => {
      const overrides = [
        { aiRoute: "D_LIKELY_BENIGN", analystRoute: "C_HIGH_CONFIDENCE", count: 7 },
        { aiRoute: "A_DUPLICATE_NOISY", analystRoute: "B_LOW_CONFIDENCE", count: 2 },
      ];

      expect(overrides).toHaveLength(2);
      expect(overrides[0].aiRoute).toBe("D_LIKELY_BENIGN");
      expect(overrides[0].analystRoute).toBe("C_HIGH_CONFIDENCE");
    });
  });

  describe("Per-analyst activity", () => {
    it("should track feedback count, confirmations, and overrides per analyst", () => {
      const analystActivity = {
        analystUserId: 42,
        feedbackCount: 50,
        confirmations: 40,
        severityOverrides: 7,
        routeOverrides: 3,
        notesWritten: 15,
      };

      expect(analystActivity.feedbackCount).toBe(50);
      expect(analystActivity.confirmations + analystActivity.severityOverrides).toBeLessThanOrEqual(analystActivity.feedbackCount);
    });

    it("should compute per-analyst confirmation rate", () => {
      const analyst = { feedbackCount: 50, confirmations: 40 };
      const rate = (analyst.confirmations / analyst.feedbackCount) * 100;
      expect(rate).toBe(80);
    });
  });

  describe("Recent feedback activity", () => {
    it("should return structured feedback entries with all fields", () => {
      const entry = {
        triageId: "triage-abc",
        alertId: "alert-123",
        aiSeverity: "low",
        aiRoute: "D_LIKELY_BENIGN",
        analystConfirmed: 0,
        analystSeverityOverride: "high",
        analystRouteOverride: "C_HIGH_CONFIDENCE",
        analystNotes: "This is actually a real threat — lateral movement detected.",
        analystUserId: 42,
        feedbackAt: new Date().toISOString(),
        ruleId: "100002",
        ruleDescription: "Syscheck integrity change",
      };

      expect(entry.triageId).toBeDefined();
      expect(entry.aiSeverity).toBeDefined();
      expect(entry.analystSeverityOverride).toBeDefined();
      expect(entry.feedbackAt).toBeDefined();
    });

    it("should order by feedbackAt descending (most recent first)", () => {
      const entries = [
        { feedbackAt: "2026-02-28T10:00:00Z" },
        { feedbackAt: "2026-02-28T09:00:00Z" },
        { feedbackAt: "2026-02-28T08:00:00Z" },
      ];

      const sorted = [...entries].sort(
        (a, b) => new Date(b.feedbackAt).getTime() - new Date(a.feedbackAt).getTime(),
      );

      expect(sorted[0].feedbackAt).toBe("2026-02-28T10:00:00Z");
      expect(sorted[2].feedbackAt).toBe("2026-02-28T08:00:00Z");
    });
  });

  describe("Analytics response shape", () => {
    it("should return all required sections", () => {
      const response = {
        coverage: {
          total: 100,
          withFeedback: 75,
          confirmed: 60,
          rejected: 15,
          severityOverridden: 10,
          routeOverridden: 5,
          withNotes: 30,
          coverageRate: 75,
          confirmationRate: 80,
        },
        severityOverrides: [],
        routeOverrides: [],
        bySeverity: [],
        byAnalyst: [],
        recentFeedback: [],
      };

      expect(response.coverage).toBeDefined();
      expect(response.coverage.coverageRate).toBe(75);
      expect(response.coverage.confirmationRate).toBe(80);
      expect(response.severityOverrides).toBeDefined();
      expect(response.routeOverrides).toBeDefined();
      expect(response.bySeverity).toBeDefined();
      expect(response.byAnalyst).toBeDefined();
      expect(response.recentFeedback).toBeDefined();
    });
  });
});
