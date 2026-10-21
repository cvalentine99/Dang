/**
 * Wazuh Proxy Request Deduplication Cache
 *
 * Implements a short-lived TTL cache (default 7 seconds) for identical GET
 * requests to the Wazuh API. This prevents redundant API calls when multiple
 * dashboard components refresh simultaneously or when an analyst navigates
 * between pages that share common data.
 *
 * Design principles:
 * - Cache key = scope + endpoint path + sorted query params (deterministic).
 *   M4: the scope is `<config fingerprint>|u:<userId>` so a response fetched
 *   with one connection config (host:port:user) is never served after a
 *   settings change, and one user's response is never served to another.
 * - Secret-bearing paths (`/agents/{id}/key`) are never stored (noStore).
 * - TTL is short (5-10s) to keep data fresh for SOC analysts
 * - In-flight deduplication: concurrent requests for the same key share
 *   a single upstream call (promise coalescing)
 * - Cache is per-process, not shared across workers
 * - No stale-while-revalidate — SOC data must be current
 * - Cache can be bypassed per-request via options
 */

import { createHash } from "node:crypto";

/** Single cache entry with expiration tracking */
interface CacheEntry {
  /** Resolved response data */
  data: unknown;
  /** When this entry was stored (Date.now() epoch ms) */
  storedAt: number;
  /** When this entry expires (Date.now() epoch ms) */
  expiresAt: number;
}

/** In-flight promise for deduplication of concurrent identical requests */
interface InflightEntry {
  promise: Promise<unknown>;
}

/** Cache statistics for monitoring */
export interface CacheStats {
  /** Total cache hits (served from cache) */
  hits: number;
  /** Total cache misses (fetched from upstream) */
  misses: number;
  /** Total in-flight dedup joins (concurrent request coalescing) */
  coalesced: number;
  /** Current number of cached entries */
  size: number;
  /** Current number of in-flight requests */
  inflight: number;
  /** Hit rate as a percentage (0-100) */
  hitRate: number;
  /** TTL in milliseconds */
  ttlMs: number;
  /** Whether the cache is enabled */
  enabled: boolean;
}

// ── Configuration ────────────────────────────────────────────────────────────

/** Default TTL: 7 seconds — balances freshness with dedup benefit */
const DEFAULT_TTL_MS = 7_000;

/** Maximum cache entries before forced eviction */
const MAX_CACHE_SIZE = 500;

/** Eviction batch size — remove this many oldest entries when at capacity */
const EVICTION_BATCH = 50;

// ── State ────────────────────────────────────────────────────────────────────

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, InflightEntry>();

let ttlMs = DEFAULT_TTL_MS;
let enabled = true;
let stats = { hits: 0, misses: 0, coalesced: 0 };

// ── Cache Key Generation ─────────────────────────────────────────────────────

/**
 * Generate a deterministic cache key from the request path and params.
 * Params are sorted alphabetically and undefined values are excluded
 * to ensure identical requests always produce the same key.
 */
/**
 * Connection identity: `${host}:${port}:${user}` plus a 12-hex SHA-256
 * fingerprint of the password (so a password rotation is also a new identity).
 * Shared by the request cache and the Wazuh JWT cache.
 */
export function connectionFingerprint(config: { host: string; port: number | string; user: string; pass?: string }): string {
  const passFp = createHash("sha256").update(config.pass ?? "").digest("hex").slice(0, 12);
  return `${config.host}:${config.port}:${config.user}#${passFp}`;
}

export interface CacheScope {
  /** Connection identity, e.g. wazuhConfigFingerprint(config) (`host:port:user#…`) */
  configFingerprint: string;
  /** Requesting user; undefined for system/background callers */
  userId?: string | number;
}

/** Prefix shared by every key for one connection config. */
export function scopePrefix(configFingerprint: string): string {
  return `${configFingerprint}|`;
}

export function makeCacheKey(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
  scope?: CacheScope
): string {
  const prefix = scope
    ? `${scopePrefix(scope.configFingerprint)}u:${scope.userId ?? "system"}|`
    : "";
  if (!params || Object.keys(params).length === 0) return `${prefix}${path}`;

  const sorted = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  return sorted ? `${prefix}${path}?${sorted}` : `${prefix}${path}`;
}

/**
 * M4: paths whose responses carry secrets and must never sit in the cache.
 * `/agents/{id}/key` returns the agent enrollment key.
 */
const NEVER_CACHE_PATTERNS: RegExp[] = [/^\/agents\/[^/]+\/key$/];

export function isNeverCachePath(path: string): boolean {
  const bare = path.split("?")[0];
  return NEVER_CACHE_PATTERNS.some(re => re.test(bare));
}

// ── Config-change invalidation ───────────────────────────────────────────────

let activeConfigFingerprint: string | null = null;

/**
 * Record the connection config in use. When it differs from the last one
 * seen (connection settings were changed), every entry cached under the old
 * fingerprint is dropped via invalidatePrefix(). Keys are already scoped so
 * stale entries could never be SERVED; this frees them immediately.
 */
