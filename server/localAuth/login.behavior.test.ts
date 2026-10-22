/**
 * Login / registration / session behavior (H-T3) — DB-gated.
 *
 * Drives the real tRPC procedures (appRouter.createCaller) against the
 * migrated test database: bcrypt, JWT signing, the in-process rate limiter and
 * DB-backed revocation all run for real. Nothing is mocked.
 */
import { afterAll, beforeEach, expect, it, vi } from "vitest";

// ENV.cookieSecret is captured when _core/env loads — set it before importing.
vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-that-is-long-enough-32chars";
});

import { randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { appRouter } from "../routers";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { COOKIE_NAME } from "../../shared/const";
import { sdk } from "../_core/sdk";
import { _resetAuthRateLimits } from "./localAuthRouter";
import { INVALID_CREDENTIALS_MSG } from "./localAuthService";
import { describeWithDb } from "../testHelpers/requireDb";
import { makeTrpcContext, requestWithCookie } from "../testHelpers/trpcContext";

const PASSWORD = "Behavior-Test-Pass-1!";
const created: string[] = [];

function uniqueName(prefix: string): string {
  const name = `${prefix}_${randomBytes(4).toString("hex")}`;
  created.push(name);
  return name;
}

async function captureError(p: Promise<unknown>): Promise<TRPCError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(TRPCError);
    return err as TRPCError;
  }
  throw new Error("expected the call to throw");
}

async function registerUser(name: string, ip = "198.51.100.1") {
  const prev = process.env.REGISTRATION_ENABLED;
  process.env.REGISTRATION_ENABLED = "true";
  try {
    const { ctx } = makeTrpcContext({ ip });
    return await appRouter.createCaller(ctx).localAuth.register({ username: name, password: PASSWORD });
  } finally {
    if (prev === undefined) delete process.env.REGISTRATION_ENABLED;
    else process.env.REGISTRATION_ENABLED = prev;
  }
}

