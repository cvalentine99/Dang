/**
 * LLM Router — tRPC procedures for LLM health monitoring and token usage tracking.
 *
 * Provides:
 * - healthCheck: Ping custom LLM endpoint, return status + latency + model info
 * - usageStats: Aggregated token usage statistics (today, 7d, 30d)
 * - usageHistory: Time-series token usage data for charts
 * - recentCalls: Paginated list of recent LLM invocations
 */

import { requireDb } from "../dbGuard";
import { z } from "zod";
import { desc, sql, and, gte } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { llmUsage } from "../../drizzle/schema";
import { getEffectiveLLMConfig } from "./llmService";

/**
 * Ping the custom LLM endpoint's /v1/models to check health.
 */
async function pingLLM(): Promise<{
  status: "online" | "offline" | "disabled";
  latencyMs: number;
  model: string;
  endpoint: string;
}> {
  const config = await getEffectiveLLMConfig();

  if (!config.enabled || !config.host) {
    return {
      status: "disabled",
      latencyMs: 0,
      model: config.model,
      endpoint: "",
    };
  }

  const endpoint = `${config.protocol}://${config.host}:${config.port}`;
  const startTime = Date.now();

  try {
    const headers: Record<string, string> = {};
    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(`${endpoint}/v1/models`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(5000),
    });

    const latencyMs = Date.now() - startTime;

    return {
      status: response.ok ? "online" : "offline",
      latencyMs,
      model: config.model,
      endpoint,
    };
  } catch {
    return {
      status: "offline",
      latencyMs: Date.now() - startTime,
      model: config.model,
      endpoint,
    };
  }
}

export const llmRouter = router({
  /**
   * Health check — ping the custom LLM endpoint.
   * Used by the sidebar indicator for live status.
   */
  healthCheck: publicProcedure.query(async () => {
    return pingLLM();
  }),

  /**
   * Aggregated usage statistics for a given time range.
   */
  usageStats: publicProcedure
    .input(
      z.object({
        range: z.enum(["today", "7d", "30d", "all"]).default("today"),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return {
          totalRequests: 0,
          totalPromptTokens: 0,
          totalCompletionTokens: 0,
          totalTokens: 0,
          avgLatencyMs: 0,
          customEndpointRequests: 0,
          builtInRequests: 0,
          fallbackCount: 0,
        };
      }

      // Calculate the cutoff date
      let cutoff: Date | null = null;
      const now = new Date();
      if (input.range === "today") {
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (input.range === "7d") {
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (input.range === "30d") {
        cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      const conditions = cutoff ? [gte(llmUsage.createdAt, cutoff)] : [];

      const result = await db
        .select({
          totalRequests: sql<number>`COUNT(*)`,
          totalPromptTokens: sql<number>`COALESCE(SUM(${llmUsage.promptTokens}), 0)`,
          totalCompletionTokens: sql<number>`COALESCE(SUM(${llmUsage.completionTokens}), 0)`,
          totalTokens: sql<number>`COALESCE(SUM(${llmUsage.totalTokens}), 0)`,
          avgLatencyMs: sql<number>`COALESCE(ROUND(AVG(${llmUsage.latencyMs})), 0)`,
          customEndpointRequests: sql<number>`SUM(CASE WHEN ${llmUsage.source} = 'custom' THEN 1 ELSE 0 END)`,
          builtInRequests: sql<number>`SUM(CASE WHEN ${llmUsage.source} = 'builtin' THEN 1 ELSE 0 END)`,
          fallbackCount: sql<number>`SUM(CASE WHEN ${llmUsage.source} = 'fallback' THEN 1 ELSE 0 END)`,
        })
        .from(llmUsage)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      return result[0] ?? {
        totalRequests: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        avgLatencyMs: 0,
        customEndpointRequests: 0,
        builtInRequests: 0,
        fallbackCount: 0,
      };
    }),

  /**
   * Time-series usage data for charts (hourly buckets).
   */
  usageHistory: publicProcedure
    .input(
      z.object({
        range: z.enum(["24h", "7d", "30d"]).default("24h"),
      })
    )
    .query(async ({ input }) => {
      const db = await requireDb();

      const now = new Date();
      let cutoff: Date;
      let bucketFormat: string;

      if (input.range === "24h") {
        cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        bucketFormat = "%Y-%m-%d %H:00:00";
      } else if (input.range === "7d") {
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        bucketFormat = "%Y-%m-%d %H:00:00";
      } else {
        cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        bucketFormat = "%Y-%m-%d";
      }

      const fmt = sql.raw(`'${bucketFormat}'`);
      const rows = await db
        .select({
          bucket: sql<string>`DATE_FORMAT(${llmUsage.createdAt}, ${fmt})`,
          requests: sql<number>`COUNT(*)`,
          promptTokens: sql<number>`COALESCE(SUM(${llmUsage.promptTokens}), 0)`,
          completionTokens: sql<number>`COALESCE(SUM(${llmUsage.completionTokens}), 0)`,
          totalTokens: sql<number>`COALESCE(SUM(${llmUsage.totalTokens}), 0)`,
          avgLatencyMs: sql<number>`COALESCE(ROUND(AVG(${llmUsage.latencyMs})), 0)`,
        })
        .from(llmUsage)
        .where(gte(llmUsage.createdAt, cutoff))
        .groupBy(sql`DATE_FORMAT(${llmUsage.createdAt}, ${fmt})`)
        .orderBy(sql`DATE_FORMAT(${llmUsage.createdAt}, ${fmt})`);

      return rows;
    }),

  /**
   * Recent LLM calls — paginated list of individual invocations.
   */
  recentCalls: publicProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(25),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await requireDb();

      const [calls, countResult] = await Promise.all([
        db
          .select()
          .from(llmUsage)
          .orderBy(desc(llmUsage.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(llmUsage),
      ]);

      return {
        calls,
        total: countResult[0]?.count ?? 0,
      };
    }),
});
