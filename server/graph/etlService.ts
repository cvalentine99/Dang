/**
 * KG ETL Service — Knowledge Graph Extraction Pipeline
 *
 * The KG is populated from the Wazuh OpenAPI specification, not from
 * live agent data. The ETL pipeline re-extracts from the spec and updates
 * the database tables. This is a deterministic, reproducible process.
 *
 * Runtime sync flow:
 *   1. Read the canonical spec YAML from disk
 *   2. Call kgExtractor.extract() to produce a KgExtractionResult
 *   3. Call kgLoader.loadAll() or kgLoader.loadLayer() to truncate-and-reload
 *   4. kgLoader updates kg_sync_status with truthful metadata per layer
 *
 * Canonical spec path: spec-v4.14.3.yaml at the project root.
 * Both seed-kg.mjs (CLI) and this runtime service use the same file.
 * The spec/wazuh-api-v4.14.3.yaml is a symlink to the canonical copy.
 *
 * Metadata contract:
 *   runFullSync() returns KgLoadResult with:
 *     - success: boolean
 *     - specVersion: string (from spec info.version)
 *     - totalRecords: number (sum of all entity counts)
 *     - durationMs: number (wall-clock time for the full rebuild)
 *     - layers: Record<KgLayerName, KgSyncLayerResult>
 *       Each layer has: layer, status, entityCount, durationMs, errorMessage
 *
 *   It does NOT return: specHash, row-level diffs, or incremental change sets.
 *   The sync is always a full truncate-and-reload, not incremental.
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { getDb } from "../db";
import { kgSyncStatus } from "../../drizzle/schema";
import { extract } from "./kgExtractor";
import { loadAll, loadLayer, getLayerNames } from "./kgLoader";
import type { KgExtractionResult, KgLayerName, KgLoadResult, KgSyncLayerResult } from "./kgTypes";
import type { SqlExecutor } from "./kgLoader";

// ── Canonical spec path ────────────────────────────────────────────────────
// Single source of truth: spec-v4.14.3.yaml at the project root.
// In Docker, the Dockerfile copies it to the same relative path.

function getSpecPath(): string {
  const projectRoot = resolve(__dirname, "../..");
  return resolve(projectRoot, "spec-v4.14.3.yaml");
}

// ── Drizzle → mysql2 pool adapter ────────────────────────────────────────
// kgLoader expects a SqlExecutor: { execute(sql, params?) → Promise<SqlResult> }
// Drizzle's db.execute() uses tagged template literals, not (sql, params).
//
// The Drizzle mysql2 adapter stores the underlying pool at:
//   db.session.client.pool  (callback-based mysql2 Pool)
//
// We call .promise() on it to get the promise-based PromisePool,
// which has .execute(sql, params) returning [rows, fields].

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle internals are opaque
function getPromisePool(db: any): any | null {
  // Path: db.session.client.pool.promise()
  // db.session.client is a PromisePoolConnection wrapper with a .pool property
  // .pool is the raw callback-based Pool, .pool.promise() gives PromisePool
  const client = db?.session?.client;
  if (!client) return null;

  // If client has a pool property with a promise() method, use that
  if (client.pool?.promise) {
    return client.pool.promise();
  }

  // Fallback: client itself might be a promise pool
  if (typeof client.execute === "function") {
    return client;
  }

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mysql2 PromisePool is untyped at this layer
function makeSqlExecutor(promisePool: { execute: (...args: unknown[]) => unknown }): SqlExecutor {
  return {
    async execute(query: string, params?: unknown[]): Promise<unknown> {
      if (params && params.length > 0) {
        return promisePool.execute(query, params);
      }
      return promisePool.execute(query);
    },
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Get sync status for all KG layers.
 */
export async function getSyncStatus() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(kgSyncStatus);
}

/**
 * Read and parse the canonical OpenAPI spec.
 * Returns the extraction result or throws on failure.
 */
export function extractFromSpec(specPath?: string): KgExtractionResult {
  const path = specPath ?? getSpecPath();
  const specRaw = readFileSync(path, "utf8");
  const spec = yaml.load(specRaw);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- yaml.load returns unknown
  return extract(spec as Record<string, any>);
}

/**
 * Run a full re-extraction of the KG from the OpenAPI spec.
 * This is a full truncate-and-reload: parse spec → extract → truncate all KG tables → reload.
 *
 * Returns per-layer results with truthful metadata:
 *   - specVersion (from spec info.version, e.g. "4.14.3")
 *   - totalRecords (sum of entity counts across all layers)
 *   - durationMs (wall-clock time for the full rebuild)
 *   - per-layer: status, entityCount, durationMs, errorMessage
 *
 * Does NOT return: specHash, row-level diffs, or incremental change sets.
 */
export async function runFullSync(): Promise<{
  success: boolean;
  message: string;
  result?: KgLoadResult;
}> {
  const db = await getDb();
  if (!db) return { success: false, message: "Database unavailable" };

  try {
    // Step 1: Read and parse spec
    const specPath = getSpecPath();
    const data = extractFromSpec(specPath);

    // Step 2: Get a promise-based mysql2 pool from Drizzle
    const promisePool = getPromisePool(db);
    if (!promisePool) {
      return { success: false, message: "Cannot access mysql2 pool from Drizzle. Check Drizzle version compatibility." };
    }

    const exec = makeSqlExecutor(promisePool);

    // Step 3: Load all layers (truncate + insert)
    const result = await loadAll(exec, data);

    const layerSummary = getLayerNames()
      .map(name => {
        const lr = result.layers[name];
        return `${name}: ${lr.status} (${lr.entityCount} entities, ${lr.durationMs}ms)`;
      })
      .join("; ");

    return {
      success: result.success,
      message: result.success
        ? `KG sync completed. ${result.totalRecords} total records across 4 layers in ${result.durationMs}ms. Spec: ${result.specVersion}. [${layerSummary}]`
        : `KG sync partially failed. ${layerSummary}`,
      result,
    };
  } catch (error: unknown) {
    return { success: false, message: `Sync failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Sync a single KG layer.
 * Re-extracts from spec and reloads only the specified layer.
 *
 * Returns the layer result with: layer, status, entityCount, durationMs, errorMessage.
 */
export async function syncLayer(layerName: string): Promise<{
  success: boolean;
  message: string;
  result?: KgSyncLayerResult;
}> {
  const db = await getDb();
  if (!db) return { success: false, message: "Database unavailable" };

  const validLayers = getLayerNames();
  if (!validLayers.includes(layerName as KgLayerName)) {
    return { success: false, message: `Invalid layer: ${layerName}. Valid: ${validLayers.join(", ")}` };
  }

  try {
    // Step 1: Read and parse spec
    const data = extractFromSpec();

    // Step 2: Get promise-based mysql2 pool from Drizzle
    const promisePool = getPromisePool(db);
    if (!promisePool) {
      return { success: false, message: "Cannot access mysql2 pool from Drizzle. Check Drizzle version compatibility." };
    }

    const exec = makeSqlExecutor(promisePool);

    // Step 3: Load single layer
    const result = await loadLayer(exec, data, layerName as KgLayerName);

    return {
      success: result.status === "completed",
      message: result.status === "completed"
        ? `Layer "${layerName}" synced: ${result.entityCount} entities in ${result.durationMs}ms.`
        : `Layer "${layerName}" failed: ${result.errorMessage}`,
      result,
    };
  } catch (error: unknown) {
    return { success: false, message: `Sync failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}
