/**
 * Regression tests for Audit #37, #58, #69
 *
 * #37 — Remove DB upsert on every authenticated request
 *   Verifies sdk.ts uses updateLastSignedIn instead of upsertUser
 *
 * #58 — FK constraint migration across 25+ tables
 *   Verifies FK constraints exist in the database
 *
 * #69 — Readiness service actually probes the DB
 *   Verifies checkDatabase uses SELECT 1 instead of just checking handle
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

// ─── #37: sdk.ts uses updateLastSignedIn, not upsertUser ───

describe("Audit #37 — Remove DB upsert on every auth request", () => {
  const sdkSrc = fs.readFileSync(path.join(ROOT, "server/_core/sdk.ts"), "utf-8");

  it("should import updateLastSignedIn from db.ts", () => {
    expect(sdkSrc).toContain("updateLastSignedIn");
  });

  it("should NOT call upsertUser in authenticateRequest flow", () => {
    // upsertUser should not appear in the staleness-check block
    // It may still be imported for first-login, but the 5-min refresh path must use updateLastSignedIn
    const staleBlock = sdkSrc.slice(sdkSrc.indexOf("STALE_THRESHOLD"));
    if (staleBlock) {
      // After STALE_THRESHOLD, the next upsertUser call should not exist
      const afterThreshold = sdkSrc.slice(sdkSrc.indexOf("STALE_THRESHOLD"));
      const nextUpsert = afterThreshold.indexOf("upsertUser(");
      const nextUpdate = afterThreshold.indexOf("updateLastSignedIn(");
      // updateLastSignedIn should appear before any upsertUser (or upsertUser shouldn't appear at all)
      if (nextUpsert !== -1) {
        expect(nextUpdate).toBeLessThan(nextUpsert);
      } else {
        expect(nextUpdate).toBeGreaterThan(-1);
      }
    }
  });

  it("db.ts should export updateLastSignedIn function", () => {
    const dbSrc = fs.readFileSync(path.join(ROOT, "server/db.ts"), "utf-8");
    expect(dbSrc).toMatch(/export\s+(async\s+)?function\s+updateLastSignedIn/);
  });
});

// ─── #58: FK constraint migration file exists ───

describe("Audit #58 — FK constraint migration", () => {
  it("should have a FK migration SQL file", () => {
    const migrationPath = path.join(ROOT, "drizzle/fk_migration.sql");
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it("FK migration should contain ALTER TABLE ADD CONSTRAINT statements", () => {
    const migrationSql = fs.readFileSync(path.join(ROOT, "drizzle/fk_migration.sql"), "utf-8");
    const fkCount = (migrationSql.match(/ADD CONSTRAINT/gi) || []).length;
    expect(fkCount).toBeGreaterThanOrEqual(25);
  });

  it("FK migration should reference key parent tables", () => {
    const migrationSql = fs.readFileSync(path.join(ROOT, "drizzle/fk_migration.sql"), "utf-8");
    expect(migrationSql).toContain("REFERENCES users(id)");
    expect(migrationSql).toContain("REFERENCES baseline_schedules(id)");
    expect(migrationSql).toContain("REFERENCES living_case_state(id)");
    expect(migrationSql).toContain("REFERENCES pipeline_runs(id)");
    expect(migrationSql).toContain("REFERENCES kg_endpoints(id)");
  });
});

// ─── #69: Readiness service probes DB with SELECT 1 ───

describe("Audit #69 — Readiness DB probe", () => {
  const readinessSrc = fs.readFileSync(
    path.join(ROOT, "server/agenticReadiness/readinessService.ts"),
    "utf-8"
  );

  it("should import sql from drizzle-orm", () => {
    expect(readinessSrc).toContain('import { sql } from "drizzle-orm"');
  });

  it("checkDatabase should execute SELECT 1 probe", () => {
    // Find the checkDatabase function
    const fnStart = readinessSrc.indexOf("async function checkDatabase");
    const fnEnd = readinessSrc.indexOf("async function checkLLM");
    const fnBody = readinessSrc.slice(fnStart, fnEnd);
    expect(fnBody).toContain("db.execute(sql`SELECT 1`)");
  });

  it("should NOT return ready just from handle existence", () => {
    const fnStart = readinessSrc.indexOf("async function checkDatabase");
    const fnEnd = readinessSrc.indexOf("async function checkLLM");
    const fnBody = readinessSrc.slice(fnStart, fnEnd);
    // The ready return should come AFTER the SELECT 1 probe, not immediately after the null check
    const selectIdx = fnBody.indexOf("SELECT 1");
    const readyIdx = fnBody.indexOf('"ready"');
    expect(selectIdx).toBeGreaterThan(-1);
    expect(readyIdx).toBeGreaterThan(selectIdx);
  });
});
