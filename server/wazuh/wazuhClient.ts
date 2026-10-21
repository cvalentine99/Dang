/**
 * Wazuh API Client — server-side only.
 *
 * Authentication protocol (Wazuh 4.x):
 *
 *   Step 1 — Authenticate with Basic Auth (no request body):
 *     POST /security/user/authenticate
 *     Authorization: Basic base64(user:pass)
 *     → Returns { data: { token: "<JWT>", exp: <unix_epoch> } }
 *
 *   Step 2 — Use JWT Bearer token on ALL subsequent API requests:
 *     Authorization: Bearer <JWT>
 *
 *   JWT tokens are NOT refreshable. On expiry or 401, the client
 *   must re-authenticate from scratch and retry the failed request once.
 *
 * Why JWT is required:
 *   Wazuh does NOT support Basic Auth on protected endpoints. Only the
 *   /security/user/authenticate endpoint accepts Basic Auth. Every other
 *   endpoint requires a Bearer JWT obtained from that endpoint.
 *
 * Why /authenticate has no body:
 *   The Wazuh authentication endpoint derives credentials solely from the
 *   Authorization header. Sending any request body (even empty JSON `{}`)
 *   violates the API contract and may cause authentication failures.
 *
 * Rate limiting:
 *   Two layers enforce fair usage:
 *   1. Global rate limit — hard ceiling per endpoint group (protects Wazuh)
 *   2. Per-user rate limit — prevents a single analyst from exhausting the
 *      shared budget. Keyed by ctx.user.id passed through WazuhGetOptions.
 *
 * Responsibilities:
 * - Manage JWT token lifecycle (obtain, cache, refresh)
 * - Enforce read-only access (GET only)
 * - Apply global + per-user rate limiting
 * - Strip sensitive fields before returning data
 * - Never expose tokens to the browser
 * - Fail closed on auth/network errors
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import { TRPCError } from "@trpc/server";
import { connectionFingerprint } from "./requestCache";
import { sharedHttpsAgent } from "../_core/tlsAgent";
import { sanitizeUpstreamError, UPSTREAM_AXIOS_LIMITS } from "./upstreamError";


/**
 * Extract meaningful error detail from Axios errors instead of losing
 * the actual failure reason (ECONNREFUSED, ETIMEDOUT, 401, 403, TLS, etc.).
 *
 * M1: this string can contain up to 200 chars of the upstream body — it is for
 * SERVER-SIDE diagnostics only. Client-facing paths use sanitizeUpstreamError()
 * (see ./upstreamError), which logs the detail under a correlation id and
 * returns only `Wazuh upstream error (HTTP n) [id]`.
 */
