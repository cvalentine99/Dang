/**
 * ETL Integration Tests — Real DB Pipeline Proof
 *
 * These tests run the actual runFullSync() and syncLayer() paths against
 * the live database. They prove:
 *
 *   1. Full sync clears and reloads all KG tables from the spec
 *   2. Sync status rows are written with truthful metadata
 *   3. Rerun stability — running twice produces the same row counts (no growth)
 *   4. Failure path — syncLayer with invalid layer writes error status truthfully
 *   5. Per-layer sync works independently
 *   6. Metadata contract: specVersion, totalRecords, durationMs, per-layer results
 *
 * IMPORTANT: The afterAll hook runs a final full sync to leave the DB in a
 * populated state for downstream tests (regressionFixture, paramPropagation,
 * agentIntrospection) that depend on KG data being present.
 *
 * Skipped when DATABASE_URL is absent (CI without DB).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const HAS_DB = !!process.env.DATABASE_URL;

// Expected counts from kgExtractor.extract() against spec-v4.14.3.yaml
const EXPECTED_ENDPOINTS = 182;
const EXPECTED_AUTH_METHODS = 2;
const EXPECTED_INDICES = 5;
const EXPECTED_ERROR_PATTERNS = 9;

// KG tables in dependency order (children first for truncation)
const KG_TABLES = [
  "kg_answer_provenance",
  "kg_trust_history",
  "kg_sync_status",
  "kg_error_patterns",
  "kg_fields",
  "kg_indices",
  "kg_use_cases",
  "kg_resources",
  "kg_responses",
  "kg_parameters",
  "kg_auth_methods",
  "kg_endpoints",
];

// Core data tables (excluding metadata tables)
const CORE_DATA_TABLES = [
  "kg_endpoints",
  "kg_parameters",
  "kg_responses",
  "kg_auth_methods",
  "kg_resources",
  "kg_use_cases",
  "kg_indices",
  "kg_fields",
  "kg_error_patterns",
];

describe("ETL Integration — Full Sync Pipeline", () => {
  let conn: any;

  beforeAll(async () => {
    if (!HAS_DB) return;
    const mysql = await import("mysql2/promise");
    conn = await (mysql as any).createConnection(process.env.DATABASE_URL);
  });

  afterAll(async () => {
    // CRITICAL: Re-populate the DB so downstream tests find KG data.
    // Without this, regressionFixture/paramPropagation/agentIntrospection fail.
    if (HAS_DB) {
      try {
        const { runFullSync } = await import("./etlService");
        await runFullSync();
      } catch {
        // Best-effort — if this fails, downstream tests will also fail
        // but at least we don't crash the test runner.
      }
    }
    if (conn) await conn.end();
  });

  /** Helper: get row count for a table */
  async function getCount(table: string): Promise<number> {
    const [rows] = await conn.execute(`SELECT COUNT(*) as c FROM \`${table}\``);
    return (rows as any)[0].c;
  }

  /** Helper: get all sync status rows */
  async function getSyncStatusRows(): Promise<any[]> {
    const [rows] = await conn.execute(
      "SELECT layer, status, entity_count, error_message, duration_ms, spec_version FROM kg_sync_status ORDER BY layer"
    );
    return rows as any[];
  }

  // ── Test 1: Clear tables, run full sync, verify rows loaded ──────────────

  it.skipIf(!HAS_DB)(
    "runFullSync() clears and reloads all KG tables from spec",
    async () => {
      // Step 1: Truncate all KG tables to start from a clean state
      await conn.execute("SET FOREIGN_KEY_CHECKS = 0");
      for (const table of KG_TABLES) {
        await conn.execute(`TRUNCATE TABLE \`${table}\``);
      }
      await conn.execute("SET FOREIGN_KEY_CHECKS = 1");

      // Verify tables are empty
      for (const table of CORE_DATA_TABLES) {
        const count = await getCount(table);
        expect(count).toBe(0);
      }

      // Step 2: Run the full sync
      const { runFullSync } = await import("./etlService");
      const result = await runFullSync();

      // Step 3: Verify success
      expect(result.success).toBe(true);
      expect(result.message).toContain("KG sync completed");
      expect(result.result).toBeDefined();
      expect(result.result!.specVersion).toBeTruthy();
      expect(result.result!.totalRecords).toBeGreaterThan(1000);
      expect(result.result!.durationMs).toBeGreaterThan(0);

      // Step 4: Verify core tables have data
      const endpointCount = await getCount("kg_endpoints");
      expect(endpointCount).toBe(EXPECTED_ENDPOINTS);

      const paramCount = await getCount("kg_parameters");
      expect(paramCount).toBeGreaterThan(500);

      const responseCount = await getCount("kg_responses");
      expect(responseCount).toBeGreaterThan(500);

      const authCount = await getCount("kg_auth_methods");
      expect(authCount).toBe(EXPECTED_AUTH_METHODS);

      const indexCount = await getCount("kg_indices");
      expect(indexCount).toBe(EXPECTED_INDICES);

      const errorCount = await getCount("kg_error_patterns");
      expect(errorCount).toBe(EXPECTED_ERROR_PATTERNS);

      const useCaseCount = await getCount("kg_use_cases");
      expect(useCaseCount).toBeGreaterThan(10);

      const resourceCount = await getCount("kg_resources");
      expect(resourceCount).toBeGreaterThan(10);

      const fieldCount = await getCount("kg_fields");
      expect(fieldCount).toBeGreaterThan(40);
    },
    60_000, // 60s timeout for full sync
  );

  // ── Test 2: Verify sync status rows are written correctly ────────────────

  it.skipIf(!HAS_DB)(
    "sync status rows have truthful metadata after full sync",
    async () => {
      const statusRows = await getSyncStatusRows();

      // Should have exactly 4 layers
      expect(statusRows.length).toBe(4);

      const expectedLayers = ["api_ontology", "error_graph", "operational_semantics", "schema_lineage"];
      const actualLayers = statusRows.map((r: any) => r.layer).sort();
      expect(actualLayers).toEqual(expectedLayers);

      for (const row of statusRows) {
        // Each layer should be completed
        expect(row.status).toBe("completed");

        // Entity count should be positive
        expect(row.entity_count).toBeGreaterThan(0);

        // Duration should be positive (real timing, not fake)
        expect(row.duration_ms).toBeGreaterThan(0);

        // No error message on success
        expect(row.error_message).toBeNull();

        // Spec version should be set
        expect(row.spec_version).toBeTruthy();
        expect(row.spec_version).toMatch(/^\d+\.\d+/); // e.g. "4.14.3"
      }
    },
  );

  // ── Test 3: Rerun stability — no duplicate growth ────────────────────────

  it.skipIf(!HAS_DB)(
    "running full sync twice produces identical row counts (no growth)",
    async () => {
      // Capture counts after first sync (from test 1)
      const countsBefore: Record<string, number> = {};
      for (const table of CORE_DATA_TABLES) {
        countsBefore[table] = await getCount(table);
      }

      // Run sync again
      const { runFullSync } = await import("./etlService");
      const result = await runFullSync();
      expect(result.success).toBe(true);

      // Verify counts are identical (truncate-and-reload, not append)
      for (const table of CORE_DATA_TABLES) {
        const countAfter = await getCount(table);
        expect(countAfter).toBe(countsBefore[table]);
      }
    },
    60_000,
  );

  // ── Test 4: Failure path — invalid layer name ────────────────────────────

  it.skipIf(!HAS_DB)(
    "syncLayer with invalid layer name returns error (does not crash)",
    async () => {
      const { syncLayer } = await import("./etlService");
      const result = await syncLayer("nonexistent_layer");

      expect(result.success).toBe(false);
      expect(result.message).toContain("Invalid layer");
      expect(result.message).toContain("nonexistent_layer");
    },
  );

  // ── Test 5: Per-layer sync works independently ───────────────────────────

  it.skipIf(!HAS_DB)(
    "syncLayer('error_graph') reloads only the error_graph layer",
    async () => {
      // Capture endpoint count before (should not change)
      const endpointsBefore = await getCount("kg_endpoints");

      // Sync only error_graph
      const { syncLayer } = await import("./etlService");
      const result = await syncLayer("error_graph");

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
      expect(result.result!.layer).toBe("error_graph");
      expect(result.result!.status).toBe("completed");
      expect(result.result!.entityCount).toBe(EXPECTED_ERROR_PATTERNS);
      expect(result.result!.durationMs).toBeGreaterThan(0);

      // Endpoints should be untouched
      const endpointsAfter = await getCount("kg_endpoints");
      expect(endpointsAfter).toBe(endpointsBefore);

      // Error patterns should still be correct
      const errorCount = await getCount("kg_error_patterns");
      expect(errorCount).toBe(EXPECTED_ERROR_PATTERNS);
    },
  );

  // ── Test 6: Sync status reflects per-layer sync ──────────────────────────

  it.skipIf(!HAS_DB)(
    "sync status for error_graph is updated after per-layer sync",
    async () => {
      const [rows] = await conn.execute(
        "SELECT status, entity_count, duration_ms, spec_version FROM kg_sync_status WHERE layer = 'error_graph'"
      );
      expect((rows as any).length).toBe(1);
      const row = (rows as any)[0];
      expect(row.status).toBe("completed");
      expect(row.entity_count).toBe(EXPECTED_ERROR_PATTERNS);
      expect(row.duration_ms).toBeGreaterThan(0);
      expect(row.spec_version).toBeTruthy();
    },
  );
});

