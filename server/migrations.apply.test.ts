/**
 * Migration execution test (H-T3 / M-6) — DB-gated.
 *
 * The globalSetup (server/testHelpers/testDb.ts) has already applied every
 * migration in ./drizzle to the test database with drizzle-orm's mysql2
 * migrator. This asserts that the run actually recorded every journal entry
 * and that the resulting schema is the one drizzle/schema.ts describes.
 */
import { afterAll, beforeAll, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import mysql from "mysql2/promise";
import { getTableConfig, MySqlTable } from "drizzle-orm/mysql-core";
import { is } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import { describeWithDb } from "./testHelpers/requireDb";

const REPO_ROOT = path.resolve(__dirname, "..");
const journal = JSON.parse(
  readFileSync(path.join(REPO_ROOT, "drizzle", "meta", "_journal.json"), "utf-8")
) as { entries: Array<{ idx: number; tag: string; when: number }> };

describeWithDb("migrations: applied chain matches the journal", () => {
  let conn: mysql.Connection;

  beforeAll(async () => {
    conn = await mysql.createConnection({ uri: process.env.DATABASE_URL! });
  });
  afterAll(async () => {
    await conn?.end();
  });

  it("__drizzle_migrations has exactly one row per journal entry", async () => {
    const [rows] = await conn.query("SELECT created_at FROM __drizzle_migrations ORDER BY created_at");
    const applied = rows as Array<{ created_at: number | string }>;
    expect(applied.length).toBe(journal.entries.length);
    // drizzle records each migration's journal `when` as created_at
    expect(applied.map((r) => Number(r.created_at))).toEqual(
      [...journal.entries].sort((a, b) => a.when - b.when).map((e) => e.when)
    );
  });

  it("every table declared in drizzle/schema.ts exists with all its columns", async () => {
    const [rows] = await conn.query(
      "SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()"
    );
    const actual = new Map<string, Set<string>>();
    for (const { t, c } of rows as Array<{ t: string; c: string }>) {
      if (!actual.has(t)) actual.set(t, new Set());
      actual.get(t)!.add(c);
    }

    const missing: string[] = [];
    let tableCount = 0;
    for (const value of Object.values(schema)) {
      if (!is(value, MySqlTable)) continue;
      tableCount++;
      const cfg = getTableConfig(value);
      const cols = actual.get(cfg.name);
      if (!cols) {
        missing.push(`table ${cfg.name}`);
        continue;
      }
      for (const col of cfg.columns) {
        if (!cols.has(col.name)) missing.push(`${cfg.name}.${col.name}`);
      }
    }
    expect(tableCount).toBeGreaterThan(10);
    expect(missing).toEqual([]);
  });

  it("drizzle-kit check passes on the migration folder", () => {
    const res = spawnSync("pnpm", ["exec", "drizzle-kit", "check"], {
      cwd: REPO_ROOT,
      env: process.env,
      encoding: "utf-8",
      timeout: 60_000,
    });
    const out = `${res.stdout}\n${res.stderr}`;
    expect(res.status, out).toBe(0);
  }, 70_000);
});
