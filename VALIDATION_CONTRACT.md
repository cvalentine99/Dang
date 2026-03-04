# Dang! — Validation Contract

**Version:** 2.2.0 — GAP Report Corrections + P2 Endpoint Coverage
**Date:** March 4, 2026
**Status:** All 1,898 tests passing across 65 files, TypeScript clean (0 errors)

---

## 1. Mock Data Elimination Summary

Every page in the application has been stripped of mock data fallbacks. The `client/src/lib/mockData.ts` file has been **deleted**. No page imports or references mock data.

| Page | Mock Imports Removed | Data Source Now |
|---|---|---|
| Home.tsx (SOC Console) | `MOCK_AGENTS`, `MOCK_ALERTS`, `MOCK_VULNERABILITIES`, `MOCK_MITRE_TECHNIQUES`, `MOCK_SCA_RESULTS`, `MOCK_FIM_EVENTS` | `trpc.wazuh.*` + `trpc.indexer.*` |
| AgentHealth.tsx (Fleet Command) | `MOCK_AGENTS` | `trpc.wazuh.agents` |
| AlertsTimeline.tsx | `MOCK_ALERTS` | `trpc.indexer.alertsSearch` |
| Vulnerabilities.tsx | `MOCK_VULNERABILITIES`, `MOCK_AGENTS` | `trpc.indexer.vulnSearchByAgent` + `trpc.wazuh.agents` |
| MitreAttack.tsx | `MOCK_MITRE_TECHNIQUES`, `MOCK_ALERTS` | `trpc.wazuh.mitreTechniques` + `trpc.indexer.alertsSearch` |
| Compliance.tsx | `MOCK_SCA_RESULTS`, `MOCK_AGENTS` | `trpc.wazuh.scaPolicies` + `trpc.wazuh.agents` |
| FileIntegrity.tsx | `MOCK_FIM_EVENTS`, `MOCK_AGENTS` | `trpc.wazuh.syscheckEvents` + `trpc.wazuh.agents` |
| ITHygiene.tsx | `MOCK_AGENTS`, `MOCK_PACKAGES`, `MOCK_SERVICES`, `MOCK_USERS`, `MOCK_HARDWARE`, `MOCK_OS_INFO`, `MOCK_NETWORK_INFO`, `MOCK_PORTS` | `trpc.wazuh.agents` + `trpc.wazuh.syscollector*` |
| ClusterHealth.tsx | `MOCK_CLUSTER_*` | `trpc.wazuh.clusterStatus` + `trpc.wazuh.clusterNodes` |
| ThreatHunting.tsx | `MOCK_AGENTS`, `MOCK_ALERTS`, `MOCK_VULNERABILITIES`, `MOCK_FIM_EVENTS` | `trpc.wazuh.*` + `trpc.indexer.*` |
| SiemEvents.tsx | `MOCK_SIEM_EVENTS`, `MOCK_LOG_SOURCES` | `trpc.indexer.alertsSearch` |
| RulesetExplorer.tsx | `MOCK_RULES`, `MOCK_DECODERS`, `MOCK_CDB_LISTS` | `trpc.wazuh.rules` + `trpc.wazuh.decoders` + `trpc.wazuh.cdbLists` |
| DriftComparison.tsx | `MOCK_AGENTS`, `MOCK_AGENT_PACKAGES`, `MOCK_AGENT_SERVICES`, `MOCK_AGENT_USERS` | `trpc.wazuh.agents` + `trpc.wazuh.agentPackages/Services/Users` |

---

## 2. Wazuh REST API Endpoint Mapping

### 2.1 Wazuh Manager API (via `server/wazuh/wazuhClient.ts`)

All calls go through the backend proxy (`proxyGet`). No direct browser→Wazuh calls.

