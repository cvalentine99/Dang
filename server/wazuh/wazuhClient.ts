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
import https from "https";

/**
 * Extract meaningful error detail from Axios errors instead of losing
 * the actual failure reason (ECONNREFUSED, ETIMEDOUT, 401, 403, TLS, etc.).
 */
export function extractWazuhErrorDetail(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const ae = err as AxiosError;
    if (ae.response) {
      const status = ae.response.status;
      const body = typeof ae.response.data === "object" && ae.response.data !== null
        ? JSON.stringify(ae.response.data).slice(0, 200)
        : String(ae.response.data ?? "").slice(0, 200);
      return `HTTP ${status} from ${ae.config?.url ?? "unknown"} — ${body}`;
    }
    if (ae.code === "ECONNREFUSED") return `Connection refused at ${ae.config?.baseURL ?? "unknown"} — is Wazuh Manager running?`;
    if (ae.code === "ETIMEDOUT" || ae.code === "ECONNABORTED") return `Connection timed out to ${ae.config?.baseURL ?? "unknown"} — network issue or firewall`;
    if (ae.code === "ENOTFOUND") return `DNS resolution failed for ${ae.config?.baseURL ?? "unknown"} — check hostname`;
    if (ae.code === "CERT_HAS_EXPIRED" || ae.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") return `TLS certificate error: ${ae.code}`;
    if (ae.code) return `Network error ${ae.code}: ${ae.message}`;
    return ae.message || "Unknown Axios error";
  }
  const msg = (err as Error)?.message;
  return msg || "Unknown error (no message)";
}

// ── Token state ───────────────────────────────────────────────────────────────
// We store the JWT and its expiration from the Wazuh API response.
// A 60-second buffer ensures we re-authenticate before actual expiry.
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

interface CachedToken {
  jwt: string;
  expiresAt: number; // Date.now()-based epoch ms
}

let cachedToken: CachedToken | null = null;

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

// Global limits per endpoint group (hard ceiling — protects Wazuh)
const GLOBAL_RATE_LIMITS: Record<string, number> = {
  default: 60,
  alerts: 30,
  vulnerabilities: 20,
  syscheck: 20,
  readiness: 10, // Low ceiling — readiness checks are lightweight and periodic
};

// Per-user limits per endpoint group (fraction of global — ensures fairness)
// Default: 50% of the global limit per user
const PER_USER_RATE_LIMITS: Record<string, number> = {
  default: 30,
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
  // Per-user check (if userId is provided — it will be for all protectedProcedure calls)
  if (userId !== undefined) {
    const perUserResult = checkPerUserRateLimit(userId, group);
    if (perUserResult) {
      throw new Error(
        `Per-user rate limit exceeded for endpoint group '${group}'. ` +
        `Retry-After: ${perUserResult.retryAfterSeconds}s. ` +
        `Your individual limit is ${PER_USER_RATE_LIMITS[group] ?? PER_USER_RATE_LIMITS.default} requests per minute.`
      );
    }
  }

  // Global check (always enforced)
  const globalResult = checkGlobalRateLimit(group);
  if (globalResult) {
    throw new Error(
      `Global rate limit exceeded for endpoint group '${group}'. ` +
      `Retry-After: ${globalResult.retryAfterSeconds}s. ` +
      `The system-wide limit is ${GLOBAL_RATE_LIMITS[group] ?? GLOBAL_RATE_LIMITS.default} requests per minute.`
    );
  }
}

// ── Sensitive fields to strip from all responses ──────────────────────────────
const STRIP_FIELDS = new Set([
  "password",
  "token",
  "secret",
  "api_key",
  "auth",
  "credential",
]);

function stripSensitiveFields(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(stripSensitiveFields);
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (!STRIP_FIELDS.has(k.toLowerCase())) {
        result[k] = stripSensitiveFields(v);
      }
    }
    return result;
  }
  return obj;
}

// ── Axios instance (skip TLS verification for self-signed certs) ──────────────
function createAxiosInstance(baseURL: string): AxiosInstance {
  return axios.create({
    baseURL,
    timeout: 8_000,
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    // NOTE: Do NOT set a default Content-Type here. The /security/user/authenticate
    // endpoint must receive NO body and NO Content-Type. GET requests also don't
    // need one. Axios sets Content-Type automatically when a body is present.
  });
}

// ── Token management ──────────────────────────────────────────────────────────

/**
 * Returns a valid JWT, re-authenticating only when the cached token is missing
 * or expired. Logs all authentication lifecycle events.
 */
async function getToken(baseURL: string, user: string, pass: string): Promise<string> {
  // Return cached token if it hasn't expired (with buffer)
  if (cachedToken && Date.now() < cachedToken.expiresAt - TOKEN_EXPIRY_BUFFER_MS) {
    console.log("[Wazuh Auth] Reusing cached JWT (expires in %ds)",
      Math.round((cachedToken.expiresAt - Date.now()) / 1000));
    return cachedToken.jwt;
  }

  const wasExpired = cachedToken !== null;
  console.log("[Wazuh Auth] %s — calling POST /security/user/authenticate",
    wasExpired ? "Token expired, re-authenticating" : "Initial authentication");

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

  cachedToken = { jwt: token, expiresAt };

  console.log("[Wazuh Auth] JWT obtained successfully (expires in %ds)",
    Math.round((expiresAt - Date.now()) / 1000));

  return token;
}

/** Clear cached token so the next getToken() call re-authenticates. */
function invalidateToken(): void {
  cachedToken = null;
  console.log("[Wazuh Auth] Token invalidated (will re-authenticate on next request)");
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
  let token: string;

  try {
    token = await getToken(baseURL, config.user, config.pass);
  } catch (err) {
    throw new Error(`Wazuh auth error: ${extractWazuhErrorDetail(err)}`);
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
      // Token expired or revoked — invalidate, re-authenticate, retry once
      console.log("[Wazuh Auth] 401 on %s — re-authenticating and retrying", path);
      invalidateToken();
      const freshToken = await getToken(baseURL, config.user, config.pass);
      const retryResponse = await instance.get(path, {
        params: cleanParams,
        headers: { Authorization: `Bearer ${freshToken}` },
      });
      return stripSensitiveFields(retryResponse.data);
    }
    throw err;
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
  } catch {
    // If DB is not available, fall back to env
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
  },
};
