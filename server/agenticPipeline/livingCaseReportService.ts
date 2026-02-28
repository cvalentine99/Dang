/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Living Case Report Service
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Generates structured, exportable reports from a LivingCaseObject.
 * This is the documentation stage of the SOC workflow:
 *
 *   Alert → Triage → Correlation → Hypothesis → Living Case → **Report**
 *
 * Reports are generated from the structured case state (working theory,
 * alternate theories, evidence gaps, response actions, timeline, etc.),
 * NOT from lightweight investigation_sessions metadata.
 *
 * Output formats:
 *   - Markdown (for analyst consumption, copy-paste, or further editing)
 *   - HTML (for styled export or PDF conversion)
 *   - Structured JSON (for API consumers or downstream systems)
 *
 * Report types:
 *   - Full Case Report (comprehensive)
 *   - Executive Summary (1-page brief for leadership)
 *   - Shift Handoff (for SOC shift transitions)
 *   - Escalation Brief (for IR team handoff)
 *   - Tuning Report (for detection engineering)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db";
import {
  livingCaseState,
  triageObjects,
  correlationBundles,
  responseActions,
  responseActionAudit,
  investigationSessions,
} from "../../drizzle/schema";
import type { LivingCaseObject, TriageObject, CorrelationBundle } from "../../shared/agenticSchemas";

// ── Report Types ─────────────────────────────────────────────────────────────

export type ReportType = "full" | "executive" | "handoff" | "escalation" | "tuning";

export interface LivingCaseReportData {
  /** The living case state */
  caseData: LivingCaseObject;
  /** The source triage object */
  triageObject: TriageObject | null;
  /** The correlation bundle */
  correlationBundle: CorrelationBundle | null;
  /** Response actions with their current states */
  responseActionsList: Array<{
    actionId: string;
    category: string;
    title: string;
    description: string;
    state: string;
    urgency: string;
    targetType: string;
    targetValue: string;
    proposedAt: Date | null;
    approvedAt: Date | null;
    executedAt: Date | null;
    proposedBy: string | null;
    approvedBy: string | null;
  }>;
  /** Investigation session metadata */
  session: {
    id: number;
    title: string;
    description: string | null;
    status: string;
    createdAt: Date | null;
    updatedAt: Date | null;
  } | null;
  /** Report generation metadata */
  generatedAt: string;
  generatedBy: string;
  reportType: ReportType;
}

// ── Data Assembly ────────────────────────────────────────────────────────────

/**
 * Assembles all data needed to generate a living case report.
 * Fetches the case state, source triage, correlation bundle, and response actions.
 */
export async function assembleLivingCaseReportData(
  caseId: number,
  userId: number,
  reportType: ReportType = "full"
): Promise<LivingCaseReportData | null> {
  const db = await getDb();
  if (!db) return null;

  // Fetch living case state
  const [caseRow] = await db
    .select()
    .from(livingCaseState)
    .where(eq(livingCaseState.sessionId, caseId))
    .limit(1);

  if (!caseRow) return null;

  const caseData = caseRow.caseData as unknown as LivingCaseObject;

  // Fetch investigation session
  const [sessionRow] = await db
    .select()
    .from(investigationSessions)
    .where(eq(investigationSessions.id, caseId))
    .limit(1);

  // ── Direction 2: Exact linkage via sourceTriageId / sourceCorrelationId ────
  // Reports are defensible — we use exact lineage IDs stored on the case row,
  // not "loop through recent rows" heuristics.
  let triageObject: TriageObject | null = null;
  let correlationBundle: CorrelationBundle | null = null;

  // 1. Fetch correlation by exact ID stored on the case
  if (caseRow.sourceCorrelationId) {
    const [corrRow] = await db
      .select()
      .from(correlationBundles)
      .where(eq(correlationBundles.correlationId, caseRow.sourceCorrelationId))
      .limit(1);
    if (corrRow) {
      correlationBundle = corrRow.bundleData as unknown as CorrelationBundle;
    }
  }

  // 2. Fetch triage by exact ID stored on the case (preferred) or from correlation
  const triageIdToFetch = caseRow.sourceTriageId
    ?? correlationBundle?.sourceTriageId
    ?? null;

  if (triageIdToFetch) {
    const [triageRow] = await db
      .select()
      .from(triageObjects)
      .where(eq(triageObjects.triageId, triageIdToFetch))
      .limit(1);
    if (triageRow) {
      triageObject = triageRow.triageData as unknown as TriageObject;
    }
  }

  // Fetch response actions for this case
  const actionRows = await db
    .select()
    .from(responseActions)
    .where(eq(responseActions.caseId, caseId))
    .orderBy(desc(responseActions.createdAt));

  const responseActionsList = actionRows.map((a) => ({
    actionId: a.actionId,
    category: a.category,
    title: a.title,
    description: a.description ?? "",
    state: a.state,
    urgency: a.urgency,
    targetType: a.targetType ?? "",
    targetValue: a.targetValue ?? "",
    proposedAt: a.createdAt,
    approvedAt: a.approvedAt,
    executedAt: a.executedAt,
    proposedBy: a.proposedBy,
    approvedBy: a.approvedBy,
  }));

  return {
    caseData,
    triageObject,
    correlationBundle,
    responseActionsList,
    session: sessionRow
      ? {
          id: sessionRow.id,
          title: sessionRow.title,
          description: sessionRow.description,
          status: sessionRow.status,
          createdAt: sessionRow.createdAt,
          updatedAt: sessionRow.updatedAt,
        }
      : null,
    generatedAt: new Date().toISOString(),
    generatedBy: `user:${userId}`,
    reportType,
  };
}

