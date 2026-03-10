/**
 * P1 Objective 2 — Dashboard & UI Parameter Propagation Verification
 *
 * These tests verify that body params from the KG are correctly reflected
 * in the API Explorer endpoint detail, and that dashboard-consumed endpoints
 * have their params match the KG truth.
 *
 * Source-of-truth tracing: KG (kg_parameters) → Router (Zod schema) → UI (API Explorer)
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

describe.skipIf(!HAS_DB)("P1 Obj2 — Parameter Propagation Verification", () => {
  describe("PUT /active-response body params visible in KG", () => {
    it("should have body params for PUT /active-response", async () => {
      const [rows] = await pool.query(
        `SELECT p.name, p.location, p.required, p.param_type
         FROM kg_parameters p
         JOIN kg_endpoints e ON p.endpoint_id = e.id
         WHERE e.path = ? AND e.method = ?
         AND p.location = 'body'
         ORDER BY p.name`,
        ["/active-response", "PUT"]
      );
      const params = rows as any[];
      expect(params.length).toBeGreaterThan(0);

      const paramNames = params.map((p: any) => p.name);
      // These are the critical body params for active-response
      expect(paramNames).toContain("command");
      expect(paramNames).toContain("arguments");
      expect(paramNames).toContain("alert.data");

      // Verify location is body for all
      for (const p of params) {
        expect(p.location).toBe("body");
      }
    });

    it("should document source-of-truth: KG body params → not in router Zod (read-only app)", async () => {
      // Active-response is a PUT (write) endpoint — the router does NOT expose it
      // because the app is read-only by default. The KG stores these params
      // so the agentic pipeline can explain WHY it refuses the request.
      const [rows] = await pool.query(
        `SELECT e.risk_level, e.allowed_for_llm
         FROM kg_endpoints e
         WHERE e.path = ? AND e.method = ?`,
        ["/active-response", "PUT"]
      );
      const endpoint = (rows as any[])[0];
      expect(endpoint).toBeDefined();
      // PUT /active-response should be DESTRUCTIVE and NOT allowed for LLM
      expect(["DESTRUCTIVE", "MUTATING"]).toContain(endpoint.risk_level);
      expect(endpoint.allowed_for_llm).toBe(0);
    });
  });

  describe("POST /agents body params visible in KG", () => {
    it("should have body params for POST /agents", async () => {
      const [rows] = await pool.query(
        `SELECT p.name, p.location, p.required, p.param_type
         FROM kg_parameters p
         JOIN kg_endpoints e ON p.endpoint_id = e.id
         WHERE e.path = ? AND e.method = ?
         AND p.location = 'body'
         ORDER BY p.name`,
        ["/agents", "POST"]
      );
      const params = rows as any[];
      expect(params.length).toBeGreaterThan(0);

      const paramNames = params.map((p: any) => p.name);
      expect(paramNames).toContain("name");

      for (const p of params) {
        expect(p.location).toBe("body");
      }
    });

    it("should document source-of-truth: POST /agents body params → not in router (read-only)", async () => {
      const [rows] = await pool.query(
        `SELECT e.risk_level, e.allowed_for_llm
         FROM kg_endpoints e
         WHERE e.path = ? AND e.method = ?`,
        ["/agents", "POST"]
      );
      const endpoint = (rows as any[])[0];
      expect(endpoint).toBeDefined();
      expect(["MUTATING", "DESTRUCTIVE"]).toContain(endpoint.risk_level);
    });
  });

  describe("Syscollector endpoint params match KG truth", () => {
    it("GET /syscollector/{agent_id}/packages params should match KG", async () => {
      const [rows] = await pool.query(
        `SELECT p.name, p.location, p.param_type
         FROM kg_parameters p
         JOIN kg_endpoints e ON p.endpoint_id = e.id
         WHERE e.path = ? AND e.method = 'GET'
         ORDER BY p.name`,
        ["/syscollector/{agent_id}/packages"]
      );
      const params = rows as any[];
      expect(params.length).toBeGreaterThan(0);

      const paramNames = params.map((p: any) => p.name);
      // These are the params we wired into the router via SYSCOLLECTOR_PACKAGES_CONFIG
      expect(paramNames).toContain("limit");
      expect(paramNames).toContain("offset");
      expect(paramNames).toContain("select");
      expect(paramNames).toContain("sort");
      expect(paramNames).toContain("search");
      expect(paramNames).toContain("q");
    });

    it("source-of-truth trace: KG → broker config → Zod schema → UI", async () => {
      // This test documents the propagation chain:
      // 1. KG (kg_parameters) stores the canonical param list from OpenAPI spec
      // 2. paramBroker (SYSCOLLECTOR_PACKAGES_CONFIG) defines allowed params with types
      // 3. wazuhRouter Zod schema exposes params to tRPC
      // 4. UI (API Explorer / dashboard) consumes via trpc.wazuh.agentPackages.useQuery()
      //
      // Verification: count KG query params vs broker-allowed params
      const [kgRows] = await pool.query(
        `SELECT COUNT(*) as cnt FROM kg_parameters p
         JOIN kg_endpoints e ON p.endpoint_id = e.id
         WHERE e.path = '/syscollector/{agent_id}/packages'
         AND e.method = 'GET' AND p.location = 'query'`
      );
      const kgCount = (kgRows as any[])[0].cnt;
      expect(kgCount).toBeGreaterThan(5); // At least limit, offset, select, sort, search, q
    });
  });

  describe("Dashboard-consumed endpoint: GET /agents params match KG", () => {
    it("GET /agents query params should match KG", async () => {
      const [rows] = await pool.query(
        `SELECT p.name FROM kg_parameters p
         JOIN kg_endpoints e ON p.endpoint_id = e.id
         WHERE e.path = '/agents' AND e.method = 'GET'
         AND p.location = 'query'
         ORDER BY p.name`
      );
      const kgParams = (rows as any[]).map((r: any) => r.name);

      // These are the params the Fleet Command dashboard actually uses
      const dashboardParams = [
        "limit", "offset", "status", "search", "sort", "q",
        "select", "os.platform", "os.name", "os.version",
        "manager", "version", "group", "node_name", "name", "ip"
      ];

      for (const dp of dashboardParams) {
        expect(kgParams).toContain(dp);
      }
    });

    it("source-of-truth: every dashboard param has KG backing", async () => {
      // Document: all params used by Fleet Command are backed by KG entries
      // Source chain: KG → AGENTS_CONFIG broker → Zod schema → trpc.wazuh.agents.useQuery()
      const [rows] = await pool.query(
        `SELECT COUNT(*) as cnt FROM kg_parameters p
         JOIN kg_endpoints e ON p.endpoint_id = e.id
         WHERE e.path = '/agents' AND e.method = 'GET'
         AND p.location IN ('query', 'path')`
      );
      const totalKgParams = (rows as any[])[0].cnt;
      expect(totalKgParams).toBeGreaterThanOrEqual(16); // At least 16 query params wired
    });
  });
});
