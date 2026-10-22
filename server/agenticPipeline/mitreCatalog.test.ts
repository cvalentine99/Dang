import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const wazuhGet = vi.fn();
const getEffectiveWazuhConfig = vi.fn();
vi.mock("../wazuh/wazuhClient", () => ({
  wazuhGet: (...a: unknown[]) => wazuhGet(...a),
  getEffectiveWazuhConfig: (...a: unknown[]) => getEffectiveWazuhConfig(...a),
}));

import {
  ensureMitreCatalog,
  validateTechniqueIds,
  isKnownTechnique,
  filterMitreMappings,
  getMitreCatalogSource,
  getMitreCatalogTtlMs,
  isValidCveId,
  normalizeCveId,
  _testing,
} from "./mitreCatalog";
import { MITRE_FALLBACK_TECHNIQUES } from "./mitreFallback";

const CONFIG = { host: "mgr", port: 55000, user: "u", pass: "p" };

function page(ids: string[], total: number) {
  return { data: { affected_items: ids.map((id) => ({ external_id: id, name: `name-${id}` })), total_affected_items: total } };
}

/** Manager with 3 techniques split across two pages of size 2. */
function mockTwoPages(ids = ["T1001", "T1002", "T1002.001"]) {
  wazuhGet.mockImplementation(async (_cfg: unknown, opts: { params: { offset: number } }) =>
    opts.params.offset === 0 ? page(ids.slice(0, 2), ids.length) : page(ids.slice(2), ids.length)
  );
}

beforeEach(() => {
  _testing.reset();
  wazuhGet.mockReset();
  getEffectiveWazuhConfig.mockReset().mockResolvedValue(CONFIG);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  delete process.env.MITRE_CATALOG_TTL_MS;
  delete process.env.MITRE_CATALOG_RETRY_MS;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("mitreCatalog — loading", () => {
  it("paginates GET /mitre/techniques with limit/offset via wazuhGet", async () => {
    mockTwoPages();
    expect(await ensureMitreCatalog()).toBe("manager");
    expect(wazuhGet).toHaveBeenCalledTimes(2);
    const [cfg, opts] = wazuhGet.mock.calls[0];
    expect(cfg).toBe(CONFIG);
    expect(opts.path).toBe("/mitre/techniques");
    expect(opts.params).toMatchObject({ limit: 500, offset: 0 });
    expect(wazuhGet.mock.calls[1][1].params.offset).toBe(2);
    expect(isKnownTechnique("T1002.001")).toBe(true);
    // Manager catalog replaces the fallback list entirely
    expect(isKnownTechnique("T1059")).toBe(false);
  });

  it("falls back to the bundled allowlist when the manager is unreachable", async () => {
    wazuhGet.mockRejectedValue(new Error("ECONNREFUSED"));
    expect(await ensureMitreCatalog()).toBe("fallback");
    expect(getMitreCatalogSource()).toBe("fallback");
    expect(isKnownTechnique("T1059")).toBe(true);
    expect(validateTechniqueIds(["T1059"]).source).toBe("fallback");
  });

  it("falls back when Wazuh is not configured or returns no techniques", async () => {
    getEffectiveWazuhConfig.mockResolvedValue(null);
    expect(await ensureMitreCatalog()).toBe("fallback");
    _testing.reset();
    getEffectiveWazuhConfig.mockResolvedValue(CONFIG);
    wazuhGet.mockResolvedValue({ data: { affected_items: [], total_affected_items: 0 } });
    expect(await ensureMitreCatalog()).toBe("fallback");
  });

  it("does not retry the manager inside MITRE_CATALOG_RETRY_MS after a failure", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    process.env.MITRE_CATALOG_RETRY_MS = "60000";
    wazuhGet.mockRejectedValue(new Error("down"));
    await ensureMitreCatalog();
    expect(wazuhGet).toHaveBeenCalledTimes(1);
    vi.setSystemTime(1_000_000 + 30_000);
    await ensureMitreCatalog();
    expect(wazuhGet).toHaveBeenCalledTimes(1);
    vi.setSystemTime(1_000_000 + 61_000);
    mockTwoPages();
    expect(await ensureMitreCatalog()).toBe("manager");
  });

  it("caches for MITRE_CATALOG_TTL_MS, then serves stale while revalidating", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    process.env.MITRE_CATALOG_TTL_MS = "1000";
    mockTwoPages(["T1001"]);
    await ensureMitreCatalog();
    expect(wazuhGet).toHaveBeenCalledTimes(1);

    vi.setSystemTime(500);
    await ensureMitreCatalog();
    expect(wazuhGet).toHaveBeenCalledTimes(1); // fresh

    // Stale: returns immediately with old data, refresh runs in background
    vi.setSystemTime(1500);
    let resolveFetch: ((v: unknown) => void) | undefined;
    wazuhGet.mockImplementation(() => new Promise((r) => { resolveFetch = r; }));
    expect(await ensureMitreCatalog()).toBe("manager");
    expect(isKnownTechnique("T1001")).toBe(true);
    expect(isKnownTechnique("T1555")).toBe(false);
    for (let i = 0; i < 20 && !resolveFetch; i++) await Promise.resolve();
    expect(wazuhGet).toHaveBeenCalledTimes(2);
    resolveFetch!(page(["T1555"], 1));
    await _testing.settle();
    expect(isKnownTechnique("T1555")).toBe(true);
    expect(isKnownTechnique("T1001")).toBe(false);
  });

  it("keeps the stale manager catalog when a background refresh fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    process.env.MITRE_CATALOG_TTL_MS = "1000";
    mockTwoPages(["T1001"]);
    await ensureMitreCatalog();
    vi.setSystemTime(2000);
    wazuhGet.mockRejectedValue(new Error("down"));
    await ensureMitreCatalog();
    await _testing.settle();
    expect(getMitreCatalogSource()).toBe("manager");
    expect(isKnownTechnique("T1001")).toBe(true);
  });

  it("defaults the TTL to 24h and ignores junk values", () => {
    expect(getMitreCatalogTtlMs()).toBe(86_400_000);
    process.env.MITRE_CATALOG_TTL_MS = "abc";
    expect(getMitreCatalogTtlMs()).toBe(86_400_000);
    process.env.MITRE_CATALOG_TTL_MS = "5000";
    expect(getMitreCatalogTtlMs()).toBe(5000);
  });
});

