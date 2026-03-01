/**
 * Drift Detection — Compares two baseline snapshots and computes drift percentage.
 *
 * Used by the baseline scheduler to detect configuration drift after each
 * auto-capture. If drift exceeds the schedule's threshold and notifyOnDrift
 * is enabled, sends a notification to the project owner via notifyOwner().
 *
 * Drift is computed as:
 *   driftPercent = (added + removed + changed) / max(totalPrevious, totalCurrent, 1) * 100
 *
 * Categories compared: packages, services, users (per agent).
 */

import { notifyOwner } from "../_core/notification";
import { recordNotification } from "./notificationHistory";
import type { BaselineSchedule, ConfigBaseline } from "../../drizzle/schema";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DriftItem {
  category: "packages" | "services" | "users";
  agentId: string;
  name: string;
  changeType: "added" | "removed" | "changed";
  previousValue?: string;
  currentValue?: string;
}

export interface DriftResult {
  totalItems: number;
  driftItems: DriftItem[];
  driftCount: number;
  driftPercent: number;
  byCategory: {
    packages: { added: number; removed: number; changed: number };
    services: { added: number; removed: number; changed: number };
    users: { added: number; removed: number; changed: number };
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract a name→value map from a snapshot category for a given agent.
 * Packages: name → version, Services: name → state, Users: name → shell
 */
function extractItemMap(
  snapshot: Record<string, unknown>,
  category: "packages" | "services" | "users",
  agentId: string
): Map<string, string> {
  const map = new Map<string, string>();
  const categoryData = snapshot[category] as Record<string, unknown[]> | undefined;
  if (!categoryData) return map;

  const items = categoryData[agentId];
  if (!Array.isArray(items)) return map;

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;

    let name: string;
    let value: string;

    if (category === "packages") {
      name = String(obj.name || obj.package || "unknown");
      value = String(obj.version || "");
    } else if (category === "services") {
      name = String(obj.name || obj.service || "unknown");
      value = String(obj.state || obj.status || "");
    } else {
      // users
      name = String(obj.name || obj.login || "unknown");
      value = String(obj.shell || obj.home || "");
    }

    map.set(name, value);
  }

  return map;
}

/**
 * Get the set of agent IDs present in a snapshot across all categories.
 */
function getSnapshotAgentIds(snapshot: Record<string, unknown>): Set<string> {
  const agentIds = new Set<string>();
  for (const category of ["packages", "services", "users"] as const) {
    const categoryData = snapshot[category] as Record<string, unknown> | undefined;
    if (categoryData) {
      for (const agentId of Object.keys(categoryData)) {
        agentIds.add(agentId);
      }
    }
  }
  return agentIds;
}

// ─── Core ────────────────────────────────────────────────────────────────────

/**
 * Compare two baseline snapshots and return a drift result.
 * Uses the same diff logic as the frontend DriftComparison component.
 */
export function compareBaselines(
  previous: Record<string, unknown>,
  current: Record<string, unknown>
): DriftResult {
  const driftItems: DriftItem[] = [];
  const byCategory = {
    packages: { added: 0, removed: 0, changed: 0 },
    services: { added: 0, removed: 0, changed: 0 },
    users: { added: 0, removed: 0, changed: 0 },
  };

  // Merge agent IDs from both snapshots
  const prevAgentIds = getSnapshotAgentIds(previous);
  const currAgentIds = getSnapshotAgentIds(current);
  const allAgentIds: string[] = Array.from(prevAgentIds);
  currAgentIds.forEach((id) => {
    if (!prevAgentIds.has(id)) allAgentIds.push(id);
  });

  let totalPrevious = 0;
  let totalCurrent = 0;

  for (const category of ["packages", "services", "users"] as const) {
    for (let ai = 0; ai < allAgentIds.length; ai++) {
      const agentId = allAgentIds[ai];
      const prevMap = extractItemMap(previous, category, agentId);
      const currMap = extractItemMap(current, category, agentId);

      totalPrevious += prevMap.size;
      totalCurrent += currMap.size;

      // Check for added and changed items
      currMap.forEach((currValue, name) => {
        if (!prevMap.has(name)) {
          driftItems.push({ category, agentId, name, changeType: "added", currentValue: currValue });
          byCategory[category].added++;
        } else if (prevMap.get(name) !== currValue) {
          driftItems.push({
            category, agentId, name, changeType: "changed",
            previousValue: prevMap.get(name), currentValue: currValue,
          });
          byCategory[category].changed++;
        }
      });

      // Check for removed items
      prevMap.forEach((prevValue, name) => {
        if (!currMap.has(name)) {
          driftItems.push({ category, agentId, name, changeType: "removed", previousValue: prevValue });
          byCategory[category].removed++;
        }
      });
    }
  }

  const driftCount = driftItems.length;
  const totalItems = Math.max(totalPrevious, totalCurrent, 1);
  const driftPercent = Math.round((driftCount / totalItems) * 100 * 100) / 100; // 2 decimal places

  return { totalItems, driftItems, driftCount, driftPercent, byCategory };
}

// ─── Notification ────────────────────────────────────────────────────────────

/**
 * Check drift against threshold and send notification if exceeded.
 * Returns true if notification was sent, false otherwise.
 */
export async function checkDriftAndNotify(
  schedule: BaselineSchedule,
  previousBaseline: ConfigBaseline,
  currentSnapshot: Record<string, unknown>
): Promise<{ notified: boolean; driftResult: DriftResult }> {
  const driftResult = compareBaselines(
    previousBaseline.snapshotData as Record<string, unknown>,
    currentSnapshot
  );

  // Skip notification if disabled or threshold not exceeded
  if (!schedule.notifyOnDrift || schedule.driftThreshold <= 0) {
    return { notified: false, driftResult };
  }

  if (driftResult.driftPercent < schedule.driftThreshold) {
    return { notified: false, driftResult };
  }

  // Build notification content
  const { byCategory } = driftResult;
  const lines: string[] = [
    `Schedule: **${schedule.name}** (ID: ${schedule.id})`,
    `Drift: **${driftResult.driftPercent}%** (${driftResult.driftCount} changes out of ${driftResult.totalItems} items)`,
    `Threshold: ${schedule.driftThreshold}%`,
    `Agents: ${schedule.agentIds.join(", ")}`,
    "",
    "**Breakdown:**",
    `- Packages: +${byCategory.packages.added} added, -${byCategory.packages.removed} removed, ~${byCategory.packages.changed} changed`,
    `- Services: +${byCategory.services.added} added, -${byCategory.services.removed} removed, ~${byCategory.services.changed} changed`,
    `- Users: +${byCategory.users.added} added, -${byCategory.users.removed} removed, ~${byCategory.users.changed} changed`,
  ];

  // Add top 10 drift items as examples
  if (driftResult.driftItems.length > 0) {
    lines.push("", "**Top changes:**");
    const topItems = driftResult.driftItems.slice(0, 10);
    for (const item of topItems) {
      const prefix = item.changeType === "added" ? "+" : item.changeType === "removed" ? "-" : "~";
      lines.push(`  ${prefix} [${item.category}] ${item.name} (agent ${item.agentId})`);
    }
    if (driftResult.driftItems.length > 10) {
      lines.push(`  ... and ${driftResult.driftItems.length - 10} more`);
    }
  }

  const title = `⚠️ Configuration Drift Alert: ${schedule.name} (${driftResult.driftPercent}%)`;
  const content = lines.join("\n");
  let notified = false;
  let errorMessage: string | undefined;

  try {
    await notifyOwner({ title, content });
    notified = true;
    console.log(
      `[BaselineScheduler] Drift notification sent for schedule "${schedule.name}": ${driftResult.driftPercent}% exceeds threshold ${schedule.driftThreshold}%`
    );
  } catch (err) {
    errorMessage = (err as Error).message;
    console.warn(
      `[BaselineScheduler] Failed to send drift notification for schedule "${schedule.name}": ${errorMessage}`
    );
  }

  // Record in notification history for audit trail
  await recordNotification({
    notificationType: "drift_threshold",
    scheduleId: schedule.id,
    userId: schedule.userId,
    severity: "info",
    title,
    content,
    deliveryStatus: notified ? "sent" : "failed",
    errorMessage,
    scheduleName: schedule.name,
    driftPercent: driftResult.driftPercent,
    agentIds: schedule.agentIds as string[],
  });

  return { notified, driftResult };
}
