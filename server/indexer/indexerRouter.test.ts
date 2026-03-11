import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

// Mock the indexer client module
vi.mock("./indexerClient", () => ({
  isIndexerConfigured: vi.fn(() => false),
  getIndexerConfig: vi.fn(() => ({
    host: "https://indexer.example.com",
    port: 9200,
    user: "admin",
    pass: "admin",
  })),
  getEffectiveIndexerConfig: vi.fn(async () => ({
    host: "https://indexer.example.com",
    port: 9200,
    user: "admin",
    pass: "admin",
  })),
  isIndexerEffectivelyConfigured: vi.fn(async () => true),
  indexerSearch: vi.fn(async () => ({
    hits: {
      total: { value: 5, relation: "eq" },
      hits: [
        {
          _id: "1",
          _source: {
            timestamp: "2026-02-23T10:00:00Z",
            rule: { id: "100001", level: 7, description: "Test alert", groups: ["syslog"] },
            agent: { id: "001", name: "test-agent", ip: "10.0.1.10" },
            decoder: { name: "syslog" },
          },
        },
      ],
    },
    aggregations: {
      result: {
        buckets: [
          { key: "syslog", doc_count: 10 },
          { key: "json", doc_count: 5 },
        ],
      },
      timeline: {
        buckets: [
          { key_as_string: "2026-02-23T10:00:00Z", doc_count: 3 },
          { key_as_string: "2026-02-23T11:00:00Z", doc_count: 7 },
        ],
      },
    },
  })),
  indexerHealth: vi.fn(async () => ({
    status: "green",
    cluster_name: "wazuh-cluster",
    number_of_nodes: 1,
  })),
  indexerIndexExists: vi.fn(async () => true),
  INDEX_PATTERNS: {
    alerts: "wazuh-alerts-*",
    archives: "wazuh-archives-*",
    monitoring: "wazuh-monitoring-*",
    statistics: "wazuh-statistics-*",
    vulnerabilities: "wazuh-states-vulnerabilities-*",
    fim: "wazuh-states-fim-*",
  },
  timeRangeFilter: vi.fn(() => ({
    range: { timestamp: { gte: "now-1h", lte: "now" } },
  })),
  boolQuery: vi.fn((opts: Record<string, unknown>) => ({
    bool: { must: opts.must ?? [], filter: opts.filter ?? [], must_not: opts.must_not ?? [] },
  })),
  dateHistogramAgg: vi.fn(() => ({
    date_histogram: { field: "timestamp", fixed_interval: "1h" },
  })),
  termsAgg: vi.fn((field: string, size: number) => ({
    terms: { field, size },
  })),
}));

// Mock the wazuh client module
vi.mock("../wazuh/wazuhClient", () => ({
  isWazuhConfigured: vi.fn(() => false),
  getWazuhConfig: vi.fn(() => null),
  wazuhGet: vi.fn(async () => ({ data: { affected_items: [] } })),
  getEffectiveWazuhConfig: vi.fn(async () => null),
  isWazuhEffectivelyConfigured: vi.fn(async () => false),
}));

// Mock the connectionSettingsService
vi.mock("../admin/connectionSettingsService", () => ({
  getEffectiveWazuhConfig: vi.fn(async () => null),
  getEffectiveIndexerConfig: vi.fn(async () => ({
    host: "https://indexer.example.com",
    port: 9200,
    user: "admin",
    pass: "admin",
  })),
  isWazuhEffectivelyConfigured: vi.fn(async () => false),
  isIndexerEffectivelyConfigured: vi.fn(async () => true),
}));

function createTestContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "local",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("indexer router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createTestContext());
  });

  describe("status endpoint", () => {
    it("returns configured status", async () => {
      const result = await caller.indexer.status();
      expect(result).toHaveProperty("configured");
      expect(typeof result.configured).toBe("boolean");
    });
  });

  describe("alertsSearch endpoint", () => {
    it("accepts time range and returns results", async () => {
      const result = await caller.indexer.alertsSearch({
        from: "now-1h",
        to: "now",
        size: 10,
      });
      expect(result).toBeDefined();
    });

    it("accepts severity filter", async () => {
      const result = await caller.indexer.alertsSearch({
        from: "now-1h",
        to: "now",
        size: 10,
        severity: "high",
      });
      expect(result).toBeDefined();
    });

    it("accepts agentId filter", async () => {
      const result = await caller.indexer.alertsSearch({
        from: "now-1h",
        to: "now",
        size: 10,
        agentId: "001",
      });
      expect(result).toBeDefined();
    });

    it("accepts decoderName filter", async () => {
      const result = await caller.indexer.alertsSearch({
        from: "now-1h",
        to: "now",
        size: 10,
        decoderName: "syslog",
      });
      expect(result).toBeDefined();
    });

    it("accepts keyword search", async () => {
      const result = await caller.indexer.alertsSearch({
        from: "now-1h",
        to: "now",
        size: 10,
        keyword: "ssh",
      });
      expect(result).toBeDefined();
    });
  });

  describe("alertsAggByLevel endpoint", () => {
    it("accepts time range and returns results", async () => {
      const result = await caller.indexer.alertsAggByLevel({
        from: "now-1h",
        to: "now",
      });
      expect(result).toBeDefined();
    });
  });

  describe("alertsAggByMitre endpoint", () => {
    it("accepts time range and returns results", async () => {
      const result = await caller.indexer.alertsAggByMitre({
        from: "now-1h",
        to: "now",
      });
      expect(result).toBeDefined();
    });
  });


  describe("alertsTimeline endpoint", () => {
    it("accepts time range and interval", async () => {
      const result = await caller.indexer.alertsTimeline({
        from: "now-24h",
        to: "now",
        interval: "1h",
      });
      expect(result).toBeDefined();
    });

    it("accepts optional agentId filter", async () => {
      const result = await caller.indexer.alertsTimeline({
        from: "now-24h",
        to: "now",
        interval: "1h",
        agentId: "001",
      });
      expect(result).toBeDefined();
    });
  });

  describe("vulnSearch endpoint", () => {
    it("accepts time range and returns results", async () => {
      const result = await caller.indexer.vulnSearch({
        from: "now-7d",
        to: "now",
        size: 50,
      });
      expect(result).toBeDefined();
    });

    it("accepts severity filter", async () => {
      const result = await caller.indexer.vulnSearch({
        from: "now-7d",
        to: "now",
        size: 50,
        severity: "Critical",
      });
      expect(result).toBeDefined();
    });
  });
});

describe("safeSearch response envelope", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createTestContext());
  });

  it("alertsSearch wraps ES response in { configured, data } envelope", async () => {
    const result = await caller.indexer.alertsSearch({
      from: "now-1h",
      to: "now",
      size: 10,
    });
    // safeSearch returns { configured: bool, data: <ES response> }
    expect(result).toHaveProperty("configured");
    expect(result).toHaveProperty("data");
    // The ES response is nested under .data, NOT at the top level
    expect(result).not.toHaveProperty("hits");
    expect(result).not.toHaveProperty("aggregations");
    // The actual ES data is under .data
    const esData = (result as Record<string, unknown>).data as Record<string, unknown>;
    expect(esData).toHaveProperty("hits");
    expect(esData.hits).toHaveProperty("hits");
  });

  it("alertsAggByLevel wraps ES response in { configured, data } envelope", async () => {
    const result = await caller.indexer.alertsAggByLevel({
      from: "now-1h",
      to: "now",
    });
    expect(result).toHaveProperty("configured");
    expect(result).toHaveProperty("data");
    expect(result).not.toHaveProperty("aggregations");
    const esData = (result as Record<string, unknown>).data as Record<string, unknown>;
    expect(esData).toHaveProperty("aggregations");
  });

  it("alertsAggByMitre wraps ES response in { configured, data } envelope", async () => {
    const result = await caller.indexer.alertsAggByMitre({
      from: "now-1h",
      to: "now",
    });
    expect(result).toHaveProperty("configured");
    expect(result).toHaveProperty("data");
    expect(result).not.toHaveProperty("aggregations");
  });

  it("vulnSearch wraps ES response in { configured, data } envelope", async () => {
    const result = await caller.indexer.vulnSearch({
      from: "now-7d",
      to: "now",
      size: 10,
    });
    expect(result).toHaveProperty("configured");
    expect(result).toHaveProperty("data");
    expect(result).not.toHaveProperty("hits");
  });
});

describe("indexer router auth gating", () => {
  it("rejects unauthenticated access to indexer.status", async () => {
    const unauthCaller = appRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    });
    await expect(unauthCaller.indexer.status()).rejects.toThrow();
  });

  it("rejects unauthenticated access to indexer.alertsSearch", async () => {
    const unauthCaller = appRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    });
    await expect(unauthCaller.indexer.alertsSearch({ from: "now-1h", to: "now", size: 10 })).rejects.toThrow();
  });

  it("rejects unauthenticated access to indexer.vulnSearch", async () => {
    const unauthCaller = appRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    });
    await expect(unauthCaller.indexer.vulnSearch({ from: "now-7d", to: "now", size: 10 })).rejects.toThrow();
  });
});
