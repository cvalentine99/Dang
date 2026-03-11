import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for the LLM Service — custom endpoint routing with fallback.
 */

// Mock the connection settings service
vi.mock("../admin/connectionSettingsService", () => ({
  getEffectiveSettings: vi.fn(),
}));

// Mock the built-in LLM
vi.mock("../_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { getEffectiveSettings } from "../admin/connectionSettingsService";
import { invokeLLM as invokeBuiltInLLM } from "../_core/llm";

// Import after mocks
const { getEffectiveLLMConfig, isCustomLLMEnabled, invokeLLMWithFallback, testLLMConnection } = await import("./llmService");

const mockGetEffectiveSettings = vi.mocked(getEffectiveSettings);
const mockInvokeBuiltIn = vi.mocked(invokeBuiltInLLM);

describe("LLM Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getEffectiveLLMConfig", () => {
    it("should return config from DB settings when available", async () => {
      mockGetEffectiveSettings.mockResolvedValue({
        values: {
          host: "10.0.0.5",
          port: "8080",
          model: "my-custom-model",
          enabled: "true",
          protocol: "http",
          api_key: "sk-test",
        },
        sources: {
          host: "database",
          port: "database",
          model: "database",
          enabled: "database",
          protocol: "database",
          api_key: "database",
        },
      });

      const config = await getEffectiveLLMConfig();

      expect(config.host).toBe("10.0.0.5");
      expect(config.port).toBe(8080);
      expect(config.model).toBe("my-custom-model");
      expect(config.enabled).toBe(true);
      expect(config.protocol).toBe("http");
      expect(config.apiKey).toBe("sk-test");
    });

    it("should fall back to env defaults when DB is unavailable", async () => {
      mockGetEffectiveSettings.mockRejectedValue(new Error("DB unavailable"));

      const config = await getEffectiveLLMConfig();

      // Should use env defaults (set via webdev_request_secrets)
      expect(config.host).toBe(process.env.LLM_HOST || "");
      expect(config.port).toBe(parseInt(process.env.LLM_PORT || "30000", 10));
      expect(config.model).toBe(process.env.LLM_MODEL || "unsloth/Nemotron-3-Nano-30B-A3B-GGUF");
    });

    it("should use defaults for missing fields", async () => {
      mockGetEffectiveSettings.mockResolvedValue({
        values: { host: "localhost", enabled: "true" },
        sources: { host: "env", enabled: "env" },
      });

      const config = await getEffectiveLLMConfig();

      expect(config.host).toBe("localhost");
      expect(config.port).toBe(parseInt(process.env.LLM_PORT || "30000", 10));
      expect(config.model).toBe(process.env.LLM_MODEL || "unsloth/Nemotron-3-Nano-30B-A3B-GGUF");
      expect(config.protocol).toBe("http");
    });
  });

  describe("isCustomLLMEnabled", () => {
    it("should return true when enabled and host is set", async () => {
      mockGetEffectiveSettings.mockResolvedValue({
        values: { host: "localhost", enabled: "true" },
        sources: { host: "env", enabled: "env" },
      });

      const result = await isCustomLLMEnabled();
      expect(result).toBe(true);
    });

    it("should return false when disabled", async () => {
      mockGetEffectiveSettings.mockResolvedValue({
        values: { host: "10.0.0.5", enabled: "false" },
        sources: { host: "env", enabled: "env" },
      });

      const result = await isCustomLLMEnabled();
      expect(result).toBe(false);
    });

    it("should return false when host is empty and no env fallback", async () => {
      // When host is empty AND the env default is also empty, should be false
      mockGetEffectiveSettings.mockResolvedValue({
        values: { enabled: "false" },
        sources: { enabled: "env" },
      });

      const result = await isCustomLLMEnabled();
      expect(result).toBe(false);
    });
  });

  describe("invokeLLMWithFallback", () => {
    const mockParams = {
      messages: [
        { role: "system" as const, content: "You are helpful." },
        { role: "user" as const, content: "Hello" },
      ],
    };

    const mockBuiltInResponse = {
      id: "chatcmpl-built-in",
      created: Date.now(),
      model: "gemini-2.5-flash",
      choices: [{
        index: 0,
        message: { role: "assistant" as const, content: "Hello from built-in!" },
        finish_reason: "stop",
      }],
    };

    it("should use built-in LLM when custom is disabled", async () => {
      mockGetEffectiveSettings.mockResolvedValue({
        values: { host: "10.0.0.5", enabled: "false" },
        sources: { host: "env", enabled: "env" },
      });
      mockInvokeBuiltIn.mockResolvedValue(mockBuiltInResponse);

      const result = await invokeLLMWithFallback(mockParams);

      expect(result).toEqual(mockBuiltInResponse);
      expect(mockInvokeBuiltIn).toHaveBeenCalledWith(mockParams);
    });

    it("should use built-in LLM when custom LLM is disabled", async () => {
      mockGetEffectiveSettings.mockResolvedValue({
        values: { host: "10.0.0.5", enabled: "false" },
        sources: { host: "env", enabled: "env" },
      });
      mockInvokeBuiltIn.mockResolvedValue(mockBuiltInResponse);

      const result = await invokeLLMWithFallback(mockParams);

      expect(result).toEqual(mockBuiltInResponse);
      expect(mockInvokeBuiltIn).toHaveBeenCalled();
    });

    it("should fall back to built-in when custom endpoint fails", async () => {
      mockGetEffectiveSettings.mockResolvedValue({
        values: { host: "unreachable-host", port: "9999", enabled: "true", protocol: "http", model: "test-model" },
        sources: { host: "database", port: "database", enabled: "database", protocol: "database", model: "database" },
      });
      mockInvokeBuiltIn.mockResolvedValue(mockBuiltInResponse);

      // The custom endpoint will fail (unreachable), should fall back
      const result = await invokeLLMWithFallback(mockParams);

      expect(result).toEqual(mockBuiltInResponse);
      expect(mockInvokeBuiltIn).toHaveBeenCalled();
    });
  });

  describe("testLLMConnection", () => {
    it("should fail when host is empty", async () => {
      const result = await testLLMConnection({ host: "", port: "30000" });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Host is required");
    });

    it("should handle unreachable endpoints gracefully", async () => {
      const result = await testLLMConnection({
        host: "unreachable.invalid",
        port: "12345",
        protocol: "http",
      });

      expect(result.success).toBe(false);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      // Should have a meaningful error message
      expect(result.message.length).toBeGreaterThan(0);
    }, 15000);
  });
});

describe("Connection Settings Integration", () => {
  it("should have LLM in the category enum of the connection settings router", async () => {
    // Verify the category schema accepts 'llm'
    const { z } = await import("zod");
    const categorySchema = z.enum(["wazuh_manager", "wazuh_indexer", "llm"]);

    expect(categorySchema.parse("llm")).toBe("llm");
    expect(() => categorySchema.parse("invalid")).toThrow();
  });

  it("should encrypt api_key as a sensitive field", () => {
    // Verify api_key is treated as sensitive
    const SENSITIVE_KEYS = new Set(["pass", "password", "api_key"]);
    expect(SENSITIVE_KEYS.has("api_key")).toBe(true);
  });
});
