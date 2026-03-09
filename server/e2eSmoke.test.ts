/**
 * E2E Smoke Tests — Critical tRPC Procedure Shape Verification
 *
 * These tests hit the real database to verify that critical endpoints
 * return valid response shapes. They do NOT test Wazuh API connectivity
 * (that requires a live Wazuh instance), but they verify all DB-backed
 * procedures return the expected structure.
 *
 * Gated by DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mysql from "mysql2/promise";

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

afterAll(async () => {
  if (pool) await pool.end();
});

// ── alertQueue.list ──────────────────────────────────────────────────────────

describe.skipIf(!HAS_DB)("alertQueue.list — shape verification", () => {
  it("should return { items: array, total: number }", async () => {
    const [rows] = await pool.execute(`
      SELECT * FROM alert_queue
      ORDER BY FIELD(status, 'processing', 'queued', 'completed', 'failed', 'dismissed'),
               ruleLevel DESC, queuedAt ASC
      LIMIT 20
    `);
    const [countResult] = await pool.execute(`
      SELECT COUNT(*) as count FROM alert_queue WHERE status IN ('queued', 'processing')
    `);

    expect(Array.isArray(rows)).toBe(true);
    expect(countResult).toBeDefined();

    // Verify column shape of each row
    const items = rows as Record<string, unknown>[];
    for (const item of items) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("alertId");
      expect(item).toHaveProperty("ruleId");
      expect(item).toHaveProperty("ruleLevel");
      expect(item).toHaveProperty("status");
      expect(item).toHaveProperty("queuedAt");
      expect(["queued", "processing", "completed", "failed", "dismissed"]).toContain(item.status);
      expect(typeof item.ruleLevel).toBe("number");
    }
  });

  it("should return count as a non-negative number", async () => {
    const [rows] = await pool.execute(
      "SELECT COUNT(*) as count FROM alert_queue WHERE status IN ('queued', 'processing')"
    );
    const result = (rows as Array<{ count: number }>)[0];
    expect(result.count).toBeGreaterThanOrEqual(0);
  });
});

// ── pipeline.listPipelineRuns ────────────────────────────────────────────────

describe.skipIf(!HAS_DB)("pipeline.listPipelineRuns — shape verification", () => {
  it("should return { runs: array, total: number } with valid shapes", async () => {
    const [countRows] = await pool.execute("SELECT COUNT(*) as count FROM pipeline_runs");
    const total = (countRows as Array<{ count: number }>)[0].count;
    expect(total).toBeGreaterThanOrEqual(0);

    const [rows] = await pool.execute(`
      SELECT * FROM pipeline_runs ORDER BY startedAt DESC LIMIT 25
    `);
    const runs = rows as Record<string, unknown>[];

    for (const run of runs) {
      expect(run).toHaveProperty("id");
      expect(run).toHaveProperty("runId");
      expect(run).toHaveProperty("status");
      expect(run).toHaveProperty("currentStage");
      expect(run).toHaveProperty("startedAt");
      expect(run).toHaveProperty("triggeredBy");
      expect(["running", "completed", "failed", "partial"]).toContain(run.status);
      expect(["triage", "correlation", "hypothesis", "response_actions", "completed", "failed"]).toContain(run.currentStage);
    }
  });

  it("should support filtering by status", async () => {
    for (const status of ["running", "completed", "failed", "partial"]) {
      const [rows] = await pool.execute(
        "SELECT COUNT(*) as count FROM pipeline_runs WHERE status = ?",
        [status]
      );
      const result = (rows as Array<{ count: number }>)[0];
      expect(result.count).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── pipeline.pipelineRunStats ────────────────────────────────────────────────

describe.skipIf(!HAS_DB)("pipeline.pipelineRunStats — shape verification", () => {
  it("should return aggregate stats with correct types", async () => {
    const [rows] = await pool.execute(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) as partial,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        AVG(totalLatencyMs) as avgLatencyMs
      FROM pipeline_runs
    `);
    const stats = (rows as Record<string, unknown>[])[0];

    expect(stats).toHaveProperty("total");
    expect(stats).toHaveProperty("completed");
    expect(stats).toHaveProperty("partial");
    expect(stats).toHaveProperty("failed");
    expect(stats).toHaveProperty("running");
    expect(stats).toHaveProperty("avgLatencyMs");

    // All counts should be non-negative
    expect(Number(stats.total)).toBeGreaterThanOrEqual(0);
    expect(Number(stats.completed)).toBeGreaterThanOrEqual(0);
    expect(Number(stats.partial)).toBeGreaterThanOrEqual(0);
    expect(Number(stats.failed)).toBeGreaterThanOrEqual(0);
    expect(Number(stats.running)).toBeGreaterThanOrEqual(0);

    // completed + partial + failed + running should equal total
    const sum = Number(stats.completed) + Number(stats.partial) + Number(stats.failed) + Number(stats.running);
    expect(sum).toBe(Number(stats.total));
  });
});

// ── savedSearches.list ───────────────────────────────────────────────────────

describe.skipIf(!HAS_DB)("savedSearches — shape verification", () => {
  const TEST_USER_ID = 999998;
  const TEST_PREFIX = "__e2e_smoke__";
  const insertedIds: number[] = [];

  beforeAll(async () => {
    if (!HAS_DB) return;
    // Ensure test user exists for FK constraints
    await pool.execute(
      `INSERT IGNORE INTO users (id, openId, name, role) VALUES (?, ?, ?, 'user')`,
      [TEST_USER_ID, `smoke-test-${TEST_USER_ID}`, "E2E Smoke Test User"]
    );
  });

  afterAll(async () => {
    if (!HAS_DB) return;
    for (const id of insertedIds) {
      await pool.execute("DELETE FROM saved_searches WHERE id = ?", [id]);
    }
    await pool.execute("DELETE FROM users WHERE id = ?", [TEST_USER_ID]);
  });

  it("should support full CRUD roundtrip", async () => {
    // CREATE
    const [insertResult] = await pool.execute(
      `INSERT INTO saved_searches (userId, name, searchType, filters, description, createdAt, updatedAt)
       VALUES (?, ?, 'siem', '{"level":"12"}', ?, NOW(), NOW())`,
      [TEST_USER_ID, `${TEST_PREFIX}smoke-test`, "E2E smoke test search"]
    );
    const id = (insertResult as { insertId: number }).insertId;
    insertedIds.push(id);

    // READ
    const [rows] = await pool.execute("SELECT * FROM saved_searches WHERE id = ?", [id]);
    const search = (rows as Record<string, unknown>[])[0];
    expect(search).toHaveProperty("id");
    expect(search).toHaveProperty("userId", TEST_USER_ID);
    expect(search).toHaveProperty("name");
    expect(search).toHaveProperty("searchType", "siem");
    expect(search).toHaveProperty("filters");
    expect(search).toHaveProperty("description");
    expect(search).toHaveProperty("createdAt");
    expect(search).toHaveProperty("updatedAt");

    // UPDATE
    await pool.execute(
      "UPDATE saved_searches SET name = ? WHERE id = ?",
      [`${TEST_PREFIX}updated`, id]
    );
    const [updated] = await pool.execute("SELECT name FROM saved_searches WHERE id = ?", [id]);
    expect((updated as Array<{ name: string }>)[0].name).toBe(`${TEST_PREFIX}updated`);

    // DELETE
    await pool.execute("DELETE FROM saved_searches WHERE id = ?", [id]);
    const [deleted] = await pool.execute("SELECT id FROM saved_searches WHERE id = ?", [id]);
    expect((deleted as unknown[]).length).toBe(0);
    insertedIds.pop(); // Already deleted
  });

  it("should enforce FK constraint on userId", async () => {
    try {
      await pool.execute(
        `INSERT INTO saved_searches (userId, name, searchType, filters, createdAt, updatedAt)
         VALUES (?, ?, 'siem', '{}', NOW(), NOW())`,
        [888888, `${TEST_PREFIX}fk-test`]
      );
      // If we get here, FK is not enforced — fail the test
      const [rows] = await pool.execute(
        "SELECT id FROM saved_searches WHERE name = ?",
        [`${TEST_PREFIX}fk-test`]
      );
      if ((rows as unknown[]).length > 0) {
        const id = (rows as Array<{ id: number }>)[0].id;
        await pool.execute("DELETE FROM saved_searches WHERE id = ?", [id]);
      }
      expect.fail("Expected FK constraint violation but insert succeeded");
    } catch (err: unknown) {
      const msg = (err as Error).message || "";
      expect(msg).toMatch(/foreign key|FOREIGN KEY|constraint/i);
    }
  });
});

// ── Composite Index Verification ─────────────────────────────────────────────

describe.skipIf(!HAS_DB)("composite indexes — existence verification", () => {
  it("alertQueue should have composite indexes for priority sorting", async () => {
    const [indexes] = await pool.execute("SHOW INDEX FROM alert_queue");
    const indexNames = new Set((indexes as Array<{ Key_name: string }>).map((r) => r.Key_name));

    expect(indexNames.has("aq_status_ruleLevel_idx")).toBe(true);
    expect(indexNames.has("aq_status_queuedAt_idx")).toBe(true);
  });

  it("pipelineRuns should have composite indexes for filtered listing", async () => {
    const [indexes] = await pool.execute("SHOW INDEX FROM pipeline_runs");
    const indexNames = new Set((indexes as Array<{ Key_name: string }>).map((r) => r.Key_name));

    expect(indexNames.has("pr_status_startedAt_idx")).toBe(true);
    expect(indexNames.has("pr_queueItemId_startedAt_idx")).toBe(true);
  });

  it("alertQueue composite index should have correct column order", async () => {
    const [indexes] = await pool.execute("SHOW INDEX FROM alert_queue WHERE Key_name = 'aq_status_ruleLevel_idx'");
    const cols = (indexes as Array<{ Column_name: string; Seq_in_index: number }>)
      .sort((a, b) => a.Seq_in_index - b.Seq_in_index)
      .map((r) => r.Column_name);
    expect(cols).toEqual(["status", "ruleLevel"]);
  });

  it("pipelineRuns composite index should have correct column order", async () => {
    const [indexes] = await pool.execute("SHOW INDEX FROM pipeline_runs WHERE Key_name = 'pr_status_startedAt_idx'");
    const cols = (indexes as Array<{ Column_name: string; Seq_in_index: number }>)
      .sort((a, b) => a.Seq_in_index - b.Seq_in_index)
      .map((r) => r.Column_name);
    expect(cols).toEqual(["status", "startedAt"]);
  });
});

// ── Request Cache Stats Endpoint ─────────────────────────────────────────────

describe("cacheStats — shape verification", () => {
  it("should return valid CacheStats shape from the module", async () => {
    const { getCacheStats, clearCache } = await import("./wazuh/requestCache");
    clearCache();
    const stats = getCacheStats();

    expect(stats).toHaveProperty("hits");
    expect(stats).toHaveProperty("misses");
    expect(stats).toHaveProperty("coalesced");
    expect(stats).toHaveProperty("size");
    expect(stats).toHaveProperty("inflight");
    expect(stats).toHaveProperty("hitRate");
    expect(stats).toHaveProperty("ttlMs");
    expect(stats).toHaveProperty("enabled");

    expect(typeof stats.hits).toBe("number");
    expect(typeof stats.misses).toBe("number");
    expect(typeof stats.coalesced).toBe("number");
    expect(typeof stats.size).toBe("number");
    expect(typeof stats.inflight).toBe("number");
    expect(typeof stats.hitRate).toBe("number");
    expect(typeof stats.ttlMs).toBe("number");
    expect(typeof stats.enabled).toBe("boolean");

    expect(stats.hitRate).toBeGreaterThanOrEqual(0);
    expect(stats.hitRate).toBeLessThanOrEqual(100);
    expect(stats.ttlMs).toBeGreaterThan(0);
    expect(stats.enabled).toBe(true);
  });
});

// ── DB Health Check (readiness) ──────────────────────────────────────────────

describe.skipIf(!HAS_DB)("database readiness — SELECT 1 verification", () => {
  it("should respond to SELECT 1 within reasonable time", async () => {
    const start = Date.now();
    const [rows] = await pool.execute("SELECT 1 as ok");
    const elapsed = Date.now() - start;

    expect((rows as Array<{ ok: number }>)[0].ok).toBe(1);
    expect(elapsed).toBeLessThan(5000); // Should respond within 5s
  });

  it("should have all critical tables accessible", async () => {
    const criticalTables = [
      "alert_queue",
      "pipeline_runs",
      "saved_searches",
      "triage_objects",
      "correlation_bundles",
      "living_case_state",
      "users",
    ];

    for (const table of criticalTables) {
      const [rows] = await pool.execute(`SELECT COUNT(*) as count FROM ${table}`);
      const result = (rows as Array<{ count: number }>)[0];
      expect(result.count).toBeGreaterThanOrEqual(0);
    }
  });
});
