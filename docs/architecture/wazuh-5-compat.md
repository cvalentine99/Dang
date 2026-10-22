# Wazuh 5.0 compatibility (de-risk, 2026-10-21)

Status: Wazuh 5.0 is at rc1 with no GA date. This app targets the 4.14 Manager API
(`spec-v4.14.4.yaml`, path-identical to 4.14.9). Source: CODE_REVIEW_2026-10-21.md §8 Phase 3.

5.0 keeps auth and the response envelope the same. It **removes** `/syscollector/*`, `/syscheck*`, `/sca/*`,
`/rootcheck*`, `/rules*`, `/decoders*`, `/lists*` and `/experimental/*`. It **renames** `/manager/*` to `/cluster/*`,
and it **removes** the `wazuh-alerts-4.x-*` index. This document covers what the code does about that today.

## Switches

| Env | Values | Effect |
|---|---|---|
| `WAZUH_STATES_SOURCE` | `manager` (default) · `indexer` | `indexer`: the syscollector, syscheck and SCA procedures read `wazuh-states-*` through `server/indexer/statesClient.ts`. They return the same Manager envelope with Manager field names, so the client is unchanged. A kind falls back to the Manager when (a) its index pattern matches no index (checked with a cached `_cat/indices/wazuh-states-*` probe, 5 min TTL), or (b) the indexer is not configured. |
| `WAZUH_MANAGER_API_STYLE` | `manager` (default) · `cluster` | `cluster`: `managerPath()` (`server/wazuh/statesSource.ts`) rewrites the 1:1 renames to `/cluster/local/*`. Paths with no 5.0 equivalent fail with `PRECONDITION_FAILED` instead of being sent to a wrong path. |

Diagnostics: `wazuh.statesSource` (admin) returns the active source, the API style, and for each kind the
index pattern, whether the index exists, its doc count, whether the mapping is verified, and whether the kind is
served by the indexer right now.

## Index patterns (server/indexer/indexerClient.ts `INDEX_PATTERNS`)

4.x names state indices `<base>-<cluster>`. 5.0 drops the `-<cluster>` suffix. Every state pattern is written as
`<base>*`, which matches both forms. `VULNERABILITIES` changed from `wazuh-states-vulnerabilities-*` to
`wazuh-states-vulnerabilities*`.

Live inventory, Wazuh 4.14.9 indexer `192.168.50.158`, cluster `radiomancer`, 2026-10-21:

| Index | Docs | Notes |
|---|---|---|
| wazuh-states-inventory-packages-radiomancer | 1860 → 6029 | agent 002 enrolled during the session |
| wazuh-states-inventory-processes-radiomancer | 348 → 918 | |
| wazuh-states-inventory-ports-radiomancer | 197 → 247 | |
| wazuh-states-inventory-services-radiomancer | 188 → 441 | |
| wazuh-states-inventory-groups-radiomancer | 81 → 171 | |
| wazuh-states-inventory-users-radiomancer | 52 → 114 | |
| wazuh-states-inventory-browser-extensions-radiomancer | 14 → 29 | |
| wazuh-states-inventory-interfaces / networks / protocols / hardware / system | small | |
| wazuh-states-inventory-hotfixes-radiomancer | 0 | Linux-only agents; the mapping comes from `_mapping` |
| wazuh-states-vulnerabilities-radiomancer | 7912 | |
| wazuh-states-fim-* | **absent** | FIM/SCA state indices do not exist on 4.14.9 |
| wazuh-states-sca* | **absent** | |

Agent 000 (the manager) has no inventory documents on this host. Agents 001 and 002 do.

## Field mapping

`STATES_MAPPINGS` in `server/indexer/statesClient.ts` maps each kind's fields from indexer to Manager. Each entry
lists the Manager fields that have no indexer equivalent (`omitted`). `scan.id`, `scan.time` and `checksum` are
never available. Conversions:

- hardware: `ram.*` goes from bytes to KiB, and `ram.usage` from a 0..1 fraction to an integer percent.
- processes: `pid` becomes a string (per the spec), and `start_time` goes from ISO to epoch seconds.
- users and groups: booleans become `0/1`, and arrays are joined with `,`.
- netproto: `dhcp` goes from a boolean to `enabled`/`disabled`.
- netaddr and netproto: `proto`/`type` are lowercased.

Unavailable inputs:

- processes: `euser`, `egroup`, `ruser`, `rgroup`, `suser`, `sgroup`, `fgroup`, `nice`, `nlwp`, `pgrp`,
  `priority`, `processor`, `resident`, `session`, `share`, `size`, `tgid`, `tty` and `vm_size` are not in the
  4.14 index. Filtering or selecting on them returns `BAD_REQUEST` on the indexer source.
