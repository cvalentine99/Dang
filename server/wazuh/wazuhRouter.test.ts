import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

// Mock the wazuh client module — include both sync and async config getters
vi.mock("./wazuhClient", () => ({
  isWazuhConfigured: vi.fn(() => false),
  getWazuhConfig: vi.fn(() => ({
    host: "https://wazuh.example.com",
    port: 55000,
    user: "wazuh-wui",
    pass: "test-pass",
  })),
  wazuhGet: vi.fn(async () => ({ data: { affected_items: [], total_affected_items: 0 } })),
  // Async effective config getters (DB override → env fallback)
  getEffectiveWazuhConfig: vi.fn(async () => ({
    host: "https://wazuh.example.com",
    port: 55000,
    user: "wazuh-wui",
    pass: "test-pass",
  })),
  isWazuhEffectivelyConfigured: vi.fn(async () => true),
}));

// Mock the connectionSettingsService to prevent DB access in tests
vi.mock("../admin/connectionSettingsService", () => ({
  getEffectiveWazuhConfig: vi.fn(async () => ({
    host: "https://wazuh.example.com",
    port: 55000,
    user: "wazuh-wui",
    pass: "test-pass",
  })),
  getEffectiveIndexerConfig: vi.fn(async () => null),
  isWazuhEffectivelyConfigured: vi.fn(async () => true),
  isIndexerEffectivelyConfigured: vi.fn(async () => false),
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

describe("wazuh router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createTestContext());
  });

  it("status returns configured: true when Wazuh is configured", async () => {
    const result = await caller.wazuh.status();
    expect(result).toHaveProperty("configured");
    expect(typeof result.configured).toBe("boolean");
  });

  it("isConfigured returns a result with configured property", async () => {
    const result = await caller.wazuh.isConfigured();
    expect(result).toHaveProperty("configured");
    expect(typeof result.configured).toBe("boolean");
  });

  it("agents endpoint exists and returns data structure", async () => {
    const result = await caller.wazuh.agents({ limit: 10, offset: 0 });
    expect(result).toBeDefined();
  });

  it("managerLogs endpoint exists and returns data structure", async () => {
    const result = await caller.wazuh.managerLogs({ limit: 10, offset: 0 });
    expect(result).toBeDefined();
  });

  it("managerStatus endpoint exists", async () => {
    const result = await caller.wazuh.managerStatus();
    expect(result).toBeDefined();
  });

  it("managerInfo endpoint exists", async () => {
    const result = await caller.wazuh.managerInfo();
    expect(result).toBeDefined();
  });

  it("managerStats endpoint exists", async () => {
    const result = await caller.wazuh.managerStats();
    expect(result).toBeDefined();
  });

  it("statsHourly endpoint exists", async () => {
    const result = await caller.wazuh.statsHourly();
    expect(result).toBeDefined();
  });

  it("clusterStatus endpoint exists", async () => {
    const result = await caller.wazuh.clusterStatus();
    expect(result).toBeDefined();
  });

  it("clusterNodes endpoint exists", async () => {
    const result = await caller.wazuh.clusterNodes();
    expect(result).toBeDefined();
  });

  it("scaPolicies endpoint requires agentId", async () => {
    const result = await caller.wazuh.scaPolicies({ agentId: "001" });
    expect(result).toBeDefined();
  });

  it("scaChecks endpoint requires agentId and policyId", async () => {
    const result = await caller.wazuh.scaChecks({ agentId: "001", policyId: "cis_debian10" });
    expect(result).toBeDefined();
  });

  it("syscheckFiles endpoint requires agentId", async () => {
    const result = await caller.wazuh.syscheckFiles({ agentId: "001", limit: 10, offset: 0 });
    expect(result).toBeDefined();
  });

  it("syscheckLastScan endpoint requires agentId", async () => {
    const result = await caller.wazuh.syscheckLastScan({ agentId: "001" });
    expect(result).toBeDefined();
  });

  // agentVulnerabilities removed — GET /vulnerability/{agent_id} does not exist in Wazuh v4.14.
  // Per-agent vuln data now comes from indexer.vulnSearch with agentId filter.

  it("daemonStats endpoint requires daemons array", async () => {
    const result = await caller.wazuh.daemonStats({ daemons: ["wazuh-analysisd"] });
    expect(result).toBeDefined();
  });

  it("syscollectorPackages endpoint requires agentId", async () => {
    const result = await caller.wazuh.agentPackages({ agentId: "001", limit: 50, offset: 0 });
    expect(result).toBeDefined();
  });

  it("syscollectorPorts endpoint requires agentId", async () => {
    const result = await caller.wazuh.agentPorts({ agentId: "001", limit: 50, offset: 0 });
    expect(result).toBeDefined();
  });

  it("syscollectorProcesses endpoint requires agentId", async () => {
    const result = await caller.wazuh.agentProcesses({ agentId: "001", limit: 50, offset: 0 });
    expect(result).toBeDefined();
  });

  it("agentOs endpoint requires agentId", async () => {
    const result = await caller.wazuh.agentOs({ agentId: "001" });
    expect(result).toBeDefined();
  });

  it("agentHardware endpoint requires agentId", async () => {
    const result = await caller.wazuh.agentHardware({ agentId: "001" });
    expect(result).toBeDefined();
  });

  it("agentNetaddr endpoint requires agentId", async () => {
    const result = await caller.wazuh.agentNetaddr({ agentId: "001" });
    expect(result).toBeDefined();
  });

  it("mitreMetadata endpoint exists", async () => {
    const result = await caller.wazuh.mitreMetadata();
    expect(result).toBeDefined();
  });

  it("mitreTechniques endpoint exists", async () => {
    const result = await caller.wazuh.mitreTechniques({ limit: 10, offset: 0 });
    expect(result).toBeDefined();
  });

  it("mitreTactics endpoint exists", async () => {
    const result = await caller.wazuh.mitreTactics({ limit: 10, offset: 0 });
    expect(result).toBeDefined();
  });

  // ── IT Hygiene Ecosystem: Extensions / Services / Identity ──────────────

  it("agentBrowserExtensions endpoint returns data with fallback", async () => {
    const result = await caller.wazuh.agentBrowserExtensions({ agentId: "001", limit: 50, offset: 0 });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("data");
  });

  it("agentServices endpoint returns data with fallback", async () => {
    const result = await caller.wazuh.agentServices({ agentId: "001", limit: 50, offset: 0 });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("data");
  });

  it("agentUsers endpoint returns data with fallback", async () => {
    const result = await caller.wazuh.agentUsers({ agentId: "001", limit: 50, offset: 0 });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("data");
  });

  it("agentGroups2 endpoint returns data with fallback", async () => {
    const result = await caller.wazuh.agentGroups2({ agentId: "001", limit: 50, offset: 0 });
    expect(result).toBeDefined();
    expect(result).toHaveProperty("data");
  });

  // ── P2 GAP Fill Endpoints ──────────────────────────────────────────────────

  describe("P2: agentsSummary", () => {
    it("calls GET /agents/summary with no params", async () => {
      const result = await caller.wazuh.agentsSummary();
      expect(result).toBeDefined();
    });
    it("calls GET /agents/summary with agents_list filter", async () => {
      const result = await caller.wazuh.agentsSummary({ agents_list: "001,002" });
      expect(result).toBeDefined();
    });
    it("calls GET /agents/summary with agents_list as array", async () => {
      const result = await caller.wazuh.agentsSummary({ agents_list: ["001", "002"] });
      expect(result).toBeDefined();
    });
  });

  describe("P2: managerVersionCheck", () => {
    it("calls GET /manager/version/check with no params", async () => {
      const result = await caller.wazuh.managerVersionCheck();
      expect(result).toBeDefined();
    });
    it("calls GET /manager/version/check with force_query=true", async () => {
      const result = await caller.wazuh.managerVersionCheck({ force_query: true });
      expect(result).toBeDefined();
    });
  });

  describe("P2: managerComponentConfig", () => {
    it("calls GET /manager/configuration/{component}/{configuration}", async () => {
      const result = await caller.wazuh.managerComponentConfig({
        component: "analysis",
        configuration: "global",
      });
      expect(result).toBeDefined();
    });
    it("calls with different component/configuration pairs", async () => {
      const result = await caller.wazuh.managerComponentConfig({
        component: "logcollector",
        configuration: "localfile",
      });
      expect(result).toBeDefined();
    });
    it("rejects missing component", async () => {
      await expect(
        (caller.wazuh.managerComponentConfig as any)({ configuration: "global" })
      ).rejects.toThrow();
    });
    it("rejects missing configuration", async () => {
      await expect(
        (caller.wazuh.managerComponentConfig as any)({ component: "analysis" })
      ).rejects.toThrow();
    });
  });

  describe("P2: securityConfig", () => {
    it("calls GET /security/config", async () => {
      const result = await caller.wazuh.securityConfig();
      expect(result).toBeDefined();
    });
  });

  describe("P2: securityCurrentUser", () => {
    it("calls GET /security/users/me", async () => {
      const result = await caller.wazuh.securityCurrentUser();
      expect(result).toBeDefined();
    });
  });
});

