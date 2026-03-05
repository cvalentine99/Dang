# UI → Router Schema Parity Report

**Generated:** 2026-03-05  
**Script:** `scripts/audit-ui-param-parity.mjs`  
**Callsites audited:** 121  
**Unique procedures consumed:** 71 of 113 total  

---

## Summary


| Metric | Count |
|--------|-------|
| Total callsites | 121 |
| Unique procedures consumed | 71 |
| Router procedures available | 113 |
| Parameters surfaced in UI | 75 |
| Parameters hardcoded/constant | 88 |
| Parameters not supported (classified) | 550 |
| Violations | 0 |

**No violations found.** All UI callsites pass only schema-valid keys, all required params are present, and every optional param is classified.

### Unconsumed Procedures (not called from any UI page)

| Procedure | Input Keys | Disposition |
|-----------|-----------|-------------|
| `agentGroupMembers` | limit, offset, groupId, search, sort, q, select, distinct, status | Backend-only / Not yet wired to UI |
| `agentGroupSync` | agentId | Backend-only / Not yet wired to UI |
| `agentsStatsDistinct` | fields | Backend-only / Not yet wired to UI |
| `agentsSummary` | agents_list | Backend-only / Not yet wired to UI |
| `agentsUninstallPermission` | (void) | Backend-only / Not yet wired to UI |
| `agentsUpgradeResult` | agents_list, q, os_platform, os_version, os_name, manager, version, group, node_name, name, ip, registerIP | Backend-only / Not yet wired to UI |
| `apiInfo` | (void) | Backend-only / Not yet wired to UI |
| `ciscatResults` | limit, offset, agentId, sort, search, select, q, distinct, benchmark, profile, pass, fail, error, notchecked, unknown, score | Backend-only / Not yet wired to UI |
| `clusterHealthcheck` | (void) | Backend-only / Not yet wired to UI |
| `clusterLocalConfig` | (void) | Backend-only / Not yet wired to UI |
| `clusterLocalInfo` | (void) | Backend-only / Not yet wired to UI |
| `clusterNodeComponentConfig` | nodeId, component, configuration | Backend-only / Not yet wired to UI |
| `clusterNodeInfo` | nodeId | Backend-only / Not yet wired to UI |
| `clusterNodeStats` | nodeId | Backend-only / Not yet wired to UI |
| `clusterNodeStatsHourly` | nodeId | Backend-only / Not yet wired to UI |
| `decoderFiles` | limit, offset | Backend-only / Not yet wired to UI |
| `decoderParents` | limit, offset, search | Backend-only / Not yet wired to UI |
| `groupConfiguration` | groupId | Backend-only / Not yet wired to UI |
| `groupFileContent` | groupId, fileName | Backend-only / Not yet wired to UI |
| `groupFiles` | groupId | Backend-only / Not yet wired to UI |
| `isConfigured` | (void) | Backend-only / Not yet wired to UI |
| `lists` | limit, offset | Backend-only / Not yet wired to UI |
| `listsFileContent` | filename | Backend-only / Not yet wired to UI |
| `listsFiles` | limit, offset | Backend-only / Not yet wired to UI |
| `managerComponentConfig` | component, configuration | Backend-only / Not yet wired to UI |
| `managerStats` | (void) | Backend-only / Not yet wired to UI |
| `managerVersionCheck` | force_query | Backend-only / Not yet wired to UI |
| `mitreMetadata` | (void) | Backend-only / Not yet wired to UI |
| `mitreMitigations` | limit, offset | Backend-only / Not yet wired to UI |
| `mitreReferences` | limit, offset | Backend-only / Not yet wired to UI |
| `mitreSoftware` | limit, offset | Backend-only / Not yet wired to UI |
| `remoted` | (void) | Backend-only / Not yet wired to UI |
| `rootcheckLastScan` | agentId | Backend-only / Not yet wired to UI |
| `rootcheckResults` | limit, offset, agentId, sort, search, select, q, distinct, status, pci_dss, cis | Backend-only / Not yet wired to UI |
| `rulesByRequirement` | requirement | Backend-only / Not yet wired to UI |
| `rulesFiles` | limit, offset | Backend-only / Not yet wired to UI |
| `securityConfig` | (void) | Backend-only / Not yet wired to UI |
| `securityCurrentUser` | (void) | Backend-only / Not yet wired to UI |
| `securityPolicies` | (void) | Backend-only / Not yet wired to UI |
| `securityRoles` | (void) | Backend-only / Not yet wired to UI |
| `securityUsers` | (void) | Backend-only / Not yet wired to UI |
| `taskStatus` | taskIds | Backend-only / Not yet wired to UI |

