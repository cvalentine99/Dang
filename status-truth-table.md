# Status Truth Table — Dang! (Wazuh Web Application)

> Generated 2026-02-28 from code-level audit.
> Separates **code-complete** from **test-covered** from **runtime-validated**.

---

## Verification Legend

| Symbol | Meaning |
|--------|---------|
| ✅ Code | Implementation exists in codebase |
| ✅ Tests | Vitest tests exist and pass |
| ✅ Types | TypeScript compiles clean (0 errors) |
| ⚠️ Runtime | Requires live Wazuh/Indexer instance for end-to-end validation |
| ❌ | Not implemented |

---

## Phase-Level Reconciliation

| Phase | Claimed Status | Actual Status | Evidence Files | Remaining Work |
|-------|---------------|---------------|----------------|----------------|
| **Phase 1–14: Core UI** | Complete | **Complete** ✅ Code ✅ Tests ✅ Types | `client/src/pages/Home.tsx`, `AgentHealth.tsx`, `AlertsTimeline.tsx`, `Vulnerabilities.tsx`, `SiemEvents.tsx`, `Compliance.tsx`, `FileIntegrity.tsx`, `MitreAttack.tsx`, `RulesetExplorer.tsx`, `ClusterHealth.tsx` | None |
| **Phase 15: IT Hygiene** | Unchecked | **Complete** ✅ Code ✅ Tests ✅ Types | `client/src/pages/ITHygiene.tsx` (1555 lines). Packages, ports, processes, extensions, services, users/groups tables all implemented. | None |
| **Phase 16: Alerts Timeline** | Unchecked | **Complete** ✅ Code ✅ Tests ✅ Types | `client/src/pages/AlertsTimeline.tsx` (730 lines). Dense table, heatmap, rule distribution, detail panel, time range selector. | None |
| **Phase 17–30: Features** | Complete | **Complete** ✅ Code ✅ Tests ✅ Types | Threat Hunting, Investigations, Knowledge Graph, Agent Detail, Fleet Compare, etc. | None |
| **Phase 31: Scheduled Baseline Auto-Capture** | Was unchecked | **Complete** ✅ Code ✅ Tests ✅ Frontend | Backend: `baselineSchedulesRouter.ts` (8 procedures), `baselineSchedulerService.ts`, `scheduleUtils.ts`, `baselineSchedules.test.ts` (30 tests). Frontend: `DriftComparison.tsx` "Schedules" tab (142 schedule refs) — KPI cards, schedule list with toggle/status/frequency/agents, Create/Edit dialog, Capture Now, history timeline, View Drift links. DB: `baseline_schedules` table recreated with correct 14-column schema. | None. Phase 31 is fully complete. |
| **Phase 32: Indexer Integration** | Was partially unchecked | **Complete** ✅ Code ✅ Tests ✅ Frontend | Backend: `indexerClient.ts`, `indexerRouter.ts` (18 endpoints). Frontend: `Home.tsx` (54 refs), `AlertsTimeline.tsx` (20+ refs), `Vulnerabilities.tsx` (17 refs), `SiemEvents.tsx` (16 refs), `Compliance.tsx` (alertsComplianceAgg + timeline AreaChart), `MitreAttack.tsx` (alertsAggByMitre + Tactic Progression Timeline AreaChart). Tests: `indexerRouter.test.ts` (12 tests) + `indexerClient.test.ts` (37 tests). | **Optional enhancement:** Dedicated mock indexer fixture files for offline/demo mode. Not a deploy blocker — pages show empty states when Indexer is unreachable. No UI claims mock-data support. |
| **Phase 33–47: OTX, Splunk, LLM, KG, Agent Detail** | Complete | **Complete** ✅ Code ✅ Tests ✅ Types | All features implemented and tested. | None |
| **Phase 48: Dependabot Fixes** | Complete | **Complete** ✅ Code ✅ Tests | `package.json` updated, 0 vulnerabilities. | None |
| **Phase 49–51: KG Multi-Select, Lasso, Agent Drilldown** | Complete | **Complete** ✅ Code ✅ Tests ✅ Types | All features implemented. KG tests: 29 tests across 3 files. | None |
| **Phase 52: Connection Settings** | Unchecked | **Complete** ✅ Code ✅ Tests ✅ Types | `server/admin/connectionSettingsService.ts`, `server/admin/connectionSettingsRouter.ts`, `server/admin/encryptionService.ts` (AES-256-GCM), `client/src/pages/AdminSettings.tsx` (456 lines), `server/admin/connectionSettings.test.ts` (15 tests). Wazuh client uses `getEffectiveWazuhConfig()`, Indexer client uses `getEffectiveIndexerConfig()`. | ⚠️ Runtime: End-to-end config override flow requires live Wazuh instance. |
| **Phase 53–57: Real API, Sound Engine, Notifications** | Complete | **Complete** ✅ Code ✅ Tests ✅ Types | All mock data removed. Real API calls wired. | None |
| **Phase 58: /rules crash fix (normalization)** | Complete | **Complete** ✅ Code ✅ Tests ✅ Types | `RulesetExplorer.tsx` lines 162–200: defensive normalization with `Number()`, `String()`, `Array.isArray()` guards. | None |
| **Phase 59: /rules crash (error boundary)** | Partially unchecked | **Complete** ✅ Code ✅ Tests ✅ Types | `ErrorBoundary.tsx` wraps all routes. Phase 58 normalization IS the root fix. Error boundary is the safety net. | ⚠️ Runtime: Edge cases with unusual Wazuh rule shapes not yet tested against live API. |
| **Phase: Rewire to Local Wazuh** | Unchecked | **Environment-Specific / Code Ready** ✅ Code | `wazuhClient.ts` reads `WAZUH_HOST` from env + runtime config. `indexerClient.ts` reads `WAZUH_INDEXER_HOST` from env + runtime config. `connectionSettingsService.ts` provides DB override. | **Blocked:** Requires deployment to network with access to 192.168.50.158. Sandbox cannot reach private IPs. Not a code gap. |
| **Phase: Agentic SOC Pipeline (Steps 1–3)** | Complete | **Complete** ✅ Code ✅ Tests ✅ Types | `triageAgent.ts`, `correlationAgent.ts`, `hypothesisAgent.ts`, `pipelineRouter.ts`, `responseActionsRouter.ts`, `stateMachine.ts`, `livingCaseReportService.ts`. | None |
| **Phase: SOC Maturity Audit** | Complete | **Complete** ✅ Code ✅ Tests ✅ Types | Response actions table, audit trail, full pipeline chain, pipeline context retrieval. | None |
| **Phase: Code Review Directions 1–10** | Directions 1-6 unchecked (stale) | **All 10 Complete** ✅ Code ✅ Tests ✅ Types | Directions 1-6: `stateMachine.ts` (446 lines), `livingCaseReportService.ts`, `PipelineInspector.tsx` (ArtifactsDrillDown). Directions 7-10: semantic validation, replay endpoint, feedback analytics. Tests: `directions1-6.test.ts`, `directions8-10.test.ts`. | None |
| **Phase: Counter Drift Fix** | Complete | **Complete** ✅ Code ✅ Tests ✅ Types | `recomputeCaseSummary()` and `syncCaseSummaryAfterTransition()` in `stateMachine.ts`. `counterDrift.test.ts` (23 tests). | None |