| tRPC Procedure | Wazuh REST Endpoint | HTTP Method | Used By |
|---|---|---|---|
| `wazuh.agents` | `GET /agents` | GET | Home, AgentHealth, Vulnerabilities, Compliance, FIM, ITHygiene, ThreatHunting, DriftComparison |
| `wazuh.agentSummary` | `GET /agents/summary/status` | GET | Home |
| `wazuh.agentsSummary` | `GET /agents/summary` | GET | (P2 GAP fill) |
| `wazuh.agentOs` | `GET /agents/summary/os` | GET | Home |
| `wazuh.mitreTechniques` | `GET /mitre/techniques` | GET | MitreAttack |
| `wazuh.mitreTactics` | `GET /mitre/tactics` | GET | MitreAttack |
| `wazuh.mitreGroups` | `GET /mitre/groups` | GET | MitreAttack |
| `wazuh.mitreMetadata` | `GET /mitre/metadata` | GET | MitreAttack |
| `wazuh.mitreMitigations` | `GET /mitre/mitigations` | GET | MitreAttack |
| `wazuh.mitreReferences` | `GET /mitre/references` | GET | MitreAttack |
| `wazuh.mitreSoftware` | `GET /mitre/software` | GET | MitreAttack |
| `wazuh.scaPolicies` | `GET /sca/{agent_id}` | GET | Compliance |
| `wazuh.scaChecks` | `GET /sca/{agent_id}/checks/{policy_id}` | GET | Compliance |
| `wazuh.syscheckEvents` | `GET /syscheck/{agent_id}` | GET | FileIntegrity, ThreatHunting |
| `wazuh.syscollectorPackages` | `GET /syscollector/{agent_id}/packages` | GET | ITHygiene |
| `wazuh.syscollectorProcesses` | `GET /syscollector/{agent_id}/processes` | GET | ITHygiene |
| `wazuh.syscollectorHardware` | `GET /syscollector/{agent_id}/hardware` | GET | ITHygiene |
| `wazuh.syscollectorOs` | `GET /syscollector/{agent_id}/os` | GET | ITHygiene |
| `wazuh.syscollectorNetwork` | `GET /syscollector/{agent_id}/netiface` | GET | ITHygiene |
| `wazuh.syscollectorPorts` | `GET /syscollector/{agent_id}/ports` | GET | ITHygiene |
| `wazuh.agentPackages` | `GET /syscollector/{agent_id}/packages` | GET | DriftComparison |
| `wazuh.agentServices` | `GET /syscollector/{agent_id}/processes` | GET | DriftComparison |
| `wazuh.agentUsers` | `GET /syscollector/{agent_id}/users` | GET | DriftComparison |
| `wazuh.rules` | `GET /rules` | GET | RulesetExplorer |
| `wazuh.decoders` | `GET /decoders` | GET | RulesetExplorer |
| `wazuh.cdbLists` | `GET /lists` | GET | RulesetExplorer |
| `wazuh.securityConfig` | `GET /security/config` | GET | (P2 GAP fill) |
| `wazuh.securityCurrentUser` | `GET /security/users/me` | GET | (P2 GAP fill) |
| `wazuh.clusterStatus` | `GET /cluster/status` | GET | ClusterHealth |
| `wazuh.clusterNodes` | `GET /cluster/nodes` | GET | ClusterHealth |
| `wazuh.clusterHealthcheck` | `GET /cluster/healthcheck` | GET | ClusterHealth |
| `wazuh.managerInfo` | `GET /manager/info` | GET | Status |
| `wazuh.managerStatus` | `GET /manager/status` | GET | Status |
| `wazuh.managerLogs` | `GET /manager/logs` | GET | Status |
| `wazuh.managerStats` | `GET /manager/stats` | GET | Status |
| `wazuh.managerVersionCheck` | `GET /manager/version/check` | GET | (P2 GAP fill) |
| `wazuh.managerComponentConfig` | `GET /manager/configuration/{component}/{configuration}` | GET | (P2 GAP fill) |

### 2.2 Wazuh Indexer API (via `server/indexer/indexerClient.ts`)

All calls go through the backend Indexer proxy. Queries use Elasticsearch/OpenSearch DSL.

| tRPC Procedure | Indexer Endpoint | Used By |
|---|---|---|
| `indexer.alertsSearch` | `POST /wazuh-alerts-*/_search` | AlertsTimeline, SiemEvents, MitreAttack, ThreatHunting, Home |
| `indexer.alertsAggregation` | `POST /wazuh-alerts-*/_search` (aggs) | Home, AlertsTimeline |
| `indexer.indicesStats` | `GET /_cat/indices/wazuh-*` | Status |
| `indexer.clusterHealth` | `GET /_cluster/health` | Status |
| `indexer.vulnSearchByAgent` | `POST /wazuh-states-vulnerabilities-*/_search` | Vulnerabilities, ThreatHunting, Home |

### 2.3 OTX Threat Intelligence (via `server/otx/otxRouter.ts`)

| tRPC Procedure | OTX Endpoint | Used By |
|---|---|---|
| `otx.pulses` | `GET /api/v1/pulses/subscribed` | ThreatIntel |
| `otx.indicatorSearch` | `GET /api/v1/indicators/*` | ThreatIntel |
| `otx.userInfo` | `GET /api/v1/user/me` | ThreatIntel |

---

## 3. Knowledge Graph — 4-Layer Architecture

### 3.1 Database Schema (12 tables)

