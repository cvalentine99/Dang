import { describe, it, expect } from "vitest";

/**
 * Validate that Wazuh connection secrets are properly set.
 * These tests verify the environment variables are configured correctly.
 * The app connects to the Wazuh server at 192.168.50.158 on the local network.
 */
describe("Wazuh Connection Secrets", () => {
  it("should have WAZUH_HOST set to 192.168.50.158", () => {
    expect(process.env.WAZUH_HOST).toBe("192.168.50.158");
  });

  it("should have WAZUH_PORT set to 55000", () => {
    expect(process.env.WAZUH_PORT).toBe("55000");
  });

  it("should have WAZUH_USER set to wazuh-wui", () => {
    expect(process.env.WAZUH_USER).toBe("wazuh-wui");
  });

  it("should have WAZUH_PASS set (non-empty)", () => {
    expect(process.env.WAZUH_PASS).toBeTruthy();
    expect(process.env.WAZUH_PASS!.length).toBeGreaterThan(5);
  });

  it("should have WAZUH_INDEXER_HOST set (non-empty)", () => {
    expect(process.env.WAZUH_INDEXER_HOST).toBeTruthy();
  });

  it("should have WAZUH_INDEXER_PORT set to 9200", () => {
    expect(process.env.WAZUH_INDEXER_PORT).toBe("9200");
  });

  it("should have WAZUH_INDEXER_USER set to admin", () => {
    expect(process.env.WAZUH_INDEXER_USER).toBe("admin");
  });

  it("should have WAZUH_INDEXER_PASS set (non-empty)", () => {
    expect(process.env.WAZUH_INDEXER_PASS).toBeTruthy();
    expect(process.env.WAZUH_INDEXER_PASS!.length).toBeGreaterThan(5);
  });
});
