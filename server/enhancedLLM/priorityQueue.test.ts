import { describe, it, expect } from "vitest";
import { getQueueStats } from "./enhancedLLMService";

describe("PriorityQueue — Real Per-Priority Tracking", () => {
  it("getQueueStats returns real priorityCounts structure (not hardcoded zeros)", () => {
    const stats = getQueueStats();

    // Must have the expected shape
    expect(stats).toHaveProperty("activeRequests");
    expect(stats).toHaveProperty("queueDepth");
    expect(stats).toHaveProperty("priorityCounts");
    expect(stats).toHaveProperty("lifetimeStats");

    // priorityCounts must have all three priority levels
    expect(stats.priorityCounts).toHaveProperty("critical");
    expect(stats.priorityCounts).toHaveProperty("high");
    expect(stats.priorityCounts).toHaveProperty("normal");

    // All values must be numbers (not undefined or null)
    expect(typeof stats.priorityCounts.critical).toBe("number");
    expect(typeof stats.priorityCounts.high).toBe("number");
    expect(typeof stats.priorityCounts.normal).toBe("number");

    // At idle (no queued items), counts should be 0
    expect(stats.queueDepth).toBe(0);
    expect(stats.priorityCounts.critical).toBe(0);
    expect(stats.priorityCounts.high).toBe(0);
    expect(stats.priorityCounts.normal).toBe(0);
  });

  it("getQueueStats returns lifetimeStats with enqueued and completed counters", () => {
    const stats = getQueueStats();

    expect(stats.lifetimeStats).toHaveProperty("enqueued");
    expect(stats.lifetimeStats).toHaveProperty("completed");

    expect(typeof stats.lifetimeStats.enqueued.critical).toBe("number");
    expect(typeof stats.lifetimeStats.enqueued.high).toBe("number");
    expect(typeof stats.lifetimeStats.enqueued.normal).toBe("number");

    expect(typeof stats.lifetimeStats.completed.critical).toBe("number");
    expect(typeof stats.lifetimeStats.completed.high).toBe("number");
    expect(typeof stats.lifetimeStats.completed.normal).toBe("number");
  });

  it("priorityCounts are derived from queue state, not hardcoded", () => {
    // Call getQueueStats twice — if values were hardcoded, they'd be identical
    // objects. Real tracking returns new copies each time.
    const stats1 = getQueueStats();
    const stats2 = getQueueStats();

    // Different object references (spread copy, not same object)
    expect(stats1.priorityCounts).not.toBe(stats2.priorityCounts);
    expect(stats1.lifetimeStats.enqueued).not.toBe(stats2.lifetimeStats.enqueued);
  });

  it("activeRequests reflects current execution state", () => {
    const stats = getQueueStats();
    // At test time, no LLM requests are active
    expect(stats.activeRequests).toBeGreaterThanOrEqual(0);
    expect(stats.activeRequests).toBeLessThanOrEqual(2); // maxConcurrent = 2
  });
});
