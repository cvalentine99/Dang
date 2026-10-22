/**
 * L2 / M1 / M6 — indexerRouter input bounds, sanitized errors, per-user search.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

const indexerSearch = vi.fn();
vi.mock("./indexerClient", async (orig) => {
  const real = await orig<typeof import("./indexerClient")>();
  return {
    ...real,
    getEffectiveIndexerConfig: vi.fn(async () => ({ host: "idx", port: 9200, user: "u", pass: "p", protocol: "https" })),
    indexerSearch: (...a: unknown[]) => indexerSearch(...a),
  };
});

import { indexerRouter } from "./indexerRouter";

const caller = () => indexerRouter.createCaller({
  user: { id: 9, openId: "t", email: "t@example.com", name: "t", loginMethod: "local", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
  req: { protocol: "https", headers: {} },
  res: { clearCookie: () => {} },
} as never);

const empty = { hits: { total: 0, hits: [] }, took: 1, timed_out: false };
beforeEach(() => { indexerSearch.mockReset().mockResolvedValue(empty); });

describe("L2 input bounds", () => {
  it("interval must be one of the fixed buckets", async () => {
    await expect(caller().alertsTimeline({ interval: "1ms" } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().alertsTimeline({ interval: "5m" } as never)).resolves.toMatchObject({ configured: true });
  });

  it("offset is capped at 10000", async () => {
    await expect(caller().alertsSearch({ offset: 10_001 } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().alertsSearch({ offset: 10_000 } as never)).resolves.toBeDefined();
  });

  it("free-text query is capped at 500 chars", async () => {
    await expect(caller().alertsSearch({ query: "a".repeat(501) } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("M1 / M6 in safeSearch", () => {
  it("returns the sanitized message, never a raw upstream reason", async () => {
    const { UpstreamError } = await import("../wazuh/upstreamError");
    indexerSearch.mockRejectedValue(new UpstreamError("Indexer", "abcd1234", 400));
    const r = await caller().alertsSearch({} as never);
    expect(r).toMatchObject({ configured: true, data: null, error: "Indexer upstream error (HTTP 400) [abcd1234]" });
  });

  it("unknown errors are sanitized with a fresh correlation id", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    indexerSearch.mockRejectedValue(new Error("index [wazuh-alerts-4.x-2026.10.21] mapping parse failure at field data.secret"));
    const r = await caller().alertsSearch({} as never) as { error: string };
    expect(r.error).toMatch(/^Indexer upstream error \[[0-9a-f]{8}\]$/);
  });

  it("rate-limit violations propagate as TOO_MANY_REQUESTS", async () => {
    indexerSearch.mockRejectedValue(new TRPCError({ code: "TOO_MANY_REQUESTS", message: "slow down" }));
    await expect(caller().alertsSearch({} as never)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("passes the requesting user id to indexerSearch", async () => {
    await caller().alertsSearch({} as never);
    expect(indexerSearch.mock.calls[0][4]).toBe(9);
  });
});
