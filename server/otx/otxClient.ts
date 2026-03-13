/**
 * AlienVault OTX DirectConnect API Client — server-side only.
 *
 * Responsibilities:
 * - Proxy all OTX requests through the backend
 * - API key stored server-side, never exposed to browser
 * - Rate limiting per endpoint group
 * - Two-tier caching: NodeCache (RAM, 5 min) → DB (hours) → OTX API
 * - Read-only: only GET endpoints
 * - Fail closed on auth/network errors
 */

import axios, { AxiosInstance } from "axios";
import NodeCache from "node-cache";
import { eq, and, gt, lt, sql } from "drizzle-orm";
import { threatIntelCache } from "../../drizzle/schema";
import { getDb } from "../db";

const OTX_BASE_URL = "https://otx.alienvault.com";

// ── Response cache (5 minute TTL for hot RAM layer) ─────────────────────────
const responseCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// ── DB cache TTLs by endpoint type (in seconds) ────────────────────────────
// Pulse data doesn't change every 5 minutes — use longer DB TTLs
const DB_CACHE_TTLS: Record<string, number> = {
  pulse: 6 * 3600,      // 6 hours for subscribed pulses
  indicator: 1800,       // 30 minutes for IOC lookups
  search: 900,           // 15 minutes for search results
  activity: 1800,        // 30 minutes for activity feed
  status: 600,           // 10 minutes for user status
};

// ── Rate-limit state ─────────────────────────────────────────────────────────
const rateLimitState: Record<string, { count: number; resetAt: number }> = {};
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMITS: Record<string, number> = {
  default: 30,
  pulses: 20,
  indicators: 20,
  search: 15,
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
      `OTX rate limit exceeded for '${group}'. Retry after ${Math.ceil((rateLimitState[group].resetAt - now) / 1000)}s.`
    );
  }
}

// ── Config ───────────────────────────────────────────────────────────────────
export function getOtxApiKey(): string {
  const key = process.env.OTX_API_KEY;
  if (!key) {
    throw new Error("OTX_API_KEY is not configured. Set it in environment variables.");
  }
  return key;
}

export function isOtxConfigured(): boolean {
  return !!process.env.OTX_API_KEY;
}

