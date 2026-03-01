/**
 * Suppression Rules Router — CRUD endpoints for anomaly suppression rules.
 *
 * Provides:
 * - list: Active and expired rules for the current user
 * - create: Create a new suppression rule
 * - deactivate: Manually deactivate a rule before expiry
 * - delete: Permanently delete a rule
 */

import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { anomalySuppressionRules, baselineSchedules } from "../../drizzle/schema";

export const suppressionRouter = router({
  /**
   * List suppression rules for the current user.
   */
  list: protectedProcedure
    .input(
      z.object({
        activeOnly: z.boolean().default(false),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { rules: [] };

      const conditions = [eq(anomalySuppressionRules.userId, ctx.user.id)];
      if (input?.activeOnly) {
        conditions.push(eq(anomalySuppressionRules.active, true));
      }

      const rules = await db
        .select()
        .from(anomalySuppressionRules)
        .where(and(...conditions))
        .orderBy(desc(anomalySuppressionRules.createdAt));

      return {
        rules: rules.map((r) => ({
          ...r,
          timestamp: r.createdAt.getTime(),
          expiresAtTs: r.expiresAt.getTime(),
          isExpired: r.expiresAt.getTime() < Date.now(),
        })),
      };
    }),

  /**
   * Create a new suppression rule.
   */
  create: protectedProcedure
    .input(
      z.object({
        scheduleId: z.number().int().nullable(),
        severityFilter: z.enum(["critical", "high", "medium", "all"]),
        durationHours: z.number().int().min(1).max(720), // max 30 days
        reason: z.string().min(1).max(1000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Resolve schedule name if a specific schedule is targeted
      let scheduleName: string | null = null;
      if (input.scheduleId !== null) {
        const [schedule] = await db
          .select({ name: baselineSchedules.name })
          .from(baselineSchedules)
          .where(
            and(
              eq(baselineSchedules.id, input.scheduleId),
              eq(baselineSchedules.userId, ctx.user.id)
            )
          )
          .limit(1);

        if (!schedule) throw new Error("Schedule not found");
        scheduleName = schedule.name;
      }

      const expiresAt = new Date(Date.now() + input.durationHours * 60 * 60 * 1000);

      const result = await db.insert(anomalySuppressionRules).values({
        userId: ctx.user.id,
        scheduleId: input.scheduleId,
        severityFilter: input.severityFilter,
        durationHours: input.durationHours,
        reason: input.reason,
        expiresAt,
        scheduleName,
      });

      return { id: Number(result[0].insertId), expiresAt: expiresAt.getTime() };
    }),

  /**
   * Deactivate a suppression rule (before it expires naturally).
   */
  deactivate: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [rule] = await db
        .select({ id: anomalySuppressionRules.id, userId: anomalySuppressionRules.userId })
        .from(anomalySuppressionRules)
        .where(eq(anomalySuppressionRules.id, input.id))
        .limit(1);

      if (!rule || rule.userId !== ctx.user.id) {
        throw new Error("Rule not found");
      }

      await db
        .update(anomalySuppressionRules)
        .set({ active: false })
        .where(eq(anomalySuppressionRules.id, input.id));

      return { success: true };
    }),

  /**
   * Delete a suppression rule permanently.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [rule] = await db
        .select({ id: anomalySuppressionRules.id, userId: anomalySuppressionRules.userId })
        .from(anomalySuppressionRules)
        .where(eq(anomalySuppressionRules.id, input.id))
        .limit(1);

      if (!rule || rule.userId !== ctx.user.id) {
        throw new Error("Rule not found");
      }

      await db
        .delete(anomalySuppressionRules)
        .where(eq(anomalySuppressionRules.id, input.id));

      return { success: true };
    }),
});
