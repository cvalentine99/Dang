/**
 * Wazuh 5.0 de-risk — WAZUH_STATES_SOURCE dispatch, `_cat/indices` existence
 * probe (mocked), and the /manager → /cluster path map.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";

const catMock = vi.fn();
const configMock = vi.fn();
const statesQueryMock = vi.fn();
vi.mock("../indexer/indexerClient", async (orig) => {
  const real = await orig<typeof import("../indexer/indexerClient")>();
  return {
    ...real,
    indexerCatIndices: (...a: unknown[]) => catMock(...a),
    getEffectiveIndexerConfig: () => configMock(),
  };
});
vi.mock("../indexer/statesClient", async (orig) => {
  const real = await orig<typeof import("../indexer/statesClient")>();
  return { ...real, statesQuery: (...a: unknown[]) => statesQueryMock(...a) };
});

import {
  getStatesSource,
  getManagerApiStyle,
  managerPath,
  MANAGER_PATH_PREFIX,
  statesGet,
  statesOrManager,
  syscheckKind,
  patternMatches,
  probeStatesIndices,
  getStatesSourceStatus,
  _testing,
} from "./statesSource";

const CFG = { host: "idx", port: 9200, user: "u", pass: "p", protocol: "https" as const };
const LIVE_414 = [
  "wazuh-states-inventory-browser-extensions-c", "wazuh-states-inventory-groups-c", "wazuh-states-inventory-hardware-c",
  "wazuh-states-inventory-hotfixes-c", "wazuh-states-inventory-interfaces-c", "wazuh-states-inventory-networks-c",
  "wazuh-states-inventory-packages-c", "wazuh-states-inventory-ports-c", "wazuh-states-inventory-processes-c",
  "wazuh-states-inventory-protocols-c", "wazuh-states-inventory-services-c", "wazuh-states-inventory-system-c",
  "wazuh-states-inventory-users-c", "wazuh-states-vulnerabilities-c",
].map((index, i) => ({ index, docsCount: i }));
const ENVELOPE = { data: { affected_items: [{ name: "x" }], total_affected_items: 1, total_failed_items: 0, failed_items: [] }, message: "m", error: 0 };

const saved = { ...process.env };
beforeEach(() => {
  _testing.resetProbeCache();
  catMock.mockReset().mockResolvedValue(LIVE_414);
  configMock.mockReset().mockResolvedValue(CFG);
  statesQueryMock.mockReset().mockResolvedValue(ENVELOPE);
  delete process.env.WAZUH_STATES_SOURCE;
  delete process.env.WAZUH_MANAGER_API_STYLE;
});
afterEach(() => { process.env = { ...saved }; });

describe("getStatesSource", () => {
  it("defaults to manager; only 'indexer' (any case) switches", () => {
    expect(getStatesSource()).toBe("manager");
    process.env.WAZUH_STATES_SOURCE = " Indexer ";
    expect(getStatesSource()).toBe("indexer");
    process.env.WAZUH_STATES_SOURCE = "bogus";
    expect(getStatesSource()).toBe("manager");
  });
});

describe("statesGet dispatch", () => {
  it("manager source → null without touching the indexer", async () => {
    expect(await statesGet("packages", "001", { limit: 10 })).toBeNull();
    expect(configMock).not.toHaveBeenCalled();
    expect(statesQueryMock).not.toHaveBeenCalled();
  });

  it("indexer source + existing index → indexer envelope with manager params split", async () => {
    process.env.WAZUH_STATES_SOURCE = "indexer";
    const res = await statesGet("packages", "001", { limit: 10, offset: 5, sort: "-name", vendor: "v", wait_for_complete: true }, 42);
    expect(res).toBe(ENVELOPE);
    expect(statesQueryMock).toHaveBeenCalledWith(CFG, "packages", expect.objectContaining({ agentId: "001", limit: 10, offset: 5, sort: "-name", filters: { vendor: "v" } }), 42);
  });

  it("indexer source + missing index (FIM/SCA on 4.14) → null (manager fallback)", async () => {
    process.env.WAZUH_STATES_SOURCE = "indexer";
    expect(await statesGet("syscheck_files", "001", {})).toBeNull();
    expect(await statesGet("sca_policies", "001", {})).toBeNull();
    expect(statesQueryMock).not.toHaveBeenCalled();
  });

  it("indexer source but indexer unconfigured → null", async () => {
    process.env.WAZUH_STATES_SOURCE = "indexer";
    configMock.mockResolvedValue(null);
    expect(await statesGet("packages", "001", {})).toBeNull();
  });

  it("sca_checks forwards policyId", async () => {
    process.env.WAZUH_STATES_SOURCE = "indexer";
    catMock.mockResolvedValue([{ index: "wazuh-states-sca", docsCount: 3 }]);
    await statesGet("sca_checks", "001", {}, undefined, { policyId: "cis_x" });
    expect(statesQueryMock.mock.calls[0][2]).toMatchObject({ policyId: "cis_x" });
  });

  it("statesOrManager: manager fetch only when statesGet yields null", async () => {
    const managerFetch = vi.fn().mockResolvedValue("from-manager");
    expect(await statesOrManager("ports", "001", {}, managerFetch)).toBe("from-manager");
    process.env.WAZUH_STATES_SOURCE = "indexer";
    managerFetch.mockClear();
    expect(await statesOrManager("ports", "001", {}, managerFetch)).toBe(ENVELOPE);
    expect(managerFetch).not.toHaveBeenCalled();
  });

  it("indexer errors propagate (no silent manager retry)", async () => {
    process.env.WAZUH_STATES_SOURCE = "indexer";
    statesQueryMock.mockRejectedValue(new TRPCError({ code: "BAD_REQUEST", message: "Filter 'euser'" }));
    const managerFetch = vi.fn();
    await expect(statesOrManager("processes", "001", { euser: "x" }, managerFetch)).rejects.toThrow(/euser/);
    expect(managerFetch).not.toHaveBeenCalled();
  });

  it("syscheckKind picks the registries index for type=registry", () => {
    expect(syscheckKind({ type: "registry" })).toBe("syscheck_registries");
    expect(syscheckKind({ type: "file" })).toBe("syscheck_files");
    expect(syscheckKind({})).toBe("syscheck_files");
  });
});

describe("_cat/indices existence probe", () => {
  it("suffix-tolerant patterns match both 4.x (-<cluster>) and 5.0 (unsuffixed) names", () => {
    expect(patternMatches("wazuh-states-inventory-packages*", "wazuh-states-inventory-packages-radiomancer")).toBe(true);
    expect(patternMatches("wazuh-states-inventory-packages*", "wazuh-states-inventory-packages")).toBe(true);
    expect(patternMatches("wazuh-states-vulnerabilities*", "wazuh-states-vulnerabilities")).toBe(true);
    expect(patternMatches("wazuh-states-sca*", "wazuh-states-inventory-system-c")).toBe(false);
  });

  it("probes once per TTL with a single wazuh-states-* listing", async () => {
    await probeStatesIndices(CFG, 1, 1_000);
    await probeStatesIndices(CFG, 1, 2_000);
    expect(catMock).toHaveBeenCalledTimes(1);
    expect(catMock).toHaveBeenCalledWith(CFG, "wazuh-states-*", 1);
    await probeStatesIndices(CFG, 1, 1_000 + _testing.PROBE_TTL_MS + 1);
    expect(catMock).toHaveBeenCalledTimes(2);
  });

  it("status reports source, per-kind existence/docs, manager-only list", async () => {
    process.env.WAZUH_STATES_SOURCE = "indexer";
    const st = await getStatesSourceStatus(9);
    expect(st.source).toBe("indexer");
    expect(st.indexerConfigured).toBe(true);
    const by = Object.fromEntries(st.kinds.map(k => [k.kind, k]));
    expect(by.packages).toMatchObject({ indexExists: true, servedByIndexer: true, mappingVerified: true, indexPattern: "wazuh-states-inventory-packages*" });
    expect(by.syscheck_files).toMatchObject({ indexExists: false, servedByIndexer: false, docs: 0, mappingVerified: false });
    expect(by.sca_policies.indexExists).toBe(false);
    expect(st.managerOnly).toContain("/rootcheck/{agent_id}");
  });

  it("probe failure is reported, not thrown", async () => {
    catMock.mockRejectedValue(new Error("Indexer request failed (ref abc)"));
    const st = await getStatesSourceStatus();
    expect(st.probeError).toMatch(/ref abc/);
    expect(st.kinds.every(k => k.indexExists === null)).toBe(true);
  });
});

describe("managerPath (/manager → /cluster)", () => {
  it("is the identity in the default style", () => {
    expect(getManagerApiStyle()).toBe("manager");
    for (const p of ["/manager/info", "/manager/stats/hourly", "/manager/configuration/analysis/global"]) expect(managerPath(p)).toBe(p);
  });
  it("renames 1:1 roots to /cluster/local in cluster style", () => {
    process.env.WAZUH_MANAGER_API_STYLE = "cluster";
    expect(MANAGER_PATH_PREFIX.cluster).toBe("/cluster/local");
    expect(managerPath("/manager/info")).toBe("/cluster/local/info");
    expect(managerPath("/manager/status")).toBe("/cluster/local/status");
    expect(managerPath("/manager/configuration")).toBe("/cluster/local/configuration");
    expect(managerPath("/manager/configuration/analysis/global")).toBe("/cluster/local/configuration/analysis/global");
    expect(managerPath("/manager/logs")).toBe("/cluster/local/logs");
    expect(managerPath("/manager/logs/summary")).toBe("/cluster/local/logs/summary");
    expect(managerPath("/manager/configuration/validation")).toBe("/cluster/configuration/validation");
    expect(managerPath("/agents")).toBe("/agents");
  });
  it("refuses paths with no 5.0 equivalent instead of mapping them wrongly", () => {
    for (const p of ["/manager/stats", "/manager/stats/hourly", "/manager/stats/analysisd", "/manager/daemons/stats", "/manager/version/check"]) {
      expect(() => managerPath(p, "cluster")).toThrow(TRPCError);
    }
    expect(() => managerPath("/manager/statsx", "cluster")).toThrow(/no known/);
  });
});
