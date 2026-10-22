/**
 * H-A7 / P2-10 — adminUsers mutations (no live DB; getDb is a programmable fake).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-that-is-long-enough-32chars";
});

const fake = vi.hoisted(() => {
  const state = {
    selectResults: [] as unknown[][],
    updates: [] as Record<string, unknown>[],
  };
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "orderBy", "offset", "for"]) chain[m] = () => chain;
  chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(state.selectResults.shift() ?? []).then(res, rej);
  const db = {
    select: () => chain,
    update: () => ({
      set: (v: Record<string, unknown>) => {
        state.updates.push(v);
        return { where: async () => [{ affectedRows: 1 }] };
      },
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { state, db };
});

vi.mock("../db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../db")>()),
  getDb: vi.fn(async () => fake.db),
}));

import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

function adminCaller(id = 1) {
  const ctx = {
    user: {
      id, openId: `admin-${id}`, name: `admin${id}`, email: null, loginMethod: "local", role: "admin",
      passwordHash: null, isDisabled: 0, tokenVersion: 0, passwordChangedAt: null,
      createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => {} },
  } as unknown as TrpcContext;
  return appRouter.createCaller(ctx);
}

beforeEach(() => {
  fake.state.selectResults = [];
  fake.state.updates = [];
});

describe("adminUsers.resetPassword", () => {
  it("forbids resetting ANOTHER admin's password", async () => {
    fake.state.selectResults = [[{ id: 2, name: "founder", loginMethod: "local", role: "admin" }]];
    await expect(
      adminCaller(1).adminUsers.resetPassword({ userId: 2, newPassword: "newpass123" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.state.updates).toHaveLength(0);
  });

  it("allows an admin to reset their own password", async () => {
    fake.state.selectResults = [[{ id: 1, name: "admin1", loginMethod: "local", role: "admin" }]];
    await adminCaller(1).adminUsers.resetPassword({ userId: 1, newPassword: "newpass123" });
    expect(fake.state.updates).toHaveLength(1);
  });

  it("sets passwordHash, passwordChangedAt and bumps tokenVersion", async () => {
    fake.state.selectResults = [[{ id: 5, name: "bob", loginMethod: "local", role: "user" }]];
    await adminCaller(1).adminUsers.resetPassword({ userId: 5, newPassword: "newpass123" });
    const set = fake.state.updates[0];
    expect(typeof set.passwordHash).toBe("string");
    expect(set.passwordChangedAt).toBeInstanceOf(Date);
    expect(set).toHaveProperty("tokenVersion");
  });

  it("rejects passwords over 128 characters", async () => {
    await expect(
      adminCaller(1).adminUsers.resetPassword({ userId: 5, newPassword: "x".repeat(129) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("adminUsers.updateRole", () => {
  it("refuses to demote the last active admin", async () => {
    // target (admin, active) → other active admins: none
    fake.state.selectResults = [[{ id: 2, name: "a2", role: "admin", isDisabled: 0 }], []];
    await expect(
      adminCaller(1).adminUsers.updateRole({ userId: 2, role: "user" })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(fake.state.updates).toHaveLength(0);
  });

  it("demotes when another active admin remains, and bumps tokenVersion", async () => {
    fake.state.selectResults = [[{ id: 2, name: "a2", role: "admin", isDisabled: 0 }], [{ id: 1 }]];
    await adminCaller(1).adminUsers.updateRole({ userId: 2, role: "user" });
    expect(fake.state.updates[0]).toMatchObject({ role: "user" });
    expect(fake.state.updates[0]).toHaveProperty("tokenVersion");
  });

  it("promotion bumps tokenVersion too", async () => {
    fake.state.selectResults = [[{ id: 3, name: "u3", role: "user", isDisabled: 0 }]];
    await adminCaller(1).adminUsers.updateRole({ userId: 3, role: "admin" });
    expect(fake.state.updates[0]).toHaveProperty("tokenVersion");
  });
});

describe("adminUsers.toggleDisabled", () => {
  it("refuses to disable the last active admin", async () => {
    fake.state.selectResults = [[{ id: 2, name: "a2", role: "admin", isDisabled: 0 }], []];
    await expect(
      adminCaller(1).adminUsers.toggleDisabled({ userId: 2, isDisabled: true })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("disabling a user bumps tokenVersion (revokes sessions + SSE)", async () => {
    fake.state.selectResults = [[{ id: 4, name: "u4", role: "user", isDisabled: 0 }]];
    await adminCaller(1).adminUsers.toggleDisabled({ userId: 4, isDisabled: true });
    expect(fake.state.updates[0]).toMatchObject({ isDisabled: 1 });
    expect(fake.state.updates[0]).toHaveProperty("tokenVersion");
  });
});
