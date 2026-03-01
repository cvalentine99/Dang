/**
 * Schedule utility functions for baseline auto-capture.
 */

import type { BaselineFrequency } from "../../drizzle/schema";

/** Map frequency labels to milliseconds */
const FREQUENCY_MS: Record<BaselineFrequency, number> = {
  hourly: 60 * 60 * 1000,
  every_6h: 6 * 60 * 60 * 1000,
  every_12h: 12 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

/** Compute the next run time from now based on frequency */
export function computeNextRunAt(frequency: BaselineFrequency, from?: Date): Date {
  const base = from ?? new Date();
  const ms = FREQUENCY_MS[frequency];
  if (!ms) throw new Error(`Unknown frequency: ${frequency}`);
  return new Date(base.getTime() + ms);
}

/** Get the interval in milliseconds for a frequency */
export function getFrequencyMs(frequency: BaselineFrequency): number {
  const ms = FREQUENCY_MS[frequency];
  if (!ms) throw new Error(`Unknown frequency: ${frequency}`);
  return ms;
}

/** Human-readable label for a frequency */
export function frequencyLabel(frequency: BaselineFrequency): string {
  const labels: Record<BaselineFrequency, string> = {
    hourly: "Every hour",
    every_6h: "Every 6 hours",
    every_12h: "Every 12 hours",
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
  };
  return labels[frequency] ?? frequency;
}

/** Check if a schedule is overdue (nextRunAt is in the past) */
export function isOverdue(nextRunAt: Date): boolean {
  return nextRunAt.getTime() < Date.now();
}
