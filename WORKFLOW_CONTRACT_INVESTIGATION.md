# Walter Pipeline — Workflow Contract Investigation

**Date:** 2026-03-02  
**Scope:** 9 interconnected pages under the "Intelligence" sidebar group  
**Purpose:** Investigation only — document how data flows between pages

---

## The Pipeline at a Glance

```
                          ┌──────────────────────┐
                          │   ALERT SOURCES       │
                          │  (Alerts Timeline,    │
                          │   Wazuh Indexer)      │
                          └──────┬───────┬────────┘
                     Manual      │       │  Automatic
                  "Send to       │       │  (polling)
                   Walter"       │       │
                          ▼      │       ▼
                   ┌─────────┐   │   ┌──────────────┐
                   │  ALERT  │◄──┘   │  AUTO-QUEUE   │
                   │  QUEUE  │◄──────│  RULES        │
                   │ /alert- │       │ /auto-queue-  │
                   │  queue  │       │  rules        │
                   └────┬────┘       └───────────────┘
                        │
            ┌───────────┼───────────┐
            │ Two paths │           │
            ▼           ▼           │
     alertQueue     pipeline.      │
     .process()     autoTriage     │
     (Walter's      QueueItem()    │
      agentic       (Triage        │
      pipeline)     Agent only)    │
            │           │          │
            │           ▼          │
            │    ┌─────────────┐   │
            │    │   TRIAGE    │   │
            │    │  PIPELINE   │   │
            │    │  /triage    │   │
            │    └──────┬──────┘   │
            │           │          │
            │    correlateFrom     │
            │    Triage()          │
            │           │          │
            │           ▼          │
            │    ┌─────────────┐   │
            │    │ CORRELATION │   │
            │    │  (bundled   │   │
            │    │   evidence) │   │
            │    └──────┬──────┘   │
            │           │          │
            │    generateHypo      │
            │    thesis()          │
            │           │          │
            ▼           ▼          │
     ┌─────────────────────────┐   │
     │     LIVING CASES        │   │
     │     /living-cases       │   │
     │  (hypothesis + pivots   │   │
     │   + response actions)   │   │
     └──────┬──────────────────┘   │
            │                      │
            │  materializes        │
            ▼                      │
     ┌─────────────────────────┐   │
     │   RESPONSE ACTIONS      │   │
     │   /response-actions     │   │
     │  (approve/reject/       │   │
     │   execute/defer)        │   │
     └────────────────────────-┘   │
                                   │
     ┌─────────────────────────┐   │
     │   PIPELINE INSPECTOR    │───┘
     │   /pipeline-inspector   │
     │  (audit all runs:       │
     │   triage→corr→hypo→RA) │
     └─────────────────────────┘

     ┌─────────────────────────┐
     │   ANALYST CHAT          │
     │   /analyst              │
     │  (Walter conversational │
     │   — graph.analystQuery) │
     └──────┬──────────────────┘
            │ creates/reads
            ▼
     ┌─────────────────────────┐
     │   INVESTIGATIONS        │
     │   /investigations       │
     │  (session notes,        │
     │   markdown export)      │
     └─────────────────────────┘

     ┌─────────────────────────┐
     │   KNOWLEDGE GRAPH       │
     │   /graph                │
     │  (API ontology, risk    │
     │   paths, ETL sync)      │
     └─────────────────────────┘

     ┌─────────────────────────┐
     │   DATA PIPELINE         │
     │   /pipeline             │
     │  (ETL status, graph     │
     │   sync controls)        │
     └─────────────────────────┘
```

---

## Page-by-Page Breakdown

### 1. `/alert-queue` — Walter Queue

**Role:** Inbox for alerts awaiting Walter's analysis. Central dispatch point.

**Inputs:**
- Manual: "Send to Walter" button on **Alerts Timeline** (`alertQueue.enqueue`)
- Automatic: **Auto-Queue Rules** polling engine (`autoQueueRouter.triggerPoll`)

