/**
 * kgLoader.ts — Database loading logic for the KG ETL pipeline.
 *
 * Takes a KgExtractionResult and loads it into the database.
 * Handles the auto-increment ID mapping (kg_endpoints.id → kg_parameters.endpoint_id)
 * and matches the actual Drizzle schema column names exactly.
 *
 * Both seed-kg.mjs (CLI) and etlService.ts (runtime) call loadAll().
 *
 * Schema alignment notes:
 *   kg_endpoints.endpoint_id  → varchar(128) string like "GET:/agents"
 *   kg_endpoints.id           → int auto-increment (PK)
 *   kg_parameters.endpoint_id → int FK referencing kg_endpoints.id (NOT the string)
 *   kg_responses.endpoint_id  → int FK referencing kg_endpoints.id (NOT the string)
 *   kg_use_cases.endpoint_ids → json column storing string[] (e.g. ["GET:/agents"])
 *   kg_sync_status.layer      → varchar(64) unique
 *   kg_sync_status.last_sync_at → timestamp
 *   kg_sync_status.duration_ms  → int
 *   kg_sync_status.spec_version → varchar(32)
 */

import type {
  KgExtractionResult,
  KgLayerName,
  KgLoadResult,
  KgSyncLayerResult,
} from "./kgTypes";

/**
 * A minimal SQL executor interface.
 * Both mysql2 pool.execute() and Drizzle db.execute() satisfy this.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw mysql2 result shapes vary
type SqlResult = any;

export interface SqlExecutor {
  execute(sql: string, params?: unknown[]): Promise<SqlResult>;
}

// ── Layer definitions ───────────────────────────────────────────────────────

interface LayerDef {
  name: KgLayerName;
  tables: string[];
  loadFn: (data: KgExtractionResult, exec: SqlExecutor) => Promise<number>;
}

// ── Batch insert helper ─────────────────────────────────────────────────────

async function batchInsert(
  exec: SqlExecutor,
  table: string,
  columns: string[],
  rows: unknown[][],  // eslint-disable-line @typescript-eslint/no-explicit-any
  batchSize = 100,
): Promise<number> {
  if (rows.length === 0) return 0;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const placeholders = batch
      .map(() => `(${columns.map(() => "?").join(", ")})`)
      .join(", ");
    const sql = `INSERT INTO \`${table}\` (${columns.map(c => `\`${c}\``).join(", ")}) VALUES ${placeholders}`;
    const flatValues = batch.flat();
    await exec.execute(sql, flatValues);
    inserted += batch.length;
  }

  return inserted;
}

/**
 * Insert endpoints one-by-one and return a map of string endpoint_id → auto-increment id.
 * This is needed because kg_parameters and kg_responses reference the auto-increment id,
 * not the string endpoint_id.
 */
