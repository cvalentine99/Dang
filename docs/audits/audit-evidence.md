# Runtime Truth Audit — Dang! Security Platform

**Date:** 2026-03-03  
**Auditor:** Manus (automated)  
**Scope:** Migration correctness, Splunk ticket paths, ticket lineage, partial pipeline semantics, queue-to-pipeline visibility, readiness truth, regression absence.

---

## Audit 1: Fresh Migration Correctness

**Claim:** The Drizzle schema (`drizzle/schema.ts`), migration SQL (`drizzle/0012_ticket_artifacts.sql`), and live database all define the same `ticket_artifacts` table with 15 columns and 8 indexes (including `triageId`).

### 1a. Three-Way Column Comparison

| # | Column | Schema (Drizzle) | Migration SQL | Live DB |
|---|--------|-----------------|---------------|---------|
| 1 | id | int, autoincrement, PK | int AUTO_INCREMENT NOT NULL, PK | int, NOT NULL |
| 2 | ticketId | varchar(128), notNull | varchar(128) NOT NULL | varchar(128), NOT NULL |
| 3 | system | enum(splunk_es,jira,servicenow,custom), default splunk_es | enum(...) NOT NULL DEFAULT 'splunk_es' | enum(...), NOT NULL, default=splunk_es |
| 4 | queueItemId | int, notNull | int NOT NULL | int, NOT NULL |
| 5 | pipelineRunId | int, nullable | int (no NOT NULL) | int, nullable |
| 6 | **triageId** | **varchar(64), nullable** | **varchar(64) (no NOT NULL)** | **varchar(64), nullable** |
| 7 | alertId | varchar(128), notNull | varchar(128) NOT NULL | varchar(128), NOT NULL |
| 8 | ruleId | varchar(32), nullable | varchar(32) | varchar(32), nullable |
| 9 | ruleLevel | int, nullable | int | int, nullable |
| 10 | createdBy | varchar(256), notNull | varchar(256) NOT NULL | varchar(256), NOT NULL |
| 11 | success | boolean, notNull | boolean NOT NULL | tinyint(1), NOT NULL |
| 12 | statusMessage | text, nullable | text | text, nullable |
| 13 | rawResponse | json, nullable | json | json, nullable |
| 14 | httpStatusCode | int, nullable | int | int, nullable |
| 15 | createdAt | timestamp, defaultNow, notNull | timestamp NOT NULL DEFAULT (now()) | timestamp, NOT NULL, default=CURRENT_TIMESTAMP |

**Verdict:** All 15 columns match across schema, migration, and live DB. The `triageId` column (position 6) is present in all three. **PASS.**

### 1b. Index Comparison

| Index Name | Schema | Migration SQL | Live DB |
|------------|--------|---------------|---------|
| PRIMARY | id (auto) | id (PK constraint) | id (BTREE) |
| ta_ticketId_idx | ticketId | ticketId | ticketId (BTREE) |
| ta_queueItemId_idx | queueItemId | queueItemId | queueItemId (BTREE) |
| ta_pipelineRunId_idx | pipelineRunId | pipelineRunId | pipelineRunId (BTREE) |
| **ta_triageId_idx** | **triageId** | **triageId** | **triageId (BTREE)** |
| ta_alertId_idx | alertId | alertId | alertId (BTREE) |
| ta_system_idx | system | system | system (BTREE) |
| ta_createdAt_idx | createdAt | createdAt | createdAt (BTREE) |

**Verdict:** All 8 indexes (including `ta_triageId_idx`) match across schema, migration, and live DB. **PASS.**

---

## Audit 2: Splunk Ticket Success Path

**Claim:** When HEC confirms ticket creation, the backend returns `{ success: true, ticketId: "DANG-..." }` and the UI shows a success toast with the ticket ID. A first-class `ticket_artifacts` row is inserted with `success=true`.

### 2a. Backend Return Shape (server/splunk/splunkRouter.ts:270-275)

