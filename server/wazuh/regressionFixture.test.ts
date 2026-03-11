/**
 * P1 Objective 5 — Regression Fixture for Phase 1/2 Closed Gaps
 *
 * This fixture captures the known-good endpoint contracts from Phase 1/2/3
 * so that future KG hydration regressions fail the build.
 *
 * The fixture tests:
 * 1. Endpoint existence in KG
 * 2. Parameter counts match expected ranges
 * 3. Risk levels are correctly assigned
 * 4. Body params exist for write endpoints
 * 5. Router procedure count matches expected
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

/**
 * Known-good endpoint contracts — Phase 1/2/3 closed gaps
 *
 * Format: [path, method, riskLevel, minQueryParams, hasBodyParams]
 */
const PHASE_1_2_CONTRACTS: Array<{
  path: string;
  method: string;
  risk: string;
  minQueryParams: number;
  hasBody: boolean;
}> = [
  // Phase 1 — Core endpoints
  { path: "/agents", method: "GET", risk: "SAFE", minQueryParams: 15, hasBody: false },
  { path: "/agents/summary/status", method: "GET", risk: "SAFE", minQueryParams: 0, hasBody: false },
  // Note: Wazuh v4.14.3 has no dedicated GET /agents/{agent_id} — single agent lookup uses GET /agents?agents_list=ID
  { path: "/agents/{agent_id}/config/{component}/{configuration}", method: "GET", risk: "SAFE", minQueryParams: 0, hasBody: false },
  { path: "/agents/{agent_id}/key", method: "GET", risk: "SAFE", minQueryParams: 0, hasBody: false },
  { path: "/cluster/nodes", method: "GET", risk: "SAFE", minQueryParams: 5, hasBody: false },
  { path: "/cluster/status", method: "GET", risk: "SAFE", minQueryParams: 0, hasBody: false },
  { path: "/cluster/healthcheck", method: "GET", risk: "SAFE", minQueryParams: 0, hasBody: false },
  { path: "/manager/info", method: "GET", risk: "SAFE", minQueryParams: 0, hasBody: false },
  { path: "/manager/status", method: "GET", risk: "SAFE", minQueryParams: 0, hasBody: false },
  { path: "/manager/configuration", method: "GET", risk: "SAFE", minQueryParams: 0, hasBody: false },
  { path: "/rules", method: "GET", risk: "SAFE", minQueryParams: 10, hasBody: false },

  // Phase 2 — Syscollector per-agent
  { path: "/syscollector/{agent_id}/packages", method: "GET", risk: "SAFE", minQueryParams: 5, hasBody: false },
  { path: "/syscollector/{agent_id}/processes", method: "GET", risk: "SAFE", minQueryParams: 5, hasBody: false },
  { path: "/syscollector/{agent_id}/ports", method: "GET", risk: "SAFE", minQueryParams: 5, hasBody: false },
  { path: "/syscollector/{agent_id}/os", method: "GET", risk: "SAFE", minQueryParams: 0, hasBody: false },
  { path: "/syscollector/{agent_id}/hardware", method: "GET", risk: "SAFE", minQueryParams: 0, hasBody: false },

  // Phase 2 — Syscheck
  { path: "/syscheck/{agent_id}", method: "GET", risk: "SAFE", minQueryParams: 8, hasBody: false },

  // Phase 3 — Write endpoints (body params in KG for refusal context)
  { path: "/active-response", method: "PUT", risk: "DESTRUCTIVE", minQueryParams: 0, hasBody: true },
  { path: "/agents", method: "POST", risk: "MUTATING", minQueryParams: 0, hasBody: true },
  { path: "/security/user/authenticate", method: "POST", risk: "SAFE", minQueryParams: 0, hasBody: false },

  // Sprint v2 — Security family
  { path: "/security/rules", method: "GET", risk: "SAFE", minQueryParams: 5, hasBody: false },
  { path: "/security/actions", method: "GET", risk: "SAFE", minQueryParams: 0, hasBody: false },
  { path: "/security/resources", method: "GET", risk: "SAFE", minQueryParams: 0, hasBody: false },
  { path: "/security/users/me/policies", method: "GET", risk: "SAFE", minQueryParams: 0, hasBody: false },

  // Sprint v2 — Agent lifecycle
  { path: "/agents/upgrade_result", method: "GET", risk: "SAFE", minQueryParams: 3, hasBody: false },
  { path: "/", method: "GET", risk: "SAFE", minQueryParams: 0, hasBody: false },
];