export function extractWazuhErrorDetail(err: unknown): string {
  // S-10: Sanitize error messages — log full detail server-side, return safe summary to client.
  // Never expose internal hostnames, IPs, or URLs in client-facing error messages.
  if (axios.isAxiosError(err)) {
    const ae = err as AxiosError;
    const fullUrl = ae.config?.url ?? ae.config?.baseURL ?? "unknown";
    console.error(`[WazuhClient] Axios error: ${ae.code ?? ae.response?.status} at ${fullUrl}`, ae.message);

    if (ae.response) {
      const status = ae.response.status;
      const body = typeof ae.response.data === "object" && ae.response.data !== null
        ? JSON.stringify(ae.response.data).slice(0, 200)
        : String(ae.response.data ?? "").slice(0, 200);
      return `Wazuh API returned HTTP ${status} — ${body}`;
    }
    if (ae.code === "ECONNREFUSED") return "Connection refused — is Wazuh Manager running?";
    if (ae.code === "ETIMEDOUT" || ae.code === "ECONNABORTED") return "Connection timed out — network issue or firewall";
    if (ae.code === "ENOTFOUND") return "DNS resolution failed — check Wazuh hostname in connection settings";
    if (ae.code === "CERT_HAS_EXPIRED" || ae.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") return `TLS certificate error: ${ae.code}`;
    if (ae.code) return `Network error: ${ae.code}`;
    return "Unknown connection error";
  }
  console.error(`[WazuhClient] Non-Axios error:`, (err as Error)?.message);
  return "Wazuh API error — check server logs for details";
}

// ── Token state ───────────────────────────────────────────────────────────────
// We store the JWT and its expiration from the Wazuh API response.
// A 60-second buffer ensures we re-authenticate before actual expiry.
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

interface CachedToken {
  jwt: string;
  expiresAt: number; // Date.now()-based epoch ms
}

/**
 * M3: JWTs are cached per connection identity, never globally — after a
 * settings change a token minted by host A must never be sent to host B.
 * Key = `${host}:${port}:${user}` plus a short SHA-256 fingerprint of the
 * password, so a password rotation also misses the old entry automatically.
 */
const tokenCache = new Map<string, CachedToken>();

/**
 * M3: in-flight authentication per key. N concurrent cache misses (e.g. the
 * ~8 parallel queries the /agents page fires) share ONE POST /authenticate.
 */
const inflightAuth = new Map<string, Promise<string>>();

/** Bumped by invalidateWazuhToken(); an auth that started before the bump never repopulates the cache. */
let tokenGeneration = 0;

/** Cache key for a Wazuh connection identity (see connectionFingerprint). */
export function wazuhConnectionKey(config: Pick<WazuhConfig, "host" | "port" | "user" | "pass">): string {
  return connectionFingerprint(config);
}

/**
 * Drop every cached JWT and in-flight authentication.
 *
 * Call site: the Wazuh connection-settings save/reset path
 * (server/admin/connectionSettingsRouter.ts `updateSettings` / `resetSettings`
 * for category "wazuh"). That file is outside this change set, so the call is
 * NOT yet wired there; correctness does not depend on it because the cache
 * key includes host, port, user and a password fingerprint — a changed
 * setting simply misses. Calling it additionally frees the stale entries.
 */
export function invalidateWazuhToken(): void {
  tokenGeneration++;
  tokenCache.clear();
  inflightAuth.clear();
  console.log("[Wazuh Auth] All cached tokens invalidated");
}

// ── Rate-limit state ────────────────────────────────────────────────────────

interface RateBucket {
  count: number;
  resetAt: number;
}

// Global rate limit state (per endpoint group)
const globalRateLimitState: Record<string, RateBucket> = {};

// Per-user rate limit state: key = `${userId}:${group}`
const perUserRateLimitState: Record<string, RateBucket> = {};

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

/**
 * M6: drop expired buckets so per-user state cannot grow without bound
 * (one entry per user×group ever seen). Runs at most once per window.
 */
let lastRateLimitPruneAt = 0;
function pruneRateLimitState(now: number): void {
  if (now - lastRateLimitPruneAt < RATE_LIMIT_WINDOW_MS) return;
  lastRateLimitPruneAt = now;
  for (const state of [perUserRateLimitState, globalRateLimitState]) {
    for (const key of Object.keys(state)) {
      if (now > state[key].resetAt) delete state[key];
    }
  }
}

// Global limits per endpoint group (hard ceiling — protects Wazuh)
const GLOBAL_RATE_LIMITS: Record<string, number> = {
  default: 60,
  alerts: 30,
  vulnerabilities: 20,
  syscheck: 20,
  readiness: 10, // Low ceiling — readiness checks are lightweight and periodic
};

// Per-user limits per endpoint group (fraction of global — ensures fairness)
const PER_USER_RATE_LIMITS: Record<string, number> = {
  default: 50, // Pages like /agents fire 8+ queries on load; 30 was too tight
  alerts: 15,
  vulnerabilities: 10,
  syscheck: 10,
  readiness: 5, // Low per-user ceiling — readiness polls every 30s
};

/**
 * Check the global rate limit for an endpoint group.
 * Throws if the global ceiling is exceeded.
 */
function checkGlobalRateLimit(group: string): { retryAfterSeconds: number } | null {
  const limit = GLOBAL_RATE_LIMITS[group] ?? GLOBAL_RATE_LIMITS.default;
  const now = Date.now();
  if (!globalRateLimitState[group] || now > globalRateLimitState[group].resetAt) {
    globalRateLimitState[group] = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }
  globalRateLimitState[group].count++;
  if (globalRateLimitState[group].count > limit) {
    return { retryAfterSeconds: Math.ceil((globalRateLimitState[group].resetAt - now) / 1000) };
  }
  return null;
}

/**
 * Check the per-user rate limit for an endpoint group.
 * Throws if the user's individual budget is exceeded.
 */
function checkPerUserRateLimit(userId: string | number, group: string): { retryAfterSeconds: number } | null {
  const limit = PER_USER_RATE_LIMITS[group] ?? PER_USER_RATE_LIMITS.default;
  const key = `${userId}:${group}`;
  const now = Date.now();
  if (!perUserRateLimitState[key] || now > perUserRateLimitState[key].resetAt) {
    perUserRateLimitState[key] = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }
  perUserRateLimitState[key].count++;
  if (perUserRateLimitState[key].count > limit) {
    return { retryAfterSeconds: Math.ceil((perUserRateLimitState[key].resetAt - now) / 1000) };
  }
  return null;
}

/**
 * Enforce both global and per-user rate limits.
 * Per-user is checked first so individual analysts get a clear signal
 * before the global ceiling is hit.
 */
function checkRateLimit(group: string, userId?: string | number): void {
  pruneRateLimitState(Date.now());
  // Per-user check (if userId is provided — it will be for all protectedProcedure calls)
  if (userId !== undefined) {
    const perUserResult = checkPerUserRateLimit(userId, group);
    if (perUserResult) {
      // M6: 429, not a generic 500
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message:
        `Per-user rate limit exceeded for endpoint group '${group}'. ` +
        `Retry-After: ${perUserResult.retryAfterSeconds}s. ` +
        `Your individual limit is ${PER_USER_RATE_LIMITS[group] ?? PER_USER_RATE_LIMITS.default} requests per minute.`,
      });
    }
  }

  // Global check (always enforced)
  const globalResult = checkGlobalRateLimit(group);
  if (globalResult) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message:
      `Global rate limit exceeded for endpoint group '${group}'. ` +
      `Retry-After: ${globalResult.retryAfterSeconds}s. ` +
      `The system-wide limit is ${GLOBAL_RATE_LIMITS[group] ?? GLOBAL_RATE_LIMITS.default} requests per minute.`,
    });
  }
}

