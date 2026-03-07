/**
 * resolveTriageData — Resolves the full triage data for a queue item.
 *
 * The pipeline stores the canonical triage in `triage_objects.triageData` (linked
 * via `alertQueue.pipelineTriageId`). The legacy `alertQueue.triageResult` column
 * is only populated by manual triage or post-ticket stamping.
 *
 * Resolution order:
 *   1. triage_objects via pipelineTriageId (canonical, pipeline-produced)
 *   2. triage_objects via alertQueueItemId (fallback linkage)
 *   3. alertQueue.triageResult (legacy manual triage)
 *
 * Returns a normalized payload fragment ready for SplunkTicketPayload.
 */

import { getDb } from "../db";
import { triageObjects } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import type { TriageObject } from "../../shared/agenticSchemas";
import type { SplunkTicketPayload } from "./splunkService";

interface QueueItem {
  id: number;
  alertId: string;
  ruleId: string;
  ruleDescription: string | null;
  ruleLevel: number;
  agentId: string | null;
  agentName: string | null;
  alertTimestamp: string | null;
  pipelineTriageId: string | null;
  triageResult: unknown;
  rawJson: unknown;
}

export interface ResolvedTriagePayload {
  /** Whether triage data was found at all */
  found: boolean;
  /** Source of the triage data */
  source: "triage_objects" | "legacy_triageResult" | "none";
  /** The triage ID (if from triage_objects) */
  triageId: string | undefined;
  /** Partial SplunkTicketPayload fields extracted from the triage */
  payload: Omit<SplunkTicketPayload, "createdBy">;
}

/**
 * Resolve triage data for a queue item, preferring triage_objects over legacy.
 */
export async function resolveTriageData(item: QueueItem): Promise<ResolvedTriagePayload> {
  const rawJson = (item.rawJson as Record<string, unknown>) ?? {};
  const rule = (rawJson.rule as Record<string, unknown>) ?? {};
  const mitre = (rule.mitre as Record<string, unknown>) ?? {};
  const mitreIds = Array.isArray(mitre.id) ? (mitre.id as string[]) : [];
  const mitreTactics = Array.isArray(mitre.tactic) ? (mitre.tactic as string[]) : [];

  // Base fields from the queue item itself (always available)
  const base = {
    alertId: item.alertId,
    ruleId: item.ruleId,
    ruleDescription: item.ruleDescription ?? "Unknown",
    ruleLevel: item.ruleLevel,
    agentId: item.agentId ?? "Unknown",
    agentName: item.agentName ?? "Unknown",
    alertTimestamp: item.alertTimestamp ?? new Date().toISOString(),
    mitreIds,
    mitreTactics,
    rawAlertJson: rawJson,
  };

  // ── Strategy 1: triage_objects via pipelineTriageId ──────────────────────
  const db = await getDb();
  if (db && item.pipelineTriageId) {
    const [triageRow] = await db
      .select()
      .from(triageObjects)
      .where(eq(triageObjects.triageId, item.pipelineTriageId))
      .limit(1);

    if (triageRow?.triageData) {
      return buildFromTriageObject(triageRow.triageData as TriageObject, base, "triage_objects");
    }
  }

  // ── Strategy 2: triage_objects via alertQueueItemId ──────────────────────
  if (db) {
    const [triageRow] = await db
      .select()
      .from(triageObjects)
      .where(eq(triageObjects.alertQueueItemId, item.id))
      .orderBy(desc(triageObjects.id))
      .limit(1);

    if (triageRow?.triageData) {
      return buildFromTriageObject(triageRow.triageData as TriageObject, base, "triage_objects");
    }
  }

  // ── Strategy 3: legacy triageResult on alert_queue ───────────────────────
  const triage = item.triageResult as Record<string, unknown> | null;
  if (triage && triage.answer) {
    return {
      found: true,
      source: "legacy_triageResult",
      triageId: undefined,
      payload: {
        ...base,
        triageSummary: (triage.answer as string) ?? "No summary available",
        triageReasoning: (triage.reasoning as string) ?? "",
        trustScore: (triage.trustScore as number) ?? 0,
        confidence: (triage.confidence as number) ?? 0,
        safetyStatus: (triage.safetyStatus as string) ?? "unknown",
        suggestedFollowUps: (triage.suggestedFollowUps as string[]) ?? [],
      },
    };
  }

  // ── No triage data found ─────────────────────────────────────────────────
  return {
    found: false,
    source: "none",
    triageId: undefined,
    payload: {
      ...base,
      triageSummary: "No triage data available",
      triageReasoning: "",
      trustScore: 0,
      confidence: 0,
      safetyStatus: "unknown",
      suggestedFollowUps: [],
    },
  };
}

