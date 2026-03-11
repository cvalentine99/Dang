/**
 * Wazuh Proxy Request Deduplication Cache
 *
 * Implements a short-lived TTL cache (default 7 seconds) for identical GET
 * requests to the Wazuh API. This prevents redundant API calls when multiple
 * dashboard components refresh simultaneously or when an analyst navigates
 * between pages that share common data.
 *
 * Design principles:
 * - Cache key = endpoint path + sorted query params (deterministic)
 * - TTL is short (5-10s) to keep data fresh for SOC analysts
 * - In-flight deduplication: concurrent requests for the same key share
 *   a single upstream call (promise coalescing)
 * - Cache is per-process, not shared across workers
 * - No stale-while-revalidate — SOC data must be current
 * - Cache can be bypassed per-request via options
 */

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
export function makeCacheKey(
  path: string,
  params?: Record<string, string | number | boolean | undefined>
): string {
  if (!params || Object.keys(params).length === 0) return path;

  const sorted = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  return sorted ? `${path}?${sorted}` : path;
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
 * @param bypass - If true, skip cache lookup (but still cache the result)
 * @returns The upstream response data
 */
export async function cachedFetch(
  key: string,
  fetchFn: () => Promise<unknown>,
  bypass = false
): Promise<unknown> {
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
 * Invalidate a specific cache key (e.g., after a write operation).
 */
export function invalidateKey(key: string): void {
  cache.delete(key);
}

/**
 * Invalidate all cache entries whose keys start with the given prefix.
 * Useful for invalidating all entries for a specific endpoint group.
 */
export function invalidatePrefix(prefix: string): void {
  const keys = Array.from(cache.keys());
  for (const key of keys) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
