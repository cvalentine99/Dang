#!/usr/bin/env node
/**
 * seed-kg.mjs — Knowledge Graph Seeder
 *
 * Parses the Wazuh OpenAPI v4.14.3 spec and populates all 12 kg_* tables.
 * Produces ~2,611 records deterministically from the spec file.
 * (182 endpoints, 1,186 parameters, 1,126 responses, 2 auth methods,
 *  21 resources, 16 use cases, 5 indices, 60 fields, 9 error patterns, 4 sync)
 *
 * Usage:
 *   DATABASE_URL=mysql://user:pass@host:port/db node seed-kg.mjs [--spec path/to/spec.yaml] [--drop]
 *
 * Options:
 *   --spec <path>   Path to the Wazuh OpenAPI YAML spec (default: ./spec-v4.14.3.yaml)
 *   --drop          TRUNCATE all kg_* tables before seeding (default: false)
 *   --dry-run       Print counts without writing to DB
 *
 * Requirements:
 *   npm install mysql2 js-yaml   (both are already in the project's package.json)
 */

import mysql from "mysql2/promise";
import yaml from "js-yaml";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const specIdx = args.indexOf("--spec");
const specPath = specIdx !== -1 ? resolve(args[specIdx + 1]) : resolve(__dirname, "spec-v4.14.3.yaml");
const DROP = args.includes("--drop");
const DRY_RUN = args.includes("--dry-run");

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL && !DRY_RUN) {
  console.error("ERROR: DATABASE_URL environment variable is required.");
  console.error("Example: DATABASE_URL=mysql://dang:password@localhost:3307/dang node seed-kg.mjs");
  process.exit(1);
}

// ── Parse OpenAPI Spec ──────────────────────────────────────────────────────

console.log(`[seed-kg] Loading spec from ${specPath}`);
const specRaw = readFileSync(specPath, "utf8");
const spec = yaml.load(specRaw);
const paths = spec.paths || {};

// ── Classify endpoints ──────────────────────────────────────────────────────

function classifyRisk(method, path, operationId) {
  const m = method.toUpperCase();
  if (m === "DELETE") return "DESTRUCTIVE";
  if (m === "PUT" || m === "POST") {
    // Some PUT/POST are read-like (authenticate, logtest)
    if (path.includes("/authenticate") || path.includes("/logtest")) return "SAFE";
    if (operationId?.includes("run_command")) return "DESTRUCTIVE";
    return "MUTATING";
  }
  return "SAFE";
}

function classifyOperationType(method) {
  const m = method.toUpperCase();
  if (m === "GET") return "READ";
  if (m === "POST") return "CREATE";
  if (m === "PUT") return "UPDATE";
  if (m === "DELETE") return "DELETE";
  return "READ";
}

function isLlmAllowed(riskLevel) {
  return riskLevel === "SAFE" ? 1 : 0;
}

