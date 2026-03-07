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
} from "./paramBroker";
import { generateCoverageReport } from "./brokerCoverage";

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

// ── Helper: wrap with config check (uses DB override → env fallback) ─────────
async function proxyGet(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
  group?: string
) {
  const config = await getEffectiveWazuhConfig();
  if (!config) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Wazuh is not configured. Set connection settings in Admin > Connection Settings or via environment variables." });
  const userId = getCurrentUserId();
  return wazuhGet(config, { path, params, rateLimitGroup: group, userId });
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
  managerStats: wazuhProcedure.query(() => proxyGet("/manager/stats")),
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
      component: z.string(),
      configuration: z.string(),
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
    .input(z.object({ nodeId: z.string() }))
    .query(({ input }) => proxyGet(`/cluster/${input.nodeId}/info`)),

  clusterNodeStats: wazuhProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(({ input }) => proxyGet(`/cluster/${input.nodeId}/stats`)),

  clusterNodeStatsHourly: wazuhProcedure
    .input(z.object({ nodeId: z.string() }))
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
    .input(z.object({ agentId: agentIdSchema, component: z.string().default("logcollector") }))
    .query(({ input }) =>
      proxyGet(`/agents/${input.agentId}/stats/${input.component}`)
    ),

  agentConfig: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      component: z.string(),
      configuration: z.string(),
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
  agentsOutdated: wazuhProcedure
    .input(paginationSchema.extend({
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
    }))
    .query(({ input }) => {
      const params: Record<string, string | number | boolean | undefined> = {
        limit: input.limit, offset: input.offset,
      };
      if (input.sort) params.sort = input.sort;
      if (input.search) params.search = input.search;
      if (input.select) params.select = Array.isArray(input.select) ? input.select.join(",") : input.select;
      if (input.q) params.q = input.q;
      return proxyGet("/agents/outdated", params);
    }),

  /** Agents not assigned to any group (M-2 expanded) */
  agentsNoGroup: wazuhProcedure
    .input(paginationSchema.extend({
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
    }))
    .query(({ input }) => {
      const params: Record<string, string | number | boolean | undefined> = {
        limit: input.limit, offset: input.offset,
      };
      if (input.sort) params.sort = input.sort;
      if (input.search) params.search = input.search;
      if (input.select) params.select = Array.isArray(input.select) ? input.select.join(",") : input.select;
      if (input.q) params.q = input.q;
      return proxyGet("/agents/no_group", params);
    }),

  /** Agent stats distinct — unique field values across agents (M-3 expanded) */
  agentsStatsDistinct: wazuhProcedure
    .input(z.object({
      fields: z.string(),
      ...paginationSchema.shape,
      sort: z.string().optional(),
      search: z.string().optional(),
      q: z.string().optional(),
    }))
    .query(({ input }) => {
      const params: Record<string, string | number | boolean | undefined> = {
        fields: input.fields, limit: input.limit, offset: input.offset,
      };
      if (input.sort) params.sort = input.sort;
      if (input.search) params.search = input.search;
      if (input.q) params.q = input.q;
      return proxyGet("/agents/stats/distinct", params);
    }),

  /**
   * GET /groups/{group_id}/agents — Agents in a group (broker-wired)
   *
   * Expanded to support universal params (sort, search, select, q, distinct)
   * plus endpoint-specific status filter.
   */
  agentGroupMembers: wazuhProcedure
    .input(z.object({
      groupId: z.string(),
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
    }))
    .query(({ input }) => {
      const params: Record<string, string> = {};
      if (input.select) params.select = Array.isArray(input.select) ? input.select.join(",") : input.select;
      return proxyGet(`/syscollector/${input.agentId}/os`, params);
    }),

  agentHardware: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      select: z.union([z.string(), z.array(z.string())]).optional(),
    }))
    .query(({ input }) => {
      const params: Record<string, string> = {};
      if (input.select) params.select = Array.isArray(input.select) ? input.select.join(",") : input.select;
      return proxyGet(`/syscollector/${input.agentId}/hardware`, params);
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
      mac: z.string().optional(),
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
      groupId: z.string(),
      ...paginationSchema.shape,
      sort: z.string().optional(),
      search: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
      hash: z.string().optional(),
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
  agentBrowserExtensions: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      ...paginationSchema.shape,
      sort: z.string().optional(),
      search: z.string().optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const params: Record<string, string | number | boolean | undefined> = {
        limit: input.limit, offset: input.offset,
      };
      if (input.sort) params.sort = input.sort;
      if (input.search) params.search = input.search;
      if (input.q) params.q = input.q;
      if (input.distinct !== undefined) params.distinct = input.distinct;
      return proxyGet(`/syscollector/${input.agentId}/browser_extensions`, params)
        .catch(() => ({ data: { affected_items: [], total_affected_items: 0 } }));
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
        .catch(() => ({ data: { affected_items: [], total_affected_items: 0 } }));
    }),

  /** Local users on the agent (M-14 expanded) */
  agentUsers: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      ...paginationSchema.shape,
      sort: z.string().optional(),
      search: z.string().optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const params: Record<string, string | number | boolean | undefined> = {
        limit: input.limit, offset: input.offset,
      };
      if (input.sort) params.sort = input.sort;
      if (input.search) params.search = input.search;
      if (input.q) params.q = input.q;
      if (input.distinct !== undefined) params.distinct = input.distinct;
      return proxyGet(`/syscollector/${input.agentId}/users`, params)
        .catch(() => ({ data: { affected_items: [], total_affected_items: 0 } }));
    }),

  /** Local groups on the agent (M-15 expanded) */
  agentGroups2: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      ...paginationSchema.shape,
      sort: z.string().optional(),
      search: z.string().optional(),
      q: z.string().optional(),
      distinct: z.boolean().optional(),
    }))
    .query(({ input }) => {
      const params: Record<string, string | number | boolean | undefined> = {
        limit: input.limit, offset: input.offset,
      };
      if (input.sort) params.sort = input.sort;
      if (input.search) params.search = input.search;
      if (input.q) params.q = input.q;
      if (input.distinct !== undefined) params.distinct = input.distinct;
      return proxyGet(`/syscollector/${input.agentId}/groups`, params)
        .catch(() => ({ data: { affected_items: [], total_affected_items: 0 } }));
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
    }))
    .query(({ input }) => {
      const { agentId, ...rest } = input;
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(SYSCOLLECTOR_NETPROTO_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /syscollector/{agent_id}/netproto: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet(`/syscollector/${agentId}/netproto`, forwardedQuery), errors)
        .catch(() => ({ data: { affected_items: [], total_affected_items: 0 } }));
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

  /** GET /experimental/syscollector/netaddr — All network addresses across all agents (M-17 expanded) */
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
      const params: Record<string, string> = {};
      if (input.limit) params.limit = String(input.limit);
      if (input.offset) params.offset = String(input.offset);
      if (input.search) params.search = input.search;
      if (input.q) params.q = input.q;
      if (input.sort) params.sort = input.sort;
      if (input.select) params.select = Array.isArray(input.select) ? input.select.join(",") : input.select;
      if (input.distinct !== undefined) params.distinct = String(input.distinct);
      if (input.agents_list) params.agents_list = Array.isArray(input.agents_list) ? input.agents_list.join(",") : input.agents_list;
      if (input.proto) params.proto = input.proto;
      if (input.address) params.address = input.address;
      if (input.broadcast) params.broadcast = input.broadcast;
      if (input.netmask) params.netmask = input.netmask;
      return proxyGet("/experimental/syscollector/netaddr", params);
    }),

  /** GET /experimental/syscollector/netiface — All network interfaces across all agents (M-18 expanded) */
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
      mac: z.string().optional(),
    }))
    .query(({ input }) => {
      const params: Record<string, string> = {};
      if (input.limit) params.limit = String(input.limit);
      if (input.offset) params.offset = String(input.offset);
      if (input.search) params.search = input.search;
      if (input.q) params.q = input.q;
      if (input.sort) params.sort = input.sort;
      if (input.select) params.select = Array.isArray(input.select) ? input.select.join(",") : input.select;
      if (input.distinct !== undefined) params.distinct = String(input.distinct);
      if (input.agents_list) params.agents_list = Array.isArray(input.agents_list) ? input.agents_list.join(",") : input.agents_list;
      if (input.name) params.name = input.name;
      if (input.adapter) params.adapter = input.adapter;
      if (input.type) params.type = input.type;
      if (input.state) params.state = input.state;
      if (input.mtu) params.mtu = input.mtu;
      if (input["tx.packets"]) params["tx.packets"] = input["tx.packets"];
      if (input["rx.packets"]) params["rx.packets"] = input["rx.packets"];
      if (input["tx.bytes"]) params["tx.bytes"] = input["tx.bytes"];
      if (input["rx.bytes"]) params["rx.bytes"] = input["rx.bytes"];
      if (input["tx.errors"]) params["tx.errors"] = input["tx.errors"];
      if (input["rx.errors"]) params["rx.errors"] = input["rx.errors"];
      if (input["tx.dropped"]) params["tx.dropped"] = input["tx.dropped"];
      if (input["rx.dropped"]) params["rx.dropped"] = input["rx.dropped"];
      if (input.mac) params.mac = input.mac;
      return proxyGet("/experimental/syscollector/netiface", params);
    }),

  /** GET /experimental/syscollector/netproto — All network protocols across all agents */
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
      const params: Record<string, string> = {};
      if (input.limit) params.limit = String(input.limit);
      if (input.offset) params.offset = String(input.offset);
      if (input.search) params.search = input.search;
      if (input.q) params.q = input.q;
      if (input.sort) params.sort = input.sort;
      if (input.select) params.select = Array.isArray(input.select) ? input.select.join(",") : input.select;
      if (input.distinct !== undefined) params.distinct = String(input.distinct);
      if (input.agents_list) params.agents_list = Array.isArray(input.agents_list) ? input.agents_list.join(",") : input.agents_list;
      return proxyGet("/experimental/syscollector/netproto", params);
    }),

  /** GET /experimental/syscollector/os — All OS info across all agents */
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
      const params: Record<string, string> = {};
      if (input.limit) params.limit = String(input.limit);
      if (input.offset) params.offset = String(input.offset);
      if (input.search) params.search = input.search;
      if (input.q) params.q = input.q;
      if (input.sort) params.sort = input.sort;
      if (input.select) params.select = Array.isArray(input.select) ? input.select.join(",") : input.select;
      if (input.distinct !== undefined) params.distinct = String(input.distinct);
      if (input.agents_list) params.agents_list = Array.isArray(input.agents_list) ? input.agents_list.join(",") : input.agents_list;
      return proxyGet("/experimental/syscollector/os", params);
    }),

  /** GET /experimental/syscollector/hardware — All hardware info across all agents */
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
      const params: Record<string, string> = {};
      if (input.limit) params.limit = String(input.limit);
      if (input.offset) params.offset = String(input.offset);
      if (input.search) params.search = input.search;
      if (input.q) params.q = input.q;
      if (input.sort) params.sort = input.sort;
      if (input.select) params.select = Array.isArray(input.select) ? input.select.join(",") : input.select;
      if (input.distinct !== undefined) params.distinct = String(input.distinct);
      if (input.agents_list) params.agents_list = Array.isArray(input.agents_list) ? input.agents_list.join(",") : input.agents_list;
      return proxyGet("/experimental/syscollector/hardware", params);
    }),

  /** GET /experimental/syscollector/hotfixes — All hotfixes across all agents (L-6 expanded) */
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
      const params: Record<string, string> = {};
      if (input.limit) params.limit = String(input.limit);
      if (input.offset) params.offset = String(input.offset);
      if (input.search) params.search = input.search;
      if (input.q) params.q = input.q;
      if (input.sort) params.sort = input.sort;
      if (input.select) params.select = Array.isArray(input.select) ? input.select.join(",") : input.select;
      if (input.distinct !== undefined) params.distinct = String(input.distinct);
      if (input.agents_list) params.agents_list = Array.isArray(input.agents_list) ? input.agents_list.join(",") : input.agents_list;
      if (input.hotfix) params.hotfix = input.hotfix;
      return proxyGet("/experimental/syscollector/hotfixes", params);
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
        filename: z.string().optional(),
        relative_dirname: z.string().optional(),
        pci_dss: z.string().optional(),
        gdpr: z.string().optional(),
        gpg13: z.string().optional(),
        hipaa: z.string().optional(),
        "nist-800-53": z.string().optional(),
        tsc: z.string().optional(),
        mitre: z.string().optional(),
        rule_ids: z.union([z.string(), z.array(z.string())]).optional(),
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
      requirement: z.string(),
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
      filename: z.string().optional(),
      relative_dirname: z.string().optional(),
      status: z.enum(["enabled", "disabled", "all"]).optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(RULES_FILES_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /rules/files: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/rules/files", forwardedQuery), errors);
    }),

  /** View rule file content by filename (L-1 expanded) */
  ruleFileContent: wazuhProcedure
    .input(z.object({
      filename: z.string(),
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
      q: z.string().optional(),
      mitre_reference_ids: z.union([z.string(), z.array(z.string())]).optional(),
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
        policyId: z.string(),
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
      filename: z.string().optional(),
      relative_dirname: z.string().optional(),
      status: z.enum(["enabled", "disabled", "all"]).optional(),
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
      filename: z.string().optional(),
      relative_dirname: z.string().optional(),
      status: z.enum(["enabled", "disabled", "all"]).optional(),
    }))
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams, errors } = brokerParams(DECODERS_FILES_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Unsupported parameters for /decoders/files: ${unsupportedParams.join(", ")}` });
      }
      return withBrokerWarnings(proxyGet("/decoders/files", forwardedQuery), errors);
    }),

  /** Parent decoders — top-level decoders that other decoders inherit from (M-9 expanded) */
  decoderParents: wazuhProcedure
    .input(paginationSchema.extend({
      search: z.string().optional(),
      sort: z.string().optional(),
      select: z.union([z.string(), z.array(z.string())]).optional(),
    }))
    .query(({ input }) => {
      const params: Record<string, string | number | boolean | undefined> = {
        limit: input.limit, offset: input.offset,
      };
      if (input.search) params.search = input.search;
      if (input.sort) params.sort = input.sort;
      if (input.select) params.select = Array.isArray(input.select) ? input.select.join(",") : input.select;
      return proxyGet("/decoders/parents", params);
    }),

  /** View decoder file content by filename (L-2 expanded) */
  decoderFileContent: wazuhProcedure
    .input(z.object({
      filename: z.string(),
      raw: z.boolean().optional(),
      get_dirnames_path: z.string().optional(),
    }))
    .query(({ input }) => {
      const params: Record<string, string | boolean> = {};
      if (input.raw !== undefined) params.raw = input.raw;
      if (input.get_dirnames_path) params.get_dirnames_path = input.get_dirnames_path;
      return proxyGet(`/decoders/files/${input.filename}`, params);
    }),

  // ══════════════════════════════════════════════════════════════════════════════
  // TASKS
  // ══════════════════════════════════════════════════════════════════════════════
  taskStatus: wazuhProcedure
    .input(z.object({
      taskIds: z.array(z.number()).optional(),
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
      const params: Record<string, string | number | boolean | undefined> = {};
      if (input.taskIds?.length) params.task_list = input.taskIds.join(",");
      if (input.agents_list) params.agents_list = Array.isArray(input.agents_list) ? input.agents_list.join(",") : input.agents_list;
      if (input.command) params.command = input.command;
      if (input.node) params.node = input.node;
      if (input.module) params.module = input.module;
      if (input.status) params.status = input.status;
      params.limit = input.limit;
      params.offset = input.offset;
      if (input.sort) params.sort = input.sort;
      if (input.search) params.search = input.search;
      if (input.select) params.select = Array.isArray(input.select) ? input.select.join(",") : input.select;
      if (input.q) params.q = input.q;
      return proxyGet("/tasks/status", params);
    }),

  // NOTE: GET /active-response does not exist in Wazuh v4.14.3.
  // The spec only defines PUT /active-response (trigger action — write operation).
  // Removed activeResponseList per audit.

  // ══════════════════════════════════════════════════════════════════════════════
  // SECURITY (RBAC info — read-only)
  // ══════════════════════════════════════════════════════════════════════════════
  securityRoles: wazuhProcedure.query(() => proxyGet("/security/roles")),
  securityPolicies: wazuhProcedure.query(() => proxyGet("/security/policies")),
  securityUsers: wazuhProcedure.query(() => proxyGet("/security/users")),

  /** GET /security/users/{user_id} — Fetch individual user by ID (C-4 gap fill) */
  securityUserById: wazuhProcedure
    .input(z.object({ userId: z.union([z.string(), z.number()]) }))
    .query(({ input }) => proxyGet(`/security/users/${input.userId}`)),

  /** GET /security/roles/{role_id} — Fetch individual role by ID (C-4 gap fill) */
  securityRoleById: wazuhProcedure
    .input(z.object({ roleId: z.union([z.string(), z.number()]) }))
    .query(({ input }) => proxyGet(`/security/roles/${input.roleId}`)),

  /** GET /security/policies/{policy_id} — Fetch individual policy by ID (C-4 gap fill) */
  securityPolicyById: wazuhProcedure
    .input(z.object({ policyId: z.union([z.string(), z.number()]) }))
    .query(({ input }) => proxyGet(`/security/policies/${input.policyId}`)),

  /** GET /security/rules/{rule_id} — Fetch individual RBAC rule by ID (C-4 gap fill) */
  securityRuleById: wazuhProcedure
    .input(z.object({ ruleId: z.union([z.string(), z.number()]) }))
    .query(({ input }) => proxyGet(`/security/rules/${input.ruleId}`)),

  /**
   * GET /security/config — Security configuration (token TTL, RBAC mode)
   * P2 GAP fill. No parameters beyond pretty/wait_for_complete.
   */
  securityConfig: wazuhProcedure.query(() => proxyGet("/security/config")),

  /**
   * GET /security/users/me — Current authenticated user info
   * P2 GAP fill. No parameters beyond pretty/wait_for_complete.
   */
  securityCurrentUser: wazuhProcedure.query(() => proxyGet("/security/users/me")),

  /**
   * GET /security/rules — List RBAC security rules
   * Sprint v2 P0 gap fill. Supports rule_ids, pagination, search, sort, q, distinct.
   */
  securityRbacRules: wazuhProcedure
    .input(
      paginationSchema.extend({
        rule_ids: z.union([z.string(), z.array(z.string())]).optional(),
        search: z.string().optional(),
        select: z.union([z.string(), z.array(z.string())]).optional(),
        sort: z.string().optional(),
        q: z.string().optional(),
        distinct: z.boolean().optional(),
      })
    )
    .query(({ input }) => {
      const { limit, offset, ...rest } = input;
      const params: Record<string, string | number | boolean> = { limit, offset };
      if (rest.rule_ids) params.rule_ids = Array.isArray(rest.rule_ids) ? rest.rule_ids.join(",") : rest.rule_ids;
      if (rest.search) params.search = rest.search;
      if (rest.select) params.select = Array.isArray(rest.select) ? rest.select.join(",") : rest.select;
      if (rest.sort) params.sort = rest.sort;
      if (rest.q) params.q = rest.q;
      if (rest.distinct !== undefined) params.distinct = rest.distinct;
      return proxyGet("/security/rules", params);
    }),

  /**
   * GET /security/actions — List all RBAC actions
   * Sprint v2 P0 gap fill. Optional endpoint filter.
   */
  securityActions: wazuhProcedure
    .input(z.object({ endpoint: z.string().optional() }).optional())
    .query(({ input }) => {
      const params: Record<string, string> = {};
      if (input?.endpoint) params.endpoint = input.endpoint;
      return proxyGet("/security/actions", params);
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
      filename: z.string().optional(),
      relative_dirname: z.string().optional(),
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
      filename: z.string().optional(),
      relative_dirname: z.string().optional(),
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
      groupId: z.string(),
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
      filename: z.string(),
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
      groupId: z.string(),
      fileName: z.string(),
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
    .input(z.object({ nodeId: z.string() }))
    .query(({ input }) => proxyGet(`/cluster/${input.nodeId}/status`)),

  /** GET /cluster/{node_id}/configuration — Full node configuration */
  clusterNodeConfiguration: wazuhProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(({ input }) => proxyGet(`/cluster/${input.nodeId}/configuration`)),

  /** GET /cluster/{node_id}/configuration/{component}/{configuration} — Granular node config */
  clusterNodeComponentConfig: wazuhProcedure
    .input(z.object({ nodeId: z.string(), component: z.string(), configuration: z.string() }))
    .query(({ input }) => proxyGet(`/cluster/${input.nodeId}/configuration/${input.component}/${input.configuration}`)),

  /** GET /cluster/{node_id}/daemons/stats — Node daemon statistics (M-6 expanded) */
  clusterNodeDaemonStats: wazuhProcedure
    .input(z.object({
      nodeId: z.string(),
      daemons_list: z.union([z.string(), z.array(z.string())]).optional(),
    }))
    .query(({ input }) => {
      const params: Record<string, string> = {};
      if (input.daemons_list) params.daemons_list = Array.isArray(input.daemons_list) ? input.daemons_list.join(",") : input.daemons_list;
      return proxyGet(`/cluster/${input.nodeId}/daemons/stats`, params);
    }),

  /** GET /cluster/{node_id}/logs — Node logs */
  clusterNodeLogs: wazuhProcedure
    .input(z.object({
      nodeId: z.string(),
      ...paginationSchema.shape,
      sort: z.string().optional(),
      search: z.string().optional(),
      tag: z.string().optional(),
      level: z.string().optional(),
      q: z.string().optional(),
    }))
    .query(({ input }) => {
      const { nodeId, ...rest } = input;
      const params: Record<string, string> = {};
      if (rest.limit) params.limit = String(rest.limit);
      if (rest.offset) params.offset = String(rest.offset);
      if (rest.sort) params.sort = rest.sort;
      if (rest.search) params.search = rest.search;
      if (rest.tag) params.tag = rest.tag;
      if (rest.level) params.level = rest.level;
      if (rest.q) params.q = rest.q;
      return proxyGet(`/cluster/${nodeId}/logs`, params);
    }),

  /** GET /cluster/{node_id}/logs/summary — Node log summary */
  clusterNodeLogsSummary: wazuhProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(({ input }) => proxyGet(`/cluster/${input.nodeId}/logs/summary`)),

  /** GET /cluster/{node_id}/stats/analysisd — Node analysisd stats */
  clusterNodeStatsAnalysisd: wazuhProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(({ input }) => proxyGet(`/cluster/${input.nodeId}/stats/analysisd`)),

  /** GET /cluster/{node_id}/stats/remoted — Node remoted stats */
  clusterNodeStatsRemoted: wazuhProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(({ input }) => proxyGet(`/cluster/${input.nodeId}/stats/remoted`)),

  /** GET /cluster/{node_id}/stats/weekly — Node weekly stats */
  clusterNodeStatsWeekly: wazuhProcedure
    .input(z.object({ nodeId: z.string() }))
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
});
