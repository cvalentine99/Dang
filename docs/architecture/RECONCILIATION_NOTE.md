# Reconciliation Note — Status Reporting Drift (2026-02-28)

## What Happened

Phase 31 (Scheduled Baseline Auto-Capture) was originally marked as **STATUS: OPEN** in `todo.md` during a reconciliation pass on 2026-02-28. At that time, the assessment was accurate — no backend code existed.

Later in the same session, the Phase 31 backend was fully implemented:

- `baseline_schedules` table added to `drizzle/schema.ts`
- CRUD router built in `server/baselines/baselineSchedulesRouter.ts` (8 procedures)
- Scheduler service created in `server/baselines/baselineSchedulerService.ts`
- Startup wiring added to `server/_core/index.ts`
- Router wiring added to `server/routers.ts`
- 30 tests written in `server/baselines/baselineSchedules.test.ts`

However, the **original Phase 31 entry at line ~333** was not updated after implementation. A **second entry** was appended at line ~1824 with all items checked off. This created two contradictory entries for the same phase:

1. Line 333: "STATUS: OPEN — No implementation exists" (false after implementation)
2. Line 1824: "All backend items [x] complete" (true)

The `status-truth-table.md` was generated from the stale line-333 entry, propagating the false "Open" claim.

## Root Cause

The drift occurred because implementation was done **after** the reconciliation pass, and only the append-style implementation log was updated — not the canonical phase entry. The rule of "update the canonical entry, not just append a new one" was not followed.

## What Was Fixed

### `todo.md`

- **Line 333**: Changed from `STATUS: OPEN` to `STATUS: PARTIAL (backend-complete, frontend-pending)`
- Removed false blockquote: ~~"No implementation exists. No baseline_schedules table in schema, no scheduler service, no frontend schedule UI."~~
- Replaced with accurate summary: "Backend is fully implemented: schema, CRUD router, scheduler service, startup wiring, and tests. Frontend schedule management UI has not been built yet."
- Backend items marked `[x]` with file evidence
- Frontend items remain `[ ]` — these are genuinely unbuilt
- Added verification note distinguishing code-complete from runtime-validated

### `todo.md` — Duplicate Entry

- **Line 1824**: Replaced the full duplicate checklist with a cross-reference to the canonical entry at line 333. Retained as implementation log history only.

### `status-truth-table.md`

- Phase 31 row changed from `Open ❌` to `Partial ✅ Code ✅ Tests (backend)`
- Evidence column updated with 7 specific file paths
- Remaining work column narrowed to: "Frontend schedule management UI (5 items)"
- Test count updated from 902 to 929
- Test files updated from 40 to 41
- Remaining work summary updated to reflect backend-complete status

## Confirmation

All four documents now tell the same story:

| Document | Phase 31 Status | Consistent |
|----------|----------------|------------|
| `todo.md` (line 333) | Partial — backend-complete, frontend-pending | ✅ |
| `todo.md` (line 1824) | Cross-reference to line 333 | ✅ |
| `status-truth-table.md` | Partial ✅ Code ✅ Tests (backend) | ✅ |
| This reconciliation note | Partial | ✅ |

## Clean Remaining-Work Summary

### Phase 31: Scheduled Baseline Auto-Capture — COMPLETE

**Implemented (backend + frontend):**
- `baseline_schedules` table in `drizzle/schema.ts` + SQL applied (dropped and recreated with correct 14-column schema on 2026-03-01)
- 8-procedure CRUD router: list, get, create, update, toggle, delete, triggerNow, history
- BaselineSchedulerService: 5-min interval tick, per-agent syscollector capture, auto-pruning, fail-closed error handling
- Server startup wiring with 30s warmup delay
- 30 vitest tests passing
- **Frontend:** "Schedules" tab in DriftComparison (142 schedule refs) — KPI cards (4), schedule list with toggle/status/frequency/agents/captures/timestamps, Create/Edit dialog with name/frequency(6 options)/retention/agent checkboxes, action buttons (Capture Now/Edit/Delete), expandable baseline history timeline with "View Drift" links, empty state with CTA, loading spinners

**Verification status:**
- Code exists: ✅ (backend + frontend)
- Tests pass: ✅ (969/969 as of 2026-03-01T14:13Z)
- TypeScript clean: ✅ (0 errors from fresh `npx tsc --noEmit` at 2026-03-01T14:07Z)
- Runtime validated against live Wazuh: Not freshly performed (requires private network)

### Phase 32: Indexer Integration — COMPLETE (1 optional item remains)

**Remaining (1 optional item — not a deploy blocker):**
1. Dedicated mock indexer data files for offline/demo mode (3 fixture files) — This is an **enhancement**, not a gap. The app works correctly without mock data: pages show empty states when Indexer is unreachable. No UI claims mock-data support.

**Completed (updated 2026-03-01):**
- `indexerClient.test.ts` — 37 unit tests across 8 describe blocks (config, query builders, INDEX_PATTERNS, search/health/exists, field stripping, errors)

**No longer open (corrected 2026-03-01):**
- ~~Compliance alert trend charts~~ — Implemented in `Compliance.tsx` (AreaChart from `alertsComplianceAgg` timeline buckets)
- ~~MITRE time-series tactic progression chart~~ — Implemented in `MitreAttack.tsx` ("Tactic Progression Timeline" AreaChart from `alertsAggByMitre`)

### Environment-Blocked (not code gaps)

- Rewire to Local Wazuh (192.168.50.158): Code supports any host via env vars + runtime config. Blocked on network access.

### Runtime Validation Gaps

- Connection Settings end-to-end: Code + tests complete. DB override → Wazuh reconnection flow requires live instance.
- RulesetExplorer edge cases: Normalization handles known field shapes. Unusual Wazuh rule configurations not yet tested against live API.

---

## Rule Going Forward

**If the code exists, the status must acknowledge it.**
**If only part of the phase exists, the status must say Partial.**
**If runtime validation has not been freshly performed, do not imply that it has.**
**When implementation completes, update the canonical entry — do not only append a new one.**
