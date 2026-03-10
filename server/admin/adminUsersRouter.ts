import { z } from "zod";
import { eq, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { hashPassword } from "../localAuth/localAuthService";

export const adminUsersRouter = router({
  /**
   * List all users with pagination and search.
   * Admin-only.
   */
  list: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(50),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 50;
      const offset = (page - 1) * pageSize;

      // Build base query — never return passwordHash to the client
      let query = db
        .select({
          id: users.id,
          openId: users.openId,
          name: users.name,
          email: users.email,
          loginMethod: users.loginMethod,
          role: users.role,
          isDisabled: users.isDisabled,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          lastSignedIn: users.lastSignedIn,
        })
        .from(users);

      // Apply search filter if provided
      if (input?.search && input.search.trim()) {
        const term = `%${input.search.trim()}%`;
        query = query.where(
          sql`(${users.name} LIKE ${term} OR ${users.email} LIKE ${term} OR ${users.openId} LIKE ${term})`
        ) as typeof query;
      }

      // C-4: Get total count WITH search filter applied (otherwise pagination breaks)
      let countQuery = db
        .select({ count: sql<number>`COUNT(*)` })
        .from(users);
      if (input?.search && input.search.trim()) {
        const term = `%${input.search.trim()}%`;
        countQuery = countQuery.where(
          sql`(${users.name} LIKE ${term} OR ${users.email} LIKE ${term} OR ${users.openId} LIKE ${term})`
        ) as typeof countQuery;
      }
      const countResult = await countQuery;
      const total = countResult[0]?.count ?? 0;

      // Get paginated results
      const rows = await query
        .orderBy(desc(users.createdAt))
        .limit(pageSize)
        .offset(offset);

      return {
        users: rows,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }),

  /**
   * Update a user's role (admin ↔ user).
   * Prevents admin from demoting themselves.
   */
  updateRole: adminProcedure
    .input(
      z.object({
        userId: z.number().int(),
        role: z.enum(["user", "admin"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Prevent self-demotion
      if (ctx.user.id === input.userId && input.role !== "admin") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot demote yourself. Ask another admin to change your role.",
        });
      }

      // Verify target user exists
      const target = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (target.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));

      return { success: true, userId: input.userId, newRole: input.role, userName: target[0].name };
    }),

  /**
   * Reset a user's password (admin sets a new password).
   * Only works for local auth users.
   */
  resetPassword: adminProcedure
    .input(
      z.object({
        userId: z.number().int(),
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Verify target user exists and is a local auth user
      const target = await db.select({ id: users.id, name: users.name, loginMethod: users.loginMethod }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (target.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      if (target[0].loginMethod !== "local") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot reset password for this user. No password hash on file.",
        });
      }

      const newHash = await hashPassword(input.newPassword);
      await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, input.userId));

      return { success: true, userId: input.userId, userName: target[0].name };
    }),

  /**
   * Toggle a user's disabled status.
   * Prevents admin from disabling themselves.
   */
  toggleDisabled: adminProcedure
    .input(
      z.object({
        userId: z.number().int(),
        isDisabled: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Prevent self-disable
      if (ctx.user.id === input.userId && input.isDisabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot disable your own account. Ask another admin.",
        });
      }

      // Verify target user exists
      const target = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (target.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      await db.update(users).set({ isDisabled: input.isDisabled ? 1 : 0 }).where(eq(users.id, input.userId));

      return { success: true, userId: input.userId, isDisabled: input.isDisabled, userName: target[0].name };
    }),
});
