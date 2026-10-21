/**
 * Dual-source switch for agent state reads (Wazuh 5.0 de-risk).
 *
 * WAZUH_STATES_SOURCE=manager (default) — syscollector/syscheck/SCA procedures
 *   call the Manager API exactly as before.
 * WAZUH_STATES_SOURCE=indexer — they read the indexer `wazuh-states-*` indices
 *   via server/indexer/statesClient.ts and return the identical Manager
 *   envelope. If the kind has no indexer equivalent (rootcheck, last_scan), the
 *   indexer is not configured, or the kind's index pattern matches no index
 *   (e.g. FIM/SCA on 4.14), the Manager path is used instead.
 *
 * WAZUH_MANAGER_API_STYLE=manager (default) | cluster — `/manager/*` paths are
 *   rewritten to their Wazuh 5.0 `/cluster/*` names via `managerPath()`. Paths
 *   with no 5.0 equivalent fail with PRECONDITION_FAILED in `cluster` style.
 *
 * See docs/architecture/wazuh-5-compat.md.
 */
import { TRPCError } from "@trpc/server";
import {
  getEffectiveIndexerConfig,
  indexerCatIndices,
  type IndexerConfig,
} from "../indexer/indexerClient";
import {
  STATES_MAPPINGS,
  statesQuery,
  toStatesQuery,
  type ManagerEnvelope,
  type StatesKind,
} from "../indexer/statesClient";

export type StatesSource = "manager" | "indexer";

export function getStatesSource(): StatesSource {
  return (process.env.WAZUH_STATES_SOURCE ?? "").trim().toLowerCase() === "indexer" ? "indexer" : "manager";
}

// ── /manager → /cluster (Wazuh 5.0) ──────────────────────────────────────────
export type ManagerApiStyle = "manager" | "cluster";

export function getManagerApiStyle(): ManagerApiStyle {
  return (process.env.WAZUH_MANAGER_API_STYLE ?? "").trim().toLowerCase() === "cluster" ? "cluster" : "manager";
}

/** Prefix that replaces `/manager` for the 1:1 renames, per API style. */
export const MANAGER_PATH_PREFIX: Record<ManagerApiStyle, string> = {
  manager: "/manager",
  cluster: "/cluster/local",
};

/** `/manager/<suffix>` roots renamed 1:1 under the cluster prefix (subpaths included). */
export const CLUSTER_RENAMED_SUFFIXES = ["/info", "/status", "/configuration", "/logs"] as const;

/** Exact overrides where the 5.0 path is not `<prefix><suffix>`. */
export const CLUSTER_PATH_OVERRIDES: Record<string, string> = {
  // already exists cluster-wide in 4.x; the per-node form does not
  "/manager/configuration/validation": "/cluster/configuration/validation",
  // /manager/api/config → /cluster/api/config (both exist in 4.14; only the latter in 5.0)
  "/manager/api/config": "/cluster/api/config",
};

/** `/manager/*` roots with no Wazuh 5.0 equivalent (CODE_REVIEW §8 Phase 3). */
export const CLUSTER_UNAVAILABLE: Record<string, string> = {
  "/stats": "manager statistics endpoints are removed in Wazuh 5.0 (use wazuh-statistics-* / daemon stats)",
  "/daemons/stats": "no confirmed Wazuh 5.0 equivalent",
  "/version/check": "no confirmed Wazuh 5.0 equivalent",
};

const matchesRoot = (suffix: string, root: string) => suffix === root || suffix.startsWith(root + "/");

/**
 * Rewrite a `/manager/...` path for the active API style. Identity in the
 * default `manager` style; non-`/manager` paths pass through unchanged.
 */