// ── Sensitive fields to strip from all responses ──────────────────────────────
const STRIP_FIELDS = new Set([
  "apikey",
  "api_token",
  "hec_token",
  "rbac_token",
  "private_key",
  "passphrase",
  "password",
  "token",
  "secret",
  "api_key",
  "auth",
  "credential",
]);

/**
 * L5: any key CONTAINING one of these (case-insensitive) is stripped, so
 * variants like `authToken`, `client_secret`, `PasswordHash` are caught
 * without enumerating them. Bare `key` is deliberately NOT here: the admin
 * agentKey endpoint returns its payload under `key`.
 */
const STRIP_SUBSTRINGS = ["token", "secret", "password"];

/**
 * Non-secret fields that happen to contain a STRIP_SUBSTRINGS word (Wazuh
 * `/security/config` returns token lifetimes the Security page shows).
 */
const STRIP_SUBSTRING_EXCEPTIONS = new Set(["auth_token_exp_timeout", "rbac_mode"]);

export function isSensitiveFieldName(key: string): boolean {
  const k = key.toLowerCase();
  if (STRIP_FIELDS.has(k)) return true;
  if (STRIP_SUBSTRING_EXCEPTIONS.has(k)) return false;
  return STRIP_SUBSTRINGS.some(sub => k.includes(sub));
}

function stripSensitiveFields(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(stripSensitiveFields);
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (!isSensitiveFieldName(k)) {
        result[k] = stripSensitiveFields(v);
      }
    }
    return result;
  }
  return obj;
}

// ── Axios instance — TLS policy controlled by SKIP_TLS_VERIFY env flag ────────
function createAxiosInstance(baseURL: string): AxiosInstance {
  return axios.create({
    baseURL,
    timeout: 8_000,
    httpsAgent: sharedHttpsAgent,
    ...UPSTREAM_AXIOS_LIMITS,
    // NOTE: Do NOT set a default Content-Type here. The /security/user/authenticate
    // endpoint must receive NO body and NO Content-Type. GET requests also don't
    // need one. Axios sets Content-Type automatically when a body is present.
  });
}

