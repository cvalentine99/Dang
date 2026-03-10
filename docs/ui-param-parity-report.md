# UI → Router Schema Parity Report

**Generated:** 2026-03-10  
**Script:** `scripts/audit-ui-param-parity.mjs`  
**Callsites audited:** 182  
**Unique procedures consumed:** 128 of 129 total  

---

## Summary


| Metric | Count |
|--------|-------|
| Total callsites | 182 |
| Unique procedures consumed | 128 |
| Router procedures available | 129 |
| Parameters surfaced in UI | 99 |
| Parameters hardcoded/constant | 128 |
| Parameters not supported (classified) | 909 |
| Violations | 0 |

**No violations found.** All UI callsites pass only schema-valid keys, all required params are present, and every optional param is classified.

### Unconsumed Procedures (not called from any UI page)

| Procedure | Input Keys | Disposition |
|-----------|-----------|-------------|
| `remoted` | (void) | Backend-only / Not yet wired to UI |

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 446: `wazuh.agentPackages`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 455: `wazuh.agentServices`

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

### Line 464: `wazuh.agentUsers`

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

## client/src/components/shared/WazuhGuard.tsx

### Line 21: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 72: `wazuh.status`

Input: void (no parameters) — **OK**

## client/src/pages/AgentCompare.tsx

### Line 66: `wazuh.agents`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 437: `wazuh.agentById`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 442: `wazuh.scaPolicies`

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

### Line 64: `wazuh.agentOs`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 65: `wazuh.agentHardware`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 66: `wazuh.scaPolicies`

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

### Line 67: `wazuh.syscheckLastScan`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 68: `wazuh.agentGroupSync`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 567: `wazuh.syscheckFiles`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 573: `wazuh.syscheckLastScan`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 650: `wazuh.agentPackages`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 651: `wazuh.agentPorts`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 652: `wazuh.agentProcesses`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 653: `wazuh.agentNetiface`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `adapter` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `mac` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `mtu` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `state` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `type` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 654: `wazuh.agentNetaddr`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `address` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `broadcast` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `iface` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `netmask` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `proto` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 802: `wazuh.syscheckFiles`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 1022: `wazuh.agentConfig`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `component` | Required | Yes | Passed | **Surfaced** (required) |
| `configuration` | Required | Yes | Passed | **Surfaced** (required) |

### Line 1029: `wazuh.agentStats`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `component` | Optional | No | Passed | **Constant** (hardcoded: `statsComponent`) |

### Line 1035: `wazuh.agentDaemonStats`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `daemons_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 1043: `wazuh.agentKey`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 1311: `wazuh.rootcheckLastScan`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 1316: `wazuh.rootcheckResults`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `PAGE_SIZE`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `page * PAGE_SIZE`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 1543: `wazuh.ciscatResults`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `benchmark` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `error` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `fail` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `PAGE_SIZE`) |
| `notchecked` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `page * PAGE_SIZE`) |
| `pass` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `profile` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `score` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `unknown` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 1718: `wazuh.agentById`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

## client/src/pages/AgentHealth.tsx

### Line 88: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 91: `wazuh.agentSummaryStatus`

Input: void (no parameters) — **OK**

### Line 92: `wazuh.agentSummaryOs`

Input: void (no parameters) — **OK**

### Line 93: `wazuh.agentGroups`

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

### Line 108: `wazuh.agents`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 114: `wazuh.agentsOutdated`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `1`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 115: `wazuh.agentsNoGroup`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `1`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 127: `wazuh.agentsUpgradeResult`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agents_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `group` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `ip` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `manager` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `node_name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `os_name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `os_platform` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `os_version` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `registerIP` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `version` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 134: `wazuh.agentById`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 135: `wazuh.agentOs`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 136: `wazuh.agentHardware`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

## client/src/pages/AlertsTimeline.tsx

### Line 170: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 173: `wazuh.statsHourly`

Input: void (no parameters) — **OK**

### Line 174: `wazuh.statsWeekly`

Input: void (no parameters) — **OK**

## client/src/pages/BrokerCoverage.tsx

### Line 142: `wazuh.brokerCoverage`

