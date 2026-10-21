/**
 * analystAudit — recordAnalystAction (fail-closed audit writer) and
 * requireOwnerOrAdmin (ownership decision) — team-global SOC model (C8/H-A5).
 */
import { describe, it, expect, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { recordAnalystAction, requireOwnerOrAdmin, isAdmin } from "./analystAudit";
import { analystActionAudit } from "../../drizzle/schema";

function mockDb(valuesImpl: (row: unknown) => Promise<unknown> = async () => [{ insertId: 1 }]) {
  const values = vi.fn(valuesImpl);
  const insert = vi.fn(() => ({ values }));
  return { db: { insert } as never, insert, values };
}

describe("recordAnalystAction", () => {
  it("inserts one row into analyst_action_audit with the given fields", async () => {
    const { db, insert, values } = mockDb();
    await recordAnalystAction(db, {
      userId: 7,
      action: "alertQueue.remove",
      targetType: "alert_queue",
      targetId: 42,
      metadata: { priorStatus: "queued" },
    });
    expect(insert).toHaveBeenCalledWith(analystActionAudit);
    expect(values).toHaveBeenCalledWith({
      userId: 7,
      action: "alertQueue.remove",
      targetType: "alert_queue",
      targetId: "42",
      metadata: { priorStatus: "queued" },
    });
  });

  it("stores null metadata when none given and truncates over-long fields to column widths", async () => {
    const { db, values } = mockDb();
    await recordAnalystAction(db, {
      userId: 1, action: "a".repeat(100), targetType: "t".repeat(100), targetId: "x".repeat(300),
    });
    const row = values.mock.calls[0][0] as Record<string, string | null>;
    expect(row.metadata).toBeNull();
    expect(row.action).toHaveLength(64);
    expect(row.targetType).toHaveLength(64);
    expect(row.targetId).toHaveLength(128);
  });

  it("fails closed (throws) when there is no db handle", async () => {
    await expect(
      recordAnalystAction(null, { userId: 1, action: "x", targetType: "y", targetId: 1 }),
    ).rejects.toThrow(/audit unavailable/i);
  });

  it("fails closed (throws) when the insert fails", async () => {
    const { db } = mockDb(async () => { throw new Error("ER_NO_SUCH_TABLE"); });
    const err = await recordAnalystAction(db, { userId: 1, action: "x", targetType: "y", targetId: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).message).toMatch(/insert failed/);
    // the driver error text is not leaked to the client
    expect((err as TRPCError).message).not.toContain("ER_NO_SUCH_TABLE");
  });

  it("refuses an unattributed entry (missing/invalid userId)", async () => {
    const { db, insert } = mockDb();
    await expect(
      recordAnalystAction(db, { userId: 0, action: "x", targetType: "y", targetId: 1 }),
    ).rejects.toThrow(/acting user/);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("requireOwnerOrAdmin", () => {
  const analyst = (id: number) => ({ user: { id, role: "user" } });
  const admin = { user: { id: 99, role: "admin" } };

  it("allows the owner", () => {
    expect(() => requireOwnerOrAdmin(analyst(5), 5, "note")).not.toThrow();
  });

  it("allows an admin on someone else's object", () => {
    expect(() => requireOwnerOrAdmin(admin, 5, "note")).not.toThrow();
  });

  it("forbids a different analyst with a clear message", () => {
    let err: unknown;
    try { requireOwnerOrAdmin(analyst(6), 5, "note"); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe("FORBIDDEN");
    expect((err as TRPCError).message).toMatch(/your own note/);
  });

  it("treats a NULL owner (legacy row) as admin-only — never fail-open", () => {
    expect(() => requireOwnerOrAdmin(analyst(6), null, "note")).toThrow(/Only an admin/);
    expect(() => requireOwnerOrAdmin(analyst(6), undefined, "note")).toThrow(TRPCError);
    expect(() => requireOwnerOrAdmin(admin, null, "note")).not.toThrow();
  });

  it("isAdmin only for role 'admin'", () => {
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(analyst(1))).toBe(false);
  });
});
