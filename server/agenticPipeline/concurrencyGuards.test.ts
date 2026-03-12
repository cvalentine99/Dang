/**
 * Regression tests for audit fixes #26, #53, #54, #83 (concurrency guards).
 *
 * These are source-level checks that verify the code patterns are correct,
 * not integration tests (those require a running DB).
 *
 * #26: Dedup guard in resumePipelineHelper — prevents double-resume on same pipeline run
 * #53: Auto-queue atomic increment — prevents race condition in rate limit counter
 * #83: Concurrent pipeline guard on same alert — prevents multiple pipelines on same alert
 * #54: Overlap guard on auto-queue poller — prevents concurrent poll cycles from double-processing
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../..");

function readSource(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), "utf-8");
}

// ═══════════════════════════════════════════════════════════════════════════════
// #26: Dedup guard in resumePipelineHelper
// ═══════════════════════════════════════════════════════════════════════════════
describe("Audit #26: Dedup guard in resumePipelineHelper", () => {
  const source = readSource("server/agenticPipeline/resumePipelineHelper.ts");

  it("checks for existing running pipeline on same alert before creating new run", () => {
    // The dedup guard should query for running pipelines with the same alertId
    expect(source).toContain('eq(pipelineRuns.status, "running")');
    expect(source).toContain("ne(pipelineRuns.runId, input.runId)");
  });

  it("throws CONFLICT when another run is already in-flight", () => {
    expect(source).toContain('"CONFLICT"');
    expect(source).toContain("already in-flight");
  });

  it("dedup guard appears before the new pipeline run INSERT", () => {
    const dedupIdx = source.indexOf("Audit #26");
    // INSERT is inside a transaction (tx.insert, not db.insert)
    const insertIdx = source.indexOf("tx.insert(pipelineRuns)");
    expect(dedupIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(dedupIdx).toBeLessThan(insertIdx);
  });

  it("imports ne from drizzle-orm for the exclusion check", () => {
    expect(source).toMatch(/import\s*{[^}]*ne[^}]*}\s*from\s*["']drizzle-orm["']/);
  });

  it("still allows resume when original run is not running", () => {
    // The existing check for originalRun.status === "running" should still be there
    expect(source).toContain('originalRun.status === "running"');
    expect(source).toContain("Cannot resume a currently running pipeline");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// #53: Auto-queue atomic increment
// ═══════════════════════════════════════════════════════════════════════════════
describe("Audit #53: Auto-queue atomic increment", () => {
  const source = readSource("server/alertQueue/autoQueueRouter.ts");

  it("uses SQL expression for atomic increment instead of read-then-write", () => {
    // Should use SQL template literal for increment: currentHourCount + 1
    // instead of the old pattern: rule.currentHourCount + 1
    const checkRateLimitIdx = source.indexOf("async function checkRateLimit");
    expect(checkRateLimitIdx).toBeGreaterThan(-1);
    const fnBody = source.slice(checkRateLimitIdx, checkRateLimitIdx + 1500);

    // Should NOT have the old read-then-write pattern
    expect(fnBody).not.toContain("rule.currentHourCount + 1");

    // Should have SQL-level atomic increment
    expect(fnBody).toContain("autoQueueRules.currentHourCount");
    expect(fnBody).toContain("+ 1");
  });

  it("uses WHERE guard to enforce rate limit atomically", () => {
    const checkRateLimitIdx = source.indexOf("async function checkRateLimit");
    const fnBody = source.slice(checkRateLimitIdx, checkRateLimitIdx + 1500);

    // Should have a WHERE clause that checks count < maxPerHour
    expect(fnBody).toContain("autoQueueRules.currentHourCount");
    expect(fnBody).toContain("autoQueueRules.maxPerHour");
  });

  it("checks affectedRows to determine if increment succeeded", () => {
    const checkRateLimitIdx = source.indexOf("async function checkRateLimit");
    const fnBody = source.slice(checkRateLimitIdx, checkRateLimitIdx + 1500);

    // Should check affectedRows to know if the atomic UPDATE succeeded
    expect(fnBody).toContain("affectedRows");
  });

  it("still resets counter when hour window expires", () => {
    const checkRateLimitIdx = source.indexOf("async function checkRateLimit");
    const fnBody = source.slice(checkRateLimitIdx, checkRateLimitIdx + 1500);

    // Should still have the hour window expiration check
    expect(fnBody).toContain("3600_000");
    expect(fnBody).toContain("currentHourCount: 1");
    expect(fnBody).toContain("currentHourStart: now");
  });

  it("returns boolean indicating whether rate limit allows queueing", () => {
    const checkRateLimitIdx = source.indexOf("async function checkRateLimit");
    const fnBody = source.slice(checkRateLimitIdx, checkRateLimitIdx + 1500);

    // Function should return true/false based on affectedRows
    expect(fnBody).toContain("return true");
    // The affectedRows check returns the boolean result
    expect(fnBody).toMatch(/return.*affectedRows/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// #83: Concurrent pipeline guard on same alert
// ═══════════════════════════════════════════════════════════════════════════════
describe("Audit #83: Concurrent pipeline guard on same alert", () => {
  const source = readSource("server/agenticPipeline/pipelineRouter.ts");

  it("checks for existing running pipeline before creating new run in runFullPipeline", () => {
    // Find the runFullPipeline procedure
    const runFullIdx = source.indexOf("runFullPipeline: protectedProcedure");
    expect(runFullIdx).toBeGreaterThan(-1);

    // The guard is inside a transaction that also includes stale-run TTL cleanup,
    // so we need a wider window to capture both the guard and INSERT.
    const chunk = source.slice(runFullIdx, runFullIdx + 4500);
    expect(chunk).toContain("Audit #83");
    expect(chunk).toContain('eq(pipelineRuns.status, "running")');
    expect(chunk).toContain("eq(pipelineRuns.alertId, alertId)");
  });

  it("throws CONFLICT when another pipeline is already processing the same alert", () => {
    const runFullIdx = source.indexOf("runFullPipeline: protectedProcedure");
    const chunk = source.slice(runFullIdx, runFullIdx + 4500);
    expect(chunk).toContain('"CONFLICT"');
    expect(chunk).toContain("already processing alert");
  });

  it("guard appears before the pipeline run INSERT", () => {
    const runFullIdx = source.indexOf("runFullPipeline: protectedProcedure");
    const chunk = source.slice(runFullIdx, runFullIdx + 4500);

    const guardIdx = chunk.indexOf("Audit #83");
    // INSERT is inside the same transaction (tx.insert, not db.insert)
    const insertIdx = chunk.indexOf("tx.insert(pipelineRuns)");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(insertIdx);
  });

  it("guard is wrapped in a transaction with FOR UPDATE to eliminate TOCTOU race", () => {
    const runFullIdx = source.indexOf("runFullPipeline: protectedProcedure");
    const chunk = source.slice(runFullIdx, runFullIdx + 4500);

    // Guard and INSERT share a transaction; the SELECT uses FOR UPDATE
    expect(chunk).toContain("db.transaction(async (tx)");
    expect(chunk).toContain('.for("update")');
  });

  it("guard uses and() to combine alertId and status conditions", () => {
    const runFullIdx = source.indexOf("runFullPipeline: protectedProcedure");
    const chunk = source.slice(runFullIdx, runFullIdx + 4500);

    // Should use and() for compound WHERE
    expect(chunk).toContain("and(");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// #54: Overlap guard on auto-queue poller
// ═══════════════════════════════════════════════════════════════════════════════
describe("Audit #54: Overlap guard on auto-queue poller", () => {
  const source = readSource("server/alertQueue/autoQueueRouter.ts");

  it("declares _pollInFlight boolean flag at module level", () => {
    expect(source).toContain("let _pollInFlight = false;");
  });

  it("checks _pollInFlight at the start of pollAndEnqueue", () => {
    const fnIdx = source.indexOf("async function pollAndEnqueue");
    expect(fnIdx).toBeGreaterThan(-1);
    const fnBody = source.slice(fnIdx, fnIdx + 500);
    expect(fnBody).toContain("if (_pollInFlight)");
  });

  it("returns early with skip message when poll is already in-flight", () => {
    const fnIdx = source.indexOf("async function pollAndEnqueue");
    const fnBody = source.slice(fnIdx, fnIdx + 500);
    expect(fnBody).toContain("previous poll still in-flight");
    // Should return a result with the skip error, not throw
    expect(fnBody).toContain("Skipped: previous poll still in-flight");
  });

  it("sets _pollInFlight = true before the try block", () => {
    const fnIdx = source.indexOf("async function pollAndEnqueue");
    const fnBody = source.slice(fnIdx, fnIdx + 600);
    const setTrueIdx = fnBody.indexOf("_pollInFlight = true");
    const tryIdx = fnBody.indexOf("try {");
    expect(setTrueIdx).toBeGreaterThan(-1);
    expect(tryIdx).toBeGreaterThan(-1);
    expect(setTrueIdx).toBeLessThan(tryIdx);
  });

  it("resets _pollInFlight in a finally block for guaranteed cleanup", () => {
    expect(source).toContain("} finally {");
    // The finally block should set _pollInFlight = false
    const finallyIdx = source.indexOf("} finally {");
    const resetIdx = source.indexOf("_pollInFlight = false", finallyIdx);
    expect(resetIdx).toBeGreaterThan(finallyIdx);
    // The reset should be close to the finally (within 200 chars)
    expect(resetIdx - finallyIdx).toBeLessThan(200);
  });

  it("overlap guard check appears before _pollInFlight = true", () => {
    const fnIdx = source.indexOf("async function pollAndEnqueue");
    const fnBody = source.slice(fnIdx, fnIdx + 500);
    const guardIdx = fnBody.indexOf("if (_pollInFlight)");
    const setIdx = fnBody.indexOf("_pollInFlight = true");
    expect(guardIdx).toBeLessThan(setIdx);
  });

  it("exposes __test_isPollInFlight for testing", () => {
    expect(source).toContain("export function __test_isPollInFlight");
  });

  it("logs a skip message when overlap is detected", () => {
    const fnIdx = source.indexOf("async function pollAndEnqueue");
    const fnBody = source.slice(fnIdx, fnIdx + 500);
    expect(fnBody).toContain('[AutoQueue] Poll skipped');
  });
});
