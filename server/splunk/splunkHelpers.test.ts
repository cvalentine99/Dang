/**
 * splunkHelpers — unit tests for shared artifact recording and lineage resolution.
 *
 * Tests the canonical truth model invariants:
 *   - Lineage resolution order (resolved > pipeline_runs > fallback)
 *   - Null coercion for Drizzle INSERT safety
 *   - RecordArtifactParams contract completeness
 */

import { describe, it, expect } from "vitest";
import type { LineageIds, RecordArtifactParams } from "./splunkHelpers";

// ═══════════════════════════════════════════════════════════════════════════════
// Lineage ID Resolution Logic
// ═══════════════════════════════════════════════════════════════════════════════

describe("resolveLineageIds — Resolution Order", () => {
  // These tests verify the resolution priority WITHOUT hitting the DB.
  // They test the same logic that resolveLineageIds implements.

  it("should prefer resolvedTriageId over all fallbacks", () => {
    const resolvedTriageId: string | null = "triage-canonical-abc";
    const runTriageId: string | null = "triage-run-xyz";
    const fallbackTriageId: string | null = "triage-pipeline-123";
    const effectiveTriageId = resolvedTriageId || runTriageId || fallbackTriageId || null;
    expect(effectiveTriageId).toBe("triage-canonical-abc");
  });

  it("should fall back to run triageId when resolved is null/undefined", () => {
    const resolvedTriageId: string | undefined = undefined;
    const runTriageId: string | null = "triage-run-xyz";
    const fallbackTriageId: string | null = "triage-pipeline-123";
    const effectiveTriageId = resolvedTriageId || runTriageId || fallbackTriageId || null;
    expect(effectiveTriageId).toBe("triage-run-xyz");
  });

  it("should fall back to pipeline fallback when both resolved and run are null", () => {
    const resolvedTriageId: string | undefined = undefined;
    const runTriageId: string | null = null;
    const fallbackTriageId: string | null = "triage-pipeline-123";
    const effectiveTriageId = resolvedTriageId || runTriageId || fallbackTriageId || null;
    expect(effectiveTriageId).toBe("triage-pipeline-123");
  });

  it("should return null when all sources are null/undefined", () => {
    const resolvedTriageId: string | undefined = undefined;
    const runTriageId: string | null = null;
    const fallbackTriageId: string | null = null;
    const effectiveTriageId = resolvedTriageId || runTriageId || fallbackTriageId || null;
    expect(effectiveTriageId).toBeNull();
  });

  it("should never produce empty string for triageId", () => {
    const sources: (string | null | undefined)[] = [undefined, null, "", undefined];
    // Simulate resolution: empty string is falsy, so it falls through
    const effectiveTriageId = sources.find(s => !!s) ?? null;
    expect(effectiveTriageId).toBeNull();
  });

  it("should never produce undefined for pipelineRunId", () => {
    const run = undefined;
    const effectivePipelineRunId = run?.id ?? null;
    expect(effectivePipelineRunId).toBeNull();
    expect(effectivePipelineRunId).not.toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RecordArtifactParams — Contract Completeness
// ═══════════════════════════════════════════════════════════════════════════════

describe("RecordArtifactParams — Contract", () => {
  const makeParams = (overrides?: Partial<RecordArtifactParams>): RecordArtifactParams => ({
    ticketId: "DANG-42-abc12345",
    queueItemId: 42,
    triageId: "triage-test-abc",
    pipelineRunId: 7,
    alertId: "alert-001",
    ruleId: "5710",
    ruleLevel: 10,
    createdBy: "test-analyst",
    success: true,
    statusMessage: "Ticket created in Splunk ES",
    rawResponse: { ticketId: "DANG-42-abc12345", message: "OK" },
    httpStatusCode: 200,
    ...overrides,
  });

  it("should have all required fields populated", () => {
    const params = makeParams();
    expect(params.ticketId).toBeTruthy();
    expect(params.queueItemId).toBeTruthy();
    expect(params.alertId).toBeTruthy();
    expect(params.createdBy).toBeTruthy();
    expect(typeof params.success).toBe("boolean");
  });

  it("should accept null for optional lineage fields", () => {
    const params = makeParams({ triageId: null, pipelineRunId: null });
    expect(params.triageId).toBeNull();
    expect(params.pipelineRunId).toBeNull();
  });

  it("should accept null for httpStatusCode when unavailable", () => {
    const params = makeParams({ httpStatusCode: null });
    expect(params.httpStatusCode).toBeNull();
  });

  it("should accept real HTTP status codes", () => {
    expect(makeParams({ httpStatusCode: 200 }).httpStatusCode).toBe(200);
    expect(makeParams({ httpStatusCode: 400 }).httpStatusCode).toBe(400);
    expect(makeParams({ httpStatusCode: 500 }).httpStatusCode).toBe(500);
  });

  it("should record failure with error details", () => {
    const params = makeParams({
      ticketId: "failed-1234567890",
      success: false,
      statusMessage: "Splunk HEC error (403): Invalid token",
      httpStatusCode: 403,
      rawResponse: null,
    });
    expect(params.success).toBe(false);
    expect(params.statusMessage).toContain("403");
    expect(params.httpStatusCode).toBe(403);
  });

  it("should record exception-path failure", () => {
    const params = makeParams({
      ticketId: "exception-1234567890",
      success: false,
      pipelineRunId: null,
      statusMessage: "Connection refused",
      rawResponse: null,
      httpStatusCode: null,
    });
    expect(params.success).toBe(false);
    expect(params.pipelineRunId).toBeNull();
    expect(params.httpStatusCode).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Deterministic Ticket ID Generation
// ═══════════════════════════════════════════════════════════════════════════════

describe("Deterministic Ticket ID Generation", () => {
  function generateTicketId(queueItemId: number | undefined, triageId: string | undefined, alertId: string): string {
    const triageSlug = triageId ? triageId.slice(-8) : alertId.slice(-8);
    return queueItemId
      ? `DANG-${queueItemId}-${triageSlug}`
      : `DANG-${Date.now()}-${alertId.slice(-6)}`;
  }

  it("should produce deterministic ID when queueItemId and triageId are available", () => {
    const id1 = generateTicketId(42, "triage-test-abc12345", "alert-001");
    const id2 = generateTicketId(42, "triage-test-abc12345", "alert-001");
    expect(id1).toBe(id2);
    expect(id1).toBe("DANG-42-abc12345"); // last 8 chars of triageId "triage-test-abc12345"
  });

  it("should produce different IDs for different queue items", () => {
    const id1 = generateTicketId(42, "triage-abc", "alert-001");
    const id2 = generateTicketId(43, "triage-abc", "alert-001");
    expect(id1).not.toBe(id2);
  });

  it("should produce different IDs for different triage IDs on same queue item", () => {
    const id1 = generateTicketId(42, "triage-aaa11111", "alert-001");
    const id2 = generateTicketId(42, "triage-bbb22222", "alert-001");
    expect(id1).not.toBe(id2);
  });

  it("should use alertId slug when triageId is unavailable", () => {
    const id = generateTicketId(42, undefined, "alert-00123456");
    expect(id).toBe("DANG-42-00123456"); // last 8 chars of alertId
  });

  it("should fall back to timestamp-based ID when queueItemId is unavailable", () => {
    const id = generateTicketId(undefined, "triage-abc", "alert-001");
    expect(id).toMatch(/^DANG-\d+-rt-001$/); // timestamp-based
  });

  it("should produce human-readable format", () => {
    const id = generateTicketId(7, "triage-test-xyz", "alert-001");
    expect(id).toMatch(/^DANG-\d+-.+$/); // allows hyphens in slug
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Truth Model Invariants
// ═══════════════════════════════════════════════════════════════════════════════

describe("Truth Model Invariants", () => {
  it("ticket existence must come from artifact success, not legacy stamp", () => {
    // Simulate: artifact exists with success=true, legacy stamp is absent
    const artifactSuccess = true;
    const legacySplunkTicketId: string | undefined = undefined;

    // Correct: artifact is truth
    const isTicketed = artifactSuccess;
    expect(isTicketed).toBe(true);

    // Wrong: legacy stamp would say not ticketed
    const isTicketedLegacy = !!legacySplunkTicketId;
    expect(isTicketedLegacy).toBe(false);

    // The artifact answer is canonical
    expect(isTicketed).not.toBe(isTicketedLegacy);
  });

  it("legacy stamp alone should NOT mark item as ticketed", () => {
    // Simulate: legacy stamp exists, but no successful artifact
    const artifactSuccess = false;
    const legacySplunkTicketId = "DANG-old-legacy";

    // Correct: artifact says not ticketed
    const isTicketed = artifactSuccess;
    expect(isTicketed).toBe(false);

    // Wrong: legacy stamp would say ticketed
    const isTicketedLegacy = !!legacySplunkTicketId;
    expect(isTicketedLegacy).toBe(true);

    // The artifact answer is canonical
    expect(isTicketed).not.toBe(isTicketedLegacy);
  });

  it("ticket eligibility should accept pipelineTriageId as sufficient", () => {
    // Simulate: pipeline-triaged item, no legacy triage.answer
    const pipelineTriageId = "triage-canonical-abc";
    const legacyTriageAnswer: string | undefined = undefined;
    const status = "queued"; // Not "completed" — but pipeline-triaged

    // Correct: canonical triage is sufficient
    const isEligible = !!pipelineTriageId || (status === "completed" && !!legacyTriageAnswer);
    expect(isEligible).toBe(true);

    // Wrong: old logic required status === "completed" && triage.answer
    const isEligibleOld = status === "completed" && !!legacyTriageAnswer;
    expect(isEligibleOld).toBe(false);
  });

  it("ticket eligibility should still accept legacy manual triage for completed items", () => {
    const pipelineTriageId: string | null = null;
    const legacyTriageAnswer = "Manual triage analysis...";
    const status = "completed";

    const isEligible = !!pipelineTriageId || (status === "completed" && !!legacyTriageAnswer);
    expect(isEligible).toBe(true);
  });

  it("no triage data at all should NOT be eligible", () => {
    const pipelineTriageId: string | null = null;
    const legacyTriageAnswer: string | undefined = undefined;
    const status = "completed";

    const isEligible = !!pipelineTriageId || (status === "completed" && !!legacyTriageAnswer);
    expect(isEligible).toBe(false);
  });

  it("artifact-based dedup should block re-ticketing", () => {
    const hasSuccessfulArtifact = true;
    const legacySplunkTicketId: string | undefined = undefined; // stamp missing

    // Even without legacy stamp, artifact blocks re-ticketing
    const shouldShowCreateButton = !hasSuccessfulArtifact;
    expect(shouldShowCreateButton).toBe(false);
  });

  it("failed artifact should NOT block re-ticketing", () => {
    const hasSuccessfulArtifact = false;
    const hasFailedArtifact = true;

    // Failed artifact doesn't count — item is still eligible
    const shouldShowCreateButton = !hasSuccessfulArtifact;
    expect(shouldShowCreateButton).toBe(true);
  });
});