function getResource(tags) {
  if (!tags || tags.length === 0) return "unknown";
  const tag = tags[0];
  // Map tags to resource names matching the original seed
  const tagMap = {
    "API Info": "root",
    "Active-response": "active-response",
    "Agents": "agents",
    "Ciscat": "ciscat",
    "Cluster": "cluster",
    "Decoders": "decoders",
    "Events": "events",
    "Experimental": "experimental",
    "Groups": "groups",
    "Lists": "lists",
    "Logtest": "logtest",
    "MITRE": "mitre",
    "Manager": "manager",
    "Overview": "overview",
    "Rootcheck": "rootcheck",
    "Rules": "rules",
    "SCA": "sca",
    "Security": "security",
    "Syscheck": "syscheck",
    "Syscollector": "syscollector",
    "Task": "tasks",
    "Vulnerability": "vulnerability",
  };
  return tagMap[tag] || tag.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

// ── Extract endpoints from spec ─────────────────────────────────────────────

const endpoints = [];
const allParams = [];
const allResponses = [];
const resourceCounts = {};

for (const [path, ops] of Object.entries(paths)) {
  for (const method of ["get", "post", "put", "delete", "patch"]) {
    if (!ops[method]) continue;
    const details = ops[method];
    if (typeof details !== "object") continue;

    const tags = details.tags || [];
    const resource = getResource(tags);
    const operationId = details.operationId || "";
    const riskLevel = classifyRisk(method, path, operationId);
    const operationType = classifyOperationType(method);
    const endpointId = `${method.toUpperCase()}:${path}`;

    const ep = {
      endpoint_id: endpointId,
      path,
      method: method.toUpperCase(),
      summary: details.summary || null,
      description: details.description || null,
      tags: JSON.stringify(tags),
      operation_id: operationId || null,
      resource,
      operation_type: operationType,
      risk_level: riskLevel,
      allowed_for_llm: isLlmAllowed(riskLevel),
      auth_method: "none",
      trust_score: "0.500",
      deprecated: details.deprecated ? 1 : 0,
    };
    endpoints.push(ep);

    // Count per resource
    resourceCounts[resource] = (resourceCounts[resource] || 0) + 1;

    // Parameters
    const params = details.parameters || [];
    for (const p of params) {
      if (!p || typeof p !== "object") continue;
      // Resolve $ref if needed
      const param = p.$ref ? resolveRef(spec, p.$ref) : p;
      if (!param) continue;

      allParams.push({
        endpoint_id: endpointId,
        name: param.name || "unknown",
        location: param.in || "query",
        required: param.required ? 1 : 0,
        param_type: param.schema?.type || "string",
        description: param.description || null,
      });
    }

    // RequestBody parameters (location=body)
    if (details.requestBody) {
      const rb = details.requestBody["$ref"]
        ? resolveRef(spec, details.requestBody["$ref"])
        : details.requestBody;
      if (rb && rb.content) {
        const jsonContent = rb.content["application/json"];
        if (jsonContent && jsonContent.schema) {
          const bodyParams = flattenBodySchema(spec, jsonContent.schema);
          for (const bp of bodyParams) {
            allParams.push({
              endpoint_id: endpointId,
              name: bp.name,
              location: "body",
              required: bp.required ? 1 : 0,
              param_type: bp.type,
              description: bp.description,
            });
          }
        }
      }
    }

    // Responses
    const responses = details.responses || {};
    for (const [statusCode, respDetail] of Object.entries(responses)) {
      const httpStatus = parseInt(statusCode, 10);
      if (isNaN(httpStatus)) continue; // skip 'default' etc
      const resp = respDetail.$ref ? resolveRef(spec, respDetail.$ref) : respDetail;
      allResponses.push({
        endpoint_id: endpointId,
        http_status: httpStatus,
        description: resp?.description || null,
      });
    }
  }
}

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

/**
 * Flatten a requestBody JSON schema into a flat list of body parameters.
 * Handles $ref resolution and nested object properties (dot-notation).
 */
function flattenBodySchema(spec, schema, prefix = "", parentRequired = []) {
  const results = [];
  if (!schema) return results;

  // Resolve $ref
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
      results.push(...flattenBodySchema(spec, prop, fullName, required));
    } else {
      results.push({
        name: fullName,
        type: prop.type || "string",
        required: required.includes(name),
        description: (prop.description || "").slice(0, 500),
      });
    }
  }

  return results;
}

// ── Static data: Auth Methods ───────────────────────────────────────────────

const authMethods = [
  { auth_id: "JWT", auth_type: "bearer_token", description: "JSON Web Token obtained via POST /security/user/authenticate", ttl_seconds: 900 },
  { auth_id: "BasicAuth", auth_type: "basic_http", description: "HTTP Basic Authentication for initial token acquisition", ttl_seconds: null },
];

// ── Static data: Use Cases (Layer 2) ────────────────────────────────────────

