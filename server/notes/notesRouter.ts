/**
 * Analyst Notes v2 Router — Enhanced note-taking system with entity linking.
 *
 * Supports annotating alerts, agents, CVEs, rules, and free-form (general) notes.
 * All notes are local-only — never written back to Wazuh.
 * Protected procedures require authentication (userId from ctx.user).
 */

import { requireDb } from "../dbGuard";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and, like, or, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { analystNotesV2 } from "../../drizzle/schema";

const ENTITY_TYPES = ["alert", "agent", "cve", "rule", "general"] as const;
const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;

export const notesRouter = router({
  /** List notes with optional filters */
  list: protectedProcedure
    .input(
      z.object({
        entityType: z.enum(ENTITY_TYPES).optional(),
        entityId: z.string().optional(),
        severity: z.enum(SEVERITIES).optional(),
        resolved: z.boolean().optional(),
        search: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      const conditions = [eq(analystNotesV2.userId, ctx.user.id)];

      if (input.entityType) {
        conditions.push(eq(analystNotesV2.entityType, input.entityType));
      }
      if (input.entityId) {
        conditions.push(eq(analystNotesV2.entityId, input.entityId));
      }
      if (input.severity) {
        conditions.push(eq(analystNotesV2.severity, input.severity));
      }
      if (input.resolved !== undefined) {
        conditions.push(eq(analystNotesV2.resolved, input.resolved ? 1 : 0));
      }
      if (input.search) {
        const pattern = `%${input.search}%`;
        conditions.push(
          or(
            like(analystNotesV2.title, pattern),
            like(analystNotesV2.content, pattern),
            like(analystNotesV2.entityId, pattern)
          )!
        );
      }

      const whereClause = and(...conditions);

      const notes = await db
        .select()
        .from(analystNotesV2)
        .where(whereClause)
        .orderBy(desc(analystNotesV2.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(analystNotesV2)
        .where(whereClause);

      const total = Number(countResult[0]?.count ?? 0);

      return { notes, total };
    }),

  /** Get a single note by ID */
  getById: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const result = await db
        .select()
        .from(analystNotesV2)
        .where(and(eq(analystNotesV2.id, input.id), eq(analystNotesV2.userId, ctx.user.id)))
        .limit(1);
      return result[0] ?? null;
    }),

  /** Get notes for a specific entity (e.g., all notes for agent "001") */
  byEntity: protectedProcedure
    .input(
      z.object({
        entityType: z.enum(ENTITY_TYPES),
        entityId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      return db
        .select()
        .from(analystNotesV2)
        .where(
          and(
            eq(analystNotesV2.userId, ctx.user.id),
            eq(analystNotesV2.entityType, input.entityType),
            eq(analystNotesV2.entityId, input.entityId)
          )
        )
        .orderBy(desc(analystNotesV2.createdAt));
    }),

  /** Count notes per entity type for badge indicators */
  entityCounts: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const result = await db
      .select({
        entityType: analystNotesV2.entityType,
        count: sql<number>`count(*)`,
      })
      .from(analystNotesV2)
      .where(eq(analystNotesV2.userId, ctx.user.id))
      .groupBy(analystNotesV2.entityType);

    const counts: Record<string, number> = { alert: 0, agent: 0, cve: 0, rule: 0, general: 0 };
    result.forEach((r) => {
      counts[r.entityType] = Number(r.count);
    });
    return counts;
  }),

  /** Create a new note */
  create: protectedProcedure
    .input(
      z.object({
        entityType: z.enum(ENTITY_TYPES),
        entityId: z.string().default(""),
        title: z.string().min(1).max(512),
        content: z.string().default(""),
        severity: z.enum(SEVERITIES).default("info"),
        tags: z.array(z.string()).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const result = await db.insert(analystNotesV2).values({
        userId: ctx.user.id,
        entityType: input.entityType,
        entityId: input.entityId,
        title: input.title,
        content: input.content,
        severity: input.severity,
        tags: input.tags,
        resolved: 0,
      });

      return { id: Number(result[0].insertId), success: true };
    }),

  /** Update an existing note */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        title: z.string().min(1).max(512).optional(),
        content: z.string().optional(),
        severity: z.enum(SEVERITIES).optional(),
        resolved: z.boolean().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const updates: Partial<typeof analystNotesV2.$inferInsert> = {};
      if (input.title !== undefined) updates.title = input.title;
      if (input.content !== undefined) updates.content = input.content;
      if (input.severity !== undefined) updates.severity = input.severity;
      if (input.resolved !== undefined) updates.resolved = input.resolved ? 1 : 0;
      if (input.tags !== undefined) updates.tags = input.tags;

      await db
        .update(analystNotesV2)
        .set(updates)
        .where(and(eq(analystNotesV2.id, input.id), eq(analystNotesV2.userId, ctx.user.id)));

      return { success: true };
    }),

  /** Delete a note */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db
        .delete(analystNotesV2)
        .where(and(eq(analystNotesV2.id, input.id), eq(analystNotesV2.userId, ctx.user.id)));
      return { success: true };
    }),
});
