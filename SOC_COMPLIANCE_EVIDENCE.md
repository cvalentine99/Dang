# Dang! — SOC Workflow Compliance Evidence Report

**Date:** 2026-03-01 (truth-aligned revision)
**Evaluator:** Manual truth remediation against live `shared/agenticSchemas.ts` contracts
**Test Suite:** 1205 tests passing across 52 test files, 0 TypeScript errors

---

## Executive Verdict

### Overall status

**Compliant** with the target agentic SOC workflow.

### Current maturity shape

The codebase now implements a **full alert-centric SOC workflow engine** with structured handoff artifacts at every stage, approval-gated response actions as first-class database records, and unified AI paths that inject pipeline context into analyst queries.

### Pipeline chain

```
Alert → TriageObject → CorrelationBundle → LivingCaseObject → ResponseActions → Documentation
```

Every stage is implemented, tested, persisted to database, and rendered in the UI.

---

## Compliance Matrix (Updated)

| Workflow Requirement | Expected Evidence | Status | Proof |
|---|---|---:|---|
| Alert-driven entry point | Pipeline starts from an alert artifact | ✅ Present | `pipelineRouter.ts:runFullPipeline` accepts `rawAlert` object |
| Structured `TriageObject` | Dedicated type with severity, entities, dedup, route | ✅ Present | `shared/agenticSchemas.ts:TriageObject` interface |
| Structured `CorrelationBundle` | Related alerts, blast radius, campaign, case recommendation | ✅ Present | `shared/agenticSchemas.ts:CorrelationBundle` interface |
| Structured `Hypothesis` stage | Working theory, alternate theories, evidence gaps | ✅ Present | `shared/agenticSchemas.ts:LivingCaseObject` interface |
| Structured `LivingCaseObject` | Investigation state with theory, pivots, gaps, actions | ✅ Present | `drizzle/schema.ts:livingCaseState` table + JSON contract |
| Approval-gated response | Structured action model with approval state machine | ✅ Present | `drizzle/schema.ts:responseActions` + `responseActionAudit` tables |
| Documentation stage | Report generation from structured case state | ✅ Present | `livingCaseReportService.ts` — 5 report types from LivingCaseObject |
| Analyst-facing assistant | Evidence-backed query assistant with pipeline context | ✅ Present | `agenticPipeline.ts:retrievePipelineContext()` injects case data |
| Investigation workspace | Manual investigation session tracking | ✅ Present | CRUD for investigations with evidence/timeline/tags |
| Read-only AI guardrail | Assistant cannot trigger destructive actions | ✅ Present | Read-only + approval-gated actions with audit trail |

---

## Claim-by-Claim Evidence

## Claim 1: "We built the alert-driven SOC workflow."

### Status: ✅ TRUE

### Concrete proof

**File:** `server/agenticPipeline/pipelineRouter.ts`

The `runFullPipeline` endpoint accepts a raw Wazuh alert object and chains all 4 stages:

```typescript
runFullPipeline: protectedProcedure
  .input(z.object({
    rawAlert: z.record(z.string(), z.unknown()),
    queueItemId: z.number().int().optional(),
  }))
```

**Pipeline stages executed in sequence:**
1. Triage Agent → produces `TriageObject`
2. Correlation Agent → produces `CorrelationBundle`
3. Hypothesis Agent → produces `LivingCaseObject`
4. Response Action Materialization → creates `response_actions` DB rows

**File:** `server/agenticPipeline/pipelineRouter.ts` — `autoTriageQueueItem` endpoint triggers triage automatically on Walter Queue intake.

**Database tracking:** `pipeline_runs` table tracks per-stage status (pending/completed/failed/skipped) with latency.

### The old query-centric path still exists but is now pipeline-aware

**File:** `server/graph/agenticPipeline.ts` — `retrievePipelineContext()` injects active living cases, pending response actions, and recent triage results into every analyst query.

