/**
 * MITRE ATT&CK technique catalog + threat-identifier validation (review M4).
 *
 * The authoritative catalog is the Wazuh manager's own ATT&CK database
 * (`GET /mitre/techniques`, paginated with `limit`/`offset`), fetched with the
 * low-level authenticated client (`wazuhGet`) — not the tRPC router. It is
 * cached in memory for `MITRE_CATALOG_TTL_MS` (default 24 h); once stale it is
 * still served while a background refresh runs (stale-while-revalidate).
 *
 * When the manager is unreachable and no catalog has ever loaded, validation
 * uses the small bundled allowlist in `mitreFallback.ts` (`source: "fallback"`)
 * and retries the manager no sooner than `MITRE_CATALOG_RETRY_MS` (default 5 min).
 *
 * Sub-technique rule: `T1059.001` is accepted if it is in the catalog, or — if
 * it is not — when its parent `T1059` is. Parent-rule matches are reported in
 * `parentMatched` so callers can note them.
 *
 * Validation is synchronous against whatever catalog is currently loaded; call
 * `ensureMitreCatalog()` first (async) when you can afford to wait for a load.
 */

import { wazuhGet, getEffectiveWazuhConfig } from "../wazuh/wazuhClient";
import { MITRE_FALLBACK_TECHNIQUES } from "./mitreFallback";
import type { MitreMapping } from "../../shared/agenticSchemas";

export type MitreCatalogSource = "manager" | "fallback";

export interface TechniqueValidationResult {
  /** Normalized (trimmed, upper-cased), de-duplicated ids that passed. */
  valid: string[];
  /** Input ids that did not pass (as given, trimmed). */
  unknown: string[];
  /** Sub-technique ids accepted only because their parent is known. */
  parentMatched: string[];
  /** Which catalog the decision was made against. */
  source: MitreCatalogSource;
}

const TECHNIQUE_ID_SHAPE = /^T\d{4}(\.\d{3})?$/;
const PAGE_LIMIT = 500;
const MAX_PAGES = 20; // 10k techniques — ATT&CK Enterprise has ~800 incl. subs
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETRY_MS = 5 * 60 * 1000;

interface CatalogState {
  ids: Map<string, string>; // id → name
  source: MitreCatalogSource;
  loadedAt: number;
}

let managerCatalog: CatalogState | null = null;
let inflight: Promise<void> | null = null;
let lastFailureAt = 0;

const fallbackCatalog: CatalogState = {
  ids: new Map(MITRE_FALLBACK_TECHNIQUES),
  source: "fallback",
  loadedAt: 0,
};

function envMs(name: string, dflt: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return dflt;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}

export function getMitreCatalogTtlMs(): number {
  return envMs("MITRE_CATALOG_TTL_MS", DEFAULT_TTL_MS);
}

function getRetryMs(): number {
  return envMs("MITRE_CATALOG_RETRY_MS", DEFAULT_RETRY_MS);
}

function current(): CatalogState {
  return managerCatalog ?? fallbackCatalog;
}

/** Fetch every technique from the manager. Throws on any failure or empty result. */
async function fetchManagerCatalog(): Promise<Map<string, string>> {
  const config = await getEffectiveWazuhConfig();
  if (!config) throw new Error("Wazuh manager not configured");

  const ids = new Map<string, string>();
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = (await wazuhGet(config, {
      path: "/mitre/techniques",
      params: { limit: PAGE_LIMIT, offset },
      rateLimitGroup: "mitre_catalog",
    })) as { data?: { affected_items?: Array<{ external_id?: unknown; name?: unknown }>; total_affected_items?: number } } | null;

    const items = res?.data?.affected_items ?? [];
    for (const item of items) {
      const id = typeof item.external_id === "string" ? item.external_id.trim().toUpperCase() : "";
      if (TECHNIQUE_ID_SHAPE.test(id)) ids.set(id, typeof item.name === "string" ? item.name : id);
    }
    offset += items.length;
    const total = res?.data?.total_affected_items;
    if (items.length === 0 || (typeof total === "number" && offset >= total)) break;
  }
  if (ids.size === 0) throw new Error("Wazuh /mitre/techniques returned no techniques");
  return ids;
}

