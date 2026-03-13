import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── BUG-6: getDbCacheStats must use SQL aggregation, not full-table scan ─────

describe("BUG-6: getDbCacheStats uses aggregation", () => {
  const source = readFileSync(
    resolve(__dirname, "./otx/otxClient.ts"),
    "utf-8"
  );

  it("imports sql from drizzle-orm", () => {
    expect(source).toMatch(/import\s*\{[^}]*\bsql\b[^}]*\}\s*from\s*["']drizzle-orm["']/);
  });

  it("uses GROUP BY instead of full-table select", () => {
    expect(source).toContain(".groupBy(threatIntelCache.endpointType)");
  });

  it("uses COUNT(*) aggregation", () => {
    expect(source).toContain("COUNT(*)");
  });

  it("does not select full rows from threatIntelCache in getDbCacheStats", () => {
    // Extract the getDbCacheStats function body
    const fnStart = source.indexOf("async function getDbCacheStats");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = source.slice(fnStart, fnStart + 600);
    // Must NOT contain a bare .select() (full projection)
    // The pattern .select() with no arguments fetches all columns
    expect(fnBody).not.toMatch(/\.select\(\)\s*\n?\s*\.from\(threatIntelCache\)/);
  });

  it("selects only endpointType and count columns", () => {
    const fnStart = source.indexOf("async function getDbCacheStats");
    const fnBody = source.slice(fnStart, fnStart + 600);
    expect(fnBody).toContain("endpointType: threatIntelCache.endpointType");
    expect(fnBody).toContain('sql<number>`COUNT(*)`');
  });
});

// ── BUG-7: correlateFromTriage must report actual latency on error ────────────

describe("BUG-7: correlateFromTriage error latency", () => {
  const source = readFileSync(
    resolve(__dirname, "./agenticPipeline/pipelineRouter.ts"),
    "utf-8"
  );

  it("declares startTime before the try block in correlateFromTriage", () => {
    // Find the correlateFromTriage procedure definition (skip the comment reference)
    const fnStart = source.indexOf("correlateFromTriage: protectedProcedure");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = source.slice(fnStart, fnStart + 2000);
    // startTime must appear before the try block
    const startTimeIdx = fnBody.indexOf("const startTime = Date.now()");
    const tryIdx = fnBody.indexOf("try {");
    expect(startTimeIdx).toBeGreaterThan(-1);
    expect(tryIdx).toBeGreaterThan(-1);
    expect(startTimeIdx).toBeLessThan(tryIdx);
  });

  it("reports actual latency on error, not zero", () => {
    const fnStart = source.indexOf("correlateFromTriage: protectedProcedure");
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = source.slice(fnStart, fnStart + 2000);
    // The catch block must use Date.now() - startTime, not literal 0
    const catchIdx = fnBody.indexOf("catch (err)");
    expect(catchIdx).toBeGreaterThan(-1);
    const catchBody = fnBody.slice(catchIdx, catchIdx + 200);
    expect(catchBody).toContain("Date.now() - startTime");
    expect(catchBody).not.toContain("latencyMs: 0");
  });
});
