/**
 * Wazuh tRPC Router — read-only proxy to the Wazuh REST API.
 *
 * All procedures require authentication (protectedProcedure) and the Wazuh
 * credentials are server-side only and never passed to the browser.
 *
 * Write operations are explicitly NOT implemented per project policy.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { getWazuhConfig, isWazuhConfigured, wazuhGet, getEffectiveWazuhConfig, isWazuhEffectivelyConfigured } from "./wazuhClient";
import { makeCacheKey, cachedFetch, getCacheStats, clearCache, setTtl, setCacheEnabled, type CacheStats } from "./requestCache";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  brokerParams,
  MANAGER_CONFIG,
  MANAGER_LOGS_CONFIG,
  AGENTS_CONFIG,
  RULES_CONFIG,
  GROUPS_CONFIG,
  GROUP_AGENTS_CONFIG,
  CLUSTER_NODES_CONFIG,
  SCA_POLICIES_CONFIG,
  SCA_CHECKS_CONFIG,
  SYSCHECK_CONFIG,
  MITRE_TECHNIQUES_CONFIG,
  DECODERS_CONFIG,
  ROOTCHECK_CONFIG,
  CISCAT_CONFIG,
  SYSCOLLECTOR_PACKAGES_CONFIG,
  SYSCOLLECTOR_PORTS_CONFIG,
  SYSCOLLECTOR_PROCESSES_CONFIG,
  SYSCOLLECTOR_SERVICES_CONFIG,
  // Gap report v4.14.3 — new broker configs
  RULES_FILES_CONFIG,
  DECODERS_FILES_CONFIG,
  LISTS_CONFIG,
  LISTS_FILES_CONFIG,
  MITRE_TACTICS_CONFIG,
  MITRE_GROUPS_CONFIG,
  MITRE_MITIGATIONS_CONFIG,
  MITRE_SOFTWARE_CONFIG,
  MITRE_REFERENCES_CONFIG,
  GROUP_FILES_CONFIG,
  SYSCOLLECTOR_NETIFACE_CONFIG,
  SYSCOLLECTOR_NETADDR_CONFIG,
  SYSCOLLECTOR_HOTFIXES_CONFIG,
  SYSCOLLECTOR_NETPROTO_CONFIG,
  EXPERIMENTAL_CISCAT_RESULTS_CONFIG,
  EXP_SYSCOLLECTOR_PACKAGES_CONFIG,
  EXP_SYSCOLLECTOR_PROCESSES_CONFIG,
  EXP_SYSCOLLECTOR_PORTS_CONFIG,
  // Phase 1+2 remediation configs
  SECURITY_ROLES_CONFIG,
  SECURITY_POLICIES_CONFIG,
  SECURITY_USERS_CONFIG,
  CLUSTER_NODE_CONFIGURATION_CONFIG,
  CLUSTER_NODE_LOGS_CONFIG,
  TASKS_STATUS_CONFIG,
  AGENTS_OUTDATED_CONFIG,
  AGENTS_NO_GROUP_CONFIG,
  AGENTS_STATS_DISTINCT_CONFIG,
  SYSCOLLECTOR_BROWSER_EXTENSIONS_CONFIG,
  SYSCOLLECTOR_USERS_CONFIG,
  SYSCOLLECTOR_GROUPS_CONFIG,
  EXP_SYSCOLLECTOR_NETIFACE_CONFIG,
  EXP_SYSCOLLECTOR_NETADDR_CONFIG,
  EXP_SYSCOLLECTOR_NETPROTO_CONFIG,
  EXP_SYSCOLLECTOR_OS_CONFIG,
  EXP_SYSCOLLECTOR_HARDWARE_CONFIG,
  EXP_SYSCOLLECTOR_HOTFIXES_CONFIG,
  // Task 2+3 new configs
  SECURITY_RBAC_RULES_CONFIG,
  DECODER_PARENTS_CONFIG,
  SYSCOLLECTOR_OS_CONFIG,
  SYSCOLLECTOR_HARDWARE_CONFIG,
  // Promotion sprint — manual → broker
  DECODER_FILE_CONTENT_CONFIG,
  SECURITY_CONFIG_CONFIG,
  SECURITY_CURRENT_USER_CONFIG,
  SECURITY_ACTIONS_CONFIG,
} from "./paramBroker";
import { generateCoverageReport, BROKER_CONFIG_REGISTRY } from "./brokerCoverage";

// ── Per-request user context for rate limiting ──────────────────────────────
// AsyncLocalStorage carries the authenticated user's ID through the call stack
// so proxyGet can enforce per-user rate limits without modifying 80+ call sites.
const requestUserStore = new AsyncLocalStorage<{ userId: number }>();

function getCurrentUserId(): number | undefined {
  return requestUserStore.getStore()?.userId;
}

// ── Shared input schemas ───────────────────────────────────────────────────────
const paginationSchema = z.object({
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

const agentIdSchema = z.string().regex(/^\d{3,}$/, "Invalid agent ID format");

/**
 * Path segment validator — prevents path traversal and injection in URL-interpolated params.
 * Allows alphanumeric, dots, hyphens, underscores. Rejects slashes, null bytes, etc.
 */
const pathSegment = z.string().min(1).max(256).regex(
  /^[a-zA-Z0-9._-]+$/,
  "Invalid path segment: only alphanumeric, dots, hyphens, and underscores are allowed"
);

/** Wazuh component name (e.g. 'agent', 'analysis', 'auth') */
const componentSchema = pathSegment;
/** Wazuh configuration section */
const configurationSchema = pathSegment;
/** Cluster node ID */
const nodeIdSchema = pathSegment;
/** Group ID */
const groupIdSchema = pathSegment;
/** Policy ID */
const policyIdSchema = pathSegment;
/** Rule/decoder filename */
const filenameSchema = pathSegment;
/** Security user/role/policy/rule ID */
const securityIdSchema = pathSegment;
/** Requirement name (e.g. 'pci_dss', 'gdpr') */
const requirementSchema = pathSegment;

// ── Helper: wrap with config check (uses DB override → env fallback) ─────────
async function proxyGet(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
  group?: string
) {
  const config = await getEffectiveWazuhConfig();
  if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Wazuh is not configured. Set connection settings in Admin > Connection Settings or via environment variables." });
  const userId = getCurrentUserId();

  // Request deduplication: identical GET requests within the TTL window
  // share a single upstream call. This protects Wazuh from redundant
  // requests when multiple dashboard panels refresh simultaneously.
  const cacheKey = makeCacheKey(path, params);
  return cachedFetch(cacheKey, () =>
    wazuhGet(config, { path, params, rateLimitGroup: group, userId })
  );
}

/**
 * Attach broker coercion/validation warnings to the Wazuh response.
 * If the broker produced errors during parameter coercion, they are surfaced
 * as `_brokerWarnings` on the response object so analysts can see when filter
 * inputs were silently coerced or dropped.
 *
 * When there are no warnings, the response is returned unchanged.
 */
async function withBrokerWarnings(
  responsePromise: Promise<unknown>,
  brokerErrors: string[]
): Promise<unknown> {
  const data = await responsePromise;
  if (brokerErrors.length === 0) return data;
  // Attach warnings to the response envelope
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return { ...data, _brokerWarnings: brokerErrors };
  }
  // If data is not an object (unlikely for Wazuh), wrap it
  return { data, _brokerWarnings: brokerErrors };
}

// ── Wazuh-specific procedure with per-user rate limit context ────────────────
// Extends protectedProcedure to run each handler inside AsyncLocalStorage,
// making the user's ID available to proxyGet for per-user rate limiting.
// This avoids modifying 80+ individual call sites.
//
// We use protectedProcedure.use() with a standard tRPC middleware function.
// The middleware wraps the downstream handler in AsyncLocalStorage.run() so
// getCurrentUserId() returns the correct value inside proxyGet.
const wazuhProcedure = protectedProcedure.use(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    return next({ ctx });
  }
  // Run the rest of the procedure chain inside AsyncLocalStorage
  // so proxyGet can read the userId without explicit parameter passing.
  return new Promise<Awaited<ReturnType<typeof next>>>((resolve, reject) => {
    requestUserStore.run({ userId: ctx.user!.id }, async () => {
      try {
        const result = await next({ ctx });
        resolve(result);
      } catch (err) {
        reject(err);
      }
    });
  });
});

