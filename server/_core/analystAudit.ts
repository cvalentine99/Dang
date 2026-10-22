/**
 * Analyst action audit + ownership helpers — team-global SOC model
 * (CODE_REVIEW_2026-10-21.md C8/C9/H-A4/H-A5).
 *
 * Product decision: any authenticated analyst may READ shared pipeline state
 * (cases, triage objects, correlation bundles, pipeline runs, response actions).
 * Every MUTATION of shared state is attributed via `recordAnalystAction`.
 * Mutations that override another analyst's work go through `requireOwnerOrAdmin`.
 */
import { TRPCError } from "@trpc/server";
import { analystActionAudit } from "../../drizzle/schema";

/** Minimal surface needed from a drizzle db or transaction handle. */
export interface AuditInsertable {
  insert: (table: typeof analystActionAudit) => {
    values: (row: typeof analystActionAudit.$inferInsert) => PromiseLike<unknown>;
  };
}

export interface AnalystActionEntry {
  userId: number;
  /** Procedure-style name, e.g. "alertQueue.remove" (max 64 chars). */
  action: string;
  targetType: string;
  targetId: string | number;
  /** Before/after or reason payload — never secrets. */
  metadata?: Record<string, unknown> | null;
}

/**
 * Append an analyst action audit row.
 *
 * FAIL-CLOSED (same contract as logSensitiveAccess): if there is no db handle or the
 * insert fails, this THROWS. Call it before (or in the same transaction as) the
 * mutation so a mutation never lands unattributed.
 */
export async function recordAnalystAction(
  db: AuditInsertable | null | undefined,
  entry: AnalystActionEntry,
): Promise<void> {
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Analyst action audit unavailable: database connection failed. Mutation refused.",
    });
  }
  if (!Number.isInteger(entry.userId) || entry.userId <= 0) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Analyst action audit refused: missing acting user id.",
    });
  }
  const targetId = String(entry.targetId).slice(0, 128);
  try {
    await db.insert(analystActionAudit).values({
      userId: entry.userId,
      action: entry.action.slice(0, 64),
      targetType: entry.targetType.slice(0, 64),
      targetId,
      metadata: entry.metadata ?? null,
    });
  } catch (error) {
    console.error("[AnalystActionAudit] Failed to record:", entry.action, error);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Analyst action audit unavailable: insert failed. Mutation refused.",
    });
  }
}

export interface OwnershipCtx {
  user: { id: number; role?: string | null };
}

export function isAdmin(ctx: OwnershipCtx): boolean {
  return ctx.user.role === "admin";
}

/**
 * Throw FORBIDDEN unless the caller is admin or owns the object.
 * A NULL / undefined owner (legacy row) is admin-only — never fail-open.
 */
export function requireOwnerOrAdmin(
  ctx: OwnershipCtx,
  ownerUserId: number | null | undefined,
  what: string,
): void {
  if (isAdmin(ctx)) return;
  if (ownerUserId != null && ownerUserId === ctx.user.id) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message:
      ownerUserId == null
        ? `Only an admin may modify this ${what} (it has no recorded owner).`
        : `You can only modify your own ${what}; ask its owner or an admin.`,
  });
}
