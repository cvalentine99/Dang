#!/usr/bin/env node
/**
 * Analyze requestBody schemas in the Wazuh OpenAPI spec.
 * Lists all endpoints with requestBody and their body properties.
 */

import yaml from "js-yaml";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Dev script under plain node (no tsx), so it cannot import shared/specPath.ts.
// Honors the same WAZUH_SPEC_PATH override; otherwise picks the newest spec-v*.yaml at the root.
import { readdirSync } from "fs";
function newestRootSpec() {
  const root = resolve(__dirname, "..");
  const files = readdirSync(root).filter(f => /^spec-v\d+\.\d+\.\d+\.yaml$/.test(f));
  files.sort((a, b) => {
    const va = a.match(/\d+/g).map(Number), vb = b.match(/\d+/g).map(Number);
    for (let i = 0; i < 3; i++) if (va[i] !== vb[i]) return vb[i] - va[i];
    return 0;
  });
  if (!files.length) throw new Error("No spec-v*.yaml at project root");
  return resolve(root, files[0]);
}
const specPath = process.env.WAZUH_SPEC_PATH ? resolve(process.env.WAZUH_SPEC_PATH) : newestRootSpec();
const spec = yaml.load(readFileSync(specPath, "utf8"));
const paths = spec.paths || {};

function resolveRef(spec, ref) {
  if (!ref || !ref.startsWith("#/")) return null;
  const parts = ref.replace("#/", "").split("/");
  let obj = spec;
  for (const p of parts) {
    obj = obj?.[p];
    if (!obj) return null;
  }
  return obj;
}

function flattenSchema(spec, schema, prefix = "") {
  const results = [];
  if (!schema) return results;

  // Resolve ref
  const resolved = schema["$ref"] ? resolveRef(spec, schema["$ref"]) : schema;
  if (!resolved) return results;

  const props = resolved.properties || {};
  const required = resolved.required || [];

  for (const [name, propSchema] of Object.entries(props)) {
    const fullName = prefix ? `${prefix}.${name}` : name;
    const prop = propSchema["$ref"] ? resolveRef(spec, propSchema["$ref"]) : propSchema;
    if (!prop) continue;

    if (prop.type === "object" && prop.properties) {
      // Recurse into nested objects
      results.push(...flattenSchema(spec, prop, fullName));
    } else {
      results.push({
        name: fullName,
        type: prop.type || "string",
        required: required.includes(name),
        description: (prop.description || "").slice(0, 100),
      });
    }
  }

  return results;
}

let totalBodyParams = 0;
const endpointBodies = [];

for (const [path, ops] of Object.entries(paths)) {
  for (const method of ["get", "post", "put", "delete", "patch"]) {
    if (!ops[method]) continue;
    const details = ops[method];
    if (!details.requestBody) continue;

    const rb = details.requestBody["$ref"]
      ? resolveRef(spec, details.requestBody["$ref"])
      : details.requestBody;
    if (!rb || !rb.content) continue;

    const jsonContent = rb.content["application/json"];
    if (!jsonContent || !jsonContent.schema) {
      const contentTypes = Object.keys(rb.content).join(", ");
      console.log(`${method.toUpperCase()} ${path} → no JSON schema (content types: ${contentTypes})`);
      continue;
    }

    const bodyParams = flattenSchema(spec, jsonContent.schema);
    if (bodyParams.length > 0) {
      endpointBodies.push({
        method: method.toUpperCase(),
        path,
        params: bodyParams,
      });
      totalBodyParams += bodyParams.length;
      console.log(`${method.toUpperCase()} ${path} → ${bodyParams.length} body params:`);
      for (const p of bodyParams) {
        console.log(`  ${p.required ? "*" : " "} ${p.name} [${p.type}] ${p.description}`);
      }
    }
  }
}

console.log(`\n═══ Summary ═══`);
console.log(`Endpoints with requestBody JSON schemas: ${endpointBodies.length}`);
console.log(`Total body parameters to extract: ${totalBodyParams}`);
