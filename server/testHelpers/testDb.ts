/**
 * Vitest globalSetup for the "unit" project (H-T1 / H-T3 / M-6).
 *
 * When DATABASE_URL is set, this runs ONCE per `vitest` invocation, before any
 * test file, and applies the real migration chain in ./drizzle to the test
 * database with drizzle-orm's mysql2 migrator (the same migrator
 * `drizzle-kit migrate` uses). DB-gated suites therefore run against a schema
 * produced by the committed migrations, not by `drizzle-kit push` or a
 * hand-made dump — and a broken migration fails the run here, loudly.
 * `server/migrations.apply.test.ts` then asserts the result.
 *
 * Safety: refuses to touch a database whose name does not end in `_test`
 * (the live deployment DB is `dang`), unless DANG_TEST_ALLOW_ANY_DB=1.
 * Creates the database if it does not exist (test names only).
 *
 * With no DATABASE_URL this is a no-op and DB-gated suites skip — unless
 * TEST_DB=1 (set by `pnpm test:db`), in which case a missing DB is an error.
 */
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import path from "node:path";
import { loadTestEnv, REPO_ROOT } from "./loadTestEnv";
import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { resolveSpecPath } from "../../shared/specPath";
import { extract } from "../graph/kgExtractor";
import { loadAll } from "../graph/kgLoader";

export const MIGRATIONS_FOLDER = path.join(REPO_ROOT, "drizzle");

/** Database name from a mysql:// URL ("" if none). */
export function databaseNameOf(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

export function assertIsTestDatabase(url: string): string {
  const name = databaseNameOf(url);
  if (!name) throw new Error("[testDb] DATABASE_URL has no database name");
  if (!/_test$/.test(name) && process.env.DANG_TEST_ALLOW_ANY_DB !== "1") {
    throw new Error(
      `[testDb] Refusing to run DB-gated tests against database "${name}". ` +
        `Test databases must end in "_test" (e.g. dang_test); DB-gated suites ` +
        `insert, update and truncate rows. Set DANG_TEST_ALLOW_ANY_DB=1 to override.`
    );
  }
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`[testDb] Unsupported database name "${name}"`);
  }
  return name;
}

/**
 * Fixture users. Many DB-gated suites predate this harness and were written
 * against a populated dev database: they pass `userId: 1` (admin) / `2` and
 * insert rows whose FKs (triage_objects.triggeredByUserId,
 * investigation_sessions.userId, ...) reference users.id. Seed exactly those
 * two rows (idempotent) so the suites run on a freshly migrated database.
 * They have no password hash, so they cannot log in.
 */
export const FIXTURE_USERS = [
  { id: 1, openId: "test-fixture-admin", name: "test-fixture-admin", role: "admin" },
  { id: 2, openId: "test-fixture-user", name: "test-fixture-user", role: "user" },
] as const;

async function seedFixtureUsers(conn: mysql.Connection): Promise<void> {
  for (const u of FIXTURE_USERS) {
    await conn.query(
      "INSERT IGNORE INTO users (id, openId, name, loginMethod, role) VALUES (?, ?, ?, 'fixture', ?)",
      [u.id, u.openId, u.name, u.role]
    );
  }
}

/**
 * The KG hydration-proof suites assert the kg_* tables match the spec. Seed them the
 * same way docker-entrypoint.sh does (extract → loadAll), only when empty.
 */
async function seedKnowledgeGraph(conn: mysql.Connection): Promise<void> {
  const [rows] = await conn.query("SELECT COUNT(*) AS c FROM kg_endpoints");
  const count = Number((rows as Array<{ c: number }>)[0]?.c ?? 0);
  if (count > 0) return;
  const started = Date.now();
  const spec = yaml.load(readFileSync(resolveSpecPath(REPO_ROOT), "utf8"));
  const result = await loadAll(conn as never, extract(spec as never));
  if (!result.success) throw new Error("[testDb] knowledge-graph seed failed: " + JSON.stringify(result.layers));
  console.log(`[testDb] knowledge graph seeded (${result.totalRecords} rows) in ${Date.now() - started} ms`);
}

export default async function setup(): Promise<void> {
  loadTestEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (process.env.TEST_DB === "1") {
      throw new Error(
        "[testDb] TEST_DB=1 (pnpm test:db) but DATABASE_URL is not set. " +
          "Copy .env.test.example to .env.test and point it at a *_test database."
      );
    }
    console.log("[testDb] DATABASE_URL not set — DB-gated suites will be skipped.");
    return;
  }
  const dbName = assertIsTestDatabase(url);

  // Create the database if needed (connect without selecting it).
  const serverUrl = new URL(url);
  serverUrl.pathname = "/";
  const admin = await mysql.createConnection({ uri: serverUrl.toString() });
  try {
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
  } finally {
    await admin.end();
  }

  const conn = await mysql.createConnection({ uri: url, multipleStatements: true });
  try {
    const started = Date.now();
    await migrate(drizzle(conn), { migrationsFolder: MIGRATIONS_FOLDER });
    console.log(`[testDb] migrations applied to ${dbName} in ${Date.now() - started} ms`);
    await seedFixtureUsers(conn);
    await seedKnowledgeGraph(conn);
  } finally {
    await conn.end();
  }
}
