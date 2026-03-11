# Verification Status — Dang! (Wazuh Web Application)

> **Purpose:** Canonical verification artifact. Every major phase or critical subsystem has a structured entry separating code existence from test coverage from type-check status from runtime validation. No future status claim should require guesswork about what "complete" means.

> **Last full verification run:** 2026-02-28T19:30:38Z (sandbox environment)
> - `npx tsc --noEmit`: **0 errors** (fresh run, not stale watch)
> - `pnpm test -- --run`: **929 passed / 0 failed** across **41 test files** in 17.94s
> - Runtime environment: Manus sandbox (Ubuntu 22.04). No live Wazuh instance connected.

---

## Verification Format (Mandatory for All Check-ins)

Every phase entry uses this structure:

| Field | Description |
|-------|-------------|
| **Status** | Complete / Partial / Open |
| **Code Evidence** | Files implementing it |
| **Test Evidence** | Files covering it |
| **Type-Check** | Last `tsc --noEmit` result and date |
| **Runtime Validation** | What was actually executed, where, and when |
| **Remaining Caveats** | Anything still not proven |

---

## Phase 1–14: Core UI Pages

**Status:** Complete

**Code Evidence:**
`client/src/pages/Home.tsx`, `AgentHealth.tsx`, `AlertsTimeline.tsx`, `Vulnerabilities.tsx`, `SiemEvents.tsx`, `Compliance.tsx`, `FileIntegrity.tsx`, `MitreAttack.tsx`, `RulesetExplorer.tsx`, `ClusterHealth.tsx`, `ThreatHunting.tsx`, `ThreatIntel.tsx`, `AnalystNotes.tsx`, `Assistant.tsx`

**Test Evidence:**
`server/wazuh/wazuhRouter.test.ts`, `server/wazuh/wazuhSpecCoverage.test.ts`, `server/wazuh/wazuhConnectivity.test.ts`, `server/wazuh/wazuhConnection.test.ts`

**Type-Check:** 0 errors (2026-02-28T19:30Z, fresh `npx tsc --noEmit`)

**Runtime Validation:** Pages render in browser. Data display requires live Wazuh API connection. Not independently re-run against live Wazuh in this review.

**Remaining Caveats:** None for code/tests. Runtime data display depends on Wazuh connectivity.

---

## Phase 15: IT Hygiene Ecosystem

**Status:** Complete

**Code Evidence:**
`client/src/pages/ITHygiene.tsx` (1555 lines). Tabbed layout with Software, Network, Identity sections. Packages, ports, processes, extensions, services, users/groups tables. Defensive `Array.isArray` guards on all fields.

**Test Evidence:**
Covered by `server/wazuh/wazuhRouter.test.ts` (syscollector endpoint tests).

**Type-Check:** 0 errors (2026-02-28T19:30Z)

**Runtime Validation:** Not independently re-run in this review. Requires live Wazuh agent with syscollector data.

**Remaining Caveats:** None for code. Runtime display depends on agent syscollector availability.

---

## Phase 16: Alerts Timeline Rebuild

**Status:** Complete

**Code Evidence:**
`client/src/pages/AlertsTimeline.tsx` (730 lines). Dense table, severity heatmap, rule distribution chart, top firing rules, detail panel with raw JSON, time range selector.

**Test Evidence:**
Covered by `server/wazuh/wazuhRouter.test.ts` (alerts endpoint tests).

**Type-Check:** 0 errors (2026-02-28T19:30Z)

**Runtime Validation:** Not independently re-run in this review. Requires Wazuh alerts data.

**Remaining Caveats:** None.

---

## Phase 17–30: Feature Phases (Threat Hunting, Investigations, KG, Agent Detail, Fleet Compare, Baselines, etc.)

**Status:** Complete

**Code Evidence:**
`client/src/pages/ThreatHunting.tsx`, `Investigations.tsx`, `KnowledgeGraph.tsx`, `AgentDetail.tsx`, `AgentCompare.tsx`, `AlertQueue.tsx`, `AutoQueueRules.tsx`, `AnalystChat.tsx`, `TokenUsage.tsx`, `DataPipeline.tsx`, `LivingCaseView.tsx`, `ResponseActions.tsx`, `PipelineInspector.tsx`, `FeedbackAnalytics.tsx`, `TriagePipeline.tsx`
Server: `server/hunt/huntRouter.ts`, `server/graph/`, `server/alertQueue/`, `server/baselines/baselinesRouter.ts`, `server/notes/notesRouter.ts`, `server/savedSearches/savedSearchesRouter.ts`

