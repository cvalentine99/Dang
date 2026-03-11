# Dang! API Call Audit Report

**Date:** 2026-02-27  
**Scope:** Every tRPC procedure, every external API call, every dashboard page  
**Spec:** Wazuh OpenAPI v4.14.3  
**Tests:** 357/357 passing  

---

## Critical Issues

### 1. `wazuh.agentVulnerabilities` — BROKEN ENDPOINT

| Field | Value |
|-------|-------|
| Router | `server/wazuh/wazuhRouter.ts:449` |
| Calls | `GET /vulnerability/{agent_id}` |
| Frontend | `Vulnerabilities.tsx:123` (agent view mode) |
| Spec Status | **DOES NOT EXIST** in v4.14.3 |

The `/vulnerability/{agent_id}` endpoint was removed in Wazuh 4.8. Vulnerability data now lives exclusively in the **Wazuh Indexer** under the `wazuh-states-vulnerabilities-*` index pattern. The indexer-based queries (`vulnSearch`, `vulnAggBySeverity`, etc.) are correct and working. The `agentVulnerabilities` procedure will return a 404 or connection error when called against a real Wazuh 4.14.3 instance.

**Fix:** Remove the `agentVulnerabilities` procedure from `wazuhRouter.ts`. In `Vulnerabilities.tsx`, replace the agent-view mode to query the indexer with an `agent.id` filter instead of calling the Wazuh Manager API.

### 2. `wazuh.activeResponseList` — WRONG HTTP METHOD

| Field | Value |
|-------|-------|
| Router | `server/wazuh/wazuhRouter.ts:608` |
| Calls | `GET /active-response` |
| Spec Status | Only `PUT /active-response` exists (trigger action) |
| Frontend | **Not used by any page** |

The spec only defines `PUT /active-response` (which triggers an active response — a write operation). There is no `GET /active-response` endpoint. This procedure will 405 on a real Wazuh instance.

**Fix:** Remove the `activeResponseList` procedure entirely. It's not used by any frontend page and the endpoint doesn't exist as a GET.

### 3. `syscheckFiles` — INVALID PARAMETER `event`

| Field | Value |
|-------|-------|
| Router | `server/wazuh/wazuhRouter.ts:513` |
| Calls | `GET /syscheck/{agent_id}` with `event` param |
| Frontend | `FileIntegrity.tsx` |
| Spec Status | `event` is **not a valid parameter** for this endpoint |

The `event` parameter (added/modified/deleted) is not in the v4.14.3 spec for `GET /syscheck/{agent_id}`. The valid filter parameters are: `file`, `arch`, `value.name`, `value.type`, `type`, `summary`, `md5`, `sha1`, `sha256`, `hash`, `distinct`, `q`. Wazuh may silently ignore the invalid param or return an error.

**Fix:** Remove the `event` input field from the `syscheckFiles` procedure. If event-type filtering is needed, use the `q` parameter with a query filter expression.

---

## Warnings (Deprecated but Functional)

### 4. `wazuh.analysisd` — DEPRECATED

| Field | Value |
|-------|-------|
| Router | `server/wazuh/wazuhRouter.ts:69` |
| Calls | `GET /manager/stats/analysisd` |
| Frontend | `Home.tsx`, `ClusterHealth.tsx` |
| Spec Status | **DEPRECATED** — will be removed in a future version |

**Recommendation:** Migrate to `GET /manager/daemons/stats` with `daemons_list=wazuh-analysisd` (which the router already has as `daemonStats`).

### 5. `wazuh.remoted` — DEPRECATED

| Field | Value |
|-------|-------|
| Router | `server/wazuh/wazuhRouter.ts:70` |
| Calls | `GET /manager/stats/remoted` |
| Frontend | Not directly used by any page |
| Spec Status | **DEPRECATED** — will be removed in a future version |

**Recommendation:** Migrate to `GET /manager/daemons/stats` with `daemons_list=wazuh-remoted`.

---

## Service Connection Map

