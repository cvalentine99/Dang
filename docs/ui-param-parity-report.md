# UI → Router Schema Parity Report

**Generated:** 2026-03-08  
**Script:** `scripts/audit-ui-param-parity.mjs`  
**Callsites audited:** 169  
**Unique procedures consumed:** 114 of 123 total  

---

## Summary


| Metric | Count |
|--------|-------|
| Total callsites | 169 |
| Unique procedures consumed | 114 |
| Router procedures available | 123 |
| Parameters surfaced in UI | 95 |
| Parameters hardcoded/constant | 116 |
| Parameters not supported (classified) | 821 |
| Violations | 0 |

**No violations found.** All UI callsites pass only schema-valid keys, all required params are present, and every optional param is classified.

### Unconsumed Procedures (not called from any UI page)

| Procedure | Input Keys | Disposition |
|-----------|-----------|-------------|
| `clusterApiConfig` | (void) | Backend-only / Not yet wired to UI |
| `clusterConfigValidation` | (void) | Backend-only / Not yet wired to UI |
| `clusterRulesetSync` | (void) | Backend-only / Not yet wired to UI |
| `expCiscatResults` | limit, offset, search, q, sort, select, distinct, agents_list, benchmark, profile, pass, fail, error, notchecked, unknown, score | Backend-only / Not yet wired to UI |
| `managerApiConfig` | (void) | Backend-only / Not yet wired to UI |
| `securityPolicyById` | policyId | Backend-only / Not yet wired to UI |
| `securityRoleById` | roleId | Backend-only / Not yet wired to UI |
| `securityRuleById` | ruleId | Backend-only / Not yet wired to UI |
| `securityUserById` | userId | Backend-only / Not yet wired to UI |

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
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `500`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
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

### Line 65: `wazuh.agentHardware`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |

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

### Line 568: `wazuh.syscheckFiles`

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

### Line 574: `wazuh.syscheckLastScan`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 651: `wazuh.agentPackages`

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

### Line 652: `wazuh.agentPorts`

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

### Line 653: `wazuh.agentProcesses`

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

### Line 654: `wazuh.agentNetiface`

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

### Line 655: `wazuh.agentNetaddr`

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

### Line 803: `wazuh.syscheckFiles`

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

### Line 1023: `wazuh.agentConfig`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `component` | Required | Yes | Passed | **Surfaced** (required) |
| `configuration` | Required | Yes | Passed | **Surfaced** (required) |

### Line 1030: `wazuh.agentStats`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `component` | Optional | No | Passed | **Constant** (hardcoded: `statsComponent`) |

### Line 1036: `wazuh.agentDaemonStats`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `daemons_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 1044: `wazuh.agentKey`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 1312: `wazuh.rootcheckLastScan`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 1317: `wazuh.rootcheckResults`

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

### Line 1544: `wazuh.ciscatResults`

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

### Line 1719: `wazuh.agentById`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

## client/src/pages/AgentHealth.tsx

### Line 87: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 90: `wazuh.agentSummaryStatus`

Input: void (no parameters) — **OK**

### Line 91: `wazuh.agentSummaryOs`

Input: void (no parameters) — **OK**

### Line 92: `wazuh.agentGroups`

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

### Line 107: `wazuh.agents`

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

### Line 113: `wazuh.agentsOutdated`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `1`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 114: `wazuh.agentsNoGroup`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `1`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 126: `wazuh.agentsUpgradeResult`

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

### Line 131: `wazuh.agentById`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |

### Line 132: `wazuh.agentOs`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 133: `wazuh.agentHardware`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |

## client/src/pages/AlertsTimeline.tsx

### Line 169: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 172: `wazuh.statsHourly`

Input: void (no parameters) — **OK**

### Line 173: `wazuh.statsWeekly`

Input: void (no parameters) — **OK**

## client/src/pages/BrokerCoverage.tsx

### Line 140: `wazuh.brokerCoverage`

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
| `daemons_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |
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

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `nodes_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |

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
| `hotfix` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Surfaced** |
| `offset` | Optional | No | Passed | **Surfaced** |
| `q` | Optional | No | Passed | **Constant** (hardcoded: `dynamic-spread`) |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 170: `wazuh.expSyscollectorNetaddr`

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

### Line 171: `wazuh.expSyscollectorNetiface`

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
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 68: `wazuh.agentsNoGroup`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `100`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `noGroupPage * 100`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 72: `wazuh.agentsStatsDistinct`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `fields` | Required | Yes | Passed | **Surfaced** (required) |
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

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
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 84: `wazuh.groupFiles`

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

### Line 88: `wazuh.groupFileContent`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `fileName` | Required | Yes | Passed | **Surfaced** (required) |
| `groupId` | Required | Yes | Passed | **Surfaced** (required) |
| `raw` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `type_agents` | Optional | No | — | **Not supported** — optional, not exposed in this view |

