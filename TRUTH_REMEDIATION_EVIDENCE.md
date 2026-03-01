# Agentic Truth Remediation — Evidence Package

**Date:** 2026-03-01  
**Scope:** 7 truth-alignment tasks identified by human audit  
**Result:** All 7 resolved. 0 TypeScript errors. 1099 tests pass (46 files).

---

## Summary of Findings and Fixes

### Task 1 — Pipeline Handoff Tests (STALE → FIXED)

**Problem:** `server/pipelineHandoff.test.ts` validated field names that no longer exist in the live schema (`shared/agenticSchemas.ts`). Tests passed because they tested their own mock factories, not the real contracts.

**Stale → Live field mapping:**

| Stale Field | Live Field | Notes |
|---|---|---|
| `receivedAt` | `triagedAt` | Renamed |
| `normalizedSeverity` | `severity` (AgenticSeverity enum) | Type changed |
| `deduplicationKey` | `dedup` (object) | Restructured |
| `isDuplicate` (top-level) | `dedup.isDuplicate` | Moved inside dedup |
| `triageDecision.route` | `route` (TriageRoute enum) | Flattened |
| `triageDecision.confidence` | `routeReasoning` (string) | Different semantics |
| `suggestedPriority` | (removed) | Does not exist |
| `contextHints` | (removed) | Does not exist |
| `rawAlertRef` | `rawAlert` | Renamed |
| `evidencePack.*` | Direct fields on CorrelationBundle | Flattened |
| `synthesis.riskScore` | `synthesis.confidence` (Confidence) | Type changed |
| `synthesis.supportingEvidence` (string[]) | `synthesis.supportingEvidence` (EvidenceItem[]) | Type changed |

**Fix:** Complete rewrite of `pipelineHandoff.test.ts` — 26 tests validating TriageObject (13 required fields), CorrelationBundle (10 required fields), LivingCaseObject (8 required fields), 6 stage-to-stage contract tests, and enum value validation against the actual TypeScript types.

### Task 2 — SOC_COMPLIANCE_EVIDENCE.md (STALE → FIXED)

**Problem:** Compliance document referenced field names that no longer exist in the live schema.

**Fix:** 9 targeted edits replacing all stale field references with current live names. Every field named in the document now exists in `shared/agenticSchemas.ts` or the Drizzle schema.

### Task 3 — Provenance Recording (DEAD CODE → WIRED)

**Problem:** `recordProvenance()` existed in `graphQueryService.ts` (line 635) but was never called from anywhere in the codebase. The `kgAnswerProvenance` table would always be empty.

**Fix:** Imported `recordProvenance` into `agenticPipeline.ts` and wired it after every analyst pipeline synthesis. Fire-and-forget with `.catch()` so it never blocks the response. Records:
- `sessionId`: query hash
- `question`: the analyst's query
- `answer`: truncated to 4000 chars
- `confidence`: trust score as string
- `warnings`: safety filter triggers + retrieval error counts

### Task 4 — kgTrustHistory (GHOST → DOCUMENTED)

**Problem:** `kgTrustHistory` table exists in schema, is imported, and counted in `getGraphStats()`, but is never written to at runtime. The count will always be 0.

**Decision:** Mark as planned/not-yet-populated (Option B from the audit).

**Fix:**
- Added code comment in `graphQueryService.ts`: "NOTE: table exists but is not yet populated — planned for trust-score-over-time tracking"
- Added truth note in `SOC_COMPLIANCE_EVIDENCE.md` with explicit disclosure

### Task 5 — AnalystChat Simulated Steps (MISLEADING → HONEST)

**Problem:** Frontend generates simulated progress steps while waiting for the backend pipeline. These were labeled "LIVE" and "Agent Activity" — implying they were real-time telemetry from the server. They are not.

**Fix:**
- Changed "LIVE" label to "ESTIMATED PROGRESS" on the progress indicator
- Changed "LIVE" label to "ESTIMATING" on the agent activity console
- Added code comments: "These are NOT live telemetry from the server — they are client-side approximations of the pipeline stages to give the analyst visual feedback. Real agent steps arrive in the response and replace these on completion."

### Task 6 — enhancedLLM Router (DORMANT → MOUNTED)

**Problem:** `enhancedLLMRouter` existed as a complete module (`server/enhancedLLM/enhancedLLMRouter.ts` + `enhancedLLMService.ts`) with 5 endpoints (chat, classifyAlert, dgxHealth, queueStats, sessionTypes) but was never mounted in `server/routers.ts`. The endpoints were unreachable.

**Fix:** Mounted as `enhancedLLM: enhancedLLMRouter` in the appRouter. All 5 endpoints are now accessible via tRPC.

### Task 7 — Response Action Timing Metrics (NULL → COMPUTED)

**Problem:** `responseActionsRouter.stats` returned `avgTimeToApproval: null` and `avgTimeToExecution: null` with a `// TODO` comment. The `responseActions` table has `proposedAt`, `approvedAt`, and `executedAt` timestamp columns that could be used.

**Fix:** Added two SQL queries using `TIMESTAMPDIFF(SECOND, ...)`:
- `avgTimeToApproval`: Average seconds from `proposedAt` to `approvedAt` (where `approvedAt IS NOT NULL`)
- `avgTimeToExecution`: Average seconds from `approvedAt` to `executedAt` (where both are `NOT NULL`)
- Returns `null` honestly when no approved/executed actions exist yet

---

## Modified Files

| File | Change |
|---|---|
| `server/pipelineHandoff.test.ts` | Complete rewrite — 26 tests against live schema |
| `SOC_COMPLIANCE_EVIDENCE.md` | 9 field name corrections + kgTrustHistory truth note |
| `server/graph/agenticPipeline.ts` | Import + call `recordProvenance()` after synthesis |
| `server/graph/graphQueryService.ts` | Code comment on kgTrustHistory planned status |
| `client/src/pages/AnalystChat.tsx` | "LIVE" → "ESTIMATED PROGRESS" / "ESTIMATING" + code comments |
| `server/routers.ts` | Mount `enhancedLLMRouter` |
| `server/agenticPipeline/responseActionsRouter.ts` | Compute timing metrics from real DB timestamps |

---

## No-Handwaving Declaration

| Feature | Status | Evidence |
|---|---|---|
| Answer provenance recording | **LIVE** | `recordProvenance()` called in `agenticPipeline.ts` line 1052 |
| Response action timing metrics | **LIVE** | SQL `TIMESTAMPDIFF` queries in `responseActionsRouter.ts` |
| Enhanced LLM router | **LIVE** | Mounted in `routers.ts` as `enhancedLLM` |
| Pipeline handoff contracts | **LIVE** | 26 tests validate against `shared/agenticSchemas.ts` types |
| AnalystChat progress steps | **SIMULATED** (labeled) | Frontend approximation, labeled "ESTIMATED PROGRESS" |
| kgTrustHistory | **SCAFFOLDED-INACTIVE** (documented) | Table exists, never written to, documented in code + compliance doc |

---

## Test Proof

```
Test Files  46 passed (46)
     Tests  1099 passed (1099)
  Duration  19.38s

TypeScript: 0 errors (fresh tsc --noEmit)
```