| Service | Host | Port | Protocol | Used By |
|---------|------|------|----------|---------|
| Wazuh Manager API | `localhost` | 55000 | HTTPS | wazuhRouter (67 procedures) |
| Wazuh Indexer | `localhost` | 9200 | HTTPS | indexerRouter (19 procedures) |
| LLM (Nemotron Nano) | `192.168.50.110` | 30000 | HTTP | llmService, hybridragRouter, agenticPipeline |
| Splunk ES (HEC) | `192.168.50.213` | 8088 | HTTPS | splunkRouter (7 procedures) |
| AlienVault OTX | `otx.alienvault.com` | 443 | HTTPS | otxRouter (7 procedures) |
| Built-in LLM (Manus) | via `BUILT_IN_FORGE_API_URL` | — | HTTPS | llmService (fallback) |

---

## Dashboard → API Call Matrix

### Home.tsx (Main SOC Dashboard)

| tRPC Call | External API | Endpoint | Status |
|-----------|-------------|----------|--------|
| `wazuh.status` | Wazuh Manager | `GET /manager/info` | OK |
| `wazuh.managerStatus` | Wazuh Manager | `GET /manager/status` | OK |
| `wazuh.agentSummaryStatus` | Wazuh Manager | `GET /agents/summary/status` | OK |
| `wazuh.agents` | Wazuh Manager | `GET /agents` | OK |
| `wazuh.analysisd` | Wazuh Manager | `GET /manager/stats/analysisd` | DEPRECATED |
| `wazuh.statsHourly` | Wazuh Manager | `GET /manager/stats/hourly` | OK |
| `wazuh.managerLogsSummary` | Wazuh Manager | `GET /manager/logs/summary` | OK |
| `wazuh.mitreTactics` | Wazuh Manager | `GET /mitre/tactics` | OK |
| `wazuh.rules` | Wazuh Manager | `GET /rules` | OK |
| `indexer.status` | Wazuh Indexer | `GET /_cluster/health` | OK |
| `indexer.alertsAggByLevel` | Wazuh Indexer | `POST /wazuh-alerts-*/_search` | OK |
| `indexer.alertsAggByAgent` | Wazuh Indexer | `POST /wazuh-alerts-*/_search` | OK |
| `indexer.alertsAggByMitre` | Wazuh Indexer | `POST /wazuh-alerts-*/_search` | OK |
| `indexer.alertsAggByRule` | Wazuh Indexer | `POST /wazuh-alerts-*/_search` | OK |
| `indexer.alertsGeoAgg` | Wazuh Indexer | `POST /wazuh-alerts-*/_search` | OK |
| `indexer.alertsGeoEnriched` | Wazuh Indexer | `POST /wazuh-alerts-*/_search` | OK |

### AgentHealth.tsx

| tRPC Call | External API | Endpoint | Status |
|-----------|-------------|----------|--------|
| `wazuh.status` | Wazuh Manager | `GET /manager/info` | OK |
| `wazuh.agents` | Wazuh Manager | `GET /agents` | OK |
| `wazuh.agentById` | Wazuh Manager | `GET /agents?agents_list={id}` | OK |
| `wazuh.agentSummaryStatus` | Wazuh Manager | `GET /agents/summary/status` | OK |
| `wazuh.agentSummaryOs` | Wazuh Manager | `GET /agents/summary/os` | OK |
| `wazuh.agentGroups` | Wazuh Manager | `GET /groups` | OK |
| `wazuh.agentOs` | Wazuh Manager | `GET /syscollector/{id}/os` | OK |
| `wazuh.agentHardware` | Wazuh Manager | `GET /syscollector/{id}/hardware` | OK |
| `wazuh.agentsOutdated` | Wazuh Manager | `GET /agents/outdated` | OK |
| `wazuh.agentsNoGroup` | Wazuh Manager | `GET /agents/no_group` | OK |

### AlertsTimeline.tsx

