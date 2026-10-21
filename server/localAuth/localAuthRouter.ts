import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import type { TrpcContext } from "../_core/context";
import {
  isLocalAuthMode,
  registerLocalUser,
  loginLocalUser,
  getUserCount,
  issueSessionToken,
} from "./localAuthService";

// ── H-A3: Login / register rate limiter ─────────────────────────────────────
// In-process (the deployment is a single replica). Fixed 15-minute windows.
//
// Buckets (per action — login and register are counted separately):
//   pair:<ip>|<account>  MAX_PER_PAIR    — brute force of one account from one IP
//   ip:<ip>              MAX_PER_IP      — password spraying from one IP
//   acct:<account>       MAX_PER_ACCOUNT — distributed brute force of one account
// <ip> is req.ip (derived from `trust proxy` — never raw X-Forwarded-For);
// <account> is the lowercased username/email.
//
// Every attempt is counted BEFORE the password is verified (so N parallel
// requests cannot all slip through). On success the pair and account buckets
// are reset and the attempt is refunded from the IP bucket — so successful
// logins never lock anyone out (previously 6 successful logins behind a proxy
// locked every analyst out for 15 min), while an attacker cannot wipe the IP
// bucket by interleaving logins to an account they own.
const RATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_PAIR = 5;
const MAX_PER_IP = 30;
const MAX_PER_ACCOUNT = 20;
const MAX_BUCKETS = 50_000; // hard memory bound; oldest windows evicted first

type Bucket = { count: number; windowStart: number };
const RATE_BUCKETS = new Map<string, Bucket>();

type RateAction = "login" | "register";

function rateKeys(action: RateAction, ip: string, account: string) {
  return {
    pair: `${action}:pair:${ip}|${account}`,
    ip: `${action}:ip:${ip}`,
    acct: `${action}:acct:${account}`,
  };
}

function hitBucket(key: string, now: number): Bucket {
  let b = RATE_BUCKETS.get(key);
  if (!b || now - b.windowStart > RATE_WINDOW_MS) {
    if (!b && RATE_BUCKETS.size >= MAX_BUCKETS) {
      const oldest = RATE_BUCKETS.keys().next().value;
      if (oldest !== undefined) RATE_BUCKETS.delete(oldest);
    }
    b = { count: 0, windowStart: now };
    RATE_BUCKETS.delete(key);
    RATE_BUCKETS.set(key, b); // re-insert → Map order ≈ window age
  }
  b.count++;
  return b;
}

