import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../_core/trpc";
import {
  isLocalAuthMode,
  registerLocalUser,
  loginLocalUser,
  getUserCount,
} from "./localAuthService";

// ── Audit #25: Login rate limiter ────────────────────────────────────────────
// In-memory sliding window: max 5 attempts per IP per 15 minutes.
const LOGIN_ATTEMPTS = new Map<string, { count: number; windowStart: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginRateLimit(ip: string): void {
  const now = Date.now();
  const entry = LOGIN_ATTEMPTS.get(ip);
  if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
    LOGIN_ATTEMPTS.set(ip, { count: 1, windowStart: now });
    return;
  }
  entry.count++;
  if (entry.count > MAX_LOGIN_ATTEMPTS) {
    const retryAfterSec = Math.ceil((entry.windowStart + LOGIN_WINDOW_MS - now) / 1000);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Too many login attempts. Try again in ${retryAfterSec} seconds.`,
    });
  }
}

// Prune stale entries every 10 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  Array.from(LOGIN_ATTEMPTS.entries()).forEach(([ip, entry]) => {
    if (now - entry.windowStart > LOGIN_WINDOW_MS) {
      LOGIN_ATTEMPTS.delete(ip);
    }
  });
}, 10 * 60 * 1000).unref();

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
   * Register a new local user (only available in local auth mode).
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

      const result = await registerLocalUser(input);

      // Auto-login after registration: set session cookie
      const loginResult = await loginLocalUser({
        username: input.username,
        password: input.password,
      });

      const { getSessionCookieOptions } = await import("../_core/cookies");
      const { COOKIE_NAME, ONE_YEAR_MS } = await import("@shared/const");
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, loginResult.token, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

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
        username: z.string().min(1, "Username is required"),
        password: z.string().min(1, "Password is required"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!isLocalAuthMode()) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Login is currently disabled." });
      }

      // Audit #25: Rate limit login attempts per IP
      const clientIp = ctx.req.ip || ctx.req.socket.remoteAddress || "unknown";
      checkLoginRateLimit(clientIp);

      const result = await loginLocalUser(input);

      // Set session cookie
      const { getSessionCookieOptions } = await import("../_core/cookies");
      const { COOKIE_NAME, ONE_YEAR_MS } = await import("@shared/const");
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, result.token, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      return {
        success: true,
        user: result.user,
      };
    }),
});
