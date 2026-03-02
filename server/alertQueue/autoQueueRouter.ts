/**
 * Auto-Queue Rules Router — configurable rules that automatically send matching
 * Wazuh alerts to the Alert Queue for structured triage without manual analyst intervention.
 *
 * Rules are evaluated on a configurable polling interval (default: 60s).
 * The poller queries the Wazuh Indexer for recent alerts and checks them
 * against all enabled rules. Matching alerts are auto-enqueued.
 *
 * Feature-gated: CRUD requires admin role. Polling is server-side only.
 */

import { requireDb } from "../dbGuard";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { autoQueueRules, alertQueue } from "../../drizzle/schema";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import {
  getEffectiveIndexerConfig,
  indexerSearch,
  INDEX_PATTERNS,
  timeRangeFilter,
  boolQuery,
  type ESSearchBody,
} from "../indexer/indexerClient";

// ── Polling state ──────────────────────────────────────────────────────────
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let pollingActive = false;
let lastPollTime: string | null = null;
let lastPollResult: { matched: number; queued: number; skipped: number; errors: string[] } | null = null;
const POLL_INTERVAL_MS = 60_000; // 60 seconds
const MAX_QUEUE_DEPTH = 10;

// ── Rule matching logic ────────────────────────────────────────────────────

interface WazuhAlert {
  _id: string;
  _source: {
    timestamp?: string;
    rule?: {
      id?: string;
      description?: string;
      level?: number;
      mitre?: {
        id?: string[];
        tactic?: string[];
      };
      groups?: string[];
    };
    agent?: {
      id?: string;
      name?: string;
    };
    data?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

interface AutoQueueRule {
  id: number;
  name: string;
  enabled: number;
  minSeverity: number | null;
  ruleIds: string | null;
  agentPattern: string | null;
  mitreTechniqueIds: string | null;
  maxPerHour: number;
  currentHourCount: number;
  currentHourStart: Date | null;
}

function matchesRule(alert: WazuhAlert, rule: AutoQueueRule): boolean {
  const src = alert._source;
  const ruleLevel = src.rule?.level ?? 0;

  // Severity threshold check
  if (rule.minSeverity != null && ruleLevel < rule.minSeverity) {
    return false;
  }

  // Rule ID match (comma-separated list)
  if (rule.ruleIds) {
    const allowedIds = rule.ruleIds.split(",").map(s => s.trim()).filter(Boolean);
    const alertRuleId = src.rule?.id ?? "";
    if (allowedIds.length > 0 && !allowedIds.includes(alertRuleId)) {
      return false;
    }
  }

  // Agent pattern match (supports * wildcard)
  if (rule.agentPattern) {
    const pattern = rule.agentPattern.trim();
    const agentId = src.agent?.id ?? "";
    const agentName = src.agent?.name ?? "";
    const combined = `${agentId} ${agentName}`;

    if (pattern.includes("*")) {
      // Convert wildcard to regex
      const regex = new RegExp(
        "^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
        "i"
      );
      if (!regex.test(agentId) && !regex.test(agentName)) {
        return false;
      }
    } else {
      if (!combined.toLowerCase().includes(pattern.toLowerCase())) {
        return false;
      }
    }
  }

  // MITRE technique ID match (comma-separated list)
  if (rule.mitreTechniqueIds) {
    const requiredTechniques = rule.mitreTechniqueIds.split(",").map(s => s.trim()).filter(Boolean);
    const alertTechniques = src.rule?.mitre?.id ?? [];
    if (requiredTechniques.length > 0 && !requiredTechniques.some(t => alertTechniques.includes(t))) {
      return false;
    }
  }

  return true;
}

/**
 * Check and reset the hourly rate limit counter for a rule.
 * Returns true if the rule can still auto-queue (under limit).
 */
async function checkRateLimit(rule: AutoQueueRule): Promise<boolean> {
  const db = await requireDb();

  const now = new Date();
  const hourStart = rule.currentHourStart;

  // If no hour window or it's expired (>1 hour old), reset
  if (!hourStart || now.getTime() - hourStart.getTime() > 3600_000) {
    await db
      .update(autoQueueRules)
      .set({ currentHourCount: 1, currentHourStart: now })
      .where(eq(autoQueueRules.id, rule.id));
    return true;
  }

  // Within the current hour window — check count
  if (rule.currentHourCount >= rule.maxPerHour) {
    return false; // Rate limited
  }

  // Increment counter
  await db
    .update(autoQueueRules)
    .set({ currentHourCount: rule.currentHourCount + 1 })
    .where(eq(autoQueueRules.id, rule.id));

  return true;
}

/**
 * Core polling function — queries Wazuh Indexer for recent alerts
 * and auto-enqueues those matching enabled rules.
 */
async function pollAndEnqueue(): Promise<{ matched: number; queued: number; skipped: number; errors: string[] }> {
  const result = { matched: 0, queued: 0, skipped: 0, errors: [] as string[] };

  try {
    const db = await requireDb();

    // Get all enabled rules
    const rules = await db
      .select()
      .from(autoQueueRules)
      .where(eq(autoQueueRules.enabled, 1));

    if (rules.length === 0) return result;

    // Get indexer config
    const indexerConfig = await getEffectiveIndexerConfig();
    if (!indexerConfig) {
      result.errors.push("Wazuh Indexer not configured");
      return result;
    }

    // Query recent alerts (last 90 seconds to overlap with poll interval)
    const body: ESSearchBody = {
      query: boolQuery({
        filter: [timeRangeFilter("now-90s", "now")],
      }),
      size: 100,
      sort: [{ timestamp: { order: "desc" } }],
    };

    const searchResult = await indexerSearch(indexerConfig, INDEX_PATTERNS.ALERTS, body, "auto-queue");
    const hits = (searchResult?.hits?.hits ?? []) as WazuhAlert[];

    if (hits.length === 0) return result;

    // Get current queue depth
    const [countResult] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(alertQueue)
      .where(inArray(alertQueue.status, ["queued", "processing"]));
    let currentQueueDepth = countResult?.count ?? 0;

    // Check each alert against each rule
    for (const alert of hits) {
      if (currentQueueDepth >= MAX_QUEUE_DEPTH) {
        result.skipped += hits.length - result.matched;
        break;
      }

      for (const rule of rules) {
        if (!matchesRule(alert, rule)) continue;

        result.matched++;

        // Check for duplicate
        const alertId = alert._id;
        const [existing] = await db
          .select({ id: alertQueue.id })
          .from(alertQueue)
          .where(
            and(
              eq(alertQueue.alertId, alertId),
              inArray(alertQueue.status, ["queued", "processing"])
            )
          )
          .limit(1);

        if (existing) {
          result.skipped++;
          break; // Already queued, skip to next alert
        }

        // Check rate limit
        const allowed = await checkRateLimit(rule);
        if (!allowed) {
          result.skipped++;
          break; // Rate limited, skip to next alert
        }

        // Enqueue the alert
        try {
          const src = alert._source;
          await db.insert(alertQueue).values({
            alertId,
            ruleId: src.rule?.id ?? "unknown",
            ruleDescription: src.rule?.description ?? null,
            ruleLevel: src.rule?.level ?? 0,
            agentId: src.agent?.id ?? null,
            agentName: src.agent?.name ?? null,
            alertTimestamp: src.timestamp ?? null,
            rawJson: src as unknown as Record<string, unknown>,
            status: "queued",
            queuedBy: null, // Auto-queued (no user)
          });

          result.queued++;
          currentQueueDepth++;
        } catch (err) {
          result.errors.push(`Failed to enqueue ${alertId}: ${(err as Error).message}`);
        }

        break; // Alert matched a rule, don't check remaining rules
      }
    }
  } catch (err) {
    result.errors.push(`Poll error: ${(err as Error).message}`);
  }

  lastPollTime = new Date().toISOString();
  lastPollResult = result;
  return result;
}

/**
 * Start the auto-queue polling engine.
 * Called when at least one rule is enabled.
 */
function startPolling(): void {
  if (pollingActive) return;
  pollingActive = true;
  console.log("[AutoQueue] Polling engine started (interval: 60s)");

  // Run immediately on start
  pollAndEnqueue().catch(err => console.error("[AutoQueue] Poll error:", err));

  pollingInterval = setInterval(() => {
    pollAndEnqueue().catch(err => console.error("[AutoQueue] Poll error:", err));
  }, POLL_INTERVAL_MS);
}

/**
 * Stop the auto-queue polling engine.
 * Called when all rules are disabled.
 */
function stopPolling(): void {
  if (!pollingActive) return;
  pollingActive = false;
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  console.log("[AutoQueue] Polling engine stopped");
}

/**
 * Check if any rules are enabled and start/stop polling accordingly.
 */
async function syncPollingState(): Promise<void> {
  const db = await requireDb();

  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(autoQueueRules)
    .where(eq(autoQueueRules.enabled, 1));

  const enabledCount = result?.count ?? 0;

  if (enabledCount > 0 && !pollingActive) {
    startPolling();
  } else if (enabledCount === 0 && pollingActive) {
    stopPolling();
  }
}

// Auto-start polling on server boot (checks if any rules are enabled)
setTimeout(() => syncPollingState().catch(() => {}), 5000);

// ── Router ─────────────────────────────────────────────────────────────────

export const autoQueueRouter = router({
  /**
   * List all auto-queue rules.
   */
  list: protectedProcedure.query(async () => {
    const db = await requireDb();

    const rules = await db
      .select()
      .from(autoQueueRules)
      .orderBy(desc(autoQueueRules.createdAt));

    return {
      rules,
      pollingActive,
      lastPollTime,
      lastPollResult,
    };
  }),

  /**
   * Create a new auto-queue rule. Requires admin role.
   */
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(256),
      minSeverity: z.number().int().min(0).max(15).nullable().default(null),
      ruleIds: z.string().nullable().default(null),
      agentPattern: z.string().max(256).nullable().default(null),
      mitreTechniqueIds: z.string().nullable().default(null),
      maxPerHour: z.number().int().min(1).max(100).default(10),
      enabled: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin role required" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [result] = await db.insert(autoQueueRules).values({
        name: input.name,
        minSeverity: input.minSeverity,
        ruleIds: input.ruleIds,
        agentPattern: input.agentPattern,
        mitreTechniqueIds: input.mitreTechniqueIds,
        maxPerHour: input.maxPerHour,
        enabled: input.enabled ? 1 : 0,
        createdBy: ctx.user?.id ?? null,
      });

      // Start polling if this is the first enabled rule
      await syncPollingState();

      return { success: true, id: result.insertId };
    }),

  /**
   * Update an existing auto-queue rule. Requires admin role.
   */
  update: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      name: z.string().min(1).max(256).optional(),
      minSeverity: z.number().int().min(0).max(15).nullable().optional(),
      ruleIds: z.string().nullable().optional(),
      agentPattern: z.string().max(256).nullable().optional(),
      mitreTechniqueIds: z.string().nullable().optional(),
      maxPerHour: z.number().int().min(1).max(100).optional(),
      enabled: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin role required" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const { id, ...updates } = input;
      const setValues: Record<string, unknown> = {};

      if (updates.name !== undefined) setValues.name = updates.name;
      if (updates.minSeverity !== undefined) setValues.minSeverity = updates.minSeverity;
      if (updates.ruleIds !== undefined) setValues.ruleIds = updates.ruleIds;
      if (updates.agentPattern !== undefined) setValues.agentPattern = updates.agentPattern;
      if (updates.mitreTechniqueIds !== undefined) setValues.mitreTechniqueIds = updates.mitreTechniqueIds;
      if (updates.maxPerHour !== undefined) setValues.maxPerHour = updates.maxPerHour;
      if (updates.enabled !== undefined) setValues.enabled = updates.enabled ? 1 : 0;

      await db
        .update(autoQueueRules)
        .set(setValues)
        .where(eq(autoQueueRules.id, id));

      // Sync polling state (may start or stop)
      await syncPollingState();

      return { success: true };
    }),

  /**
   * Delete an auto-queue rule. Requires admin role.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin role required" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db.delete(autoQueueRules).where(eq(autoQueueRules.id, input.id));

      // Sync polling state (may stop if no rules left)
      await syncPollingState();

      return { success: true };
    }),

  /**
   * Get polling engine status.
   */
  pollingStatus: protectedProcedure.query(async () => {
    return {
      active: pollingActive,
      intervalMs: POLL_INTERVAL_MS,
      lastPollTime,
      lastPollResult,
    };
  }),

  /**
   * Manually trigger a poll cycle. Requires admin role.
   * Useful for testing rules without waiting for the next interval.
   */
  triggerPoll: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user?.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin role required" });
    }

    const result = await pollAndEnqueue();
    return result;
  }),
});