const useCases = [
  { intent: "LIST_AGENTS", semantic_type: "READ", domain: "endpoint_security", description: "List all registered Wazuh agents with status and metadata", endpoint_ids: ["GET:/agents"] },
  { intent: "GET_AGENT_DETAIL", semantic_type: "READ", domain: "endpoint_security", description: "Get detailed information about a specific agent", endpoint_ids: ["GET:/agents/{agent_id}/config/{component}/{configuration}","GET:/agents/{agent_id}/group/is_sync","GET:/agents/{agent_id}/key","GET:/agents/{agent_id}/daemons/stats","GET:/agents/{agent_id}/stats/{component}"] },
  { intent: "LIST_AGENT_GROUPS", semantic_type: "READ", domain: "endpoint_security", description: "List all agent groups", endpoint_ids: ["DELETE:/groups","GET:/groups","POST:/groups","GET:/groups/{group_id}/agents","GET:/groups/{group_id}/configuration","PUT:/groups/{group_id}/configuration","GET:/groups/{group_id}/files","GET:/groups/{group_id}/files/{file_name}","GET:/mitre/groups","GET:/rules/groups"] },
  { intent: "CHECK_AGENT_SCA", semantic_type: "READ", domain: "compliance", description: "Check SCA policy compliance for an agent", endpoint_ids: ["GET:/sca/{agent_id}","GET:/sca/{agent_id}/checks/{policy_id}"] },
  { intent: "CHECK_AGENT_SYSCHECK", semantic_type: "READ", domain: "file_integrity", description: "Check file integrity monitoring results for an agent", endpoint_ids: ["PUT:/syscheck","GET:/syscheck/{agent_id}","DELETE:/syscheck/{agent_id}","GET:/syscheck/{agent_id}/last_scan","DELETE:/experimental/syscheck"] },
  { intent: "GET_AGENT_SYSCOLLECTOR", semantic_type: "READ", domain: "asset_inventory", description: "Get system inventory (packages, ports, processes, hardware, OS)", endpoint_ids: ["GET:/experimental/syscollector/hardware","GET:/experimental/syscollector/netaddr","GET:/experimental/syscollector/netiface","GET:/experimental/syscollector/netproto","GET:/experimental/syscollector/os","GET:/experimental/syscollector/packages","GET:/experimental/syscollector/ports","GET:/experimental/syscollector/processes","GET:/experimental/syscollector/hotfixes","GET:/syscollector/{agent_id}/hardware","GET:/syscollector/{agent_id}/hotfixes","GET:/syscollector/{agent_id}/netaddr","GET:/syscollector/{agent_id}/netiface","GET:/syscollector/{agent_id}/netproto","GET:/syscollector/{agent_id}/os","GET:/syscollector/{agent_id}/packages","GET:/syscollector/{agent_id}/ports","GET:/syscollector/{agent_id}/processes"] },
  { intent: "LIST_RULES", semantic_type: "READ", domain: "detection", description: "List all detection rules", endpoint_ids: ["GET:/cluster/ruleset/synchronization","GET:/rules","GET:/rules/requirement/{requirement}","GET:/rules/files","GET:/rules/files/{filename}","PUT:/rules/files/{filename}","DELETE:/rules/files/{filename}"] },
  { intent: "LIST_DECODERS", semantic_type: "READ", domain: "detection", description: "List all log decoders", endpoint_ids: ["GET:/decoders","GET:/decoders/files","GET:/decoders/files/{filename}","PUT:/decoders/files/{filename}","DELETE:/decoders/files/{filename}","GET:/decoders/parents"] },
  { intent: "CHECK_CLUSTER_STATUS", semantic_type: "READ", domain: "cluster_management", description: "Check Wazuh cluster health and node status", endpoint_ids: ["GET:/cluster/local/info","GET:/cluster/local/config","GET:/cluster/nodes","GET:/cluster/healthcheck","GET:/cluster/status","GET:/cluster/api/config","GET:/cluster/{node_id}/status","GET:/cluster/{node_id}/info","GET:/cluster/{node_id}/configuration","PUT:/cluster/{node_id}/configuration","GET:/cluster/{node_id}/daemons/stats","GET:/cluster/{node_id}/stats","GET:/cluster/{node_id}/stats/hourly","GET:/cluster/{node_id}/stats/weekly","GET:/cluster/{node_id}/stats/analysisd","GET:/cluster/{node_id}/stats/remoted","GET:/cluster/{node_id}/logs","GET:/cluster/{node_id}/logs/summary","PUT:/cluster/restart","PUT:/cluster/analysisd/reload","GET:/cluster/configuration/validation","GET:/cluster/{node_id}/configuration/{component}/{configuration}"] },
  { intent: "GET_MANAGER_STATUS", semantic_type: "READ", domain: "manager", description: "Get Wazuh manager daemon status and statistics", endpoint_ids: ["GET:/manager/status","GET:/manager/info","GET:/manager/daemons/stats","GET:/manager/stats","GET:/manager/stats/hourly","GET:/manager/stats/weekly","GET:/manager/stats/analysisd","GET:/manager/stats/remoted"] },
  { intent: "GET_MANAGER_LOGS", semantic_type: "READ", domain: "manager", description: "Get Wazuh manager logs", endpoint_ids: ["GET:/manager/logs","GET:/manager/logs/summary"] },
  { intent: "CHECK_MITRE", semantic_type: "READ", domain: "threat_intelligence", description: "Query MITRE ATT&CK tactics, techniques, and groups", endpoint_ids: ["GET:/mitre/metadata","GET:/mitre/mitigations","GET:/mitre/references","GET:/mitre/software","GET:/mitre/tactics","GET:/mitre/techniques"] },
  { intent: "CHECK_ROOTCHECK", semantic_type: "READ", domain: "compliance", description: "Check rootcheck/policy monitoring results", endpoint_ids: ["PUT:/rootcheck","GET:/rootcheck/{agent_id}","DELETE:/rootcheck/{agent_id}","GET:/rootcheck/{agent_id}/last_scan","DELETE:/experimental/rootcheck"] },
  { intent: "GET_CDB_LISTS", semantic_type: "READ", domain: "detection", description: "Get CDB lists used in rules", endpoint_ids: ["GET:/lists","GET:/lists/files/{filename}","PUT:/lists/files/{filename}","DELETE:/lists/files/{filename}","GET:/lists/files"] },
  { intent: "AUTHENTICATE", semantic_type: "READ", domain: "security", description: "Authenticate and obtain JWT token", endpoint_ids: ["POST:/security/user/authenticate","GET:/security/user/authenticate","DELETE:/security/user/authenticate","POST:/security/user/authenticate/run_as"] },
  { intent: "MANAGE_SECURITY", semantic_type: "READ", domain: "security", description: "Manage security users, roles, policies", endpoint_ids: ["GET:/security/users/me","GET:/security/users/me/policies","PUT:/security/user/revoke","PUT:/security/users/{user_id}/run_as","GET:/security/actions","GET:/security/resources","GET:/security/users","POST:/security/users","DELETE:/security/users","PUT:/security/users/{user_id}","GET:/security/roles","POST:/security/roles","DELETE:/security/roles","PUT:/security/roles/{role_id}","GET:/security/rules","POST:/security/rules","DELETE:/security/rules","PUT:/security/rules/{rule_id}","GET:/security/policies","POST:/security/policies","DELETE:/security/policies","PUT:/security/policies/{policy_id}","POST:/security/users/{user_id}/roles","DELETE:/security/users/{user_id}/roles","POST:/security/roles/{role_id}/policies","DELETE:/security/roles/{role_id}/policies","POST:/security/roles/{role_id}/rules","DELETE:/security/roles/{role_id}/rules","GET:/security/config","PUT:/security/config","DELETE:/security/config"] },
];

