#!/usr/bin/env node
/**
 * docker-pre-migrate.mjs — READ-ONLY pre-migration check for Docker deployments
 *
 * History (H-D5, CODE_REVIEW_2026-10-21 §5.4): this script used to treat any
 * SHA mismatch as "pending" and DROP every index a migration file declared,
 * using regex-scraped identifiers. A whitespace edit to an already-applied
 * migration therefore silently degraded the live schema. It no longer mutates
 * the schema in any way — it only inspects and reports.
 *
 * Pending detection:
 *   A journal entry is pending iff its `idx` is greater than the highest idx
 *   whose SHA-256 hash is present in `__drizzle_migrations`. A hash mismatch on
 *   an entry at or below that idx means the file was edited after it was
 *   applied — that is logged as a warning and is NEVER treated as pending.
 *   drizzle-kit itself decides by `when` timestamp (journal `when` >
 *   max(created_at)); any entry that rule would run is also checked, and a
 *   disagreement between the two rules is reported.
 *
 * Conflict check (pending migrations only), via information_schema:
 *   CREATE [UNIQUE] INDEX / ADD [UNIQUE] INDEX → STATISTICS (index already exists)
 *   ADD COLUMN                                → COLUMNS (column already exists)
 *   ADD CONSTRAINT … FOREIGN KEY              → TABLE_CONSTRAINTS (constraint exists)
 *   CREATE TABLE (without IF NOT EXISTS)      → TABLES (table exists)
 *   DROP INDEX / DROP FOREIGN KEY             → object missing
 * Each conflicting statement is logged and skipped (never dropped/repaired).
 * Because drizzle-kit would still try to execute the whole file, any conflict
 * makes this script exit non-zero with the list of conflicting statements, so
 * an operator can reconcile by hand (after taking a backup).
 *
 * Usage:
 *   node scripts/docker-pre-migrate.mjs                # check (default)
 *   node scripts/docker-pre-migrate.mjs --has-pending  # pending probe only
 *
 * Exit codes:
 *   check mode:        0 = no conflicts (pending or not), 2 = conflicts found, 1 = error
 *   --has-pending:     0 = there ARE pending migrations, 3 = nothing pending, 1 = error
 *
 * Requires: DATABASE_URL environment variable
 */

import mysql from "mysql2/promise";
import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

const TAG = "[pre-migrate-check]";
const HAS_PENDING_MODE = process.argv.includes("--has-pending");

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_CONFLICTS = 2;
const EXIT_NOTHING_PENDING = 3;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log(`${TAG} No DATABASE_URL — nothing to check`);
  process.exit(HAS_PENDING_MODE ? EXIT_NOTHING_PENDING : EXIT_OK);
}

/** Parse mysql:// URL into connection config */
function parseUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || "3306", 10),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.slice(1)),
  };
}

async function tableExists(conn, tableName) {
  const [rows] = await conn.query(
    "SELECT COUNT(*) AS cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    [tableName],
  );
  return Number(rows[0].cnt) > 0;
}

async function indexExists(conn, tableName, indexName) {
  const [rows] = await conn.query(
    "SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
    [tableName, indexName],
  );
  return Number(rows[0].cnt) > 0;
}

async function columnExists(conn, tableName, columnName) {
  const [rows] = await conn.query(
    "SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [tableName, columnName],
  );
  return Number(rows[0].cnt) > 0;
}

async function constraintExists(conn, tableName, constraintName, type) {
  const [rows] = await conn.query(
    "SELECT COUNT(*) AS cnt FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = ?",
    [tableName, constraintName, type],
  );
  return Number(rows[0].cnt) > 0;
}

