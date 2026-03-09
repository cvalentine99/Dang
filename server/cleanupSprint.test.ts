/**
 * Cleanup Sprint Regression Tests
 *
 * Covers:
 *   #60 — Indexes on ragSessions and savedSearches
 *   #76/#86 — Truthiness bugs on numeric inputs (offset=0, limit=0)
 *   #93 — Reduced `any` prevalence across server code
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ── #60: Index Verification ──────────────────────────────────────────────────

describe("#60 — ragSessions and savedSearches indexes", () => {
  it("should define indexes on ragSessions in schema", () => {
    const schema = fs.readFileSync(
      path.resolve(__dirname, "../drizzle/schema.ts"),
      "utf-8"
    );
    // ragSessions should have indexes on sessionId and createdAt
    expect(schema).toContain("rs_sessionId_idx");
    expect(schema).toContain("rs_createdAt_idx");
  });

  it("should define indexes on savedSearches in schema", () => {
    const schema = fs.readFileSync(
      path.resolve(__dirname, "../drizzle/schema.ts"),
      "utf-8"
    );
    // savedSearches should have composite index on userId+searchType and updatedAt
    expect(schema).toContain("ss_userId_searchType_idx");
    expect(schema).toContain("ss_updatedAt_idx");
  });
});

// ── #76/#86: Truthiness Bug Verification ─────────────────────────────────────

describe("#76/#86 — Truthiness bugs on numeric inputs", () => {
  const wazuhRouterSrc = fs.readFileSync(
    path.resolve(__dirname, "wazuh/wazuhRouter.ts"),
    "utf-8"
  );

  it("should NOT use truthiness checks on limit (if (input.limit))", () => {
    // Regex: if (input.limit) without != null or !== undefined
    // This catches `if (input.limit)` but not `if (input.limit != null)`
    const truthyLimitPattern = /if\s*\(\s*input\.limit\s*\)\s*{?\s*(?:params|query)/g;
    const matches = wazuhRouterSrc.match(truthyLimitPattern);
    expect(matches).toBeNull();
  });

  it("should NOT use truthiness checks on offset (if (input.offset))", () => {
    const truthyOffsetPattern = /if\s*\(\s*input\.offset\s*\)\s*{?\s*(?:params|query)/g;
    const matches = wazuhRouterSrc.match(truthyOffsetPattern);
    expect(matches).toBeNull();
  });

  it("should use explicit null checks for limit (input.limit != null)", () => {
    // At least one instance of the correct pattern should exist
    expect(wazuhRouterSrc).toContain("input.limit != null");
  });

  it("should use explicit null checks for offset (input.offset != null)", () => {
    expect(wazuhRouterSrc).toContain("input.offset != null");
  });

  it("should NOT use truthiness checks on scheduleId in driftAnalyticsRouter", () => {
    const driftSrc = fs.readFileSync(
      path.resolve(__dirname, "baselines/driftAnalyticsRouter.ts"),
      "utf-8"
    );
    // Should not have `if (input.scheduleId)` — should use `!= null`
    const truthySchedulePattern = /if\s*\(\s*input\.scheduleId\s*\)\s*\{/g;
    const matches = driftSrc.match(truthySchedulePattern);
    expect(matches).toBeNull();
  });
});

// ── #93: `any` Prevalence Verification ───────────────────────────────────────

describe("#93 — Reduced `any` prevalence", () => {
  const serverDir = path.resolve(__dirname);

  function collectTsFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip _core, node_modules, test files
        if (entry.name === "_core" || entry.name === "node_modules") continue;
        files.push(...collectTsFiles(fullPath));
      } else if (
        entry.name.endsWith(".ts") &&
        !entry.name.includes(".test.") &&
        !entry.name.endsWith(".test.ts")
      ) {
        files.push(fullPath);
      }
    }
    return files;
  }

  it("should have fewer than 5 non-eslint-disabled `any` occurrences in server code", () => {
    const tsFiles = collectTsFiles(serverDir);
    let totalAny = 0;
    const violations: string[] = [];

    for (const file of tsFiles) {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip eslint-disable lines and type alias declarations
        if (line.includes("eslint-disable")) continue;
        if (line.match(/^type\s+\w+\s*=\s*any/)) continue;

        // Check for `: any`, `as any`, `<any>`
        if (line.match(/:\s*any\b/) || line.match(/as\s+any\b/) || line.match(/<any>/)) {
          totalAny++;
          const relPath = path.relative(serverDir, file);
          violations.push(`${relPath}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    // Allow up to 4 intentional `any` for Drizzle/mysql2 internals
    expect(totalAny).toBeLessThan(5);
  });

  it("should NOT have `as any` in correlationAgent.ts", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "agenticPipeline/correlationAgent.ts"),
      "utf-8"
    );
    const matches = src.match(/as\s+any\b/g);
    expect(matches).toBeNull();
  });

  it("should NOT have `as any` in hypothesisAgent.ts", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "agenticPipeline/hypothesisAgent.ts"),
      "utf-8"
    );
    const matches = src.match(/as\s+any\b/g);
    expect(matches).toBeNull();
  });

  it("should NOT have `as any` in triageAgent.ts", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "agenticPipeline/triageAgent.ts"),
      "utf-8"
    );
    const matches = src.match(/as\s+any\b/g);
    expect(matches).toBeNull();
  });

  it("should NOT have `err: any` in wazuhRouter.ts catch blocks", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "wazuh/wazuhRouter.ts"),
      "utf-8"
    );
    const matches = src.match(/catch\s*\(\s*err\s*:\s*any\s*\)/g);
    expect(matches).toBeNull();
  });
});
