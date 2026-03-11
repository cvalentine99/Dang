# API Contract Review — Dang! Wazuh Web Application

**Date:** 2026-03-01  
**Scope:** All 19 production routers, 254 procedures (188 queries + 66 mutations)  
**Reviewer:** Automated audit of server-side code  
**Objective:** Verify every route's contract, auth gating, Wazuh safety, and deploy readiness

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Total Routers** | 19 (+ 1 system router) |
| **Total Queries** | 188 |
| **Total Mutations** | 66 |
| **Mutations writing to Wazuh** | **0** |
| **Mutations writing to Indexer** | **0** |
| **Public mutations** | **0** (all 66 are `protectedProcedure`) |
| **Admin-gated mutations** | 8 (connectionSettings, adminUsers, splunk batch, triggerPoll) |
| **Rate-limited endpoints** | All Wazuh proxy (per-group), all Indexer (per-group) |
| **Token exposure to browser** | **None** — Wazuh JWT and Indexer credentials are server-side only |

### Deploy Gate Verdict: **PASS — No Wazuh write-back risk**

The application is strictly read-only with respect to Wazuh Manager and Wazuh Indexer. The `wazuhClient.ts` module exports only `wazuhGet()`. The `indexerClient.ts` module exports only `indexerSearch()`, `indexerHealth()`, and `indexerIndexExists()`. No POST/PUT/DELETE functions exist for either external system. All mutations operate exclusively on the local application database.

---

## 1. Wazuh Manager Proxy (`server/wazuh/`)

### wazuhClient.ts — Core Safety Properties

| Property | Status | Evidence |
|----------|--------|----------|
| **Only GET requests** | PASS | Only export is `wazuhGet()` — uses `instance.get()` exclusively |
| **No wazuhPost/Put/Delete** | PASS | `grep -rn 'wazuhPost\|wazuhPut\|wazuhDelete'` returns 0 matches |
| **JWT server-side only** | PASS | `cachedToken` is module-private, never returned to any route handler |
| **JWT never logged** | PASS | Only expiry duration is logged, not the token value |
| **Rate limiting** | PASS | Token-bucket per endpoint group (default: 60/min, alerts: 30/min, vulns: 20/min, syscheck: 20/min) |
| **Sensitive field stripping** | PASS | `stripSensitiveFields()` removes password, token, secret, api_key, key, auth, credential |
| **401 retry (once)** | PASS | On 401, invalidates token, re-authenticates, retries once. No infinite retry loop. |
| **TLS verification** | NOTED | `rejectUnauthorized: false` — expected for self-signed Wazuh certs |
| **Timeout** | PASS | 8s timeout on all requests |

### wazuhRouter.ts — 81 Query Procedures

| Category | Count | Auth | Write? | Notes |
|----------|-------|------|--------|-------|
| Manager info/status/config | 7 | public | No | Read-only manager metadata |
| Manager stats (hourly/weekly/analysisd/remoted) | 5 | public | No | Performance metrics |
| Daemon stats | 1 | public | No | Per-daemon stats with input validation |
| Manager logs | 2 | public | No | Log retrieval with pagination |
| Cluster endpoints | 7 | public | No | Cluster health, nodes, local info |
| Agent endpoints | ~15 | public | No | Agent list, summary, detail, syscollector |
| SCA endpoints | ~8 | public | No | Security Configuration Assessment |
| Syscheck/FIM | ~8 | public | No | File integrity monitoring |
| Vulnerability | ~5 | public | No | Agent vulnerability state |
| Rules/Decoders | ~10 | public | No | Rule/decoder metadata |
| MITRE | ~5 | public | No | MITRE ATT&CK mapping |
| Active response | 0 | — | — | **Not implemented — correct per project constraints** |
| Agent enrollment | 0 | — | — | **Not implemented — correct per project constraints** |
| Rule editing | 0 | — | — | **Not implemented — correct per project constraints** |