async function insertEndpointsWithIdMap(
  data: KgExtractionResult,
  exec: SqlExecutor,
): Promise<{ count: number; idMap: Map<string, number> }> {
  const idMap = new Map<string, number>();
  let count = 0;

  for (const ep of data.endpoints) {
    const result = await exec.execute(
      `INSERT INTO \`kg_endpoints\` (\`endpoint_id\`, \`path\`, \`method\`, \`summary\`, \`description\`, \`tags\`, \`operation_id\`, \`resource\`, \`operation_type\`, \`risk_level\`, \`allowed_for_llm\`, \`auth_method\`, \`trust_score\`, \`deprecated\`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ep.endpoint_id, ep.path, ep.method, ep.summary, ep.description,
        ep.tags, // already JSON-stringified string — MySQL json column accepts this
        ep.operation_id, ep.resource, ep.operation_type, ep.risk_level,
        ep.allowed_for_llm, ep.auth_method, ep.trust_score, ep.deprecated,
      ],
    );

    // Extract auto-increment id from result
    // mysql2: result[0].insertId  |  Drizzle: result.insertId or result[0]?.insertId
    const insertId = Array.isArray(result)
      ? result[0]?.insertId
      : result?.insertId ?? result?.[0]?.insertId;

    if (insertId) {
      idMap.set(ep.endpoint_id, Number(insertId));
    }
    count++;
  }

  return { count, idMap };
}

// ── Layer 1: API Ontology ───────────────────────────────────────────────────

async function loadApiOntology(data: KgExtractionResult, exec: SqlExecutor): Promise<number> {
  let count = 0;

  // Endpoints — insert one-by-one to capture auto-increment IDs
  const { count: epCount, idMap } = await insertEndpointsWithIdMap(data, exec);
  count += epCount;

  // Parameters — map string endpoint_id to auto-increment int id
  const paramRows = data.parameters
    .filter(p => idMap.has(p.endpoint_id))
    .map(p => [
      idMap.get(p.endpoint_id)!, // int FK
      p.name, p.location, p.required, p.param_type, p.description,
    ]);
  count += await batchInsert(exec, "kg_parameters", [
    "endpoint_id", "name", "location", "required", "param_type", "description",
  ], paramRows);

  // Responses — same int FK mapping
  const respRows = data.responses
    .filter(r => idMap.has(r.endpoint_id))
    .map(r => [
      idMap.get(r.endpoint_id)!, // int FK
      r.http_status, r.description,
    ]);
  count += await batchInsert(exec, "kg_responses", [
    "endpoint_id", "http_status", "description",
  ], respRows);

  // Auth methods
  const authRows = data.authMethods.map(a => [
    a.auth_id, a.auth_type, a.description, a.ttl_seconds,
  ]);
  count += await batchInsert(exec, "kg_auth_methods", [
    "auth_id", "auth_type", "description", "ttl_seconds",
  ], authRows);

  // Resources
  const resRows = data.resources.map(r => [r.name, r.endpoint_count]);
  count += await batchInsert(exec, "kg_resources", [
    "name", "endpoint_count",
  ], resRows);

  return count;
}

// ── Layer 2: Operational Semantics ──────────────────────────────────────────

async function loadOperationalSemantics(data: KgExtractionResult, exec: SqlExecutor): Promise<number> {
  let count = 0;

  // Use cases — endpoint_ids stored as JSON string[] in a single column
  // No separate join table — the schema uses json("endpoint_ids")
  for (const uc of data.useCases) {
    await exec.execute(
      "INSERT INTO `kg_use_cases` (`intent`, `semantic_type`, `domain`, `description`, `endpoint_ids`) VALUES (?, ?, ?, ?, ?)",
      [uc.intent, uc.semantic_type, uc.domain, uc.description, JSON.stringify(uc.endpoint_ids)],
    );
    count++;
  }

  return count;
}

// ── Layer 3: Schema Lineage ─────────────────────────────────────────────────

async function loadSchemaLineage(data: KgExtractionResult, exec: SqlExecutor): Promise<number> {
  let count = 0;

  // Indices — insert one-by-one to capture auto-increment IDs for field FK mapping
  const indexIdMap = new Map<number, number>(); // 1-based array index → auto-increment id
  for (let i = 0; i < data.indices.length; i++) {
    const idx = data.indices[i];
    const result = await exec.execute(
      "INSERT INTO `kg_indices` (`pattern`, `description`) VALUES (?, ?)",
      [idx.pattern, idx.description],
    );
    const insertId = Array.isArray(result)
      ? result[0]?.insertId
      : result?.insertId ?? result?.[0]?.insertId;
    if (insertId) {
      indexIdMap.set(i + 1, Number(insertId)); // 1-based
    }
    count++;
  }

  // Fields — map 1-based index_id to actual auto-increment id
  const fieldRows = data.fields
    .filter(f => indexIdMap.has(f.index_id))
    .map(f => [
      indexIdMap.get(f.index_id)!, // int FK
      f.field_name, f.field_type, f.description,
    ]);
  count += await batchInsert(exec, "kg_fields", [
    "index_id", "field_name", "field_type", "description",
  ], fieldRows);

  return count;
}

// ── Layer 4: Error Graph ────────────────────────────────────────────────────

async function loadErrorGraph(data: KgExtractionResult, exec: SqlExecutor): Promise<number> {
  const rows = data.errorPatterns.map(e => [
    e.http_status, e.description, e.cause, e.mitigation,
  ]);
  return batchInsert(exec, "kg_error_patterns", [
    "http_status", "description", "cause", "mitigation",
  ], rows);
}

// ── Layer registry ──────────────────────────────────────────────────────────

const LAYERS: LayerDef[] = [
  {
    name: "api_ontology",
    tables: ["kg_endpoints", "kg_parameters", "kg_responses", "kg_auth_methods", "kg_resources"],
    loadFn: loadApiOntology,
  },
  {
    name: "operational_semantics",
    tables: ["kg_use_cases"],
    loadFn: loadOperationalSemantics,
  },
  {
    name: "schema_lineage",
    tables: ["kg_indices", "kg_fields"],
    loadFn: loadSchemaLineage,
  },
  {
    name: "error_graph",
    tables: ["kg_error_patterns"],
    loadFn: loadErrorGraph,
  },
];

/** Get the canonical layer names. */
export function getLayerNames(): KgLayerName[] {
  return LAYERS.map(l => l.name);
}

/** Get the tables associated with a layer. */
export function getLayerTables(layerName: KgLayerName): string[] {
  const layer = LAYERS.find(l => l.name === layerName);
  return layer ? layer.tables : [];
}

// ── Truncate helpers ────────────────────────────────────────────────────────

async function truncateLayer(exec: SqlExecutor, layerName: KgLayerName): Promise<void> {
  const tables = getLayerTables(layerName);
  // Reverse order to handle FK constraints (children first)
  for (const table of [...tables].reverse()) {
    await exec.execute(`DELETE FROM \`${table}\``);
  }
}