**Test Evidence:**
`server/hunt-persistence.test.ts`, `server/hunt-table-ruleset.test.ts`, `server/graph/graph.test.ts`, `server/kg-enhancements.test.ts`, `server/kg-context-menu-export.test.ts`, `server/kg-multiselect.test.ts`, `server/agentDetail.test.ts`, `server/agentDetailEnhancements.test.ts`, `server/alertQueue/alertQueueRouter.test.ts`, `server/alertQueue/autoQueue.test.ts`, `server/alertQueue/queueNotifier.test.ts`, `server/baselines/baselinesRouter.test.ts`, `server/notes/notesRouter.test.ts`, `server/savedSearches/savedSearchesRouter.test.ts`, `server/exportUtils.test.ts`, `server/chart-skeleton-error-boundary.test.ts`, `server/soundEngine.test.ts`

**Type-Check:** 0 errors (2026-02-28T19:30Z)

**Runtime Validation:** Not independently re-run in this review. Individual features require various Wazuh endpoints.

**Remaining Caveats:** None for code/tests.

---

## Phase 31: Scheduled Baseline Auto-Capture

**Status:** Partial — backend-complete, frontend-pending

**Code Evidence:**
- Schema: `drizzle/schema.ts` (`baselineSchedules` table, `scheduleId` column on `configBaselines`)
- Router: `server/baselines/baselineSchedulesRouter.ts` (8 procedures: list, get, create, update, toggle, delete, triggerNow, history)
- Scheduler: `server/baselines/baselineSchedulerService.ts` (5-min interval tick, per-agent capture, auto-pruning)
- Utilities: `server/baselines/scheduleUtils.ts` (frequency computation)
- Startup: `server/_core/index.ts` (calls `startBaselineScheduler()` with 30s warmup)
- Wiring: `server/routers.ts` (baselineSchedules router registered)

**Test Evidence:**
`server/baselines/baselineSchedules.test.ts` (30 tests covering utilities, schema exports, router structure, service exports, frequency coverage, edge cases)

**Type-Check:** 0 errors (2026-02-28T19:30Z, fresh run)

**Runtime Validation:** Backend not independently re-run against live Wazuh in this review. Scheduler tick requires live Wazuh syscollector endpoints to produce real baseline captures.

**Remaining Caveats:**
1. ~~Frontend schedule management UI not built~~ — **COMPLETE** (2026-03-01). "Schedules" tab in DriftComparison.tsx (142 schedule refs) with KPI cards, schedule list, Create/Edit dialog, toggle, Capture Now, history timeline.
2. End-to-end scheduler execution against live Wazuh not validated (requires private network)

---

## Phase 32: Wazuh Indexer Integration

**Status:** Mostly Complete

**Code Evidence:**
- Backend: `server/indexer/indexerClient.ts`, `server/indexer/indexerRouter.ts` (16 endpoints)
- Frontend: `client/src/pages/Home.tsx` (54 indexer refs), `AlertsTimeline.tsx` (20+ indexer refs incl. alertsSearch, alertsTimeline, alertsAggByLevel, alertsAggByRule, alertsAggByAgent), `Vulnerabilities.tsx` (17 refs), `SiemEvents.tsx` (16 refs), `Compliance.tsx` (alertsComplianceAgg + timeline AreaChart at line 356), `MitreAttack.tsx` (alertsAggByMitre + "Tactic Progression Timeline" AreaChart at line 476)

**Test Evidence:**
`server/indexer/indexerRouter.test.ts` (12 tests)

**Type-Check:** 0 errors (2026-03-01, `npx tsc --noEmit` EXIT: 0)

**Runtime Validation:** Not independently re-run. Requires live Wazuh Indexer (OpenSearch) instance.

**Remaining Caveats:**
1. No dedicated mock indexer data files for offline/demo mode — Optional enhancement only. Pages show empty states when Indexer is unreachable. No UI claims mock-data support.