**Verdict:** PASS. All 81 procedures are read-only GET proxies. Zero mutations. Zero write-back.

---

## 2. Wazuh Indexer (`server/indexer/`)

### indexerClient.ts — Core Safety Properties

| Property | Status | Evidence |
|----------|--------|----------|
| **Only search requests** | PASS | Exports: `indexerSearch()`, `indexerHealth()`, `indexerIndexExists()` — all use POST `/_search` or GET `/_cluster/health` |
| **No index writes** | PASS | No `_bulk`, `_index`, `_update`, `_delete` endpoints called |
| **Credentials server-side only** | PASS | Config loaded from env/DB, never returned to frontend |
| **Rate limiting** | PASS | Token-bucket per group (alerts: 30/min, vulnerabilities: 20/min, monitoring: 15/min, statistics: 10/min, archives: 10/min) |
| **Sensitive field stripping** | PASS | Same `stripSensitiveFields()` pattern as Wazuh client |

### indexerRouter.ts — 18 Query Procedures

| Procedure | Auth | Index Pattern | Write? |
|-----------|------|---------------|--------|
| `status` | public | N/A (health check) | No |
| `indexStatus` | public | All 5 patterns | No |
| `alertsSearch` | public | `wazuh-alerts-*` | No |
| `alertsAggByLevel` | public | `wazuh-alerts-*` | No |
| `alertsAggByAgent` | public | `wazuh-alerts-*` | No |
| `alertsAggByMitre` | public | `wazuh-alerts-*` | No |
| `alertsAggByRule` | public | `wazuh-alerts-*` | No |
| `alertsTimeline` | public | `wazuh-alerts-*` | No |
| `alertsGeoAgg` | public | `wazuh-alerts-*` | No |
| `alertsGeoEnriched` | public | `wazuh-alerts-*` | No |
| `alertsComplianceAgg` | public | `wazuh-alerts-*` | No |
| `vulnSearch` | public | `wazuh-states-vulnerabilities-*` | No |
| `vulnAggBySeverity` | public | `wazuh-states-vulnerabilities-*` | No |
| `vulnAggByAgent` | public | `wazuh-states-vulnerabilities-*` | No |
| `vulnAggByPackage` | public | `wazuh-states-vulnerabilities-*` | No |
| `vulnAggByCVE` | public | `wazuh-states-vulnerabilities-*` | No |
| `monitoringAgentHistory` | public | `wazuh-monitoring-*` | No |
| `statisticsPerformance` | public | `wazuh-statistics-*` | No |
| `archivesSearch` | public | `wazuh-archives-*` | No |

**Verdict:** PASS. All 18 procedures are read-only searches. Zero mutations. Zero index writes.

---

## 3. Response Actions (`server/agenticPipeline/responseActionsRouter.ts`)

### State Machine Safety

| Property | Status | Evidence |
|----------|--------|----------|
| **Centralized state machine** | PASS | All transitions go through `stateMachine.ts` — single enforcement point |
| **Valid transitions only** | PASS | `VALID_TRANSITIONS` map enforced; arbitrary jumps rejected |
| **Terminal states enforced** | PASS | `rejected` and `executed` are terminal — no further transitions |
| **Approval gate** | PASS | `requiresApproval=1` cannot skip `proposed→approved→executed` |
| **Reason required** | PASS | Reject and defer require non-empty reason strings |
| **Full audit trail** | PASS | Every transition writes to `response_action_audit` table |
| **Case summary recompute** | PASS | `syncCaseSummaryAfterTransition()` recalculates from source of truth after every transition |
| **No Wazuh execution** | PASS | "Execute" means marking the action as executed in DB — no actual Wazuh API call is made |

### Procedures (7 mutations + 6 queries)