- users: `user.password_*` exists in the index, but both proxies strip every key that contains "password", so
  it is omitted on both paths.
- `distinct` and `q` with parentheses return `BAD_REQUEST`.
- `q` supports `;` (AND), `,` (OR) and `= != < > ~`.
- `search` is a case-insensitive `*term*` wildcard over the keyword fields marked `search`. All 4.14 state
  fields are `keyword`, so there is no text field for `multi_match`. A leading `-` negates the search, as in the
  Manager API.
- `sort` accepts `+a,-b` or `a:asc|desc`, and only on mapped fields.
- Pagination uses `from`/`size`, with `offset+limit ≤ 10000`.

**Unverified mappings.** FIM (`syscheck_files`, `syscheck_registries`) and SCA (`sca_policies`, `sca_checks`)
follow the Wazuh 5.0 WCS state templates and have not been checked against live data, because those indices do
not exist on 4.14. Re-check them against a 5.0 indexer before relying on them. Until the index exists, those
kinds use the Manager API even with `WAZUH_STATES_SOURCE=indexer`. 5.0 stores SCA as one document per check, so
`sca_policies` aggregates by `policy.id`: `pass`/`fail` counts, `score = floor(pass*100/(pass+fail))`, and
`start_scan`/`end_scan`/`hash_file` omitted.

## Endpoint table (brokerCoverage.ts ENDPOINT_REGISTRY)