## client/src/components/DriftComparison.tsx

### Line 413: `wazuh.agents`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group_config_status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `ip` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `500`) |
| `manager` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `manager_host` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `node_name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `older_than` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `os_platform` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `registerIP` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `version` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 438: `wazuh.agentPackages`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `architecture` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `format` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `500`) |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `vendor` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `version` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 447: `wazuh.agentServices`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `500`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 456: `wazuh.agentUsers`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `500`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |

## client/src/components/shared/WazuhGuard.tsx

### Line 21: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 72: `wazuh.status`

Input: void (no parameters) — **OK**

## client/src/pages/AgentCompare.tsx

### Line 53: `wazuh.agents`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group_config_status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `ip` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `500`) |
| `manager` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `manager_host` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `node_name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `older_than` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `os_platform` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `registerIP` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | Passed | **Surfaced** |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `version` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 424: `wazuh.agentById`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 429: `wazuh.scaPolicies`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `description` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `references` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

## client/src/pages/AgentDetail.tsx

### Line 61: `wazuh.agentOs`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 62: `wazuh.agentHardware`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 63: `wazuh.scaPolicies`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `description` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `references` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 64: `wazuh.syscheckLastScan`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 547: `wazuh.syscheckFiles`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `arch` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `file` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `hash` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `pageSize`) |
| `md5` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `page * pageSize`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sha1` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sha256` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `summary` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `type` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 553: `wazuh.syscheckLastScan`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 630: `wazuh.agentPackages`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `architecture` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `format` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `pageSize`) |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `page * pageSize`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `vendor` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `version` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 631: `wazuh.agentPorts`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `pageSize`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `page * pageSize`) |
| `pid` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `process` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `protocol` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `state` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `tx_queue` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 632: `wazuh.agentProcesses`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `egroup` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `euser` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `fgroup` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `pageSize`) |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `nlwp` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `page * pageSize`) |
| `pgrp` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `pid` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `ppid` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `priority` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `rgroup` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `ruser` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sgroup` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `state` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `suser` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 633: `wazuh.agentNetiface`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 634: `wazuh.agentNetaddr`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 782: `wazuh.syscheckFiles`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `arch` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `file` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `hash` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `100`) |
| `md5` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sha1` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sha256` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `summary` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `type` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 1002: `wazuh.agentConfig`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `component` | Required | Yes | Passed | **Surfaced** (required) |
| `configuration` | Required | Yes | Passed | **Surfaced** (required) |

### Line 1009: `wazuh.agentStats`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `component` | Optional | No | Passed | **Constant** (hardcoded: `statsComponent`) |

### Line 1015: `wazuh.agentDaemonStats`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 1023: `wazuh.agentKey`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 1283: `wazuh.agentById`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

## client/src/pages/AgentHealth.tsx

### Line 85: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 88: `wazuh.agentSummaryStatus`

Input: void (no parameters) — **OK**

### Line 89: `wazuh.agentSummaryOs`

Input: void (no parameters) — **OK**

### Line 90: `wazuh.agentGroups`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `groups_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `hash` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 105: `wazuh.agents`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group_config_status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `ip` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `manager` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `manager_host` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `node_name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `older_than` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `os_platform` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `registerIP` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `version` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 111: `wazuh.agentsOutdated`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `1`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |

### Line 112: `wazuh.agentsNoGroup`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `1`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |

### Line 124: `wazuh.agentById`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 125: `wazuh.agentOs`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 126: `wazuh.agentHardware`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

## client/src/pages/AlertsTimeline.tsx

### Line 167: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 170: `wazuh.statsHourly`

Input: void (no parameters) — **OK**

### Line 171: `wazuh.statsWeekly`

Input: void (no parameters) — **OK**

## client/src/pages/ClusterHealth.tsx

### Line 176: `wazuh.clusterNodeStatus`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 180: `wazuh.clusterNodeConfiguration`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 184: `wazuh.clusterNodeDaemonStats`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 188: `wazuh.clusterNodeLogs`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `level` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `logPageSize`) |
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `(logPage - 1) * logPageSize`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `tag` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 192: `wazuh.clusterNodeLogsSummary`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 196: `wazuh.clusterNodeStatsAnalysisd`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 200: `wazuh.clusterNodeStatsRemoted`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 204: `wazuh.clusterNodeStatsWeekly`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 402: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 404: `wazuh.managerStatus`

Input: void (no parameters) — **OK**

### Line 405: `wazuh.managerInfo`

Input: void (no parameters) — **OK**

### Line 406: `wazuh.statsHourly`

Input: void (no parameters) — **OK**

### Line 407: `wazuh.daemonStats`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `daemons` | Optional | No | Passed | **Constant** (hardcoded: `["wazuh-analysisd", "wazuh-remoted", "wa`) |

### Line 408: `wazuh.managerConfigValidation`

Input: void (no parameters) — **OK**

### Line 409: `wazuh.clusterStatus`

Input: void (no parameters) — **OK**

### Line 410: `wazuh.clusterNodes`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `nodes_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `type` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 415: `wazuh.managerLogs`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `level` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `20`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `mgrLogPage * 20`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `tag` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 421: `wazuh.managerConfiguration`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `field` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `raw` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `section` | Optional | No | — | **Not supported** — optional, not exposed in this view |

## client/src/pages/Compliance.tsx

### Line 145: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 153: `wazuh.agents`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group_config_status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `ip` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `100`) |
| `manager` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `manager_host` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `node_name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `older_than` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `os_platform` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `registerIP` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `status` | Optional | No | Passed | **Constant** (hardcoded: `"active"`) |
| `version` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 159: `wazuh.scaPolicies`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `description` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `references` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 160: `wazuh.scaChecks`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `command` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `condition` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `description` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `directory` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `file` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `policyId` | Required | Yes | Passed | **Surfaced** (required) |
| `process` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `rationale` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `reason` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `references` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `registry` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `remediation` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `result` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `title` | Optional | No | — | **Not supported** — optional, not exposed in this view |

## client/src/pages/FileIntegrity.tsx

### Line 64: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 67: `wazuh.agents`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group_config_status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `ip` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `100`) |
| `manager` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `manager_host` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `node_name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `older_than` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `os_platform` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `registerIP` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `status` | Optional | No | Passed | **Constant** (hardcoded: `"active"`) |
| `version` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 73: `wazuh.syscheckFiles`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `arch` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `file` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `hash` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `pageSize`) |
| `md5` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `page * pageSize`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | Passed | **Surfaced** |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sha1` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sha256` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `summary` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `type` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 77: `wazuh.syscheckLastScan`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

