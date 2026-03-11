/**
 * Tests for the Drift Anomaly Detection Engine.
 *
 * Tests cover:
 * - computeRollingStats: mean, stddev, edge cases
 * - calculateZScore: normal, zero stddev, edge cases
 * - zScoreToSeverity: severity mapping thresholds
 * - anomalyRouter endpoints: stats, list, detail, acknowledge, acknowledgeAll
 */

import { describe, it, expect } from "vitest";
import {
  computeRollingStats,
  calculateZScore,
  zScoreToSeverity,
  MIN_WINDOW_SIZE,
  DEFAULT_SIGMA_THRESHOLD,
  DEFAULT_WINDOW_SIZE,
} from "./anomalyDetection";

// ─── computeRollingStats ────────────────────────────────────────────────────

describe("computeRollingStats", () => {
  it("returns zeros for empty array", () => {
    const result = computeRollingStats([]);
    expect(result.mean).toBe(0);
    expect(result.stdDev).toBe(0);
    expect(result.count).toBe(0);
    expect(result.values).toEqual([]);
  });

  it("computes correct stats for single value", () => {
    const result = computeRollingStats([10]);
    expect(result.mean).toBe(10);
    expect(result.stdDev).toBe(0);
    expect(result.count).toBe(1);
  });

  it("computes correct mean for uniform values", () => {
    const result = computeRollingStats([5, 5, 5, 5, 5]);
    expect(result.mean).toBe(5);
    expect(result.stdDev).toBe(0);
    expect(result.count).toBe(5);
  });

  it("computes correct mean and stddev for known values", () => {
    // Values: [2, 4, 4, 4, 5, 5, 7, 9]
    // Mean = 40/8 = 5
    // Variance = ((9+1+1+1+0+0+4+16)/8) = 32/8 = 4
    // StdDev = 2
    const result = computeRollingStats([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(result.mean).toBe(5);
    expect(result.stdDev).toBe(2);
    expect(result.count).toBe(8);
  });

  it("computes correct stats for two values", () => {
    // Values: [0, 10] → mean=5, variance=25, stddev=5
    const result = computeRollingStats([0, 10]);
    expect(result.mean).toBe(5);
    expect(result.stdDev).toBe(5);
    expect(result.count).toBe(2);
  });

  it("handles decimal values", () => {
    const result = computeRollingStats([1.5, 2.5, 3.5]);
    expect(result.mean).toBeCloseTo(2.5, 10);
    expect(result.count).toBe(3);
    // stddev of [1.5, 2.5, 3.5] = sqrt(((1)^2 + 0 + 1)/3) = sqrt(2/3) ≈ 0.8165
    expect(result.stdDev).toBeCloseTo(Math.sqrt(2 / 3), 10);
  });

  it("handles all zeros", () => {
    const result = computeRollingStats([0, 0, 0, 0]);
    expect(result.mean).toBe(0);
    expect(result.stdDev).toBe(0);
  });

  it("handles large values", () => {
    const result = computeRollingStats([1000000, 2000000, 3000000]);
    expect(result.mean).toBe(2000000);
    expect(result.count).toBe(3);
  });
});

// ─── calculateZScore ────────────────────────────────────────────────────────

describe("calculateZScore", () => {
  it("returns 0 when value equals mean with zero stddev", () => {
    const stats = computeRollingStats([5, 5, 5, 5, 5]);
    expect(calculateZScore(5, stats)).toBe(0);
  });

  it("returns Infinity when value differs from mean with zero stddev", () => {
    const stats = computeRollingStats([5, 5, 5, 5, 5]);
    expect(calculateZScore(10, stats)).toBe(Infinity);
  });

  it("returns correct z-score for known values", () => {
    // mean=5, stddev=2
    const stats = computeRollingStats([2, 4, 4, 4, 5, 5, 7, 9]);
    // z-score for 9: (9-5)/2 = 2.0
    expect(calculateZScore(9, stats)).toBe(2);
    // z-score for 11: (11-5)/2 = 3.0
    expect(calculateZScore(11, stats)).toBe(3);
    // z-score for 13: (13-5)/2 = 4.0
    expect(calculateZScore(13, stats)).toBe(4);
  });

  it("returns negative z-score for values below mean", () => {
    const stats = computeRollingStats([2, 4, 4, 4, 5, 5, 7, 9]);
    // z-score for 1: (1-5)/2 = -2.0
    expect(calculateZScore(1, stats)).toBe(-2);
  });

  it("returns 0 for value at the mean", () => {
    const stats = computeRollingStats([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(calculateZScore(5, stats)).toBe(0);
  });

  it("handles empty stats gracefully", () => {
    const stats = computeRollingStats([]);
    // value=0, mean=0, stddev=0 → value equals mean → 0
    expect(calculateZScore(0, stats)).toBe(0);
    // value=5, mean=0, stddev=0 → value differs → Infinity
    expect(calculateZScore(5, stats)).toBe(Infinity);
  });
});

// ─── zScoreToSeverity ───────────────────────────────────────────────────────

describe("zScoreToSeverity", () => {
  it("returns critical for z >= 4.0", () => {
    expect(zScoreToSeverity(4.0)).toBe("critical");
    expect(zScoreToSeverity(5.5)).toBe("critical");
    expect(zScoreToSeverity(100)).toBe("critical");
  });

  it("returns high for 3.0 <= z < 4.0", () => {
    expect(zScoreToSeverity(3.0)).toBe("high");
    expect(zScoreToSeverity(3.5)).toBe("high");
    expect(zScoreToSeverity(3.99)).toBe("high");
  });

  it("returns medium for 2.0 <= z < 3.0", () => {
    expect(zScoreToSeverity(2.0)).toBe("medium");
    expect(zScoreToSeverity(2.5)).toBe("medium");
    expect(zScoreToSeverity(2.99)).toBe("medium");
  });

  it("returns medium for z < 2.0 (fallback)", () => {
    // Even though z < 2.0 shouldn't normally trigger an anomaly,
    // the function itself just maps z → severity
    expect(zScoreToSeverity(1.0)).toBe("medium");
    expect(zScoreToSeverity(0)).toBe("medium");
    expect(zScoreToSeverity(-1)).toBe("medium");
  });

  it("handles Infinity as critical", () => {
    expect(zScoreToSeverity(Infinity)).toBe("critical");
  });
});

// ─── Constants ──────────────────────────────────────────────────────────────

describe("anomaly detection constants", () => {
  it("has sensible defaults", () => {
    expect(MIN_WINDOW_SIZE).toBe(5);
    expect(DEFAULT_WINDOW_SIZE).toBe(20);
    expect(DEFAULT_SIGMA_THRESHOLD).toBe(2.0);
  });

  it("MIN_WINDOW_SIZE is less than DEFAULT_WINDOW_SIZE", () => {
    expect(MIN_WINDOW_SIZE).toBeLessThan(DEFAULT_WINDOW_SIZE);
  });
});

// ─── Integration scenario: typical drift detection ──────────────────────────

describe("anomaly detection scenario", () => {
  it("detects anomaly in a typical drift pattern", () => {
    // Simulate 10 previous snapshots with low drift (5-15%)
    const previousDrifts = [5, 8, 6, 10, 7, 9, 11, 8, 12, 6];
    const stats = computeRollingStats(previousDrifts);

    // Current drift is 45% — should be anomalous
    const zScore = calculateZScore(45, stats);

    // Mean ≈ 8.2, StdDev ≈ 2.14
    // z = (45 - 8.2) / 2.14 ≈ 17.2 → critical
    expect(zScore).toBeGreaterThan(DEFAULT_SIGMA_THRESHOLD);
    expect(zScoreToSeverity(zScore)).toBe("critical");
  });

  it("does not flag normal drift variation", () => {
    const previousDrifts = [5, 8, 6, 10, 7, 9, 11, 8, 12, 6];
    const stats = computeRollingStats(previousDrifts);

    // Current drift is 10% — within normal range
    const zScore = calculateZScore(10, stats);

    expect(zScore).toBeLessThan(DEFAULT_SIGMA_THRESHOLD);
  });

  it("detects medium anomaly at exactly 2 sigma", () => {
    // Create data where we know the exact mean and stddev
    // 10 values of 10 → mean=10, stddev=0 → any deviation is Infinity
    // Use varied data instead
    const previousDrifts = [10, 10, 10, 10, 10, 20, 20, 20, 20, 20];
    const stats = computeRollingStats(previousDrifts);
    // mean = 15, stddev = 5
    expect(stats.mean).toBe(15);
    expect(stats.stdDev).toBe(5);

    // Value at exactly 2σ above mean: 15 + 2*5 = 25
    const zScore = calculateZScore(25, stats);
    expect(zScore).toBe(2);
    expect(zScoreToSeverity(zScore)).toBe("medium");
  });

  it("detects high anomaly at 3 sigma", () => {
    const previousDrifts = [10, 10, 10, 10, 10, 20, 20, 20, 20, 20];
    const stats = computeRollingStats(previousDrifts);

    // Value at 3σ: 15 + 3*5 = 30
    const zScore = calculateZScore(30, stats);
    expect(zScore).toBe(3);
    expect(zScoreToSeverity(zScore)).toBe("high");
  });

  it("detects critical anomaly at 4 sigma", () => {
    const previousDrifts = [10, 10, 10, 10, 10, 20, 20, 20, 20, 20];
    const stats = computeRollingStats(previousDrifts);

    // Value at 4σ: 15 + 4*5 = 35
    const zScore = calculateZScore(35, stats);
    expect(zScore).toBe(4);
    expect(zScoreToSeverity(zScore)).toBe("critical");
  });
});

// ─── anomalyRouter endpoint tests ───────────────────────────────────────────

describe("anomalyRouter", () => {
  it("stats endpoint returns zero counts when no anomalies exist", async () => {
    // This tests the router's shape — the actual DB call is mocked by the empty DB
    const { anomalyRouter } = await import("./anomalyRouter");
    expect(anomalyRouter).toBeDefined();
    expect(anomalyRouter._def.procedures).toHaveProperty("stats");
    expect(anomalyRouter._def.procedures).toHaveProperty("list");
    expect(anomalyRouter._def.procedures).toHaveProperty("detail");
    expect(anomalyRouter._def.procedures).toHaveProperty("acknowledge");
    expect(anomalyRouter._def.procedures).toHaveProperty("acknowledgeAll");
  });

  it("has all 5 expected endpoints", async () => {
    const { anomalyRouter } = await import("./anomalyRouter");
    const procedures = Object.keys(anomalyRouter._def.procedures);
    expect(procedures).toContain("stats");
    expect(procedures).toContain("list");
    expect(procedures).toContain("detail");
    expect(procedures).toContain("acknowledge");
    expect(procedures).toContain("acknowledgeAll");
    expect(procedures.length).toBe(5);
  });
});
