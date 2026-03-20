#!/usr/bin/env node
/**
 * diff-wazuh-openapi.mjs
 *
 * Compares the Wazuh OpenAPI spec (GET endpoints only) against the
 * ENDPOINT_REGISTRY in brokerCoverage.ts and the governance file at
 * spec/openapi-allowlist.json.
 *
 * Guarantees:
 *   - Endpoint inventory coverage: every spec GET path is either
 *     wired in the registry OR listed in the "excluded" allowlist.
 *   - Extra-endpoint governance: every registry path that is NOT in
 *     the spec must be documented in the "extra" section of the
 *     allowlist. Undocumented extras fail the check.
 *
 * This script does NOT verify per-endpoint parameter parity.
 * For param-count consistency, see scripts/verify-param-counts.mjs.
 *
 * Exit codes:
 *   0 — all checks pass
 *   1 — one or more spec endpoints are missing, or undocumented extras exist
 *
 * Usage:
 *   node scripts/diff-wazuh-openapi.mjs [--spec path/to/spec.yaml]
 *
 * Outputs:
 *   - Human-readable summary to stdout
 *   - JSON artifact to spec/openapi-diff-result.json
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

// ── Discover newest spec file ───────────────────────────────────────────────
function findNewestSpec() {
  const specDir = join(projectRoot, "spec");
  try {
    const files = readdirSync(specDir)
      .filter(f => f.startsWith("wazuh-api-v") && f.endsWith(".yaml"))
      .sort()
      .reverse();
    if (files.length > 0) return resolve(specDir, files[0]);
  } catch { /* ignore */ }
  return null;
}

// ── Parse args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let specPath = findNewestSpec();
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--spec" && args[i + 1]) {
    specPath = resolve(args[i + 1]);
    i++;
  }
}

// ── Load spec ───────────────────────────────────────────────────────────────
if (!specPath || !existsSync(specPath)) {
  console.error(`ERROR: No spec file found in spec/ directory`);
  console.error("Place a Wazuh OpenAPI spec as spec/wazuh-api-v<VERSION>.yaml");
  process.exit(1);
}

const specSrc = readFileSync(specPath, "utf8");

// Parse paths from the OpenAPI YAML spec.
// Paths are at 2-space indent under 'paths:', methods at 4-space indent.
const specGetPaths = new Set();

const pathsSectionIdx = specSrc.indexOf("\npaths:");
if (pathsSectionIdx === -1) {
  console.error("ERROR: Could not find 'paths:' section in spec");
  process.exit(1);
}
const pathsSection = specSrc.substring(pathsSectionIdx);
const pathBlocks = pathsSection.split(/\n(?=  \/[^\s])/g);

for (const block of pathBlocks) {
  const pathMatch = block.match(/^  (\/[^\s:]+):/m);
  if (!pathMatch) continue;
  const path = pathMatch[1];
  if (/^    get:/m.test(block)) {
    specGetPaths.add(path);
  }
}

console.log(`\n=== Wazuh OpenAPI Spec Diff ===`);
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

// ── Load governance file ────────────────────────────────────────────────────
const allowlistPath = resolve(projectRoot, "spec/openapi-allowlist.json");
let governance = { excluded: { endpoints: [], reasons: {} }, extra: { endpoints: [], reasons: {} } };
if (existsSync(allowlistPath)) {
  try {
    governance = JSON.parse(readFileSync(allowlistPath, "utf8"));
  } catch (e) {
    console.error(`WARNING: Could not parse ${allowlistPath}: ${e.message}`);
  }
}

const excludedPaths = new Set(governance.excluded?.endpoints || []);
const documentedExtras = new Set(governance.extra?.endpoints || []);
console.log(`Excluded (allowlisted): ${excludedPaths.size}`);
console.log(`Documented extras: ${documentedExtras.size}`);

// ── Normalize path params for comparison ────────────────────────────────────
function normalizePath(p) {
  return p.replace(/\{[^}]+\}/g, "{*}");
}

const normalizedRegistry = new Map();
for (const p of registryPaths) {
  normalizedRegistry.set(normalizePath(p), p);
}

const normalizedExcluded = new Map();
for (const p of excludedPaths) {
  normalizedExcluded.set(normalizePath(p), p);
}

const normalizedDocExtras = new Map();
for (const p of documentedExtras) {
  normalizedDocExtras.set(normalizePath(p), p);
}

// ── Diff: spec coverage ─────────────────────────────────────────────────────
const covered = [];
const allowlisted = [];
const missing = [];