| tRPC Call | External API | Endpoint | Status |
|-----------|-------------|----------|--------|
| `wazuh.status` | Wazuh Manager | `GET /manager/info` | OK |
| `wazuh.statsHourly` | Wazuh Manager | `GET /manager/stats/hourly` | OK |
| `wazuh.statsWeekly` | Wazuh Manager | `GET /manager/stats/weekly` | OK |
| `indexer.status` | Wazuh Indexer | `GET /_cluster/health` | OK |
| `indexer.alertsSearch` | Wazuh Indexer | `POST /wazuh-alerts-*/_search` | OK |
| `indexer.alertsTimeline` | Wazuh Indexer | `POST /wazuh-alerts-*/_search` | OK |
| `indexer.alertsAggByLevel` | Wazuh Indexer | `POST /wazuh-alerts-*/_search` | OK |
| `indexer.alertsAggByAgent` | Wazuh Indexer | `POST /wazuh-alerts-*/_search` | OK |
| `indexer.alertsAggByRule` | Wazuh Indexer | `POST /wazuh-alerts-*/_search` | OK |
| `alertQueue.enqueue` | Database | INSERT into alert_queue | OK |

### Vulnerabilities.tsx

| tRPC Call | External API | Endpoint | Status |
|-----------|-------------|----------|--------|
| `wazuh.status` | Wazuh Manager | `GET /manager/info` | OK |
| `wazuh.agents` | Wazuh Manager | `GET /agents` | OK |
| `wazuh.agentVulnerabilities` | Wazuh Manager | `GET /vulnerability/{id}` | **BROKEN** |
| `indexer.status` | Wazuh Indexer | `GET /_cluster/health` | OK |
| `indexer.vulnSearch` | Wazuh Indexer | `POST /wazuh-states-vulnerabilities-*/_search` | OK |
| `indexer.vulnAggBySeverity` | Wazuh Indexer | `POST /wazuh-states-vulnerabilities-*/_search` | OK |
| `indexer.vulnAggByAgent` | Wazuh Indexer | `POST /wazuh-states-vulnerabilities-*/_search` | OK |
| `indexer.vulnAggByPackage` | Wazuh Indexer | `POST /wazuh-states-vulnerabilities-*/_search` | OK |
| `indexer.vulnAggByCVE` | Wazuh Indexer | `POST /wazuh-states-vulnerabilities-*/_search` | OK |

### MitreAttack.tsx

| tRPC Call | External API | Endpoint | Status |
|-----------|-------------|----------|--------|
| `wazuh.status` | Wazuh Manager | `GET /manager/info` | OK |
| `wazuh.mitreTactics` | Wazuh Manager | `GET /mitre/tactics` | OK |
| `wazuh.mitreTechniques` | Wazuh Manager | `GET /mitre/techniques` | OK |
| `wazuh.mitreGroups` | Wazuh Manager | `GET /mitre/groups` | OK |
| `wazuh.rules` | Wazuh Manager | `GET /rules` | OK |
| `indexer.status` | Wazuh Indexer | `GET /_cluster/health` | OK |
| `indexer.alertsAggByMitre` | Wazuh Indexer | `POST /wazuh-alerts-*/_search` | OK |

### Compliance.tsx

| tRPC Call | External API | Endpoint | Status |
|-----------|-------------|----------|--------|
| `wazuh.status` | Wazuh Manager | `GET /manager/info` | OK |
| `wazuh.agents` | Wazuh Manager | `GET /agents` | OK |
| `wazuh.scaPolicies` | Wazuh Manager | `GET /sca/{agent_id}` | OK |
| `wazuh.scaChecks` | Wazuh Manager | `GET /sca/{id}/checks/{policy}` | OK |
| `indexer.status` | Wazuh Indexer | `GET /_cluster/health` | OK |
| `indexer.alertsComplianceAgg` | Wazuh Indexer | `POST /wazuh-alerts-*/_search` | OK |

### FileIntegrity.tsx

| tRPC Call | External API | Endpoint | Status |
|-----------|-------------|----------|--------|
| `wazuh.status` | Wazuh Manager | `GET /manager/info` | OK |
| `wazuh.agents` | Wazuh Manager | `GET /agents` | OK |
| `wazuh.syscheckFiles` | Wazuh Manager | `GET /syscheck/{id}` | **WARN: `event` param invalid** |
| `wazuh.syscheckLastScan` | Wazuh Manager | `GET /syscheck/{id}/last_scan` | OK |