// ── Markdown Report Generators ───────────────────────────────────────────────

/**
 * Generates a full case report in Markdown format from structured LivingCaseObject data.
 */
export function generateFullCaseReport(data: LivingCaseReportData): string {
  const { caseData, triageObject, correlationBundle, responseActionsList, session } = data;
  const lines: string[] = [];

  // Header
  lines.push(`# Living Case Report — Case #${caseData.caseId}`);
  lines.push("");
  lines.push(`**Generated:** ${data.generatedAt}`);
  lines.push(`**Report Type:** Full Case Report`);
  lines.push(`**Case Status:** ${session?.status ?? "unknown"}`);
  lines.push(`**Last Updated:** ${caseData.lastUpdatedAt}`);
  lines.push(`**Updated By:** ${caseData.lastUpdatedBy}`);
  lines.push("");

  // Executive Summary (from draft documentation if available)
  if (caseData.draftDocumentation?.executiveSummary) {
    lines.push("## Executive Summary");
    lines.push("");
    lines.push(caseData.draftDocumentation.executiveSummary);
    lines.push("");
  }

  // Working Theory
  lines.push("## Working Theory");
  lines.push("");
  lines.push(`**Statement:** ${caseData.workingTheory.statement}`);
  lines.push(`**Confidence:** ${(caseData.workingTheory.confidence * 100).toFixed(0)}%`);
  lines.push("");

  if (caseData.workingTheory.supportingEvidence.length > 0) {
    lines.push("### Supporting Evidence");
    lines.push("");
    for (const ev of caseData.workingTheory.supportingEvidence) {
      lines.push(`- ${ev}`);
    }
    lines.push("");
  }

  if (caseData.workingTheory.conflictingEvidence.length > 0) {
    lines.push("### Conflicting Evidence");
    lines.push("");
    for (const ev of caseData.workingTheory.conflictingEvidence) {
      lines.push(`- ${ev}`);
    }
    lines.push("");
  }

  // Alternate Theories
  if (caseData.alternateTheories.length > 0) {
    lines.push("## Alternate Theories");
    lines.push("");
    for (const theory of caseData.alternateTheories) {
      lines.push(`### ${theory.statement}`);
      lines.push(`**Confidence:** ${(theory.confidence * 100).toFixed(0)}%`);
      lines.push(`**Why Less Likely:** ${theory.whyLessLikely}`);
      if (theory.supportingEvidence.length > 0) {
        lines.push("**Supporting Evidence:**");
        for (const ev of theory.supportingEvidence) {
          lines.push(`- ${ev}`);
        }
      }
      lines.push("");
    }
  }

  // Source Alert (from TriageObject)
  if (triageObject) {
    lines.push("## Source Alert — Triage Summary");
    lines.push("");
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| Alert ID | \`${triageObject.alertId}\` |`);
    lines.push(`| Rule ID | \`${triageObject.ruleId}\` |`);
    lines.push(`| Rule Description | ${triageObject.ruleDescription} |`);
    lines.push(`| Rule Level | ${triageObject.ruleLevel} |`);
    lines.push(`| Alert Family | ${triageObject.alertFamily} |`);
    lines.push(`| AI Severity | ${triageObject.severity} |`);
    lines.push(`| Severity Confidence | ${(triageObject.severityConfidence * 100).toFixed(0)}% |`);
    lines.push(`| Agent | ${triageObject.agent.name} (${triageObject.agent.id}) |`);
    lines.push(`| Timestamp | ${triageObject.alertTimestamp} |`);
    lines.push(`| Triaged By | ${triageObject.triagedBy} |`);
    lines.push(`| Triaged At | ${triageObject.triagedAt} |`);
    lines.push("");
    lines.push(`**Severity Reasoning:** ${triageObject.severityReasoning}`);
    lines.push("");

    // Entities
    if (triageObject.entities.length > 0) {
      lines.push("### Extracted Entities");
      lines.push("");
      lines.push("| Type | Value | Role | Confidence |");
      lines.push("|------|-------|------|------------|");
      for (const e of triageObject.entities) {
        lines.push(`| ${e.type} | \`${e.value}\` | ${e.source} | ${(e.confidence * 100).toFixed(0)}% |`);
      }
      lines.push("");
    }

    // MITRE ATT&CK
    if (triageObject.mitreMapping.length > 0) {
      lines.push("### MITRE ATT&CK Mapping");
      lines.push("");
      lines.push("| Technique ID | Name | Tactic | Confidence |");
      lines.push("|-------------|------|--------|------------|");
      for (const m of triageObject.mitreMapping) {
        lines.push(`| ${m.techniqueId} | ${m.techniqueName} | ${m.tactic} | ${(m.confidence * 100).toFixed(0)}% |`);
      }
      lines.push("");
    }

    // Dedup
    lines.push("### Deduplication Assessment");
    lines.push("");
    lines.push(`- **Is Duplicate:** ${triageObject.dedup.isDuplicate ? "Yes" : "No"}`);
    lines.push(`- **Similarity Score:** ${(triageObject.dedup.similarityScore * 100).toFixed(0)}%`);
    if (triageObject.dedup.similarTriageId) {
      lines.push(`- **Similar Triage ID:** \`${triageObject.dedup.similarTriageId}\``);
    }
    lines.push(`- **Reasoning:** ${triageObject.dedup.reasoning}`);
    lines.push("");
  }

  // Correlation Bundle
  if (correlationBundle) {
    lines.push("## Correlation Bundle");
    lines.push("");

    if (correlationBundle.relatedAlerts.length > 0) {
      lines.push("### Related Alerts");
      lines.push("");
      lines.push("| Alert ID | Rule | Level | Agent | Linked By | Relevance |");
      lines.push("|----------|------|-------|-------|-----------|-----------|");
      for (const a of correlationBundle.relatedAlerts) {
        lines.push(`| \`${a.alertId}\` | ${a.ruleDescription} | ${a.ruleLevel} | ${a.agentId} | ${a.linkedBy.type}:${a.linkedBy.value} | ${(a.relevance * 100).toFixed(0)}% |`);
      }
      lines.push("");
    }

    if (correlationBundle.vulnerabilityContext.length > 0) {
      lines.push("### Vulnerability Context");
      lines.push("");
      lines.push("| CVE | Severity | Name | Relevance |");
      lines.push("|-----|----------|------|-----------|");
      for (const v of correlationBundle.vulnerabilityContext) {
        lines.push(`| ${v.cveId} | ${v.severity} | ${v.name} | ${(v.relevance * 100).toFixed(0)}% |`);
      }
      lines.push("");
    }

    if (correlationBundle.threatIntelMatches.length > 0) {
      lines.push("### Threat Intelligence Matches");
      lines.push("");
    for (const t of correlationBundle.threatIntelMatches) {
      lines.push(`- **${t.ioc}** (${t.iocType}) — Source: ${t.source}, Confidence: ${(t.confidence * 100).toFixed(0)}%`);
      if (t.threatName) lines.push(`  Threat: ${t.threatName}`);
      }
      lines.push("");
    }

    // Blast Radius
    if (correlationBundle.blastRadius) {
      lines.push("### Blast Radius Estimate");
      lines.push("");
      lines.push(`- **Affected Hosts:** ${correlationBundle.blastRadius.affectedHosts}`);
      lines.push(`- **Affected Users:** ${correlationBundle.blastRadius.affectedUsers}`);
      lines.push(`- **Asset Criticality:** ${correlationBundle.blastRadius.assetCriticality}`);
      lines.push("");
    }

    // Campaign Assessment
    if (correlationBundle.campaignAssessment) {
      lines.push("### Campaign Assessment");
      lines.push("");
      lines.push(`- **Likely Campaign:** ${correlationBundle.campaignAssessment.likelyCampaign ? "Yes" : "No"}`);
      lines.push(`- **Confidence:** ${(correlationBundle.campaignAssessment.confidence * 100).toFixed(0)}%`);
      if (correlationBundle.campaignAssessment.campaignLabel) {
        lines.push(`- **Campaign Label:** ${correlationBundle.campaignAssessment.campaignLabel}`);
      }
      lines.push(`- **Reasoning:** ${correlationBundle.campaignAssessment.reasoning}`);
      lines.push("");
    }
  }

  // Evidence Gaps
  if (caseData.evidenceGaps.length > 0) {
    lines.push("## Evidence Gaps");
    lines.push("");
    lines.push("| Priority | Gap | Impact | Suggested Action |");
    lines.push("|----------|-----|--------|-----------------|");
    for (const gap of caseData.evidenceGaps) {
      lines.push(`| ${gap.priority} | ${gap.description} | ${gap.impact} | ${gap.suggestedAction} |`);
    }
    lines.push("");
  }

  // Completed Pivots
  if (caseData.completedPivots.length > 0) {
    lines.push("## Completed Investigative Pivots");
    lines.push("");
    for (const pivot of caseData.completedPivots) {
      lines.push(`### ${pivot.action}`);
      lines.push(`- **Performed:** ${pivot.performedAt} by ${pivot.performedBy}`);
      lines.push(`- **Finding:** ${pivot.finding}`);
      lines.push(`- **Impacted Theory:** ${pivot.impactedTheory ? "Yes" : "No"}`);
      lines.push("");
    }
  }

  // Suggested Next Steps
  if (caseData.suggestedNextSteps.length > 0) {
    lines.push("## Suggested Next Steps");
    lines.push("");
    lines.push("| Priority | Effort | Action | Rationale |");
    lines.push("|----------|--------|--------|-----------|");
    for (const step of caseData.suggestedNextSteps) {
      lines.push(`| ${step.priority} | ${step.effort} | ${step.action} | ${step.rationale} |`);
    }
    lines.push("");
  }

  // Response Actions
  if (responseActionsList.length > 0) {
    lines.push("## Response Actions");
    lines.push("");
    lines.push("| Action ID | Category | Title | State | Urgency | Target |");
    lines.push("|-----------|----------|-------|-------|---------|--------|");
    for (const a of responseActionsList) {
      lines.push(`| \`${a.actionId.slice(0, 12)}\` | ${a.category} | ${a.title} | **${a.state}** | ${a.urgency} | ${a.targetType}:\`${a.targetValue}\` |`);
    }
    lines.push("");

    // Action state summary
    const stateCounts: Record<string, number> = {};
    for (const a of responseActionsList) {
      stateCounts[a.state] = (stateCounts[a.state] || 0) + 1;
    }
    lines.push("### Action State Summary");
    lines.push("");
    for (const [state, count] of Object.entries(stateCounts)) {
      lines.push(`- **${state}:** ${count}`);
    }
    lines.push("");
  }

  // Timeline Reconstruction
  if (caseData.timelineSummary && caseData.timelineSummary.length > 0) {
    lines.push("## Timeline Reconstruction");
    lines.push("");
    lines.push("| Time | Event | Source | Significance |");
    lines.push("|------|-------|--------|-------------|");
    for (const event of caseData.timelineSummary) {
      lines.push(`| ${event.timestamp} | ${event.event} | ${event.source} | ${event.significance} |`);
    }
    lines.push("");
  }

  // Entities
  if (caseData.linkedEntities && caseData.linkedEntities.length > 0) {
    lines.push("## Entities Involved");
    lines.push("");
    lines.push("| Type | Value | Source | Confidence |");
    lines.push("|------|-------|--------|------------|");
    for (const e of caseData.linkedEntities) {
      lines.push(`| ${e.type} | \`${e.value}\` | ${e.source} | ${(e.confidence * 100).toFixed(0)}% |`);
    }
    lines.push("");
  }

  // Tuning Suggestions
  if (caseData.draftDocumentation?.tuningSuggestions) {
    lines.push("## Detection Tuning Suggestions");
    lines.push("");
    lines.push(caseData.draftDocumentation.tuningSuggestions);
    lines.push("");
  }

  // Footer
  lines.push("---");
  lines.push("");
  lines.push(`*Report generated from structured LivingCaseObject (schema v${caseData.schemaVersion})*`);
  lines.push(`*Generated at ${data.generatedAt} by ${data.generatedBy}*`);

  return lines.join("\n");
}

