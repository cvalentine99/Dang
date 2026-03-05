/**
 * Hypothesis Agent — Pipeline Step 3
 *
 * Consumes a CorrelationBundle (and its source TriageObject), generates:
 *   - Working theory with supporting/conflicting evidence
 *   - Alternate theories with confidence scores
 *   - Recommended investigative pivots (next actions for analyst)
 *   - Evidence gaps and suggested data collection actions
 *   - Timeline reconstruction from correlated events
 *   - Response recommendations with approval gates
 *   - Draft documentation artifacts
 *
 * Produces a LivingCaseObject — the canonical investigation state.
 *
 * Architecture: Fresh-context-per-stage — the CorrelationBundle is the only
 * handoff contract from Stage 2. The TriageObject is re-fetched for context.
 */

import { getDb } from "../db";
import {
  triageObjects,
  correlationBundles,
  livingCaseState,
  investigationSessions,
  responseActions,
  responseActionAudit,
} from "../../drizzle/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { recomputeCaseSummary, syncCaseSummaryAfterTransition } from "./stateMachine";
import { invokeLLMWithFallback } from "../llm/llmService";
import type {
  TriageObject,
  CorrelationBundle,
  LivingCaseObject,
  ExtractedEntity,
  ProvenanceSource,
} from "../../shared/agenticSchemas";

// ── Types ────────────────────────────────────────────────────────────────────

export interface HypothesisAgentInput {
  /** Correlation bundle ID to generate hypotheses from */
  correlationId: string;
  /** Optional: existing investigation session to merge into */
  existingSessionId?: number;
}

export interface HypothesisAgentResult {
  caseId: number;
  sessionId: number;
  livingCase: LivingCaseObject;
  latencyMs: number;
  tokensUsed: number;
  isNewSession: boolean;
  /** IDs of response_actions rows materialized from LLM recommendations */
  materializedActionIds: string[];
  /** Non-null when some actions failed to materialize — partial failure signal */
  materializePartialFailure: {
    attempted: number;
    succeeded: number;
    failed: Array<{ index: number; action: string; error: string }>;
  } | null;
}

// ── Context Assembly ────────────────────────────────────────────────────────

interface HypothesisContext {
  triage: TriageObject;
  bundle: CorrelationBundle;
  bundleRow: any;
  triageRow: any;
}

/**
 * Load the full context needed for hypothesis generation:
 * the CorrelationBundle and its source TriageObject.
 */
async function assembleContext(correlationId: string): Promise<HypothesisContext> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Load the correlation bundle
  const [bundleRow] = await db
    .select()
    .from(correlationBundles)
    .where(eq(correlationBundles.correlationId, correlationId))
    .limit(1);

  if (!bundleRow) throw new Error(`Correlation bundle not found: ${correlationId}`);
  if (bundleRow.status !== "completed") {
    throw new Error(`Correlation not completed (status: ${bundleRow.status})`);
  }

  const bundle = bundleRow.bundleData as CorrelationBundle;
  if (!bundle) throw new Error("Correlation bundle has no data");

  // Load the source triage object
  const sourceTriageId = bundle.sourceTriageId ?? bundleRow.sourceTriageId;
  if (!sourceTriageId) throw new Error("Correlation bundle has no source triage ID");

  const [triageRow] = await db
    .select()
    .from(triageObjects)
    .where(eq(triageObjects.triageId, sourceTriageId))
    .limit(1);

  if (!triageRow) throw new Error(`Source triage not found: ${sourceTriageId}`);

  const triage = triageRow.triageData as TriageObject;
  if (!triage) throw new Error("Triage object has no data");

  return { triage, bundle, bundleRow, triageRow };
}

// ── Investigation Session Management ────────────────────────────────────────

/**
 * Create or find an investigation session for this case.
 */
async function resolveSession(
  ctx: HypothesisContext,
  existingSessionId?: number
): Promise<{ sessionId: number; isNew: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // If merging into an existing session, verify it exists
  if (existingSessionId) {
    const [existing] = await db
      .select({ id: investigationSessions.id })
      .from(investigationSessions)
      .where(eq(investigationSessions.id, existingSessionId))
      .limit(1);

    if (existing) {
      return { sessionId: existing.id, isNew: false };
    }
    // If not found, fall through to create new
  }

  // Check if the correlation bundle's case recommendation suggests merging
  const caseRec = ctx.bundle.caseRecommendation;
  if (caseRec?.action === "merge_existing" && caseRec.mergeTargetId) {
    const [target] = await db
      .select({ id: investigationSessions.id })
      .from(investigationSessions)
      .where(eq(investigationSessions.id, caseRec.mergeTargetId))
      .limit(1);

    if (target) {
      return { sessionId: target.id, isNew: false };
    }
  }

  // Create a new investigation session
  const title = buildSessionTitle(ctx.triage, ctx.bundle);
  const [result] = await db.insert(investigationSessions).values({
    title,
    description: ctx.triage.summary ?? `Investigation triggered by alert ${ctx.triage.alertId}`,
    status: "active",
    userId: 0, // system-created
  }).$returningId();

  return { sessionId: result.id, isNew: true };
}

function buildSessionTitle(triage: TriageObject, bundle: CorrelationBundle): string {
  const family = triage.alertFamily ?? "Unknown";
  const agent = triage.agent?.name ?? triage.agent?.id ?? "Unknown Host";
  const severity = (triage.severity ?? "medium").toUpperCase();

  // If campaign detected, use campaign name
  if (bundle.campaignAssessment?.likelyCampaign && bundle.campaignAssessment?.campaignLabel) {
    return `[${severity}] Campaign: ${bundle.campaignAssessment.campaignLabel} — ${agent}`;
  }

  return `[${severity}] ${family} — ${agent} (${triage.ruleId})`;
}

