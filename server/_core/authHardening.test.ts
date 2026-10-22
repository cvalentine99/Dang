/**
 * Phase 1 auth hardening — unit tests (no DB).
 *  - P2-10: tokenVersion / passwordChangedAt session currency
 *  - M1:    tRPC errorFormatter (stack stripped, internal messages masked in prod)
 *  - M7:    cookie `secure` from NODE_ENV / req.secure, never raw X-Forwarded-Proto
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-that-is-long-enough-32chars";
});

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { isSessionCurrent, passwordChangedAtNow, sdk } from "./sdk";
import { router, publicProcedure } from "./trpc";
import { getSessionCookieOptions } from "./cookies";
import type { TrpcContext } from "./context";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  delete process.env.COOKIE_SECURE;
});

describe("P2-10 session currency", () => {
  const nowSec = Math.floor(Date.now() / 1000);

  it("accepts a token whose tv matches and that postdates passwordChangedAt", () => {
    expect(isSessionCurrent({ tv: 2, iat: nowSec }, { tokenVersion: 2, passwordChangedAt: null })).toBe(true);
    expect(
      isSessionCurrent({ tv: 2, iat: nowSec }, { tokenVersion: 2, passwordChangedAt: new Date((nowSec - 60) * 1000) })
    ).toBe(true);
  });

  it("rejects a token whose tv is behind the row (logout / reset / role change / disable)", () => {
    expect(isSessionCurrent({ tv: 1, iat: nowSec }, { tokenVersion: 2, passwordChangedAt: null })).toBe(false);
  });

  it("rejects a token issued before passwordChangedAt", () => {
    expect(
      isSessionCurrent({ tv: 0, iat: nowSec - 120 }, { tokenVersion: 0, passwordChangedAt: new Date(nowSec * 1000) })
    ).toBe(false);
  });

  it("accepts a login in the same second as the reset (passwordChangedAt is second-truncated)", () => {
    const changed = passwordChangedAtNow();
    expect(changed.getTime() % 1000).toBe(0);
    const iat = Math.floor(Date.now() / 1000);
    expect(isSessionCurrent({ tv: 1, iat }, { tokenVersion: 1, passwordChangedAt: changed })).toBe(true);
  });

  it("signSession embeds tv and verifySession returns it; tv is mandatory", async () => {
    const appId = process.env.VITE_APP_ID || "dang-local";
    const token = await sdk.signSession({ openId: "o1", appId, name: "n", tv: 7 });
    const s = await sdk.verifySession(token);
    expect(s?.tv).toBe(7);
    expect(typeof s?.iat).toBe("number");
    await expect(
      // @ts-expect-error tv is required
      sdk.signSession({ openId: "o1", appId, name: "n" })
    ).rejects.toThrow(/tv/);
  });

  it("sdk no longer exposes an in-memory blocklist", () => {
    expect((sdk as unknown as Record<string, unknown>).blockToken).toBeUndefined();
  });
});

describe("M1 errorFormatter", () => {
  const testRouter = router({
    boom: publicProcedure.query(() => {
      throw new Error("ECONNREFUSED 10.0.0.5:3306 secret-internal-detail");
    }),
    deliberate: publicProcedure.query(() => {
      throw new TRPCError({ code: "CONFLICT", message: "Username already exists" });
    }),
    deliberateInternal: publicProcedure.query(() => {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    }),
    validated: publicProcedure.input(z.object({ n: z.number() })).query(() => 1),
  });
  const ctx = { user: null, req: { headers: {} }, res: {} } as unknown as TrpcContext;

  async function shapeOf(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      const err = e as TRPCError;
      // createCaller surfaces the raw error; run it through the router's formatter
      const formatter = testRouter._def._config.errorFormatter;
      return formatter({
        error: err,
        type: "query",
        path: "x",
        input: undefined,
        ctx,
        shape: {
          message: err.message,
          code: -32603,
          data: { code: err.code, httpStatus: 500, path: "x", stack: err.stack },
        },
      } as never) as { message: string; data: Record<string, unknown> };
    }
    throw new Error("expected error");
  }

  it("always strips data.stack", async () => {
    process.env.NODE_ENV = "development";
    const caller = testRouter.createCaller(ctx);
    const shape = await shapeOf(() => caller.boom());
    expect(shape.data.stack).toBeUndefined();
  });

  it("masks non-TRPCError messages in production", async () => {
    process.env.NODE_ENV = "production";
    const caller = testRouter.createCaller(ctx);
    expect((await shapeOf(() => caller.boom())).message).toBe("Internal error");
  });

  it("keeps deliberate TRPCError messages in production", async () => {
    process.env.NODE_ENV = "production";
    const caller = testRouter.createCaller(ctx);
    expect((await shapeOf(() => caller.deliberate())).message).toBe("Username already exists");
    expect((await shapeOf(() => caller.deliberateInternal())).message).toBe("Database not available");
    const v = await shapeOf(() => caller.validated({ n: "x" } as never));
    expect(v.message).not.toBe("Internal error");
  });
});

describe("M7 cookie secure flag", () => {
  const req = (over: Record<string, unknown>) => ({ headers: {}, ...over }) as never;

  it("ignores a spoofed X-Forwarded-Proto when the request is not secure", () => {
    process.env.NODE_ENV = "development";
    const opts = getSessionCookieOptions(req({ secure: false, protocol: "http", headers: { "x-forwarded-proto": "https" } }));
    expect(opts.secure).toBe(false);
  });

  it("follows req.secure (which honours trust proxy)", () => {
    process.env.NODE_ENV = "development";
    expect(getSessionCookieOptions(req({ secure: true })).secure).toBe(true);
  });

  it("is always secure in production unless COOKIE_SECURE=false", () => {
    process.env.NODE_ENV = "production";
    expect(getSessionCookieOptions(req({ secure: false })).secure).toBe(true);
    process.env.COOKIE_SECURE = "false";
    expect(getSessionCookieOptions(req({ secure: false })).secure).toBe(false);
    expect(getSessionCookieOptions(req({ secure: true })).secure).toBe(true);
  });
});
