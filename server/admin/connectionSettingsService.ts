/**
 * Connection Settings Service — runtime config with DB override + env fallback.
 *
 * Settings are stored in the connection_settings table.
 * Passwords are AES-256-GCM encrypted at rest.
 * When no DB override exists, falls back to environment variables.
 * Caches DB lookups for 30 seconds to avoid hammering the database.
 */

import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { connectionSettings } from "../../drizzle/schema";
import { encrypt, decrypt } from "./encryptionService";
import type { WazuhConfig } from "../wazuh/wazuhClient";
import type { IndexerConfig } from "../indexer/indexerClient";

// ── In-memory cache (30s TTL) ───────────────────────────────────────────────
interface CacheEntry {
  value: Record<string, string>;
  expiresAt: number;
}

const cache: Record<string, CacheEntry> = {};
const CACHE_TTL_MS = 30_000;

function getCached(category: string): Record<string, string> | null {
  const entry = cache[category];
  if (entry && Date.now() < entry.expiresAt) return entry.value;
  delete cache[category];
  return null;
}

function setCache(category: string, value: Record<string, string>): void {
  cache[category] = { value, expiresAt: Date.now() + CACHE_TTL_MS };
}

/** Clear the cache for a category (call after updates) */
export function invalidateCache(category?: string): void {
  if (category) {
    delete cache[category];
  } else {
    for (const key of Object.keys(cache)) delete cache[key];
  }
}

// ── Sensitive keys that should be encrypted ─────────────────────────────────
const SENSITIVE_KEYS = new Set(["pass", "password", "api_key", "hec_token"]);

// ── Environment variable mapping ────────────────────────────────────────────
const ENV_MAP: Record<string, Record<string, string>> = {
  wazuh_manager: {
    host: "WAZUH_HOST",
    port: "WAZUH_PORT",
    user: "WAZUH_USER",
    pass: "WAZUH_PASS",
  },
  wazuh_indexer: {
    host: "WAZUH_INDEXER_HOST",
    port: "WAZUH_INDEXER_PORT",
    user: "WAZUH_INDEXER_USER",
    pass: "WAZUH_INDEXER_PASS",
    protocol: "WAZUH_INDEXER_PROTOCOL",
  },
  llm: {
    host: "LLM_HOST",
    port: "LLM_PORT",
    model: "LLM_MODEL",
    enabled: "LLM_ENABLED",
  },
  splunk: {
    host: "SPLUNK_HOST",
    port: "SPLUNK_PORT",
    hec_token: "SPLUNK_HEC_TOKEN",
    hec_port: "SPLUNK_HEC_PORT",
  },
};

// ── Default values ──────────────────────────────────────────────────────────
const DEFAULTS: Record<string, Record<string, string>> = {
  wazuh_manager: { port: "55000" },
  wazuh_indexer: { port: "9200", protocol: "https" },
  llm: { port: "30000", model: "unsloth/Nemotron-3-Nano-30B-A3B-GGUF", protocol: "http", enabled: "false" },
  splunk: { port: "8000", hec_port: "8088", protocol: "https", enabled: "false" },
};

// ── Core CRUD ───────────────────────────────────────────────────────────────

/**
 * Get all settings for a category from the database.
 * Returns a key→value map with decrypted sensitive values.
 */
async function getDbSettings(category: string): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};

  const rows = await db
    .select()
    .from(connectionSettings)
    .where(eq(connectionSettings.category, category));

  const result: Record<string, string> = {};
  for (const row of rows) {
    try {
      result[row.settingKey] = row.isEncrypted ? decrypt(row.settingValue) : row.settingValue;
    } catch {
      // If decryption fails (e.g. key changed), skip this value
      console.error(`[ConnectionSettings] Failed to decrypt ${category}.${row.settingKey}`);
    }
  }
  return result;
}

/**
 * Get the effective settings for a category (DB override → env fallback → defaults).
 */