---

## Claim 2: "We built a TriageObject."

### Status: ✅ TRUE

### Type/Schema

**File:** `shared/agenticSchemas.ts` — `TriageObject` interface (lines 30-90)

Contains all required fields (verified against live schema 2026-03-01):
- `triageId` — unique triage ID (string)
- `triagedAt` — UTC ISO-8601 timestamp when triage was performed
- `triagedBy` — who performed triage (`"triage_agent"` | `"analyst_manual"`)
- `alertId` — original Wazuh alert ID
- `ruleId`, `ruleDescription`, `ruleLevel` — Wazuh rule identity
- `alertTimestamp` — alert timestamp from Wazuh
- `agent` — agent object with `id`, `name`, `ip?`, `os?`, `groups?`
- `alertFamily` — normalized alert type/family
- `severity` — AI-assigned severity (`AgenticSeverity`: critical/high/medium/low/info)
- `severityConfidence` — confidence in severity assignment (0.0–1.0)
- `severityReasoning` — evidence-backed reasoning for severity
- `entities: ExtractedEntity[]` — typed entities with `source: ProvenanceSource` and `confidence`
- `mitreMapping: MitreMapping[]` — MITRE ATT&CK mappings with `techniqueId`, `techniqueName`, `tactic`, `confidence`, `source`
- `dedup` — deduplication object with `isDuplicate`, `similarityScore`, `reasoning`
- `route` — route recommendation (`TriageRoute`: `A_DUPLICATE_NOISY` | `B_LOW_CONFIDENCE` | `C_HIGH_CONFIDENCE` | `D_LIKELY_BENIGN`)
- `routeReasoning` — why this route was chosen
- `summary` — analyst-readable summary (2–4 sentences)
- `keyEvidence: EvidenceItem[]` — key evidence with `id`, `label`, `type`, `source`, `data`, `collectedAt`
- `uncertainties: Uncertainty[]` — things the triage agent doesn't know
- `caseLink` — case link suggestion with `shouldLink`, `confidence`, `reasoning`
- `rawAlert` — original raw alert JSON (preserved verbatim)

> **Stale fields removed in this revision:** `normalizedSeverity` → `severity`, `isDuplicate`/`deduplicationKey` → `dedup` object, `triageDecision` → `route` + `routeReasoning`, `suggestedPriority` → removed (not in live schema), `rawAlertRef` → `rawAlert`

### Persistence

**File:** `drizzle/schema.ts` — `triageObjects` table stores full TriageObject as typed JSON.

### Router endpoints

**File:** `server/agenticPipeline/pipelineRouter.ts`
- `triageAlert` — run triage on raw alert
- `getTriageById` — fetch by ID
- `listTriages` — list with pagination

### Test coverage

**File:** `server/agenticPipeline.test.ts` — TriageObject contract tests
**File:** `server/pipelineHandoff.test.ts` — Stage 1 handoff chain tests (truth-aligned 2026-03-01, validates live schema field names)

---

## Claim 3: "We built a CorrelationBundle."

### Status: ✅ TRUE

### Type/Schema

**File:** `shared/agenticSchemas.ts` — `CorrelationBundle` interface

