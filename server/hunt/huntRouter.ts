/**
 * Threat Hunting tRPC Router — server-side multi-source IOC correlation.
 *
 * Searches across:
 *  1. Wazuh Indexer (alerts + archives) — full-text + field-specific
 *  2. Wazuh API (agents, rules, vulnerabilities, syscheck) — per-agent deep scan
 *  3. MITRE ATT&CK techniques
 *
 * All operations are read-only. No mutations, no writes.
 */

import { requireDb } from "../dbGuard";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { savedHunts } from "../../drizzle/schema";
import { eq, desc, and, like, sql } from "drizzle-orm";
import {
  getEffectiveIndexerConfig,
  indexerSearch,
  INDEX_PATTERNS,
  timeRangeFilter,
  boolQuery,
  type ESSearchBody,
} from "../indexer/indexerClient";
import {
  getEffectiveWazuhConfig,
  wazuhGet,
} from "../wazuh/wazuhClient";

// ── Types ────────────────────────────────────────────────────────────────────
const iocTypeSchema = z.enum([
  "freetext", "ip", "hash", "cve", "filename", "username", "rule_id", "mitre_id",
]);

const huntInputSchema = z.object({
  query: z.string().min(1).max(500),
  iocType: iocTypeSchema,
  timeFrom: z.string().default("now-24h"),
  timeTo: z.string().default("now"),
  maxResults: z.number().int().min(1).max(200).default(50),
  // Optional: specific agent IDs to search vulns/syscheck on
  agentIds: z.array(z.string()).max(10).optional(),
});

// ── Indexer search builder ──────────────────────────────────────────────────
function buildIndexerQuery(
  query: string,
  iocType: z.infer<typeof iocTypeSchema>,
  timeFrom: string,
  timeTo: string,
  size: number
): ESSearchBody {
  const filters = [timeRangeFilter(timeFrom, timeTo)];
  const must: Array<Record<string, unknown>> = [];

  switch (iocType) {
    case "ip":
      must.push({
        multi_match: {
          query,
          fields: ["data.srcip", "data.dstip", "agent.ip", "data.src_ip", "data.dst_ip"],
          type: "best_fields",
        },
      });
      break;
    case "hash":
      must.push({
        multi_match: {
          query,
          fields: ["syscheck.md5_after", "syscheck.sha1_after", "syscheck.sha256_after", "data.*"],
          type: "best_fields",
        },
      });
      break;
    case "cve":
      must.push({
        multi_match: {
          query,
          fields: ["data.vulnerability.cve", "data.cve", "rule.description"],
          type: "best_fields",
        },
      });
      break;
    case "filename":
      must.push({
        multi_match: {
          query,
          fields: ["syscheck.path", "data.file", "data.filename", "data.path"],
          type: "best_fields",
        },
      });
      break;
    case "username":
      must.push({
        multi_match: {
          query,
          fields: ["data.srcuser", "data.dstuser", "data.user", "agent.name"],
          type: "best_fields",
        },
      });
      break;
    case "rule_id":
      filters.push({ term: { "rule.id": query } });
      break;
    case "mitre_id":
      filters.push({ term: { "rule.mitre.id": query.toUpperCase() } });
      break;
    case "freetext":
    default:
      must.push({
        multi_match: {
          query,
          fields: [
            "rule.description", "agent.name", "data.*", "full_log",
            "syscheck.path", "data.srcip", "data.dstip",
          ],
          type: "best_fields",
        },
      });
      break;
  }

  return {
    query: boolQuery({ must, filter: filters }),
    size,
    sort: [{ timestamp: { order: "desc" } }],
    _source: true,
  };
}

// ── Wazuh API search helpers ────────────────────────────────────────────────
// M2: helpers no longer swallow failures into `[]`. They return `null` when the
// source is not configured (not searched), resolve with the hits when the
// search ran, and THROW (sanitized — see wazuh/upstreamError) when it failed,
// so execute() can report the source as errored instead of "0 hits".

type UserId = string | number | undefined;

function affectedItems(res: unknown): unknown[] {
  const items = ((res as Record<string, unknown>)?.data as Record<string, unknown>)?.affected_items;
  return Array.isArray(items) ? items : [];
}

async function searchWazuhAgents(query: string, iocType: string, userId?: UserId): Promise<unknown[] | null> {
  const config = await getEffectiveWazuhConfig();
  if (!config) return null;
  const params: Record<string, string | number> = { limit: 100, offset: 0 };
  if (iocType === "ip") params.search = query;
  else if (iocType === "username") params.search = query;
  else params.search = query;
  return affectedItems(await wazuhGet(config, { path: "/agents", params, rateLimitGroup: "agents", userId }));
}

