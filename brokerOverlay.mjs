#!/usr/bin/env node
/**
 * brokerOverlay.mjs — Knowledge Graph Broker Enrichment Overlay
 *
 * Adds three metadata overlays to existing KG nodes:
 *   1. Tags 7 broker-wired endpoints with broker_validated = 1
 *   2. Adds app_aliases JSON arrays to parameter nodes for alias resolution
 *   3. Updates trust_score by +0.05 for broker-wired endpoints (cap 0.950)
 *
 * This script is IDEMPOTENT — safe to re-run after a --drop reseed.
 * It does NOT alter spec-derived data (canonical names, paths, response schemas).
 * It only sets overlay properties on existing nodes.
 *
 * Usage:
 *   DATABASE_URL=mysql://user:pass@host:port/db node brokerOverlay.mjs
 *   DATABASE_URL=... node brokerOverlay.mjs --dry-run
 *
 * Requirements:
 *   npm install mysql2   (already in the project's package.json)
 */

import mysql from "mysql2/promise";

// ── CLI args ────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL && !DRY_RUN) {
  console.error("ERROR: DATABASE_URL environment variable is required.");
  process.exit(1);
}

// ── Overlay Data ────────────────────────────────────────────────────────────

/**
 * Section 3.1: Broker-wired endpoints.
 * endpoint_id format matches seed-kg.mjs: "METHOD:path"
 */
const BROKER_WIRED_ENDPOINTS = [
  { endpointId: "GET:/agents",                              phase: 1 },
  { endpointId: "GET:/rules",                               phase: 1 },
  { endpointId: "GET:/groups",                              phase: 1 },
  { endpointId: "GET:/cluster/nodes",                       phase: 1 },
  { endpointId: "GET:/sca/{agent_id}",                      phase: 1 },
  { endpointId: "GET:/sca/{agent_id}/checks/{policy_id}",   phase: 2 },
  { endpointId: "GET:/manager/configuration",               phase: 2 },
];

/**
 * Section 3.2: Application-layer aliases.
 * Key: "endpoint_id::param_name" where param_name is the CANONICAL spec name.
 * Value: array of app-layer aliases the broker accepts.
 *
 * These are stored as a JSON property on the canonical parameter node.
 * They do NOT create new parameter nodes.
 */
const PARAM_ALIASES = [
  // /agents parameters
  { endpointId: "GET:/agents", paramName: "os.platform",          aliases: ["os_platform", "osPlatform", "platform"] },
  { endpointId: "GET:/agents", paramName: "os.version",           aliases: ["os_version", "osVersion"] },
  { endpointId: "GET:/agents", paramName: "os.name",              aliases: ["os_name", "osName"] },
  { endpointId: "GET:/agents", paramName: "older_than",           aliases: ["olderThan"] },
  { endpointId: "GET:/agents", paramName: "manager",              aliases: ["manager_host", "managerHost"] },
  { endpointId: "GET:/agents", paramName: "group",                aliases: ["agent_group"] },
  { endpointId: "GET:/agents", paramName: "node_name",            aliases: ["nodeName"] },
  { endpointId: "GET:/agents", paramName: "group_config_status",  aliases: ["groupConfigStatus"] },

  // /cluster/nodes parameters
  { endpointId: "GET:/cluster/nodes", paramName: "type",          aliases: ["node_type", "nodeType"] },

  // /rules parameters
  { endpointId: "GET:/rules", paramName: "nist-800-53",           aliases: ["nist_800_53"] },
  { endpointId: "GET:/rules", paramName: "relative_dirname",      aliases: ["relativeDirname"] },

  // /sca/{agent_id} parameters
  { endpointId: "GET:/sca/{agent_id}", paramName: "name",         aliases: ["policyName"] },

  // /sca/{agent_id}/checks/{policy_id} parameters
  { endpointId: "GET:/sca/{agent_id}/checks/{policy_id}", paramName: "file", aliases: ["full_path"] },
];

/**
 * Section 3.3: Trust score adjustments.
 * Broker-wired endpoints get a fixed target score (baseline + boost).
 * This is idempotent: re-running sets the same target, not additive.
 * The seed baseline is 0.500. Broker validation adds +0.05 → target 0.550.
 * Cap at 0.950.
 */
const SEED_BASELINE = 0.500;
const TRUST_BOOST = 0.05;
const TRUST_TARGET = Math.min(SEED_BASELINE + TRUST_BOOST, 0.950);

// ── Execution ───────────────────────────────────────────────────────────────

console.log("[brokerOverlay] Starting broker overlay enrichment...");
if (DRY_RUN) console.log("[brokerOverlay] DRY RUN — no database changes will be made.");

const stats = {
  endpointsTagged: 0,
  endpointsNotFound: 0,
  aliasesSet: 0,
  aliasesNotFound: 0,
  trustUpdated: 0,
};

