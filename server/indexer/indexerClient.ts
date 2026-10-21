/**
 * Wazuh Indexer Client — server-side only.
 *
 * Connects to the Wazuh Indexer (OpenSearch / Elasticsearch) on port 9200.
 *
 * Responsibilities:
 * - HTTP client with Basic Auth for OpenSearch/Elasticsearch
 * - TLS skip for self-signed certificates
 * - Per-endpoint rate limiting (token bucket)
 * - Sensitive field stripping
 * - Fail closed on auth/network errors
 * - Read-only: only GET and POST /_search queries
 */

import axios, { AxiosInstance } from "axios";
import { TRPCError } from "@trpc/server";
import { asProtocol } from "../_core/protocol";
import { sharedHttpsAgent } from "../_core/tlsAgent";
import { sanitizeUpstreamError, UPSTREAM_AXIOS_LIMITS } from "../wazuh/upstreamError";

// ── Rate-limit state ─────────────────────────────────────────────────────────
// M6: buckets are keyed `${group}:${userId ?? "system"}` so one analyst cannot
// exhaust everyone's budget; a looser per-group global ceiling still protects
// the Indexer itself. Background callers (no userId) share the "system" bucket.
const rateLimitState: Record<string, { count: number; resetAt: number }> = {};
const globalRateLimitState: Record<string, { count: number; resetAt: number }> = {};
const RATE_LIMIT_WINDOW_MS = 60_000;
/** Per-(group, user) limits per minute. Every group a caller uses is declared here. */
const RATE_LIMITS: Record<string, number> = {
  default: 50,
  alerts: 30,
  vulnerabilities: 20,
  monitoring: 20,
  statistics: 20,
  archives: 15,
  // Previously undeclared — silently fell through to `default`:
  correlation: 40,          // agenticPipeline/correlationAgent evidence collection
  "auto-queue": 10,         // alertQueue/autoQueueRouter poller (once per interval)
  "sse-alerts": 30,         // sse/alertStreamService poll loop
  "alert-queue-enqueue": 30, // alertQueue/alertQueueRouter single-alert lookup
  "index-status": 30,       // indexerIndexExists (5 HEADs per indexStatus call)
};
/** Global (all users) ceiling = per-user limit × this factor. */
const GLOBAL_LIMIT_FACTOR = 3;

let lastPruneAt = 0;
/** M6: drop expired buckets so the map cannot grow with every user ever seen. */
function pruneRateLimitState(now: number): void {
  if (now - lastPruneAt < RATE_LIMIT_WINDOW_MS) return;
  lastPruneAt = now;
  for (const state of [rateLimitState, globalRateLimitState]) {
    for (const key of Object.keys(state)) {
      if (now > state[key].resetAt) delete state[key];
    }
  }
}

function bump(state: Record<string, { count: number; resetAt: number }>, key: string, now: number): { count: number; resetAt: number } {
  if (!state[key] || now > state[key].resetAt) {
    state[key] = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }
  state[key].count++;
  return state[key];
}

function checkRateLimit(group: string, userId?: string | number): void {
  const limit = RATE_LIMITS[group] ?? RATE_LIMITS.default;
  const now = Date.now();
  pruneRateLimitState(now);
  const key = `${group}:${userId ?? "system"}`;
  const bucket = bump(rateLimitState, key, now);
  if (bucket.count > limit) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Indexer rate limit exceeded for '${group}'. Retry after ${Math.ceil((bucket.resetAt - now) / 1000)}s.`,
    });
  }
  const global = bump(globalRateLimitState, group, now);
  if (global.count > limit * GLOBAL_LIMIT_FACTOR) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Indexer global rate limit exceeded for '${group}'. Retry after ${Math.ceil((global.resetAt - now) / 1000)}s.`,
    });
  }
}

// ── Sensitive fields to strip ────────────────────────────────────────────────
const STRIP_FIELDS = new Set([
  "apikey",
  "api_token",
  "hec_token",
  "rbac_token",
  "private_key",
  "passphrase",
  "password", "token", "secret", "api_key", "auth", "credential",
]);