async function searchWazuhRules(query: string, iocType: string, userId?: UserId): Promise<unknown[] | null> {
  const config = await getEffectiveWazuhConfig();
  if (!config) return null;
  const params: Record<string, string | number> = { limit: 100, offset: 0 };
  if (iocType === "rule_id") params.rule_ids = query;
  else params.search = query;
  return affectedItems(await wazuhGet(config, { path: "/rules", params, rateLimitGroup: "rules", userId }));
}

/** Per-agent search result: hits from the agents that answered + the agents that failed. */
interface PerAgentResult {
  hits: unknown[];
  failures: Array<{ agentId: string; message: string }>;
}

async function searchPerAgent(
  agentIds: string[],
  fetchOne: (agentId: string) => Promise<unknown>
): Promise<PerAgentResult> {
  const hits: unknown[] = [];
  const failures: PerAgentResult["failures"] = [];
  // Max 10 agents per hunt
  for (const agentId of agentIds.slice(0, 10)) {
    try {
      const items = affectedItems(await fetchOne(agentId));
      hits.push(...items.map((item) => ({ ...(item as Record<string, unknown>), _agentId: agentId })));
    } catch (err) {
      failures.push({ agentId, message: (err as Error)?.message ?? "unknown error" });
    }
  }
  return { hits, failures };
}

async function searchWazuhVulns(query: string, iocType: string, agentIds: string[], userId?: UserId): Promise<PerAgentResult | null> {
  const config = await getEffectiveWazuhConfig();
  if (!config || agentIds.length === 0) return null;
  return searchPerAgent(agentIds, (agentId) => {
    const params: Record<string, string | number> = { limit: 50, offset: 0 };
    if (iocType === "cve") params.search = query;
    else params.search = query;
    return wazuhGet(config, { path: `/vulnerability/${agentId}`, params, rateLimitGroup: "vulnerabilities", userId });
  });
}

async function searchWazuhSyscheck(query: string, iocType: string, agentIds: string[], userId?: UserId): Promise<PerAgentResult | null> {
  const config = await getEffectiveWazuhConfig();
  if (!config || agentIds.length === 0) return null;
  return searchPerAgent(agentIds, (agentId) => {
    const params: Record<string, string | number> = { limit: 50, offset: 0 };
    if (iocType === "hash") params.hash = query;
    else if (iocType === "filename") params.search = query;
    else params.search = query;
    return wazuhGet(config, { path: `/syscheck/${agentId}`, params, rateLimitGroup: "syscheck", userId });
  });
}

async function searchWazuhMitre(query: string, iocType: string, userId?: UserId): Promise<unknown[] | null> {
  const config = await getEffectiveWazuhConfig();
  if (!config) return null;
  const params: Record<string, string | number> = { limit: 100, offset: 0 };
  if (iocType === "mitre_id") params.search = query;
  else params.search = query;
  return affectedItems(await wazuhGet(config, { path: "/mitre/techniques", params, rateLimitGroup: "mitre", userId }));
}

async function searchWazuhLogs(query: string, userId?: UserId): Promise<unknown[] | null> {
  const config = await getEffectiveWazuhConfig();
  if (!config) return null;
  const params: Record<string, string | number> = { limit: 100, offset: 0, search: query };
  return affectedItems(await wazuhGet(config, { path: "/manager/logs", params, rateLimitGroup: "logs", userId }));
}

