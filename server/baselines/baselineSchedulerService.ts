/**
 * Baseline Scheduler Service — Executes due baseline schedules.
 *
 * Runs on a configurable interval (default: every 5 minutes) and checks
 * for schedules whose nextRunAt has passed. For each due schedule, it:
 * 1. Fetches syscollector data from Wazuh for each agent
 * 2. Creates a config_baselines row with the snapshot
 * 3. Updates the schedule's lastRunAt, nextRunAt, and counters
 * 4. Prunes old baselines beyond the retention limit
 *
 * Fail-closed: if a capture fails, the schedule is marked with lastError
 * and skipped until the next interval. Other schedules are not affected.
 */

import { eq, desc, and, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  baselineSchedules,
  configBaselines,
  driftSnapshots,
  type BaselineSchedule,
  type BaselineFrequency,
} from "../../drizzle/schema";
import { computeNextRunAt } from "./scheduleUtils";
import { wazuhGet, getEffectiveWazuhConfig } from "../wazuh/wazuhClient";
import { checkDriftAndNotify, compareBaselines } from "./driftDetection";
import { detectAndRecordAnomaly } from "./anomalyDetection";

/** Check interval in milliseconds (5 minutes) */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

/**
 * Execute a single scheduled baseline capture.
 * Called by the scheduler loop or by the triggerNow endpoint.
 */