/** Count one attempt against all three buckets; throw TOO_MANY_REQUESTS if any is over. */
export function checkAuthRateLimit(action: RateAction, ip: string, rawAccount: string): void {
  const now = Date.now();
  const account = rawAccount.trim().toLowerCase();
  const keys = rateKeys(action, ip, account);
  const limits: Array<[string, number]> = [
    [keys.pair, MAX_PER_PAIR],
    [keys.ip, MAX_PER_IP],
    [keys.acct, MAX_PER_ACCOUNT],
  ];
  let retryAfterMs = 0;
  for (const [key, max] of limits) {
    const b = hitBucket(key, now);
    if (b.count > max) {
      retryAfterMs = Math.max(retryAfterMs, b.windowStart + RATE_WINDOW_MS - now);
    }
  }
  if (retryAfterMs > 0) {
    const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many ${action} attempts. Try again in ${retryAfterSec} seconds.`,
    });
  }
}

/** Successful attempt: reset pair + account buckets, refund one IP attempt. */
export function recordAuthSuccess(action: RateAction, ip: string, rawAccount: string): void {
  const account = rawAccount.trim().toLowerCase();
  const keys = rateKeys(action, ip, account);
  RATE_BUCKETS.delete(keys.pair);
  RATE_BUCKETS.delete(keys.acct);
  const ipBucket = RATE_BUCKETS.get(keys.ip);
  if (ipBucket && ipBucket.count > 0) ipBucket.count--;
}

/** Test hook. */
export function _resetAuthRateLimits(): void {
  RATE_BUCKETS.clear();
}

// Prune stale entries every 10 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  Array.from(RATE_BUCKETS.entries()).forEach(([key, entry]) => {
    if (now - entry.windowStart > RATE_WINDOW_MS) {
      RATE_BUCKETS.delete(key);
    }
  });
}, 10 * 60 * 1000).unref();

/** Trusted client IP: req.ip honours the Express `trust proxy` setting. */
function clientIpOf(req: { ip?: string; socket?: { remoteAddress?: string } }): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

async function setSessionCookie(ctx: TrpcContext, token: string): Promise<void> {
  const { getSessionCookieOptions } = await import("../_core/cookies");
  const { COOKIE_NAME } = await import("@shared/const");
  const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // Audit #15: 24h cookie lifetime
  ctx.res.cookie(COOKIE_NAME, token, {
    ...getSessionCookieOptions(ctx.req),
    maxAge: SESSION_TTL_MS,
  });
}

export const localAuthRouter = router({
  /**
   * Returns the current auth mode and whether registration is available.
   */
  authMode: publicProcedure.query(async () => {
    const isLocal = isLocalAuthMode();
    const userCount = isLocal ? await getUserCount() : 0;
    return {
      mode: "local" as const,
      registrationOpen: isLocal,
      isFirstUser: isLocal && userCount === 0,
      userCount,
    };
  }),

  /**
   * Check if registration is currently open.
   * Open when: no users exist (first user setup), or REGISTRATION_ENABLED=true.
   */
  registrationStatus: publicProcedure.query(async () => {
    const count = await getUserCount();
    const envEnabled = process.env.REGISTRATION_ENABLED === "true";
    return {
      open: count === 0 || envEnabled,
      reason: count === 0
        ? "first_user"
        : envEnabled
          ? "env_enabled"
          : "closed",
      userCount: count,
    };
  }),

  /**
   * Register a new local user (only available in local auth mode).
   * Registration is gated: open only for the first user, or when REGISTRATION_ENABLED=true.
   */
  register: publicProcedure
    .input(
      z.object({
        username: z
          .string()
          .min(3, "Username must be at least 3 characters")
          .max(64, "Username must be at most 64 characters")
          .regex(
            /^[a-zA-Z0-9_.-]+$/,
            "Username can only contain letters, numbers, underscores, dots, and hyphens"
          ),
        email: z.string().email("Invalid email address").optional(),
        password: z
          .string()
          .min(8, "Password must be at least 8 characters")
          .max(128, "Password must be at most 128 characters"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!isLocalAuthMode()) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Registration is currently disabled." });
      }

      // H-A3: same limiter as login (register costs a bcrypt(12) hash)
      const clientIp = clientIpOf(ctx.req);
      checkAuthRateLimit("register", clientIp, input.username);

      // CR-3: Gate registration after first admin unless explicitly enabled.
      // This pre-check is only a cheap fast-fail before bcrypt; the
      // authoritative check runs inside registerLocalUser's transaction under
      // the same FOR UPDATE lock that decides first-user-admin (C3).
      const registrationEnabled = process.env.REGISTRATION_ENABLED === "true";
      if (!registrationEnabled && (await getUserCount()) > 0) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Registration is closed. Contact an administrator for an account.",
        });
      }

      const result = await registerLocalUser({
        username: input.username,
        email: input.email,
        password: input.password,
        allowWhenUsersExist: registrationEnabled,
      });
      recordAuthSuccess("register", clientIp, input.username);

      // Auto-login after registration: mint directly (no second bcrypt round)
      await setSessionCookie(ctx, await issueSessionToken(result));

      return {
        success: true,
        user: result,
        isFirstUser: result.role === "admin",
      };
    }),

  /**
   * Login with username/email + password (only available in local auth mode).
   */
  login: publicProcedure
    .input(
      z.object({
        username: z.string().min(1, "Username is required").max(320),
        password: z.string().min(1, "Password is required").max(128),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!isLocalAuthMode()) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Login is currently disabled." });
      }

      // Audit #25 + S-5 + H-A3: Rate limit per (IP, account), IP and account.
      // Uses ctx.req.ip which respects Express trust proxy setting (TRUST_PROXY env var).
      // Never read raw X-Forwarded-For — attacker-controlled without a trusted proxy.
      const clientIp = clientIpOf(ctx.req);
      checkAuthRateLimit("login", clientIp, input.username);

      const result = await loginLocalUser(input);
      recordAuthSuccess("login", clientIp, input.username);

      await setSessionCookie(ctx, result.token);

      return {
        success: true,
        user: result.user,
      };
    }),
});