| Procedure | 4.14 path | 5.0 status | Replacement | Dual-source flag covers it today |
|---|---|---|---|---|
| `status` | `/manager/status` | renamed | `/cluster/local/status` | **yes** — `WAZUH_MANAGER_API_STYLE=cluster` |
| `isConfigured` | `N/A (config check)` | kept | — | n/a |
| `managerInfo` | `/manager/info` | renamed | `/cluster/local/info` | **yes** — `WAZUH_MANAGER_API_STYLE=cluster` |
| `managerStatus` | `/manager/status` | renamed | `/cluster/local/status` | **yes** — `WAZUH_MANAGER_API_STYLE=cluster` |
| `managerConfiguration` | `/manager/configuration` | renamed | `/cluster/local/configuration` | **yes** — `WAZUH_MANAGER_API_STYLE=cluster` |
| `managerConfigValidation` | `/manager/configuration/validation` | renamed | `/cluster/configuration/validation` | **yes** — `WAZUH_MANAGER_API_STYLE=cluster` |
| `clusterConfigValidation` | `/cluster/configuration/validation` | kept | — | n/a |
| `managerStats` | `/manager/stats` | removed | none (unavailable on 5.0; use `wazuh-statistics-*` for daemon stats) | no — refuses with PRECONDITION_FAILED in `cluster` style |
| `statsHourly` | `/manager/stats/hourly` | removed | none (unavailable on 5.0; use `wazuh-statistics-*` for daemon stats) | no — refuses with PRECONDITION_FAILED in `cluster` style |
| `statsWeekly` | `/manager/stats/weekly` | removed | none (unavailable on 5.0; use `wazuh-statistics-*` for daemon stats) | no — refuses with PRECONDITION_FAILED in `cluster` style |
| `analysisd` | `/manager/stats/analysisd` | removed | none (unavailable on 5.0; use `wazuh-statistics-*` for daemon stats) | no — refuses with PRECONDITION_FAILED in `cluster` style |
| `remoted` | `/manager/stats/remoted` | removed | none (unavailable on 5.0; use `wazuh-statistics-*` for daemon stats) | no — refuses with PRECONDITION_FAILED in `cluster` style |
| `daemonStats` | `/manager/daemons/stats` | removed | none (unavailable on 5.0; use `wazuh-statistics-*` for daemon stats) | no — refuses with PRECONDITION_FAILED in `cluster` style |
| `managerLogs` | `/manager/logs` | renamed | `/cluster/local/logs` | **yes** — `WAZUH_MANAGER_API_STYLE=cluster` |
| `managerLogsSummary` | `/manager/logs/summary` | renamed | `/cluster/local/logs/summary` | **yes** — `WAZUH_MANAGER_API_STYLE=cluster` |
| `managerVersionCheck` | `/manager/version/check` | removed | none confirmed | no — refuses with PRECONDITION_FAILED in `cluster` style |
| `managerComponentConfig` | `/manager/configuration/{component}/{configuration}` | renamed | `/cluster/local/configuration/{component}/{configuration}` | **yes** — `WAZUH_MANAGER_API_STYLE=cluster` |
| `managerApiConfig` | `/manager/api/config` | renamed | `/cluster/api/config` (already wired as `clusterApiConfig`) | **yes** — `WAZUH_MANAGER_API_STYLE=cluster` |
| `clusterStatus` | `/cluster/status` | kept | — | n/a |
| `clusterNodes` | `/cluster/nodes` | kept | — | n/a |
| `clusterHealthcheck` | `/cluster/healthcheck` | kept | — | n/a |
| `clusterLocalInfo` | `/cluster/local/info` | kept | — | n/a |
| `clusterLocalConfig` | `/cluster/local/config` | kept | — | n/a |
| `clusterRulesetSync` | `/cluster/ruleset/synchronization` | kept | — | n/a |
| `clusterApiConfig` | `/cluster/api/config` | kept | — | n/a |
| `clusterNodeInfo` | `/cluster/{node_id}/info` | kept | — | n/a |
| `clusterNodeStats` | `/cluster/{node_id}/stats` | kept | — | n/a |
| `clusterNodeStatsHourly` | `/cluster/{node_id}/stats/hourly` | kept | — | n/a |
| `clusterNodeStatus` | `/cluster/{node_id}/status` | kept | — | n/a |
| `clusterNodeConfiguration` | `/cluster/{node_id}/configuration` | kept | — | n/a |
| `clusterNodeComponentConfig` | `/cluster/{node_id}/configuration/{component}/{configuration}` | kept | — | n/a |
| `clusterNodeDaemonStats` | `/cluster/{node_id}/daemons/stats` | kept | — | n/a |
| `clusterNodeLogs` | `/cluster/{node_id}/logs` | kept | — | n/a |
| `clusterNodeLogsSummary` | `/cluster/{node_id}/logs/summary` | kept | — | n/a |
| `clusterNodeStatsAnalysisd` | `/cluster/{node_id}/stats/analysisd` | kept | — | n/a |
| `clusterNodeStatsRemoted` | `/cluster/{node_id}/stats/remoted` | kept | — | n/a |
| `clusterNodeStatsWeekly` | `/cluster/{node_id}/stats/weekly` | kept | — | n/a |
| `agents` | `/agents` | kept | — | n/a |
| `agentSummaryStatus` | `/agents/summary/status` | kept | — | n/a |
| `agentSummaryOs` | `/agents/summary/os` | kept | — | n/a |
| `agentsSummary` | `/agents/summary` | kept | — | n/a |
| `agentOverview` | `/overview/agents` | kept | — | n/a |
| `agentById` | `/agents/{agent_id}` | kept | — | n/a |
| `agentDaemonStats` | `/agents/{agent_id}/daemons/stats` | kept | — | n/a |
| `agentStats` | `/agents/{agent_id}/stats/{component}` | kept | — | n/a |
| `agentConfig` | `/agents/{agent_id}/config/{component}/{configuration}` | kept | — | n/a |
| `agentsUpgradeResult` | `/agents/upgrade_result` | kept | — | n/a |
| `agentsUninstallPermission` | `N/A (permission check)` | kept | — | n/a |
| `agentGroupSync` | `/agents/{agent_id}/group/is_sync` | kept | — | n/a |
| `apiInfo` | `/` | kept | — | n/a |
| `agentGroups` | `/groups` | kept | — | n/a |
| `agentsOutdated` | `/agents/outdated` | kept | — | n/a |
| `agentsNoGroup` | `/agents/no_group` | kept | — | n/a |
| `agentsStatsDistinct` | `/agents/stats/distinct` | kept | — | n/a |
| `agentGroupMembers` | `/groups/{group_id}/agents` | kept | — | n/a |
| `agentOs` | `/syscollector/{agent_id}/os` | removed | `wazuh-states-inventory-system*` | **yes** — `WAZUH_STATES_SOURCE=indexer` |
| `agentHardware` | `/syscollector/{agent_id}/hardware` | removed | `wazuh-states-inventory-hardware*` | **yes** — `WAZUH_STATES_SOURCE=indexer` |
| `agentPackages` | `/syscollector/{agent_id}/packages` | removed | `wazuh-states-inventory-packages*` | **yes** — `WAZUH_STATES_SOURCE=indexer` |
| `agentPorts` | `/syscollector/{agent_id}/ports` | removed | `wazuh-states-inventory-ports*` | **yes** — `WAZUH_STATES_SOURCE=indexer` |
| `agentProcesses` | `/syscollector/{agent_id}/processes` | removed | `wazuh-states-inventory-processes*` | **yes** — `WAZUH_STATES_SOURCE=indexer` |
| `agentNetaddr` | `/syscollector/{agent_id}/netaddr` | removed | `wazuh-states-inventory-networks*` | **yes** — `WAZUH_STATES_SOURCE=indexer` |
| `agentNetiface` | `/syscollector/{agent_id}/netiface` | removed | `wazuh-states-inventory-interfaces*` | **yes** — `WAZUH_STATES_SOURCE=indexer` |
| `agentHotfixes` | `/syscollector/{agent_id}/hotfixes` | removed | `wazuh-states-inventory-hotfixes*` | **yes** — `WAZUH_STATES_SOURCE=indexer` |
| `agentBrowserExtensions` | `/syscollector/{agent_id}/browser_extensions` | removed | `wazuh-states-inventory-browser-extensions*` | **yes** — `WAZUH_STATES_SOURCE=indexer` |
| `agentServices` | `/syscollector/{agent_id}/services` | removed | `wazuh-states-inventory-services*` | **yes** — `WAZUH_STATES_SOURCE=indexer` |
| `agentUsers` | `/syscollector/{agent_id}/users` | removed | `wazuh-states-inventory-users*` | **yes** — `WAZUH_STATES_SOURCE=indexer` |
| `agentGroups2` | `/syscollector/{agent_id}/groups` | removed | `wazuh-states-inventory-groups*` | **yes** — `WAZUH_STATES_SOURCE=indexer` |
| `agentNetproto` | `/syscollector/{agent_id}/netproto` | removed | `wazuh-states-inventory-protocols*` | **yes** — `WAZUH_STATES_SOURCE=indexer` |
| `groupFiles` | `/groups/{group_id}/files` | kept | — | n/a |
| `expSyscollectorPackages` | `/experimental/syscollector/packages` | removed | `wazuh-states-inventory-packages*` (all agents) | no — cross-agent reads not ported |
| `expSyscollectorProcesses` | `/experimental/syscollector/processes` | removed | `wazuh-states-inventory-processes*` (all agents) | no — cross-agent reads not ported |
| `expSyscollectorPorts` | `/experimental/syscollector/ports` | removed | `wazuh-states-inventory-ports*` (all agents) | no — cross-agent reads not ported |
| `expSyscollectorNetaddr` | `/experimental/syscollector/netaddr` | removed | `wazuh-states-inventory-networks*` (all agents) | no — cross-agent reads not ported |
| `expSyscollectorNetiface` | `/experimental/syscollector/netiface` | removed | `wazuh-states-inventory-interfaces*` (all agents) | no — cross-agent reads not ported |
| `expSyscollectorNetproto` | `/experimental/syscollector/netproto` | removed | `wazuh-states-inventory-protocols*` (all agents) | no — cross-agent reads not ported |
| `expSyscollectorOs` | `/experimental/syscollector/os` | removed | `wazuh-states-inventory-system*` (all agents) | no — cross-agent reads not ported |
| `expSyscollectorHardware` | `/experimental/syscollector/hardware` | removed | `wazuh-states-inventory-hardware*` (all agents) | no — cross-agent reads not ported |
| `expSyscollectorHotfixes` | `/experimental/syscollector/hotfixes` | removed | `wazuh-states-inventory-hotfixes*` (all agents) | no — cross-agent reads not ported |
| `expCiscatResults` | `/experimental/ciscat/results` | removed | none in rc1 | no |
| `rules` | `/rules` | removed | none via Manager API (ruleset moves to the 5.0 engine/content service) | no |
| `ruleGroups` | `/rules/groups` | removed | none via Manager API (ruleset moves to the 5.0 engine/content service) | no |
| `rulesByRequirement` | `/rules/requirement/{requirement}` | removed | none via Manager API (ruleset moves to the 5.0 engine/content service) | no |
| `rulesFiles` | `/rules/files` | removed | none via Manager API (ruleset moves to the 5.0 engine/content service) | no |
| `ruleFileContent` | `/rules/files/{filename}` | removed | none via Manager API (ruleset moves to the 5.0 engine/content service) | no |
| `mitreTactics` | `/mitre/tactics` | kept | — | n/a |
| `mitreTechniques` | `/mitre/techniques` | kept | — | n/a |
| `mitreMitigations` | `/mitre/mitigations` | kept | — | n/a |
| `mitreSoftware` | `/mitre/software` | kept | — | n/a |
| `mitreGroups` | `/mitre/groups` | kept | — | n/a |
| `mitreMetadata` | `/mitre/metadata` | kept | — | n/a |
| `mitreReferences` | `/mitre/references` | kept | — | n/a |
| `scaPolicies` | `/sca/{agent_id}` | removed | `wazuh-states-sca*` (policy summary aggregated per `policy.id`) | **yes** (mapping unverified; falls back to manager while the index is absent, as on 4.14.9) |
| `scaChecks` | `/sca/{agent_id}/checks/{policy_id}` | removed | `wazuh-states-sca*` | **yes** (mapping unverified; falls back to manager while the index is absent, as on 4.14.9) |
| `ciscatResults` | `/ciscat/{agent_id}/results` | kept? | not in the review's removal list — verify against the 5.0 GA spec | n/a |
| `syscheckFiles` | `/syscheck/{agent_id}` | removed | `wazuh-states-fim-files*` / `wazuh-states-fim-registries*` | **yes** (mapping unverified; falls back to manager while the index is absent, as on 4.14.9) |
| `syscheckLastScan` | `/syscheck/{agent_id}/last_scan` | removed | none (no last-scan state doc) | no — manager-only |
| `rootcheckResults` | `/rootcheck/{agent_id}` | removed | none (rootcheck has no state index in 5.0) | no — manager-only |
| `rootcheckLastScan` | `/rootcheck/{agent_id}/last_scan` | removed | none (rootcheck has no state index in 5.0) | no — manager-only |
| `decoders` | `/decoders` | removed | none via Manager API (ruleset moves to the 5.0 engine/content service) | no |
| `decoderFiles` | `/decoders/files` | removed | none via Manager API (ruleset moves to the 5.0 engine/content service) | no |
| `decoderParents` | `/decoders/parents` | removed | none via Manager API (ruleset moves to the 5.0 engine/content service) | no |
| `decoderFileContent` | `/decoders/files/{filename}` | removed | none via Manager API (ruleset moves to the 5.0 engine/content service) | no |
| `taskStatus` | `/tasks/status` | kept | — | n/a |
| `securityRoles` | `/security/roles` | kept | — | n/a |
| `securityPolicies` | `/security/policies` | kept | — | n/a |
| `securityUsers` | `/security/users` | kept | — | n/a |
| `securityUserById` | `/security/users` | kept | — | n/a |
| `securityRoleById` | `/security/roles` | kept | — | n/a |
| `securityPolicyById` | `/security/policies` | kept | — | n/a |
| `securityRuleById` | `/security/rules` | kept | — | n/a |
| `securityConfig` | `/security/config` | kept | — | n/a |
| `securityCurrentUser` | `/security/users/me` | kept | — | n/a |
| `securityRbacRules` | `/security/rules` | kept | — | n/a |
| `securityActions` | `/security/actions` | kept | — | n/a |
| `securityResources` | `/security/resources` | kept | — | n/a |
| `securityCurrentUserPolicies` | `/security/users/me/policies` | kept | — | n/a |
| `lists` | `/lists` | removed | none via Manager API (ruleset moves to the 5.0 engine/content service) | no |
| `listsFiles` | `/lists/files` | removed | none via Manager API (ruleset moves to the 5.0 engine/content service) | no |
| `listsFileContent` | `/lists/files/{filename}` | removed | none via Manager API (ruleset moves to the 5.0 engine/content service) | no |
| `groupConfiguration` | `/groups/{group_id}/configuration` | kept | — | n/a |
| `groupFileContent` | `/groups/{group_id}/files/{file_name}` | kept | — | n/a |

