import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

// Mock the database
vi.mock("../db", () => ({
  getDb: vi.fn(async () => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onDuplicateKeyUpdate: vi.fn().mockReturnThis(),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockReturnThis(),
    then: vi.fn().mockResolvedValue([]),
  })),
}));

// Mock connectionSettingsService
vi.mock("./connectionSettingsService", () => ({
  getEffectiveSettings: vi.fn(async () => ({
    values: { host: "localhost", port: "55000", user: "wazuh-wui", pass: "secret" },
    sources: { host: "env", port: "env", user: "env", pass: "env" },
  })),
  saveSettings: vi.fn(async () => undefined),
  resetSettings: vi.fn(async () => undefined),
  invalidateCache: vi.fn(),
  getEffectiveWazuhConfig: vi.fn(async () => null),
  getEffectiveIndexerConfig: vi.fn(async () => null),
  isWazuhEffectivelyConfigured: vi.fn(async () => false),
  isIndexerEffectivelyConfigured: vi.fn(async () => false),
}));

// Mock wazuhClient
vi.mock("../wazuh/wazuhClient", () => ({
  isWazuhConfigured: vi.fn(() => false),
  getWazuhConfig: vi.fn(() => null),
  wazuhGet: vi.fn(async () => ({})),
  getEffectiveWazuhConfig: vi.fn(async () => null),
  isWazuhEffectivelyConfigured: vi.fn(async () => false),
}));

// Mock indexerClient
vi.mock("../indexer/indexerClient", () => ({
  isIndexerConfigured: vi.fn(() => false),
  getIndexerConfig: vi.fn(() => null),
  indexerHealth: vi.fn(async () => ({})),
  getEffectiveIndexerConfig: vi.fn(async () => null),
  isIndexerEffectivelyConfigured: vi.fn(async () => false),
}));

// Mock encryptionService
vi.mock("./encryptionService", () => ({
  encryptValue: vi.fn((v: string) => `encrypted:${v}`),
  decryptValue: vi.fn((v: string) => v.replace("encrypted:", "")),
}));

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-user",
      email: "admin@example.com",
      name: "Admin User",
      loginMethod: "email",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createUserContext(): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "regular-user",
      email: "user@example.com",
      name: "Regular User",
      loginMethod: "email",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createAnonContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("connectionSettings router", () => {
  let adminCaller: ReturnType<typeof appRouter.createCaller>;
  let userCaller: ReturnType<typeof appRouter.createCaller>;
  let anonCaller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    adminCaller = appRouter.createCaller(createAdminContext());
    userCaller = appRouter.createCaller(createUserContext());
    anonCaller = appRouter.createCaller(createAnonContext());
  });

  // ── Access Control ──────────────────────────────────────────────────────

  it("getSettings requires admin role", async () => {
    await expect(
      userCaller.connectionSettings.getSettings({ category: "wazuh_manager" })
    ).rejects.toThrow();
  });

  it("getSettings rejects unauthenticated users", async () => {
    await expect(
      anonCaller.connectionSettings.getSettings({ category: "wazuh_manager" })
    ).rejects.toThrow();
  });

  it("admin can call getSettings for wazuh_manager", async () => {
    const result = await adminCaller.connectionSettings.getSettings({
      category: "wazuh_manager",
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("values");
    expect(result).toHaveProperty("sources");
    expect(result).toHaveProperty("hasPassword");
    // Password should be masked
    expect(result.values.pass).toBe("");
    expect(result.hasPassword.pass).toBe(true);
  });

  it("admin can call getSettings for wazuh_indexer", async () => {
    const result = await adminCaller.connectionSettings.getSettings({
      category: "wazuh_indexer",
    });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("values");
  });

  // ── Update Settings ─────────────────────────────────────────────────────

  it("updateSettings requires admin role", async () => {
    await expect(
      userCaller.connectionSettings.updateSettings({
        category: "wazuh_manager",
        settings: { host: "localhost" },
      })
    ).rejects.toThrow();
  });

  it("admin can update wazuh_manager settings", async () => {
    const result = await adminCaller.connectionSettings.updateSettings({
      category: "wazuh_manager",
      settings: { host: "192.168.50.158", port: "55000" },
    });
    expect(result).toHaveProperty("success", true);
  });

  it("admin can update wazuh_indexer settings", async () => {
    const result = await adminCaller.connectionSettings.updateSettings({
      category: "wazuh_indexer",
      settings: { host: "192.168.50.158", port: "9200" },
    });
    expect(result).toHaveProperty("success", true);
  });

  it("updateSettings rejects invalid category", async () => {
    await expect(
      adminCaller.connectionSettings.updateSettings({
        category: "invalid_service" as any,
        settings: { host: "192.168.1.1" },
      })
    ).rejects.toThrow();
  });

  // ── Test Connection ─────────────────────────────────────────────────────

  it("testConnection requires admin role", async () => {
    await expect(
      userCaller.connectionSettings.testConnection({
        category: "wazuh_manager",
        settings: { host: "localhost" },
      })
    ).rejects.toThrow();
  });

  it("testConnection returns failure when host/user/pass missing", async () => {
    // Override the mock to return empty effective settings so merge still lacks user/pass
    const { getEffectiveSettings } = await import("./connectionSettingsService");
    (getEffectiveSettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      values: { host: "", port: "", user: "", pass: "" },
      sources: { host: "default", port: "default", user: "default", pass: "default" },
    });
    const result = await adminCaller.connectionSettings.testConnection({
      category: "wazuh_manager",
      settings: { host: "localhost" },
    });
    expect(result).toHaveProperty("success", false);
    expect(result.message).toContain("required");
  });

  it("testConnection validates required fields for wazuh_manager", async () => {
    // Override mock to return empty effective settings
    const { getEffectiveSettings } = await import("./connectionSettingsService");
    (getEffectiveSettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      values: { host: "", port: "", user: "", pass: "" },
      sources: { host: "default", port: "default", user: "default", pass: "default" },
    });
    const result = await adminCaller.connectionSettings.testConnection({
      category: "wazuh_manager",
      settings: { host: "test.invalid", port: "55000" },
    });
    expect(result).toHaveProperty("success", false);
    expect(result.message).toContain("required");
    expect(result).toHaveProperty("latencyMs", 0);
  });

  it("testConnection validates required fields for wazuh_indexer", async () => {
    // Override mock to return empty effective settings
    const { getEffectiveSettings } = await import("./connectionSettingsService");
    (getEffectiveSettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      values: { host: "", port: "", user: "", pass: "" },
      sources: { host: "default", port: "default", user: "default", pass: "default" },
    });
    const result = await adminCaller.connectionSettings.testConnection({
      category: "wazuh_indexer",
      settings: { host: "test.invalid", port: "9200" },
    });
    expect(result).toHaveProperty("success", false);
    expect(result.message).toContain("required");
    expect(result).toHaveProperty("latencyMs", 0);
  });

  // ── Reset Settings ──────────────────────────────────────────────────────

  it("resetSettings requires admin role", async () => {
    await expect(
      userCaller.connectionSettings.resetSettings({ category: "wazuh_manager" })
    ).rejects.toThrow();
  });

  it("admin can reset wazuh_manager settings", async () => {
    const result = await adminCaller.connectionSettings.resetSettings({
      category: "wazuh_manager",
    });
    expect(result).toHaveProperty("success", true);
    expect(result.message).toContain("reset");
  });

  it("admin can reset wazuh_indexer settings", async () => {
    const result = await adminCaller.connectionSettings.resetSettings({
      category: "wazuh_indexer",
    });
    expect(result).toHaveProperty("success", true);
  });
});
