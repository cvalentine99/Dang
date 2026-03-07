# Wazuh Parameter Broker — Coverage Ledger

**Spec baseline:** Wazuh REST API OpenAPI v4.14.3-rc3
**Last updated:** Broker governance closure sprint (2026-03-07)

This document is the single source of truth for which Wazuh API endpoints are broker-wired, what parameters each broker config accepts, and which endpoints remain manually wired or passthrough.

## Audit Guarantee Matrix

Three independent checks enforce different layers of correctness. No single check alone proves full per-endpoint spec-param parity.

| Check | Command | What It Proves | What It Does NOT Prove |
|---|---|---|---|
| Broker param count audit | `pnpm audit:broker` | Every broker-wired entry's `paramCount` in the registry matches the actual `Object.keys(config.params).length` in `paramBroker.ts` | That every spec-defined parameter for that endpoint is modeled |
| OpenAPI spec diff | `pnpm audit:openapi` | Every spec GET path is either wired in the registry or explicitly excluded; every extra registry path is documented | That the wired endpoint forwards all spec parameters |
| Vitest suite | `pnpm test` | Broker configs accept, coerce, and forward parameters correctly; unsupported params are rejected | Full integration parity with a live Wazuh instance |

Together they provide: endpoint inventory coverage (openapi), registry-to-config consistency (broker), and behavioral correctness (vitest). Full per-endpoint spec-param parity would require a fourth check that diffs each endpoint's spec parameters against its broker config — that does not exist yet.

## Broker-Wired Endpoints (36 configs)

The following endpoints are fully wired through `paramBroker.ts`. All accepted parameters are forwarded with correct Wazuh outbound names. Unsupported parameters are explicitly rejected.

