/**
 * Sensitive Access Audit Router
 *
 * Admin-only procedures for querying the sensitive_access_audit table.
 * This is the compliance viewer for the agentKey disclosure policy.
 */
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sensitiveAccessAudit } from "../../drizzle/schema";
import { desc, eq, and, gte, lte, sql } from "drizzle-orm";

export const sensitiveAccessRouter = router({
  /**
   * List sensitive access audit records with pagination, filters, and date range.
   * Admin-only — non-admins get FORBIDDEN.
   */
  list: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(25),
        resourceType: z.string().optional(),
        resourceId: z.string().optional(),
        userId: z.number().int().optional(),
        action: z.enum(["reveal", "copy"]).optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0, page: input.page, limit: input.limit };

      const conditions = [];

      if (input.resourceType) {
        conditions.push(eq(sensitiveAccessAudit.resourceType, input.resourceType));
      }
      if (input.resourceId) {
        conditions.push(eq(sensitiveAccessAudit.resourceId, input.resourceId));
      }
      if (input.userId) {
        conditions.push(eq(sensitiveAccessAudit.userId, input.userId));
      }
      if (input.action) {
        conditions.push(eq(sensitiveAccessAudit.action, input.action));
      }
      if (input.startDate) {
        conditions.push(gte(sensitiveAccessAudit.createdAt, new Date(input.startDate)));
      }
      if (input.endDate) {
        conditions.push(lte(sensitiveAccessAudit.createdAt, new Date(input.endDate)));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, countResult] = await Promise.all([
        db
          .select()
          .from(sensitiveAccessAudit)
          .where(where)
          .orderBy(desc(sensitiveAccessAudit.createdAt))
          .limit(input.limit)
          .offset((input.page - 1) * input.limit),
        db
          .select({ count: sql<number>`count(*)` })
          .from(sensitiveAccessAudit)
          .where(where),
      ]);

      return {
        rows,
        total: Number(countResult[0]?.count ?? 0),
        page: input.page,
        limit: input.limit,
      };
    }),

  /**
   * Get summary statistics for the audit trail.
   * Admin-only.
   */
  stats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { totalRecords: 0, uniqueUsers: 0, resourceTypes: [] };

    const [totalResult, uniqueUsersResult, resourceTypesResult] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(sensitiveAccessAudit),
      db.select({ count: sql<number>`count(distinct userId)` }).from(sensitiveAccessAudit),
      db
        .select({
          resourceType: sensitiveAccessAudit.resourceType,
          count: sql<number>`count(*)`,
        })
        .from(sensitiveAccessAudit)
        .groupBy(sensitiveAccessAudit.resourceType),
    ]);

    return {
      totalRecords: Number(totalResult[0]?.count ?? 0),
      uniqueUsers: Number(uniqueUsersResult[0]?.count ?? 0),
      resourceTypes: resourceTypesResult.map((r: { resourceType: string; count: number }) => ({
        type: r.resourceType,
        count: Number(r.count),
      })),
    };
  }),
});
