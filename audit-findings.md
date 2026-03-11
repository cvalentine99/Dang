# API Call Audit Findings

## Key Finding: `/vulnerability/{agent_id}` NOT in Wazuh v4.14.3 Spec

The wazuhRouter.ts calls `proxyGet("/vulnerability/${input.agentId}")` but this endpoint does NOT exist in the v4.14.3 OpenAPI spec.

In Wazuh 4.8+, vulnerability data moved to the **Indexer** (wazuh-states-vulnerabilities-* index), not the Manager REST API. The old `/vulnerability/{agent_id}` endpoint was removed.

Our indexerRouter.ts already has the correct vulnerability queries via the Indexer:
- vulnSearch
- vulnAggBySeverity
- vulnAggByAgent
- vulnAggByCVE
- vulnAggByPackage

The `wazuh.agentVulnerabilities` procedure in wazuhRouter.ts will return 404 or error on Wazuh 4.8+.

## Deprecated Endpoints Being Called

From the spec, these are deprecated:
- GET /manager/stats/analysisd → our router calls this as `analysisd`
- GET /manager/stats/remoted → our router calls this as `remoted`

These still work but may be removed in future versions.

## Service Connection Summary

| Service | Host | Port | Status |
|---------|------|------|--------|
| Wazuh Manager API | localhost | 55000 | Co-located |
| Wazuh Indexer | localhost | 9200 | Co-located |
| LLM (Nemotron) | 192.168.50.110 | 30000 | Separate GPU box |
| Splunk ES | 192.168.50.213 | 8089/8088 | Separate server |
| OTX | otx.alienvault.com | 443 | External API |

## Dashboard → tRPC → External API Mapping

### Home.tsx (Main Dashboard)
- trpc.wazuh.status → GET /manager/info (auth check)
- trpc.wazuh.managerStatus → GET /manager/status
- trpc.wazuh.agentSummaryStatus → GET /agents/summary/status
- trpc.wazuh.agents → GET /agents
- trpc.wazuh.analysisd → GET /manager/stats/analysisd (DEPRECATED)
- trpc.wazuh.statsHourly → GET /manager/stats/hourly
- trpc.wazuh.managerLogsSummary → GET /manager/logs/summary
- trpc.wazuh.mitreTactics → GET /mitre/tactics
- trpc.wazuh.rules → GET /rules
- trpc.indexer.status → GET /_cluster/health
- trpc.indexer.alertsAggByLevel → POST /wazuh-alerts-*/_search
- trpc.indexer.alertsAggByAgent → POST /wazuh-alerts-*/_search
- trpc.indexer.alertsAggByMitre → POST /wazuh-alerts-*/_search
- trpc.indexer.alertsAggByRule → POST /wazuh-alerts-*/_search
- trpc.indexer.alertsGeoAgg → POST /wazuh-alerts-*/_search
- trpc.indexer.alertsGeoEnriched → POST /wazuh-alerts-*/_search

### Vulnerabilities.tsx
- trpc.wazuh.agentVulnerabilities → GET /vulnerability/{agent_id} **BROKEN - endpoint doesn't exist in v4.8+**
- trpc.indexer.vulnSearch → POST /wazuh-states-vulnerabilities-*/_search (CORRECT)
- trpc.indexer.vulnAggBySeverity → POST /wazuh-states-vulnerabilities-*/_search (CORRECT)
- trpc.indexer.vulnAggByAgent → POST /wazuh-states-vulnerabilities-*/_search (CORRECT)
- trpc.indexer.vulnAggByCVE → POST /wazuh-states-vulnerabilities-*/_search (CORRECT)
- trpc.indexer.vulnAggByPackage → POST /wazuh-states-vulnerabilities-*/_search (CORRECT)