| Endpoint | Config Name | Total Params | Universal Params | Endpoint-Specific Params |
|---|---|---|---|---|
| `GET /agents` | `AGENTS_CONFIG` | 21 | offset, limit, sort, search, select, q, distinct | status, older_than, manager_host, version, group, node_name, name, ip, registerIP, group_config_status, manager, os.platform, os.version, os.name |
| `GET /rules` | `RULES_CONFIG` | 20 | offset, limit, sort, search, select, q, distinct | status, group, level, filename, relative_dirname, pci_dss, gdpr, gpg13, hipaa, tsc, mitre, nist_800_53, rule_ids |
| `GET /groups` | `GROUPS_CONFIG` | 9 | offset, limit, sort, search, select, q, distinct | hash, groups_list |
| `GET /cluster/nodes` | `CLUSTER_NODES_CONFIG` | 9 | offset, limit, sort, search, select, q, distinct | type, nodes_list |
| `GET /sca/{agent_id}` | `SCA_POLICIES_CONFIG` | 10 | offset, limit, sort, search, select, q, distinct | name, description, references |
| `GET /sca/{agent_id}/checks/{policy_id}` | `SCA_CHECKS_CONFIG` | 20 | offset, limit, sort, search, select, q, distinct | title, description, rationale, remediation, command, reason, file, process, directory, registry, references, result, condition |
| `GET /manager/configuration` | `MANAGER_CONFIG` | 4 | distinct | section, field, raw |
| `GET /manager/logs` | `MANAGER_LOGS_CONFIG` | 9 | offset, limit, sort, search, select, q, distinct | level, tag |
| `GET /groups/{group_id}/agents` | `GROUP_AGENTS_CONFIG` | 8 | offset, limit, sort, search, select, q, distinct | status |
| `GET /groups/{group_id}/files` | `GROUP_FILES_CONFIG` | 8 | offset, limit, sort, search, select, q, distinct | hash |
| `GET /syscheck/{agent_id}` | `SYSCHECK_CONFIG` | 17 | offset, limit, sort, search, select, q, distinct | type, hash, file, arch, summary, md5, sha1, sha256, date, mtime |
| `GET /rootcheck/{agent_id}` | `ROOTCHECK_CONFIG` | 8 | offset, limit, sort, search, select, q, distinct | status |
| `GET /decoders` | `DECODERS_CONFIG` | 11 | offset, limit, sort, search, select, q, distinct | decoder_names, filename, relative_dirname, status |
| `GET /decoders/files` | `DECODERS_FILES_CONFIG` | 10 | offset, limit, sort, search, select, q, distinct | filename, relative_dirname, status |
| `GET /rules/files` | `RULES_FILES_CONFIG` | 10 | offset, limit, sort, search, select, q, distinct | filename, relative_dirname, status |
| `GET /lists` | `LISTS_CONFIG` | 9 | offset, limit, sort, search, select, q, distinct | filename, relative_dirname |
| `GET /lists/files` | `LISTS_FILES_CONFIG` | 6 | offset, limit, sort, search | filename, relative_dirname |
| `GET /ciscat/{agent_id}/results` | `CISCAT_CONFIG` | 15 | offset, limit, sort, search, select, q, distinct | benchmark, profile, pass, fail, error, notchecked, unknown, score |
| `GET /experimental/ciscat/results` | `EXPERIMENTAL_CISCAT_RESULTS_CONFIG` | 16 | offset, limit, sort, search, select, q, distinct | agents_list, benchmark, profile, pass, fail, error, notchecked, unknown, score |
| `GET /mitre/tactics` | `MITRE_TACTICS_CONFIG` | 8 | offset, limit, sort, search, select, q, distinct | mitre_tactic_ids |
| `GET /mitre/techniques` | `MITRE_TECHNIQUES_CONFIG` | 8 | offset, limit, sort, search, select, q, distinct | technique_ids |
| `GET /mitre/mitigations` | `MITRE_MITIGATIONS_CONFIG` | 8 | offset, limit, sort, search, select, q, distinct | mitre_mitigation_ids |
| `GET /mitre/software` | `MITRE_SOFTWARE_CONFIG` | 8 | offset, limit, sort, search, select, q, distinct | mitre_software_ids |
| `GET /mitre/groups` | `MITRE_GROUPS_CONFIG` | 8 | offset, limit, sort, search, select, q, distinct | mitre_group_ids |
| `GET /mitre/references` | `MITRE_REFERENCES_CONFIG` | 6 | offset, limit, sort, search, q | mitre_reference_ids |
| `GET /syscollector/{agent_id}/packages` | `SYSCOLLECTOR_PACKAGES_CONFIG` | 12 | offset, limit, sort, search, select, q, distinct | vendor, name, architecture, format, version |
| `GET /syscollector/{agent_id}/ports` | `SYSCOLLECTOR_PORTS_CONFIG` | 15 | offset, limit, sort, search, select, q, distinct | pid, protocol, tx_queue, state, process, local.ip, local.port, remote.ip |
| `GET /syscollector/{agent_id}/processes` | `SYSCOLLECTOR_PROCESSES_CONFIG` | 21 | offset, limit, sort, search, select, q, distinct | pid, state, ppid, egroup, euser, fgroup, name, nlwp, pgrp, priority, rgroup, ruser, sgroup, suser |
| `GET /syscollector/{agent_id}/services` | `SYSCOLLECTOR_SERVICES_CONFIG` | 7 | offset, limit, sort, search, select, q, distinct | (none) |
| `GET /syscollector/{agent_id}/netiface` | `SYSCOLLECTOR_NETIFACE_CONFIG` | 21 | offset, limit, sort, search, select, q, distinct | name, adapter, type, state, mtu, tx_packets, rx_packets, tx_bytes, rx_bytes, tx_errors, rx_errors, tx_dropped, rx_dropped, mac |
| `GET /syscollector/{agent_id}/netaddr` | `SYSCOLLECTOR_NETADDR_CONFIG` | 12 | offset, limit, sort, search, select, q, distinct | iface, proto, address, broadcast, netmask |
| `GET /syscollector/{agent_id}/hotfixes` | `SYSCOLLECTOR_HOTFIXES_CONFIG` | 8 | offset, limit, sort, search, select, q, distinct | hotfix |
| `GET /syscollector/{agent_id}/netproto` | `SYSCOLLECTOR_NETPROTO_CONFIG` | 11 | offset, limit, sort, search, select, q, distinct | iface, type, gateway, dhcp |
| `GET /experimental/syscollector/packages` | `EXP_SYSCOLLECTOR_PACKAGES_CONFIG` | 13 | offset, limit, sort, search, select, q, distinct | agents_list, vendor, name, architecture, format, version |
| `GET /experimental/syscollector/processes` | `EXP_SYSCOLLECTOR_PROCESSES_CONFIG` | 22 | offset, limit, sort, search, select, q, distinct | agents_list, pid, state, ppid, egroup, euser, fgroup, name, nlwp, pgrp, priority, rgroup, ruser, sgroup, suser |
| `GET /experimental/syscollector/ports` | `EXP_SYSCOLLECTOR_PORTS_CONFIG` | 16 | offset, limit, sort, search, select, q, distinct | agents_list, pid, protocol, local.ip, local.port, remote.ip, tx_queue, state, process |

