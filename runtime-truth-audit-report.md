# Runtime Truth Audit — Dang! Security Platform

**Date:** 2026-03-03
**Auditor:** Manus AI
**Version:** `b4532535`
**Scope:** Full runtime truth verification of the repaired workflow — migration correctness, Splunk ticket success/failure paths, first-class ticket lineage, partial pipeline semantics, queue-to-pipeline visibility, readiness/Wazuh truth, and absence of regression.

---

## Executive Summary

This audit systematically verifies eight claims about the Dang! Security Platform's workflow integrity. Every claim is evaluated with code-level evidence from the backend, frontend, database schema, migration SQL, and live DB state. A live UI screenshot confirms visual correctness and the absence of regressions.

| Audit | Claim | Verdict |
|-------|-------|---------|
| 1 | Migration correctness (schema = migration = live DB) | **PASS** |
| 2 | Splunk ticket success path (truthful success toast + artifact) | **PASS** |
| 3 | Splunk ticket failure path (error toast + failure artifact) | **PASS** |
| 4 | First-class ticket lineage (4-path indexed FK linkage) | **PASS** |
| 5 | Partial pipeline run semantics (Triage Only, not Completed) | **PASS** |
| 6 | Queue triage visibility in Pipeline Inspector | **PASS** |
| 7 | Readiness / Wazuh truth (structured error detail) | **PASS** |
| 8 | Regression check (1,286 tests, 0 TS errors, UI intact) | **PASS** |

**Overall verdict: 8/8 PASS. No regressions detected.**

---

## Audit 1: Fresh Migration Correctness

The `ticket_artifacts` table must be identical across three sources: the Drizzle schema (`drizzle/schema.ts`), the migration SQL (`drizzle/0012_ticket_artifacts.sql`), and the live database. The critical column under scrutiny is `triageId`, which was previously missing from the migration file.

### Three-Way Column Comparison

| # | Column | Schema (Drizzle) | Migration SQL | Live DB |
|---|--------|-----------------|---------------|---------|
| 1 | `id` | int, autoincrement, PK | int AUTO_INCREMENT NOT NULL, PK | int, NOT NULL |
| 2 | `ticketId` | varchar(128), notNull | varchar(128) NOT NULL | varchar(128), NOT NULL |
| 3 | `system` | enum(splunk_es, jira, servicenow, custom), default splunk_es | enum(...) NOT NULL DEFAULT 'splunk_es' | enum(...), NOT NULL |
| 4 | `queueItemId` | int, notNull | int NOT NULL | int, NOT NULL |
| 5 | `pipelineRunId` | int, nullable | int (no NOT NULL) | int, nullable |
| 6 | **`triageId`** | **varchar(64), nullable** | **varchar(64) (no NOT NULL)** | **varchar(64), nullable** |
| 7 | `alertId` | varchar(128), notNull | varchar(128) NOT NULL | varchar(128), NOT NULL |
| 8 | `ruleId` | varchar(32), nullable | varchar(32) | varchar(32), nullable |
| 9 | `ruleLevel` | int, nullable | int | int, nullable |
| 10 | `createdBy` | varchar(256), notNull | varchar(256) NOT NULL | varchar(256), NOT NULL |
| 11 | `success` | boolean, notNull | boolean NOT NULL | tinyint(1), NOT NULL |
| 12 | `statusMessage` | text, nullable | text | text, nullable |
| 13 | `rawResponse` | json, nullable | json | json, nullable |
| 14 | `httpStatusCode` | int, nullable | int | int, nullable |
| 15 | `createdAt` | timestamp, defaultNow, notNull | timestamp NOT NULL DEFAULT (now()) | timestamp, NOT NULL |

All 15 columns match across schema, migration, and live DB. The `triageId` column (position 6) is present in all three sources.

### Index Comparison

| Index Name | Schema | Migration SQL | Live DB |
|------------|--------|---------------|---------|
| PRIMARY | id (auto) | id (PK constraint) | id (BTREE) |
| `ta_ticketId_idx` | ticketId | ticketId | ticketId (BTREE) |
| `ta_queueItemId_idx` | queueItemId | queueItemId | queueItemId (BTREE) |
| `ta_pipelineRunId_idx` | pipelineRunId | pipelineRunId | pipelineRunId (BTREE) |
| **`ta_triageId_idx`** | **triageId** | **triageId** | **triageId (BTREE)** |
| `ta_alertId_idx` | alertId | alertId | alertId (BTREE) |
| `ta_system_idx` | system | system | system (BTREE) |
| `ta_createdAt_idx` | createdAt | createdAt | createdAt (BTREE) |

All 8 indexes match. The previously missing `ta_triageId_idx` is now present in the migration and live DB. **PASS.**

---

## Audit 2: Splunk Ticket Success Path

When HEC confirms ticket creation, the backend must return `{ success: true, ticketId: "DANG-..." }`, the UI must show a success toast with the ticket ID, and a first-class `ticket_artifacts` row must be inserted with `success=true`.