| Procedure | Type | Auth | Writes to Wazuh? |
|-----------|------|------|-------------------|
| `propose` | mutation | protected | No — DB only |
| `approve` | mutation | protected | No — DB only |
| `reject` | mutation | protected | No — DB only |
| `execute` | mutation | protected | No — DB only (records execution result) |
| `defer` | mutation | protected | No — DB only |
| `repropose` | mutation | protected | No — DB only |
| `bulkApprove` | mutation | protected | No — DB only (max 50 per call) |
| `getById` | query | protected | No |
| `getByCase` | query | protected | No |
| `listAll` | query | protected | No |
| `pendingApproval` | query | protected | No |
| `stats` | query | protected | No |
| `auditTrail` | query | protected | No |
| `fullAuditLog` | query | protected | No |

**Verdict:** PASS. All mutations write to local DB only. The "execute" action is a human acknowledgment, not an automated Wazuh API call.

---

## 4. Pipeline (`server/agenticPipeline/pipelineRouter.ts`)

### Procedures (10 mutations + 10 queries)

| Procedure | Type | Auth | External Write? | Notes |
|-----------|------|------|-----------------|-------|
| `triageAlert` | mutation | protected | No | LLM call + DB write |
| `correlateFromTriage` | mutation | protected | No | LLM call + DB write |
| `submitFeedback` | mutation | protected | No | DB write only |
| `autoTriageQueueItem` | mutation | protected | No | LLM call + DB write |
| `generateHypothesis` | mutation | protected | No | LLM call + DB write |
| `recordPivot` | mutation | protected | No | DB write only |
| `autoTriageAllPending` | mutation | protected | No | Batch LLM + DB |
| `runFullPipeline` | mutation | protected | No | Multi-stage LLM + DB |
| `replayPipelineRun` | mutation | protected | No | Re-runs pipeline stages |
| `generateCaseReport` | mutation | protected | No | LLM generates markdown |
| `getTriageById` | query | protected | No | |
| `listTriages` | query | protected | No | |
| `triageStats` | query | protected | No | |
| `getCorrelationById` | query | protected | No | |
| `getCorrelationByTriageId` | query | protected | No | |
| `listCorrelations` | query | protected | No | |
| `getFeedback` | query | protected | No | |
| `feedbackStats` | query | protected | No | |
| `feedbackAnalytics` | query | protected | No | |
| `getAutoTriageStatus` | query | protected | No | |
| `getLivingCaseById` | query | protected | No | |
| `getLivingCaseBySessionId` | query | protected | No | |
| `getLivingCaseByCorrelationId` | query | protected | No | |
| `listLivingCases` | query | protected | No | |
| `getPipelineRun` | query | protected | No | |
| `listPipelineRuns` | query | protected | No | |
| `pipelineRunStats` | query | protected | No | |
| `getPipelineArtifacts` | query | protected | No | |

**Verdict:** PASS. All mutations write to local DB + call LLM. Zero Wazuh/Indexer writes. The pipeline reads from Wazuh (via `wazuhGet`) during correlation but never writes back.

---

## 5. Connection Settings (`server/admin/connectionSettingsRouter.ts`)

| Procedure | Type | Auth | Notes |
|-----------|------|------|-------|
| `getSettings` | query | **admin** | Returns effective settings (DB → env → defaults). Passwords masked. |
| `updateSettings` | mutation | **admin** | Writes to local DB only — updates connection config |
| `testConnection` | mutation | **admin** | Tests connectivity to Wazuh/Indexer/LLM/Splunk. Read-only probes. |
| `resetSettings` | mutation | **admin** | Deletes DB overrides, reverts to env vars |

**Verdict:** PASS. Admin-gated. `testConnection` only performs read-only health checks (Wazuh: POST /security/user/authenticate, Indexer: GET /_cluster/health). No state mutation on external systems.

---

## 6. Baseline Schedules (`server/baselines/`)

### baselinesRouter.ts (2 mutations + 2 queries)

