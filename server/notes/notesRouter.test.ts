import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

// Mock the database module — same pattern as baselinesRouter.test.ts
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  offset: vi.fn().mockResolvedValue([]),
  groupBy: vi.fn().mockResolvedValue([]),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
};

vi.mock("../db", () => ({
  getDb: vi.fn(() => mockDb),
}));

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-analyst-user",
      email: "analyst@example.com",
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

describe("notes v2 router", () => {
  let authCaller: ReturnType<typeof appRouter.createCaller>;
  let unauthCaller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chainable mocks
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.orderBy.mockReturnThis();
    mockDb.limit.mockReturnThis();
    mockDb.offset.mockResolvedValue([]);
    mockDb.groupBy.mockResolvedValue([]);
    mockDb.insert.mockReturnThis();
    mockDb.values.mockResolvedValue([{ insertId: 1 }]);
    mockDb.update.mockReturnThis();
    mockDb.set.mockReturnThis();
    mockDb.delete.mockReturnThis();

    authCaller = appRouter.createCaller(createAuthContext());
    unauthCaller = appRouter.createCaller(createUnauthContext());
  });

  // ── list ──────────────────────────────────────────────────────────

  describe("list", () => {
    it("returns notes array and total count", async () => {
      const mockNotes = [
        { id: 1, userId: 1, entityType: "alert", entityId: "550", title: "Test", content: "", severity: "high", tags: [], resolved: 0, createdAt: new Date(), updatedAt: new Date() },
      ];
      // The list procedure chains: select().from().where().orderBy().limit().offset()
      // Then a second select for count: select().from().where()
      let selectCallCount = 0;
      mockDb.offset.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) return Promise.resolve(mockNotes);
        return Promise.resolve([{ count: 1 }]);
      });
      // The count query chains: select().from().where() — where resolves for the count
      // But both queries go through where(), so we need where to return this
      mockDb.where.mockReturnThis();

      const result = await authCaller.notes.list({ limit: 10 });
      expect(result).toHaveProperty("notes");
      expect(result).toHaveProperty("total");
      expect(Array.isArray(result.notes)).toBe(true);
    });

    it("returns empty when no notes exist", async () => {
      mockDb.offset.mockResolvedValue([]);
      // For the count query, where needs to resolve to [{ count: 0 }]
      let whereCallCount = 0;
      mockDb.where.mockImplementation(() => {
        whereCallCount++;
        if (whereCallCount <= 2) return mockDb; // first two calls are in the notes query chain
        return Promise.resolve([{ count: 0 }]);
      });

      const result = await authCaller.notes.list({ limit: 10 });
      expect(result.notes).toEqual([]);
    });

    it("rejects unauthenticated access", async () => {
      await expect(unauthCaller.notes.list({ limit: 10 })).rejects.toThrow();
    });
  });

  // ── entityCounts ─────────────────────────────────────────────────

  describe("entityCounts", () => {
    it("returns counts per entity type", async () => {
      mockDb.groupBy.mockResolvedValue([
        { entityType: "alert", count: 5 },
        { entityType: "agent", count: 3 },
      ]);

      const result = await authCaller.notes.entityCounts();
      expect(result).toHaveProperty("alert");
      expect(result).toHaveProperty("agent");
      expect(result).toHaveProperty("cve");
      expect(result).toHaveProperty("rule");
      expect(result).toHaveProperty("general");
      expect(typeof result.alert).toBe("number");
      expect(typeof result.agent).toBe("number");
    });

    it("returns zeros when no notes exist", async () => {
      mockDb.groupBy.mockResolvedValue([]);
      const result = await authCaller.notes.entityCounts();
      expect(result.alert).toBe(0);
      expect(result.agent).toBe(0);
      expect(result.cve).toBe(0);
      expect(result.rule).toBe(0);
      expect(result.general).toBe(0);
    });

    it("rejects unauthenticated access", async () => {
      await expect(unauthCaller.notes.entityCounts()).rejects.toThrow();
    });
  });

  // ── create ───────────────────────────────────────────────────────

  describe("create", () => {
    it("creates a note and returns id", async () => {
      mockDb.values.mockResolvedValue([{ insertId: 42 }]);
      const result = await authCaller.notes.create({
        entityType: "alert",
        entityId: "550",
        title: "Alert 550 investigation",
        content: "Suspicious activity detected",
        severity: "high",
        tags: ["incident"],
      });
      expect(result).toEqual({ id: 42, success: true });
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it("creates a general note with defaults", async () => {
      mockDb.values.mockResolvedValue([{ insertId: 7 }]);
      const result = await authCaller.notes.create({
        entityType: "general",
        title: "General observation",
      });
      expect(result).toEqual({ id: 7, success: true });
    });

    it("rejects empty title", async () => {
      await expect(
        authCaller.notes.create({
          entityType: "general",
          title: "",
        })
      ).rejects.toThrow();
    });

    it("rejects unauthenticated access", async () => {
      await expect(
        unauthCaller.notes.create({
          entityType: "general",
          title: "Test",
        })
      ).rejects.toThrow();
    });
  });

  // ── update ───────────────────────────────────────────────────────

  describe("update", () => {
    it("updates a note title", async () => {
      // update().set().where() chain
      mockDb.where.mockResolvedValue(undefined);
      const result = await authCaller.notes.update({
        id: 1,
        title: "Updated title",
      });
      expect(result).toEqual({ success: true });
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalled();
    });

    it("updates resolved status", async () => {
      mockDb.where.mockResolvedValue(undefined);
      const result = await authCaller.notes.update({
        id: 1,
        resolved: true,
      });
      expect(result).toEqual({ success: true });
    });

    it("rejects unauthenticated access", async () => {
      await expect(
        unauthCaller.notes.update({ id: 1, title: "Nope" })
      ).rejects.toThrow();
    });
  });

  // ── delete ───────────────────────────────────────────────────────

  describe("delete", () => {
    it("deletes a note", async () => {
      mockDb.where.mockResolvedValue(undefined);
      const result = await authCaller.notes.delete({ id: 1 });
      expect(result).toEqual({ success: true });
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("rejects unauthenticated access", async () => {
      await expect(unauthCaller.notes.delete({ id: 1 })).rejects.toThrow();
    });
  });

  // ── getById ──────────────────────────────────────────────────────

  describe("getById", () => {
    it("returns a note by id", async () => {
      const mockNote = {
        id: 1, userId: 1, entityType: "alert", entityId: "550",
        title: "Test Note", content: "Content", severity: "high",
        tags: ["test"], resolved: 0, createdAt: new Date(), updatedAt: new Date(),
      };
      mockDb.limit.mockResolvedValue([mockNote]);
      const result = await authCaller.notes.getById({ id: 1 });
      expect(result).not.toBeNull();
      expect(result?.title).toBe("Test Note");
    });

    it("returns null when note not found", async () => {
      mockDb.limit.mockResolvedValue([]);
      const result = await authCaller.notes.getById({ id: 999 });
      expect(result).toBeNull();
    });

    it("rejects unauthenticated access", async () => {
      await expect(unauthCaller.notes.getById({ id: 1 })).rejects.toThrow();
    });
  });

  // ── byEntity ─────────────────────────────────────────────────────

  describe("byEntity", () => {
    it("returns notes for a specific entity", async () => {
      const mockNotes = [
        { id: 1, userId: 1, entityType: "alert", entityId: "550", title: "Note 1", content: "", severity: "high", tags: [], resolved: 0, createdAt: new Date(), updatedAt: new Date() },
      ];
      mockDb.orderBy.mockResolvedValue(mockNotes);
      const result = await authCaller.notes.byEntity({
        entityType: "alert",
        entityId: "550",
      });
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
    });

    it("returns empty array when no notes for entity", async () => {
      mockDb.orderBy.mockResolvedValue([]);
      const result = await authCaller.notes.byEntity({
        entityType: "cve",
        entityId: "CVE-9999-0000",
      });
      expect(result).toEqual([]);
    });

    it("rejects unauthenticated access", async () => {
      await expect(
        unauthCaller.notes.byEntity({ entityType: "alert", entityId: "1" })
      ).rejects.toThrow();
    });
  });
});