## Manual-Param Endpoints (34 procedures)

These endpoints use inline Zod schemas in `wazuhRouter.ts` with manual query parameter forwarding. They are not broker-wired but do forward parameters correctly.

| Procedure | Wazuh Path | Param Count | Parameters |
|---|---|---|---|
| `remoted` | `/manager/stats/remoted` | 0 | — |
| `daemonStats` | `/manager/daemons/stats` | 1 | daemons_list |
| `managerComponentConfig` | `/manager/configuration/{component}/{configuration}` | 2 | component, configuration |
| `clusterStatus` | `/cluster/status` | 0 | — |
| `clusterHealthcheck` | `/cluster/healthcheck` | 1 | nodes_list |
| `clusterNodeComponentConfig` | `/cluster/{node_id}/configuration/{component}/{configuration}` | 3 | node_id, component, configuration |
| `clusterNodeDaemonStats` | `/cluster/{node_id}/daemons/stats` | 2 | node_id, daemons_list |
| `clusterNodeLogs` | `/cluster/{node_id}/logs` | 7 | node_id, offset, limit, sort, search, tag, level |
| `agentDaemonStats` | `/agents/{agent_id}/daemons/stats` | 2 | agent_id, daemons_list |
| `agentGroupSync` | `/agents/{agent_id}/group/is_sync` | 1 | agent_id |
| `apiInfo` | `/` | 0 | — |
| `agentsOutdated` | `/agents/outdated` | 6 | offset, limit, sort, search, select, q |
| `agentsNoGroup` | `/agents/no_group` | 6 | offset, limit, sort, search, select, q |
| `agentsStatsDistinct` | `/agents/stats/distinct` | 6 | offset, limit, sort, search, fields, q |
| `agentOs` | `/syscollector/{agent_id}/os` | 2 | agent_id, select |
| `agentHardware` | `/syscollector/{agent_id}/hardware` | 2 | agent_id, select |
| `agentBrowserExtensions` | `/syscollector/{agent_id}/browser_extensions` | 8 | agent_id, offset, limit, sort, search, q, distinct, select |
| `agentUsers` | `/syscollector/{agent_id}/users` | 8 | agent_id, offset, limit, sort, search, q, distinct, select |
| `agentGroups2` | `/syscollector/{agent_id}/groups` | 8 | agent_id, offset, limit, sort, search, q, distinct, select |
| `expSyscollectorNetaddr` | `/experimental/syscollector/netaddr` | 11 | offset, limit, sort, search, select, q, agents_list, proto, address, broadcast, netmask |
| `expSyscollectorNetiface` | `/experimental/syscollector/netiface` | 21 | offset, limit, sort, search, select, q, agents_list, name, adapter, type, state, mtu, tx_packets, rx_packets, tx_bytes, rx_bytes, tx_errors, rx_errors, tx_dropped, rx_dropped, mac |
| `expSyscollectorNetproto` | `/experimental/syscollector/netproto` | 7 | offset, limit, sort, search, select, q, agents_list |
| `expSyscollectorOs` | `/experimental/syscollector/os` | 7 | offset, limit, sort, search, select, q, agents_list |
| `expSyscollectorHardware` | `/experimental/syscollector/hardware` | 7 | offset, limit, sort, search, select, q, agents_list |
| `expSyscollectorHotfixes` | `/experimental/syscollector/hotfixes` | 8 | offset, limit, sort, search, select, q, agents_list, hotfix |
| `ruleGroups` | `/rules/groups` | 4 | offset, limit, sort, search |
| `rulesByRequirement` | `/rules/requirement/{requirement}` | 5 | requirement, offset, limit, sort, search |
| `ruleFileContent` | `/rules/files/{filename}` | 3 | filename, raw, get_dirnames_path |
| `decoderParents` | `/decoders/parents` | 4 | offset, limit, sort, select |
| `decoderFileContent` | `/decoders/files/{filename}` | 3 | filename, raw, get_dirnames_path |
| `listsFileContent` | `/lists/files/{filename}` | 2 | filename, raw |
| `taskStatus` | `/tasks/status` | 12 | task_list, agents_list, command, node, module, status, offset, limit, sort, search, select, q |
| `securityConfig` | `/security/config` | 0 | — |
| `securityCurrentUser` | `/security/users/me` | 0 | — |
| `securityRbacRules` | `/security/rules` | 3 | offset, limit, search |
| `securityResources` | `/security/resources` | 1 | resource_list |
| `groupConfiguration` | `/groups/{group_id}/configuration` | 3 | group_id, offset, limit |
| `groupFileContent` | `/groups/{group_id}/files/{file_name}` | 4 | group_id, file_name, type_agents, raw |

