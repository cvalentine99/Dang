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
} from "../../drizzle/schema";
import { eq, desc, and, sql } from "drizzle-orm";
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
    "Array of { action: string, category: 'immediate'|'next'|'optional', requiresApproval: boolean, evidenceBasis: string[], state: 'proposed' }",
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
              requiresApproval: { type: "boolean" },
              evidenceBasis: { type: "array", items: { type: "string" } },
              state: { type: "string" },
            },
            required: ["action", "category", "requiresApproval", "evidenceBasis", "state"],
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
  isNew: boolean
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
          pendingActionCount: livingCase.recommendedActions.filter(
            (a) => a.state === "proposed"
          ).length,
          approvalRequiredCount: livingCase.recommendedActions.filter(
            (a) => a.requiresApproval && a.state === "proposed"
          ).length,
          linkedTriageIds: livingCase.linkedTriageIds,
          linkedCorrelationIds: livingCase.linkedCorrelationIds,
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
      pendingActionCount: livingCase.recommendedActions.filter(
        (a) => a.state === "proposed"
      ).length,
      approvalRequiredCount: livingCase.recommendedActions.filter(
        (a) => a.requiresApproval && a.state === "proposed"
      ).length,
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
          pendingActionCount: merged.recommendedActions.filter(
            (a) => a.state === "proposed"
          ).length,
          approvalRequiredCount: merged.recommendedActions.filter(
            (a) => a.requiresApproval && a.state === "proposed"
          ).length,
          linkedTriageIds: merged.linkedTriageIds,
          linkedCorrelationIds: merged.linkedCorrelationIds,
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
      pendingActionCount: livingCase.recommendedActions.filter(
        (a) => a.state === "proposed"
      ).length,
      approvalRequiredCount: livingCase.recommendedActions.filter(
        (a) => a.requiresApproval && a.state === "proposed"
      ).length,
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

  // 6. Persist to database
  const caseStateId = await persistLivingCase(sessionId, livingCase, isNew);

  // 7. Calculate metrics
  const tokensUsed = extractTokenCount(llmResult);
  const latencyMs = Date.now() - startTime;

  return {
    caseId: caseStateId,
    sessionId,
    livingCase,
    latencyMs,
    tokensUsed,
    isNewSession: isNew,
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

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractTokenCount(result: any): number {
  const usage = result?.usage;
  if (!usage) return 0;
  return (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
}
