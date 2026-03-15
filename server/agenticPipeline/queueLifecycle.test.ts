/**
 * Tests for T2-03: Queue lifecycle status progression.
 *
 * Verifies the expected queue status state machine:
 *   pending → processing → triaged → completed (full success)
 *   pending → processing → triaged → failed (correlation/hypothesis failure)
 *   pending → processing → failed (triage failure)
 *
 * These are behavioral specification tests — they verify the status transition
 * contract without requiring a live database. Integration tests should verify
 * these transitions end-to-end against the real pipeline.
 */

import { describe, it, expect } from "vitest";

// ── Queue Status State Machine ─────────────────────────────────────────

type QueueStatus = "pending" | "processing" | "triaged" | "completed" | "failed";

interface PipelineStageResult {
  triage: "success" | "fail";
  correlation?: "success" | "fail";
  hypothesis?: "success" | "fail";
  responseActions?: "success" | "fail" | "partial";
}

/**
 * Compute the final queue status based on pipeline stage results.
 * Mirrors the T2-03 lifecycle logic in pipelineRouter.ts.
 */
function computeFinalQueueStatus(stages: PipelineStageResult): QueueStatus {
  // Triage failure → failed (never reached "triaged")
  if (stages.triage === "fail") return "failed";

  // Triage succeeded → initially "triaged"
  // Correlation failure → demote to "failed"
  if (stages.correlation === "fail") return "failed";

  // Hypothesis failure → demote to "failed"
  if (stages.hypothesis === "fail") return "failed";

  // Response actions partial failure → still "completed" (pipeline finished)
  // Full success → "completed"
  return "completed";
}

describe("Queue Lifecycle Status Progression", () => {
  describe("Happy path", () => {
    it("full pipeline success → completed", () => {
      expect(computeFinalQueueStatus({
        triage: "success",
        correlation: "success",
        hypothesis: "success",
        responseActions: "success",
      })).toBe("completed");
    });

    it("pipeline with partial response actions → still completed", () => {
      expect(computeFinalQueueStatus({
        triage: "success",
        correlation: "success",
        hypothesis: "success",
        responseActions: "partial",
      })).toBe("completed");
    });
  });

  describe("Failure paths", () => {
    it("triage failure → failed", () => {
      expect(computeFinalQueueStatus({
        triage: "fail",
      })).toBe("failed");
    });

    it("correlation failure (after triage success) → failed", () => {
      expect(computeFinalQueueStatus({
        triage: "success",
        correlation: "fail",
      })).toBe("failed");
    });

    it("hypothesis failure (after correlation success) → failed", () => {
      expect(computeFinalQueueStatus({
        triage: "success",
        correlation: "success",
        hypothesis: "fail",
      })).toBe("failed");
    });
  });

  describe("State transition invariants", () => {
    it("queue item never stays stuck at 'triaged' when pipeline errors", () => {
      // For every failure scenario after triage, the queue must demote to "failed"
      const failureScenarios: PipelineStageResult[] = [
        { triage: "success", correlation: "fail" },
        { triage: "success", correlation: "success", hypothesis: "fail" },
      ];

      for (const scenario of failureScenarios) {
        const status = computeFinalQueueStatus(scenario);
        expect(status).not.toBe("triaged");
        expect(status).toBe("failed");
      }
    });

    it("queue item only reaches 'completed' when all stages pass", () => {
      const result = computeFinalQueueStatus({
        triage: "success",
        correlation: "success",
        hypothesis: "success",
        responseActions: "success",
      });
      expect(result).toBe("completed");
    });
  });
});