/**
 * Generates an executive summary report — 1-page brief for leadership.
 */
export function generateExecutiveSummary(data: LivingCaseReportData): string {
  const { caseData, triageObject, responseActionsList, session } = data;
  const lines: string[] = [];

  lines.push(`# Executive Summary — Case #${caseData.caseId}`);
  lines.push("");
  lines.push(`**Generated:** ${data.generatedAt} | **Status:** ${session?.status ?? "unknown"}`);
  lines.push("");

  // Use draft documentation executive summary if available
  if (caseData.draftDocumentation?.executiveSummary) {
    lines.push(caseData.draftDocumentation.executiveSummary);
    lines.push("");
  } else {
    // Generate from working theory
    lines.push("## Assessment");
    lines.push("");
    lines.push(caseData.workingTheory.statement);
    lines.push(`Confidence: ${(caseData.workingTheory.confidence * 100).toFixed(0)}%`);
    lines.push("");
  }

  // Key metrics
  lines.push("## Key Metrics");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  if (triageObject) {
    lines.push(`| Alert Severity | ${triageObject.severity} |`);
    lines.push(`| Alert Family | ${triageObject.alertFamily} |`);
  }
  lines.push(`| Theory Confidence | ${(caseData.workingTheory.confidence * 100).toFixed(0)}% |`);
  lines.push(`| Alternate Theories | ${caseData.alternateTheories.length} |`);
  lines.push(`| Evidence Gaps | ${caseData.evidenceGaps.length} |`);
  lines.push(`| Response Actions | ${responseActionsList.length} |`);
  const pendingActions = responseActionsList.filter((a) => a.state === "proposed").length;
  const approvedActions = responseActionsList.filter((a) => a.state === "approved").length;
  const executedActions = responseActionsList.filter((a) => a.state === "executed").length;
  lines.push(`| Actions Pending | ${pendingActions} |`);
  lines.push(`| Actions Approved | ${approvedActions} |`);
  lines.push(`| Actions Executed | ${executedActions} |`);
  lines.push("");

  // Critical actions needing approval
  const criticalPending = responseActionsList.filter(
    (a) => a.state === "proposed" && (a.urgency === "critical" || a.urgency === "high")
  );
  if (criticalPending.length > 0) {
    lines.push("## Actions Requiring Immediate Approval");
    lines.push("");
    for (const a of criticalPending) {
      lines.push(`- **[${a.urgency.toUpperCase()}]** ${a.title} — ${a.category} on ${a.targetType}:\`${a.targetValue}\``);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(`*Executive summary from LivingCaseObject v${caseData.schemaVersion}*`);

  return lines.join("\n");
}

/**
 * Generates a shift handoff report — for SOC shift transitions.
 */
export function generateShiftHandoff(data: LivingCaseReportData): string {
  const { caseData, triageObject, responseActionsList, session } = data;
  const lines: string[] = [];

  lines.push(`# Shift Handoff — Case #${caseData.caseId}`);
  lines.push("");
  lines.push(`**Generated:** ${data.generatedAt} | **Status:** ${session?.status ?? "unknown"}`);
  lines.push("");

  // Use draft documentation shift handoff if available
  if (caseData.draftDocumentation?.shiftHandoff) {
    lines.push(caseData.draftDocumentation.shiftHandoff);
    lines.push("");
  }

  // Current state
  lines.push("## Current State");
  lines.push("");
  lines.push(`**Working Theory:** ${caseData.workingTheory.statement}`);
  lines.push(`**Confidence:** ${(caseData.workingTheory.confidence * 100).toFixed(0)}%`);
  lines.push("");

  // What was done
  if (caseData.completedPivots.length > 0) {
    lines.push("## What Was Done This Shift");
    lines.push("");
    for (const pivot of caseData.completedPivots) {
      lines.push(`- **${pivot.action}** → ${pivot.finding}`);
    }
    lines.push("");
  }

  // What needs to be done
  if (caseData.suggestedNextSteps.length > 0) {
    lines.push("## What Needs To Be Done Next");
    lines.push("");
    for (const step of caseData.suggestedNextSteps) {
      lines.push(`- **[${step.priority}/${step.effort}]** ${step.action}`);
    }
    lines.push("");
  }

  // Pending response actions
  const pending = responseActionsList.filter((a) => a.state === "proposed" || a.state === "approved");
  if (pending.length > 0) {
    lines.push("## Pending Response Actions");
    lines.push("");
    for (const a of pending) {
      lines.push(`- **[${a.state.toUpperCase()}]** ${a.title} (${a.category}) — ${a.urgency}`);
    }
    lines.push("");
  }

  // Evidence gaps
  if (caseData.evidenceGaps.length > 0) {
    lines.push("## Open Evidence Gaps");
    lines.push("");
    for (const gap of caseData.evidenceGaps) {
      lines.push(`- **[${gap.priority}]** ${gap.description} → ${gap.suggestedAction}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(`*Shift handoff from LivingCaseObject v${caseData.schemaVersion}*`);

  return lines.join("\n");
}

/**
 * Generates an escalation brief — for IR team handoff.
 */
export function generateEscalationBrief(data: LivingCaseReportData): string {
  const { caseData, triageObject, correlationBundle, responseActionsList, session } = data;
  const lines: string[] = [];

  lines.push(`# Escalation Brief — Case #${caseData.caseId}`);
  lines.push("");
  lines.push(`**Generated:** ${data.generatedAt} | **Status:** ${session?.status ?? "unknown"}`);
  lines.push(`**Escalation Urgency:** IMMEDIATE`);
  lines.push("");

  // Use draft documentation escalation brief if available
  if (caseData.draftDocumentation?.escalationSummary) {
    lines.push(caseData.draftDocumentation.escalationSummary);
    lines.push("");
  }

  // Incident Summary
  lines.push("## Incident Summary");
  lines.push("");
  lines.push(caseData.workingTheory.statement);
  lines.push(`**Confidence:** ${(caseData.workingTheory.confidence * 100).toFixed(0)}%`);
  lines.push("");

  // Source Alert
  if (triageObject) {
    lines.push("## Source Alert");
    lines.push("");
    lines.push(`- **Alert ID:** \`${triageObject.alertId}\``);
    lines.push(`- **Rule:** ${triageObject.ruleId} — ${triageObject.ruleDescription}`);
    lines.push(`- **Severity:** ${triageObject.severity}`);
    lines.push(`- **Agent:** ${triageObject.agent.name} (${triageObject.agent.id})`);
    lines.push(`- **Timestamp:** ${triageObject.alertTimestamp}`);
    lines.push("");
  }

  // Blast Radius
  if (correlationBundle?.blastRadius) {
    lines.push("## Blast Radius");
    lines.push("");
    lines.push(`- **Affected Hosts:** ${correlationBundle.blastRadius.affectedHosts}`);
    lines.push(`- **Affected Users:** ${correlationBundle.blastRadius.affectedUsers}`);
    lines.push(`- **Asset Criticality:** ${correlationBundle.blastRadius.assetCriticality}`);
    lines.push("");
  }

  // MITRE ATT&CK
  if (triageObject?.mitreMapping && triageObject.mitreMapping.length > 0) {
    lines.push("## MITRE ATT&CK Techniques");
    lines.push("");
    for (const m of triageObject.mitreMapping) {
      lines.push(`- **${m.techniqueId}** ${m.techniqueName} (${m.tactic}) — ${(m.confidence * 100).toFixed(0)}%`);
    }
    lines.push("");
  }

  // Entities of interest
  if (caseData.linkedEntities && caseData.linkedEntities.length > 0) {
    lines.push("## Entities of Interest");
    lines.push("");
    for (const e of caseData.linkedEntities) {
      lines.push(`- **${e.type}:** \`${e.value}\` (${e.source})`);
    }
    lines.push("");
  }

  // Immediate actions needed
  const criticalActions = responseActionsList.filter(
    (a) => a.state === "proposed" && (a.urgency === "critical" || a.urgency === "high")
  );
  if (criticalActions.length > 0) {
    lines.push("## Immediate Actions Required");
    lines.push("");
    for (const a of criticalActions) {
      lines.push(`- **[${a.urgency.toUpperCase()}]** ${a.title} — ${a.category} on ${a.targetType}:\`${a.targetValue}\``);
      lines.push(`  ${a.description}`);
    }
    lines.push("");
  }

  // Evidence gaps
  const criticalGaps = caseData.evidenceGaps.filter((g) => g.priority === "critical" || g.priority === "high");
  if (criticalGaps.length > 0) {
    lines.push("## Critical Evidence Gaps");
    lines.push("");
    for (const gap of criticalGaps) {
      lines.push(`- **[${gap.priority}]** ${gap.description}`);
      lines.push(`  Impact: ${gap.impact}`);
      lines.push(`  Suggested: ${gap.suggestedAction}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(`*Escalation brief from LivingCaseObject v${caseData.schemaVersion}*`);

  return lines.join("\n");
}

/**
 * Generates a tuning report — for detection engineering.
 */
export function generateTuningReport(data: LivingCaseReportData): string {
  const { caseData, triageObject } = data;
  const lines: string[] = [];

  lines.push(`# Detection Tuning Report — Case #${caseData.caseId}`);
  lines.push("");
  lines.push(`**Generated:** ${data.generatedAt}`);
  lines.push("");

  // Use draft documentation tuning suggestions if available
  if (caseData.draftDocumentation?.tuningSuggestions) {
    lines.push("## AI-Generated Tuning Suggestions");
    lines.push("");
    lines.push(caseData.draftDocumentation.tuningSuggestions);
    lines.push("");
  }

  // Source rule analysis
  if (triageObject) {
    lines.push("## Source Rule Analysis");
    lines.push("");
    lines.push(`- **Rule ID:** ${triageObject.ruleId}`);
    lines.push(`- **Rule Description:** ${triageObject.ruleDescription}`);
    lines.push(`- **Original Level:** ${triageObject.ruleLevel}`);
    lines.push(`- **AI Severity:** ${triageObject.severity}`);
    lines.push(`- **Severity Confidence:** ${(triageObject.severityConfidence * 100).toFixed(0)}%`);
    lines.push(`- **Severity Reasoning:** ${triageObject.severityReasoning}`);
    lines.push("");

    // If AI severity differs from rule level, flag it
    const ruleLevel = triageObject.ruleLevel;
    const severityMap: Record<string, number> = { critical: 13, high: 10, medium: 7, low: 4, info: 1 };
    const aiLevel = severityMap[triageObject.severity] ?? 7;
    if (Math.abs(ruleLevel - aiLevel) > 3) {
      lines.push("### ⚠️ Severity Mismatch Detected");
      lines.push("");
      lines.push(`The AI assigned severity \`${triageObject.severity}\` (equivalent level ~${aiLevel}), but the Wazuh rule level is ${ruleLevel}.`);
      lines.push("This may indicate the rule level needs adjustment.");
      lines.push("");
    }

    // Dedup analysis
    if (triageObject.dedup.isDuplicate) {
      lines.push("### Duplicate Alert Pattern");
      lines.push("");
      lines.push(`This alert was flagged as a likely duplicate (similarity: ${(triageObject.dedup.similarityScore * 100).toFixed(0)}%).`);
      lines.push(`Reasoning: ${triageObject.dedup.reasoning}`);
      lines.push("Consider adding deduplication logic or suppression rules.");
      lines.push("");
    }
  }

  // Outcome-based tuning
  lines.push("## Outcome-Based Recommendations");
  lines.push("");
  lines.push(`**Working Theory Confidence:** ${(caseData.workingTheory.confidence * 100).toFixed(0)}%`);
  lines.push("");

  if (caseData.workingTheory.confidence < 0.5) {
    lines.push("Low confidence in the working theory suggests this alert may be generating false positives or the detection rule may need refinement.");
    lines.push("");
  }

  if (caseData.alternateTheories.length > 2) {
    lines.push(`Multiple alternate theories (${caseData.alternateTheories.length}) suggest the alert is ambiguous. Consider adding more context to the detection rule.`);
    lines.push("");
  }

  lines.push("---");
  lines.push(`*Tuning report from LivingCaseObject v${caseData.schemaVersion}*`);

  return lines.join("\n");
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

/**
 * Generates a report of the specified type from the assembled data.
 */
export function generateReport(data: LivingCaseReportData): string {
  switch (data.reportType) {
    case "full":
      return generateFullCaseReport(data);
    case "executive":
      return generateExecutiveSummary(data);
    case "handoff":
      return generateShiftHandoff(data);
    case "escalation":
      return generateEscalationBrief(data);
    case "tuning":
      return generateTuningReport(data);
    default:
      return generateFullCaseReport(data);
  }
}
