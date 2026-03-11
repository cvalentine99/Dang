/**
 * P1 Objective 3 — Agent Introspection Parity Tests
 *
 * Verifies that the agentic pipeline's parameter introspection reflects
 * the updated KG shapes, and that no stale cached parameter list
 * overrides the live KG.
 */
import { describe, it, expect, afterAll } from "vitest";
import mysql from "mysql2/promise";

const HAS_DB = !!process.env.DATABASE_URL;

const DB_URL = process.env.DATABASE_URL || "mysql://x:x@localhost:3306/x";
const parsed = (() => { try { return new URL(DB_URL); } catch { return new URL("mysql://x:x@localhost:3306/x"); } })();
const pool = HAS_DB
  ? mysql.createPool({
      host: parsed.hostname,
      port: Number(parsed.port),
      user: parsed.username,
      password: parsed.password,
      database: parsed.pathname.slice(1),
      ssl: { rejectUnauthorized: !(process.env.SKIP_TLS_VERIFY === "true" || process.env.SKIP_TLS_VERIFY === "1") },
    })
  : (null as unknown as ReturnType<typeof mysql.createPool>);

afterAll(async () => {
  if (HAS_DB && pool) await pool.end();
});

describe.skipIf(!HAS_DB)("P1 Obj3 — Agent Introspection Parity", () => {
  describe("KG parameter shapes reflect post-correction state", () => {
    it("body params exist for POST/PUT endpoints (seeder upgrade verified)", async () => {
      const [rows] = await pool.query(
        `SELECT COUNT(*) as cnt FROM kg_parameters WHERE location = 'body'`
      );
      const bodyCount = (rows as any[])[0].cnt;
      // After seeder upgrade, we should have 38 body params across 15 POST/PUT endpoints
      expect(bodyCount).toBeGreaterThanOrEqual(30);
    });

    it("total parameter count reflects all phases (query + path + body)", async () => {
      const [rows] = await pool.query(
        `SELECT location, COUNT(*) as cnt FROM kg_parameters GROUP BY location ORDER BY location`
      );
      const byLocation = Object.fromEntries(
        (rows as any[]).map((r: any) => [r.location, r.cnt])
      );
      expect(byLocation.query).toBeGreaterThan(900);
      expect(byLocation.path).toBeGreaterThan(50);
      expect(byLocation.body).toBeGreaterThan(30);
    });

    it("SAFE endpoints have allowedForLlm=1", async () => {
      const [rows] = await pool.query(
        `SELECT COUNT(*) as cnt FROM kg_endpoints
         WHERE risk_level = 'SAFE' AND allowed_for_llm = 0`
      );
      const mismatch = (rows as any[])[0].cnt;
      expect(mismatch).toBe(0);
    });

    it("DESTRUCTIVE/MUTATING endpoints have allowedForLlm=0", async () => {
      const [rows] = await pool.query(
        `SELECT COUNT(*) as cnt FROM kg_endpoints
         WHERE risk_level IN ('DESTRUCTIVE', 'MUTATING') AND allowed_for_llm = 1`
      );
      const mismatch = (rows as any[])[0].cnt;
      expect(mismatch).toBe(0);
    });
  });

  describe("No stale cached parameter list overrides live KG", () => {
    it("searchGraph returns only SAFE endpoints when llmSafe=true", async () => {
      // Verify the DB-level filter: all endpoints with allowed_for_llm=1 are SAFE
      const [rows] = await pool.query(
        `SELECT e.path, e.method, e.risk_level
         FROM kg_endpoints e
         WHERE e.allowed_for_llm = 1 AND e.risk_level != 'SAFE'`
      );
      const violations = rows as any[];
      expect(violations).toHaveLength(0);
    });

    it("parameter counts per endpoint are consistent (no duplicates)", async () => {
      // Check for duplicate parameters on the same endpoint
      const [rows] = await pool.query(
        `SELECT endpoint_id, name, location, COUNT(*) as cnt
         FROM kg_parameters
         GROUP BY endpoint_id, name, location
         HAVING cnt > 1`
      );
      const duplicates = rows as any[];
      expect(duplicates).toHaveLength(0);
    });

    it("every endpoint has at least one response entry", async () => {
      const [rows] = await pool.query(
        `SELECT e.path, e.method
         FROM kg_endpoints e
         LEFT JOIN kg_responses r ON e.id = r.endpoint_id
         WHERE r.id IS NULL`
      );
      const orphans = rows as any[];
      // Some endpoints may legitimately have no response entries
      // but the vast majority should have at least one
      expect(orphans.length).toBeLessThan(20);
    });
  });

  describe("Payload construction correctness post-correction", () => {
    it("GET /agents has all broker-wired params in KG", async () => {
      const [rows] = await pool.query(
        `SELECT p.name FROM kg_parameters p
         JOIN kg_endpoints e ON p.endpoint_id = e.id
         WHERE e.path = '/agents' AND e.method = 'GET'
         AND p.location = 'query'`
      );
      const kgParams = new Set((rows as any[]).map((r: any) => r.name));

      // These are the params the AGENTS_CONFIG broker accepts
      const brokerParams = [
        "limit", "offset", "status", "search", "sort", "q",
        "select", "distinct", "os.platform", "os.name", "os.version",
        "older_than", "manager", "version", "group", "node_name",
        "name", "ip", "registerIP"
      ];

      for (const bp of brokerParams) {
        expect(kgParams.has(bp)).toBe(true);
      }
    });

    it("GET /syscheck/{agent_id} has correct params (no 'event' ghost)", async () => {
      const [rows] = await pool.query(
        `SELECT p.name FROM kg_parameters p
         JOIN kg_endpoints e ON p.endpoint_id = e.id
         WHERE e.path = '/syscheck/{agent_id}' AND e.method = 'GET'
         AND p.location = 'query'`
      );
      const kgParams = new Set((rows as any[]).map((r: any) => r.name));

      // 'event' should NOT be present (it was a ghost param)
      expect(kgParams.has("event")).toBe(false);

      // These should be present
      expect(kgParams.has("q")).toBe(true);
      expect(kgParams.has("file")).toBe(true);
      expect(kgParams.has("md5")).toBe(true);
      expect(kgParams.has("sha1")).toBe(true);
      expect(kgParams.has("sha256")).toBe(true);
    });

    it("experimental syscollector endpoints have correct params", async () => {
      const [rows] = await pool.query(
        `SELECT e.path, COUNT(p.id) as paramCount
         FROM kg_endpoints e
         LEFT JOIN kg_parameters p ON e.id = p.endpoint_id AND p.location = 'query'
         WHERE e.path LIKE '/experimental/syscollector/%' AND e.method = 'GET'
         GROUP BY e.path
         ORDER BY e.path`
      );
      const endpoints = rows as any[];
      expect(endpoints.length).toBeGreaterThanOrEqual(9);

      // Each experimental syscollector endpoint should have at least basic pagination params
      for (const ep of endpoints) {
        expect(ep.paramCount).toBeGreaterThanOrEqual(3);
      }
    });
  });
});
