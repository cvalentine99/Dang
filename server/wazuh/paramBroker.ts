/**
 * Wazuh Parameter Broker — truth-preserving parameter forwarding layer.
 *
 * Responsibilities:
 *   1. Define accepted parameters per Wazuh endpoint (from OpenAPI spec v4.14.3)
 *   2. Map public/internal names to outbound Wazuh query parameter names
 *   3. Coerce/serialize values to the types Wazuh expects
 *   4. Detect and reject unsupported parameters explicitly
 *   5. Assemble the outbound query object with only recognized params
 *
 * Non-negotiable rule: No accepted parameter may disappear silently.
 * Unsupported parameters are returned in the result so the caller can
 * decide whether to reject or warn.
 *
 * Spec baseline: Wazuh REST API OpenAPI v4.14.3-rc3
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** How a parameter value should be serialized for the outbound Wazuh query */
export type ParamType = "string" | "number" | "boolean" | "csv";

export interface ParamDef {
  /** The outbound Wazuh query parameter name (as defined in the spec) */
  wazuhName: string;
  /** Human-readable description (from spec) */
  description: string;
  /** Value type for coercion */
  type: ParamType;
  /** Alternative public names that map to this parameter */
  aliases?: string[];
  /** Known valid values from the Wazuh OpenAPI spec (for dropdown rendering in Playground) */
  enumValues?: string[];
  /**
   * Optional coercion/serializer. Receives the raw input value and returns
   * a CoerceResult with the serialized string (or null to omit) and any error.
   */
  serialize?: (value: unknown) => CoerceResult;
}

export interface EndpointParamConfig {
  /** Wazuh API path pattern, e.g. "/agents" or "/sca/{agent_id}" */
  endpoint: string;
  /** Map of internal/public parameter name → definition */
  params: Record<string, ParamDef>;
}

export interface BrokerResult {
  /** The clean query object to forward to Wazuh */
  forwardedQuery: Record<string, string | number | boolean>;
  /** Parameters that were recognized and included */
  recognizedParams: string[];
  /** Parameters that were provided but are not in the endpoint config */
  unsupportedParams: string[];
  /** Validation/coercion errors */
  errors: string[];
}

// ── Coercer result type ──────────────────────────────────────────────────────

interface CoerceResult {
  /** The serialized value, or null if the value should be omitted */
  value: string | null;
  /** Error message if the value was provided but could not be coerced */
  error: string | null;
}

// ── Coercers ─────────────────────────────────────────────────────────────────
// Each coercer returns a CoerceResult so the broker can distinguish between
// "param not provided" (skip silently) and "param provided but invalid" (record error).

function coerceString(value: unknown): CoerceResult {
  if (value === undefined || value === null || value === "") return { value: null, error: null };
  return { value: String(value), error: null };
}

function coerceNumber(value: unknown): CoerceResult {
  if (value === undefined || value === null) return { value: null, error: null };
  const n = Number(value);
  if (Number.isNaN(n)) {
    return { value: null, error: `could not coerce ${JSON.stringify(value)} to number` };
  }
  return { value: String(n), error: null };
}

/**
 * Boolean coercion with strict semantics:
 * - true / 1 → "true"
 * - false / 0 → null (flag semantics: false = absent, not forwarded)
 * - Anything else (truthy strings like "no", "yes", "false") → error
 *
 * The Wazuh spec treats boolean params (e.g. `distinct`, `raw`) as flags
 * where only presence with value "true" is meaningful. Sending "false" is
 * either ignored or undefined behavior per spec.
 */
function coerceBoolean(value: unknown): CoerceResult {
  if (value === undefined || value === null) return { value: null, error: null };
  if (value === true || value === 1) return { value: "true", error: null };
  if (value === false || value === 0) return { value: null, error: null }; // false = absent (flag semantics)
  // Anything else is ambiguous — reject it
  return { value: null, error: `could not coerce ${JSON.stringify(value)} to boolean (expected true/false)` };
}

function coerceCsv(value: unknown): CoerceResult {
  if (value === undefined || value === null) return { value: null, error: null };
  if (Array.isArray(value)) {
    const joined = value.join(",");
    return joined ? { value: joined, error: null } : { value: null, error: null };
  }
  return { value: String(value), error: null };
}

const DEFAULT_COERCERS: Record<ParamType, (v: unknown) => CoerceResult> = {
  string: coerceString,
  number: coerceNumber,
  boolean: coerceBoolean,
  csv: coerceCsv,
};

// ── Broker core ──────────────────────────────────────────────────────────────

/**
 * Build the alias→canonical lookup from an endpoint config.
 * Returns a map where every alias and every canonical name points to
 * the canonical internal name.
 */
function buildAliasMap(config: EndpointParamConfig): Map<string, string> {
  const map = new Map<string, string>();
  for (const [canonical, def] of Object.entries(config.params)) {
    map.set(canonical, canonical);
    if (def.aliases) {
      for (const alias of def.aliases) {
        map.set(alias, canonical);
      }
    }
  }
  return map;
}

/**
 * Process raw input parameters through the broker for a given endpoint.
 *
 * @param config  The endpoint parameter configuration
 * @param input   Raw input parameters (from tRPC input, query string, etc.)
 * @returns       BrokerResult with forwarded query, recognized/unsupported lists, and errors
 */
export function brokerParams(
  config: EndpointParamConfig,
  input: Record<string, unknown>
): BrokerResult {
  const aliasMap = buildAliasMap(config);
  const forwardedQuery: Record<string, string | number | boolean> = {};
  const recognizedParams: string[] = [];
  const unsupportedParams: string[] = [];
  const errors: string[] = [];

  for (const [inputKey, inputValue] of Object.entries(input)) {
    // Skip undefined/null values — they were not provided
    if (inputValue === undefined || inputValue === null) continue;

    const canonical = aliasMap.get(inputKey);
    if (!canonical) {
      unsupportedParams.push(inputKey);
      continue;
    }

    const def = config.params[canonical];
    if (!def) {
      // Shouldn't happen if aliasMap is built correctly, but defensive
      unsupportedParams.push(inputKey);
      continue;
    }

    // Apply custom serializer or default coercer
    const coerce = def.serialize ?? DEFAULT_COERCERS[def.type];
    const result = coerce(inputValue);

    // Record coercion errors (value was provided but could not be serialized)
    if (result.error) {
      errors.push(`${inputKey}: ${result.error}`);
    }

    if (result.value === null) {
      // Value coerced to nothing — recognized but not forwarded
      // (could be a valid omission like false for a flag, or a coercion failure)
      recognizedParams.push(inputKey);
      continue;
    }

    // Use the Wazuh spec parameter name for the outbound query
    forwardedQuery[def.wazuhName] = result.value;
    recognizedParams.push(inputKey);
  }

  return { forwardedQuery, recognizedParams, unsupportedParams, errors };
}

// ── Universal parameter family ───────────────────────────────────────────────
// These are the common query parameters shared across many Wazuh endpoints.
// Individual endpoint configs compose from these + endpoint-specific params.

export const UNIVERSAL_PARAMS = {
  offset: {
    wazuhName: "offset",
    description: "First element to return in the collection",
    type: "number" as ParamType,
  },
  limit: {
    wazuhName: "limit",
    description: "Maximum number of elements to return",
    type: "number" as ParamType,
  },
  sort: {
    wazuhName: "sort",
    description: "Sort the collection by a field or fields (use +/- prefix for asc/desc)",
    type: "string" as ParamType,
  },
  search: {
    wazuhName: "search",
    description: "Look for elements containing the specified string. Prefix with '-' for complementary search",
    type: "string" as ParamType,
  },
  select: {
    wazuhName: "select",
    description: "Select which fields to return (comma-separated)",
    type: "csv" as ParamType,
  },
  q: {
    wazuhName: "q",
    description: "Query to filter results by. For example q=\"status=active\"",
    type: "string" as ParamType,
  },
  distinct: {
    wazuhName: "distinct",
    description: "Look for distinct values",
    type: "boolean" as ParamType,
  },
} as const satisfies Record<string, ParamDef>;

// ── Endpoint configurations ──────────────────────────────────────────────────
// Each config maps to a specific Wazuh GET endpoint from the v4.14.3 spec.
// Only parameters actually listed in the spec for that endpoint are included.

/**
 * GET /agents — List agents
 * Spec ref: operationId api.controllers.agent_controller.get_agents
 */
