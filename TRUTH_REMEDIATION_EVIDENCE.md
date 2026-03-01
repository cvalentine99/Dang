# Agentic Truth Remediation — Evidence Package

**Date:** 2026-03-01 (initial), 2026-03-01 (follow-up pass)  
**Scope:** 7 initial truth-alignment tasks + 6 follow-up hardening tasks  
**Result:** All resolved. **0 TypeScript errors. 1150 tests pass (47 files).**

Every claim below has been verified against the actual source code with `grep -n` line-number confirmation. No claim is aspirational.

---

## 1. What Was Broken (Initial Audit)

### Task 1 — Pipeline Handoff Tests Were Stale

`server/pipelineHandoff.test.ts` validated field names that no longer exist in `shared/agenticSchemas.ts`. Tests passed because they tested their own mock factories, not the real contracts.

| Stale Field | Live Field | Notes |
|---|---|---|
| `receivedAt` | `triagedAt` | Renamed |
| `normalizedSeverity` | `severity` (AgenticSeverity enum) | Type changed |
| `deduplicationKey` | `dedup` (object with `isDuplicate`, `clusterId`, `firstSeenId`) | Restructured |
| `isDuplicate` (top-level) | `dedup.isDuplicate` | Moved inside dedup |
| `triageDecision.route` | `route` (TriageRoute enum) | Flattened |
| `triageDecision.confidence` | `routeReasoning` (string) | Different semantics |
| `suggestedPriority` | (removed) | Does not exist |
| `contextHints` | (removed) | Does not exist |
| `rawAlertRef` | `rawAlert` | Renamed |
| `evidencePack.*` | Direct fields on CorrelationBundle | Flattened |
| `synthesis.riskScore` | `synthesis.confidence` (Confidence) | Type changed |
| `synthesis.supportingEvidence` (string[]) | `synthesis.supportingEvidence` (EvidenceItem[]) | Type changed |

### Task 2 — SOC_COMPLIANCE_EVIDENCE.md Referenced Stale Fields

Compliance document named fields that no longer exist in the live schema.

### Task 3 — recordProvenance() Was Dead Code

`recordProvenance()` existed in `graphQueryService.ts` (line 635) but was **never called from anywhere**. The `kgAnswerProvenance` table would always be empty.

### Task 4 — kgTrustHistory Was a Ghost Feature

Table exists in schema, imported, counted in `getGraphStats()`, but **never written to**. Count always 0.

### Task 5 — AnalystChat Simulated Steps Were Labeled "LIVE"

Frontend generates estimated progress steps while waiting for the backend. These were labeled "LIVE" — implying real-time server telemetry. They are client-side approximations.

### Task 6 — enhancedLLM Router Was Dormant

Complete module with 5 endpoints existed but was **never mounted** in `server/routers.ts`. Endpoints were unreachable.

### Task 7 — Response Action Timing Metrics Were Null

`responseActionsRouter.stats` returned `avgTimeToApproval: null` and `avgTimeToExecution: null` with a `// TODO` comment. The DB columns existed to compute real values.

---

## 2. What Was Fixed

### Task 1 Fix — Complete Test Rewrite + Real Imports

**File:** `server/pipelineHandoff.test.ts`

- Complete rewrite: 26 schema validation tests + 9 extractProvenanceIds tests + 40+ state machine tests
- **Real imports** (not just handcrafted fixtures):
  - `extractProvenanceIds` and `RetrievalSource` from `./graph/agenticPipeline` (line 32-33)
  - `isValidTransition`, `isTerminalState`, `getAllowedTransitions`, `checkInvariants`, `VALID_TRANSITIONS`, `TERMINAL_STATES` from `./agenticPipeline/stateMachine` (line 36-43)
- Tests call real functions with realistic inputs and assert real outputs
- Factory functions produce objects conforming to live `shared/agenticSchemas.ts` types

### Task 2 Fix — 9 Field Name Corrections