### ITHygiene.tsx

| tRPC Call | External API | Endpoint | Status |
|-----------|-------------|----------|--------|
| `wazuh.status` | Wazuh Manager | `GET /manager/info` | OK |
| `wazuh.agents` | Wazuh Manager | `GET /agents` | OK |
| `wazuh.agentPackages` | Wazuh Manager | `GET /syscollector/{id}/packages` | OK |
| `wazuh.agentPorts` | Wazuh Manager | `GET /syscollector/{id}/ports` | OK |
| `wazuh.agentProcesses` | Wazuh Manager | `GET /syscollector/{id}/processes` | OK |
| `wazuh.agentNetaddr` | Wazuh Manager | `GET /syscollector/{id}/netaddr` | OK |
| `wazuh.agentNetiface` | Wazuh Manager | `GET /syscollector/{id}/netiface` | OK |
| `wazuh.agentHotfixes` | Wazuh Manager | `GET /syscollector/{id}/hotfixes` | OK |
| `wazuh.agentBrowserExtensions` | Wazuh Manager | `GET /syscollector/{id}/browser_extensions` | OK |
| `wazuh.agentServices` | Wazuh Manager | `GET /syscollector/{id}/services` | OK |
| `wazuh.agentUsers` | Wazuh Manager | `GET /syscollector/{id}/users` | OK |
| `wazuh.agentGroups2` | Wazuh Manager | `GET /syscollector/{id}/groups` | OK |
| `wazuh.agentNetproto` | Wazuh Manager | `GET /syscollector/{id}/netproto` | OK |

### ClusterHealth.tsx

| tRPC Call | External API | Endpoint | Status |
|-----------|-------------|----------|--------|
| `wazuh.status` | Wazuh Manager | `GET /manager/info` | OK |
| `wazuh.managerInfo` | Wazuh Manager | `GET /manager/info` | OK |
| `wazuh.managerStatus` | Wazuh Manager | `GET /manager/status` | OK |
| `wazuh.managerConfigValidation` | Wazuh Manager | `GET /manager/configuration/validation` | OK |
| `wazuh.clusterStatus` | Wazuh Manager | `GET /cluster/status` | OK |
| `wazuh.clusterNodes` | Wazuh Manager | `GET /cluster/nodes` | OK |
| `wazuh.daemonStats` | Wazuh Manager | `GET /manager/daemons/stats` | OK |
| `wazuh.statsHourly` | Wazuh Manager | `GET /manager/stats/hourly` | OK |

### RulesetExplorer.tsx

| tRPC Call | External API | Endpoint | Status |
|-----------|-------------|----------|--------|
| `wazuh.status` | Wazuh Manager | `GET /manager/info` | OK |
| `wazuh.rules` | Wazuh Manager | `GET /rules` | OK |
| `wazuh.ruleGroups` | Wazuh Manager | `GET /rules/groups` | OK |
| `wazuh.ruleFileContent` | Wazuh Manager | `GET /rules/files/{filename}` | OK |
| `wazuh.decoders` | Wazuh Manager | `GET /decoders` | OK |
| `wazuh.decoderFileContent` | Wazuh Manager | `GET /decoders/files/{filename}` | OK |

### SiemEvents.tsx

| tRPC Call | External API | Endpoint | Status |
|-----------|-------------|----------|--------|
| `wazuh.status` | Wazuh Manager | `GET /manager/info` | OK |
| `wazuh.agents` | Wazuh Manager | `GET /agents` | OK |
| `wazuh.rules` | Wazuh Manager | `GET /rules` | OK |
| `indexer.status` | Wazuh Indexer | `GET /_cluster/health` | OK |
| `indexer.alertsSearch` | Wazuh Indexer | `POST /wazuh-alerts-*/_search` | OK |
| `otx.status` | OTX | `GET /api/v1/user/me` | OK |
| `otx.indicatorLookup` | OTX | `GET /api/v1/indicators/{type}/{ioc}/general` | OK |
| `savedSearches.list` | Database | SELECT from saved_searches | OK |
| `savedSearches.create` | Database | INSERT into saved_searches | OK |
| `savedSearches.delete` | Database | DELETE from saved_searches | OK |

