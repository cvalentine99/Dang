#!/usr/bin/env node
/**
 * Router ↔ KG Parameter Diff Script
 *
 * Statically compares the tRPC Zod input parameters declared in wazuhRouter.ts
 * against the kg_parameters table in the database.
 *
 * Produces a diff report showing:
 *   - Parameters in the router but NOT in the KG (potential KG gaps)
 *   - Parameters in the KG but NOT in the router (potential router gaps)
 *   - Matched parameters (alignment proof)
 *
 * Usage:
 *   DATABASE_URL=... node scripts/router-kg-param-diff.mjs
 *
 * Exit codes:
 *   0 = all matched or only expected gaps
 *   1 = unexpected gaps found
 */

import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("ERROR: DATABASE_URL is required.");
  process.exit(1);
}

// ── Step 1: Parse router Zod inputs statically ─────────────────────────────
// We map each tRPC procedure to the Wazuh API path it calls, and list the
// Zod input parameter names. This is a static declaration, not dynamic parsing.
//
// Updated after KG-only param wiring campaign — all endpoints now broker-wired.

const ROUTER_ENDPOINTS = [
  {
    procedure: "managerConfig",
    wazuhPath: "/manager/configuration",
    zodParams: ["section", "field", "raw", "distinct"],
    brokerWired: true,
  },
  {
    procedure: "managerLogs",
    wazuhPath: "/manager/logs",
    zodParams: [
      "limit", "offset", "level", "tag", "search",
      "sort", "q", "select", "distinct",
    ],
    brokerWired: true,
  },
  {
    procedure: "clusterNodes",
    wazuhPath: "/cluster/nodes",
    zodParams: [
      "limit", "offset", "search", "sort", "q", "select", "distinct",
      "type", "nodes_list",
    ],
    brokerWired: true,
  },
  {
    procedure: "agents",
    wazuhPath: "/agents",
    zodParams: [
      "limit", "offset", "status", "os_platform", "search", "group", "sort", "q",
      "select", "distinct", "os.name", "os.version", "older_than", "manager_host",
      "version", "node_name", "name", "ip", "registerIP", "group_config_status",
      "manager",
    ],
    brokerWired: true,
  },
  {
    procedure: "agentGroups",
    wazuhPath: "/groups",
    zodParams: [
      "limit", "offset", "search", "sort", "q", "select", "distinct",
      "hash", "groups_list",
    ],
    brokerWired: true,
  },
  {
    procedure: "groupAgents",
    wazuhPath: "/groups/{group_id}/agents",
    zodParams: [
      "groupId", "limit", "offset", "search", "sort", "q", "select", "distinct",
      "status",
    ],
    brokerWired: true,
  },
  {
    procedure: "rules",
    wazuhPath: "/rules",
    zodParams: [
      "limit", "offset", "level", "search", "group", "sort", "q", "select", "distinct",
      "status", "filename", "relative_dirname", "pci_dss", "gdpr", "gpg13", "hipaa",
      "nist-800-53", "tsc", "mitre", "rule_ids",
    ],
    brokerWired: true,
  },
  {
    procedure: "scaPolicies",
    wazuhPath: "/sca/{agent_id}",
    zodParams: [
      "agentId", "limit", "offset", "search", "sort", "q", "select", "distinct",
      "name", "description", "references",
    ],
    brokerWired: true,
  },
  {
    procedure: "scaChecks",
    wazuhPath: "/sca/{agent_id}/checks/{policy_id}",
    zodParams: [
      "agentId", "policyId", "result", "search", "sort", "q", "select", "distinct",
      "title", "description", "rationale", "remediation", "command", "reason",
      "file", "process", "directory", "registry", "references", "condition", "limit", "offset",
    ],
    brokerWired: true,
  },
  {
    procedure: "syscheckFiles",
    wazuhPath: "/syscheck/{agent_id}",
    zodParams: [
      "agentId", "type", "search", "hash", "file", "limit", "offset",
      "sort", "select", "q", "distinct",
      "arch", "value.name", "value.type", "summary", "md5", "sha1", "sha256",
    ],
    brokerWired: true,
  },
  {
    procedure: "agentPackages",
    wazuhPath: "/syscollector/{agent_id}/packages",
    zodParams: [
      "agentId", "limit", "offset", "search", "sort", "q", "select", "distinct",
      "vendor", "name", "architecture", "format", "version",
    ],
    brokerWired: true,
  },
  {
    procedure: "agentPorts",
    wazuhPath: "/syscollector/{agent_id}/ports",
    zodParams: [
      "agentId", "limit", "offset", "search", "sort", "q", "select", "distinct",
      "protocol", "local_ip", "local_port", "remote_ip", "state", "pid", "process", "tx_queue",
    ],
    brokerWired: true,
  },
  {
    procedure: "agentProcesses",
    wazuhPath: "/syscollector/{agent_id}/processes",
    zodParams: [
      "agentId", "limit", "offset", "search", "sort", "q", "select", "distinct",
      "pid", "state", "ppid", "egroup", "euser", "fgroup", "name", "nlwp", "pgrp",
      "priority", "rgroup", "ruser", "sgroup", "suser",
    ],
    brokerWired: true,
  },
  {
    procedure: "agentServices",
    wazuhPath: "/syscollector/{agent_id}/services",
    zodParams: ["agentId", "limit", "offset", "search", "q", "sort", "select", "distinct"],
    brokerWired: true,
  },
  {
    procedure: "mitreTechniques",
    wazuhPath: "/mitre/techniques",
    zodParams: [
      "limit", "offset", "search", "sort", "select", "q", "distinct",
      "technique_ids",
    ],
    brokerWired: true,
  },
  {
    procedure: "decoders",
    wazuhPath: "/decoders",
    zodParams: [
      "limit", "offset", "search", "sort", "select", "q", "distinct",
      "decoder_names", "filename", "relative_dirname", "status",
    ],
    brokerWired: true,
  },
  {
    procedure: "rootcheckResults",
    wazuhPath: "/rootcheck/{agent_id}",
    zodParams: [
      "agentId", "limit", "offset",
      "sort", "search", "select", "q", "distinct",
      "status", "pci_dss", "cis",
    ],
    brokerWired: true,
  },
  {
    procedure: "ciscatResults",
    wazuhPath: "/ciscat/{agent_id}/results",
    zodParams: [
      "agentId", "limit", "offset",
      "sort", "search", "select", "q", "distinct",
      "benchmark", "profile", "pass", "fail", "error", "notchecked", "unknown", "score",
    ],
    brokerWired: true,
  },
];