describeWithDb("localAuth: register → login → session → logout (real DB)", () => {
  beforeEach(() => {
    _resetAuthRateLimits();
  });

  afterAll(async () => {
    const db = await getDb();
    if (db && created.length) await db.delete(users).where(inArray(users.name, created));
  });

  it("refuses registration when users exist and REGISTRATION_ENABLED is not 'true'", async () => {
    const prev = process.env.REGISTRATION_ENABLED;
    delete process.env.REGISTRATION_ENABLED;
    try {
      const { ctx } = makeTrpcContext({ ip: "198.51.100.2" });
      const err = await captureError(
        appRouter.createCaller(ctx).localAuth.register({ username: uniqueName("closed"), password: PASSWORD })
      );
      expect(err.code).toBe("FORBIDDEN");
    } finally {
      if (prev !== undefined) process.env.REGISTRATION_ENABLED = prev;
    }
  });

  it("registers a non-admin user when REGISTRATION_ENABLED=true and sets a session cookie", async () => {
    const name = uniqueName("reg");
    const prev = process.env.REGISTRATION_ENABLED;
    process.env.REGISTRATION_ENABLED = "true";
    try {
      const { ctx, setCookies } = makeTrpcContext({ ip: "198.51.100.3" });
      const res = await appRouter.createCaller(ctx).localAuth.register({ username: name, password: PASSWORD });
      expect(res.success).toBe(true);
      expect(res.user.role).toBe("user"); // fixture users already exist → never first-user admin
      expect(res.isFirstUser).toBe(false);
      expect(setCookies.map((c) => c.name)).toEqual([COOKIE_NAME]);
      expect(setCookies[0].options).toMatchObject({ httpOnly: true });
    } finally {
      if (prev === undefined) delete process.env.REGISTRATION_ENABLED;
      else process.env.REGISTRATION_ENABLED = prev;
    }

    const db = (await getDb())!;
    const [row] = await db.select().from(users).where(eq(users.name, name));
    expect(row.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(row.passwordHash).not.toContain(PASSWORD);
  });

  it("login succeeds with the right password and mints a JWT carrying tv = users.tokenVersion", async () => {
    const name = uniqueName("login");
    await registerUser(name);

    const { ctx, setCookies } = makeTrpcContext({ ip: "198.51.100.4" });
    const res = await appRouter.createCaller(ctx).localAuth.login({ username: name, password: PASSWORD });
    expect(res.success).toBe(true);
    expect(res.user.name).toBe(name);

    const token = setCookies.find((c) => c.name === COOKIE_NAME)?.value;
    expect(token).toBeTruthy();
    const session = await sdk.verifySession(token);
    expect(session).not.toBeNull();

    const db = (await getDb())!;
    const [row] = await db.select().from(users).where(eq(users.name, name));
    expect(session!.tv).toBe(row.tokenVersion);
    expect(session!.openId).toBe(row.openId);

    const authed = await sdk.authenticateRequest(requestWithCookie(`${COOKIE_NAME}=${token}`));
    expect(authed.id).toBe(row.id);
  });

  it("wrong password and unknown user fail with the identical UNAUTHORIZED message", async () => {
    const name = uniqueName("enum");
    await registerUser(name);

    const caller = appRouter.createCaller(makeTrpcContext({ ip: "198.51.100.5" }).ctx);
    const wrongPw = await captureError(caller.localAuth.login({ username: name, password: "not-the-password" }));
    const noUser = await captureError(
      caller.localAuth.login({ username: `nobody_${randomBytes(4).toString("hex")}`, password: PASSWORD })
    );

    expect(wrongPw.code).toBe("UNAUTHORIZED");
    expect(noUser.code).toBe("UNAUTHORIZED");
    expect(wrongPw.message).toBe(INVALID_CREDENTIALS_MSG);
    expect(noUser.message).toBe(wrongPw.message);
  });

  it("rate-limits repeated failures for one (IP, account) pair with TOO_MANY_REQUESTS", async () => {
    const name = uniqueName("rl");
    await registerUser(name);
    const caller = appRouter.createCaller(makeTrpcContext({ ip: "198.51.100.6" }).ctx);

    // MAX_PER_PAIR = 5 attempts per 15-minute window
    for (let i = 0; i < 5; i++) {
      const err = await captureError(caller.localAuth.login({ username: name, password: `wrong-${i}` }));
      expect(err.code).toBe("UNAUTHORIZED");
    }
    const limited = await captureError(caller.localAuth.login({ username: name, password: PASSWORD }));
    expect(limited.code).toBe("TOO_MANY_REQUESTS");

    // A different source IP is a different pair (account bucket allows 20)
    const other = appRouter.createCaller(makeTrpcContext({ ip: "198.51.100.7" }).ctx);
    const ok = await other.localAuth.login({ username: name, password: PASSWORD });
    expect(ok.success).toBe(true);
  }, 30_000);

  it("logout bumps tokenVersion and the old token is rejected afterwards", async () => {
    const name = uniqueName("logout");
    await registerUser(name);
    const login = makeTrpcContext({ ip: "198.51.100.8" });
    await appRouter.createCaller(login.ctx).localAuth.login({ username: name, password: PASSWORD });
    const token = login.setCookies.find((c) => c.name === COOKIE_NAME)!.value!;
    const cookieHeader = `${COOKIE_NAME}=${token}`;

    const db = (await getDb())!;
    const [before] = await db.select().from(users).where(eq(users.name, name));
    const authedUser = await sdk.authenticateRequest(requestWithCookie(cookieHeader));
    expect(authedUser.id).toBe(before.id);

    const out = makeTrpcContext({ user: authedUser, cookieHeader, ip: "198.51.100.8" });
    expect(await appRouter.createCaller(out.ctx).auth.logout()).toEqual({ success: true });
    expect(out.clearedCookies.map((c) => c.name)).toEqual([COOKIE_NAME]);

    const [after] = await db.select().from(users).where(eq(users.name, name));
    expect(after.tokenVersion).toBe(before.tokenVersion + 1);

    // Signature still verifies, but the session is no longer current
    await expect(sdk.authenticateRequest(requestWithCookie(cookieHeader))).rejects.toThrow(/revoked/i);

    // A fresh login works and carries the new version
    _resetAuthRateLimits();
    const again = makeTrpcContext({ ip: "198.51.100.8" });
    await appRouter.createCaller(again.ctx).localAuth.login({ username: name, password: PASSWORD });
    const fresh = await sdk.verifySession(again.setCookies.find((c) => c.name === COOKIE_NAME)!.value);
    expect(fresh!.tv).toBe(after.tokenVersion);
  });
});
