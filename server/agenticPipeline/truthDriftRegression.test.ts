/**
 * Truth-Drift Regression Tests
 *
 * Part A: Verify syncCaseSummaryAtomic refreshes denormalized workingTheory
 *         and theoryConfidence from caseData on every state transition.
 *
 * Part B: Verify QueueItemCard polls for pipeline run status when the
 *         server-side pipeline is in "running" state (passive-viewer refresh).
 *
 * These are source-level regression tests: they read the actual source code
 * to verify the fix patterns exist, preventing future regressions where
 * someone removes the fix during refactoring.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ═══════════════════════════════════════════════════════════════════════════════
// PART A: Denormalized workingTheory/theoryConfidence staleness fix
// ═══════════════════════════════════════════════════════════════════════════════

describe("Part A: syncCaseSummaryAtomic refreshes workingTheory/theoryConfidence", () => {
  const stateMachineSrc = readFileSync(
    resolve(__dirname, "stateMachine.ts"),
    "utf-8"
  );

  it("syncCaseSummaryAtomic sets workingTheory in the UPDATE", () => {
    // The fix: syncCaseSummaryAtomic must include workingTheory in its .set() call
    // so the denormalized column stays in sync with caseData.workingTheory.statement
    expect(stateMachineSrc).toContain("workingTheory: refreshedTheory");
  });

  it("syncCaseSummaryAtomic sets theoryConfidence in the UPDATE", () => {
    // The fix: syncCaseSummaryAtomic must include theoryConfidence in its .set() call
    // so the denormalized column stays in sync with caseData.workingTheory.confidence
    expect(stateMachineSrc).toContain("theoryConfidence: refreshedConfidence");
  });

  it("refreshedTheory falls back to caseRow.workingTheory when caseData has no theory", () => {
    // The ?? fallback ensures we don't null out the column when caseData.workingTheory is absent
    expect(stateMachineSrc).toContain(
      "caseData.workingTheory?.statement ?? caseRow.workingTheory"
    );
  });

  it("refreshedConfidence falls back to caseRow.theoryConfidence when caseData has no theory", () => {
    // The ?? fallback ensures we don't null out the column when caseData.workingTheory is absent
    expect(stateMachineSrc).toContain(
      "caseData.workingTheory?.confidence ?? caseRow.theoryConfidence"
    );
  });

  it("workingTheory and theoryConfidence are set in the same .set() call as pendingActionCount", () => {
    // All denorm columns must be updated in a SINGLE atomic UPDATE to prevent drift windows.
    // Extract the .set({...}) block that contains pendingActionCount and verify it also has the theory fields.
    const setBlockMatch = stateMachineSrc.match(
      /\.set\(\{[^}]*pendingActionCount[^}]*\}\)/s
    );
    expect(setBlockMatch).not.toBeNull();
    const setBlock = setBlockMatch![0];
    expect(setBlock).toContain("workingTheory:");
    expect(setBlock).toContain("theoryConfidence:");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PART B: PipelineStageIndicator passive-viewer refresh
// ═══════════════════════════════════════════════════════════════════════════════

describe("Part B: QueueItemCard polls when pipeline is running", () => {
  const queueItemCardSrc = readFileSync(
    resolve(__dirname, "../../client/src/pages/alert-queue/QueueItemCard.tsx"),
    "utf-8"
  );

  it("refetchInterval checks server-side pipeline running status", () => {
    // The fix: refetchInterval must check if the pipeline run status is "running"
    // so passive viewers who didn't trigger the mutation still see updates.
    expect(queueItemCardSrc).toContain('run?.status === "running"');
  });

  it("refetchInterval uses a function callback (not just a static value)", () => {
    // A function callback is required so we can inspect the current query data
    // to decide whether to poll. A static boolean/number can't do this.
    expect(queueItemCardSrc).toContain("refetchInterval: (query)");
  });

  it("polls at 3000ms when pipeline is running server-side", () => {
    // 3s is the polling interval for running pipelines — frequent enough for
    // responsive UI but not hammering the server.
    expect(queueItemCardSrc).toContain("return 3_000");
  });

  it("still polls at 2000ms when mutations are pending", () => {
    // During active mutations (user-triggered), we poll faster at 2s
    expect(queueItemCardSrc).toContain("return 2_000");
  });

  it("returns false (no polling) when neither mutations are pending nor pipeline is running", () => {
    // When the pipeline is completed/failed/partial and no mutations in-flight, stop polling
    expect(queueItemCardSrc).toContain("return false");
  });
});