Input: void (no parameters) — **OK**

## client/src/pages/BrokerPlayground.tsx

### Line 390: `wazuh.brokerConfigList`

Input: void (no parameters) — **OK**

### Line 391: `wazuh.brokerPlayground`

Input: mutation (params passed at call time via mutateAsync) — **OK**

## client/src/pages/ClusterHealth.tsx

### Line 220: `wazuh.clusterNodeStatus`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 224: `wazuh.clusterNodeConfiguration`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `field` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |
| `raw` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `section` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 228: `wazuh.clusterNodeDaemonStats`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `daemons_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 232: `wazuh.clusterNodeLogs`

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

### Line 236: `wazuh.clusterNodeLogsSummary`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 240: `wazuh.clusterNodeStatsAnalysisd`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 244: `wazuh.clusterNodeStatsRemoted`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 248: `wazuh.clusterNodeStatsWeekly`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 252: `wazuh.clusterNodeInfo`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 256: `wazuh.clusterNodeStats`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `date` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 260: `wazuh.clusterNodeStatsHourly`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 266: `wazuh.clusterNodeComponentConfig`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `component` | Required | Yes | Passed | **Surfaced** (required) |
| `configuration` | Required | Yes | Passed | **Surfaced** (required) |
| `nodeId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 616: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 618: `wazuh.managerStatus`

Input: void (no parameters) — **OK**

### Line 619: `wazuh.managerInfo`

Input: void (no parameters) — **OK**

### Line 620: `wazuh.statsHourly`

Input: void (no parameters) — **OK**

### Line 621: `wazuh.daemonStats`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `daemons` | Optional | No | Passed | **Constant** (hardcoded: `["wazuh-analysisd", "wazuh-remoted", "wa`) |

### Line 622: `wazuh.managerConfigValidation`

Input: void (no parameters) — **OK**

### Line 623: `wazuh.clusterStatus`

Input: void (no parameters) — **OK**

### Line 624: `wazuh.clusterNodes`

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

### Line 625: `wazuh.clusterHealthcheck`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `nodes_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 626: `wazuh.clusterLocalInfo`

Input: void (no parameters) — **OK**

### Line 627: `wazuh.clusterLocalConfig`

Input: void (no parameters) — **OK**

### Line 632: `wazuh.managerLogs`

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

### Line 638: `wazuh.managerConfiguration`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `field` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `raw` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `section` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 643: `wazuh.cacheStats`

Input: void (no parameters) — **OK**

### Line 644: `wazuh.cacheClear`

Input: mutation (params passed at call time via mutateAsync) — **OK**

### Line 645: `wazuh.cacheSetEnabled`

Input: mutation (params passed at call time via mutateAsync) — **OK**

### Line 646: `wazuh.cacheSetTtl`

Input: mutation (params passed at call time via mutateAsync) — **OK**

### Line 651: `wazuh.clusterApiConfig`

Input: void (no parameters) — **OK**

### Line 652: `wazuh.clusterConfigValidation`

Input: void (no parameters) — **OK**

### Line 653: `wazuh.clusterRulesetSync`

Input: void (no parameters) — **OK**

### Line 654: `wazuh.managerApiConfig`

Input: void (no parameters) — **OK**

## client/src/pages/Compliance.tsx

### Line 157: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 165: `wazuh.agents`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 171: `wazuh.scaPolicies`

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

### Line 172: `wazuh.scaChecks`

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

### Line 189: `wazuh.expCiscatResults`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agents_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `benchmark` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `error` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `fail` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `ciscatPageSize`) |
| `notchecked` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `ciscatPage * ciscatPageSize`) |
| `pass` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `profile` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `score` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `unknown` | Optional | No | — | **Not supported** — optional, not exposed in this view |

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 77: `wazuh.syscheckLastScan`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

## client/src/pages/FleetInventory.tsx

### Line 206: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 226: `wazuh.expSyscollectorPackages`

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

### Line 227: `wazuh.expSyscollectorProcesses`

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

### Line 228: `wazuh.expSyscollectorPorts`

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

### Line 229: `wazuh.expSyscollectorOs`

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

