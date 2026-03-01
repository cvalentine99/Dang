/**
 * Wazuh tRPC Router — read-only proxy to the Wazuh REST API.
 *
 * All procedures require authentication (protectedProcedure) and the Wazuh
 * credentials are server-side only and never passed to the browser.
 *
 * Write operations are explicitly NOT implemented per project policy.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getWazuhConfig, isWazuhConfigured, wazuhGet, getEffectiveWazuhConfig, isWazuhEffectivelyConfigured } from "./wazuhClient";

// ── Shared input schemas ───────────────────────────────────────────────────────
const paginationSchema = z.object({
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

const agentIdSchema = z.string().regex(/^\d{3,}$/, "Invalid agent ID format");

// ── Helper: wrap with config check (uses DB override → env fallback) ─────────
async function proxyGet(path: string, params?: Record<string, string | number | boolean | undefined>, group?: string) {
  const config = await getEffectiveWazuhConfig();
  if (!config) throw new Error("Wazuh is not configured. Set connection settings in Admin > Connection Settings or via environment variables.");
  return wazuhGet(config, { path, params, rateLimitGroup: group });
}

// ── Router ────────────────────────────────────────────────────────────────────
export const wazuhRouter = router({

  // ══════════════════════════════════════════════════════════════════════════════
  // SYSTEM STATUS
  // ══════════════════════════════════════════════════════════════════════════════
  status: protectedProcedure.query(async () => {
    const configured = await isWazuhEffectivelyConfigured();
    if (!configured) {
      return { configured: false, data: null };
    }
    try {
      const data = await proxyGet("/manager/info");
      return { configured: true, data };
    } catch (err) {
      return { configured: true, data: null, error: (err as Error).message };
    }
  }),

  isConfigured: protectedProcedure.query(async () => {
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
  managerInfo: protectedProcedure.query(() => proxyGet("/manager/info")),
  managerStatus: protectedProcedure.query(() => proxyGet("/manager/status")),
  managerConfiguration: protectedProcedure.query(() => proxyGet("/manager/configuration")),
  managerConfigValidation: protectedProcedure.query(() => proxyGet("/manager/configuration/validation")),

  // ── Manager stats ─────────────────────────────────────────────────────────
  managerStats: protectedProcedure.query(() => proxyGet("/manager/stats")),
  statsHourly: protectedProcedure.query(() => proxyGet("/manager/stats/hourly")),
  statsWeekly: protectedProcedure.query(() => proxyGet("/manager/stats/weekly")),
  analysisd: protectedProcedure.query(() => proxyGet("/manager/stats/analysisd")),
  remoted: protectedProcedure.query(() => proxyGet("/manager/stats/remoted")),

  // ── Manager daemon stats (4.14+ enhanced) ─────────────────────────────────
  daemonStats: protectedProcedure
    .input(z.object({
      daemons: z.array(z.string()).optional(),
    }).optional())
    .query(({ input }) =>
      proxyGet("/manager/daemons/stats", input?.daemons ? { daemons_list: input.daemons.join(",") } : {})
    ),

  // ── Manager logs ──────────────────────────────────────────────────────────
  managerLogs: protectedProcedure
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

  managerLogsSummary: protectedProcedure.query(() =>
    proxyGet("/manager/logs/summary", {}, "alerts")
  ),

  // ══════════════════════════════════════════════════════════════════════════════
  // CLUSTER
  // ══════════════════════════════════════════════════════════════════════════════
  clusterStatus: protectedProcedure.query(() => proxyGet("/cluster/status")),
  clusterNodes: protectedProcedure.query(() => proxyGet("/cluster/nodes")),
  clusterHealthcheck: protectedProcedure.query(() => proxyGet("/cluster/healthcheck")),
  clusterLocalInfo: protectedProcedure.query(() => proxyGet("/cluster/local/info")),
  clusterLocalConfig: protectedProcedure.query(() => proxyGet("/cluster/local/config")),

  clusterNodeInfo: protectedProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(({ input }) => proxyGet(`/cluster/${input.nodeId}/info`)),

  clusterNodeStats: protectedProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(({ input }) => proxyGet(`/cluster/${input.nodeId}/stats`)),

  clusterNodeStatsHourly: protectedProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(({ input }) => proxyGet(`/cluster/${input.nodeId}/stats/hourly`)),

  // ══════════════════════════════════════════════════════════════════════════════
  // AGENTS
  // ══════════════════════════════════════════════════════════════════════════════
  agents: protectedProcedure
    .input(
      paginationSchema.extend({
        status: z.enum(["active", "disconnected", "never_connected", "pending"]).optional(),
        os_platform: z.string().optional(),
        search: z.string().optional(),
        group: z.string().optional(),
        sort: z.string().optional(),
        q: z.string().optional(),
      })
    )
    .query(({ input }) =>
      proxyGet("/agents", {
        limit: input.limit,
        offset: input.offset,
        status: input.status,
        q: input.q ?? (input.search ? `name~${input.search}` : undefined),
        group: input.group,
        sort: input.sort,
      })
    ),

  agentSummaryStatus: protectedProcedure.query(() =>
    proxyGet("/agents/summary/status")
  ),

  agentSummaryOs: protectedProcedure.query(() =>
    proxyGet("/agents/summary/os")
  ),

  agentOverview: protectedProcedure.query(() =>
    proxyGet("/overview/agents")
  ),

  agentById: protectedProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet("/agents", { agents_list: input.agentId })
    ),

  agentKey: protectedProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet(`/agents/${input.agentId}/key`)
    ),

  agentDaemonStats: protectedProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet(`/agents/${input.agentId}/daemons/stats`)
    ),

  agentStats: protectedProcedure
    .input(z.object({ agentId: agentIdSchema, component: z.string().default("logcollector") }))
    .query(({ input }) =>
      proxyGet(`/agents/${input.agentId}/stats/${input.component}`)
    ),

  agentConfig: protectedProcedure
    .input(z.object({
      agentId: agentIdSchema,
      component: z.string(),
      configuration: z.string(),
    }))
    .query(({ input }) =>
      proxyGet(`/agents/${input.agentId}/config/${input.component}/${input.configuration}`)
    ),

  agentGroups: protectedProcedure.query(() => proxyGet("/groups")),

  /** Agents with outdated version compared to manager */
  agentsOutdated: protectedProcedure
    .input(paginationSchema)
    .query(({ input }) =>
      proxyGet("/agents/outdated", { limit: input.limit, offset: input.offset })
    ),

  /** Agents not assigned to any group */
  agentsNoGroup: protectedProcedure
    .input(paginationSchema)
    .query(({ input }) =>
      proxyGet("/agents/no_group", { limit: input.limit, offset: input.offset })
    ),

  /** Agent stats distinct — unique field values across agents */
  agentsStatsDistinct: protectedProcedure
    .input(z.object({ fields: z.string() }))
    .query(({ input }) =>
      proxyGet("/agents/stats/distinct", { fields: input.fields })
    ),

  agentGroupMembers: protectedProcedure
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
  agentOs: protectedProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet(`/syscollector/${input.agentId}/os`)
    ),

  agentHardware: protectedProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet(`/syscollector/${input.agentId}/hardware`)
    ),

  agentPackages: protectedProcedure
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

  agentPorts: protectedProcedure
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

  agentProcesses: protectedProcedure
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

  agentNetaddr: protectedProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet(`/syscollector/${input.agentId}/netaddr`)
    ),

  agentNetiface: protectedProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet(`/syscollector/${input.agentId}/netiface`)
    ),

  agentHotfixes: protectedProcedure
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
  agentBrowserExtensions: protectedProcedure
    .input(z.object({ agentId: agentIdSchema, ...paginationSchema.shape }))
    .query(({ input }) =>
      proxyGet(`/syscollector/${input.agentId}/browser_extensions`, {
        limit: input.limit,
        offset: input.offset,
      }).catch(() => ({ data: { affected_items: [], total_affected_items: 0 } }))
    ),

  /** System services / daemons (Windows services, systemd units) */
  agentServices: protectedProcedure
    .input(z.object({ agentId: agentIdSchema, ...paginationSchema.shape }))
    .query(({ input }) =>
      proxyGet(`/syscollector/${input.agentId}/services`, {
        limit: input.limit,
        offset: input.offset,
      }).catch(() => ({ data: { affected_items: [], total_affected_items: 0 } }))
    ),

  /** Local users on the agent */
  agentUsers: protectedProcedure
    .input(z.object({ agentId: agentIdSchema, ...paginationSchema.shape }))
    .query(({ input }) =>
      proxyGet(`/syscollector/${input.agentId}/users`, {
        limit: input.limit,
        offset: input.offset,
      }).catch(() => ({ data: { affected_items: [], total_affected_items: 0 } }))
    ),

  /** Local groups on the agent */
  agentGroups2: protectedProcedure
    .input(z.object({ agentId: agentIdSchema, ...paginationSchema.shape }))
    .query(({ input }) =>
      proxyGet(`/syscollector/${input.agentId}/groups`, {
        limit: input.limit,
        offset: input.offset,
      }).catch(() => ({ data: { affected_items: [], total_affected_items: 0 } }))
    ),

  /** Network protocol inventory per agent */
  agentNetproto: protectedProcedure
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
  rules: protectedProcedure
    .input(
      paginationSchema.extend({
        level: z.number().int().min(0).max(16).optional(),
        search: z.string().optional(),
        group: z.string().optional(),
        requirement: z.string().optional(),
        sort: z.string().optional(),
      })
    )
    .query(({ input }) =>
      proxyGet("/rules", {
        limit: input.limit,
        offset: input.offset,
        level: input.level,
        search: input.search,
        group: input.group,
        sort: input.sort,
      })
    ),

  ruleGroups: protectedProcedure.query(() => proxyGet("/rules/groups")),

  rulesByRequirement: protectedProcedure
    .input(z.object({ requirement: z.string() }))
    .query(({ input }) =>
      proxyGet(`/rules/requirement/${input.requirement}`)
    ),

  rulesFiles: protectedProcedure
    .input(paginationSchema)
    .query(({ input }) =>
      proxyGet("/rules/files", { limit: input.limit, offset: input.offset })
    ),

  /** View rule file content by filename */
  ruleFileContent: protectedProcedure
    .input(z.object({ filename: z.string() }))
    .query(({ input }) =>
      proxyGet(`/rules/files/${input.filename}`)
    ),

  // ══════════════════════════════════════════════════════════════════════════════
  // MITRE ATT&CK
  // ══════════════════════════════════════════════════════════════════════════════
  mitreTactics: protectedProcedure.query(() =>
    proxyGet("/mitre/tactics")
  ),

  mitreTechniques: protectedProcedure
    .input(paginationSchema.extend({ search: z.string().optional() }))
    .query(({ input }) =>
      proxyGet("/mitre/techniques", {
        limit: input.limit,
        offset: input.offset,
        search: input.search,
      })
    ),

  mitreMitigations: protectedProcedure
    .input(paginationSchema)
    .query(({ input }) =>
      proxyGet("/mitre/mitigations", { limit: input.limit, offset: input.offset })
    ),

  mitreSoftware: protectedProcedure
    .input(paginationSchema)
    .query(({ input }) =>
      proxyGet("/mitre/software", { limit: input.limit, offset: input.offset })
    ),

  mitreGroups: protectedProcedure
    .input(paginationSchema)
    .query(({ input }) =>
      proxyGet("/mitre/groups", { limit: input.limit, offset: input.offset })
    ),

  mitreMetadata: protectedProcedure.query(() => proxyGet("/mitre/metadata")),

  mitreReferences: protectedProcedure
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
  scaPolicies: protectedProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet(`/sca/${input.agentId}`)
    ),

  scaChecks: protectedProcedure
    .input(
      z.object({
        agentId: agentIdSchema,
        policyId: z.string(),
        result: z.enum(["passed", "failed", "not applicable"]).optional(),
        search: z.string().optional(),
        ...paginationSchema.shape,
      })
    )
    .query(({ input }) =>
      proxyGet(`/sca/${input.agentId}/checks/${input.policyId}`, {
        limit: input.limit,
        offset: input.offset,
        result: input.result,
        search: input.search,
      })
    ),

  ciscatResults: protectedProcedure
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
  syscheckFiles: protectedProcedure
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

  syscheckLastScan: protectedProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet(`/syscheck/${input.agentId}/last_scan`, {}, "syscheck")
    ),

  // ══════════════════════════════════════════════════════════════════════════════
  // ROOTCHECK
  // ══════════════════════════════════════════════════════════════════════════════
  rootcheckResults: protectedProcedure
    .input(z.object({ agentId: agentIdSchema, ...paginationSchema.shape }))
    .query(({ input }) =>
      proxyGet(`/rootcheck/${input.agentId}`, {
        limit: input.limit,
        offset: input.offset,
      })
    ),

  rootcheckLastScan: protectedProcedure
    .input(z.object({ agentId: agentIdSchema }))
    .query(({ input }) =>
      proxyGet(`/rootcheck/${input.agentId}/last_scan`)
    ),

  // ══════════════════════════════════════════════════════════════════════════════
  // DECODERS
  // ══════════════════════════════════════════════════════════════════════════════
  decoders: protectedProcedure
    .input(paginationSchema.extend({ search: z.string().optional() }))
    .query(({ input }) =>
      proxyGet("/decoders", { limit: input.limit, offset: input.offset, search: input.search })
    ),

  decoderFiles: protectedProcedure
    .input(paginationSchema)
    .query(({ input }) =>
      proxyGet("/decoders/files", { limit: input.limit, offset: input.offset })
    ),

  /** Parent decoders — top-level decoders that other decoders inherit from */
  decoderParents: protectedProcedure
    .input(paginationSchema.extend({ search: z.string().optional() }))
    .query(({ input }) =>
      proxyGet("/decoders/parents", { limit: input.limit, offset: input.offset, search: input.search })
    ),

  /** View decoder file content by filename */
  decoderFileContent: protectedProcedure
    .input(z.object({ filename: z.string() }))
    .query(({ input }) =>
      proxyGet(`/decoders/files/${input.filename}`)
    ),

  // ══════════════════════════════════════════════════════════════════════════════
  // TASKS
  // ══════════════════════════════════════════════════════════════════════════════
  taskStatus: protectedProcedure
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
  securityRoles: protectedProcedure.query(() => proxyGet("/security/roles")),
  securityPolicies: protectedProcedure.query(() => proxyGet("/security/policies")),
  securityUsers: protectedProcedure.query(() => proxyGet("/security/users")),

  // ══════════════════════════════════════════════════════════════════════════════
  // LISTS (CDB Lists — read-only)
  // ══════════════════════════════════════════════════════════════════════════════
  lists: protectedProcedure
    .input(paginationSchema)
    .query(({ input }) =>
      proxyGet("/lists", { limit: input.limit, offset: input.offset })
    ),

  listsFiles: protectedProcedure
    .input(paginationSchema)
    .query(({ input }) =>
      proxyGet("/lists/files", { limit: input.limit, offset: input.offset })
    ),

  // ══════════════════════════════════════════════════════════════════════════════
  // GROUPS — Configuration & Files (read-only)
  // ══════════════════════════════════════════════════════════════════════════════
  /** Group configuration (agent.conf for the group) */
  groupConfiguration: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(({ input }) =>
      proxyGet(`/groups/${input.groupId}/configuration`)
    ),

  /** Group files listing */
  groupFiles: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(({ input }) =>
      proxyGet(`/groups/${input.groupId}/files`)
    ),
});
