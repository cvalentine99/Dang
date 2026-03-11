/**
 * Drift Anomaly Router — Endpoints for querying and managing drift anomalies.
 *
 * Provides:
 * - list: Paginated list of anomalies with filtering
 * - stats: Summary statistics (unacknowledged count, severity breakdown)
 * - acknowledge: Mark an anomaly as acknowledged with optional note
 * - detail: Get full anomaly details
 */

import { requireDb } from "../dbGuard";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { driftAnomalies } from "../../drizzle/schema";

export const anomalyRouter = router({
  /**
   * Get anomaly statistics for the current user.
   * Used by the SOC Console to show the anomaly alert badge.
   */
  stats: protectedProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).default(30),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        return {
          total: 0,
          unacknowledged: 0,
          critical: 0,
          high: 0,
          medium: 0,
          recentCount: 0,
        };
      }

      const days = input?.days ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const anomalies = await db
        .select({
          severity: driftAnomalies.severity,
          acknowledged: driftAnomalies.acknowledged,
        })
        .from(driftAnomalies)
        .where(
          and(
            eq(driftAnomalies.userId, ctx.user.id),
            gte(driftAnomalies.createdAt, since)
          )
        );

      const total = anomalies.length;
      const unacknowledged = anomalies.filter((a) => !a.acknowledged).length;
      const critical = anomalies.filter((a) => a.severity === "critical").length;
      const high = anomalies.filter((a) => a.severity === "high").length;
      const medium = anomalies.filter((a) => a.severity === "medium").length;

      // Recent = last 24h unacknowledged
      const recent24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentAnomalies = await db
        .select({ id: driftAnomalies.id })
        .from(driftAnomalies)
        .where(
          and(
            eq(driftAnomalies.userId, ctx.user.id),
            eq(driftAnomalies.acknowledged, false),
            gte(driftAnomalies.createdAt, recent24h)
          )
        );

      return {
        total,
        unacknowledged,
        critical,
        high,
        medium,
        recentCount: recentAnomalies.length,
      };
    }),

  /**
   * List anomalies with filtering and pagination.
   */
  list: protectedProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).default(30),
        scheduleId: z.number().int().optional(),
        severity: z.enum(["critical", "high", "medium"]).optional(),
        acknowledged: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

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
      if (input.acknowledged !== undefined) {
        conditions.push(eq(driftAnomalies.acknowledged, input.acknowledged));
      }

      const [anomalies, countResult] = await Promise.all([
        db
          .select()
          .from(driftAnomalies)
          .where(and(...conditions))
          .orderBy(desc(driftAnomalies.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db
          .select({ count: sql<number>`count(*)` })
          .from(driftAnomalies)
          .where(and(...conditions)),
      ]);

      return {
        anomalies: anomalies.map((a) => ({
          ...a,
          timestamp: a.createdAt.getTime(),
          acknowledgedAtTs: a.acknowledgedAt?.getTime() ?? null,
        })),
        total: Number(countResult[0]?.count ?? 0),
      };
    }),

  /**
   * Get a single anomaly with full details.
   */
  detail: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const results = await db
        .select()
        .from(driftAnomalies)
        .where(
          and(
            eq(driftAnomalies.id, input.id),
            eq(driftAnomalies.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (!results.length) throw new TRPCError({ code: "NOT_FOUND", message: "Anomaly not found" });

      const a = results[0];
      return {
        anomaly: {
          ...a,
          timestamp: a.createdAt.getTime(),
          acknowledgedAtTs: a.acknowledgedAt?.getTime() ?? null,
        },
      };
    }),

  /**
   * Acknowledge an anomaly (mark as reviewed by analyst).
   */
  acknowledge: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        note: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify ownership
      const existing = await db
        .select({ id: driftAnomalies.id, userId: driftAnomalies.userId })
        .from(driftAnomalies)
        .where(eq(driftAnomalies.id, input.id))
        .limit(1);

      if (!existing.length || existing[0].userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Anomaly not found" });
      }

      await db
        .update(driftAnomalies)
        .set({
          acknowledged: true,
          acknowledgeNote: input.note ?? null,
          acknowledgedAt: new Date(),
        })
        .where(eq(driftAnomalies.id, input.id));

      return { success: true };
    }),

  /**
   * Bulk acknowledge all unacknowledged anomalies for the user.
   */
  acknowledgeAll: protectedProcedure
    .input(
      z.object({
        scheduleId: z.number().int().optional(),
      }).optional()
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const conditions = [
        eq(driftAnomalies.userId, ctx.user.id),
        eq(driftAnomalies.acknowledged, false),
      ];

      if (input?.scheduleId !== undefined) {
        conditions.push(eq(driftAnomalies.scheduleId, input.scheduleId));
      }

      await db
        .update(driftAnomalies)
        .set({
          acknowledged: true,
          acknowledgedAt: new Date(),
        })
        .where(and(...conditions));

      return { success: true };
    }),
});