// ── Token management ──────────────────────────────────────────────────────────

/** Perform POST /security/user/authenticate (no body — Basic auth header only). */
async function authenticate(baseURL: string, user: string, pass: string): Promise<CachedToken> {
  const instance = createAxiosInstance(baseURL);

  // CRITICAL: The Wazuh /security/user/authenticate endpoint accepts
  // ONLY Basic Auth in the header. It requires NO request body at all.
  // Sending any body (even empty JSON `{}`) violates the API contract.
  const response = await instance.post(
    "/security/user/authenticate",
    undefined, // No body — Wazuh auth accepts credentials in the header only
    { auth: { username: user, password: pass } }
  );

  const token: string = response.data?.data?.token;
  if (!token) throw new Error("Wazuh authentication failed: no token returned");

  // Parse expiration from the API response. Wazuh returns exp as unix epoch seconds.
  // Fall back to 840 seconds (14 min) if exp is missing, which is under the default 900s.
  const expEpochSeconds: number | undefined = response.data?.data?.exp;
  const expiresAt = expEpochSeconds
    ? expEpochSeconds * 1000 // Convert seconds → ms
    : Date.now() + 840_000; // Fallback: 840s

  console.log("[Wazuh Auth] JWT obtained successfully (expires in %ds)",
    Math.round((expiresAt - Date.now()) / 1000));
  return { jwt: token, expiresAt };
}

/** Remove expired tokens so the per-key map stays bounded. */
function pruneExpiredTokens(now: number): void {
  for (const [k, t] of Array.from(tokenCache.entries())) {
    if (now >= t.expiresAt - TOKEN_EXPIRY_BUFFER_MS) tokenCache.delete(k);
  }
}

/**
 * Returns a valid JWT for this connection identity, re-authenticating only
 * when the cached token is missing or expired. Concurrent misses for the same
 * key share one in-flight authentication.
 */
async function getToken(baseURL: string, key: string, user: string, pass: string): Promise<string> {
  const cached = tokenCache.get(key);
  if (cached && Date.now() < cached.expiresAt - TOKEN_EXPIRY_BUFFER_MS) return cached.jwt;

  const pending = inflightAuth.get(key);
  if (pending) return pending;

  console.log("[Wazuh Auth] %s — calling POST /security/user/authenticate",
    cached ? "Token expired, re-authenticating" : "Initial authentication");

  const generation = tokenGeneration;
  const promise = authenticate(baseURL, user, pass)
    .then((tok) => {
      if (generation === tokenGeneration) {
        pruneExpiredTokens(Date.now());
        tokenCache.set(key, tok);
      }
      return tok.jwt;
    })
    .finally(() => {
      if (inflightAuth.get(key) === promise) inflightAuth.delete(key);
    });
  inflightAuth.set(key, promise);
  return promise;
}

/**
 * After a 401 with `staleJwt`: drop that token (only if it is still the cached
 * one — a concurrent request may already have refreshed it) and obtain a fresh
 * one. Concurrent 401s therefore collapse onto a single re-authentication.
 */
async function reauthenticateAfter401(baseURL: string, key: string, user: string, pass: string, staleJwt: string): Promise<string> {
  const current = tokenCache.get(key);
  if (current && current.jwt === staleJwt) {
    tokenCache.delete(key);
    console.log("[Wazuh Auth] Token invalidated after 401 (will re-authenticate)");
  }
  return getToken(baseURL, key, user, pass);
}

// ── Core GET proxy ─────────────────────────────────────────────────────────────
export interface WazuhConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

export interface WazuhGetOptions {
  path: string;
  params?: Record<string, string | number | boolean | undefined>;
  rateLimitGroup?: string;
  /** User ID for per-user rate limiting. Passed from ctx.user.id in tRPC procedures. */
  userId?: string | number;
}

