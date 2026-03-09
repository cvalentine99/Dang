/**
 * Wazuh Proxy Request Cache — Unit Tests
 *
 * Tests cache key generation, TTL expiry, in-flight deduplication,
 * cache management operations, and edge cases.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  makeCacheKey,
  cachedFetch,
  getCacheStats,
  clearCache,
  setTtl,
  setCacheEnabled,
  invalidateKey,
  invalidatePrefix,
} from "./requestCache";

beforeEach(() => {
  clearCache();
});

// ── Cache Key Generation ─────────────────────────────────────────────────────

describe("makeCacheKey", () => {
  it("should return path alone when no params", () => {
    expect(makeCacheKey("/agents")).toBe("/agents");
  });

  it("should return path alone when params is empty object", () => {
    expect(makeCacheKey("/agents", {})).toBe("/agents");
  });

  it("should sort params alphabetically", () => {
    const key = makeCacheKey("/agents", { status: "active", limit: 10, offset: 0 });
    expect(key).toBe("/agents?limit=10&offset=0&status=active");
  });

  it("should produce identical keys for same params in different order", () => {
    const key1 = makeCacheKey("/agents", { b: "2", a: "1" });
    const key2 = makeCacheKey("/agents", { a: "1", b: "2" });
    expect(key1).toBe(key2);
  });

  it("should exclude undefined params", () => {
    const key = makeCacheKey("/agents", { status: "active", limit: undefined });
    expect(key).toBe("/agents?status=active");
  });

  it("should handle boolean params", () => {
    const key = makeCacheKey("/agents", { distinct: true });
    expect(key).toBe("/agents?distinct=true");
  });

  it("should handle numeric zero params", () => {
    const key = makeCacheKey("/agents", { offset: 0 });
    expect(key).toBe("/agents?offset=0");
  });
});

// ── Cache Hit / Miss / Expiry ────────────────────────────────────────────────

describe("cachedFetch", () => {
  it("should call fetchFn on first request (cache miss)", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: "test" });
    const result = await cachedFetch("/agents", fetchFn);
    expect(result).toEqual({ data: "test" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("should return cached value on second request (cache hit)", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: "test" });
    await cachedFetch("/agents", fetchFn);
    const result = await cachedFetch("/agents", fetchFn);
    expect(result).toEqual({ data: "test" });
    expect(fetchFn).toHaveBeenCalledTimes(1); // Only called once
  });

  it("should call fetchFn again after TTL expires", async () => {
    setTtl(50); // 50ms TTL for testing
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ data: "first" })
      .mockResolvedValueOnce({ data: "second" });

    await cachedFetch("/agents", fetchFn);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 60));

    const result = await cachedFetch("/agents", fetchFn);
    expect(result).toEqual({ data: "second" });
    expect(fetchFn).toHaveBeenCalledTimes(2);

    setTtl(7000); // Reset TTL
  });

  it("should use different cache entries for different keys", async () => {
    const fetchFn1 = vi.fn().mockResolvedValue({ data: "agents" });
    const fetchFn2 = vi.fn().mockResolvedValue({ data: "alerts" });

    await cachedFetch("/agents", fetchFn1);
    await cachedFetch("/alerts", fetchFn2);

    expect(fetchFn1).toHaveBeenCalledTimes(1);
    expect(fetchFn2).toHaveBeenCalledTimes(1);
  });

  it("should bypass cache when bypass=true", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ data: "first" })
      .mockResolvedValueOnce({ data: "second" });

    await cachedFetch("/agents", fetchFn);
    const result = await cachedFetch("/agents", fetchFn, true);
    expect(result).toEqual({ data: "second" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("should propagate errors from fetchFn", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("Network error"));
    await expect(cachedFetch("/agents", fetchFn)).rejects.toThrow("Network error");
  });

  it("should not cache failed requests", async () => {
    const fetchFn = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce({ data: "success" });

    await expect(cachedFetch("/agents", fetchFn)).rejects.toThrow("fail");
    const result = await cachedFetch("/agents", fetchFn);
    expect(result).toEqual({ data: "success" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

// ── In-flight Deduplication ──────────────────────────────────────────────────

describe("in-flight deduplication", () => {
  it("should coalesce concurrent identical requests", async () => {
    let resolvePromise: (v: unknown) => void;
    const fetchFn = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolvePromise = resolve; })
    );

    // Start two concurrent requests for the same key
    const p1 = cachedFetch("/agents", fetchFn);
    const p2 = cachedFetch("/agents", fetchFn);

    // Only one upstream call should be made
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Resolve the upstream call
    resolvePromise!({ data: "shared" });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ data: "shared" });
    expect(r2).toEqual({ data: "shared" });
  });

  it("should not coalesce requests with different keys", async () => {
    const fetchFn1 = vi.fn().mockResolvedValue({ data: "agents" });
    const fetchFn2 = vi.fn().mockResolvedValue({ data: "alerts" });

    await Promise.all([
      cachedFetch("/agents", fetchFn1),
      cachedFetch("/alerts", fetchFn2),
    ]);

    expect(fetchFn1).toHaveBeenCalledTimes(1);
    expect(fetchFn2).toHaveBeenCalledTimes(1);
  });
});

// ── Cache Statistics ─────────────────────────────────────────────────────────

describe("getCacheStats", () => {
  it("should report zero stats on fresh cache", () => {
    const stats = getCacheStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.coalesced).toBe(0);
    expect(stats.size).toBe(0);
    expect(stats.hitRate).toBe(0);
    expect(stats.enabled).toBe(true);
  });

  it("should track hits and misses", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: "test" });
    await cachedFetch("/agents", fetchFn); // miss
    await cachedFetch("/agents", fetchFn); // hit
    await cachedFetch("/agents", fetchFn); // hit

    const stats = getCacheStats();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(2);
    expect(stats.hitRate).toBe(67); // 2/3 = 66.67% → rounds to 67
  });

  it("should report cache size", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: "test" });
    await cachedFetch("/a", fetchFn);
    await cachedFetch("/b", fetchFn);
    await cachedFetch("/c", fetchFn);

    const stats = getCacheStats();
    expect(stats.size).toBe(3);
  });
});

// ── Cache Management ─────────────────────────────────────────────────────────

describe("cache management", () => {
  it("clearCache should reset everything", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: "test" });
    await cachedFetch("/agents", fetchFn);
    clearCache();

    const stats = getCacheStats();
    expect(stats.size).toBe(0);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });

  it("setTtl should reject invalid values", () => {
    expect(() => setTtl(-1)).toThrow();
    expect(() => setTtl(100000)).toThrow();
  });

  it("setTtl should accept valid values", () => {
    setTtl(5000);
    const stats = getCacheStats();
    expect(stats.ttlMs).toBe(5000);
    setTtl(7000); // Reset
  });

  it("setCacheEnabled(false) should disable caching", async () => {
    setCacheEnabled(false);
    const fetchFn = vi.fn().mockResolvedValue({ data: "test" });
    await cachedFetch("/agents", fetchFn);
    await cachedFetch("/agents", fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(2); // No caching
    const stats = getCacheStats();
    expect(stats.enabled).toBe(false);

    setCacheEnabled(true); // Reset
  });

  it("invalidateKey should remove a specific entry", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: "test" });
    await cachedFetch("/agents", fetchFn);
    invalidateKey("/agents");

    const stats = getCacheStats();
    expect(stats.size).toBe(0);
  });

  it("invalidatePrefix should remove matching entries", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: "test" });
    await cachedFetch("/agents?limit=10", fetchFn);
    await cachedFetch("/agents?offset=0", fetchFn);
    await cachedFetch("/alerts", fetchFn);

    invalidatePrefix("/agents");

    const stats = getCacheStats();
    expect(stats.size).toBe(1); // Only /alerts remains
  });
});