// ── Axios instance ───────────────────────────────────────────────────────────
function createInstance(): AxiosInstance {
  return axios.create({
    baseURL: OTX_BASE_URL,
    timeout: 15_000,
    headers: {
      "X-OTX-API-KEY": getOtxApiKey(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
}

// ── Endpoint type classifier ────────────────────────────────────────────────
export type OtxEndpointType = "pulse" | "indicator" | "search" | "activity" | "status";

function classifyEndpoint(path: string): OtxEndpointType {
  if (path.includes("/indicators/")) return "indicator";
  if (path.includes("/search/")) return "search";
  if (path.includes("/activity")) return "activity";
  if (path.includes("/users/me")) return "status";
  return "pulse";
}

// ── DB cache helpers ────────────────────────────────────────────────────────

async function getFromDbCache(cacheKey: string): Promise<unknown | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const rows = await db
      .select()
      .from(threatIntelCache)
      .where(
        and(
          eq(threatIntelCache.cacheKey, cacheKey),
          gt(threatIntelCache.expiresAt, new Date())
        )
      )
      .limit(1);

    if (rows.length > 0) {
      return rows[0].responseData;
    }
    return null;
  } catch (err) {
    console.warn("[OTX DB Cache] Read error:", (err as Error).message);
    return null;
  }
}

async function upsertDbCache(
  cacheKey: string,
  endpointType: OtxEndpointType,
  data: unknown
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const ttlSeconds = DB_CACHE_TTLS[endpointType] ?? 1800;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    // Use INSERT ... ON DUPLICATE KEY UPDATE for atomic upsert
    await db
      .insert(threatIntelCache)
      .values({
        cacheKey,
        endpointType,
        responseData: data,
        fetchedAt: now,
        expiresAt,
      })
      .onDuplicateKeyUpdate({
        set: {
          responseData: data,
          fetchedAt: now,
          expiresAt,
          endpointType,
        },
      });
  } catch (err) {
    // Non-fatal: log and continue — the API response is still returned
    console.warn("[OTX DB Cache] Write error:", (err as Error).message);
  }
}

// ── Core GET function with two-tier caching ─────────────────────────────────
export async function otxGet(
  path: string,
  params: Record<string, string | number | undefined> = {},
  rateLimitGroup: string = "default",
  cacheTTL?: number,
  forceRefresh: boolean = false
): Promise<unknown> {
  checkRateLimit(rateLimitGroup);

  // Clean params
  const cleanParams: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) cleanParams[k] = v;
  }

  const sortedParams = Object.fromEntries(Object.entries(cleanParams).sort(([a], [b]) => a.localeCompare(b)));
  const cacheKey = `otx:${path}:${JSON.stringify(sortedParams)}`;
  const endpointType = classifyEndpoint(path);

  // ── Tier 1: RAM cache (skip if force refresh) ──────────────────────────
  if (!forceRefresh) {
    const ramCached = responseCache.get(cacheKey);
    if (ramCached) return ramCached;
  }

  // ── Tier 2: DB cache (skip if force refresh) ──────────────────────────
  if (!forceRefresh) {
    const dbCached = await getFromDbCache(cacheKey);
    if (dbCached) {
      // Promote to RAM cache for subsequent hot reads
      if (cacheTTL !== undefined) {
        responseCache.set(cacheKey, dbCached, cacheTTL);
      } else {
        responseCache.set(cacheKey, dbCached);
      }
      return dbCached;
    }
  }

  // ── Tier 3: OTX API ───────────────────────────────────────────────────
  const instance = createInstance();

  try {
    const response = await instance.get(path, { params: cleanParams });
    const data = response.data;

    // Write to RAM cache
    if (cacheTTL !== undefined) {
      responseCache.set(cacheKey, data, cacheTTL);
    } else {
      responseCache.set(cacheKey, data);
    }

    // Write to DB cache (async, non-blocking)
    upsertDbCache(cacheKey, endpointType, data).catch(() => {
      // Already logged inside upsertDbCache
    });

    return data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
        throw new Error("OTX API request timed out — AlienVault OTX may be unreachable from this network.");
      }
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        throw new Error("OTX authentication failed. Check your API key.");
      }
      if (status === 429) {
        throw new Error("OTX API rate limit exceeded. Please wait before retrying.");
      }
      throw new Error(`OTX API error (${status}): ${err.response?.data?.detail ?? err.message}`);
    }
    throw err;
  }
}

// ── Cache management ────────────────────────────────────────────────────────

/** Flush all RAM cache entries */
export function flushRamCache(): void {
  responseCache.flushAll();
}

/** Get cache statistics for monitoring */
export function getCacheStats(): {
  ramKeys: number;
  ramHits: number;
  ramMisses: number;
} {
  const stats = responseCache.getStats();
  return {
    ramKeys: responseCache.keys().length,
    ramHits: stats.hits,
    ramMisses: stats.misses,
  };
}

/** Purge expired DB cache entries */
export async function purgeExpiredDbCache(): Promise<number> {
  try {
    const db = await getDb();
    if (!db) return 0;

    const result = await db
      .delete(threatIntelCache)
      .where(lt(threatIntelCache.expiresAt, new Date()));

    // drizzle delete returns an array; length is rows affected
    return Array.isArray(result) ? (result as unknown[]).length : 0;
  } catch (err) {
    console.warn("[OTX DB Cache] Purge error:", (err as Error).message);
    return 0;
  }
}

/** Get DB cache statistics */
export async function getDbCacheStats(): Promise<{
  totalEntries: number;
  byType: Record<string, number>;
} | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const rows = await db
      .select({
        endpointType: threatIntelCache.endpointType,
        count: sql<number>`COUNT(*)`.as("count"),
      })
      .from(threatIntelCache)
      .groupBy(threatIntelCache.endpointType);

    const byType: Record<string, number> = {};
    let totalEntries = 0;
    for (const row of rows) {
      const count = Number(row.count);
      byType[row.endpointType] = count;
      totalEntries += count;
    }

    return { totalEntries, byType };
  } catch {
    return null;
  }
}
