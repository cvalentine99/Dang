/**
 * Anomaly Suppression Rules Engine — Evaluates whether an anomaly should be suppressed.
 *
 * Suppression rules allow analysts to mute anomaly alerts for specific schedules
 * and severity levels during maintenance windows or known-noisy periods.
 *
 * Evaluation logic:
 * 1. Fetch all active, non-expired rules for the user
 * 2. Filter by schedule match (null scheduleId = matches all)
 * 3. Filter by severity match (severityFilter = "all" matches everything,
 *    otherwise matches the specific severity or lower)
 * 4. If any rule matches, the anomaly is suppressed
 *
 * Severity ordering: critical > high > medium
 * A rule with severityFilter="high" suppresses high AND medium anomalies.
 * A rule with severityFilter="critical" suppresses all severities.
 * A rule with severityFilter="medium" suppresses only medium anomalies.
 */

import { eq, and, gte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { anomalySuppressionRules } from "../../drizzle/schema";

// ─── Severity Ordering ──────────────────────────────────────────────────────

const SEVERITY_RANK: Record<string, number> = {
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Check if a severity level is suppressed by a filter.
 * "all" suppresses everything.
 * Otherwise, the anomaly severity must be <= the filter severity.
 */
export function isSeveritySuppressed(
  anomalySeverity: "critical" | "high" | "medium",
  filterSeverity: "critical" | "high" | "medium" | "all"
): boolean {
  if (filterSeverity === "all") return true;
  const anomalyRank = SEVERITY_RANK[anomalySeverity] ?? 0;
  const filterRank = SEVERITY_RANK[filterSeverity] ?? 0;
  return anomalyRank <= filterRank;
}

// ─── Evaluation ─────────────────────────────────────────────────────────────

export interface SuppressionCheckResult {
  suppressed: boolean;
  ruleId?: number;
  reason?: string;
}

/**
 * Check whether an anomaly should be suppressed based on active rules.
 *
 * If suppressed, increments the rule's suppressedCount.
 */
export async function checkSuppression(
  userId: number,
  scheduleId: number,
  severity: "critical" | "high" | "medium"
): Promise<SuppressionCheckResult> {
  const db = await getDb();
  if (!db) return { suppressed: false };

  const now = new Date();

  // Fetch all active, non-expired rules for this user
  const rules = await db
    .select()
    .from(anomalySuppressionRules)
    .where(
      and(
        eq(anomalySuppressionRules.userId, userId),
        eq(anomalySuppressionRules.active, true),
        gte(anomalySuppressionRules.expiresAt, now)
      )
    );

  // Find the first matching rule
  for (const rule of rules) {
    // Check schedule match (null = all schedules)
    if (rule.scheduleId !== null && rule.scheduleId !== scheduleId) {
      continue;
    }

    // Check severity match
    if (!isSeveritySuppressed(severity, rule.severityFilter)) {
      continue;
    }

    // Match found — increment counter and return
    await db
      .update(anomalySuppressionRules)
      .set({
        suppressedCount: sql`${anomalySuppressionRules.suppressedCount} + 1`,
      })
      .where(eq(anomalySuppressionRules.id, rule.id));

    return {
      suppressed: true,
      ruleId: rule.id,
      reason: rule.reason,
    };
  }

  return { suppressed: false };
}

/**
 * Expire all rules whose expiresAt has passed.
 * Called periodically by the scheduler.
 */
export async function expireRules(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const now = new Date();
  const result = await db
    .update(anomalySuppressionRules)
    .set({ active: false })
    .where(
      and(
        eq(anomalySuppressionRules.active, true),
        // expiresAt < now means expired
        sql`${anomalySuppressionRules.expiresAt} < ${now}`
      )
    );

  return result[0]?.affectedRows ?? 0;
}
