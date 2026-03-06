/**
 * Saved Searches — DB-backed Integration Tests
 *
 * Tests the full CRUD roundtrip for all 5 search types:
 *   siem, hunting, alerts, vulnerabilities, fleet
 *
 * These tests hit the real database. Gated by DATABASE_URL.
 * Cleanup: all test rows are deleted in afterAll.
 */
import { describe, it, expect, afterAll } from "vitest";
import mysql from "mysql2/promise";
import { SAVED_SEARCH_TYPES } from "../../shared/searchTypes";

const HAS_DB = !!process.env.DATABASE_URL;
const DB_URL = process.env.DATABASE_URL || "mysql://x:x@localhost:3306/x";
const parsed = (() => {
  try { return new URL(DB_URL); } catch { return new URL("mysql://x:x@localhost:3306/x"); }
})();

const pool = HAS_DB
  ? mysql.createPool({
      host: parsed.hostname,
      port: Number(parsed.port),
      user: parsed.username,
      password: parsed.password,
      database: parsed.pathname.slice(1),
      ssl: { rejectUnauthorized: false },
    })
  : (null as unknown as ReturnType<typeof mysql.createPool>);

/** Track IDs we insert so we can clean up */
const insertedIds: number[] = [];

afterAll(async () => {
  if (HAS_DB && pool) {
    // Clean up test rows
    if (insertedIds.length > 0) {
      await pool.query(
        `DELETE FROM saved_searches WHERE id IN (${insertedIds.join(",")})`,
      );
    }
    await pool.end();
  }
});

/** Test user ID — use a high number unlikely to collide with real data */
const TEST_USER_ID = 999999;
const TEST_PREFIX = "__integration_test__";

describe.skipIf(!HAS_DB)("Saved Searches — DB Integration", () => {
  describe("shared/searchTypes.ts is the source of truth", () => {
    it("exports exactly 5 search types", () => {
      expect(SAVED_SEARCH_TYPES).toHaveLength(5);
      expect([...SAVED_SEARCH_TYPES]).toEqual([
        "siem",
        "hunting",
        "alerts",
        "vulnerabilities",
        "fleet",
      ]);
    });
  });

  describe("CREATE roundtrip for each search type", () => {
    for (const searchType of SAVED_SEARCH_TYPES) {
      it(`inserts a saved search with searchType='${searchType}'`, async () => {
        const name = `${TEST_PREFIX}${searchType}_${Date.now()}`;
        const filters = JSON.stringify({ type: searchType, test: true });

        const [result] = await pool.query(
          `INSERT INTO saved_searches (userId, name, searchType, filters) VALUES (?, ?, ?, ?)`,
          [TEST_USER_ID, name, searchType, filters],
        ) as any;

        expect(result.insertId).toBeGreaterThan(0);
        insertedIds.push(result.insertId);

        // Verify the row was persisted correctly
        const [rows] = await pool.query(
          `SELECT id, userId, name, searchType, filters FROM saved_searches WHERE id = ?`,
          [result.insertId],
        ) as any;

        expect(rows).toHaveLength(1);
        expect(rows[0].searchType).toBe(searchType);
        expect(rows[0].name).toBe(name);
        expect(rows[0].userId).toBe(TEST_USER_ID);

        const parsedFilters = typeof rows[0].filters === "string"
          ? JSON.parse(rows[0].filters)
          : rows[0].filters;
        expect(parsedFilters.type).toBe(searchType);
      });
    }
  });

  describe("LIST filtered by each search type", () => {
    for (const searchType of SAVED_SEARCH_TYPES) {
      it(`lists saved searches filtered by searchType='${searchType}'`, async () => {
        const [rows] = await pool.query(
          `SELECT id, name, searchType FROM saved_searches WHERE userId = ? AND searchType = ? AND name LIKE ?`,
          [TEST_USER_ID, searchType, `${TEST_PREFIX}%`],
        ) as any;

        expect(rows.length).toBeGreaterThanOrEqual(1);
        for (const row of rows) {
          expect(row.searchType).toBe(searchType);
        }
      });
    }
  });

  describe("DELETE for each search type", () => {
    it("deletes all test rows successfully", async () => {
      expect(insertedIds.length).toBeGreaterThanOrEqual(5);

      for (const id of insertedIds) {
        const [result] = await pool.query(
          `DELETE FROM saved_searches WHERE id = ? AND userId = ?`,
          [id, TEST_USER_ID],
        ) as any;

        expect(result.affectedRows).toBe(1);
      }

      // Verify all deleted
      const [remaining] = await pool.query(
        `SELECT id FROM saved_searches WHERE userId = ? AND name LIKE ?`,
        [TEST_USER_ID, `${TEST_PREFIX}%`],
      ) as any;

      expect(remaining).toHaveLength(0);

      // Clear the tracking array since we already cleaned up
      insertedIds.length = 0;
    });
  });

  describe("REJECT invalid search type", () => {
    it("rejects an invalid searchType value at the DB level", async () => {
      await expect(
        pool.query(
          `INSERT INTO saved_searches (userId, name, searchType, filters) VALUES (?, ?, ?, ?)`,
          [TEST_USER_ID, `${TEST_PREFIX}invalid`, "bogus_type", "{}"],
        ),
      ).rejects.toThrow();
    });
  });
});
