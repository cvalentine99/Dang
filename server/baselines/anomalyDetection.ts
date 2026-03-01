/**
 * Drift Anomaly Detection Engine
 *
 * Detects statistically unusual drift spikes using z-score analysis
 * against a rolling window of previous drift snapshots for each schedule.
 *
 * Algorithm:
 * 1. Fetch the last N drift snapshots for the schedule (rolling window)
 * 2. Compute rolling mean and standard deviation of driftPercent
 * 3. Calculate z-score: (current - mean) / stddev
 * 4. If z-score >= sigma threshold (default 2.0), flag as anomaly
 *
 * Severity mapping:
 *   z >= 4.0 → critical
 *   z >= 3.0 → high
 *   z >= 2.0 → medium
 *
 * Minimum window size: 5 snapshots (need enough history for meaningful stats)
 * Default sigma threshold: 2.0 (configurable per invocation)
 */

import { eq, desc, and, lt } from "drizzle-orm";
import { getDb } from "../db";
import {
  driftSnapshots,
  driftAnomalies,
  type DriftSnapshot,
} from "../../drizzle/schema";
import { notifyOwner } from "../_core/notification";
import { checkSuppression } from "./suppressionRules";
import { recordNotification } from "./notificationHistory";

// ─── Configuration ──────────────────────────────────────────────────────────

/** Minimum number of previous snapshots needed for anomaly detection */
export const MIN_WINDOW_SIZE = 5;

/** Default rolling window size (number of previous snapshots to consider) */
export const DEFAULT_WINDOW_SIZE = 20;

/** Default sigma threshold for anomaly detection */
export const DEFAULT_SIGMA_THRESHOLD = 2.0;

// ─── Statistical Helpers ────────────────────────────────────────────────────

export interface RollingStats {
  mean: number;
  stdDev: number;
  count: number;
  values: number[];
}

/**
 * Compute mean and standard deviation from an array of numbers.
 * Uses population standard deviation (not sample).
 */
export function computeRollingStats(values: number[]): RollingStats {
  if (values.length === 0) {
    return { mean: 0, stdDev: 0, count: 0, values: [] };
  }

  const count = values.length;
  const mean = values.reduce((sum, v) => sum + v, 0) / count;

  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / count;
  const stdDev = Math.sqrt(variance);

  return { mean, stdDev, count, values };
}

/**
 * Calculate z-score for a given value against rolling stats.
 * Returns Infinity if stdDev is 0 and value differs from mean.
 * Returns 0 if stdDev is 0 and value equals mean.
 */
export function calculateZScore(value: number, stats: RollingStats): number {
  if (stats.stdDev === 0) {
    // All previous values were identical
    return value === stats.mean ? 0 : Infinity;
  }
  return (value - stats.mean) / stats.stdDev;
}

/**
 * Map z-score to severity level.
 */
export function zScoreToSeverity(zScore: number): "critical" | "high" | "medium" {
  if (zScore >= 4.0) return "critical";
  if (zScore >= 3.0) return "high";
  return "medium";
}

// ─── Core Detection ─────────────────────────────────────────────────────────

export interface AnomalyCheckResult {
  isAnomaly: boolean;
  zScore: number;
  rollingAvg: number;
  rollingStdDev: number;
  severity?: "critical" | "high" | "medium";
  windowSize: number;
  /** True if there weren't enough snapshots for meaningful detection */
  insufficientData: boolean;
}

/**
 * Check whether a newly created drift snapshot is anomalous.
 *
 * Fetches the rolling window of previous snapshots for the same schedule,
 * computes stats, and returns the anomaly verdict.
 */
export async function checkForAnomaly(
  snapshot: DriftSnapshot,
  options: {
    windowSize?: number;
    sigmaThreshold?: number;
  } = {}
): Promise<AnomalyCheckResult> {
  const windowSize = options.windowSize ?? DEFAULT_WINDOW_SIZE;
  const sigmaThreshold = options.sigmaThreshold ?? DEFAULT_SIGMA_THRESHOLD;

  const db = await getDb();
  if (!db) {
    return {
      isAnomaly: false,
      zScore: 0,
      rollingAvg: 0,
      rollingStdDev: 0,
      windowSize: 0,
      insufficientData: true,
    };
  }

  // Fetch previous snapshots for this schedule (excluding the current one)
  const previousSnapshots = await db
    .select({ driftPercent: driftSnapshots.driftPercent })
    .from(driftSnapshots)
    .where(
      and(
        eq(driftSnapshots.scheduleId, snapshot.scheduleId),
        eq(driftSnapshots.userId, snapshot.userId),
        lt(driftSnapshots.id, snapshot.id)
      )
    )
    .orderBy(desc(driftSnapshots.createdAt))
    .limit(windowSize);

  // Need minimum window size for meaningful statistics
  if (previousSnapshots.length < MIN_WINDOW_SIZE) {
    return {
      isAnomaly: false,
      zScore: 0,
      rollingAvg: 0,
      rollingStdDev: 0,
      windowSize: previousSnapshots.length,
      insufficientData: true,
    };
  }

  const values = previousSnapshots.map((s) => s.driftPercent);
  const stats = computeRollingStats(values);
  const zScore = calculateZScore(snapshot.driftPercent, stats);

  const isAnomaly = zScore >= sigmaThreshold;

  return {
    isAnomaly,
    zScore: Math.round(zScore * 100) / 100,
    rollingAvg: Math.round(stats.mean * 100) / 100,
    rollingStdDev: Math.round(stats.stdDev * 100) / 100,
    severity: isAnomaly ? zScoreToSeverity(zScore) : undefined,
    windowSize: stats.count,
    insufficientData: false,
  };
}