export function managerPath(path: string, style: ManagerApiStyle = getManagerApiStyle()): string {
  if (style === "manager" || !path.startsWith("/manager/")) return path;
  if (CLUSTER_PATH_OVERRIDES[path]) return CLUSTER_PATH_OVERRIDES[path];
  const suffix = path.slice("/manager".length);
  for (const [root, reason] of Object.entries(CLUSTER_UNAVAILABLE)) {
    if (matchesRoot(suffix, root)) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${path} is unavailable with WAZUH_MANAGER_API_STYLE=cluster: ${reason}` });
    }
  }
  if (CLUSTER_RENAMED_SUFFIXES.some(r => matchesRoot(suffix, r))) return MANAGER_PATH_PREFIX.cluster + suffix;
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: `${path} has no known Wazuh 5.0 /cluster equivalent` });
}

// ── Index existence probe (cached) ───────────────────────────────────────────
const PROBE_TTL_MS = 5 * 60_000;
let probeCache: { at: number; indices: Array<{ index: string; docsCount: number }> } | null = null;

/** Every concrete `wazuh-states-*` index, cached for 5 minutes. */
export async function probeStatesIndices(
  config: IndexerConfig,
  userId?: string | number,
  now: number = Date.now(),
): Promise<Array<{ index: string; docsCount: number }>> {
  if (probeCache && now - probeCache.at < PROBE_TTL_MS) return probeCache.indices;
  const indices = await indexerCatIndices(config, "wazuh-states-*", userId);
  probeCache = { at: now, indices };
  return indices;
}

/** Glob match of a single `*`-wildcard index pattern. */
export function patternMatches(pattern: string, index: string): boolean {
  const re = new RegExp("^" + pattern.split("*").map(s => s.replace(/[.+?^${}()|[\]\\-]/g, "\\$&")).join(".*") + "$");
  return re.test(index);
}

export function indicesForKind(kind: StatesKind, indices: Array<{ index: string; docsCount: number }>) {
  return indices.filter(i => patternMatches(STATES_MAPPINGS[kind].index, i.index));
}

// ── Dispatch ─────────────────────────────────────────────────────────────────
/** Kinds the router may ask for; rootcheck and last_scan are deliberately absent. */
export const INDEXER_KINDS = Object.keys(STATES_MAPPINGS) as StatesKind[];

/** Manager-only endpoints (no indexer state index in 4.14 or 5.0). */
export const MANAGER_ONLY = [
  "/rootcheck/{agent_id}",
  "/rootcheck/{agent_id}/last_scan",
  "/syscheck/{agent_id}/last_scan",
] as const;

/**
 * Read `kind` from the indexer when the active source is `indexer`.
 * Returns `null` meaning "use the manager path".
 */
export async function statesGet(
  kind: StatesKind,
  agentId: string,
  forwardedQuery: Record<string, string | number | boolean | undefined>,
  userId?: string | number,
  extra?: { policyId?: string },
): Promise<ManagerEnvelope | null> {
  if (getStatesSource() !== "indexer") return null;
  if (!STATES_MAPPINGS[kind]) return null;
  const config = await getEffectiveIndexerConfig();
  if (!config) return null;
  const indices = await probeStatesIndices(config, userId);
  if (indicesForKind(kind, indices).length === 0) return null;
  const q = toStatesQuery(agentId, forwardedQuery);
  if (extra?.policyId) q.policyId = extra.policyId;
  return statesQuery(config, kind, q, userId);
}

/** syscheck `type=registry` reads the registries index; everything else the files index. */
export function syscheckKind(forwardedQuery: Record<string, unknown>): StatesKind {
  return forwardedQuery.type === "registry" ? "syscheck_registries" : "syscheck_files";
}

/** `statesGet`, falling through to `managerFetch` when it returns null. */
export async function statesOrManager<T>(
  kind: StatesKind,
  agentId: string,
  forwardedQuery: Record<string, string | number | boolean | undefined>,
  managerFetch: () => Promise<T>,
  userId?: string | number,
  extra?: { policyId?: string },
): Promise<T | ManagerEnvelope> {
  const fromIndexer = await statesGet(kind, agentId, forwardedQuery, userId, extra);
  return fromIndexer ?? managerFetch();
}

// ── Diagnostics (wazuh.statesSource) ─────────────────────────────────────────
export interface StatesSourceStatus {
  source: StatesSource;
  managerApiStyle: ManagerApiStyle;
  indexerConfigured: boolean;
  probeError: string | null;
  kinds: Array<{
    kind: StatesKind;
    managerEndpoint: string;
    indexPattern: string;
    indexExists: boolean | null;
    docs: number | null;
    mappingVerified: boolean;
    /** true when this kind would be served from the indexer right now */
    servedByIndexer: boolean;
  }>;
  managerOnly: readonly string[];
}

export async function getStatesSourceStatus(userId?: string | number): Promise<StatesSourceStatus> {
  const source = getStatesSource();
  const config = await getEffectiveIndexerConfig();
  let indices: Array<{ index: string; docsCount: number }> | null = null;
  let probeError: string | null = null;
  if (config) {
    try {
      indices = await probeStatesIndices(config, userId);
    } catch (err) {
      probeError = err instanceof Error ? err.message : "probe failed";
    }
  }
  return {
    source,
    managerApiStyle: getManagerApiStyle(),
    indexerConfigured: !!config,
    probeError,
    kinds: INDEXER_KINDS.map(kind => {
      const m = STATES_MAPPINGS[kind];
      const hits = indices ? indicesForKind(kind, indices) : null;
      const exists = hits ? hits.length > 0 : null;
      return {
        kind,
        managerEndpoint: m.managerEndpoint,
        indexPattern: m.index,
        indexExists: exists,
        docs: hits ? hits.reduce((n, h) => n + h.docsCount, 0) : null,
        mappingVerified: m.verified,
        servedByIndexer: source === "indexer" && exists === true,
      };
    }),
    managerOnly: MANAGER_ONLY,
  };
}

export const _testing = {
  resetProbeCache() { probeCache = null; },
  PROBE_TTL_MS,
};
