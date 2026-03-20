# Wazuh Broker Coverage — GAP Assessment

> **STALE DOCUMENT** — The numbers below were captured on 2026-03-10 before Batch 1/2
> promotion sprints. Current state (2026-03-19): **78 broker / 0 manual / 43 passthrough**
> out of 121 endpoints. The category-level gaps below are largely resolved. See
> `generateCoverageReport()` in `server/wazuh/brokerCoverage.ts` for live truth.

**Date:** 2026-03-10 (snapshot — see notice above)
**Spec Version:** Wazuh REST API v4.14.3
**Source:** Broker Coverage Report (`/admin/broker-coverage`)
**Assessor:** Claude (automated static analysis)

---

## Executive Summary (current as of 2026-03-19)

The Dang! SIEM proxies **121 Wazuh API endpoints** through its tRPC router. After Batch 1 and Batch 2 promotion sprints, **64% (78)** are fully broker-wired with validated parameter handling. **0** use manual inline Zod schemas (all promoted). The remaining **36% (43)** are passthrough endpoints that either have zero spec-defined query params or use single-param path forwarding.

**Overall param coverage: 64%** broker-wired. The 43 passthrough endpoints are low-param or zero-param by spec.

| Metric | Value |
|---|---|
| Total Endpoints | 121 |
| Broker-Wired (full validation) | 78 (64%) |
| Manual-Param (inline Zod) | 0 (0%) |
| Passthrough (no params) | 43 (36%) |
| Total Broker Configs | 116 |
| Spec Version | 4.14.3 |

---

## GAP 1: Category-Level Coverage Failures

### Critical — Categories Below 50% Param Coverage

| Category | Total | Broker | Manual | Passthrough | Coverage | Risk |
|---|---|---|---|---|---|---|
| **Cluster** | 20 | 1 (5%) | 5 | 14 (70%) | **30%** | 14 of 20 cluster endpoints have zero param support. Cluster monitoring is effectively unpaginated/unfiltered. |
| **Security** | 13 | 1 (8%) | 4 | 8 (62%) | **38%** | 8 of 13 security endpoints are passthrough. RBAC listing, user enumeration, and policy queries cannot be filtered. |
| **Manager** | 17 | 4 (24%) | 3 | 10 (59%) | **41%** | Manager stats, logs summary, and config validation have zero query param support. |
| **Agents** | 18 | 3 (17%) | 6 | 9 (50%) | **50%** | Agent summaries, single-agent lookups, and upgrade results lack filtering. |

### Healthy — Categories at 100% Coverage

Syscollector (14), Experimental (10), Rules (5), MITRE (7), SCA (2), CIS-CAT (1), FIM (1), Syscheck (1), Rootcheck (2), Decoders (4), Tasks (1), Lists (3), Groups (2) — all at **100%** param coverage (broker + manual).

---

## GAP 2: Passthrough Endpoints Losing Spec-Defined Query Params

These passthrough endpoints have query parameters defined in the Wazuh v4.14.3 OpenAPI spec that are **silently dropped** by the router. Users cannot access these capabilities.

### High Severity — Filterable List Endpoints with 0 Params

| Endpoint | Spec Params Lost | Impact |
|---|---|---|
| `GET /security/roles` | offset, limit, sort, search, select, q, distinct, role_ids (8) | Cannot paginate or filter security roles — full dataset returned every time |
| `GET /security/policies` | offset, limit, sort, search, select, q, distinct, policy_ids (8) | Cannot paginate or filter security policies |
| `GET /security/users` | offset, limit, sort, search, select, q, distinct, user_ids (8) | Cannot paginate or filter security users |
| `GET /cluster/{node_id}/configuration` | section, field, raw (3) | Cannot filter cluster node configuration by section/field |

### Medium Severity — Endpoints Missing Specific Params

| Endpoint | Spec Params Lost | Impact |
|---|---|---|
| `GET /manager/stats` | date (1) | Cannot query stats for a specific date |
| `GET /cluster/{node_id}/stats` | date (1) | Cannot query per-node stats for a specific date |
| `GET /agents/upgrade_result` | agents_list (1) | Cannot filter upgrade results by specific agents |
| `GET /security/actions` | endpoint (1) | Cannot filter security actions by endpoint |

**Total: 31 spec-defined query parameters are silently dropped across 8 passthrough endpoints.**

