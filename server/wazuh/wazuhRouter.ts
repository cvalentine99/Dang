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
import { protectedProcedure, router } from "../_core/trpc";
import { getWazuhConfig, isWazuhConfigured, wazuhGet, getEffectiveWazuhConfig, isWazuhEffectivelyConfigured } from "./wazuhClient";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  brokerParams,
  MANAGER_CONFIG,
  AGENTS_CONFIG,
  RULES_CONFIG,
  GROUPS_CONFIG,
  CLUSTER_NODES_CONFIG,
  SCA_POLICIES_CONFIG,
  SCA_CHECKS_CONFIG,
} from "./paramBroker";

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
      const { forwardedQuery, unsupportedParams } = brokerParams(MANAGER_CONFIG, params);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /manager/configuration: ${unsupportedParams.join(", ")}`,
        });
      }
      return proxyGet("/manager/configuration", forwardedQuery);
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
  managerLogs: wazuhProcedure
    .input(
      paginationSchema.extend({
        level: z.enum(["info", "error", "warning", "debug"]).optional(),
        tag: z.string().optional(),
        search: z.string().optional(),
      })
    )
    .query(({ input }) =>
      proxyGet("/manager/logs", {
        limit: input.limit,
        offset: input.offset,
        level: input.level,
        tag: input.tag,
        search: input.search,
      }, "alerts")
    ),

  managerLogsSummary: wazuhProcedure.query(() =>
    proxyGet("/manager/logs/summary", {}, "alerts")
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
      }).optional()
    )
    .query(({ input }) => {
      if (!input) return proxyGet("/cluster/nodes");
      const { forwardedQuery, unsupportedParams } = brokerParams(CLUSTER_NODES_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /cluster/nodes: ${unsupportedParams.join(", ")}`,
        });
      }
      return proxyGet("/cluster/nodes", forwardedQuery);
    }),
  clusterHealthcheck: wazuhProcedure.query(() => proxyGet("/cluster/healthcheck")),
  clusterLocalInfo: wazuhProcedure.query(() => proxyGet("/cluster/local/info")),
  clusterLocalConfig: wazuhProcedure.query(() => proxyGet("/cluster/local/config")),

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
      })
    )
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams } = brokerParams(AGENTS_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /agents: ${unsupportedParams.join(", ")}`,
        });
      }
      return proxyGet("/agents", forwardedQuery);
    }),

  agentSummaryStatus: wazuhProcedure.query(() =>
    proxyGet("/agents/summary/status")
  ),

  agentSummaryOs: wazuhProcedure.query(() =>
    proxyGet("/agents/summary/os")
  ),

  agentOverview: wazuhProcedure.query(() =>
    proxyGet("/overview/agents")
  ),

  agentById: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet("/agents", { agents_list: input.agentId })
    ),

  agentKey: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet(`/agents/${input.agentId}/key`)
    ),

  agentDaemonStats: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet(`/agents/${input.agentId}/daemons/stats`)
    ),

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
      }).optional()
    )
    .query(({ input }) => {
      if (!input) return proxyGet("/groups");
      const { forwardedQuery, unsupportedParams } = brokerParams(GROUPS_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /groups: ${unsupportedParams.join(", ")}`,
        });
      }
      return proxyGet("/groups", forwardedQuery);
    }),

  /** Agents with outdated version compared to manager */
  agentsOutdated: wazuhProcedure
    .input(paginationSchema)
    .query(({ input }) =>
      proxyGet("/agents/outdated", { limit: input.limit, offset: input.offset })
    ),

  /** Agents not assigned to any group */
  agentsNoGroup: wazuhProcedure
    .input(paginationSchema)
    .query(({ input }) =>
      proxyGet("/agents/no_group", { limit: input.limit, offset: input.offset })
    ),

  /** Agent stats distinct — unique field values across agents */
  agentsStatsDistinct: wazuhProcedure
    .input(z.object({ fields: z.string() }))
    .query(({ input }) =>
      proxyGet("/agents/stats/distinct", { fields: input.fields })
    ),

  agentGroupMembers: wazuhProcedure
    .input(z.object({ groupId: z.string(), ...paginationSchema.shape }))
    .query(({ input }) =>
      proxyGet(`/groups/${input.groupId}/agents`, {
        limit: input.limit,
        offset: input.offset,
      })
    ),

  // ══════════════════════════════════════════════════════════════════════════════
  // SYSCOLLECTOR (IT Hygiene)
  // ══════════════════════════════════════════════════════════════════════════════
  agentOs: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet(`/syscollector/${input.agentId}/os`)
    ),

  agentHardware: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet(`/syscollector/${input.agentId}/hardware`)
    ),

  agentPackages: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      search: z.string().optional(),
      ...paginationSchema.shape,
    }))
    .query(({ input }) =>
      proxyGet(`/syscollector/${input.agentId}/packages`, {
        limit: input.limit,
        offset: input.offset,
        search: input.search,
      })
    ),

  agentPorts: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      ...paginationSchema.shape,
    }))
    .query(({ input }) =>
      proxyGet(`/syscollector/${input.agentId}/ports`, {
        limit: input.limit,
        offset: input.offset,
      })
    ),

  agentProcesses: wazuhProcedure
    .input(z.object({
      agentId: agentIdSchema,
      search: z.string().optional(),
      ...paginationSchema.shape,
    }))
    .query(({ input }) =>
      proxyGet(`/syscollector/${input.agentId}/processes`, {
        limit: input.limit,
        offset: input.offset,
        search: input.search,
      })
    ),

  agentNetaddr: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet(`/syscollector/${input.agentId}/netaddr`)
    ),

  agentNetiface: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet(`/syscollector/${input.agentId}/netiface`)
    ),

  agentHotfixes: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema, ...paginationSchema.shape }))
    .query(({ input }) =>
      proxyGet(`/syscollector/${input.agentId}/hotfixes`, {
        limit: input.limit,
        offset: input.offset,
      })
    ),

  // ══════════════════════════════════════════════════════════════════════════════
  // SYSCOLLECTOR — EXTENSIONS / SERVICES / IDENTITY
  // ══════════════════════════════════════════════════════════════════════════════

  /** Browser extensions installed on the agent (Windows only) */
  agentBrowserExtensions: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema, ...paginationSchema.shape }))
    .query(({ input }) =>
      proxyGet(`/syscollector/${input.agentId}/browser_extensions`, {
        limit: input.limit,
        offset: input.offset,
      }).catch(() => ({ data: { affected_items: [], total_affected_items: 0 } }))
    ),

  /** System services / daemons (Windows services, systemd units) */
  agentServices: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema, ...paginationSchema.shape }))
    .query(({ input }) =>
      proxyGet(`/syscollector/${input.agentId}/services`, {
        limit: input.limit,
        offset: input.offset,
      }).catch(() => ({ data: { affected_items: [], total_affected_items: 0 } }))
    ),

  /** Local users on the agent */
  agentUsers: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema, ...paginationSchema.shape }))
    .query(({ input }) =>
      proxyGet(`/syscollector/${input.agentId}/users`, {
        limit: input.limit,
        offset: input.offset,
      }).catch(() => ({ data: { affected_items: [], total_affected_items: 0 } }))
    ),

  /** Local groups on the agent */
  agentGroups2: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema, ...paginationSchema.shape }))
    .query(({ input }) =>
      proxyGet(`/syscollector/${input.agentId}/groups`, {
        limit: input.limit,
        offset: input.offset,
      }).catch(() => ({ data: { affected_items: [], total_affected_items: 0 } }))
    ),

  /** Network protocol inventory per agent */
  agentNetproto: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema, ...paginationSchema.shape }))
    .query(({ input }) =>
      proxyGet(`/syscollector/${input.agentId}/netproto`, {
        limit: input.limit,
        offset: input.offset,
      }).catch(() => ({ data: { affected_items: [], total_affected_items: 0 } }))
    ),

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
      })
    )
    .query(({ input }) => {
      const { forwardedQuery, unsupportedParams } = brokerParams(RULES_CONFIG, input);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /rules: ${unsupportedParams.join(", ")}`,
        });
      }
      return proxyGet("/rules", forwardedQuery);
    }),

  ruleGroups: wazuhProcedure.query(() => proxyGet("/rules/groups")),

  rulesByRequirement: wazuhProcedure
    .input(z.object({ requirement: z.string() }))
    .query(({ input }) =>
      proxyGet(`/rules/requirement/${input.requirement}`)
    ),

  rulesFiles: wazuhProcedure
    .input(paginationSchema)
    .query(({ input }) =>
      proxyGet("/rules/files", { limit: input.limit, offset: input.offset })
    ),

  /** View rule file content by filename */
  ruleFileContent: wazuhProcedure
    .input(z.object({ filename: z.string() }))
    .query(({ input }) =>
      proxyGet(`/rules/files/${input.filename}`)
    ),

  // ══════════════════════════════════════════════════════════════════════════════
  // MITRE ATT&CK
  // ══════════════════════════════════════════════════════════════════════════════
  mitreTactics: wazuhProcedure.query(() =>
    proxyGet("/mitre/tactics")
  ),

  mitreTechniques: wazuhProcedure
    .input(paginationSchema.extend({ search: z.string().optional() }))
    .query(({ input }) =>
      proxyGet("/mitre/techniques", {
        limit: input.limit,
        offset: input.offset,
        search: input.search,
      })
    ),

  mitreMitigations: wazuhProcedure
    .input(paginationSchema)
    .query(({ input }) =>
      proxyGet("/mitre/mitigations", { limit: input.limit, offset: input.offset })
    ),

  mitreSoftware: wazuhProcedure
    .input(paginationSchema)
    .query(({ input }) =>
      proxyGet("/mitre/software", { limit: input.limit, offset: input.offset })
    ),

  mitreGroups: wazuhProcedure
    .input(paginationSchema)
    .query(({ input }) =>
      proxyGet("/mitre/groups", { limit: input.limit, offset: input.offset })
    ),

  mitreMetadata: wazuhProcedure.query(() => proxyGet("/mitre/metadata")),

  mitreReferences: wazuhProcedure
    .input(paginationSchema)
    .query(({ input }) =>
      proxyGet("/mitre/references", { limit: input.limit, offset: input.offset })
    ),

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
      const { forwardedQuery, unsupportedParams } = brokerParams(SCA_POLICIES_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /sca/{agent_id}: ${unsupportedParams.join(", ")}`,
        });
      }
      return proxyGet(`/sca/${agentId}`, forwardedQuery);
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
      const { forwardedQuery, unsupportedParams } = brokerParams(SCA_CHECKS_CONFIG, rest);
      if (unsupportedParams.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported parameters for /sca/{agent_id}/checks/{policy_id}: ${unsupportedParams.join(", ")}`,
        });
      }
      return proxyGet(`/sca/${agentId}/checks/${policyId}`, forwardedQuery);
    }),

  ciscatResults: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema, ...paginationSchema.shape }))
    .query(({ input }) =>
      proxyGet(`/ciscat/${input.agentId}/results`, {
        limit: input.limit,
        offset: input.offset,
      })
    ),

  // ══════════════════════════════════════════════════════════════════════════════
  // FIM / SYSCHECK
  // ══════════════════════════════════════════════════════════════════════════════
  syscheckFiles: wazuhProcedure
    .input(
      z.object({
        agentId: agentIdSchema,
        type: z.enum(["file", "registry"]).optional(),
        search: z.string().optional(),
        hash: z.string().optional(),
        file: z.string().optional(),
        ...paginationSchema.shape,
      })
    )
    .query(({ input }) =>
      proxyGet(
        `/syscheck/${input.agentId}`,
        {
          limit: input.limit,
          offset: input.offset,
          type: input.type,
          search: input.search,
          hash: input.hash,
          file: input.file,
        },
        "syscheck"
      )
    ),

  syscheckLastScan: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet(`/syscheck/${input.agentId}/last_scan`, {}, "syscheck")
    ),

  // ══════════════════════════════════════════════════════════════════════════════
  // ROOTCHECK
  // ══════════════════════════════════════════════════════════════════════════════
  rootcheckResults: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema, ...paginationSchema.shape }))
    .query(({ input }) =>
      proxyGet(`/rootcheck/${input.agentId}`, {
        limit: input.limit,
        offset: input.offset,
      })
    ),

  rootcheckLastScan: wazuhProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet(`/rootcheck/${input.agentId}/last_scan`)
    ),

  // ══════════════════════════════════════════════════════════════════════════════
  // DECODERS
  // ══════════════════════════════════════════════════════════════════════════════
  decoders: wazuhProcedure
    .input(paginationSchema.extend({ search: z.string().optional() }))
    .query(({ input }) =>
      proxyGet("/decoders", { limit: input.limit, offset: input.offset, search: input.search })
    ),

  decoderFiles: wazuhProcedure
    .input(paginationSchema)
    .query(({ input }) =>
      proxyGet("/decoders/files", { limit: input.limit, offset: input.offset })
    ),

  /** Parent decoders — top-level decoders that other decoders inherit from */
  decoderParents: wazuhProcedure
    .input(paginationSchema.extend({ search: z.string().optional() }))
    .query(({ input }) =>
      proxyGet("/decoders/parents", { limit: input.limit, offset: input.offset, search: input.search })
    ),

  /** View decoder file content by filename */
  decoderFileContent: wazuhProcedure
    .input(z.object({ filename: z.string() }))
    .query(({ input }) =>
      proxyGet(`/decoders/files/${input.filename}`)
    ),

  // ══════════════════════════════════════════════════════════════════════════════
  // TASKS
  // ══════════════════════════════════════════════════════════════════════════════
  taskStatus: wazuhProcedure
    .input(z.object({ taskIds: z.array(z.number()).optional() }))
    .query(({ input }) =>
      proxyGet("/tasks/status", {
        task_list: input.taskIds?.join(","),
      })
    ),

  // NOTE: GET /active-response does not exist in Wazuh v4.14.3.
  // The spec only defines PUT /active-response (trigger action — write operation).
  // Removed activeResponseList per audit.

  // ══════════════════════════════════════════════════════════════════════════════
  // SECURITY (RBAC info — read-only)
  // ══════════════════════════════════════════════════════════════════════════════
  securityRoles: wazuhProcedure.query(() => proxyGet("/security/roles")),
  securityPolicies: wazuhProcedure.query(() => proxyGet("/security/policies")),
  securityUsers: wazuhProcedure.query(() => proxyGet("/security/users")),

  // ══════════════════════════════════════════════════════════════════════════════
  // LISTS (CDB Lists — read-only)
  // ══════════════════════════════════════════════════════════════════════════════
  lists: wazuhProcedure
    .input(paginationSchema)
    .query(({ input }) =>
      proxyGet("/lists", { limit: input.limit, offset: input.offset })
    ),

  listsFiles: wazuhProcedure
    .input(paginationSchema)
    .query(({ input }) =>
      proxyGet("/lists/files", { limit: input.limit, offset: input.offset })
    ),

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUPS — Configuration & Files (read-only)
  // ══════════════════════════════════════════════════════════════════════════════
  /** Group configuration (agent.conf for the group) */
  groupConfiguration: wazuhProcedure
    .input(z.object({ groupId: z.string() }))
    .query(({ input }) =>
      proxyGet(`/groups/${input.groupId}/configuration`)
    ),

  /** Group files listing */
  groupFiles: wazuhProcedure
    .input(z.object({ groupId: z.string() }))
    .query(({ input }) =>
      proxyGet(`/groups/${input.groupId}/files`)
    ),
});