### Line 230: `wazuh.expSyscollectorHardware`

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

### Line 231: `wazuh.expSyscollectorHotfixes`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agents_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `hotfix` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Surfaced** |
| `offset` | Optional | No | Passed | **Surfaced** |
| `q` | Optional | No | Passed | **Constant** (hardcoded: `dynamic-spread`) |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 232: `wazuh.expSyscollectorNetaddr`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `address` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `agents_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `broadcast` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Surfaced** |
| `netmask` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Surfaced** |
| `proto` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | Passed | **Constant** (hardcoded: `dynamic-spread`) |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 233: `wazuh.expSyscollectorNetiface`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `adapter` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `agents_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Surfaced** |
| `mac` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `mtu` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Surfaced** |
| `q` | Optional | No | Passed | **Constant** (hardcoded: `dynamic-spread`) |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `state` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `type` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 234: `wazuh.expSyscollectorNetproto`

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

### Line 62: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 66: `wazuh.agentGroups`

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

### Line 70: `wazuh.agentsOutdated`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `100`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `outdatedPage * 100`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 79: `wazuh.agentsNoGroup`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `100`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `noGroupPage * 100`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 88: `wazuh.agentsStatsDistinct`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `fields` | Required | Yes | Passed | **Surfaced** (required) |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `100`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `distinctPage * 100`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 96: `wazuh.agentGroupMembers`

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

### Line 100: `wazuh.groupConfiguration`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `groupId` | Required | Yes | Passed | **Surfaced** (required) |
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 104: `wazuh.groupFiles`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `groupId` | Required | Yes | Passed | **Surfaced** (required) |
| `hash` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 108: `wazuh.groupFileContent`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `fileName` | Required | Yes | Passed | **Surfaced** (required) |
| `groupId` | Required | Yes | Passed | **Surfaced** (required) |
| `raw` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `type_agents` | Optional | No | — | **Not supported** — optional, not exposed in this view |

## client/src/pages/Home.tsx

### Line 228: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 231: `wazuh.agentSummaryStatus`

Input: void (no parameters) — **OK**

### Line 232: `wazuh.analysisd`

Input: void (no parameters) — **OK**

### Line 233: `wazuh.statsHourly`

Input: void (no parameters) — **OK**

### Line 234: `wazuh.managerStatus`

Input: void (no parameters) — **OK**

### Line 235: `wazuh.rules`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 236: `wazuh.agents`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 237: `wazuh.mitreTactics`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `mitre_tactic_ids` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 238: `wazuh.managerLogsSummary`

Input: void (no parameters) — **OK**

### Line 239: `wazuh.agentOverview`

Input: void (no parameters) — **OK**

### Line 240: `wazuh.agentsSummary`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agents_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |

## client/src/pages/ITHygiene.tsx

### Line 93: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 101: `wazuh.agents`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 111: `wazuh.agentPackages`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 115: `wazuh.agentPorts`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 119: `wazuh.agentProcesses`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 123: `wazuh.agentNetiface`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `adapter` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `mac` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `mtu` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `name` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `state` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `type` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 127: `wazuh.agentNetaddr`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `address` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `broadcast` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `iface` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `netmask` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `proto` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 131: `wazuh.agentNetproto`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `dhcp` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `gateway` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `iface` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `type` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 135: `wazuh.agentHotfixes`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `hotfix` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `pageSize`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `page * pageSize`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 141: `wazuh.agentBrowserExtensions`

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

### Line 147: `wazuh.agentServices`

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

### Line 153: `wazuh.agentUsers`

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

### Line 157: `wazuh.agentGroups2`

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

## client/src/pages/MitreAttack.tsx

### Line 109: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 119: `wazuh.mitreTactics`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `mitre_tactic_ids` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 120: `wazuh.mitreTechniques`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 121: `wazuh.mitreGroups`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `100`) |
| `mitre_group_ids` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 122: `wazuh.rules`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 123: `wazuh.mitreMetadata`

Input: void (no parameters) — **OK**

