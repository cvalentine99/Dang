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
import { sharedHttpsAgent } from "../_core/tlsAgent";

// ── Rate-limit state ─────────────────────────────────────────────────────────
const rateLimitState: Record<string, { count: number; resetAt: number }> = {};
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMITS: Record<string, number> = {
  default: 50,
  alerts: 30,
  vulnerabilities: 20,
  monitoring: 20,
  statistics: 20,
  archives: 15,
};

function checkRateLimit(group: string): void {
  const limit = RATE_LIMITS[group] ?? RATE_LIMITS.default;
  const now = Date.now();
  if (!rateLimitState[group] || now > rateLimitState[group].resetAt) {
    rateLimitState[group] = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }
  rateLimitState[group].count++;
  if (rateLimitState[group].count > limit) {
    throw new Error(
      `Indexer rate limit exceeded for '${group}'. Retry after ${Math.ceil((rateLimitState[group].resetAt - now) / 1000)}s.`
    );
  }
}

// ── Sensitive fields to strip ────────────────────────────────────────────────
const STRIP_FIELDS = new Set([
  "password", "token", "secret", "api_key", "auth", "credential",
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
  const protocol = (process.env.WAZUH_INDEXER_PROTOCOL ?? "https") as "https" | "http";

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
  rateLimitGroup: string = "default"
): Promise<ESSearchResponse> {
  checkRateLimit(rateLimitGroup);

  const instance = createInstance(config);

  try {
    const response = await instance.post(`/${index}/_search`, body);
    return stripSensitiveFields(response.data) as ESSearchResponse;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const message = err.response?.data?.error?.reason ?? err.message;
      throw new Error(`Indexer query failed (${status}): ${message}`);
    }
    throw err;
  }
}

// ── Cluster health check ─────────────────────────────────────────────────────
export async function indexerHealth(
  config: IndexerConfig
): Promise<Record<string, unknown>> {
  checkRateLimit("default");
  const instance = createInstance(config);

  try {
    const response = await instance.get("/_cluster/health");
    return stripSensitiveFields(response.data) as Record<string, unknown>;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      throw new Error(`Indexer health check failed: ${err.message}`);
    }
    throw err;
  }
}

// ── Index existence check ────────────────────────────────────────────────────
export async function indexerIndexExists(
  config: IndexerConfig,
  index: string
): Promise<boolean> {
  const instance = createInstance(config);
  try {
    await instance.head(`/${index}`);
    return true;
  } catch {
    return false;
  }
}

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