### ThreatIntel.tsx

| tRPC Call | External API | Endpoint | Status |
|-----------|-------------|----------|--------|
| `otx.status` | OTX | `GET /api/v1/user/me` | OK |
| `otx.subscribedPulses` | OTX | `GET /api/v1/pulses/subscribed` | OK |
| `otx.searchPulses` | OTX | `GET /api/v1/search/pulses` | OK |
| `otx.pulseDetail` | OTX | `GET /api/v1/pulses/{id}` | OK |
| `otx.pulseIndicators` | OTX | `GET /api/v1/pulses/{id}/indicators` | OK |
| `otx.indicatorLookup` | OTX | `GET /api/v1/indicators/{type}/{ioc}/general` | OK |

### ThreatHunting.tsx

| tRPC Call | External API | Endpoint | Status |
|-----------|-------------|----------|--------|
| `wazuh.agents` | Wazuh Manager | `GET /agents` | OK |
| `wazuh.rules` | Wazuh Manager | `GET /rules` | OK |
| `wazuh.mitreTechniques` | Wazuh Manager | `GET /mitre/techniques` | OK |
| `wazuh.managerLogs` | Wazuh Manager | `GET /manager/logs` | OK |
| `savedSearches.list` | Database | SELECT from saved_searches | OK |
| `savedSearches.create` | Database | INSERT into saved_searches | OK |
| `savedSearches.delete` | Database | DELETE from saved_searches | OK |

### KnowledgeGraph.tsx

| tRPC Call | External API | Endpoint | Status |
|-----------|-------------|----------|--------|
| `graph.graphStats` | Database | SELECT from kg_* tables | OK |
| `graph.overviewGraph` | Database | SELECT from kg_* tables | OK |
| `graph.searchGraph` | Database | SELECT from kg_* tables | OK |
| `graph.detectRiskPaths` | Database | SELECT from kg_* tables | OK |

### AnalystChat.tsx

| tRPC Call | External API | Endpoint | Status |
|-----------|-------------|----------|--------|
| `graph.analystQuery` | LLM + Indexer | Custom LLM → Indexer queries | OK |

The agentic pipeline calls:
1. LLM (Nemotron Nano at `192.168.50.110:30000`) for intent classification and response generation
2. Wazuh Indexer (`wazuh-alerts-*`, `wazuh-states-vulnerabilities-*`) for evidence retrieval
3. Falls back to built-in Manus LLM if custom endpoint is down

### Assistant.tsx (HybridRAG)

| tRPC Call | External API | Endpoint | Status |
|-----------|-------------|----------|--------|
| `hybridrag.modelStatus` | LLM | `GET /v1/models` | OK |
| `hybridrag.chat` | LLM + Wazuh Manager | Custom LLM + `/agents/summary/status` + `/manager/stats/analysisd` | OK (analysisd deprecated) |
| `hybridrag.clearSession` | Database | DELETE from session store | OK |

### AlertQueue.tsx

| tRPC Call | External API | Endpoint | Status |
|-----------|-------------|----------|--------|
| `alertQueue.list` | Database | SELECT from alert_queue | OK |
| `alertQueue.process` | LLM + Indexer | runAnalystPipeline (same as AnalystChat) | OK |
| `alertQueue.remove` | Database | DELETE from alert_queue | OK |
| `alertQueue.clearHistory` | Database | DELETE from alert_queue | OK |
| `splunk.isEnabled` | Config check | No external call | OK |
| `splunk.getSplunkBaseUrl` | Config check | No external call | OK |
| `splunk.createTicket` | Splunk HEC | `POST /services/collector/event` | OK |
| `splunk.batchCreateTickets` | Splunk HEC | `POST /services/collector/event` (batch) | OK |
| `splunk.batchProgress` | In-memory | No external call | OK |

### TokenUsage.tsx

