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

export interface QueueItem {
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

/** Base fields extracted from the queue item itself (always available). */
interface BaseFields {
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
}

/**
 * Build the base fields from a queue item. These are always available
 * regardless of triage source.
 */
function buildBaseFields(item: QueueItem): BaseFields {
  const rawJson = (item.rawJson as Record<string, unknown>) ?? {};
  const rule = (rawJson.rule as Record<string, unknown>) ?? {};
  const mitre = (rule.mitre as Record<string, unknown>) ?? {};
  const mitreIds = Array.isArray(mitre.id) ? (mitre.id as string[]) : [];
  const mitreTactics = Array.isArray(mitre.tactic) ? (mitre.tactic as string[]) : [];

  return {
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
}

/**
 * Resolve triage data for a queue item, preferring triage_objects over legacy.
 */
export async function resolveTriageData(item: QueueItem): Promise<ResolvedTriagePayload> {
  const base = buildBaseFields(item);

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

/**
 * Build a fully enriched SplunkTicketPayload from a canonical TriageObject.
 *
 * This function maps every field from the TriageObject contract into the
 * SplunkTicketPayload structure. The mapping is intentionally explicit
 * (no spread operators) to make it auditable.
 */
export function buildFromTriageObject(
  t: TriageObject,
  base: BaseFields,
  source: "triage_objects",
): ResolvedTriagePayload {
  // Merge MITRE from both Wazuh raw alert and triage agent's inference
  const triageMitreIds = (t.mitreMapping ?? []).map((m) => m.techniqueId);
  const triageMitreTactics = (t.mitreMapping ?? []).flatMap((m) => m.tactic ? [m.tactic] : []);
  const allMitreIds = Array.from(new Set([...base.mitreIds, ...triageMitreIds]));
  const allMitreTactics = Array.from(new Set([...base.mitreTactics, ...triageMitreTactics]));

  return {
    found: true,
    source,
    triageId: t.triageId,
    payload: {
      // ── Base fields (from queue item) ──────────────────────────────────
      alertId: base.alertId,
      ruleId: base.ruleId,
      ruleDescription: base.ruleDescription,
      ruleLevel: base.ruleLevel,
      agentId: base.agentId,
      agentName: base.agentName,
      alertTimestamp: base.alertTimestamp,
      rawAlertJson: base.rawAlertJson,

      // ── MITRE ATT&CK (merged from raw alert + triage inference) ────────
      mitreIds: allMitreIds,
      mitreTactics: allMitreTactics,

      // ── Core triage fields ─────────────────────────────────────────────
      triageSummary: t.summary ?? "No summary available",
      triageReasoning: t.severityReasoning ?? "",
      trustScore: 0, // TriageObject doesn't have trustScore; use confidence instead
      confidence: typeof t.severityConfidence === "number" ? t.severityConfidence : 0,
      safetyStatus: t.severity ?? "unknown",
      suggestedFollowUps: [],

      // ── Enriched fields from TriageObject ──────────────────────────────
      alertFamily: t.alertFamily ?? undefined,
      severity: t.severity ?? undefined,
      severityConfidence: typeof t.severityConfidence === "number" ? t.severityConfidence : undefined,
      severityReasoning: t.severityReasoning ?? undefined,
      route: t.route ?? undefined,
      routeReasoning: t.routeReasoning ?? undefined,

      // ── Entities ───────────────────────────────────────────────────────
      entities: (t.entities ?? []).map((e) => ({
        type: e.type,
        value: e.value,
        context: e.metadata ? JSON.stringify(e.metadata) : undefined,
      })),

      // ── Key Evidence ───────────────────────────────────────────────────
      keyEvidence: (t.keyEvidence ?? []).map((e) => ({
        type: e.type,
        value: e.label,
        relevance: typeof e.relevance === "number" ? String(e.relevance) : (e.source as string),
      })),

      // ── Deduplication ──────────────────────────────────────────────────
      dedup: t.dedup
        ? {
            isDuplicate: t.dedup.isDuplicate,
            similarityScore: typeof t.dedup.similarityScore === "number" ? t.dedup.similarityScore : 0,
            reasoning: t.dedup.reasoning,
          }
        : undefined,

      // ── Uncertainties ──────────────────────────────────────────────────
      uncertainties: (t.uncertainties ?? []).map((u) => ({
        area: u.description,
        detail: u.impact,
        impact: u.suggestedAction,
      })),

      // ── Case Link ──────────────────────────────────────────────────────
      caseLink: t.caseLink
        ? {
            shouldLink: t.caseLink.shouldLink,
            suggestedCaseTitle: t.caseLink.suggestedCaseTitle,
            reasoning: t.caseLink.reasoning,
          }
        : undefined,

      // ── Agent metadata from triage ─────────────────────────────────────
      agentOs: t.agent?.os ?? undefined,
      agentIp: t.agent?.ip ?? undefined,
      agentGroups: t.agent?.groups ?? undefined,

      // ── Triage provenance ──────────────────────────────────────────────
      triageId: t.triageId,
      triagedAt: t.triagedAt,
    },
  };
}