if (!DRY_RUN) {
  const conn = await mysql.createConnection(DB_URL);
  console.log("[brokerOverlay] Connected to database");

  try {
    // ── Step 1: Tag broker-wired endpoints ──────────────────────────────

    console.log("\n[brokerOverlay] Step 1: Tagging broker-wired endpoints...");
    for (const ep of BROKER_WIRED_ENDPOINTS) {
      const [result] = await conn.execute(
        `UPDATE kg_endpoints SET broker_validated = 1 WHERE endpoint_id = ?`,
        [ep.endpointId]
      );
      if (result.affectedRows > 0) {
        stats.endpointsTagged++;
        console.log(`  ✓ ${ep.endpointId} → broker_validated = 1 (Phase ${ep.phase})`);
      } else {
        stats.endpointsNotFound++;
        console.log(`  ✗ ${ep.endpointId} — NOT FOUND in kg_endpoints`);
      }
    }

    // ── Step 2: Add app_aliases to parameter nodes ──────────────────────

    console.log("\n[brokerOverlay] Step 2: Setting app_aliases on parameter nodes...");
    for (const alias of PARAM_ALIASES) {
      // Find the endpoint's auto-increment id first
      const [epRows] = await conn.execute(
        `SELECT id FROM kg_endpoints WHERE endpoint_id = ?`,
        [alias.endpointId]
      );
      if (epRows.length === 0) {
        stats.aliasesNotFound++;
        console.log(`  ✗ ${alias.endpointId}::${alias.paramName} — endpoint not found`);
        continue;
      }
      const epDbId = epRows[0].id;

      // Update the parameter node with aliases
      const [result] = await conn.execute(
        `UPDATE kg_parameters SET app_aliases = ? WHERE endpoint_id = ? AND name = ?`,
        [JSON.stringify(alias.aliases), epDbId, alias.paramName]
      );
      if (result.affectedRows > 0) {
        stats.aliasesSet++;
        console.log(`  ✓ ${alias.endpointId}::${alias.paramName} → aliases: [${alias.aliases.join(", ")}]`);
      } else {
        stats.aliasesNotFound++;
        console.log(`  ✗ ${alias.endpointId}::${alias.paramName} — parameter not found (endpoint_id=${epDbId})`);
      }
    }

    // ── Step 3: Update trust scores ─────────────────────────────────────

    console.log("\n[brokerOverlay] Step 3: Setting trust scores for broker-wired endpoints...");
    const targetStr = TRUST_TARGET.toFixed(3);
    for (const ep of BROKER_WIRED_ENDPOINTS) {
      // Read current trust_score for logging
      const [rows] = await conn.execute(
        `SELECT trust_score FROM kg_endpoints WHERE endpoint_id = ?`,
        [ep.endpointId]
      );
      if (rows.length === 0) continue; // already logged in Step 1

      const currentScore = parseFloat(rows[0].trust_score);

      // Idempotent: SET to fixed target, not additive
      await conn.execute(
        `UPDATE kg_endpoints SET trust_score = ? WHERE endpoint_id = ?`,
        [targetStr, ep.endpointId]
      );
      stats.trustUpdated++;
      if (currentScore === TRUST_TARGET) {
        console.log(`  ✓ ${ep.endpointId} → trust_score: ${targetStr} (already at target)`);
      } else {
        console.log(`  ✓ ${ep.endpointId} → trust_score: ${currentScore.toFixed(3)} → ${targetStr}`);
      }
    }

    // ── Summary ─────────────────────────────────────────────────────────

    console.log("\n[brokerOverlay] ═══ Summary ═══");
    console.log(`  Endpoints tagged:       ${stats.endpointsTagged} / ${BROKER_WIRED_ENDPOINTS.length}`);
    console.log(`  Endpoints not found:    ${stats.endpointsNotFound}`);
    console.log(`  Aliases set:            ${stats.aliasesSet} / ${PARAM_ALIASES.length}`);
    console.log(`  Aliases not found:      ${stats.aliasesNotFound}`);
    console.log(`  Trust scores updated:   ${stats.trustUpdated}`);

    // ── Spot-check verification ─────────────────────────────────────────

    console.log("\n[brokerOverlay] ═══ Spot-check Verification ═══");

    // Verify broker_validated
    const [bvRows] = await conn.execute(
      `SELECT endpoint_id, broker_validated, trust_score FROM kg_endpoints WHERE broker_validated = 1`
    );
    console.log(`  broker_validated = 1 endpoints: ${bvRows.length}`);
    for (const r of bvRows) {
      console.log(`    ${r.endpoint_id} (trust: ${r.trust_score})`);
    }

    // Verify aliases
    const [aliasRows] = await conn.execute(
      `SELECT p.name, p.app_aliases, e.endpoint_id 
       FROM kg_parameters p 
       JOIN kg_endpoints e ON p.endpoint_id = e.id 
       WHERE p.app_aliases IS NOT NULL`
    );
    console.log(`  Parameters with aliases: ${aliasRows.length}`);
    for (const r of aliasRows) {
      const aliases = typeof r.app_aliases === "string" ? JSON.parse(r.app_aliases) : r.app_aliases;
      console.log(`    ${r.endpoint_id}::${r.name} → [${aliases.join(", ")}]`);
    }

    console.log("\n[brokerOverlay] ✓ Overlay enrichment complete!");

  } catch (err) {
    console.error(`[brokerOverlay] ERROR: ${err.message}`);
    process.exit(1);
  } finally {
    await conn.end();
  }
} else {
  // Dry run — just print what would happen
  console.log("\n[brokerOverlay] Step 1: Would tag these endpoints:");
  for (const ep of BROKER_WIRED_ENDPOINTS) {
    console.log(`  ${ep.endpointId} → broker_validated = 1 (Phase ${ep.phase})`);
  }
  console.log("\n[brokerOverlay] Step 2: Would set these aliases:");
  for (const alias of PARAM_ALIASES) {
    console.log(`  ${alias.endpointId}::${alias.paramName} → [${alias.aliases.join(", ")}]`);
  }
  console.log("\n[brokerOverlay] Step 3: Would boost trust by +0.05 (cap 0.950) on all 7 endpoints.");
  console.log("\n[brokerOverlay] Dry run complete.");
}