---

## GAP 3: Manual Endpoints Not Broker-Wired (Validation Debt)

These 14 manual endpoints have **6+ parameters** each, using inline Zod schemas instead of the paramBroker validation framework. They lack broker-level guarantees: no coercion auditing, no `errors[]` array, no param count CI enforcement.

### Priority 1 — High param count, high usage

| Endpoint | Params | Category | Risk |
|---|---|---|---|
| `expSyscollectorNetiface` — `/experimental/syscollector/netiface` | 21 | Experimental | Highest param count of any manual endpoint. 21 params without broker coercion/error tracking. |
| `taskStatus` — `/tasks/status` | 12 | Tasks | Only task endpoint — 12 params including complex filters (task_list, agents_list, command, status). |
| `expSyscollectorNetaddr` — `/experimental/syscollector/netaddr` | 11 | Experimental | Cross-agent network address query with 11 unvalidated params. |

### Priority 2 — Medium param count, systematic gap

| Endpoint | Params | Category |
|---|---|---|
| `agentBrowserExtensions` — `/syscollector/{agent_id}/browser_extensions` | 8 | Syscollector |
| `agentUsers` — `/syscollector/{agent_id}/users` | 8 | Syscollector |
| `agentGroups2` — `/syscollector/{agent_id}/groups` | 8 | Syscollector |
| `expSyscollectorHotfixes` — `/experimental/syscollector/hotfixes` | 8 | Experimental |
| `clusterNodeLogs` — `/cluster/{node_id}/logs` | 7 | Cluster |
| `expSyscollectorNetproto` — `/experimental/syscollector/netproto` | 7 | Experimental |
| `expSyscollectorOs` — `/experimental/syscollector/os` | 7 | Experimental |
| `expSyscollectorHardware` — `/experimental/syscollector/hardware` | 7 | Experimental |
| `agentsOutdated` — `/agents/outdated` | 6 | Agents |
| `agentsNoGroup` — `/agents/no_group` | 6 | Agents |
| `agentsStatsDistinct` — `/agents/stats/distinct` | 6 | Agents |

**Total: 14 endpoints with 144 combined parameters operating without broker-level validation.**

---

## GAP 4: Broker Configs with Low Specific-Param Utilization

These broker configs rely almost entirely on universal params (offset/limit/sort/search/etc.) with very few or zero endpoint-specific params. This may indicate either (a) the spec defines more params that aren't modeled, or (b) the endpoint genuinely has minimal specific params.

| Config | Total | Universal | Specific | Utilization | Concern |
|---|---|---|---|---|---|
| **SYSCOLLECTOR_SERVICES_CONFIG** | 7 | 7 | **0** | **0%** | Zero endpoint-specific params — only universal pagination/sort. May be missing spec params. |
| **GROUP_AGENTS_CONFIG** | 8 | 7 | 1 | 13% | Only `status` — spec may define more agent-level filters. |
| **MITRE_TACTICS_CONFIG** | 8 | 7 | 1 | 13% | Only `mitre_tactic_ids` — aligned with spec. |
| **MITRE_TECHNIQUES_CONFIG** | 8 | 7 | 1 | 13% | Only `technique_ids` — aligned with spec. |
| **MITRE_GROUPS_CONFIG** | 8 | 7 | 1 | 13% | Only `mitre_group_ids` — aligned with spec. |
| **MITRE_MITIGATIONS_CONFIG** | 8 | 7 | 1 | 13% | Only `mitre_mitigation_ids` — aligned with spec. |
| **MITRE_SOFTWARE_CONFIG** | 8 | 7 | 1 | 13% | Only `mitre_software_ids` — aligned with spec. |
| **ROOTCHECK_CONFIG** | 8 | 7 | 1 | 13% | Only `status` — spec has `pci_dss`, `cis` removed as C-3 fix. Correct. |
| **SYSCOLLECTOR_HOTFIXES_CONFIG** | 8 | 7 | 1 | 13% | Only `hotfix`. |
| **GROUP_FILES_CONFIG** | 8 | 7 | 1 | 13% | Only `hash`. |
| **MITRE_REFERENCES_CONFIG** | 6 | 5 | 1 | 17% | Missing `select`, `q`, `distinct` vs. other MITRE configs. |
| **GROUPS_CONFIG** | 9 | 7 | 2 | 22% | `hash`, `groups_list`. |
| **CLUSTER_NODES_CONFIG** | 9 | 7 | 2 | 22% | `type`, `nodes_list`. |
| **MANAGER_LOGS_CONFIG** | 9 | 7 | 2 | 22% | `level`, `tag`. |
| **LISTS_CONFIG** | 9 | 7 | 2 | 22% | `filename`, `relative_dirname`. |