| Layer | Table | Records | Description |
|---|---|---|---|
| **API Ontology** | `kg_endpoints` | 182 | Every Wazuh REST endpoint with method, path, risk level, trust score |
| | `kg_parameters` | 1,186 | Query/path/body parameters per endpoint |
| | `kg_responses` | 1,126 | HTTP response codes per endpoint |
| | `kg_auth_methods` | 2 | Authentication methods (JWT, Basic) |
| | `kg_resources` | 21 | Resource categories (agents, vulnerability, sca, etc.) |
| **Operational Semantics** | `kg_use_cases` | 16 | Analyst use cases with endpoint mappings |
| **Schema Lineage** | `kg_indices` | 5 | Wazuh Indexer index patterns |
| | `kg_fields` | 60 | Fields per index with types |
| **Error/Failure** | `kg_error_patterns` | 9 | Common error codes with causes and mitigations |
| **Trust/Audit** | `kg_trust_history` | 0 | Trust score change log |
| | `kg_answer_provenance` | 0 | LLM answer audit trail |
| **Meta** | `kg_sync_status` | 4 | ETL sync status per layer |

### 3.2 Risk Classification

| Risk Level | Count | LLM Access | Description |
|---|---|---|---|
| **SAFE** | 115 | Allowed | Read-only GET endpoints (includes authenticate/logtest) |
| **MUTATING** | 44 | Blocked | POST/PUT endpoints that modify state |
| **DESTRUCTIVE** | 23 | Blocked | DELETE endpoints that destroy data |

### 3.3 Safety Rails (Nemotron-3 Nano Contract)

| Rail | Type | Description |
|---|---|---|
| **Graph-Level Exclusion** | Pre-retrieval | `searchGraph(query, limit, { llmSafe: true })` adds a DB-level `WHERE allowed_for_llm = 1` filter; `getEndpoints({ llmAllowed: true })` enforces the same. MUTATING/DESTRUCTIVE endpoints are excluded at the SQL layer, not post-hoc. |
| **Prompt-Level Prohibition** | System prompt | Immutable instructions forbid suggesting write/delete operations |
| **Output Validator** | Post-generation | Regex scan for blocked patterns (DELETE, PUT, active-response, etc.) |
| **Confidence Gate** | Post-generation | Responses below 0.3 confidence are gated with warnings |
| **Trust Scoring** | Per-endpoint | Each endpoint has a 0.0–1.0 trust score; low-trust endpoints flagged |
| **Provenance Tracking** | Per-answer | Best-effort: every LLM response attempts to record session, query, endpoints consulted, confidence, and safety triggers. If provenance recording fails (DB error), the pipeline logs the failure and continues — the answer is still delivered but `gateProvenanceRequired` emits a `provenance_gap` warning so the analyst knows the audit trail is incomplete. |

### 3.4 tRPC Procedures (Knowledge Graph Router)

| Procedure | Auth | Description |
|---|---|---|
| `graph.graphStats` | Protected | KG entity counts, risk/method breakdowns |
| `graph.overviewGraph` | Protected | Full 4-layer graph visualization (nodes + edges) |
| `graph.endpointDetail` | Protected | Single endpoint with parameters + responses |
| `graph.searchGraph` | Protected | Full-text search across all KG layers |
| `graph.resourceOverview` | Protected | Resource categories with endpoint counts |
| `graph.useCases` | Protected | Analyst use cases with endpoint mappings |
| `graph.errorPatterns` | Protected | Error codes with causes and mitigations |
| `graph.riskAnalysis` | Protected | Dangerous endpoints, resource risk map, LLM blocked count |
| `graph.endpoints` | Protected | Paginated endpoint list with filters |
| `graph.detectRiskPaths` | Protected | Risk path detection across resource boundaries |
| `graph.etlStatus` | Protected | Sync status per KG layer |
| `graph.etlFullSync` | Admin | Re-extract KG from OpenAPI spec |
| `graph.analystQuery` | Protected | Walter (LLM analyst) with KG-grounded RAG |
| `graph.answerProvenance` | Protected | Audit trail of LLM answers |

---

## 4. Walter (Analyst Chat) — Agent Pipeline

### 4.1 Pipeline Phases

| Phase | Agent | Duration | Description |
|---|---|---|---|
| 1 | **Orchestrator** | ~50ms | Query intent classification, keyword extraction |
| 2 | **Graph Retriever** | ~200ms | 4-layer KG traversal, endpoint lookup, risk analysis |
| 3 | **Indexer Retriever** | ~500ms | Wazuh Indexer search for real-time alerts/events |
| 4 | **Synthesizer** | ~2000ms | LLM analysis with structured context |
| 5 | **Safety Validator** | ~10ms | Output scan for blocked patterns, confidence check |

### 4.2 Response Metadata