function refresh(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const ids = await fetchManagerCatalog();
      managerCatalog = { ids, source: "manager", loadedAt: Date.now() };
      lastFailureAt = 0;
    } catch (err) {
      lastFailureAt = Date.now();
      console.warn(
        `[MitreCatalog] manager catalog fetch failed (${(err as Error)?.message ?? err}); ` +
          (managerCatalog ? "serving stale manager catalog" : `using bundled fallback (${fallbackCatalog.ids.size} ids)`)
      );
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Make sure a catalog is loaded. Never throws.
 * - fresh manager catalog → returns immediately
 * - stale manager catalog → returns immediately, refreshes in the background
 * - none loaded → awaits one fetch (unless a failure is within the retry window),
 *   falling back to the bundled allowlist on failure
 */
export async function ensureMitreCatalog(): Promise<MitreCatalogSource> {
  const now = Date.now();
  const retryAllowed = lastFailureAt === 0 || now - lastFailureAt >= getRetryMs();
  if (managerCatalog) {
    if (now - managerCatalog.loadedAt >= getMitreCatalogTtlMs() && retryAllowed) {
      void refresh();
    }
    return "manager";
  }
  if (retryAllowed) {
    await refresh();
  }
  return current().source;
}

/** Current catalog source without triggering a load. */
export function getMitreCatalogSource(): MitreCatalogSource {
  return current().source;
}

function check(id: string, ids: Map<string, string>): "exact" | "parent" | null {
  if (!TECHNIQUE_ID_SHAPE.test(id)) return null;
  if (ids.has(id)) return "exact";
  const dot = id.indexOf(".");
  if (dot > 0 && ids.has(id.slice(0, dot))) return "parent";
  return null;
}

/** True if `id` is a known technique (or a sub-technique of a known parent). */
export function isKnownTechnique(id: unknown): boolean {
  if (typeof id !== "string") return false;
  return check(id.trim().toUpperCase(), current().ids) !== null;
}

/** Name of a known technique, if the loaded catalog has it. */
export function getTechniqueName(id: string): string | undefined {
  return current().ids.get(id.trim().toUpperCase());
}

export function validateTechniqueIds(ids: readonly unknown[]): TechniqueValidationResult {
  const cat = current();
  const valid: string[] = [];
  const unknown: string[] = [];
  const parentMatched: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const asStr = typeof raw === "string" ? raw.trim() : String(raw);
    const norm = asStr.toUpperCase();
    const hit = typeof raw === "string" ? check(norm, cat.ids) : null;
    if (!hit) {
      unknown.push(asStr.slice(0, 64));
      continue;
    }
    if (seen.has(norm)) continue;
    seen.add(norm);
    valid.push(norm);
    if (hit === "parent") parentMatched.push(norm);
  }
  return { valid, unknown, parentMatched, source: cat.source };
}

export interface MitreMappingFilterResult {
  kept: MitreMapping[];
  unknown: string[];
  parentMatched: string[];
  source: MitreCatalogSource;
  /** true only when every kept id was checked against the manager's catalog. */
  validated: boolean;
}

/**
 * Drop mappings whose techniqueId is unknown; normalize the kept ids.
 * The first mapping wins for duplicate ids.
 */
export function filterMitreMappings(mappings: readonly MitreMapping[]): MitreMappingFilterResult {
  const result = validateTechniqueIds(mappings.map((m) => m.techniqueId));
  const validSet = new Set(result.valid);
  const used = new Set<string>();
  const kept: MitreMapping[] = [];
  for (const m of mappings) {
    const norm = typeof m.techniqueId === "string" ? m.techniqueId.trim().toUpperCase() : "";
    if (!validSet.has(norm) || used.has(norm)) continue;
    used.add(norm);
    kept.push({ ...m, techniqueId: norm });
  }
  return {
    kept,
    unknown: result.unknown,
    parentMatched: result.parentMatched,
    source: result.source,
    validated: result.source === "manager",
  };
}

// ── CVE ─────────────────────────────────────────────────────────────────────

const CVE_ID = /^CVE-\d{4}-\d{4,}$/;

/** Strict CVE id shape check (`CVE-YYYY-NNNN…`). Case-sensitive, no whitespace. */
export function isValidCveId(id: unknown): id is string {
  return typeof id === "string" && CVE_ID.test(id);
}

/** Trim + upper-case, then validate. Returns the normalized id or null. */
export function normalizeCveId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  const norm = id.trim().toUpperCase();
  return isValidCveId(norm) ? norm : null;
}

// ── Test hooks ──────────────────────────────────────────────────────────────

export const _testing = {
  reset(): void {
    managerCatalog = null;
    inflight = null;
    lastFailureAt = 0;
  },
  /** Await an in-flight background refresh, if any. */
  async settle(): Promise<void> {
    if (inflight) await inflight;
  },
};
