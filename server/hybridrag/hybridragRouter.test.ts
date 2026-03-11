import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

// Mock the database module so tests don't need a real MySQL connection
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  offset: vi.fn().mockResolvedValue([]),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
};

vi.mock("../db", () => ({
  getDb: vi.fn(() => mockDb),
}));

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createAuthContext(): TrpcContext {
  return {
    user: { id: 1, name: "Test User", openId: "test-open-id", avatarUrl: null, role: "admin" },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("hybridrag router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.orderBy.mockReturnThis();
    mockDb.limit.mockReturnThis();
    mockDb.offset.mockResolvedValue([]);
    mockDb.insert.mockReturnThis();
    mockDb.values.mockResolvedValue([{ insertId: 1 }]);
    mockDb.update.mockReturnThis();
    mockDb.set.mockReturnThis();
    mockDb.delete.mockReturnThis();
  });

  it("modelStatus returns model info (requires auth)", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.hybridrag.modelStatus();
    expect(result).toHaveProperty("nemotron");
    expect(result).toHaveProperty("fallbackAvailable");
    expect(result).toHaveProperty("activeModel");
    expect(result.fallbackAvailable).toBe(true);
    expect(typeof result.nemotron.available).toBe("boolean");
    expect(typeof result.nemotron.model).toBe("string");
    expect(typeof result.nemotron.endpoint).toBe("string");
  });

  it("notes.list returns notes array (requires auth)", async () => {
    const mockNotes = [
      { id: 1, title: "Test", content: "", severity: "medium", tags: [], resolved: 0, createdAt: new Date(), updatedAt: new Date() },
    ];
    mockDb.offset.mockResolvedValue(mockNotes);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.hybridrag.notes.list({ limit: 10 });
    expect(result).toHaveProperty("notes");
    expect(Array.isArray(result.notes)).toBe(true);
  });

  it("notes.create returns success with id (requires auth)", async () => {
    mockDb.values.mockResolvedValue([{ insertId: 42 }]);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const created = await caller.hybridrag.notes.create({
      title: "Test Note from Vitest",
      content: "This is a test note",
      severity: "medium",
      tags: ["test"],
    });
    expect(created).toHaveProperty("id");
    expect(created.id).toBe(42);
    expect(created.success).toBe(true);
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("notes.create rejects unauthenticated users", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.hybridrag.notes.create({
        title: "Should fail",
        severity: "info",
        tags: [],
      })
    ).rejects.toThrow();
  });

  it("notes.delete rejects unauthenticated users", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.hybridrag.notes.delete({ id: 1 })
    ).rejects.toThrow();
  });

  it("clearSession rejects unauthenticated users", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.hybridrag.clearSession({ sessionId: "test-session" })
    ).rejects.toThrow();
  });
});