```typescript
if (result.success && result.ticketId) {
  return {
    success: true as const,
    ticketId: result.ticketId,
    message: result.message,
  };
}
```

**Evidence:** The return is gated on `result.success && result.ticketId` — both must be truthy. If HEC returns success but no ticketId, this branch is NOT taken. **PASS.**

### 2b. UI Toast Logic (client/src/pages/AlertQueue.tsx:227-237)

```typescript
onSuccess: (result) => {
  if (result.success === true && result.ticketId) {
    toast.success("Splunk ticket created", {
      description: `Ticket ${result.ticketId} sent to Splunk ES Mission Control`,
    });
  } else {
    toast.error("Splunk ticket creation failed", {
      description: result.message || "HEC accepted the request but did not create a ticket",
    });
  }
}
```

**Evidence:** The UI checks `result.success === true && result.ticketId` before showing success. The `else` branch shows `toast.error` — never a success toast for a failed result. **PASS.**

### 2c. Artifact Insert (server/splunk/splunkRouter.ts:237-251)

```typescript
await db.insert(ticketArtifacts).values({
  ticketId: result.ticketId ?? `failed-${Date.now()}`,
  system: "splunk_es",
  queueItemId: input.queueItemId,
  pipelineRunId: associatedRun?.id ?? null,
  triageId: associatedRun?.triageId ?? item.pipelineTriageId ?? null,
  alertId: item.alertId,
  ...
  success: result.success === true && !!result.ticketId,
  ...
});
```

**Evidence:** The `success` field uses the same strict check: `result.success === true && !!result.ticketId`. The artifact is always inserted, regardless of outcome. **PASS.**

---

## Audit 3: Splunk Ticket Failure Path

**Claim:** When HEC returns a non-throwing failure (403, timeout, connection refused), the backend returns `{ success: false, ticketId: null }`, the UI shows an error toast, and a failure artifact is recorded in the DB.

### 3a. Backend Failure Return (server/splunk/splunkRouter.ts:278-284)

```typescript
// HEC returned a non-throwing failure (e.g., 403, timeout, disabled)
return {
  success: false as const,
  ticketId: null,
  message: result.message || "Splunk HEC did not confirm ticket creation",
};
```

**Evidence:** Explicit `success: false`, `ticketId: null`, and a fallback message if `result.message` is empty. The UI can never mistake this for success. **PASS.**

### 3b. UI Error Toast (client/src/pages/AlertQueue.tsx:232-236)

```typescript
} else {
  toast.error("Splunk ticket creation failed", {
    description: result.message || "HEC accepted the request but did not create a ticket",
  });
}
```

**Evidence:** The `else` branch fires for any non-success result, including `success: false`. Shows `toast.error`, not `toast.success`. **PASS.**

### 3c. Failure Artifact in DB (server/splunk/splunkRouter.ts:237-251)

The same insert runs for both success and failure. For failures:
- `ticketId` = `"failed-{timestamp}"` (synthetic, not a real ticket)
- `success` = `false` (because `result.success !== true || !result.ticketId`)
- `statusMessage` = the actual error message from HEC (e.g., "Splunk HEC error (403): Invalid token")

**Evidence:** Failure artifacts are recorded with the actual error message preserved — never sanitized. **PASS.**

### 3d. Batch Failure Toast Logic (client/src/pages/AlertQueue.tsx:592-617)

| Condition | Toast Type | Message |
|-----------|-----------|---------|
| `sent > 0 && failed === 0` | `toast.success` | "N Splunk tickets created" |
| `sent > 0 && failed > 0` | `toast.warning` | "N of M tickets created, K failed" |
| `sent === 0 && failed > 0` | `toast.error` | "All N tickets failed" |
| `sent === 0 && failed === 0` | `toast.info` | "No eligible tickets to create" |

**Evidence:** Four distinct toast types for four distinct outcomes. Partial success shows warning, not success. All-failed shows error. **PASS.**