| tRPC Call | External API | Endpoint | Status |
|-----------|-------------|----------|--------|
| `llm.healthCheck` | LLM | `GET /v1/models` at `192.168.50.110:30000` | OK |
| `llm.usageStats` | Database | SELECT from llm_usage | OK |
| `llm.usageHistory` | Database | SELECT from llm_usage | OK |
| `llm.recentCalls` | Database | SELECT from llm_usage | OK |

### DataPipeline.tsx

| tRPC Call | External API | Endpoint | Status |
|-----------|-------------|----------|--------|
| `graph.etlStatus` | Database | SELECT from kg_sync_status | OK |
| `graph.etlFullSync` | Database | UPDATE kg_sync_status | OK |
| `graph.graphStats` | Database | SELECT from kg_* tables | OK |

### AdminSettings.tsx

| tRPC Call | External API | Endpoint | Status |
|-----------|-------------|----------|--------|
| `connectionSettings.getSettings` | Database | SELECT from connection_settings | OK |
| `connectionSettings.updateSettings` | Database | INSERT/UPDATE connection_settings | OK |
| `connectionSettings.testConnection` | Wazuh/Indexer/LLM/Splunk | Various test endpoints | OK |
| `connectionSettings.resetSettings` | Database | DELETE from connection_settings | OK |

---

## Unused Backend Procedures (No Frontend Consumer)

These procedures exist in routers but are not called by any frontend page:

| Procedure | Router | Wazuh Endpoint | Notes |
|-----------|--------|---------------|-------|
| `activeResponseList` | wazuhRouter | `GET /active-response` | **Endpoint doesn't exist** (only PUT) |
| `securityRoles` | wazuhRouter | `GET /security/roles` | Valid endpoint, no UI |
| `securityPolicies` | wazuhRouter | `GET /security/policies` | Valid endpoint, no UI |
| `securityUsers` | wazuhRouter | `GET /security/users` | Valid endpoint, no UI |
| `lists` | wazuhRouter | `GET /lists` | Valid endpoint, no UI |
| `listsFiles` | wazuhRouter | `GET /lists/files` | Valid endpoint, no UI |
| `managerConfiguration` | wazuhRouter | `GET /manager/configuration` | Valid endpoint, no UI |
| `managerStats` | wazuhRouter | `GET /manager/stats` | Valid endpoint, no UI |
| `monitoringAgentHistory` | indexerRouter | `POST /wazuh-monitoring-*/_search` | Valid query, no UI |
| `statisticsPerformance` | indexerRouter | `POST /wazuh-statistics-*/_search` | Valid query, no UI |
| `archivesSearch` | indexerRouter | `POST /wazuh-archives-*/_search` | Valid query, no UI |
| `remoted` | wazuhRouter | `GET /manager/stats/remoted` | DEPRECATED, no UI |

---

## LLM Service Validation

The LLM integration has a proper fallback chain:

1. **Primary:** Custom LLM at `http://192.168.50.110:30000/v1/chat/completions` (Nemotron-3 Nano)
2. **Fallback:** Built-in Manus LLM via `BUILT_IN_FORGE_API_URL`
3. **Token tracking:** All calls logged to `llm_usage` table with source, tokens, latency

The `invokeLLMWithFallback` function in `server/llm/llmService.ts` correctly:
- Tries custom endpoint first
- Falls back to built-in on failure
- Logs usage to database
- Never exposes API keys to the frontend

---

## Summary of Required Fixes

| Priority | Issue | File | Fix |
|----------|-------|------|-----|
| **CRITICAL** | `/vulnerability/{agent_id}` doesn't exist | wazuhRouter.ts:449, Vulnerabilities.tsx:123 | Remove procedure; use indexer with agent filter |
| **HIGH** | `GET /active-response` doesn't exist | wazuhRouter.ts:608 | Remove procedure |
| **MEDIUM** | `event` param invalid on syscheck | wazuhRouter.ts:522 | Remove `event` from input schema |
| **LOW** | `analysisd` endpoint deprecated | wazuhRouter.ts:69 | Migrate to `daemonStats` |
| **LOW** | `remoted` endpoint deprecated | wazuhRouter.ts:70 | Migrate to `daemonStats` |
