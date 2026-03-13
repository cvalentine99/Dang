# Agentic Truth Remediation — Evidence Package

**Date:** 2026-03-01 (initial), 2026-03-01 (Pass 2), 2026-03-01 (Pass 3)  
**Scope:** 7 initial truth-alignment tasks + 6 follow-up hardening tasks + 4 proof-rigor tasks  

This document describes what was changed, what each test actually proves, and what remains unproven. It does not use the word "all" to describe resolution status. Each claim below includes a file:line reference. Where a test does not prove what its description might imply, that gap is noted.

---

## 1. What Was Broken (Initial Audit)

Seven problems were identified in the codebase where the implementation, tests, or documentation did not match reality.

| # | Problem | Summary |
|---|---------|---------|
| 1 | Pipeline handoff tests were stale | Tests validated field names that no longer exist in `shared/agenticSchemas.ts` |
| 2 | SOC_COMPLIANCE_EVIDENCE.md referenced stale fields | Document named fields not in the live schema |
| 3 | `recordProvenance()` was dead code | Function existed but was never called |
| 4 | `kgTrustHistory` was a ghost feature | Table defined, imported, counted — but never written to |
| 5 | AnalystChat simulated steps labeled "LIVE" | Client-side estimates were labeled as live telemetry |
| 6 | `enhancedLLM` router was dormant | Complete module existed but was never mounted |
| 7 | Response action timing metrics were null | SQL returned null with a TODO comment |

---

## 2. What Was Fixed

### Task 1 — Pipeline Handoff Tests Rewritten

**File:** `server/pipelineHandoff.test.ts`

The test file was completely rewritten. It now imports real functions from the codebase:

- `extractProvenanceIds`, `RetrievalSource` from `./graph/agenticPipeline` (line 32-33)
- `isValidTransition`, `isTerminalState`, `getAllowedTransitions`, `checkInvariants`, `VALID_TRANSITIONS`, `TERMINAL_STATES` from `./agenticPipeline/stateMachine` (line 36-43)

**What this proves:** The state machine functions and provenance extraction function produce correct outputs for given inputs. Factory functions produce objects that conform to the live TypeScript interfaces.

**What this does not prove:** It does not call `runTriageAgent`, `runCorrelationAgent`, or `runHypothesisAgent`. The factory objects are handcrafted to match the interface, not emitted by the live stage logic. This limitation is addressed separately in `stageOutput.test.ts` (see Section 3 below).

### Task 2 — SOC_COMPLIANCE_EVIDENCE.md Field Corrections

**File:** `SOC_COMPLIANCE_EVIDENCE.md`

9 targeted edits replacing stale field references with current live names. Every field named in the document now corresponds to a field in `shared/agenticSchemas.ts` or the Drizzle schema.

### Task 3 — Provenance Wired with Real IDs

**File:** `server/graph/agenticPipeline.ts`

- `extractProvenanceIds()` at line 172 scans graph-type `RetrievalSource` entries and extracts numeric endpoint/parameter IDs
- Called at line 1128: `const provenanceIds = extractProvenanceIds(allSources);`
- `recordProvenance()` called at line 1135 with the extracted IDs
- `docChunkIds` is `[]` — the KG has no document chunk layer. This is truthfully empty, not a placeholder.

### Task 4 — kgTrustHistory Marked as Dormant

Three locations with DORMANT comments:

1. `drizzle/schema.ts` lines 582-596: 10-line block comment
2. `server/graph/graphQueryService.ts` lines 72-77: JSDoc on KgStats interface
3. `server/graph/graphQueryService.ts` lines 143-145: inline comment in getGraphStats return

### Task 5 — AnalystChat Labels Corrected

**File:** `client/src/pages/AnalystChat.tsx`

- Line 149: `ESTIMATING` (was `LIVE`)
- Line 717: `ESTIMATED PROGRESS` (was `LIVE`)
- Code comments added explaining these are client-side approximations

### Task 6 — Enhanced LLM Router Mounted

**File:** `server/routers.ts`

- Line 29: import statement
- Line 119: mounted as `enhancedLLM`

### Task 7 — Real SQL Timing Metrics

**File:** `server/agenticPipeline/responseActionsRouter.ts`

- Line 378: `AVG(TIMESTAMPDIFF(SECOND, proposedAt, approvedAt))`
- Line 384: `AVG(TIMESTAMPDIFF(SECOND, approvedAt, executedAt))`
- Returns `Math.round()` of the average, or `null` when no data exists (which is honest)

---

## 3. Pass 3 — Proof Rigor Improvements

The reviewer correctly identified that the previous evidence package overclaimed in two areas: provenance persistence and stage-output validation. This section describes what was added and what each new test actually proves.

### 3A. Real Provenance Persistence Test

**File:** `server/graph/provenance.test.ts`

**Previous state:** The "DB integration" section only checked that `recordProvenance` was a callable function and that a payload could be constructed. It explicitly stated "It does NOT call the DB." The "end-to-end" section only ran `extractProvenanceIds()` and built a payload — it did not persist anything.