describe("ETL Integration — Metadata Contract Verification", () => {
  /**
   * Metadata contract (what runFullSync actually returns):
   *   - success: boolean
   *   - specVersion: string (from spec info.version, e.g. "4.14.3")
   *   - totalRecords: number (sum of entity counts across all layers)
   *   - durationMs: number (wall-clock time for the full rebuild)
   *   - layers: Record<KgLayerName, KgSyncLayerResult>
   *     Each layer: { layer, status, entityCount, durationMs, errorMessage }
   *
   * NOT returned: specHash, row-level diffs, incremental change sets.
   * The sync is always a full truncate-and-reload.
   */

  it.skipIf(!HAS_DB)(
    "runFullSync result contains per-layer metadata with entity counts and timing",
    async () => {
      const { runFullSync } = await import("./etlService");
      const result = await runFullSync();

      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();

      const r = result.result!;

      // Top-level metadata
      expect(r.specVersion).toBeTruthy();
      expect(r.totalRecords).toBeGreaterThan(1000);
      expect(r.durationMs).toBeGreaterThan(0);
      expect(r.success).toBe(true);

      // Per-layer metadata
      const layerNames = ["api_ontology", "operational_semantics", "schema_lineage", "error_graph"] as const;
      for (const name of layerNames) {
        const layer = r.layers[name];
        expect(layer).toBeDefined();
        expect(layer.layer).toBe(name);
        expect(layer.status).toBe("completed");
        expect(layer.entityCount).toBeGreaterThan(0);
        expect(layer.durationMs).toBeGreaterThan(0);
        expect(layer.errorMessage).toBeNull();
      }

      // api_ontology should have the most entities (endpoints + params + responses + auth + resources)
      expect(r.layers.api_ontology.entityCount).toBeGreaterThan(1000);

      // error_graph should have exactly 9 error patterns
      expect(r.layers.error_graph.entityCount).toBe(EXPECTED_ERROR_PATTERNS);

      // schema_lineage should have indices + fields
      expect(r.layers.schema_lineage.entityCount).toBeGreaterThan(50);
    },
    60_000,
  );

  it.skipIf(!HAS_DB)(
    "message string contains spec version and layer summary",
    async () => {
      const { runFullSync } = await import("./etlService");
      const result = await runFullSync();

      expect(result.message).toContain("Spec:");
      expect(result.message).toContain("api_ontology:");
      expect(result.message).toContain("operational_semantics:");
      expect(result.message).toContain("schema_lineage:");
      expect(result.message).toContain("error_graph:");
      expect(result.message).toContain("entities");
      expect(result.message).toMatch(/\d+ms/); // timing in message
    },
    60_000,
  );
});
