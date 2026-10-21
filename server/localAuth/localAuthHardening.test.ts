/**
 * Phase 1 auth hardening — local auth (no live DB; getDb is a programmable fake).
 *  - M1:   identical login failure message for unknown / disabled / no-password / wrong-password
 *  - C3:   locking first-user read, gate inside the txn, ER_DUP_ENTRY → CONFLICT
 *  - H-A9: seedAdminUser creates role "admin" / promotes only with matching password
 *  - H-A3: (ip, account) + ip + account rate limiting, reset on success, TRPCError
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-that-is-long-enough-32chars";
});

const fake = vi.hoisted(() => {
  const state = {
    selectResults: [] as unknown[][],
    forCalls: [] as string[],
    inserts: [] as Record<string, unknown>[],
    updates: [] as Record<string, unknown>[],
    transactionError: null as unknown,
  };
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "orderBy"]) chain[m] = () => chain;
  chain.for = (strength: string) => {
    state.forCalls.push(strength);
    return chain;
  };
  chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(state.selectResults.shift() ?? []).then(res, rej);
  const db = {
    select: () => chain,
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        state.inserts.push(v);
        return { $returningId: async () => [{ id: 42 }] };
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        state.updates.push(v);
        return { where: async () => [{ affectedRows: 1 }] };
      },
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      if (state.transactionError) throw state.transactionError;
      return fn(db);
    },
  };
  return { state, db };
});

vi.mock("../db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../db")>()),
  getDb: vi.fn(async () => fake.db),
}));

import {
  hashPassword,
  loginLocalUser,
  registerLocalUser,
  seedAdminUser,
  INVALID_CREDENTIALS_MSG,
} from "./localAuthService";
import { checkAuthRateLimit, recordAuthSuccess, _resetAuthRateLimits } from "./localAuthRouter";

let HASH: string;
beforeAll(async () => {
  HASH = await hashPassword("correct-horse");
});

beforeEach(() => {
  fake.state.selectResults = [];
  fake.state.forCalls = [];
  fake.state.inserts = [];
  fake.state.updates = [];
  fake.state.transactionError = null;
});

function row(over: Record<string, unknown> = {}) {
  return {
    id: 7, openId: "local_x", name: "alice", email: null, role: "user",
    passwordHash: HASH, isDisabled: 0, tokenVersion: 3, passwordChangedAt: null,
    loginMethod: "local", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    ...over,
  };
}

async function loginError(rows: unknown[][], password = "correct-horse") {
  fake.state.selectResults = rows;
  try {
    await loginLocalUser({ username: "alice", password });
  } catch (e) {
    return e as TRPCError;
  }
  throw new Error("expected login to fail");
}

describe("M1 — identical login failures", () => {
  it.each([
    ["unknown user", [[], []], "correct-horse"],
    ["disabled user", [[row({ isDisabled: 1 })]], "correct-horse"],
    ["no password set", [[row({ passwordHash: null })]], "correct-horse"],
    ["wrong password", [[row()]], "wrong-password"],
  ])("%s → UNAUTHORIZED '%s'", async (_label, rows, pw) => {
    const err = await loginError(rows as unknown[][], pw as string);
    expect(err).toBeInstanceOf(TRPCError);
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.message).toBe(INVALID_CREDENTIALS_MSG);
  });

  it("success mints a token carrying the row's tokenVersion", async () => {
    fake.state.selectResults = [[row()]];
    const { token } = await loginLocalUser({ username: "alice", password: "correct-horse" });
    const { sdk } = await import("../_core/sdk");
    expect((await sdk.verifySession(token))?.tv).toBe(3);
  });
});

describe("C3 — registration", () => {
  it("uses a locking first-user read and makes the first user admin", async () => {
    fake.state.selectResults = [[], [], []];
    const u = await registerLocalUser({ username: "first", password: "password123" });
    expect(fake.state.forCalls).toContain("update");
    expect(u.role).toBe("admin");
    expect(fake.state.inserts[0].role).toBe("admin");
  });

  it("refuses when users exist and registration is closed (gate inside the txn)", async () => {
    fake.state.selectResults = [[{ id: 1 }]];
    await expect(registerLocalUser({ username: "late", password: "password123" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(fake.state.inserts).toHaveLength(0);
  });

  it("second user is role user when registration is enabled", async () => {
    fake.state.selectResults = [[{ id: 1 }], [], []];
    const u = await registerLocalUser({ username: "second", password: "password123", allowWhenUsersExist: true });
    expect(u.role).toBe("user");
  });

  it.each([
    ["users.users_name_uniq", "Username already exists"],
    ["users.users_email_uniq", "Email already registered"],
  ])("maps ER_DUP_ENTRY on %s to CONFLICT", async (key, msg) => {
    const mysqlErr = Object.assign(new Error(`Duplicate entry 'x' for key '${key}'`), {
      code: "ER_DUP_ENTRY",
      errno: 1062,
      sqlMessage: `Duplicate entry 'x' for key '${key}'`,
    });
    fake.state.transactionError = Object.assign(new Error("Failed query: insert …"), { cause: mysqlErr });
    await expect(registerLocalUser({ username: "x", password: "password123" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: msg,
    });
  });

  it("maps ER_LOCK_DEADLOCK (concurrent first-user race loser) to CONFLICT", async () => {
    fake.state.transactionError = Object.assign(new Error("Deadlock"), { code: "ER_LOCK_DEADLOCK", errno: 1213 });
    await expect(registerLocalUser({ username: "x", password: "password123" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("H-A9 — seedAdminUser", () => {
  beforeEach(() => {
    process.env.LOCAL_ADMIN_USER = "alice";
    process.env.LOCAL_ADMIN_PASS = "correct-horse";
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("creates the configured user with explicit role admin even when other users exist", async () => {
    // seed lookup → none; txn first-user read → someone exists; name/email checks → none
    fake.state.selectResults = [[], [{ id: 1 }], []];
    await seedAdminUser();
    expect(fake.state.inserts[0]?.role).toBe("admin");
  });

  it("promotes an existing role=user account when LOCAL_ADMIN_PASS matches", async () => {
    fake.state.selectResults = [[{ id: 7, role: "user", passwordHash: HASH }]];
    await seedAdminUser();
    expect(fake.state.updates[0]?.role).toBe("admin");
    expect(fake.state.updates[0]).toHaveProperty("tokenVersion");
  });

  it("does NOT promote a same-named account whose password does not match", async () => {
    process.env.LOCAL_ADMIN_PASS = "something-else";
    fake.state.selectResults = [[{ id: 7, role: "user", passwordHash: HASH }]];
    await seedAdminUser();
    expect(fake.state.updates).toHaveLength(0);
    expect(fake.state.inserts).toHaveLength(0);
  });
});

describe("H-A3 — auth rate limiter", () => {
  beforeEach(() => _resetAuthRateLimits());

  function attempt(ip: string, acct: string) {
    try {
      checkAuthRateLimit("login", ip, acct);
      return null;
    } catch (e) {
      return e as TRPCError;
    }
  }

  it("throws TRPCError TOO_MANY_REQUESTS after 5 attempts on one (ip, account)", () => {
    for (let i = 0; i < 5; i++) expect(attempt("1.1.1.1", "alice")).toBeNull();
    const err = attempt("1.1.1.1", "alice");
    expect(err).toBeInstanceOf(TRPCError);
    expect(err?.code).toBe("TOO_MANY_REQUESTS");
  });

  it("keys the account case-insensitively", () => {
    for (let i = 0; i < 5; i++) attempt("1.1.1.1", i % 2 ? "ALICE" : "alice");
    expect(attempt("1.1.1.1", "Alice")?.code).toBe("TOO_MANY_REQUESTS");
  });

  it("does not lock other accounts / other IPs on the pair limit", () => {
    for (let i = 0; i < 6; i++) attempt("1.1.1.1", "alice");
    expect(attempt("1.1.1.1", "bob")).toBeNull();
    expect(attempt("2.2.2.2", "alice")).toBeNull();
  });

  it("success resets the counter, so legitimate logins never lock anyone out", () => {
    for (let i = 0; i < 50; i++) {
      expect(attempt("10.0.0.1", "alice")).toBeNull();
      recordAuthSuccess("login", "10.0.0.1", "alice");
    }
  });

  it("limits password spraying across accounts from one IP", () => {
    let blocked: TRPCError | null = null;
    for (let i = 0; i < 40 && !blocked; i++) blocked = attempt("3.3.3.3", `user${i}`);
    expect(blocked?.code).toBe("TOO_MANY_REQUESTS");
  });

  it("limits distributed brute force of one account across IPs", () => {
    let blocked: TRPCError | null = null;
    for (let i = 0; i < 40 && !blocked; i++) blocked = attempt(`9.9.9.${i}`, "admin");
    expect(blocked?.code).toBe("TOO_MANY_REQUESTS");
  });
});
