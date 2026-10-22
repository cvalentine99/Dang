/**
 * M2 — hunt.execute reports per-source failures instead of "0 hits".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const indexerSearch = vi.fn();
const wazuhGet = vi.fn();
const indexerConfig = vi.fn();
const wazuhConfig = vi.fn();

vi.mock("../indexer/indexerClient", async (orig) => {
  const real = await orig<typeof import("../indexer/indexerClient")>();
  return { ...real, getEffectiveIndexerConfig: () => indexerConfig(), indexerSearch: (...a: unknown[]) => indexerSearch(...a) };
});
vi.mock("../wazuh/wazuhClient", () => ({
  getEffectiveWazuhConfig: () => wazuhConfig(),
  wazuhGet: (...a: unknown[]) => wazuhGet(...a),
}));

import { huntRouter } from "./huntRouter";

const ctx = {
  user: { id: 7, openId: "t", email: "t@example.com", name: "t", loginMethod: "local", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  req: { protocol: "https", headers: {} },
  res: { clearCookie: () => {} },
} as never;

const input = { query: "10.0.0.5", iocType: "ip" as const, agentIds: ["001"] };
const items = (n: number) => ({ data: { affected_items: Array.from({ length: n }, (_, i) => ({ id: i })) } });

beforeEach(() => {
  indexerSearch.mockReset();
  wazuhGet.mockReset();
  indexerConfig.mockReset().mockResolvedValue({ host: "i", port: 9200, user: "u", pass: "p", protocol: "https" });
  wazuhConfig.mockReset().mockResolvedValue({ host: "w", port: 55000, user: "u", pass: "p" });
});

describe("hunt.execute degraded envelope", () => {
  it("a down Indexer is reported as errored, not as zero hits", async () => {
    indexerSearch.mockRejectedValue(new Error("Indexer upstream error (ECONNREFUSED) [deadbeef]"));
    wazuhGet.mockResolvedValue(items(0));
    const r = await huntRouter.createCaller(ctx).execute(input);
    expect(r.degraded).toBe(true);
    expect(r.errors).toEqual(expect.arrayContaining([
      { source: "indexer_alerts", message: "Indexer upstream error (ECONNREFUSED) [deadbeef]" },
      { source: "indexer_archives", message: "Indexer upstream error (ECONNREFUSED) [deadbeef]" },
    ]));
    expect(r.sourcesSearched).toBe(8);
    expect(r.totalHits).toBe(0);
  });

  it("per-agent failures are recorded with the agent id", async () => {
    indexerSearch.mockResolvedValue({ hits: { total: 0, hits: [] } });
    wazuhGet.mockImplementation(async (_c: unknown, o: { path: string }) => {
      if (o.path.startsWith("/vulnerability/")) throw new Error("Wazuh upstream error (HTTP 500) [cafebabe]");
      return items(1);
    });
    const r = await huntRouter.createCaller(ctx).execute(input);
    expect(r.errors).toContainEqual({ source: "vulnerabilities:001", message: "Wazuh upstream error (HTTP 500) [cafebabe]" });
    expect(r.degraded).toBe(true);
  });

  it("all-healthy run is not degraded; unconfigured sources are not counted as searched", async () => {
    indexerConfig.mockResolvedValue(null);
    wazuhGet.mockResolvedValue(items(2));
    const r = await huntRouter.createCaller(ctx).execute(input);
    expect(r.degraded).toBe(false);
    expect(r.errors).toEqual([]);
    expect(r.sourcesSearched).toBe(6); // 2 indexer sources skipped (not configured)
    expect(r.sourcesWithHits).toBe(6);
  });

  it("passes the requesting user to the upstream rate limiters", async () => {
    indexerSearch.mockResolvedValue({ hits: { total: 0, hits: [] } });
    wazuhGet.mockResolvedValue(items(0));
    await huntRouter.createCaller(ctx).execute(input);
    expect(indexerSearch.mock.calls[0][4]).toBe(7);
    expect((wazuhGet.mock.calls[0][1] as { userId: number }).userId).toBe(7);
  });
});
