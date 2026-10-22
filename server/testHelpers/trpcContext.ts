/**
 * Minimal Express-shaped tRPC context for `appRouter.createCaller(ctx)` in
 * behavioral tests. Captures cookies the procedure sets/clears.
 */
import type { TrpcContext } from "../_core/context";
import type { User } from "../../drizzle/schema";

export type CookieRecord = { name: string; value?: string; options: Record<string, unknown> };

export function makeTrpcContext(opts: {
  user?: User | null;
  ip?: string;
  cookieHeader?: string;
} = {}): { ctx: TrpcContext; setCookies: CookieRecord[]; clearedCookies: CookieRecord[] } {
  const setCookies: CookieRecord[] = [];
  const clearedCookies: CookieRecord[] = [];
  const ip = opts.ip ?? "203.0.113.10";
  const ctx: TrpcContext = {
    user: opts.user ?? null,
    req: {
      ip,
      protocol: "https",
      secure: true,
      socket: { remoteAddress: ip },
      headers: opts.cookieHeader ? { cookie: opts.cookieHeader } : {},
    } as unknown as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        setCookies.push({ name, value, options });
      },
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as unknown as TrpcContext["res"],
  };
  return { ctx, setCookies, clearedCookies };
}

/** A request object for sdk.authenticateRequest() carrying one cookie. */
export function requestWithCookie(cookieHeader: string): Parameters<
  typeof import("../_core/sdk").sdk.authenticateRequest
>[0] {
  return { headers: { cookie: cookieHeader } } as unknown as Parameters<
    typeof import("../_core/sdk").sdk.authenticateRequest
  >[0];
}