---

## GAP 5: Missing Validation Infrastructure

### 5a. No Per-Endpoint Spec-Param Parity Check

The ledger explicitly acknowledges: *"Full per-endpoint spec-param parity would require a fourth check that diffs each endpoint's spec parameters against its broker config — that does not exist yet."*

The three existing checks verify:
1. **Broker param count audit** — registry count matches `paramBroker.ts` key count
2. **OpenAPI spec diff** — every spec GET path is wired or excluded
3. **Vitest suite** — behavioral correctness

**Missing:** A check that verifies every parameter defined in the Wazuh OpenAPI spec for an endpoint is actually present in its broker config. Without this, an endpoint can be "broker-wired" but still silently omit spec-defined parameters.

### 5b. Manual Endpoints Have No CI Enforcement

Manual-param endpoints use inline Zod schemas with no automated cross-check against the spec. Parameters can drift, be misspelled, or omit spec additions without any CI failure.

### 5c. No Runtime Param Coverage Telemetry

There is no instrumentation to detect when users attempt to pass query parameters that the current wiring silently drops. This means the actual user impact of gaps is unmeasured.

---

## GAP 6: Cluster Category — Structural Weakness

The **Cluster** category has the worst coverage profile of any category:

- **20 endpoints total**, but only **1 broker-wired** (`clusterNodes`)
- **14 passthrough** endpoints (70%) — the highest passthrough ratio of any category
- **5 manual** endpoints
- Key per-node endpoints (`/cluster/{node_id}/configuration`, `/cluster/{node_id}/stats`) accept path params but cannot be filtered/paginated

In a multi-node Wazuh cluster, this means:
- Cluster node configurations cannot be queried by section/field
- Cluster stats cannot be filtered by date
- Cluster node logs summary, analysisd, and remoted stats are all passthrough-only

---

## GAP 7: Security Category — RBAC Blind Spots

The **Security** category at **38% coverage** is concerning for a SIEM:

| State | Endpoints |
|---|---|
| **Passthrough (8)** | securityRoles, securityPolicies, securityUsers, securityUserById, securityRoleById, securityPolicyById, securityRuleById, securityActions |
| **Manual (4)** | securityConfig, securityCurrentUser, securityRbacRules (3 params), securityResources (1 param) |
| **Broker (1)** | securityCurrentUserPolicies (4 params via MANAGER_CONFIG) |

The Wazuh spec defines **offset, limit, sort, search, select, q, distinct** plus entity-specific ID filters on the roles/policies/users list endpoints. All 24+ parameters are currently dropped.

---

## GAP 8: Frontend Does Not Wire Available Parameters

Analysis of all frontend tRPC hook calls reveals that even where the backend accepts parameters, **the frontend does not pass them**. The gap is end-to-end.

### Phase 1 Endpoints — Zero Frontend Params

All 8 critical passthrough endpoints are called with `undefined` or `{}` from the frontend. No pagination, search, sort, or filter controls exist:

| Endpoint | Frontend File | Called With |
|---|---|---|
| `securityRoles` | SecurityExplorer.tsx | `undefined` |
| `securityPolicies` | SecurityExplorer.tsx | `undefined` |
| `securityUsers` | SecurityExplorer.tsx | `undefined` |
| `securityActions` | SecurityExplorer.tsx | `{}` |
| `managerStats` | Status.tsx | `undefined` |
| `agentsUpgradeResult` | AgentHealth.tsx | `{}` |
| `clusterNodeConfiguration` | ClusterHealth.tsx | `{ nodeId }` only |
| `clusterNodeStats` | ClusterHealth.tsx | `{ nodeId }` only |

4 security individual-resource endpoints (`securityUserById`, `securityRoleById`, `securityPolicyById`, `securityRuleById`) are **not called anywhere** in the frontend.

### Phase 2 Endpoints — Pagination Only, No Filters

Manual endpoints use basic `limit`/`offset` but no sort, select, distinct, or endpoint-specific filters:

| Pattern | Endpoints | Params Passed | Params Missing |
|---|---|---|---|
| FleetInventory `qInput()` | 6 expSyscollector endpoints | limit, offset, q | sort, select, distinct + specific filters |
| ITHygiene direct | agentBrowserExtensions, agentUsers, agentGroups2 | agentId, limit, offset | sort, search, q, distinct, select |
| ClusterHealth logs | clusterNodeLogs | nodeId, limit, offset, search | sort, tag, level |
| Status tasks | taskStatus | `{}` (none) | All 12 params |
| Agent lists | agentsOutdated, agentsNoGroup | limit, offset | sort, search, select, q |
| Group stats | agentsStatsDistinct | fields | offset, limit, sort, search, q |

### Parameters Never Sent From Any Frontend Component

The following parameters exist in the Wazuh spec but are **never passed from any frontend file**:

`sort`, `select`, `distinct`, `date`, `role_ids`, `policy_ids`, `user_ids`, `section`, `field`, `raw`, `endpoint`, `agents_list`, `tag`, `level`

### Impact

Backend broker-wiring (Phases 1-2 of the remediation) is necessary but **not sufficient**. Without frontend UI controls, users have no way to access the recovered parameters. Each backend fix must be paired with a corresponding frontend update.

---

## Remediation Roadmap

### Phase 1: Critical Gaps (Security + Cluster Lists)
**Effort: Medium | Impact: High**

1. Broker-wire `/security/roles`, `/security/policies`, `/security/users` — 24 spec params recovered
2. Broker-wire `/cluster/{node_id}/configuration` — 3 spec params recovered
3. Add `date` param to `/manager/stats` and `/cluster/{node_id}/stats`
4. Add `agents_list` param to `/agents/upgrade_result`

**Outcome:** 31 silently-dropped spec params restored.

### Phase 2: Broker Upgrade for High-Param Manual Endpoints
**Effort: High | Impact: Medium**

1. Migrate `expSyscollectorNetiface` (21 params), `taskStatus` (12 params), `expSyscollectorNetaddr` (11 params) to broker configs
2. Migrate remaining 8-param syscollector manual endpoints: `agentBrowserExtensions`, `agentUsers`, `agentGroups2`
3. Migrate `clusterNodeLogs` (7 params) to broker

**Outcome:** 14 endpoints (144 params) gain broker-level coercion auditing and CI enforcement.

### Phase 3: Spec-Param Parity Check
**Effort: Medium | Impact: High (prevention)**

1. Build the "fourth check" — diff each broker config's params against the Wazuh OpenAPI spec params for that endpoint
2. Add CI enforcement so new spec releases automatically surface param gaps
3. Extend to manual endpoints with a lighter-weight schema comparison

**Outcome:** Prevents future silent param loss when Wazuh adds parameters to existing endpoints.

### Phase 4: Remaining Passthrough Cleanup
**Effort: Low | Impact: Low**

Most remaining passthrough endpoints genuinely have zero query params (summaries, healthchecks, config validation). For these, passthrough is the correct wiring. No action needed unless the Wazuh spec adds params to them in future versions.

---

## Appendix: Full Endpoint Inventory by Category

### Manager (17 endpoints — 41% coverage)
| Procedure | Path | Wiring | Params |
|---|---|---|---|
| status | /manager/status | passthrough | 0 |
| isConfigured | N/A (config check) | passthrough | 0 |
| managerInfo | /manager/info | broker | 4 |
| managerStatus | /manager/status | broker | 4 |
| managerConfiguration | /manager/configuration | broker | 4 |
| managerConfigValidation | /manager/configuration/validation | passthrough | 0 |
| managerStats | /manager/stats | passthrough | 0 |
| statsHourly | /manager/stats/hourly | passthrough | 0 |
| statsWeekly | /manager/stats/weekly | passthrough | 0 |
| analysisd | /manager/stats/analysisd | passthrough | 0 |
| remoted | /manager/stats/remoted | manual | 0 |
| daemonStats | /manager/daemons/stats | manual | 1 |
| managerLogs | /manager/logs | broker | 9 |
| managerLogsSummary | /manager/logs/summary | passthrough | 0 |
| managerVersionCheck | /manager/version/check | passthrough | 0 |
| managerComponentConfig | /manager/configuration/{component}/{configuration} | manual | 2 |
| managerApiConfig | /manager/api/config | passthrough | 0 |