export async function wazuhGet(
  config: WazuhConfig,
  options: WazuhGetOptions
): Promise<unknown> {
  const { path, params = {}, rateLimitGroup = "default", userId } = options;

  checkRateLimit(rateLimitGroup, userId);

  const baseURL = `https://${config.host}:${config.port}`;
  const key = wazuhConnectionKey(config);
  let token: string;

  try {
    token = await getToken(baseURL, key, config.user, config.pass);
  } catch (err) {
    // M1: full detail (extractWazuhErrorDetail + body) goes to the server log
    // under a correlation id; the caller only sees "Wazuh upstream error … [id]".
    throw sanitizeUpstreamError("Wazuh", err, `auth (${extractWazuhErrorDetail(err)})`);
  }

  const instance = createAxiosInstance(baseURL);

  // Filter out undefined params
  const cleanParams: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) cleanParams[k] = v;
  }

  try {
    // All protected Wazuh endpoints require Bearer JWT — never Basic Auth
    const response = await instance.get(path, {
      params: cleanParams,
      headers: { Authorization: `Bearer ${token}` },
    });

    return stripSensitiveFields(response.data);
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      // Token expired or revoked — invalidate, re-authenticate (deduped), retry once
      console.log("[Wazuh Auth] 401 on %s — re-authenticating and retrying", path);
      try {
        const freshToken = await reauthenticateAfter401(baseURL, key, config.user, config.pass, token);
        const retryResponse = await instance.get(path, {
          params: cleanParams,
          headers: { Authorization: `Bearer ${freshToken}` },
        });
        return stripSensitiveFields(retryResponse.data);
      } catch (retryErr) {
        throw sanitizeUpstreamError("Wazuh", retryErr, `GET ${path} (after 401 retry)`);
      }
    }
    throw sanitizeUpstreamError("Wazuh", err, `GET ${path}`);
  }
}

// ── Config loader (env-only, synchronous) ────────────────────────────────────
export function getWazuhConfig(): WazuhConfig {
  const host = process.env.WAZUH_HOST;
  const port = parseInt(process.env.WAZUH_PORT ?? "55000", 10);
  const user = process.env.WAZUH_USER;
  const pass = process.env.WAZUH_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      "Wazuh is not configured. Set WAZUH_HOST, WAZUH_USER, and WAZUH_PASS environment variables."
    );
  }

  return { host, port, user, pass };
}

export function isWazuhConfigured(): boolean {
  return !!(process.env.WAZUH_HOST && process.env.WAZUH_USER && process.env.WAZUH_PASS);
}

// ── Runtime config loader (DB override → env fallback, async) ────────────────

/**
 * Get Wazuh config checking DB overrides first, then env vars.
 * Use this in request handlers instead of the sync version.
 */
export async function getEffectiveWazuhConfig(): Promise<WazuhConfig | null> {
  try {
    const { getEffectiveWazuhConfig: getFromDb } = await import("../admin/connectionSettingsService");
    return await getFromDb();
  } catch (err) {
    // DB unavailable or query failed — log so silent failures are diagnosable
    console.warn("[WazuhClient] DB config lookup failed, falling back to env vars:", (err as Error)?.message ?? err);
    if (isWazuhConfigured()) return getWazuhConfig();
    return null;
  }
}

/**
 * Check if Wazuh is configured via DB overrides or env vars.
 */
export async function isWazuhEffectivelyConfigured(): Promise<boolean> {
  const config = await getEffectiveWazuhConfig();
  return config !== null;
}

// ── Exported for testing ─────────────────────────────────────────────────────
export const _testing = {
  checkGlobalRateLimit,
  checkPerUserRateLimit,
  checkRateLimit,
  globalRateLimitState,
  perUserRateLimitState,
  GLOBAL_RATE_LIMITS,
  PER_USER_RATE_LIMITS,
  RATE_LIMIT_WINDOW_MS,
  /** Reset all rate limit state (for tests only) */
  resetRateLimits() {
    for (const key of Object.keys(globalRateLimitState)) delete globalRateLimitState[key];
    for (const key of Object.keys(perUserRateLimitState)) delete perUserRateLimitState[key];
    lastRateLimitPruneAt = 0;
  },
  pruneRateLimitState,
  tokenCache,
  inflightAuth,
  isSensitiveFieldName,
};
