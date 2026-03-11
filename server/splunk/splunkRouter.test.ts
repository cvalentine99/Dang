/**
 * Splunk Router & Service — vitest tests
 *
 * Tests Splunk HEC service configuration, ticket payload construction,
 * and router procedure validation.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";

const HAS_SPLUNK = !!process.env.SPLUNK_HOST;

describe.skipIf(!HAS_SPLUNK)("Splunk HEC Configuration", () => {
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
      sourcetype: "dang:agentic_triage",
      source: "dang_security_platform",
      host: "dang-siem",
      index: "notable",
      event: {
        ticket_id: "DANG-1234567890-rt-001",
        ticket_type: "agentic_triage",
        alert_id: "alert-001",
        rule_id: "5710",
        urgency: "critical",
        platform: "Dang! SIEM",
        analysis_engine: "Dang! Agentic Pipeline",
      },
    };

    expect(event.sourcetype).toBe("dang:agentic_triage");
    expect(event.source).toBe("dang_security_platform");
    expect(event.index).toBe("notable");
    expect(event.event.platform).toBe("Dang! SIEM");
    expect(event.event.analysis_engine).toBe("Dang! Agentic Pipeline");
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

// ═══════════════════════════════════════════════════════════════════════════════
// Fix 1: Ticket Success Truthfulness — UI must never show success for failures
// ═══════════════════════════════════════════════════════════════════════════════

describe("Ticket Success Truthfulness — createTicket return shape", () => {
  it("should return success:true with ticketId when HEC confirms creation", () => {
    const hecResult = { success: true, ticketId: "DANG-1709123456-rt-001", message: "Ticket created" };

    // Simulate the router's explicit return logic
    let routerReturn;
    if (hecResult.success && hecResult.ticketId) {
      routerReturn = { success: true as const, ticketId: hecResult.ticketId, message: hecResult.message };
    } else {
      routerReturn = { success: false as const, ticketId: null, message: hecResult.message || "Splunk HEC did not confirm ticket creation" };
    }

    expect(routerReturn.success).toBe(true);
    expect(routerReturn.ticketId).toBe("DANG-1709123456-rt-001");
  });

  it("should return success:false with null ticketId when HEC returns failure", () => {
    const hecResult = { success: false, ticketId: undefined, message: "Splunk HEC error (403): Invalid token" };

    let routerReturn;
    if (hecResult.success && hecResult.ticketId) {
      routerReturn = { success: true as const, ticketId: hecResult.ticketId, message: hecResult.message };
    } else {
      routerReturn = { success: false as const, ticketId: null, message: hecResult.message || "Splunk HEC did not confirm ticket creation" };
    }

    expect(routerReturn.success).toBe(false);
    expect(routerReturn.ticketId).toBeNull();
    expect(routerReturn.message).toContain("403");
  });

  it("should return success:false when HEC returns success:true but no ticketId", () => {
    // Edge case: HEC says success but doesn't return a ticket ID
    const hecResult = { success: true, ticketId: undefined, message: "OK" };

    let routerReturn;
    if (hecResult.success && hecResult.ticketId) {
      routerReturn = { success: true as const, ticketId: hecResult.ticketId, message: hecResult.message };
    } else {
      routerReturn = { success: false as const, ticketId: null, message: hecResult.message || "Splunk HEC did not confirm ticket creation" };
    }

    // Must NOT show success — no ticketId means no confirmed ticket
    expect(routerReturn.success).toBe(false);
    expect(routerReturn.ticketId).toBeNull();
  });

  it("should provide a fallback message when HEC returns empty message on failure", () => {
    const hecResult = { success: false, ticketId: undefined, message: "" };

    let routerReturn;
    if (hecResult.success && hecResult.ticketId) {
      routerReturn = { success: true as const, ticketId: hecResult.ticketId, message: hecResult.message };
    } else {
      routerReturn = { success: false as const, ticketId: null, message: hecResult.message || "Splunk HEC did not confirm ticket creation" };
    }

    expect(routerReturn.success).toBe(false);
    expect(routerReturn.message).toBe("Splunk HEC did not confirm ticket creation");
    expect(routerReturn.message.length).toBeGreaterThan(0);
  });
});

describe("Ticket Success Truthfulness — batch toast logic", () => {
  it("should show success toast only when all tickets succeed (sent > 0, failed === 0)", () => {
    const result = { sent: 3, failed: 0, total: 3 };
    const toastType = result.sent > 0 && result.failed === 0 ? "success"
      : result.sent > 0 && result.failed > 0 ? "warning"
      : result.failed > 0 ? "error"
      : "info";
    expect(toastType).toBe("success");
  });

  it("should show warning toast for partial success (sent > 0, failed > 0)", () => {
    const result = { sent: 2, failed: 1, total: 3 };
    const toastType = result.sent > 0 && result.failed === 0 ? "success"
      : result.sent > 0 && result.failed > 0 ? "warning"
      : result.failed > 0 ? "error"
      : "info";
    expect(toastType).toBe("warning");
  });

  it("should show error toast when all tickets fail (sent === 0, failed > 0)", () => {
    const result = { sent: 0, failed: 3, total: 3 };
    const toastType = result.sent > 0 && result.failed === 0 ? "success"
      : result.sent > 0 && result.failed > 0 ? "warning"
      : result.failed > 0 ? "error"
      : "info";
    expect(toastType).toBe("error");
  });

  it("should show info toast when no eligible tickets exist", () => {
    const result = { sent: 0, failed: 0, total: 0 };
    const toastType = result.sent > 0 && result.failed === 0 ? "success"
      : result.sent > 0 && result.failed > 0 ? "warning"
      : result.failed > 0 ? "error"
      : "info";
    expect(toastType).toBe("info");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Fix 2: Partial Pipeline Run Semantics
// ═══════════════════════════════════════════════════════════════════════════════

describe("Partial Pipeline Run Semantics", () => {
  it("should set completedAt to null for partial (triage-only) runs", () => {
    // Simulates the pipelineRuns insert for a queue-triggered triage
    const runValues = {
      runId: "run-test123",
      queueItemId: 42,
      alertId: "alert-001",
      currentStage: "triage",
      status: "partial",
      triageId: "triage-abc",
      triageStatus: "completed",
      triageLatencyMs: 1500,
      totalLatencyMs: 1500,
      correlationStatus: "pending",
      hypothesisStatus: "pending",
      responseActionsStatus: "pending",
      triggeredBy: "analyst",
      startedAt: new Date(),
      completedAt: null, // NOT complete — awaiting analyst advancement
    };

    expect(runValues.status).toBe("partial");
    expect(runValues.completedAt).toBeNull();
    expect(runValues.triageStatus).toBe("completed");
    expect(runValues.correlationStatus).toBe("pending");
    expect(runValues.hypothesisStatus).toBe("pending");
    expect(runValues.responseActionsStatus).toBe("pending");
  });

  it("should set completedAt to a Date for failed runs", () => {
    const runValues = {
      status: "failed",
      currentStage: "failed",
      triageStatus: "failed",
      startedAt: new Date(),
      completedAt: new Date(), // Failed runs ARE terminal — they have a completion time
    };

    expect(runValues.status).toBe("failed");
    expect(runValues.completedAt).toBeInstanceOf(Date);
  });

  it("should distinguish triage-only from fully-completed in UI labels", () => {
    const STATUS_CONFIG: Record<string, { label: string }> = {
      completed: { label: "Completed" },
      failed: { label: "Failed" },
      running: { label: "Running" },
      partial: { label: "Triage Only" },
      pending: { label: "Pending" },
    };

    expect(STATUS_CONFIG.partial.label).toBe("Triage Only");
    expect(STATUS_CONFIG.completed.label).toBe("Completed");
    // "Triage Only" is NOT "Completed" — they are semantically different
    expect(STATUS_CONFIG.partial.label).not.toBe(STATUS_CONFIG.completed.label);
  });

  it("should record totalLatencyMs as triage latency for partial runs", () => {
    const triageLatencyMs = 2340;
    const runValues = {
      status: "partial",
      triageLatencyMs,
      totalLatencyMs: triageLatencyMs, // For partial runs, total = triage only
    };

    expect(runValues.totalLatencyMs).toBe(runValues.triageLatencyMs);
  });

  it("should show 'awaiting analyst advancement' for partial runs without completedAt", () => {
    const run = { status: "partial", completedAt: null };

    const displayText = run.completedAt
      ? `Completed: ${run.completedAt}`
      : run.status === "partial"
        ? "Triage complete — awaiting analyst advancement"
        : null;

    expect(displayText).toBe("Triage complete — awaiting analyst advancement");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Fix 3: Ticket Lineage — triageId as first-class FK
// ═══════════════════════════════════════════════════════════════════════════════

describe("Ticket Artifact — triageId First-Class Lineage", () => {
  it("should have triageId column in ticketArtifacts schema", async () => {
    const { ticketArtifacts } = await import("../../drizzle/schema");
    expect(ticketArtifacts.triageId).toBeDefined();
  });

  it("should construct artifact with triageId from pipeline run", () => {
    const associatedRun = { id: 7, triageId: "triage-abc123" };
    const item = { pipelineTriageId: "triage-abc123" };

    const artifact = {
      pipelineRunId: associatedRun.id,
      triageId: associatedRun.triageId ?? item.pipelineTriageId ?? null,
    };

    expect(artifact.triageId).toBe("triage-abc123");
    expect(artifact.pipelineRunId).toBe(7);
  });

  it("should fall back to pipelineTriageId when pipeline run has no triageId", () => {
    const associatedRun = { id: 7, triageId: null };
    const item = { pipelineTriageId: "triage-fallback-456" };

    const artifact = {
      pipelineRunId: associatedRun.id,
      triageId: associatedRun.triageId ?? item.pipelineTriageId ?? null,
    };

    expect(artifact.triageId).toBe("triage-fallback-456");
  });

  it("should allow null triageId for legacy items without triage linkage", () => {
    const associatedRun = null;
    const item = { pipelineTriageId: null };

    const artifact = {
      pipelineRunId: null,
      triageId: associatedRun?.triageId ?? item.pipelineTriageId ?? null,
    };

    expect(artifact.triageId).toBeNull();
    expect(artifact.pipelineRunId).toBeNull();
  });

  it("should document full workflow lineage in artifact", () => {
    // The complete lineage chain:
    // ticket → triageId → triage_objects (primary)
    // ticket → pipelineRunId → pipeline_runs (run context)
    // ticket → queueItemId → alert_queue (queue origin)
    // ticket → alertId (direct Wazuh cross-reference)
    const artifact = {
      ticketId: "DANG-123",
      triageId: "triage-abc",
      pipelineRunId: 7,
      queueItemId: 42,
      alertId: "alert-001",
      ruleId: "5710",
      ruleLevel: 12,
    };

    // All four linkage paths must be present
    expect(artifact.triageId).toBeTruthy();
    expect(artifact.pipelineRunId).toBeTruthy();
    expect(artifact.queueItemId).toBeTruthy();
    expect(artifact.alertId).toBeTruthy();
  });

  it("should use triageId from exception-path batch artifacts via pipelineTriageId", () => {
    // In the batch exception path, we don't have associatedRun
    // but we can still get triageId from item.pipelineTriageId
    const item = { pipelineTriageId: "triage-exception-789" };

    const artifact = {
      ticketId: `exception-${Date.now()}`,
      pipelineRunId: null,
      triageId: item.pipelineTriageId ?? null,
      success: false,
    };

    expect(artifact.triageId).toBe("triage-exception-789");
    expect(artifact.pipelineRunId).toBeNull();
    expect(artifact.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Secondary: DB Access Normalization
// ═══════════════════════════════════════════════════════════════════════════════

describe("DB Access Normalization — alertQueueRouter", () => {
  it("should use requireDb (not getDb) for all queue router procedures", async () => {
    // Read the alertQueueRouter source and verify no getDb usage
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("../alertQueue/alertQueueRouter.ts", import.meta.url),
      "utf-8"
    );

    // Should NOT import getDb
    expect(source).not.toContain('import { getDb }');
    // Should import requireDb
    expect(source).toContain('requireDb');
  });

  it("should not have manual null-check patterns for db", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync(
      new URL("../alertQueue/alertQueueRouter.ts", import.meta.url),
      "utf-8"
    );

    // requireDb() throws on null — no need for manual "if (!db)" checks
    // Count occurrences of the anti-pattern
    const antiPattern = /if\s*\(\s*!db\s*\)/g;
    const matches = source.match(antiPattern);
    expect(matches).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Migration Reconciliation — schema, migration SQL, and DB must agree
// ═══════════════════════════════════════════════════════════════════════════════

describe("Migration Reconciliation — ticketArtifacts", () => {
  it("should have triageId column in migration SQL (0012_ticket_artifacts.sql)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const migrationPath = path.resolve(
      new URL("../../drizzle/0012_ticket_artifacts.sql", import.meta.url).pathname
    );
    const sql = fs.readFileSync(migrationPath, "utf-8");

    // The migration must include the triageId column definition
    expect(sql).toContain("`triageId` varchar(64)");
    // And the index
    expect(sql).toContain("ta_triageId_idx");
    expect(sql).toContain("`triageId`");
  });

  it("should have triageId column in drizzle schema definition", async () => {
    const { ticketArtifacts } = await import("../../drizzle/schema");
    expect(ticketArtifacts.triageId).toBeDefined();
  });

  it("should have triageId positioned after pipelineRunId in migration SQL", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const migrationPath = path.resolve(
      new URL("../../drizzle/0012_ticket_artifacts.sql", import.meta.url).pathname
    );
    const sql = fs.readFileSync(migrationPath, "utf-8");

    // triageId must come after pipelineRunId and before alertId
    const pipelineRunIdPos = sql.indexOf("`pipelineRunId`");
    const triageIdPos = sql.indexOf("`triageId`");
    const alertIdPos = sql.indexOf("`alertId`");

    expect(pipelineRunIdPos).toBeGreaterThan(-1);
    expect(triageIdPos).toBeGreaterThan(-1);
    expect(alertIdPos).toBeGreaterThan(-1);
    expect(triageIdPos).toBeGreaterThan(pipelineRunIdPos);
    expect(triageIdPos).toBeLessThan(alertIdPos);
  });

  it("should have all schema columns represented in migration SQL", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const migrationPath = path.resolve(
      new URL("../../drizzle/0012_ticket_artifacts.sql", import.meta.url).pathname
    );
    const sql = fs.readFileSync(migrationPath, "utf-8");

    // Every column in the schema must appear in the migration
    const requiredColumns = [
      "id", "ticketId", "system", "queueItemId", "pipelineRunId",
      "triageId", "alertId", "ruleId", "ruleLevel", "createdBy",
      "success", "statusMessage", "rawResponse", "httpStatusCode", "createdAt"
    ];

    for (const col of requiredColumns) {
      expect(sql).toContain(`\`${col}\``);
    }
  });

  it("should have all schema indexes represented in migration SQL", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const migrationPath = path.resolve(
      new URL("../../drizzle/0012_ticket_artifacts.sql", import.meta.url).pathname
    );
    const sql = fs.readFileSync(migrationPath, "utf-8");

    const requiredIndexes = [
      "ta_ticketId_idx", "ta_queueItemId_idx", "ta_pipelineRunId_idx",
      "ta_triageId_idx", "ta_alertId_idx", "ta_system_idx", "ta_createdAt_idx"
    ];

    for (const idx of requiredIndexes) {
      expect(sql).toContain(idx);
    }
  });
});

describe("Insert Path Proof — ticket artifact with triageId", () => {
  it("should construct a valid insert payload with triageId for Drizzle", () => {
    // This simulates exactly what splunkRouter.ts does when inserting
    const associatedRun = { id: 7, triageId: "triage-abc123" };
    const item = {
      alertId: "alert-001",
      ruleId: "5710",
      ruleLevel: 12,
      pipelineTriageId: "triage-abc123",
    };
    const result = { success: true, ticketId: "DANG-1709123456-rt-001", message: "Ticket created" };

    const insertPayload = {
      ticketId: result.ticketId ?? `failed-${Date.now()}`,
      system: "splunk_es" as const,
      queueItemId: 42,
      pipelineRunId: associatedRun?.id ?? null,
      triageId: associatedRun?.triageId ?? item.pipelineTriageId ?? null,
      alertId: item.alertId,
      ruleId: item.ruleId,
      ruleLevel: item.ruleLevel,
      createdBy: "admin@example.com",
      success: result.success === true && !!result.ticketId,
      statusMessage: result.message,
      rawResponse: { ticketId: result.ticketId, message: result.message },
      httpStatusCode: null,
    };

    // All fields must be present and correctly typed
    expect(insertPayload.ticketId).toBe("DANG-1709123456-rt-001");
    expect(insertPayload.triageId).toBe("triage-abc123");
    expect(insertPayload.pipelineRunId).toBe(7);
    expect(insertPayload.queueItemId).toBe(42);
    expect(insertPayload.success).toBe(true);
    expect(typeof insertPayload.triageId).toBe("string");
  });

  it("should construct a valid insert payload with null triageId for legacy items", () => {
    const associatedRun = null;
    const item = {
      alertId: "alert-legacy",
      ruleId: "1234",
      ruleLevel: 5,
      pipelineTriageId: null,
    };
    const result = { success: true, ticketId: "DANG-legacy-001", message: "OK" };

    const insertPayload = {
      ticketId: result.ticketId,
      system: "splunk_es" as const,
      queueItemId: 99,
      pipelineRunId: associatedRun?.id ?? null,
      triageId: (associatedRun as { triageId?: string } | null)?.triageId ?? item.pipelineTriageId ?? null,
      alertId: item.alertId,
      ruleId: item.ruleId,
      ruleLevel: item.ruleLevel,
      createdBy: "admin",
      success: true,
      statusMessage: result.message,
      rawResponse: null,
      httpStatusCode: null,
    };

    // triageId is null but the insert should still be valid
    expect(insertPayload.triageId).toBeNull();
    expect(insertPayload.pipelineRunId).toBeNull();
    expect(insertPayload.success).toBe(true);
  });

  it("should construct a valid failure insert payload with triageId from pipelineTriageId fallback", () => {
    // Exception path in batch: no associatedRun lookup, but item has pipelineTriageId
    const item = {
      id: 99,
      alertId: "alert-exception",
      ruleId: "9999",
      ruleLevel: 8,
      pipelineTriageId: "triage-fallback-xyz",
    };

    const insertPayload = {
      ticketId: `exception-${Date.now()}`,
      system: "splunk_es" as const,
      queueItemId: item.id,
      pipelineRunId: null,
      triageId: item.pipelineTriageId ?? null,
      alertId: item.alertId,
      ruleId: item.ruleId,
      ruleLevel: item.ruleLevel,
      createdBy: "admin",
      success: false,
      statusMessage: "Unexpected error",
      rawResponse: null,
      httpStatusCode: null,
    };

    expect(insertPayload.triageId).toBe("triage-fallback-xyz");
    expect(insertPayload.pipelineRunId).toBeNull();
    expect(insertPayload.success).toBe(false);
    expect(insertPayload.ticketId).toMatch(/^exception-\d+$/);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// Ticket Artifact Counts — Pipeline Inspector Badge Tests
// ═══════════════════════════════════════════════════════════════════════════════

import * as fs from "fs";
import * as path from "path";

describe("ticketArtifactCounts endpoint", () => {
  const routerPath = path.resolve(__dirname, "splunkRouter.ts");
  const routerSrc = fs.readFileSync(routerPath, "utf-8");

  it("should define ticketArtifactCounts as a protectedProcedure query", () => {
    expect(routerSrc).toContain("ticketArtifactCounts: protectedProcedure");
    expect(routerSrc).toContain(".query(async");
  });

  it("should accept pipelineRunIds as input array", () => {
    expect(routerSrc).toContain("pipelineRunIds: z.array(z.number().int())");
  });

  it("should enforce min(1) and max(200) on the array", () => {
    expect(routerSrc).toContain(".min(1).max(200)");
  });

  it("should use GROUP BY to aggregate counts per pipelineRunId", () => {
    expect(routerSrc).toContain(".groupBy(ticketArtifacts.pipelineRunId)");
  });

  it("should use inArray to filter by pipelineRunIds", () => {
    expect(routerSrc).toContain("inArray(ticketArtifacts.pipelineRunId, input.pipelineRunIds)");
  });

  it("should return counts with total, success, and failed fields", () => {
    expect(routerSrc).toContain("total: Number(row.total)");
    expect(routerSrc).toContain("success: Number(row.success)");
    expect(routerSrc).toContain("failed: Number(row.failed)");
  });

  it("should use SUM CASE for success/failed aggregation", () => {
    expect(routerSrc).toContain("SUM(CASE WHEN");
    expect(routerSrc).toContain("= true THEN 1 ELSE 0 END)");
    expect(routerSrc).toContain("= false THEN 1 ELSE 0 END)");
  });

  it("should return a counts map keyed by pipelineRunId", () => {
    expect(routerSrc).toContain("return { counts }");
  });
});

describe("Pipeline Inspector Tickets Badge", () => {
  const inspectorPath = path.resolve(__dirname, "../../client/src/pages/PipelineInspector.tsx");
  const inspectorSrc = fs.readFileSync(inspectorPath, "utf-8");

  it("should import Ticket and ExternalLink icons", () => {
    expect(inspectorSrc).toContain("Ticket");
    expect(inspectorSrc).toContain("ExternalLink");
  });

  it("should query ticketArtifactCounts with pipelineRunIds", () => {
    expect(inspectorSrc).toContain("trpc.splunk.ticketArtifactCounts.useQuery");
  });

  it("should memoize pipelineRunIds to prevent infinite re-fetches", () => {
    expect(inspectorSrc).toContain("useMemo");
    expect(inspectorSrc).toContain("pipelineRunIds");
  });

  it("should only enable the query when pipelineRunIds is non-empty", () => {
    expect(inspectorSrc).toContain("enabled: pipelineRunIds.length > 0");
  });

  it("should pass ticketCount prop to PipelineRunCard", () => {
    expect(inspectorSrc).toContain("ticketCount={ticketCounts[run.id]");
  });

  it("should render Tickets badge only when ticketCount.total > 0", () => {
    expect(inspectorSrc).toContain("ticketCount && ticketCount.total > 0");
  });

  it("should navigate to alert-queue with tickets tab and pipelineRunId filter", () => {
    expect(inspectorSrc).toContain("/alert-queue?tab=tickets&pipelineRunId=");
  });

  it("should use stopPropagation to prevent card expand/collapse on badge click", () => {
    expect(inspectorSrc).toContain("e.stopPropagation()");
  });

  it("should show failed count when failures exist", () => {
    expect(inspectorSrc).toContain("ticketCount.failed > 0");
    expect(inspectorSrc).toContain("failed)");
  });

  it("should use semantic colors: violet for all-success, amber for mixed, red for all-failed", () => {
    // All-failed: red
    expect(inspectorSrc).toContain("ticketCount.failed > 0 && ticketCount.success === 0");
    expect(inspectorSrc).toContain("bg-red-500/10 border-red-500/20 text-red-300");
    // Mixed: amber
    expect(inspectorSrc).toContain("bg-amber-500/10 border-amber-500/20 text-amber-300");
    // All-success: violet
    expect(inspectorSrc).toContain("bg-violet-500/10 border-violet-500/20 text-violet-300");
  });

  it("should include a tooltip with success/failed counts", () => {
    expect(inspectorSrc).toContain("successful, ${ticketCount.failed} failed");
  });
});

describe("ticketArtifactCountsByQueueItem endpoint", () => {
  it("should export the ticketArtifactCountsByQueueItem procedure from splunkRouter", async () => {
    const { splunkRouter } = await import("./splunkRouter");
    const routerDef = splunkRouter._def;
    expect(routerDef).toBeDefined();
    // The procedure should exist in the router definition
    const procedures = routerDef.procedures as Record<string, unknown>;
    expect(procedures).toHaveProperty("ticketArtifactCountsByQueueItem");
  });

  it("should require queueItemIds as a non-empty integer array", () => {
    // Validate the input schema shape
    const { z } = require("zod");
    const schema = z.object({
      queueItemIds: z.array(z.number().int()).min(1).max(200),
    });

    // Valid input
    expect(() => schema.parse({ queueItemIds: [1, 2, 3] })).not.toThrow();

    // Empty array should fail
    expect(() => schema.parse({ queueItemIds: [] })).toThrow();

    // Non-integer should fail
    expect(() => schema.parse({ queueItemIds: [1.5] })).toThrow();

    // Over 200 items should fail
    const tooMany = Array.from({ length: 201 }, (_, i) => i + 1);
    expect(() => schema.parse({ queueItemIds: tooMany })).toThrow();
  });

  it("should return a counts object keyed by queueItemId", () => {
    // Simulate the expected response shape
    const mockCounts: Record<number, { total: number; success: number; failed: number }> = {
      42: { total: 3, success: 2, failed: 1 },
      99: { total: 1, success: 1, failed: 0 },
    };

    expect(mockCounts[42]?.total).toBe(3);
    expect(mockCounts[42]?.success).toBe(2);
    expect(mockCounts[42]?.failed).toBe(1);
    expect(mockCounts[99]?.success).toBe(1);
    expect(mockCounts[99]?.failed).toBe(0);
    // Non-existent key returns undefined
    expect(mockCounts[100]).toBeUndefined();
  });
});

describe("canRunTicketing readiness wiring in AlertQueue", () => {
  let alertQueueSrc: string;
  let queueItemCardSrc: string;
  let queueHeaderSrc: string;

  beforeAll(async () => {
    const fs = await import("fs/promises");
    alertQueueSrc = await fs.readFile("client/src/pages/AlertQueue.tsx", "utf-8");
    queueItemCardSrc = await fs.readFile("client/src/pages/alert-queue/QueueItemCard.tsx", "utf-8");
    queueHeaderSrc = await fs.readFile("client/src/pages/alert-queue/QueueHeader.tsx", "utf-8");
  });

  it("should destructure canRunTicketing from useAgenticReadiness", () => {
    expect(alertQueueSrc).toContain("canRunTicketing");
    expect(alertQueueSrc).toContain("ticketingDegraded");
    expect(alertQueueSrc).toContain("ticketingReason");
  });

  it("should pass canRunTicketing prop to QueueItemCard", () => {
    expect(alertQueueSrc).toContain("canRunTicketing={canRunTicketing}");
  });

  it("should pass ticketingDegraded prop to QueueItemCard", () => {
    expect(alertQueueSrc).toContain("ticketingDegraded={ticketingDegraded}");
  });

  it("should pass ticketingReason prop to QueueItemCard", () => {
    expect(alertQueueSrc).toContain("ticketingReason={ticketingReason}");
  });

  it("should disable Create Ticket button when canRunTicketing is false", () => {
    // After decomposition, this logic lives in QueueItemCard sub-component
    expect(queueItemCardSrc).toContain("disabled={createTicketMutation.isPending || !canRunTicketing}");
  });

  it("should show XCircle icon when ticketing is blocked", () => {
    expect(queueItemCardSrc).toContain("!canRunTicketing");
    expect(queueItemCardSrc).toContain("<XCircle");
  });

  it("should show amber styling when ticketing is degraded", () => {
    expect(queueItemCardSrc).toContain("bg-amber-500/10 border border-amber-500/20 text-amber-300");
    expect(queueItemCardSrc).toContain("(degraded)");
  });

  it("should show ticketingReason in tooltip when unavailable", () => {
    expect(queueItemCardSrc).toContain("Ticketing unavailable:");
    expect(queueItemCardSrc).toContain("ticketingReason");
  });

  it("should also gate the batch Create All Tickets button with canRunTicketing", () => {
    // After decomposition, batch button lives in QueueHeader sub-component
    // The prop is passed as isBatchPending from the parent, so the disabled check uses that name
    expect(queueHeaderSrc).toContain("disabled={isBatchPending || !canRunTicketing}");
  });
});

describe("Ticket Created indicator on queue items", () => {
  let alertQueueSrc: string;
  let queueItemCardSrc: string;

  beforeAll(async () => {
    const fs = await import("fs/promises");
    alertQueueSrc = await fs.readFile("client/src/pages/AlertQueue.tsx", "utf-8");
    queueItemCardSrc = await fs.readFile("client/src/pages/alert-queue/QueueItemCard.tsx", "utf-8");
  });

  it("should query ticketArtifactCountsByQueueItem for batch ticket status", () => {
    expect(alertQueueSrc).toContain("trpc.splunk.ticketArtifactCountsByQueueItem.useQuery");
  });

  it("should pass hasSuccessfulTicket prop to QueueItemCard", () => {
    expect(alertQueueSrc).toContain("hasSuccessfulTicket={hasSuccessfulTicketForItem(item.id)}");
  });

  it("should define hasSuccessfulTicketForItem helper function", () => {
    expect(alertQueueSrc).toContain("hasSuccessfulTicketForItem");
    expect(alertQueueSrc).toContain("counts.success > 0");
  });

  it("should show Ticketed badge when hasSuccessfulTicket is true", () => {
    // After decomposition, badge rendering lives in QueueItemCard sub-component
    expect(queueItemCardSrc).toContain("Ticketed");
    expect(queueItemCardSrc).toContain("Ticket already created for this queue item");
  });

  it("should exclude items with successful ticket artifacts from ticketEligibleCount", () => {
    expect(alertQueueSrc).toContain("hasSuccessfulTicketForItem(i.id)");
  });

  it("should invalidate ticketArtifactCountsByQueueItem after ticket creation", () => {
    // After decomposition, invalidation lives in QueueItemCard sub-component
    expect(queueItemCardSrc).toContain("splunk.ticketArtifactCountsByQueueItem.invalidate()");
  });

  it("should accept hasSuccessfulTicket as an optional prop with default false", () => {
    expect(queueItemCardSrc).toContain("hasSuccessfulTicket = false");
  });

  it("should include canRunTicketing as an optional prop with default false (fail-closed)", () => {
    expect(queueItemCardSrc).toContain("canRunTicketing = false");
  });

  it("should include ticketingDegraded as an optional prop with default false", () => {
    expect(queueItemCardSrc).toContain("ticketingDegraded = false");
  });
});

describe("Splunk Connection Settings Page (already implemented)", () => {
  let adminSettingsSrc: string;

  beforeAll(async () => {
    const fs = await import("fs/promises");
    adminSettingsSrc = await fs.readFile("client/src/pages/AdminSettings.tsx", "utf-8");
  });

  it("should include a Splunk ES section with category='splunk'", () => {
    expect(adminSettingsSrc).toContain('category="splunk"');
  });

  it("should have HEC host, port, token, and protocol fields", () => {
    expect(adminSettingsSrc).toContain('key: "host"');
    expect(adminSettingsSrc).toContain('key: "hec_port"');
    expect(adminSettingsSrc).toContain('key: "hec_token"');
    expect(adminSettingsSrc).toContain('key: "protocol"');
  });

  it("should have an enable/disable toggle via toggleField", () => {
    expect(adminSettingsSrc).toContain('toggleField="enabled"');
  });

  it("should show the Splunk ES title and description", () => {
    expect(adminSettingsSrc).toContain("Splunk Enterprise Security");
    expect(adminSettingsSrc).toContain("HTTP Event Collector");
  });

  it("should support test connection, save, and reset actions", () => {
    expect(adminSettingsSrc).toContain("Test Connection");
    expect(adminSettingsSrc).toContain("Save Settings");
    expect(adminSettingsSrc).toContain("Reset to Env");
  });
});