/** L5: case-insensitive substring match (same rule as wazuhClient); bare `key` is not stripped. */
const STRIP_SUBSTRINGS = ["token", "secret", "password"];
const STRIP_SUBSTRING_EXCEPTIONS = new Set(["auth_token_exp_timeout"]);
function isSensitiveFieldName(key: string): boolean {
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

// ── Config ───────────────────────────────────────────────────────────────────
export interface IndexerConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  protocol: "https" | "http";
}

export function getIndexerConfig(): IndexerConfig {
  const host = process.env.WAZUH_INDEXER_HOST;
  const port = parseInt(process.env.WAZUH_INDEXER_PORT ?? "9200", 10);
  const user = process.env.WAZUH_INDEXER_USER;
  const pass = process.env.WAZUH_INDEXER_PASS;
  const protocol = asProtocol(process.env.WAZUH_INDEXER_PROTOCOL, "https");

  if (!host || !user || !pass) {
    throw new Error(
      "Wazuh Indexer is not configured. Set WAZUH_INDEXER_HOST, WAZUH_INDEXER_USER, and WAZUH_INDEXER_PASS."
    );
  }

  return { host, port, user, pass, protocol };
}

export function isIndexerConfigured(): boolean {
  return !!(
    process.env.WAZUH_INDEXER_HOST &&
    process.env.WAZUH_INDEXER_USER &&
    process.env.WAZUH_INDEXER_PASS
  );
}

// ── Runtime config loader (DB override → env fallback, async) ────────────────

/**
 * Get Indexer config checking DB overrides first, then env vars.
 * Use this in request handlers instead of the sync version.
 */
export async function getEffectiveIndexerConfig(): Promise<IndexerConfig | null> {
  try {
    const { getEffectiveIndexerConfig: getFromDb } = await import("../admin/connectionSettingsService");
    return await getFromDb();
  } catch {
    // If DB is not available, fall back to env
    if (isIndexerConfigured()) return getIndexerConfig();
    return null;
  }
}

/**
 * Check if Indexer is configured via DB overrides or env vars.
 */
export async function isIndexerEffectivelyConfigured(): Promise<boolean> {
  const config = await getEffectiveIndexerConfig();
  return config !== null;
}

// ── Axios instance ───────────────────────────────────────────────────────────
function createInstance(config: IndexerConfig): AxiosInstance {
  const baseURL = `${config.protocol}://${config.host}:${config.port}`;
  return axios.create({
    baseURL,
    timeout: 10_000, // Indexer queries can be slower than Server API
    httpsAgent: sharedHttpsAgent,
    auth: { username: config.user, password: config.pass },
    headers: { "Content-Type": "application/json" },
    ...UPSTREAM_AXIOS_LIMITS, // M5: 25 MB response cap, no redirects
  });
}

// ── Index patterns ───────────────────────────────────────────────────────────
export const INDEX_PATTERNS = {
  ALERTS: "wazuh-alerts-*",
  ARCHIVES: "wazuh-archives-*",
  MONITORING: "wazuh-monitoring-*",
  STATISTICS: "wazuh-statistics-*",
  VULNERABILITIES: "wazuh-states-vulnerabilities-*",
} as const;

// ── Elasticsearch/OpenSearch query types ─────────────────────────────────────
export interface ESSearchBody {
  query?: Record<string, unknown>;
  aggs?: Record<string, unknown>;
  size?: number;
  from?: number;
  sort?: Array<Record<string, unknown>>;
  _source?: string[] | boolean;
}

export interface ESSearchResponse {
  hits: {
    total: { value: number; relation: string } | number;
    hits: Array<{
      _index: string;
      _id: string;
      _score: number | null;
      _source: Record<string, unknown>;
    }>;
  };
  aggregations?: Record<string, unknown>;
  took: number;
  timed_out: boolean;
}