**Completed (updated 2026-03-01):**
- `indexerClient.test.ts` — 37 unit tests across 8 describe blocks (config, query builders, INDEX_PATTERNS, search/health/exists, field stripping, errors). Total tests: 966 across 42 files.

**No Longer Open (corrected 2026-03-01):**
- ~~Compliance alert trend charts~~ — Implemented: `Compliance.tsx` calls `alertsComplianceAgg`, parses `aggregations.timeline.buckets`, renders AreaChart (line 356)
- ~~MITRE time-series tactic progression chart~~ — Implemented: `MitreAttack.tsx` calls `alertsAggByMitre`, parses timeline aggregations, builds per-tactic series, renders "Tactic Progression Timeline" AreaChart (line 476)

---

## Phase 33–47: OTX, Splunk, LLM, Enhanced LLM, HybridRAG

**Status:** Complete

**Code Evidence:**
`server/otx/otxClient.ts`, `server/otx/otxRouter.ts`, `server/splunk/splunkService.ts`, `server/splunk/splunkRouter.ts`, `server/llm/llmService.ts`, `server/llm/llmRouter.ts`, `server/enhancedLLM/enhancedLLMService.ts`, `server/enhancedLLM/enhancedLLMRouter.ts`, `server/hybridrag/hybridragRouter.test.ts`

**Test Evidence:**
`server/otx/otxRouter.test.ts`, `server/splunk/splunkConfig.test.ts`, `server/splunk/splunkRouter.test.ts`, `server/llm/llmConfig.test.ts`, `server/llm/llmRouter.test.ts`, `server/llm/llmService.test.ts`, `server/hybridrag/hybridragRouter.test.ts`

**Type-Check:** 0 errors (2026-02-28T19:30Z)

**Runtime Validation:** OTX and Splunk tests attempt network connections (timeout expected in sandbox — private IPs). LLM tests verify config structure. Not re-run against live services in this review.

**Remaining Caveats:** None for code. OTX/Splunk/LLM require live service endpoints for runtime validation.

---

## Phase 48–51: Dependabot, KG Multi-Select, Agent Drilldown

**Status:** Complete

**Code Evidence:**
`package.json` (0 known vulnerabilities), KG multi-select in `client/src/pages/KnowledgeGraph.tsx`, agent drilldown in `client/src/pages/AgentDetail.tsx`

**Test Evidence:**
`server/kg-multiselect.test.ts`, `server/kg-enhancements.test.ts`, `server/kg-context-menu-export.test.ts`, `server/agentDetail.test.ts`, `server/agentDetailEnhancements.test.ts`

**Type-Check:** 0 errors (2026-02-28T19:30Z)

**Runtime Validation:** Not independently re-run in this review.

**Remaining Caveats:** None.

---

## Phase 52: Connection Settings Admin Page

**Status:** Complete

**Code Evidence:**
- Backend: `server/admin/connectionSettingsService.ts` (runtime config with DB override + env fallback), `server/admin/connectionSettingsRouter.ts` (CRUD + testConnection), `server/admin/encryptionService.ts` (AES-256-GCM, 60 lines)
- Frontend: `client/src/pages/AdminSettings.tsx` (456 lines, SourceBadge component, Test Connection button)
- Integration: `server/wazuh/wazuhClient.ts` imports `getEffectiveWazuhConfig()`, `server/indexer/indexerClient.ts` imports `getEffectiveIndexerConfig()`

**Test Evidence:**
`server/admin/connectionSettings.test.ts` (15 tests)

**Type-Check:** 0 errors (2026-02-28T19:30Z)

**Runtime Validation:** Not independently re-run. DB override → Wazuh reconnection flow requires live Wazuh instance to validate end-to-end.

**Remaining Caveats:** End-to-end config override flow (save settings → Wazuh client reconnects with new credentials) not runtime-validated.

---

## Phase 58–59: /rules Page Crash Fix

**Status:** Complete

**Code Evidence:**
`client/src/pages/RulesetExplorer.tsx` (1034 lines, defensive normalization at lines 162–200: `Number()`, `String()`, `Array.isArray()` guards, `??` fallbacks). `client/src/components/ErrorBoundary.tsx` wraps all routes in `App.tsx`.

**Test Evidence:**
Covered by `server/wazuh/wazuhRouter.test.ts` (rules endpoint tests).

**Type-Check:** 0 errors (2026-02-28T19:30Z)

