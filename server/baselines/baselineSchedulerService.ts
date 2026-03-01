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
  type BaselineSchedule,
  type BaselineFrequency,
} from "../../drizzle/schema";
import { computeNextRunAt } from "./scheduleUtils";
import { wazuhGet, getEffectiveWazuhConfig } from "../wazuh/wazuhClient";

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
