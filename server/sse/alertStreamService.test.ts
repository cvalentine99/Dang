import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

// Mock the indexer client before importing the service
vi.mock("../indexer/indexerClient", () => ({
  isIndexerEffectivelyConfigured: vi.fn(),
  getEffectiveIndexerConfig: vi.fn(),
  indexerSearch: vi.fn(),
  boolQuery: vi.fn(({ filter }: { filter: unknown[] }) => ({ bool: { filter } })),
  timeRangeFilter: vi.fn(() => ({ range: { timestamp: { gte: "now-2m", lte: "now" } } })),
  INDEX_PATTERNS: { ALERTS: "wazuh-alerts-*" },
}));

import {
  handleSSEConnection,
  getStreamStats,
  getConnectedClientCount,
} from "./alertStreamService";

function createMockReqRes(query: Record<string, string> = {}) {
  const writtenChunks: string[] = [];
  const onHandlers: Record<string, (() => void)[]> = {};
  const req = {
    query,
    on: vi.fn((event: string, handler: () => void) => {
      if (!onHandlers[event]) onHandlers[event] = [];
      onHandlers[event].push(handler);
    }),
  } as unknown as Request;
  const res = {
    writeHead: vi.fn(),
    write: vi.fn((data: string) => { writtenChunks.push(data); return true; }),
    on: vi.fn(),
    flushHeaders: vi.fn(),
  } as unknown as Response;
  return { req, res, writtenChunks, onHandlers };
}

describe("AlertStreamService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should set correct SSE headers on connection", () => {
    const { req, res } = createMockReqRes();
    handleSSEConnection(req, res);

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
  });

  it("should send a connected event immediately", () => {
    const { req, res, writtenChunks } = createMockReqRes();
    handleSSEConnection(req, res);

    const connectedEvent = writtenChunks.find((c) => c.includes("event: connected"));
    expect(connectedEvent).toBeDefined();
    expect(connectedEvent).toContain('"severityThreshold"');
    expect(connectedEvent).toContain('"pollIntervalMs"');
  });

  it("should use default severity threshold of 10", () => {
    const { req, res, writtenChunks } = createMockReqRes();
    handleSSEConnection(req, res);

    const connectedEvent = writtenChunks.find((c) => c.includes("event: connected"));
    expect(connectedEvent).toContain('"severityThreshold":10');
  });

  it("should accept custom severity threshold from query param", () => {
    const { req, res, writtenChunks } = createMockReqRes({ severity: "12" });
    handleSSEConnection(req, res);

    const connectedEvent = writtenChunks.find((c) => c.includes("event: connected"));
    expect(connectedEvent).toContain('"severityThreshold":12');
  });

  it("should clamp severity threshold to valid range (1-15)", () => {
    const { req: req1, res: res1, writtenChunks: chunks1 } = createMockReqRes({ severity: "0" });
    handleSSEConnection(req1, res1);
    const event1 = chunks1.find((c) => c.includes("event: connected"));
    expect(event1).toContain('"severityThreshold":1');

    const { req: req2, res: res2, writtenChunks: chunks2 } = createMockReqRes({ severity: "20" });
    handleSSEConnection(req2, res2);
    const event2 = chunks2.find((c) => c.includes("event: connected"));
    expect(event2).toContain('"severityThreshold":15');
  });

  it("should track connected clients", () => {
    const initialCount = getConnectedClientCount();
    const { req, res } = createMockReqRes();
    handleSSEConnection(req, res);

    expect(getConnectedClientCount()).toBeGreaterThanOrEqual(initialCount + 1);
  });

  it("should return stats with correct structure", () => {
    const stats = getStreamStats();
    expect(stats).toHaveProperty("connectedClients");
    expect(stats).toHaveProperty("isPolling");
    expect(stats).toHaveProperty("pollIntervalMs");
    expect(stats).toHaveProperty("clients");
    expect(typeof stats.connectedClients).toBe("number");
    expect(typeof stats.isPolling).toBe("boolean");
    expect(typeof stats.pollIntervalMs).toBe("number");
    expect(Array.isArray(stats.clients)).toBe(true);
  });

  it("should register close handler on request", () => {
    const { req, res } = createMockReqRes();
    handleSSEConnection(req, res);

    expect(req.on).toHaveBeenCalledWith("close", expect.any(Function));
  });

  it("should include clientId in connected event data", () => {
    const { req, res, writtenChunks } = createMockReqRes();
    handleSSEConnection(req, res);

    const connectedEvent = writtenChunks.find((c) => c.includes("event: connected"));
    expect(connectedEvent).toContain('"clientId"');
    // Client ID should follow the pattern sse-{timestamp}-{random}
    const dataLine = connectedEvent?.split("\n").find((l) => l.startsWith("data: "));
    const data = JSON.parse(dataLine?.replace("data: ", "") ?? "{}");
    expect(data.clientId).toMatch(/^sse-\d+-[a-z0-9]+$/);
  });

  it("should format SSE events correctly with event and data lines", () => {
    const { req, res, writtenChunks } = createMockReqRes();
    handleSSEConnection(req, res);

    const event = writtenChunks[0];
    // SSE format: event: <name>\ndata: <json>\n\n
    expect(event).toMatch(/^event: \w+\ndata: .+\n\n$/);
  });
});