**Runtime Validation:** Not independently re-run against live Wazuh rules API in this review. Normalization handles known field shapes.

**Remaining Caveats:** Unusual Wazuh rule configurations with unexpected field shapes not yet tested against live API.

---

## Agentic SOC Pipeline (Steps 1–3)

**Status:** Complete

**Code Evidence:**
`server/agenticPipeline/triageAgent.ts`, `correlationAgent.ts`, `hypothesisAgent.ts`, `pipelineRouter.ts`, `responseActionsRouter.ts`, `stateMachine.ts` (446 lines, 8 invariants), `livingCaseReportService.ts`
Frontend: `client/src/pages/PipelineInspector.tsx` (ArtifactsDrillDown), `LivingCaseView.tsx`, `ResponseActions.tsx`, `FeedbackAnalytics.tsx`, `TriagePipeline.tsx`

**Test Evidence:**
`server/agenticPipeline.test.ts`, `server/responseActions.test.ts`, `server/pipelineHandoff.test.ts`, `server/directions1-6.test.ts`, `server/directions8-10.test.ts`, `server/counterDrift.test.ts`

**Type-Check:** 0 errors (2026-02-28T19:30Z)

**Runtime Validation:** Pipeline execution requires live LLM endpoint + Wazuh alerts. Not independently re-run in this review.

**Remaining Caveats:** Full pipeline execution (alert → triage → correlation → hypothesis → actions → report) not runtime-validated end-to-end in this snapshot.

---

## Code Review Directions 1–10

**Status:** Complete

**Code Evidence:**
- D1: `updateActionState` removed, LivingCaseView uses `responseActions.approve/reject/defer/execute`
- D2: `livingCaseReportService.ts` uses exact `sourceTriageId`/`sourceCorrelationId`
- D3: Both ResponseActions page and LivingCaseView read from `response_actions` table
- D4: `recommendedActionIds` + `actionSummary` in `LivingCaseObject`, `recommendedActions` is display snapshot
- D5: `stateMachine.ts` (446 lines) — centralized `transitionActionState()` with 8 invariants
- D6: `ArtifactsDrillDown` in `PipelineInspector.tsx`, `getRunArtifacts` endpoint
- D7: Action cards show AI recommendation vs human decision separation
- D8: Category-semantic validation in `materializeResponseActions`, `semanticWarning` column
- D9: `replayPipelineRun` endpoint, Replay button in Pipeline Inspector
- D10: `FeedbackAnalytics.tsx`, `feedbackAnalytics` endpoint

**Test Evidence:**
`server/directions1-6.test.ts` (50+ tests), `server/directions8-10.test.ts` (38 tests)

**Type-Check:** 0 errors (2026-02-28T19:30Z)

**Runtime Validation:** Not independently re-run. Requires live LLM + Wazuh.

**Remaining Caveats:** None for code/tests.

---

## Counter Drift Fix

**Status:** Complete

**Code Evidence:**
`server/agenticPipeline/stateMachine.ts` — `recomputeCaseSummary()` and `syncCaseSummaryAfterTransition()`. Called after every state transition and after action materialization in `hypothesisAgent.ts`.

**Test Evidence:**
`server/counterDrift.test.ts` (23 tests)

**Type-Check:** 0 errors (2026-02-28T19:30Z)

**Runtime Validation:** Not independently re-run. Counter sync logic is deterministic (SQL queries), but end-to-end validation requires pipeline execution.

**Remaining Caveats:** None for code/tests.

---

## Rewire to Local Wazuh (192.168.50.158)

**Status:** Environment-Specific — code ready, deployment blocked

**Code Evidence:**
`server/wazuh/wazuhClient.ts` reads `WAZUH_HOST` from env + runtime config. `server/indexer/indexerClient.ts` reads `WAZUH_INDEXER_HOST` from env + runtime config. `server/admin/connectionSettingsService.ts` provides DB override.

**Test Evidence:**
`server/wazuh/wazuhConnection.test.ts` (connection attempt tests — timeout expected in sandbox)

**Type-Check:** 0 errors (2026-02-28T19:30Z)

**Runtime Validation:** Sandbox cannot reach private 192.168.x.x IPs. Not a code gap — requires deployment to a network with access.

**Remaining Caveats:** Deployment-time configuration and network routing. Not a code deficiency.

