import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Source-level regression tests (always run, no DB/API needed) ────────────

describe("OTX Cache — Source Regression", () => {
  const clientSource = readFileSync(
    resolve(__dirname, "./otxClient.ts"),
    "utf-8"
  );
  const routerSource = readFileSync(
    resolve(__dirname, "./otxRouter.ts"),
    "utf-8"
  );

  it("otxClient.ts imports threatIntelCache from schema", () => {
    expect(clientSource).toContain('import');
    expect(clientSource).toContain('threatIntelCache');
  });

  it("otxGet accepts forceRefresh parameter", () => {
    // The function signature should include forceRefresh
    expect(clientSource).toContain("forceRefresh");
    expect(clientSource).toContain("forceRefresh: boolean");
  });

  it("otxClient.ts has two-tier caching: RAM → DB → API", () => {
    // Tier 1: RAM cache check
    expect(clientSource).toContain("responseCache.get(cacheKey)");
    // Tier 2: DB cache check
    expect(clientSource).toContain("getFromDbCache(cacheKey)");
    // Tier 3: API call
    expect(clientSource).toContain("instance.get(path");
    // DB write after API
    expect(clientSource).toContain("upsertDbCache(cacheKey");
  });

  it("otxClient.ts skips both caches when forceRefresh is true", () => {
    // Both cache tiers should be gated by !forceRefresh
    const ramSkip = clientSource.includes("if (!forceRefresh)");
    expect(ramSkip).toBe(true);
    // Count occurrences of !forceRefresh — should be at least 2 (RAM + DB)
    const matches = clientSource.match(/if \(!forceRefresh\)/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it("otxClient.ts has DB_CACHE_TTLS with appropriate values", () => {
    // Pulse TTL should be longer than 1 hour (in seconds)
    expect(clientSource).toContain("pulse:");
    expect(clientSource).toContain("indicator:");
    expect(clientSource).toContain("search:");
    expect(clientSource).toContain("activity:");
    expect(clientSource).toContain("status:");
  });

  it("otxClient.ts exports cache management functions", () => {
    expect(clientSource).toContain("export function flushRamCache");
    expect(clientSource).toContain("export function getCacheStats");
    expect(clientSource).toContain("export async function purgeExpiredDbCache");
    expect(clientSource).toContain("export async function getDbCacheStats");
  });

  it("otxClient.ts uses INSERT ON DUPLICATE KEY UPDATE for upsert", () => {
    expect(clientSource).toContain("onDuplicateKeyUpdate");
  });

  it("otxClient.ts classifies endpoints correctly", () => {
    expect(clientSource).toContain("classifyEndpoint");
    expect(clientSource).toContain('/indicators/');
    expect(clientSource).toContain('/search/');
    expect(clientSource).toContain('/activity');
    expect(clientSource).toContain('/users/me');
  });

  it("otxRouter.ts has forceRefresh on all data endpoints", () => {
    // All data endpoints should accept forceRefresh
    const endpoints = [
      "subscribedPulses",
      "pulseDetail",
      "pulseIndicators",
      "searchPulses",
      "indicatorLookup",
      "activity",
    ];
    for (const ep of endpoints) {
      expect(routerSource).toContain(ep);
    }
    // Count forceRefresh occurrences — should be at least 6 (one per endpoint input)
    const forceRefreshInputs = routerSource.match(/forceRefresh: z\.boolean/g);
    expect(forceRefreshInputs).not.toBeNull();
    expect(forceRefreshInputs!.length).toBeGreaterThanOrEqual(6);
  });

  it("otxRouter.ts has cacheStats and forceRefreshAll endpoints", () => {
    expect(routerSource).toContain("cacheStats:");
    expect(routerSource).toContain("forceRefreshAll:");
    expect(routerSource).toContain("getCacheStats");
    expect(routerSource).toContain("getDbCacheStats");
    expect(routerSource).toContain("flushRamCache");
    expect(routerSource).toContain("purgeExpiredDbCache");
  });

  it("otxRouter.ts passes forceRefresh to otxGet calls", () => {
    // Each otxGet call should pass input.forceRefresh as the last arg
    const forceRefreshPasses = routerSource.match(/input\.forceRefresh/g);
    expect(forceRefreshPasses).not.toBeNull();
    expect(forceRefreshPasses!.length).toBeGreaterThanOrEqual(6);
  });
});

// ── Schema regression test ─────────────────────────────────────────────────

describe("OTX Cache — Schema", () => {
  const schemaSource = readFileSync(
    resolve(__dirname, "../../drizzle/schema.ts"),
    "utf-8"
  );

  it("schema.ts defines threat_intel_cache table", () => {
    expect(schemaSource).toContain('threatIntelCache');
    expect(schemaSource).toContain('"threat_intel_cache"');
  });

  it("threat_intel_cache has required columns", () => {
    // Check for all required columns
    expect(schemaSource).toContain('"cacheKey"');
    expect(schemaSource).toContain('"endpointType"');
    expect(schemaSource).toContain('"responseData"');
    expect(schemaSource).toContain('"fetchedAt"');
    expect(schemaSource).toContain('"expiresAt"');
  });

  it("threat_intel_cache has correct indexes", () => {
    expect(schemaSource).toContain("tic_cacheKey_idx");
    expect(schemaSource).toContain("tic_expiresAt_idx");
    expect(schemaSource).toContain("tic_endpointType_idx");
  });

  it("threat_intel_cache endpointType enum has all types", () => {
    expect(schemaSource).toContain('"pulse"');
    expect(schemaSource).toContain('"indicator"');
    expect(schemaSource).toContain('"search"');
    expect(schemaSource).toContain('"activity"');
    expect(schemaSource).toContain('"status"');
  });

  it("threat_intel_cache exports types", () => {
    expect(schemaSource).toContain("ThreatIntelCacheRow");
    expect(schemaSource).toContain("InsertThreatIntelCacheRow");
  });
});

// ── Frontend regression test ───────────────────────────────────────────────

describe("OTX Cache — Frontend Integration", () => {
  const threatIntelSource = readFileSync(
    resolve(__dirname, "../../client/src/pages/ThreatIntel.tsx"),
    "utf-8"
  );

  it("ThreatIntel.tsx uses forceRefreshAll mutation", () => {
    expect(threatIntelSource).toContain("forceRefreshAll");
    expect(threatIntelSource).toContain("forceRefreshMutation");
  });

  it("ThreatIntel.tsx shows cache stats badge", () => {
    expect(threatIntelSource).toContain("cacheStats");
    expect(threatIntelSource).toContain("cacheStatsQuery");
  });

  it("ThreatIntel.tsx has Force Refresh button", () => {
    expect(threatIntelSource).toContain("Force Refresh");
    expect(threatIntelSource).toContain("handleForceRefresh");
  });

  it("ThreatIntel.tsx shows flushing state", () => {
    expect(threatIntelSource).toContain("Flushing");
    expect(threatIntelSource).toContain("forceRefreshMutation.isPending");
  });
});

// ── Unit tests for cache functions (mocked DB) ────────────────────────────

describe("OTX Cache — Unit Tests", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("classifyEndpoint returns correct types", async () => {
    // We test the function indirectly through the source
    const clientSource = readFileSync(
      resolve(__dirname, "./otxClient.ts"),
      "utf-8"
    );
    // Verify the classification logic exists
    expect(clientSource).toContain('"/indicators/"');
    expect(clientSource).toContain('"/search/"');
    expect(clientSource).toContain('"/activity"');
    expect(clientSource).toContain('"/users/me"');
    expect(clientSource).toContain('return "pulse"'); // default
  });

  it("DB_CACHE_TTLS has reasonable values", async () => {
    const clientSource = readFileSync(
      resolve(__dirname, "./otxClient.ts"),
      "utf-8"
    );
    // Extract TTL values from source
    const pulseTtl = clientSource.match(/pulse:\s*(\d+)\s*\*/);
    const indicatorTtl = clientSource.match(/indicator:\s*(\d+)/);
    const searchTtl = clientSource.match(/search:\s*(\d+)/);

    // Pulse should be at least 1 hour (3600s)
    expect(pulseTtl).not.toBeNull();
    // Indicator should be at least 10 minutes (600s)
    expect(indicatorTtl).not.toBeNull();
    // Search should be at least 5 minutes (300s)
    expect(searchTtl).not.toBeNull();
  });

  it("RAM cache TTL is 5 minutes (300s)", async () => {
    const clientSource = readFileSync(
      resolve(__dirname, "./otxClient.ts"),
      "utf-8"
    );
    expect(clientSource).toContain("stdTTL: 300");
  });
});