// ── LLM Hypothesis Synthesis ────────────────────────────────────────────────

const HYPOTHESIS_SYSTEM_PROMPT = `You are a senior SOC analyst performing hypothesis generation for a security investigation.

You receive:
1. A TriageObject (the alert that started this investigation)
2. A CorrelationBundle (evidence synthesis from multiple data sources)

Your job is to produce a LivingCaseObject — a structured investigation state that includes:

## Working Theory
- The most likely explanation for what happened, grounded in evidence
- List specific evidence items that support and conflict with this theory
- Assign confidence honestly — sparse evidence = low confidence

## Alternate Theories
- At least 2 alternative explanations (even if unlikely)
- For each: what evidence supports it, why it's less likely than the working theory
- Include a "benign/false positive" theory if plausible

## Investigative Pivots
- Specific next steps the analyst should take to confirm or refute theories
- Prioritize by impact and effort (quick wins first)
- Include data sources to check (e.g., "Check DHCP logs for IP reassignment")

## Evidence Gaps
- What data is missing that would strengthen or weaken the theories
- How to obtain it (specific queries, tools, or contacts)
- Priority based on how much it would change the assessment

## Timeline Reconstruction
- Chronological sequence of significant events from the evidence
- Mark each event with its source (wazuh_alert, wazuh_fim, threat_intel, etc.)
- Identify temporal patterns (rapid succession, periodic, delayed)

## Response Recommendations
- Immediate actions (within 1 hour)
- Next actions (within 24 hours)
- Optional follow-ups
- Mark which require human approval

## Draft Documentation
- Shift handoff summary (2-3 sentences)
- Escalation summary (if severity warrants)
- Executive summary (non-technical, 1 paragraph)

Rules:
- EVIDENCE vs INFERENCE vs UNCERTAINTY must always be separated
- Every claim must cite specific data from the triage or correlation
- Do NOT hallucinate IOCs, alert IDs, or entity values
- If evidence is sparse, say so — do not inflate the investigation
- Confidence scores: 0.0-1.0, be honest about uncertainty
- Timeline entries must use real timestamps from the data
- Response actions must specify approval requirements`;

function buildHypothesisPrompt(ctx: HypothesisContext, sessionId: number): string {
  const parts: string[] = [
    "## Source Triage Object",
    "```json",
    JSON.stringify(
      {
        triageId: ctx.triage.triageId,
        alertId: ctx.triage.alertId,
        ruleId: ctx.triage.ruleId,
        ruleDescription: ctx.triage.ruleDescription,
        ruleLevel: ctx.triage.ruleLevel,
        severity: ctx.triage.severity,
        severityConfidence: ctx.triage.severityConfidence,
        severityReasoning: ctx.triage.severityReasoning,
        route: ctx.triage.route,
        routeReasoning: ctx.triage.routeReasoning,
        alertFamily: ctx.triage.alertFamily,
        alertTimestamp: ctx.triage.alertTimestamp,
        agent: ctx.triage.agent,
        entities: ctx.triage.entities,
        mitreMapping: ctx.triage.mitreMapping,
        dedup: ctx.triage.dedup,
        summary: ctx.triage.summary,
        keyEvidence: ctx.triage.keyEvidence?.slice(0, 5),
        uncertainties: ctx.triage.uncertainties,
        caseLink: ctx.triage.caseLink,
      },
      null,
      2
    ).slice(0, 4000),
    "```",
    "",
    "## Correlation Bundle",
    "```json",
    JSON.stringify(
      {
        correlationId: ctx.bundle.correlationId,
        relatedAlerts: ctx.bundle.relatedAlerts?.slice(0, 15),
        discoveredEntities: ctx.bundle.discoveredEntities?.slice(0, 20),
        vulnerabilityContext: ctx.bundle.vulnerabilityContext?.slice(0, 10),
        fimContext: ctx.bundle.fimContext?.slice(0, 10),
        threatIntelMatches: ctx.bundle.threatIntelMatches?.slice(0, 5),
        priorInvestigations: ctx.bundle.priorInvestigations?.slice(0, 5),
        blastRadius: ctx.bundle.blastRadius,
        campaignAssessment: ctx.bundle.campaignAssessment,
        caseRecommendation: ctx.bundle.caseRecommendation,
        synthesis: ctx.bundle.synthesis,
        synthesisConfidence: ctx.bundle.synthesis?.confidence,
        clusteredTechniques: ctx.bundle.campaignAssessment?.clusteredTechniques?.slice(0, 10),
      },
      null,
      2
    ).slice(0, 6000),
    "```",
    "",
    `## Investigation Context`,
    `- Case ID: ${sessionId}`,
    `- Blast Radius: ${ctx.bundle.blastRadius?.affectedHosts ?? 0} hosts, ${ctx.bundle.blastRadius?.affectedUsers ?? 0} users`,
    `- Synthesis Confidence: ${ctx.bundle.synthesis?.confidence ?? "N/A"}`,
    `- Campaign: ${ctx.bundle.campaignAssessment?.likelyCampaign ? ctx.bundle.campaignAssessment.campaignLabel ?? "Unnamed" : "Not detected"}`,
    `- Related Alerts: ${ctx.bundle.relatedAlerts?.length ?? 0}`,
    `- Vulnerabilities: ${ctx.bundle.vulnerabilityContext?.length ?? 0}`,
    `- FIM Events: ${ctx.bundle.fimContext?.length ?? 0}`,
    `- Threat Intel Hits: ${ctx.bundle.threatIntelMatches?.length ?? 0}`,
    "",
    "## Output Instructions",
    "Produce a JSON object with these exact fields:",
    "",
    "### workingTheory",
    "{ statement: string, confidence: number 0.0-1.0, supportingEvidence: string[], conflictingEvidence: string[] }",
    "",
    "### alternateTheories",
    "Array of { statement: string, confidence: number, supportingEvidence: string[], whyLessLikely: string }",
    "Include at least 2 theories. Include a benign/false-positive theory if plausible.",
    "",
    "### suggestedNextSteps",
    "Array of { action: string, rationale: string, priority: 'critical'|'high'|'medium'|'low', effort: 'quick'|'moderate'|'deep_dive' }",
    "Prioritize quick wins. Be specific about what to check and where.",
    "",
    "### evidenceGaps",
    "Array of { description: string, impact: string, suggestedAction: string, priority: 'critical'|'high'|'medium'|'low' }",
    "",
    "### timelineSummary",
    "Array of { timestamp: string (ISO-8601), event: string, source: string, significance: 'critical'|'high'|'medium'|'low' }",
    "Use real timestamps from the data. Order chronologically.",
    "",
    "### recommendedActions",
    "Array of response actions. Each action MUST use one of these exact category values:",
    "  isolate_host | disable_account | block_ioc | escalate_ir | suppress_alert | tune_rule | add_watchlist | collect_evidence | notify_stakeholder | custom",
    "Each action MUST use one of these exact urgency values:",
    "  immediate | next | scheduled | optional",
    "Each action MUST include targetType (ip|hostname|user|hash|domain|rule|alert|other) and targetValue (the specific entity).",
    "Format: { action: string, category: <enum above>, urgency: <enum above>, targetType: string, targetValue: string, requiresApproval: boolean, evidenceBasis: string[], state: 'proposed' }",
    "- isolate_host: target is the host IP or hostname to isolate",
    "- disable_account: target is the username or account to disable",
    "- block_ioc: target is the IOC value (IP, domain, hash) to block",
    "- escalate_ir: target is the incident or alert ID to escalate",
    "- suppress_alert: target is the rule ID to suppress",
    "- tune_rule: target is the rule ID to tune",
    "- add_watchlist: target is the entity to monitor",
    "- collect_evidence: target is the data source or artifact to collect",
    "- notify_stakeholder: target is the stakeholder or team to notify",
    "- requiresApproval MUST be true for: isolate_host, disable_account, block_ioc, escalate_ir",
    "- requiresApproval can be false for: suppress_alert, tune_rule, add_watchlist, collect_evidence, notify_stakeholder",
    "",
    "### draftDocumentation",
    "{ shiftHandoff: string, escalationSummary: string|null, executiveSummary: string, tuningSuggestions: string|null }",
    "- shiftHandoff: 2-3 sentences for SOC shift change",
    "- escalationSummary: only if severity is high/critical, otherwise null",
    "- executiveSummary: 1 paragraph, non-technical",
    "- tuningSuggestions: detection tuning ideas, or null",
  ];

  return parts.join("\n");
}