---

## Auth & Admin

**Status:** Complete

**Code Evidence:**
`server/localAuth/`, `server/admin/adminUsers.test.ts`, `client/src/pages/AdminUsers.tsx`, `client/src/pages/Login.tsx`, `client/src/pages/Register.tsx`

**Test Evidence:**
`server/auth.logout.test.ts`, `server/localAuth/localAuth.test.ts`, `server/admin/adminUsers.test.ts`

**Type-Check:** 0 errors (2026-02-28T19:30Z)

**Runtime Validation:** OAuth flow tested via browser in sandbox. Local auth flow implemented but not re-tested in this review.

**Remaining Caveats:** None.

---

## Phase 2: Wazuh Parameter Broker

**Status:** Complete

**Code Evidence:**
- Broker core: `server/wazuh/paramBroker.ts` (552 lines — `CoerceResult` tuple pattern, 4 default coercers, `brokerParams()` with alias resolution, 7 endpoint configs)
- Router integration: `server/wazuh/wazuhRouter.ts` (7 call sites using `brokerParams()` for agents, rules, groups, cluster/nodes, sca/policies, sca/checks, manager/configuration)
- Coverage ledger: `docs/broker-coverage-ledger.md` (endpoint inventory, parameter families, test counts, out-of-scope list)

**Test Evidence:**
`server/wazuh/paramBroker.test.ts` (~215 tests covering: broker core mechanics, Fix A1 os.platform alias resolution, Fix A2 search vs q distinction, endpoint-specific configs, universal params, compliance filter family, manager config precision params, SCA filters, cross-endpoint isolation, Phase 2 Review Fixes: errors[] contract, coerceBoolean strict semantics, status CSV array, level custom serializer, distinct flag omission)

**Type-Check:** 0 errors (2026-03-04T10:28Z, fresh `npx tsc --noEmit` EXIT 0)

**Runtime Validation:** `pnpm test --run` — 1,684 passed / 0 failed across 62 test files (2026-03-04T10:28Z, Manus sandbox). Broker logic is pure-function, no live Wazuh connection required for unit tests. End-to-end parameter forwarding to live Wazuh not validated (requires private network).

**Remaining Caveats:**
1. Router call sites destructure `{ forwardedQuery, unsupportedParams }` but do not yet surface `errors[]` to API callers — coercion errors are recorded but not returned in responses. This is a future enhancement, not a correctness issue.
2. Syscollector family (8 endpoints) not yet broker-wired — Phase 3 candidate.
3. MITRE, syscheck, manager/logs, vulnerability endpoints not yet broker-wired.

---

## Global Verification Summary

| Metric | Value | When | Where | Method |
|--------|-------|------|-------|--------|
| TypeScript errors | 0 | 2026-03-04T10:28Z | Manus sandbox | Fresh `npx tsc --noEmit` EXIT 0 |
| Test suite | 1,684 passed / 0 failed | 2026-03-04T10:28Z | Manus sandbox | `pnpm test --run` |
| Test files | 62 | 2026-03-04T10:28Z | Manus sandbox | All passed |
| Runtime (Wazuh API) | Not validated | — | — | No live Wazuh instance connected to sandbox |
| Runtime (Indexer) | Not validated | — | — | No live Wazuh Indexer connected to sandbox |
| Runtime (LLM) | Not validated | — | — | Private network LLM endpoint unreachable from sandbox |
| Runtime (Splunk) | Not validated | — | — | Private network Splunk endpoint unreachable from sandbox |

---

## Rules Going Forward

1. **No unqualified "complete" claims.** Every status must specify: code exists, tests exist, tests passed (when/where), runtime validated (when/where/how).
2. **"Tests passing" requires a date and environment.** Do not write "all tests pass" without stating when the run happened and whether it was fresh or recalled from memory.
3. **"0 TS errors" requires specifying fresh run vs stale watch.** The dev server watch process caches errors from deleted/renamed files. Only `npx tsc --noEmit` from a clean shell is authoritative.
4. **Runtime validation is a separate claim from code/test existence.** Many subsystems require live Wazuh/Indexer/LLM/Splunk connections that the sandbox cannot provide. State this explicitly.
5. **When implementation completes, update the canonical entry.** Do not only append a new section — go back and update the original phase entry to match reality.