**File:** `SOC_COMPLIANCE_EVIDENCE.md`

9 targeted edits replacing stale field references with current live names. Every field named in the document now exists in `shared/agenticSchemas.ts` or the Drizzle schema.

### Task 3 Fix — Provenance Wired with Real IDs

**File:** `server/graph/agenticPipeline.ts`

- `extractProvenanceIds()` function (line 172) scans all graph-type `RetrievalSource` entries and extracts:
  - **endpointIds**: From `"endpoint-42"` GraphNode strings, direct endpoint rows (`{ id: number, method, path }`), risk analysis `dangerousEndpoints`, and parameter `endpointId` linkage
  - **parameterIds**: From `"param-17"` GraphNode strings and parameter rows with `endpointId`
- Called at line 1128: `const provenanceIds = extractProvenanceIds(allSources);`
- `recordProvenance()` called at line 1135 with real IDs
- `docChunkIds` is `[]` with explicit comment: "No doc chunk layer in current KG architecture — genuinely empty" (the KG has 4 layers: API Ontology, Operational Semantics, Schema Lineage, Error/Failure — none involve document chunks)
- Fire-and-forget with `.catch()` — never blocks the pipeline

### Task 4 Fix — kgTrustHistory Unmistakably Dormant

**Files:** `drizzle/schema.ts` (line 582-596), `server/graph/graphQueryService.ts` (lines 72-77, 143-145)

Three locations with unmistakable DORMANT comments:
1. Schema definition: 10-line block comment starting "STATUS: DORMANT — DEFINED BUT NOT RUNTIME-POPULATED"
2. KgStats interface: JSDoc "DORMANT — kgTrustHistory table exists in schema but has NO runtime writer"
3. getGraphStats return: inline "DORMANT: kgTrustHistory has no runtime writer — this will always be 0"

Also documented in `SOC_COMPLIANCE_EVIDENCE.md` line 419.

### Task 5 Fix — Honest Labels

**File:** `client/src/pages/AnalystChat.tsx`

- Line 149: `ESTIMATING` (was `LIVE`)
- Line 717: `ESTIMATED PROGRESS` (was `LIVE`)
- Line 720: Comment: "Agent Status Grid — estimated, not live telemetry"
- Code comments added: "These are NOT live telemetry from the server — they are client-side approximations"

### Task 6 Fix — Router Mounted

**File:** `server/routers.ts`

- Line 29: `import { enhancedLLMRouter } from "./enhancedLLM/enhancedLLMRouter";`
- Line 119: `enhancedLLM: enhancedLLMRouter,`
- 5 endpoints now accessible: chat, classifyAlert, dgxHealth, queueStats, sessionTypes

### Task 7 Fix — Real SQL Computations

**File:** `server/agenticPipeline/responseActionsRouter.ts`

- Line 378: `AVG(TIMESTAMPDIFF(SECOND, proposedAt, approvedAt))` — real seconds from proposal to approval
- Line 384: `AVG(TIMESTAMPDIFF(SECOND, approvedAt, executedAt))` — real seconds from approval to execution
- Lines 409-410: Returns `Math.round()` of the average, or `null` honestly when no data exists

---

## 3. What Is Still Intentionally Not Implemented

| Feature | Status | Reason |
|---|---|---|
| kgTrustHistory writer | **SCAFFOLDED-INACTIVE** | Table reserved for future trust-score-over-time tracking. No writer exists. Documented at 3 code locations + compliance doc. |
| docChunkIds in provenance | **GENUINELY EMPTY** | KG architecture has no document chunk layer. Field exists for future RAG integration. Always `[]`. |
| Real-time pipeline telemetry to AnalystChat | **NOT IMPLEMENTED** | Frontend shows estimated progress. Real steps arrive in the response and replace estimates. Labeled honestly. |

---

## 4. Modified Files

