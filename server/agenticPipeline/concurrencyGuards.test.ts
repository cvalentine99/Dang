/**
 * Regression tests for audit fixes #26, #53, #83 (concurrency guards).
 *
 * These are source-level checks that verify the code patterns are correct,
 * not integration tests (those require a running DB).
 *
 * #26: Dedup guard in resumePipelineHelper — prevents double-resume on same pipeline run
 * #53: Auto-queue atomic increment — prevents race condition in rate limit counter
 * #83: Concurrent pipeline guard on same alert — prevents multiple pipelines on same alert
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
    const insertIdx = source.indexOf("db.insert(pipelineRuns)");
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

    // The guard should appear between runFullPipeline and the INSERT
    const chunk = source.slice(runFullIdx, runFullIdx + 2500);
    expect(chunk).toContain("Audit #83");
    expect(chunk).toContain('eq(pipelineRuns.status, "running")');
    expect(chunk).toContain("eq(pipelineRuns.alertId, alertId)");
  });

  it("throws CONFLICT when another pipeline is already processing the same alert", () => {
    const runFullIdx = source.indexOf("runFullPipeline: protectedProcedure");
    const chunk = source.slice(runFullIdx, runFullIdx + 2500);
    expect(chunk).toContain('"CONFLICT"');
    expect(chunk).toContain("already processing alert");
  });

  it("guard appears before the pipeline run INSERT", () => {
    const runFullIdx = source.indexOf("runFullPipeline: protectedProcedure");
    const chunk = source.slice(runFullIdx, runFullIdx + 2500);

    const guardIdx = chunk.indexOf("Audit #83");
    const insertIdx = chunk.indexOf("db.insert(pipelineRuns)");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(insertIdx);
  });

  it("skips guard for unknown alertId to avoid blocking legitimate runs", () => {
    const runFullIdx = source.indexOf("runFullPipeline: protectedProcedure");
    const chunk = source.slice(runFullIdx, runFullIdx + 2500);

    // Should skip the guard when alertId is "unknown"
    expect(chunk).toContain('alertId !== "unknown"');
  });

  it("guard uses and() to combine alertId and status conditions", () => {
    const runFullIdx = source.indexOf("runFullPipeline: protectedProcedure");
    const chunk = source.slice(runFullIdx, runFullIdx + 2500);

    // Should use and() for compound WHERE
    expect(chunk).toContain("and(");
  });
});
