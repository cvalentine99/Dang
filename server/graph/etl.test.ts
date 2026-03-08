/**
 * ETL Pipeline Tests — KG ETL Recovery Sprint
 *
 * Tests the shared ETL library (kgExtractor, kgLoader, kgTypes, etlService)
 * without requiring a live database. These are unit/integration tests that
 * validate:
 *
 *   1. Extraction determinism (same spec → same output, twice)
 *   2. Schema alignment (sync-status columns match what kgLoader writes)
 *   3. Failure paths (missing spec, invalid spec → error status)
 *   4. Layer name consistency (kgTypes, kgLoader, graphQueryService, graphRouter)
 *   5. Type correctness (kgUseCases.endpointIds is string[], not number[])
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import yaml from "js-yaml";

// ── Spec path ──────────────────────────────────────────────────────────────

const SPEC_PATH = resolve(__dirname, "../../spec-v4.14.3.yaml");
const SPEC_EXISTS = existsSync(SPEC_PATH);

// ── 1. Extraction Determinism ──────────────────────────────────────────────

describe("ETL — Extraction Determinism", () => {
  it.skipIf(!SPEC_EXISTS)("extract() produces identical output on two runs", async () => {
    const { extract } = await import("./kgExtractor");
    const specRaw = readFileSync(SPEC_PATH, "utf8");
    const spec = yaml.load(specRaw);

    const result1 = extract(spec);
    const result2 = extract(spec);

    // Same counts
    expect(result1.endpoints.length).toBe(result2.endpoints.length);
    expect(result1.parameters.length).toBe(result2.parameters.length);
    expect(result1.responses.length).toBe(result2.responses.length);
    expect(result1.authMethods.length).toBe(result2.authMethods.length);
    expect(result1.resources.length).toBe(result2.resources.length);
    expect(result1.useCases.length).toBe(result2.useCases.length);
    expect(result1.indices.length).toBe(result2.indices.length);
    expect(result1.fields.length).toBe(result2.fields.length);
    expect(result1.errorPatterns.length).toBe(result2.errorPatterns.length);

    // Same specVersion
    expect(result1.specVersion).toBe(result2.specVersion);
    expect(result1.specTitle).toBe(result2.specTitle);

    // Deep equality on full result
    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
  });

  it.skipIf(!SPEC_EXISTS)("extract() produces non-empty results from the spec", async () => {
    const { extract } = await import("./kgExtractor");
    const specRaw = readFileSync(SPEC_PATH, "utf8");
    const spec = yaml.load(specRaw);
    const result = extract(spec);

    expect(result.endpoints.length).toBeGreaterThan(100);
    expect(result.parameters.length).toBeGreaterThan(500);
    expect(result.responses.length).toBeGreaterThan(500);
    expect(result.authMethods.length).toBe(2);
    expect(result.resources.length).toBeGreaterThan(10);
    expect(result.useCases.length).toBeGreaterThan(10);
    expect(result.indices.length).toBe(5);
    expect(result.fields.length).toBeGreaterThan(40);
    expect(result.errorPatterns.length).toBe(9);
    expect(result.specVersion).toBeTruthy();
  });

  it.skipIf(!SPEC_EXISTS)("every endpoint has a valid endpoint_id format", async () => {
    const { extract } = await import("./kgExtractor");
    const specRaw = readFileSync(SPEC_PATH, "utf8");
    const spec = yaml.load(specRaw);
    const result = extract(spec);

    for (const ep of result.endpoints) {
      // endpoint_id should be "METHOD:/path"
      expect(ep.endpoint_id).toMatch(/^(GET|POST|PUT|DELETE|PATCH):\//);
      expect(ep.method).toMatch(/^(GET|POST|PUT|DELETE|PATCH)$/);
      expect(ep.path).toMatch(/^\//);
      expect(["SAFE", "MUTATING", "DESTRUCTIVE"]).toContain(ep.risk_level);
      expect(["READ", "CREATE", "UPDATE", "DELETE"]).toContain(ep.operation_type);
      expect([0, 1]).toContain(ep.allowed_for_llm);
      expect([0, 1]).toContain(ep.deprecated);
    }
  });
});

// ── 2. Repeatability (no duplicate growth) ─────────────────────────────────

describe("ETL — Repeatability", () => {
  it.skipIf(!SPEC_EXISTS)("two extractions produce identical endpoint_id sets (no duplicates)", async () => {
    const { extract } = await import("./kgExtractor");
    const specRaw = readFileSync(SPEC_PATH, "utf8");
    const spec = yaml.load(specRaw);

    const result = extract(spec);
    const endpointIds = result.endpoints.map(e => e.endpoint_id);
    const uniqueIds = new Set(endpointIds);

    // No duplicate endpoint_ids within a single extraction
    expect(endpointIds.length).toBe(uniqueIds.size);
  });

  it.skipIf(!SPEC_EXISTS)("parameter count is stable across extractions", async () => {
    const { extract } = await import("./kgExtractor");
    const specRaw = readFileSync(SPEC_PATH, "utf8");
    const spec = yaml.load(specRaw);

    const r1 = extract(spec);
    const r2 = extract(spec);

    expect(r1.parameters.length).toBe(r2.parameters.length);
    // Verify no duplicate params within a single extraction for the same endpoint
    const paramKeys = r1.parameters.map(p => `${p.endpoint_id}::${p.name}::${p.location}`);
    const uniqueParamKeys = new Set(paramKeys);
    expect(paramKeys.length).toBe(uniqueParamKeys.size);
  });
});

// ── 3. Failure Paths ───────────────────────────────────────────────────────

describe("ETL — Failure Paths", () => {
  it("extract() with empty spec returns empty arrays", async () => {
    const { extract } = await import("./kgExtractor");
    const result = extract({});

    expect(result.endpoints).toHaveLength(0);
    expect(result.parameters).toHaveLength(0);
    expect(result.responses).toHaveLength(0);
    // Static data is always present
    expect(result.authMethods.length).toBe(2);
    expect(result.useCases.length).toBeGreaterThan(0);
    expect(result.indices.length).toBe(5);
    expect(result.fields.length).toBeGreaterThan(0);
    expect(result.errorPatterns.length).toBe(9);
    // Version defaults
    expect(result.specVersion).toBe("unknown");
    expect(result.specTitle).toBe("Wazuh API");
  });

  it("extract() with spec that has no paths returns empty endpoints", async () => {
    const { extract } = await import("./kgExtractor");
    const result = extract({ info: { title: "Test", version: "1.0" }, paths: {} });

    expect(result.endpoints).toHaveLength(0);
    expect(result.parameters).toHaveLength(0);
    expect(result.responses).toHaveLength(0);
    expect(result.specVersion).toBe("1.0");
    expect(result.specTitle).toBe("Test");
  });

  it("extract() with malformed path entries skips them gracefully", async () => {
    const { extract } = await import("./kgExtractor");
    const result = extract({
      info: { title: "Test", version: "1.0" },
      paths: {
        "/good": {
          get: {
            tags: ["Test"],
            summary: "Good endpoint",
            responses: { "200": { description: "OK" } },
          },
        },
        "/bad": {
          get: "not an object", // malformed
        },
      },
    });

    expect(result.endpoints).toHaveLength(1);
    expect(result.endpoints[0].endpoint_id).toBe("GET:/good");
  });

  it("extractFromSpec() throws on missing spec file", async () => {
    const { extractFromSpec } = await import("./etlService");
    expect(() => extractFromSpec("/nonexistent/path/spec.yaml")).toThrow();
  });
});

// ── 4. Schema Alignment ───────────────────────────────────────────────────

describe("ETL — Schema Alignment", () => {
  it("kgSyncStatus schema has the expected columns", async () => {
    const { kgSyncStatus } = await import("../../drizzle/schema");
    // Verify the schema object has the expected column keys
    const columns = Object.keys(kgSyncStatus);
    // The table should have these columns (as Drizzle camelCase keys)
    expect(columns).toContain("layer");
    expect(columns).toContain("status");
    expect(columns).toContain("entityCount");
    expect(columns).toContain("lastSyncAt");
    expect(columns).toContain("errorMessage");
    expect(columns).toContain("durationMs");
    expect(columns).toContain("specVersion");
  });

  it("kgUseCases.endpointIds is typed as string[] (not number[])", async () => {
    const { kgUseCases } = await import("../../drizzle/schema");
    // The column should exist
    expect(kgUseCases.endpointIds).toBeDefined();
    // We can't directly test the TS type at runtime, but we can verify
    // the column name matches what the loader writes
    const columnConfig = (kgUseCases.endpointIds as any);
    expect(columnConfig.name).toBe("endpoint_ids");
  });

  it("KgLayerName type includes all 4 canonical layers", async () => {
    const { getLayerNames } = await import("./kgLoader");
    const layers = getLayerNames();
    expect(layers).toEqual([
      "api_ontology",
      "operational_semantics",
      "schema_lineage",
      "error_graph",
    ]);
  });

  it("kgLoader layer tables match the expected schema tables", async () => {
    const { getLayerTables } = await import("./kgLoader");

    expect(getLayerTables("api_ontology")).toEqual([
      "kg_endpoints", "kg_parameters", "kg_responses", "kg_auth_methods", "kg_resources",
    ]);
    expect(getLayerTables("operational_semantics")).toEqual(["kg_use_cases"]);
    expect(getLayerTables("schema_lineage")).toEqual(["kg_indices", "kg_fields"]);
    expect(getLayerTables("error_graph")).toEqual(["kg_error_patterns"]);
  });
});

// ── 5. Layer Name Consistency ──────────────────────────────────────────────

describe("ETL — Layer Name Consistency", () => {
  it("graphRouter overviewGraph enum includes all canonical layer names", async () => {
    // We read the source file and check the enum values
    const routerSource = readFileSync(resolve(__dirname, "graphRouter.ts"), "utf8");
    const { getLayerNames } = await import("./kgLoader");
    const layers = getLayerNames();

    for (const layer of layers) {
      expect(routerSource).toContain(`"${layer}"`);
    }
    // Should NOT contain the old error_failure name
    expect(routerSource).not.toContain('"error_failure"');
  });

  it("graphQueryService uses canonical layer names (not error_failure)", async () => {
    const queryServiceSource = readFileSync(resolve(__dirname, "graphQueryService.ts"), "utf8");
    expect(queryServiceSource).not.toContain('"error_failure"');
    expect(queryServiceSource).toContain('"error_graph"');
  });

  it("kgTypes KgLayerName includes error_graph (not error_failure)", async () => {
    const typesSource = readFileSync(resolve(__dirname, "kgTypes.ts"), "utf8");
    expect(typesSource).toContain('"error_graph"');
    expect(typesSource).not.toContain('"error_failure"');
  });

  it("DataPipeline.tsx uses error_graph (not error_failure)", async () => {
    const pipelineSource = readFileSync(resolve(__dirname, "../../client/src/pages/DataPipeline.tsx"), "utf8");
    expect(pipelineSource).not.toContain("error_failure");
    expect(pipelineSource).toContain("error_graph");
  });

  it("GraphToolbar.tsx uses error_graph (not error_failure)", async () => {
    const toolbarSource = readFileSync(resolve(__dirname, "../../client/src/pages/knowledge-graph/GraphToolbar.tsx"), "utf8");
    expect(toolbarSource).not.toContain("error_failure");
    expect(toolbarSource).toContain("error_graph");
  });
});

// ── 6. Use Case Endpoint IDs are Strings ───────────────────────────────────

describe("ETL — Use Case Endpoint IDs", () => {
  it.skipIf(!SPEC_EXISTS)("all use case endpoint_ids are string arrays", async () => {
    const { extract } = await import("./kgExtractor");
    const specRaw = readFileSync(SPEC_PATH, "utf8");
    const spec = yaml.load(specRaw);
    const result = extract(spec);

    for (const uc of result.useCases) {
      expect(Array.isArray(uc.endpoint_ids)).toBe(true);
      for (const id of uc.endpoint_ids) {
        expect(typeof id).toBe("string");
        // Each should be "METHOD:/path" format
        expect(id).toMatch(/^(GET|POST|PUT|DELETE|PATCH):\//);
      }
    }
  });
});

// ── 7. Canonical Spec Source ───────────────────────────────────────────────

describe("ETL — Canonical Spec Source", () => {
  it("spec-v4.14.3.yaml exists at project root", () => {
    expect(SPEC_EXISTS).toBe(true);
  });

  it.skipIf(!SPEC_EXISTS)("spec/wazuh-api-v4.14.3.yaml is identical to root spec (symlink or same content)", () => {
    const { lstatSync } = require("fs");
    const altPath = resolve(__dirname, "../../spec/wazuh-api-v4.14.3.yaml");
    if (!existsSync(altPath)) return; // OK if only one copy exists

    // Prefer symlink (single source of truth)
    const stat = lstatSync(altPath);
    if (stat.isSymbolicLink()) {
      // Good — it's a symlink, no duplicate data
      const { readlinkSync } = require("fs");
      const target = readlinkSync(altPath);
      expect(target).toContain("spec-v4.14.3.yaml");
    } else {
      // Fallback: at least verify content is identical
      const rootSpec = readFileSync(SPEC_PATH, "utf8");
      const altSpec = readFileSync(altPath, "utf8");
      expect(rootSpec).toBe(altSpec);
    }
  });

  it.skipIf(!SPEC_EXISTS)("spec has valid OpenAPI structure", () => {
    const specRaw = readFileSync(SPEC_PATH, "utf8");
    const spec = yaml.load(specRaw) as any;

    expect(spec.info).toBeDefined();
    expect(spec.info.title).toBeTruthy();
    expect(spec.info.version).toBeTruthy();
    expect(spec.paths).toBeDefined();
    expect(Object.keys(spec.paths).length).toBeGreaterThan(50);
  });
});

// ── 7. endpointIds Type Contract ──────────────────────────────────────────

describe("ETL — endpointIds Type Contract", () => {
  it("kg_use_cases stores endpoint PATH strings (string[]), not DB row IDs", async () => {
    const { extract } = await import("./kgExtractor");
    const specRaw = readFileSync(SPEC_PATH, "utf8");
    const spec = yaml.load(specRaw) as any;
    const data = extract(spec);

    // Every use case's endpointIds should be string[]
    for (const uc of data.useCases) {
      expect(Array.isArray(uc.endpoint_ids)).toBe(true);
      for (const id of uc.endpoint_ids) {
        expect(typeof id).toBe("string");
        // Should look like "GET:/agents" or "PUT:/agents/{agent_id}"
        expect(id).toMatch(/^(GET|POST|PUT|DELETE|PATCH):/);
      }
    }
  });

  it("kg_answer_provenance expects DB row IDs (number[]), documented in kgTypes.ts", async () => {
    // This test validates the documentation exists and the type contract is clear.
    // kg_answer_provenance.endpoint_ids stores auto-increment integer IDs from kg_endpoints.id.
    // We verify the Drizzle schema declares number[] for this column.
    const schemaPath = resolve(__dirname, "../../drizzle/schema.ts");
    const schemaContent = readFileSync(schemaPath, "utf8");

    // Find the kgAnswerProvenance table definition
    const provenanceMatch = schemaContent.match(/kgAnswerProvenance[\s\S]*?endpointIds.*?\$type<(.*?)>/);
    expect(provenanceMatch).not.toBeNull();
    expect(provenanceMatch![1]).toBe("number[]");

    // Find the kgUseCases table definition
    const useCaseMatch = schemaContent.match(/kgUseCases[\s\S]*?endpointIds.*?\$type<(.*?)>/);
    expect(useCaseMatch).not.toBeNull();
    expect(useCaseMatch![1]).toBe("string[]");
  });

  it("type contract documentation exists in kgTypes.ts", () => {
    const typesPath = resolve(__dirname, "./kgTypes.ts");
    const typesContent = readFileSync(typesPath, "utf8");

    expect(typesContent).toContain("endpointIds Type Contract");
    expect(typesContent).toContain("kg_use_cases.endpoint_ids: string[]");
    expect(typesContent).toContain("kg_answer_provenance.endpoint_ids: number[]");
    expect(typesContent).toContain("Never assume they're the same type");
  });
});
