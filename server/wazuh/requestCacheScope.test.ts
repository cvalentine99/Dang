/**
 * M4 — request cache keys are scoped to the connection config and the
 * requesting user; secret-bearing paths are never cached; a config change
 * drops the old config's entries (invalidatePrefix wired via noteConfigFingerprint).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  makeCacheKey,
  cachedFetch,
  clearCache,
  getCacheStats,
  connectionFingerprint,
  isNeverCachePath,
  noteConfigFingerprint,
} from "./requestCache";

const cfgA = { host: "a", port: 55000, user: "wui", pass: "x" };
const cfgB = { host: "b", port: 55000, user: "wui", pass: "x" };

beforeEach(() => { clearCache(); });

describe("scoped cache keys", () => {
  it("fingerprint is host:port:user plus a password hash prefix (no plaintext)", () => {
    const fp = connectionFingerprint(cfgA);
    expect(fp).toMatch(/^a:55000:wui#[0-9a-f]{12}$/);
    expect(fp).not.toContain("x#");
    expect(connectionFingerprint({ ...cfgA, pass: "y" })).not.toBe(fp);
  });

  it("different users and configs never share an entry", () => {
    const fpA = connectionFingerprint(cfgA);
    const fpB = connectionFingerprint(cfgB);
    const k1 = makeCacheKey("/agents", { limit: 10 }, { configFingerprint: fpA, userId: 1 });
    const k2 = makeCacheKey("/agents", { limit: 10 }, { configFingerprint: fpA, userId: 2 });
    const k3 = makeCacheKey("/agents", { limit: 10 }, { configFingerprint: fpB, userId: 1 });
    const k4 = makeCacheKey("/agents", { limit: 10 }, { configFingerprint: fpA });
    expect(new Set([k1, k2, k3, k4]).size).toBe(4);
    expect(k4).toContain("u:system");
  });

  it("unscoped keys keep the legacy format", () => {
    expect(makeCacheKey("/agents", { b: 2, a: 1 })).toBe("/agents?a=1&b=2");
  });
});

describe("never-cache paths", () => {
  it("matches the agent key endpoint only", () => {
    expect(isNeverCachePath("/agents/001/key")).toBe(true);
    expect(isNeverCachePath("/agents/001/key?x=1")).toBe(true);
    expect(isNeverCachePath("/agents/001")).toBe(false);
    expect(isNeverCachePath("/agents/001/keys")).toBe(false);
  });

  it("noStore always calls upstream and stores nothing", async () => {
    const fn = vi.fn(async () => ({ key: "MDAx..." }));
    const key = makeCacheKey("/agents/001/key", undefined, { configFingerprint: "fp", userId: 1 });
    await cachedFetch(key, fn, { noStore: true });
    await cachedFetch(key, fn, { noStore: true });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(getCacheStats().size).toBe(0);
  });

  it("noStore purges anything previously cached under the key (invalidateKey)", async () => {
    const key = "fp|u:1|/agents/001/key";
    await cachedFetch(key, async () => "stale");
    expect(getCacheStats().size).toBe(1);
    await cachedFetch(key, async () => "fresh", { noStore: true });
    expect(getCacheStats().size).toBe(0);
  });
});

describe("config change invalidation (invalidatePrefix)", () => {
  it("switching fingerprint drops the old config's entries only", async () => {
    const fpA = connectionFingerprint(cfgA);
    const fpB = connectionFingerprint(cfgB);
    noteConfigFingerprint(fpA);
    await cachedFetch(makeCacheKey("/agents", undefined, { configFingerprint: fpA, userId: 1 }), async () => 1);
    await cachedFetch(makeCacheKey("/rules", undefined, { configFingerprint: fpA, userId: 1 }), async () => 2);
    expect(getCacheStats().size).toBe(2);
    noteConfigFingerprint(fpA); // same config → nothing dropped
    expect(getCacheStats().size).toBe(2);
    noteConfigFingerprint(fpB);
    expect(getCacheStats().size).toBe(0);
  });

  it("legacy boolean bypass still works", async () => {
    const fn = vi.fn(async () => "v");
    await cachedFetch("/x", fn);
    await cachedFetch("/x", fn, true);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
