# UI → Router Schema Parity Report

**Generated:** 2026-03-05  
**Script:** `scripts/audit-ui-param-parity.mjs`  
**Callsites audited:** 155  
**Unique procedures consumed:** 100 of 113 total  

---

## Summary


| Metric | Count |
|--------|-------|
| Total callsites | 155 |
| Unique procedures consumed | 100 |
| Router procedures available | 113 |
| Parameters surfaced in UI | 90 |
| Parameters hardcoded/constant | 106 |
| Parameters not supported (classified) | 572 |
| Violations | 0 |

**No violations found.** All UI callsites pass only schema-valid keys, all required params are present, and every optional param is classified.

### Unconsumed Procedures (not called from any UI page)

| Procedure | Input Keys | Disposition |
|-----------|-----------|-------------|
| `agentGroupSync` | agentId | Backend-only / Not yet wired to UI |
| `agentsSummary` | agents_list | Backend-only / Not yet wired to UI |
| `agentsUninstallPermission` | (void) | Backend-only / Not yet wired to UI |
| `agentsUpgradeResult` | agents_list, q, os_platform, os_version, os_name, manager, version, group, node_name, name, ip, registerIP | Backend-only / Not yet wired to UI |
| `ciscatResults` | limit, offset, agentId, sort, search, select, q, distinct, benchmark, profile, pass, fail, error, notchecked, unknown, score | Backend-only / Not yet wired to UI |
| `decoderParents` | limit, offset, search | Backend-only / Not yet wired to UI |
| `isConfigured` | (void) | Backend-only / Not yet wired to UI |
| `managerComponentConfig` | component, configuration | Backend-only / Not yet wired to UI |
| `mitreMitigations` | limit, offset | Backend-only / Not yet wired to UI |
| `mitreReferences` | limit, offset | Backend-only / Not yet wired to UI |
| `mitreSoftware` | limit, offset | Backend-only / Not yet wired to UI |
| `rulesByRequirement` | requirement | Backend-only / Not yet wired to UI |
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

### Line 62: `wazuh.agentOs`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 63: `wazuh.agentHardware`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 64: `wazuh.scaPolicies`

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

### Line 65: `wazuh.syscheckLastScan`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 548: `wazuh.syscheckFiles`

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

### Line 554: `wazuh.syscheckLastScan`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 631: `wazuh.agentPackages`

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

### Line 632: `wazuh.agentPorts`

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

### Line 633: `wazuh.agentProcesses`

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

### Line 634: `wazuh.agentNetiface`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 635: `wazuh.agentNetaddr`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 783: `wazuh.syscheckFiles`

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

### Line 1003: `wazuh.agentConfig`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `component` | Required | Yes | Passed | **Surfaced** (required) |
| `configuration` | Required | Yes | Passed | **Surfaced** (required) |

### Line 1010: `wazuh.agentStats`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `component` | Optional | No | Passed | **Constant** (hardcoded: `statsComponent`) |

### Line 1016: `wazuh.agentDaemonStats`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 1024: `wazuh.agentKey`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 1292: `wazuh.rootcheckLastScan`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 1297: `wazuh.rootcheckResults`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `cis` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `PAGE_SIZE`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `page * PAGE_SIZE`) |
| `pci_dss` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `status` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 1523: `wazuh.agentById`

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

### Line 208: `wazuh.clusterNodeInfo`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 212: `wazuh.clusterNodeStats`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 216: `wazuh.clusterNodeStatsHourly`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 222: `wazuh.clusterNodeComponentConfig`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `component` | Required | Yes | Passed | **Surfaced** (required) |
| `configuration` | Required | Yes | Passed | **Surfaced** (required) |
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 516: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 518: `wazuh.managerStatus`

Input: void (no parameters) — **OK**

### Line 519: `wazuh.managerInfo`

Input: void (no parameters) — **OK**

### Line 520: `wazuh.statsHourly`

Input: void (no parameters) — **OK**

### Line 521: `wazuh.daemonStats`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `daemons` | Optional | No | Passed | **Constant** (hardcoded: `["wazuh-analysisd", "wazuh-remoted", "wa`) |

### Line 522: `wazuh.managerConfigValidation`

Input: void (no parameters) — **OK**

### Line 523: `wazuh.clusterStatus`

Input: void (no parameters) — **OK**

### Line 524: `wazuh.clusterNodes`

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

### Line 525: `wazuh.clusterHealthcheck`

Input: void (no parameters) — **OK**

### Line 526: `wazuh.clusterLocalInfo`

Input: void (no parameters) — **OK**

### Line 527: `wazuh.clusterLocalConfig`

Input: void (no parameters) — **OK**

### Line 532: `wazuh.managerLogs`

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

### Line 538: `wazuh.managerConfiguration`

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

## client/src/pages/GroupManagement.tsx

### Line 56: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 60: `wazuh.agentGroups`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `groups_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `hash` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `500`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 64: `wazuh.agentsOutdated`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `100`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `outdatedPage * 100`) |

### Line 68: `wazuh.agentsNoGroup`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `100`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `noGroupPage * 100`) |

### Line 72: `wazuh.agentsStatsDistinct`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `fields` | Required | Yes | Passed | **Surfaced** (required) |

### Line 76: `wazuh.agentGroupMembers`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `groupId` | Required | Yes | Passed | **Surfaced** (required) |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `100`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `membersPage * 100`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `status` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 80: `wazuh.groupConfiguration`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `groupId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 84: `wazuh.groupFiles`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `groupId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 88: `wazuh.groupFileContent`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `fileName` | Required | Yes | Passed | **Surfaced** (required) |
| `groupId` | Required | Yes | Passed | **Surfaced** (required) |

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

### Line 168: `wazuh.managerStats`

Input: void (no parameters) — **OK**

### Line 169: `wazuh.remoted`

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

### Line 108: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 118: `wazuh.mitreTactics`

Input: void (no parameters) — **OK**

### Line 119: `wazuh.mitreTechniques`

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

### Line 120: `wazuh.mitreGroups`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `100`) |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 121: `wazuh.rules`

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

### Line 122: `wazuh.mitreMetadata`

Input: void (no parameters) — **OK**

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

### Line 237: `wazuh.rulesFiles`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `500`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |

### Line 241: `wazuh.decoderFiles`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `500`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |

### Line 245: `wazuh.lists`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `500`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |

### Line 249: `wazuh.listsFiles`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `500`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |

### Line 256: `wazuh.listsFileContent`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `filename` | Required | Yes | Passed | **Surfaced** (required) |

## client/src/pages/SecurityExplorer.tsx

### Line 51: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 54: `wazuh.securityRbacRules`

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

### Line 55: `wazuh.securityActions`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `endpoint` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 56: `wazuh.securityResources`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `resource` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 57: `wazuh.securityCurrentUserPolicies`

Input: void (no parameters) — **OK**

### Line 58: `wazuh.securityRoles`

Input: void (no parameters) — **OK**

### Line 59: `wazuh.securityUsers`

Input: void (no parameters) — **OK**

### Line 60: `wazuh.securityPolicies`

Input: void (no parameters) — **OK**

### Line 61: `wazuh.securityCurrentUser`

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

## client/src/pages/Status.tsx

### Line 535: `wazuh.apiInfo`

Input: void (no parameters) — **OK**

### Line 540: `wazuh.managerVersionCheck`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `force_query` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 545: `wazuh.securityConfig`

Input: void (no parameters) — **OK**

### Line 550: `wazuh.managerStats`

Input: void (no parameters) — **OK**

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