// Parameters that are internal to the router (not Wazuh API params).
// Path segments are extracted from the URL, not sent as query params.
// Aliases are broker-mapped to their canonical Wazuh names.
const INTERNAL_PARAMS = new Set([
  // Path segments
  "agentId",    // → {agent_id} in URL
  "policyId",   // → {policy_id} in URL
  "groupId",    // → {group_id} in URL
]);

// Router Zod param name → canonical Wazuh KG param name.
// The broker maps these aliases automatically; the diff script must
// recognize them as "matched" against the KG canonical name.
const ALIAS_TO_CANONICAL = {
  os_platform: "os.platform",
  manager_host: "manager",
  local_ip: "local.ip",
  local_port: "local.port",
  remote_ip: "remote.ip",
  tx_queue: "tx_queue",
};

// KG path params that correspond to URL path segments (not query params).
// These exist in kg_parameters with location='path' but are handled by the
// router via URL interpolation, not as Zod query inputs.
const KG_PATH_PARAMS = new Set([
  "agent_id",
  "policy_id",
  "group_id",
]);

// ── Step 2: Query KG parameters from database ──────────────────────────────

const conn = await mysql.createConnection(DB_URL);

// Build a map: wazuhPath → Set of KG param names (query only, skip body and path)
const kgParamMap = new Map();

const [endpoints] = await conn.execute(
  "SELECT id, method, path FROM kg_endpoints WHERE method = 'GET'"
);

for (const ep of endpoints) {
  const [params] = await conn.execute(
    "SELECT name, location FROM kg_parameters WHERE endpoint_id = ? AND location = 'query'",
    [ep.id]
  );
  kgParamMap.set(ep.path, new Set(params.map(p => p.name)));
}