export function noteConfigFingerprint(configFingerprint: string): void {
  if (activeConfigFingerprint !== null && activeConfigFingerprint !== configFingerprint) {
    invalidatePrefix(scopePrefix(activeConfigFingerprint));
  }
  activeConfigFingerprint = configFingerprint;
}

// ── Core Cache Operations ────────────────────────────────────────────────────

/**
 * Look up a cached response. Returns undefined on miss or expiry.
 */
function getCached(key: string): unknown | undefined {
  if (!enabled) return undefined;

  const entry = cache.get(key);
  if (!entry) return undefined;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }

  stats.hits++;
  return entry.data;
}

/**
 * Store a response in the cache with the configured TTL.
 */
function setCached(key: string, data: unknown): void {
  if (!enabled) return;

  // Evict oldest entries if at capacity
  if (cache.size >= MAX_CACHE_SIZE) {
    evictOldest();
  }

  const now = Date.now();
  cache.set(key, {
    data,
    storedAt: now,
    expiresAt: now + ttlMs,
  });
}

/**
 * Remove the oldest entries when the cache is full.
 */
function evictOldest(): void {
  const entries = Array.from(cache.entries())
    .sort(([, a], [, b]) => a.storedAt - b.storedAt);

  const toRemove = Math.min(EVICTION_BATCH, entries.length);
  for (let i = 0; i < toRemove; i++) {
    cache.delete(entries[i][0]);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Wrap an upstream fetch function with deduplication and caching.
 *
 * If a cached response exists and hasn't expired, it's returned immediately.
 * If an identical request is already in-flight, the caller joins the existing
 * promise instead of making a duplicate upstream call.
 * Otherwise, the upstream function is called and the result is cached.
 *
 * @param key - Deterministic cache key (use makeCacheKey())
 * @param fetchFn - The upstream function to call on cache miss
 * @param options - `true` (legacy) or `{ bypass }`: skip cache lookup but still
 *   cache the result. `{ noStore: true }`: go straight upstream, never join an
 *   in-flight request, never store the result, and purge any entry under
 *   this key (secret-bearing responses).
 * @returns The upstream response data
 */
export async function cachedFetch(
  key: string,
  fetchFn: () => Promise<unknown>,
  options: boolean | { bypass?: boolean; noStore?: boolean } = false
): Promise<unknown> {
  const { bypass = false, noStore = false } =
    typeof options === "boolean" ? { bypass: options } : options;

  if (noStore) {
    invalidateKey(key);
    return fetchFn();
  }

  // 1. Check cache (unless bypassed)
  if (!bypass) {
    const cached = getCached(key);
    if (cached !== undefined) return cached;
  }

  // 2. Check in-flight dedup
  const existing = inflight.get(key);
  if (existing) {
    stats.coalesced++;
    return existing.promise;
  }

  // 3. Execute upstream and cache result
  const promise = fetchFn()
    .then((data) => {
      setCached(key, data);
      inflight.delete(key);
      stats.misses++;
      return data;
    })
    .catch((err) => {
      inflight.delete(key);
      stats.misses++;
      throw err;
    });

  inflight.set(key, { promise });
  return promise;
}

// ── Management API ───────────────────────────────────────────────────────────

/**
 * Get current cache statistics for monitoring.
 */
export function getCacheStats(): CacheStats {
  // Prune expired entries before reporting
  const now = Date.now();
  const keys = Array.from(cache.keys());
  for (const key of keys) {
    const entry = cache.get(key);
    if (entry && now > entry.expiresAt) cache.delete(key);
  }

  const total = stats.hits + stats.misses;
  return {
    hits: stats.hits,
    misses: stats.misses,
    coalesced: stats.coalesced,
    size: cache.size,
    inflight: inflight.size,
    hitRate: total > 0 ? Math.round((stats.hits / total) * 100) : 0,
    ttlMs,
    enabled,
  };
}

/**
 * Clear all cached entries and reset statistics.
 */
export function clearCache(): void {
  cache.clear();
  inflight.clear();
  activeConfigFingerprint = null;
  stats = { hits: 0, misses: 0, coalesced: 0 };
}

/**
 * Update the cache TTL. Existing entries keep their original expiry.
 */
export function setTtl(ms: number): void {
  if (ms < 0 || ms > 60_000) {
    throw new Error("TTL must be between 0 and 60000ms");
  }
  ttlMs = ms;
}

/**
 * Enable or disable the cache. When disabled, all requests go upstream.
 */
export function setCacheEnabled(value: boolean): void {
  enabled = value;
  if (!value) {
    cache.clear();
  }
}

/**
 * Invalidate a specific cache key. Used by cachedFetch({ noStore }) to purge
 * anything ever stored under a secret-bearing key.
 */
export function invalidateKey(key: string): void {
  cache.delete(key);
}

/**
 * Invalidate all cache entries whose keys start with the given prefix.
 * Used by noteConfigFingerprint() to drop every entry for a replaced
 * connection config (key prefix = scopePrefix(fingerprint)).
 */
export function invalidatePrefix(prefix: string): void {
  const keys = Array.from(cache.keys());
  for (const key of keys) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
