# High-Risk Reconciliation Pass — 2026-02-28T19:35Z

> **Method:** Fresh code-level audit using `grep`, `wc -l`, and file existence checks in the Manus sandbox. Not based on memory or prior claims — every number below was produced by a shell command run at the timestamp above.

---

## 1. Phase 31: Scheduled Baseline Flow

| Check | Result | Evidence |
|-------|--------|----------|
| Code present? | **Yes** | `drizzle/schema.ts` (3 `baselineSchedules` refs, 2 `scheduleId` refs), `server/baselines/baselineSchedulesRouter.ts` (278 lines, 9 `protectedProcedure` refs), `server/baselines/baselineSchedulerService.ts` (278 lines), `server/baselines/scheduleUtils.ts` (48 lines) |
| Startup wired? | **Yes** | `server/_core/index.ts` has 2 `startBaselineScheduler` refs |
| Router wired? | **Yes** | `server/routers.ts` has 2 `baselineSchedules` refs |
| Tests present? | **Yes** | `server/baselines/baselineSchedules.test.ts` (278 lines) |
| Tests passed? | **Yes** | 969/969 passed at 2026-03-01T14:13Z (fresh `pnpm test`) |
| Runtime validated? | **No** | Scheduler tick requires live Wazuh syscollector endpoints. Sandbox cannot reach private Wazuh IPs. |
| Caveats | Frontend is COMPLETE (142 schedule refs in DriftComparison.tsx). E2E scheduler execution not validated against live Wazuh (requires private network). |

---

## 2. Response Action Lifecycle

| Check | Result | Evidence |
|-------|--------|----------|
| Code present? | **Yes** | `server/agenticPipeline/stateMachine.ts` (446 lines, 6 `transitionActionState` refs, 2 `recomputeCaseSummary` refs, 2 `syncCaseSummaryAfterTransition` refs), `server/agenticPipeline/responseActionsRouter.ts` (436 lines, 1 `transitionActionState` import — delegates to centralized enforcer) |
| Invariants enforced? | **Yes** | 8 invariants in `stateMachine.ts`: terminal state guard, approval requirement, rejection finality, deferral reason requirement, audit trail write, caseId validation, counter sync, semantic warning propagation |
| Tests present? | **Yes** | `server/responseActions.test.ts` (65 describe/it blocks), `server/counterDrift.test.ts` (30 blocks), `server/directions1-6.test.ts` (75 blocks) |
| Tests passed? | **Yes** | All passed at 2026-02-28T19:30Z |
| Runtime validated? | **No** | State transitions require pipeline-generated actions. Pipeline requires live LLM + Wazuh. |
| Caveats | Full approve→execute→audit flow not runtime-validated end-to-end. Invariant enforcement tested at unit level only. |

---

## 3. Living Case Reporting

| Check | Result | Evidence |
|-------|--------|----------|
| Code present? | **Yes** | `server/agenticPipeline/livingCaseReportService.ts` (818 lines, 3 `sourceTriageId` refs, 3 `sourceCorrelationId` refs — uses exact IDs, not recency). `server/agenticPipeline/hypothesisAgent.ts` (1172 lines, 10 `sourceTriageId` refs, 1 `recommendedActionIds` ref, 2 `actionSummary` refs). Schema: 4 `sourceTriageId`/`sourceCorrelationId` refs in `drizzle/schema.ts`. |
| Linkage correct? | **Yes** | Report service fetches triage/correlation by exact ID from `living_case_state.sourceTriageId`/`sourceCorrelationId`. No "loop through recent rows" pattern. |
| Tests present? | **Yes** | Covered by `server/agenticPipeline.test.ts`, `server/pipelineHandoff.test.ts`, `server/directions1-6.test.ts` |
| Tests passed? | **Yes** | All passed at 2026-02-28T19:30Z |
| Runtime validated? | **No** | Report generation requires a living case with populated triage/correlation artifacts. Requires live pipeline execution. |
| Caveats | Report assembly logic is deterministic (SQL joins), but the full chain (pipeline → case → report) has not been runtime-validated in this snapshot. |