// ── Router ──────────────────────────────────────────────────────────────────
export const huntRouter = router({

  /**
   * Execute a multi-source hunt — the main procedure.
   * Searches Indexer (alerts + archives) and Wazuh API (agents, rules, vulns, syscheck, MITRE, logs)
   * in parallel, then returns structured correlation results.
   */
  // ── Persistence: Save a hunt result ──────────────────────────────────────
  save: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(512),
      description: z.string().max(5000).optional(),
      query: z.string().min(1).max(500),
      iocType: z.string().min(1).max(32),
      timeFrom: z.string().max(32),
      timeTo: z.string().max(32),
      totalHits: z.number().int().default(0),
      totalTimeMs: z.number().int().default(0),
      sourcesWithHits: z.number().int().default(0),
      agentsSearched: z.array(z.string()).optional(),
      results: z.array(z.object({
        source: z.string(),
        sourceLabel: z.string(),
        matches: z.array(z.unknown()),
        count: z.number(),
        searchTimeMs: z.number(),
      })),
      tags: z.array(z.string()).optional(),
      severity: z.enum(["critical", "high", "medium", "low", "info"]).default("info"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [result] = await db.insert(savedHunts).values({
        userId: ctx.user.id,
        title: input.title,
        description: input.description ?? null,
        query: input.query,
        iocType: input.iocType,
        timeFrom: input.timeFrom,
        timeTo: input.timeTo,
        totalHits: input.totalHits,
        totalTimeMs: input.totalTimeMs,
        sourcesWithHits: input.sourcesWithHits,
        agentsSearched: input.agentsSearched ?? [],
        results: input.results as typeof savedHunts.$inferInsert.results,
        tags: input.tags ?? [],
        severity: input.severity,
      });
      return { id: result.insertId, success: true };
    }),

  // ── Persistence: List saved hunts ──────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).default(0),
      search: z.string().max(200).optional(),
      severity: z.enum(["critical", "high", "medium", "low", "info"]).optional(),
      iocType: z.string().max(32).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const limit = input?.limit ?? 25;
      const offset = input?.offset ?? 0;

      const conditions = [eq(savedHunts.userId, ctx.user.id)];
      if (input?.search) {
        conditions.push(like(savedHunts.query, `%${input.search}%`));
      }
      if (input?.severity) {
        conditions.push(eq(savedHunts.severity, input.severity));
      }
      if (input?.iocType) {
        conditions.push(eq(savedHunts.iocType, input.iocType));
      }

      const where = conditions.length === 1 ? conditions[0] : and(...conditions);

      const [items, countResult] = await Promise.all([
        db.select({
          id: savedHunts.id,
          title: savedHunts.title,
          description: savedHunts.description,
          query: savedHunts.query,
          iocType: savedHunts.iocType,
          timeFrom: savedHunts.timeFrom,
          timeTo: savedHunts.timeTo,
          totalHits: savedHunts.totalHits,
          totalTimeMs: savedHunts.totalTimeMs,
          sourcesWithHits: savedHunts.sourcesWithHits,
          severity: savedHunts.severity,
          tags: savedHunts.tags,
          resolved: savedHunts.resolved,
          createdAt: savedHunts.createdAt,
        })
          .from(savedHunts)
          .where(where)
          .orderBy(desc(savedHunts.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: sql<number>`count(*)` })
          .from(savedHunts)
          .where(where),
      ]);

      return { items, total: Number(countResult[0]?.count ?? 0) };
    }),

  // ── Persistence: Get a single saved hunt with full results ─────────────
  get: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const rows = await db.select()
        .from(savedHunts)
        .where(and(eq(savedHunts.id, input.id), eq(savedHunts.userId, ctx.user.id)))
        .limit(1);
      return rows[0] ?? null;
    }),

  // ── Persistence: Delete a saved hunt ───────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      await db.delete(savedHunts)
        .where(and(eq(savedHunts.id, input.id), eq(savedHunts.userId, ctx.user.id)));
      return { success: true };
    }),

  // ── Persistence: Update severity / resolved / tags ─────────────────────
  update: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      severity: z.enum(["critical", "high", "medium", "low", "info"]).optional(),
      resolved: z.number().int().min(0).max(1).optional(),
      tags: z.array(z.string()).optional(),
      title: z.string().min(1).max(512).optional(),
      description: z.string().max(5000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const updates: Record<string, unknown> = {};
      if (input.severity !== undefined) updates.severity = input.severity;
      if (input.resolved !== undefined) updates.resolved = input.resolved;
      if (input.tags !== undefined) updates.tags = input.tags;
      if (input.title !== undefined) updates.title = input.title;
      if (input.description !== undefined) updates.description = input.description;
      if (Object.keys(updates).length === 0) return { success: true };
      await db.update(savedHunts)
        .set(updates)
        .where(and(eq(savedHunts.id, input.id), eq(savedHunts.userId, ctx.user.id)));
      return { success: true };
    }),

  execute: protectedProcedure
    .input(huntInputSchema)
    .query(async ({ input, ctx }) => {
      const startTime = Date.now();
      const userId = ctx.user?.id;
      const sources: Array<{
        source: string;
        sourceLabel: string;
        matches: unknown[];
        count: number;
        searchTimeMs: number;
      }> = [];
      // M2: every failure is reported. A hunt against a down Indexer must read
      // "Indexer: Alerts — error", never "0 hits".
      const errors: Array<{ source: string; message: string }> = [];
      const errMsg = (err: unknown) => (err as Error)?.message || "unknown error";

      // ── Determine agent IDs for per-agent searches ─────────────────────
      let agentIds = input.agentIds ?? [];
      if (agentIds.length === 0) {
        // Auto-discover first 5 active agents for vuln/syscheck searches
        const wazuhConfig = await getEffectiveWazuhConfig();
        if (wazuhConfig) {
          try {
            const res = await wazuhGet(wazuhConfig, {
              path: "/agents",
              params: { limit: 5, offset: 0, status: "active" },
              rateLimitGroup: "agents",
              userId,
            });
            agentIds = affectedItems(res)
              .map((a) => String((a as Record<string, unknown>).id ?? ""))
              .filter((id) => id && id !== "000");
          } catch (err) {
            errors.push({ source: "agent_discovery", message: errMsg(err) });
          }
        }
      }

      /** Normalized task outcome. `searched: false` = source not configured / not applicable. */
      type TaskResult = { searched: boolean; hits: unknown[]; time: number; total?: number; failures?: PerAgentResult["failures"] };
      const timed = async (fn: () => Promise<unknown[] | null>): Promise<TaskResult> => {
        const t = Date.now();
        const hits = await fn();
        return hits === null
          ? { searched: false, hits: [], time: 0 }
          : { searched: true, hits, time: Date.now() - t };
      };
      const timedPerAgent = async (fn: () => Promise<PerAgentResult | null>): Promise<TaskResult> => {
        const t = Date.now();
        const r = await fn();
        return r === null
          ? { searched: false, hits: [], time: 0 }
          : { searched: true, hits: r.hits, failures: r.failures, time: Date.now() - t };
      };
      const indexerTask = async (index: string, size: number, group: string): Promise<TaskResult> => {
        const t = Date.now();
        const config = await getEffectiveIndexerConfig();
        if (!config) return { searched: false, hits: [], time: 0 };
        const body = buildIndexerQuery(input.query, input.iocType, input.timeFrom, input.timeTo, size);
        const res = await indexerSearch(config, index, body, group, userId);
        return {
          searched: true,
          hits: res.hits.hits.map((h) => h._source),
          time: Date.now() - t,
          total: typeof res.hits.total === "number" ? res.hits.total : res.hits.total.value,
        };
      };

      // ── Run all searches in parallel ───────────────────────────────────
      const [
        indexerAlerts,
        indexerArchives,
        wazuhAgents,
        wazuhRules,
        wazuhVulns,
        wazuhSyscheck,
        wazuhMitre,
        wazuhLogs,
      ] = await Promise.allSettled([
        // 1. Indexer: alerts
        indexerTask(INDEX_PATTERNS.ALERTS, input.maxResults, "alerts"),
        // 2. Indexer: archives
        indexerTask(INDEX_PATTERNS.ARCHIVES, Math.min(input.maxResults, 25), "archives"),
        // 3. Wazuh API: agents
        timed(() => searchWazuhAgents(input.query, input.iocType, userId)),
        // 4. Wazuh API: rules
        timed(() => searchWazuhRules(input.query, input.iocType, userId)),
        // 5. Wazuh API: vulnerabilities (per-agent)
        timedPerAgent(() => searchWazuhVulns(input.query, input.iocType, agentIds, userId)),
        // 6. Wazuh API: syscheck (per-agent)
        timedPerAgent(() => searchWazuhSyscheck(input.query, input.iocType, agentIds, userId)),
        // 7. Wazuh API: MITRE techniques
        timed(() => searchWazuhMitre(input.query, input.iocType, userId)),
        // 8. Wazuh API: manager logs
        timed(() => searchWazuhLogs(input.query, userId)),
      ]);

      // ── Collect results ────────────────────────────────────────────────
      let sourcesSearched = 0;
      const collect = (
        result: PromiseSettledResult<TaskResult>,
        source: string,
        sourceLabel: string
      ) => {
        if (result.status === "rejected") {
          // The source was attempted and failed — count it and report it
          sourcesSearched++;
          errors.push({ source, message: errMsg(result.reason) });
          return;
        }
        const v = result.value;
        if (!v.searched) return;
        sourcesSearched++;
        for (const f of v.failures ?? []) {
          errors.push({ source: `${source}:${f.agentId}`, message: f.message });
        }
        if (v.hits.length > 0) {
          sources.push({
            source,
            sourceLabel,
            matches: v.hits,
            count: v.total ?? v.hits.length,
            searchTimeMs: v.time,
          });
        }
      };

      collect(indexerAlerts, "indexer_alerts", "Indexer: Alerts");
      collect(indexerArchives, "indexer_archives", "Indexer: Archives");
      collect(wazuhAgents, "agents", "Agents");
      collect(wazuhRules, "rules", "Rules");
      collect(wazuhVulns, "vulnerabilities", "Vulnerabilities");
      collect(wazuhSyscheck, "syscheck", "File Integrity");
      collect(wazuhMitre, "mitre", "MITRE ATT&CK");
      collect(wazuhLogs, "logs", "Manager Logs");

      const totalHits = sources.reduce((sum, s) => sum + s.count, 0);
      const totalTimeMs = Date.now() - startTime;

      return {
        query: input.query,
        iocType: input.iocType,
        timeRange: { from: input.timeFrom, to: input.timeTo },
        totalHits,
        totalTimeMs,
        /** Sources actually attempted (configured and applicable), including failed ones. */
        sourcesSearched,
        sourcesWithHits: sources.length,
        agentsSearched: agentIds,
        sources,
        /** M2: per-source failures (sanitized messages with correlation ids). */
        errors,
        /** M2: true when any source or per-agent sub-search failed — results are incomplete. */
        degraded: errors.length > 0,
      };
    }),
});