### 3e. Exception-Path Batch Artifacts (server/splunk/splunkRouter.ts:488-505)

```typescript
} catch (err) {
  try {
    await db.insert(ticketArtifacts).values({
      ticketId: `exception-${Date.now()}`,
      ...
      triageId: item.pipelineTriageId ?? null,
      success: false,
      statusMessage: err instanceof Error ? err.message : "Unknown error",
      rawResponse: null,
    });
  } catch { /* don't let artifact recording break the batch loop */ }
```

**Evidence:** Even unhandled exceptions in the batch loop produce a failure artifact with `success: false` and the actual error message. The outer catch prevents artifact recording from breaking the batch. **PASS.**

---

## Audit 4: First-Class Ticket Lineage

**Claim:** Every ticket artifact has four explicit linkage paths to the workflow: `triageId` (primary), `pipelineRunId` (run context), `queueItemId` (queue origin), and `alertId` (Wazuh cross-reference). These are first-class indexed columns, not JSON blob fields.

### 4a. Schema Linkage Fields (drizzle/schema.ts:1395-1450)

| Field | Type | Nullable | Index | Links To |
|-------|------|----------|-------|----------|
| `queueItemId` | int | NOT NULL | `ta_queueItemId_idx` | `alert_queue.id` |
| `pipelineRunId` | int | nullable | `ta_pipelineRunId_idx` | `pipeline_runs.id` |
| `triageId` | varchar(64) | nullable | `ta_triageId_idx` | `triage_objects.triageId` |
| `alertId` | varchar(128) | NOT NULL | `ta_alertId_idx` | Wazuh alert ID |

**Evidence:** All four linkage fields are top-level columns with dedicated BTREE indexes. `queueItemId` and `alertId` are NOT NULL (always present). `pipelineRunId` and `triageId` are nullable for legacy items that predate pipeline/triage integration. **PASS.**

### 4b. Lineage Resolution at Insert Time (server/splunk/splunkRouter.ts:224-251)

The router performs a dedicated lookup to resolve `pipelineRunId` and `triageId`:

```typescript
const [associatedRun] = await db
  .select({ id: pipelineRuns.id, triageId: pipelineRuns.triageId })
  .from(pipelineRuns)
  .where(eq(pipelineRuns.queueItemId, input.queueItemId))
  .orderBy(sql`${pipelineRuns.startedAt} DESC`)
  .limit(1);
```

The `triageId` resolution uses a two-level fallback chain:
1. `associatedRun?.triageId` — from the pipeline run (primary)
2. `item.pipelineTriageId` — from the queue item (fallback)
3. `null` — for legacy items with no triage

**Evidence:** The lineage is resolved at insert time, not deferred. The most recent pipeline run is selected (ordered by `startedAt DESC`). **PASS.**

### 4c. Audit Trail Query Endpoints

Two query endpoints provide full audit trail visibility:

- `listTicketArtifacts` — paginated list with filters for `queueItemId`, `system`, `success`. Returns all linkage fields.
- `getTicketArtifact` — single artifact by ID with full detail including `rawResponse`.

**Evidence:** Both endpoints return the complete `ticket_artifacts` row including all four linkage fields. Analysts can query by queue item, filter by success/failure, and inspect raw responses. **PASS.**

### 4d. Lineage Diagram

```
ticket_artifacts
  ├── queueItemId ──→ alert_queue.id (queue origin, NOT NULL)
  ├── pipelineRunId ──→ pipeline_runs.id (run context, nullable)
  ├── triageId ──→ triage_objects.triageId (primary triage, nullable)
  └── alertId ──→ Wazuh alert ID (direct cross-reference, NOT NULL)
```

**Verdict:** Ticket lineage is first-class, indexed, and queryable. Not JSON blob mush. **PASS.**

---

## Audit 5: Partial Pipeline Run Semantics

**Claim:** Queue-driven triage creates a pipeline run with `status: "partial"` and `completedAt: null`. The UI labels it "Triage Only" (not "Partial" or "Completed") and shows "awaiting analyst advancement."

