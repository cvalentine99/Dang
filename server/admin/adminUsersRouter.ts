import { z } from "zod";
import { and, eq, desc, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { hashPassword } from "../localAuth/localAuthService";
import { passwordChangedAtNow } from "../_core/sdk";

/** P2-10: bumping tokenVersion revokes every outstanding session of that user. */
const bumpTokenVersion = sql`${users.tokenVersion} + 1`;

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * H-A7: last-admin guard. Counts active admins (role='admin' AND isDisabled=0)
 * other than `excludeUserId`, with a locking read so two concurrent demotions
 * cannot both pass. Throws PRECONDITION_FAILED if none would remain.
 */
async function assertAnotherActiveAdmin(tx: Tx, excludeUserId: number): Promise<void> {
  const others = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isDisabled, 0), ne(users.id, excludeUserId)))
    .for("update");
  if (others.length < 1) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This change would leave no active admin. Promote or enable another admin first.",
    });
  }
}

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

      return await db.transaction(async (tx) => {
        // Verify target user exists (locked for the duration of the change)
        const target = await tx
          .select({ id: users.id, name: users.name, role: users.role, isDisabled: users.isDisabled })
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1)
          .for("update");
        if (target.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }

        // H-A7: demoting an active admin must leave at least one active admin
        if (target[0].role === "admin" && input.role !== "admin" && !target[0].isDisabled) {
          await assertAnotherActiveAdmin(tx, input.userId);
        }

        // P2-10: role change revokes the target's sessions (re-login picks up the new role)
        await tx
          .update(users)
          .set({ role: input.role, tokenVersion: bumpTokenVersion })
          .where(eq(users.id, input.userId));

        return { success: true, userId: input.userId, newRole: input.role, userName: target[0].name };
      });
    }),

  /**
   * Reset a user's password (admin sets a new password).
   * Only works for local auth users.
   */
  resetPassword: adminProcedure
    .input(
      z.object({
        userId: z.number().int(),
        newPassword: z
          .string()
          .min(8, "Password must be at least 8 characters")
          .max(128, "Password must be at most 128 characters"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // Verify target user exists and is a local auth user
      const target = await db.select({ id: users.id, name: users.name, loginMethod: users.loginMethod, role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (target.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // H-A7: an admin's password may only be reset by that admin (self-service).
      // Otherwise any admin could take over the founding admin's account.
      if (target[0].role === "admin" && target[0].id !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot reset another admin's password. That admin must change it themselves, or first be demoted to user.",
        });
      }

      if (target[0].loginMethod !== "local") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot reset password for this user. No password hash on file.",
        });
      }

      const newHash = await hashPassword(input.newPassword);
      // H-A7 / P2-10: revoke every existing session of the target — tokens issued
      // before passwordChangedAt and tokens with the old tokenVersion are rejected.
      await db
        .update(users)
        .set({
          passwordHash: newHash,
          passwordChangedAt: passwordChangedAtNow(),
          tokenVersion: bumpTokenVersion,
        })
        .where(eq(users.id, input.userId));

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

      return await db.transaction(async (tx) => {
        // Verify target user exists (locked for the duration of the change)
        const target = await tx
          .select({ id: users.id, name: users.name, role: users.role, isDisabled: users.isDisabled })
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1)
          .for("update");
        if (target.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        }

        // H-A7: disabling an active admin must leave at least one active admin
        if (input.isDisabled && target[0].role === "admin" && !target[0].isDisabled) {
          await assertAnotherActiveAdmin(tx, input.userId);
        }

        // P2-10: disable (and re-enable) revokes the target's sessions — open SSE
        // streams are closed on their next heartbeat.
        await tx
          .update(users)
          .set({ isDisabled: input.isDisabled ? 1 : 0, tokenVersion: bumpTokenVersion })
          .where(eq(users.id, input.userId));

        return { success: true, userId: input.userId, isDisabled: input.isDisabled, userName: target[0].name };
      });
    }),
});
