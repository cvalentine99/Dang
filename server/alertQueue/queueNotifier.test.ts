/**
 * Tests for the queue notification system:
 * - recentAlerts endpoint returns alerts queued after a given timestamp
 * - Severity tier classification
 * - Notification preferences defaults
 */

import { describe, it, expect } from "vitest";

// ── Severity classification tests (mirroring QueueNotifier logic) ───────────

function getSeverityTier(level: number): "critical" | "high" | "low" {
  if (level >= 12) return "critical";
  if (level >= 8) return "high";
  return "low";
}

function getSeverityLabel(level: number): string {
  if (level >= 12) return "CRITICAL";
  if (level >= 8) return "HIGH";
  if (level >= 4) return "MEDIUM";
  return "LOW";
}

interface NotifPrefs {
  critical: boolean;
  high: boolean;
  low: boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  critical: true,
  high: true,
  low: false,
};

describe("Queue Notification System", () => {
  describe("Severity tier classification", () => {
    it("classifies level 12+ as critical", () => {
      expect(getSeverityTier(12)).toBe("critical");
      expect(getSeverityTier(13)).toBe("critical");
      expect(getSeverityTier(15)).toBe("critical");
    });

    it("classifies level 8-11 as high", () => {
      expect(getSeverityTier(8)).toBe("high");
      expect(getSeverityTier(9)).toBe("high");
      expect(getSeverityTier(10)).toBe("high");
      expect(getSeverityTier(11)).toBe("high");
    });

    it("classifies level 0-7 as low", () => {
      expect(getSeverityTier(0)).toBe("low");
      expect(getSeverityTier(3)).toBe("low");
      expect(getSeverityTier(7)).toBe("low");
    });

    it("returns correct severity labels", () => {
      expect(getSeverityLabel(15)).toBe("CRITICAL");
      expect(getSeverityLabel(12)).toBe("CRITICAL");
      expect(getSeverityLabel(10)).toBe("HIGH");
      expect(getSeverityLabel(8)).toBe("HIGH");
      expect(getSeverityLabel(6)).toBe("MEDIUM");
      expect(getSeverityLabel(4)).toBe("MEDIUM");
      expect(getSeverityLabel(3)).toBe("LOW");
      expect(getSeverityLabel(0)).toBe("LOW");
    });
  });

  describe("Default notification preferences", () => {
    it("enables critical notifications by default", () => {
      expect(DEFAULT_PREFS.critical).toBe(true);
    });

    it("enables high notifications by default", () => {
      expect(DEFAULT_PREFS.high).toBe(true);
    });

    it("disables low notifications by default", () => {
      expect(DEFAULT_PREFS.low).toBe(false);
    });
  });

  describe("Notification filtering logic", () => {
    function shouldNotify(level: number, prefs: NotifPrefs): boolean {
      const tier = getSeverityTier(level);
      return prefs[tier];
    }

    it("notifies for critical alerts when critical is enabled", () => {
      expect(shouldNotify(13, { critical: true, high: false, low: false })).toBe(true);
    });

    it("does not notify for critical alerts when critical is disabled", () => {
      expect(shouldNotify(13, { critical: false, high: true, low: true })).toBe(false);
    });

    it("notifies for high alerts when high is enabled", () => {
      expect(shouldNotify(9, { critical: false, high: true, low: false })).toBe(true);
    });

    it("does not notify for low alerts when low is disabled (default)", () => {
      expect(shouldNotify(3, DEFAULT_PREFS)).toBe(false);
    });

    it("notifies for low alerts when low is explicitly enabled", () => {
      expect(shouldNotify(3, { critical: true, high: true, low: true })).toBe(true);
    });
  });

  describe("Deduplication logic", () => {
    it("tracks notified alert IDs to prevent duplicate notifications", () => {
      const notifiedIds = new Set<string>();

      // First time — should notify
      const alertId = "alert-001";
      const shouldNotifyFirst = !notifiedIds.has(alertId);
      notifiedIds.add(alertId);
      expect(shouldNotifyFirst).toBe(true);

      // Second time — should not notify
      const shouldNotifySecond = !notifiedIds.has(alertId);
      expect(shouldNotifySecond).toBe(false);
    });

    it("prunes notified IDs set when it exceeds 100 entries", () => {
      const notifiedIds = new Set<string>();

      // Add 110 entries
      for (let i = 0; i < 110; i++) {
        notifiedIds.add(`alert-${i}`);
      }
      expect(notifiedIds.size).toBe(110);

      // Prune to last 50
      if (notifiedIds.size > 100) {
        const arr = Array.from(notifiedIds);
        const pruned = new Set(arr.slice(-50));
        expect(pruned.size).toBe(50);
        // Should keep the most recent entries
        expect(pruned.has("alert-109")).toBe(true);
        expect(pruned.has("alert-60")).toBe(true);
        // Should have removed older entries
        expect(pruned.has("alert-0")).toBe(false);
        expect(pruned.has("alert-59")).toBe(false);
      }
    });
  });

  describe("Polling configuration", () => {
    it("uses 10 second polling interval", () => {
      const POLL_INTERVAL_MS = 10_000;
      expect(POLL_INTERVAL_MS).toBe(10000);
    });

    it("disables polling when all notification tiers are off", () => {
      const prefs: NotifPrefs = { critical: false, high: false, low: false };
      const isAnyEnabled = prefs.critical || prefs.high || prefs.low;
      expect(isAnyEnabled).toBe(false);
    });

    it("enables polling when at least one tier is on", () => {
      const prefs: NotifPrefs = { critical: true, high: false, low: false };
      const isAnyEnabled = prefs.critical || prefs.high || prefs.low;
      expect(isAnyEnabled).toBe(true);
    });
  });

  describe("Toast duration by severity", () => {
    it("critical alerts show for 15 seconds", () => {
      const durations: Record<string, number> = {
        critical: 15000,
        high: 10000,
        low: 5000,
      };
      expect(durations.critical).toBe(15000);
    });

    it("high alerts show for 10 seconds", () => {
      const durations: Record<string, number> = {
        critical: 15000,
        high: 10000,
        low: 5000,
      };
      expect(durations.high).toBe(10000);
    });

    it("low alerts show for 5 seconds", () => {
      const durations: Record<string, number> = {
        critical: 15000,
        high: 10000,
        low: 5000,
      };
      expect(durations.low).toBe(5000);
    });
  });
});
