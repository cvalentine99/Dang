/**
 * Shared helpers for Splunk ticket artifact recording and lineage resolution.
 *
 * Extracted from splunkRouter.ts to eliminate duplication between
 * single-create and batch-create paths.
 *
 * Canonical truth model:
 *   - Ticket existence: ticket_artifacts (success = true)
 *   - Triage data: triage_objects.triageData via resolveTriageData()
 *   - Lineage: ticket_artifacts.{triageId, pipelineRunId, queueItemId, alertId}
 *   - Legacy triageResult.splunkTicketId: compatibility display only, never drives logic
 */

import { getDb } from "../db";
import { ticketArtifacts, pipelineRuns } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";

// ── Lineage Resolution ────────────────────────────────────────────────────────

export interface LineageIds {
  triageId: string | null;
  pipelineRunId: number | null;
}

/**
 * Resolve the pipeline run and triage IDs for a queue item.
 * Used to populate first-class artifact linkage fields.
 *
 * Resolution order for triageId:
 *   1. resolvedTriageId (from resolveTriageData — canonical)
 *   2. pipeline_runs.triageId (from the most recent run for this queue item)
 *   3. fallbackTriageId (typically item.pipelineTriageId)
 */
export async function resolveLineageIds(
  queueItemId: number,
  resolvedTriageId: string | undefined | null,
  fallbackTriageId: string | null,
): Promise<LineageIds> {
  const db = await getDb();
  if (!db) {
    return {
      triageId: resolvedTriageId || fallbackTriageId || null,
      pipelineRunId: null,
    };
  }

  const [associatedRun] = await db
    .select({ id: pipelineRuns.id, triageId: pipelineRuns.triageId })
    .from(pipelineRuns)
    .where(eq(pipelineRuns.queueItemId, queueItemId))
    .orderBy(sql`${pipelineRuns.startedAt} DESC`)
    .limit(1);

  return {
    triageId: resolvedTriageId || associatedRun?.triageId || fallbackTriageId || null,
    pipelineRunId: associatedRun?.id ?? null,
  };
}

// ── Artifact Recording ────────────────────────────────────────────────────────

export interface RecordArtifactParams {
  ticketId: string;
  queueItemId: number;
  triageId: string | null;
  pipelineRunId: number | null;
  alertId: string;
  ruleId: string | null;
  ruleLevel: number;
  createdBy: string;
  success: boolean;
  statusMessage: string | null;
  rawResponse: Record<string, unknown> | null;
  httpStatusCode: number | null;
}

/**
 * Record a ticket artifact — the canonical audit trail for ticket creation.
 * Records both success and failure for forensic completeness.
 *
 * IMPORTANT: Drizzle passes `undefined` as empty string to MySQL, which breaks
 * nullable int/varchar columns. All nullable fields are explicitly coerced to null.
 */
export async function recordTicketArtifact(params: RecordArtifactParams): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(ticketArtifacts).values({
    ticketId: params.ticketId,
    system: "splunk_es",
    queueItemId: params.queueItemId,
    pipelineRunId: params.pipelineRunId === undefined ? null : params.pipelineRunId,
    triageId: params.triageId === undefined ? null : params.triageId,
    alertId: params.alertId,
    ruleId: params.ruleId ?? null,
    ruleLevel: params.ruleLevel,
    createdBy: params.createdBy,
    success: params.success,
    statusMessage: params.statusMessage,
    rawResponse: params.rawResponse,
    httpStatusCode: params.httpStatusCode,
  });
}