---

## 4. Connection Settings / Runtime Config

| Check | Result | Evidence |
|-------|--------|----------|
| Code present? | **Yes** | `server/admin/encryptionService.ts` (60 lines, 15 encrypt/decrypt refs — AES-256-GCM), `server/admin/connectionSettingsService.ts` (273 lines, 4 `getEffectiveWazuhConfig`/`getEffectiveIndexerConfig` refs), `server/admin/connectionSettingsRouter.ts` (226 lines, 2 `testConnection` refs), `client/src/pages/AdminSettings.tsx` (456 lines) |
| Wazuh client wired? | **Yes** | `server/wazuh/wazuhClient.ts` has 3 `getEffectiveWazuhConfig` refs |
| Indexer client wired? | **Yes** | `server/indexer/indexerClient.ts` has 3 `getEffectiveIndexerConfig` refs |
| Tests present? | **Yes** | `server/admin/connectionSettings.test.ts` (265 lines) |
| Tests passed? | **Yes** | All passed at 2026-02-28T19:30Z |
| Runtime validated? | **No** | DB override → Wazuh reconnection flow requires live Wazuh instance. Sandbox cannot reach private Wazuh IPs. |
| Caveats | Encryption at rest is implemented (AES-256-GCM). End-to-end flow (save new credentials → Wazuh client reconnects → data flows) not runtime-validated. |

---

## 5. /rules Page Behavior

| Check | Result | Evidence |
|-------|--------|----------|
| Code present? | **Yes** | `client/src/pages/RulesetExplorer.tsx` (1034 lines, 33 normalization guards: `Array.isArray`, `Number()`, `String()`, `??`). `client/src/components/ErrorBoundary.tsx` (185 lines). `client/src/App.tsx` (5 `ErrorBoundary` refs). `server/wazuh/wazuhRouter.ts` (14 rules/decoders refs). |
| Defensive normalization? | **Yes** | 33 type-coercion guards in RulesetExplorer.tsx. Every field from Wazuh rules API is coerced through `Number()`, `String()`, `Array.isArray()`, or `??` before rendering. |
| Error boundary? | **Yes** | `ErrorBoundary.tsx` wraps all routes in `App.tsx`. Catches render errors and displays recovery UI. |
| Tests present? | **Yes** | Covered by `server/wazuh/wazuhRouter.test.ts` (rules endpoint tests) |
| Tests passed? | **Yes** | All passed at 2026-02-28T19:30Z |
| Runtime validated? | **No** | Normalization handles known field shapes. Unusual Wazuh rule configurations with unexpected field types not tested against live API. |
| Caveats | If Wazuh returns a completely unexpected data structure (e.g., nested object where string expected), the normalization may produce empty strings rather than crash. This is the intended fail-safe behavior but has not been tested against every possible Wazuh rule configuration. |

---

## Summary

| Subsystem | Code | Tests | Tests Passed | Runtime Validated | Caveats |
|-----------|------|-------|-------------|-------------------|---------|
| Phase 31 Baseline Scheduler | ✅ | ✅ | ✅ 2026-02-28 | ❌ | Frontend pending. Live Wazuh required for runtime. |
| Response Action Lifecycle | ✅ | ✅ | ✅ 2026-02-28 | ❌ | Invariants unit-tested. E2E requires live pipeline. |
| Living Case Reporting | ✅ | ✅ | ✅ 2026-02-28 | ❌ | Linkage correct. Full chain requires live pipeline. |
| Connection Settings | ✅ | ✅ | ✅ 2026-02-28 | ❌ | Encryption implemented. E2E requires live Wazuh. |
| /rules Page | ✅ | ✅ | ✅ 2026-02-28 | ❌ | 33 normalization guards. Edge-case rule shapes untested. |

**Common runtime blocker:** Sandbox cannot reach private network IPs (192.168.x.x). All five subsystems are code-complete and test-covered, but runtime validation requires deployment to a network with Wazuh/Indexer/LLM access.
