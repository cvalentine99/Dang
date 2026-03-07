#!/usr/bin/env node
/**
 * seed-kg.mjs — CLI wrapper for the shared KG ETL pipeline.
 *
 * This file is a thin CLI entry point. ALL extraction logic, static data,
 * and database loading logic lives in the shared TypeScript modules:
 *
 *   server/graph/kgExtractor.ts — pure extraction from OpenAPI spec
 *   server/graph/kgLoader.ts    — database loading with FK mapping
 *   server/graph/kgTypes.ts     — shared type definitions
 *
 * This wrapper only handles:
 *   1. CLI argument parsing
 *   2. Database connection (mysql2 directly)
 *   3. Calling the shared modules via tsx
 *   4. Console output and exit codes
 *
 * Usage:
 *   node seed-kg.mjs [--drop] [--dry-run] [--spec <path>]
 *
 * Options:
 *   --drop       Truncate all kg_* tables before seeding
 *   --dry-run    Parse and extract only, no database writes
 *   --spec <path>   Path to the Wazuh OpenAPI YAML spec (default: ./spec-v4.14.3.yaml)
 *
 * Requires: tsx (for importing .ts modules), mysql2, js-yaml
 */

// ── This file MUST be run via tsx to resolve .ts imports ──────────────────
// Usage: npx tsx seed-kg.mjs [--drop] [--dry-run] [--spec <path>]
// Or:    node --import tsx/esm seed-kg.mjs [args]

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Import shared ETL modules ─────────────────────────────────────────────
// These are the SINGLE source of truth for extraction and loading logic.
import { extract } from "./server/graph/kgExtractor.ts";
import { loadAll, getLayerNames } from "./server/graph/kgLoader.ts";

// ── CLI argument parsing ──────────────────────────────────────────────────

const args = process.argv.slice(2);
const DROP = args.includes("--drop");
const DRY_RUN = args.includes("--dry-run");
const specIdx = args.indexOf("--spec");
const specPath = specIdx !== -1
  ? resolve(args[specIdx + 1])
  : resolve(__dirname, "spec-v4.14.3.yaml");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL && !DRY_RUN) {
  console.error("[seed-kg] ERROR: DATABASE_URL not set. Use --dry-run for offline mode.");
  process.exit(1);
}

// ── Read and parse spec ───────────────────────────────────────────────────

import { readFileSync } from "fs";
import yaml from "js-yaml";

console.log(`[seed-kg] Loading spec from ${specPath}`);
const specRaw = readFileSync(specPath, "utf8");
const spec = yaml.load(specRaw);

// ── Extract using shared module ───────────────────────────────────────────

const data = extract(spec);

console.log(`[seed-kg] Parsed spec: ${data.specTitle} v${data.specVersion}`);
console.log(`[seed-kg] Endpoints:      ${data.endpoints.length}`);
console.log(`[seed-kg] Parameters:     ${data.parameters.length}`);
console.log(`[seed-kg] Responses:      ${data.responses.length}`);
console.log(`[seed-kg] Auth methods:   ${data.authMethods.length}`);
console.log(`[seed-kg] Resources:      ${data.resources.length}`);
console.log(`[seed-kg] Use cases:      ${data.useCases.length}`);
console.log(`[seed-kg] Indices:        ${data.indices.length}`);
console.log(`[seed-kg] Fields:         ${data.fields.length}`);
console.log(`[seed-kg] Error patterns: ${data.errorPatterns.length}`);
const layerCount = getLayerNames().length;
console.log(`[seed-kg] Sync status:    ${layerCount}`);
const total = data.endpoints.length + data.parameters.length + data.responses.length +
  data.authMethods.length + data.resources.length + data.useCases.length +
  data.indices.length + data.fields.length + data.errorPatterns.length + layerCount;
console.log(`[seed-kg] TOTAL:          ${total}`);

if (DRY_RUN) {
  console.log("[seed-kg] Dry run complete. No database changes made.");
  process.exit(0);
}

// ── Database connection ───────────────────────────────────────────────────

const conn = await mysql.createConnection(DB_URL);
console.log("[seed-kg] Connected to database");

try {
  if (DROP) {
    console.log("[seed-kg] Truncating all kg_* tables...");
    await conn.execute("SET FOREIGN_KEY_CHECKS = 0");
    for (const t of [
      "kg_answer_provenance", "kg_trust_history", "kg_sync_status",
      "kg_error_patterns", "kg_fields", "kg_indices", "kg_use_cases",
      "kg_resources", "kg_responses", "kg_parameters", "kg_auth_methods",
      "kg_endpoints",
    ]) {
      await conn.execute(`TRUNCATE TABLE ${t}`);
    }
    await conn.execute("SET FOREIGN_KEY_CHECKS = 1");
    console.log("[seed-kg] All kg_* tables truncated");
  } else {
    const [rows] = await conn.execute("SELECT COUNT(*) as c FROM kg_endpoints");
    if (rows[0].c > 0) {
      console.log(`[seed-kg] WARNING: kg_endpoints already has ${rows[0].c} rows. Use --drop to truncate first.`);
      await conn.end();
      process.exit(1);
    }
  }

  // ── Load using shared module ──────────────────────────────────────────
  // The conn object from mysql2/promise satisfies the SqlExecutor interface
  // expected by kgLoader: { execute(sql, params?) }

  console.log("[seed-kg] Loading all 4 layers via shared kgLoader...");
  const result = await loadAll(conn, data);

  // ── Verification ────────────────────────────────────────────────────────

  console.log("\n[seed-kg] ═══ Verification ═══");
  let grandTotal = 0;
  for (const t of [
    "kg_endpoints", "kg_parameters", "kg_responses", "kg_auth_methods",
    "kg_resources", "kg_use_cases", "kg_indices", "kg_fields",
    "kg_error_patterns", "kg_sync_status",
  ]) {
    const [rows] = await conn.execute(`SELECT COUNT(*) as c FROM ${t}`);
    grandTotal += rows[0].c;
    console.log(`[seed-kg]   ${t}: ${rows[0].c}`);
  }
  console.log(`[seed-kg]   ─────────────────`);
  console.log(`[seed-kg]   TOTAL: ${grandTotal}`);

  // ── Per-layer summary from shared result ────────────────────────────────

  for (const layerName of getLayerNames()) {
    const lr = result.layers[layerName];
    if (lr) {
      console.log(`[seed-kg]   ${layerName}: ${lr.status} (${lr.entityCount} entities, ${lr.durationMs}ms)`);
    }
  }

  if (result.success) {
    console.log(`\n[seed-kg] ✓ Knowledge Graph seeded successfully in ${result.durationMs}ms!`);
  } else {
    console.error(`\n[seed-kg] ✗ Some layers failed. Check errors above.`);
    process.exit(1);
  }
} catch (err) {
  console.error(`[seed-kg] ERROR: ${err.message}`);
  if (err.code === "ER_DUP_ENTRY") {
    console.error("[seed-kg] Duplicate entry detected. Use --drop to truncate tables first.");
  }
  process.exit(1);
} finally {
  await conn.end();
}