// ── Core search function ─────────────────────────────────────────────────────
export async function indexerSearch(
  config: IndexerConfig,
  index: string,
  body: ESSearchBody,
  rateLimitGroup: string = "default",
  /** Requesting user for per-user rate limiting; omit for background/system callers. */
  userId?: string | number
): Promise<ESSearchResponse> {
  checkRateLimit(rateLimitGroup, userId);

  const instance = createInstance(config);

  try {
    const response = await instance.post(`/${index}/_search`, body);
    return stripSensitiveFields(response.data) as ESSearchResponse;
  } catch (err: unknown) {
    // M1: the error.reason / body (index names, query fragments, mappings) is
    // logged server-side under a correlation id, never relayed to the client.
    throw sanitizeUpstreamError("Indexer", err, `POST /${index}/_search`);
  }
}

// ── Cluster health check ─────────────────────────────────────────────────────
export async function indexerHealth(
  config: IndexerConfig,
  userId?: string | number
): Promise<Record<string, unknown>> {
  checkRateLimit("default", userId);
  const instance = createInstance(config);

  try {
    const response = await instance.get("/_cluster/health");
    return stripSensitiveFields(response.data) as Record<string, unknown>;
  } catch (err: unknown) {
    throw sanitizeUpstreamError("Indexer", err, "GET /_cluster/health");
  }
}

// ── Index existence check ────────────────────────────────────────────────────
export async function indexerIndexExists(
  config: IndexerConfig,
  index: string,
  userId?: string | number
): Promise<boolean> {
  // M6: HEAD requests count against a declared bucket like every other call
  checkRateLimit("index-status", userId);
  const instance = createInstance(config);
  try {
    await instance.head(`/${index}`);
    return true;
  } catch (err: unknown) {
    // 404 = the pattern genuinely matches nothing. Anything else (auth, TLS,
    // network) is a failure, not "does not exist" — surface it sanitized.
    if (axios.isAxiosError(err) && err.response?.status === 404) return false;
    throw sanitizeUpstreamError("Indexer", err, `HEAD /${index}`);
  }
}

// ── Exported for testing ─────────────────────────────────────────────────────
export const _testing = {
  checkRateLimit,
  rateLimitState,
  globalRateLimitState,
  RATE_LIMITS,
  GLOBAL_LIMIT_FACTOR,
  RATE_LIMIT_WINDOW_MS,
  pruneRateLimitState,
  isSensitiveFieldName,
  resetRateLimits() {
    for (const k of Object.keys(rateLimitState)) delete rateLimitState[k];
    for (const k of Object.keys(globalRateLimitState)) delete globalRateLimitState[k];
    lastPruneAt = 0;
  },
};

// ── Query builder helpers ────────────────────────────────────────────────────

/** Build a time-range filter for @timestamp or timestamp fields */
export function timeRangeFilter(
  from: string,
  to: string,
  field: string = "timestamp"
): Record<string, unknown> {
  return {
    range: {
      [field]: {
        gte: from,
        lte: to,
        format: "strict_date_optional_time",
      },
    },
  };
}

/** Build a bool query with must/filter/should clauses */
export function boolQuery(opts: {
  must?: Array<Record<string, unknown>>;
  filter?: Array<Record<string, unknown>>;
  should?: Array<Record<string, unknown>>;
  must_not?: Array<Record<string, unknown>>;
  minimum_should_match?: number;
}): Record<string, unknown> {
  const bool: Record<string, unknown> = {};
  if (opts.must?.length) bool.must = opts.must;
  if (opts.filter?.length) bool.filter = opts.filter;
  if (opts.should?.length) bool.should = opts.should;
  if (opts.must_not?.length) bool.must_not = opts.must_not;
  if (opts.minimum_should_match !== undefined) bool.minimum_should_match = opts.minimum_should_match;
  return { bool };
}

/** Date histogram aggregation */
export function dateHistogramAgg(
  field: string = "timestamp",
  interval: string = "1h"
): Record<string, unknown> {
  return {
    date_histogram: {
      field,
      fixed_interval: interval,
      min_doc_count: 0,
    },
  };
}

/** Terms aggregation */
export function termsAgg(
  field: string,
  size: number = 20
): Record<string, unknown> {
  return {
    terms: {
      field,
      size,
    },
  };
}