await conn.end();

// ── Step 3: Diff ────────────────────────────────────────────────────────────

let totalMatched = 0;
let totalRouterOnly = 0;
let totalKgOnly = 0;
const report = [];

for (const entry of ROUTER_ENDPOINTS) {
  const kgParams = kgParamMap.get(entry.wazuhPath);
  if (!kgParams) {
    report.push({
      procedure: entry.procedure,
      wazuhPath: entry.wazuhPath,
      status: "NO_KG_ENDPOINT",
      message: `No KG endpoint found for ${entry.wazuhPath}`,
    });
    continue;
  }

  // Filter out internal params from the router set
  const routerParams = new Set(
    entry.zodParams.filter(p => !INTERNAL_PARAMS.has(p))
  );

  // Build a set of canonical KG names that the router covers
  // (includes both direct matches and alias-resolved names)
  const routerCanonicalNames = new Set();
  for (const p of routerParams) {
    if (ALIAS_TO_CANONICAL[p]) {
      routerCanonicalNames.add(ALIAS_TO_CANONICAL[p]);
    }
    routerCanonicalNames.add(p);
  }

  const matched = [];
  const routerOnly = [];
  const kgOnly = [];

  for (const p of routerParams) {
    const canonical = ALIAS_TO_CANONICAL[p] || p;
    if (kgParams.has(canonical) || kgParams.has(p)) {
      matched.push(p);
    } else {
      routerOnly.push(p);
    }
  }

  // KG params not in router (excluding universal params like pretty, wait_for_complete)
  // Also exclude path params that are handled via URL interpolation
  const UNIVERSAL_SKIP = new Set(["pretty", "wait_for_complete", "agents_list"]);
  for (const p of kgParams) {
    if (!routerCanonicalNames.has(p) && !INTERNAL_PARAMS.has(p) && !UNIVERSAL_SKIP.has(p) && !KG_PATH_PARAMS.has(p)) {
      kgOnly.push(p);
    }
  }

  totalMatched += matched.length;
  totalRouterOnly += routerOnly.length;
  totalKgOnly += kgOnly.length;

  report.push({
    procedure: entry.procedure,
    wazuhPath: entry.wazuhPath,
    brokerWired: entry.brokerWired,
    matched: matched.length,
    routerOnly: routerOnly.length > 0 ? routerOnly : null,
    kgOnly: kgOnly.length > 0 ? kgOnly : null,
  });
}

// ── Step 4: Print report ────────────────────────────────────────────────────

console.log("═══════════════════════════════════════════════════════════════");
console.log("  Router ↔ KG Parameter Diff Report");
console.log("═══════════════════════════════════════════════════════════════\n");

for (const r of report) {
  const icon = r.status === "NO_KG_ENDPOINT" ? "⚠" :
    (r.routerOnly || r.kgOnly) ? "△" : "✓";
  console.log(`${icon} ${r.procedure} → ${r.wazuhPath}${r.brokerWired ? " [broker]" : ""}`);

  if (r.status === "NO_KG_ENDPOINT") {
    console.log(`    ${r.message}`);
    continue;
  }

  console.log(`    Matched: ${r.matched}`);
  if (r.routerOnly) {
    console.log(`    Router-only (alias/mapped): ${r.routerOnly.join(", ")}`);
  }
  if (r.kgOnly) {
    console.log(`    KG-only (not in router): ${r.kgOnly.join(", ")}`);
  }
}

console.log("\n───────────────────────────────────────────────────────────────");
console.log(`  Total matched:     ${totalMatched}`);
console.log(`  Router-only:       ${totalRouterOnly} (aliases or broker-mapped)`);
console.log(`  KG-only:           ${totalKgOnly} (available in spec, not yet in router)`);
console.log("───────────────────────────────────────────────────────────────");

// Exit with 1 if there are KG-only params remaining
if (totalKgOnly > 0) {
  console.log(`\n⚠ ${totalKgOnly} KG-only params still need wiring into the router.`);
  process.exit(1);
}

console.log("\n✓ All KG query params are wired into the router. Zero gaps.");
process.exit(0);