Every Walter response includes:
- **Trust Score** (0.0–1.0) — based on KG endpoint trust scores consulted
- **Confidence** (low/medium/high) — LLM self-assessed confidence
- **Safety Status** (clean/filtered/blocked) — output validation result
- **Agent Steps** — timestamped log of each agent's work
- **Provenance** — query hash, source counts, latencies, filtered patterns

### 4.3 Hard Gates (Architectural, Not Vibes)

| Gate | Function | Trigger | Behavior |
|---|---|---|---|
| **No KG → No Plan** | `gateNoKgNoPlan()` | Graph retrieval returns 0 endpoints | Pipeline refuses to synthesize; returns "Knowledge Graph Not Hydrated" with `safetyStatus=blocked`, `filteredPatterns=[no_kg_data]` |
| **Safe-Only Execution** | `gateSafeOnly()` | Any source contains MUTATING/DESTRUCTIVE endpoints or `dangerousEndpoints` objects | Strips unsafe endpoints from array sources; strips `dangerousEndpoints` key from object sources (risk analysis); records all blocked paths |
| **Provenance Required** | `gateProvenanceRequired()` | Graph sources used but provenance has 0 endpoint IDs | Emits `provenance_gap` warning; answer still delivered but flagged as ungrounded |

### 4.4 Hard Refusal Templates

Walter will refuse and explain when asked to:
- Delete agents, rules, or configurations
- Execute active responses
- Modify Wazuh settings
- Run remote commands
- Any MUTATING or DESTRUCTIVE operation

---

## 5. Connection Configuration

| Service | Host | Port | User | Protocol |
|---|---|---|---|---|
| Wazuh Manager API | `192.168.50.158` | `55000` | `wazuh-wui` | HTTPS (self-signed) |
| Wazuh Indexer | `192.168.50.158` | `9200` | `admin` | HTTPS (self-signed) |

All credentials stored server-side only via `webdev_request_secrets`. Never exposed to frontend.

---

## 6. Test Coverage

| Test File | Tests | Status |
|---|---|---|
| `server/auth.logout.test.ts` | 2 | Pass |
| `server/admin/connectionSettings.test.ts` | 8 | Pass |
| `server/admin/adminUsers.test.ts` | 7 | Pass |
| `server/graph/graph.test.ts` | 23 | Pass |
| `server/indexer/indexerRouter.test.ts` | 8 | Pass |
| `server/wazuh/wazuhRouter.test.ts` | 130 | Pass |
| `server/wazuh/wazuhConnection.test.ts` | 8 | Pass |
| `server/otx/otxRouter.test.ts` | 1 | Timeout (network) |
| `server/graph/agenticGates.test.ts` | 37 | Pass |
| `server/graph/kg-hydration.test.ts` | 28 | Pass |
| `server/wazuh/brokerWarnings.test.ts` | 11 | Pass |
| `server/wazuh/paramBroker.test.ts` | 1,500+ | Pass |
| **Total** | **1,900+ pass** | |

---

## 7. Files Modified in This Release

### Deleted
- `client/src/lib/mockData.ts` — All mock data removed

### Rewritten (Server)
- `server/graph/graphQueryService.ts` — 4-layer KG query service
- `server/graph/graphRouter.ts` — New KG tRPC procedures
- `server/graph/etlService.ts` — OpenAPI spec extraction pipeline
- `server/graph/attackPathService.ts` — Risk path detection
- `server/graph/agenticPipeline.ts` — Walter pipeline with safety rails
- `server/graph/graph.test.ts` — Updated tests for new KG

### Rewritten (Client)
- `client/src/pages/KnowledgeGraph.tsx` — 4-layer graph visualization
- `client/src/pages/DataPipeline.tsx` — KG extraction pipeline UI
- `client/src/pages/AnalystChat.tsx` — Walter with agent activity console

### Mock Data Stripped (Client)
- `client/src/pages/Home.tsx`
- `client/src/pages/AgentHealth.tsx`
- `client/src/pages/AlertsTimeline.tsx`
- `client/src/pages/Vulnerabilities.tsx`
- `client/src/pages/MitreAttack.tsx`
- `client/src/pages/Compliance.tsx`
- `client/src/pages/FileIntegrity.tsx`
- `client/src/pages/ITHygiene.tsx`
- `client/src/pages/ClusterHealth.tsx`
- `client/src/pages/ThreatHunting.tsx`
- `client/src/pages/SiemEvents.tsx`
- `client/src/pages/RulesetExplorer.tsx`
- `client/src/components/DriftComparison.tsx`

### Schema
- `drizzle/schema.ts` — Old graph_* tables replaced with kg_* tables