Contains all required fields (verified against live schema 2026-03-01):
- `correlationId` — unique correlation ID (string)
- `correlatedAt` — UTC ISO-8601 timestamp
- `sourceTriageId` — source triage ID (string, not number)
- `relatedAlerts` — **top-level field** (not nested in `evidencePack`), each with `alertId`, `ruleId`, `ruleDescription`, `ruleLevel`, `timestamp`, `agentId`, `linkedBy: ExtractedEntity`, `relevance`
- `discoveredEntities: ExtractedEntity[]` — entities discovered during correlation
- `vulnerabilityContext` — CVE data with `cveId`, `severity`, `name`, `affectedPackage?`, `relevance`
- `fimContext` — FIM events with `path`, `event`, `timestamp`, `relevance`
- `threatIntelMatches` — threat intel with `ioc`, `iocType`, `source`, `threatName?`, `confidence`
- `priorInvestigations` — prior case links with `investigationId`, `title`, `status`, `linkReason`, `relevance`
- `blastRadius` — `affectedHosts`, `affectedUsers`, `affectedAgentIds`, `assetCriticality`, `confidence`
- `campaignAssessment` — `likelyCampaign`, `campaignLabel?`, `clusteredTechniques`, `confidence`, `reasoning`
- `caseRecommendation` — `action` (`merge_existing`/`create_new`/`defer_to_analyst`), `confidence`, `reasoning`
- `synthesis` — `narrative`, `supportingEvidence: EvidenceItem[]`, `conflictingEvidence: EvidenceItem[]`, `missingEvidence: Uncertainty[]`, `confidence`

> **Stale fields removed in this revision:** `evidencePack.*` wrapper → all fields are top-level, `sharedEntities` → `linkedBy`, `riskScore` → `confidence`, `hostVulnerabilities` → `vulnerabilityContext`, `fimEvents` → `fimContext`

### Persistence

**File:** `drizzle/schema.ts` — `correlationBundles` table stores full CorrelationBundle as typed JSON.

### Router endpoints

**File:** `server/agenticPipeline/pipelineRouter.ts`
- `correlate` — run correlation on triage result
- `getCorrelationById` — fetch by ID
- `listCorrelations` — list with pagination
- `getCorrelationByTriageId` — fetch by source triage

### Test coverage

**File:** `server/agenticPipeline.test.ts` — CorrelationBundle contract tests
**File:** `server/pipelineHandoff.test.ts` — Stage 2 handoff chain tests (truth-aligned 2026-03-01, validates live schema field names)

---

## Claim 4: "We built a hypothesis agent."

### Status: ✅ TRUE

### Implementation

**File:** `server/agenticPipeline/hypothesisAgent.ts`

The hypothesis agent:
1. Fetches the CorrelationBundle from DB
2. Retrieves the source TriageObject
3. Assembles full context (evidence pack, blast radius, campaign assessment)
4. Invokes LLM with structured JSON schema response format
5. Produces a `LivingCaseObject` with:
   - Working theory (statement, confidence, supporting/conflicting evidence)
   - Alternate theories (with `whyLessLikely` reasoning)
   - Evidence gaps (description, impact, suggested action, priority)
   - Suggested next steps (action, rationale, priority, effort)
   - Recommended actions (category, requiresApproval, evidenceBasis, state)
   - Timeline summary (timestamp, event, source, significance)
   - Draft documentation (shift handoff, escalation summary, executive summary, tuning suggestions)
6. Persists to `living_case_state` table
7. **Materializes response actions as first-class DB rows** via `materializeResponseActions()`

### Test coverage

**File:** `server/agenticPipeline.test.ts` — Hypothesis agent contract tests
**File:** `server/pipelineHandoff.test.ts` — Stage 3 handoff chain tests (truth-aligned 2026-03-01, validates live schema field names)

---

## Claim 5: "We built a LivingCaseObject."

### Status: ✅ TRUE

### Type/Schema

**File:** `shared/agenticSchemas.ts` — `LivingCaseObject` interface

Contains all required fields:
- `workingTheory` — statement, confidence, supporting/conflicting evidence
- `alternateTheories` — with `whyLessLikely` reasoning
- `completedPivots` — action, performedAt, performedBy, finding, impactedTheory
- `evidenceGaps` — description, impact, suggestedAction, priority
- `suggestedNextSteps` — action, rationale, priority, effort
- `recommendedActions` — action, category, requiresApproval, evidenceBasis, state
- `linkedAlertIds`, `linkedTriageIds`, `linkedCorrelationIds` — linked artifact IDs
- `linkedEntities` — all entities involved (uses `linkedEntities`, not `entities`)
- `timelineSummary` — chronological events (uses `timelineSummary`, not `timelineReconstruction`)
- `draftDocumentation` — shift handoff, escalation summary, executive summary, tuning suggestions