const HYPOTHESIS_JSON_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "living_case_hypothesis",
    strict: true,
    schema: {
      type: "object",
      properties: {
        workingTheory: {
          type: "object",
          properties: {
            statement: { type: "string" },
            confidence: { type: "number" },
            supportingEvidence: { type: "array", items: { type: "string" } },
            conflictingEvidence: { type: "array", items: { type: "string" } },
          },
          required: ["statement", "confidence", "supportingEvidence", "conflictingEvidence"],
          additionalProperties: false,
        },
        alternateTheories: {
          type: "array",
          items: {
            type: "object",
            properties: {
              statement: { type: "string" },
              confidence: { type: "number" },
              supportingEvidence: { type: "array", items: { type: "string" } },
              whyLessLikely: { type: "string" },
            },
            required: ["statement", "confidence", "supportingEvidence", "whyLessLikely"],
            additionalProperties: false,
          },
        },
        suggestedNextSteps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              action: { type: "string" },
              rationale: { type: "string" },
              priority: { type: "string" },
              effort: { type: "string" },
            },
            required: ["action", "rationale", "priority", "effort"],
            additionalProperties: false,
          },
        },
        evidenceGaps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              impact: { type: "string" },
              suggestedAction: { type: "string" },
              priority: { type: "string" },
            },
            required: ["description", "impact", "suggestedAction", "priority"],
            additionalProperties: false,
          },
        },
        timelineSummary: {
          type: "array",
          items: {
            type: "object",
            properties: {
              timestamp: { type: "string" },
              event: { type: "string" },
              source: { type: "string" },
              significance: { type: "string" },
            },
            required: ["timestamp", "event", "source", "significance"],
            additionalProperties: false,
          },
        },
        recommendedActions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              action: { type: "string" },
              category: { type: "string" },
              urgency: { type: "string" },
              targetType: { type: "string" },
              targetValue: { type: "string" },
              requiresApproval: { type: "boolean" },
              evidenceBasis: { type: "array", items: { type: "string" } },
              state: { type: "string" },
            },
            required: ["action", "category", "urgency", "targetType", "targetValue", "requiresApproval", "evidenceBasis", "state"],
            additionalProperties: false,
          },
        },
        draftDocumentation: {
          type: "object",
          properties: {
            shiftHandoff: { type: "string" },
            escalationSummary: { type: ["string", "null"] },
            executiveSummary: { type: "string" },
            tuningSuggestions: { type: ["string", "null"] },
          },
          required: ["shiftHandoff", "escalationSummary", "executiveSummary", "tuningSuggestions"],
          additionalProperties: false,
        },
      },
      required: [
        "workingTheory",
        "alternateTheories",
        "suggestedNextSteps",
        "evidenceGaps",
        "timelineSummary",
        "recommendedActions",
        "draftDocumentation",
      ],
      additionalProperties: false,
    },
  },
};

