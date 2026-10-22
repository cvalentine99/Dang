import { beforeEach, describe, expect, it, vi } from "vitest";

// ENV.cookieSecret is read at module load — set it before importing the router.
vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-that-is-long-enough-32chars";
});

// Minimal db mock: logout's revocation is a single UPDATE … SET tokenVersion = tokenVersion + 1.
const dbCalls = vi.hoisted(() => ({
  updates: [] as Array<{ table: unknown; set: Record<string, unknown>; where: unknown }>,
}));
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn(async () => ({
      update: (table: unknown) => ({
        set: (set: Record<string, unknown>) => ({
          where: async (where: unknown) => {
            dbCalls.updates.push({ table, set, where });
            return [{ affectedRows: 1 }];
          },
        }),
      }),
    })),
  };
});

import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import { sdk } from "./_core/sdk";
import { users } from "../drizzle/schema";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(cookieHeader?: string): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "local",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    passwordHash: null,
    isDisabled: 0,
    tokenVersion: 0,
    passwordChangedAt: null,
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      secure: true,
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  beforeEach(() => {
    dbCalls.updates.length = 0;
  });

  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({
      maxAge: -1,
      secure: true,
      sameSite: "lax", // Audit #12: hardened to Lax
      httpOnly: true,
      path: "/",
    });
  });

  it("revokes a VERIFIED session by bumping users.tokenVersion", async () => {
    const token = await sdk.signSession({
      openId: "sample-user",
      appId: process.env.VITE_APP_ID || "dang-local",
      name: "Sample User",
      tv: 3,
    });
    const { ctx, clearedCookies } = createAuthContext(`${COOKIE_NAME}=${token}`);
    const result = await appRouter.createCaller(ctx).auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(dbCalls.updates).toHaveLength(1);
    expect(dbCalls.updates[0].table).toBe(users);
    // SET tokenVersion = tokenVersion + 1 (an SQL expression, not a literal)
    expect(Object.keys(dbCalls.updates[0].set)).toEqual(["tokenVersion"]);
    expect(typeof dbCalls.updates[0].set.tokenVersion).toBe("object");
    expect(dbCalls.updates[0].where).toBeDefined();
  });

  it("never touches the DB (or stores anything) for an unverified cookie", async () => {
    const junk = "x".repeat(4096);
    const { ctx, clearedCookies } = createAuthContext(`${COOKIE_NAME}=${junk}`);
    const result = await appRouter.createCaller(ctx).auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(dbCalls.updates).toHaveLength(0);
  });

  it("does not revoke a token that lacks the tv claim (pre-upgrade token)", async () => {
    const { SignJWT } = await import("jose");
    const appId = process.env.VITE_APP_ID || "dang-local";
    const legacy = await new SignJWT({ openId: "sample-user", appId, name: "Sample User" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .setIssuer("dang-siem")
      .setAudience(appId)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    expect(await sdk.verifySession(legacy)).toBeNull();

    const { ctx } = createAuthContext(`${COOKIE_NAME}=${legacy}`);
    await appRouter.createCaller(ctx).auth.logout();
    expect(dbCalls.updates).toHaveLength(0);
  });
});