The backend return at `server/splunk/splunkRouter.ts:270-275` is gated on `result.success && result.ticketId` — both must be truthy. If HEC returns success but no ticketId, this branch is not taken. The UI toast logic at `client/src/pages/AlertQueue.tsx:227-237` checks `result.success === true && result.ticketId` before showing `toast.success`. The `else` branch shows `toast.error` — never a success toast for a failed result. The artifact insert uses the same strict check: `success: result.success === true && !!result.ticketId`. The artifact is always inserted regardless of outcome. **PASS.**

---

## Audit 3: Splunk Ticket Failure Path

When HEC returns a non-throwing failure (403, timeout, connection refused), the backend must return `{ success: false, ticketId: null }`, the UI must show an error toast, and a failure artifact must be recorded.

The backend failure return at `server/splunk/splunkRouter.ts:278-284` explicitly sets `success: false as const` and `ticketId: null` with a fallback message. The UI `else` branch fires for any non-success result and shows `toast.error`. Failure artifacts are recorded with `ticketId: "failed-{timestamp}"` (synthetic), `success: false`, and the actual error message preserved in `statusMessage`.

The batch failure path uses four distinct toast types:

| Condition | Toast Type | Message |
|-----------|-----------|---------|
| `sent > 0 && failed === 0` | `toast.success` | "N Splunk tickets created" |
| `sent > 0 && failed > 0` | `toast.warning` | "N of M tickets created, K failed" |
| `sent === 0 && failed > 0` | `toast.error` | "All N tickets failed" |
| `sent === 0 && failed === 0` | `toast.info` | "No eligible tickets to create" |

Even unhandled exceptions in the batch loop produce a failure artifact with `success: false` and the actual error message. The outer catch prevents artifact recording from breaking the batch. **PASS.**

---

## Audit 4: First-Class Ticket Lineage

Every ticket artifact must have four explicit linkage paths to the workflow, stored as first-class indexed columns rather than JSON blob fields.

### Linkage Fields

| Field | Type | Nullable | Index | Links To |
|-------|------|----------|-------|----------|
| `queueItemId` | int | NOT NULL | `ta_queueItemId_idx` | `alert_queue.id` |
| `pipelineRunId` | int | nullable | `ta_pipelineRunId_idx` | `pipeline_runs.id` |
| `triageId` | varchar(64) | nullable | `ta_triageId_idx` | `triage_objects.triageId` |
| `alertId` | varchar(128) | NOT NULL | `ta_alertId_idx` | Wazuh alert ID |

The `queueItemId` and `alertId` are NOT NULL (always present). The `pipelineRunId` and `triageId` are nullable for legacy items that predate pipeline/triage integration.

### Lineage Resolution

At insert time, the router performs a dedicated lookup to resolve `pipelineRunId` and `triageId` from the most recent pipeline run associated with the queue item. The `triageId` resolution uses a two-level fallback chain: (1) `associatedRun?.triageId` from the pipeline run, (2) `item.pipelineTriageId` from the queue item, (3) `null` for legacy items.

### Lineage Diagram

```
ticket_artifacts
  ├── queueItemId ──→ alert_queue.id (queue origin, NOT NULL)
  ├── pipelineRunId ──→ pipeline_runs.id (run context, nullable)
  ├── triageId ──→ triage_objects.triageId (primary triage, nullable)
  └── alertId ──→ Wazuh alert ID (direct cross-reference, NOT NULL)
```

Two query endpoints (`listTicketArtifacts` and `getTicketArtifact`) provide full audit trail visibility with filters for `queueItemId`, `system`, and `success`. **PASS.**

---

## Audit 5: Partial Pipeline Run Semantics

Queue-driven triage creates a pipeline run with `status: "partial"` and `completedAt: null`. The UI must label it "Triage Only" (not "Partial" or "Completed") and show "awaiting analyst advancement."

The backend insert at `server/alertQueue/alertQueueRouter.ts:263-285` explicitly sets `status: "partial"`, `completedAt: null`, `totalLatencyMs: result.latencyMs` (triage latency only), and all downstream stages to `"pending"`. The run is documented as "NOT complete — awaiting analyst advancement."

### Semantic Comparison

| Aspect | Partial Run | Completed Run |
|--------|-------------|---------------|
| `status` | `"partial"` | `"completed"` |
| `completedAt` | `null` | timestamp |
| `triageStatus` | `"completed"` | `"completed"` |
| `correlationStatus` | `"pending"` | `"completed"` |
| `hypothesisStatus` | `"pending"` | `"completed"` |
| `responseActionsStatus` | `"pending"` | `"completed"` |
| UI label | "Triage Only" | "Completed" |
| UI icon | AlertTriangle (yellow) | CheckCircle2 (green) |
| UI timestamp | "awaiting analyst advancement" | completion time |

The UI uses "Triage Only" consistently in the status badge, stat card, and filter button. When `completedAt` is null and status is "partial", the UI shows "Triage complete — awaiting analyst advancement" in yellow text instead of a completion timestamp. Partial and completed runs are semantically distinct at every layer. **PASS.**