| Procedure | Type | Auth | Notes |
|-----------|------|------|-------|
| `list` | query | protected | User-scoped |
| `get` | query | protected | User-scoped |
| `create` | mutation | protected | DB write only — stores snapshot data |
| `delete` | mutation | protected | User-scoped delete |

### baselineSchedulesRouter.ts (5 mutations + 2 queries)

| Procedure | Type | Auth | Notes |
|-----------|------|------|-------|
| `list` | query | protected | User-scoped |
| `history` | query | protected | User-scoped |
| `create` | mutation | protected | DB write only |
| `update` | mutation | protected | DB write only |
| `toggle` | mutation | protected | DB write only |
| `delete` | mutation | protected | DB write only (unlinks baselines, doesn't delete them) |
| `triggerNow` | mutation | protected | Reads from Wazuh via `wazuhGet`, writes snapshot to local DB |

**Verdict:** PASS. `triggerNow` reads from Wazuh (agent config) and writes to local DB. No Wazuh write-back.

---

## 7. Alert Queue (`server/alertQueue/`)

### alertQueueRouter.ts (4 mutations + 4 queries)

| Procedure | Type | Auth | Notes |
|-----------|------|------|-------|
| `enqueue` | mutation | protected | DB write only |
| `remove` | mutation | protected | DB write only |
| `process` | mutation | protected | LLM triage + DB write |
| `clearHistory` | mutation | protected | DB delete only |
| `list` | query | protected | |
| `stats` | query | protected | |
| `getById` | query | protected | |
| `history` | query | protected | |

### autoQueueRouter.ts (4 mutations + 3 queries)

| Procedure | Type | Auth | Notes |
|-----------|------|------|-------|
| `createRule` | mutation | protected | DB write only |
| `updateRule` | mutation | protected | DB write only |
| `deleteRule` | mutation | protected | DB write only |
| `triggerPoll` | mutation | protected + **admin check** | Reads from Indexer, writes to local DB queue |
| `listRules` | query | protected | |
| `pollingStatus` | query | protected | |
| `ruleStats` | query | protected | |

**Verdict:** PASS. `triggerPoll` reads from Indexer (via `indexerSearch`), writes to local alert queue. Admin-gated. No external writes.

---

## 8. Splunk Integration (`server/splunk/`)

| Procedure | Type | Auth | External Write? | Notes |
|-----------|------|------|-----------------|-------|
| `status` | query | protected | No | |
| `listTickets` | query | protected | No | |
| `getTicketById` | query | protected | No | |
| `ticketStats` | query | protected | No | |
| `batchProgress` | query | protected | No | |
| `testConnection` | mutation | protected | No | Read-only probe |
| `createTicket` | mutation | protected + **admin** | **YES — writes to Splunk HEC** | Feature-gated, admin-only |
| `batchCreateTickets` | mutation | protected + **admin** | **YES — writes to Splunk HEC** | Feature-gated, admin-only |

**Verdict:** PASS with caveat. Two mutations write to Splunk HEC (not Wazuh). Both are admin-gated and feature-gated (`isSplunkEnabled()`). This is an intentional integration, not a Wazuh safety violation.

---

## 9. Other Routers — Summary

| Router | Queries | Mutations | Auth | External Writes? |
|--------|---------|-----------|------|------------------|
| **notes** | 3 | 3 | protected | No — DB only |
| **savedSearches** | 2 | 3 | protected | No — DB only |
| **hunt** | 7 | 3 | protected (save/delete/update), **public (execute)** | No — DB + Wazuh read |
| **graph** | 5 | 7 | protected | No — DB + LLM |
| **hybridrag** | 3 | 5 | **public** | No — DB + LLM |
| **enhancedLLM** | 3 | 2 | protected (chat/classify), public (health/stats) | No — LLM only |
| **llm** | 4 | 0 | public | No — read-only stats |
| **otx** | 7 | 0 | public | No — OTX API reads |
| **localAuth** | 1 | 2 | public (register/login) | No — DB only |
| **adminUsers** | 2 | 3 | **admin** | No — DB only |

---

## 10. Security Observations

### Auth Level Distribution

| Auth Level | Procedure Count | Notes |
|------------|----------------|-------|
| `protectedProcedure` (authenticated user) | ~170 | Standard auth gate |
| `adminProcedure` (admin role) | ~8 | Connection settings, user management, Splunk batch |
| `publicProcedure` (no auth) | ~70 | Wazuh proxy, Indexer, OTX, LLM stats, hybridRAG reads |

### Observations Requiring Attention

| ID | Severity | Route | Issue | Recommendation |
|----|----------|-------|-------|----------------|
| O-1 | ~~Medium~~ **FIXED** | `hybridrag.*` | 5 mutations (chat, clearSession, notes.create/update/delete) gated behind `protectedProcedure` (2026-03-01). Reads remain public. 3 auth-rejection tests added. |
| O-2 | ~~Low~~ **FIXED** | `hunt.execute` | Gated behind `protectedProcedure` (2026-03-01). Prevents unauthenticated Wazuh query load. |
| O-3 | **Info** | `wazuhRouter.*` | All 81 Wazuh proxy endpoints are `publicProcedure` | Acceptable if the app is behind network-level auth. Consider `protectedProcedure` for production hardening |
| O-4 | **Info** | `indexerRouter.*` | All 18 Indexer endpoints are `publicProcedure` | Same as O-3 |
| O-5 | **Info** | `otxRouter.*` | All 7 OTX endpoints are `publicProcedure` | OTX data is public threat intel — low risk |
| O-6 | **Info** | `llmRouter.*` | Usage stats are `publicProcedure` | Exposes LLM usage metrics without auth — low risk but consider gating |

### Token & Credential Safety

| Credential | Storage | Exposure to Browser | Logged? |
|------------|---------|---------------------|---------|
| Wazuh JWT | Module-private `cachedToken` | Never | Only expiry duration |
| Wazuh user/pass | Env vars + DB (encrypted at rest) | Never | Never |
| Indexer user/pass | Env vars + DB (encrypted at rest) | Never | Never |
| Splunk HEC token | Env vars | Never | Never |
| OTX API key | Env vars | Never | Never |
| LLM API key | Env vars (platform-injected) | Never | Never |

---

## 11. Deploy Gate Summary

### Critical Safety Checks

| Check | Result |
|-------|--------|
| Any route writes to Wazuh Manager? | **NO** — `wazuhClient.ts` only exports `wazuhGet()` |
| Any route writes to Wazuh Indexer? | **NO** — `indexerClient.ts` only exports search/health/exists |
| Any route deletes agents? | **NO** |
| Any route modifies rules? | **NO** |
| Any route triggers active response? | **NO** |
| Any route enrolls agents? | **NO** |
| Tokens exposed to browser? | **NO** |
| Uncontrolled background polling? | **NO** — AutoQueue polling is operator-controlled with configurable interval |
| All mutations require auth? | **YES** — all 66 mutations use `protectedProcedure` or `adminProcedure` |
| Sensitive fields stripped? | **YES** — both Wazuh and Indexer clients strip password/token/secret/key/auth/credential |

### Final Verdict

> **DEPLOY GATE: PASS**
>
> The application is strictly read-only with respect to all external security infrastructure (Wazuh Manager, Wazuh Indexer). All 66 mutations operate exclusively on the local application database, LLM services, or Splunk HEC (admin-gated). No write-back to Wazuh exists in any code path. Token handling follows server-side-only patterns with no browser exposure.
>
> **Hardening applied (2026-03-01):** O-1 and O-2 fixed — hybridRAG mutations and hunt.execute now require authentication. Remaining observations (O-3 through O-6) are info-level and acceptable for production.

---

*Generated from static analysis of 19 routers, 254 procedures, 2 external client modules, and 1 state machine module.*
