/**
 * Notification History Service — Persists and manages drift/anomaly notification records.
 *
 * Provides:
 * - recordNotification: Persist a notification attempt to the history table
 * - retryFailedNotification: Retry a failed notification with exponential backoff
 * - processRetryQueue: Process all notifications due for retry
 *
 * All notification flows (drift threshold + anomaly) should call recordNotification
 * after attempting delivery so the audit trail is complete.
 */

import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  driftNotificationHistory,
  type InsertDriftNotificationHistory,
} from "../../drizzle/schema";
import { notifyOwner } from "../_core/notification";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum number of retries for a failed notification */
export const MAX_RETRIES = 3;

/** Base delay for exponential backoff (in minutes) */
export const BASE_RETRY_DELAY_MINUTES = 5;

// ─── Record Notification ────────────────────────────────────────────────────

export interface RecordNotificationInput {
  notificationType: "drift_threshold" | "anomaly";
  scheduleId: number;
  snapshotId?: number;
  anomalyId?: number;
  userId: number;
  severity: "critical" | "high" | "medium" | "info";
  title: string;
  content: string;
  deliveryStatus: "sent" | "failed" | "suppressed";
  errorMessage?: string;
  scheduleName: string;
  driftPercent?: number;
  agentIds?: string[];
}

/**
 * Record a notification attempt in the history table.
 * If delivery failed, schedules the first retry.
 */
export async function recordNotification(
  input: RecordNotificationInput
): Promise<{ id: number } | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const nextRetryAt =
      input.deliveryStatus === "failed"
        ? new Date(Date.now() + BASE_RETRY_DELAY_MINUTES * 60 * 1000)
        : null;

    const result = await db.insert(driftNotificationHistory).values({
      notificationType: input.notificationType,
      scheduleId: input.scheduleId,
      snapshotId: input.snapshotId ?? null,
      anomalyId: input.anomalyId ?? null,
      userId: input.userId,
      severity: input.severity,
      title: input.title,
      content: input.content,
      deliveryStatus: input.deliveryStatus === "failed" ? "retrying" : input.deliveryStatus,
      errorMessage: input.errorMessage ?? null,
      retryCount: 0,
      maxRetries: MAX_RETRIES,
      nextRetryAt,
      scheduleName: input.scheduleName,
      driftPercent: input.driftPercent ?? null,
      agentIds: input.agentIds ?? null,
    });

    return { id: Number(result[0].insertId) };
  } catch (err) {
    console.error(
      `[NotificationHistory] Failed to record notification: ${(err as Error).message}`
    );
    return null;
  }
}

// ─── Retry Logic ────────────────────────────────────────────────────────────

/**
 * Retry a single failed notification.
 * Uses exponential backoff: delay = BASE * 2^retryCount minutes.
 */
export async function retryNotification(
  notificationId: number
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const [record] = await db
    .select()
    .from(driftNotificationHistory)
    .where(eq(driftNotificationHistory.id, notificationId))
    .limit(1);

  if (!record) return { success: false, error: "Notification not found" };

  if (record.deliveryStatus === "sent") {
    return { success: true }; // Already delivered
  }

  if (record.retryCount >= record.maxRetries) {
    // Mark as permanently failed
    await db
      .update(driftNotificationHistory)
      .set({ deliveryStatus: "failed", nextRetryAt: null })
      .where(eq(driftNotificationHistory.id, notificationId));
    return { success: false, error: "Max retries exceeded" };
  }

  // Attempt delivery
  try {
    await notifyOwner({
      title: record.title,
      content: record.content,
    });

    // Success — update record
    await db
      .update(driftNotificationHistory)
      .set({
        deliveryStatus: "sent",
        retryCount: record.retryCount + 1,
        lastRetryAt: new Date(),
        nextRetryAt: null,
        errorMessage: null,
      })
      .where(eq(driftNotificationHistory.id, notificationId));

    console.log(
      `[NotificationHistory] Retry #${record.retryCount + 1} succeeded for notification #${notificationId}`
    );
    return { success: true };
  } catch (err) {
    const errorMsg = (err as Error).message;
    const newRetryCount = record.retryCount + 1;

    if (newRetryCount >= record.maxRetries) {
      // Final failure
      await db
        .update(driftNotificationHistory)
        .set({
          deliveryStatus: "failed",
          retryCount: newRetryCount,
          lastRetryAt: new Date(),
          nextRetryAt: null,
          errorMessage: errorMsg,
        })
        .where(eq(driftNotificationHistory.id, notificationId));
    } else {
      // Schedule next retry with exponential backoff
      const delayMs = BASE_RETRY_DELAY_MINUTES * Math.pow(2, newRetryCount) * 60 * 1000;
      await db
        .update(driftNotificationHistory)
        .set({
          deliveryStatus: "retrying",
          retryCount: newRetryCount,
          lastRetryAt: new Date(),
          nextRetryAt: new Date(Date.now() + delayMs),
          errorMessage: errorMsg,
        })
        .where(eq(driftNotificationHistory.id, notificationId));
    }

    console.warn(
      `[NotificationHistory] Retry #${newRetryCount} failed for notification #${notificationId}: ${errorMsg}`
    );
    return { success: false, error: errorMsg };
  }
}

/**
 * Process all notifications that are due for retry.
 * Called periodically by the scheduler.
 */
export async function processRetryQueue(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const db = await getDb();
  if (!db) return { processed: 0, succeeded: 0, failed: 0 };

  const now = new Date();
  const dueNotifications = await db
    .select({ id: driftNotificationHistory.id })
    .from(driftNotificationHistory)
    .where(
      and(
        eq(driftNotificationHistory.deliveryStatus, "retrying"),
        lte(driftNotificationHistory.nextRetryAt, now)
      )
    )
    .limit(10); // Process max 10 at a time to avoid overload

  let succeeded = 0;
  let failed = 0;

  for (const notif of dueNotifications) {
    const result = await retryNotification(notif.id);
    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  return { processed: dueNotifications.length, succeeded, failed };
}
