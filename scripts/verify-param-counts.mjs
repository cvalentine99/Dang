/**
 * Cross-check every broker-wired endpoint's paramCount in the registry
 * against the actual param count in the broker config.
 */
import { readFileSync } from "fs";

const brokerSrc = readFileSync("server/wazuh/paramBroker.ts", "utf8");
const coverageSrc = readFileSync("server/wazuh/brokerCoverage.ts", "utf8");

// Extract all config names and their param counts from paramBroker.ts
const configParamCounts = new Map();
const configRegex = /export const (\w+_CONFIG):\s*EndpointParamConfig\s*=\s*\{[^}]*params:\s*\{/g;
let match;

// Parse each config by finding its params block
const configBlocks = brokerSrc.split(/export const (\w+_CONFIG):\s*EndpointParamConfig/);
for (let i = 1; i < configBlocks.length; i += 2) {
  const configName = configBlocks[i];
  const block = configBlocks[i + 1];
  
  // Find the params: { ... } block
  const paramsMatch = block.match(/params:\s*\{/);
  if (!paramsMatch) continue;
  
  const paramsStart = block.indexOf(paramsMatch[0]) + paramsMatch[0].length;
  let depth = 1;
  let pos = paramsStart;
  while (depth > 0 && pos < block.length) {
    if (block[pos] === '{') depth++;
    if (block[pos] === '}') depth--;
    pos++;
  }
  const paramsBlock = block.substring(paramsStart, pos - 1);
  
  // Count top-level param keys (4-space indented keys, including quoted dotted keys)
  const paramKeys = paramsBlock.match(/^\s{4}(?:"[^"]+"|\w+):/gm) || [];
  configParamCounts.set(configName, paramKeys.length);
}

// Extract registry entries with brokerConfig
const registryRegex = /procedure:\s*"(\w+)".*?brokerConfig:\s*"(\w+)".*?paramCount:\s*(\d+)/g;
let regMatch;
let mismatches = 0;

console.log("=== Broker Config Param Count Verification ===\n");
console.log("Config Name".padEnd(45) + "Registry".padEnd(10) + "Actual".padEnd(10) + "Status");
console.log("-".repeat(75));

while ((regMatch = registryRegex.exec(coverageSrc)) !== null) {
  const [, procedure, configName, registryCount] = regMatch;
  const actualCount = configParamCounts.get(configName);
  const regCount = parseInt(registryCount);
  
  const status = actualCount === undefined ? "NOT FOUND" :
                 actualCount === regCount ? "OK" : "MISMATCH";
  
  if (status !== "OK") mismatches++;
  
  const marker = status === "OK" ? "✓" : "✗";
  console.log(
    `${marker} ${configName}`.padEnd(45) +
    `${regCount}`.padEnd(10) +
    `${actualCount ?? "?"}`.padEnd(10) +
    status +
    (status === "MISMATCH" ? ` (${procedure}: registry=${regCount}, actual=${actualCount})` : "")
  );
}

console.log("\n" + "=".repeat(75));
console.log(`Total mismatches: ${mismatches}`);
if (mismatches > 0) {
  process.exit(1);
}
console.log("All param counts are correct.");
