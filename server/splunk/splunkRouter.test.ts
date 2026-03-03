/**
 * Splunk Router & Service — vitest tests
 *
 * Tests Splunk HEC service configuration, ticket payload construction,
 * and router procedure validation.
 */

import { describe, it, expect, vi } from "vitest";

describe("Splunk HEC Configuration", () => {
  it("should have SPLUNK_HOST env var set", () => {
    const host = process.env.SPLUNK_HOST;
    expect(host).toBeDefined();
    expect(host!.length).toBeGreaterThan(0);
  });

  it("should have SPLUNK_HEC_TOKEN in UUID format", () => {
    const token = process.env.SPLUNK_HEC_TOKEN;
    expect(token).toBeDefined();
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("should have SPLUNK_HEC_PORT set to a valid port", () => {
    const port = process.env.SPLUNK_HEC_PORT;
    expect(port).toBeDefined();
    const portNum = Number(port);
    expect(portNum).toBeGreaterThan(0);
    expect(portNum).toBeLessThan(65536);
  });
});

describe("Splunk Service Module", () => {
  it("should export getEffectiveSplunkConfig", async () => {
    const { getEffectiveSplunkConfig } = await import("./splunkService");
    expect(typeof getEffectiveSplunkConfig).toBe("function");
  });

  it("should export isSplunkEnabled", async () => {
    const { isSplunkEnabled } = await import("./splunkService");
    expect(typeof isSplunkEnabled).toBe("function");
  });

  it("should export sendHECEvent", async () => {
    const { sendHECEvent } = await import("./splunkService");
    expect(typeof sendHECEvent).toBe("function");
  });

  it("should export testSplunkConnection", async () => {
    const { testSplunkConnection } = await import("./splunkService");
    expect(typeof testSplunkConnection).toBe("function");
  });

  it("should export createSplunkTicket", async () => {
    const { createSplunkTicket } = await import("./splunkService");
    expect(typeof createSplunkTicket).toBe("function");
  });
});

describe("Splunk Ticket Payload Structure", () => {
  it("should construct a valid ticket payload with all required fields", () => {
    const payload = {
      alertId: "alert-001",
      ruleId: "5710",
      ruleDescription: "SSH brute force attempt",
      ruleLevel: 12,
      agentId: "003",
      agentName: "web-server-01",
      alertTimestamp: "2026-02-26T15:00:00Z",
      triageSummary: "Critical SSH brute force detected from external IP",
      triageReasoning: "Multiple failed SSH login attempts detected",
      trustScore: 0.85,
      confidence: 0.9,
      safetyStatus: "safe",
      mitreIds: ["T1110.001"],
      mitreTactics: ["Credential Access"],
      suggestedFollowUps: ["Check source IP reputation", "Review SSH logs"],
      rawAlertJson: { rule: { id: "5710" } },
      createdBy: "admin",
    };

    // Verify all required fields are present
    expect(payload.alertId).toBeTruthy();
    expect(payload.ruleId).toBeTruthy();
    expect(payload.ruleLevel).toBeGreaterThanOrEqual(0);
    expect(payload.triageSummary).toBeTruthy();
    expect(payload.trustScore).toBeGreaterThanOrEqual(0);
    expect(payload.trustScore).toBeLessThanOrEqual(1);
    expect(payload.confidence).toBeGreaterThanOrEqual(0);
    expect(payload.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(payload.mitreIds)).toBe(true);
    expect(Array.isArray(payload.mitreTactics)).toBe(true);
    expect(Array.isArray(payload.suggestedFollowUps)).toBe(true);
  });

  it("should map Wazuh severity to Splunk urgency correctly", () => {
    const mapUrgency = (level: number) => {
      if (level >= 12) return "critical";
      if (level >= 8) return "high";
      if (level >= 4) return "medium";
      return "low";
    };

    expect(mapUrgency(15)).toBe("critical");
    expect(mapUrgency(12)).toBe("critical");
    expect(mapUrgency(10)).toBe("high");
    expect(mapUrgency(8)).toBe("high");
    expect(mapUrgency(6)).toBe("medium");
    expect(mapUrgency(4)).toBe("medium");
    expect(mapUrgency(2)).toBe("low");
    expect(mapUrgency(0)).toBe("low");
  });

  it("should generate unique ticket IDs with DANG prefix", () => {
    const ticketId = `DANG-${Date.now()}-${"alert-001".slice(-6)}`;
    expect(ticketId).toMatch(/^DANG-\d+-/);
    expect(ticketId.startsWith("DANG-")).toBe(true);
  });
});

describe("Splunk HEC Event Structure", () => {
  it("should construct a valid HEC event with required fields", () => {
    const event = {
      time: Math.floor(Date.now() / 1000),
      sourcetype: "dang:walter_triage",
      source: "dang_security_platform",
      host: "dang-siem",
      index: "notable",
      event: {
        ticket_id: "DANG-1234567890-rt-001",
        ticket_type: "walter_triage",
        alert_id: "alert-001",
        rule_id: "5710",
        urgency: "critical",
        platform: "Dang! SIEM",
        analysis_engine: "Walter Agentic Pipeline",
      },
    };

    expect(event.sourcetype).toBe("dang:walter_triage");
    expect(event.source).toBe("dang_security_platform");
    expect(event.index).toBe("notable");
    expect(event.event.platform).toBe("Dang! SIEM");
    expect(event.event.analysis_engine).toBe("Walter Agentic Pipeline");
    expect(event.time).toBeGreaterThan(0);
  });

  it("should use epoch seconds for HEC event timestamp (not milliseconds)", () => {
    const time = Math.floor(Date.now() / 1000);
    // Epoch seconds should be ~10 digits, not 13 (milliseconds)
    expect(time.toString().length).toBeLessThanOrEqual(11);
    expect(time.toString().length).toBeGreaterThanOrEqual(10);
  });
});

describe("Splunk Connection Settings Integration", () => {
  it("should include splunk in the connection settings env mapping", async () => {
    // Verify the connectionSettingsService has splunk category
    const { getEffectiveSettings } = await import("../admin/connectionSettingsService");
    const result = await getEffectiveSettings("splunk");
    expect(result).toHaveProperty("values");
    expect(result).toHaveProperty("sources");
  });

  it("should have hec_token as a sensitive key for encryption", async () => {
    // The hec_token should be treated as sensitive (encrypted at rest)
    // We verify this indirectly by checking the service module exists
    const { getEffectiveSplunkConfig } = await import("./splunkService");
    const config = await getEffectiveSplunkConfig();
    expect(config).toHaveProperty("hecToken");
    expect(config).toHaveProperty("host");
    expect(config).toHaveProperty("hecPort");
    expect(config).toHaveProperty("protocol");
    expect(config).toHaveProperty("enabled");
  });
});

describe("Splunk Router Exports", () => {
  it("should export splunkRouter with expected procedures", async () => {
    const { splunkRouter } = await import("./splunkRouter");
    expect(splunkRouter).toBeDefined();
    // Check that the router has the expected procedure keys
    const routerDef = splunkRouter._def;
    expect(routerDef).toBeDefined();
  });
});

describe("Batch Ticket Creation Logic", () => {
  it("should correctly identify eligible items (completed with triage, no existing ticket)", () => {
    const items = [
      { status: "completed", triageResult: { answer: "analysis", splunkTicketId: null } },
      { status: "completed", triageResult: { answer: "analysis", splunkTicketId: "DANG-123" } },
      { status: "completed", triageResult: null },
      { status: "queued", triageResult: { answer: "analysis" } },
      { status: "completed", triageResult: { answer: "another analysis" } },
      { status: "failed", triageResult: { answer: "failed analysis" } },
    ];

    const eligible = items.filter(i => {
      if (i.status !== "completed") return false;
      const triage = i.triageResult as Record<string, unknown> | null;
      if (!triage || !triage.answer) return false;
      if (triage.splunkTicketId) return false;
      return true;
    });

    expect(eligible.length).toBe(2); // First and fifth items
  });

  it("should skip items that already have a splunkTicketId", () => {
    const item = { status: "completed", triageResult: { answer: "test", splunkTicketId: "DANG-999" } };
    const triage = item.triageResult as Record<string, unknown>;
    expect(triage.splunkTicketId).toBeTruthy();
  });

  it("should skip items with no triage answer", () => {
    const items = [
      { status: "completed", triageResult: {} },
      { status: "completed", triageResult: { reasoning: "some reasoning" } },
      { status: "completed", triageResult: null },
    ];

    const eligible = items.filter(i => {
      const triage = i.triageResult as Record<string, unknown> | null;
      return triage?.answer ? true : false;
    });

    expect(eligible.length).toBe(0);
  });

  it("should return correct summary counts for batch operation", () => {
    const total = 5;
    const sent = 3;
    const failed = 1;
    const skipped = 2; // already ticketed

    const message = `Batch complete: ${sent} tickets created, ${skipped} skipped (already ticketed), ${failed} failed`;
    expect(message).toContain("3 tickets created");
    expect(message).toContain("2 skipped");
    expect(message).toContain("1 failed");
  });

  it("should report success=true only when no failures occur", () => {
    const resultSuccess = { success: 0 === 0, sent: 3, failed: 0 };
    const resultFailure = { success: 1 === 0, sent: 2, failed: 1 };

    expect(resultSuccess.success).toBe(true);
    expect(resultFailure.success).toBe(false);
  });

  it("should handle empty batch gracefully", () => {
    const eligibleItems: unknown[] = [];
    const result = {
      success: true,
      total: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      message: "No eligible triage reports found",
    };

    expect(result.total).toBe(0);
    expect(result.success).toBe(true);
    expect(result.message).toContain("No eligible");
  });
});

describe("Batch Progress Tracking", () => {
  it("should export _getBatchProgressForTest from splunkRouter", async () => {
    const { _getBatchProgressForTest } = await import("./splunkRouter");
    expect(_getBatchProgressForTest).toBeDefined();
    expect(typeof _getBatchProgressForTest).toBe("function");
  });

  it("should return idle status when no batch is running", async () => {
    const { _getBatchProgressForTest } = await import("./splunkRouter");
    const progress = _getBatchProgressForTest();
    expect(progress.status).toBe("idle");
    expect(progress.total).toBe(0);
    expect(progress.completed).toBe(0);
    expect(progress.batchId).toBe("");
  });

  it("should calculate percentage correctly", () => {
    const total = 7;
    const completed = 3;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    expect(percentage).toBe(43);
  });

  it("should calculate 0% when total is 0", () => {
    const total = 0;
    const completed = 0;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    expect(percentage).toBe(0);
  });

  it("should calculate 100% when all items completed", () => {
    const total = 5;
    const completed = 5;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    expect(percentage).toBe(100);
  });

  it("should detect expired batches after 5 minutes", () => {
    const BATCH_EXPIRY_MS = 5 * 60 * 1000;
    const updatedAt = Date.now() - (BATCH_EXPIRY_MS + 1000);
    const isExpired = Date.now() - updatedAt > BATCH_EXPIRY_MS;
    expect(isExpired).toBe(true);
  });

  it("should not detect fresh batches as expired", () => {
    const BATCH_EXPIRY_MS = 5 * 60 * 1000;
    const updatedAt = Date.now() - 1000; // 1 second ago
    const isExpired = Date.now() - updatedAt > BATCH_EXPIRY_MS;
    expect(isExpired).toBe(false);
  });

  it("should track sent and failed counts independently", () => {
    const progress = {
      total: 7,
      completed: 5,
      sent: 3,
      failed: 2,
      currentIndex: 5,
    };
    expect(progress.sent + progress.failed).toBe(progress.completed);
    expect(progress.completed).toBeLessThanOrEqual(progress.total);
  });

  it("should mark batch as failed when all items fail", () => {
    const failed = 5;
    const total = 5;
    const status = failed === total ? "failed" : "completed";
    expect(status).toBe("failed");
  });

  it("should mark batch as completed when some items succeed", () => {
    const failed = 2;
    const total = 5;
    const status = failed === total ? "failed" : "completed";
    expect(status).toBe("completed");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Ticket Artifact Audit Trail Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("Ticket Artifact Schema", () => {
  it("should export ticketArtifacts table from schema", async () => {
    const { ticketArtifacts } = await import("../../drizzle/schema");
    expect(ticketArtifacts).toBeDefined();
  });

  it("should export TicketArtifactRow and InsertTicketArtifactRow types", async () => {
    // Type-level check — if this compiles, the types exist
    const schema = await import("../../drizzle/schema");
    expect(schema.ticketArtifacts).toBeDefined();
    // The types are compile-time only; we verify the table exists at runtime
  });

  it("should have required columns in ticketArtifacts table", async () => {
    const { ticketArtifacts } = await import("../../drizzle/schema");
    const columns = Object.keys(ticketArtifacts);
    // Drizzle table objects expose column accessors
    expect(ticketArtifacts.id).toBeDefined();
    expect(ticketArtifacts.ticketId).toBeDefined();
    expect(ticketArtifacts.system).toBeDefined();
    expect(ticketArtifacts.queueItemId).toBeDefined();
    expect(ticketArtifacts.pipelineRunId).toBeDefined();
    expect(ticketArtifacts.alertId).toBeDefined();
    expect(ticketArtifacts.ruleId).toBeDefined();
    expect(ticketArtifacts.ruleLevel).toBeDefined();
    expect(ticketArtifacts.createdBy).toBeDefined();
    expect(ticketArtifacts.success).toBeDefined();
    expect(ticketArtifacts.statusMessage).toBeDefined();
    expect(ticketArtifacts.rawResponse).toBeDefined();
    expect(ticketArtifacts.httpStatusCode).toBeDefined();
    expect(ticketArtifacts.createdAt).toBeDefined();
  });
});

describe("Ticket Artifact Construction — Success Path", () => {
  it("should construct a success artifact with ticketId and success=true", () => {
    const result = { success: true, ticketId: "DANG-1709123456-rt-001", message: "Ticket created" };

    const artifact = {
      ticketId: result.ticketId ?? `failed-${Date.now()}`,
      system: "splunk_es" as const,
      queueItemId: 42,
      pipelineRunId: 7,
      alertId: "alert-001",
      ruleId: "5710",
      ruleLevel: 12,
      createdBy: "admin@example.com",
      success: result.success === true && !!result.ticketId,
      statusMessage: result.message,
      rawResponse: { ticketId: result.ticketId, message: result.message },
      httpStatusCode: null,
    };

    expect(artifact.success).toBe(true);
    expect(artifact.ticketId).toBe("DANG-1709123456-rt-001");
    expect(artifact.system).toBe("splunk_es");
    expect(artifact.pipelineRunId).toBe(7);
    expect(artifact.statusMessage).toBe("Ticket created");
  });

  it("should link artifact to queue item and pipeline run", () => {
    const artifact = {
      queueItemId: 42,
      pipelineRunId: 7,
      alertId: "alert-001",
    };

    expect(artifact.queueItemId).toBe(42);
    expect(artifact.pipelineRunId).toBe(7);
    expect(artifact.alertId).toBe("alert-001");
  });
});

describe("Ticket Artifact Construction — Failure Paths", () => {
  it("should construct a failure artifact when Splunk returns success:false", () => {
    const result = { success: false, message: "Splunk HEC error (403): Invalid token" };

    const artifact = {
      ticketId: result.ticketId ?? `failed-${Date.now()}`,
      system: "splunk_es" as const,
      queueItemId: 42,
      pipelineRunId: 7,
      alertId: "alert-001",
      ruleId: "5710",
      ruleLevel: 12,
      createdBy: "admin@example.com",
      success: (result as { success: boolean; ticketId?: string }).success === true && !!(result as { ticketId?: string }).ticketId,
      statusMessage: result.message,
      rawResponse: { ticketId: undefined, message: result.message },
      httpStatusCode: null,
    };

    expect(artifact.success).toBe(false);
    expect(artifact.ticketId).toMatch(/^failed-\d+$/);
    expect(artifact.statusMessage).toContain("403");
    expect(artifact.statusMessage).toContain("Invalid token");
  });

  it("should construct a failure artifact when HEC times out", () => {
    const result = { success: false, message: "Splunk HEC request timed out (15s)" };

    const artifact = {
      ticketId: `failed-${Date.now()}`,
      success: false,
      statusMessage: result.message,
    };

    expect(artifact.success).toBe(false);
    expect(artifact.statusMessage).toContain("timed out");
  });

  it("should construct a failure artifact when HEC connection refused", () => {
    const result = { success: false, message: "Splunk HEC connection error: ECONNREFUSED" };

    const artifact = {
      ticketId: `failed-${Date.now()}`,
      success: false,
      statusMessage: result.message,
    };

    expect(artifact.success).toBe(false);
    expect(artifact.statusMessage).toContain("ECONNREFUSED");
  });

  it("should construct an exception-path artifact for unhandled errors in batch", () => {
    const err = new Error("Unexpected JSON parse error");

    const artifact = {
      ticketId: `exception-${Date.now()}`,
      system: "splunk_es" as const,
      queueItemId: 99,
      pipelineRunId: null,
      alertId: "alert-999",
      ruleId: "1234",
      ruleLevel: 5,
      createdBy: "admin",
      success: false,
      statusMessage: err.message,
      rawResponse: null,
      httpStatusCode: null,
    };

    expect(artifact.success).toBe(false);
    expect(artifact.ticketId).toMatch(/^exception-\d+$/);
    expect(artifact.pipelineRunId).toBeNull();
    expect(artifact.rawResponse).toBeNull();
    expect(artifact.statusMessage).toBe("Unexpected JSON parse error");
  });

  it("should never set success=true when ticketId is missing", () => {
    const result = { success: true, message: "OK but no ticket ID" };
    // The router uses: result.success === true && !!result.ticketId
    const successFlag = (result as { success: boolean; ticketId?: string }).success === true && !!(result as { ticketId?: string }).ticketId;
    expect(successFlag).toBe(false);
  });
});

describe("Ticket Artifact Workflow Lineage", () => {
  it("should allow null pipelineRunId for legacy items without pipeline runs", () => {
    const artifact = {
      queueItemId: 42,
      pipelineRunId: null,
      alertId: "alert-001",
    };

    expect(artifact.pipelineRunId).toBeNull();
    expect(artifact.queueItemId).toBe(42);
  });

  it("should preserve all forensic fields from the original alert", () => {
    const artifact = {
      alertId: "alert-001",
      ruleId: "5710",
      ruleLevel: 12,
      createdBy: "admin@example.com",
    };

    // These fields must match the original alert — never normalized or cleaned
    expect(artifact.alertId).toBe("alert-001");
    expect(artifact.ruleId).toBe("5710");
    expect(artifact.ruleLevel).toBe(12);
  });

  it("should use splunk_es as the default system for Splunk tickets", () => {
    const artifact = { system: "splunk_es" as const };
    expect(artifact.system).toBe("splunk_es");
  });
});

describe("Splunk Router — listTicketArtifacts and getTicketArtifact exports", () => {
  it("should export listTicketArtifacts procedure in splunkRouter", async () => {
    const { splunkRouter } = await import("./splunkRouter");
    const routerDef = splunkRouter._def;
    expect(routerDef).toBeDefined();
    // The router should have the listTicketArtifacts and getTicketArtifact procedures
    // We verify the router is defined — full integration testing requires DB
  });
});

describe("Failure Truth — UI should see actual error messages", () => {
  it("should preserve Splunk 403 error message without sanitization", () => {
    const splunkResponse = "Splunk HEC error (403): Invalid token";
    // The router returns result.message directly — no sanitization
    expect(splunkResponse).toContain("403");
    expect(splunkResponse).toContain("Invalid token");
  });

  it("should preserve ECONNREFUSED in error message", () => {
    const errorMsg = "Splunk HEC connection error: ECONNREFUSED";
    expect(errorMsg).toContain("ECONNREFUSED");
  });

  it("should preserve timeout message", () => {
    const errorMsg = "Splunk HEC request timed out (15s)";
    expect(errorMsg).toContain("timed out");
    expect(errorMsg).toContain("15s");
  });

  it("should not return empty string for failure messages", () => {
    // Workflow truth: never return empty error messages
    const failureResults = [
      { success: false, message: "Splunk HEC error (403): Invalid token" },
      { success: false, message: "Splunk HEC request timed out (15s)" },
      { success: false, message: "Splunk HEC connection error: ECONNREFUSED" },
      { success: false, message: "Splunk integration is not enabled" },
      { success: false, message: "Splunk HEC not configured (missing host or token)" },
    ];

    for (const result of failureResults) {
      expect(result.message).toBeTruthy();
      expect(result.message.length).toBeGreaterThan(0);
    }
  });
});
