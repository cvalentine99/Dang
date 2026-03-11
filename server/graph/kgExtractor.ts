/**
 * kgExtractor.ts — Pure extraction logic from the Wazuh OpenAPI spec.
 *
 * This module has ZERO database or I/O dependencies. It takes a parsed
 * YAML object (the OpenAPI spec) and returns a fully typed KgExtractionResult.
 * Both seed-kg.mjs (CLI) and etlService.ts (runtime) call extract().
 *
 * Deterministic: same spec → same output, always.
 */

import type {
  KgExtractionResult,
  KgEndpoint,
  KgParameter,
  KgResponse,
  KgAuthMethod,
  KgUseCase,
  KgIndex,
  KgField,
  KgErrorPattern,
  KgResource,
} from "./kgTypes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OpenAPI specs are untyped JSON
type OpenApiNode = Record<string, any>;

// ── $ref resolution ─────────────────────────────────────────────────────────

function resolveRef(spec: OpenApiNode, ref: string): OpenApiNode | null {
  if (!ref || !ref.startsWith("#/")) return null;
  const parts = ref.replace("#/", "").split("/");
  let obj = spec;
  for (const p of parts) {
    obj = obj?.[p];
    if (!obj) return null;
  }
  return obj;
}

// ── Body schema flattening ──────────────────────────────────────────────────