/** Split a drizzle migration file into individual statements. */
function splitStatements(sql) {
  return sql
    .split(/-->\s*statement-breakpoint/)
    .flatMap((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .split(/;\s*(?:\n|$)/),
    )
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const ID = "`([^`]+)`";

/**
 * Per-migration simulation of what earlier statements in the SAME file already did,
 * so a `DROP FOREIGN KEY x` followed by `ADD CONSTRAINT x` (the normal way to change an
 * FK's ON DELETE rule) is not reported as "already exists".
 */
function newSim() {
  return { idx: new Map(), fk: new Map(), col: new Map() }; // key → true (exists) | false (dropped)
}
async function simExists(sim, kind, key, probe) {
  if (sim[kind].has(key)) return sim[kind].get(key);
  return probe();
}

/**
 * Inspect one statement and return a list of human-readable conflicts
 * (empty if the statement should apply cleanly), updating `sim` as it goes.
 */
async function checkStatement(conn, stmt, sim = newSim()) {
  const conflicts = [];
  let m;
  const idxKey = (t, n) => `${t}.${n}`;

  // CREATE [UNIQUE] INDEX `name` ON `table`
  if ((m = stmt.match(new RegExp(`^CREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+${ID}\\s+ON\\s+${ID}`, "i")))) {
    const [, indexName, tableName] = m;
    const k = idxKey(tableName, indexName);
    if (await simExists(sim, "idx", k, () => indexExists(conn, tableName, indexName))) {
      conflicts.push(`index ${tableName}.${indexName} already exists`);
    }
    sim.idx.set(k, true);
    return conflicts;
  }

  // CREATE TABLE `name` (without IF NOT EXISTS)
  if ((m = stmt.match(new RegExp(`^CREATE\\s+TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?${ID}`, "i")))) {
    const [, ifNotExists, tableName] = m;
    if (!ifNotExists && (await tableExists(conn, tableName))) {
      conflicts.push(`table ${tableName} already exists`);
    }
    return conflicts;
  }

  // DROP INDEX `name` ON `table`
  if ((m = stmt.match(new RegExp(`^DROP\\s+INDEX\\s+${ID}\\s+ON\\s+${ID}`, "i")))) {
    const [, indexName, tableName] = m;
    const k = idxKey(tableName, indexName);
    if (!(await simExists(sim, "idx", k, () => indexExists(conn, tableName, indexName)))) {
      conflicts.push(`index ${tableName}.${indexName} does not exist (DROP would fail)`);
    }
    sim.idx.set(k, false);
    return conflicts;
  }

  // ALTER TABLE `table` <clauses>
  if ((m = stmt.match(new RegExp(`^ALTER\\s+TABLE\\s+${ID}\\s+([\\s\\S]*)$`, "i")))) {
    const [, tableName, body] = m;
    let c;
    // DROPs first: within one ALTER they take effect before ADDs of the same name.
    const dropFkRe = new RegExp(`DROP\\s+FOREIGN\\s+KEY\\s+${ID}`, "gi");
    while ((c = dropFkRe.exec(body)) !== null) {
      const k = idxKey(tableName, c[1]);
      if (!(await simExists(sim, "fk", k, () => constraintExists(conn, tableName, c[1], "FOREIGN KEY")))) {
        conflicts.push(`foreign key ${tableName}.${c[1]} does not exist (DROP would fail)`);
      }
      sim.fk.set(k, false);
    }
    const dropIdxRe = new RegExp(`DROP\\s+(?:INDEX|KEY)\\s+${ID}`, "gi");
    while ((c = dropIdxRe.exec(body)) !== null) {
      const k = idxKey(tableName, c[1]);
      if (!(await simExists(sim, "idx", k, () => indexExists(conn, tableName, c[1])))) {
        conflicts.push(`index ${tableName}.${c[1]} does not exist (DROP would fail)`);
      }
      sim.idx.set(k, false);
    }
    const dropColRe = new RegExp(`DROP\\s+COLUMN\\s+${ID}`, "gi");
    while ((c = dropColRe.exec(body)) !== null) sim.col.set(idxKey(tableName, c[1]), false);

    const addIndexRe = new RegExp(`ADD\\s+(?:UNIQUE\\s+)?(?:INDEX|KEY)\\s+${ID}`, "gi");
    while ((c = addIndexRe.exec(body)) !== null) {
      const k = idxKey(tableName, c[1]);
      if (await simExists(sim, "idx", k, () => indexExists(conn, tableName, c[1]))) {
        conflicts.push(`index ${tableName}.${c[1]} already exists`);
      }
      sim.idx.set(k, true);
    }
    const addFkRe = new RegExp(`ADD\\s+CONSTRAINT\\s+${ID}\\s+FOREIGN\\s+KEY`, "gi");
    while ((c = addFkRe.exec(body)) !== null) {
      const k = idxKey(tableName, c[1]);
      if (await simExists(sim, "fk", k, () => constraintExists(conn, tableName, c[1], "FOREIGN KEY"))) {
        conflicts.push(`foreign key ${tableName}.${c[1]} already exists`);
      }
      sim.fk.set(k, true);
    }
    const addUniqueConstraintRe = new RegExp(`ADD\\s+CONSTRAINT\\s+${ID}\\s+UNIQUE`, "gi");
    while ((c = addUniqueConstraintRe.exec(body)) !== null) {
      const k = idxKey(tableName, c[1]);
      if (await simExists(sim, "idx", k, () => indexExists(conn, tableName, c[1]))) {
        conflicts.push(`unique constraint ${tableName}.${c[1]} already exists`);
      }
      sim.idx.set(k, true);
    }
    // ADD COLUMN `col` | ADD `col` (bare identifier = column)
    const addColRe = new RegExp(`ADD\\s+(?:COLUMN\\s+)?${ID}`, "gi");
    while ((c = addColRe.exec(body)) !== null) {
      const k = idxKey(tableName, c[1]);
      if (await simExists(sim, "col", k, () => columnExists(conn, tableName, c[1]))) {
        conflicts.push(`column ${tableName}.${c[1]} already exists`);
      }
      sim.col.set(k, true);
    }
  }

  return conflicts;
}

function oneLine(stmt) {
  const s = stmt.replace(/\s+/g, " ");
  return s.length > 160 ? `${s.slice(0, 157)}...` : s;
}

/** Compute pending migrations. Returns { pending, entries }. */
async function findPending(conn, drizzleDir) {
  const journal = JSON.parse(readFileSync(join(drizzleDir, "meta", "_journal.json"), "utf-8"));
  const entries = journal.entries
    .map((entry) => {
      const sqlFile = join(drizzleDir, `${entry.tag}.sql`);
      if (!existsSync(sqlFile)) return null;
      // drizzle stores sha256 of the file content as read in utf-8
      const sql = readFileSync(sqlFile, "utf-8");
      const hash = createHash("sha256").update(sql).digest("hex");
      return { idx: entry.idx, when: Number(entry.when), tag: entry.tag, sqlFile, sql, hash };
    })
    .filter(Boolean);

  if (!(await tableExists(conn, "__drizzle_migrations"))) {
    console.log(`${TAG} No __drizzle_migrations table — every migration is pending (fresh database)`);
    return { pending: entries, entries };
  }

  const [rows] = await conn.query("SELECT hash, created_at FROM `__drizzle_migrations`");
  const appliedHashes = new Set(rows.map((r) => r.hash));
  const maxCreatedAt = rows.length > 0 ? Math.max(...rows.map((r) => Number(r.created_at))) : -Infinity;
  console.log(`${TAG} Found ${rows.length} applied migrations in __drizzle_migrations`);

  let maxAppliedIdx = -1;
  for (const e of entries) {
    if (appliedHashes.has(e.hash) && e.idx > maxAppliedIdx) maxAppliedIdx = e.idx;
  }

  // Edited-after-apply: hash missing but at/below the applied high-water mark.
  for (const e of entries) {
    if (e.idx <= maxAppliedIdx && !appliedHashes.has(e.hash)) {
      console.warn(
        `${TAG} WARNING: ${e.tag} (idx ${e.idx}) hash does not match any applied record — ` +
          "the file appears to have been edited after it was applied. NOT treating it as pending.",
      );
    }
  }

  const byIdx = new Set(entries.filter((e) => e.idx > maxAppliedIdx).map((e) => e.idx));
  const byWhen = new Set(entries.filter((e) => e.when > maxCreatedAt).map((e) => e.idx));
  for (const e of entries) {
    if (byIdx.has(e.idx) !== byWhen.has(e.idx)) {
      console.warn(
        `${TAG} WARNING: ${e.tag} — idx rule says ${byIdx.has(e.idx) ? "pending" : "applied"}, ` +
          `drizzle-kit timestamp rule says ${byWhen.has(e.idx) ? "pending" : "applied"}. Checking it anyway.`,
      );
    }
  }

  const pending = entries.filter((e) => byIdx.has(e.idx) || byWhen.has(e.idx));
  return { pending, entries };
}

async function main() {
  const drizzleDir = resolve(process.cwd(), "drizzle");
  if (!existsSync(join(drizzleDir, "meta", "_journal.json"))) {
    console.error(`${TAG} ERROR: drizzle/meta/_journal.json not found in ${process.cwd()}`);
    return EXIT_ERROR;
  }

  let conn;
  try {
    conn = await mysql.createConnection(parseUrl(DATABASE_URL));
    const { pending } = await findPending(conn, drizzleDir);

    if (HAS_PENDING_MODE) {
      if (pending.length === 0) {
        console.log(`${TAG} No pending migrations`);
        return EXIT_NOTHING_PENDING;
      }
      console.log(`${TAG} ${pending.length} pending migration(s): ${pending.map((p) => p.tag).join(", ")}`);
      return EXIT_OK;
    }

    if (pending.length === 0) {
      console.log(`${TAG} All migrations already applied — nothing to check`);
      return EXIT_OK;
    }

    console.log(`${TAG} Checking ${pending.length} pending migration(s) for statements that would conflict with the live schema`);
    const allConflicts = [];
    for (const migration of pending) {
      const sim = newSim(); // statements in one file see each other's effects
      for (const stmt of splitStatements(migration.sql)) {
        const conflicts = await checkStatement(conn, stmt, sim);
        for (const reason of conflicts) {
          console.log(`${TAG} SKIP (conflict) ${migration.tag}: ${reason} — not modifying the schema`);
          allConflicts.push({ tag: migration.tag, reason, stmt: oneLine(stmt) });
        }
      }
    }

    if (allConflicts.length > 0) {
      console.error(`${TAG} ════════════════════════════════════════════════════════════`);
      console.error(`${TAG} FATAL: ${allConflicts.length} statement(s) in pending migrations would fail against the live schema.`);
      console.error(`${TAG} drizzle-kit executes whole files, so these must be reconciled by hand`);
      console.error(`${TAG} (take a backup first — see docs/guides/DOCKER.md). This script changes nothing.`);
      for (const c of allConflicts) {
        console.error(`${TAG}   - [${c.tag}] ${c.reason}`);
        console.error(`${TAG}       ${c.stmt}`);
      }
      console.error(`${TAG} ════════════════════════════════════════════════════════════`);
      return EXIT_CONFLICTS;
    }

    console.log(`${TAG} No conflicts found — pending migrations should apply cleanly`);
    return EXIT_OK;
  } catch (err) {
    console.error(`${TAG} ERROR: pre-migration check failed: ${err.message}`);
    return EXIT_ERROR;
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}

main().then((code) => process.exit(code));