## client/src/pages/FleetInventory.tsx

### Line 147: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 164: `wazuh.expSyscollectorPackages`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agents_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `architecture` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `format` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Surfaced** |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Surfaced** |
| `q` | Optional | No | Passed | **Constant** (hardcoded: `dynamic-spread`) |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `vendor` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `version` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 165: `wazuh.expSyscollectorProcesses`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agents_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `egroup` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `euser` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `fgroup` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Surfaced** |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `nlwp` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Surfaced** |
| `pgrp` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `pid` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `ppid` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `priority` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | Passed | **Constant** (hardcoded: `dynamic-spread`) |
| `rgroup` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `ruser` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sgroup` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `state` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `suser` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 166: `wazuh.expSyscollectorPorts`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agents_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Surfaced** |
| `offset` | Optional | No | Passed | **Surfaced** |
| `pid` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `process` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `protocol` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | Passed | **Constant** (hardcoded: `dynamic-spread`) |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `state` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `tx_queue` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 167: `wazuh.expSyscollectorOs`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agents_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Surfaced** |
| `offset` | Optional | No | Passed | **Surfaced** |
| `q` | Optional | No | Passed | **Constant** (hardcoded: `dynamic-spread`) |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 168: `wazuh.expSyscollectorHardware`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agents_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Surfaced** |
| `offset` | Optional | No | Passed | **Surfaced** |
| `q` | Optional | No | Passed | **Constant** (hardcoded: `dynamic-spread`) |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 169: `wazuh.expSyscollectorHotfixes`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agents_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Surfaced** |
| `offset` | Optional | No | Passed | **Surfaced** |
| `q` | Optional | No | Passed | **Constant** (hardcoded: `dynamic-spread`) |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 170: `wazuh.expSyscollectorNetaddr`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agents_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Surfaced** |
| `offset` | Optional | No | Passed | **Surfaced** |
| `q` | Optional | No | Passed | **Constant** (hardcoded: `dynamic-spread`) |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 171: `wazuh.expSyscollectorNetiface`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agents_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Surfaced** |
| `offset` | Optional | No | Passed | **Surfaced** |
| `q` | Optional | No | Passed | **Constant** (hardcoded: `dynamic-spread`) |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 172: `wazuh.expSyscollectorNetproto`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agents_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Surfaced** |
| `offset` | Optional | No | Passed | **Surfaced** |
| `q` | Optional | No | Passed | **Constant** (hardcoded: `dynamic-spread`) |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

## client/src/pages/Home.tsx

### Line 156: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 159: `wazuh.agentSummaryStatus`

Input: void (no parameters) — **OK**

### Line 160: `wazuh.analysisd`

Input: void (no parameters) — **OK**

### Line 161: `wazuh.statsHourly`

Input: void (no parameters) — **OK**

### Line 162: `wazuh.managerStatus`

Input: void (no parameters) — **OK**

### Line 163: `wazuh.rules`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `filename` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `gdpr` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `gpg13` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `hipaa` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `level` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `10`) |
| `mitre` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `pci_dss` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `relative_dirname` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `rule_ids` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | Passed | **Constant** (hardcoded: `"-level"`) |
| `status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `tsc` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 164: `wazuh.agents`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group_config_status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `ip` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `8`) |
| `manager` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `manager_host` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `node_name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `older_than` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `os_platform` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `registerIP` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | Passed | **Constant** (hardcoded: `"-dateAdd"`) |
| `status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `version` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 165: `wazuh.mitreTactics`