describe("mitreCatalog — validation", () => {
  beforeEach(async () => {
    mockTwoPages(["T1059", "T1059.001", "T1078"]);
    await ensureMitreCatalog();
  });

  it("splits valid and unknown, normalizes case/whitespace, dedups", () => {
    const r = validateTechniqueIds([" t1059 ", "T1059", "T9999", "not-an-id", "T1078", 42]);
    expect(r.valid).toEqual(["T1059", "T1078"]);
    expect(r.unknown).toEqual(["T9999", "not-an-id", "42"]);
    expect(r.parentMatched).toEqual([]);
    expect(r.source).toBe("manager");
  });

  it("accepts an unknown sub-technique via its known parent and notes it", () => {
    const r = validateTechniqueIds(["T1059.001", "T1059.999", "T1078.004", "T9999.001"]);
    expect(r.valid).toEqual(["T1059.001", "T1059.999", "T1078.004"]);
    expect(r.parentMatched).toEqual(["T1059.999", "T1078.004"]);
    expect(r.unknown).toEqual(["T9999.001"]);
  });

  it("rejects malformed shapes even if a prefix is known", () => {
    expect(isKnownTechnique("T1059.1")).toBe(false);
    expect(isKnownTechnique("T10590")).toBe(false);
    expect(isKnownTechnique("T1059.0011")).toBe(false);
    expect(isKnownTechnique(undefined)).toBe(false);
  });

  it("filterMitreMappings keeps known ids, first wins on duplicates, flags validated", () => {
    const m = (id: string, name = id) => ({ techniqueId: id, techniqueName: name, tactic: "x", confidence: 0.5, source: "llm_inference" as const });
    const r = filterMitreMappings([m("t1059", "first"), m("T1059", "second"), m("T9999"), m("T1078")]);
    expect(r.kept.map((k) => [k.techniqueId, k.techniqueName])).toEqual([["T1059", "first"], ["T1078", "T1078"]]);
    expect(r.unknown).toEqual(["T9999"]);
    expect(r.validated).toBe(true);
  });

  it("reports validated=false under the fallback list", () => {
    _testing.reset();
    const r = filterMitreMappings([{ techniqueId: "T1059", techniqueName: "x", tactic: "x", confidence: 1, source: "llm_inference" }]);
    expect(r.kept).toHaveLength(1);
    expect(r.source).toBe("fallback");
    expect(r.validated).toBe(false);
  });
});

describe("mitreFallback", () => {
  it("holds ~50 well-formed technique ids", () => {
    expect(MITRE_FALLBACK_TECHNIQUES.size).toBeGreaterThanOrEqual(45);
    expect(MITRE_FALLBACK_TECHNIQUES.size).toBeLessThanOrEqual(70);
    for (const id of MITRE_FALLBACK_TECHNIQUES.keys()) expect(id).toMatch(/^T\d{4}(\.\d{3})?$/);
  });
});

describe("CVE validation", () => {
  it("isValidCveId enforces CVE-YYYY-NNNN+", () => {
    for (const ok of ["CVE-2024-1234", "CVE-2021-44228", "CVE-2026-1234567"]) expect(isValidCveId(ok)).toBe(true);
    for (const bad of ["CVE-2024-123", "cve-2024-1234", "CVE-24-1234", " CVE-2024-1234", "CVE-2024-12a4", "GHSA-xxxx", "", null, 2024])
      expect(isValidCveId(bad)).toBe(false);
  });

  it("normalizeCveId trims and upper-cases before validating", () => {
    expect(normalizeCveId(" cve-2024-1234 ")).toBe("CVE-2024-1234");
    expect(normalizeCveId("CVE-2024-12")).toBeNull();
    expect(normalizeCveId(undefined)).toBeNull();
  });
});