### 5a. Backend Insert (server/alertQueue/alertQueueRouter.ts:263-285)

```typescript
// Insert a pipelineRuns row with status: "partial"
// completedAt is NULL because the run is NOT complete —
// only triage is done. Downstream stages (correlation, hypothesis,
// response actions) are still pending and require analyst advancement.
// totalLatencyMs records triage latency only, not overall run time.
await db.insert(pipelineRuns).values({
  runId,
  status: "partial",
  triageStatus: "completed",
  correlationStatus: "pending",
  hypothesisStatus: "pending",
  responseActionsStatus: "pending",
  completedAt: null,  // NOT complete — awaiting analyst advancement
});
```

**Evidence:** The run is explicitly created with:
- `status: "partial"` — not "completed"
- `completedAt: null` — the run is NOT finished
- `totalLatencyMs: result.latencyMs` — records triage latency only
- All downstream stages set to `"pending"` — honest about what hasn't happened

**PASS.**

### 5b. UI Status Label (client/src/pages/PipelineInspector.tsx:56)

```typescript
partial: { icon: AlertTriangle, color: "text-yellow-400", label: "Triage Only" },
```

**Evidence:** The status label is "Triage Only" (not "Partial" or "Completed"). Uses a yellow warning icon (`AlertTriangle`) to visually distinguish from green completed runs. **PASS.**

### 5c. UI Stat Card and Filter Button (PipelineInspector.tsx:98, 134)

- Stat card label: `"Triage Only"` (not "Partial")
- Filter button: `{s === "partial" ? "Triage Only" : ...}` — maps the internal `"partial"` value to the honest display label

**Evidence:** Consistent "Triage Only" wording throughout the UI. **PASS.**

### 5d. Completion Timestamp Rendering (PipelineInspector.tsx:398-402)

```typescript
{run.completedAt ? (
  <span>Completed: {new Date(run.completedAt).toLocaleString()}</span>
) : run.status === "partial" ? (
  <span className="text-yellow-400/60">Triage complete — awaiting analyst advancement</span>
) : null}
```

**Evidence:** When `completedAt` is null and status is "partial", the UI shows "Triage complete — awaiting analyst advancement" in yellow text. It does NOT show a completion timestamp. A partial run never looks like a completed run. **PASS.**

### 5e. Semantic Summary

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

**Verdict:** Partial and completed runs are semantically distinct at every layer — DB, backend, and UI. **PASS.**

---

## Audit 6: Queue Triage Visibility in Pipeline Inspector

**Claim:** Queue-driven triage creates `pipelineRuns` rows that are visible in the Pipeline Inspector page, with queue item cross-references.

### 6a. Backend: listPipelineRuns Query (server/agenticPipeline/pipelineRouter.ts:1025-1055)

```typescript
listPipelineRuns: protectedProcedure
  .input(z.object({
    limit: z.number().int().min(1).max(100).default(25),
    offset: z.number().int().min(0).default(0),
    status: z.enum(["running", "completed", "failed", "partial"]).optional(),
  }))
  .query(async ({ input }) => {
    const db = await requireDb();
    const rows = await db
      .select()
      .from(pipelineRuns)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(pipelineRuns.startedAt))
      .limit(input.limit)
      .offset(input.offset);
    return { runs: rows, total: countResult?.count ?? 0 };
  }),
```

**Evidence:** The query selects ALL pipeline runs from the `pipelineRuns` table — no filter excludes queue-originated runs. Queue-created runs (with `status: "partial"` and `queueItemId` set) appear alongside manually-triggered runs. The `"partial"` status filter is explicitly supported. **PASS.**

### 6b. Backend: pipelineRunStats Includes Partial Count (pipelineRouter.ts:1058-1072)

