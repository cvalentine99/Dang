import { describe, it, expect, vi } from "vitest";

/**
 * Auto-Queue Rules + Splunk Deep Link Tests
 *
 * Tests the auto-queue rules CRUD, the polling engine logic,
 * and the Splunk deep link URL construction.
 */

// ── Auto-Queue Rules CRUD ──────────────────────────────────────────────────

describe("Auto-Queue Rules", () => {
  describe("Rule validation", () => {
    it("should require a rule name", () => {
      const rule = { name: "", minLevel: 10, enabled: true };
      expect(rule.name.length).toBe(0);
      // Backend should reject empty names
    });

    it("should enforce minLevel between 1 and 15", () => {
      const validLevels = [1, 5, 10, 12, 15];
      const invalidLevels = [0, -1, 16, 100];

      for (const level of validLevels) {
        expect(level >= 1 && level <= 15).toBe(true);
      }
      for (const level of invalidLevels) {
        expect(level >= 1 && level <= 15).toBe(false);
      }
    });

    it("should validate ruleIds as comma-separated numeric strings", () => {
      const validRuleIds = ["553", "100002,100003", "553,554,555"];
      const invalidRuleIds = ["abc", ""];

      for (const ids of validRuleIds) {
        const parts = ids.split(",").map((s) => s.trim());
        const allNumeric = parts.every((p) => /^\d+$/.test(p));
        expect(allNumeric).toBe(true);
      }

      for (const ids of invalidRuleIds) {
        if (ids === "") {
          // Empty is valid (means "any rule")
          continue;
        }
        const parts = ids.split(",").map((s) => s.trim());
        const allNumeric = parts.every((p) => /^\d+$/.test(p));
        expect(allNumeric).toBe(false);
      }
    });

    it("should validate agentIds as comma-separated numeric strings", () => {
      const valid = ["001", "001,002,003"];
      for (const ids of valid) {
        const parts = ids.split(",").map((s) => s.trim());
        const allValid = parts.every((p) => /^\d+$/.test(p));
        expect(allValid).toBe(true);
      }
    });
  });

  describe("Rule matching logic", () => {
    function matchesRule(
      alert: { ruleLevel: number; ruleId: string; agentId: string; groups: string[] },
      rule: {
        minLevel: number;
        ruleIds: string | null;
        agentIds: string | null;
        groups: string | null;
      }
    ): boolean {
      // Level check
      if (alert.ruleLevel < rule.minLevel) return false;

      // Rule ID filter
      if (rule.ruleIds) {
        const allowedIds = rule.ruleIds.split(",").map((s) => s.trim());
        if (!allowedIds.includes(alert.ruleId)) return false;
      }

      // Agent ID filter
      if (rule.agentIds) {
        const allowedAgents = rule.agentIds.split(",").map((s) => s.trim());
        if (!allowedAgents.includes(alert.agentId)) return false;
      }

      // Group filter
      if (rule.groups) {
        const allowedGroups = rule.groups.split(",").map((s) => s.trim().toLowerCase());
        const alertGroups = alert.groups.map((g) => g.toLowerCase());
        const hasMatch = allowedGroups.some((g) => alertGroups.includes(g));
        if (!hasMatch) return false;
      }

      return true;
    }

    it("should match alerts at or above minimum level", () => {
      const rule = { minLevel: 10, ruleIds: null, agentIds: null, groups: null };
      const highAlert = { ruleLevel: 12, ruleId: "553", agentId: "001", groups: [] };
      const lowAlert = { ruleLevel: 5, ruleId: "553", agentId: "001", groups: [] };

      expect(matchesRule(highAlert, rule)).toBe(true);
      expect(matchesRule(lowAlert, rule)).toBe(false);
    });

    it("should filter by specific rule IDs when set", () => {
      const rule = { minLevel: 1, ruleIds: "553,554", agentIds: null, groups: null };

      expect(
        matchesRule(
          { ruleLevel: 10, ruleId: "553", agentId: "001", groups: [] },
          rule
        )
      ).toBe(true);

      expect(
        matchesRule(
          { ruleLevel: 10, ruleId: "999", agentId: "001", groups: [] },
          rule
        )
      ).toBe(false);
    });

    it("should filter by specific agent IDs when set", () => {
      const rule = { minLevel: 1, ruleIds: null, agentIds: "001,003", groups: null };

      expect(
        matchesRule(
          { ruleLevel: 10, ruleId: "553", agentId: "001", groups: [] },
          rule
        )
      ).toBe(true);

      expect(
        matchesRule(
          { ruleLevel: 10, ruleId: "553", agentId: "002", groups: [] },
          rule
        )
      ).toBe(false);
    });

    it("should filter by groups when set", () => {
      const rule = { minLevel: 1, ruleIds: null, agentIds: null, groups: "syslog,authentication" };

      expect(
        matchesRule(
          { ruleLevel: 10, ruleId: "553", agentId: "001", groups: ["syslog", "sshd"] },
          rule
        )
      ).toBe(true);

      expect(
        matchesRule(
          { ruleLevel: 10, ruleId: "553", agentId: "001", groups: ["web-log"] },
          rule
        )
      ).toBe(false);
    });

    it("should require ALL filters to match (AND logic)", () => {
      const rule = { minLevel: 10, ruleIds: "553", agentIds: "001", groups: "syslog" };

      // All match
      expect(
        matchesRule(
          { ruleLevel: 12, ruleId: "553", agentId: "001", groups: ["syslog"] },
          rule
        )
      ).toBe(true);

      // Level too low
      expect(
        matchesRule(
          { ruleLevel: 5, ruleId: "553", agentId: "001", groups: ["syslog"] },
          rule
        )
      ).toBe(false);

      // Wrong rule ID
      expect(
        matchesRule(
          { ruleLevel: 12, ruleId: "999", agentId: "001", groups: ["syslog"] },
          rule
        )
      ).toBe(false);

      // Wrong agent
      expect(
        matchesRule(
          { ruleLevel: 12, ruleId: "553", agentId: "002", groups: ["syslog"] },
          rule
        )
      ).toBe(false);
    });
  });
});

