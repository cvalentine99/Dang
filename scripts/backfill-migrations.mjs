#!/usr/bin/env node
/**
 * backfill-migrations.mjs — Repair the __drizzle_migrations journal
 *
 * Problem: All 15 migrations (0000-0014) were applied via webdev_execute_sql
 * during development, but only migration 0000 was recorded in the journal.
 * Additionally, migrations 0012-0014 have out-of-order `when` timestamps
 * in _journal.json (earlier than 0011), which would cause Drizzle to skip them.
 *
 * This script:
 * 1. Reads the _journal.json to get the expected migration list
 * 2. Computes SHA256 hashes of each .sql file (what Drizzle uses)
 * 3. Checks which migrations are already in __drizzle_migrations
 * 4. Inserts missing entries so Drizzle considers them applied
 *
 * Usage: node scripts/backfill-migrations.mjs
 * Requires: DATABASE_URL environment variable
 */

import mysql from "mysql2/promise";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[backfill] No DATABASE_URL — cannot backfill migrations");
  process.exit(1);
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);

  try {
    console.log("[backfill] Connected to database");

    // Read the journal
    const drizzleDir = resolve(process.cwd(), "drizzle");
    const journal = JSON.parse(readFileSync(join(drizzleDir, "meta", "_journal.json"), "utf-8"));

    // Get existing journal entries
    const [existingRows] = await conn.query(
      "SELECT id, hash, created_at FROM `__drizzle_migrations` ORDER BY id"
    );
    const existingHashes = new Set(existingRows.map((r) => r.hash));
    const maxExistingTimestamp = existingRows.length > 0
      ? Math.max(...existingRows.map((r) => Number(r.created_at)))
      : 0;
    console.log(`[backfill] Found ${existingRows.length} existing migration records`);

    let inserted = 0;

    for (const entry of journal.entries) {
      const sqlFile = join(drizzleDir, `${entry.tag}.sql`);
      const sql = readFileSync(sqlFile, "utf-8");
      const hash = createHash("sha256").update(sql).digest("hex");

      if (existingHashes.has(hash)) {
        console.log(`[backfill]   ✓ ${entry.tag} — already recorded`);
        continue;
      }

      // Only backfill migrations that are OLDER than or equal to the newest
      // existing entry. Migrations with newer timestamps are genuinely new
      // and must be applied by drizzle-kit migrate, not backfilled.
      if (entry.when > maxExistingTimestamp && maxExistingTimestamp > 0) {
        console.log(`[backfill]   ⏭ ${entry.tag} — skipped (newer than applied migrations, will be applied by drizzle-kit)`);
        continue;
      }

      // Insert the missing journal entry
      // Drizzle stores: hash (sha256 of sql), created_at (the `when` timestamp from journal)
      // IMPORTANT: the `when` value must match the journal exactly — Drizzle compares by
      // (hash, created_at) to decide if a migration is already applied
      await conn.query(
        "INSERT INTO `__drizzle_migrations` (`hash`, `created_at`) VALUES (?, ?)",
        [hash, entry.when]
      );
      inserted++;
      console.log(`[backfill]   + ${entry.tag} — inserted (hash=${hash.slice(0, 12)}…, when=${entry.when})`);
    }

    console.log(`[backfill] Done: ${inserted} migration records inserted, ${existingRows.length} already existed`);

    // Verify
    const [finalRows] = await conn.query(
      "SELECT COUNT(*) as cnt FROM `__drizzle_migrations`"
    );
    console.log(`[backfill] Total migration records now: ${finalRows[0].cnt}`);
  } catch (err) {
    console.error(`[backfill] ERROR: ${err.message}`);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