| File | Change | Verified At |
|---|---|---|
| `server/pipelineHandoff.test.ts` | Complete rewrite — real imports + 75+ tests | Lines 30-43 (imports) |
| `SOC_COMPLIANCE_EVIDENCE.md` | 9 field corrections + kgTrustHistory truth note | Line 419 |
| `server/graph/agenticPipeline.ts` | `extractProvenanceIds()` + `recordProvenance()` with real IDs | Lines 172, 1128, 1135 |
| `server/graph/graphQueryService.ts` | DORMANT comments on kgTrustHistory | Lines 72-77, 143-145 |
| `drizzle/schema.ts` | DORMANT block comment on kgTrustHistory | Lines 582-596 |
| `client/src/pages/AnalystChat.tsx` | "LIVE" → "ESTIMATED PROGRESS" / "ESTIMATING" | Lines 149, 717 |
| `server/routers.ts` | Mount enhancedLLMRouter | Lines 29, 119 |
| `server/agenticPipeline/responseActionsRouter.ts` | TIMESTAMPDIFF timing metrics | Lines 378, 384, 409-410 |
| `server/graph/provenance.test.ts` | 14 provenance extraction tests | New file |

---

## 5. No-Handwaving Declaration

| Feature | Status | Evidence (file:line) |
|---|---|---|
| Provenance recording with real IDs | **LIVE** | `agenticPipeline.ts:1128` (extract) + `:1135` (record) |
| extractProvenanceIds() | **LIVE** | `agenticPipeline.ts:172` — tested in `provenance.test.ts` (14 tests) + `pipelineHandoff.test.ts` (9 tests) |
| Response action timing metrics | **LIVE** | `responseActionsRouter.ts:378,384` — SQL TIMESTAMPDIFF |
| Enhanced LLM router | **LIVE** | `routers.ts:119` — mounted as `enhancedLLM` |
| Pipeline handoff contracts | **LIVE** | `pipelineHandoff.test.ts` — imports real functions from `stateMachine.ts` and `agenticPipeline.ts` |
| State machine invariant checks | **LIVE** | `pipelineHandoff.test.ts` — calls real `checkInvariants()`, `isValidTransition()`, etc. |
| AnalystChat progress steps | **SIMULATED** (labeled) | `AnalystChat.tsx:149,717` — "ESTIMATING" / "ESTIMATED PROGRESS" |
| kgTrustHistory | **SCAFFOLDED-INACTIVE** (documented) | `schema.ts:582-596`, `graphQueryService.ts:72-77,143-145`, `SOC_COMPLIANCE_EVIDENCE.md:419` |
| docChunkIds | **GENUINELY EMPTY** | `agenticPipeline.ts:1145` — `[]` with comment explaining KG has no doc chunk layer |

---

## 6. Test Proof

```
$ cd /home/ubuntu/dang && pnpm test

 Test Files  47 passed (47)
      Tests  1150 passed (1150)
   Start at  17:09:16
   Duration  18.35s

$ npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
0
```

---

## 7. Contract Proof — Schema Alignment

Every test in `pipelineHandoff.test.ts` imports types from `shared/agenticSchemas.ts` and validates factory outputs against them:

- **TriageObject**: 13 required fields validated (alertId, severity, route, routeReasoning, triagedAt, dedup, rawAlert, source, ruleId, agentId, agentName, timestamp, ttps)
- **CorrelationBundle**: 10 required fields validated (bundleId, hypothesis, confidence, entities, mitreMappings, timeline, uncertainties, provenance, synthesis, relatedAlertIds)
- **LivingCaseObject**: 8 required fields validated (caseId, title, status, severity, createdAt, lastUpdatedAt, assignee, responseActions)
- **Stage-to-stage contracts**: 6 tests verify data flows correctly between Alert→TriageObject→CorrelationBundle→LivingCaseObject→response_actions
- **Real function tests**: `extractProvenanceIds()` tested with 9 realistic scenarios, `checkInvariants()` tested with 7 invariant scenarios, `isValidTransition()` tested with 10 transition scenarios