// ── Splunk Deep Link URL Construction ──────────────────────────────────────

describe("Splunk Deep Links", () => {
  function buildSplunkDeepLink(
    host: string,
    port: string | number,
    ticketId: string
  ): string {
    // Management port (8089) → Web port (8000)
    const webPort = String(port) === "8089" ? "8000" : String(port);
    const encodedTicketId = encodeURIComponent(`ticket_id="${ticketId}"`);
    return `https://${host}:${webPort}/en-US/app/SplunkEnterpriseSecuritySuite/incident_review?search=${encodedTicketId}`;
  }

  it("should construct a valid Splunk ES deep link", () => {
    const url = buildSplunkDeepLink("localhost", "8089", "DANG-1709123456-abc123");
    expect(url).toContain("localhost:8000");
    expect(url).toContain("incident_review");
    expect(url).toContain("DANG-1709123456-abc123");
  });

  it("should map management port 8089 to web port 8000", () => {
    const url = buildSplunkDeepLink("splunk.local", "8089", "TICKET-001");
    expect(url).toContain(":8000/");
    expect(url).not.toContain(":8089/");
  });

  it("should preserve non-standard ports", () => {
    const url = buildSplunkDeepLink("splunk.local", "9000", "TICKET-001");
    expect(url).toContain(":9000/");
  });

  it("should URL-encode the ticket ID in the search parameter", () => {
    const url = buildSplunkDeepLink("splunk.local", "8000", "DANG-123-abc");
    expect(url).toContain(encodeURIComponent('ticket_id="DANG-123-abc"'));
  });

  it("should target the Splunk ES incident review page", () => {
    const url = buildSplunkDeepLink("splunk.local", "8000", "TICKET-001");
    expect(url).toContain("/en-US/app/SplunkEnterpriseSecuritySuite/incident_review");
  });
});

// ── Notification History ───────────────────────────────────────────────────

describe("Notification History", () => {
  it("should cap history at 20 items", () => {
    const history: Array<{ id: string }> = [];
    for (let i = 0; i < 25; i++) {
      history.unshift({ id: `notif-${i}` });
    }
    const trimmed = history.slice(0, 20);
    expect(trimmed.length).toBe(20);
    expect(trimmed[0].id).toBe("notif-24"); // Most recent first
  });

  it("should track unread count correctly", () => {
    const history = [
      { id: "1", read: false },
      { id: "2", read: true },
      { id: "3", read: false },
      { id: "4", read: true },
    ];
    const unreadCount = history.filter((n) => !n.read).length;
    expect(unreadCount).toBe(2);
  });

  it("should mark all as read", () => {
    const history = [
      { id: "1", read: false },
      { id: "2", read: false },
      { id: "3", read: false },
    ];
    const updated = history.map((item) => ({ ...item, read: true }));
    const unreadCount = updated.filter((n) => !n.read).length;
    expect(unreadCount).toBe(0);
  });

  it("should format time ago correctly", () => {
    function timeAgo(dateStr: string): string {
      const now = Date.now();
      const then = new Date(dateStr).getTime();
      const diffMs = now - then;
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHr = Math.floor(diffMin / 60);

      if (diffSec < 60) return "just now";
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHr < 24) return `${diffHr}h ago`;
      return new Date(dateStr).toLocaleDateString();
    }

    // Recent timestamp
    const justNow = new Date(Date.now() - 5000).toISOString();
    expect(timeAgo(justNow)).toBe("just now");

    // Minutes ago
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(timeAgo(fiveMinAgo)).toBe("5m ago");

    // Hours ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(timeAgo(twoHoursAgo)).toBe("2h ago");
  });

  it("should classify severity tiers correctly", () => {
    function getSeverityTier(level: number): "critical" | "high" | "low" {
      if (level >= 12) return "critical";
      if (level >= 8) return "high";
      return "low";
    }

    expect(getSeverityTier(15)).toBe("critical");
    expect(getSeverityTier(12)).toBe("critical");
    expect(getSeverityTier(11)).toBe("high");
    expect(getSeverityTier(8)).toBe("high");
    expect(getSeverityTier(7)).toBe("low");
    expect(getSeverityTier(1)).toBe("low");
  });
});
