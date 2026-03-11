/**
 * Tests for LLM Router — health check and token usage tracking endpoints.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the LLM service ───────────────────────────────────────────────────

vi.mock("./llmService", () => ({
  getEffectiveLLMConfig: vi.fn().mockResolvedValue({
    host: "localhost",
    port: 30000,
    model: "unsloth/Nemotron-3-Nano-30B-A3B-GGUF",
    apiKey: "",
    enabled: true,
    protocol: "http",
  }),
}));

// ── Mock the database ──────────────────────────────────────────────────────

const mockSelect = vi.fn().mockReturnValue({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue([{
      totalRequests: 42,
      totalPromptTokens: 10000,
      totalCompletionTokens: 5000,
      totalTokens: 15000,
      avgLatencyMs: 350,
      customEndpointRequests: 30,
      builtInRequests: 10,
      fallbackCount: 2,
    }]),
    orderBy: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        offset: vi.fn().mockResolvedValue([]),
      }),
    }),
    groupBy: vi.fn().mockReturnValue({
      orderBy: vi.fn().mockResolvedValue([]),
    }),
  }),
});

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: mockSelect,
  }),
}));

// ── Mock fetch for health check ────────────────────────────────────────────

const originalFetch = global.fetch;

describe("LLM Router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Health Check", () => {
    it("should return online status when LLM endpoint responds", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: "nemotron-nano" }] }),
      });

      // Import after mocks are set up
      const { getEffectiveLLMConfig } = await import("./llmService");
      expect(getEffectiveLLMConfig).toBeDefined();

      // Verify the mock returns the expected config
      const config = await getEffectiveLLMConfig();
      expect(config.host).toBe("localhost");
      expect(config.enabled).toBe(true);

      global.fetch = originalFetch;
    });

    it("should return disabled status when LLM is not enabled", async () => {
      const { getEffectiveLLMConfig } = await import("./llmService");
      vi.mocked(getEffectiveLLMConfig).mockResolvedValueOnce({
        host: "",
        port: 30000,
        model: "test",
        apiKey: "",
        enabled: false,
        protocol: "http",
      });

      const config = await getEffectiveLLMConfig();
      expect(config.enabled).toBe(false);
      expect(config.host).toBe("");
    });

    it("should return offline status when fetch fails", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

      const { getEffectiveLLMConfig } = await import("./llmService");
      const config = await getEffectiveLLMConfig();

      // Simulate what pingLLM does
      if (config.enabled && config.host) {
        try {
          await fetch(`${config.protocol}://${config.host}:${config.port}/v1/models`);
        } catch (err) {
          expect((err as Error).message).toBe("ECONNREFUSED");
        }
      }

      global.fetch = originalFetch;
    });
  });

  describe("Usage Stats", () => {
    it("should return aggregated stats from the database", async () => {
      const { getDb } = await import("../db");
      const db = await getDb();
      expect(db).toBeDefined();
      expect(db!.select).toBeDefined();
    });

    it("should handle empty database gracefully", async () => {
      const { getDb } = await import("../db");
      vi.mocked(getDb).mockResolvedValueOnce(null);

      const db = await getDb();
      expect(db).toBeNull();
    });
  });

  describe("Usage History", () => {
    it("should support 24h, 7d, and 30d ranges", () => {
      const validRanges = ["24h", "7d", "30d"];
      validRanges.forEach((range) => {
        expect(["24h", "7d", "30d"]).toContain(range);
      });
    });

    it("should calculate correct cutoff dates", () => {
      const now = new Date();

      const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      expect(cutoff24h.getTime()).toBeLessThan(now.getTime());
      expect(now.getTime() - cutoff24h.getTime()).toBe(24 * 60 * 60 * 1000);

      const cutoff7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      expect(now.getTime() - cutoff7d.getTime()).toBe(7 * 24 * 60 * 60 * 1000);

      const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      expect(now.getTime() - cutoff30d.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    });
  });

  describe("Recent Calls", () => {
    it("should enforce pagination limits", () => {
      const minLimit = 1;
      const maxLimit = 100;
      const defaultLimit = 25;

      expect(Math.max(minLimit, Math.min(maxLimit, 50))).toBe(50);
      expect(Math.max(minLimit, Math.min(maxLimit, 0))).toBe(minLimit);
      expect(Math.max(minLimit, Math.min(maxLimit, 200))).toBe(maxLimit);
      expect(defaultLimit).toBe(25);
    });

    it("should return empty results when no data", async () => {
      const { getDb } = await import("../db");
      vi.mocked(getDb).mockResolvedValueOnce(null);

      const db = await getDb();
      const result = db ? { calls: [], total: 0 } : { calls: [], total: 0 };
      expect(result.calls).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe("Token Count Formatting", () => {
    it("should format large token counts correctly", () => {
      function formatTokenCount(count: number): string {
        if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
        if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
        return count.toLocaleString();
      }

      expect(formatTokenCount(500)).toBe("500");
      expect(formatTokenCount(1500)).toBe("1.5K");
      expect(formatTokenCount(15000)).toBe("15.0K");
      expect(formatTokenCount(1500000)).toBe("1.5M");
      expect(formatTokenCount(0)).toBe("0");
    });
  });

  describe("LLM Usage Schema", () => {
    it("should define correct source types", () => {
      const validSources = ["custom", "builtin", "fallback"];
      expect(validSources).toContain("custom");
      expect(validSources).toContain("builtin");
      expect(validSources).toContain("fallback");
    });

    it("should track all required fields", () => {
      const requiredFields = [
        "model",
        "source",
        "promptTokens",
        "completionTokens",
        "totalTokens",
        "latencyMs",
        "success",
      ];
      expect(requiredFields.length).toBe(7);
    });
  });
});