// ─── Persistence & Notification ─────────────────────────────────────────────

/**
 * Run anomaly detection on a drift snapshot and persist + notify if anomalous.
 *
 * This is the main entry point called by the BaselineScheduler after
 * persisting a drift snapshot.
 */
export async function detectAndRecordAnomaly(
  snapshot: DriftSnapshot,
  scheduleName: string,
  options: {
    windowSize?: number;
    sigmaThreshold?: number;
  } = {}
): Promise<{
  checked: boolean;
  isAnomaly: boolean;
  anomalyId?: number;
  notified: boolean;
  result?: AnomalyCheckResult;
}> {
  const sigmaThreshold = options.sigmaThreshold ?? DEFAULT_SIGMA_THRESHOLD;

  const result = await checkForAnomaly(snapshot, options);

  if (result.insufficientData) {
    return { checked: false, isAnomaly: false, notified: false, result };
  }

  if (!result.isAnomaly) {
    return { checked: true, isAnomaly: false, notified: false, result };
  }

  const db = await getDb();
  if (!db) {
    return { checked: true, isAnomaly: true, notified: false, result };
  }

  // Persist the anomaly
  let notified = false;
  const severity = result.severity ?? "medium";

  try {
    // ── Check suppression rules before notifying ────────────────────────
    const suppression = await checkSuppression(
      snapshot.userId,
      snapshot.scheduleId,
      severity
    );

    // Build notification content regardless (for history recording)
    const severityEmoji = severity === "critical" ? "🔴" : severity === "high" ? "🟠" : "🟡";
    const notificationLines = [
      `${severityEmoji} **${severity.toUpperCase()} Drift Anomaly Detected**`,
      "",
      `Schedule: **${scheduleName}** (ID: ${snapshot.scheduleId})`,
      `Drift: **${snapshot.driftPercent}%** (z-score: ${result.zScore})`,
      `Rolling Average: ${result.rollingAvg}% ± ${result.rollingStdDev}% (${result.windowSize} samples)`,
      `Sigma Threshold: ${sigmaThreshold}σ`,
      "",
      `This drift is **${result.zScore.toFixed(1)}σ** above the rolling average,`,
      `indicating a statistically unusual configuration change.`,
    ];

    // Add category breakdown if available
    const byCat = snapshot.byCategory as {
      packages: { added: number; removed: number; changed: number };
      services: { added: number; removed: number; changed: number };
      users: { added: number; removed: number; changed: number };
    } | null;

    if (byCat) {
      notificationLines.push(
        "",
        "**Category Breakdown:**",
        `- Packages: +${byCat.packages.added} / ~${byCat.packages.changed} / -${byCat.packages.removed}`,
        `- Services: +${byCat.services.added} / ~${byCat.services.changed} / -${byCat.services.removed}`,
        `- Users: +${byCat.users.added} / ~${byCat.users.changed} / -${byCat.users.removed}`
      );
    }

    // Add agent info
    const agentIds = (snapshot.agentIds as string[]) || [];
    if (agentIds.length > 0) {
      notificationLines.push("", `Agents: ${agentIds.join(", ")}`);
    }

    const title = `${severityEmoji} Drift Anomaly: ${scheduleName} — ${snapshot.driftPercent}% (${result.zScore}σ)`;
    const content = notificationLines.join("\n");
    let errorMessage: string | undefined;

    // Only send notification if not suppressed
    if (suppression.suppressed) {
      console.log(
        `[AnomalyDetection] Anomaly suppressed by rule #${suppression.ruleId}: ${suppression.reason}`
      );
    } else {
      try {
        await notifyOwner({ title, content });
        notified = true;
      } catch (notifyErr) {
        errorMessage = (notifyErr as Error).message;
        console.warn(
          `[AnomalyDetection] Failed to send notification: ${errorMessage}`
        );
      }
    }

    // Record in notification history for audit trail
    const anomalyInsertResult = await db.insert(driftAnomalies).values({
      snapshotId: snapshot.id,
      scheduleId: snapshot.scheduleId,
      userId: snapshot.userId,
      driftPercent: snapshot.driftPercent,
      rollingAvg: result.rollingAvg,
      rollingStdDev: result.rollingStdDev,
      zScore: result.zScore,
      sigmaThreshold,
      severity,
      scheduleName,
      agentIds: agentIds,
      byCategory: snapshot.byCategory as any,
      topDriftItems: (snapshot.topDriftItems as any) || [],
      notificationSent: notified,
    });

    const anomalyId = Number(anomalyInsertResult[0].insertId);

    // Record notification history
    await recordNotification({
      notificationType: "anomaly",
      scheduleId: snapshot.scheduleId,
      snapshotId: snapshot.id,
      anomalyId,
      userId: snapshot.userId,
      severity,
      title,
      content,
      deliveryStatus: suppression.suppressed ? "suppressed" : (notified ? "sent" : "failed"),
      errorMessage,
      scheduleName,
      driftPercent: snapshot.driftPercent,
      agentIds,
    });

    console.log(
      `[AnomalyDetection] Anomaly #${anomalyId} recorded for schedule "${scheduleName}": ` +
        `${snapshot.driftPercent}% drift (z=${result.zScore}, severity=${severity})` +
        (suppression.suppressed ? " [SUPPRESSED]" : "")
    );

    return { checked: true, isAnomaly: true, anomalyId, notified, result };
  } catch (err) {
    console.error(
      `[AnomalyDetection] Failed to record anomaly: ${(err as Error).message}`
    );
    return { checked: true, isAnomaly: true, notified, result };
  }
}