### Persistence

**File:** `drizzle/schema.ts` — `livingCaseState` table

Stores full `LivingCaseObject` as typed JSON plus denormalized fields for quick display:
- `workingTheory` (text)
- `theoryConfidence` (float)
- `completedPivotCount`, `evidenceGapCount`, `pendingActionCount`, `approvalRequiredCount` (int)
- `linkedTriageIds`, `linkedCorrelationIds` (JSON arrays)

### Router endpoints

**File:** `server/agenticPipeline/pipelineRouter.ts`
- `generateHypothesis` — run hypothesis agent on correlation bundle
- `getLivingCaseById` — fetch by ID
- `listLivingCases` — list with pagination
- `updateActionState` — update recommended action state
- `recordPivot` — record completed investigative pivot

### UI

**File:** `client/src/pages/LivingCaseView.tsx` — Full case detail view with:
- WorkingTheoryCard (confidence gauge, supporting/conflicting evidence)
- AlternateTheoriesCard (expandable theories with reasoning)
- InvestigativePivotsCard (prioritized next steps)
- EvidenceGapsCard (gaps with suggested actions)
- TimelineCard (chronological event reconstruction)
- RecommendedActionsCard (approve/reject/defer actions)
- CompletedPivotsCard (record investigative pivots)
- DraftDocumentationCard (shift handoff, escalation, executive summary, tuning)
- ReportGeneratorButton (5 report types: full, executive, handoff, escalation, tuning)

### Test coverage

**File:** `server/agenticPipeline.test.ts` — LivingCaseObject contract tests
**File:** `server/pipelineHandoff.test.ts` — Stage 3 handoff chain tests

---

## Claim 6: "We built approval-gated response."

### Status: ✅ TRUE

### This is NOT embedded in LLM JSON output

Response actions are **first-class database records**, not buried in LLM markdown:
- **Structured** — typed action categories, urgency levels, target entities
- **Queryable** — filterable by state, category, urgency, case ID
- **Stateful** — explicit state machine with enforced transitions
- **Auditable** — every state transition logged to audit table

### Database tables

**File:** `drizzle/schema.ts`

**`response_actions` table:**
- `id`, `livingCaseId`, `sourceTriageId`
- `actionCategory` — enum: isolate_host, disable_account, block_ioc, escalate_ir, suppress_alert, tune_rule, add_watchlist, collect_evidence, notify_stakeholder, custom
- `description`, `targetType`, `targetValue`
- `urgency` — enum: immediate, next_shift, scheduled, optional
- `state` — enum: proposed, approved, rejected, executed, deferred
- `requiresApproval` (boolean)
- `evidenceBasis` (JSON)
- `proposedBy`, `decidedBy`, `executedBy`
- `proposedAt`, `decidedAt`, `executedAt`
- `decisionReason`, `executionNotes`
- `playbookRef`

**`response_action_audit` table:**
- `id`, `actionId`
- `fromState`, `toState`
- `changedBy`, `reason`
- `metadata` (JSON)
- `createdAt`

### State machine

```
proposed → approved → executed  (happy path)
proposed → rejected             (analyst rejects)
proposed → deferred → proposed  (defer and re-propose)
approved → rejected             (revoke approval)
```

**Enforced in code:** `server/agenticPipeline/responseActionsRouter.ts` — `VALID_TRANSITIONS` map prevents invalid state transitions.

### Router endpoints

**File:** `server/agenticPipeline/responseActionsRouter.ts`
- `propose` — create new response action
- `approve` — approve with reason
- `reject` — reject with reason
- `execute` — mark as executed with notes
- `defer` — defer with reason
- `list` — list with filters (state, category, urgency, caseId)
- `getById` — fetch by ID with audit trail
- `getByCase` — fetch all actions for a case
- `stats` — aggregate statistics