Totals: kept: 63, kept?: 1, removed: 48, renamed: 9 (of 121 ENDPOINT_REGISTRY entries)

The review cites "79 of 150" using its own count over every wired path variant. The registry above has 121
entries; 57 of them sit under the removed or renamed roots.

## Remaining migration (out of scope here)

- **Alerts index.** `wazuh-alerts-*` has no 5.0 successor with the same schema. Its replacement,
  `wazuh-events-v5-*` (data streams), uses Wazuh Common Schema (ECS-style) field names: `rule.*`, `agent.*` and
  `data.*` move or change. Every alerts consumer must be ported: indexerRouter, hunt, correlationAgent,
  autoQueueRouter, alertQueueRouter, the SSE alert stream and the KG extractor. That needs a field translation
  layer like the one in this change, and it has not been done.
- Cross-agent `/experimental/syscollector/*` reads: the same indices without the `agent.id` filter. Not ported.
- `/rules`, `/decoders`, `/lists`, `/rootcheck`, `/syscheck/{id}/last_scan`, `/manager/stats*`,
  `/manager/daemons/stats` and `/manager/version/check` have no replacement in 5.0 rc1. Their UI panels need to be
  hidden or show "unavailable on 5.0".
- `/cluster/local/*` as the target of the `/manager/*` renames follows the review. Confirm it against the 5.0 GA
  spec when it ships.