## Passthrough Endpoints (50 procedures)

These endpoints forward to Wazuh with no query parameters (path params only where applicable).

| Procedure | Wazuh Path | Path Params |
|---|---|---|
| `status` | `/manager/status` | — |
| `isConfigured` | N/A (config check) | — |
| `managerConfigValidation` | `/manager/configuration/validation` | — |
| `managerStats` | `/manager/stats` | — |
| `statsHourly` | `/manager/stats/hourly` | — |
| `statsWeekly` | `/manager/stats/weekly` | — |
| `analysisd` | `/manager/stats/analysisd` | — |
| `managerLogsSummary` | `/manager/logs/summary` | — |
| `managerVersionCheck` | `/manager/version/check` | — |
| `managerApiConfig` | `/manager/api/config` | — |
| `clusterLocalInfo` | `/cluster/local/info` | — |
| `clusterLocalConfig` | `/cluster/local/config` | — |
| `clusterRulesetSync` | `/cluster/ruleset/synchronization` | — |
| `clusterApiConfig` | `/cluster/api/config` | — |
| `clusterConfigValidation` | `/cluster/configuration/validation` | — |
| `clusterNodeInfo` | `/cluster/{node_id}/info` | node_id |
| `clusterNodeStats` | `/cluster/{node_id}/stats` | node_id |
| `clusterNodeStatsHourly` | `/cluster/{node_id}/stats/hourly` | node_id |
| `clusterNodeStatus` | `/cluster/{node_id}/status` | node_id |
| `clusterNodeConfiguration` | `/cluster/{node_id}/configuration` | node_id |
| `clusterNodeLogsSummary` | `/cluster/{node_id}/logs/summary` | node_id |
| `clusterNodeStatsAnalysisd` | `/cluster/{node_id}/stats/analysisd` | node_id |
| `clusterNodeStatsRemoted` | `/cluster/{node_id}/stats/remoted` | node_id |
| `clusterNodeStatsWeekly` | `/cluster/{node_id}/stats/weekly` | node_id |
| `agentSummaryStatus` | `/agents/summary/status` | — |
| `agentSummaryOs` | `/agents/summary/os` | — |
| `agentsSummary` | `/agents/summary` | — |
| `agentOverview` | `/overview/agents` | — |
| `agentById` | `/agents/{agent_id}` | agent_id |
| `agentStats` | `/agents/{agent_id}/stats/{component}` | agent_id, component |
| `agentConfig` | `/agents/{agent_id}/config/{component}/{configuration}` | agent_id, component, configuration |
| `agentsUpgradeResult` | `/agents/upgrade_result` | — |
| `agentsUninstallPermission` | N/A (permission check) | — |
| `securityRoles` | `/security/roles` | — |
| `securityPolicies` | `/security/policies` | — |
| `securityUsers` | `/security/users` | — |
| `securityUserById` | `/security/users/{user_id}` | user_id |
| `securityRoleById` | `/security/roles/{role_id}` | role_id |
| `securityPolicyById` | `/security/policies/{policy_id}` | policy_id |
| `securityRuleById` | `/security/rules/{rule_id}` | rule_id |
| `securityActions` | `/security/actions` | — |