// ── LivingCaseObject Assembly ───────────────────────────────────────────────

function assembleLivingCase(
  sessionId: number,
  ctx: HypothesisContext,
  llmOutput: any
): LivingCaseObject {
  // Collect all linked entities from triage + correlation
  const linkedEntities: ExtractedEntity[] = [
    ...(ctx.triage.entities ?? []),
    ...(ctx.bundle.discoveredEntities ?? []),
  ];

  // Collect all linked alert IDs
  const linkedAlertIds: string[] = [
    ctx.triage.alertId,
    ...(ctx.bundle.relatedAlerts ?? []).map((a: any) => a.alertId).filter(Boolean),
  ];

  // Normalize priority values
  const normPriority = (v: string): "critical" | "high" | "medium" | "low" => {
    const valid = ["critical", "high", "medium", "low"];
    return valid.includes(v) ? (v as any) : "medium";
  };

  const normEffort = (v: string): "quick" | "moderate" | "deep_dive" => {
    const valid = ["quick", "moderate", "deep_dive"];
    return valid.includes(v) ? (v as any) : "moderate";
  };

  const normCategory = (v: string): "immediate" | "next" | "optional" => {
    const valid = ["immediate", "next", "optional"];
    return valid.includes(v) ? (v as any) : "next";
  };

  const normSignificance = (v: string): "critical" | "high" | "medium" | "low" => {
    const valid = ["critical", "high", "medium", "low"];
    return valid.includes(v) ? (v as any) : "medium";
  };

  const normSource = (v: string): ProvenanceSource => {
    const valid = [
      "wazuh_alert", "wazuh_agent", "wazuh_vuln", "wazuh_fim",
      "wazuh_sca", "threat_intel", "llm_inference", "analyst_input", "system_computed",
    ];
    return valid.includes(v) ? (v as ProvenanceSource) : "llm_inference";
  };

  return {
    schemaVersion: "1.0",
    caseId: sessionId,
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedBy: "hypothesis_agent",

    workingTheory: {
      statement: llmOutput.workingTheory?.statement ?? "Insufficient evidence to form a theory",
      confidence: clampConfidence(llmOutput.workingTheory?.confidence ?? 0.3),
      supportingEvidence: llmOutput.workingTheory?.supportingEvidence ?? [],
      conflictingEvidence: llmOutput.workingTheory?.conflictingEvidence ?? [],
    },

    alternateTheories: (llmOutput.alternateTheories ?? []).map((t: any) => ({
      statement: t.statement ?? "",
      confidence: clampConfidence(t.confidence ?? 0.1),
      supportingEvidence: t.supportingEvidence ?? [],
      whyLessLikely: t.whyLessLikely ?? "",
    })),

    completedPivots: [],

    evidenceGaps: (llmOutput.evidenceGaps ?? []).map((g: any) => ({
      description: g.description ?? "",
      impact: g.impact ?? "",
      suggestedAction: g.suggestedAction ?? "",
      priority: normPriority(g.priority ?? "medium"),
    })),

    suggestedNextSteps: (llmOutput.suggestedNextSteps ?? []).map((s: any) => ({
      action: s.action ?? "",
      rationale: s.rationale ?? "",
      priority: normPriority(s.priority ?? "medium"),
      effort: normEffort(s.effort ?? "moderate"),
    })),

    recommendedActions: (llmOutput.recommendedActions ?? []).map((a: any) => ({
      action: a.action ?? "",
      category: normCategory(a.category ?? "next"),
      urgency: (["immediate", "high", "medium", "low"] as const).includes(a.urgency?.toLowerCase()) ? a.urgency.toLowerCase() as "immediate" | "high" | "medium" | "low" : undefined,
      targetType: a.targetType ?? undefined,
      targetValue: a.targetValue ?? undefined,
      requiresApproval: a.requiresApproval ?? true,
      evidenceBasis: a.evidenceBasis ?? [],
      state: "proposed" as const,
    })),

    timelineSummary: (llmOutput.timelineSummary ?? []).map((t: any) => ({
      timestamp: t.timestamp ?? new Date().toISOString(),
      event: t.event ?? "",
      source: normSource(t.source ?? "llm_inference"),
      significance: normSignificance(t.significance ?? "medium"),
    })),

    linkedAlertIds,
    linkedTriageIds: [ctx.triage.triageId],
    linkedCorrelationIds: [ctx.bundle.correlationId],
    linkedEntities,

    draftDocumentation: {
      shiftHandoff: llmOutput.draftDocumentation?.shiftHandoff ?? null,
      escalationSummary: llmOutput.draftDocumentation?.escalationSummary ?? null,
      closureRationale: undefined,
      executiveSummary: llmOutput.draftDocumentation?.executiveSummary ?? null,
      tuningSuggestions: llmOutput.draftDocumentation?.tuningSuggestions ?? null,
    },
  };
}