---

## Global Verification Status

| Metric | Value | Verified |
|--------|-------|----------|
| Total vitest tests | 966 | ✅ All pass (2026-03-01, checkpoint 0a853575) |
| Test files | 42 | ✅ All pass |
| TypeScript errors | 0 | ✅ `npx tsc --noEmit` clean (2026-03-01, EXIT: 0) |
| Runtime validation | Partial | ⚠️ Requires live Wazuh 4.14.x instance |

---

## Actual Remaining Work (Narrowed)

### All Major Phases Complete

1. **Phase 31: Scheduled Baseline Auto-Capture** — **COMPLETE** (backend + frontend). Schedule management tab in DriftComparison with full CRUD, toggle, triggerNow, history timeline, KPI cards.
2. **Phase 32: Indexer Integration** — **COMPLETE**. `indexerClient.test.ts` (37 tests) written. All trend charts confirmed implemented.

### Optional Enhancements (Not Deploy Blockers)

1. Dedicated mock indexer fixture files for offline/demo mode — Enhancement only. Pages show empty states when Indexer is unreachable. No UI claims mock-data support.

### Environment-Blocked — Not Code Gaps

3. **Rewire to Local Wazuh (192.168.50.158)** — Code supports any host via env vars and runtime config. Blocked on network access from deployment environment to private IP.

### Runtime Validation Gaps

4. **Connection Settings end-to-end** — Code + tests complete. Runtime validation of DB override → Wazuh reconnection flow requires live instance.
5. **RulesetExplorer edge cases** — Normalization handles known field shapes. Unusual Wazuh rule configurations not yet tested against live API.

---

## What Is NOT Remaining (Corrected from Previous Reports)

| Previously Reported As Open | Actual Status | Evidence |
|-----------------------------|---------------|----------|
| Phase 15: IT Hygiene | **Complete** | `ITHygiene.tsx` (1555 lines) |
| Phase 16: Alerts Timeline | **Complete** | `AlertsTimeline.tsx` (730 lines) |
| Phase 52: Connection Settings | **Complete** | 5 files, 15 tests, AES-256-GCM encryption |
| Phase 59: /rules crash | **Complete** | Defensive normalization + error boundary |
| Directions 1–6 | **Complete** | `stateMachine.ts`, `directions1-6.test.ts` |
| Phase 32: SOC Console/Vuln/SIEM frontend | **Complete** | 54+17+16 indexer references across pages |
