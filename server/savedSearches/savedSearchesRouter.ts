/**
 * Saved Searches Router — Persists analyst search filters across sessions.
 *
 * Allows analysts to save, name, load, and delete search queries
 * for reuse across sessions.
 *
 * Search types are derived from shared/searchTypes.ts (the canonical enum list).
 * Consumer callsites still pass literal strings; TypeScript validates them against SavedSearchType.
 */

import { requireDb } from "../dbGuard";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { savedSearches } from "../../drizzle/schema";
import { SAVED_SEARCH_TYPES } from "@shared/searchTypes";

/** Zod enum derived from the shared constant */
const searchTypeEnum = z.enum(SAVED_SEARCH_TYPES);

export const savedSearchesRouter = router({
  /** List saved searches for the current user, optionally filtered by type */
  list: protectedProcedure
    .input(
      z.object({
        searchType: searchTypeEnum.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      const conditions = [eq(savedSearches.userId, ctx.user.id)];
      if (input.searchType) {
        conditions.push(eq(savedSearches.searchType, input.searchType));
      }

      const results = await db
        .select()
        .from(savedSearches)
        .where(and(...conditions))
        .orderBy(desc(savedSearches.updatedAt))
        .limit(100);

      return { searches: results };
    }),

  /** Create a new saved search */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(256),
        searchType: searchTypeEnum,
        filters: z.record(z.string(), z.unknown()),
        description: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const result = await db.insert(savedSearches).values({
        userId: ctx.user.id,
        name: input.name,
        searchType: input.searchType,
        filters: input.filters,
        description: input.description ?? null,
      });

      return { id: Number(result[0].insertId), success: true };
    }),

  /** Update an existing saved search (name, filters, description) */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number().int(),
        name: z.string().min(1).max(256).optional(),
        filters: z.record(z.string(), z.unknown()).optional(),
        description: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify ownership
      const existing = await db
        .select()
        .from(savedSearches)
        .where(and(eq(savedSearches.id, input.id), eq(savedSearches.userId, ctx.user.id)))
        .limit(1);

      if (!existing.length) throw new TRPCError({ code: "NOT_FOUND", message: "Saved search not found" });

      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.filters !== undefined) updates.filters = input.filters;
      if (input.description !== undefined) updates.description = input.description;

      if (Object.keys(updates).length > 0) {
        await db
          .update(savedSearches)
          .set(updates)
          .where(eq(savedSearches.id, input.id));
      }

      return { success: true };
    }),

  /** Delete a saved search (only owner can delete) */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Verify ownership
      const existing = await db
        .select()
        .from(savedSearches)
        .where(and(eq(savedSearches.id, input.id), eq(savedSearches.userId, ctx.user.id)))
        .limit(1);

      if (!existing.length) throw new TRPCError({ code: "NOT_FOUND", message: "Saved search not found" });

      await db.delete(savedSearches).where(eq(savedSearches.id, input.id));
      return { success: true };
    }),
});
