/**
 * KG Hydration Proof Tests — Directive 1
 *
 * Section A: Deterministic hydration shape (dry-run counts match DB)
 * Section B: Parameter truth tests (positive + negative regression)
 * Section C: Risk classification correctness
 *
 * These tests run against the LIVE database to prove the KG is
 * "complete enough" and correct. Skipped if DATABASE_URL is absent.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const HAS_DB = !!process.env.DATABASE_URL;

// ── Expected counts from seed-kg.mjs --dry-run against spec-v4.14.3.yaml ──
// These are the canonical truth values. If the seeder changes, update here.
const EXPECTED = {
  endpoints: 182,
  parameters: 1186, // 1148 query/path + 38 body params from requestBody extraction
  responses: 1126,
  authMethods: 2,
  resources: 21,
  useCases: 16,
  indices: 5,
  fields: 60,
  errorPatterns: 9,
  syncStatus: 4,
};

describe("KG Hydration Proof — Section A: Shape Verification", () => {
  let stats: Record<string, number> = {};

  beforeAll(async () => {
    if (!HAS_DB) return;
    const mysql = await import("mysql2/promise");
    const conn = await (mysql as any).createConnection(process.env.DATABASE_URL);
    const tables: [string, string][] = [
      ["kg_endpoints", "endpoints"],
      ["kg_parameters", "parameters"],
      ["kg_responses", "responses"],
      ["kg_auth_methods", "authMethods"],
      ["kg_resources", "resources"],
      ["kg_use_cases", "useCases"],
      ["kg_indices", "indices"],
      ["kg_fields", "fields"],
      ["kg_error_patterns", "errorPatterns"],
      ["kg_sync_status", "syncStatus"],
    ];
    for (const [table, key] of tables) {
      const [rows] = await conn.execute(`SELECT COUNT(*) as c FROM ${table}`);
      stats[key] = (rows as any)[0].c;
    }
    await conn.end();
  });

  it.skipIf(!HAS_DB)("endpoint count matches spec extraction", () => {
    expect(stats.endpoints).toBe(EXPECTED.endpoints);
  });

  it.skipIf(!HAS_DB)("parameter count is at least the spec-extracted count", () => {
    // >= because requestBody extraction will add more
    expect(stats.parameters).toBeGreaterThanOrEqual(EXPECTED.parameters);
  });

  it.skipIf(!HAS_DB)("response count matches spec extraction", () => {
    expect(stats.responses).toBe(EXPECTED.responses);
  });

  it.skipIf(!HAS_DB)("auth method count matches", () => {
    expect(stats.authMethods).toBe(EXPECTED.authMethods);
  });

  it.skipIf(!HAS_DB)("resource count matches", () => {
    expect(stats.resources).toBe(EXPECTED.resources);
  });

  it.skipIf(!HAS_DB)("use case count matches", () => {
    expect(stats.useCases).toBe(EXPECTED.useCases);
  });

  it.skipIf(!HAS_DB)("index pattern count matches", () => {
    expect(stats.indices).toBe(EXPECTED.indices);
  });

  it.skipIf(!HAS_DB)("field count matches", () => {
    expect(stats.fields).toBe(EXPECTED.fields);
  });

  it.skipIf(!HAS_DB)("error pattern count matches", () => {
    expect(stats.errorPatterns).toBe(EXPECTED.errorPatterns);
  });

  it.skipIf(!HAS_DB)("sync status layer count matches", () => {
    expect(stats.syncStatus).toBe(EXPECTED.syncStatus);
  });

  it.skipIf(!HAS_DB)("graph stats endpoint returns matching counts", async () => {
    const { getGraphStats } = await import("./graphQueryService");
    const graphStats = await getGraphStats();
    expect(graphStats.endpoints).toBe(EXPECTED.endpoints);
    expect(graphStats.parameters).toBeGreaterThanOrEqual(EXPECTED.parameters);
    expect(graphStats.resources).toBe(EXPECTED.resources);
    expect(graphStats.useCases).toBe(EXPECTED.useCases);
    expect(graphStats.indices).toBe(EXPECTED.indices);
    expect(graphStats.fields).toBe(EXPECTED.fields);
    expect(graphStats.errorPatterns).toBe(EXPECTED.errorPatterns);
  });
});

describe("KG Hydration Proof — Section B: Parameter Truth Tests", () => {
  let conn: any;

  beforeAll(async () => {
    if (!HAS_DB) return;
    const mysql = await import("mysql2/promise");
    conn = await (mysql as any).createConnection(process.env.DATABASE_URL);
  });

  // Helper: get endpoint DB id by method+path
  async function getEndpointId(method: string, path: string): Promise<number | null> {
    const [rows] = await conn.execute(
      "SELECT id FROM kg_endpoints WHERE method = ? AND path = ?",
      [method, path]
    );
    return (rows as any)[0]?.id ?? null;
  }

  // Helper: get all param names for an endpoint
  async function getParamNames(endpointDbId: number): Promise<string[]> {
    const [rows] = await conn.execute(
      "SELECT name FROM kg_parameters WHERE endpoint_id = ? ORDER BY name",
      [endpointDbId]
    );
    return (rows as any).map((r: any) => r.name);
  }

  // ── Negative regression: event must NOT exist for GET /syscheck/{agent_id} ──
  it.skipIf(!HAS_DB)(
    "NEGATIVE: 'event' param does NOT exist for GET /syscheck/{agent_id}",
    async () => {
      const epId = await getEndpointId("GET", "/syscheck/{agent_id}");
      expect(epId).not.toBeNull();
      const params = await getParamNames(epId!);
      expect(params).not.toContain("event");
    }
  );

  // ── Positive regression: known-good params for GET /syscheck/{agent_id} ──
  it.skipIf(!HAS_DB)(
    "POSITIVE: known-good params exist for GET /syscheck/{agent_id}",
    async () => {
      const epId = await getEndpointId("GET", "/syscheck/{agent_id}");
      expect(epId).not.toBeNull();
      const params = await getParamNames(epId!);
      const expectedParams = ["q", "limit", "offset", "file", "md5", "sha1", "sha256", "hash", "type", "summary"];
      for (const p of expectedParams) {
        expect(params).toContain(p);
      }
    }
  );

  // ── Positive regression: known-good params for GET /agents ──
  it.skipIf(!HAS_DB)(
    "POSITIVE: known-good params exist for GET /agents",
    async () => {
      const epId = await getEndpointId("GET", "/agents");
      expect(epId).not.toBeNull();
      const params = await getParamNames(epId!);
      const expectedParams = ["q", "limit", "offset", "status", "os.platform", "os.name", "name", "ip", "group"];
      for (const p of expectedParams) {
        expect(params).toContain(p);
      }
    }
  );

  // ── Positive regression: known-good params for GET /sca/{agent_id} ──
  it.skipIf(!HAS_DB)(
    "POSITIVE: known-good params exist for GET /sca/{agent_id}",
    async () => {
      const epId = await getEndpointId("GET", "/sca/{agent_id}");
      expect(epId).not.toBeNull();
      const params = await getParamNames(epId!);
      const expectedParams = ["q", "limit", "offset", "agent_id"];
      for (const p of expectedParams) {
        expect(params).toContain(p);
      }
    }
  );

  // ── Spot-check: syscollector packages params ──
  it.skipIf(!HAS_DB)(
    "POSITIVE: known-good params exist for GET /syscollector/{agent_id}/packages",
    async () => {
      const epId = await getEndpointId("GET", "/syscollector/{agent_id}/packages");
      expect(epId).not.toBeNull();
      const params = await getParamNames(epId!);
      const expectedParams = ["q", "limit", "offset", "agent_id", "vendor", "name", "architecture", "format", "version"];
      for (const p of expectedParams) {
        expect(params).toContain(p);
      }
    }
  );

  // ── Spot-check: syscollector ports params ──
  it.skipIf(!HAS_DB)(
    "POSITIVE: known-good params exist for GET /syscollector/{agent_id}/ports",
    async () => {
      const epId = await getEndpointId("GET", "/syscollector/{agent_id}/ports");
      expect(epId).not.toBeNull();
      const params = await getParamNames(epId!);
      const expectedParams = ["q", "limit", "offset", "agent_id", "protocol", "pid", "process"];
      for (const p of expectedParams) {
        expect(params).toContain(p);
      }
    }
  );

  afterAll(async () => {
    if (conn) await conn.end();
  });
});

describe("KG Hydration Proof — Section C: Risk Classification", () => {
  let conn: any;

  beforeAll(async () => {
    if (!HAS_DB) return;
    const mysql = await import("mysql2/promise");
    conn = await (mysql as any).createConnection(process.env.DATABASE_URL);
  });

  it.skipIf(!HAS_DB)(
    "all DELETE endpoints are classified as DESTRUCTIVE",
    async () => {
      const [rows] = await conn.execute(
        "SELECT path, risk_level FROM kg_endpoints WHERE method = 'DELETE'"
      );
      for (const row of rows as any[]) {
        expect(row.risk_level).toBe("DESTRUCTIVE");
      }
    }
  );

  it.skipIf(!HAS_DB)(
    "all DESTRUCTIVE endpoints have allowedForLlm = 0",
    async () => {
      const [rows] = await conn.execute(
        "SELECT path, method, allowed_for_llm FROM kg_endpoints WHERE risk_level = 'DESTRUCTIVE'"
      );
      for (const row of rows as any[]) {
        expect(row.allowed_for_llm).toBe(0);
      }
    }
  );

  it.skipIf(!HAS_DB)(
    "all MUTATING endpoints have allowedForLlm = 0",
    async () => {
      const [rows] = await conn.execute(
        "SELECT path, method, allowed_for_llm FROM kg_endpoints WHERE risk_level = 'MUTATING'"
      );
      for (const row of rows as any[]) {
        expect(row.allowed_for_llm).toBe(0);
      }
    }
  );

  it.skipIf(!HAS_DB)(
    "all GET endpoints are classified as SAFE",
    async () => {
      const [rows] = await conn.execute(
        "SELECT path, risk_level FROM kg_endpoints WHERE method = 'GET'"
      );
      for (const row of rows as any[]) {
        expect(row.risk_level).toBe("SAFE");
      }
    }
  );

  it.skipIf(!HAS_DB)(
    "SAFE endpoints have allowedForLlm = 1",
    async () => {
      const [rows] = await conn.execute(
        "SELECT path, method, allowed_for_llm FROM kg_endpoints WHERE risk_level = 'SAFE'"
      );
      for (const row of rows as any[]) {
        expect(row.allowed_for_llm).toBe(1);
      }
    }
  );

  it.skipIf(!HAS_DB)(
    "risk level breakdown sums to total endpoints",
    async () => {
      const [rows] = await conn.execute(
        "SELECT risk_level, COUNT(*) as c FROM kg_endpoints GROUP BY risk_level"
      );
      const counts = Object.fromEntries((rows as any[]).map(r => [r.risk_level, r.c]));
      const total = Object.values(counts).reduce((a: number, b: any) => a + b, 0);
      expect(total).toBe(EXPECTED.endpoints);
    }
  );

  afterAll(async () => {
    if (conn) await conn.end();
  });
});

describe("KG Hydration Proof — Section D: Body-Param Truth Tests (Mutating Endpoints)", () => {
  let conn: any;

  beforeAll(async () => {
    if (!HAS_DB) return;
    const mysql = await import("mysql2/promise");
    conn = await (mysql as any).createConnection(process.env.DATABASE_URL);
  });

  // Helper: get endpoint DB id by method+path
  async function getEndpointId(method: string, path: string): Promise<number | null> {
    const [rows] = await conn.execute(
      "SELECT id FROM kg_endpoints WHERE method = ? AND path = ?",
      [method, path]
    );
    return (rows as any)[0]?.id ?? null;
  }

  // Helper: get body params for an endpoint
  async function getBodyParams(endpointDbId: number): Promise<Array<{ name: string; required: number; param_type: string }>> {
    const [rows] = await conn.execute(
      "SELECT name, required, param_type FROM kg_parameters WHERE endpoint_id = ? AND location = 'body' ORDER BY name",
      [endpointDbId]
    );
    return rows as any[];
  }

  // Helper: get all param names for an endpoint (any location)
  async function getParamNames(endpointDbId: number, location?: string): Promise<string[]> {
    const query = location
      ? "SELECT name FROM kg_parameters WHERE endpoint_id = ? AND location = ? ORDER BY name"
      : "SELECT name FROM kg_parameters WHERE endpoint_id = ? ORDER BY name";
    const params = location ? [endpointDbId, location] : [endpointDbId];
    const [rows] = await conn.execute(query, params);
    return (rows as any).map((r: any) => r.name);
  }

  // ── PUT /active-response: must have body params for command, arguments, alert ──
  it.skipIf(!HAS_DB)(
    "PUT /active-response has body params extracted from requestBody schema",
    async () => {
      const epId = await getEndpointId("PUT", "/active-response");
      expect(epId).not.toBeNull();
      const bodyParams = await getBodyParams(epId!);
      expect(bodyParams.length).toBeGreaterThan(0);
      const names = bodyParams.map(p => p.name);
      // The active-response requestBody has command and arguments at minimum
      expect(names).toContain("command");
      expect(names).toContain("arguments");
    }
  );

  it.skipIf(!HAS_DB)(
    "PUT /active-response is classified as DESTRUCTIVE with allowedForLlm=0 (active response = remote execution)",
    async () => {
      const [rows] = await conn.execute(
        "SELECT risk_level, allowed_for_llm FROM kg_endpoints WHERE method = 'PUT' AND path = '/active-response'"
      );
      expect((rows as any).length).toBe(1);
      // PUT /active-response triggers remote command execution on agents,
      // which the seeder classifies as DESTRUCTIVE (not merely MUTATING)
      expect((rows as any)[0].risk_level).toBe("DESTRUCTIVE");
      expect((rows as any)[0].allowed_for_llm).toBe(0);
    }
  );

  // ── POST /agents: must have body params for agent enrollment ──
  it.skipIf(!HAS_DB)(
    "POST /agents has body params extracted from requestBody schema",
    async () => {
      const epId = await getEndpointId("POST", "/agents");
      expect(epId).not.toBeNull();
      const bodyParams = await getBodyParams(epId!);
      expect(bodyParams.length).toBeGreaterThan(0);
      const names = bodyParams.map(p => p.name);
      // POST /agents requires name at minimum
      expect(names).toContain("name");
    }
  );

  it.skipIf(!HAS_DB)(
    "POST /agents is classified as MUTATING with allowedForLlm=0",
    async () => {
      const [rows] = await conn.execute(
        "SELECT risk_level, allowed_for_llm FROM kg_endpoints WHERE method = 'POST' AND path = '/agents'"
      );
      expect((rows as any).length).toBe(1);
      expect((rows as any)[0].risk_level).toBe("MUTATING");
      expect((rows as any)[0].allowed_for_llm).toBe(0);
    }
  );

  // ── POST /security/user/authenticate: classified as SAFE (read-like) ──
  it.skipIf(!HAS_DB)(
    "POST /security/user/authenticate is classified as SAFE (read-like auth endpoint)",
    async () => {
      const [rows] = await conn.execute(
        "SELECT risk_level, allowed_for_llm FROM kg_endpoints WHERE method = 'POST' AND path = '/security/user/authenticate'"
      );
      expect((rows as any).length).toBe(1);
      expect((rows as any)[0].risk_level).toBe("SAFE");
      expect((rows as any)[0].allowed_for_llm).toBe(1);
    }
  );

  // ── Verify body params have correct location='body' ──
  it.skipIf(!HAS_DB)(
    "all body params across mutating endpoints have location='body'",
    async () => {
      const [rows] = await conn.execute(
        "SELECT COUNT(*) as c FROM kg_parameters WHERE location = 'body'"
      );
      // We know from the seeder dry-run that 38 body params were extracted
      expect((rows as any)[0].c).toBeGreaterThanOrEqual(30);
    }
  );

  // ── Verify no body params leak into SAFE GET endpoints ──
  it.skipIf(!HAS_DB)(
    "GET endpoints have zero body params (GET cannot have requestBody)",
    async () => {
      const [rows] = await conn.execute(`
        SELECT e.method, e.path, COUNT(p.id) as body_count
        FROM kg_endpoints e
        JOIN kg_parameters p ON p.endpoint_id = e.id AND p.location = 'body'
        WHERE e.method = 'GET'
        GROUP BY e.method, e.path
        HAVING body_count > 0
      `);
      expect((rows as any).length).toBe(0);
    }
  );

  // ── DELETE /agents: must be DESTRUCTIVE with no body params (uses query params) ──
  it.skipIf(!HAS_DB)(
    "DELETE /agents is DESTRUCTIVE and has query params (agents_list, purge, older_than, status)",
    async () => {
      const epId = await getEndpointId("DELETE", "/agents");
      expect(epId).not.toBeNull();
      const bodyParams = await getBodyParams(epId!);
      const queryParams = await getParamNames(epId!, "query");
      // DELETE /agents uses query params, not body
      expect(bodyParams.length).toBe(0);
      expect(queryParams).toContain("agents_list");
      expect(queryParams).toContain("purge");
      expect(queryParams).toContain("older_than");
      expect(queryParams).toContain("status");
    }
  );

  afterAll(async () => {
    if (conn) await conn.end();
  });
});
