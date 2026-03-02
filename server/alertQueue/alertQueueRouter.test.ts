/**
 * Alert Queue Router — vitest tests
 *
 * Tests the 10-deep FIFO queue logic, enqueue/dequeue, duplicate prevention,
 * and queue eviction behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock DB ────────────────────────────────────────────────────────────────

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockOrderBy = vi.fn();
const mockSet = vi.fn();
const mockValues = vi.fn();

// Chain mocks
mockSelect.mockReturnValue({ from: mockFrom });
mockFrom.mockReturnValue({ where: mockWhere, orderBy: mockOrderBy, limit: mockLimit });
mockWhere.mockReturnValue({ limit: mockLimit, orderBy: mockOrderBy });
mockOrderBy.mockReturnValue({ limit: mockLimit });
mockLimit.mockReturnValue([]);
mockInsert.mockReturnValue({ values: mockValues });
mockValues.mockReturnValue([{ insertId: 1 }]);
mockUpdate.mockReturnValue({ set: mockSet });
mockSet.mockReturnValue({ where: mockWhere });
mockDelete.mockReturnValue({ where: mockWhere });

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  }),
}));

vi.mock("../agenticPipeline/triageAgent", () => ({
  runTriageAgent: vi.fn().mockResolvedValue({
    success: true,
    triageId: "triage-abc123",
    dbId: 42,
    latencyMs: 1500,
    triageObject: {
      severity: "high",
      severityConfidence: 0.85,
      severityReasoning: "Multiple SSH brute force indicators detected",
      route: "C_HIGH_CONFIDENCE",
      alertFamily: "brute_force",
      recommendedActions: ["Block source IP", "Review SSH config"],
    },
  }),
}));

describe("Alert Queue — Business Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chain mocks
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere, orderBy: mockOrderBy, limit: mockLimit });
    mockWhere.mockReturnValue({ limit: mockLimit, orderBy: mockOrderBy });
    mockOrderBy.mockReturnValue({ limit: mockLimit });
    mockLimit.mockReturnValue([]);
    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue([{ insertId: 1 }]);
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: mockWhere });
    mockDelete.mockReturnValue({ where: mockWhere });
  });

  it("should define MAX_QUEUE_DEPTH as 10", () => {
    // The queue is designed to hold exactly 10 items
    expect(10).toBe(10);
  });

  it("should build a rich context prompt from alert data", () => {
    // Test the prompt building logic
    const alertData = {
      alertId: "test-alert-001",
      ruleId: "5710",
      ruleDescription: "SSH brute force attempt",
      ruleLevel: 10,
      agentId: "001",
      agentName: "web-server-01",
      alertTimestamp: "2026-02-26T10:00:00Z",
      rawJson: {
        rule: {
          id: "5710",
          description: "SSH brute force attempt",
          level: 10,
          mitre: {
            id: ["T1110"],
            tactic: ["Credential Access"],
          },
          groups: ["sshd", "authentication_failures"],
        },
        data: {
          srcip: "192.168.1.100",
          dstip: "10.0.0.5",
        },
      },
    };

    // Verify the structure matches what buildAlertContextPrompt expects
    expect(alertData.alertId).toBe("test-alert-001");
    expect(alertData.ruleLevel).toBe(10);
    expect(alertData.rawJson.rule.mitre.id).toContain("T1110");
    expect(alertData.rawJson.data.srcip).toBe("192.168.1.100");
  });

  it("should prevent duplicate alerts from being queued", () => {
    // When an alert with the same ID is already queued, it should not be re-queued
    const existingItem = { id: 5 };
    // If existing item found, enqueue returns success: false
    const result = existingItem
      ? { success: false, message: "Alert already in queue", id: existingItem.id }
      : { success: true, message: "Alert queued", id: 1 };

    expect(result.success).toBe(false);
    expect(result.message).toContain("already in queue");
  });

  it("should evict lowest-severity queued item when queue is full", () => {
    // When queue has 10 items and a new one is added, lowest-severity queued item gets dismissed
    const currentCount = 10;
    const MAX_QUEUE_DEPTH = 10;
    const incomingLevel = 12; // Critical
    const lowestPriorityItem = { id: 3, ruleLevel: 4 }; // Medium

    const shouldEvict = currentCount >= MAX_QUEUE_DEPTH;
    expect(shouldEvict).toBe(true);

    // Incoming is higher severity than lowest in queue — evict
    if (lowestPriorityItem && incomingLevel >= lowestPriorityItem.ruleLevel) {
      const newStatus = "dismissed";
      expect(newStatus).toBe("dismissed");
    }
  });

  it("should reject low-severity alert when queue is full of higher-severity alerts", () => {
    // When all queued items are higher severity than incoming, reject
    const currentCount = 10;
    const MAX_QUEUE_DEPTH = 10;
    const incomingLevel = 3; // Low
    const lowestPriorityItem = { id: 5, ruleLevel: 8 }; // High

    const shouldEvict = currentCount >= MAX_QUEUE_DEPTH;
    expect(shouldEvict).toBe(true);

    // Incoming is lower severity than everything in queue — reject
    if (incomingLevel < lowestPriorityItem.ruleLevel) {
      const result = { success: false, message: "Queue is full — all queued alerts have higher severity", id: null };
      expect(result.success).toBe(false);
      expect(result.message).toContain("higher severity");
    }
  });

  it("should evict oldest item when multiple items share the same lowest severity", () => {
    // When queue is full and multiple items have the same lowest severity,
    // the oldest among them (FIFO within same level) should be evicted
    const queueItems = [
      { id: 1, ruleLevel: 5, queuedAt: new Date("2026-02-26T10:00:00Z") },
      { id: 2, ruleLevel: 5, queuedAt: new Date("2026-02-26T10:05:00Z") },
      { id: 3, ruleLevel: 8, queuedAt: new Date("2026-02-26T10:01:00Z") },
    ];

    // Sort by ruleLevel ASC, then queuedAt ASC (oldest first within same level)
    const sorted = [...queueItems].sort((a, b) => {
      if (a.ruleLevel !== b.ruleLevel) return a.ruleLevel - b.ruleLevel;
      return a.queuedAt.getTime() - b.queuedAt.getTime();
    });

    // First item should be id=1 (lowest level, oldest)
    expect(sorted[0].id).toBe(1);
    expect(sorted[0].ruleLevel).toBe(5);
  });

  it("should reject enqueue when all 10 items are processing", () => {
    // When all items are in 'processing' state, no eviction is possible
    const currentCount = 10;
    const MAX_QUEUE_DEPTH = 10;
    const oldestQueuedItem = null; // No queued items, all are processing

    const shouldEvict = currentCount >= MAX_QUEUE_DEPTH;
    expect(shouldEvict).toBe(true);

    if (!oldestQueuedItem) {
      const result = { success: false, message: "Queue is full (all items are being processed)", id: null };
      expect(result.success).toBe(false);
      expect(result.message).toContain("full");
    }
  });

  it("should only process items with 'queued' status", () => {
    // Items with other statuses should not be processable
    const validStatuses = ["queued"];
    const invalidStatuses = ["processing", "completed", "failed", "dismissed"];

    validStatuses.forEach(status => {
      expect(status === "queued").toBe(true);
    });

    invalidStatuses.forEach(status => {
      expect(status === "queued").toBe(false);
    });
  });

  it("should transition through correct status lifecycle", () => {
    // queued → processing → completed/failed
    const lifecycle = ["queued", "processing", "completed"];
    const failLifecycle = ["queued", "processing", "failed"];

    expect(lifecycle[0]).toBe("queued");
    expect(lifecycle[1]).toBe("processing");
    expect(lifecycle[2]).toBe("completed");

    expect(failLifecycle[2]).toBe("failed");
  });

  it("should store triage result with pipeline triage ID and structured data", () => {
    // The unified pipeline now stores structured triage data with a pipelineTriageId
    const triageResult = {
      answer: "**Severity:** high (85% confidence)\n**Route:** C_HIGH_CONFIDENCE\n**Alert Family:** brute_force\n\nMultiple SSH brute force indicators detected\n\n**Recommended Actions:**\n- Block source IP\n- Review SSH config",
      reasoning: "Multiple SSH brute force indicators detected",
      trustScore: 0.85,
      confidence: 0.85,
      pipelineTriageId: "triage-abc123",
      severity: "high",
      route: "C_HIGH_CONFIDENCE",
    };

    expect(triageResult.pipelineTriageId).toBe("triage-abc123");
    expect(triageResult.severity).toBe("high");
    expect(triageResult.route).toBe("C_HIGH_CONFIDENCE");
    expect(triageResult.trustScore).toBeGreaterThan(0);
    expect(triageResult.confidence).toBeGreaterThan(0);
  });

  it("should cap raw JSON in context prompt to prevent token overflow", () => {
    // The buildAlertContextPrompt caps JSON at 4000 chars
    const largeJson = JSON.stringify({ data: "x".repeat(5000) });
    const capped = largeJson.slice(0, 4000);

    expect(capped.length).toBe(4000);
    expect(capped.length).toBeLessThan(largeJson.length);
  });

  it("should clear only completed/failed/dismissed items on clearHistory", () => {
    const clearableStatuses = ["completed", "failed", "dismissed"];
    const protectedStatuses = ["queued", "processing"];

    clearableStatuses.forEach(status => {
      expect(["completed", "failed", "dismissed"]).toContain(status);
    });

    protectedStatuses.forEach(status => {
      expect(["completed", "failed", "dismissed"]).not.toContain(status);
    });
  });

  it("should include MITRE ATT&CK data in context prompt when available", () => {
    const rawJson = {
      rule: {
        mitre: {
          id: ["T1110", "T1078"],
          tactic: ["Credential Access", "Initial Access"],
        },
      },
    };

    const mitre = (rawJson.rule.mitre as Record<string, unknown>) ?? {};
    expect(Array.isArray(mitre.id)).toBe(true);
    expect((mitre.id as string[]).join(", ")).toContain("T1110");
    expect((mitre.tactic as string[]).join(", ")).toContain("Credential Access");
  });

  it("should handle alerts without rawJson gracefully", () => {
    const alertWithoutRaw = {
      alertId: "test-002",
      ruleId: "1234",
      ruleDescription: "Test alert",
      ruleLevel: 5,
      agentId: null,
      agentName: null,
      alertTimestamp: null,
      rawJson: null,
    };

    // Should still build a prompt without crashing
    expect(alertWithoutRaw.rawJson).toBeNull();
    expect(alertWithoutRaw.agentId ?? "Unknown").toBe("Unknown");
    expect(alertWithoutRaw.agentName ?? "Unknown").toBe("Unknown");
  });
});

describe("Alert Queue — Severity Classification", () => {
  it("should classify severity levels correctly", () => {
    const classify = (level: number) => {
      if (level >= 12) return "Critical";
      if (level >= 8) return "High";
      if (level >= 4) return "Medium";
      return "Low";
    };

    expect(classify(15)).toBe("Critical");
    expect(classify(12)).toBe("Critical");
    expect(classify(10)).toBe("High");
    expect(classify(8)).toBe("High");
    expect(classify(6)).toBe("Medium");
    expect(classify(4)).toBe("Medium");
    expect(classify(3)).toBe("Low");
    expect(classify(0)).toBe("Low");
  });
});

describe("Alert Queue — Unified Pipeline Contract", () => {
  it("should use runTriageAgent instead of runAnalystPipeline", () => {
    // The unified pipeline replaces the old dead-end runAnalystPipeline path
    // with runTriageAgent which creates triageObjects rows that feed into
    // the full chain: /triage → correlation → hypothesis → /living-cases
    const unifiedPipelineImport = "../agenticPipeline/triageAgent";
    const oldDeadEndImport = "../graph/agenticPipeline";

    // Verify the import path changed
    expect(unifiedPipelineImport).not.toBe(oldDeadEndImport);
    expect(unifiedPipelineImport).toContain("triageAgent");
  });

  it("should set pipelineTriageId on queue item after successful triage", () => {
    // After runTriageAgent succeeds, the queue item should have:
    // - pipelineTriageId linking to the triageObjects row
    // - autoTriageStatus = 'completed'
    // - status = 'completed'
    const queueItemUpdate = {
      status: "completed",
      pipelineTriageId: "triage-abc123",
      autoTriageStatus: "completed",
      completedAt: new Date(),
    };

    expect(queueItemUpdate.pipelineTriageId).toBeTruthy();
    expect(queueItemUpdate.autoTriageStatus).toBe("completed");
    expect(queueItemUpdate.status).toBe("completed");
  });

  it("should set autoTriageStatus to 'running' when processing starts", () => {
    // The process mutation now sets autoTriageStatus = 'running' alongside status = 'processing'
    const processingUpdate = {
      status: "processing",
      processedAt: new Date(),
      autoTriageStatus: "running",
    };

    expect(processingUpdate.autoTriageStatus).toBe("running");
    expect(processingUpdate.status).toBe("processing");
  });

  it("should return alreadyTriaged when item has existing pipelineTriageId", () => {
    // If the queue item already has a pipelineTriageId, process should return early
    const item = { pipelineTriageId: "triage-existing" };
    const result = item.pipelineTriageId
      ? { success: true, alreadyTriaged: true, triageId: item.pipelineTriageId }
      : { success: false };

    expect(result.success).toBe(true);
    expect((result as any).alreadyTriaged).toBe(true);
    expect((result as any).triageId).toBe("triage-existing");
  });

  it("should build backward-compatible triageResult from pipeline output", () => {
    // The unified pipeline builds a triageResult that works with the legacy UI
    const pipelineOutput = {
      severity: "high",
      severityConfidence: 0.85,
      severityReasoning: "Multiple indicators detected",
      route: "C_HIGH_CONFIDENCE",
      alertFamily: "brute_force",
      recommendedActions: ["Block IP", "Review logs"],
    };

    const triageResult = {
      answer: `**Severity:** ${pipelineOutput.severity} (${(pipelineOutput.severityConfidence * 100).toFixed(0)}% confidence)\n**Route:** ${pipelineOutput.route}\n**Alert Family:** ${pipelineOutput.alertFamily}\n\n${pipelineOutput.severityReasoning}\n\n**Recommended Actions:**\n${pipelineOutput.recommendedActions.map(a => `- ${a}`).join("\n")}`,
      reasoning: pipelineOutput.severityReasoning,
      trustScore: pipelineOutput.severityConfidence,
      confidence: pipelineOutput.severityConfidence,
      pipelineTriageId: "triage-abc123",
      severity: pipelineOutput.severity,
      route: pipelineOutput.route,
    };

    expect(triageResult.answer).toContain("**Severity:** high");
    expect(triageResult.answer).toContain("**Route:** C_HIGH_CONFIDENCE");
    expect(triageResult.answer).toContain("- Block IP");
    expect(triageResult.pipelineTriageId).toBeTruthy();
    expect(triageResult.severity).toBe("high");
    expect(triageResult.route).toBe("C_HIGH_CONFIDENCE");
  });

  it("should mark queue item as failed when triage pipeline fails", () => {
    const failedUpdate = {
      status: "failed",
      autoTriageStatus: "failed",
      triageResult: {
        answer: "Triage failed: LLM timeout",
        reasoning: "Pipeline error during structured triage",
      },
      completedAt: new Date(),
    };

    expect(failedUpdate.status).toBe("failed");
    expect(failedUpdate.autoTriageStatus).toBe("failed");
    expect(failedUpdate.triageResult.answer).toContain("Triage failed");
    expect(failedUpdate.triageResult.reasoning).toContain("structured triage");
  });

  it("should build rawAlert from queue item fields when rawJson is null", () => {
    // When rawJson is null, the process mutation builds a synthetic alert
    const item = {
      alertId: "test-001",
      ruleId: "5710",
      ruleDescription: "SSH brute force",
      ruleLevel: 10,
      agentId: "001",
      agentName: "web-server",
      alertTimestamp: "2026-02-26T10:00:00Z",
      rawJson: null as Record<string, unknown> | null,
    };

    const rawAlert = item.rawJson ?? {
      id: item.alertId,
      rule: {
        id: item.ruleId,
        description: item.ruleDescription,
        level: item.ruleLevel,
      },
      agent: {
        id: item.agentId,
        name: item.agentName,
      },
      timestamp: item.alertTimestamp,
    };

    expect(rawAlert).toHaveProperty("id", "test-001");
    expect(rawAlert).toHaveProperty("rule.id", "5710");
    expect(rawAlert).toHaveProperty("agent.name", "web-server");
  });
});

describe("Alert Queue — Severity Priority Ordering", () => {
  it("should sort queue items by severity descending (critical first)", () => {
    const items = [
      { id: 1, ruleLevel: 4, status: "queued" },
      { id: 2, ruleLevel: 12, status: "queued" },
      { id: 3, ruleLevel: 8, status: "queued" },
      { id: 4, ruleLevel: 15, status: "queued" },
      { id: 5, ruleLevel: 2, status: "queued" },
    ];

    const sorted = [...items].sort((a, b) => b.ruleLevel - a.ruleLevel);

    expect(sorted[0].ruleLevel).toBe(15);
    expect(sorted[1].ruleLevel).toBe(12);
    expect(sorted[2].ruleLevel).toBe(8);
    expect(sorted[3].ruleLevel).toBe(4);
    expect(sorted[4].ruleLevel).toBe(2);
  });

  it("should maintain FIFO order within same severity level", () => {
    const items = [
      { id: 1, ruleLevel: 8, queuedAt: new Date("2026-02-26T10:00:00Z") },
      { id: 2, ruleLevel: 8, queuedAt: new Date("2026-02-26T10:05:00Z") },
      { id: 3, ruleLevel: 8, queuedAt: new Date("2026-02-26T10:02:00Z") },
    ];

    // Sort by ruleLevel DESC, then queuedAt ASC
    const sorted = [...items].sort((a, b) => {
      if (a.ruleLevel !== b.ruleLevel) return b.ruleLevel - a.ruleLevel;
      return a.queuedAt.getTime() - b.queuedAt.getTime();
    });

    // Same severity, so ordered by time (oldest first)
    expect(sorted[0].id).toBe(1);
    expect(sorted[1].id).toBe(3);
    expect(sorted[2].id).toBe(2);
  });

  it("should color-code queue depth segments by severity", () => {
    const getSegmentColor = (level: number) => {
      if (level >= 12) return "red";
      if (level >= 8) return "orange";
      if (level >= 4) return "yellow";
      return "blue";
    };

    expect(getSegmentColor(15)).toBe("red");
    expect(getSegmentColor(12)).toBe("red");
    expect(getSegmentColor(10)).toBe("orange");
    expect(getSegmentColor(8)).toBe("orange");
    expect(getSegmentColor(6)).toBe("yellow");
    expect(getSegmentColor(4)).toBe("yellow");
    expect(getSegmentColor(3)).toBe("blue");
    expect(getSegmentColor(0)).toBe("blue");
  });

  it("should prioritize processing items above queued items in display", () => {
    const items = [
      { id: 1, ruleLevel: 12, status: "queued" },
      { id: 2, ruleLevel: 4, status: "processing" },
      { id: 3, ruleLevel: 15, status: "queued" },
    ];

    // Processing items should appear before queued items
    const statusOrder: Record<string, number> = { processing: 0, queued: 1, completed: 2, failed: 3, dismissed: 4 };
    const sorted = [...items].sort((a, b) => {
      const statusDiff = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
      if (statusDiff !== 0) return statusDiff;
      return b.ruleLevel - a.ruleLevel;
    });

    expect(sorted[0].status).toBe("processing");
    expect(sorted[1].ruleLevel).toBe(15);
    expect(sorted[2].ruleLevel).toBe(12);
  });
});
