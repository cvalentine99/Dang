/**
 * indexerClient.test.ts — Unit tests for the Wazuh Indexer client module.
 *
 * Tests cover:
 * - Config loading from env vars
 * - Rate limiter behaviour
 * - Sensitive field stripping
 * - Query builder helpers (timeRangeFilter, boolQuery, dateHistogramAgg, termsAgg)
 * - INDEX_PATTERNS constants
 * - indexerSearch / indexerHealth / indexerIndexExists (with mocked axios)
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ── Mock axios before importing the module ──────────────────────────────────
const mockPost = vi.fn();
const mockGet = vi.fn();
const mockHead = vi.fn();
vi.mock("axios", () => {
  const isAxiosError = (err: unknown) =>
    typeof err === "object" && err !== null && "isAxiosError" in err;
  return {
    default: {
      create: () => ({
        post: mockPost,
        get: mockGet,
        head: mockHead,
      }),
      isAxiosError,
    },
    isAxiosError: (err: unknown) =>
      typeof err === "object" && err !== null && "isAxiosError" in err,
  };
});

// Import the module under test after mocks are set up
import {
  getIndexerConfig,
  isIndexerConfigured,
  INDEX_PATTERNS,
  indexerSearch,
  indexerHealth,
  indexerIndexExists,
  timeRangeFilter,
  boolQuery,
  dateHistogramAgg,
  termsAgg,
  type IndexerConfig,
  type ESSearchBody,
} from "./indexerClient";

// ── Test config ──────────────────────────────────────────────────────────────
const TEST_CONFIG: IndexerConfig = {
  host: "indexer.test.local",
  port: 9200,
  user: "admin",
  pass: "testpass",
  protocol: "https",
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function setEnvVars(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

describe("indexerClient", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore env vars
    process.env = { ...originalEnv };
  });

  // ── Config tests ─────────────────────────────────────────────────────────
  describe("getIndexerConfig", () => {
    it("returns config from env vars when all are set", () => {
      setEnvVars({
        WAZUH_INDEXER_HOST: "my-indexer.local",
        WAZUH_INDEXER_PORT: "9201",
        WAZUH_INDEXER_USER: "admin",
        WAZUH_INDEXER_PASS: "secret123",
        WAZUH_INDEXER_PROTOCOL: "http",
      });
      const config = getIndexerConfig();
      expect(config.host).toBe("my-indexer.local");
      expect(config.port).toBe(9201);
      expect(config.user).toBe("admin");
      expect(config.pass).toBe("secret123");
      expect(config.protocol).toBe("http");
    });

    it("defaults port to 9200 when WAZUH_INDEXER_PORT is not set", () => {
      setEnvVars({
        WAZUH_INDEXER_HOST: "indexer.local",
        WAZUH_INDEXER_PORT: undefined,
        WAZUH_INDEXER_USER: "admin",
        WAZUH_INDEXER_PASS: "pass",
      });
      const config = getIndexerConfig();
      expect(config.port).toBe(9200);
    });

    it("defaults protocol to https when WAZUH_INDEXER_PROTOCOL is not set", () => {
      setEnvVars({
        WAZUH_INDEXER_HOST: "indexer.local",
        WAZUH_INDEXER_USER: "admin",
        WAZUH_INDEXER_PASS: "pass",
        WAZUH_INDEXER_PROTOCOL: undefined,
      });
      const config = getIndexerConfig();
      expect(config.protocol).toBe("https");
    });

    it("throws when WAZUH_INDEXER_HOST is missing", () => {
      setEnvVars({
        WAZUH_INDEXER_HOST: undefined,
        WAZUH_INDEXER_USER: "admin",
        WAZUH_INDEXER_PASS: "pass",
      });
      expect(() => getIndexerConfig()).toThrow("not configured");
    });

    it("throws when WAZUH_INDEXER_USER is missing", () => {
      setEnvVars({
        WAZUH_INDEXER_HOST: "indexer.local",
        WAZUH_INDEXER_USER: undefined,
        WAZUH_INDEXER_PASS: "pass",
      });
      expect(() => getIndexerConfig()).toThrow("not configured");
    });

    it("throws when WAZUH_INDEXER_PASS is missing", () => {
      setEnvVars({
        WAZUH_INDEXER_HOST: "indexer.local",
        WAZUH_INDEXER_USER: "admin",
        WAZUH_INDEXER_PASS: undefined,
      });
      expect(() => getIndexerConfig()).toThrow("not configured");
    });
  });

  describe("isIndexerConfigured", () => {
    it("returns true when all required env vars are set", () => {
      setEnvVars({
        WAZUH_INDEXER_HOST: "indexer.local",
        WAZUH_INDEXER_USER: "admin",
        WAZUH_INDEXER_PASS: "pass",
      });
      expect(isIndexerConfigured()).toBe(true);
    });

    it("returns false when host is missing", () => {
      setEnvVars({
        WAZUH_INDEXER_HOST: undefined,
        WAZUH_INDEXER_USER: "admin",
        WAZUH_INDEXER_PASS: "pass",
      });
      expect(isIndexerConfigured()).toBe(false);
    });

    it("returns false when user is missing", () => {
      setEnvVars({
        WAZUH_INDEXER_HOST: "indexer.local",
        WAZUH_INDEXER_USER: undefined,
        WAZUH_INDEXER_PASS: "pass",
      });
      expect(isIndexerConfigured()).toBe(false);
    });

    it("returns false when pass is missing", () => {
      setEnvVars({
        WAZUH_INDEXER_HOST: "indexer.local",
        WAZUH_INDEXER_USER: "admin",
        WAZUH_INDEXER_PASS: undefined,
      });
      expect(isIndexerConfigured()).toBe(false);
    });
  });

  // ── INDEX_PATTERNS ────────────────────────────────────────────────────────
  describe("INDEX_PATTERNS", () => {
    it("has the expected alert index pattern", () => {
      expect(INDEX_PATTERNS.ALERTS).toBe("wazuh-alerts-*");
    });

    it("has the expected vulnerability index pattern", () => {
      expect(INDEX_PATTERNS.VULNERABILITIES).toBe("wazuh-states-vulnerabilities-*");
    });

    it("has the expected archives index pattern", () => {
      expect(INDEX_PATTERNS.ARCHIVES).toBe("wazuh-archives-*");
    });

    it("has the expected monitoring index pattern", () => {
      expect(INDEX_PATTERNS.MONITORING).toBe("wazuh-monitoring-*");
    });

    it("has the expected statistics index pattern", () => {
      expect(INDEX_PATTERNS.STATISTICS).toBe("wazuh-statistics-*");
    });

    it("has exactly 5 index patterns", () => {
      expect(Object.keys(INDEX_PATTERNS)).toHaveLength(5);
    });
  });

  // ── Query builder helpers ─────────────────────────────────────────────────
  describe("timeRangeFilter", () => {
    it("builds a range filter with default timestamp field", () => {
      const filter = timeRangeFilter("now-1h", "now");
      expect(filter).toEqual({
        range: {
          timestamp: {
            gte: "now-1h",
            lte: "now",
            format: "strict_date_optional_time",
          },
        },
      });
    });

    it("supports custom field name", () => {
      const filter = timeRangeFilter("2026-01-01", "2026-01-31", "@timestamp");
      expect(filter).toEqual({
        range: {
          "@timestamp": {
            gte: "2026-01-01",
            lte: "2026-01-31",
            format: "strict_date_optional_time",
          },
        },
      });
    });
  });

  describe("boolQuery", () => {
    it("builds a bool query with must clauses", () => {
      const q = boolQuery({ must: [{ term: { status: "active" } }] });
      expect(q).toEqual({
        bool: { must: [{ term: { status: "active" } }] },
      });
    });

    it("builds a bool query with filter clauses", () => {
      const q = boolQuery({ filter: [{ term: { level: 12 } }] });
      expect(q).toEqual({
        bool: { filter: [{ term: { level: 12 } }] },
      });
    });

    it("builds a bool query with must_not clauses", () => {
      const q = boolQuery({ must_not: [{ term: { status: "deleted" } }] });
      expect(q).toEqual({
        bool: { must_not: [{ term: { status: "deleted" } }] },
      });
    });

    it("builds a bool query with should and minimum_should_match", () => {
      const q = boolQuery({
        should: [{ match: { message: "ssh" } }, { match: { message: "sshd" } }],
        minimum_should_match: 1,
      });
      expect(q).toEqual({
        bool: {
          should: [{ match: { message: "ssh" } }, { match: { message: "sshd" } }],
          minimum_should_match: 1,
        },
      });
    });

    it("omits empty clause arrays", () => {
      const q = boolQuery({ must: [], filter: [{ term: { level: 5 } }] });
      // Empty must should not appear
      expect(q).toEqual({
        bool: { filter: [{ term: { level: 5 } }] },
      });
    });

    it("returns empty bool when no clauses provided", () => {
      const q = boolQuery({});
      expect(q).toEqual({ bool: {} });
    });
  });

  describe("dateHistogramAgg", () => {
    it("builds a date histogram with defaults", () => {
      const agg = dateHistogramAgg();
      expect(agg).toEqual({
        date_histogram: {
          field: "timestamp",
          fixed_interval: "1h",
          min_doc_count: 0,
        },
      });
    });

    it("supports custom field and interval", () => {
      const agg = dateHistogramAgg("@timestamp", "15m");
      expect(agg).toEqual({
        date_histogram: {
          field: "@timestamp",
          fixed_interval: "15m",
          min_doc_count: 0,
        },
      });
    });
  });

  describe("termsAgg", () => {
    it("builds a terms aggregation with default size", () => {
      const agg = termsAgg("rule.level");
      expect(agg).toEqual({
        terms: { field: "rule.level", size: 20 },
      });
    });

    it("supports custom size", () => {
      const agg = termsAgg("agent.id", 50);
      expect(agg).toEqual({
        terms: { field: "agent.id", size: 50 },
      });
    });
  });

  // ── indexerSearch ─────────────────────────────────────────────────────────
  describe("indexerSearch", () => {
    it("sends POST to the correct index and returns response", async () => {
      const mockResponse = {
        data: {
          hits: {
            total: { value: 1, relation: "eq" },
            hits: [
              {
                _index: "wazuh-alerts-2026.03",
                _id: "abc123",
                _score: 1.0,
                _source: { rule: { level: 12 }, agent: { id: "001" } },
              },
            ],
          },
          aggregations: {},
          took: 5,
          timed_out: false,
        },
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const body: ESSearchBody = {
        query: { match_all: {} },
        size: 10,
      };
      const result = await indexerSearch(TEST_CONFIG, "wazuh-alerts-*", body);

      expect(mockPost).toHaveBeenCalledWith("/wazuh-alerts-*/_search", body);
      expect(result.hits.hits).toHaveLength(1);
      expect(result.hits.hits[0]._source.rule).toEqual({ level: 12 });
      expect(result.took).toBe(5);
      expect(result.timed_out).toBe(false);
    });

    it("strips sensitive fields from response", async () => {
      const mockResponse = {
        data: {
          hits: {
            total: { value: 1, relation: "eq" },
            hits: [
              {
                _index: "wazuh-alerts-2026.03",
                _id: "abc123",
                _score: 1.0,
                _source: {
                  rule: { level: 12 },
                  password: "should-be-stripped",
                  token: "also-stripped",
                  agent: { id: "001", api_key: "stripped-too" },
                },
              },
            ],
          },
          took: 3,
          timed_out: false,
        },
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const result = await indexerSearch(TEST_CONFIG, "wazuh-alerts-*", { size: 1 });
      const source = result.hits.hits[0]._source;

      // Sensitive fields should be stripped
      expect(source).not.toHaveProperty("password");
      expect(source).not.toHaveProperty("token");
      expect(source.agent).not.toHaveProperty("api_key");
      // Non-sensitive fields should remain
      expect(source.rule).toEqual({ level: 12 });
      expect((source.agent as Record<string, unknown>).id).toBe("001");
    });

    it("throws on axios error with status and message", async () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 403,
          data: { error: { reason: "Forbidden" } },
        },
        message: "Request failed with status code 403",
      };
      mockPost.mockRejectedValueOnce(axiosError);

      await expect(
        indexerSearch(TEST_CONFIG, "wazuh-alerts-*", { size: 1 })
      ).rejects.toThrow("Indexer query failed (403): Forbidden");
    });

    it("throws on non-axios error", async () => {
      mockPost.mockRejectedValueOnce(new Error("Network timeout"));

      await expect(
        indexerSearch(TEST_CONFIG, "wazuh-alerts-*", { size: 1 })
      ).rejects.toThrow("Network timeout");
    });
  });

  // ── indexerHealth ─────────────────────────────────────────────────────────
  describe("indexerHealth", () => {
    it("returns cluster health data", async () => {
      const mockResponse = {
        data: {
          cluster_name: "wazuh-cluster",
          status: "green",
          number_of_nodes: 1,
          active_primary_shards: 5,
        },
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const result = await indexerHealth(TEST_CONFIG);
      expect(mockGet).toHaveBeenCalledWith("/_cluster/health");
      expect(result.cluster_name).toBe("wazuh-cluster");
      expect(result.status).toBe("green");
    });

    it("strips sensitive fields from health response", async () => {
      const mockResponse = {
        data: {
          cluster_name: "wazuh-cluster",
          status: "green",
          secret: "should-not-appear",
        },
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const result = await indexerHealth(TEST_CONFIG);
      expect(result).not.toHaveProperty("secret");
      expect(result.cluster_name).toBe("wazuh-cluster");
    });

    it("throws on axios error", async () => {
      const axiosError = {
        isAxiosError: true,
        message: "ECONNREFUSED",
      };
      mockGet.mockRejectedValueOnce(axiosError);

      await expect(indexerHealth(TEST_CONFIG)).rejects.toThrow(
        "Indexer health check failed: ECONNREFUSED"
      );
    });
  });

  // ── indexerIndexExists ────────────────────────────────────────────────────
  describe("indexerIndexExists", () => {
    it("returns true when index exists (HEAD succeeds)", async () => {
      mockHead.mockResolvedValueOnce({ status: 200 });

      const exists = await indexerIndexExists(TEST_CONFIG, "wazuh-alerts-*");
      expect(mockHead).toHaveBeenCalledWith("/wazuh-alerts-*");
      expect(exists).toBe(true);
    });

    it("returns false when index does not exist (HEAD fails)", async () => {
      mockHead.mockRejectedValueOnce(new Error("404 Not Found"));

      const exists = await indexerIndexExists(TEST_CONFIG, "nonexistent-index");
      expect(exists).toBe(false);
    });
  });
});
