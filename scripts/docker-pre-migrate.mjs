#!/usr/bin/env node
/**
 * docker-pre-migrate.mjs — Pre-migration repair for Docker deployments
 *
 * Problem: Drizzle migrations use plain CREATE INDEX (not IF NOT EXISTS)
 * because MySQL 8.0 doesn't support IF NOT EXISTS for CREATE INDEX.
 * If a migration partially applies (tables created, some indexes created,
 * then fails), re-running it hits "Duplicate key name" errors.
 *
 * Solution: Before running drizzle-kit migrate, this script:
 * 1. Checks the __drizzle_migrations journal for partially-applied migrations
 * 2. For any migration that failed mid-way, drops indexes that already exist
 *    so the migration can re-run cleanly
 * 3. Optionally removes the journal entry so drizzle re-applies it
 *
 * Usage: node scripts/docker-pre-migrate.mjs
 * Requires: DATABASE_URL environment variable
 */

import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log("[pre-migrate] No DATABASE_URL — skipping pre-migration repair");
  process.exit(0);
}

/** Parse mysql:// URL into connection config */
function parseUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || "3306", 10),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.slice(1),
  };
}

/**
 * Get all indexes for a given table.
 * Returns Set of index names (excluding PRIMARY).
 */
async function getExistingIndexes(conn, tableName) {
  try {
    const [rows] = await conn.query(`SHOW INDEX FROM \`${tableName}\``);
    const names = new Set();
    for (const row of rows) {
      if (row.Key_name !== "PRIMARY") {
        names.add(row.Key_name);
      }
    }
    return names;
  } catch {
    // Table doesn't exist
    return new Set();
  }
}

/**
 * Check if a table exists in the database.
 */
async function tableExists(conn, tableName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?`,
    [tableName]
  );
  return rows[0].cnt > 0;
}

/**
 * Parse CREATE INDEX statements from a migration SQL string.
 * Returns array of { indexName, tableName }
 */
function parseCreateIndexes(sql) {
  const regex = /CREATE INDEX `([^`]+)` ON `([^`]+)`/gi;
  const results = [];
  let match;
  while ((match = regex.exec(sql)) !== null) {
    results.push({ indexName: match[1], tableName: match[2] });
  }
  return results;
}

async function main() {
  const config = parseUrl(DATABASE_URL);
  let conn;

  try {
    conn = await mysql.createConnection(config);
    console.log("[pre-migrate] Connected to database for pre-migration repair");

    // Check if the drizzle migrations journal exists
    const journalExists = await tableExists(conn, "__drizzle_migrations");
    if (!journalExists) {
      console.log("[pre-migrate] No migration journal found — fresh database, skipping repair");
      return;
    }

    // Get applied migrations from the journal
    const [appliedRows] = await conn.query(
      "SELECT id, hash, created_at FROM `__drizzle_migrations` ORDER BY created_at ASC"
    );
    const appliedHashes = new Set(appliedRows.map((r) => r.hash));

    console.log(`[pre-migrate] Found ${appliedRows.length} applied migrations in journal`);

    // Read migration files from the drizzle directory
    const fs = await import("fs");
    const path = await import("path");
    const drizzleDir = path.resolve(process.cwd(), "drizzle");

    // Read the journal to get the expected migration list
    const journalPath = path.join(drizzleDir, "meta", "_journal.json");
    if (!fs.existsSync(journalPath)) {
      console.log("[pre-migrate] No _journal.json found — skipping repair");
      return;
    }

    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    const pendingMigrations = [];

    for (const entry of journal.entries) {
      const sqlFile = path.join(drizzleDir, `${entry.tag}.sql`);
      if (!fs.existsSync(sqlFile)) continue;

      // Check if this migration's hash is in the applied set
      // Drizzle uses the tag as the hash
      if (appliedHashes.has(entry.tag)) {
        // Already fully applied — skip
        continue;
      }

      pendingMigrations.push({
        idx: entry.idx,
        tag: entry.tag,
        sqlFile,
      });
    }

    if (pendingMigrations.length === 0) {
      console.log("[pre-migrate] All migrations already applied — no repair needed");
      return;
    }

    console.log(`[pre-migrate] ${pendingMigrations.length} pending migrations to check for partial state`);

    // For each pending migration, check if any of its CREATE INDEX targets already exist
    // If so, drop them so the migration can re-run cleanly
    for (const migration of pendingMigrations) {
      const sql = fs.readFileSync(migration.sqlFile, "utf-8");
      const indexes = parseCreateIndexes(sql);

      if (indexes.length === 0) continue;

      // Group indexes by table
      const byTable = {};
      for (const { indexName, tableName } of indexes) {
        if (!byTable[tableName]) byTable[tableName] = [];
        byTable[tableName].push(indexName);
      }

      let droppedCount = 0;

      for (const [tableName, indexNames] of Object.entries(byTable)) {
        const existing = await getExistingIndexes(conn, tableName);
        for (const indexName of indexNames) {
          if (existing.has(indexName)) {
            try {
              await conn.query(`DROP INDEX \`${indexName}\` ON \`${tableName}\``);
              droppedCount++;
              console.log(`[pre-migrate] Dropped stale index ${indexName} on ${tableName}`);
            } catch (err) {
              console.log(`[pre-migrate] WARNING: Could not drop ${indexName} on ${tableName}: ${err.message}`);
            }
          }
        }
      }

      if (droppedCount > 0) {
        console.log(`[pre-migrate] Repaired migration ${migration.tag}: dropped ${droppedCount} stale indexes`);

        // Also check if tables from this migration exist but the migration isn't in the journal
        // If so, we need to drop the tables too so they can be re-created
        // Actually, CREATE TABLE IF NOT EXISTS handles this — only indexes are the problem
      }
    }

    console.log("[pre-migrate] Pre-migration repair complete");
  } catch (err) {
    console.error(`[pre-migrate] WARNING: Pre-migration repair failed: ${err.message}`);
    console.error("[pre-migrate] Continuing with migration anyway...");
  } finally {
    if (conn) await conn.end();
  }
}

main();
