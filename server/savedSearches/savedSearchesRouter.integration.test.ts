/**
 * Saved Searches Router — Real-DB Integration Tests
 *
 * Tests the actual tRPC router procedures (create, list, update, delete)
 * against a real MySQL database. Uses the appRouter.createCaller() pattern
 * with a synthetic authenticated context.
 *
 * Coverage for all 3 new search types (alerts, vulnerabilities, fleet):
 *   - create: 3 tests (one per type)
 *   - list:   3 tests (filtered by type) + 1 unfiltered
 *   - update: 3 tests (one per type) + 3 ownership rejection tests
 *   - delete: 3 tests (one per type) + 3 ownership rejection tests + 3 idempotency tests
 *
 * Gated by DATABASE_URL — skips gracefully when no DB is available.
 */
import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";

const HAS_DB = !!process.env.DATABASE_URL;

/** Synthetic user ID — high number to avoid collisions */
const TEST_USER_ID = 888888;
const TEST_OPEN_ID = "__router_integration_test__";
const TEST_PREFIX = "__router_integ__";

/** Track created IDs for cleanup */
const createdIds: number[] = [];

function createTestContext(userId = TEST_USER_ID): TrpcContext {
  return {
    user: {
      id: userId,
      openId: TEST_OPEN_ID,
      email: "router-test@example.com",
      name: "Router Integration Test",
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

function createOtherUserContext(): TrpcContext {
  return {
    user: {
      id: TEST_USER_ID + 1,
      openId: "__other_user__",
      email: "other@example.com",
      name: "Other User",
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

let _testPool: any;
async function getTestPool() {
  if (_testPool) return _testPool;
  const mysql = await import("mysql2/promise");
  const parsed = new URL(process.env.DATABASE_URL!);
  _testPool = mysql.createPool({
    host: parsed.hostname,
    port: Number(parsed.port),
    user: parsed.username,
    password: parsed.password,
    database: parsed.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
  });
  return _testPool;
}

beforeAll(async () => {
  if (!HAS_DB) return;
  const pool = await getTestPool();
  // Ensure test users exist for FK constraints
  await pool.query(
    `INSERT IGNORE INTO users (id, openId, name, role) VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
    [TEST_USER_ID, TEST_OPEN_ID, "Test User", "user", TEST_USER_ID + 1, "__other_user__", "Other User", "user"]
  );
});

afterAll(async () => {
  if (!HAS_DB) return;
  try {
    const pool = await getTestPool();
    if (createdIds.length > 0) {
      await pool.query(
        `DELETE FROM saved_searches WHERE id IN (${createdIds.join(",")})`,
      );
    }
    // Clean up test users
    await pool.query(
      `DELETE FROM users WHERE id IN (?, ?)`,
      [TEST_USER_ID, TEST_USER_ID + 1]
    );
    await pool.end();
  } catch (e) {
    console.warn("[cleanup] Failed to clean up test rows:", e);
  }
});

describe.skipIf(!HAS_DB)("savedSearchesRouter — Real DB Integration", () => {
  const caller = appRouter.createCaller(createTestContext());
  const newTypes = ["alerts", "vulnerabilities", "fleet"] as const;

  // ── CREATE + LIST ──────────────────────────────────────────────────────────

  describe("create + list roundtrip for each new type", () => {
    for (const searchType of newTypes) {
      it(`creates a saved search with searchType='${searchType}'`, async () => {
        const result = await caller.savedSearches.create({
          name: `${TEST_PREFIX}${searchType}_${Date.now()}`,
          searchType,
          filters: { query: `test-${searchType}`, level: 3 },
          description: `Integration test for ${searchType}`,
        });

        expect(result.success).toBe(true);
        expect(result.id).toBeGreaterThan(0);
        createdIds.push(result.id);
      });

      it(`lists saved searches filtered by searchType='${searchType}'`, async () => {
        const result = await caller.savedSearches.list({ searchType });

        expect(result).toHaveProperty("searches");
        expect(Array.isArray(result.searches)).toBe(true);
        expect(result.searches.length).toBeGreaterThanOrEqual(1);

        for (const row of result.searches) {
          expect(row.searchType).toBe(searchType);
        }
      });
    }

    it("lists all types when no searchType filter is provided", async () => {
      const result = await caller.savedSearches.list({});
      expect(result.searches.length).toBeGreaterThanOrEqual(3);

      const types = new Set(result.searches.map((s) => s.searchType));
      expect(types.has("alerts")).toBe(true);
      expect(types.has("vulnerabilities")).toBe(true);
      expect(types.has("fleet")).toBe(true);
    });
  });

  // ── UPDATE (per-type) ──────────────────────────────────────────────────────

  describe("update for each new type", () => {
    /** IDs created specifically for update tests */
    const updateTargets: Record<string, number> = {};

    beforeAll(async () => {
      for (const searchType of newTypes) {
        const result = await caller.savedSearches.create({
          name: `${TEST_PREFIX}update_${searchType}_${Date.now()}`,
          searchType,
          filters: { original: true, type: searchType },
          description: `Update target for ${searchType}`,
        });
        updateTargets[searchType] = result.id;
        createdIds.push(result.id);
      }
    });

    for (const searchType of newTypes) {
      it(`updates name and filters of a '${searchType}' search`, async () => {
        const id = updateTargets[searchType];
        const result = await caller.savedSearches.update({
          id,
          name: `${TEST_PREFIX}updated_${searchType}`,
          filters: { updated: true, level: 7 },
        });
        expect(result).toEqual({ success: true });

        // Verify the update persisted
        const listed = await caller.savedSearches.list({ searchType: searchType as any });
        const updated = listed.searches.find((s) => s.id === id);
        expect(updated).toBeDefined();
        expect(updated!.name).toBe(`${TEST_PREFIX}updated_${searchType}`);
      });

      it(`rejects update of a '${searchType}' search from a different user`, async () => {
        const otherCaller = appRouter.createCaller(createOtherUserContext());
        await expect(
          otherCaller.savedSearches.update({
            id: updateTargets[searchType],
            name: "Hijacked",
          }),
        ).rejects.toThrow("Saved search not found");
      });
    }
  });

  // ── DELETE (per-type) ──────────────────────────────────────────────────────

  describe("delete for each new type", () => {
    /** IDs created specifically for delete tests */
    const deleteTargets: Record<string, number> = {};

    beforeAll(async () => {
      for (const searchType of newTypes) {
        const result = await caller.savedSearches.create({
          name: `${TEST_PREFIX}delete_${searchType}_${Date.now()}`,
          searchType,
          filters: { deleteTest: true, type: searchType },
        });
        deleteTargets[searchType] = result.id;
        createdIds.push(result.id);
      }
    });

    for (const searchType of newTypes) {
      it(`rejects delete of a '${searchType}' search from a different user`, async () => {
        const otherCaller = appRouter.createCaller(createOtherUserContext());
        await expect(
          otherCaller.savedSearches.delete({ id: deleteTargets[searchType] }),
        ).rejects.toThrow("Saved search not found");
      });

      it(`deletes an owned '${searchType}' saved search`, async () => {
        const id = deleteTargets[searchType];
        const result = await caller.savedSearches.delete({ id });
        expect(result).toEqual({ success: true });

        // Remove from cleanup list since it's already deleted
        const idx = createdIds.indexOf(id);
        if (idx >= 0) createdIds.splice(idx, 1);
      });

      it(`rejects delete of already-deleted '${searchType}' search`, async () => {
        await expect(
          caller.savedSearches.delete({ id: deleteTargets[searchType] }),
        ).rejects.toThrow("Saved search not found");
      });
    }
  });

  // ── INPUT VALIDATION ───────────────────────────────────────────────────────

  describe("input validation", () => {
    it("rejects invalid searchType at Zod level", async () => {
      await expect(
        caller.savedSearches.create({
          name: "Bad Type",
          searchType: "nonexistent" as "siem",
          filters: {},
        }),
      ).rejects.toThrow();
    });

    it("rejects empty name", async () => {
      await expect(
        caller.savedSearches.create({
          name: "",
          searchType: "alerts",
          filters: {},
        }),
      ).rejects.toThrow();
    });

    it("rejects name exceeding 256 characters", async () => {
      await expect(
        caller.savedSearches.create({
          name: "x".repeat(257),
          searchType: "vulnerabilities",
          filters: {},
        }),
      ).rejects.toThrow();
    });
  });
});
