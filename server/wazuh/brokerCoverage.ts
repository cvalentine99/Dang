/**
 * Broker Coverage Analysis — Static analysis of the Wazuh API surface
 *
 * Computes coverage metrics by comparing:
 *   - Broker-wired endpoints (full param validation via paramBroker)
 *   - Manual-param endpoints (inline Zod schemas, no broker)
 *   - Simple passthrough endpoints (no query params, just path forwarding)
 *
 * This is a read-only, forensic-grade analysis — no mutations, no side effects.
 */

import * as broker from "./paramBroker";
import { readFileSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Types ────────────────────────────────────────────────────────────────────

export type WiringLevel = "broker" | "manual" | "passthrough";

export interface ParityCallsite {
  file: string;
  line: number;
  passedKeys: Record<string, string>;
}

export interface EndpointCoverage {
  /** tRPC procedure name */
  procedure: string;
  /** Wazuh API path pattern */
  wazuhPath: string;
  /** HTTP method (always GET for read-only) */
  method: "GET";
  /** How the endpoint is wired */
  wiringLevel: WiringLevel;
  /** Broker config name if broker-wired */
  brokerConfig?: string;
  /** Number of params supported */
  paramCount: number;
  /** Category grouping */
  category: string;
  /** Frontend callsites from wiring ledger */
  callsites: string[];
  /** Parity info: which params each callsite sends */
  parityCallsites: ParityCallsite[];
}

export interface BrokerConfigSummary {
  /** Config export name */
  name: string;
  /** Wazuh endpoint path */
  endpoint: string;
  /** Total params in config */
  totalParams: number;
  /** Universal params included */
  universalParams: string[];
  /** Endpoint-specific params */
  specificParams: string[];
}

export interface EnrichmentMeta {
  /** Whether the wiring ledger JSON was loaded successfully */
  wiringLedgerLoaded: boolean;
  /** Whether the parity artifact JSON was loaded successfully */
  parityArtifactLoaded: boolean;
  /** Generation timestamp from the wiring ledger artifact (if available) */
  wiringLedgerGeneratedAt?: string;
  /** Generation timestamp from the parity artifact (if available) */
  parityArtifactGeneratedAt?: string;
  /** mtime of wazuhRouter.ts — the primary source artifacts derive from */
  sourceLastModified?: string;
  /** true when wiring ledger artifact file is older than the source file */
  wiringLedgerStale?: boolean;
  /** true when parity artifact file is older than the source file */
  parityArtifactStale?: boolean;
}

export interface CoverageReport {
  /** Timestamp of analysis */
  analyzedAt: string;
  /** Wazuh API spec version */
  specVersion: string;
  /** Total procedures in router */
  totalProcedures: number;
  /** Broker-wired count — procedures that call brokerParams() at runtime */
  brokerWired: number;
  /** Manual-param count — procedures with 2+ params using inline handling */
  manualParam: number;
  /** Simple passthrough count — 0-1 params, direct proxyGet forwarding */
  passthrough: number;
  /**
   * Broker validation coverage: brokerWired / total.
   * This measures how many procedures use the param broker for validated,
   * coerced, safety-checked parameter forwarding. It does NOT measure
   * whether a tRPC endpoint exists (that is endpointCoverage).
   */
  brokerCoveragePercent: number;
  /** Coverage percentage ((broker + manual) / total) — all param-aware procedures */
  paramCoveragePercent: number;
  /**
   * Endpoint coverage: total procedures with tRPC endpoints / total procedures.
   * Should be 100% — every entry in the registry has a corresponding tRPC procedure.
   * This distinguishes "we have a route" from "the route uses brokerParams()".
   */
  endpointCoverage: string;
  /** Total broker configs */
  totalBrokerConfigs: number;
  /** Total params across all broker configs */
  totalBrokerParams: number;
  /** Per-endpoint coverage details */
  endpoints: EndpointCoverage[];
  /** Per-broker-config summaries */
  brokerConfigs: BrokerConfigSummary[];
  /** Category breakdown */
  categories: CategoryBreakdown[];
  /** Enrichment artifact availability */
  enrichment: EnrichmentMeta;
}

export interface CategoryBreakdown {
  category: string;
  total: number;
  brokerWired: number;
  manualParam: number;
  passthrough: number;
  coveragePercent: number;
}

// ── Static Endpoint Registry ─────────────────────────────────────────────────
// This is the single source of truth for all wazuhRouter procedures.
// Each entry maps a tRPC procedure name to its Wazuh API path, wiring level,
// and optional broker config reference.
//
// CLASSIFICATION CRITERIA (verified against wazuhRouter.ts runtime code):
//
//   "broker"      — The procedure calls brokerParams() at runtime. All query
//                   parameters are validated, coerced, and filtered through the
//                   param broker. This is the gold standard for param safety.
//
//   "manual"      — The procedure has 2+ query parameters but builds the param
//                   object inline (manual if/then assembly). Zod validates input
//                   shape, but there is no broker-level coercion, no unsupported-
//                   param rejection, and no _brokerWarnings attachment.
//
//   "passthrough" — The procedure forwards 0-1 query params (typically just a
//                   path segment like agentId or nodeId). No query-string
//                   construction needed; the call is a direct proxyGet() with
//                   at most one filter param (e.g. user_ids=X).
//
// To verify a classification, search for the procedure name in wazuhRouter.ts
// and check whether the query handler calls brokerParams().

const ENDPOINT_REGISTRY: Array<{
  procedure: string;
  wazuhPath: string;
  wiringLevel: WiringLevel;
  brokerConfig?: string;
  paramCount: number;
  category: string;
}> = [
  // ── Manager ──
  { procedure: "status", wazuhPath: "/manager/status", wiringLevel: "passthrough", paramCount: 0, category: "Manager" },
  { procedure: "isConfigured", wazuhPath: "N/A (config check)", wiringLevel: "passthrough", paramCount: 0, category: "Manager" },
  { procedure: "managerInfo", wazuhPath: "/manager/info", wiringLevel: "passthrough", paramCount: 0, category: "Manager" },
  { procedure: "managerStatus", wazuhPath: "/manager/status", wiringLevel: "passthrough", paramCount: 0, category: "Manager" },
  { procedure: "managerConfiguration", wazuhPath: "/manager/configuration", wiringLevel: "broker", brokerConfig: "MANAGER_CONFIG", paramCount: 4, category: "Manager" },
  { procedure: "managerConfigValidation", wazuhPath: "/manager/configuration/validation", wiringLevel: "passthrough", paramCount: 0, category: "Manager" },
  { procedure: "clusterConfigValidation", wazuhPath: "/cluster/configuration/validation", wiringLevel: "passthrough", paramCount: 0, category: "Cluster" },
  { procedure: "managerStats", wazuhPath: "/manager/stats", wiringLevel: "broker", brokerConfig: "MANAGER_STATS_CONFIG", paramCount: 2, category: "Manager" },
  { procedure: "statsHourly", wazuhPath: "/manager/stats/hourly", wiringLevel: "passthrough", paramCount: 0, category: "Manager" },
  { procedure: "statsWeekly", wazuhPath: "/manager/stats/weekly", wiringLevel: "passthrough", paramCount: 0, category: "Manager" },
  { procedure: "analysisd", wazuhPath: "/manager/stats/analysisd", wiringLevel: "passthrough", paramCount: 0, category: "Manager" },
  { procedure: "remoted", wazuhPath: "/manager/stats/remoted", wiringLevel: "passthrough", paramCount: 0, category: "Manager" },
  { procedure: "daemonStats", wazuhPath: "/manager/daemons/stats", wiringLevel: "manual", paramCount: 2, category: "Manager" },
  { procedure: "managerLogs", wazuhPath: "/manager/logs", wiringLevel: "broker", brokerConfig: "MANAGER_LOGS_CONFIG", paramCount: 9, category: "Manager" },
  { procedure: "managerLogsSummary", wazuhPath: "/manager/logs/summary", wiringLevel: "passthrough", paramCount: 0, category: "Manager" },
  { procedure: "managerVersionCheck", wazuhPath: "/manager/version/check", wiringLevel: "broker", brokerConfig: "MANAGER_VERSION_CHECK_CONFIG", paramCount: 1, category: "Manager" },
  { procedure: "managerComponentConfig", wazuhPath: "/manager/configuration/{component}/{configuration}", wiringLevel: "passthrough", paramCount: 1, category: "Manager" },
  { procedure: "managerApiConfig", wazuhPath: "/manager/api/config", wiringLevel: "passthrough", paramCount: 0, category: "Manager" },

  // ── Cluster ──
  { procedure: "clusterStatus", wazuhPath: "/cluster/status", wiringLevel: "passthrough", paramCount: 0, category: "Cluster" },
  { procedure: "clusterNodes", wazuhPath: "/cluster/nodes", wiringLevel: "broker", brokerConfig: "CLUSTER_NODES_CONFIG", paramCount: 9, category: "Cluster" },
  { procedure: "clusterHealthcheck", wazuhPath: "/cluster/healthcheck", wiringLevel: "broker", brokerConfig: "CLUSTER_HEALTHCHECK_CONFIG", paramCount: 2, category: "Cluster" },
  { procedure: "clusterLocalInfo", wazuhPath: "/cluster/local/info", wiringLevel: "passthrough", paramCount: 0, category: "Cluster" },
  { procedure: "clusterLocalConfig", wazuhPath: "/cluster/local/config", wiringLevel: "passthrough", paramCount: 0, category: "Cluster" },
  { procedure: "clusterRulesetSync", wazuhPath: "/cluster/ruleset/synchronization", wiringLevel: "passthrough", paramCount: 0, category: "Cluster" },
  { procedure: "clusterApiConfig", wazuhPath: "/cluster/api/config", wiringLevel: "passthrough", paramCount: 0, category: "Cluster" },
  { procedure: "clusterNodeInfo", wazuhPath: "/cluster/{node_id}/info", wiringLevel: "passthrough", paramCount: 1, category: "Cluster" },
  { procedure: "clusterNodeStats", wazuhPath: "/cluster/{node_id}/stats", wiringLevel: "broker", brokerConfig: "CLUSTER_NODE_STATS_CONFIG", paramCount: 2, category: "Cluster" },
  { procedure: "clusterNodeStatsHourly", wazuhPath: "/cluster/{node_id}/stats/hourly", wiringLevel: "passthrough", paramCount: 1, category: "Cluster" },
  { procedure: "clusterNodeStatus", wazuhPath: "/cluster/{node_id}/status", wiringLevel: "passthrough", paramCount: 1, category: "Cluster" },
  { procedure: "clusterNodeConfiguration", wazuhPath: "/cluster/{node_id}/configuration", wiringLevel: "broker", brokerConfig: "CLUSTER_NODE_CONFIGURATION_CONFIG", paramCount: 4, category: "Cluster" },
  { procedure: "clusterNodeComponentConfig", wazuhPath: "/cluster/{node_id}/configuration/{component}/{configuration}", wiringLevel: "passthrough", paramCount: 1, category: "Cluster" },
  { procedure: "clusterNodeDaemonStats", wazuhPath: "/cluster/{node_id}/daemons/stats", wiringLevel: "broker", brokerConfig: "CLUSTER_NODE_DAEMON_STATS_CONFIG", paramCount: 2, category: "Cluster" },
  { procedure: "clusterNodeLogs", wazuhPath: "/cluster/{node_id}/logs", wiringLevel: "broker", brokerConfig: "CLUSTER_NODE_LOGS_CONFIG", paramCount: 10, category: "Cluster" },
  { procedure: "clusterNodeLogsSummary", wazuhPath: "/cluster/{node_id}/logs/summary", wiringLevel: "passthrough", paramCount: 1, category: "Cluster" },
  { procedure: "clusterNodeStatsAnalysisd", wazuhPath: "/cluster/{node_id}/stats/analysisd", wiringLevel: "passthrough", paramCount: 1, category: "Cluster" },
  { procedure: "clusterNodeStatsRemoted", wazuhPath: "/cluster/{node_id}/stats/remoted", wiringLevel: "passthrough", paramCount: 1, category: "Cluster" },
  { procedure: "clusterNodeStatsWeekly", wazuhPath: "/cluster/{node_id}/stats/weekly", wiringLevel: "passthrough", paramCount: 1, category: "Cluster" },

  // ── Agents ──
  { procedure: "agents", wazuhPath: "/agents", wiringLevel: "broker", brokerConfig: "AGENTS_CONFIG", paramCount: 21, category: "Agents" },  // spec: 21 data params
  { procedure: "agentSummaryStatus", wazuhPath: "/agents/summary/status", wiringLevel: "passthrough", paramCount: 0, category: "Agents" },
  { procedure: "agentSummaryOs", wazuhPath: "/agents/summary/os", wiringLevel: "passthrough", paramCount: 0, category: "Agents" },
  { procedure: "agentsSummary", wazuhPath: "/agents/summary", wiringLevel: "broker", brokerConfig: "AGENTS_SUMMARY_CONFIG", paramCount: 2, category: "Agents" },
  { procedure: "agentOverview", wazuhPath: "/overview/agents", wiringLevel: "passthrough", paramCount: 0, category: "Agents" },
  { procedure: "agentById", wazuhPath: "/agents/{agent_id}", wiringLevel: "passthrough", paramCount: 1, category: "Agents" },
  { procedure: "agentDaemonStats", wazuhPath: "/agents/{agent_id}/daemons/stats", wiringLevel: "broker", brokerConfig: "AGENT_DAEMON_STATS_CONFIG", paramCount: 2, category: "Agents" },
  { procedure: "agentStats", wazuhPath: "/agents/{agent_id}/stats/{component}", wiringLevel: "passthrough", paramCount: 1, category: "Agents" },
  { procedure: "agentConfig", wazuhPath: "/agents/{agent_id}/config/{component}/{configuration}", wiringLevel: "passthrough", paramCount: 1, category: "Agents" },
  { procedure: "agentsUpgradeResult", wazuhPath: "/agents/upgrade_result", wiringLevel: "manual", paramCount: 13, category: "Agents" },
  { procedure: "agentsUninstallPermission", wazuhPath: "N/A (permission check)", wiringLevel: "passthrough", paramCount: 0, category: "Agents" },
  { procedure: "agentGroupSync", wazuhPath: "/agents/{agent_id}/group/is_sync", wiringLevel: "passthrough", paramCount: 1, category: "Agents" },
  { procedure: "apiInfo", wazuhPath: "/", wiringLevel: "passthrough", paramCount: 0, category: "Agents" },
  { procedure: "agentGroups", wazuhPath: "/groups", wiringLevel: "broker", brokerConfig: "GROUPS_CONFIG", paramCount: 9, category: "Agents" },
  { procedure: "agentsOutdated", wazuhPath: "/agents/outdated", wiringLevel: "broker", brokerConfig: "AGENTS_OUTDATED_CONFIG", paramCount: 6, category: "Agents" },
  { procedure: "agentsNoGroup", wazuhPath: "/agents/no_group", wiringLevel: "broker", brokerConfig: "AGENTS_NO_GROUP_CONFIG", paramCount: 6, category: "Agents" },
  { procedure: "agentsStatsDistinct", wazuhPath: "/agents/stats/distinct", wiringLevel: "broker", brokerConfig: "AGENTS_STATS_DISTINCT_CONFIG", paramCount: 6, category: "Agents" },
  { procedure: "agentGroupMembers", wazuhPath: "/groups/{group_id}/agents", wiringLevel: "broker", brokerConfig: "GROUP_AGENTS_CONFIG", paramCount: 8, category: "Agents" },

  // ── Syscollector (per-agent) ──
  { procedure: "agentOs", wazuhPath: "/syscollector/{agent_id}/os", wiringLevel: "broker", brokerConfig: "SYSCOLLECTOR_OS_CONFIG", paramCount: 2, category: "Syscollector" },
  { procedure: "agentHardware", wazuhPath: "/syscollector/{agent_id}/hardware", wiringLevel: "broker", brokerConfig: "SYSCOLLECTOR_HARDWARE_CONFIG", paramCount: 2, category: "Syscollector" },
  { procedure: "agentPackages", wazuhPath: "/syscollector/{agent_id}/packages", wiringLevel: "broker", brokerConfig: "SYSCOLLECTOR_PACKAGES_CONFIG", paramCount: 12, category: "Syscollector" },
  { procedure: "agentPorts", wazuhPath: "/syscollector/{agent_id}/ports", wiringLevel: "broker", brokerConfig: "SYSCOLLECTOR_PORTS_CONFIG", paramCount: 15, category: "Syscollector" },
  { procedure: "agentProcesses", wazuhPath: "/syscollector/{agent_id}/processes", wiringLevel: "broker", brokerConfig: "SYSCOLLECTOR_PROCESSES_CONFIG", paramCount: 21, category: "Syscollector" },
  { procedure: "agentNetaddr", wazuhPath: "/syscollector/{agent_id}/netaddr", wiringLevel: "broker", brokerConfig: "SYSCOLLECTOR_NETADDR_CONFIG", paramCount: 12, category: "Syscollector" },
  { procedure: "agentNetiface", wazuhPath: "/syscollector/{agent_id}/netiface", wiringLevel: "broker", brokerConfig: "SYSCOLLECTOR_NETIFACE_CONFIG", paramCount: 21, category: "Syscollector" },
  { procedure: "agentHotfixes", wazuhPath: "/syscollector/{agent_id}/hotfixes", wiringLevel: "broker", brokerConfig: "SYSCOLLECTOR_HOTFIXES_CONFIG", paramCount: 8, category: "Syscollector" },
  { procedure: "agentBrowserExtensions", wazuhPath: "/syscollector/{agent_id}/browser_extensions", wiringLevel: "broker", brokerConfig: "SYSCOLLECTOR_BROWSER_EXTENSIONS_CONFIG", paramCount: 8, category: "Syscollector" },
  { procedure: "agentServices", wazuhPath: "/syscollector/{agent_id}/services", wiringLevel: "broker", brokerConfig: "SYSCOLLECTOR_SERVICES_CONFIG", paramCount: 7, category: "Syscollector" },
  { procedure: "agentUsers", wazuhPath: "/syscollector/{agent_id}/users", wiringLevel: "broker", brokerConfig: "SYSCOLLECTOR_USERS_CONFIG", paramCount: 8, category: "Syscollector" },
  { procedure: "agentGroups2", wazuhPath: "/syscollector/{agent_id}/groups", wiringLevel: "broker", brokerConfig: "SYSCOLLECTOR_GROUPS_CONFIG", paramCount: 8, category: "Syscollector" },
  { procedure: "agentNetproto", wazuhPath: "/syscollector/{agent_id}/netproto", wiringLevel: "broker", brokerConfig: "SYSCOLLECTOR_NETPROTO_CONFIG", paramCount: 11, category: "Syscollector" },
  { procedure: "groupFiles", wazuhPath: "/groups/{group_id}/files", wiringLevel: "broker", brokerConfig: "GROUP_FILES_CONFIG", paramCount: 8, category: "Syscollector" },

  // ── Experimental Syscollector (cross-agent) ──
  { procedure: "expSyscollectorPackages", wazuhPath: "/experimental/syscollector/packages", wiringLevel: "broker", brokerConfig: "EXP_SYSCOLLECTOR_PACKAGES_CONFIG", paramCount: 12, category: "Experimental" },  // spec: 12 data (derived + wait_for_complete)
  { procedure: "expSyscollectorProcesses", wazuhPath: "/experimental/syscollector/processes", wiringLevel: "broker", brokerConfig: "EXP_SYSCOLLECTOR_PROCESSES_CONFIG", paramCount: 21, category: "Experimental" },  // spec: 21 data (derived + wait_for_complete)
  { procedure: "expSyscollectorPorts", wazuhPath: "/experimental/syscollector/ports", wiringLevel: "broker", brokerConfig: "EXP_SYSCOLLECTOR_PORTS_CONFIG", paramCount: 15, category: "Experimental" },  // spec: 15 data (derived + wait_for_complete)
  { procedure: "expSyscollectorNetaddr", wazuhPath: "/experimental/syscollector/netaddr", wiringLevel: "broker", brokerConfig: "EXP_SYSCOLLECTOR_NETADDR_CONFIG", paramCount: 12, category: "Experimental" },  // spec: 11+iface (derived + wait_for_complete)
  { procedure: "expSyscollectorNetiface", wazuhPath: "/experimental/syscollector/netiface", wiringLevel: "broker", brokerConfig: "EXP_SYSCOLLECTOR_NETIFACE_CONFIG", paramCount: 21, category: "Experimental" },  // spec: 20 data (derived + wait_for_complete)
  { procedure: "expSyscollectorNetproto", wazuhPath: "/experimental/syscollector/netproto", wiringLevel: "broker", brokerConfig: "EXP_SYSCOLLECTOR_NETPROTO_CONFIG", paramCount: 11, category: "Experimental" },  // spec: 11 data (derived + wait_for_complete)
  { procedure: "expSyscollectorOs", wazuhPath: "/experimental/syscollector/os", wiringLevel: "broker", brokerConfig: "EXP_SYSCOLLECTOR_OS_CONFIG", paramCount: 12, category: "Experimental" },  // spec: 12 data (manual + wait_for_complete)
  { procedure: "expSyscollectorHardware", wazuhPath: "/experimental/syscollector/hardware", wiringLevel: "broker", brokerConfig: "EXP_SYSCOLLECTOR_HARDWARE_CONFIG", paramCount: 13, category: "Experimental" },  // spec: 13 data (manual + wait_for_complete)
  { procedure: "expSyscollectorHotfixes", wazuhPath: "/experimental/syscollector/hotfixes", wiringLevel: "broker", brokerConfig: "EXP_SYSCOLLECTOR_HOTFIXES_CONFIG", paramCount: 8, category: "Experimental" },  // spec: 8 data (derived + wait_for_complete)
  { procedure: "expCiscatResults", wazuhPath: "/experimental/ciscat/results", wiringLevel: "broker", brokerConfig: "EXPERIMENTAL_CISCAT_RESULTS_CONFIG", paramCount: 14, category: "Experimental" },  // spec: 14 data (no q/distinct)

  // ── Rules ──
  { procedure: "rules", wazuhPath: "/rules", wiringLevel: "broker", brokerConfig: "RULES_CONFIG", paramCount: 20, category: "Rules" },
  { procedure: "ruleGroups", wazuhPath: "/rules/groups", wiringLevel: "broker", brokerConfig: "RULE_GROUPS_CONFIG", paramCount: 5, category: "Rules" },
  { procedure: "rulesByRequirement", wazuhPath: "/rules/requirement/{requirement}", wiringLevel: "broker", brokerConfig: "RULES_BY_REQUIREMENT_CONFIG", paramCount: 5, category: "Rules" },
  { procedure: "rulesFiles", wazuhPath: "/rules/files", wiringLevel: "broker", brokerConfig: "RULES_FILES_CONFIG", paramCount: 10, category: "Rules" },
  { procedure: "ruleFileContent", wazuhPath: "/rules/files/{filename}", wiringLevel: "manual", paramCount: 3, category: "Rules" },

  // ── MITRE ATT&CK ──
  { procedure: "mitreTactics", wazuhPath: "/mitre/tactics", wiringLevel: "broker", brokerConfig: "MITRE_TACTICS_CONFIG", paramCount: 8, category: "MITRE" },
  { procedure: "mitreTechniques", wazuhPath: "/mitre/techniques", wiringLevel: "broker", brokerConfig: "MITRE_TECHNIQUES_CONFIG", paramCount: 8, category: "MITRE" },
  { procedure: "mitreMitigations", wazuhPath: "/mitre/mitigations", wiringLevel: "broker", brokerConfig: "MITRE_MITIGATIONS_CONFIG", paramCount: 8, category: "MITRE" },
  { procedure: "mitreSoftware", wazuhPath: "/mitre/software", wiringLevel: "broker", brokerConfig: "MITRE_SOFTWARE_CONFIG", paramCount: 8, category: "MITRE" },
  { procedure: "mitreGroups", wazuhPath: "/mitre/groups", wiringLevel: "broker", brokerConfig: "MITRE_GROUPS_CONFIG", paramCount: 8, category: "MITRE" },
  { procedure: "mitreMetadata", wazuhPath: "/mitre/metadata", wiringLevel: "passthrough", paramCount: 0, category: "MITRE" },
  { procedure: "mitreReferences", wazuhPath: "/mitre/references", wiringLevel: "broker", brokerConfig: "MITRE_REFERENCES_CONFIG", paramCount: 7, category: "MITRE" },  // spec: 7 data (added select)

  // ── SCA ──
  { procedure: "scaPolicies", wazuhPath: "/sca/{agent_id}", wiringLevel: "broker", brokerConfig: "SCA_POLICIES_CONFIG", paramCount: 10, category: "SCA" },
  { procedure: "scaChecks", wazuhPath: "/sca/{agent_id}/checks/{policy_id}", wiringLevel: "broker", brokerConfig: "SCA_CHECKS_CONFIG", paramCount: 20, category: "SCA" },

  // ── CIS-CAT ──
  { procedure: "ciscatResults", wazuhPath: "/ciscat/{agent_id}/results", wiringLevel: "broker", brokerConfig: "CISCAT_CONFIG", paramCount: 16, category: "CIS-CAT" },  // spec: 1 path + 15 data (7 universal + 8 specific)

  // ── Syscheck / FIM ──
  { procedure: "syscheckFiles", wazuhPath: "/syscheck/{agent_id}", wiringLevel: "broker", brokerConfig: "SYSCHECK_CONFIG", paramCount: 18, category: "FIM" },  // spec: 1 path + 17 data
  { procedure: "syscheckLastScan", wazuhPath: "/syscheck/{agent_id}/last_scan", wiringLevel: "passthrough", paramCount: 1, category: "Syscheck" },

  // ── Rootcheck ──
  { procedure: "rootcheckResults", wazuhPath: "/rootcheck/{agent_id}", wiringLevel: "broker", brokerConfig: "ROOTCHECK_CONFIG", paramCount: 11, category: "Rootcheck" },  // spec: 1 path + 10 data (added cis,pci_dss)
  { procedure: "rootcheckLastScan", wazuhPath: "/rootcheck/{agent_id}/last_scan", wiringLevel: "passthrough", paramCount: 1, category: "Rootcheck" },

  // ── Decoders ──
  { procedure: "decoders", wazuhPath: "/decoders", wiringLevel: "broker", brokerConfig: "DECODERS_CONFIG", paramCount: 11, category: "Decoders" },
  { procedure: "decoderFiles", wazuhPath: "/decoders/files", wiringLevel: "broker", brokerConfig: "DECODERS_FILES_CONFIG", paramCount: 10, category: "Decoders" },
  { procedure: "decoderParents", wazuhPath: "/decoders/parents", wiringLevel: "broker", brokerConfig: "DECODER_PARENTS_CONFIG", paramCount: 7, category: "Decoders" },  // spec: offset,limit,sort,search,select,q,wait_for_complete
  { procedure: "decoderFileContent", wazuhPath: "/decoders/files/{filename}", wiringLevel: "broker", brokerConfig: "DECODER_FILE_CONTENT_CONFIG", paramCount: 3, category: "Decoders" },

  // ── Tasks ──
  { procedure: "taskStatus", wazuhPath: "/tasks/status", wiringLevel: "broker", brokerConfig: "TASKS_STATUS_CONFIG", paramCount: 12, category: "Tasks" },

  // ── Security ──
  { procedure: "securityRoles", wazuhPath: "/security/roles", wiringLevel: "broker", brokerConfig: "SECURITY_ROLES_CONFIG", paramCount: 8, category: "Security" },  // spec: 8 data
  { procedure: "securityPolicies", wazuhPath: "/security/policies", wiringLevel: "broker", brokerConfig: "SECURITY_POLICIES_CONFIG", paramCount: 8, category: "Security" },  // spec: 8 data
  { procedure: "securityUsers", wazuhPath: "/security/users", wiringLevel: "broker", brokerConfig: "SECURITY_USERS_CONFIG", paramCount: 8, category: "Security" },  // spec: 8 data
  { procedure: "securityUserById", wazuhPath: "/security/users", wiringLevel: "passthrough", paramCount: 1, category: "Security" },  // uses ?user_ids filter (spec-compliant), no brokerParams()
  { procedure: "securityRoleById", wazuhPath: "/security/roles", wiringLevel: "passthrough", paramCount: 1, category: "Security" },  // uses ?role_ids filter (spec-compliant), no brokerParams()
  { procedure: "securityPolicyById", wazuhPath: "/security/policies", wiringLevel: "passthrough", paramCount: 1, category: "Security" },  // uses ?policy_ids filter (spec-compliant), no brokerParams()
  { procedure: "securityRuleById", wazuhPath: "/security/rules", wiringLevel: "passthrough", paramCount: 1, category: "Security" },  // uses ?rule_ids filter (spec-compliant), no brokerParams()
  { procedure: "securityConfig", wazuhPath: "/security/config", wiringLevel: "broker", brokerConfig: "SECURITY_CONFIG_CONFIG", paramCount: 1, category: "Security" },
  { procedure: "securityCurrentUser", wazuhPath: "/security/users/me", wiringLevel: "broker", brokerConfig: "SECURITY_CURRENT_USER_CONFIG", paramCount: 1, category: "Security" },
  { procedure: "securityRbacRules", wazuhPath: "/security/rules", wiringLevel: "broker", brokerConfig: "SECURITY_RBAC_RULES_CONFIG", paramCount: 5, category: "Security" },  // spec: offset,limit,sort,search,rule_ids
  { procedure: "securityActions", wazuhPath: "/security/actions", wiringLevel: "broker", brokerConfig: "SECURITY_ACTIONS_CONFIG", paramCount: 1, category: "Security" },
  { procedure: "securityResources", wazuhPath: "/security/resources", wiringLevel: "manual", paramCount: 2, category: "Security" },
  { procedure: "securityCurrentUserPolicies", wazuhPath: "/security/users/me/policies", wiringLevel: "passthrough", paramCount: 0, category: "Security" },

  // ── Lists (CDB) ──
  { procedure: "lists", wazuhPath: "/lists", wiringLevel: "broker", brokerConfig: "LISTS_CONFIG", paramCount: 9, category: "Lists" },
  { procedure: "listsFiles", wazuhPath: "/lists/files", wiringLevel: "broker", brokerConfig: "LISTS_FILES_CONFIG", paramCount: 6, category: "Lists" },
  { procedure: "listsFileContent", wazuhPath: "/lists/files/{filename}", wiringLevel: "broker", brokerConfig: "LISTS_FILE_CONTENT_CONFIG", paramCount: 2, category: "Lists" },

  // ── Groups ──
  { procedure: "groupConfiguration", wazuhPath: "/groups/{group_id}/configuration", wiringLevel: "broker", brokerConfig: "GROUP_CONFIGURATION_CONFIG", paramCount: 3, category: "Groups" },
  { procedure: "groupFileContent", wazuhPath: "/groups/{group_id}/files/{file_name}", wiringLevel: "manual", paramCount: 3, category: "Groups" },
];

// ── Broker Config Registry ───────────────────────────────────────────────────

const UNIVERSAL_PARAM_NAMES = ["offset", "limit", "sort", "search", "q", "select", "distinct"];

export const BROKER_CONFIG_REGISTRY: Array<{ name: string; config: broker.EndpointParamConfig }> = [
  { name: "AGENTS_CONFIG", config: broker.AGENTS_CONFIG },
  { name: "RULES_CONFIG", config: broker.RULES_CONFIG },
  { name: "GROUPS_CONFIG", config: broker.GROUPS_CONFIG },
  { name: "CLUSTER_NODES_CONFIG", config: broker.CLUSTER_NODES_CONFIG },
  { name: "SCA_POLICIES_CONFIG", config: broker.SCA_POLICIES_CONFIG },
  { name: "SCA_CHECKS_CONFIG", config: broker.SCA_CHECKS_CONFIG },
  { name: "MANAGER_CONFIG", config: broker.MANAGER_CONFIG },
  { name: "MANAGER_LOGS_CONFIG", config: broker.MANAGER_LOGS_CONFIG },
  { name: "GROUP_AGENTS_CONFIG", config: broker.GROUP_AGENTS_CONFIG },
  { name: "SYSCHECK_CONFIG", config: broker.SYSCHECK_CONFIG },
  { name: "MITRE_TECHNIQUES_CONFIG", config: broker.MITRE_TECHNIQUES_CONFIG },
  { name: "DECODERS_CONFIG", config: broker.DECODERS_CONFIG },
  { name: "ROOTCHECK_CONFIG", config: broker.ROOTCHECK_CONFIG },
  { name: "CISCAT_CONFIG", config: broker.CISCAT_CONFIG },
  { name: "SYSCOLLECTOR_PACKAGES_CONFIG", config: broker.SYSCOLLECTOR_PACKAGES_CONFIG },
  { name: "SYSCOLLECTOR_PORTS_CONFIG", config: broker.SYSCOLLECTOR_PORTS_CONFIG },
  { name: "SYSCOLLECTOR_PROCESSES_CONFIG", config: broker.SYSCOLLECTOR_PROCESSES_CONFIG },
  { name: "SYSCOLLECTOR_SERVICES_CONFIG", config: broker.SYSCOLLECTOR_SERVICES_CONFIG },
  { name: "RULES_FILES_CONFIG", config: broker.RULES_FILES_CONFIG },
  { name: "DECODERS_FILES_CONFIG", config: broker.DECODERS_FILES_CONFIG },
  { name: "LISTS_CONFIG", config: broker.LISTS_CONFIG },
  { name: "LISTS_FILES_CONFIG", config: broker.LISTS_FILES_CONFIG },
  { name: "MITRE_TACTICS_CONFIG", config: broker.MITRE_TACTICS_CONFIG },
  { name: "MITRE_GROUPS_CONFIG", config: broker.MITRE_GROUPS_CONFIG },
  { name: "MITRE_MITIGATIONS_CONFIG", config: broker.MITRE_MITIGATIONS_CONFIG },
  { name: "MITRE_SOFTWARE_CONFIG", config: broker.MITRE_SOFTWARE_CONFIG },
  { name: "MITRE_REFERENCES_CONFIG", config: broker.MITRE_REFERENCES_CONFIG },
  { name: "GROUP_FILES_CONFIG", config: broker.GROUP_FILES_CONFIG },
  { name: "SYSCOLLECTOR_NETIFACE_CONFIG", config: broker.SYSCOLLECTOR_NETIFACE_CONFIG },
  { name: "SYSCOLLECTOR_NETADDR_CONFIG", config: broker.SYSCOLLECTOR_NETADDR_CONFIG },
  { name: "SYSCOLLECTOR_HOTFIXES_CONFIG", config: broker.SYSCOLLECTOR_HOTFIXES_CONFIG },
  { name: "SYSCOLLECTOR_NETPROTO_CONFIG", config: broker.SYSCOLLECTOR_NETPROTO_CONFIG },
  { name: "EXPERIMENTAL_CISCAT_RESULTS_CONFIG", config: broker.EXPERIMENTAL_CISCAT_RESULTS_CONFIG },
  { name: "EXP_SYSCOLLECTOR_PACKAGES_CONFIG", config: broker.EXP_SYSCOLLECTOR_PACKAGES_CONFIG },
  { name: "EXP_SYSCOLLECTOR_PROCESSES_CONFIG", config: broker.EXP_SYSCOLLECTOR_PROCESSES_CONFIG },
  { name: "EXP_SYSCOLLECTOR_PORTS_CONFIG", config: broker.EXP_SYSCOLLECTOR_PORTS_CONFIG },
  { name: "EXP_SYSCOLLECTOR_NETIFACE_CONFIG", config: broker.EXP_SYSCOLLECTOR_NETIFACE_CONFIG },
  { name: "EXP_SYSCOLLECTOR_NETADDR_CONFIG", config: broker.EXP_SYSCOLLECTOR_NETADDR_CONFIG },
  { name: "EXP_SYSCOLLECTOR_NETPROTO_CONFIG", config: broker.EXP_SYSCOLLECTOR_NETPROTO_CONFIG },
  { name: "EXP_SYSCOLLECTOR_OS_CONFIG", config: broker.EXP_SYSCOLLECTOR_OS_CONFIG },
  { name: "EXP_SYSCOLLECTOR_HARDWARE_CONFIG", config: broker.EXP_SYSCOLLECTOR_HARDWARE_CONFIG },
  { name: "EXP_SYSCOLLECTOR_HOTFIXES_CONFIG", config: broker.EXP_SYSCOLLECTOR_HOTFIXES_CONFIG },
  { name: "SECURITY_ROLES_CONFIG", config: broker.SECURITY_ROLES_CONFIG },
  { name: "SECURITY_POLICIES_CONFIG", config: broker.SECURITY_POLICIES_CONFIG },
  { name: "SECURITY_USERS_CONFIG", config: broker.SECURITY_USERS_CONFIG },
  { name: "CLUSTER_NODE_CONFIGURATION_CONFIG", config: broker.CLUSTER_NODE_CONFIGURATION_CONFIG },
  { name: "CLUSTER_NODE_LOGS_CONFIG", config: broker.CLUSTER_NODE_LOGS_CONFIG },
  { name: "TASKS_STATUS_CONFIG", config: broker.TASKS_STATUS_CONFIG },
  { name: "SECURITY_RBAC_RULES_CONFIG", config: broker.SECURITY_RBAC_RULES_CONFIG },
  { name: "DECODER_PARENTS_CONFIG", config: broker.DECODER_PARENTS_CONFIG },
  { name: "AGENTS_OUTDATED_CONFIG", config: broker.AGENTS_OUTDATED_CONFIG },
  { name: "AGENTS_NO_GROUP_CONFIG", config: broker.AGENTS_NO_GROUP_CONFIG },
  { name: "AGENTS_STATS_DISTINCT_CONFIG", config: broker.AGENTS_STATS_DISTINCT_CONFIG },
  { name: "SYSCOLLECTOR_BROWSER_EXTENSIONS_CONFIG", config: broker.SYSCOLLECTOR_BROWSER_EXTENSIONS_CONFIG },
  { name: "SYSCOLLECTOR_USERS_CONFIG", config: broker.SYSCOLLECTOR_USERS_CONFIG },
  { name: "SYSCOLLECTOR_GROUPS_CONFIG", config: broker.SYSCOLLECTOR_GROUPS_CONFIG },
  // Promotion sprint — manual → broker
  { name: "DECODER_FILE_CONTENT_CONFIG", config: broker.DECODER_FILE_CONTENT_CONFIG },
  { name: "SECURITY_CONFIG_CONFIG", config: broker.SECURITY_CONFIG_CONFIG },
  { name: "SECURITY_CURRENT_USER_CONFIG", config: broker.SECURITY_CURRENT_USER_CONFIG },
  { name: "SECURITY_ACTIONS_CONFIG", config: broker.SECURITY_ACTIONS_CONFIG },
  // Full coverage sprint — all remaining endpoints
  { name: "MANAGER_STATS_CONFIG", config: broker.MANAGER_STATS_CONFIG },
  { name: "MANAGER_DAEMON_STATS_CONFIG", config: broker.MANAGER_DAEMON_STATS_CONFIG },
  { name: "MANAGER_VERSION_CHECK_CONFIG", config: broker.MANAGER_VERSION_CHECK_CONFIG },
  { name: "MANAGER_COMPONENT_CONFIG_CONFIG", config: broker.MANAGER_COMPONENT_CONFIG_CONFIG },
  { name: "CLUSTER_CONFIG_VALIDATION_CONFIG", config: broker.CLUSTER_CONFIG_VALIDATION_CONFIG },
  { name: "CLUSTER_HEALTHCHECK_CONFIG", config: broker.CLUSTER_HEALTHCHECK_CONFIG },
  { name: "CLUSTER_RULESET_SYNC_CONFIG", config: broker.CLUSTER_RULESET_SYNC_CONFIG },
  { name: "CLUSTER_API_CONFIG_CONFIG", config: broker.CLUSTER_API_CONFIG_CONFIG },
  { name: "CLUSTER_NODE_INFO_CONFIG", config: broker.CLUSTER_NODE_INFO_CONFIG },
  { name: "CLUSTER_NODE_STATS_CONFIG", config: broker.CLUSTER_NODE_STATS_CONFIG },
  { name: "CLUSTER_NODE_STATS_HOURLY_CONFIG", config: broker.CLUSTER_NODE_STATS_HOURLY_CONFIG },
  { name: "CLUSTER_NODE_STATUS_CONFIG", config: broker.CLUSTER_NODE_STATUS_CONFIG },
  { name: "CLUSTER_NODE_COMPONENT_CONFIG_CONFIG", config: broker.CLUSTER_NODE_COMPONENT_CONFIG_CONFIG },
  { name: "CLUSTER_NODE_DAEMON_STATS_CONFIG", config: broker.CLUSTER_NODE_DAEMON_STATS_CONFIG },
  { name: "CLUSTER_NODE_LOGS_SUMMARY_CONFIG", config: broker.CLUSTER_NODE_LOGS_SUMMARY_CONFIG },
  { name: "CLUSTER_NODE_STATS_ANALYSISD_CONFIG", config: broker.CLUSTER_NODE_STATS_ANALYSISD_CONFIG },
  { name: "CLUSTER_NODE_STATS_REMOTED_CONFIG", config: broker.CLUSTER_NODE_STATS_REMOTED_CONFIG },
  { name: "CLUSTER_NODE_STATS_WEEKLY_CONFIG", config: broker.CLUSTER_NODE_STATS_WEEKLY_CONFIG },
  { name: "AGENTS_SUMMARY_CONFIG", config: broker.AGENTS_SUMMARY_CONFIG },
  { name: "AGENT_BY_ID_CONFIG", config: broker.AGENT_BY_ID_CONFIG },
  { name: "AGENT_DAEMON_STATS_CONFIG", config: broker.AGENT_DAEMON_STATS_CONFIG },
  { name: "AGENT_STATS_CONFIG", config: broker.AGENT_STATS_CONFIG },
  { name: "AGENT_CONFIG_CONFIG", config: broker.AGENT_CONFIG_CONFIG },
  { name: "AGENTS_UPGRADE_RESULT_CONFIG", config: broker.AGENTS_UPGRADE_RESULT_CONFIG },
  { name: "AGENT_GROUP_SYNC_CONFIG", config: broker.AGENT_GROUP_SYNC_CONFIG },
  { name: "RULE_GROUPS_CONFIG", config: broker.RULE_GROUPS_CONFIG },
  { name: "RULES_BY_REQUIREMENT_CONFIG", config: broker.RULES_BY_REQUIREMENT_CONFIG },
  { name: "RULE_FILE_CONTENT_CONFIG", config: broker.RULE_FILE_CONTENT_CONFIG },
  { name: "SYSCHECK_LAST_SCAN_CONFIG", config: broker.SYSCHECK_LAST_SCAN_CONFIG },
  { name: "ROOTCHECK_LAST_SCAN_CONFIG", config: broker.ROOTCHECK_LAST_SCAN_CONFIG },
  { name: "SECURITY_RESOURCES_CONFIG", config: broker.SECURITY_RESOURCES_CONFIG },
  { name: "LISTS_FILE_CONTENT_CONFIG", config: broker.LISTS_FILE_CONTENT_CONFIG },
  { name: "GROUP_CONFIGURATION_CONFIG", config: broker.GROUP_CONFIGURATION_CONFIG },
  { name: "GROUP_FILE_CONTENT_CONFIG", config: broker.GROUP_FILE_CONTENT_CONFIG },
  // Final passthrough → broker promotion
  { name: "MANAGER_STATUS_CONFIG", config: broker.MANAGER_STATUS_CONFIG },
  { name: "MANAGER_INFO_CONFIG", config: broker.MANAGER_INFO_CONFIG },
  { name: "MANAGER_CONFIG_VALIDATION_CONFIG", config: broker.MANAGER_CONFIG_VALIDATION_CONFIG },
  { name: "MANAGER_STATS_HOURLY_CONFIG", config: broker.MANAGER_STATS_HOURLY_CONFIG },
  { name: "MANAGER_STATS_WEEKLY_CONFIG", config: broker.MANAGER_STATS_WEEKLY_CONFIG },
  { name: "MANAGER_STATS_ANALYSISD_CONFIG", config: broker.MANAGER_STATS_ANALYSISD_CONFIG },
  { name: "MANAGER_STATS_REMOTED_CONFIG", config: broker.MANAGER_STATS_REMOTED_CONFIG },
  { name: "MANAGER_LOGS_SUMMARY_CONFIG", config: broker.MANAGER_LOGS_SUMMARY_CONFIG },
  { name: "MANAGER_API_CONFIG_CONFIG", config: broker.MANAGER_API_CONFIG_CONFIG },
  { name: "CLUSTER_STATUS_CONFIG", config: broker.CLUSTER_STATUS_CONFIG },
  { name: "CLUSTER_LOCAL_INFO_CONFIG", config: broker.CLUSTER_LOCAL_INFO_CONFIG },
  { name: "CLUSTER_LOCAL_CONFIG_CONFIG", config: broker.CLUSTER_LOCAL_CONFIG_CONFIG },
  { name: "AGENT_SUMMARY_STATUS_CONFIG", config: broker.AGENT_SUMMARY_STATUS_CONFIG },
  { name: "AGENT_SUMMARY_OS_CONFIG", config: broker.AGENT_SUMMARY_OS_CONFIG },
  { name: "AGENT_OVERVIEW_CONFIG", config: broker.AGENT_OVERVIEW_CONFIG },
  { name: "MITRE_METADATA_CONFIG", config: broker.MITRE_METADATA_CONFIG },
  { name: "API_INFO_CONFIG", config: broker.API_INFO_CONFIG },
  { name: "SECURITY_CURRENT_USER_POLICIES_CONFIG", config: broker.SECURITY_CURRENT_USER_POLICIES_CONFIG },
];

// ── Artifact Loaders ────────────────────────────────────────────────────────

interface WiringLedgerEntry {
  name: string;
  routerLine: number;
  wired: boolean;
  callsites: string[];
}

interface ParityEntry {
  file: string;
  line: number;
  procedure: string;
  passedKeys: Record<string, string>;
  isVoid: boolean;
}

function loadWiringLedger(): { map: Map<string, string[]>; loaded: boolean; generatedAt?: string } {
  const map = new Map<string, string[]>();
  try {
    const raw = readFileSync(resolve(process.cwd(), "docs/wiring-ledger.json"), "utf-8");
    const data = JSON.parse(raw) as { generated?: string; procedures: WiringLedgerEntry[] };
    for (const proc of data.procedures) {
      map.set(proc.name, proc.callsites || []);
    }
    return { map, loaded: true, generatedAt: data.generated };
  } catch {
    // Graceful degradation — file may not exist
    return { map, loaded: false };
  }
}

function loadParityCallsites(): { map: Map<string, ParityCallsite[]>; loaded: boolean; generatedAt?: string } {
  const map = new Map<string, ParityCallsite[]>();
  try {
    const raw = readFileSync(resolve(process.cwd(), "docs/ui-param-parity.json"), "utf-8");
    const data = JSON.parse(raw) as { generated?: string; callsites: ParityEntry[] };
    for (const cs of data.callsites) {
      const existing = map.get(cs.procedure) || [];
      existing.push({ file: cs.file, line: cs.line, passedKeys: cs.passedKeys });
      map.set(cs.procedure, existing);
    }
    return { map, loaded: true, generatedAt: data.generated };
  } catch {
    // Graceful degradation
    return { map, loaded: false };
  }
}

// ── Staleness Detection ──────────────────────────────────────────────────────

/** Safely get a file's mtime as ISO string, or undefined on any error. */
function getFileMtimeISO(filePath: string): string | undefined {
  try {
    return statSync(filePath).mtime.toISOString();
  } catch {
    return undefined;
  }
}

/** Safely get a file's mtime as epoch ms, or undefined on any error. */
function getFileMtimeMs(filePath: string): number | undefined {
  try {
    return statSync(filePath).mtime.getTime();
  } catch {
    return undefined;
  }
}

// ── Analysis Functions ───────────────────────────────────────────────────────

function analyzeBrokerConfig(entry: { name: string; config: broker.EndpointParamConfig }): BrokerConfigSummary {
  const paramNames = Object.keys(entry.config.params);
  return {
    name: entry.name,
    endpoint: entry.config.endpoint,
    totalParams: paramNames.length,
    universalParams: paramNames.filter(p => UNIVERSAL_PARAM_NAMES.includes(p)),
    specificParams: paramNames.filter(p => !UNIVERSAL_PARAM_NAMES.includes(p)),
  };
}

export function generateCoverageReport(): CoverageReport {
  const wiring = loadWiringLedger();
  const parity = loadParityCallsites();

  // ── Staleness detection ──
  // Compare artifact file mtimes against the primary source file (wazuhRouter.ts).
  // If the source has been modified more recently than an artifact, the artifact is stale.
  const sourcePath = resolve(__dirname, "wazuhRouter.ts");
  const wiringArtifactPath = resolve(process.cwd(), "docs/wiring-ledger.json");
  const parityArtifactPath = resolve(process.cwd(), "docs/ui-param-parity.json");

  const sourceMtimeISO = getFileMtimeISO(sourcePath);
  const sourceMtimeMs = getFileMtimeMs(sourcePath);
  const wiringMtimeMs = getFileMtimeMs(wiringArtifactPath);
  const parityMtimeMs = getFileMtimeMs(parityArtifactPath);

  const wiringLedgerStale = (wiring.loaded && sourceMtimeMs != null && wiringMtimeMs != null)
    ? wiringMtimeMs < sourceMtimeMs
    : undefined;
  const parityArtifactStale = (parity.loaded && sourceMtimeMs != null && parityMtimeMs != null)
    ? parityMtimeMs < sourceMtimeMs
    : undefined;

  const endpoints: EndpointCoverage[] = ENDPOINT_REGISTRY.map(e => ({
    procedure: e.procedure,
    wazuhPath: e.wazuhPath,
    method: "GET" as const,
    wiringLevel: e.wiringLevel,
    brokerConfig: e.brokerConfig,
    paramCount: e.paramCount,
    category: e.category,
    callsites: wiring.map.get(e.procedure) || [],
    parityCallsites: parity.map.get(e.procedure) || [],
  }));

  const brokerWired = endpoints.filter(e => e.wiringLevel === "broker").length;
  const manualParam = endpoints.filter(e => e.wiringLevel === "manual").length;
  const passthrough = endpoints.filter(e => e.wiringLevel === "passthrough").length;
  const total = endpoints.length;

  const brokerConfigs = BROKER_CONFIG_REGISTRY.map(analyzeBrokerConfig);
  const totalBrokerParams = brokerConfigs.reduce((sum, c) => sum + c.totalParams, 0);

  // Category breakdown
  const categoryMap = new Map<string, { total: number; broker: number; manual: number; pass: number }>();
  for (const e of endpoints) {
    const cat = categoryMap.get(e.category) || { total: 0, broker: 0, manual: 0, pass: 0 };
    cat.total++;
    if (e.wiringLevel === "broker") cat.broker++;
    else if (e.wiringLevel === "manual") cat.manual++;
    else cat.pass++;
    categoryMap.set(e.category, cat);
  }

  const categories: CategoryBreakdown[] = Array.from(categoryMap.entries()).map(([category, counts]) => ({
    category,
    total: counts.total,
    brokerWired: counts.broker,
    manualParam: counts.manual,
    passthrough: counts.pass,
    coveragePercent: Math.round(((counts.broker + counts.manual) / counts.total) * 100),
  }));

  return {
    analyzedAt: new Date().toISOString(),
    specVersion: "4.14.3",
    totalProcedures: total,
    brokerWired,
    manualParam,
    passthrough,
    brokerCoveragePercent: Math.round((brokerWired / total) * 100),
    paramCoveragePercent: Math.round(((brokerWired + manualParam) / total) * 100),
    endpointCoverage: `${total}/${total}`,
    totalBrokerConfigs: brokerConfigs.length,
    totalBrokerParams,
    endpoints,
    brokerConfigs,
    categories,
    enrichment: {
      wiringLedgerLoaded: wiring.loaded,
      parityArtifactLoaded: parity.loaded,
      wiringLedgerGeneratedAt: wiring.generatedAt,
      parityArtifactGeneratedAt: parity.generatedAt,
      sourceLastModified: sourceMtimeISO,
      wiringLedgerStale,
      parityArtifactStale,
    },
  };
}
