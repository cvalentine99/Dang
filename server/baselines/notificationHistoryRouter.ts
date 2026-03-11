/**
 * Notification History Router — Endpoints for querying and managing notification history.
 *
 * Provides:
 * - list: Paginated list of notifications with filtering
 * - stats: Summary statistics (total, sent, failed, retry success rate)
 * - retry: Manually retry a failed notification
 */

import { requireDb } from "../dbGuard";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { driftNotificationHistory } from "../../drizzle/schema";
import { retryNotification } from "./notificationHistory";

export const notificationHistoryRouter = router({
  /**
   * Get notification statistics for the current user.
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
          sent: 0,
          failed: 0,
          retrying: 0,
          suppressed: 0,
          retrySuccessRate: 0,
          byType: { drift_threshold: 0, anomaly: 0 },
        };
      }

      const days = input?.days ?? 30;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const notifications = await db
        .select({
          deliveryStatus: driftNotificationHistory.deliveryStatus,
          notificationType: driftNotificationHistory.notificationType,
          retryCount: driftNotificationHistory.retryCount,
        })
        .from(driftNotificationHistory)
        .where(
          and(
            eq(driftNotificationHistory.userId, ctx.user.id),
            gte(driftNotificationHistory.createdAt, since)
          )
        );

      const total = notifications.length;
      const sent = notifications.filter((n) => n.deliveryStatus === "sent").length;
      const failed = notifications.filter((n) => n.deliveryStatus === "failed").length;
      const retrying = notifications.filter((n) => n.deliveryStatus === "retrying").length;
      const suppressed = notifications.filter((n) => n.deliveryStatus === "suppressed").length;

      // Retry success rate: sent notifications that had retries / total that needed retries
      const retriedAndSucceeded = notifications.filter(
        (n) => n.deliveryStatus === "sent" && n.retryCount > 0
      ).length;
      const totalRetried = notifications.filter((n) => n.retryCount > 0).length;
      const retrySuccessRate = totalRetried > 0 ? Math.round((retriedAndSucceeded / totalRetried) * 100) : 0;

      const byType = {
        drift_threshold: notifications.filter((n) => n.notificationType === "drift_threshold").length,
        anomaly: notifications.filter((n) => n.notificationType === "anomaly").length,
      };

      return { total, sent, failed, retrying, suppressed, retrySuccessRate, byType };
    }),

  /**
   * List notifications with filtering and pagination.
   */
  list: protectedProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(365).default(30),
        scheduleId: z.number().int().optional(),
        notificationType: z.enum(["drift_threshold", "anomaly"]).optional(),
        deliveryStatus: z.enum(["sent", "failed", "retrying", "suppressed"]).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const conditions = [
        eq(driftNotificationHistory.userId, ctx.user.id),
        gte(driftNotificationHistory.createdAt, since),
      ];

      if (input.scheduleId !== undefined) {
        conditions.push(eq(driftNotificationHistory.scheduleId, input.scheduleId));
      }
      if (input.notificationType !== undefined) {
        conditions.push(eq(driftNotificationHistory.notificationType, input.notificationType));
      }
      if (input.deliveryStatus !== undefined) {
        conditions.push(eq(driftNotificationHistory.deliveryStatus, input.deliveryStatus));
      }

      const [notifications, countResult] = await Promise.all([
        db
          .select()
          .from(driftNotificationHistory)
          .where(and(...conditions))
          .orderBy(desc(driftNotificationHistory.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db
          .select({ count: sql<number>`count(*)` })
          .from(driftNotificationHistory)
          .where(and(...conditions)),
      ]);

      return {
        notifications: notifications.map((n) => ({
          ...n,
          timestamp: n.createdAt.getTime(),
          nextRetryAtTs: n.nextRetryAt?.getTime() ?? null,
          lastRetryAtTs: n.lastRetryAt?.getTime() ?? null,
        })),
        total: Number(countResult[0]?.count ?? 0),
      };
    }),

  /**
   * Manually retry a failed notification.
   */
  retry: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify ownership
      const [record] = await db
        .select({ id: driftNotificationHistory.id, userId: driftNotificationHistory.userId })
        .from(driftNotificationHistory)
        .where(eq(driftNotificationHistory.id, input.id))
        .limit(1);

      if (!record || record.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Notification not found" });
      }

      const result = await retryNotification(input.id);
      return result;
    }),
});