// ── Static data: Index Patterns (Layer 3) ───────────────────────────────────

const indices = [
  { pattern: "wazuh-alerts-*", description: "Security alerts generated by Wazuh rules engine" },
  { pattern: "wazuh-states-vulnerabilities-*", description: "Current vulnerability state for all agents" },
  { pattern: "wazuh-monitoring-*", description: "Agent connection state monitoring over time" },
  { pattern: "wazuh-statistics-*", description: "Wazuh manager performance statistics" },
  { pattern: "wazuh-archives-*", description: "Raw archived events (all logs, not just alerts)" },
];

// ── Static data: Fields (Layer 3) ───────────────────────────────────────────

// index_id references are 1-based matching the indices array order above
const fields = [
  // wazuh-alerts-* (index 1) — 27 fields
  { index_id: 1, field_name: "timestamp", field_type: "date", description: "Event timestamp" },
  { index_id: 1, field_name: "rule.id", field_type: "keyword", description: "Rule ID that triggered the alert" },
  { index_id: 1, field_name: "rule.level", field_type: "integer", description: "Rule severity level (0-15)" },
  { index_id: 1, field_name: "rule.description", field_type: "text", description: "Rule description" },
  { index_id: 1, field_name: "rule.groups", field_type: "keyword", description: "Rule groups" },
  { index_id: 1, field_name: "rule.mitre.id", field_type: "keyword", description: "MITRE ATT&CK technique ID" },
  { index_id: 1, field_name: "rule.mitre.tactic", field_type: "keyword", description: "MITRE ATT&CK tactic" },
  { index_id: 1, field_name: "rule.mitre.technique", field_type: "keyword", description: "MITRE ATT&CK technique name" },
  { index_id: 1, field_name: "rule.pci_dss", field_type: "keyword", description: "PCI DSS compliance mapping" },
  { index_id: 1, field_name: "rule.hipaa", field_type: "keyword", description: "HIPAA compliance mapping" },
  { index_id: 1, field_name: "rule.nist_800_53", field_type: "keyword", description: "NIST 800-53 compliance mapping" },
  { index_id: 1, field_name: "rule.gdpr", field_type: "keyword", description: "GDPR compliance mapping" },
  { index_id: 1, field_name: "rule.tsc", field_type: "keyword", description: "TSC compliance mapping" },
  { index_id: 1, field_name: "agent.id", field_type: "keyword", description: "Agent ID" },
  { index_id: 1, field_name: "agent.name", field_type: "keyword", description: "Agent hostname" },
  { index_id: 1, field_name: "agent.ip", field_type: "ip", description: "Agent IP address" },
  { index_id: 1, field_name: "data.srcip", field_type: "ip", description: "Source IP from event data" },
  { index_id: 1, field_name: "data.dstip", field_type: "ip", description: "Destination IP from event data" },
  { index_id: 1, field_name: "data.srcport", field_type: "integer", description: "Source port" },
  { index_id: 1, field_name: "data.dstport", field_type: "integer", description: "Destination port" },
  { index_id: 1, field_name: "data.srcuser", field_type: "keyword", description: "Source username" },
  { index_id: 1, field_name: "data.dstuser", field_type: "keyword", description: "Destination username" },
  { index_id: 1, field_name: "decoder.name", field_type: "keyword", description: "Decoder that parsed the log" },
  { index_id: 1, field_name: "full_log", field_type: "text", description: "Original log message" },
  { index_id: 1, field_name: "location", field_type: "keyword", description: "Log source location" },
  { index_id: 1, field_name: "GeoLocation.country_name", field_type: "keyword", description: "GeoIP country" },
  { index_id: 1, field_name: "GeoLocation.city_name", field_type: "keyword", description: "GeoIP city" },
  // wazuh-states-vulnerabilities-* (index 2) — 14 fields
  { index_id: 2, field_name: "agent.id", field_type: "keyword", description: "Agent ID" },
  { index_id: 2, field_name: "agent.name", field_type: "keyword", description: "Agent hostname" },
  { index_id: 2, field_name: "vulnerability.id", field_type: "keyword", description: "CVE identifier" },
  { index_id: 2, field_name: "vulnerability.severity", field_type: "keyword", description: "Severity (Critical/High/Medium/Low)" },
  { index_id: 2, field_name: "vulnerability.score.base", field_type: "float", description: "CVSS base score" },
  { index_id: 2, field_name: "vulnerability.score.version", field_type: "keyword", description: "CVSS version" },
  { index_id: 2, field_name: "vulnerability.status", field_type: "keyword", description: "Vulnerability status" },
  { index_id: 2, field_name: "vulnerability.description", field_type: "text", description: "CVE description" },
  { index_id: 2, field_name: "vulnerability.reference", field_type: "keyword", description: "Reference URLs" },
  { index_id: 2, field_name: "vulnerability.detected_at", field_type: "date", description: "Detection timestamp" },
  { index_id: 2, field_name: "package.name", field_type: "keyword", description: "Affected package name" },
  { index_id: 2, field_name: "package.version", field_type: "keyword", description: "Affected package version" },
  { index_id: 2, field_name: "package.architecture", field_type: "keyword", description: "Package architecture" },
  { index_id: 2, field_name: "package.type", field_type: "keyword", description: "Package type (deb/rpm)" },
  // wazuh-monitoring-* (index 3) — 6 fields
  { index_id: 3, field_name: "timestamp", field_type: "date", description: "Monitoring timestamp" },
  { index_id: 3, field_name: "id", field_type: "keyword", description: "Agent ID" },
  { index_id: 3, field_name: "name", field_type: "keyword", description: "Agent name" },
  { index_id: 3, field_name: "status", field_type: "keyword", description: "Agent connection status" },
  { index_id: 3, field_name: "ip", field_type: "ip", description: "Agent IP address" },
  { index_id: 3, field_name: "host", field_type: "keyword", description: "Agent hostname" },
  // wazuh-statistics-* (index 4) — 6 fields
  { index_id: 4, field_name: "timestamp", field_type: "date", description: "Statistics timestamp" },
  { index_id: 4, field_name: "analysisd.events_processed", field_type: "long", description: "Events processed by analysisd" },
  { index_id: 4, field_name: "analysisd.events_received", field_type: "long", description: "Events received by analysisd" },
  { index_id: 4, field_name: "analysisd.events_dropped", field_type: "long", description: "Events dropped by analysisd" },
  { index_id: 4, field_name: "remoted.recv_bytes", field_type: "long", description: "Bytes received by remoted" },
  { index_id: 4, field_name: "remoted.tcp_sessions", field_type: "integer", description: "Active TCP sessions" },
  // wazuh-archives-* (index 5) — 7 fields
  { index_id: 5, field_name: "timestamp", field_type: "date", description: "Event timestamp" },
  { index_id: 5, field_name: "agent.id", field_type: "keyword", description: "Agent ID" },
  { index_id: 5, field_name: "agent.name", field_type: "keyword", description: "Agent name" },
  { index_id: 5, field_name: "rule.id", field_type: "keyword", description: "Rule ID" },
  { index_id: 5, field_name: "rule.level", field_type: "integer", description: "Rule level" },
  { index_id: 5, field_name: "full_log", field_type: "text", description: "Full log message" },
  { index_id: 5, field_name: "decoder.name", field_type: "keyword", description: "Decoder name" },
];