export async function executeScheduledCapture(
  schedule: BaselineSchedule
): Promise<{ success: boolean; baselineId?: number; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const config = await getEffectiveWazuhConfig();
  if (!config) {
    return { success: false, error: "Wazuh not configured" };
  }

  try {
    // Fetch syscollector data for each agent
    const snapshotData: Record<string, unknown> = {
      packages: {} as Record<string, unknown>,
      services: {} as Record<string, unknown>,
      users: {} as Record<string, unknown>,
    };

    for (const agentId of schedule.agentIds) {
      try {
        const [pkgData, svcData, usrData] = await Promise.all([
          wazuhGet(config, {
            path: `/syscollector/${agentId}/packages`,
            params: { limit: 500 },
            rateLimitGroup: "syscollector",
          }),
          wazuhGet(config, {
            path: `/syscollector/${agentId}/services`,
            params: { limit: 500 },
            rateLimitGroup: "syscollector",
          }),
          wazuhGet(config, {
            path: `/syscollector/${agentId}/users`,
            params: { limit: 500 },
            rateLimitGroup: "syscollector",
          }),
        ]);

        // Extract items from Wazuh response shape { data: { affected_items: [...] } }
        const extractItems = (resp: unknown): unknown[] => {
          if (resp && typeof resp === "object") {
            const r = resp as Record<string, unknown>;
            if (r.data && typeof r.data === "object") {
              const d = r.data as Record<string, unknown>;
              if (Array.isArray(d.affected_items)) return d.affected_items;
            }
          }
          return [];
        };

        (snapshotData.packages as Record<string, unknown>)[agentId] = extractItems(pkgData);
        (snapshotData.services as Record<string, unknown>)[agentId] = extractItems(svcData);
        (snapshotData.users as Record<string, unknown>)[agentId] = extractItems(usrData);
      } catch (agentErr) {
        // Log per-agent failure but continue with other agents
        console.warn(
          `[BaselineScheduler] Failed to capture agent ${agentId} for schedule ${schedule.id}: ${(agentErr as Error).message}`
        );
        (snapshotData.packages as Record<string, unknown>)[agentId] = [];
        (snapshotData.services as Record<string, unknown>)[agentId] = [];
        (snapshotData.users as Record<string, unknown>)[agentId] = [];
      }
    }

    // Create the baseline row
    const now = new Date();
    const baselineName = `[Auto] ${schedule.name} — ${now.toISOString().slice(0, 16).replace("T", " ")}`;

    const result = await db.insert(configBaselines).values({
      userId: schedule.userId,
      scheduleId: schedule.id,
      name: baselineName,
      description: `Auto-captured by schedule "${schedule.name}" (${schedule.frequency})`,
      agentIds: schedule.agentIds,
      snapshotData,
    });

    const baselineId = Number(result[0].insertId);

    // Update schedule metadata
    const nextRunAt = computeNextRunAt(schedule.frequency as BaselineFrequency);
    await db
      .update(baselineSchedules)
      .set({
        lastRunAt: now,
        nextRunAt,
        lastError: null,
        successCount: sql`${baselineSchedules.successCount} + 1`,
      })
      .where(eq(baselineSchedules.id, schedule.id));

    // ── Drift detection, snapshot persistence & notification ────────────
    // Always compare against previous baseline when one exists, to build
    // the drift_snapshots history for the analytics dashboard.
    try {
      const recentBaselines = await db
        .select()
        .from(configBaselines)
        .where(eq(configBaselines.scheduleId, schedule.id))
        .orderBy(desc(configBaselines.createdAt))
        .limit(2); // newest is the one we just inserted, second is the previous

      // We need at least 2 baselines (current + previous) to compare
      if (recentBaselines.length >= 2) {
        const currentBaseline = recentBaselines[0];
        const previousBaseline = recentBaselines[1];
        const driftResult = compareBaselines(
          previousBaseline.snapshotData as Record<string, unknown>,
          snapshotData
        );

        // Compute per-agent drift breakdown for analytics
        const byAgent: Record<string, { driftCount: number; totalItems: number }> = {};
        for (const item of driftResult.driftItems) {
          if (!byAgent[item.agentId]) {
            byAgent[item.agentId] = { driftCount: 0, totalItems: 0 };
          }
          byAgent[item.agentId].driftCount++;
        }
        // Count total items per agent from the current snapshot
        for (const agentId of schedule.agentIds) {
          if (!byAgent[agentId]) {
            byAgent[agentId] = { driftCount: 0, totalItems: 0 };
          }
          const pkgs = (snapshotData.packages as Record<string, unknown[]>)?.[agentId];
          const svcs = (snapshotData.services as Record<string, unknown[]>)?.[agentId];
          const usrs = (snapshotData.users as Record<string, unknown[]>)?.[agentId];
          byAgent[agentId].totalItems =
            (Array.isArray(pkgs) ? pkgs.length : 0) +
            (Array.isArray(svcs) ? svcs.length : 0) +
            (Array.isArray(usrs) ? usrs.length : 0);
        }

        // Check notification threshold
        let notificationSent = false;
        if (schedule.notifyOnDrift && schedule.driftThreshold > 0) {
          const { notified } = await checkDriftAndNotify(
            schedule,
            previousBaseline,
            snapshotData
          );
          notificationSent = notified;
          if (notified) {
            console.log(
              `[BaselineScheduler] Drift alert sent for "${schedule.name}": ${driftResult.driftPercent}% drift (threshold: ${schedule.driftThreshold}%)`
            );
          }
        }

        // Persist drift snapshot for analytics
        await db.insert(driftSnapshots).values({
          scheduleId: schedule.id,
          userId: schedule.userId,
          baselineId: currentBaseline.id,
          previousBaselineId: previousBaseline.id,
          driftPercent: driftResult.driftPercent,
          driftCount: driftResult.driftCount,
          totalItems: driftResult.totalItems,
          byCategory: driftResult.byCategory,
          byAgent,
          agentIds: schedule.agentIds,
          notificationSent,
          topDriftItems: driftResult.driftItems.slice(0, 20).map((item) => ({
            category: item.category,
            agentId: item.agentId,
            name: item.name,
            changeType: item.changeType,
            previousValue: item.previousValue,
            currentValue: item.currentValue,
          })),
        });

        console.log(
          `[BaselineScheduler] Drift snapshot saved for "${schedule.name}": ${driftResult.driftPercent}% (${driftResult.driftCount}/${driftResult.totalItems})`
        );

        // ── Anomaly detection ─────────────────────────────────────────
        // Run statistical anomaly detection on the newly persisted snapshot.
        // Requires the snapshot to have an ID, so we fetch it back.
        try {
          const [savedSnapshot] = await db
            .select()
            .from(driftSnapshots)
            .where(
              and(
                eq(driftSnapshots.scheduleId, schedule.id),
                eq(driftSnapshots.userId, schedule.userId)
              )
            )
            .orderBy(desc(driftSnapshots.createdAt))
            .limit(1);

          if (savedSnapshot) {
            const anomalyResult = await detectAndRecordAnomaly(
              savedSnapshot,
              schedule.name
            );
            if (anomalyResult.isAnomaly) {
              console.log(
                `[BaselineScheduler] ⚠️ Anomaly detected for "${schedule.name}": ` +
                  `z-score=${anomalyResult.result?.zScore}, severity=${anomalyResult.result?.severity}`
              );
            }
          }
        } catch (anomalyErr) {
          // Anomaly detection is best-effort — never block the capture
          console.warn(
            `[BaselineScheduler] Anomaly detection failed for schedule ${schedule.id}: ${(anomalyErr as Error).message}`
          );
        }
      }
    } catch (driftErr) {
      // Drift detection is best-effort — never block the capture
      console.warn(
        `[BaselineScheduler] Drift detection failed for schedule ${schedule.id}: ${(driftErr as Error).message}`
      );
    }

    // Prune old baselines beyond retention limit
    await pruneOldBaselines(db, schedule.id, schedule.retentionCount);

    return { success: true, baselineId };
  } catch (err) {
    const errorMsg = (err as Error).message;

    // Mark schedule with error
    try {
      await db
        .update(baselineSchedules)
        .set({
          lastError: errorMsg,
          failureCount: sql`${baselineSchedules.failureCount} + 1`,
          // Still advance nextRunAt so we don't hammer on failure
          nextRunAt: computeNextRunAt(schedule.frequency as BaselineFrequency),
        })
        .where(eq(baselineSchedules.id, schedule.id));
    } catch {
      // Best-effort error recording
    }

    return { success: false, error: errorMsg };
  }
}