// ── Helper: build enriched payload from a full TriageObject ──────────────────

function buildFromTriageObject(
  t: TriageObject,
  base: ReturnType<typeof buildBase>,
  source: "triage_objects",
): ResolvedTriagePayload {
  // Merge MITRE from both Wazuh raw alert and triage agent's inference
  const triageMitreIds = t.mitreMapping?.map((m) => m.techniqueId) ?? [];
  const triageMitreTactics = t.mitreMapping?.flatMap((m) => m.tactic ? [m.tactic] : []) ?? [];
  const allMitreIds = Array.from(new Set([...base.mitreIds, ...triageMitreIds]));
  const allMitreTactics = Array.from(new Set([...base.mitreTactics, ...triageMitreTactics]));

  return {
    found: true,
    source,
    triageId: t.triageId,
    payload: {
      ...base,
      mitreIds: allMitreIds,
      mitreTactics: allMitreTactics,
      // Core triage fields
      triageSummary: t.summary ?? "No summary available",
      triageReasoning: t.severityReasoning ?? "",
      trustScore: 0, // TriageObject doesn't have trustScore; use confidence
      confidence: typeof t.severityConfidence === "number" ? t.severityConfidence : 0,
      safetyStatus: t.severity ?? "unknown",
      suggestedFollowUps: [],
      // Enriched fields from TriageObject
      alertFamily: t.alertFamily,
      severity: t.severity,
      severityConfidence: typeof t.severityConfidence === "number" ? t.severityConfidence : 0,
      severityReasoning: t.severityReasoning,
      route: t.route,
      routeReasoning: t.routeReasoning,
      entities: t.entities?.map((e) => ({
        type: e.type,
        value: e.value,
        context: e.metadata ? JSON.stringify(e.metadata) : undefined,
      })),
      keyEvidence: t.keyEvidence?.map((e) => ({
        type: e.type,
        value: e.label,
        relevance: e.source as string,
      })),
      dedup: t.dedup
        ? {
            isDuplicate: t.dedup.isDuplicate,
            similarityScore: typeof t.dedup.similarityScore === "number" ? t.dedup.similarityScore : 0,
            reasoning: t.dedup.reasoning,
          }
        : undefined,
      uncertainties: t.uncertainties?.map((u) => ({
        area: u.description,
        detail: u.impact,
        impact: u.suggestedAction,
      })),
      caseLink: t.caseLink
        ? {
            shouldLink: t.caseLink.shouldLink,
            suggestedCaseTitle: t.caseLink.suggestedCaseTitle,
            reasoning: t.caseLink.reasoning,
          }
        : undefined,
      agentOs: t.agent?.os,
      agentIp: t.agent?.ip,
      agentGroups: t.agent?.groups,
      triageId: t.triageId,
      triagedAt: t.triagedAt,
    },
  };
}

// Type helper for the base object
type BaseFields = {
  alertId: string;
  ruleId: string;
  ruleDescription: string;
  ruleLevel: number;
  agentId: string;
  agentName: string;
  alertTimestamp: string;
  mitreIds: string[];
  mitreTactics: string[];
  rawAlertJson: Record<string, unknown>;
};

function buildBase(_: never): BaseFields {
  throw new Error("Not callable — type helper only");
}