function flattenBodySchema(
  spec: OpenApiNode,
  schema: OpenApiNode,
  prefix = "",
  parentRequired: string[] = [],
): Array<{ name: string; type: string; required: boolean; description: string }> {
  const results: Array<{ name: string; type: string; required: boolean; description: string }> = [];
  if (!schema) return results;

  const resolved = schema["$ref"] ? resolveRef(spec, schema["$ref"]) : schema;
  if (!resolved) return results;

  const props = resolved.properties || {};
  const required = resolved.required || [];

  for (const [name, propSchema] of Object.entries(props)) {
    const fullName = prefix ? `${prefix}.${name}` : name;
    const propObj = propSchema as OpenApiNode;
    const prop = propObj["$ref"]
      ? resolveRef(spec, propObj["$ref"])
      : propObj;
    if (!prop) continue;

    if (prop.type === "object" && prop.properties) {
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

// ── Classification helpers ──────────────────────────────────────────────────

function classifyRisk(method: string, path: string, operationId: string): string {
  const m = method.toUpperCase();
  if (m === "DELETE") return "DESTRUCTIVE";
  if (m === "PUT" || m === "POST") {
    if (path.includes("/authenticate") || path.includes("/logtest")) return "SAFE";
    if (operationId?.includes("run_command")) return "DESTRUCTIVE";
    return "MUTATING";
  }
  return "SAFE";
}

function classifyOperationType(method: string): string {
  const m = method.toUpperCase();
  if (m === "GET") return "READ";
  if (m === "POST") return "CREATE";
  if (m === "PUT") return "UPDATE";
  if (m === "DELETE") return "DELETE";
  return "READ";
}

function isLlmAllowed(riskLevel: string): number {
  return riskLevel === "SAFE" ? 1 : 0;
}

const TAG_MAP: Record<string, string> = {
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

function getResource(tags: string[]): string {
  if (!tags || tags.length === 0) return "unknown";
  const tag = tags[0];
  return TAG_MAP[tag] || tag.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

// ── Static data ─────────────────────────────────────────────────────────────

const AUTH_METHODS: KgAuthMethod[] = [
  { auth_id: "JWT", auth_type: "bearer_token", description: "JSON Web Token obtained via POST /security/user/authenticate", ttl_seconds: 900 },
  { auth_id: "BasicAuth", auth_type: "basic_http", description: "HTTP Basic Authentication for initial token acquisition", ttl_seconds: null },
];

const USE_CASES: KgUseCase[] = [
  { intent: "LIST_AGENTS", semantic_type: "READ", domain: "endpoint_security", description: "List all registered Wazuh agents with status and metadata", endpoint_ids: ["GET:/agents"] },
  { intent: "GET_AGENT_DETAIL", semantic_type: "READ", domain: "endpoint_security", description: "Get detailed information about a specific agent", endpoint_ids: ["GET:/agents/{agent_id}/config/{component}/{configuration}","GET:/agents/{agent_id}/group/is_sync","GET:/agents/{agent_id}/key","GET:/agents/{agent_id}/daemons/stats","GET:/agents/{agent_id}/stats/{component}"] },
  { intent: "LIST_AGENT_GROUPS", semantic_type: "READ", domain: "endpoint_security", description: "List all agent groups", endpoint_ids: ["DELETE:/groups","GET:/groups","POST:/groups","GET:/groups/{group_id}/agents","GET:/groups/{group_id}/configuration","PUT:/groups/{group_id}/configuration","GET:/groups/{group_id}/files","GET:/groups/{group_id}/files/{file_name}","GET:/mitre/groups","GET:/rules/groups"] },
  { intent: "CHECK_AGENT_SCA", semantic_type: "READ", domain: "compliance", description: "Check SCA policy compliance for an agent", endpoint_ids: ["GET:/sca/{agent_id}","GET:/sca/{agent_id}/checks/{policy_id}"] },
  { intent: "CHECK_AGENT_SYSCHECK", semantic_type: "READ", domain: "file_integrity", description: "Check file integrity monitoring results for an agent", endpoint_ids: ["PUT:/syscheck","GET:/syscheck/{agent_id}","DELETE:/syscheck/{agent_id}","GET:/syscheck/{agent_id}/last_scan","DELETE:/experimental/syscheck"] },
  { intent: "GET_AGENT_SYSCOLLECTOR", semantic_type: "READ", domain: "asset_inventory", description: "Get system inventory (packages, ports, processes, hardware, OS)", endpoint_ids: ["GET:/experimental/syscollector/hardware","GET:/experimental/syscollector/netaddr","GET:/experimental/syscollector/netiface","GET:/experimental/syscollector/netproto","GET:/experimental/syscollector/os","GET:/experimental/syscollector/packages","GET:/experimental/syscollector/ports","GET:/experimental/syscollector/processes","GET:/experimental/syscollector/hotfixes","GET:/syscollector/{agent_id}/hardware","GET:/syscollector/{agent_id}/hotfixes","GET:/syscollector/{agent_id}/netaddr","GET:/syscollector/{agent_id}/netiface","GET:/syscollector/{agent_id}/netproto","GET:/syscollector/{agent_id}/os","GET:/syscollector/{agent_id}/packages","GET:/syscollector/{agent_id}/ports","GET:/syscollector/{agent_id}/processes"] },
  { intent: "LIST_RULES", semantic_type: "READ", domain: "detection", description: "List all detection rules", endpoint_ids: ["GET:/cluster/ruleset/synchronization","GET:/rules","GET:/rules/requirement/{requirement}","GET:/rules/files","GET:/rules/files/{filename}","PUT:/rules/files/{filename}","DELETE:/rules/files/{filename}"] },
  { intent: "LIST_DECODERS", semantic_type: "READ", domain: "detection", description: "List all log decoders", endpoint_ids: ["GET:/decoders","GET:/decoders/parents","GET:/decoders/files","GET:/decoders/files/{filename}","PUT:/decoders/files/{filename}","DELETE:/decoders/files/{filename}"] },
  { intent: "CHECK_VULNERABILITIES", semantic_type: "READ", domain: "vulnerability_management", description: "Check vulnerability assessment results for agents", endpoint_ids: ["GET:/vulnerability/{agent_id}","GET:/vulnerability/{agent_id}/last_scan","GET:/vulnerability/{agent_id}/field/summary"] },
  { intent: "MITRE_LOOKUP", semantic_type: "READ", domain: "threat_intelligence", description: "Look up MITRE ATT&CK techniques, tactics, groups, software", endpoint_ids: ["GET:/mitre/metadata","GET:/mitre/techniques","GET:/mitre/tactics","GET:/mitre/groups","GET:/mitre/mitigations","GET:/mitre/software","GET:/mitre/references"] },
  { intent: "CLUSTER_STATUS", semantic_type: "READ", domain: "infrastructure", description: "Check Wazuh cluster health and node status", endpoint_ids: ["GET:/cluster/healthcheck","GET:/cluster/local/info","GET:/cluster/nodes","GET:/cluster/status","GET:/cluster/api/config","GET:/cluster/configuration/validation"] },
  { intent: "MANAGE_SECURITY", semantic_type: "ADMIN", domain: "access_control", description: "Manage RBAC users, roles, policies, and rules", endpoint_ids: ["GET:/security/users","GET:/security/roles","GET:/security/policies","GET:/security/rules","GET:/security/config","GET:/security/resources","POST:/security/user/authenticate","POST:/security/user/authenticate/run_as"] },
  { intent: "RUN_LOGTEST", semantic_type: "READ", domain: "detection", description: "Test log decoding and rule matching without affecting production", endpoint_ids: ["PUT:/logtest","DELETE:/logtest/sessions/{token}"] },
  { intent: "CHECK_ROOTCHECK", semantic_type: "READ", domain: "compliance", description: "Check rootcheck scan results for an agent", endpoint_ids: ["GET:/rootcheck/{agent_id}","GET:/rootcheck/{agent_id}/last_scan","DELETE:/rootcheck/{agent_id}"] },
  { intent: "CHECK_CISCAT", semantic_type: "READ", domain: "compliance", description: "Check CIS-CAT benchmark results for an agent", endpoint_ids: ["GET:/ciscat/{agent_id}/results","GET:/experimental/ciscat/results"] },
  { intent: "LIST_CDB_LISTS", semantic_type: "READ", domain: "detection", description: "List CDB lists used for rule enrichment", endpoint_ids: ["GET:/lists","GET:/lists/files","GET:/lists/files/{filename}","PUT:/lists/files/{filename}","DELETE:/lists/files/{filename}"] },
  { intent: "MANAGER_STATUS", semantic_type: "READ", domain: "infrastructure", description: "Check Wazuh manager status and configuration", endpoint_ids: ["GET:/manager/status","GET:/manager/info","GET:/manager/configuration","GET:/manager/stats","GET:/manager/stats/hourly","GET:/manager/stats/weekly","GET:/manager/stats/analysisd","GET:/manager/stats/remoted","GET:/manager/logs","GET:/manager/logs/summary","GET:/manager/api/config","GET:/manager/configuration/validation","GET:/manager/daemons/stats"] },
  { intent: "TASK_STATUS", semantic_type: "READ", domain: "infrastructure", description: "Check status of async tasks (upgrades, etc.)", endpoint_ids: ["GET:/tasks/status"] },
];

const INDICES: KgIndex[] = [
  { pattern: "wazuh-alerts-*", description: "Security alerts generated by Wazuh rules engine" },
  { pattern: "wazuh-states-vulnerabilities-*", description: "Vulnerability assessment results per agent" },
  { pattern: "wazuh-monitoring-*", description: "Agent connection status monitoring data" },
  { pattern: "wazuh-statistics-*", description: "Wazuh manager performance statistics" },
  { pattern: "wazuh-archives-*", description: "Raw archived events (all logs, not just alerts)" },
];

const FIELDS: KgField[] = [
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

const ERROR_PATTERNS: KgErrorPattern[] = [
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

// ── Main extraction function ────────────────────────────────────────────────

/**
 * Extract all KG entities from a parsed OpenAPI spec object.
 * This is a pure function — no I/O, no side effects.
 *
 * @param spec - The parsed YAML OpenAPI spec object
 * @returns A fully typed KgExtractionResult
 */
export function extract(spec: OpenApiNode): KgExtractionResult {
  const paths = spec.paths || {};
  const endpoints: KgEndpoint[] = [];
  const allParams: KgParameter[] = [];
  const allResponses: KgResponse[] = [];
  const resourceCounts: Record<string, number> = {};

  for (const [path, ops] of Object.entries(paths)) {
    for (const method of ["get", "post", "put", "delete", "patch"]) {
      const opsObj = ops as OpenApiNode;
      if (!opsObj[method]) continue;
      const details = opsObj[method] as OpenApiNode;
      if (typeof details !== "object") continue;

      const tags: string[] = details.tags || [];
      const resource = getResource(tags);
      const operationId: string = details.operationId || "";
      const riskLevel = classifyRisk(method, path, operationId);
      const operationType = classifyOperationType(method);
      const endpointId = `${method.toUpperCase()}:${path}`;

      endpoints.push({
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
      });

      resourceCounts[resource] = (resourceCounts[resource] || 0) + 1;

      // Parameters
      const params = details.parameters || [];
      for (const p of params) {
        if (!p || typeof p !== "object") continue;
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
        if (isNaN(httpStatus)) continue;
        const respObj = respDetail as OpenApiNode;
        const resp = respObj.$ref
          ? resolveRef(spec, respObj.$ref as string)
          : respObj;
        allResponses.push({
          endpoint_id: endpointId,
          http_status: httpStatus,
          description: resp?.description || "",
        });
      }
    }
  }

  // Build resources array from counts
  const resources: KgResource[] = Object.entries(resourceCounts).map(([name, count]) => ({
    name,
    endpoint_count: count,
  }));

  return {
    specTitle: spec.info?.title || "Wazuh API",
    specVersion: spec.info?.version || "unknown",
    endpoints,
    parameters: allParams,
    responses: allResponses,
    authMethods: AUTH_METHODS,
    resources,
    useCases: USE_CASES,
    indices: INDICES,
    fields: FIELDS,
    errorPatterns: ERROR_PATTERNS,
  };
}
