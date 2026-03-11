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

describe("savedSearches router", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    caller = appRouter.createCaller(createAuthContext());
  });

  describe("list", () => {
    it("returns empty array when no saved searches exist", async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      const result = await caller.savedSearches.list({ searchType: "siem" });
      expect(result).toHaveProperty("searches");
      expect(Array.isArray(result.searches)).toBe(true);
    });

    it("returns saved searches for the authenticated user", async () => {
      const mockSearches = [
        {
          id: 1,
          userId: 1,
          name: "SSH Brute Force",
          searchType: "siem",
          filters: { searchQuery: "ssh", severityFilter: "high" },
          description: "Detect SSH brute force",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockDb.limit.mockResolvedValueOnce(mockSearches);
      const result = await caller.savedSearches.list({ searchType: "siem" });
      expect(result.searches).toHaveLength(1);
      expect(result.searches[0].name).toBe("SSH Brute Force");
    });

    it("filters by searchType when provided", async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      await caller.savedSearches.list({ searchType: "hunting" });
      // Verify the query was called (mock chain)
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("returns all types when searchType is not provided", async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      const result = await caller.savedSearches.list({});
      expect(result).toHaveProperty("searches");
    });
  });

  describe("create", () => {
    it("creates a new saved search", async () => {
      mockDb.values.mockResolvedValueOnce([{ insertId: 42 }]);
      const result = await caller.savedSearches.create({
        name: "Critical Alerts",
        searchType: "siem",
        filters: { severityFilter: "critical", searchQuery: "" },
        description: "All critical severity alerts",
      });
      expect(result).toEqual({ id: 42, success: true });
    });

    it("creates a hunting search", async () => {
      mockDb.values.mockResolvedValueOnce([{ insertId: 43 }]);
      const result = await caller.savedSearches.create({
        name: "Mimikatz Hunt",
        searchType: "hunting",
        filters: { iocType: "freetext", searchValue: "mimikatz" },
      });
      expect(result).toEqual({ id: 43, success: true });
    });

    it("rejects empty name", async () => {
      await expect(
        caller.savedSearches.create({
          name: "",
          searchType: "siem",
          filters: {},
        })
      ).rejects.toThrow();
    });

    it("rejects invalid searchType", async () => {
      await expect(
        caller.savedSearches.create({
          name: "Test",
          searchType: "invalid" as "siem",
          filters: {},
        })
      ).rejects.toThrow();
    });
  });

  describe("update", () => {
    it("updates an existing saved search", async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 1, userId: 1 }]);
      const result = await caller.savedSearches.update({
        id: 1,
        name: "Updated Name",
        filters: { searchQuery: "updated" },
      });
      expect(result).toEqual({ success: true });
    });

    it("throws when search not found", async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      await expect(
        caller.savedSearches.update({ id: 999, name: "Nope" })
      ).rejects.toThrow("Saved search not found");
    });
  });

  describe("delete", () => {
    it("deletes an owned saved search", async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: 1, userId: 1 }]);
      const result = await caller.savedSearches.delete({ id: 1 });
      expect(result).toEqual({ success: true });
    });

    it("throws when search not found (ownership check)", async () => {
      mockDb.limit.mockResolvedValueOnce([]);
      await expect(
        caller.savedSearches.delete({ id: 999 })
      ).rejects.toThrow("Saved search not found");
    });
  });

  describe("authentication", () => {
    it("rejects unauthenticated list request", async () => {
      const unauthCaller = appRouter.createCaller(createUnauthContext());
      await expect(
        unauthCaller.savedSearches.list({ searchType: "siem" })
      ).rejects.toThrow();
    });

    it("rejects unauthenticated create request", async () => {
      const unauthCaller = appRouter.createCaller(createUnauthContext());
      await expect(
        unauthCaller.savedSearches.create({
          name: "Test",
          searchType: "siem",
          filters: {},
        })
      ).rejects.toThrow();
    });

    it("rejects unauthenticated delete request", async () => {
      const unauthCaller = appRouter.createCaller(createUnauthContext());
      await expect(
        unauthCaller.savedSearches.delete({ id: 1 })
      ).rejects.toThrow();
    });
  });
});
