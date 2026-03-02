/**
 * Configuration Baselines Router — Persists "known-good" configuration snapshots.
 *
 * Allows analysts to save, load, and delete configuration baselines
 * for drift comparison over time. Read-only with respect to Wazuh —
 * baselines are local snapshots only.
 */

import { requireDb } from "../dbGuard";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { configBaselines } from "../../drizzle/schema";

export const baselinesRouter = router({
  /** List baselines for the current user */
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();

    const results = await db
      .select({
        id: configBaselines.id,
        name: configBaselines.name,
        description: configBaselines.description,
        agentIds: configBaselines.agentIds,
        createdAt: configBaselines.createdAt,
        updatedAt: configBaselines.updatedAt,
      })
      .from(configBaselines)
      .where(eq(configBaselines.userId, ctx.user.id))
      .orderBy(desc(configBaselines.updatedAt))
      .limit(50);

    return { baselines: results };
  }),

  /** Get a single baseline with full snapshot data */
  get: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const results = await db
        .select()
        .from(configBaselines)
        .where(
          and(
            eq(configBaselines.id, input.id),
            eq(configBaselines.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (!results.length) throw new TRPCError({ code: "NOT_FOUND", message: "Baseline not found" });
      return { baseline: results[0] };
    }),

  /** Create a new baseline snapshot */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(256),
        description: z.string().max(1000).optional(),
        agentIds: z.array(z.string()).min(1).max(10),
        snapshotData: z.record(z.string(), z.unknown()),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const result = await db.insert(configBaselines).values({
        userId: ctx.user.id,
        name: input.name,
        description: input.description ?? null,
        agentIds: input.agentIds,
        snapshotData: input.snapshotData,
      });

      return { id: Number(result[0].insertId), success: true };
    }),

  /** Delete a baseline (only owner can delete) */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const existing = await db
        .select()
        .from(configBaselines)
        .where(
          and(
            eq(configBaselines.id, input.id),
            eq(configBaselines.userId, ctx.user.id)
          )
        )
        .limit(1);

      if (!existing.length) throw new TRPCError({ code: "NOT_FOUND", message: "Baseline not found" });

      await db
        .delete(configBaselines)
        .where(eq(configBaselines.id, input.id));
      return { success: true };
    }),
});