Input: void (no parameters) — **OK**

### Line 166: `wazuh.agentOverview`

Input: void (no parameters) — **OK**

### Line 167: `wazuh.managerLogsSummary`

Input: void (no parameters) — **OK**

## client/src/pages/ITHygiene.tsx

### Line 92: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 100: `wazuh.agents`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group_config_status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `ip` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `100`) |
| `manager` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `manager_host` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `node_name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `older_than` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `os_platform` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `registerIP` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `status` | Optional | No | Passed | **Constant** (hardcoded: `"active"`) |
| `version` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 110: `wazuh.agentPackages`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `architecture` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `format` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `pageSize`) |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `page * pageSize`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | Passed | **Surfaced** |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `vendor` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `version` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 114: `wazuh.agentPorts`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `pageSize`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `page * pageSize`) |
| `pid` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `process` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `protocol` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `state` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `tx_queue` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 118: `wazuh.agentProcesses`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `egroup` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `euser` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `fgroup` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `pageSize`) |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `nlwp` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `page * pageSize`) |
| `pgrp` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `pid` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `ppid` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `priority` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `rgroup` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `ruser` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | Passed | **Surfaced** |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sgroup` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `state` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `suser` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 122: `wazuh.agentNetiface`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 126: `wazuh.agentNetaddr`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 130: `wazuh.agentNetproto`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 134: `wazuh.agentHotfixes`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `pageSize`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `page * pageSize`) |

