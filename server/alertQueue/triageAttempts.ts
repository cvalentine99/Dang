/**
 * M6 poison-alert guard — bounded auto-triage attempts per alert.
 *
 * Each auto-triage failure that releases an item back to the queue increments
 * `alert_queue.triageAttempts`. When it reaches MAX_TRIAGE_ATTEMPTS the item is
 * parked (`status='failed'`, `autoTriageStatus='exhausted'`) and no claim path,
 * poller, or re-enqueue will pick it (or the same alertId) up again. A successful
 * triage resets the counter to 0.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { alertQueue } from "../../drizzle/schema";
import { recordAnalystAction } from "../_core/analystAudit";
import type { getDb } from "../db";

export const DEFAULT_MAX_TRIAGE_ATTEMPTS = 3;

export function parseMaxTriageAttempts(raw: string | undefined): number {
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : DEFAULT_MAX_TRIAGE_ATTEMPTS;
}

/** Env-overridable via MAX_TRIAGE_ATTEMPTS (1..100). */
export const MAX_TRIAGE_ATTEMPTS = parseMaxTriageAttempts(process.env.MAX_TRIAGE_ATTEMPTS);

export const EXHAUSTED_STATUS = "exhausted" as const;

export interface TriageFailureState {
  triageAttempts: number;
  autoTriageStatus: "failed" | typeof EXHAUSTED_STATUS;
  status: "queued" | "failed";
  exhausted: boolean;
}

/** Pure transition: what a failed auto-triage attempt does to the queue item. */
export function nextTriageFailureState(
  prevAttempts: number | null | undefined,
  max: number = MAX_TRIAGE_ATTEMPTS,
): TriageFailureState {
  const triageAttempts = (prevAttempts ?? 0) + 1;
  const exhausted = triageAttempts >= max;
  return exhausted
    ? { triageAttempts, autoTriageStatus: EXHAUSTED_STATUS, status: "failed", exhausted }
    : { triageAttempts, autoTriageStatus: "failed", status: "queued", exhausted };
}

/** Whether an alertId's prior queue history forbids re-enqueueing it. */
export function isTriageHistoryExhausted(
  history: { maxAttempts: number; exhaustedRows: number },
  max: number = MAX_TRIAGE_ATTEMPTS,
): boolean {
  return history.exhaustedRows > 0 || history.maxAttempts >= max;
}

type QueueDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function affectedRows(res: unknown): number {
  const header = Array.isArray(res) ? res[0] : res;
  return Number((header as { affectedRows?: number } | undefined)?.affectedRows ?? 0);
}

/**
 * Prior triage history of an alertId across all queue rows (dedup is
 * lifecycle-aware: a re-enqueued alert inherits its attempt count).
 */
export async function getAlertTriageHistory(
  db: QueueDb,
  alertId: string,
): Promise<{ maxAttempts: number; exhaustedRows: number }> {
  const [row] = await db
    .select({
      maxAttempts: sql<number>`COALESCE(MAX(${alertQueue.triageAttempts}), 0)`,
      exhaustedRows: sql<number>`COALESCE(SUM(${alertQueue.autoTriageStatus} = 'exhausted'), 0)`,
    })
    .from(alertQueue)
    .where(eq(alertQueue.alertId, alertId));
  return {
    maxAttempts: Number(row?.maxAttempts ?? 0),
    exhaustedRows: Number(row?.exhaustedRows ?? 0),
  };
}

/**
 * Record a failed auto-triage on an item WE hold (status='processing').
 * Increments attempts; on reaching the cap parks it as failed/exhausted and audits.
 * Never resurrects an item that left 'processing' (C14).
 */
export async function recordAutoTriageFailure(
  db: QueueDb,
  queueItemId: number,
  opts: { actorUserId: number; source: string; error?: string },
): Promise<{ released: boolean; exhausted: boolean; attempts: number }> {
  const [cur] = await db
    .select({ triageAttempts: alertQueue.triageAttempts, alertId: alertQueue.alertId })
    .from(alertQueue)
    .where(eq(alertQueue.id, queueItemId))
    .limit(1);
  const next = nextTriageFailureState(cur?.triageAttempts ?? 0);

  const res = await db
    .update(alertQueue)
    .set({
      autoTriageStatus: next.autoTriageStatus,
      status: next.status,
      triageAttempts: next.triageAttempts,
    })
    .where(and(eq(alertQueue.id, queueItemId), inArray(alertQueue.status, ["processing"])));
  const released = affectedRows(res) > 0;

  if (released && next.exhausted) {
    // System transition (the item is already parked): log loudly if the audit
    // row cannot be written rather than masking the original triage error.
    try {
      await recordAnalystAction(db, {
        userId: opts.actorUserId,
        action: "alertQueue.triageExhausted",
        targetType: "alert_queue",
        targetId: queueItemId,
        metadata: {
          alertId: cur?.alertId ?? null,
          attempts: next.triageAttempts,
          maxAttempts: MAX_TRIAGE_ATTEMPTS,
          source: opts.source,
          lastError: opts.error?.slice(0, 500) ?? null,
        },
      });
    } catch (err) {
      console.error(`[TriageAttempts] audit of exhausted item ${queueItemId} failed:`, (err as Error).message);
    }
  }
  return { released, exhausted: next.exhausted, attempts: next.triageAttempts };
}
