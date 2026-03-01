# Truth Remediation — Audit Notes

## Task 1: pipelineHandoff.test.ts Stale Fields

### makeTriageObject stale fields (lines 26-73):
- `receivedAt` → should be `triagedAt`
- `normalizedSeverity` → should be `severity` (AgenticSeverity)
- `deduplicationKey` → should be `dedup` (object with isDuplicate, similarityScore, etc.)
- `isDuplicate` → moved inside `dedup` object
- `triageDecision` → split into `route` (TriageRoute) + `routeReasoning` (string)
- `triageDecision.route: "investigate"` → should be TriageRoute enum ("A_DUPLICATE_NOISY"|"B_LOW_CONFIDENCE"|"C_HIGH_CONFIDENCE"|"D_LIKELY_BENIGN")
- `suggestedPriority` → does not exist in live schema
- `contextHints` → does not exist in live schema
- `rawAlertRef` → should be `rawAlert`
- Missing required fields: `triageId`, `triagedBy`, `ruleId`, `ruleDescription`, `ruleLevel`, `alertTimestamp`, `agent`, `alertFamily`, `severityConfidence`, `severityReasoning`, `summary`, `keyEvidence`, `uncertainties`, `caseLink`
- MITRE mappings missing `source` field

### makeCorrelationBundle stale fields (lines 75-172):
- `sourceTriageId: triageId` (number) → should be string
- `evidencePack` → does not exist as a top-level field; live schema has `relatedAlerts`, `discoveredEntities`, `vulnerabilityContext`, `fimContext`, `threatIntelMatches`, `priorInvestigations` as direct fields
- `evidencePack.relatedAlerts[].description` → should be `ruleDescription`
- `evidencePack.relatedAlerts[].severity` → should be `ruleLevel` (number)
- `evidencePack.relatedAlerts[].sharedEntities` → should be `linkedBy` (ExtractedEntity) + `relevance` (Confidence)
- `evidencePack.hostVulnerabilities` → should be `vulnerabilityContext` with different shape
- `evidencePack.fimEvents` → should be `fimContext` with different shape
- `synthesis.supportingEvidence` → should be EvidenceItem[] not string[]
- `synthesis.conflictingEvidence` → should be EvidenceItem[] not string[]
- `synthesis.missingEvidence` → should be Uncertainty[] not string[]
- `synthesis.riskScore` → should be `confidence` (Confidence)
- Missing: `correlationId`, `discoveredEntities`

### Test assertions using stale fields:
- Line 310: `triage.receivedAt` → should be `triage.triagedAt`
- Line 311: `triage.normalizedSeverity` → should be `triage.severity`
- Line 313: `triage.deduplicationKey` → should be `triage.dedup`
- Line 314: `triage.isDuplicate` → should be `triage.dedup.isDuplicate`
- Line 318: `triage.triageDecision` → should be `triage.route` + `triage.routeReasoning`
- Line 346-351: triageDecision.route validation → should validate `triage.route` against TriageRoute enum
- Line 354-358: `triage.normalizedSeverity` → `triage.severity`
- Line 362: `triage.rawAlertRef` → `triage.rawAlert`
- Line 377-383: `bundle.evidencePack.*` → direct bundle fields
- Line 415: `bundle.synthesis.riskScore` → `bundle.synthesis.confidence`
- Line 558: `alert.sharedEntities` → `alert.linkedBy`
- Line 567: `bundle.synthesis.riskScore` → `bundle.synthesis.confidence`

## Task 3: Provenance Recording
- recordProvenance() exists in graphQueryService.ts (lines 635-658) but NEVER CALLED
- Wire into agenticPipeline.ts runAnalystPipeline() after synthesis, before return (around line 1063)
- Data available: queryHash as sessionId, query, answer, confidence, endpointIds from graph sources, warnings from safety

## Task 4: kgTrustHistory
- Table exists, imported, counted in stats, but NEVER WRITTEN TO
- Decision: Option B — mark as planned/not yet populated

## Task 5: AnalystChat.tsx
- Frontend generates simulated progress steps while waiting for backend
- Must label as "Estimated Progress" not live telemetry

## Task 6: enhancedLLM router
- Exists but NOT mounted in routers.ts
- Need to check what it does, then mount or mark dormant

## Task 7: Response action timing
- avgTimeToApproval and avgTimeToExecution return null
- Need to compute from response_action_audit or mark incomplete
