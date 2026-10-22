/**
 * Wazuh 5.0 de-risk — router wiring of WAZUH_STATES_SOURCE and
 * WAZUH_MANAGER_API_STYLE (wazuhGet / indexer search mocked).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const wazuhGet = vi.fn(async (_cfg: unknown, _opts: { path: string }) => ({ data: { affected_items: [{ from: "manager" }], total_affected_items: 1, total_failed_items: 0, failed_items: [] }, message: "m", error: 0 }));
const search = vi.fn();
const cat = vi.fn();

vi.mock("./wazuhClient", () => ({
  isWazuhConfigured: vi.fn(() => true),
  getWazuhConfig: vi.fn(() => ({ host: "w", port: 55000, user: "u", pass: "p" })),
  wazuhGet: (cfg: unknown, opts: { path: string }) => wazuhGet(cfg, opts),
  getEffectiveWazuhConfig: vi.fn(async () => ({ host: "w", port: 55000, user: "u", pass: "p" })),
  isWazuhEffectivelyConfigured: vi.fn(async () => true),
}));
vi.mock("../admin/connectionSettingsService", () => ({
  getEffectiveWazuhConfig: vi.fn(async () => ({ host: "w", port: 55000, user: "u", pass: "p" })),
  getEffectiveIndexerConfig: vi.fn(async () => ({ host: "idx", port: 9200, user: "u", pass: "p", protocol: "https" })),
  isWazuhEffectivelyConfigured: vi.fn(async () => true),
  isIndexerEffectivelyConfigured: vi.fn(async () => true),
}));
vi.mock("../indexer/indexerClient", async (orig) => {
  const real = await orig<typeof import("../indexer/indexerClient")>();
  return { ...real, indexerSearch: (...a: unknown[]) => search(...a), indexerCatIndices: (...a: unknown[]) => cat(...a) };
});

import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { _testing as statesTesting } from "./statesSource";
import { clearCache } from "./requestCache";

function ctx(): TrpcContext {
  return {
    user: { id: 1, openId: "t", email: "t@example.com", name: "T", loginMethod: "local", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

const saved = { ...process.env };
beforeEach(() => {
  statesTesting.resetProbeCache();
  clearCache();
  wazuhGet.mockClear();
  search.mockReset().mockResolvedValue({ took: 1, timed_out: false, hits: { total: { value: 1860, relation: "eq" }, hits: [{ _index: "x", _id: "1", _score: null, _source: { agent: { id: "001" }, package: { name: "ucf", version: "1", type: "deb" } } }] } });
  cat.mockReset().mockResolvedValue([{ index: "wazuh-states-inventory-packages-c", docsCount: 1860 }]);
});
afterEach(() => { process.env = { ...saved }; });

describe("syscollector dual source", () => {
  it("manager (default): proxies to /syscollector, never queries the indexer", async () => {
    const res = await appRouter.createCaller(ctx()).wazuh.agentPackages({ agentId: "001", limit: 10, offset: 0 });
    expect(wazuhGet).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ path: "/syscollector/001/packages" }));
    expect(search).not.toHaveBeenCalled();
    expect((res as any).data.affected_items[0]).toEqual({ from: "manager" });
  });

  it("indexer: same envelope from wazuh-states-inventory-packages*, manager not called", async () => {
    process.env.WAZUH_STATES_SOURCE = "indexer";
    const res = (await appRouter.createCaller(ctx()).wazuh.agentPackages({ agentId: "001", limit: 10, offset: 0, sort: "-name" })) as any;
    expect(wazuhGet).not.toHaveBeenCalled();
    expect(search.mock.calls[0][1]).toBe("wazuh-states-inventory-packages*");
    expect(res).toEqual({
      data: { affected_items: [{ agent_id: "001", name: "ucf", version: "1", format: "deb" }], total_affected_items: 1860, total_failed_items: 0, failed_items: [] },
      message: "All specified syscollector information was returned",
      error: 0,
    });
  });

  it("indexer: kind without an index (syscheck on 4.14) falls through to the manager", async () => {
    process.env.WAZUH_STATES_SOURCE = "indexer";
    await appRouter.createCaller(ctx()).wazuh.syscheckFiles({ agentId: "001", limit: 10, offset: 0 });
    expect(wazuhGet).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ path: "/syscheck/001" }));
  });

  it("rootcheck stays manager-only under the indexer source", async () => {
    process.env.WAZUH_STATES_SOURCE = "indexer";
    await appRouter.createCaller(ctx()).wazuh.rootcheckResults({ agentId: "001", limit: 10, offset: 0 });
    expect(wazuhGet).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ path: "/rootcheck/001" }));
    expect(search).not.toHaveBeenCalled();
  });

  it("statesSource diagnostics query", async () => {
    process.env.WAZUH_STATES_SOURCE = "indexer";
    const st = await appRouter.createCaller(ctx()).wazuh.statesSource();
    expect(st.source).toBe("indexer");
    expect(st.kinds.find(k => k.kind === "packages")).toMatchObject({ indexExists: true, docs: 1860, servedByIndexer: true });
  });
});

describe("manager API style", () => {
  it("cluster style rewrites managerInfo to /cluster/local/info", async () => {
    process.env.WAZUH_MANAGER_API_STYLE = "cluster";
    await appRouter.createCaller(ctx()).wazuh.managerInfo();
    expect(wazuhGet).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ path: "/cluster/local/info" }));
  });
  it("cluster style refuses /manager/stats/hourly", async () => {
    process.env.WAZUH_MANAGER_API_STYLE = "cluster";
    await expect(appRouter.createCaller(ctx()).wazuh.statsHourly()).rejects.toThrow(/unavailable/);
  });
  it("default style keeps /manager paths", async () => {
    await appRouter.createCaller(ctx()).wazuh.managerInfo();
    expect(wazuhGet).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ path: "/manager/info" }));
  });
});