**What was added:** Two new tests that require `DATABASE_URL` (skipped if not available):

1. **"writes a provenance row to the database and reads it back"** (line ~199)
   - Calls `recordProvenance()` with a realistic payload containing `endpointIds: [12, 13, 55]`, `parameterIds: [7]`
   - Reads the row back with `db.select().from(kgAnswerProvenance).where(eq(sessionId, testSessionId))`
   - Asserts: row exists, `sessionId` matches, `question` matches, `answer` contains expected text, `confidence` matches, `endpointIds` equals `[12, 13, 55]`, `parameterIds` equals `[7]`, `docChunkIds` equals `[]`, `warnings` array matches, `id > 0`, `createdAt` is a Date
   - Cleans up the test row in `afterAll`

2. **"extraction → persistence roundtrip"** (line ~234)
   - Runs `extractProvenanceIds()` on realistic retrieval sources
   - Passes the extracted IDs to `recordProvenance()`
   - Reads the row back from the database
   - Asserts: persisted `endpointIds` and `parameterIds` match what `extractProvenanceIds()` produced
   - Cleans up the test row

**What this proves:** `recordProvenance()` actually writes to the `kg_answer_provenance` table and the data survives a read-back. The extraction-to-persistence pipeline produces non-empty ID arrays that persist correctly as JSON columns.

**What this does not prove:** It does not prove that the full agentic pipeline (LLM call → retrieval → extraction → persistence) works end-to-end in production. The test calls `recordProvenance()` directly, not through the pipeline. The pipeline integration (line 1128-1135 of `agenticPipeline.ts`) is verified by code inspection, not by a test that runs the full pipeline.

### 3B. Real Stage-Output Validation Tests

**File:** `server/agenticPipeline/stageOutput.test.ts`

**Previous state:** No test imported or called `runTriageAgent`, `runCorrelationAgent`, or `runHypothesisAgent`. All handoff validation used handcrafted factory objects.

**What was added:** Tests that import and call the real agent functions:

1. **`runTriageAgent` test** — Imports the real function from `./triageAgent`. Mocks only `invokeLLMWithFallback` (returns a realistic structured JSON response matching the triage JSON schema). Uses the real database. Feeds a realistic Wazuh alert. Validates the output field-by-field against the `TriageObject` interface:
   - Schema version, identity fields, agent info extracted from raw alert
   - Severity, route, confidence validated by the real `validateSeverity()`, `validateRoute()`, `clampConfidence()` functions
   - Entities merged from Wazuh-native extraction + LLM inference by real code
   - MITRE mappings merged from `rule.mitre` + LLM by real code
   - Raw alert preserved verbatim

2. **`runTriageAgent` validation test** — Sends invalid severity/route/confidence values through the LLM mock. Verifies the real validation code normalizes them (invalid severity → "info", invalid route → "B_LOW_CONFIDENCE", confidence > 1 → clamped to 1).

3. **`runCorrelationAgent` test** — Creates a real triage row in the DB first (via `runTriageAgent`), then calls the real `runCorrelationAgent` with that triage ID. Mocks LLM + external services (indexer, Wazuh API, OTX). Validates the output against `CorrelationBundle`: blast radius, campaign assessment, case recommendation, synthesis.

4. **`runHypothesisAgent` test** — Chains triage → correlation → hypothesis, all using real DB. Validates the output against `LivingCaseObject`: working theory, alternate theories, evidence gaps, suggested next steps, recommended actions, timeline summary, linked artifacts.

**What this proves:** The real agent functions (parsing, validation, normalization, entity extraction, DB persistence) produce schema-conforming output when given realistic LLM responses. The validation logic correctly handles both valid and invalid LLM outputs. The DB persistence layer works for all three stages.

**What this does not prove:** The LLM is mocked, so these tests do not prove that a real LLM produces valid JSON for these schemas. The external services (Wazuh API, indexer, OTX) are mocked, so correlation evidence assembly is not tested against real data. These are boundary tests of the agent logic, not integration tests of the full stack.

**Why the LLM is mocked:** The LLM is a non-deterministic external service that cannot be called reliably in CI. Mocking it with realistic responses isolates the agent's own logic — which is the code we control and can verify.

---

## 4. What Is Still Intentionally Not Implemented

| Feature | Status | Reason |
|---|---|---|
| kgTrustHistory writer | SCAFFOLDED-INACTIVE | Table reserved for future use. No writer exists. Documented at 3 code locations. |
| docChunkIds in provenance | GENUINELY EMPTY | KG has no document chunk layer. Field exists for future RAG integration. Always `[]`. |
| Real-time pipeline telemetry to AnalystChat | NOT IMPLEMENTED | Frontend shows estimated progress. Labeled honestly as "ESTIMATING". |

---

## 5. Feature Status Table

This table uses three status labels:

- **LIVE** — Code is reachable, tested, and produces real output
- **SIMULATED** — Code produces approximate output, labeled as such
- **SCAFFOLDED-INACTIVE** — Code exists but has no runtime writer or caller