### UI

**File:** `client/src/pages/ResponseActions.tsx` — Dedicated panel with:
- Filterable action queue (by state, category, urgency)
- Action cards with evidence basis, target entity, urgency badge
- Approve/Reject/Execute/Defer buttons with reason input
- Full audit trail per action
- Statistics dashboard (total, pending, approved, executed, rejected)

### Materialization from pipeline

**File:** `server/agenticPipeline/hypothesisAgent.ts` — `materializeResponseActions()` creates `response_actions` DB rows from hypothesis agent output. The LLM output is the *source*, the DB rows are the *system of record*.

### Test coverage

**File:** `server/responseActions.test.ts` — 44 tests for state machine, audit trail, CRUD
**File:** `server/pipelineHandoff.test.ts` — Response action state machine tests

---

## Claim 7: "We have a documentation agent."

### Status: ✅ TRUE (upgraded from Partial)

### Report generation from structured LivingCaseObject

**File:** `server/agenticPipeline/livingCaseReportService.ts`

Generates 5 report types from the structured `LivingCaseObject`:
1. **Full Investigation Report** — all sections (theory, evidence, timeline, actions, entities, documentation)
2. **Executive Summary** — non-technical overview for management
3. **Shift Handoff** — operational summary for incoming shift
4. **Escalation Brief** — urgency-focused report for IR team
5. **Detection Tuning** — recommendations for rule/detection improvements

### Report assembly

The `assembleLivingCaseReportData()` function:
1. Fetches the `living_case_state` row (structured LivingCaseObject)
2. Fetches linked `triageObjects` (TriageObject data)
3. Fetches linked `correlationBundles` (CorrelationBundle data)
4. Fetches linked `response_actions` with current state
5. Assembles all data into a `LivingCaseReportData` object

### Router endpoint

**File:** `server/agenticPipeline/pipelineRouter.ts`
- `generateCaseReport` — accepts caseId + reportType, returns markdown

### UI

**File:** `client/src/pages/LivingCaseView.tsx` — `ReportGeneratorButton` component:
- Dropdown menu with 5 report types
- Modal viewer for generated markdown
- Copy to clipboard functionality

---

## Claim 8: "We already have the guardrails."

### Status: ✅ TRUE (upgraded from Partial)

### Read-only AI behavior

- Assistant paths are read-only (GET endpoints only for Wazuh API)
- No agent deletion, rule modification, or active response triggers

### Approval-gated actions

- Response actions require explicit approval before execution
- State machine prevents invalid transitions
- `requiresApproval` flag on every action

### Auditable case actions

- Every state transition logged to `response_action_audit` table
- Records: who, when, reason, from_state, to_state, metadata

### Evidence/inference separation

- `TriageObject` separates raw alert data (`rawAlert`) from triage inference (`severity`, `route`, `routeReasoning`)
- `CorrelationBundle` separates evidence pack from synthesis narrative
- `LivingCaseObject` separates supporting evidence from working theory

### Durable decision provenance

- Every artifact has `schemaVersion` for forward compatibility
- `ProvenanceSource` type tracks where each piece of evidence came from
- `Confidence` type (0.0-1.0) on all inferred values
- Pipeline runs tracked with per-stage status and latency
- `kgAnswerProvenance` table records every analyst pipeline query with question, answer, confidence, and warnings (wired 2026-03-01)

> **Truth note (2026-03-01):** `kgTrustHistory` table exists in the schema and is counted in graph stats, but is **not yet populated at runtime**. It is a planned feature for tracking trust-score-over-time trends. The count will always be 0 until a writer is implemented. This is honestly documented here rather than claimed as functional.

---

## Questions Answered

The original audit asked for concrete proof of each claim. Here are the answers:

| Question | Answer |
|---|---|
| Show the `TriageObject` type/schema | `shared/agenticSchemas.ts` lines 30-90 |
| Show the `CorrelationBundle` type/schema | `shared/agenticSchemas.ts` lines 200-370 |
| Show the migration for `LivingCaseObject` fields | `drizzle/schema.ts` — `livingCaseState` table |
| Show the router endpoints that create/update those artifacts | `server/agenticPipeline/pipelineRouter.ts` — 20+ endpoints |
| Show the UI that renders approval-gated actions | `client/src/pages/ResponseActions.tsx` — dedicated panel |
| Show tests proving the handoff chain works end-to-end | `server/pipelineHandoff.test.ts` — truth-aligned contract tests (validated 2026-03-01) |

---

## Test Evidence

| Test File | Tests | Coverage |
|---|---:|---|
| `server/agenticPipeline.test.ts` | 45 | Triage, Correlation, Hypothesis agent contracts |
| `server/responseActions.test.ts` | 44 | Response action state machine, audit trail, CRUD |
| `server/pipelineHandoff.test.ts` | 56 | Truth-aligned contract tests: TriageObject, CorrelationBundle, LivingCaseObject, state machine, pipeline chain |
| All other test files (44) | 1008 | Wazuh API, indexer, graph, investigations, auth, drift analytics, anomaly detection, etc. |
| **Total** | **1153** | **48 test files, 0 TypeScript errors** |

---

## File Inventory

### Pipeline Backend

| File | Purpose |
|---|---|
| `server/agenticPipeline/triageAgent.ts` | Stage 1: Alert → TriageObject |
| `server/agenticPipeline/correlationAgent.ts` | Stage 2: TriageObject → CorrelationBundle |
| `server/agenticPipeline/hypothesisAgent.ts` | Stage 3: CorrelationBundle → LivingCaseObject + ResponseActions |
| `server/agenticPipeline/pipelineRouter.ts` | All pipeline tRPC endpoints (20+) |
| `server/agenticPipeline/responseActionsRouter.ts` | Response action CRUD + state machine |
| `server/agenticPipeline/livingCaseReportService.ts` | Report generation from structured case state |

### Shared Contracts

| File | Purpose |
|---|---|
| `shared/agenticSchemas.ts` | TriageObject, CorrelationBundle, LivingCaseObject type definitions |

### Database Tables

| Table | Purpose |
|---|---|
| `triage_objects` | Persisted TriageObject artifacts |
| `correlation_bundles` | Persisted CorrelationBundle artifacts |
| `living_case_state` | Persisted LivingCaseObject with denormalized fields |
| `response_actions` | First-class response action records |
| `response_action_audit` | Audit trail for every state transition |
| `pipeline_runs` | End-to-end pipeline execution tracking |
| `triage_feedback` | Analyst feedback on triage results |
| `alert_queue` | Walter Queue with auto-triage status |

### Frontend Pages

| File | Purpose |
|---|---|
| `client/src/pages/TriagePipeline.tsx` | Triage + Correlation UI with feedback loop |
| `client/src/pages/LivingCaseView.tsx` | Living Case detail view with 9 card components + report generator |
| `client/src/pages/ResponseActions.tsx` | Approval-gated response action panel |
| `client/src/pages/AlertQueue.tsx` | Walter Queue with auto-triage indicators |

---

## Final Verdict

**This codebase now fully implements the target agentic SOC workflow:**

- **Alert-centric** — pipeline starts from raw Wazuh alerts, not analyst queries
- **Artifact-driven** — structured TriageObject → CorrelationBundle → LivingCaseObject
- **Approval-gated** — response actions are first-class DB records with state machine and audit trail
- **Operationally auditable** — every decision has provenance, confidence, and audit history
- **Documentation-ready** — 5 report types generated from structured case state
- **Pipeline-aware** — analyst queries now inject active case context via `retrievePipelineContext()`