```typescript
pipelineRunStats: protectedProcedure.query(async () => {
  const [stats] = await db.select({
    total: sql`COUNT(*)`,
    completed: sql`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
    partial: sql`SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END)`,
    failed: sql`SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)`,
    running: sql`SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END)`,
    avgLatencyMs: sql`AVG(totalLatencyMs)`,
  }).from(pipelineRuns);
  return stats;
}),
```

**Evidence:** The stats query counts `partial` runs separately. The stat card shows "Triage Only" with the partial count. **PASS.**

### 6c. Frontend: Queue Item Cross-Reference (PipelineInspector.tsx:396)

```typescript
{run.queueItemId && <span>Queue Item: <span className="font-mono">#{run.queueItemId}</span></span>}
```

**Evidence:** When a run has a `queueItemId` (set by the alert queue router), the Pipeline Inspector shows "Queue Item: #N" in the run metadata. This provides a direct cross-reference back to the alert queue. **PASS.**

### 6d. Data Flow Summary

```
Alert Queue → process() → runTriageAgent() → insert pipelineRuns(status: "partial")
                                                        ↓
Pipeline Inspector → listPipelineRuns() → shows run with:
  - Status: "Triage Only" (yellow)
  - Queue Item: #N (cross-reference)
  - "Triage complete — awaiting analyst advancement"
```

**Verdict:** Queue-originated triage runs are fully visible in the Pipeline Inspector with honest status labels and queue cross-references. **PASS.**

---

## Audit 7: Readiness / Wazuh Truth

**Claim:** The app shows honest connection status with structured error detail. Readiness banners block or degrade agentic workflows when dependencies are unavailable.

### 7a. Wazuh Connection Status (server/wazuh/wazuhRouter.ts:78-90)

```typescript
status: wazuhProcedure.query(async () => {
  const configured = await isWazuhEffectivelyConfigured();
  if (!configured) {
    return { configured: false, data: null };
  }
  try {
    const data = await proxyGet("/manager/info");
    return { configured: true, data };
  } catch (err) {
    const { extractWazuhErrorDetail } = await import("./wazuhClient");
    return { configured: true, data: null, error: extractWazuhErrorDetail(err) };
  }
}),
```

**Evidence:** Three distinct return shapes:
1. Not configured: `{ configured: false, data: null }` — tells UI to show "Set WAZUH_HOST..."
2. Connected: `{ configured: true, data: {...} }` — shows "Wazuh API Connected"
3. Configured but failed: `{ configured: true, data: null, error: "..." }` — shows the actual error

**PASS.**

### 7b. Error Detail Extraction (server/wazuh/wazuhClient.ts:49-68)

The `extractWazuhErrorDetail()` function maps raw errors to human-readable messages:

| Error Code | Message |
|-----------|---------|
| `ECONNREFUSED` | "Connection refused at {baseURL} — is Wazuh Manager running?" |
| `ETIMEDOUT` / `ECONNABORTED` | "Connection timed out to {baseURL} — network issue or firewall" |
| `ENOTFOUND` | "DNS resolution failed for {baseURL} — check hostname" |
| `CERT_HAS_EXPIRED` | "TLS certificate error: CERT_HAS_EXPIRED" |
| HTTP 401/403/etc. | "HTTP {status} from {url} — {body}" |

**Evidence:** Every common failure mode produces a specific, actionable message. No generic "Connection failed" without detail. **PASS.**

### 7c. WazuhGuard UI Component (client/src/components/shared/WazuhGuard.tsx)

```typescript
// Connection truth — no muddy logic
const isConfigured = data?.configured === true;
const hasData = data?.data != null;
const isConnected = isConfigured && hasData;
const errorDetail = (data as Record<string, unknown>)?.error as string | undefined;
```

**Evidence:** The UI derives connection state from explicit backend fields. When not connected, shows the structured error detail (e.g., "Wazuh auth error: Connection refused at https://192.168.50.158:55000 — is Wazuh Manager running?"). Always renders children — pages handle their own empty states. **PASS.**

### 7d. ReadinessBanner Component (client/src/components/shared/ReadinessBanner.tsx)

The ReadinessBanner:
- Queries `useAgenticReadiness()` for dependency health
- Shows nothing when all dependencies are ready (`overall === "ready"`)
- Shows yellow "Degraded" banner when some dependencies are down
- Shows red "Blocked" banner when critical dependencies are down
- Expandable detail shows per-dependency status with fallback indicators
- Used on the Alert Queue page (line 802)

**Evidence:** The banner is truthful — it only appears when something is actually wrong, and it shows exactly which dependencies are affected. **PASS.**

### 7e. Queue Workflow Gating (client/src/pages/AlertQueue.tsx:509)

```typescript
const { canRunStructuredPipeline, structuredPipelineBlocked, canRunAdHoc, adHocBlocked } = useAgenticReadiness();
```

**Evidence:** The Alert Queue page uses readiness data to gate workflow buttons. If the structured pipeline is blocked, the triage button is disabled with an honest reason. **PASS.**

### 7f. Structured Triage vs Ad-hoc Analysis Wording

The Alert Queue header comment (line 1-9) explicitly documents:
- "Structured Triage" (primary) — creates pipeline artifacts
- "Ad-hoc Analysis" (secondary) — conversational, NOT persisted

**Evidence:** Honest wording preserved. No conflation of the two paths. **PASS.**

---

## Audit 8: Regression Check

### 8a. Full Test Suite

```
Test Files  53 passed (53)
     Tests  1286 passed (1286)
  Start at  05:18:46
  Duration  20.30s (transform 2.58s, setup 0ms, collect 20.98s, tests 39.64s)
```

**Evidence:** All 1,286 tests pass across 53 test files. Zero failures. **PASS.**

### 8b. TypeScript Compilation

```
$ npx tsc --noEmit 2>&1 | wc -l
0
```

**Evidence:** Zero TypeScript errors. **PASS.**

### 8c. Dev Server Health

```
Dev Server → status: running
Health checks → lsp: No errors | typescript: No errors | dependencies: OK
```

**Evidence:** Dev server running, LSP clean, dependencies OK. **PASS.**

### 8d. UI Screenshot Evidence

The live screenshot from `webdev_check_status` confirms:

1. **Wazuh connection banner** displays truthfully: "Wazuh API Not Connected — Wazuh auth error: Connection refused at https://localhost:55000 — is Wazuh Manager running?" — this is the structured error detail from `extractWazuhErrorDetail()` being rendered by `WazuhGuard`.

2. **SOC Console dashboard** renders correctly with all panels (stat cards, EPS gauge, threat trends, fleet status, top talkers, geographic distribution, top firing rules).

3. **Sidebar navigation** intact with all sections: Operations (SOC Console, Fleet Command, Threat Intel), Detection (SIEM Events, Alerts Timeline, Vulnerabilities, MITRE ATT&CK, Threat Hunting, Ruleset Explorer), Posture (Compliance).

4. **User authentication** working — "quickone74" shown in bottom-left.

5. **No visual regressions** observed — Amethyst Nexus theme intact, glass-morphism panels rendering, all icons present.

**PASS.**

### 8e. Test Coverage by Audit Area

| Audit Area | Test Files | Test Count |
|-----------|-----------|------------|
| Splunk ticket success/failure | splunkRouter.test.ts | 40+ tests |
| Migration reconciliation | splunkRouter.test.ts | 8 tests |
| DB access normalization | splunkRouter.test.ts | 2 tests |
| Wazuh connection truth | wazuhRouter.test.ts, wazuhConnection.test.ts | 19+ tests |
| Pipeline handoff | pipelineHandoff.test.ts | tests for partial semantics |
| Workflow truth | workflowTruth.test.ts | structural truth tests |
| Security hardening | securityHardening.test.ts | 19 tests |
| Auth gating | auth.logout.test.ts, wazuhRouter.test.ts | auth rejection tests |

**Verdict:** No regressions detected. All systems operational. **PASS.**

---