| Feature | Status | Evidence (file:line) | Test file |
|---|---|---|---|
| Provenance recording with real IDs | LIVE | `agenticPipeline.ts:1128,1135` | `provenance.test.ts` (DB roundtrip) |
| extractProvenanceIds() | LIVE | `agenticPipeline.ts:172` | `provenance.test.ts` (11 pure tests) |
| runTriageAgent() | LIVE | `triageAgent.ts:264` | `stageOutput.test.ts` (2 tests, real function + mocked LLM) |
| runCorrelationAgent() | LIVE | `correlationAgent.ts:700` | `stageOutput.test.ts` (1 test, real function + mocked LLM/services) |
| runHypothesisAgent() | LIVE | `hypothesisAgent.ts:788` | `stageOutput.test.ts` (1 test, real function + mocked LLM) |
| Response action timing metrics | LIVE | `responseActionsRouter.ts:378,384` | (SQL verified by inspection) |
| Enhanced LLM router | LIVE | `routers.ts:119` | (mount verified by inspection) |
| Pipeline handoff contracts | LIVE | `pipelineHandoff.test.ts` | 75+ tests with real imports |
| State machine invariant checks | LIVE | `pipelineHandoff.test.ts` | Real `checkInvariants()`, `isValidTransition()` |
| AnalystChat progress steps | SIMULATED (labeled) | `AnalystChat.tsx:149,717` | (UI label verified by inspection) |
| kgTrustHistory | SCAFFOLDED-INACTIVE | `schema.ts:582-596` | (no test — nothing to test) |
| docChunkIds | GENUINELY EMPTY | `agenticPipeline.ts:1145` | `provenance.test.ts` (verified `[]`) |

---

## 6. Test Transcript

The following transcript was captured in the sandbox environment. It is pasted text, not independently verifiable from the artifact alone without running the tests. It is included for reference, not as proof.

```
$ cd /home/ubuntu/dang && npx vitest run server/graph/provenance.test.ts

 ✓ server/graph/provenance.test.ts (13)
   ✓ extractProvenanceIds (11)
   ✓ recordProvenance (real DB persistence) (2)
     ✓ writes a provenance row to the database and reads it back
     ✓ extraction → persistence roundtrip: extractProvenanceIds output persists correctly

 Test Files  1 passed (1)
      Tests  13 passed (13)
   Duration  1.41s

$ cd /home/ubuntu/dang && npx vitest run server/agenticPipeline/stageOutput.test.ts

 ✓ server/agenticPipeline/stageOutput.test.ts (4)
   ✓ runTriageAgent (real function, mocked LLM) (2)
     ✓ produces a valid TriageObject from a realistic Wazuh alert
     ✓ validates severity and route even when LLM returns invalid values
   ✓ runCorrelationAgent (real function, mocked LLM) (1)
     ✓ produces a valid CorrelationBundle from a real triage object
   ✓ runHypothesisAgent (real function, mocked LLM) (1)
     ✓ produces a valid LivingCaseObject from a real correlation bundle

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  1.63s
```

Full test suite: **48 files, 1153 tests, all passing** (19.15s). The full transcript is included in the zip (see Section 7).

---

## 7. Independently Verifiable Artifacts

To address the concern that test transcripts are "just pasted claims," the following files are included in the source zip. They are generated by running the tests and redirecting output to files. They are still not independently verifiable without a database connection, but they provide more context than inline paste.

| File | Contents |
|---|---|
| `test-output/provenance-tests.txt` | Raw output from `npx vitest run server/graph/provenance.test.ts` |
| `test-output/stage-output-tests.txt` | Raw output from `npx vitest run server/agenticPipeline/stageOutput.test.ts` |
| `test-output/full-suite.txt` | Raw output from `pnpm test` (all 47+ files) |
| `test-output/tsc-check.txt` | Raw output from `npx tsc --noEmit` |

---

## 8. Honest Assessment of Proof Level

| Claim | Proof Level | Notes |
|---|---|---|
| Provenance persistence works | **DB roundtrip test** | `recordProvenance()` called, row read back, fields verified. Does not test full pipeline path. |
| Stage outputs conform to schema | **Real function + mocked LLM** | Agent functions called with real DB, LLM mocked. Proves agent logic, not LLM output quality. |
| extractProvenanceIds works | **Pure function tests** | 11 tests with realistic inputs. Fully deterministic. |
| State machine works | **Real function tests** | Imported and called real functions. Fully deterministic. |
| kgTrustHistory is dormant | **Code inspection** | DORMANT comments at 3 locations. No test needed — there is nothing to test. |
| AnalystChat labels are honest | **Code inspection** | "ESTIMATING" at line 149, "ESTIMATED PROGRESS" at line 717. |
| Test suite passes | **Transcript (not independently verifiable)** | Requires running `pnpm test` with DATABASE_URL set. |
| TypeScript compiles | **Transcript (not independently verifiable)** | Requires running `npx tsc --noEmit`. |