export async function getEffectiveSettings(
  category: string
): Promise<{ values: Record<string, string>; sources: Record<string, "database" | "env" | "default"> }> {
  // Check cache first
  const cached = getCached(category);
  const envMap = ENV_MAP[category] ?? {};
  const defaults = DEFAULTS[category] ?? {};

  const dbSettings = cached ?? await getDbSettings(category);
  if (!cached && Object.keys(dbSettings).length > 0) {
    setCache(category, dbSettings);
  }

  const values: Record<string, string> = {};
  const sources: Record<string, "database" | "env" | "default"> = {};

  // For each known key in this category
  const allKeys = Array.from(new Set([
    ...Object.keys(envMap),
    ...Object.keys(dbSettings),
    ...Object.keys(defaults),
  ]));

  for (const key of allKeys) {
    if (dbSettings[key] !== undefined && dbSettings[key] !== "") {
      values[key] = dbSettings[key];
      sources[key] = "database";
    } else if (envMap[key] && process.env[envMap[key]]) {
      values[key] = process.env[envMap[key]]!;
      sources[key] = "env";
    } else if (defaults[key]) {
      values[key] = defaults[key];
      sources[key] = "default";
    }
  }

  return { values, sources };
}

/**
 * Save settings for a category. Encrypts sensitive values.
 */
export async function saveSettings(
  category: string,
  settings: Record<string, string>,
  updatedBy: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined || value === "") continue;

    const isSensitive = SENSITIVE_KEYS.has(key);
    const storedValue = isSensitive ? encrypt(value) : value;

    // Atomic upsert: INSERT ... ON DUPLICATE KEY UPDATE
    // Requires unique index on (category, settingKey)
    await db
      .insert(connectionSettings)
      .values({
        category,
        settingKey: key,
        settingValue: storedValue,
        isEncrypted: isSensitive ? 1 : 0,
        updatedBy,
      })
      .onDuplicateKeyUpdate({
        set: {
          settingValue: storedValue,
          isEncrypted: isSensitive ? 1 : 0,
          updatedBy,
        },
      });
  }

  // Invalidate cache for this category
  invalidateCache(category);
}

/**
 * Delete all DB overrides for a category (revert to env vars).
 */
export async function resetSettings(category: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(connectionSettings)
    .where(eq(connectionSettings.category, category));

  invalidateCache(category);
}

// ── Typed config getters (used by Wazuh/Indexer clients) ────────────────────

/**
 * Get the effective Wazuh Manager config (DB override → env fallback).
 * Returns null if not configured at all.
 */
export async function getEffectiveWazuhConfig(): Promise<WazuhConfig | null> {
  const { values } = await getEffectiveSettings("wazuh_manager");
  
  if (!values.host || !values.user || !values.pass) return null;
  
  return {
    host: values.host,
    port: parseInt(values.port ?? "55000", 10),
    user: values.user,
    pass: values.pass,
  };
}

/**
 * Get the effective Wazuh Indexer config (DB override → env fallback).
 * Returns null if not configured at all.
 */
export async function getEffectiveIndexerConfig(): Promise<IndexerConfig | null> {
  const { values } = await getEffectiveSettings("wazuh_indexer");
  
  if (!values.host || !values.user || !values.pass) return null;
  
  return {
    host: values.host,
    port: parseInt(values.port ?? "9200", 10),
    user: values.user,
    pass: values.pass,
    protocol: (values.protocol ?? "https") as "https" | "http",
  };
}

/**
 * Check if Wazuh Manager is configured (either via DB or env).
 */
export async function isWazuhEffectivelyConfigured(): Promise<boolean> {
  const config = await getEffectiveWazuhConfig();
  return config !== null;
}

/**
 * Check if Wazuh Indexer is configured (either via DB or env).
 */
export async function isIndexerEffectivelyConfigured(): Promise<boolean> {
  const config = await getEffectiveIndexerConfig();
  return config !== null;
}