## Universal Query Family

These parameters are shared across most broker-wired endpoints (except `MANAGER_CONFIG` which only supports `distinct`, and `LISTS_FILES_CONFIG` / `MITRE_REFERENCES_CONFIG` which omit `select`, `q`, and/or `distinct`):

| Parameter | Wazuh Name | Type | Description |
|---|---|---|---|
| offset | offset | number | First element to return in the collection |
| limit | limit | number | Maximum number of elements to return |
| sort | sort | string | Sort by field(s) with +/- prefix for asc/desc |
| search | search | string | Native full-text search. Prefix with `-` for complementary search |
| select | select | csv | Comma-separated field selection |
| q | q | string | Query filter (e.g. `q="status=active"`) |
| distinct | distinct | boolean | Return distinct values |

**Critical distinction:** `search` and `q` are independent parameters with different semantics. `search` is Wazuh's native full-text search. `q` is a structured query filter. They are never conflated or rewritten into each other.

## Compliance Filter Family (Rules Only)

Available exclusively on `GET /rules` via `RULES_CONFIG`:

| Parameter | Wazuh Name | Description |
|---|---|---|
| pci_dss | pci_dss | PCI DSS requirement filter |
| gdpr | gdpr | GDPR requirement filter |
| hipaa | hipaa | HIPAA requirement filter |
| tsc | tsc | TSC requirement filter |
| gpg13 | gpg13 | GPG13 requirement filter |
| mitre | mitre | MITRE ATT&CK technique ID filter |

## CIS-CAT Endpoints

Two CIS-CAT endpoints are broker-wired:

The per-agent endpoint `GET /ciscat/{agent_id}/results` uses `CISCAT_CONFIG` with 15 params (7 universal + 8 field filters: benchmark, profile, pass, fail, error, notchecked, unknown, score).

The cross-agent endpoint `GET /experimental/ciscat/results` uses `EXPERIMENTAL_CISCAT_RESULTS_CONFIG` with 16 params (7 universal + agents_list + 8 field filters identical to the per-agent config).

## Correctness Fixes Applied

| Fix | Description | Phase |
|---|---|---|
| A1 | `os_platform` now maps to spec-correct `os.platform` via alias resolution | 1 |
| A2 | `search` is forwarded natively as `search`, never rewritten into `q=name~...` | 1 |
| C-1 | `/security/resources` changed `resource` to `resource_list` | API Contract Gap |
| C-2 | `/tasks/status` extended from 1/13 to 12/13 params | API Contract Gap |
| C-3 | `ROOTCHECK_CONFIG` removed non-spec `pci_dss` and `cis` params | API Contract Gap |
| C-4 | Added missing security individual resource GETs (users/{id}, roles/{id}, policies/{id}, rules/{id}) | API Contract Gap |
| C-5 | Added missing cluster/manager API config GETs | API Contract Gap |

## Phase 2 Review Fixes — Coercion Trust Violations

Six issues identified during independent code review. All resolved.