**Actions on this page:**
- `alertQueue.process` → Runs `runAnalystPipeline()` (Walter's agentic pipeline from `server/graph/agenticPipeline.ts`). Stores triage result inline on the queue item. **This is the OLD path** — it does NOT create triage objects in the `triageObjects` table or feed into correlation/hypothesis.
- `pipeline.autoTriageQueueItem` → Runs `runTriageAgent()` (the NEW pipeline from `server/agenticPipeline/triageAgent.ts`). Creates a `triageObjects` row, links it back via `pipelineTriageId`. **This IS the path that feeds into the Triage Pipeline.**
- `alertQueue.remove` → Dismiss an alert
- `alertQueue.clearHistory` → Clear completed/failed items
- Navigate to `/triage` (button in header)
- Navigate to `/analyst?q=...` (sends alert context to Analyst Chat)
- Navigate to `/alerts` (back to Alerts Timeline)

**Outputs:**
- Queue items with `status: queued | processing | completed | failed`
- `pipelineTriageId` links to triage objects (when auto-triage is used)
- `triageResult` JSON blob (when old Walter process is used)

**Split-brain issue:** Two processing paths exist:
1. `alertQueue.process` → `runAnalystPipeline()` → stores result inline, does NOT create triage/correlation/hypothesis chain
2. `pipeline.autoTriageQueueItem` → `runTriageAgent()` → creates `triageObjects` row → feeds into `/triage` page

---

### 2. `/auto-queue-rules` — Auto-Queue Rules

**Role:** Configure rules that automatically enqueue matching alerts from the Wazuh Indexer.

**Backend:** `autoQueueRouter`

**Actions:**
- `autoQueue.list` → List all rules
- `autoQueue.create` → Create a new rule (minSeverity, ruleIds, agentPattern, mitreTechniqueIds, maxPerHour)
- `autoQueue.update` → Toggle enable/disable, change thresholds
- `autoQueue.delete` → Remove a rule
- `autoQueue.triggerPoll` → Manually trigger the polling engine (queries Indexer for last 90s of alerts, matches against rules, auto-enqueues matches)

**Flow:** Polls Indexer → matches rules → inserts into `alert_queue` table with `queuedBy: null` (auto-queued) → appears on `/alert-queue`

**No outbound navigation** to other pages.

---

### 3. `/triage` — Triage Pipeline

**Role:** View and manage triage results. The analyst's workbench for reviewing what the triage agent found.

**Backend:** `pipelineRouter` (listTriages, triageStats, correlateFromTriage, generateHypothesis, submitFeedback)

**Inputs:**
- Reads from `triageObjects` table (populated by `runTriageAgent()` from alert queue auto-triage or `pipeline.triageAlert` direct call)

**Actions on this page:**
- View triage list with filters (severity, route, status, agentId, feedbackOnly)
- View triage stats (counts by severity, route, status)
- Expand a triage → see full triage data, severity, route classification (A_DUPLICATE_NOISY, B_LOW_CONFIDENCE, C_HIGH_CONFIDENCE, D_LIKELY_BENIGN)
- **Correlate** button → `pipeline.correlateFromTriage` → runs `runCorrelationAgent()` → creates `correlationBundles` row
- View correlation bundle inline (evidence pack, related alerts, threat intel)
- **Generate Hypothesis** button → `pipeline.generateHypothesis` → runs `runHypothesisAgent()` → creates `livingCaseState` row + materializes `responseActions` rows
- On hypothesis success → **navigates to `/living-cases/{caseId}`**
- **Submit Feedback** → `pipeline.submitFeedback` (analyst agrees/disagrees with triage)
- Navigate to `/investigations`

**This is the main analyst workflow page** — the stepping stone from triage → correlation → hypothesis → living case.

---

### 4. `/living-cases` — Living Cases

**Role:** View and manage living investigation cases generated by the hypothesis agent.

**Backend:** `pipelineRouter` (listLivingCases, getLivingCaseById, recordPivot, generateCaseReport) + `responseActionsRouter` (getByCase, approve, reject, execute, defer)

**Inputs:**
- Created by `runHypothesisAgent()` (triggered from Triage Pipeline or runFullPipeline)
- Each living case has: hypothesis, evidence summary, recommended actions, pivots, timeline

**Actions on this page:**
- List all living cases
- View case detail (hypothesis, evidence, timeline)
- **Record Pivot** → `pipeline.recordPivot` (analyst adds investigation notes/pivots)
- **Generate Case Report** → `pipeline.generateCaseReport` (markdown report)
- **Response Actions** inline → `responseActions.getByCase` shows actions for this case
  - Approve / Reject / Execute / Defer individual actions
- Navigate between cases

**Outputs:** Living cases feed into Response Actions page for bulk management.

---

### 5. `/response-actions` — Response Actions

**Role:** Fleet-wide view of all proposed response actions across all cases. Approval workflow.

**Backend:** `responseActionsRouter` (listAll, pendingApproval, approve, reject, execute, defer, repropose, bulkApprove, stats, auditTrail, fullAuditLog)

**Inputs:**
- Materialized by `runHypothesisAgent()` during hypothesis generation
- Categories: isolate_host, disable_account, block_ioc, escalate_ir, suppress_alert, tune_rule, add_watchlist, collect_evidence, notify_stakeholder, custom
- Urgency: immediate, next, scheduled, optional

**Actions on this page:**
- View all response actions with filters (status, category, urgency, case)
- **Pending Approval** queue
- **Approve** → marks as approved
- **Reject** → marks as rejected with reason
- **Execute** → marks as executed (manual confirmation — no actual automation)
- **Defer** → postpone action
- **Repropose** → re-propose a rejected action
- **Bulk Approve** → approve multiple at once
- **Stats** → counts by status, category
- **Audit Trail** → per-action audit log
- **Full Audit Log** → all actions across all cases
- Links to `/living-cases/{caseId}` for context

---

### 6. `/pipeline-inspector` — Pipeline Inspector

**Role:** Observability dashboard for the full pipeline. Audit trail of all pipeline runs.

**Backend:** `pipelineRouter` (listPipelineRuns, pipelineRunStats, replayPipelineRun, getPipelineArtifacts)

**Inputs:**
- Reads from `pipelineRuns` table (created by `runFullPipeline()`)
- Each run tracks: alertId, queueItemId, stages (triage → correlation → hypothesis → responseActions), latencies, status

**Actions on this page:**
- List all pipeline runs with filters (status: running/completed/failed/partial)
- View run stats (total, by status, avg latency)
- **Replay** → `pipeline.replayPipelineRun` (re-run a pipeline)
- **View Artifacts** → `pipeline.getPipelineArtifacts` (triage object, correlation bundle, living case, response actions for a run)
- Navigate to `/living-cases/{livingCaseId}` for completed runs

**Note:** `runFullPipeline` is the orchestrator that chains all 4 stages in sequence. It's called from the AlertQueue page or could be triggered programmatically.

---

### 7. `/analyst` — Security Analyst (Walter Chat)

**Role:** Conversational interface to Walter. Free-form security analysis.

**Backend:** `graphRouter.analystQuery` → `runAnalystPipeline()` (from `server/graph/agenticPipeline.ts`)

**Inputs:**
- User types questions
- Can receive pre-filled queries from AlertQueue (`/analyst?q=...`)

**Actions:**
- Chat with Walter about security topics
- Walter uses the Knowledge Graph + Wazuh context to answer

**Relationship to other pages:**
- AlertQueue sends alert context here for ad-hoc analysis
- Does NOT directly create triage objects or feed into the pipeline
- Separate from the pipeline's `runTriageAgent` — this is the conversational Walter, not the structured triage agent

---

### 8. `/investigations` — Investigations

**Role:** Manual investigation sessions with notes, linked to the Knowledge Graph.

**Backend:** `graphRouter` (listInvestigations, createInvestigation, getInvestigation, updateInvestigation, addInvestigationNote, deleteInvestigationNote, exportInvestigationMarkdown, exportInvestigationHtml)

**Actions:**
- Create investigation sessions (title, description, status)
- Add timestamped notes to investigations
- Update status (active → closed → archived)
- Export as Markdown or HTML
- Link to agents via `investigationsByAgent`

**Relationship to other pages:**
- Triage Pipeline has a button to navigate to `/investigations`
- Living Cases can be linked to investigation sessions via `existingSessionId` in `generateHypothesis`
- Otherwise largely standalone — manual analyst notebook

---

### 9. `/graph` — Knowledge Graph

**Role:** API ontology explorer. Visualizes the Wazuh API structure as a knowledge graph.

**Backend:** `graphRouter` (etlFullSync, etlSyncLayer, etlStatus, graphStats, overviewGraph, endpointsByResource, endpointDetail, searchGraph, resourceOverview, useCases, errorPatterns, endpoints, riskAnalysis, detectRiskPaths, riskPathGraph)

**Actions:**
- ETL sync (build the knowledge graph from Wazuh API spec)
- Explore endpoints by resource, method, risk level
- Search the graph
- Detect risk paths (chains of endpoints that could be dangerous)
- View use cases and error patterns

**Relationship to other pages:**
- Provides the knowledge base that Walter (Analyst Chat) uses for context
- Data Pipeline (`/pipeline`) is the ETL control panel for this graph

---

## The Two Walter Paths (Split-Brain)

There are **two distinct Walter implementations** that coexist:

### Path A: Old Walter (Agentic Pipeline)
```
AlertQueue → alertQueue.process → runAnalystPipeline() 
  → stores triageResult JSON blob inline on queue item
  → NO triage object, NO correlation, NO hypothesis, NO living case
```
- Source: `server/graph/agenticPipeline.ts`
- Used by: `alertQueue.process` and `graph.analystQuery` (Analyst Chat)
- Output: Inline JSON on the queue item, or chat response

### Path B: New Pipeline (Structured Agents)
```
AlertQueue → pipeline.autoTriageQueueItem → runTriageAgent()
  → creates triageObjects row → appears on /triage
  → correlateFromTriage → creates correlationBundles row
  → generateHypothesis → creates livingCaseState + responseActions rows
  → appears on /living-cases and /response-actions
```
- Source: `server/agenticPipeline/triageAgent.ts`, `correlationAgent.ts`, `hypothesisAgent.ts`
- Used by: `pipeline.autoTriageQueueItem`, `pipeline.triageAlert`, `pipeline.runFullPipeline`
- Output: Structured database rows across 4 tables

### Path B Full Orchestration: `runFullPipeline`
```
rawAlert → Stage 1: Triage → Stage 2: Correlation → Stage 3: Hypothesis + Response Actions
  → creates pipelineRuns row tracking all stages
  → appears on /pipeline-inspector
```

---

## Data Flow Summary Table

| Source Page | Action | Destination | Data Created |
|---|---|---|---|
| Alerts Timeline | "Send to Walter" | alert_queue | Queue item (status: queued) |
| Auto-Queue Rules | triggerPoll | alert_queue | Queue items (auto, queuedBy: null) |
| Alert Queue | process (old) | alert_queue (inline) | triageResult JSON blob |
| Alert Queue | autoTriageQueueItem (new) | triageObjects | Triage object + pipelineTriageId link |
| Alert Queue | navigate | /triage | — |
| Alert Queue | navigate | /analyst?q=... | — |
| Triage Pipeline | correlateFromTriage | correlationBundles | Correlation bundle |
| Triage Pipeline | generateHypothesis | livingCaseState + responseActions | Living case + materialized actions |
| Triage Pipeline | navigate | /living-cases/{id} | — |
| Triage Pipeline | navigate | /investigations | — |
| Living Cases | recordPivot | livingCaseState | Pivot entry |
| Living Cases | approve/reject/execute | responseActions | Status change + audit |
| Response Actions | approve/reject/execute/defer | responseActions | Status change + audit |
| Response Actions | link | /living-cases/{caseId} | — |
| Pipeline Inspector | replayPipelineRun | pipelineRuns + all stages | Full pipeline re-run |
| Pipeline Inspector | navigate | /living-cases/{id} | — |
| Analyst Chat | analystQuery | — | Chat response (no DB persistence) |
| Investigations | createInvestigation | investigationSessions | Session row |
| Investigations | addNote | investigationNotes | Note row |
| Knowledge Graph | etlFullSync | graph tables | Knowledge graph nodes/edges |
| Data Pipeline | etlFullSync | graph tables | Knowledge graph nodes/edges |

---

## Database Tables Involved

| Table | Created By | Read By |
|---|---|---|
| `alert_queue` | AlertQueue, AutoQueue | AlertQueue, Pipeline |
| `auto_queue_rules` | AutoQueueRules | AutoQueue polling |
| `triage_objects` | TriageAgent | TriagePipeline, PipelineInspector |
| `correlation_bundles` | CorrelationAgent | TriagePipeline, PipelineInspector |
| `living_case_state` | HypothesisAgent | LivingCases, PipelineInspector |
| `response_actions` | HypothesisAgent (materialized) | LivingCases, ResponseActions |
| `response_action_audit` | ResponseActions (approve/reject/etc) | ResponseActions |
| `pipeline_runs` | runFullPipeline | PipelineInspector |
| `investigation_sessions` | Investigations | Investigations, KnowledgeGraph |
| `investigation_notes` | Investigations | Investigations |

---

## Key Observations

1. **The alert queue has two processing paths** — `alertQueue.process` (old Walter) and `pipeline.autoTriageQueueItem` (new structured pipeline). Only the new path feeds into the triage → correlation → hypothesis chain.

2. **`runFullPipeline` is the only orchestrator** that chains all 4 stages automatically and creates a `pipelineRuns` audit trail. Individual stage calls (correlateFromTriage, generateHypothesis) are manual stepping stones on the Triage Pipeline page.

3. **Analyst Chat is standalone** — it uses the old `runAnalystPipeline` for conversational answers but does NOT create structured triage objects or feed into the pipeline.

4. **Investigations are largely independent** — they can be linked to living cases via `existingSessionId` but are primarily a manual notebook.

5. **Knowledge Graph + Data Pipeline are infrastructure** — they provide the API ontology that Walter uses for context but don't directly participate in the alert processing workflow.

6. **Response Actions are the terminal node** — they're created by the hypothesis agent and managed through Living Cases or the dedicated Response Actions page. They represent the "so what do we do about it" step.