// ── Static data: Error Patterns (Layer 4) ───────────────────────────────────

const errorPatterns = [
  { http_status: 400, description: "", cause: "Malformed request parameters or body", mitigation: "Validate request parameters against the API schema" },
  { http_status: 401, description: "", cause: "Missing or expired JWT token", mitigation: "Re-authenticate via POST /security/user/authenticate" },
  { http_status: 403, description: "", cause: "Insufficient RBAC permissions for this resource", mitigation: "Check RBAC policies; ensure role has required permissions" },
  { http_status: 404, description: "", cause: "Resource not found (agent, rule, group, etc.)", mitigation: "Verify resource ID exists; check agent/group/rule status" },
  { http_status: 405, description: "", cause: "HTTP method not allowed for this endpoint", mitigation: "Use the correct HTTP method for this endpoint" },
  { http_status: 406, description: "", cause: "Requested content type not supported", mitigation: "Set Accept header to application/json" },
  { http_status: 413, description: "", cause: "Request body exceeds maximum allowed size", mitigation: "Reduce request body size or use pagination" },
  { http_status: 415, description: "", cause: "HTTP 415 error", mitigation: "Consult Wazuh API documentation for this error code" },
  { http_status: 429, description: "", cause: "Rate limit exceeded", mitigation: "Implement exponential backoff; reduce request frequency" },
];