### Line 128: `wazuh.mitreSoftware`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `MITRE_PAGE_SIZE`) |
| `mitre_software_ids` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `softwarePage * MITRE_PAGE_SIZE`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 132: `wazuh.mitreMitigations`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `MITRE_PAGE_SIZE`) |
| `mitre_mitigation_ids` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `mitigationsPage * MITRE_PAGE_SIZE`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 136: `wazuh.mitreReferences`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `MITRE_PAGE_SIZE`) |
| `mitre_reference_ids` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `referencesPage * MITRE_PAGE_SIZE`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

## client/src/pages/RulesetExplorer.tsx

### Line 82: `wazuh.ruleFileContent`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `filename` | Required | Yes | Passed | **Surfaced** (required) |
| `get_dirnames_path` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `raw` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 83: `wazuh.decoderFileContent`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `filename` | Required | Yes | Passed | **Surfaced** (required) |
| `raw` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `relative_dirname` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 177: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 221: `wazuh.rules`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 225: `wazuh.decoders`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 229: `wazuh.ruleGroups`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 234: `wazuh.rulesFiles`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 238: `wazuh.decoderFiles`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 242: `wazuh.lists`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `filename` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `500`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `relative_dirname` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 246: `wazuh.listsFiles`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `filename` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `500`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `relative_dirname` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 255: `wazuh.decoderParents`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `DP_PAGE_SIZE`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `decoderParentsPage * DP_PAGE_SIZE`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 262: `wazuh.rulesByRequirement`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `requirement` | Required | Yes | Passed | **Surfaced** (required) |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 268: `wazuh.listsFileContent`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `filename` | Required | Yes | Passed | **Surfaced** (required) |
| `raw` | Optional | No | — | **Not supported** — optional, not exposed in this view |

## client/src/pages/SecurityExplorer.tsx

### Line 197: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 200: `wazuh.securityRbacRules`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `500`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `rule_ids` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 201: `wazuh.securityActions`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `endpoint` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 207: `wazuh.securityResources`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `resource` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 208: `wazuh.securityCurrentUserPolicies`

Input: void (no parameters) — **OK**

### Line 209: `wazuh.securityRoles`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `pageSize`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `rolesPage * pageSize`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `role_ids` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 218: `wazuh.securityUsers`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `pageSize`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `usersPage * pageSize`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `user_ids` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 227: `wazuh.securityPolicies`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `pageSize`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `policiesPage * pageSize`) |
| `policy_ids` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 236: `wazuh.securityCurrentUser`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 239: `wazuh.securityRoleById`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `roleId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 240: `wazuh.securityUserById`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `userId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 241: `wazuh.securityPolicyById`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `policyId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 242: `wazuh.securityRuleById`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `ruleId` | Required | Yes | Passed | **Surfaced** (required) |

## client/src/pages/SiemEvents.tsx

### Line 110: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 113: `wazuh.rules`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 117: `wazuh.agents`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

## client/src/pages/Status.tsx

### Line 541: `wazuh.apiInfo`

Input: void (no parameters) — **OK**

### Line 546: `wazuh.managerVersionCheck`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `force_query` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 551: `wazuh.securityConfig`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 566: `wazuh.managerStats`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `date` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 571: `wazuh.isConfigured`

Input: void (no parameters) — **OK**

### Line 580: `wazuh.managerComponentConfig`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `component` | Required | Yes | Passed | **Surfaced** (required) |
| `configuration` | Required | Yes | Passed | **Surfaced** (required) |

### Line 585: `wazuh.agentsUninstallPermission`

Input: void (no parameters) — **OK**

### Line 590: `wazuh.taskStatus`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agents_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `command` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `taskPageSize`) |
| `module` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `node` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `taskPage * taskPageSize`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `task_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |

## client/src/pages/ThreatHunting.tsx

### Line 247: `wazuh.agentSummaryStatus`

Input: void (no parameters) — **OK**

### Line 248: `wazuh.rules`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |

## client/src/pages/Vulnerabilities.tsx

### Line 105: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 112: `wazuh.agents`

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
| `wait_for_complete` | Optional | No | — | **Not supported** — optional, not exposed in this view |



---

*This report is deterministically generated by `scripts/audit-ui-param-parity.mjs`. Re-run to verify.*