## client/src/pages/Home.tsx

### Line 157: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 160: `wazuh.agentSummaryStatus`

Input: void (no parameters) — **OK**

### Line 161: `wazuh.analysisd`

Input: void (no parameters) — **OK**

### Line 162: `wazuh.statsHourly`

Input: void (no parameters) — **OK**

### Line 163: `wazuh.managerStatus`

Input: void (no parameters) — **OK**

### Line 164: `wazuh.rules`

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

### Line 165: `wazuh.agents`

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

### Line 166: `wazuh.mitreTactics`

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

### Line 167: `wazuh.agentOverview`

Input: void (no parameters) — **OK**

### Line 168: `wazuh.managerLogsSummary`

Input: void (no parameters) — **OK**

### Line 169: `wazuh.managerStats`

Input: void (no parameters) — **OK**

### Line 170: `wazuh.remoted`

Input: void (no parameters) — **OK**

### Line 171: `wazuh.agentsSummary`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agents_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |

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

### Line 126: `wazuh.agentNetaddr`

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

### Line 130: `wazuh.agentNetproto`

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

### Line 134: `wazuh.agentHotfixes`

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

### Line 140: `wazuh.agentBrowserExtensions`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `pageSize`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `page * pageSize`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

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
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `pageSize`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `page * pageSize`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 156: `wazuh.agentGroups2`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agentId` | Required | Yes | Passed | **Surfaced** (required) |
| `distinct` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `pageSize`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `page * pageSize`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
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

### Line 136: `wazuh.mitreReferences`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `MITRE_PAGE_SIZE`) |
| `mitre_reference_ids` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `referencesPage * MITRE_PAGE_SIZE`) |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

## client/src/pages/RulesetExplorer.tsx

### Line 86: `wazuh.ruleFileContent`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `filename` | Required | Yes | Passed | **Surfaced** (required) |
| `get_dirnames_path` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `raw` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 87: `wazuh.decoderFileContent`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `filename` | Required | Yes | Passed | **Surfaced** (required) |
| `get_dirnames_path` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `raw` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 181: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 225: `wazuh.rules`

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

### Line 229: `wazuh.decoders`

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

### Line 233: `wazuh.ruleGroups`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 238: `wazuh.rulesFiles`

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

### Line 242: `wazuh.decoderFiles`

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

### Line 246: `wazuh.lists`

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

### Line 250: `wazuh.listsFiles`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `filename` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `500`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `0`) |
| `relative_dirname` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 259: `wazuh.decoderParents`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | Passed | **Constant** (hardcoded: `DP_PAGE_SIZE`) |
| `offset` | Optional | No | Passed | **Constant** (hardcoded: `decoderParentsPage * DP_PAGE_SIZE`) |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 266: `wazuh.rulesByRequirement`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `requirement` | Required | Yes | Passed | **Surfaced** (required) |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 272: `wazuh.listsFileContent`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `filename` | Required | Yes | Passed | **Surfaced** (required) |
| `raw` | Optional | No | — | **Not supported** — optional, not exposed in this view |

## client/src/pages/SecurityExplorer.tsx

### Line 156: `wazuh.status`

Input: void (no parameters) — **OK**

### Line 159: `wazuh.securityRbacRules`

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

### Line 160: `wazuh.securityActions`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `endpoint` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 161: `wazuh.securityResources`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `resource` | Optional | No | — | **Not supported** — optional, not exposed in this view |

### Line 162: `wazuh.securityCurrentUserPolicies`

Input: void (no parameters) — **OK**

### Line 163: `wazuh.securityRoles`

Input: void (no parameters) — **OK**

### Line 164: `wazuh.securityUsers`

Input: void (no parameters) — **OK**

### Line 165: `wazuh.securityPolicies`

Input: void (no parameters) — **OK**

### Line 166: `wazuh.securityCurrentUser`

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

### Line 555: `wazuh.isConfigured`

Input: void (no parameters) — **OK**

### Line 562: `wazuh.managerComponentConfig`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `component` | Required | Yes | Passed | **Surfaced** (required) |
| `configuration` | Required | Yes | Passed | **Surfaced** (required) |

### Line 567: `wazuh.agentsUninstallPermission`

Input: void (no parameters) — **OK**

### Line 572: `wazuh.taskStatus`

| Parameter | Router | Required | UI Status | Classification |
|-----------|--------|----------|-----------|----------------|
| `agents_list` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `command` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `limit` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `module` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `node` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `offset` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `q` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `search` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `select` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `sort` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `status` | Optional | No | — | **Not supported** — optional, not exposed in this view |
| `taskIds` | Optional | No | — | **Not supported** — optional, not exposed in this view |

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











---

*This report is deterministically generated by `scripts/audit-ui-param-parity.mjs`. Re-run to verify.*