export const AGENTS_CONFIG: EndpointParamConfig = {
  endpoint: "/agents",
  params: {
    // Universal params (all supported per spec)
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,

    // Endpoint-specific params
    status: {
      wazuhName: "status",
      description: "Filter by agent status (comma-separated: active, disconnected, never_connected, pending)",
      type: "csv",

      enumValues: ["active", "pending", "never_connected", "disconnected"],
    },
    "os.platform": {
      wazuhName: "os.platform",
      description: "Filter by OS platform",
      type: "string",
      aliases: ["os_platform", "osPlatform", "platform"],
    },
    "os.version": {
      wazuhName: "os.version",
      description: "Filter by OS version",
      type: "string",
      aliases: ["os_version", "osVersion"],
    },
    "os.name": {
      wazuhName: "os.name",
      description: "Filter by OS name",
      type: "string",
      aliases: ["os_name", "osName"],
    },
    older_than: {
      wazuhName: "older_than",
      description: "Filter out agents whose last keep alive is older than specified (e.g. '7d', '10s')",
      type: "string",
      aliases: ["olderThan"],
    },
    agents_list: {
      wazuhName: "agents_list",
      description: "Comma-separated list of agent IDs to filter",
      type: "csv",
      aliases: ["agentsList"],
    },
    version: {
      wazuhName: "version",
      description: "Filter by Wazuh agent version",
      type: "string",
    },
    group: {
      wazuhName: "group",
      description: "Filter by group of agents",
      type: "string",
      aliases: ["agent_group"],
    },
    node_name: {
      wazuhName: "node_name",
      description: "Filter by node name",
      type: "string",
      aliases: ["nodeName"],
    },
    name: {
      wazuhName: "name",
      description: "Filter by agent name",
      type: "string",
    },
    ip: {
      wazuhName: "ip",
      description: "Filter by the IP used by the agent to communicate with the manager",
      type: "string",
    },
    registerIP: {
      wazuhName: "registerIP",
      description: "Filter by the IP used when registering the agent",
      type: "string",
    },
    group_config_status: {
      wazuhName: "group_config_status",
      description: "Agent groups configuration sync status (synced | not synced)",
      type: "string",

      enumValues: ["synced", "not synced"],
      aliases: ["groupConfigStatus"],
    },
    manager: {
      wazuhName: "manager",
      description: "Filter by manager hostname the agent reports to",
      type: "string",
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /rules — List rules
 * Spec ref: operationId api.controllers.rule_controller.get_rules
 */
export const RULES_CONFIG: EndpointParamConfig = {
  endpoint: "/rules",
  params: {
    // Universal params
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,

    // Endpoint-specific
    status: {
      wazuhName: "status",
      description: "Filter by rule status (enabled | disabled | all)",
      type: "string",

      enumValues: ["enabled", "disabled", "all"],
    },
    group: {
      wazuhName: "group",
      description: "Filter by rule group",
      type: "string",
    },
    level: {
      wazuhName: "level",
      description: "Filter by rule level. Can be a single level (4) or an interval (2-4)",
      type: "string",

      enumValues: ["critical", "debug", "debug2", "error", "info", "warning"],
      /**
       * Custom serializer: the Wazuh spec accepts level as a string ("4" or "2-4"),
       * but the Zod schema also allows numeric input (z.number().int()). This
       * serializer handles both forms correctly.
       */
      serialize: (value: unknown): CoerceResult => {
        if (value === undefined || value === null) return { value: null, error: null };
        if (typeof value === "number") {
          if (Number.isNaN(value)) return { value: null, error: `could not coerce ${JSON.stringify(value)} to level` };
          return { value: String(value), error: null };
        }
        return { value: String(value), error: null };
      },
    },
    filename: {
      wazuhName: "filename",
      description: "Filter by filename",
      type: "string",
    },
    relative_dirname: {
      wazuhName: "relative_dirname",
      description: "Filter by relative directory name",
      type: "string",
      aliases: ["relativeDirname"],
    },
    pci_dss: {
      wazuhName: "pci_dss",
      description: "Filter by PCI_DSS requirement name",
      type: "string",
    },
    gdpr: {
      wazuhName: "gdpr",
      description: "Filter by GDPR requirement",
      type: "string",
    },
    gpg13: {
      wazuhName: "gpg13",
      description: "Filter by GPG13 requirement",
      type: "string",
    },
    hipaa: {
      wazuhName: "hipaa",
      description: "Filter by HIPAA requirement",
      type: "string",
    },
    "nist-800-53": {
      wazuhName: "nist-800-53",
      description: "Filter by NIST-800-53 requirement",
      type: "string",
      aliases: ["nist_800_53"],
    },
    tsc: {
      wazuhName: "tsc",
      description: "Filter by TSC requirement",
      type: "string",
    },
    mitre: {
      wazuhName: "mitre",
      description: "Filter by MITRE technique ID",
      type: "string",
    },
    rule_ids: {
      wazuhName: "rule_ids",
      description: "Filter by rule IDs (comma-separated list)",
      type: "csv",
      aliases: ["ruleIds"],
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /groups — List groups
 * Spec ref: operationId api.controllers.agent_controller.get_list_group
 */
export const GROUPS_CONFIG: EndpointParamConfig = {
  endpoint: "/groups",
  params: {
    // Universal params
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,

    // Endpoint-specific
    hash: {
      wazuhName: "hash",
      description: "Select algorithm to generate the returned checksums",
      type: "string",

      enumValues: ["md5", "sha1", "sha224", "sha256", "sha384", "sha512", "blake2b", "blake2s", "sha3_224", "sha3_256", "sha3_384", "sha3_512"],
    },
    groups_list: {
      wazuhName: "groups_list",
      description: "Filter by group names (comma-separated list)",
      type: "csv",
      aliases: ["groupsList"],
    },
  },
};

/**
 * GET /cluster/nodes — List cluster nodes
 * Spec ref: operationId api.controllers.cluster_controller.get_cluster_nodes
 */
export const CLUSTER_NODES_CONFIG: EndpointParamConfig = {
  endpoint: "/cluster/nodes",
  params: {
    // Universal params
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,

    // Endpoint-specific
    type: {
      wazuhName: "type",
      description: "Filter by node type (worker | master)",
      type: "string",

      enumValues: ["worker", "master"],
      aliases: ["node_type", "nodeType"],
    },
    nodes_list: {
      wazuhName: "nodes_list",
      description: "Filter by node names (comma-separated list)",
      type: "csv",
      aliases: ["nodesList"],
    },
  },
};

/**
 * GET /sca/{agent_id} — SCA policies for an agent
 * Spec ref: operationId api.controllers.sca_controller.get_sca_agent
 */
export const SCA_POLICIES_CONFIG: EndpointParamConfig = {
  endpoint: "/sca/{agent_id}",
  params: {
    // Universal params
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,

    // Endpoint-specific
    name: {
      wazuhName: "name",
      description: "Filter by policy name",
      type: "string",
      aliases: ["policyName"],
    },
    description: {
      wazuhName: "description",
      description: "Filter by policy description",
      type: "string",
    },
    references: {
      wazuhName: "references",
      description: "Filter by references",
      type: "string",
    },
  },
};

/**
 * GET /manager/configuration — Manager configuration
 * Spec ref: operationId api.controllers.manager_controller.get_configuration
 *
 * Precision params: section, field, raw.
 * Per spec: "section and field will be ignored if raw is provided."
 * The broker does not enforce that constraint — it forwards all recognized params
 * and lets Wazuh apply its own precedence rules.
 *
 * Note: This endpoint does NOT support offset, limit, sort, search, select, or q.
 * It only supports raw, section, field, and distinct per the spec.
 */
export const MANAGER_CONFIG: EndpointParamConfig = {
  endpoint: "/manager/configuration",
  params: {
    // Only distinct from universal family — offset/limit/sort/search/select/q are NOT in the spec for this endpoint
    distinct: UNIVERSAL_PARAMS.distinct,

    // Endpoint-specific precision params
    section: {
      wazuhName: "section",
      description: "Indicates the wazuh configuration section (e.g. global, alerts, syscheck, ruleset, etc.)",
      type: "string",

      enumValues: ["active-response", "agentless", "alerts", "auth", "client", "client_buffer", "cluster", "command", "database_output", "email_alerts", "global", "integration", "labels", "localfile", "logging", "remote", "reports", "rootcheck", "ruleset", "sca", "socket", "syscheck", "syslog_output", "vulnerability-detection", "indexer"],
    },
    field: {
      wazuhName: "field",
      description: "Indicate a section child. E.g, fields for ruleset section are: decoder_dir, rule_dir, etc",
      type: "string",
    },
    raw: {
      wazuhName: "raw",
      description: "Format response in plain text. When true, section and field are ignored by Wazuh",
      type: "boolean",
    },
  },
};

/**
 * GET /sca/{agent_id}/checks/{policy_id} — SCA checks for a policy
 * Spec ref: operationId api.controllers.sca_controller.get_sca_checks
 */
export const SCA_CHECKS_CONFIG: EndpointParamConfig = {
  endpoint: "/sca/{agent_id}/checks/{policy_id}",
  params: {
    // Universal params
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,

    // Endpoint-specific
    title: {
      wazuhName: "title",
      description: "Filter by check title",
      type: "string",
    },
    description: {
      wazuhName: "description",
      description: "Filter by check description",
      type: "string",
    },
    rationale: {
      wazuhName: "rationale",
      description: "Filter by rationale",
      type: "string",
    },
    remediation: {
      wazuhName: "remediation",
      description: "Filter by remediation",
      type: "string",
    },
    command: {
      wazuhName: "command",
      description: "Filter by command",
      type: "string",
    },
    reason: {
      wazuhName: "reason",
      description: "Filter by reason",
      type: "string",
    },
    file: {
      wazuhName: "file",
      description: "Filter by file path",
      type: "string",
      aliases: ["full_path"],
    },
    process: {
      wazuhName: "process",
      description: "Filter by process",
      type: "string",
    },
    directory: {
      wazuhName: "directory",
      description: "Filter by directory",
      type: "string",
    },
    registry: {
      wazuhName: "registry",
      description: "Filter by registry",
      type: "string",
    },
    references: {
      wazuhName: "references",
      description: "Filter by references",
      type: "string",
    },
    result: {
      wazuhName: "result",
      description: "Filter by result (passed | failed | not applicable)",
      type: "string",
    },
    condition: {
      wazuhName: "condition",
      description: "Filter by condition",
      type: "string",
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3 — Syscollector Endpoint Configs
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /syscollector/{agent_id}/packages — Agent installed packages
 * Spec ref: operationId api.controllers.syscollector_controller.get_packages_info
 */
export const SYSCOLLECTOR_PACKAGES_CONFIG: EndpointParamConfig = {
  endpoint: "/syscollector/{agent_id}/packages",
  params: {
    // Universal params
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,

    // Endpoint-specific field filters
    vendor: {
      wazuhName: "vendor",
      description: "Filter by package vendor",
      type: "string",
    },
    name: {
      wazuhName: "name",
      description: "Filter by package name",
      type: "string",
      aliases: ["package_name"],
    },
    architecture: {
      wazuhName: "architecture",
      description: "Filter by architecture (e.g. amd64, x86_64)",
      type: "string",
      aliases: ["arch"],
    },
    format: {
      wazuhName: "format",
      description: "Filter by package format (e.g. deb, rpm)",
      type: "string",
      aliases: ["file_format"],
    },
    version: {
      wazuhName: "version",
      description: "Filter by package version",
      type: "string",
      aliases: ["package_version"],
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /syscollector/{agent_id}/ports — Agent open network ports
 * Spec ref: operationId api.controllers.syscollector_controller.get_ports_info
 */
export const SYSCOLLECTOR_PORTS_CONFIG: EndpointParamConfig = {
  endpoint: "/syscollector/{agent_id}/ports",
  params: {
    // Universal params
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,

    // Endpoint-specific field filters
    pid: {
      wazuhName: "pid",
      description: "Filter by PID",
      type: "string",

      enumValues: ["true", "false"],
    },
    protocol: {
      wazuhName: "protocol",
      description: "Filter by protocol (e.g. tcp, udp)",
      type: "string",
    },
    "local.ip": {
      wazuhName: "local.ip",
      description: "Filter by local IP address",
      type: "string",
      aliases: ["local_ip"],
    },
    "local.port": {
      wazuhName: "local.port",
      description: "Filter by local port number",
      type: "string",
      aliases: ["local_port"],
    },
    "remote.ip": {
      wazuhName: "remote.ip",
      description: "Filter by remote IP address",
      type: "string",
      aliases: ["remote_ip"],
    },
    tx_queue: {
      wazuhName: "tx_queue",
      description: "Filter by TX queue",
      type: "string",
    },
    state: {
      wazuhName: "state",
      description: "Filter by connection state (e.g. listening, established)",
      type: "string",
    },
    process: {
      wazuhName: "process",
      description: "Filter by process name associated with port",
      type: "string",
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /syscollector/{agent_id}/processes — Agent running processes
 * Spec ref: operationId api.controllers.syscollector_controller.get_processes_info
 *
 * NOTE: Several spec params use aliased names:
 *   process_pid  → outbound "pid"
 *   process_state → outbound "state"
 *   process_name → outbound "name"
 */
export const SYSCOLLECTOR_PROCESSES_CONFIG: EndpointParamConfig = {
  endpoint: "/syscollector/{agent_id}/processes",
  params: {
    // Universal params
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,

    // Endpoint-specific field filters
    // NOTE: The spec defines process_pid, process_state, process_name as the
    // component parameter names, but their outbound Wazuh query param names
    // are "pid", "state", "name" respectively.
    pid: {
      wazuhName: "pid",
      description: "Filter by process PID",
      type: "string",

      enumValues: ["true", "false"],
      aliases: ["process_pid"],
    },
    state: {
      wazuhName: "state",
      description: "Filter by process state (e.g. S, R, Z)",
      type: "string",
      aliases: ["process_state"],
    },
    ppid: {
      wazuhName: "ppid",
      description: "Filter by parent process PID",
      type: "string",
    },
    egroup: {
      wazuhName: "egroup",
      description: "Filter by effective group",
      type: "string",
    },
    euser: {
      wazuhName: "euser",
      description: "Filter by effective user",
      type: "string",
    },
    fgroup: {
      wazuhName: "fgroup",
      description: "Filter by filesystem group",
      type: "string",
    },
    name: {
      wazuhName: "name",
      description: "Filter by process name",
      type: "string",
      aliases: ["process_name"],
    },
    nlwp: {
      wazuhName: "nlwp",
      description: "Filter by number of lightweight processes (threads)",
      type: "string",
    },
    pgrp: {
      wazuhName: "pgrp",
      description: "Filter by process group ID",
      type: "string",
    },
    priority: {
      wazuhName: "priority",
      description: "Filter by scheduling priority",
      type: "string",
    },
    rgroup: {
      wazuhName: "rgroup",
      description: "Filter by real group",
      type: "string",
    },
    ruser: {
      wazuhName: "ruser",
      description: "Filter by real user",
      type: "string",
    },
    sgroup: {
      wazuhName: "sgroup",
      description: "Filter by saved group",
      type: "string",
    },
    suser: {
      wazuhName: "suser",
      description: "Filter by saved user",
      type: "string",
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /syscollector/{agent_id}/services — Agent system services
 * Spec ref: operationId api.controllers.syscollector_controller.get_services_info
 *
 * NOTE: The spec defines only universal params for this endpoint.
 * No field-specific filters are available.
 */
export const SYSCOLLECTOR_SERVICES_CONFIG: EndpointParamConfig = {
  endpoint: "/syscollector/{agent_id}/services",
  params: {
    // Universal params only — no field-specific filters in spec
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// KG-Only Param Wiring — New Broker Configs
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /manager/logs — Manager logs
 * Spec ref: operationId api.controllers.manager_controller.get_log
 *
 * Previously un-brokered (manual param forwarding). Now supports universal
 * params plus endpoint-specific level and tag filters.
 */
export const MANAGER_LOGS_CONFIG: EndpointParamConfig = {
  endpoint: "/manager/logs",
  params: {
    // Universal params
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,

    // Endpoint-specific
    level: {
      wazuhName: "level",
      description: "Filter by log level (info, error, warning, debug)",
      type: "string",

      enumValues: ["critical", "debug", "debug2", "error", "info", "warning"],
    },
    tag: {
      wazuhName: "tag",
      description: "Filter by log tag (e.g. wazuh-modulesd:syscollector)",
      type: "string",
    },
  },
};

/**
 * GET /groups/{group_id}/agents — Agents in a group
 * Spec ref: operationId api.controllers.agent_controller.get_agents_in_group
 *
 * Previously un-brokered (only forwarded limit/offset). Now supports
 * universal params plus status filter.
 */
export const GROUP_AGENTS_CONFIG: EndpointParamConfig = {
  endpoint: "/groups/{group_id}/agents",
  params: {
    // Universal params
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,

    // Endpoint-specific
    status: {
      wazuhName: "status",
      description: "Filter by agent status (active, disconnected, never_connected, pending)",
      type: "csv",

      enumValues: ["active", "pending", "never_connected", "disconnected"],
    },
  },
};

/**
 * GET /syscheck/{agent_id} — FIM/Syscheck files
 * Spec ref: operationId api.controllers.syscheck_controller.get_syscheck_agent
 *
 * Previously un-brokered (manual param forwarding). Now supports universal
 * params plus all field-specific filters from the spec.
 */
export const SYSCHECK_CONFIG: EndpointParamConfig = {
  endpoint: "/syscheck/{agent_id}",
  params: {
    // Universal params
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,

    // Endpoint-specific field filters
    type: {
      wazuhName: "type",
      description: "Filter by file type (file | registry)",
      type: "string",

      enumValues: ["file", "registry_key", "registry_value"],
    },
    hash: {
      wazuhName: "hash",
      description: "Filter by any hash (MD5, SHA1, or SHA256)",
      type: "string",

      enumValues: ["md5", "sha1", "sha224", "sha256", "sha384", "sha512", "blake2b", "blake2s", "sha3_224", "sha3_256", "sha3_384", "sha3_512"],
    },
    file: {
      wazuhName: "file",
      description: "Filter by file path",
      type: "string",
      aliases: ["full_path"],
    },
    arch: {
      wazuhName: "arch",
      description: "Filter by registry architecture (x86 | x64) — registry type only",
      type: "string",

      enumValues: ["[x32]", "[x64]"],
      aliases: ["architecture"],
    },
    "value.name": {
      wazuhName: "value.name",
      description: "Filter by registry value name — registry type only",
      type: "string",
      aliases: ["valueName", "value_name"],
    },
    "value.type": {
      wazuhName: "value.type",
      description: "Filter by registry value type — registry type only",
      type: "string",
      aliases: ["valueType", "value_type"],
    },
    summary: {
      wazuhName: "summary",
      description: "Return only a summary of changes (true/false)",
      type: "boolean",
    },
    md5: {
      wazuhName: "md5",
      description: "Filter by MD5 hash",
      type: "string",
    },
    sha1: {
      wazuhName: "sha1",
      description: "Filter by SHA1 hash",
      type: "string",
    },
    sha256: {
      wazuhName: "sha256",
      description: "Filter by SHA256 hash",
      type: "string",
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /mitre/techniques — MITRE ATT&CK techniques
 * Spec ref: operationId api.controllers.mitre_controller.get_attack
 *
 * Previously un-brokered (only forwarded limit/offset/search). Now supports
 * universal params plus technique_ids filter.
 */
export const MITRE_TECHNIQUES_CONFIG: EndpointParamConfig = {
  endpoint: "/mitre/techniques",
  params: {
    // Universal params
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,

    // Endpoint-specific
    technique_ids: {
      wazuhName: "technique_ids",
      description: "Filter by MITRE technique IDs (comma-separated list, e.g. T1059,T1078)",
      type: "csv",

      enumValues: ["true", "false"],
      aliases: ["techniqueIds"],
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /decoders — List decoders
 * Spec ref: operationId api.controllers.decoder_controller.get_decoders
 *
 * Previously un-brokered (only forwarded limit/offset/search). Now supports
 * universal params plus all field-specific filters.
 */
export const DECODERS_CONFIG: EndpointParamConfig = {
  endpoint: "/decoders",
  params: {
    // Universal params
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,

    // Endpoint-specific
    decoder_names: {
      wazuhName: "decoder_names",
      description: "Filter by decoder names (comma-separated list)",
      type: "csv",

      enumValues: ["true", "false"],
      aliases: ["decoderNames"],
    },
    filename: {
      wazuhName: "filename",
      description: "Filter by decoder filename",
      type: "string",
    },
    relative_dirname: {
      wazuhName: "relative_dirname",
      description: "Filter by relative directory name",
      type: "string",
      aliases: ["relativeDirname"],
    },
    status: {
      wazuhName: "status",
      description: "Filter by decoder status (enabled | disabled | all)",
      type: "string",

      enumValues: ["enabled", "disabled", "all"],
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /rootcheck/{agent_id} — Rootcheck results
 * Spec ref: operationId api.controllers.rootcheck_controller.get_rootcheck_agent
 *
 * Previously un-brokered (only forwarded limit/offset). Now supports
 * universal params plus compliance and status filters.
 */
export const ROOTCHECK_CONFIG: EndpointParamConfig = {
  endpoint: "/rootcheck/{agent_id}",
  params: {
    // Universal params
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,

    // Endpoint-specific
    status: {
      wazuhName: "status",
      description: "Filter by rootcheck status",
      type: "string",

      enumValues: ["active", "pending", "never_connected", "disconnected"],
    },
    // Restored: pci_dss and cis ARE in the Wazuh v4.14.3 spec for GET /rootcheck/{agent_id}
    pci_dss: {
      wazuhName: "pci_dss",
      description: "Filter by PCI DSS requirement (e.g. 10.6.1)",
      type: "string",
      aliases: ["pciDss"],
    },
    cis: {
      wazuhName: "cis",
      description: "Filter by CIS benchmark (e.g. 1.1.1)",
      type: "string",
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Phase: API Contract Gap Report v4.14.3 — High Findings Broker Configs
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /rules/files — List rule files (H-1 gap fill)
 * Spec ref: operationId api.controllers.rule_controller.get_rules_files
 */
export const RULES_FILES_CONFIG: EndpointParamConfig = {
  endpoint: "/rules/files",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,
    filename: {
      wazuhName: "filename",
      description: "Filter by rule filename",
      type: "string",

      enumValues: ["true", "false"],
    },
    relative_dirname: {
      wazuhName: "relative_dirname",
      description: "Filter by relative directory name",
      type: "string",
      aliases: ["relativeDirname"],
    },
    status: {
      wazuhName: "status",
      description: "Filter by rule file status (enabled | disabled | all)",
      type: "string",

      enumValues: ["enabled", "disabled", "all"],
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /decoders/files — List decoder files (H-2 gap fill)
 * Spec ref: operationId api.controllers.decoder_controller.get_decoders_files
 */
export const DECODERS_FILES_CONFIG: EndpointParamConfig = {
  endpoint: "/decoders/files",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,
    filename: {
      wazuhName: "filename",
      description: "Filter by decoder filename",
      type: "string",

      enumValues: ["true", "false"],
    },
    relative_dirname: {
      wazuhName: "relative_dirname",
      description: "Filter by relative directory name",
      type: "string",
      aliases: ["relativeDirname"],
    },
    status: {
      wazuhName: "status",
      description: "Filter by decoder file status (enabled | disabled | all)",
      type: "string",

      enumValues: ["enabled", "disabled", "all"],
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /lists — List CDB lists (H-3 gap fill)
 * Spec ref: operationId api.controllers.cdb_list_controller.get_lists
 */
export const LISTS_CONFIG: EndpointParamConfig = {
  endpoint: "/lists",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,
    filename: {
      wazuhName: "filename",
      description: "Filter by CDB list filename",
      type: "string",

      enumValues: ["true", "false"],
    },
    relative_dirname: {
      wazuhName: "relative_dirname",
      description: "Filter by relative directory name",
      type: "string",
      aliases: ["relativeDirname"],
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /lists/files — List CDB list files (H-4 gap fill)
 * Spec ref: operationId api.controllers.cdb_list_controller.get_lists_files
 */
export const LISTS_FILES_CONFIG: EndpointParamConfig = {
  endpoint: "/lists/files",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    filename: {
      wazuhName: "filename",
      description: "Filter by CDB list filename",
      type: "string",

      enumValues: ["true", "false"],
    },
    relative_dirname: {
      wazuhName: "relative_dirname",
      description: "Filter by relative directory name",
      type: "string",
      aliases: ["relativeDirname"],
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /mitre/tactics — MITRE ATT&CK tactics (H-5 gap fill)
 * Spec ref: operationId api.controllers.mitre_controller.get_tactics
 */
export const MITRE_TACTICS_CONFIG: EndpointParamConfig = {
  endpoint: "/mitre/tactics",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,
    mitre_tactic_ids: {
      wazuhName: "tactic_ids",
      description: "Filter by MITRE tactic IDs (comma-separated)",
      type: "csv",

      enumValues: ["true", "false"],
      aliases: ["tacticIds", "tactic_ids"],
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /mitre/groups — MITRE ATT&CK groups (H-6 gap fill)
 * Spec ref: operationId api.controllers.mitre_controller.get_groups
 */
export const MITRE_GROUPS_CONFIG: EndpointParamConfig = {
  endpoint: "/mitre/groups",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,
    mitre_group_ids: {
      wazuhName: "group_ids",
      description: "Filter by MITRE group IDs (comma-separated)",
      type: "csv",

      enumValues: ["true", "false"],
      aliases: ["groupIds", "group_ids"],
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /mitre/mitigations — MITRE ATT&CK mitigations (H-7 gap fill)
 * Spec ref: operationId api.controllers.mitre_controller.get_mitigations
 */
export const MITRE_MITIGATIONS_CONFIG: EndpointParamConfig = {
  endpoint: "/mitre/mitigations",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,
    mitre_mitigation_ids: {
      wazuhName: "mitigation_ids",
      description: "Filter by MITRE mitigation IDs (comma-separated)",
      type: "csv",

      enumValues: ["true", "false"],
      aliases: ["mitigationIds", "mitigation_ids"],
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /mitre/software — MITRE ATT&CK software (H-8 gap fill)
 * Spec ref: operationId api.controllers.mitre_controller.get_software
 */
export const MITRE_SOFTWARE_CONFIG: EndpointParamConfig = {
  endpoint: "/mitre/software",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,
    mitre_software_ids: {
      wazuhName: "software_ids",
      description: "Filter by MITRE software IDs (comma-separated)",
      type: "csv",

      enumValues: ["true", "false"],
      aliases: ["softwareIds", "software_ids"],
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /mitre/references — MITRE ATT&CK references (H-9 gap fill)
 * Spec ref: operationId api.controllers.mitre_controller.get_references
 */
export const MITRE_REFERENCES_CONFIG: EndpointParamConfig = {
  endpoint: "/mitre/references",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    mitre_reference_ids: {
      wazuhName: "reference_ids",
      description: "Filter by MITRE reference IDs (comma-separated)",
      type: "csv",

      enumValues: ["true", "false"],
      aliases: ["referenceIds", "reference_ids"],
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /groups/{group_id}/files — List files in a group (H-10 gap fill)
 * Spec ref: operationId api.controllers.agent_controller.get_group_files
 */
export const GROUP_FILES_CONFIG: EndpointParamConfig = {
  endpoint: "/groups/{group_id}/files",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,
    hash: {
      wazuhName: "hash",
      description: "Select algorithm to generate the returned checksums",
      type: "string",

      enumValues: ["md5", "sha1", "sha224", "sha256", "sha384", "sha512", "blake2b", "blake2s", "sha3_224", "sha3_256", "sha3_384", "sha3_512"],
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /syscollector/{agent_id}/netiface — Agent network interfaces (H-11 gap fill)
 * Spec ref: operationId api.controllers.syscollector_controller.get_network_interface_info
 */
export const SYSCOLLECTOR_NETIFACE_CONFIG: EndpointParamConfig = {
  endpoint: "/syscollector/{agent_id}/netiface",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,
    name: {
      wazuhName: "name",
      description: "Filter by interface name",
      type: "string",

      enumValues: ["true", "false"],
    },
    adapter: {
      wazuhName: "adapter",
      description: "Filter by adapter",
      type: "string",
    },
    type: {
      wazuhName: "type",
      description: "Filter by interface type (e.g. ethernet, wireless)",
      type: "string",

      enumValues: ["file", "registry_key", "registry_value"],
    },
    state: {
      wazuhName: "state",
      description: "Filter by interface state (e.g. up, down)",
      type: "string",
    },
    mtu: {
      wazuhName: "mtu",
      description: "Filter by MTU",
      type: "number",
    },
    "tx.packets": {
      wazuhName: "tx.packets",
      description: "Filter by TX packets",
      type: "string",
      aliases: ["tx_packets"],
    },
    "rx.packets": {
      wazuhName: "rx.packets",
      description: "Filter by RX packets",
      type: "string",
      aliases: ["rx_packets"],
    },
    "tx.bytes": {
      wazuhName: "tx.bytes",
      description: "Filter by TX bytes",
      type: "string",
      aliases: ["tx_bytes"],
    },
    "rx.bytes": {
      wazuhName: "rx.bytes",
      description: "Filter by RX bytes",
      type: "string",
      aliases: ["rx_bytes"],
    },
    "tx.errors": {
      wazuhName: "tx.errors",
      description: "Filter by TX errors",
      type: "string",
      aliases: ["tx_errors"],
    },
    "rx.errors": {
      wazuhName: "rx.errors",
      description: "Filter by RX errors",
      type: "string",
      aliases: ["rx_errors"],
    },
    "tx.dropped": {
      wazuhName: "tx.dropped",
      description: "Filter by TX dropped",
      type: "string",
      aliases: ["tx_dropped"],
    },
    "rx.dropped": {
      wazuhName: "rx.dropped",
      description: "Filter by RX dropped",
      type: "string",
      aliases: ["rx_dropped"],
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /syscollector/{agent_id}/netaddr — Agent network addresses (H-12 gap fill)
 * Spec ref: operationId api.controllers.syscollector_controller.get_network_address_info
 */
export const SYSCOLLECTOR_NETADDR_CONFIG: EndpointParamConfig = {
  endpoint: "/syscollector/{agent_id}/netaddr",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,
    iface: {
      wazuhName: "iface",
      description: "Filter by interface name",
      type: "string",

      enumValues: ["true", "false"],
    },
    proto: {
      wazuhName: "proto",
      description: "Filter by protocol (ipv4 | ipv6)",
      type: "string",
    },
    address: {
      wazuhName: "address",
      description: "Filter by IP address",
      type: "string",
    },
    broadcast: {
      wazuhName: "broadcast",
      description: "Filter by broadcast address",
      type: "string",
    },
    netmask: {
      wazuhName: "netmask",
      description: "Filter by netmask",
      type: "string",
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /syscollector/{agent_id}/hotfixes — Agent hotfixes (M-12 gap fill)
 * Spec ref: operationId api.controllers.syscollector_controller.get_hotfixes_info
 */
export const SYSCOLLECTOR_HOTFIXES_CONFIG: EndpointParamConfig = {
  endpoint: "/syscollector/{agent_id}/hotfixes",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,
    hotfix: {
      wazuhName: "hotfix",
      description: "Filter by hotfix ID (e.g. KB5000802)",
      type: "string",

      enumValues: ["true", "false"],
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /syscollector/{agent_id}/netproto — Agent network protocols (M-13 gap fill)
 * Spec ref: operationId api.controllers.syscollector_controller.get_network_protocol_info
 */
export const SYSCOLLECTOR_NETPROTO_CONFIG: EndpointParamConfig = {
  endpoint: "/syscollector/{agent_id}/netproto",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,
    iface: {
      wazuhName: "iface",
      description: "Filter by interface name",
      type: "string",

      enumValues: ["true", "false"],
    },
    type: {
      wazuhName: "type",
      description: "Filter by protocol type",
      type: "string",

      enumValues: ["file", "registry_key", "registry_value"],
    },
    gateway: {
      wazuhName: "gateway",
      description: "Filter by gateway",
      type: "string",
    },
    dhcp: {
      wazuhName: "dhcp",
      description: "Filter by DHCP status",
      type: "string",
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /ciscat/{agent_id}/results — CIS-CAT results
 * Spec ref: operationId api.controllers.ciscat_controller.get_agents_ciscat_results
 *
 * Previously un-brokered (only forwarded limit/offset). Now supports
 * universal params plus all CIS-CAT field-specific filters.
 */
export const CISCAT_CONFIG: EndpointParamConfig = {
  endpoint: "/ciscat/{agent_id}/results",
  params: {
    // Universal params
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,

    // Endpoint-specific field filters
    benchmark: {
      wazuhName: "benchmark",
      description: "Filter by CIS-CAT benchmark name",
      type: "string",

      enumValues: ["true", "false"],
    },
    profile: {
      wazuhName: "profile",
      description: "Filter by CIS-CAT profile",
      type: "string",
    },
    pass: {
      wazuhName: "pass",
      description: "Filter by number of passed checks",
      type: "number",
    },
    fail: {
      wazuhName: "fail",
      description: "Filter by number of failed checks",
      type: "number",
    },
    error: {
      wazuhName: "error",
      description: "Filter by number of errors",
      type: "number",
    },
    notchecked: {
      wazuhName: "notchecked",
      description: "Filter by number of not-checked items",
      type: "number",
    },
    unknown: {
      wazuhName: "unknown",
      description: "Filter by number of unknown items",
      type: "number",
    },
    score: {
      wazuhName: "score",
      description: "Filter by CIS-CAT score",
      type: "number",
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};


/**
 * GET /experimental/ciscat/results — Cross-agent CIS-CAT results
 * Spec ref: operationId api.controllers.experimental_controller.get_cis_cat_results
 *
 * Returns CIS-CAT scan results across ALL agents (no agent_id path param).
 * Supports universal params, agents_list filter, and all CIS-CAT field filters.
 */
export const EXPERIMENTAL_CISCAT_RESULTS_CONFIG: EndpointParamConfig = {
  endpoint: "/experimental/ciscat/results",
  params: {
    // Universal params (no q/distinct per spec v4.14.3)
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,

    // Cross-agent filter
    agents_list: {
      wazuhName: "agents_list",
      description: "Comma-separated list of agent IDs to filter results",
      type: "csv",

      enumValues: ["true", "false"],
      aliases: ["agentsList"],
    },

    // CIS-CAT field-specific filters
    benchmark: {
      wazuhName: "benchmark",
      description: "Filter by CIS-CAT benchmark name",
      type: "string",
    },
    profile: {
      wazuhName: "profile",
      description: "Filter by CIS-CAT profile",
      type: "string",
    },
    pass: {
      wazuhName: "pass",
      description: "Filter by number of passed checks",
      type: "number",
    },
    fail: {
      wazuhName: "fail",
      description: "Filter by number of failed checks",
      type: "number",
    },
    error: {
      wazuhName: "error",
      description: "Filter by number of errors",
      type: "number",
    },
    notchecked: {
      wazuhName: "notchecked",
      description: "Filter by number of not-checked items",
      type: "number",
    },
    unknown: {
      wazuhName: "unknown",
      description: "Filter by number of unknown items",
      type: "number",
    },
    score: {
      wazuhName: "score",
      description: "Filter by CIS-CAT score",
      type: "number",
    },
  },
};


/**
 * Derive an experimental syscollector endpoint config from a standard single-agent config.
 *
 * - Copies all params from stdConfig (excluding q, distinct, wait_for_complete)
 * - Adds agents_list (string) for cross-agent filtering
 * - Adds wait_for_complete (boolean) for cluster sync
 */
function deriveExpConfig(
  stdConfig: EndpointParamConfig,
  expEndpoint: string
): EndpointParamConfig {
  const params: Record<string, ParamDef> = {};
  for (const [key, def] of Object.entries(stdConfig.params)) {
    if (key === "q" || key === "distinct" || key === "wait_for_complete") continue;
    params[key] = def;
  }
  params.agents_list = {
    type: "string",
    wazuhName: "agents_list",
    description: "Comma-separated list of agent IDs",
  };
  params.wait_for_complete = {
    type: "boolean",
    wazuhName: "wait_for_complete",
    description: "Wait for cluster synchronization",
  };
  return { endpoint: expEndpoint, params };
}

export const EXP_SYSCOLLECTOR_PACKAGES_CONFIG = deriveExpConfig(
  SYSCOLLECTOR_PACKAGES_CONFIG,
  "/experimental/syscollector/packages"
);

export const EXP_SYSCOLLECTOR_PROCESSES_CONFIG = deriveExpConfig(
  SYSCOLLECTOR_PROCESSES_CONFIG,
  "/experimental/syscollector/processes"
);

export const EXP_SYSCOLLECTOR_PORTS_CONFIG = deriveExpConfig(
  SYSCOLLECTOR_PORTS_CONFIG,
  "/experimental/syscollector/ports"
);


// ══════════════════════════════════════════════════════════════════════════════
// PHASE 1 + 2 BROKER CONFIGS — Remediation Sprint 2026-03-10
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /security/roles — List security roles
 * Spec ref: operationId api.controllers.security_controller.get_roles
 */
export const SECURITY_ROLES_CONFIG: EndpointParamConfig = {
  endpoint: "/security/roles",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,
    role_ids: {
      wazuhName: "role_ids",
      description: "List of role IDs to filter (comma-separated)",
      type: "csv",

      enumValues: ["true", "false"],
    },
  },
};

/**
 * GET /security/policies — List security policies
 * Spec ref: operationId api.controllers.security_controller.get_policies
 */
export const SECURITY_POLICIES_CONFIG: EndpointParamConfig = {
  endpoint: "/security/policies",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,
    policy_ids: {
      wazuhName: "policy_ids",
      description: "List of policy IDs to filter (comma-separated)",
      type: "csv",
    },
  },
};

/**
 * GET /security/users — List security users
 * Spec ref: operationId api.controllers.security_controller.get_users
 */
export const SECURITY_USERS_CONFIG: EndpointParamConfig = {
  endpoint: "/security/users",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,
    user_ids: {
      wazuhName: "user_ids",
      description: "List of user IDs to filter (comma-separated)",
      type: "csv",
    },
  },
};

/**
 * GET /cluster/{node_id}/configuration — Cluster node configuration
 * Spec ref: operationId api.controllers.cluster_controller.get_node_config
 * Mirrors MANAGER_CONFIG pattern.
 */
export const CLUSTER_NODE_CONFIGURATION_CONFIG: EndpointParamConfig = {
  endpoint: "/cluster/{node_id}/configuration",
  params: {
    section: {
      wazuhName: "section",
      description: "Return the configuration of the specified section",
      type: "string",

      enumValues: ["active-response", "agentless", "alerts", "auth", "client", "client_buffer", "cluster", "command", "database_output", "email_alerts", "global", "integration", "labels", "localfile", "logging", "remote", "reports", "rootcheck", "ruleset", "sca", "socket", "syscheck", "syslog_output", "vulnerability-detection", "indexer"],
    },
    field: {
      wazuhName: "field",
      description: "Return the configuration of the specified field inside the section",
      type: "string",
    },
    raw: {
      wazuhName: "raw",
      description: "Return raw configuration file",
      type: "boolean",
    },
  },
};

/**
 * GET /cluster/{node_id}/logs — Cluster node logs
 * Spec ref: operationId api.controllers.cluster_controller.get_log_node
 */
export const CLUSTER_NODE_LOGS_CONFIG: EndpointParamConfig = {
  endpoint: "/cluster/{node_id}/logs",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    q: UNIVERSAL_PARAMS.q,
    tag: {
      wazuhName: "tag",
      description: "Filter by daemon tag (e.g. wazuh-modulesd)",
      type: "string",
    },
    level: {
      wazuhName: "level",
      description: "Filter by log level (info, error, warning, debug)",
      type: "string",

      enumValues: ["critical", "debug", "debug2", "error", "info", "warning"],
    },
  },
};

/**
 * GET /tasks/status — Task status
 * Spec ref: operationId api.controllers.task_controller.get_tasks_status
 */
export const TASKS_STATUS_CONFIG: EndpointParamConfig = {
  endpoint: "/tasks/status",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    task_list: {
      wazuhName: "task_list",
      description: "List of task IDs to filter (comma-separated)",
      type: "csv",
    },
    agents_list: {
      wazuhName: "agents_list",
      description: "List of agent IDs to filter (comma-separated)",
      type: "csv",
    },
    command: {
      wazuhName: "command",
      description: "Filter by command type",
      type: "string",
    },
    node: {
      wazuhName: "node",
      description: "Filter by node name",
      type: "string",
    },
    module: {
      wazuhName: "module",
      description: "Filter by module",
      type: "string",
    },
    status: {
      wazuhName: "status",
      description: "Filter by task status (in_progress, done, failed, cancelled)",
      type: "string",

      enumValues: ["active", "pending", "never_connected", "disconnected"],
    },
  },
};

/**
 * GET /security/rules — List RBAC security rules
 * Spec ref: operationId api.controllers.security_controller.get_rules
 */
export const SECURITY_RBAC_RULES_CONFIG: EndpointParamConfig = {
  endpoint: "/security/rules",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,
    rule_ids: {
      wazuhName: "rule_ids",
      description: "List of rule IDs to filter (comma-separated)",
      type: "csv",
    },
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /decoders/parents — List parent decoders
 * Spec ref: operationId api.controllers.decoder_controller.get_parent_decoders
 */
export const DECODER_PARENTS_CONFIG: EndpointParamConfig = {
  endpoint: "/decoders/parents",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /syscollector/{agent_id}/os — Agent OS information
 * Spec ref: operationId api.controllers.syscollector_controller.get_os_info
 */
export const SYSCOLLECTOR_OS_CONFIG: EndpointParamConfig = {
  endpoint: "/syscollector/{agent_id}/os",
  params: {
    select: UNIVERSAL_PARAMS.select,
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /syscollector/{agent_id}/hardware — Agent hardware information
 * Spec ref: operationId api.controllers.syscollector_controller.get_hardware_info
 */
export const SYSCOLLECTOR_HARDWARE_CONFIG: EndpointParamConfig = {
  endpoint: "/syscollector/{agent_id}/hardware",
  params: {
    select: UNIVERSAL_PARAMS.select,
    wait_for_complete: {
      type: "boolean" as const,
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /agents/outdated — Outdated agents
 * Spec ref: operationId api.controllers.agent_controller.get_agent_outdated
 */
export const AGENTS_OUTDATED_CONFIG: EndpointParamConfig = {
  endpoint: "/agents/outdated",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
  },
};

/**
 * GET /agents/no_group — Agents with no group
 * Spec ref: operationId api.controllers.agent_controller.get_agent_no_group
 */
export const AGENTS_NO_GROUP_CONFIG: EndpointParamConfig = {
  endpoint: "/agents/no_group",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
  },
};

/**
 * GET /agents/stats/distinct — Agent stats distinct
 * Spec ref: operationId api.controllers.agent_controller.get_agent_fields
 */
export const AGENTS_STATS_DISTINCT_CONFIG: EndpointParamConfig = {
  endpoint: "/agents/stats/distinct",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    q: UNIVERSAL_PARAMS.q,
    fields: {
      wazuhName: "fields",
      description: "List of fields to return distinct values for (comma-separated)",
      type: "csv",

      enumValues: ["true", "false"],
    },
  },
};

/**
 * GET /syscollector/{agent_id}/browser_extensions — Browser extensions
 * Spec ref: operationId api.controllers.syscollector_controller.get_browser_extensions
 */
export const SYSCOLLECTOR_BROWSER_EXTENSIONS_CONFIG: EndpointParamConfig = {
  endpoint: "/syscollector/{agent_id}/browser_extensions",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,
  },
};

/**
 * GET /syscollector/{agent_id}/users — Local users
 * Spec ref: operationId api.controllers.syscollector_controller.get_users
 */
export const SYSCOLLECTOR_USERS_CONFIG: EndpointParamConfig = {
  endpoint: "/syscollector/{agent_id}/users",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,
  },
};

/**
 * GET /syscollector/{agent_id}/groups — Local groups
 * Spec ref: operationId api.controllers.syscollector_controller.get_groups
 */
export const SYSCOLLECTOR_GROUPS_CONFIG: EndpointParamConfig = {
  endpoint: "/syscollector/{agent_id}/groups",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    q: UNIVERSAL_PARAMS.q,
    distinct: UNIVERSAL_PARAMS.distinct,
  },
};

export const EXP_SYSCOLLECTOR_NETIFACE_CONFIG = deriveExpConfig(
  SYSCOLLECTOR_NETIFACE_CONFIG,
  "/experimental/syscollector/netiface"
);

export const EXP_SYSCOLLECTOR_NETADDR_CONFIG = deriveExpConfig(
  SYSCOLLECTOR_NETADDR_CONFIG,
  "/experimental/syscollector/netaddr"
);

export const EXP_SYSCOLLECTOR_NETPROTO_CONFIG = deriveExpConfig(
  SYSCOLLECTOR_NETPROTO_CONFIG,
  "/experimental/syscollector/netproto"
);

/**
 * GET /experimental/syscollector/os — All OS info (cross-agent)
 * Spec ref: operationId api.controllers.experimental_controller.get_os_info
 */
export const EXP_SYSCOLLECTOR_OS_CONFIG: EndpointParamConfig = {
  endpoint: "/experimental/syscollector/os",
  params: {
    // Universal params (no q/distinct per spec v4.14.3)
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    agents_list: {
      wazuhName: "agents_list",
      description: "List of agent IDs (comma-separated)",
      type: "csv",
    },
    // Endpoint-specific field filters (spec v4.14.3)
    "os.name": {
      wazuhName: "os.name",
      description: "Filter by OS name",
      type: "string",
      aliases: ["osName"],
    },
    "os.version": {
      wazuhName: "os.version",
      description: "Filter by OS version",
      type: "string",
      aliases: ["osVersion"],
    },
    architecture: {
      wazuhName: "architecture",
      description: "Filter by architecture",
      type: "string",
    },
    version: {
      wazuhName: "version",
      description: "Filter by Wazuh agent version",
      type: "string",
    },
    release: {
      wazuhName: "release",
      description: "Filter by OS release",
      type: "string",
    },
    wait_for_complete: {
      type: "boolean",
      wazuhName: "wait_for_complete",
      description: "Wait for cluster synchronization",
    },
  },
};

/**
 * GET /experimental/syscollector/hardware — All hardware info (cross-agent)
 * Spec ref: operationId api.controllers.experimental_controller.get_hardware_info
 */
export const EXP_SYSCOLLECTOR_HARDWARE_CONFIG: EndpointParamConfig = {
  endpoint: "/experimental/syscollector/hardware",
  params: {
    // Universal params (no q/distinct per spec v4.14.3)
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    select: UNIVERSAL_PARAMS.select,
    agents_list: {
      wazuhName: "agents_list",
      description: "List of agent IDs (comma-separated)",
      type: "csv",

      enumValues: ["true", "false"],
    },
    // Endpoint-specific field filters (spec v4.14.3)
    board_serial: {
      wazuhName: "board_serial",
      description: "Filter by board serial number",
      type: "string",
      aliases: ["boardSerial"],
    },
    "cpu.name": {
      wazuhName: "cpu.name",
      description: "Filter by CPU name",
      type: "string",
      aliases: ["cpuName"],
    },
    "cpu.cores": {
      wazuhName: "cpu.cores",
      description: "Filter by number of CPU cores",
      type: "string",
      aliases: ["cpuCores"],
    },
    "cpu.mhz": {
      wazuhName: "cpu.mhz",
      description: "Filter by CPU frequency (MHz)",
      type: "string",
      aliases: ["cpuMhz"],
    },
    "ram.free": {
      wazuhName: "ram.free",
      description: "Filter by free RAM",
      type: "string",
      aliases: ["ramFree"],
    },
    "ram.total": {
      wazuhName: "ram.total",
      description: "Filter by total RAM",
      type: "string",
      aliases: ["ramTotal"],
    },
    wait_for_complete: {
      type: "boolean",
      wazuhName: "wait_for_complete",
      description: "Wait for cluster synchronization",
    },
  },
};

export const EXP_SYSCOLLECTOR_HOTFIXES_CONFIG = deriveExpConfig(
  SYSCOLLECTOR_HOTFIXES_CONFIG,
  "/experimental/syscollector/hotfixes"
);

// ══════════════════════════════════════════════════════════════════════════════
// PROMOTION SPRINT — Manual → Broker wiring (2026-03-10)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /decoders/files/{filename} — Decoder file content
 * Spec ref: operationId api.controllers.decoder_controller.get_file
 * Note: filename is a path param, not forwarded as a query param.
 */
export const DECODER_FILE_CONTENT_CONFIG: EndpointParamConfig = {
  endpoint: "/decoders/files/{filename}",
  params: {
    raw: {
      type: "boolean",

      enumValues: ["true", "false"],
      wazuhName: "raw",
      description: "Return file contents in raw plain text format",
    },
    relative_dirname: {
      type: "string",
      wazuhName: "relative_dirname",
      description: "Filter by relative directory path of the decoder file",
    },
    wait_for_complete: {
      type: "boolean",
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /security/config — Security configuration (token TTL, RBAC mode)
 * Spec ref: operationId api.controllers.security_controller.get_security_config
 */
export const SECURITY_CONFIG_CONFIG: EndpointParamConfig = {
  endpoint: "/security/config",
  params: {
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /security/users/me — Current authenticated user info
 * Spec ref: operationId api.controllers.security_controller.get_user_me
 */
export const SECURITY_CURRENT_USER_CONFIG: EndpointParamConfig = {
  endpoint: "/security/users/me",
  params: {
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/**
 * GET /security/actions — List all RBAC actions
 * Spec ref: operationId api.controllers.security_controller.get_rbac_actions
 */
export const SECURITY_ACTIONS_CONFIG: EndpointParamConfig = {
  endpoint: "/security/actions",
  params: {
    endpoint: {
      type: "string",

      enumValues: ["true", "false"],
      wazuhName: "endpoint",
      description: "Filter actions by API endpoint path",
    },
  },
};


// ══════════════════════════════════════════════════════════════════════════════
// PROMOTION SPRINT — Wire remaining passthrough/manual endpoints to broker
// Spec baseline: Wazuh REST API OpenAPI v4.14.3
// ══════════════════════════════════════════════════════════════════════════════

// ── Manager ──────────────────────────────────────────────────────────────────

/** GET /manager/stats — Manager statistical information */
export const MANAGER_STATS_CONFIG: EndpointParamConfig = {
  endpoint: "/manager/stats",
  params: {
    date: {
      type: "string",
      wazuhName: "date",
      description: "Date to obtain statistical information from. Format YYYY-MM-DD",
    },
    wait_for_complete: {
      type: "boolean",
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /manager/daemons/stats — Manager daemon statistics */
export const MANAGER_DAEMON_STATS_CONFIG: EndpointParamConfig = {
  endpoint: "/manager/daemons/stats",
  params: {
    daemons_list: {
      type: "csv",

      enumValues: ["true", "false"],
      wazuhName: "daemons_list",
      description: "List of daemon names (comma-separated)",
    },
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /manager/version/check — Check available update */
export const MANAGER_VERSION_CHECK_CONFIG: EndpointParamConfig = {
  endpoint: "/manager/version/check",
  params: {
    force_query: {
      type: "boolean",

      enumValues: ["true", "false"],
      wazuhName: "force_query",
      description: "Force query to CTI service",
    },
  },
};

/** GET /manager/configuration/{component}/{configuration} — Manager component config */
export const MANAGER_COMPONENT_CONFIG_CONFIG: EndpointParamConfig = {
  endpoint: "/manager/configuration/{component}/{configuration}",
  params: {
    wait_for_complete: {
      type: "boolean",
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

// ── Cluster ──────────────────────────────────────────────────────────────────

/** GET /cluster/configuration/validation — Cluster config validation */
export const CLUSTER_CONFIG_VALIDATION_CONFIG: EndpointParamConfig = {
  endpoint: "/cluster/configuration/validation",
  params: {
    nodes_list: {
      type: "csv",

      enumValues: ["true", "false"],
      wazuhName: "nodes_list",
      description: "List of node IDs (comma-separated)",
    },
    wait_for_complete: {
      type: "boolean",
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /cluster/healthcheck — Cluster healthcheck */
export const CLUSTER_HEALTHCHECK_CONFIG: EndpointParamConfig = {
  endpoint: "/cluster/healthcheck",
  params: {
    nodes_list: {
      type: "csv",

      enumValues: ["true", "false"],
      wazuhName: "nodes_list",
      description: "List of node IDs (comma-separated)",
    },
    wait_for_complete: {
      type: "boolean",
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /cluster/ruleset/synchronization — Cluster ruleset sync status */
export const CLUSTER_RULESET_SYNC_CONFIG: EndpointParamConfig = {
  endpoint: "/cluster/ruleset/synchronization",
  params: {
    nodes_list: {
      type: "csv",

      enumValues: ["true", "false"],
      wazuhName: "nodes_list",
      description: "List of node IDs (comma-separated)",
    },
    wait_for_complete: {
      type: "boolean",
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /cluster/api/config — Cluster API configuration */
export const CLUSTER_API_CONFIG_CONFIG: EndpointParamConfig = {
  endpoint: "/cluster/api/config",
  params: {
    nodes_list: {
      type: "csv",

      enumValues: ["true", "false"],
      wazuhName: "nodes_list",
      description: "List of node IDs (comma-separated)",
    },
    wait_for_complete: {
      type: "boolean",
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /cluster/{node_id}/info — Cluster node info */
export const CLUSTER_NODE_INFO_CONFIG: EndpointParamConfig = {
  endpoint: "/cluster/{node_id}/info",
  params: {
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /cluster/{node_id}/stats — Cluster node stats */
export const CLUSTER_NODE_STATS_CONFIG: EndpointParamConfig = {
  endpoint: "/cluster/{node_id}/stats",
  params: {
    date: {
      type: "string",

      enumValues: ["true", "false"],
      wazuhName: "date",
      description: "Date to obtain statistical information from. Format YYYY-MM-DD",
    },
    wait_for_complete: {
      type: "boolean",
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /cluster/{node_id}/stats/hourly — Cluster node hourly stats */
export const CLUSTER_NODE_STATS_HOURLY_CONFIG: EndpointParamConfig = {
  endpoint: "/cluster/{node_id}/stats/hourly",
  params: {
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /cluster/{node_id}/status — Cluster node status */
export const CLUSTER_NODE_STATUS_CONFIG: EndpointParamConfig = {
  endpoint: "/cluster/{node_id}/status",
  params: {
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /cluster/{node_id}/configuration/{component}/{configuration} — Cluster node component config */
export const CLUSTER_NODE_COMPONENT_CONFIG_CONFIG: EndpointParamConfig = {
  endpoint: "/cluster/{node_id}/configuration/{component}/{configuration}",
  params: {
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /cluster/{node_id}/daemons/stats — Cluster node daemon stats */
export const CLUSTER_NODE_DAEMON_STATS_CONFIG: EndpointParamConfig = {
  endpoint: "/cluster/{node_id}/daemons/stats",
  params: {
    daemons_list: {
      type: "csv",

      enumValues: ["true", "false"],
      wazuhName: "daemons_list",
      description: "List of daemon names (comma-separated)",
    },
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /cluster/{node_id}/logs/summary — Cluster node logs summary */
export const CLUSTER_NODE_LOGS_SUMMARY_CONFIG: EndpointParamConfig = {
  endpoint: "/cluster/{node_id}/logs/summary",
  params: {
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /cluster/{node_id}/stats/analysisd — Cluster node analysisd stats */
export const CLUSTER_NODE_STATS_ANALYSISD_CONFIG: EndpointParamConfig = {
  endpoint: "/cluster/{node_id}/stats/analysisd",
  params: {
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /cluster/{node_id}/stats/remoted — Cluster node remoted stats */
export const CLUSTER_NODE_STATS_REMOTED_CONFIG: EndpointParamConfig = {
  endpoint: "/cluster/{node_id}/stats/remoted",
  params: {
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /cluster/{node_id}/stats/weekly — Cluster node weekly stats */
export const CLUSTER_NODE_STATS_WEEKLY_CONFIG: EndpointParamConfig = {
  endpoint: "/cluster/{node_id}/stats/weekly",
  params: {
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

// ── Agents ───────────────────────────────────────────────────────────────────

/** GET /agents/summary — Agent summary with agent list filter */
export const AGENTS_SUMMARY_CONFIG: EndpointParamConfig = {
  endpoint: "/agents/summary",
  params: {
    agents_list: {
      type: "csv",

      enumValues: ["true", "false"],
      wazuhName: "agents_list",
      description: "List of agent IDs (comma-separated)",
    },
    wait_for_complete: {
      type: "boolean",
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /agents/{agent_id} — Agent by ID (path param only, no query params in spec) */
export const AGENT_BY_ID_CONFIG: EndpointParamConfig = {
  endpoint: "/agents/{agent_id}",
  params: {
    select: UNIVERSAL_PARAMS.select,
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /agents/{agent_id}/daemons/stats — Agent daemon stats */
export const AGENT_DAEMON_STATS_CONFIG: EndpointParamConfig = {
  endpoint: "/agents/{agent_id}/daemons/stats",
  params: {
    daemons_list: {
      type: "csv",

      enumValues: ["true", "false"],
      wazuhName: "daemons_list",
      description: "List of daemon names (comma-separated)",
    },
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /agents/{agent_id}/stats/{component} — Agent component stats */
export const AGENT_STATS_CONFIG: EndpointParamConfig = {
  endpoint: "/agents/{agent_id}/stats/{component}",
  params: {
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /agents/{agent_id}/config/{component}/{configuration} — Agent component config */
export const AGENT_CONFIG_CONFIG: EndpointParamConfig = {
  endpoint: "/agents/{agent_id}/config/{component}/{configuration}",
  params: {
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /agents/upgrade_result — Agent upgrade results */
export const AGENTS_UPGRADE_RESULT_CONFIG: EndpointParamConfig = {
  endpoint: "/agents/upgrade_result",
  params: {
    agents_list: {
      type: "csv",

      enumValues: ["true", "false"],
      wazuhName: "agents_list",
      description: "List of agent IDs (comma-separated)",
    },
    q: UNIVERSAL_PARAMS.q,
    "os.platform": {
      type: "string",
      wazuhName: "os.platform",
      description: "Filter by OS platform",
    },
    "os.version": {
      type: "string",
      wazuhName: "os.version",
      description: "Filter by OS version",
    },
    "os.name": {
      type: "string",
      wazuhName: "os.name",
      description: "Filter by OS name",
    },
    manager: {
      type: "string",
      wazuhName: "manager",
      description: "Filter by manager hostname",
    },
    version: {
      type: "string",
      wazuhName: "version",
      description: "Filter by agent version",
    },
    group: {
      type: "string",
      wazuhName: "group",
      description: "Filter by agent group",
    },
    node_name: {
      type: "string",
      wazuhName: "node_name",
      description: "Filter by node name",
    },
    name: {
      type: "string",
      wazuhName: "name",
      description: "Filter by agent name",
    },
    ip: {
      type: "string",
      wazuhName: "ip",
      description: "Filter by agent IP",
    },
    registerIP: {
      type: "string",
      wazuhName: "registerIP",
      description: "Filter by registration IP",
    },
    wait_for_complete: {
      type: "boolean",
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /agents/{agent_id}/group/is_sync — Agent group sync status */
export const AGENT_GROUP_SYNC_CONFIG: EndpointParamConfig = {
  endpoint: "/agents/{agent_id}/group/is_sync",
  params: {
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

// ── Rules ────────────────────────────────────────────────────────────────────

/** GET /rules/groups — Rule groups */
export const RULE_GROUPS_CONFIG: EndpointParamConfig = {
  endpoint: "/rules/groups",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /rules/requirement/{requirement} — Rules by requirement */
export const RULES_BY_REQUIREMENT_CONFIG: EndpointParamConfig = {
  endpoint: "/rules/requirement/{requirement}",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    sort: UNIVERSAL_PARAMS.sort,
    search: UNIVERSAL_PARAMS.search,
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /rules/files/{filename} — Rule file content */
export const RULE_FILE_CONTENT_CONFIG: EndpointParamConfig = {
  endpoint: "/rules/files/{filename}",
  params: {
    raw: {
      type: "boolean",

      enumValues: ["true", "false"],
      wazuhName: "raw",
      description: "Format response in plain text",
    },
    relative_dirname: {
      type: "string",
      wazuhName: "relative_dirname",
      description: "Filter by relative directory name",
      aliases: ["relativeDirname"],
    },
    wait_for_complete: {
      type: "boolean",
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

// ── Syscheck / Rootcheck ─────────────────────────────────────────────────────

/** GET /syscheck/{agent_id}/last_scan — Syscheck last scan */
export const SYSCHECK_LAST_SCAN_CONFIG: EndpointParamConfig = {
  endpoint: "/syscheck/{agent_id}/last_scan",
  params: {
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /rootcheck/{agent_id}/last_scan — Rootcheck last scan */
export const ROOTCHECK_LAST_SCAN_CONFIG: EndpointParamConfig = {
  endpoint: "/rootcheck/{agent_id}/last_scan",
  params: {
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /security/resources — RBAC resources */
export const SECURITY_RESOURCES_CONFIG: EndpointParamConfig = {
  endpoint: "/security/resources",
  params: {
    resource: {
      type: "string",

      enumValues: ["true", "false"],
      wazuhName: "resource",
      description: "List of current RBAC resources",
    },
  },
};

// ── Lists ────────────────────────────────────────────────────────────────────

/** GET /lists/files/{filename} — CDB list file content */
export const LISTS_FILE_CONTENT_CONFIG: EndpointParamConfig = {
  endpoint: "/lists/files/{filename}",
  params: {
    raw: {
      type: "boolean",

      enumValues: ["*:*", "agent:group", "agent:id", "group:id", "node:id", "decoder:file", "list:file", "rule:file", "policy:id", "role:id", "user:id"],
      wazuhName: "raw",
      description: "Format response in plain text",
    },
    wait_for_complete: {
      type: "boolean",
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

// ── Groups ────────────────────────────────────────────────────────────────────

/** GET /groups/{group_id}/configuration — Group configuration */
export const GROUP_CONFIGURATION_CONFIG: EndpointParamConfig = {
  endpoint: "/groups/{group_id}/configuration",
  params: {
    offset: UNIVERSAL_PARAMS.offset,
    limit: UNIVERSAL_PARAMS.limit,
    wait_for_complete: {
      type: "boolean",

      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};

/** GET /groups/{group_id}/files/{file_name} — Group file content */
export const GROUP_FILE_CONTENT_CONFIG: EndpointParamConfig = {
  endpoint: "/groups/{group_id}/files/{file_name}",
  params: {
    type: {
      type: "string",

      enumValues: ["true", "false"],
      wazuhName: "type",
      description: "Type of file (conf, rootkit_files, rootkit_trojans, rcl)",
    },
    raw: {
      type: "boolean",

      enumValues: ["file", "registry_key", "registry_value"],
      wazuhName: "raw",
      description: "Format response in plain text",
    },
    wait_for_complete: {
      type: "boolean",
      wazuhName: "wait_for_complete",
      description: "Disable timeout response (cluster sync wait)",
    },
  },
};


// ── Final passthrough → broker promotion (wait_for_complete only) ────────────

/** Shared single-param config for endpoints that only accept wait_for_complete */
const WAIT_FOR_COMPLETE_ONLY: EndpointParamConfig["params"] = {
  wait_for_complete: {
    type: "boolean",

    wazuhName: "wait_for_complete",
    description: "Disable timeout response (cluster sync wait)",
  },
};

/** GET /manager/status */
export const MANAGER_STATUS_CONFIG: EndpointParamConfig = {
  endpoint: "/manager/status",
  params: { ...WAIT_FOR_COMPLETE_ONLY },
};

/** GET /manager/info */
export const MANAGER_INFO_CONFIG: EndpointParamConfig = {
  endpoint: "/manager/info",
  params: { ...WAIT_FOR_COMPLETE_ONLY },
};

/** GET /manager/configuration/validation */
export const MANAGER_CONFIG_VALIDATION_CONFIG: EndpointParamConfig = {
  endpoint: "/manager/configuration/validation",
  params: { ...WAIT_FOR_COMPLETE_ONLY },
};

/** GET /manager/stats/hourly */
export const MANAGER_STATS_HOURLY_CONFIG: EndpointParamConfig = {
  endpoint: "/manager/stats/hourly",
  params: { ...WAIT_FOR_COMPLETE_ONLY },
};

/** GET /manager/stats/weekly */
export const MANAGER_STATS_WEEKLY_CONFIG: EndpointParamConfig = {
  endpoint: "/manager/stats/weekly",
  params: { ...WAIT_FOR_COMPLETE_ONLY },
};

/** GET /manager/stats/analysisd */
export const MANAGER_STATS_ANALYSISD_CONFIG: EndpointParamConfig = {
  endpoint: "/manager/stats/analysisd",
  params: { ...WAIT_FOR_COMPLETE_ONLY },
};

/** GET /manager/stats/remoted */
export const MANAGER_STATS_REMOTED_CONFIG: EndpointParamConfig = {
  endpoint: "/manager/stats/remoted",
  params: { ...WAIT_FOR_COMPLETE_ONLY },
};

/** GET /manager/logs/summary */
export const MANAGER_LOGS_SUMMARY_CONFIG: EndpointParamConfig = {
  endpoint: "/manager/logs/summary",
  params: { ...WAIT_FOR_COMPLETE_ONLY },
};

/** GET /manager/api/config */
export const MANAGER_API_CONFIG_CONFIG: EndpointParamConfig = {
  endpoint: "/manager/api/config",
  params: { ...WAIT_FOR_COMPLETE_ONLY },
};

/** GET /cluster/status */
export const CLUSTER_STATUS_CONFIG: EndpointParamConfig = {
  endpoint: "/cluster/status",
  params: { ...WAIT_FOR_COMPLETE_ONLY },
};

/** GET /cluster/local/info */
export const CLUSTER_LOCAL_INFO_CONFIG: EndpointParamConfig = {
  endpoint: "/cluster/local/info",
  params: { ...WAIT_FOR_COMPLETE_ONLY },
};

/** GET /cluster/local/config */
export const CLUSTER_LOCAL_CONFIG_CONFIG: EndpointParamConfig = {
  endpoint: "/cluster/local/config",
  params: { ...WAIT_FOR_COMPLETE_ONLY },
};

/** GET /agents/summary/status */
export const AGENT_SUMMARY_STATUS_CONFIG: EndpointParamConfig = {
  endpoint: "/agents/summary/status",
  params: { ...WAIT_FOR_COMPLETE_ONLY },
};

/** GET /agents/summary/os */
export const AGENT_SUMMARY_OS_CONFIG: EndpointParamConfig = {
  endpoint: "/agents/summary/os",
  params: { ...WAIT_FOR_COMPLETE_ONLY },
};

/** GET /overview/agents */
export const AGENT_OVERVIEW_CONFIG: EndpointParamConfig = {
  endpoint: "/overview/agents",
  params: { ...WAIT_FOR_COMPLETE_ONLY },
};

/** GET /mitre/metadata */
export const MITRE_METADATA_CONFIG: EndpointParamConfig = {
  endpoint: "/mitre/metadata",
  params: { ...WAIT_FOR_COMPLETE_ONLY },
};


/** GET / — Wazuh API info (no meaningful query params) */
export const API_INFO_CONFIG: EndpointParamConfig = {
  endpoint: "/",
  params: {},
};

/** GET /security/users/me/policies — Current user RBAC policies (no meaningful query params) */
export const SECURITY_CURRENT_USER_POLICIES_CONFIG: EndpointParamConfig = {
  endpoint: "/security/users/me/policies",
  params: {},
};