for (const sp of [...specGetPaths].sort()) {
  const norm = normalizePath(sp);
  if (normalizedRegistry.has(norm)) {
    covered.push({ specPath: sp, registryPath: normalizedRegistry.get(norm) });
  } else if (normalizedExcluded.has(norm)) {
    const reason = governance.excluded?.reasons?.[sp]
      || governance.excluded?.reasons?.[normalizedExcluded.get(norm)]
      || "No reason given";
    allowlisted.push({ specPath: sp, reason });
  } else {
    missing.push(sp);
  }
}

// ── Diff: extra-endpoint governance ─────────────────────────────────────────
const documentedExtraList = [];
const undocumentedExtraList = [];

for (const regPath of [...registryPaths].sort()) {
  const norm = normalizePath(regPath);
  let inSpec = false;
  for (const sp of specGetPaths) {
    if (normalizePath(sp) === norm) {
      inSpec = true;
      break;
    }
  }
  if (!inSpec && !regPath.startsWith("N/A")) {
    if (normalizedDocExtras.has(norm)) {
      const reason = governance.extra?.reasons?.[regPath]
        || governance.extra?.reasons?.[normalizedDocExtras.get(norm)]
        || "No reason given";
      documentedExtraList.push({ path: regPath, reason });
    } else {
      undocumentedExtraList.push(regPath);
    }
  }
}

// ── Output ──────────────────────────────────────────────────────────────────
console.log(`\n--- Spec Coverage ---`);
console.log(`  Wired in registry: ${covered.length}`);
console.log(`  Excluded (allowlisted): ${allowlisted.length}`);
console.log(`  MISSING (not wired, not excluded): ${missing.length}`);

console.log(`\n--- Extra-Endpoint Governance ---`);
console.log(`  Documented extras: ${documentedExtraList.length}`);
console.log(`  UNDOCUMENTED extras: ${undocumentedExtraList.length}`);

if (allowlisted.length > 0) {
  console.log(`\n--- Excluded Endpoints (intentionally not wired) ---`);
  for (const { specPath: sp, reason } of allowlisted) {
    console.log(`  ✓ ${sp}`);
    console.log(`    Reason: ${reason}`);
  }
}

if (documentedExtraList.length > 0) {
  console.log(`\n--- Documented Extra Endpoints (not in spec, intentional) ---`);
  for (const { path, reason } of documentedExtraList) {
    console.log(`  ✓ ${path}`);
    console.log(`    Reason: ${reason}`);
  }
}

if (missing.length > 0) {
  console.log(`\n--- MISSING Endpoints (FAIL) ---`);
  for (const p of missing) {
    console.log(`  ✗ ${p}`);
  }
}

if (undocumentedExtraList.length > 0) {
  console.log(`\n--- UNDOCUMENTED Extra Endpoints (FAIL) ---`);
  for (const p of undocumentedExtraList) {
    console.log(`  ✗ ${p}`);
  }
  console.log(`  → Add these to spec/openapi-allowlist.json "extra" section with reasons.`);
}

// ── Write JSON artifact ─────────────────────────────────────────────────────
const artifact = {
  timestamp: new Date().toISOString(),
  specFile: specPath,
  specGetEndpoints: specGetPaths.size,
  registryEndpoints: registryPaths.size,
  summary: {
    covered: covered.length,
    excluded: allowlisted.length,
    missing: missing.length,
    documentedExtras: documentedExtraList.length,
    undocumentedExtras: undocumentedExtraList.length,
  },
  covered: covered.map(c => c.specPath),
  excluded: allowlisted,
  missing: missing,
  documentedExtras: documentedExtraList,
  undocumentedExtras: undocumentedExtraList,
};

const artifactPath = resolve(projectRoot, "spec/openapi-diff-result.json");
writeFileSync(artifactPath, JSON.stringify(artifact, null, 2) + "\n");
console.log(`\nArtifact written to: ${artifactPath}`);

// ── Exit code ───────────────────────────────────────────────────────────────
const failures = [];
if (missing.length > 0) {
  failures.push(`${missing.length} spec endpoint(s) not wired and not excluded`);
}
if (undocumentedExtraList.length > 0) {
  failures.push(`${undocumentedExtraList.length} extra registry endpoint(s) not documented`);
}

if (failures.length > 0) {
  console.log(`\n❌ FAIL: ${failures.join("; ")}.`);
  console.log(`   Fix: wire missing endpoints or update spec/openapi-allowlist.json.`);
  process.exit(1);
} else {
  console.log(`\n✅ PASS: ${covered.length} wired + ${allowlisted.length} excluded = ${covered.length + allowlisted.length}/${specGetPaths.size} spec endpoints accounted for.`);
  console.log(`   ${documentedExtraList.length} extra registry endpoint(s) documented.`);
  process.exit(0);
}
