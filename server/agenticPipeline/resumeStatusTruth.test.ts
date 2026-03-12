/**
 * BUG-3 Regression Test: resumePipelineHelper status truth
 *
 * Validates that result.status at end-of-function does NOT unconditionally
 * overwrite a previously-set non-running status (e.g., "partial", "failed").
 *
 * The bug: line 595 had `result.status = "completed"` which overwrote any
 * "partial" status set in catch blocks, causing the API response to say
 * "completed" when the DB correctly said "partial".
 *
 * The fix: guard the assignment so only the default "running" status gets
 * promoted to "completed".
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

describe("BUG-3: resumePipelineHelper status truth", () => {
  const sourceFile = path.resolve(__dirname, "resumePipelineHelper.ts");
  const source = fs.readFileSync(sourceFile, "utf-8");

  it("does not overwrite partial status with completed", () => {
    // The unconditional `result.status = "completed"` must NOT appear.
    // Instead, the guarded form must be present.
    const lines = source.split("\n");

    // Find all lines that assign result.status = "completed"
    const unconditionalCompletedAssignments = lines.filter(
      (line) =>
        line.includes('result.status = "completed"') &&
        !line.trim().startsWith("//") &&
        !line.trim().startsWith("*"),
    );

    // Every `result.status = "completed"` must be inside a guard block.
    // Search for the guarded pattern: `if (result.status === "running")` immediately
    // before `result.status = "completed"`
    for (const completedLine of unconditionalCompletedAssignments) {
      const idx = lines.indexOf(completedLine);
      // The preceding non-empty line should be the guard
      let guardIdx = idx - 1;
      while (guardIdx >= 0 && lines[guardIdx].trim() === "") guardIdx--;
      const guardLine = lines[guardIdx]?.trim() ?? "";
      expect(
        guardLine,
        `Line ${idx + 1}: result.status = "completed" must be guarded by a status check`,
      ).toMatch(/if\s*\(\s*result\.status\s*===\s*"running"\s*\)/);
    }
  });

  it("sets result.status to running as initial default", () => {
    // Verify the initial status is "running" so the guard works correctly
    expect(source).toContain('status: "running"');
  });

  it("has guarded completed assignment (not unconditional)", () => {
    // The specific fix pattern must exist in the source
    const guardPattern = /if\s*\(\s*result\.status\s*===\s*"running"\s*\)\s*\{\s*\n\s*result\.status\s*=\s*"completed"/m;
    expect(source).toMatch(guardPattern);
  });

  it("catch blocks set result.status to partial before returning", () => {
    // Every catch block that returns result should set status to "partial" or "failed"
    // This ensures the guard at the end preserves those statuses
    const catchBlocks = source.match(/}\s*catch\s*\(err\)\s*\{[\s\S]*?return result;/g) ?? [];
    expect(catchBlocks.length).toBeGreaterThan(0);

    for (const block of catchBlocks) {
      const setsPartialOrFailed =
        block.includes('result.status = "partial"') ||
        block.includes('result.status = "failed"');
      expect(
        setsPartialOrFailed,
        "Every catch block that returns result must set result.status to partial or failed",
      ).toBe(true);
    }
  });
});