/**
 * Prune baselines beyond the retention limit for a schedule.
 * Keeps the most recent `retentionCount` baselines, deletes the rest.
 */
async function pruneOldBaselines(
  db: Awaited<ReturnType<typeof getDb>>,
  scheduleId: number,
  retentionCount: number
): Promise<void> {
  if (!db) return;

  // Get all baselines for this schedule, ordered newest first
  const allBaselines = await db
    .select({ id: configBaselines.id })
    .from(configBaselines)
    .where(eq(configBaselines.scheduleId, scheduleId))
    .orderBy(desc(configBaselines.createdAt));

  // If within retention limit, nothing to prune
  if (allBaselines.length <= retentionCount) return;

  // Delete the oldest ones beyond the retention limit
  const toDelete = allBaselines.slice(retentionCount);
  for (const baseline of toDelete) {
    await db
      .delete(configBaselines)
      .where(eq(configBaselines.id, baseline.id));
  }

  console.log(
    `[BaselineScheduler] Pruned ${toDelete.length} old baselines for schedule ${scheduleId} (retention: ${retentionCount})`
  );
}

/**
 * Main scheduler tick — finds and executes all due schedules.
 */
async function schedulerTick(): Promise<void> {
  if (isRunning) {
    console.log("[BaselineScheduler] Previous tick still running, skipping");
    return;
  }

  isRunning = true;

  try {
    const db = await getDb();
    if (!db) return;

    const now = new Date();

    // Find all enabled schedules whose nextRunAt has passed
    const dueSchedules = await db
      .select()
      .from(baselineSchedules)
      .where(
        and(
          eq(baselineSchedules.enabled, true),
          lte(baselineSchedules.nextRunAt, now)
        )
      )
      .limit(10); // Process at most 10 per tick to avoid overloading

    if (dueSchedules.length === 0) return;

    console.log(
      `[BaselineScheduler] Found ${dueSchedules.length} due schedule(s), executing...`
    );

    // Execute each due schedule sequentially to respect rate limits
    for (const schedule of dueSchedules) {
      const result = await executeScheduledCapture(schedule);
      if (result.success) {
        console.log(
          `[BaselineScheduler] Schedule "${schedule.name}" (${schedule.id}) captured baseline #${result.baselineId}`
        );
      } else {
        console.warn(
          `[BaselineScheduler] Schedule "${schedule.name}" (${schedule.id}) failed: ${result.error}`
        );
      }
    }
  } catch (err) {
    console.error(
      `[BaselineScheduler] Tick error: ${(err as Error).message}`
    );
  } finally {
    isRunning = false;
  }
}

/**
 * Start the baseline scheduler.
 * Called once at server startup.
 */
export function startBaselineScheduler(): void {
  if (schedulerTimer) {
    console.warn("[BaselineScheduler] Already running, skipping start");
    return;
  }

  console.log(
    `[BaselineScheduler] Starting with ${CHECK_INTERVAL_MS / 1000}s check interval`
  );

  // Run first tick after a short delay (30s) to let the server stabilize
  setTimeout(() => {
    schedulerTick();
  }, 30_000);

  // Then run on interval
  schedulerTimer = setInterval(schedulerTick, CHECK_INTERVAL_MS);
}

/**
 * Stop the baseline scheduler.
 * Called on server shutdown.
 */
export function stopBaselineScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log("[BaselineScheduler] Stopped");
  }
}