// ── Print summary ───────────────────────────────────────────────────────────

console.log(`[seed-kg] Parsed spec: ${spec.info?.title} v${spec.info?.version}`);
console.log(`[seed-kg] Endpoints:      ${endpoints.length}`);
console.log(`[seed-kg] Parameters:     ${allParams.length}`);
console.log(`[seed-kg] Responses:      ${allResponses.length}`);
console.log(`[seed-kg] Auth methods:   ${authMethods.length}`);
console.log(`[seed-kg] Resources:      ${Object.keys(resourceCounts).length}`);
console.log(`[seed-kg] Use cases:      ${useCases.length}`);
console.log(`[seed-kg] Indices:        ${indices.length}`);
console.log(`[seed-kg] Fields:         ${fields.length}`);
console.log(`[seed-kg] Error patterns: ${errorPatterns.length}`);
console.log(`[seed-kg] Sync status:    4`);
const total = endpoints.length + allParams.length + allResponses.length + authMethods.length +
  Object.keys(resourceCounts).length + useCases.length + indices.length + fields.length +
  errorPatterns.length + 4;
console.log(`[seed-kg] TOTAL:          ${total}`);

if (DRY_RUN) {
  console.log("[seed-kg] Dry run complete. No database changes made.");
  process.exit(0);
}

// ── Database operations ─────────────────────────────────────────────────────

const conn = await mysql.createConnection(DB_URL);
console.log("[seed-kg] Connected to database");