// ── Router ────────────────────────────────────────────────────────────────────
export const wazuhRouter = router({

  // ══════════════════════════════════════════════════════════════════════════════
  // SYSTEM STATUS
  // ══════════════════════════════════════════════════════════════════════════════
  status: wazuhProcedure.query(async () => {
    const configured = await isWazuhEffectivelyConfigured();
    if (!configured) {
      return { configured: false, data: null };
    }
    try {
      const data = await proxyGet("/manager/info");
      return { configured: true, data };
    } catch (err) {
      const { extractWazuhErrorDetail } = await import("./wazuhClient");
      return { configured: true, data: null, error: extractWazuhErrorDetail(err) };
    }
  }),

  isConfigured: wazuhProcedure.query(async () => {
    const configured = await isWazuhEffectivelyConfigured();
    return {
      configured,
      host: process.env.WAZUH_HOST ?? null,
      port: process.env.WAZUH_PORT ?? "55000",
    };
  }),

  // ══════════════════════════════════════════════════════════════════════════════
  // MANAGER
  // ══════════════════════════════════════════════════════════════════════════════
  managerInfo: wazuhProcedure.query(() => proxyGet("/manager/info")),
  managerStatus: wazuhProcedure.query(() => proxyGet("/manager/status")),
  /**
   * GET /manager/configuration — Manager configuration (broker-wired)
   *
   * Precision params: section, field, raw.
   * Per spec: section and field are ignored when raw=true.
   * This endpoint does NOT support offset/limit/sort/search/select/q.
   */
  managerConfiguration: wazuhProcedure
    .input(
      z.object({
        section: z.string().optional(),
        field: z.string().optional(),
        raw: z.boolean().optional(),
        distinct: z.boolean().optional(),
      }).optional()
    )
    .query(({ input }) => {
      const params = input ?? {};
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(MANAGER_CONFIG, params);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /manager/configuration: ${unsupportedParams.join(", ")}`,
        });
      }
      return withBrokerWarnings(proxyGet("/manager/configuration", forwardedQuery), errors);
    }),
  managerConfigValidation: wazuhProcedure.query(() => proxyGet("/manager/configuration/validation")),

  // ── Manager stats ─────────────────────────────────────────────────────────
  /** GET /manager/stats — Manager stats (manual: date param added) */
  managerStats: wazuhProcedure
    .input(z.object({ date: z.string().optional() }).optional())
    .query(({ input }) => {
      const params: Record<string, string> = {};
      if (input?.date) params.date = input.date;
      return proxyGet("/manager/stats", params);
    }),
  statsHourly: wazuhProcedure.query(() => proxyGet("/manager/stats/hourly")),
  statsWeekly: wazuhProcedure.query(() => proxyGet("/manager/stats/weekly")),
  analysisd: wazuhProcedure.query(() => proxyGet("/manager/stats/analysisd")),
  remoted: wazuhProcedure.query(() => proxyGet("/manager/stats/remoted")),

  // ── Manager daemon stats (4.14+ enhanced) ─────────────────────────────────
  daemonStats: wazuhProcedure
    .input(z.object({
      daemons: z.array(z.string()).optional(),
    }).optional())
    .query(({ input }) =>
      proxyGet("/manager/daemons/stats", input?.daemons ? { daemons_list: input.daemons.join(",") } : {})
    ),

  // ── Manager logs ──────────────────────────────────────────────────────────
  /**
   * GET /manager/logs — Manager logs (broker-wired)
   *
   * Expanded to support universal params (sort, q, select, distinct)
   * plus endpoint-specific level and tag filters.
   */
  managerLogs: wazuhProcedure
    .input(
      paginationSchema.extend({
        level: z.enum(["info", "error", "warning", "debug"]).optional(),
        tag: z.string().optional(),
        search: z.string().optional(),
        sort: z.string().optional(),
        q: z.string().optional(),
        select: z.union([z.string(), z.array(z.string())]).optional(),
        distinct: z.boolean().optional(),
      })
    )
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(MANAGER_LOGS_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /manager/logs: ${unsupportedParams.join(", ")}`,
        });
      }
      return withBrokerWarnings(proxyGet("/manager/logs", forwardedQuery, "alerts"), errors);
    }),

  managerLogsSummary: wazuhProcedure.query(() =>
    proxyGet("/manager/logs/summary", {}, "alerts")
  ),

  /**
   * GET /manager/version/check — Check available Wazuh updates
   * P2 GAP fill. Optional force_query to bypass CTI cache.
   */
  managerVersionCheck: wazuhProcedure
    .input(z.object({
      force_query: z.boolean().optional(),
    }).optional())
    .query(({ input }) => {
      const params: Record<string, string | number | boolean | undefined> = {};
      if (input?.force_query !== undefined) params.force_query = input.force_query;
      return proxyGet("/manager/version/check", params);
    }),

  /**
   * GET /manager/configuration/{component}/{configuration} — Granular active config
   * P2 GAP fill. Returns the active configuration for a specific component/configuration pair.
   */
  managerComponentConfig: wazuhProcedure
    .input(z.object({
           component: componentSchema,
      configuration: configurationSchema,
    }))
    .query(({ input }) =>
      proxyGet(`/manager/configuration/${input.component}/${input.configuration}`)
    ),

  // ══════════════════════════════════════════════════════════════════════════════
  // CLUSTER
  // ══════════════════════════════════════════════════════════════════════════════
  clusterStatus: wazuhProcedure.query(() => proxyGet("/cluster/status")),
  /**
   * GET /cluster/nodes — List cluster nodes (broker-wired)
   *
   * Previously accepted no parameters. Now supports universal params
   * plus the endpoint-specific "type" (node_type) filter per spec.
   */
  clusterNodes: wazuhProcedure
    .input(
      paginationSchema.extend({
        search: z.string().optional(),
        sort: z.string().optional(),
        q: z.string().optional(),
        select: z.union([z.string(), z.array(z.string())]).optional(),
        distinct: z.boolean().optional(),
        type: z.enum(["worker", "master"]).optional(),
        nodes_list: z.union([z.string(), z.array(z.string())]).optional(),
      }).optional()
    )
    .query(({ input }) => {
      if (!input) return proxyGet("/cluster/nodes");
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(CLUSTER_NODES_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /cluster/nodes: ${unsupportedParams.join(", ")}`,
        });
      }
      return withBrokerWarnings(proxyGet("/cluster/nodes", forwardedQuery), errors);
    }),
  clusterHealthcheck: wazuhProcedure
    .input(z.object({ nodes_list: z.union([z.string(), z.array(z.string())]).optional() }).optional())
    .query(({ input }) => {
      const params: Record<string, string> = {};
      if (input?.nodes_list) params.nodes_list = Array.isArray(input.nodes_list) ? input.nodes_list.join(",") : input.nodes_list;
      return proxyGet("/cluster/healthcheck", params);
    }),
  clusterLocalInfo: wazuhProcedure.query(() => proxyGet("/cluster/local/info")),
  clusterLocalConfig: wazuhProcedure.query(() => proxyGet("/cluster/local/config")),

  /** GET /cluster/ruleset/synchronization — Ruleset sync status (C-5 gap fill) */
  clusterRulesetSync: wazuhProcedure.query(() => proxyGet("/cluster/ruleset/synchronization")),

  /** GET /cluster/api/config — Cluster API configuration (C-5 gap fill) */
  clusterApiConfig: wazuhProcedure.query(() => proxyGet("/cluster/api/config")),

  /** GET /cluster/configuration/validation — Validate cluster node configs */
  clusterConfigValidation: wazuhProcedure.query(() => proxyGet("/cluster/configuration/validation")),

  /** GET /manager/api/config — Manager API configuration (C-5 gap fill) */
  managerApiConfig: wazuhProcedure.query(() => proxyGet("/manager/api/config")),

  clusterNodeInfo: wazuhProcedure
    .input(z.object({ nodeId: nodeIdSchema }))
    .query(({ input }) => proxyGet(`/cluster/${input.nodeId}/info`)),

  /** GET /cluster/{node_id}/stats — Node stats (manual: date param added) */
  clusterNodeStats: wazuhProcedure
    .input(z.object({ nodeId: nodeIdSchema, date: z.string().optional() }))
    .query(({ input }) => {
      const params: Record<string, string> = {};
      if (input.date) params.date = input.date;
      return proxyGet(`/cluster/${input.nodeId}/stats`, params);
    }),

  clusterNodeStatsHourly: wazuhProcedure
    .input(z.object({ nodeId: nodeIdSchema }))
    .query(({ input }) => proxyGet(`/cluster/${input.nodeId}/stats/hourly`)),

  // ══════════════════════════════════════════════════════════════════════════════
  // AGENTS
  // ══════════════════════════════════════════════════════════════════════════════
  /**
   * GET /agents — List agents (broker-wired)
   *
   * Fix A1: os_platform is accepted and mapped to the spec-correct "os.platform" outbound param.
   * Fix A2: "search" is forwarded as native Wazuh "search" — NOT rewritten into q=name~...
   *         "q" is forwarded independently as its own parameter.
   *
   * The broker handles alias resolution, type coercion, and unsupported-param detection.
   * Any parameter not in AGENTS_CONFIG is rejected with a clear error.
   */
  agents: wazuhProcedure
    .input(
      paginationSchema.extend({
        status: z.union([
          z.enum(["active", "disconnected", "never_connected", "pending"]),
          z.string(),
          z.array(z.string()),
        ]).optional(),
        os_platform: z.string().optional(),
        search: z.string().optional(),
        group: z.string().optional(),
        sort: z.string().optional(),
        q: z.string().optional(),
        select: z.union([z.string(), z.array(z.string())]).optional(),
        distinct: z.boolean().optional(),
        "os.name": z.string().optional(),
        "os.version": z.string().optional(),
        older_than: z.string().optional(),
        manager_host: z.string().optional(),
        version: z.string().optional(),
        node_name: z.string().optional(),
        name: z.string().optional(),
        ip: z.string().optional(),
        registerIP: z.string().optional(),
        group_config_status: z.string().optional(),
        manager: z.string().optional(),
        wait_for_complete: z.boolean().optional(),
      })
    )
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(AGENTS_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /agents: ${unsupportedParams.join(", ")}`,
        });
      }
      return withBrokerWarnings(proxyGet("/agents", forwardedQuery), errors);
    }),

  agentSummaryStatus: wazuhProcedure.query(() =>
    proxyGet("/agents/summary/status")
  ),

  agentSummaryOs: wazuhProcedure.query(() =>
    proxyGet("/agents/summary/os")
  ),

  /**
   * GET /agents/summary — Broader agent summary (OS, status, groups)
   * P2 GAP fill. Accepts optional agents_list filter.
   */
  agentsSummary: wazuhProcedure
    .input(z.object({
      agents_list: z.union([z.string(), z.array(z.string())]).optional(),
    }).optional())
    .query(({ input }) => {
      const params: Record<string, string | number | boolean | undefined> = {};
      if (input?.agents_list) {
        params.agents_list = Array.isArray(input.agents_list)
          ? input.agents_list.join(",")
          : input.agents_list;
      }
      return proxyGet("/agents/summary", params);
    }),

  agentOverview: wazuhProcedure.query(() =>
    proxyGet("/overview/agents")
  ),

  agentById: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet("/agents", { agents_list: input.agentId })
    ),

  /**
   * GET /agents/{agentId}/key — Agent registration key.
   * ADMIN-ONLY: requires ctx.user.role === 'admin'.
   * Logs every access to sensitive_access_audit table.
   * Client MUST set gcTime: 0 to prevent cache persistence.
   */
  agentKey: adminProcedure.use(async (opts) => {
    // Wrap in AsyncLocalStorage so proxyGet can read userId for rate limiting
    const { ctx, next } = opts;
    return new Promise<Awaited<ReturnType<typeof next>>>((resolve, reject) => {
      requestUserStore.run({ userId: ctx.user!.id }, async () => {
        try {
          const result = await next({ ctx });
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    });
  })
    .input(z.object({ agentId: agentIdSchema }))
    .query(async ({ input, ctx }) => {
      // FAIL-CLOSED: audit insert MUST succeed before key is revealed.
      // If audit logging fails, the key is NOT returned.
      const { logSensitiveAccess } = await import("../db");
      try {
        await logSensitiveAccess({
          userId: ctx.user!.id,
          resourceType: "agent_key",
          resourceId: input.agentId,
          action: "reveal",
          ipAddress: ctx.req?.ip ?? ctx.req?.socket?.remoteAddress ?? null,
          userAgent: ctx.req?.headers?.["user-agent"] ?? null,
        });
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Audit logging unavailable; cannot reveal key.",
        });
      }
      return proxyGet(`/agents/${input.agentId}/key`);
    }),

  agentDaemonStats: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      daemons_list: z.union([z.string(), z.array(z.string())]).optional(),
    }))
    .query(({ input }) => {
      const params: Record<string, string> = {};
      if (input.daemons_list) params.daemons_list = Array.isArray(input.daemons_list) ? input.daemons_list.join(",") : input.daemons_list;
      return proxyGet(`/agents/${input.agentId}/daemons/stats`, params);
    }),

  agentStats: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema, component: componentSchema.default("logcollector") }))
    .query(({ input }) =>
      proxyGet(`/agents/${input.agentId}/stats/${input.component}`)
    ),

  agentConfig: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      component: componentSchema,
      configuration: configurationSchema,
    }))
    .query(({ input }) =>
      proxyGet(`/agents/${input.agentId}/config/${input.component}/${input.configuration}`)
    ),

  /**
   * GET /agents/upgrade_result — Agent upgrade results
   * Sprint v2 P0 gap fill. Supports agents_list, q, and agent filter params.
   */
  agentsUpgradeResult: wazuhProcedure
    .input(
      z.object({
        agents_list: z.union([z.string(), z.array(z.string())]).optional(),
        q: z.string().optional(),
        os_platform: z.string().optional(),
        os_version: z.string().optional(),
        os_name: z.string().optional(),
        manager: z.string().optional(),
        version: z.string().optional(),
        group: z.string().optional(),
        node_name: z.string().optional(),
        name: z.string().optional(),
        ip: z.string().optional(),
        registerIP: z.string().optional(),
      }).optional()
    )
    .query(({ input }) => {
      const params: Record<string, string> = {};
      if (input?.agents_list) params.agents_list = Array.isArray(input.agents_list) ? input.agents_list.join(",") : input.agents_list;
      if (input?.q) params.q = input.q;
      if (input?.os_platform) params["os.platform"] = input.os_platform;
      if (input?.os_version) params["os.version"] = input.os_version;
      if (input?.os_name) params["os.name"] = input.os_name;
      if (input?.manager) params.manager = input.manager;
      if (input?.version) params.version = input.version;
      if (input?.group) params.group = input.group;
      if (input?.node_name) params.node_name = input.node_name;
      if (input?.name) params.name = input.name;
      if (input?.ip) params.ip = input.ip;
      if (input?.registerIP) params.registerIP = input.registerIP;
      return proxyGet("/agents/upgrade_result", params);
    }),

  /**
   * GET /agents/uninstall — Check user permission to uninstall agents
   * Sprint v2 P0 gap fill. No parameters.
   */
  agentsUninstallPermission: wazuhProcedure.query(() => proxyGet("/agents/uninstall")),

  /**
   * GET /agents/{agent_id}/group/is_sync — Agent group sync status (deprecated in spec)
   * Sprint v2 P0 gap fill. Path param only.
   */
  agentGroupSync: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) => proxyGet(`/agents/${input.agentId}/group/is_sync`)),

  /**
   * GET / — Basic Wazuh API info (root endpoint)
   * Sprint v2 P0 gap fill. No parameters.
   */
  apiInfo: wazuhProcedure.query(() => proxyGet("/")),

  /**
   * GET /groups — List groups (broker-wired)
   *
   * Previously accepted no parameters. Now supports the full universal param family
   * plus the endpoint-specific "hash" parameter per spec.
   */
  agentGroups: wazuhProcedure
    .input(
      paginationSchema.extend({
        search: z.string().optional(),
        sort: z.string().optional(),
        q: z.string().optional(),
        select: z.union([z.string(), z.array(z.string())]).optional(),
        distinct: z.boolean().optional(),
        hash: z.string().optional(),
        groups_list: z.union([z.string(), z.array(z.string())]).optional(),
      }).optional()
    )
    .query(({ input }) => {
      if (!input) return proxyGet("/groups");
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(GROUPS_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /groups: ${unsupportedParams.join(", ")}`,
        });
      }
      return withBrokerWarnings(proxyGet("/groups", forwardedQuery), errors);
    }),

  /** Agents with outdated version compared to manager (M-1 expanded) */
  /** GET /agents/outdated — Outdated agents (broker-wired) */
  agentsOutdated: wazuhProcedure
    .input(paginationSchema.extend({
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(AGENTS_OUTDATED_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params for /agents/outdated: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/agents/outdated", forwardedQuery), errors);
    }),

  /** GET /agents/no_group — Agents with no group (broker-wired) */
  agentsNoGroup: wazuhProcedure
    .input(paginationSchema.extend({
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(AGENTS_NO_GROUP_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params for /agents/no_group: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/agents/no_group", forwardedQuery), errors);
    }),

  /** GET /agents/stats/distinct — Agent stats distinct (broker-wired) */
  agentsStatsDistinct: wazuhProcedure
    .input(z.object({
      fields: z.union([z.string(), z.array(z.string())]),
      ...paginationSchema.shape,
      sort: z.string().optional(),
      search: z.string().optional(),
      q: z.string().optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(AGENTS_STATS_DISTINCT_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params for /agents/stats/distinct: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/agents/stats/distinct", forwardedQuery), errors);
    }),

  /**
   * GET /groups/{group_id}/agents — Agents in a group (broker-wired)
   *
   * Expanded to support universal params (sort, search, select, q, distinct)
   * plus endpoint-specific status filter.
   */
  agentGroupMembers: wazuhProcedure
    .input(z.object({
      groupId: groupIdSchema,
      ...paginationSchema.shape,
      search: z.string().optional(),
      sort: z.string().optional(),
      q: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      distinct: z.boolean().optional(),
      status: z.union([z.string(), z.array(z.string())]).optional(),
    }))
    .query(({ input }) => {
      const { groupId, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(GROUP_AGENTS_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /groups/{group_id}/agents: ${unsupportedParams.join(", ")}`,
        });
      }
      return withBrokerWarnings(proxyGet(`/groups/${groupId}/agents`, forwardedQuery), errors);
    }),

  // ══════════════════════════════════════════════════════════════════════════════
  // SYSCOLLECTOR (IT Hygiene)
  // ══════════════════════════════════════════════════════════════════════════════
  agentOs: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      select: z.union([z.string(), z.array(z.string())]).optional(),
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { agentId, ...params } = input;
      const { forwardedQuery, errors } = brokerParams(SYSCOLLECTOR_OS_CONFIG, params);
      return withBrokerWarnings(proxyGet(`/syscollector/${agentId}/os`, forwardedQuery), errors);
    }),

  agentHardware: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      select: z.union([z.string(), z.array(z.string())]).optional(),
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { agentId, ...params } = input;
      const { forwardedQuery, errors } = brokerParams(SYSCOLLECTOR_HARDWARE_CONFIG, params);
      return withBrokerWarnings(proxyGet(`/syscollector/${agentId}/hardware`, forwardedQuery), errors);
    }),

  agentPackages: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      // Broker-wired: universal params + vendor, name, architecture, format, version
      search: z.string().optional(),
      q: z.string().optional(),
      sort: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      distinct: z.boolean().optional(),
      vendor: z.string().optional(),
      name: z.string().optional(),
      architecture: z.string().optional(),
      format: z.string().optional(),
      version: z.string().optional(),
      ...paginationSchema.shape,
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { agentId, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SYSCOLLECTOR_PACKAGES_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /syscollector/{agent_id}/packages: ${unsupportedParams.join(", ")}`,
        });
      }
      return withBrokerWarnings(proxyGet(`/syscollector/${agentId}/packages`, forwardedQuery), errors);
    }),

  agentPorts: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      // Broker-wired: universal params + pid, protocol, local.ip, local.port, remote.ip, tx_queue, state, process
      search: z.string().optional(),
      q: z.string().optional(),
      sort: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      distinct: z.boolean().optional(),
      pid: z.string().optional(),
      protocol: z.string().optional(),
      "local.ip": z.string().optional(),
      "local.port": z.string().optional(),
      "remote.ip": z.string().optional(),
      tx_queue: z.string().optional(),
      state: z.string().optional(),
      process: z.string().optional(),
      ...paginationSchema.shape,
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { agentId, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SYSCOLLECTOR_PORTS_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /syscollector/{agent_id}/ports: ${unsupportedParams.join(", ")}`,
        });
      }
      return withBrokerWarnings(proxyGet(`/syscollector/${agentId}/ports`, forwardedQuery), errors);
    }),

  agentProcesses: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      // Broker-wired: universal params + pid, state, ppid, egroup, euser, fgroup, name, nlwp, pgrp, priority, rgroup, ruser, sgroup, suser
      search: z.string().optional(),
      q: z.string().optional(),
      sort: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      distinct: z.boolean().optional(),
      pid: z.string().optional(),
      state: z.string().optional(),
      ppid: z.string().optional(),
      egroup: z.string().optional(),
      euser: z.string().optional(),
      fgroup: z.string().optional(),
      name: z.string().optional(),
      nlwp: z.string().optional(),
      pgrp: z.string().optional(),
      priority: z.string().optional(),
      rgroup: z.string().optional(),
      ruser: z.string().optional(),
      sgroup: z.string().optional(),
      suser: z.string().optional(),
      ...paginationSchema.shape,
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { agentId, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SYSCOLLECTOR_PROCESSES_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /syscollector/{agent_id}/processes: ${unsupportedParams.join(", ")}`,
        });
      }
      return withBrokerWarnings(proxyGet(`/syscollector/${agentId}/processes`, forwardedQuery), errors);
    }),

  agentNetaddr: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      ...paginationSchema.shape,
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
      iface: z.string().optional(),
      proto: z.string().optional(),
      address: z.string().optional(),
      broadcast: z.string().optional(),
      netmask: z.string().optional(),
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { agentId, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SYSCOLLECTOR_NETADDR_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /syscollector/{agent_id}/netaddr: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet(`/syscollector/${agentId}/netaddr`, forwardedQuery), errors);
    }),

  agentNetiface: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      ...paginationSchema.shape,
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
      name: z.string().optional(),
      adapter: z.string().optional(),
      type: z.string().optional(),
      state: z.string().optional(),
      mtu: z.number().optional(),
      "tx.packets": z.string().optional(),
      "rx.packets": z.string().optional(),
      "tx.bytes": z.string().optional(),
      "rx.bytes": z.string().optional(),
      "tx.errors": z.string().optional(),
      "rx.errors": z.string().optional(),
      "tx.dropped": z.string().optional(),
      "rx.dropped": z.string().optional(),
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { agentId, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SYSCOLLECTOR_NETIFACE_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /syscollector/{agent_id}/netiface: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet(`/syscollector/${agentId}/netiface`, forwardedQuery), errors);
    }),

  agentHotfixes: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      ...paginationSchema.shape,
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
      hotfix: z.string().optional(),
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { agentId, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SYSCOLLECTOR_HOTFIXES_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /syscollector/{agent_id}/hotfixes: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet(`/syscollector/${agentId}/hotfixes`, forwardedQuery), errors);
    }),

  groupFiles: wazuhProcedure
    .input(z.object({
      groupId: groupIdSchema,
      ...paginationSchema.shape,
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
      hash: z.string().optional(),
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { groupId, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(GROUP_FILES_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /groups/{group_id}/files: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet(`/groups/${groupId}/files`, forwardedQuery), errors);
    }),

  // ══════════════════════════════════════════════════════════════════════════════
  // SYSCOLLECTOR — EXTENSIONS / SERVICES / IDENTITY
  // ══════════════════════════════════════════════════════════════════════════════

  /** Browser extensions installed on the agent (Windows only) (M-16 expanded) */
  /** GET /syscollector/{agent_id}/browser_extensions — Browser extensions (broker-wired) */
  agentBrowserExtensions: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      ...paginationSchema.shape,
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { agentId, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SYSCOLLECTOR_BROWSER_EXTENSIONS_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params for /syscollector/{agent_id}/browser_extensions: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet(`/syscollector/${agentId}/browser_extensions`, forwardedQuery), errors)
        .catch((err: unknown) => {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Wazuh syscollector/browser_extensions failed: ${err instanceof Error ? err.message : "unknown"}` });
        });
    }),

  /** System services / daemons (Windows services, systemd units) */
  agentServices: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      // Broker-wired: universal params only (no field-specific filters in spec)
      search: z.string().optional(),
      q: z.string().optional(),
      sort: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      distinct: z.boolean().optional(),
      ...paginationSchema.shape,
    }))
    .query(({ input }) => {
      const { agentId, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SYSCOLLECTOR_SERVICES_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /syscollector/{agent_id}/services: ${unsupportedParams.join(", ")}`,
        });
      }
      return withBrokerWarnings(proxyGet(`/syscollector/${agentId}/services`, forwardedQuery), errors)
        .catch((err: unknown) => {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Wazuh syscollector/services failed: ${err instanceof Error ? err.message : "unknown"}` });
        });
    }),

  /** GET /syscollector/{agent_id}/users — Local users (broker-wired) */
  agentUsers: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      ...paginationSchema.shape,
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { agentId, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SYSCOLLECTOR_USERS_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params for /syscollector/{agent_id}/users: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet(`/syscollector/${agentId}/users`, forwardedQuery), errors)
        .catch((err: unknown) => {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Wazuh syscollector/users failed: ${err instanceof Error ? err.message : "unknown"}` });
        });
    }),

  /** GET /syscollector/{agent_id}/groups — Local groups (broker-wired) */
  agentGroups2: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      ...paginationSchema.shape,
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { agentId, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SYSCOLLECTOR_GROUPS_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params for /syscollector/{agent_id}/groups: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet(`/syscollector/${agentId}/groups`, forwardedQuery), errors)
        .catch((err: unknown) => {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Wazuh syscollector/groups failed: ${err instanceof Error ? err.message : "unknown"}` });
        });
    }),

  /** Network protocol inventory per agent */
  agentNetproto: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      ...paginationSchema.shape,
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
      iface: z.string().optional(),
      type: z.string().optional(),
      gateway: z.string().optional(),
      dhcp: z.string().optional(),
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { agentId, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SYSCOLLECTOR_NETPROTO_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /syscollector/{agent_id}/netproto: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet(`/syscollector/${agentId}/netproto`, forwardedQuery), errors)
.catch((err: unknown) => {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Wazuh syscollector/netproto failed: ${err instanceof Error ? err.message : "unknown"}` });
        });
    }),

  // ══════════════════════════════════════════════════════════════════════════════
  // EXPERIMENTAL SYSCOLLECTOR — Cross-agent bulk endpoints (Sprint v2 P0)
  // ══════════════════════════════════════════════════════════════════════════════

  /** GET /experimental/syscollector/packages — All packages across all agents (broker-wired) */
  expSyscollectorPackages: wazuhProcedure
    .input(paginationSchema.extend({
      search: z.string().optional(),
      q: z.string().optional(),
      sort: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      distinct: z.boolean().optional(),
      agents_list: z.union([z.string(), z.array(z.string())]).optional(),
      vendor: z.string().optional(),
      name: z.string().optional(),
      architecture: z.string().optional(),
      format: z.string().optional(),
      version: z.string().optional(),
    }))
    .query(({ input }) => {
      const { limit, offset, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(EXP_SYSCOLLECTOR_PACKAGES_CONFIG, { limit, offset, ...rest });
      if (errors.length) throw new TRPCError({ code: "BAD_REQUEST", message: errors.join("; ") });
      if (unsupportedParams.length) throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params: ${unsupportedParams.join(", ")}` });
      return proxyGet("/experimental/syscollector/packages", forwardedQuery);
    }),

  /** GET /experimental/syscollector/processes — All processes across all agents (broker-wired) */
  expSyscollectorProcesses: wazuhProcedure
    .input(paginationSchema.extend({
      search: z.string().optional(),
      q: z.string().optional(),
      sort: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      distinct: z.boolean().optional(),
      agents_list: z.union([z.string(), z.array(z.string())]).optional(),
      pid: z.string().optional(),
      state: z.string().optional(),
      ppid: z.string().optional(),
      egroup: z.string().optional(),
      euser: z.string().optional(),
      fgroup: z.string().optional(),
      name: z.string().optional(),
      nlwp: z.string().optional(),
      pgrp: z.string().optional(),
      priority: z.string().optional(),
      rgroup: z.string().optional(),
      ruser: z.string().optional(),
      sgroup: z.string().optional(),
      suser: z.string().optional(),
    }))
    .query(({ input }) => {
      const { limit, offset, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(EXP_SYSCOLLECTOR_PROCESSES_CONFIG, { limit, offset, ...rest });
      if (errors.length) throw new TRPCError({ code: "BAD_REQUEST", message: errors.join("; ") });
      if (unsupportedParams.length) throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params: ${unsupportedParams.join(", ")}` });
      return proxyGet("/experimental/syscollector/processes", forwardedQuery);
    }),

  /** GET /experimental/syscollector/ports — All ports across all agents (broker-wired) */
  expSyscollectorPorts: wazuhProcedure
    .input(paginationSchema.extend({
      search: z.string().optional(),
      q: z.string().optional(),
      sort: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      distinct: z.boolean().optional(),
      agents_list: z.union([z.string(), z.array(z.string())]).optional(),
      pid: z.string().optional(),
      protocol: z.string().optional(),
      "local.ip": z.string().optional(),
      "local.port": z.string().optional(),
      "remote.ip": z.string().optional(),
      tx_queue: z.string().optional(),
      state: z.string().optional(),
      process: z.string().optional(),
    }))
    .query(({ input }) => {
      const { limit, offset, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(EXP_SYSCOLLECTOR_PORTS_CONFIG, { limit, offset, ...rest });
      if (errors.length) throw new TRPCError({ code: "BAD_REQUEST", message: errors.join("; ") });
      if (unsupportedParams.length) throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params: ${unsupportedParams.join(", ")}` });
      return proxyGet("/experimental/syscollector/ports", forwardedQuery);
    }),

  /** GET /experimental/syscollector/netaddr — All network addresses (broker-wired) */
  expSyscollectorNetaddr: wazuhProcedure
    .input(paginationSchema.extend({
      search: z.string().optional(),
      q: z.string().optional(),
      sort: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      distinct: z.boolean().optional(),
      agents_list: z.union([z.string(), z.array(z.string())]).optional(),
      proto: z.string().optional(),
      address: z.string().optional(),
      broadcast: z.string().optional(),
      netmask: z.string().optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(EXP_SYSCOLLECTOR_NETADDR_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params for /experimental/syscollector/netaddr: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/experimental/syscollector/netaddr", forwardedQuery), errors);
    }),

  /** GET /experimental/syscollector/netiface — All network interfaces (broker-wired, 21 params) */
  expSyscollectorNetiface: wazuhProcedure
    .input(paginationSchema.extend({
      search: z.string().optional(),
      q: z.string().optional(),
      sort: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      distinct: z.boolean().optional(),
      agents_list: z.union([z.string(), z.array(z.string())]).optional(),
      name: z.string().optional(),
      adapter: z.string().optional(),
      type: z.string().optional(),
      state: z.string().optional(),
      mtu: z.string().optional(),
      "tx.packets": z.string().optional(),
      "rx.packets": z.string().optional(),
      "tx.bytes": z.string().optional(),
      "rx.bytes": z.string().optional(),
      "tx.errors": z.string().optional(),
      "rx.errors": z.string().optional(),
      "tx.dropped": z.string().optional(),
      "rx.dropped": z.string().optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(EXP_SYSCOLLECTOR_NETIFACE_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params for /experimental/syscollector/netiface: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/experimental/syscollector/netiface", forwardedQuery), errors);
    }),

  /** GET /experimental/syscollector/netproto — All network protocols (broker-wired) */
  expSyscollectorNetproto: wazuhProcedure
    .input(paginationSchema.extend({
      search: z.string().optional(),
      q: z.string().optional(),
      sort: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      distinct: z.boolean().optional(),
      agents_list: z.union([z.string(), z.array(z.string())]).optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(EXP_SYSCOLLECTOR_NETPROTO_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params for /experimental/syscollector/netproto: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/experimental/syscollector/netproto", forwardedQuery), errors);
    }),

  /** GET /experimental/syscollector/os — All OS info (broker-wired) */
  expSyscollectorOs: wazuhProcedure
    .input(paginationSchema.extend({
      search: z.string().optional(),
      q: z.string().optional(),
      sort: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      distinct: z.boolean().optional(),
      agents_list: z.union([z.string(), z.array(z.string())]).optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(EXP_SYSCOLLECTOR_OS_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params for /experimental/syscollector/os: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/experimental/syscollector/os", forwardedQuery), errors);
    }),

  /** GET /experimental/syscollector/hardware — All hardware info (broker-wired) */
  expSyscollectorHardware: wazuhProcedure
    .input(paginationSchema.extend({
      search: z.string().optional(),
      q: z.string().optional(),
      sort: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      distinct: z.boolean().optional(),
      agents_list: z.union([z.string(), z.array(z.string())]).optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(EXP_SYSCOLLECTOR_HARDWARE_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params for /experimental/syscollector/hardware: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/experimental/syscollector/hardware", forwardedQuery), errors);
    }),

  /** GET /experimental/syscollector/hotfixes — All hotfixes (broker-wired) */
  expSyscollectorHotfixes: wazuhProcedure
    .input(paginationSchema.extend({
      search: z.string().optional(),
      q: z.string().optional(),
      sort: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      distinct: z.boolean().optional(),
      agents_list: z.union([z.string(), z.array(z.string())]).optional(),
      hotfix: z.string().optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(EXP_SYSCOLLECTOR_HOTFIXES_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params for /experimental/syscollector/hotfixes: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/experimental/syscollector/hotfixes", forwardedQuery), errors);
    }),

  /**
   * GET /experimental/ciscat/results — Cross-agent CIS-CAT results (broker-wired)
   *
   * Returns CIS-CAT scan results across ALL agents. Supports universal params,
   * agents_list filter, and all CIS-CAT field-specific filters.
   */
  expCiscatResults: wazuhProcedure
    .input(paginationSchema.extend({
      search: z.string().optional(),
      q: z.string().optional(),
      sort: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      distinct: z.boolean().optional(),
      agents_list: z.union([z.string(), z.array(z.string())]).optional(),
      benchmark: z.string().optional(),
      profile: z.string().optional(),
      pass: z.number().optional(),
      fail: z.number().optional(),
      error: z.number().optional(),
      notchecked: z.number().optional(),
      unknown: z.number().optional(),
      score: z.number().optional(),
    }))
    .query(({ input }) => {
      const { limit, offset, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(EXPERIMENTAL_CISCAT_RESULTS_CONFIG, { limit, offset, ...rest });
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /experimental/ciscat/results: ${unsupportedParams.join(", ")}`,
        });
      }
      return withBrokerWarnings(proxyGet("/experimental/ciscat/results", forwardedQuery), errors);
    }),

  // ══════════════════════════════════════════════════════════════════════════════
  // ALERTS / RULES
  // ══════════════════════════════════════════════════════════════════════════════
  /**
   * GET /rules — List rules (broker-wired)
   *
   * Expanded from the original 4-param version to support the full spec parameter set
   * including compliance filters (pci_dss, gdpr, hipaa, nist-800-53, tsc, mitre).
   */
  rules: wazuhProcedure
    .input(
      paginationSchema.extend({
        level: z.union([z.number().int().min(0).max(16), z.string()]).optional(),
        search: z.string().optional(),
        group: z.string().optional(),
        sort: z.string().optional(),
        q: z.string().optional(),
        select: z.union([z.string(), z.array(z.string())]).optional(),
        distinct: z.boolean().optional(),
        status: z.enum(["enabled", "disabled", "all"]).optional(),
        filename: filenameSchema.optional(),
        relative_dirname: z.string().optional(),
        pci_dss: z.string().optional(),
        gdpr: z.string().optional(),
        gpg13: z.string().optional(),
        hipaa: z.string().optional(),
        "nist-800-53": z.string().optional(),
        tsc: z.string().optional(),
        mitre: z.string().optional(),
        rule_ids: z.union([z.string(), z.array(z.string())]).optional(),
        wait_for_complete: z.boolean().optional(),
      })
    )
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(RULES_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /rules: ${unsupportedParams.join(", ")}`,
        });
      }
      return withBrokerWarnings(proxyGet("/rules", forwardedQuery), errors);
    }),

  ruleGroups: wazuhProcedure
    .input(paginationSchema.extend({
      sort: z.string().optional(),
      search: z.string().optional(),
    }).optional())
    .query(({ input }) => {
      if (!input) return proxyGet("/rules/groups");
      const params: Record<string, string | number | boolean | undefined> = {
        limit: input.limit, offset: input.offset,
      };
      if (input.sort) params.sort = input.sort;
      if (input.search) params.search = input.search;
      return proxyGet("/rules/groups", params);
    }),

  rulesByRequirement: wazuhProcedure
    .input(z.object({
      requirement: requirementSchema,
      ...paginationSchema.shape,
      sort: z.string().optional(),
      search: z.string().optional(),
    }))
    .query(({ input }) => {
      const params: Record<string, string | number | boolean | undefined> = {
        limit: input.limit, offset: input.offset,
      };
      if (input.sort) params.sort = input.sort;
      if (input.search) params.search = input.search;
      return proxyGet(`/rules/requirement/${input.requirement}`, params);
    }),

  rulesFiles: wazuhProcedure
    .input(paginationSchema.extend({
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
      filename: filenameSchema.optional(),
      relative_dirname: z.string().optional(),
      status: z.enum(["enabled", "disabled", "all"]).optional(),
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(RULES_FILES_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /rules/files: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/rules/files", forwardedQuery), errors);
    }),

  /** View rule file content by filename (L-1 expanded) — path-validated */
  ruleFileContent: wazuhProcedure
    .input(z.object({
      filename: filenameSchema,
      raw: z.boolean().optional(),
      get_dirnames_path: z.string().optional(),
    }))
    .query(({ input }) => {
      const params: Record<string, string | boolean> = {};
      if (input.raw !== undefined) params.raw = input.raw;
      if (input.get_dirnames_path) params.get_dirnames_path = input.get_dirnames_path;
      return proxyGet(`/rules/files/${input.filename}`, params);
    }),

  // ══════════════════════════════════════════════════════════════════════════════
  // MITRE ATT&CK
  // ══════════════════════════════════════════════════════════════════════════════
  mitreTactics: wazuhProcedure
    .input(paginationSchema.extend({
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
      mitre_tactic_ids: z.union([z.string(), z.array(z.string())]).optional(),
      wait_for_complete: z.boolean().optional(),
    }).optional())
    .query(({ input }) => {
      if (!input) return proxyGet("/mitre/tactics");
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(MITRE_TACTICS_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /mitre/tactics: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/mitre/tactics", forwardedQuery), errors);
    }),

  /**
   * GET /mitre/techniques — MITRE ATT&CK techniques (broker-wired)
   *
   * Expanded to support universal params (sort, select, q, distinct)
   * plus technique_ids filter.
   */
  mitreTechniques: wazuhProcedure
    .input(paginationSchema.extend({
      search: z.string().optional(),
      sort: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
      technique_ids: z.union([z.string(), z.array(z.string())]).optional(),
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(MITRE_TECHNIQUES_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /mitre/techniques: ${unsupportedParams.join(", ")}`,
        });
      }
      return withBrokerWarnings(proxyGet("/mitre/techniques", forwardedQuery), errors);
    }),

  mitreMitigations: wazuhProcedure
    .input(paginationSchema.extend({
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
      mitre_mitigation_ids: z.union([z.string(), z.array(z.string())]).optional(),
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(MITRE_MITIGATIONS_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /mitre/mitigations: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/mitre/mitigations", forwardedQuery), errors);
    }),

  mitreSoftware: wazuhProcedure
    .input(paginationSchema.extend({
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
      mitre_software_ids: z.union([z.string(), z.array(z.string())]).optional(),
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(MITRE_SOFTWARE_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /mitre/software: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/mitre/software", forwardedQuery), errors);
    }),

  mitreGroups: wazuhProcedure
    .input(paginationSchema.extend({
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
      mitre_group_ids: z.union([z.string(), z.array(z.string())]).optional(),
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(MITRE_GROUPS_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /mitre/groups: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/mitre/groups", forwardedQuery), errors);
    }),

  mitreMetadata: wazuhProcedure.query(() => proxyGet("/mitre/metadata")),

  mitreReferences: wazuhProcedure
    .input(paginationSchema.extend({
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      mitre_reference_ids: z.union([z.string(), z.array(z.string())]).optional(),
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(MITRE_REFERENCES_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /mitre/references: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/mitre/references", forwardedQuery), errors);
    }),

  // ══════════════════════════════════════════════════════════════════════════════
  // VULNERABILITIES
  // ══════════════════════════════════════════════════════════════════════════════
  // NOTE: GET /vulnerability/{agent_id} was removed in Wazuh 4.8.
  // Per-agent vulnerability data is now in the Wazuh Indexer under
  // wazuh-states-vulnerabilities-* — use indexer.vulnSearchByAgent instead.

  // ══════════════════════════════════════════════════════════════════════════════
  // SCA / COMPLIANCE
  // ══════════════════════════════════════════════════════════════════════════════
  /**
   * GET /sca/{agent_id} — SCA policies for an agent (broker-wired)
   *
   * Previously accepted only agentId. Now supports universal params
   * plus endpoint-specific filters (name, description, references) per spec.
   */
  scaPolicies: wazuhProcedure
    .input(
      z.object({
        agentId: agentIdSchema,
        ...paginationSchema.shape,
        search: z.string().optional(),
        sort: z.string().optional(),
        q: z.string().optional(),
        select: z.union([z.string(), z.array(z.string())]).optional(),
        distinct: z.boolean().optional(),
        name: z.string().optional(),
        description: z.string().optional(),
        references: z.string().optional(),
      })
    )
    .query(({ input }) => {
      const { agentId, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SCA_POLICIES_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /sca/{agent_id}: ${unsupportedParams.join(", ")}`,
        });
      }
      return withBrokerWarnings(proxyGet(`/sca/${agentId}`, forwardedQuery), errors);
    }),

  /**
   * GET /sca/{agent_id}/checks/{policy_id} — SCA checks (broker-wired)
   *
   * Expanded to support the full spec parameter set including title, rationale,
   * remediation, command, reason, file, process, directory, registry, condition.
   */
  scaChecks: wazuhProcedure
    .input(
      z.object({
        agentId: agentIdSchema,
        policyId: policyIdSchema,
        result: z.string().optional(),
        search: z.string().optional(),
        sort: z.string().optional(),
        q: z.string().optional(),
        select: z.union([z.string(), z.array(z.string())]).optional(),
        distinct: z.boolean().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        rationale: z.string().optional(),
        remediation: z.string().optional(),
        command: z.string().optional(),
        reason: z.string().optional(),
        file: z.string().optional(),
        process: z.string().optional(),
        directory: z.string().optional(),
        registry: z.string().optional(),
        references: z.string().optional(),
        condition: z.string().optional(),
        ...paginationSchema.shape,
      })
    )
    .query(({ input }) => {
      const { agentId, policyId, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SCA_CHECKS_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /sca/{agent_id}/checks/{policy_id}: ${unsupportedParams.join(", ")}`,
        });
      }
      return withBrokerWarnings(proxyGet(`/sca/${agentId}/checks/${policyId}`, forwardedQuery), errors);
    }),

  /**
   * GET /ciscat/{agent_id}/results — CIS-CAT results (broker-wired)
   *
   * Expanded to support universal params (sort, search, select, q, distinct)
   * plus all CIS-CAT field-specific filters: benchmark, profile, pass, fail,
   * error, notchecked, unknown, score.
   */
  ciscatResults: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      ...paginationSchema.shape,
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
      benchmark: z.string().optional(),
      profile: z.string().optional(),
      pass: z.number().optional(),
      fail: z.number().optional(),
      error: z.number().optional(),
      notchecked: z.number().optional(),
      unknown: z.number().optional(),
      score: z.number().optional(),
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { agentId, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(CISCAT_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /ciscat/{agent_id}/results: ${unsupportedParams.join(", ")}`,
        });
      }
      return withBrokerWarnings(proxyGet(`/ciscat/${agentId}/results`, forwardedQuery), errors);
    }),

  // ══════════════════════════════════════════════════════════════════════════════
  // FIM / SYSCHECK
  // ══════════════════════════════════════════════════════════════════════════════
  /**
   * GET /syscheck/{agent_id} — FIM/Syscheck files (broker-wired)
   *
   * Expanded to support universal params (sort, select, q, distinct)
   * plus all field-specific filters: arch, value.name, value.type, summary,
   * md5, sha1, sha256.
   */
  syscheckFiles: wazuhProcedure
    .input(
      z.object({
        agentId: agentIdSchema,
        type: z.enum(["file", "registry"]).optional(),
        search: z.string().optional(),
        hash: z.string().optional(),
        file: z.string().optional(),
        sort: z.string().optional(),
        select: z.union([z.string(), z.array(z.string())]).optional(),
        q: z.string().optional(),
        distinct: z.boolean().optional(),
        arch: z.string().optional(),
        "value.name": z.string().optional(),
        "value.type": z.string().optional(),
        summary: z.boolean().optional(),
        md5: z.string().optional(),
        sha1: z.string().optional(),
        sha256: z.string().optional(),
        ...paginationSchema.shape,
        wait_for_complete: z.boolean().optional(),
      })
    )
    .query(({ input }) => {
      const { agentId, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SYSCHECK_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /syscheck/{agent_id}: ${unsupportedParams.join(", ")}`,
        });
      }
      return withBrokerWarnings(proxyGet(`/syscheck/${agentId}`, forwardedQuery, "syscheck"), errors);
    }),

  syscheckLastScan: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet(`/syscheck/${input.agentId}/last_scan`, {}, "syscheck")
    ),

  // ══════════════════════════════════════════════════════════════════════════════
  // ROOTCHECK
  // ══════════════════════════════════════════════════════════════════════════════
  /**
   * GET /rootcheck/{agent_id} — Rootcheck results (broker-wired)
   *
   * Expanded to support universal params (sort, search, select, q, distinct)
   * plus status, pci_dss, cis compliance filters.
   */
  rootcheckResults: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      ...paginationSchema.shape,
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
      status: z.string().optional(),
      pci_dss: z.string().optional(),
      cis: z.string().optional(),
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { agentId, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(ROOTCHECK_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /rootcheck/{agent_id}: ${unsupportedParams.join(", ")}`,
        });
      }
      return withBrokerWarnings(proxyGet(`/rootcheck/${agentId}`, forwardedQuery), errors);
    }),

  rootcheckLastScan: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet(`/rootcheck/${input.agentId}/last_scan`)
    ),

  // ══════════════════════════════════════════════════════════════════════════════
  // DECODERS
  // ══════════════════════════════════════════════════════════════════════════════
  /**
   * GET /decoders — List decoders (broker-wired)
   *
   * Expanded to support universal params (sort, select, q, distinct)
   * plus decoder_names, filename, relative_dirname, status filters.
   */
  decoders: wazuhProcedure
    .input(paginationSchema.extend({
      search: z.string().optional(),
      sort: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
      decoder_names: z.union([z.string(), z.array(z.string())]).optional(),
      filename: filenameSchema.optional(),
      relative_dirname: z.string().optional(),
      status: z.enum(["enabled", "disabled", "all"]).optional(),
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(DECODERS_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /decoders: ${unsupportedParams.join(", ")}`,
        });
      }
      return withBrokerWarnings(proxyGet("/decoders", forwardedQuery), errors);
    }),

  decoderFiles: wazuhProcedure
    .input(paginationSchema.extend({
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
      filename: filenameSchema.optional(),
      relative_dirname: z.string().optional(),
      status: z.enum(["enabled", "disabled", "all"]).optional(),
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(DECODERS_FILES_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /decoders/files: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/decoders/files", forwardedQuery), errors);
    }),

  /** Parent decoders — top-level decoders that other decoders inherit from (broker-wired) */
  decoderParents: wazuhProcedure
    .input(paginationSchema.extend({
      search: z.string().optional(),
      sort: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(DECODER_PARENTS_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /decoders/parents: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/decoders/parents", forwardedQuery), errors);
    }),

  /** View decoder file content by filename */
  decoderFileContent: wazuhProcedure
    .input(z.object({
      filename: filenameSchema,
      raw: z.boolean().optional(),
      relative_dirname: z.string().optional(),
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { filename, ...queryInput } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(DECODER_FILE_CONTENT_CONFIG, queryInput);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /decoders/files/{filename}: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet(`/decoders/files/${filename}`, forwardedQuery), errors);
    }),

  // ══════════════════════════════════════════════════════════════════════════════
  // TASKS
  // ══════════════════════════════════════════════════════════════════════════════
  /** GET /tasks/status — Task status (broker-wired) */
  taskStatus: wazuhProcedure
    .input(z.object({
      task_list: z.union([z.string(), z.array(z.number())]).optional(),
      agents_list: z.union([z.string(), z.array(z.string())]).optional(),
      command: z.string().optional(),
      node: z.string().optional(),
      module: z.string().optional(),
      status: z.string().optional(),
      ...paginationSchema.shape,
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(TASKS_STATUS_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params for /tasks/status: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/tasks/status", forwardedQuery), errors);
    }),

  // NOTE: GET /active-response does not exist in Wazuh v4.14.3.
  // The spec only defines PUT /active-response (trigger action — write operation).
  // Removed activeResponseList per audit.

  // ══════════════════════════════════════════════════════════════════════════════
  // SECURITY (RBAC info — read-only)
  // ══════════════════════════════════════════════════════════════════════════════
  /**
   * GET /security/roles — List security roles (broker-wired)
   * Supports: offset, limit, sort, search, select, q, distinct, role_ids
   */
  securityRoles: wazuhProcedure
    .input(
      paginationSchema.extend({
        search: z.string().optional(),
        sort: z.string().optional(),
        q: z.string().optional(),
        select: z.union([z.string(), z.array(z.string())]).optional(),
        distinct: z.boolean().optional(),
        role_ids: z.union([z.string(), z.array(z.string())]).optional(),
      }).optional()
    )
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SECURITY_ROLES_CONFIG, input ?? {});
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params for /security/roles: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/security/roles", forwardedQuery), errors);
    }),
  /**
   * GET /security/policies — List security policies (broker-wired)
   * Supports: offset, limit, sort, search, select, q, distinct, policy_ids
   */
  securityPolicies: wazuhProcedure
    .input(
      paginationSchema.extend({
        search: z.string().optional(),
        sort: z.string().optional(),
        q: z.string().optional(),
        select: z.union([z.string(), z.array(z.string())]).optional(),
        distinct: z.boolean().optional(),
        policy_ids: z.union([z.string(), z.array(z.string())]).optional(),
      }).optional()
    )
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SECURITY_POLICIES_CONFIG, input ?? {});
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params for /security/policies: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/security/policies", forwardedQuery), errors);
    }),
  /**
   * GET /security/users — List security users (broker-wired)
   * Supports: offset, limit, sort, search, select, q, distinct, user_ids
   */
  securityUsers: wazuhProcedure
    .input(
      paginationSchema.extend({
        search: z.string().optional(),
        sort: z.string().optional(),
        q: z.string().optional(),
        select: z.union([z.string(), z.array(z.string())]).optional(),
        distinct: z.boolean().optional(),
        user_ids: z.union([z.string(), z.array(z.string())]).optional(),
      }).optional()
    )
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SECURITY_USERS_CONFIG, input ?? {});
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params for /security/users: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/security/users", forwardedQuery), errors);
    }),

  /**
   * GET /security/users?user_ids={id} — Fetch individual user by ID
   * Uses list endpoint with user_ids filter (spec-compliant; no GET /security/users/{id} in v4.14.3)
   */
  securityUserById: wazuhProcedure
    .input(z.object({ userId: z.union([securityIdSchema, z.number()]) }))
    .query(({ input }) => proxyGet("/security/users", { user_ids: String(input.userId) })),

  /**
   * GET /security/roles?role_ids={id} — Fetch individual role by ID
   * Uses list endpoint with role_ids filter (spec-compliant; no GET /security/roles/{id} in v4.14.3)
   */
  securityRoleById: wazuhProcedure
    .input(z.object({ roleId: z.union([securityIdSchema, z.number()]) }))
    .query(({ input }) => proxyGet("/security/roles", { role_ids: String(input.roleId) })),

  /**
   * GET /security/policies?policy_ids={id} — Fetch individual policy by ID
   * Uses list endpoint with policy_ids filter (spec-compliant; no GET /security/policies/{id} in v4.14.3)
   */
  securityPolicyById: wazuhProcedure
    .input(z.object({ policyId: z.union([securityIdSchema, z.number()]) }))
    .query(({ input }) => proxyGet("/security/policies", { policy_ids: String(input.policyId) })),

  /**
   * GET /security/rules?rule_ids={id} — Fetch individual RBAC rule by ID
   * Uses list endpoint with rule_ids filter (spec-compliant; no GET /security/rules/{id} in v4.14.3)
   */
  securityRuleById: wazuhProcedure
    .input(z.object({ ruleId: z.union([securityIdSchema, z.number()]) }))
    .query(({ input }) => proxyGet("/security/rules", { rule_ids: String(input.ruleId) })),

  /**
   * GET /security/config — Security configuration (token TTL, RBAC mode)
   */
  securityConfig: wazuhProcedure
    .input(z.object({ wait_for_complete: z.boolean().optional() }).optional())
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SECURITY_CONFIG_CONFIG, input ?? {});
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /security/config: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/security/config", forwardedQuery), errors);
    }),

  /**
   * GET /security/users/me — Current authenticated user info
   */
  securityCurrentUser: wazuhProcedure
    .input(z.object({ wait_for_complete: z.boolean().optional() }).optional())
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SECURITY_CURRENT_USER_CONFIG, input ?? {});
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /security/users/me: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/security/users/me", forwardedQuery), errors);
    }),

  /**
   * GET /security/user/authenticate — Token introspection
   * Returns info about the current JWT token. Spec v4.14.3 coverage gap fill.
   */
  securityTokenInfo: wazuhProcedure
    .input(z.void())
    .query(() => proxyGet("/security/user/authenticate")),

  /**
   * GET /security/rules — List RBAC security rules
   * Sprint v2 P0 gap fill. Supports rule_ids, pagination, search, sort, q, distinct.
   */
  securityRbacRules: wazuhProcedure
    .input(
      paginationSchema.extend({
        rule_ids: z.union([z.string(), z.array(z.string())]).optional(),
        search: z.string().optional(),
        sort: z.string().optional(),
        select: z.union([z.string(), z.array(z.string())]).optional(),
        q: z.string().optional(),
        distinct: z.boolean().optional(),
        wait_for_complete: z.boolean().optional(),
      })
    )
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SECURITY_RBAC_RULES_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params for /security/rules: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/security/rules", forwardedQuery), errors);
    }),

  /**
   * GET /security/actions — List all RBAC actions
   */
  securityActions: wazuhProcedure
    .input(z.object({ endpoint: z.string().optional() }).optional())
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SECURITY_ACTIONS_CONFIG, input ?? {});
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /security/actions: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/security/actions", forwardedQuery), errors);
    }),

  /**
   * GET /security/resources — List all RBAC resources
   * Sprint v2 P0 gap fill. Optional resource filter.
   */
  securityResources: wazuhProcedure
    .input(z.object({ resource: z.string().optional() }).optional())
    .query(({ input }) => {
      const params: Record<string, string> = {};
      if (input?.resource) params.resource_list = input.resource;
      return proxyGet("/security/resources", params);
    }),

  /**
   * GET /security/users/me/policies — Current user's processed RBAC policies
   * Sprint v2 P0 gap fill. No parameters.
   */
  securityCurrentUserPolicies: wazuhProcedure.query(() => proxyGet("/security/users/me/policies")),

  // ══════════════════════════════════════════════════════════════════════════════
  // LISTS (CDB Lists — read-only)
  // ══════════════════════════════════════════════════════════════════════════════
  lists: wazuhProcedure
    .input(paginationSchema.extend({
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
      filename: filenameSchema.optional(),
      relative_dirname: z.string().optional(),
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(LISTS_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /lists: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/lists", forwardedQuery), errors);
    }),

  listsFiles: wazuhProcedure
    .input(paginationSchema.extend({
      sort: z.string().optional(),
      search: z.string().optional(),
      filename: filenameSchema.optional(),
      relative_dirname: z.string().optional(),
      wait_for_complete: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(LISTS_FILES_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /lists/files: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/lists/files", forwardedQuery), errors);
    }),

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUPS — Configuration & Files (read-only)
  // ══════════════════════════════════════════════════════════════════════════════
  /** Group configuration (agent.conf for the group) */
  groupConfiguration: wazuhProcedure
    .input(z.object({
      groupId: groupIdSchema,
      ...paginationSchema.shape,
    }))
    .query(({ input }) => {
      const params: Record<string, string | number | boolean | undefined> = {
        limit: input.limit, offset: input.offset,
      };
      return proxyGet(`/groups/${input.groupId}/configuration`, params);
    }),

  // groupFiles moved to SYSCOLLECTOR section with full broker support (H-10)

  /** GET /lists/files/{filename} — Specific CDB list file content (L-3 expanded) */
  listsFileContent: wazuhProcedure
    .input(z.object({
      filename: filenameSchema,
      raw: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const params: Record<string, string | boolean> = {};
      if (input.raw !== undefined) params.raw = input.raw;
      return proxyGet(`/lists/files/${input.filename}`, params);
    }),

  /** GET /groups/{group_id}/files/{file_name} — Specific group file content (M-11 expanded) */
  groupFileContent: wazuhProcedure
    .input(z.object({
      groupId: groupIdSchema,
      fileName: filenameSchema,
      type_agents: z.string().optional(),
      raw: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const params: Record<string, string | boolean> = {};
      if (input.type_agents) params.type = input.type_agents;
      if (input.raw !== undefined) params.raw = input.raw;
      return proxyGet(`/groups/${input.groupId}/files/${input.fileName}`, params);
    }),

  // ══════════════════════════════════════════════════════════════════════════════
  // CLUSTER PER-NODE — Sprint v2 P0 gap fill
  // ══════════════════════════════════════════════════════════════════════════════

  /** GET /cluster/{node_id}/status — Node daemon status */
  clusterNodeStatus: wazuhProcedure
    .input(z.object({ nodeId: nodeIdSchema }))
    .query(({ input }) => proxyGet(`/cluster/${input.nodeId}/status`)),

  /** GET /cluster/{node_id}/configuration — Node config (broker-wired: section, field, raw) */
  clusterNodeConfiguration: wazuhProcedure
    .input(z.object({
      nodeId: nodeIdSchema,
      section: z.string().optional(),
      field: z.string().optional(),
      raw: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const { nodeId, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(CLUSTER_NODE_CONFIGURATION_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params for /cluster/{node_id}/configuration: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet(`/cluster/${nodeId}/configuration`, forwardedQuery), errors);
    }),

  /** GET /cluster/{node_id}/configuration/{component}/{configuration} — Granular node config */
  clusterNodeComponentConfig: wazuhProcedure
    .input(z.object({ nodeId: nodeIdSchema, component: componentSchema, configuration: configurationSchema }))
    .query(({ input }) => proxyGet(`/cluster/${input.nodeId}/configuration/${input.component}/${input.configuration}`)),

  /** GET /cluster/{node_id}/daemons/stats — Node daemon statistics (M-6 expanded) */
  clusterNodeDaemonStats: wazuhProcedure
    .input(z.object({
      nodeId: nodeIdSchema,
      daemons_list: z.union([z.string(), z.array(z.string())]).optional(),
    }))
    .query(({ input }) => {
      const params: Record<string, string> = {};
      if (input.daemons_list) params.daemons_list = Array.isArray(input.daemons_list) ? input.daemons_list.join(",") : input.daemons_list;
      return proxyGet(`/cluster/${input.nodeId}/daemons/stats`, params);
    }),

  /** GET /cluster/{node_id}/logs — Node logs (broker-wired) */
  clusterNodeLogs: wazuhProcedure
    .input(z.object({
      nodeId: nodeIdSchema,
      ...paginationSchema.shape,
      sort: z.string().optional(),
      search: z.string().optional(),
      tag: z.string().optional(),
      level: z.string().optional(),
      q: z.string().optional(),
    }))
    .query(({ input }) => {
      const { nodeId, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(CLUSTER_NODE_LOGS_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported params for /cluster/{node_id}/logs: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet(`/cluster/${nodeId}/logs`, forwardedQuery), errors);
    }),

  /** GET /cluster/{node_id}/logs/summary — Node log summary */
  clusterNodeLogsSummary: wazuhProcedure
    .input(z.object({ nodeId: nodeIdSchema }))
    .query(({ input }) => proxyGet(`/cluster/${input.nodeId}/logs/summary`)),

  /** GET /cluster/{node_id}/stats/analysisd — Node analysisd stats */
  clusterNodeStatsAnalysisd: wazuhProcedure
    .input(z.object({ nodeId: nodeIdSchema }))
    .query(({ input }) => proxyGet(`/cluster/${input.nodeId}/stats/analysisd`)),

  /** GET /cluster/{node_id}/stats/remoted — Node remoted stats */
  clusterNodeStatsRemoted: wazuhProcedure
    .input(z.object({ nodeId: nodeIdSchema }))
    .query(({ input }) => proxyGet(`/cluster/${input.nodeId}/stats/remoted`)),

  /** GET /cluster/{node_id}/stats/weekly — Node weekly stats */
  clusterNodeStatsWeekly: wazuhProcedure
    .input(z.object({ nodeId: nodeIdSchema }))
    .query(({ input }) => proxyGet(`/cluster/${input.nodeId}/stats/weekly`)),

  // ══════════════════════════════════════════════════════════════════════════════
  // BROKER COVERAGE ANALYSIS
  // ══════════════════════════════════════════════════════════════════════════════
  /**
   * Broker Coverage Report — static analysis of the Wazuh API surface.
   * Returns coverage metrics, per-endpoint wiring levels, and broker config summaries.
   * No Wazuh API calls are made — this is pure server-side introspection.
   */
  brokerCoverage: protectedProcedure
    .query(() => {
      return generateCoverageReport();
    }),

  /**
   * Broker Param Playground — test arbitrary params against any broker config.
   * Returns the broker result (forwarded, unsupported, errors) without making
   * any actual Wazuh API call. Pure server-side validation.
   */
  brokerPlayground: protectedProcedure
    .input(z.object({
      configName: z.string(),
      params: z.record(z.string(), z.unknown()),
    }))
    .mutation(({ input }) => {
      const entry = BROKER_CONFIG_REGISTRY.find(e => e.name === input.configName);
      if (!entry) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Unknown broker config: ${input.configName}`,
        });
      }
      const result = brokerParams(entry.config, input.params);
      // Also return the config metadata for the UI
      const paramDefs = Object.entries(entry.config.params).map(([key, def]) => ({
        key,
        wazuhName: def.wazuhName,
        type: def.type,
        description: def.description,
        aliases: def.aliases || [],
      }));
      return {
        configName: input.configName,
        endpoint: entry.config.endpoint,
        ...result,
        paramDefs,
      };
    }),

  /** List all available broker configs for the playground dropdown */
  brokerConfigList: protectedProcedure
    .query(() => {
      return BROKER_CONFIG_REGISTRY.map(e => ({
        name: e.name,
        endpoint: e.config.endpoint,
        paramCount: Object.keys(e.config.params).length,
        params: Object.entries(e.config.params).map(([key, def]) => ({
          key,
          wazuhName: def.wazuhName,
          type: def.type,
          description: def.description,
          aliases: def.aliases || [],
          enumValues: def.enumValues || [],
        })),
      }));
    }),

  // ══════════════════════════════════════════════════════════════════════════════
  // REQUEST CACHE MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════════

  /** Get cache statistics — hits, misses, coalesced, hit rate, TTL */
  cacheStats: protectedProcedure
    .query((): CacheStats => getCacheStats()),

  /** Clear all cached responses (admin only) */
  cacheClear: adminProcedure
    .mutation(() => {
      clearCache();
      return { success: true as const, message: "Cache cleared" };
    }),

  /** Update cache TTL in milliseconds (admin only, 0-60000ms) */
  cacheSetTtl: adminProcedure
    .input(z.object({ ttlMs: z.number().int().min(0).max(60000) }))
    .mutation(({ input }) => {
      setTtl(input.ttlMs);
      return { success: true as const, ttlMs: input.ttlMs };
    }),

  /** Enable or disable the request cache (admin only) */
  cacheSetEnabled: adminProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(({ input }) => {
      setCacheEnabled(input.enabled);
      return { success: true as const, enabled: input.enabled };
    }),
});