### Cluster (20 endpoints — 30% coverage)
| Procedure | Path | Wiring | Params |
|---|---|---|---|
| clusterConfigValidation | /cluster/configuration/validation | passthrough | 0 |
| clusterStatus | /cluster/status | manual | 0 |
| clusterNodes | /cluster/nodes | broker | 9 |
| clusterHealthcheck | /cluster/healthcheck | manual | 1 |
| clusterLocalInfo | /cluster/local/info | passthrough | 0 |
| clusterLocalConfig | /cluster/local/config | passthrough | 0 |
| clusterRulesetSync | /cluster/ruleset/synchronization | passthrough | 0 |
| clusterApiConfig | /cluster/api/config | passthrough | 0 |
| clusterNodeInfo | /cluster/{node_id}/info | passthrough | 1 |
| clusterNodeStats | /cluster/{node_id}/stats | passthrough | 1 |
| clusterNodeStatsHourly | /cluster/{node_id}/stats/hourly | passthrough | 1 |
| clusterNodeStatus | /cluster/{node_id}/status | passthrough | 1 |
| clusterNodeConfiguration | /cluster/{node_id}/configuration | passthrough | 1 |
| clusterNodeComponentConfig | /cluster/{node_id}/configuration/{component}/{configuration} | manual | 3 |
| clusterNodeDaemonStats | /cluster/{node_id}/daemons/stats | manual | 2 |
| clusterNodeLogs | /cluster/{node_id}/logs | manual | 7 |
| clusterNodeLogsSummary | /cluster/{node_id}/logs/summary | passthrough | 1 |
| clusterNodeStatsAnalysisd | /cluster/{node_id}/stats/analysisd | passthrough | 1 |
| clusterNodeStatsRemoted | /cluster/{node_id}/stats/remoted | passthrough | 1 |
| clusterNodeStatsWeekly | /cluster/{node_id}/stats/weekly | passthrough | 1 |

### Security (13 endpoints — 38% coverage)
| Procedure | Path | Wiring | Params |
|---|---|---|---|
| securityRoles | /security/roles | passthrough | 0 |
| securityPolicies | /security/policies | passthrough | 0 |
| securityUsers | /security/users | passthrough | 0 |
| securityUserById | /security/users/{user_id} | passthrough | 1 |
| securityRoleById | /security/roles/{role_id} | passthrough | 1 |
| securityPolicyById | /security/policies/{policy_id} | passthrough | 1 |
| securityRuleById | /security/rules/{rule_id} | passthrough | 1 |
| securityConfig | /security/config | manual | 0 |
| securityCurrentUser | /security/users/me | manual | 0 |
| securityRbacRules | /security/rules | manual | 3 |
| securityActions | /security/actions | passthrough | 0 |
| securityResources | /security/resources | manual | 1 |
| securityCurrentUserPolicies | /security/users/me/policies | broker | 4 |

### Agents (18 endpoints — 50% coverage)
| Procedure | Path | Wiring | Params |
|---|---|---|---|
| agents | /agents | broker | 21 |
| agentSummaryStatus | /agents/summary/status | passthrough | 0 |
| agentSummaryOs | /agents/summary/os | passthrough | 0 |
| agentsSummary | /agents/summary | passthrough | 0 |
| agentOverview | /overview/agents | passthrough | 0 |
| agentById | /agents/{agent_id} | passthrough | 1 |
| agentDaemonStats | /agents/{agent_id}/daemons/stats | manual | 2 |
| agentStats | /agents/{agent_id}/stats/{component} | passthrough | 2 |
| agentConfig | /agents/{agent_id}/config/{component}/{configuration} | passthrough | 3 |
| agentsUpgradeResult | /agents/upgrade_result | passthrough | 0 |
| agentsUninstallPermission | N/A (permission check) | passthrough | 0 |
| agentGroupSync | /agents/{agent_id}/group/is_sync | manual | 1 |
| apiInfo | / | manual | 0 |
| agentGroups | /groups | broker | 9 |
| agentsOutdated | /agents/outdated | manual | 6 |
| agentsNoGroup | /agents/no_group | manual | 6 |
| agentsStatsDistinct | /agents/stats/distinct | manual | 6 |
| agentGroupMembers | /groups/{group_id}/agents | broker | 8 |