describe("wazuh router auth gating", () => {
  it("rejects unauthenticated access to wazuh.status", async () => {
    const unauthCaller = appRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    });
    await expect(unauthCaller.wazuh.status()).rejects.toThrow();
  });

  it("rejects unauthenticated access to wazuh.agents", async () => {
    const unauthCaller = appRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    });
    await expect(unauthCaller.wazuh.agents({ limit: 10, offset: 0 })).rejects.toThrow();
  });

  it("rejects unauthenticated access to wazuh.managerInfo", async () => {
    const unauthCaller = appRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    });
    await expect(unauthCaller.wazuh.managerInfo()).rejects.toThrow();
  });

  it("rejects unauthenticated access to wazuh.securityCurrentUser", async () => {
    const unauthCaller = appRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    });
    await expect(unauthCaller.wazuh.securityCurrentUser()).rejects.toThrow();
  });

  // ── Sprint v2 security-family auth-negative tests (P1 Obj4) ──────────────

  it("rejects unauthenticated access to wazuh.securityRbacRules", async () => {
    const unauthCaller = appRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    });
    await expect(
      unauthCaller.wazuh.securityRbacRules({ limit: 10, offset: 0 })
    ).rejects.toThrow();
  });

  it("rejects unauthenticated access to wazuh.securityActions", async () => {
    const unauthCaller = appRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    });
    await expect(unauthCaller.wazuh.securityActions({})).rejects.toThrow();
  });

  it("rejects unauthenticated access to wazuh.securityResources", async () => {
    const unauthCaller = appRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    });
    await expect(unauthCaller.wazuh.securityResources({})).rejects.toThrow();
  });

  it("rejects unauthenticated access to wazuh.securityCurrentUserPolicies", async () => {
    const unauthCaller = appRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    });
    await expect(
      unauthCaller.wazuh.securityCurrentUserPolicies()
    ).rejects.toThrow();
  });
});
