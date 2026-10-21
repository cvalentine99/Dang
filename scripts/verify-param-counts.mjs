/**
 * Broker audit (H-P3) — `npm run audit:broker`.
 *
 * Replaces the old regex count-matcher (which compared one hand-typed number
 * against another). This loads the real TypeScript modules through tsx and:
 *
 *   1. Every broker-wired ENDPOINT_REGISTRY entry must reference a config that
 *      exists in BROKER_CONFIG_REGISTRY and must NOT carry a hand-typed
 *      paramCount (counts are derived at report time).
 *   2. Every BROKER_CONFIG_REGISTRY config is compared, parameter name by
 *      parameter name, against the bundled Wazuh OpenAPI spec
 *      (shared/specPath.ts): phantom params, missing params, and enumValues
 *      that differ from the spec's own enum are all mismatches.
 *
 * Exit code 1 on any mismatch.
 */
import { tsImport } from "tsx/esm/api";

const coverage = await tsImport("../server/wazuh/brokerCoverage.ts", import.meta.url);
const audit = await tsImport("../server/wazuh/specParamAudit.ts", import.meta.url);

const { ENDPOINT_REGISTRY, BROKER_CONFIG_REGISTRY, deriveParamCount } = coverage;
const { diffConfigAgainstSpec, isSpecMismatch, SPEC_ABSENT_ALLOWED } = audit;

let mismatches = 0;
const configNames = new Set(BROKER_CONFIG_REGISTRY.map((c) => c.name));

console.log("=== Registry wiring ===\n");
for (const e of ENDPOINT_REGISTRY) {
  if (e.wiringLevel !== "broker") continue;
  if (!e.brokerConfig || !configNames.has(e.brokerConfig)) {
    mismatches++;
    console.log(`✗ ${e.procedure}: broker config ${e.brokerConfig ?? "(none)"} NOT FOUND in BROKER_CONFIG_REGISTRY`);
  } else if (e.paramCount !== undefined) {
    mismatches++;
    console.log(`✗ ${e.procedure}: hand-typed paramCount ${e.paramCount} on a broker entry (derived count is ${deriveParamCount(e)})`);
  }
}

console.log("\n=== Broker configs vs spec ===\n");
console.log("Config Name".padEnd(45) + "Params".padEnd(8) + "Status");
console.log("-".repeat(75));
for (const { name, config } of BROKER_CONFIG_REGISTRY) {
  const d = diffConfigAgainstSpec(config);
  const bad = isSpecMismatch(name, d);
  if (bad) mismatches++;
  const count = Object.keys(config.params).length;
  let detail = "OK";
  if (d.notInSpec) detail = bad ? `NOT IN SPEC (${config.endpoint})` : `allowed off-spec: ${SPEC_ABSENT_ALLOWED[name]}`;
  else if (bad) {
    const parts = [];
    if (d.extra.length) parts.push(`phantom: ${d.extra.join(",")}`);
    if (d.missing.length) parts.push(`missing: ${d.missing.join(",")}`);
    if (d.enumDrift.length) parts.push(`enum drift: ${d.enumDrift.join(",")}`);
    detail = `MISMATCH (${parts.join("; ")})`;
  }
  console.log(`${bad ? "✗" : "✓"} ${name}`.padEnd(45) + String(count).padEnd(8) + detail);
}

console.log("\n" + "=".repeat(75));
console.log(`Total mismatches: ${mismatches}`);
if (mismatches > 0) process.exit(1);
console.log("All broker configs match the spec.");
