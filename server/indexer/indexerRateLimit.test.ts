/**
 * M6 — Indexer rate limits: per-(group,user) buckets, declared groups,
 * pruning, TRPCError TOO_MANY_REQUESTS; indexerIndexExists is rate-limited.
 * M5 — axios instance limits.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { TRPCError } from "@trpc/server";

const createCalls: Array<Record<string, unknown>> = [];
const mockHead = vi.fn();
vi.mock("axios", () => {
  const isAxiosError = (e: unknown) => typeof e === "object" && e !== null && "isAxiosError" in e;
  const create = (cfg: Record<string, unknown>) => {
    createCalls.push(cfg);
    return { post: vi.fn(), get: vi.fn(), head: mockHead };
  };
  return { default: { create, isAxiosError }, isAxiosError };
});

import { _testing, indexerIndexExists, type IndexerConfig } from "./indexerClient";

const CFG: IndexerConfig = { host: "idx", port: 9200, user: "u", pass: "p", protocol: "https" };

beforeEach(() => {
  _testing.resetRateLimits();
  createCalls.length = 0;
  mockHead.mockReset();
});

describe("per-user buckets", () => {
  it("one user exhausting a group does not block another user", () => {
    const limit = _testing.RATE_LIMITS.alerts;
    for (let i = 0; i < limit; i++) _testing.checkRateLimit("alerts", 1);
    expect(() => _testing.checkRateLimit("alerts", 1)).toThrow(/rate limit exceeded/);
    expect(() => _testing.checkRateLimit("alerts", 2)).not.toThrow();
    expect(Object.keys(_testing.rateLimitState)).toEqual(expect.arrayContaining(["alerts:1", "alerts:2"]));
  });

  it("background callers share the 'system' bucket", () => {
    _testing.checkRateLimit("sse-alerts");
    expect(_testing.rateLimitState["sse-alerts:system"]?.count).toBe(1);
  });

  it("violations are TRPCError TOO_MANY_REQUESTS", () => {
    const limit = _testing.RATE_LIMITS["auto-queue"];
    for (let i = 0; i < limit; i++) _testing.checkRateLimit("auto-queue");
    try {
      _testing.checkRateLimit("auto-queue");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      expect((e as TRPCError).code).toBe("TOO_MANY_REQUESTS");
    }
  });

  it("a global per-group ceiling still protects the Indexer", () => {
    const limit = _testing.RATE_LIMITS.archives;
    const ceiling = limit * _testing.GLOBAL_LIMIT_FACTOR;
    let user = 0;
    for (let i = 0; i < ceiling; i++) {
      if (i % limit === 0) user++;
      _testing.checkRateLimit("archives", user);
    }
    expect(() => _testing.checkRateLimit("archives", 999)).toThrow(/global rate limit/);
  });
});

describe("declared groups", () => {
  it.each(["correlation", "auto-queue", "sse-alerts", "alert-queue-enqueue", "index-status"])("%s is declared", (g) => {
    expect(_testing.RATE_LIMITS[g]).toBeGreaterThan(0);
  });
});

describe("pruning", () => {
  it("drops expired buckets", () => {
    _testing.rateLimitState["alerts:77"] = { count: 1, resetAt: Date.now() - 1 };
    _testing.pruneRateLimitState(Date.now() + _testing.RATE_LIMIT_WINDOW_MS);
    expect(_testing.rateLimitState["alerts:77"]).toBeUndefined();
  });
});

describe("indexerIndexExists", () => {
  it("is rate-limited under 'index-status'", async () => {
    mockHead.mockResolvedValue({ status: 200 });
    await indexerIndexExists(CFG, "wazuh-alerts-*", 5);
    expect(_testing.rateLimitState["index-status:5"]?.count).toBe(1);
  });
});

describe("M5: axios limits", () => {
  it("sets maxContentLength / maxBodyLength / maxRedirects: 0", async () => {
    mockHead.mockResolvedValue({ status: 200 });
    await indexerIndexExists(CFG, "x");
    expect(createCalls[0]).toMatchObject({ maxContentLength: 25 * 1024 * 1024, maxRedirects: 0 });
    expect(createCalls[0].maxBodyLength).toBeGreaterThan(0);
  });
});