---

## Audit 6: Queue Triage Visibility in Pipeline Inspector

Queue-driven triage creates `pipelineRuns` rows that must be visible in the Pipeline Inspector page with queue item cross-references.

The `listPipelineRuns` query at `server/agenticPipeline/pipelineRouter.ts:1025-1055` selects all pipeline runs without excluding queue-originated runs. The `"partial"` status filter is explicitly supported. The `pipelineRunStats` query counts partial runs separately for the stat card.

The Pipeline Inspector UI at `PipelineInspector.tsx:396` renders `Queue Item: #N` when a run has a `queueItemId`, providing a direct cross-reference back to the alert queue.

```
Alert Queue → process() → runTriageAgent() → insert pipelineRuns(status: "partial")
                                                        ↓
Pipeline Inspector → listPipelineRuns() → shows run with:
  - Status: "Triage Only" (yellow)
  - Queue Item: #N (cross-reference)
  - "Triage complete — awaiting analyst advancement"
```

**PASS.**

---

## Audit 7: Readiness / Wazuh Truth

The app must show honest connection status with structured error detail. Readiness banners must block or degrade agentic workflows when dependencies are unavailable.

### Wazuh Connection Status

The `wazuh.status` procedure at `server/wazuh/wazuhRouter.ts:78-90` returns three distinct shapes: (1) not configured: `{ configured: false, data: null }`, (2) connected: `{ configured: true, data: {...} }`, (3) configured but failed: `{ configured: true, data: null, error: "..." }`.

### Error Detail Extraction

The `extractWazuhErrorDetail()` function at `server/wazuh/wazuhClient.ts:49-68` maps raw errors to human-readable messages:

| Error Code | Message |
|-----------|---------|
| `ECONNREFUSED` | "Connection refused at {baseURL} — is Wazuh Manager running?" |
| `ETIMEDOUT` / `ECONNABORTED` | "Connection timed out to {baseURL} — network issue or firewall" |
| `ENOTFOUND` | "DNS resolution failed for {baseURL} — check hostname" |
| `CERT_HAS_EXPIRED` | "TLS certificate error: CERT_HAS_EXPIRED" |
| HTTP 401/403/etc. | "HTTP {status} from {url} — {body}" |

### UI Truth

The `WazuhGuard` component derives connection state from explicit backend fields and shows the structured error detail when not connected. The `ReadinessBanner` component shows dependency-level detail with expandable per-dependency status. The Alert Queue page uses `useAgenticReadiness()` to gate workflow buttons — if the structured pipeline is blocked, the triage button is disabled with an honest reason.

### Live Screenshot Evidence

The live screenshot from `webdev_check_status` confirms the Wazuh connection banner displays: "Wazuh API Not Connected — Wazuh auth error: Connection refused at https://localhost:55000 — is Wazuh Manager running?" — the structured error detail from `extractWazuhErrorDetail()` rendered truthfully by `WazuhGuard`. **PASS.**

---

## Audit 8: Regression Check

### Test Suite

```
Test Files  53 passed (53)
     Tests  1286 passed (1286)
  Duration  20.30s
```

All 1,286 tests pass across 53 test files. Zero failures.

### TypeScript Compilation

```
$ npx tsc --noEmit 2>&1 | wc -l
0
```

Zero TypeScript errors.

### Dev Server Health

```
Dev Server → status: running
Health checks → lsp: No errors | typescript: No errors | dependencies: OK
```

### Test Coverage by Audit Area

| Audit Area | Test Files | Approx. Count |
|-----------|-----------|---------------|
| Splunk ticket success/failure | `splunkRouter.test.ts` | 40+ |
| Migration reconciliation | `splunkRouter.test.ts` | 8 |
| DB access normalization | `splunkRouter.test.ts` | 2 |
| Wazuh connection truth | `wazuhRouter.test.ts`, `wazuhConnection.test.ts` | 19+ |
| Pipeline handoff | `pipelineHandoff.test.ts` | partial semantics |
| Workflow truth | `workflowTruth.test.ts` | structural tests |
| Security hardening | `securityHardening.test.ts` | 19 |
| Auth gating | `auth.logout.test.ts`, `wazuhRouter.test.ts` | auth rejection |

### UI Screenshot

The live UI screenshot confirms: SOC Console dashboard renders correctly, sidebar navigation intact, Amethyst Nexus theme preserved, user authentication working, and no visual regressions. **PASS.**

---

## Conclusion

All eight audit areas pass with code-level, database-level, and UI-level evidence. The previously identified migration mismatch (missing `triageId` column in `0012_ticket_artifacts.sql`) has been resolved — the schema, migration SQL, and live database are now in full agreement. The ticket success/failure handling is truthful at every layer. Partial pipeline runs are semantically distinct from completed runs. Ticket lineage uses first-class indexed columns with four explicit linkage paths. Readiness and Wazuh error detail are preserved and rendered honestly. No regressions were detected across 1,286 tests, zero TypeScript errors, and a clean dev server.
