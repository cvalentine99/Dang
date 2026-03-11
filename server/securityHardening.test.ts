/**
 * Security Hardening Tests
 *
 * Verifies:
 * 1. SSE endpoints require authentication (session cookie)
 * 2. OTX router endpoints are protectedProcedure (reject unauthenticated callers)
 * 3. hybridrag.modelStatus, sessionHistory, notes.list, notes.getById are protectedProcedure
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ── Mock DB ─────────────────────────────────────────────────────────────────
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  offset: vi.fn().mockResolvedValue([]),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
};

vi.mock("./db", () => ({
  getDb: vi.fn(() => mockDb),
}));

// ── Context helpers ─────────────────────────────────────────────────────────

function unauthenticatedContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function authenticatedContext(): TrpcContext {
  return {
    user: { id: 1, name: "Analyst", openId: "analyst-001", avatarUrl: null, role: "user" },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ── SSE Auth Tests ──────────────────────────────────────────────────────────

describe("SSE Endpoint Authentication", () => {
  it("SSE alerts endpoint is mounted with auth middleware in server config", async () => {
    // We verify the middleware exists by reading the index.ts mount code
    const fs = await import("fs");
    const indexContent = fs.readFileSync("server/_core/index.ts", "utf-8");

    // Verify the auth middleware is defined
    expect(indexContent).toContain("sseAuthMiddleware");
    expect(indexContent).toContain("sdk.authenticateRequest");

    // Verify both SSE endpoints use the middleware
    expect(indexContent).toMatch(/app\.get\("\/api\/sse\/alerts",\s*sseAuthMiddleware/);
    expect(indexContent).toMatch(/app\.get\("\/api\/sse\/stats",\s*sseAuthMiddleware/);
  });

  it("SSE auth middleware returns 401 for unauthenticated requests", async () => {
    // Verify the middleware sends 401 on auth failure
    const fs = await import("fs");
    const indexContent = fs.readFileSync("server/_core/index.ts", "utf-8");
    expect(indexContent).toContain('res.status(401)');
    expect(indexContent).toContain("Authentication required for SSE stream");
  });
});

// ── OTX Auth Promotion Tests ────────────────────────────────────────────────

describe("OTX Router — All endpoints require authentication", () => {
  const otxEndpoints = [
    "status",
    "subscribedPulses",
    "pulseDetail",
    "pulseIndicators",
    "searchPulses",
    "indicatorLookup",
    "activity",
  ] as const;

  it("OTX router imports protectedProcedure, not publicProcedure", async () => {
    const fs = await import("fs");
    const routerContent = fs.readFileSync("server/otx/otxRouter.ts", "utf-8");
    expect(routerContent).toContain('import { protectedProcedure, router }');
    expect(routerContent).not.toMatch(/publicProcedure/);
  });

  it.each(otxEndpoints)("otx.%s rejects unauthenticated callers", async (endpoint) => {
    const ctx = unauthenticatedContext();
    const caller = appRouter.createCaller(ctx);

    // Each endpoint should throw UNAUTHORIZED for null user
    await expect(
      // @ts-expect-error — dynamic endpoint access
      typeof caller.otx[endpoint] === "function"
        ? caller.otx[endpoint]()
        : caller.otx[endpoint]({ page: 1, limit: 10, pulseId: "test", query: "test", type: "IPv4", value: "8.8.8.8" })
    ).rejects.toThrow();
  });

  it("otx.status succeeds for authenticated callers", async () => {
    const ctx = authenticatedContext();
    const caller = appRouter.createCaller(ctx);
    // Should not throw — returns { configured: true/false }
    const result = await caller.otx.status();
    expect(result).toHaveProperty("configured");
  });
});

// ── HybridRAG Auth Promotion Tests ──────────────────────────────────────────

describe("HybridRAG Router — Promoted endpoints require authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.orderBy.mockReturnThis();
    mockDb.limit.mockReturnThis();
    mockDb.offset.mockResolvedValue([]);
  });

  it("hybridrag router imports protectedProcedure only, not publicProcedure", async () => {
    const fs = await import("fs");
    const routerContent = fs.readFileSync("server/hybridrag/hybridragRouter.ts", "utf-8");
    expect(routerContent).toContain('import { protectedProcedure, router }');
    expect(routerContent).not.toMatch(/publicProcedure/);
  });

  it("hybridrag.modelStatus rejects unauthenticated callers", async () => {
    const ctx = unauthenticatedContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.hybridrag.modelStatus()).rejects.toThrow();
  });

  it("hybridrag.modelStatus succeeds for authenticated callers", async () => {
    const ctx = authenticatedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.hybridrag.modelStatus();
    expect(result).toHaveProperty("nemotron");
    expect(result).toHaveProperty("activeModel");
  });

  it("hybridrag.sessionHistory rejects unauthenticated callers", async () => {
    const ctx = unauthenticatedContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.hybridrag.sessionHistory({ sessionId: "test-session" })
    ).rejects.toThrow();
  });

  it("hybridrag.notes.list rejects unauthenticated callers", async () => {
    const ctx = unauthenticatedContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.hybridrag.notes.list({ limit: 10 })
    ).rejects.toThrow();
  });

  it("hybridrag.notes.list succeeds for authenticated callers", async () => {
    const ctx = authenticatedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.hybridrag.notes.list({ limit: 10 });
    expect(result).toHaveProperty("notes");
  });

  it("hybridrag.notes.getById rejects unauthenticated callers", async () => {
    const ctx = unauthenticatedContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.hybridrag.notes.getById({ id: 1 })
    ).rejects.toThrow();
  });

  it("hybridrag.notes.getById succeeds for authenticated callers", async () => {
    mockDb.limit.mockResolvedValue([{ id: 1, title: "Test", content: "" }]);
    const ctx = authenticatedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.hybridrag.notes.getById({ id: 1 });
    expect(result).toBeDefined();
  });
});