function clampConfidence(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ── Persistence ─────────────────────────────────────────────────────────────

async function persistLivingCase(
  sessionId: number,
  livingCase: LivingCaseObject,
  isNew: boolean,
  sourceTriageId?: string,
  sourceCorrelationId?: string
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  if (isNew) {
    // Check if a living case state already exists for this session
    const [existing] = await db
      .select({ id: livingCaseState.id })
      .from(livingCaseState)
      .where(eq(livingCaseState.sessionId, sessionId))
      .limit(1);

    if (existing) {
      // Update existing
      await db
        .update(livingCaseState)
        .set({
          caseData: livingCase,
          workingTheory: livingCase.workingTheory.statement,
          theoryConfidence: livingCase.workingTheory.confidence,
          completedPivotCount: livingCase.completedPivots.length,
          evidenceGapCount: livingCase.evidenceGaps.length,
          // Counters will be recomputed from response_actions after materialization
          // (see syncCaseSummaryAfterTransition call below)
          pendingActionCount: 0,
          approvalRequiredCount: 0,
          linkedTriageIds: livingCase.linkedTriageIds,
          linkedCorrelationIds: livingCase.linkedCorrelationIds,
          ...(sourceTriageId ? { sourceTriageId } : {}),
          ...(sourceCorrelationId ? { sourceCorrelationId } : {}),
          lastUpdatedBy: "hypothesis_agent",
        })
        .where(eq(livingCaseState.id, existing.id));

      return existing.id;
    }

    // Insert new
    const [result] = await db.insert(livingCaseState).values({
      sessionId,
      caseData: livingCase,
      workingTheory: livingCase.workingTheory.statement,
      theoryConfidence: livingCase.workingTheory.confidence,
      completedPivotCount: livingCase.completedPivots.length,
      evidenceGapCount: livingCase.evidenceGaps.length,
      // Counters will be recomputed from response_actions after materialization
      pendingActionCount: 0,
      approvalRequiredCount: 0,
      sourceTriageId: sourceTriageId ?? null,
      sourceCorrelationId: sourceCorrelationId ?? null,
      linkedTriageIds: livingCase.linkedTriageIds,
      linkedCorrelationIds: livingCase.linkedCorrelationIds,
      lastUpdatedBy: "hypothesis_agent",
    }).$returningId();

    return result.id;
  } else {
    // Merge into existing case — load current, merge, save
    const [existing] = await db
      .select()
      .from(livingCaseState)
      .where(eq(livingCaseState.sessionId, sessionId))
      .limit(1);

    if (existing) {
      const currentCase = existing.caseData as LivingCaseObject;
      const merged = mergeLivingCases(currentCase, livingCase);

      await db
        .update(livingCaseState)
        .set({
          caseData: merged,
          workingTheory: merged.workingTheory.statement,
          theoryConfidence: merged.workingTheory.confidence,
          completedPivotCount: merged.completedPivots.length,
          evidenceGapCount: merged.evidenceGaps.length,
          // Counters will be recomputed from response_actions after materialization
          pendingActionCount: 0,
          approvalRequiredCount: 0,
          linkedTriageIds: merged.linkedTriageIds,
          linkedCorrelationIds: merged.linkedCorrelationIds,
          ...(sourceTriageId ? { sourceTriageId } : {}),
          ...(sourceCorrelationId ? { sourceCorrelationId } : {}),
          lastUpdatedBy: "hypothesis_agent",
        })
        .where(eq(livingCaseState.id, existing.id));

      return existing.id;
    }

    // No existing case state — create new
    const [result] = await db.insert(livingCaseState).values({
      sessionId,
      caseData: livingCase,
      workingTheory: livingCase.workingTheory.statement,
      theoryConfidence: livingCase.workingTheory.confidence,
      completedPivotCount: 0,
      evidenceGapCount: livingCase.evidenceGaps.length,
      // Counters will be recomputed from response_actions after materialization
      pendingActionCount: 0,
      approvalRequiredCount: 0,
      sourceTriageId: sourceTriageId ?? null,
      sourceCorrelationId: sourceCorrelationId ?? null,
      linkedTriageIds: livingCase.linkedTriageIds,
      linkedCorrelationIds: livingCase.linkedCorrelationIds,
      lastUpdatedBy: "hypothesis_agent",
    }).$returningId();

    return result.id;
  }
}

/**
 * Merge a new LivingCaseObject into an existing one.
 * New evidence and theories are appended; the working theory is replaced
 * only if the new one has higher confidence.
 */
function mergeLivingCases(
  existing: LivingCaseObject,
  incoming: LivingCaseObject
): LivingCaseObject {
  // Use the higher-confidence working theory
  const workingTheory =
    incoming.workingTheory.confidence > existing.workingTheory.confidence
      ? incoming.workingTheory
      : existing.workingTheory;

  // Merge alternate theories (deduplicate by statement prefix)
  const existingStatements = new Set(
    existing.alternateTheories.map((t) => t.statement.slice(0, 80))
  );
  const newTheories = incoming.alternateTheories.filter(
    (t) => !existingStatements.has(t.statement.slice(0, 80))
  );

  // Merge evidence gaps (deduplicate by description prefix)
  const existingGaps = new Set(
    existing.evidenceGaps.map((g) => g.description.slice(0, 80))
  );
  const newGaps = incoming.evidenceGaps.filter(
    (g) => !existingGaps.has(g.description.slice(0, 80))
  );

  // Merge timeline (deduplicate by timestamp + event prefix, then sort)
  const existingTimelineKeys = new Set(
    existing.timelineSummary.map((t) => `${t.timestamp}|${t.event.slice(0, 50)}`)
  );
  const newTimeline = incoming.timelineSummary.filter(
    (t) => !existingTimelineKeys.has(`${t.timestamp}|${t.event.slice(0, 50)}`)
  );
  const mergedTimeline = [...existing.timelineSummary, ...newTimeline].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Merge linked IDs
  const linkedAlertIds = Array.from(new Set([...existing.linkedAlertIds, ...incoming.linkedAlertIds]));
  const linkedTriageIds = Array.from(new Set([...existing.linkedTriageIds, ...incoming.linkedTriageIds]));
  const linkedCorrelationIds = Array.from(
    new Set([...existing.linkedCorrelationIds, ...incoming.linkedCorrelationIds])
  );

  // Merge entities (deduplicate by type+value)
  const entityKeys = new Set(existing.linkedEntities.map((e) => `${e.type}:${e.value}`));
  const newEntities = incoming.linkedEntities.filter(
    (e) => !entityKeys.has(`${e.type}:${e.value}`)
  );

  return {
    schemaVersion: "1.0",
    caseId: existing.caseId,
    lastUpdatedAt: new Date().toISOString(),
    lastUpdatedBy: "hypothesis_agent",
    workingTheory,
    alternateTheories: [...existing.alternateTheories, ...newTheories],
    completedPivots: existing.completedPivots, // preserve analyst work
    evidenceGaps: [...existing.evidenceGaps, ...newGaps],
    suggestedNextSteps: incoming.suggestedNextSteps, // replace with latest
    recommendedActions: [
      ...existing.recommendedActions.filter((a) => a.state !== "proposed"),
      ...incoming.recommendedActions,
    ],
    timelineSummary: mergedTimeline,
    linkedAlertIds,
    linkedTriageIds,
    linkedCorrelationIds,
    linkedEntities: [...existing.linkedEntities, ...newEntities],
    draftDocumentation: {
      ...existing.draftDocumentation,
      ...incoming.draftDocumentation,
    },
  };
}

// ── Main Hypothesis Agent ───────────────────────────────────────────────────

export async function runHypothesisAgent(
  input: HypothesisAgentInput
): Promise<HypothesisAgentResult> {
  const startTime = Date.now();

  // 1. Assemble context (load triage + correlation from DB)
  const ctx = await assembleContext(input.correlationId);

  // 2. Resolve or create investigation session
  const { sessionId, isNew } = await resolveSession(ctx, input.existingSessionId);

  // 3. Build prompt and invoke LLM
  const prompt = buildHypothesisPrompt(ctx, sessionId);

  const llmResult = await invokeLLMWithFallback({
    messages: [
      { role: "system", content: HYPOTHESIS_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    response_format: HYPOTHESIS_JSON_SCHEMA,
    caller: "hypothesis_agent",
  });

  // 4. Parse the structured response
  const content = llmResult.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned empty response for hypothesis generation");

  const llmOutput = typeof content === "string" ? JSON.parse(content) : content;

  // 5. Assemble the LivingCaseObject
  const livingCase = assembleLivingCase(sessionId, ctx, llmOutput);

  // 6. Persist to database — pass exact lineage IDs, not recency-based
  const caseStateId = await persistLivingCase(
    sessionId,
    livingCase,
    isNew,
    ctx.triage.triageId,          // sourceTriageId — exact lineage
    ctx.bundle.correlationId      // sourceCorrelationId — exact lineage
  );

  // 7. Materialize response actions as first-class DB rows
  //    The LLM output is the *source*, the DB rows are the *system of record*.
  const materializeResult = await materializeResponseActions(
    livingCase,
    caseStateId,
    ctx
  );
  const materializedActionIds = materializeResult.ids;
  // 7b. Direction 4: Store action IDs on the living case (reference, not ownership)
  //      Then recompute summary from response_actions (single source of truth)
  if (materializedActionIds.length > 0) {
    // Re-read the persisted case (which may have been merged in persistLivingCase)
    // to avoid overwriting the merge result with the unmerged incoming case.
    const dbUpdate = await getDb();
    if (dbUpdate) {
      const [persistedRow] = await dbUpdate
        .select({ caseData: livingCaseState.caseData })
        .from(livingCaseState)
        .where(eq(livingCaseState.id, caseStateId))
        .limit(1);

      const persistedCase = (persistedRow?.caseData as LivingCaseObject) ?? livingCase;
      persistedCase.recommendedActionIds = materializedActionIds;

      // Derive actionSummary from response_actions table, not from snapshot
      const freshSummary = await recomputeCaseSummary(caseStateId);
      if (freshSummary) {
        persistedCase.actionSummary = freshSummary;
      }

      // Write back the merged case with action references + fresh summary
      await dbUpdate.update(livingCaseState)
        .set({ caseData: persistedCase as any })
        .where(eq(livingCaseState.id, caseStateId));

      // Update the in-memory reference for the return value
      Object.assign(livingCase, persistedCase);
    }

    // Sync the denormalized counters on living_case_state row
    await syncCaseSummaryAfterTransition(caseStateId);
  }

  // 8. Calculate metrics
  const tokensUsed = extractTokenCount(llmResult);
  const latencyMs = Date.now() - startTime;

  return {
    caseId: caseStateId,
    sessionId,
    livingCase,
    latencyMs,
    tokensUsed,
    isNewSession: isNew,
    materializedActionIds,
    materializePartialFailure: materializeResult.failed.length > 0
      ? {
          attempted: materializeResult.attempted,
          succeeded: materializeResult.succeeded,
          failed: materializeResult.failed,
        }
      : null,
  };
}

// ── Query Helpers ───────────────────────────────────────────────────────────

export async function getLivingCaseBySessionId(sessionId: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(livingCaseState)
    .where(eq(livingCaseState.sessionId, sessionId))
    .limit(1);
  return row ?? null;
}

export async function getLivingCaseById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(livingCaseState)
    .where(eq(livingCaseState.id, id))
    .limit(1);
  return row ?? null;
}

export async function listLivingCases(opts: {
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return { cases: [], total: 0 };

  const limit = opts.limit ?? 25;
  const offset = opts.offset ?? 0;

  const [countResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(livingCaseState);

  const rows = await db
    .select({
      id: livingCaseState.id,
      sessionId: livingCaseState.sessionId,
      workingTheory: livingCaseState.workingTheory,
      theoryConfidence: livingCaseState.theoryConfidence,
      completedPivotCount: livingCaseState.completedPivotCount,
      evidenceGapCount: livingCaseState.evidenceGapCount,
      pendingActionCount: livingCaseState.pendingActionCount,
      approvalRequiredCount: livingCaseState.approvalRequiredCount,
      sourceTriageId: livingCaseState.sourceTriageId,
      sourceCorrelationId: livingCaseState.sourceCorrelationId,
      linkedTriageIds: livingCaseState.linkedTriageIds,
      linkedCorrelationIds: livingCaseState.linkedCorrelationIds,
      lastUpdatedBy: livingCaseState.lastUpdatedBy,
      createdAt: livingCaseState.createdAt,
      updatedAt: livingCaseState.updatedAt,
    })
    .from(livingCaseState)
    .orderBy(desc(livingCaseState.updatedAt))
    .limit(limit)
    .offset(offset);

  return {
    cases: rows,
    total: countResult?.count ?? 0,
  };
}

export async function getLivingCaseByCorrelationId(correlationId: string) {
  const db = await getDb();
  if (!db) return null;

  // Find the living case that has this correlation ID in its linked list
  const rows = await db
    .select()
    .from(livingCaseState)
    .orderBy(desc(livingCaseState.updatedAt))
    .limit(50);

  for (const row of rows) {
    const linked = row.linkedCorrelationIds as string[] | null;
    if (linked?.includes(correlationId)) {
      return row;
    }
  }

  return null;
}

// ── Materialize Response Actions ────────────────────────────────────────────

/**
 * Convert LLM-generated recommendedActions from the LivingCaseObject into
 * first-class response_actions DB rows.
 *
 * The LLM output is the *source*; the DB rows are the *system of record*.
 * Each action gets its own row, its own lifecycle, its own audit history.
 */
async function materializeResponseActions(
  livingCase: LivingCaseObject,
  caseId: number,
  ctx: HypothesisContext
): Promise<{ ids: string[]; attempted: number; succeeded: number; failed: Array<{ index: number; action: string; error: string }> }> {
  const db = await getDb();
  if (!db) return { ids: [], attempted: 0, succeeded: 0, failed: [] };

  const actions = livingCase.recommendedActions ?? [];
  if (actions.length === 0) return { ids: [], attempted: 0, succeeded: 0, failed: [] };

  const materializedIds: string[] = [];
  const failedActions: Array<{ index: number; action: string; error: string }> = [];

  // Map LLM category strings to our typed enum values
  const CATEGORY_MAP: Record<string, string> = {
    immediate: "escalate_ir",
    next: "collect_evidence",
    optional: "tune_rule",
    isolate: "isolate_host",
    isolate_host: "isolate_host",
    disable_account: "disable_account",
    block: "block_ioc",
    block_ioc: "block_ioc",
    escalate: "escalate_ir",
    escalate_ir: "escalate_ir",
    suppress: "suppress_alert",
    suppress_alert: "suppress_alert",
    tune: "tune_rule",
    tune_rule: "tune_rule",
    watchlist: "add_watchlist",
    add_watchlist: "add_watchlist",
    collect: "collect_evidence",
    collect_evidence: "collect_evidence",
    notify: "notify_stakeholder",
    notify_stakeholder: "notify_stakeholder",
    custom: "custom",
  };

  const URGENCY_MAP: Record<string, string> = {
    immediate: "immediate",
    next: "next",
    scheduled: "scheduled",
    optional: "optional",
    high: "immediate",
    medium: "next",
    low: "optional",
  };

  const VALID_CATEGORIES = [
    "isolate_host", "disable_account", "block_ioc", "escalate_ir",
    "suppress_alert", "tune_rule", "add_watchlist", "collect_evidence",
    "notify_stakeholder", "custom",
  ];
  const VALID_URGENCY = ["immediate", "next", "scheduled", "optional"];

  for (const rec of actions) {
    try {
      const actionId = `ra-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

      // Resolve category — try direct match, then map, then infer from LLM category field
      let category = CATEGORY_MAP[rec.category?.toLowerCase() ?? ""] ?? null;
      if (!category || !VALID_CATEGORIES.includes(category)) {
        // Try to infer from the action text
        const actionLower = (rec.action ?? "").toLowerCase();
        if (actionLower.includes("isolat")) category = "isolate_host";
        else if (actionLower.includes("disabl") || actionLower.includes("account")) category = "disable_account";
        else if (actionLower.includes("block") || actionLower.includes("firewall")) category = "block_ioc";
        else if (actionLower.includes("escalat")) category = "escalate_ir";
        else if (actionLower.includes("suppress") || actionLower.includes("silence")) category = "suppress_alert";
        else if (actionLower.includes("tune") || actionLower.includes("rule")) category = "tune_rule";
        else if (actionLower.includes("watch") || actionLower.includes("monitor")) category = "add_watchlist";
        else if (actionLower.includes("collect") || actionLower.includes("evidence") || actionLower.includes("investigate")) category = "collect_evidence";
        else if (actionLower.includes("notify") || actionLower.includes("stakeholder")) category = "notify_stakeholder";
        else category = "custom";
      }

      // Resolve urgency — prefer LLM-provided urgency field, then map, then default
      const recUrgency = rec.urgency?.toLowerCase() ?? "";
      let urgency = VALID_URGENCY.includes(recUrgency)
        ? recUrgency
        : URGENCY_MAP[recUrgency] ?? "next";
      if (!VALID_URGENCY.includes(urgency)) urgency = "next";

      // Resolve target — prefer LLM-provided targetType/targetValue, then infer from entities
      let targetType = rec.targetType ?? null;
      let targetValue = rec.targetValue ?? null;
      if (!targetType || !targetValue) {
        // Fallback: infer from triage entities based on category
        const entities = ctx.triage.entities ?? [];
        const CATEGORY_TARGET_TYPE: Record<string, string[]> = {
          isolate_host: ["ip", "hostname"],
          disable_account: ["user"],
          block_ioc: ["ip", "hash", "domain"],
          escalate_ir: ["alert"],
          suppress_alert: ["rule"],
          tune_rule: ["rule"],
          add_watchlist: ["ip", "hostname", "user", "hash", "domain"],
          collect_evidence: ["ip", "hostname"],
          notify_stakeholder: ["user"],
        };
        const preferredTypes = CATEGORY_TARGET_TYPE[category] ?? ["ip", "hostname", "user", "hash", "domain"];
        const match = entities.find(e => preferredTypes.includes(e.type));
        if (match) {
          targetType = targetType ?? match.type;
          targetValue = targetValue ?? match.value;
        }
      }

      // ── Direction 8: Category-semantic validation ─────────────────────────
      // Validate that the target type is semantically consistent with the category.
      // If the LLM says "isolate_host" but provides a user target, that's a mismatch.
      const CATEGORY_REQUIRED_TARGET: Record<string, { expectedTypes: string[]; requiresTarget: boolean }> = {
        isolate_host: { expectedTypes: ["ip", "hostname", "host"], requiresTarget: true },
        disable_account: { expectedTypes: ["user", "account", "email"], requiresTarget: true },
        block_ioc: { expectedTypes: ["ip", "hash", "domain", "url", "ioc"], requiresTarget: true },
        escalate_ir: { expectedTypes: ["alert", "case", "incident"], requiresTarget: false },
        suppress_alert: { expectedTypes: ["rule", "alert", "signature"], requiresTarget: false },
        tune_rule: { expectedTypes: ["rule", "detection", "signature"], requiresTarget: false },
        add_watchlist: { expectedTypes: ["ip", "hostname", "user", "hash", "domain", "email"], requiresTarget: true },
        collect_evidence: { expectedTypes: ["ip", "hostname", "host", "user", "file"], requiresTarget: false },
        notify_stakeholder: { expectedTypes: ["user", "team", "email", "group"], requiresTarget: false },
        custom: { expectedTypes: [], requiresTarget: false },
      };

      const semanticRule = CATEGORY_REQUIRED_TARGET[category];
      let semanticWarning: string | null = null;

      if (semanticRule && targetType) {
        const normalizedTarget = targetType.toLowerCase();
        if (semanticRule.expectedTypes.length > 0 && !semanticRule.expectedTypes.includes(normalizedTarget)) {
          // Target type doesn't match category expectations — log warning but still materialize
          semanticWarning = `Category '${category}' expects target types [${semanticRule.expectedTypes.join(", ")}] but got '${targetType}'`;
          console.warn(`[HypothesisAgent] Semantic mismatch: ${semanticWarning}`);
        }
      }

      if (semanticRule?.requiresTarget && !targetValue) {
        semanticWarning = (semanticWarning ? semanticWarning + "; " : "") +
          `Category '${category}' expects a target value but none was provided`;
        console.warn(`[HypothesisAgent] Missing target: Category '${category}' requires a target value`);
      }

      await db.insert(responseActions).values({
        actionId,
        category: category as any,
        title: (rec.action ?? "Unnamed action").slice(0, 512),
        description: rec.evidenceBasis?.join("; ") ?? null,
        urgency: urgency as any,
        requiresApproval: rec.requiresApproval ? 1 : 0,
        state: "proposed",
        proposedBy: "hypothesis_agent",
        evidenceBasis: rec.evidenceBasis ?? null,
        targetValue: targetValue?.slice(0, 512) ?? null,
        targetType: targetType ?? null,
        caseId,
        correlationId: ctx.bundle.correlationId,
        triageId: ctx.triage.triageId,
        linkedAlertIds: ctx.bundle.relatedAlerts?.map(a => a.alertId ?? "").filter(Boolean).slice(0, 20) ?? null,
        linkedAgentIds: ctx.triage.agent?.id ? [ctx.triage.agent.id] : null,
        semanticWarning,
      });

      // Log creation audit
      const [inserted] = await db
        .select({ id: responseActions.id })
        .from(responseActions)
        .where(eq(responseActions.actionId, actionId))
        .limit(1);

      if (inserted) {
        await db.insert(responseActionAudit).values({
          actionId: inserted.id,
          actionIdStr: actionId,
          fromState: "none",
          toState: "proposed",
          performedBy: "hypothesis_agent",
          reason: `Auto-generated from hypothesis analysis of correlation ${ctx.bundle.correlationId}`,
          metadata: {
            caseId,
            triageId: ctx.triage.triageId,
            category,
            urgency,
          },
        });
      }

      materializedIds.push(actionId);
    } catch (err) {
      // Log but don't fail the whole pipeline for one action
      const errMsg = (err as Error).message;
      console.error(`[HypothesisAgent] Failed to materialize action: ${errMsg}`);
      failedActions.push({
        index: actions.indexOf(rec),
        action: (rec.action ?? "Unnamed action").slice(0, 128),
        error: errMsg,
      });
    }
  }

  if (failedActions.length > 0) {
    console.warn(
      `[HypothesisAgent] Partial failure: ${materializedIds.length}/${actions.length} actions materialized, ${failedActions.length} failed`
    );
  }

  return {
    ids: materializedIds,
    attempted: actions.length,
    succeeded: materializedIds.length,
    failed: failedActions,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractTokenCount(result: any): number {
  const usage = result?.usage;
  if (!usage) return 0;
  return (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
}