### Line 140: `wazuh.agentBrowserExtensions`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `pageSize`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `page * pageSize`) |

### Line 146: `wazuh.agentServices`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `pageSize`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `page * pageSize`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 152: `wazuh.agentUsers`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `pageSize`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `page * pageSize`) |

### Line 156: `wazuh.agentGroups2`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `pageSize`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `page * pageSize`) |

## client/src/pages/MitreAttack.tsx

### Line 107: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 117: `wazuh.mitreTactics`

Input: void (no parameters) — **OK**

### Line 118: `wazuh.mitreTechniques`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `500`) |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `technique_ids` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 119: `wazuh.mitreGroups`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `100`) |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 120: `wazuh.rules`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `filename` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `gdpr` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `gpg13` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `hipaa` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `level` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `500`) |
| `mitre` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `pci_dss` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `relative_dirname` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `rule_ids` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | Passed | **Constant** (hardcoded: `"-level"`) |
| `status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `tsc` | Optional | No | — | **Not supported** — optional, not exposed in this view |

## client/src/pages/RulesetExplorer.tsx

### Line 85: `wazuh.ruleFileContent`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `filename` | Required | Yes | Passed | **Surfaced** (required) |

### Line 86: `wazuh.decoderFileContent`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `filename` | Required | Yes | Passed | **Surfaced** (required) |

### Line 180: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 224: `wazuh.rules`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `filename` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `gdpr` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `gpg13` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `hipaa` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `level` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `mitre` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `pci_dss` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `relative_dirname` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `rule_ids` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `tsc` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 228: `wazuh.decoders`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `decoder_names` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `filename` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `500`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `relative_dirname` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `status` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 232: `wazuh.ruleGroups`

Input: void (no parameters) — **OK**

## client/src/pages/SecurityExplorer.tsx

### Line 47: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 50: `wazuh.securityRbacRules`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `500`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `rule_ids` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 51: `wazuh.securityActions`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `endpoint` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 52: `wazuh.securityResources`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `resource` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 53: `wazuh.securityCurrentUserPolicies`

Input: void (no parameters) — **OK**

## client/src/pages/SiemEvents.tsx

### Line 113: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 116: `wazuh.rules`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `filename` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `gdpr` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `gpg13` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `hipaa` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `level` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `500`) |
| `mitre` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `pci_dss` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `relative_dirname` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `rule_ids` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `tsc` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 120: `wazuh.agents`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group_config_status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `ip` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `500`) |
| `manager` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `manager_host` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `node_name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `older_than` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `os_platform` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `registerIP` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `version` | Optional | No | — | **Not supported** — optional, not exposed in this view |

## client/src/pages/ThreatHunting.tsx

### Line 248: `wazuh.agentSummaryStatus`

Input: void (no parameters) — **OK**

### Line 249: `wazuh.rules`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `filename` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `gdpr` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `gpg13` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `hipaa` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `level` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `1`) |
| `mitre` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `pci_dss` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `relative_dirname` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `rule_ids` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `tsc` | Optional | No | — | **Not supported** — optional, not exposed in this view |

## client/src/pages/Vulnerabilities.tsx

### Line 102: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 109: `wazuh.agents`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group_config_status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `ip` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `100`) |
| `manager` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `manager_host` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `node_name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `older_than` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `os_platform` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `registerIP` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `status` | Optional | No | Passed | **Constant** (hardcoded: `"active"`) |
| `version` | Optional | No | — | **Not supported** — optional, not exposed in this view |












































---

*This report is deterministically generated by `scripts/audit-ui-param-parity.mjs`. Re-run to verify.*