// ── Update sync status ──────────────────────────────────────────────────────
// Column names match the actual Drizzle schema:
//   layer, entity_count, last_sync_at, status, error_message, duration_ms, spec_version

async function updateSyncStatus(
  exec: SqlExecutor,
  result: KgSyncLayerResult,
  specVersion?: string,
): Promise<void> {
  // Upsert: try update first, insert if no rows affected
  const updateResult = await exec.execute(
    `UPDATE \`kg_sync_status\` SET \`status\` = ?, \`entity_count\` = ?, \`error_message\` = ?, \`duration_ms\` = ?, \`spec_version\` = COALESCE(?, \`spec_version\`), \`last_sync_at\` = UTC_TIMESTAMP() WHERE \`layer\` = ?`,
    [result.status, result.entityCount, result.errorMessage, result.durationMs, specVersion ?? null, result.layer],
  );

  // Check if update affected any rows — handle both mysql2 and Drizzle result shapes
  const affectedRows = Array.isArray(updateResult)
    ? updateResult[0]?.affectedRows ?? 0
    : updateResult?.affectedRows ?? updateResult?.rowsAffected ?? 0;

  if (affectedRows === 0) {
    await exec.execute(
      `INSERT INTO \`kg_sync_status\` (\`layer\`, \`status\`, \`entity_count\`, \`error_message\`, \`duration_ms\`, \`spec_version\`, \`last_sync_at\`) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [result.layer, result.status, result.entityCount, result.errorMessage, result.durationMs, specVersion ?? null],
    );
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Load a single layer from extraction data into the database.
 * Truncates the layer's tables first, then inserts fresh data.
 */
export async function loadLayer(
  exec: SqlExecutor,
  data: KgExtractionResult,
  layerName: KgLayerName,
): Promise<KgSyncLayerResult> {
  const layer = LAYERS.find(l => l.name === layerName);
  if (!layer) {
    return {
      layer: layerName,
      entityCount: 0,
      status: "error",
      errorMessage: `Unknown layer: ${layerName}`,
      durationMs: 0,
    };
  }

  const start = Date.now();
  try {
    await updateSyncStatus(exec, {
      layer: layerName,
      entityCount: 0,
      status: "syncing",
      errorMessage: null,
      durationMs: null,
    }, data.specVersion);

    await truncateLayer(exec, layerName);
    const entityCount = await layer.loadFn(data, exec);
    const durationMs = Date.now() - start;

    const result: KgSyncLayerResult = {
      layer: layerName,
      entityCount,
      status: "completed",
      errorMessage: null,
      durationMs,
    };
    await updateSyncStatus(exec, result, data.specVersion);
    return result;
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const result: KgSyncLayerResult = {
      layer: layerName,
      entityCount: 0,
      status: "error",
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs,
    };
    await updateSyncStatus(exec, result, data.specVersion);
    return result;
  }
}

/**
 * Full rebuild: truncate all KG tables and reload from extraction data.
 * Returns a KgLoadResult with per-layer results and overall stats.
 */
export async function loadAll(
  exec: SqlExecutor,
  data: KgExtractionResult,
): Promise<KgLoadResult> {
  const start = Date.now();
  const layers: Record<string, KgSyncLayerResult> = {};
  let totalRecords = 0;
  let allSuccess = true;

  for (const layerDef of LAYERS) {
    const result = await loadLayer(exec, data, layerDef.name);
    layers[layerDef.name] = result;
    totalRecords += result.entityCount;
    if (result.status === "error") allSuccess = false;
  }

  return {
    success: allSuccess,
    totalRecords,
    layers: layers as Record<KgLayerName, KgSyncLayerResult>,
    specVersion: data.specVersion,
    durationMs: Date.now() - start,
  };
}
