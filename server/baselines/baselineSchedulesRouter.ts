/**
 * Baseline Schedules Router — CRUD for automated baseline capture schedules.
 *
 * Allows analysts to create schedules that automatically snapshot agent
 * configuration at defined intervals. Schedules create config_baselines
 * rows with a scheduleId reference.
 *
 * Read-only with respect to Wazuh — captures are local snapshots only.
 */

import { requireDb } from "../dbGuard";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  baselineSchedules,
  configBaselines,
  BASELINE_FREQUENCIES,
  type BaselineFrequency,
} from "../../drizzle/schema";
import { computeNextRunAt } from "./scheduleUtils";

export const baselineSchedulesRouter = router({
  /** List all schedules for the current user */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();

    const results = await db
      .select()
      .from(baselineSchedules)
      .where(eq(baselineSchedules.userId, ctx.user.id))
      .orderBy(desc(baselineSchedules.updatedAt))
      .limit(50);

    return { schedules: results };
  }),

  /** Get a single schedule with details */
  get: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const results = await db
        .select()
        .from(baselineSchedules)
        .where(
          and(
            eq(baselineSchedules.id, input.id),
            eq(baselineSchedules.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (!results.length) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
      return { schedule: results[0] };
    }),

  /** Create a new baseline schedule */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(256),
        agentIds: z.array(z.string()).min(1).max(20),
        frequency: z.enum(BASELINE_FREQUENCIES),
        retentionCount: z.number().int().min(1).max(100).default(10),
        driftThreshold: z.number().int().min(0).max(100).default(0),
        notifyOnDrift: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const nextRunAt = computeNextRunAt(input.frequency as BaselineFrequency);

      const result = await db.insert(baselineSchedules).values({
        userId: ctx.user.id,
        name: input.name,
        agentIds: input.agentIds,
        frequency: input.frequency,
        enabled: true,
        nextRunAt,
        retentionCount: input.retentionCount,
        driftThreshold: input.driftThreshold,
        notifyOnDrift: input.notifyOnDrift,
      });

      return { id: Number(result[0].insertId), success: true };
    }),

  /** Update an existing schedule */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().min(1).max(256).optional(),
        agentIds: z.array(z.string()).min(1).max(20).optional(),
        frequency: z.enum(BASELINE_FREQUENCIES).optional(),
        retentionCount: z.number().int().min(1).max(100).optional(),
        driftThreshold: z.number().int().min(0).max(100).optional(),
        notifyOnDrift: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify ownership
      const existing = await db
        .select()
        .from(baselineSchedules)
        .where(
          and(
            eq(baselineSchedules.id, input.id),
            eq(baselineSchedules.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (!existing.length) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });

      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.agentIds !== undefined) updates.agentIds = input.agentIds;
      if (input.retentionCount !== undefined) updates.retentionCount = input.retentionCount;
      if (input.driftThreshold !== undefined) updates.driftThreshold = input.driftThreshold;
      if (input.notifyOnDrift !== undefined) updates.notifyOnDrift = input.notifyOnDrift;

      // If frequency changed, recompute nextRunAt
      if (input.frequency !== undefined && input.frequency !== existing[0].frequency) {
        updates.frequency = input.frequency;
        updates.nextRunAt = computeNextRunAt(input.frequency as BaselineFrequency);
      }

      if (Object.keys(updates).length > 0) {
        await db
          .update(baselineSchedules)
          .set(updates)
          .where(eq(baselineSchedules.id, input.id));
      }

      return { success: true };
    }),

  /** Toggle a schedule on/off */
  toggle: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const existing = await db
        .select()
        .from(baselineSchedules)
        .where(
          and(
            eq(baselineSchedules.id, input.id),
            eq(baselineSchedules.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (!existing.length) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });

      const newEnabled = !existing[0].enabled;
      const updates: Record<string, unknown> = { enabled: newEnabled };

      // If re-enabling, recompute nextRunAt from now
      if (newEnabled) {
        updates.nextRunAt = computeNextRunAt(existing[0].frequency as BaselineFrequency);
        updates.lastError = null;
      }

      await db
        .update(baselineSchedules)
        .set(updates)
        .where(eq(baselineSchedules.id, input.id));

      return { enabled: newEnabled, success: true };
    }),

  /** Delete a schedule (hard delete — also removes link from baselines) */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const existing = await db
        .select()
        .from(baselineSchedules)
        .where(
          and(
            eq(baselineSchedules.id, input.id),
            eq(baselineSchedules.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (!existing.length) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });

      // Unlink baselines created by this schedule (don't delete them)
      await db
        .update(configBaselines)
        .set({ scheduleId: null })
        .where(eq(configBaselines.scheduleId, input.id));

      await db
        .delete(baselineSchedules)
        .where(eq(baselineSchedules.id, input.id));

      return { success: true };
    }),

  /** Manually trigger an immediate baseline capture for a schedule */
  triggerNow: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const existing = await db
        .select()
        .from(baselineSchedules)
        .where(
          and(
            eq(baselineSchedules.id, input.id),
            eq(baselineSchedules.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (!existing.length) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });

      // Import and execute the capture
      const { executeScheduledCapture } = await import("./baselineSchedulerService");
      const result = await executeScheduledCapture(existing[0]);

      return result;
    }),

  /** Get baselines created by a specific schedule */
  history: protectedProcedure
    .input(
      z.object({
        scheduleId: z.number().int(),
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      // Verify ownership of the schedule
      const schedule = await db
        .select()
        .from(baselineSchedules)
        .where(
          and(
            eq(baselineSchedules.id, input.scheduleId),
            eq(baselineSchedules.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (!schedule.length) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });

      const results = await db
        .select({
          id: configBaselines.id,
          name: configBaselines.name,
          description: configBaselines.description,
          agentIds: configBaselines.agentIds,
          createdAt: configBaselines.createdAt,
        })
        .from(configBaselines)
        .where(eq(configBaselines.scheduleId, input.scheduleId))
        .orderBy(desc(configBaselines.createdAt))
        .limit(input.limit);

      return { baselines: results };
    }),
});
