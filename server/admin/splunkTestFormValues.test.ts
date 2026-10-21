/**
 * L6 — admin "Test Connection" for Splunk tests the values in the FORM.
 */
import { describe, it, expect, vi } from "vitest";

const testSplunkConnection = vi.fn(async () => ({ success: true, message: "ok", latencyMs: 3 }));
vi.mock("../splunk/splunkService", () => ({ testSplunkConnection: (o: unknown) => testSplunkConnection(o) }));
vi.mock("./connectionSettingsService", () => ({
  getEffectiveSettings: vi.fn(async () => ({ values: { host: "saved-host", hec_token: "saved-token" }, sources: {} })),
  saveSettings: vi.fn(),
  resetSettings: vi.fn(),
  invalidateCache: vi.fn(),
}));
vi.mock("../llm/llmService", () => ({ testLLMConnection: vi.fn() }));

import { connectionSettingsRouter } from "./connectionSettingsRouter";

const admin = () => connectionSettingsRouter.createCaller({
  user: { id: 1, openId: "a", email: "a@example.com", name: "a", loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  req: { protocol: "https", headers: {} },
  res: { clearCookie: () => {} },
} as never);

describe("connectionSettings.testConnection (splunk)", () => {
  it("passes the form values (not the merged saved set) to testSplunkConnection", async () => {
    const r = await admin().testConnection({
      category: "splunk",
      settings: { host: "new-host", hec_token: "", hec_port: "8089", protocol: "https" },
    });
    expect(r).toMatchObject({ success: true, message: "ok", latencyMs: 3 });
    expect(testSplunkConnection).toHaveBeenCalledWith({
      host: "new-host",
      port: undefined,
      hecToken: undefined, // empty form field → not sent; the service then refuses to reuse the saved token for a new host
      hecPort: "8089",
      protocol: "https",
    });
  });
});
