/**
 * Drift Analytics Router — Read-only analytics endpoints for the Drift Analytics dashboard.
 *
 * Provides aggregated drift trend data, per-agent volatility metrics,
 * category breakdowns, and historical drift snapshots.
 *
 * All data is derived from the drift_snapshots table, which is populated
 * by the BaselineScheduler after each baseline capture.
 */

import { requireDb } from "../dbGuard";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  driftSnapshots,
  baselineSchedules,
  type DriftSnapshot,
} from "../../drizzle/schema";

export const driftAnalyticsRouter = router({
  /**
   * Get drift trend data over time for one or all schedules.
   * Returns time-series data points: { timestamp, driftPercent, driftCount, totalItems, scheduleId, scheduleName }
   */
  trend: protectedProcedure
    .input(
      z.object({
        scheduleId: z.number().int().optional(),
        days: z.number().int().min(1).max(365).default(30),
        limit: z.number().int().min(1).max(500).default(200),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const conditions = [
        eq(driftSnapshots.userId, ctx.user.id),
        gte(driftSnapshots.createdAt, since),
      ];

      if (input.scheduleId) {
        conditions.push(eq(driftSnapshots.scheduleId, input.scheduleId));
      }

      const snapshots = await db
        .select({
          id: driftSnapshots.id,
          scheduleId: driftSnapshots.scheduleId,
          driftPercent: driftSnapshots.driftPercent,
          driftCount: driftSnapshots.driftCount,
          totalItems: driftSnapshots.totalItems,
          notificationSent: driftSnapshots.notificationSent,
          createdAt: driftSnapshots.createdAt,
        })
        .from(driftSnapshots)
        .where(and(...conditions))
        .orderBy(driftSnapshots.createdAt)
        .limit(input.limit);

      // Enrich with schedule names
      const scheduleIds = Array.from(new Set(snapshots.map((s) => s.scheduleId)));
      const scheduleMap: Record<number, string> = {};

      if (scheduleIds.length > 0) {
        const schedules = await db
          .select({ id: baselineSchedules.id, name: baselineSchedules.name })
          .from(baselineSchedules)
          .where(eq(baselineSchedules.userId, ctx.user.id));

        for (const s of schedules) {
          scheduleMap[s.id] = s.name;
        }
      }

      const points = snapshots.map((s) => ({
        id: s.id,
        scheduleId: s.scheduleId,
        scheduleName: scheduleMap[s.scheduleId] || `Schedule #${s.scheduleId}`,
        driftPercent: s.driftPercent,
        driftCount: s.driftCount,
        totalItems: s.totalItems,
        notificationSent: s.notificationSent,
        timestamp: s.createdAt.getTime(),
      }));

      return { points };
    }),

  /**
   * Get per-agent volatility metrics across all schedules.
   * Returns: { agentId, avgDrift, maxDrift, snapshotCount, totalDriftEvents }
   */
  agentVolatility: protectedProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).default(30),
        scheduleId: z.number().int().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const conditions = [
        eq(driftSnapshots.userId, ctx.user.id),
        gte(driftSnapshots.createdAt, since),
      ];

      if (input.scheduleId) {
        conditions.push(eq(driftSnapshots.scheduleId, input.scheduleId));
      }

      const snapshots = await db
        .select({
          byAgent: driftSnapshots.byAgent,
          agentIds: driftSnapshots.agentIds,
          driftPercent: driftSnapshots.driftPercent,
        })
        .from(driftSnapshots)
        .where(and(...conditions));

      // Aggregate per-agent metrics
      const agentStats: Record<
        string,
        { driftEvents: number; totalSnapshots: number; driftPercentSum: number; maxDrift: number }
      > = {};

      for (const snap of snapshots) {
        const byAgent = snap.byAgent as Record<string, { driftCount: number; totalItems: number }> | null;
        const agents = (snap.agentIds as string[]) || [];

        for (const agentId of agents) {
          if (!agentStats[agentId]) {
            agentStats[agentId] = { driftEvents: 0, totalSnapshots: 0, driftPercentSum: 0, maxDrift: 0 };
          }
          agentStats[agentId].totalSnapshots++;

          const agentData = byAgent?.[agentId];
          if (agentData && agentData.driftCount > 0) {
            agentStats[agentId].driftEvents++;
            const agentDriftPct =
              agentData.totalItems > 0
                ? (agentData.driftCount / agentData.totalItems) * 100
                : 0;
            agentStats[agentId].driftPercentSum += agentDriftPct;
            agentStats[agentId].maxDrift = Math.max(agentStats[agentId].maxDrift, agentDriftPct);
          }
        }
      }

      const agents = Object.entries(agentStats)
        .map(([agentId, stats]) => ({
          agentId,
          avgDrift: stats.driftEvents > 0 ? Math.round((stats.driftPercentSum / stats.driftEvents) * 100) / 100 : 0,
          maxDrift: Math.round(stats.maxDrift * 100) / 100,
          snapshotCount: stats.totalSnapshots,
          driftEvents: stats.driftEvents,
          volatilityScore: stats.totalSnapshots > 0
            ? Math.round((stats.driftEvents / stats.totalSnapshots) * 100)
            : 0,
        }))
        .sort((a, b) => b.volatilityScore - a.volatilityScore);

      return { agents };
    }),

  /**
   * Get category breakdown aggregated over time.
   * Returns: { packages: { added, removed, changed }, services: {...}, users: {...} }
   */
  categoryBreakdown: protectedProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).default(30),
        scheduleId: z.number().int().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db)
        return {
          totals: {
            packages: { added: 0, removed: 0, changed: 0 },
            services: { added: 0, removed: 0, changed: 0 },
            users: { added: 0, removed: 0, changed: 0 },
          },
          snapshotCount: 0,
        };

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const conditions = [
        eq(driftSnapshots.userId, ctx.user.id),
        gte(driftSnapshots.createdAt, since),
      ];

      if (input.scheduleId) {
        conditions.push(eq(driftSnapshots.scheduleId, input.scheduleId));
      }

      const snapshots = await db
        .select({ byCategory: driftSnapshots.byCategory })
        .from(driftSnapshots)
        .where(and(...conditions));

      const totals = {
        packages: { added: 0, removed: 0, changed: 0 },
        services: { added: 0, removed: 0, changed: 0 },
        users: { added: 0, removed: 0, changed: 0 },
      };

      for (const snap of snapshots) {
        const cat = snap.byCategory as typeof totals | null;
        if (!cat) continue;

        for (const key of ["packages", "services", "users"] as const) {
          if (cat[key]) {
            totals[key].added += cat[key].added || 0;
            totals[key].removed += cat[key].removed || 0;
            totals[key].changed += cat[key].changed || 0;
          }
        }
      }

      return { totals, snapshotCount: snapshots.length };
    }),

  /**
   * Get schedule-level summary statistics.
   * Returns per-schedule: { id, name, avgDrift, maxDrift, lastDrift, captureCount, lastCaptureAt }
   */
  scheduleSummary: protectedProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      // Get all schedules for this user
      const allSchedules = await db
        .select()
        .from(baselineSchedules)
        .where(eq(baselineSchedules.userId, ctx.user.id));

      // Get all drift snapshots in range
      const snapshots = await db
        .select()
        .from(driftSnapshots)
        .where(
          and(
            eq(driftSnapshots.userId, ctx.user.id),
            gte(driftSnapshots.createdAt, since)
          )
        )
        .orderBy(desc(driftSnapshots.createdAt));

      // Group snapshots by schedule
      const bySchedule: Record<number, DriftSnapshot[]> = {};
      for (const snap of snapshots) {
        if (!bySchedule[snap.scheduleId]) bySchedule[snap.scheduleId] = [];
        bySchedule[snap.scheduleId].push(snap);
      }

      const schedules = allSchedules.map((sched) => {
        const schSnaps = bySchedule[sched.id] || [];
        const driftValues = schSnaps.map((s) => s.driftPercent);
        const avgDrift =
          driftValues.length > 0
            ? Math.round((driftValues.reduce((a, b) => a + b, 0) / driftValues.length) * 100) / 100
            : 0;
        const maxDrift = driftValues.length > 0 ? Math.max(...driftValues) : 0;
        const lastSnap = schSnaps[0]; // already sorted desc

        return {
          id: sched.id,
          name: sched.name,
          frequency: sched.frequency,
          enabled: sched.enabled,
          agentIds: sched.agentIds,
          driftThreshold: sched.driftThreshold,
          notifyOnDrift: sched.notifyOnDrift,
          avgDrift,
          maxDrift: Math.round(maxDrift * 100) / 100,
          lastDrift: lastSnap?.driftPercent ?? null,
          captureCount: schSnaps.length,
          notificationCount: schSnaps.filter((s) => s.notificationSent).length,
          lastCaptureAt: lastSnap?.createdAt?.getTime() ?? null,
        };
      });

      return { schedules };
    }),

  /**
   * Get a single drift snapshot with full details (including top drift items).
   */
  detail: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const results = await db
        .select()
        .from(driftSnapshots)
        .where(
          and(
            eq(driftSnapshots.id, input.id),
            eq(driftSnapshots.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (!results.length) throw new TRPCError({ code: "NOT_FOUND", message: "Drift snapshot not found" });

      return { snapshot: results[0] };
    }),

  /**
   * Get recent drift events (latest snapshots with drift > 0).
   */
  recentEvents: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(50).default(20),
        scheduleId: z.number().int().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      const conditions = [eq(driftSnapshots.userId, ctx.user.id)];

      if (input.scheduleId) {
        conditions.push(eq(driftSnapshots.scheduleId, input.scheduleId));
      }

      const events = await db
        .select()
        .from(driftSnapshots)
        .where(and(...conditions))
        .orderBy(desc(driftSnapshots.createdAt))
        .limit(input.limit);

      // Enrich with schedule names
      const scheduleIds = Array.from(new Set(events.map((e) => e.scheduleId)));
      const scheduleMap: Record<number, string> = {};

      if (scheduleIds.length > 0) {
        const schedules = await db
          .select({ id: baselineSchedules.id, name: baselineSchedules.name })
          .from(baselineSchedules)
          .where(eq(baselineSchedules.userId, ctx.user.id));

        for (const s of schedules) {
          scheduleMap[s.id] = s.name;
        }
      }

      return {
        events: events.map((e) => ({
          ...e,
          scheduleName: scheduleMap[e.scheduleId] || `Schedule #${e.scheduleId}`,
          timestamp: e.createdAt.getTime(),
        })),
      };
    }),

  /**
   * Get agent heatmap data: agent × time buckets → drift intensity.
   * Returns a grid suitable for rendering a heatmap chart.
   */
  agentHeatmap: protectedProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(90).default(30),
        scheduleId: z.number().int().optional(),
        bucketHours: z.number().int().min(1).max(168).default(24), // default: 1 day buckets
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const conditions = [
        eq(driftSnapshots.userId, ctx.user.id),
        gte(driftSnapshots.createdAt, since),
      ];

      if (input.scheduleId) {
        conditions.push(eq(driftSnapshots.scheduleId, input.scheduleId));
      }

      const snapshots = await db
        .select({
          byAgent: driftSnapshots.byAgent,
          agentIds: driftSnapshots.agentIds,
          createdAt: driftSnapshots.createdAt,
        })
        .from(driftSnapshots)
        .where(and(...conditions))
        .orderBy(driftSnapshots.createdAt);

      // Build time buckets
      const bucketMs = input.bucketHours * 60 * 60 * 1000;
      const startMs = since.getTime();
      const endMs = Date.now();
      const buckets: number[] = [];
      for (let t = startMs; t <= endMs; t += bucketMs) {
        buckets.push(t);
      }

      // Collect all agent IDs
      const allAgents = new Set<string>();
      for (const snap of snapshots) {
        const agents = (snap.agentIds as string[]) || [];
        agents.forEach((a) => allAgents.add(a));
      }
      const agents = Array.from(allAgents).sort();

      // Build grid: agents × buckets → drift intensity (0-100)
      const grid: Array<{ agentId: string; bucket: number; driftPercent: number }> = [];

      for (const agentId of agents) {
        // Group snapshots into buckets for this agent
        const bucketValues: Record<number, number[]> = {};

        for (const snap of snapshots) {
          const snapTime = snap.createdAt.getTime();
          const bucketIdx = Math.floor((snapTime - startMs) / bucketMs);
          const bucketKey = buckets[bucketIdx] || buckets[buckets.length - 1];

          const byAgent = snap.byAgent as Record<string, { driftCount: number; totalItems: number }> | null;
          const agentData = byAgent?.[agentId];

          if (agentData) {
            const pct = agentData.totalItems > 0 ? (agentData.driftCount / agentData.totalItems) * 100 : 0;
            if (!bucketValues[bucketKey]) bucketValues[bucketKey] = [];
            bucketValues[bucketKey].push(pct);
          }
        }

        for (const bucket of buckets) {
          const values = bucketValues[bucket];
          const avg = values && values.length > 0
            ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
            : 0;
          grid.push({ agentId, bucket, driftPercent: avg });
        }
      }

      return { grid, agents, buckets };
    }),
});