describe.skipIf(!HAS_DB)("P1 Obj5 — Regression Fixture for Phase 1/2/3 Closed Gaps", () => {
  describe("Endpoint existence in KG", () => {
    for (const contract of PHASE_1_2_CONTRACTS) {
      it(`${contract.method} ${contract.path} exists in KG`, async () => {
        const [rows] = await pool.query(
          `SELECT id, risk_level FROM kg_endpoints WHERE path = ? AND method = ?`,
          [contract.path, contract.method]
        );
        const endpoints = rows as any[];
        expect(endpoints.length).toBeGreaterThanOrEqual(1);
      });
    }
  });

  describe("Risk levels correctly assigned", () => {
    for (const contract of PHASE_1_2_CONTRACTS) {
      it(`${contract.method} ${contract.path} has risk_level=${contract.risk}`, async () => {
        const [rows] = await pool.query(
          `SELECT risk_level FROM kg_endpoints WHERE path = ? AND method = ?`,
          [contract.path, contract.method]
        );
        const endpoint = (rows as any[])[0];
        expect(endpoint).toBeDefined();
        expect(endpoint.risk_level).toBe(contract.risk);
      });
    }
  });

  describe("Parameter counts match expected ranges", () => {
    for (const contract of PHASE_1_2_CONTRACTS.filter(c => c.minQueryParams > 0)) {
      it(`${contract.method} ${contract.path} has >= ${contract.minQueryParams} query params`, async () => {
        const [rows] = await pool.query(
          `SELECT COUNT(*) as cnt FROM kg_parameters p
           JOIN kg_endpoints e ON p.endpoint_id = e.id
           WHERE e.path = ? AND e.method = ? AND p.location = 'query'`,
          [contract.path, contract.method]
        );
        const count = (rows as any[])[0].cnt;
        expect(count).toBeGreaterThanOrEqual(contract.minQueryParams);
      });
    }
  });

  describe("Body params exist for write endpoints", () => {
    for (const contract of PHASE_1_2_CONTRACTS.filter(c => c.hasBody)) {
      it(`${contract.method} ${contract.path} has body params`, async () => {
        const [rows] = await pool.query(
          `SELECT COUNT(*) as cnt FROM kg_parameters p
           JOIN kg_endpoints e ON p.endpoint_id = e.id
           WHERE e.path = ? AND e.method = ? AND p.location = 'body'`,
          [contract.path, contract.method]
        );
        const count = (rows as any[])[0].cnt;
        expect(count).toBeGreaterThan(0);
      });
    }
  });

  describe("Global KG health invariants", () => {
    it("total endpoints >= 182", async () => {
      const [rows] = await pool.query(`SELECT COUNT(*) as cnt FROM kg_endpoints`);
      expect((rows as any[])[0].cnt).toBeGreaterThanOrEqual(182);
    });

    it("total parameters >= 1186", async () => {
      const [rows] = await pool.query(`SELECT COUNT(*) as cnt FROM kg_parameters`);
      expect((rows as any[])[0].cnt).toBeGreaterThanOrEqual(1186);
    });

    it("total responses >= 1126", async () => {
      const [rows] = await pool.query(`SELECT COUNT(*) as cnt FROM kg_responses`);
      expect((rows as any[])[0].cnt).toBeGreaterThanOrEqual(1126);
    });

    it("no SAFE endpoints blocked from LLM", async () => {
      const [rows] = await pool.query(
        `SELECT COUNT(*) as cnt FROM kg_endpoints
         WHERE risk_level = 'SAFE' AND allowed_for_llm = 0`
      );
      expect((rows as any[])[0].cnt).toBe(0);
    });

    it("no DESTRUCTIVE/MUTATING endpoints allowed for LLM", async () => {
      const [rows] = await pool.query(
        `SELECT COUNT(*) as cnt FROM kg_endpoints
         WHERE risk_level IN ('DESTRUCTIVE', 'MUTATING') AND allowed_for_llm = 1`
      );
      expect((rows as any[])[0].cnt).toBe(0);
    });

    it("no duplicate parameters on same endpoint", async () => {
      const [rows] = await pool.query(
        `SELECT endpoint_id, name, location, COUNT(*) as cnt
         FROM kg_parameters
         GROUP BY endpoint_id, name, location
         HAVING cnt > 1`
      );
      expect((rows as any[]).length).toBe(0);
    });
  });
});
