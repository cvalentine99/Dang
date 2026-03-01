/**
 * Drift Report Export Router — CSV and PDF export endpoints for drift analytics.
 *
 * Provides:
 * - exportDriftTrend: CSV export of drift trend data
 * - exportAnomalyHistory: CSV export of anomaly history
 * - exportAgentVolatility: CSV export of agent volatility rankings
 * - exportFullReport: Combined JSON report (can be rendered as PDF client-side)
 *
 * All exports are server-side generated and returned as downloadable content.
 */

import { z } from "zod";
import { eq, desc, and, gte } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  driftSnapshots,
  driftAnomalies,
  driftNotificationHistory,
  baselineSchedules,
} from "../../drizzle/schema";

// ─── CSV Helpers ────────────────────────────────────────────────────────────

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(fields: unknown[]): string {
  return fields.map(escapeCsvField).join(",");
}

function formatTimestamp(ts: Date | number): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toISOString();
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const exportRouter = router({
  /**
   * Export drift trend data as CSV.
   */
  driftTrend: protectedProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).default(30),
        scheduleId: z.number().int().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { csv: "", filename: "drift-trend.csv" };

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const conditions = [
        eq(driftSnapshots.userId, ctx.user.id),
        gte(driftSnapshots.createdAt, since),
      ];
      if (input.scheduleId !== undefined) {
        conditions.push(eq(driftSnapshots.scheduleId, input.scheduleId));
      }

      const snapshots = await db
        .select()
        .from(driftSnapshots)
        .where(and(...conditions))
        .orderBy(desc(driftSnapshots.createdAt));

      // Resolve schedule names
      const scheduleIds = Array.from(new Set(snapshots.map((s) => s.scheduleId)));
      const schedules = scheduleIds.length > 0
        ? await db
            .select({ id: baselineSchedules.id, name: baselineSchedules.name })
            .from(baselineSchedules)
            .where(eq(baselineSchedules.userId, ctx.user.id))
        : [];
      const scheduleMap = new Map(schedules.map((s) => [s.id, s.name]));

      const header = [
        "Timestamp", "Schedule ID", "Schedule Name", "Drift %", "Drift Count",
        "Total Items", "Packages Added", "Packages Removed", "Packages Changed",
        "Services Added", "Services Removed", "Services Changed",
        "Users Added", "Users Removed", "Users Changed",
        "Agent IDs", "Notification Sent",
      ];

      const rows = snapshots.map((s) => {
        const byCat = s.byCategory as {
          packages: { added: number; removed: number; changed: number };
          services: { added: number; removed: number; changed: number };
          users: { added: number; removed: number; changed: number };
        } | null;
        const agents = (s.agentIds as string[]) || [];

        return toCsvRow([
          formatTimestamp(s.createdAt),
          s.scheduleId,
          scheduleMap.get(s.scheduleId) ?? "Unknown",
          s.driftPercent,
          s.driftCount,
          s.totalItems,
          byCat?.packages.added ?? 0,
          byCat?.packages.removed ?? 0,
          byCat?.packages.changed ?? 0,
          byCat?.services.added ?? 0,
          byCat?.services.removed ?? 0,
          byCat?.services.changed ?? 0,
          byCat?.users.added ?? 0,
          byCat?.users.removed ?? 0,
          byCat?.users.changed ?? 0,
          agents.join("; "),
          s.notificationSent ? "Yes" : "No",
        ]);
      });

      const csv = [toCsvRow(header), ...rows].join("\n");
      const filename = `drift-trend-${input.days}d-${new Date().toISOString().slice(0, 10)}.csv`;

      return { csv, filename, rowCount: snapshots.length };
    }),

  /**
   * Export anomaly history as CSV.
   */
  anomalyHistory: protectedProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).default(30),
        scheduleId: z.number().int().optional(),
        severity: z.enum(["critical", "high", "medium"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { csv: "", filename: "anomaly-history.csv" };

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const conditions = [
        eq(driftAnomalies.userId, ctx.user.id),
        gte(driftAnomalies.createdAt, since),
      ];
      if (input.scheduleId !== undefined) {
        conditions.push(eq(driftAnomalies.scheduleId, input.scheduleId));
      }
      if (input.severity !== undefined) {
        conditions.push(eq(driftAnomalies.severity, input.severity));
      }

      const anomalies = await db
        .select()
        .from(driftAnomalies)
        .where(and(...conditions))
        .orderBy(desc(driftAnomalies.createdAt));

      const header = [
        "Timestamp", "Schedule Name", "Schedule ID", "Severity",
        "Drift %", "Z-Score", "Rolling Avg", "Rolling StdDev",
        "Sigma Threshold", "Acknowledged", "Acknowledge Note",
        "Notification Sent", "Agent IDs",
      ];

      const rows = anomalies.map((a) => {
        const agents = (a.agentIds as string[]) || [];
        return toCsvRow([
          formatTimestamp(a.createdAt),
          a.scheduleName,
          a.scheduleId,
          a.severity,
          a.driftPercent,
          a.zScore,
          a.rollingAvg,
          a.rollingStdDev,
          a.sigmaThreshold,
          a.acknowledged ? "Yes" : "No",
          a.acknowledgeNote ?? "",
          a.notificationSent ? "Yes" : "No",
          agents.join("; "),
        ]);
      });

      const csv = [toCsvRow(header), ...rows].join("\n");
      const filename = `anomaly-history-${input.days}d-${new Date().toISOString().slice(0, 10)}.csv`;

      return { csv, filename, rowCount: anomalies.length };
    }),

  /**
   * Export agent volatility rankings as CSV.
   */
  agentVolatility: protectedProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { csv: "", filename: "agent-volatility.csv" };

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const snapshots = await db
        .select({
          byAgent: driftSnapshots.byAgent,
          driftPercent: driftSnapshots.driftPercent,
          createdAt: driftSnapshots.createdAt,
        })
        .from(driftSnapshots)
        .where(
          and(
            eq(driftSnapshots.userId, ctx.user.id),
            gte(driftSnapshots.createdAt, since)
          )
        );

      // Aggregate per-agent stats
      const agentStats: Record<string, {
        driftEvents: number;
        totalDrift: number;
        maxDrift: number;
        snapshots: number;
      }> = {};

      for (const snap of snapshots) {
        const byAgent = snap.byAgent as Record<string, { driftCount: number; totalItems: number }> | null;
        if (!byAgent) continue;

        for (const [agentId, data] of Object.entries(byAgent)) {
          if (!agentStats[agentId]) {
            agentStats[agentId] = { driftEvents: 0, totalDrift: 0, maxDrift: 0, snapshots: 0 };
          }
          agentStats[agentId].snapshots++;
          if (data.driftCount > 0) {
            agentStats[agentId].driftEvents++;
            const agentDrift = data.totalItems > 0 ? (data.driftCount / data.totalItems) * 100 : 0;
            agentStats[agentId].totalDrift += agentDrift;
            agentStats[agentId].maxDrift = Math.max(agentStats[agentId].maxDrift, agentDrift);
          }
        }
      }

      // Sort by volatility score (drift events * avg drift)
      const ranked = Object.entries(agentStats)
        .map(([agentId, stats]) => ({
          agentId,
          driftEvents: stats.driftEvents,
          avgDrift: stats.driftEvents > 0 ? Math.round((stats.totalDrift / stats.driftEvents) * 100) / 100 : 0,
          maxDrift: Math.round(stats.maxDrift * 100) / 100,
          snapshots: stats.snapshots,
          volatilityScore: Math.round(stats.driftEvents * (stats.totalDrift / Math.max(stats.driftEvents, 1)) * 100) / 100,
        }))
        .sort((a, b) => b.volatilityScore - a.volatilityScore);

      const header = [
        "Rank", "Agent ID", "Volatility Score", "Drift Events",
        "Avg Drift %", "Max Drift %", "Total Snapshots",
      ];

      const rows = ranked.map((r, i) =>
        toCsvRow([i + 1, r.agentId, r.volatilityScore, r.driftEvents, r.avgDrift, r.maxDrift, r.snapshots])
      );

      const csv = [toCsvRow(header), ...rows].join("\n");
      const filename = `agent-volatility-${input.days}d-${new Date().toISOString().slice(0, 10)}.csv`;

      return { csv, filename, rowCount: ranked.length };
    }),

  /**
   * Export notification history as CSV.
   */
  notificationHistory: protectedProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { csv: "", filename: "notification-history.csv" };

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const notifications = await db
        .select()
        .from(driftNotificationHistory)
        .where(
          and(
            eq(driftNotificationHistory.userId, ctx.user.id),
            gte(driftNotificationHistory.createdAt, since)
          )
        )
        .orderBy(desc(driftNotificationHistory.createdAt));

      const header = [
        "Timestamp", "Type", "Schedule Name", "Severity",
        "Delivery Status", "Drift %", "Title",
        "Retry Count", "Error Message", "Agent IDs",
      ];

      const rows = notifications.map((n) => {
        const agents = (n.agentIds as string[]) || [];
        return toCsvRow([
          formatTimestamp(n.createdAt),
          n.notificationType,
          n.scheduleName,
          n.severity,
          n.deliveryStatus,
          n.driftPercent ?? "",
          n.title,
          n.retryCount,
          n.errorMessage ?? "",
          agents.join("; "),
        ]);
      });

      const csv = [toCsvRow(header), ...rows].join("\n");
      const filename = `notification-history-${input.days}d-${new Date().toISOString().slice(0, 10)}.csv`;

      return { csv, filename, rowCount: notifications.length };
    }),

  /**
   * Export full drift report as structured JSON (for client-side PDF rendering).
   */
  fullReport: protectedProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).default(30),
        scheduleId: z.number().int().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        return {
          generatedAt: new Date().toISOString(),
          period: `${input.days} days`,
          summary: { snapshots: 0, anomalies: 0, notifications: 0, schedules: 0 },
          driftTrend: [],
          anomalies: [],
          agentVolatility: [],
          notifications: [],
        };
      }

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const baseConditions = [
        eq(driftSnapshots.userId, ctx.user.id),
        gte(driftSnapshots.createdAt, since),
      ];
      if (input.scheduleId !== undefined) {
        baseConditions.push(eq(driftSnapshots.scheduleId, input.scheduleId));
      }

      const [snapshots, anomalies, notifications, schedules] = await Promise.all([
        db.select().from(driftSnapshots)
          .where(and(...baseConditions))
          .orderBy(desc(driftSnapshots.createdAt))
          .limit(500),
        db.select().from(driftAnomalies)
          .where(and(
            eq(driftAnomalies.userId, ctx.user.id),
            gte(driftAnomalies.createdAt, since),
            ...(input.scheduleId !== undefined ? [eq(driftAnomalies.scheduleId, input.scheduleId)] : [])
          ))
          .orderBy(desc(driftAnomalies.createdAt))
          .limit(200),
        db.select().from(driftNotificationHistory)
          .where(and(
            eq(driftNotificationHistory.userId, ctx.user.id),
            gte(driftNotificationHistory.createdAt, since),
          ))
          .orderBy(desc(driftNotificationHistory.createdAt))
          .limit(200),
        db.select({ id: baselineSchedules.id, name: baselineSchedules.name })
          .from(baselineSchedules)
          .where(eq(baselineSchedules.userId, ctx.user.id)),
      ]);

      return {
        generatedAt: new Date().toISOString(),
        period: `${input.days} days`,
        summary: {
          snapshots: snapshots.length,
          anomalies: anomalies.length,
          notifications: notifications.length,
          schedules: schedules.length,
        },
        driftTrend: snapshots.map((s) => ({
          timestamp: s.createdAt.getTime(),
          scheduleId: s.scheduleId,
          driftPercent: s.driftPercent,
          driftCount: s.driftCount,
          totalItems: s.totalItems,
          byCategory: s.byCategory,
        })),
        anomalies: anomalies.map((a) => ({
          timestamp: a.createdAt.getTime(),
          scheduleName: a.scheduleName,
          severity: a.severity,
          driftPercent: a.driftPercent,
          zScore: a.zScore,
          rollingAvg: a.rollingAvg,
          rollingStdDev: a.rollingStdDev,
          acknowledged: a.acknowledged,
        })),
        agentVolatility: [], // Computed client-side from snapshots
        notifications: notifications.map((n) => ({
          timestamp: n.createdAt.getTime(),
          type: n.notificationType,
          severity: n.severity,
          status: n.deliveryStatus,
          scheduleName: n.scheduleName,
          driftPercent: n.driftPercent,
        })),
      };
    }),
});