| # | Severity | Issue | Resolution |
|---|---|---|---|
| 1 | Critical | `errors[]` dead infrastructure — always returned `[]` | Refactored coercers to return `CoerceResult` tuples `{ value, error }`. `brokerParams()` reads `result.error` and pushes to `errors[]`. Contract is now alive. |
| 2 | Critical | NaN coercion silently dropped params | `coerceNumber` returns `{ value: null, error: 'could not coerce "X" to number' }` on NaN. Error recorded, param omitted. |
| 3 | Moderate | `coerceBoolean` converted any truthy string to `"true"` | Strict semantics: `true`/`1` → `"true"`, `false`/`0` → `null` (omit), anything else → `{ value: null, error }`. |
| 4 | Moderate | `distinct: false` forwarded as `"false"` to Wazuh | Flag semantics: `false`/`0` returns `{ value: null, error: null }`. Recognized, not forwarded, no error. |
| 5 | Moderate | `status` CSV array blocked by Zod schema | Agents Zod schema updated to accept `z.array(z.string())` for status. Broker CSV capability now reachable from router. |
| 6 | Low | `level` in RULES_CONFIG had type `"string"` but accepted numbers | Custom `serialize()` on level handles both number and string input. NaN produces error. |

## Verification Scripts

**Broker Param Count Audit** (`scripts/verify-param-counts.mjs`): Cross-checks every broker-wired entry's `paramCount` against the actual `Object.keys(config.params).length` from `paramBroker.ts`. Handles both plain keys and quoted dotted keys (e.g., `"local.ip"`). Exits non-zero on any mismatch.

```bash
pnpm audit:broker
```

**OpenAPI Spec Diff** (`scripts/diff-wazuh-openapi.mjs`): Compares all GET endpoints in the Wazuh v4.14.3 OpenAPI spec against the `ENDPOINT_REGISTRY`. Enforces two guarantees: (1) every spec GET path is either wired or excluded, and (2) every extra registry path not in the spec is documented. Exits non-zero on any violation.

```bash
pnpm audit:openapi
```

Both checks are enforced in CI via the `broker-registry` and `openapi-diff` jobs in `.github/workflows/ci.yml`. The build job depends on both passing.

## Endpoint Governance

### Excluded Spec Endpoints (intentionally not wired)

Three spec GET endpoints are intentionally excluded from the router:

| Endpoint | Reason |
|---|---|
| `/agents/uninstall` | Write operation — violates read-only-by-default project constraint |
| `/agents/{agent_id}/key` | Returns agent registration key — sensitive credential exposure |
| `/security/user/authenticate` | Auth handled by Dang!'s own OAuth layer, not by proxying Wazuh tokens |

### Extra Registry Endpoints (not in spec, intentional)

Six registry endpoints exist in the router but are NOT defined as GET in the Wazuh v4.14.3 OpenAPI spec. Each is intentional and documented:

| Endpoint | Reason |
|---|---|
| `/` | Root API info endpoint. Returns Wazuh server metadata (version, cluster name). Not in spec but supported at runtime. |
| `/agents/{agent_id}` | Single-agent detail fetch by ID. The spec lists `/agents` with agent filtering, but the direct ID path works at runtime and is more ergonomic for detail views. |
| `/security/users/{user_id}` | Individual user retrieval. The spec only defines PUT on this path, but Wazuh accepts GET at runtime. Added as C-4 convenience endpoint. |
| `/security/roles/{role_id}` | Individual role retrieval. Same as users — spec has PUT only, runtime supports GET. Added as C-4 convenience endpoint. |
| `/security/policies/{policy_id}` | Individual policy retrieval. Same pattern — spec has PUT only, runtime supports GET. Added as C-4 convenience endpoint. |
| `/security/rules/{rule_id}` | Individual RBAC rule retrieval. Same pattern — spec has PUT only, runtime supports GET. Added as C-4 convenience endpoint. |

These are governed by `spec/openapi-allowlist.json` under the `"extra"` key. The `pnpm audit:openapi` script fails if any extra registry endpoint is not documented there.

### Current Inventory Summary

| Category | Count |
|---|---|
| Spec GET endpoints | 115 |
| Wired in registry | 112 |
| Excluded (allowlisted) | 3 |
| Missing | 0 |
| Extra (documented) | 6 |
