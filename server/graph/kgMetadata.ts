/**
 * kgMetadata.ts — Sync status query helpers for the graph router.
 *
 * Provides truthful sync metadata by querying kg_sync_status directly.
 * No fabricated timestamps, no hardcoded entity counts.
 *
 * Schema alignment (kg_sync_status):
 *   layer         → varchar(64) unique
 *   entity_count  → int
 *   last_sync_at  → timestamp (NOT "last_sync")
 *   status        → enum("idle","syncing","completed","error")
 *   error_message → text
 *   duration_ms   → int
 *   spec_version  → varchar(32)
 *   updated_at    → timestamp
 */

import type { KgLayerName } from "./kgTypes";
import { getLayerNames } from "./kgLoader";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw mysql2 result shapes vary
type SqlResult = any;

export interface SqlExecutor {
  execute(sql: string, params?: unknown[]): Promise<SqlResult>;
}

export interface KgSyncStatusRow {
  layer: KgLayerName;
  status: string;
  entity_count: number;
  error_message: string | null;
  last_sync_at: Date | string | null;
  duration_ms: number | null;
  spec_version: string | null;
}

export interface KgSyncOverview {
  layers: Array<{
    layer: KgLayerName;
    status: string;
    entityCount: number;
    errorMessage: string | null;
    lastSync: string | null;
    durationMs: number | null;
    specVersion: string | null;
  }>;
  totalEntities: number;
  allSynced: boolean;
  lastFullSync: string | null;
}

/**
 * Query the current sync status of all KG layers.
 * Returns truthful data from the database — no fabrication.
 */
export async function getSyncOverview(exec: SqlExecutor): Promise<KgSyncOverview> {
  const result = await exec.execute(
    "SELECT `layer`, `status`, `entity_count`, `error_message`, `last_sync_at`, `duration_ms`, `spec_version` FROM `kg_sync_status` ORDER BY `layer`",
  );

  // Handle both mysql2 [rows, fields] and Drizzle { rows } shapes
  const rows: KgSyncStatusRow[] = Array.isArray(result) && Array.isArray(result[0])
    ? result[0]
    : Array.isArray(result)
      ? result
      : result?.rows || [];

  const layerNames = getLayerNames();
  let totalEntities = 0;
  let allSynced = true;
  let latestSync: string | null = null;

  const layers = layerNames.map(name => {
    const row = rows.find(r => r.layer === name);
    if (!row) {
      allSynced = false;
      return {
        layer: name,
        status: "idle",
        entityCount: 0,
        errorMessage: null,
        lastSync: null,
        durationMs: null,
        specVersion: null,
      };
    }

    totalEntities += row.entity_count || 0;
    if (row.status !== "completed") allSynced = false;

    const lastSync = row.last_sync_at
      ? (row.last_sync_at instanceof Date ? row.last_sync_at : new Date(row.last_sync_at))
      : null;

    const lastSyncIso = lastSync ? lastSync.toISOString() : null;
    if (lastSync && (!latestSync || lastSyncIso! > latestSync)) {
      latestSync = lastSyncIso;
    }

    return {
      layer: name,
      status: row.status,
      entityCount: row.entity_count || 0,
      errorMessage: row.error_message,
      lastSync: lastSyncIso,
      durationMs: row.duration_ms,
      specVersion: row.spec_version,
    };
  });

  return {
    layers,
    totalEntities,
    allSynced,
    lastFullSync: latestSync,
  };
}