try {
  // Optionally truncate
  if (DROP) {
    console.log("[seed-kg] Truncating all kg_* tables...");
    // Disable FK checks temporarily
    await conn.execute("SET FOREIGN_KEY_CHECKS = 0");
    const kgTables = [
      "kg_answer_provenance", "kg_trust_history", "kg_sync_status",
      "kg_error_patterns", "kg_fields", "kg_indices",
      "kg_use_cases", "kg_resources", "kg_responses",
      "kg_parameters", "kg_auth_methods", "kg_endpoints",
    ];
    for (const t of kgTables) {
      await conn.execute(`TRUNCATE TABLE ${t}`);
    }
    await conn.execute("SET FOREIGN_KEY_CHECKS = 1");
    console.log("[seed-kg] All kg_* tables truncated");
  } else {
    // Check if tables already have data
    const [rows] = await conn.execute("SELECT COUNT(*) as c FROM kg_endpoints");
    if (rows[0].c > 0) {
      console.log(`[seed-kg] WARNING: kg_endpoints already has ${rows[0].c} rows.`);
      console.log("[seed-kg] Use --drop to truncate before seeding, or manually clear tables.");
      console.log("[seed-kg] Aborting to prevent duplicate data.");
      await conn.end();
      process.exit(1);
    }
  }

  // ── Insert endpoints ────────────────────────────────────────────────────

  console.log("[seed-kg] Inserting endpoints...");
  const epInsert = `INSERT INTO kg_endpoints 
    (endpoint_id, path, method, summary, description, tags, operation_id, resource, operation_type, risk_level, allowed_for_llm, auth_method, trust_score, deprecated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  // Build endpoint_id -> auto_increment id map
  const endpointIdMap = {};
  for (const ep of endpoints) {
    const [result] = await conn.execute(epInsert, [
      ep.endpoint_id, ep.path, ep.method, ep.summary, ep.description,
      ep.tags, ep.operation_id, ep.resource, ep.operation_type, ep.risk_level,
      ep.allowed_for_llm, ep.auth_method, ep.trust_score, ep.deprecated,
    ]);
    endpointIdMap[ep.endpoint_id] = result.insertId;
  }
  console.log(`[seed-kg]   → ${endpoints.length} endpoints inserted`);

  // ── Insert parameters ───────────────────────────────────────────────────

  console.log("[seed-kg] Inserting parameters...");
  const paramInsert = `INSERT INTO kg_parameters 
    (endpoint_id, name, location, required, param_type, description)
    VALUES (?, ?, ?, ?, ?, ?)`;

  let paramCount = 0;
  for (const p of allParams) {
    const epDbId = endpointIdMap[p.endpoint_id];
    if (!epDbId) continue; // skip orphaned params
    await conn.execute(paramInsert, [
      epDbId, p.name, p.location, p.required, p.param_type, p.description,
    ]);
    paramCount++;
  }
  console.log(`[seed-kg]   → ${paramCount} parameters inserted`);

  // ── Insert responses ────────────────────────────────────────────────────

  console.log("[seed-kg] Inserting responses...");
  const respInsert = `INSERT INTO kg_responses 
    (endpoint_id, http_status, description)
    VALUES (?, ?, ?)`;

  let respCount = 0;
  for (const r of allResponses) {
    const epDbId = endpointIdMap[r.endpoint_id];
    if (!epDbId) continue;
    await conn.execute(respInsert, [epDbId, r.http_status, r.description]);
    respCount++;
  }
  console.log(`[seed-kg]   → ${respCount} responses inserted`);

  // ── Insert auth methods ─────────────────────────────────────────────────

  console.log("[seed-kg] Inserting auth methods...");
  for (const a of authMethods) {
    await conn.execute(
      `INSERT INTO kg_auth_methods (auth_id, auth_type, description, ttl_seconds) VALUES (?, ?, ?, ?)`,
      [a.auth_id, a.auth_type, a.description, a.ttl_seconds],
    );
  }
  console.log(`[seed-kg]   → ${authMethods.length} auth methods inserted`);

  // ── Insert resources ────────────────────────────────────────────────────

  console.log("[seed-kg] Inserting resources...");
  for (const [name, count] of Object.entries(resourceCounts)) {
    await conn.execute(
      `INSERT INTO kg_resources (name, endpoint_count) VALUES (?, ?)`,
      [name, count],
    );
  }
  console.log(`[seed-kg]   → ${Object.keys(resourceCounts).length} resources inserted`);

  // ── Insert use cases ────────────────────────────────────────────────────

  console.log("[seed-kg] Inserting use cases...");
  for (const uc of useCases) {
    await conn.execute(
      `INSERT INTO kg_use_cases (intent, semantic_type, domain, description, endpoint_ids) VALUES (?, ?, ?, ?, ?)`,
      [uc.intent, uc.semantic_type, uc.domain, uc.description, JSON.stringify(uc.endpoint_ids)],
    );
  }
  console.log(`[seed-kg]   → ${useCases.length} use cases inserted`);

  // ── Insert indices ──────────────────────────────────────────────────────

  console.log("[seed-kg] Inserting indices...");
  const indexIdMap = {};
  for (let i = 0; i < indices.length; i++) {
    const [result] = await conn.execute(
      `INSERT INTO kg_indices (pattern, description) VALUES (?, ?)`,
      [indices[i].pattern, indices[i].description],
    );
    indexIdMap[i + 1] = result.insertId; // map 1-based to actual DB id
  }
  console.log(`[seed-kg]   → ${indices.length} indices inserted`);

  // ── Insert fields ───────────────────────────────────────────────────────

  console.log("[seed-kg] Inserting fields...");
  for (const f of fields) {
    const dbIndexId = indexIdMap[f.index_id];
    await conn.execute(
      `INSERT INTO kg_fields (index_id, field_name, field_type, description) VALUES (?, ?, ?, ?)`,
      [dbIndexId, f.field_name, f.field_type, f.description],
    );
  }
  console.log(`[seed-kg]   → ${fields.length} fields inserted`);

  // ── Insert error patterns ───────────────────────────────────────────────

  console.log("[seed-kg] Inserting error patterns...");
  for (const ep of errorPatterns) {
    await conn.execute(
      `INSERT INTO kg_error_patterns (http_status, description, cause, mitigation) VALUES (?, ?, ?, ?)`,
      [ep.http_status, ep.description, ep.cause, ep.mitigation],
    );
  }
  console.log(`[seed-kg]   → ${errorPatterns.length} error patterns inserted`);

  // ── Insert sync status ──────────────────────────────────────────────────

  console.log("[seed-kg] Inserting sync status...");
  const syncLayers = [
    { layer: "api_ontology", entity_count: endpoints.length },
    { layer: "operational_semantics", entity_count: useCases.length },
    { layer: "schema_lineage", entity_count: fields.length },
    { layer: "error_graph", entity_count: errorPatterns.length },
  ];
  for (const s of syncLayers) {
    await conn.execute(
      `INSERT INTO kg_sync_status (layer, entity_count, last_sync_at, status, spec_version) VALUES (?, ?, UTC_TIMESTAMP(), 'completed', ?)`,
      [s.layer, s.entity_count, spec.info?.version || "4.14.3"],
    );
  }
  console.log(`[seed-kg]   → 4 sync status rows inserted`);

  // ── Verify ──────────────────────────────────────────────────────────────

  console.log("\n[seed-kg] ═══ Verification ═══");
  const verifyTables = [
    "kg_endpoints", "kg_parameters", "kg_responses", "kg_auth_methods",
    "kg_resources", "kg_use_cases", "kg_indices", "kg_fields",
    "kg_error_patterns", "kg_sync_status",
  ];
  let grandTotal = 0;
  for (const t of verifyTables) {
    const [rows] = await conn.execute(`SELECT COUNT(*) as c FROM ${t}`);
    const c = rows[0].c;
    grandTotal += c;
    console.log(`[seed-kg]   ${t}: ${c}`);
  }
  console.log(`[seed-kg]   ─────────────────`);
  console.log(`[seed-kg]   TOTAL: ${grandTotal}`);
  console.log(`\n[seed-kg] ✓ Knowledge Graph seeded successfully!`);

} catch (err) {
  console.error(`[seed-kg] ERROR: ${err.message}`);
  if (err.code === "ER_DUP_ENTRY") {
    console.error("[seed-kg] Duplicate entry detected. Use --drop to truncate tables first.");
  }
  process.exit(1);
} finally {
  await conn.end();
}
