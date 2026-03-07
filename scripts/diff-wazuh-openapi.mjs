#!/usr/bin/env node
/**
 * diff-wazuh-openapi.mjs
 *
 * Compares the Wazuh OpenAPI spec (GET endpoints only) against the
 * ENDPOINT_REGISTRY in brokerCoverage.ts and the allowlist in
 * spec/openapi-allowlist.json.
 *
 * Exit codes:
 *   0 — all spec GET endpoints are either wired or allowlisted
 *   1 — one or more spec GET endpoints are missing from both
 *
 * Usage:
 *   node scripts/diff-wazuh-openapi.mjs [--spec path/to/spec.yaml]
 *
 * Outputs:
 *   - Human-readable summary to stdout
 *   - JSON artifact to spec/openapi-diff-result.json
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// ── Parse args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let specPath = resolve(projectRoot, "spec/wazuh-api-v4.14.3.yaml");
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--spec" && args[i + 1]) {
    specPath = resolve(args[i + 1]);
    i++;
  }
}

// ── Load spec ───────────────────────────────────────────────────────────────
if (!existsSync(specPath)) {
  console.error(`ERROR: Spec file not found at ${specPath}`);
  console.error("Download it with:");
  console.error('  curl -sL "https://raw.githubusercontent.com/wazuh/wazuh/v4.14.3/api/api/spec/spec.yaml" -o spec/wazuh-api-v4.14.3.yaml');
  process.exit(1);
}

const specSrc = readFileSync(specPath, "utf8");

// Parse paths from the OpenAPI YAML spec.
// Paths are at 2-space indent under 'paths:', methods at 4-space indent.
// We split on lines that start with exactly 2 spaces + '/' (path definitions).
const specGetPaths = new Set();

// Find the 'paths:' section
const pathsSectionIdx = specSrc.indexOf("\npaths:");
if (pathsSectionIdx === -1) {
  console.error("ERROR: Could not find 'paths:' section in spec");
  process.exit(1);
}
const pathsSection = specSrc.substring(pathsSectionIdx);

// Split on path definitions (2-space indent + /path:)
const pathBlocks = pathsSection.split(/\n(?=  \/[^\s])/g);

for (const block of pathBlocks) {
  const pathMatch = block.match(/^  (\/[^\s:]+):/m);
  if (!pathMatch) continue;
  const path = pathMatch[1];
  // Check if this path block contains a 'get:' method at 4-space indent
  if (/^    get:/m.test(block)) {
    specGetPaths.add(path);
  }
}

console.log(`\n=== Wazuh OpenAPI Spec Diff ===\n`);
console.log(`Spec: ${specPath}`);
console.log(`Spec GET endpoints: ${specGetPaths.size}`);

// ── Load ENDPOINT_REGISTRY ──────────────────────────────────────────────────
const coveragePath = resolve(projectRoot, "server/wazuh/brokerCoverage.ts");
const coverageSrc = readFileSync(coveragePath, "utf8");

const registryPaths = new Set();
const registryRegex = /wazuhPath:\s*"([^"]+)"/g;
let match;
while ((match = registryRegex.exec(coverageSrc)) !== null) {
  const path = match[1];
  if (!path.startsWith("N/A")) {
    registryPaths.add(path);
  }
}

console.log(`Registry endpoints: ${registryPaths.size}`);

// ── Load allowlist ──────────────────────────────────────────────────────────
const allowlistPath = resolve(projectRoot, "spec/openapi-allowlist.json");
let allowlist = { endpoints: [], reasons: {} };
if (existsSync(allowlistPath)) {
  try {
    allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));
  } catch (e) {
    console.error(`WARNING: Could not parse ${allowlistPath}: ${e.message}`);
  }
}
const allowedPaths = new Set(allowlist.endpoints || []);
console.log(`Allowlisted endpoints: ${allowedPaths.size}`);

// ── Normalize path params for comparison ────────────────────────────────────
// Spec uses {agent_id}, registry might use {agent_id} — they should match.
// But some spec paths use different param names. Normalize all {xxx} to {*}.
function normalizePath(p) {
  return p.replace(/\{[^}]+\}/g, "{*}");
}

const normalizedRegistry = new Map();
for (const p of registryPaths) {
  normalizedRegistry.set(normalizePath(p), p);
}

const normalizedAllowlist = new Map();
for (const p of allowedPaths) {
  normalizedAllowlist.set(normalizePath(p), p);
}

// ── Diff ────────────────────────────────────────────────────────────────────
const covered = [];
const allowlisted = [];
const missing = [];
const extraInRegistry = [];

for (const specPath of [...specGetPaths].sort()) {
  const norm = normalizePath(specPath);
  if (normalizedRegistry.has(norm)) {
    covered.push({ specPath, registryPath: normalizedRegistry.get(norm) });
  } else if (normalizedAllowlist.has(norm)) {
    const reason = allowlist.reasons?.[specPath] || allowlist.reasons?.[normalizedAllowlist.get(norm)] || "No reason given";
    allowlisted.push({ specPath, reason });
  } else {
    missing.push(specPath);
  }
}

// Check for registry paths not in spec (extra endpoints we added)
for (const regPath of [...registryPaths].sort()) {
  const norm = normalizePath(regPath);
  let found = false;
  for (const specPath of specGetPaths) {
    if (normalizePath(specPath) === norm) {
      found = true;
      break;
    }
  }
  if (!found && !regPath.startsWith("N/A")) {
    extraInRegistry.push(regPath);
  }
}

// ── Output ──────────────────────────────────────────────────────────────────
console.log(`\n--- Coverage Summary ---`);
console.log(`  Covered by registry: ${covered.length}`);
console.log(`  Allowlisted (intentionally skipped): ${allowlisted.length}`);
console.log(`  MISSING (not wired, not allowlisted): ${missing.length}`);
console.log(`  Extra in registry (not in spec): ${extraInRegistry.length}`);

if (allowlisted.length > 0) {
  console.log(`\n--- Allowlisted Endpoints ---`);
  for (const { specPath, reason } of allowlisted) {
    console.log(`  ✓ ${specPath}`);
    console.log(`    Reason: ${reason}`);
  }
}

if (missing.length > 0) {
  console.log(`\n--- MISSING Endpoints (FAIL) ---`);
  for (const p of missing) {
    console.log(`  ✗ ${p}`);
  }
}

if (extraInRegistry.length > 0) {
  console.log(`\n--- Extra in Registry (INFO) ---`);
  for (const p of extraInRegistry) {
    console.log(`  ℹ ${p}`);
  }
}

// ── Write JSON artifact ─────────────────────────────────────────────────────
const artifact = {
  timestamp: new Date().toISOString(),
  specFile: specPath,
  specGetEndpoints: specGetPaths.size,
  registryEndpoints: registryPaths.size,
  allowlistedEndpoints: allowedPaths.size,
  summary: {
    covered: covered.length,
    allowlisted: allowlisted.length,
    missing: missing.length,
    extraInRegistry: extraInRegistry.length,
  },
  covered: covered.map(c => c.specPath),
  allowlisted: allowlisted,
  missing: missing,
  extraInRegistry: extraInRegistry,
};

const artifactPath = resolve(projectRoot, "spec/openapi-diff-result.json");
writeFileSync(artifactPath, JSON.stringify(artifact, null, 2) + "\n");
console.log(`\nArtifact written to: ${artifactPath}`);

// ── Exit code ───────────────────────────────────────────────────────────────
if (missing.length > 0) {
  console.log(`\n❌ FAIL: ${missing.length} spec endpoint(s) not wired and not allowlisted.`);
  console.log(`   Add them to the router or to spec/openapi-allowlist.json with a reason.`);
  process.exit(1);
} else {
  console.log(`\n✅ PASS: All ${specGetPaths.size} spec GET endpoints are covered or allowlisted.`);
  process.exit(0);
}
