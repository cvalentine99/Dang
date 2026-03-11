import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

// Mock the database module
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue([]),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
  delete: vi.fn().mockReturnThis(),
};

vi.mock("../db", () => ({
  getDb: vi.fn(() => mockDb),
}));

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test Analyst",
      loginMethod: "local",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("baselines router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let authCaller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chainable mocks
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.orderBy.mockReturnThis();
    mockDb.limit.mockResolvedValue([]);
    mockDb.insert.mockReturnThis();
    mockDb.values.mockResolvedValue([{ insertId: 1 }]);
    mockDb.delete.mockReturnThis();

    caller = appRouter.createCaller(createUnauthContext());
    authCaller = appRouter.createCaller(createAuthContext());
  });

  // ── list ──────────────────────────────────────────────────────────

  describe("list", () => {
    it("returns empty array when no baselines exist", async () => {
      mockDb.limit.mockResolvedValue([]);
      const result = await authCaller.baselines.list();
      expect(result).toEqual({ baselines: [] });
    });

    it("returns baselines for authenticated user", async () => {
      const mockBaselines = [
        {
          id: 1,
          name: "Production Baseline",
          description: "Post-patch baseline",
          agentIds: ["001", "002"],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockDb.limit.mockResolvedValue(mockBaselines);
      const result = await authCaller.baselines.list();
      expect(result.baselines).toHaveLength(1);
      expect(result.baselines[0].name).toBe("Production Baseline");
    });

    it("rejects unauthenticated access", async () => {
      await expect(caller.baselines.list()).rejects.toThrow();
    });
  });

  // ── get ───────────────────────────────────────────────────────────

  describe("get", () => {
    it("returns a single baseline with full snapshot data", async () => {
      const mockBaseline = {
        id: 1,
        userId: 1,
        name: "Test Baseline",
        description: null,
        agentIds: ["001"],
        snapshotData: { packages: {}, services: {}, users: {} },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDb.limit.mockResolvedValue([mockBaseline]);
      const result = await authCaller.baselines.get({ id: 1 });
      expect(result.baseline.name).toBe("Test Baseline");
      expect(result.baseline.snapshotData).toBeDefined();
    });

    it("throws when baseline not found", async () => {
      mockDb.limit.mockResolvedValue([]);
      await expect(authCaller.baselines.get({ id: 999 })).rejects.toThrow(
        "Baseline not found"
      );
    });

    it("rejects unauthenticated access", async () => {
      await expect(caller.baselines.get({ id: 1 })).rejects.toThrow();
    });
  });

  // ── create ────────────────────────────────────────────────────────

  describe("create", () => {
    it("creates a new baseline and returns its id", async () => {
      mockDb.values.mockResolvedValue([{ insertId: 42 }]);
      const result = await authCaller.baselines.create({
        name: "New Baseline",
        description: "Test description",
        agentIds: ["001", "002"],
        snapshotData: {
          packages: { "001": [{ name: "nginx", version: "1.24" }] },
          services: { "001": [{ name: "sshd", state: "running" }] },
          users: { "001": [{ name: "root", shell: "/bin/bash" }] },
        },
      });
      expect(result).toEqual({ id: 42, success: true });
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("rejects empty name", async () => {
      await expect(
        authCaller.baselines.create({
          name: "",
          agentIds: ["001"],
          snapshotData: {},
        })
      ).rejects.toThrow();
    });

    it("rejects empty agentIds", async () => {
      await expect(
        authCaller.baselines.create({
          name: "Test",
          agentIds: [],
          snapshotData: {},
        })
      ).rejects.toThrow();
    });

    it("rejects more than 10 agents", async () => {
      await expect(
        authCaller.baselines.create({
          name: "Test",
          agentIds: Array.from({ length: 11 }, (_, i) => String(i)),
          snapshotData: {},
        })
      ).rejects.toThrow();
    });

    it("rejects unauthenticated access", async () => {
      await expect(
        caller.baselines.create({
          name: "Test",
          agentIds: ["001"],
          snapshotData: {},
        })
      ).rejects.toThrow();
    });
  });

  // ── delete ────────────────────────────────────────────────────────

  describe("delete", () => {
    it("deletes an existing baseline", async () => {
      // The select chain: select().from().where().limit() -> ownership check
      // The delete chain: delete().where() -> actual deletion
      // where() is called twice: once returning this (for select chain), once resolving (for delete chain)
      let whereCallCount = 0;
      mockDb.where.mockImplementation(() => {
        whereCallCount++;
        if (whereCallCount <= 1) {
          // First call is in select chain, return this so .limit() works
          return mockDb;
        }
        // Second call is in delete chain, resolve
        return Promise.resolve(undefined);
      });
      mockDb.limit.mockResolvedValueOnce([{ id: 1, userId: 1 }]);
      const result = await authCaller.baselines.delete({ id: 1 });
      expect(result).toEqual({ success: true });
    });

    it("throws when baseline not found", async () => {
      // where returns this for the select chain
      mockDb.where.mockReturnThis();
      mockDb.limit.mockResolvedValueOnce([]);
      await expect(authCaller.baselines.delete({ id: 999 })).rejects.toThrow(
        "Baseline not found"
      );
    });

    it("rejects unauthenticated access", async () => {
      await expect(caller.baselines.delete({ id: 1 })).rejects.toThrow();
    });
  });
});
