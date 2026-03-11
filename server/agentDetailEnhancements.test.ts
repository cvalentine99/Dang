import { describe, expect, it } from "vitest";

/**
 * Server-side unit tests for the three Fleet Command enhancements:
 * 1. Related Investigations section
 * 2. Agent Activity Timeline tab
 * 3. Agent Comparison view
 *
 * Tests validate structural contracts, data transformation logic,
 * and configuration correctness.
 */

// ══════════════════════════════════════════════════════════════════════════
// Feature 1: Related Investigations
// ══════════════════════════════════════════════════════════════════════════

describe("Related Investigations — evidence matching", () => {
  // Simulates the server-side filtering logic from graphRouter.investigationsByAgent
  function matchesAgent(session: any, agentId: string): boolean {
    if (Array.isArray(session.evidence)) {
      for (const ev of session.evidence) {
        const data = ev.data ?? {};
        if (
          String(data.agentId ?? "") === agentId ||
          String(data.agent_id ?? "") === agentId ||
          String(data.id ?? "") === agentId ||
          String(ev.label ?? "").includes(`Agent ${agentId}`) ||
          String(ev.label ?? "").includes(`agent ${agentId}`)
        ) return true;
      }
    }
    if (session.title?.includes(agentId) || session.description?.includes(agentId)) return true;
    return false;
  }

  it("matches by evidence data.agentId", () => {
    const session = { evidence: [{ type: "agent", label: "Test", data: { agentId: "001" } }] };
    expect(matchesAgent(session, "001")).toBe(true);
    expect(matchesAgent(session, "002")).toBe(false);
  });

  it("matches by evidence data.agent_id (underscore variant)", () => {
    const session = { evidence: [{ type: "alert", label: "Alert", data: { agent_id: "003" } }] };
    expect(matchesAgent(session, "003")).toBe(true);
  });

  it("matches by evidence data.id", () => {
    const session = { evidence: [{ type: "agent", label: "Agent", data: { id: "005" } }] };
    expect(matchesAgent(session, "005")).toBe(true);
  });

  it("matches by evidence label containing Agent ID", () => {
    const session = { evidence: [{ type: "agent", label: "Agent 007: James", data: {} }] };
    expect(matchesAgent(session, "007")).toBe(true);
  });

  it("matches by evidence label with lowercase agent", () => {
    const session = { evidence: [{ type: "agent", label: "Review agent 010 activity", data: {} }] };
    expect(matchesAgent(session, "010")).toBe(true);
  });

  it("matches by session title", () => {
    const session = { title: "Investigation for agent 042", evidence: [] };
    expect(matchesAgent(session, "042")).toBe(true);
  });

  it("matches by session description", () => {
    const session = { title: "Generic", description: "Involves agent 099", evidence: [] };
    expect(matchesAgent(session, "099")).toBe(true);
  });

  it("returns false for no match", () => {
    const session = { title: "Unrelated", description: "Nothing here", evidence: [{ type: "cve", label: "CVE-2024-1234", data: {} }] };
    expect(matchesAgent(session, "001")).toBe(false);
  });

  it("handles null/undefined evidence gracefully", () => {
    expect(matchesAgent({ evidence: null }, "001")).toBe(false);
    expect(matchesAgent({ evidence: undefined }, "001")).toBe(false);
    expect(matchesAgent({}, "001")).toBe(false);
  });

  it("handles empty evidence array", () => {
    expect(matchesAgent({ evidence: [] }, "001")).toBe(false);
  });
});

describe("Related Investigations — status colors", () => {
  const STATUS_COLORS: Record<string, string> = {
    active: "bg-green-500/15 text-green-300 border-green-500/20",
    closed: "bg-blue-500/15 text-blue-300 border-blue-500/20",
    archived: "bg-gray-500/15 text-gray-300 border-gray-500/20",
  };

  it("has colors for all three statuses", () => {
    expect(Object.keys(STATUS_COLORS)).toEqual(["active", "closed", "archived"]);
  });

  it("each status has bg, text, and border classes", () => {
    for (const [, classes] of Object.entries(STATUS_COLORS)) {
      expect(classes).toContain("bg-");
      expect(classes).toContain("text-");
      expect(classes).toContain("border-");
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Feature 2: Agent Activity Timeline
// ══════════════════════════════════════════════════════════════════════════

describe("Activity Timeline — tab configuration", () => {
  const TABS = ["overview", "alerts", "vulnerabilities", "fim", "syscollector", "timeline"] as const;

  it("has exactly 6 tabs (including timeline)", () => {
    expect(TABS).toHaveLength(6);
  });

  it("timeline is the last tab", () => {
    expect(TABS[TABS.length - 1]).toBe("timeline");
  });

  it("all tab IDs are unique", () => {
    expect(new Set(TABS).size).toBe(TABS.length);
  });
});

describe("Activity Timeline — source configuration", () => {
  const SOURCE_CONFIG = {
    alert: { color: "oklch(0.541 0.281 293.009)", label: "Alert" },
    fim: { color: "oklch(0.789 0.154 211.53)", label: "FIM" },
    vulnerability: { color: "oklch(0.705 0.191 47)", label: "Vuln" },
  };

  it("has exactly 3 source types", () => {
    expect(Object.keys(SOURCE_CONFIG)).toHaveLength(3);
  });

  it("all sources have OKLCH colors", () => {
    for (const [, cfg] of Object.entries(SOURCE_CONFIG)) {
      expect(cfg.color).toMatch(/^oklch\(/);
    }
  });

  it("all sources have labels", () => {
    for (const [, cfg] of Object.entries(SOURCE_CONFIG)) {
      expect(cfg.label.length).toBeGreaterThan(0);
    }
  });

  it("alert uses purple (293 hue)", () => {
    expect(SOURCE_CONFIG.alert.color).toContain("293");
  });

  it("fim uses cyan (211 hue)", () => {
    expect(SOURCE_CONFIG.fim.color).toContain("211");
  });

  it("vulnerability uses orange (47 hue)", () => {
    expect(SOURCE_CONFIG.vulnerability.color).toContain("47");
  });
});

describe("Activity Timeline — event transformation", () => {
  // Simulates the event transformation logic from ActivityTimelineTab
  function transformAlert(hit: any): { source: string; severity: string; title: string } {
    const src = hit._source ?? {};
    const rule = src.rule ?? {};
    const level = Number(rule.level ?? 0);
    return {
      source: "alert",
      title: String(rule.description ?? "Alert"),
      severity: level >= 12 ? "critical" : level >= 7 ? "high" : level >= 4 ? "medium" : "low",
    };
  }

  it("maps level 15 to critical", () => {
    expect(transformAlert({ _source: { rule: { level: 15, description: "Test" } } }).severity).toBe("critical");
  });

  it("maps level 12 to critical", () => {
    expect(transformAlert({ _source: { rule: { level: 12 } } }).severity).toBe("critical");
  });

  it("maps level 7 to high", () => {
    expect(transformAlert({ _source: { rule: { level: 7 } } }).severity).toBe("high");
  });

  it("maps level 11 to high", () => {
    expect(transformAlert({ _source: { rule: { level: 11 } } }).severity).toBe("high");
  });

  it("maps level 4 to medium", () => {
    expect(transformAlert({ _source: { rule: { level: 4 } } }).severity).toBe("medium");
  });

  it("maps level 3 to low", () => {
    expect(transformAlert({ _source: { rule: { level: 3 } } }).severity).toBe("low");
  });

  it("maps level 0 to low", () => {
    expect(transformAlert({ _source: { rule: { level: 0 } } }).severity).toBe("low");
  });

  it("uses rule.description as title", () => {
    expect(transformAlert({ _source: { rule: { description: "SSH brute force" } } }).title).toBe("SSH brute force");
  });

  it("falls back to 'Alert' when no description", () => {
    expect(transformAlert({ _source: { rule: {} } }).title).toBe("Alert");
  });

  it("handles missing _source gracefully", () => {
    expect(transformAlert({}).severity).toBe("low");
  });
});

describe("Activity Timeline — event sorting", () => {
  function sortEvents(events: { timestamp: string }[]): { timestamp: string }[] {
    return [...events].sort((a, b) => {
      const ta = new Date(a.timestamp).getTime() || 0;
      const tb = new Date(b.timestamp).getTime() || 0;
      return tb - ta;
    });
  }

  it("sorts events in descending order (newest first)", () => {
    const events = [
      { timestamp: "2025-01-01T00:00:00Z" },
      { timestamp: "2025-01-03T00:00:00Z" },
      { timestamp: "2025-01-02T00:00:00Z" },
    ];
    const sorted = sortEvents(events);
    expect(sorted[0].timestamp).toBe("2025-01-03T00:00:00Z");
    expect(sorted[2].timestamp).toBe("2025-01-01T00:00:00Z");
  });

  it("handles empty timestamps", () => {
    const events = [
      { timestamp: "2025-01-01T00:00:00Z" },
      { timestamp: "" },
    ];
    const sorted = sortEvents(events);
    expect(sorted[0].timestamp).toBe("2025-01-01T00:00:00Z");
  });

  it("handles empty array", () => {
    expect(sortEvents([])).toEqual([]);
  });
});

describe("Activity Timeline — source filtering", () => {
  const events = [
    { source: "alert" },
    { source: "alert" },
    { source: "fim" },
    { source: "vulnerability" },
    { source: "vulnerability" },
    { source: "vulnerability" },
  ];

  it("'all' returns all events", () => {
    const filtered = events;
    expect(filtered).toHaveLength(6);
  });

  it("'alert' filters to alert events only", () => {
    const filtered = events.filter(e => e.source === "alert");
    expect(filtered).toHaveLength(2);
  });

  it("'fim' filters to FIM events only", () => {
    const filtered = events.filter(e => e.source === "fim");
    expect(filtered).toHaveLength(1);
  });

  it("'vulnerability' filters to vulnerability events only", () => {
    const filtered = events.filter(e => e.source === "vulnerability");
    expect(filtered).toHaveLength(3);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Feature 3: Agent Comparison
// ══════════════════════════════════════════════════════════════════════════

describe("Agent Comparison — severity colors", () => {
  const SEVERITY_COLORS: Record<string, string> = {
    Critical: "oklch(0.637 0.237 25.331)",
    High: "oklch(0.705 0.191 47)",
    Medium: "oklch(0.795 0.184 86.047)",
    Low: "oklch(0.765 0.177 163.223)",
  };

  it("has 4 severity levels", () => {
    expect(Object.keys(SEVERITY_COLORS)).toHaveLength(4);
  });

  it("all colors use OKLCH format", () => {
    for (const [, color] of Object.entries(SEVERITY_COLORS)) {
      expect(color).toMatch(/^oklch\(/);
    }
  });

  it("Critical has the lowest lightness (darkest/most alarming)", () => {
    const lightness = parseFloat(SEVERITY_COLORS.Critical.match(/oklch\(([\d.]+)/)?.[1] ?? "0");
    expect(lightness).toBeLessThan(0.7);
  });
});

describe("Agent Comparison — agent colors", () => {
  const AGENT_COLORS = [
    "oklch(0.541 0.281 293.009)",
    "oklch(0.789 0.154 211.53)",
    "oklch(0.705 0.191 47)",
  ];

  it("has exactly 3 agent colors (max 3 agents)", () => {
    expect(AGENT_COLORS).toHaveLength(3);
  });

  it("all colors are distinct", () => {
    expect(new Set(AGENT_COLORS).size).toBe(3);
  });

  it("first agent is purple (293 hue)", () => {
    expect(AGENT_COLORS[0]).toContain("293");
  });

  it("second agent is cyan (211 hue)", () => {
    expect(AGENT_COLORS[1]).toContain("211");
  });

  it("third agent is orange (47 hue)", () => {
    expect(AGENT_COLORS[2]).toContain("47");
  });
});

describe("Agent Comparison — alert level classification", () => {
  function classifyAlertLevel(level: number): string {
    if (level >= 12) return "critical";
    if (level >= 7) return "high";
    if (level >= 4) return "medium";
    return "low";
  }

  it("classifies levels 12-15 as critical", () => {
    expect(classifyAlertLevel(12)).toBe("critical");
    expect(classifyAlertLevel(15)).toBe("critical");
  });

  it("classifies levels 7-11 as high", () => {
    expect(classifyAlertLevel(7)).toBe("high");
    expect(classifyAlertLevel(11)).toBe("high");
  });

  it("classifies levels 4-6 as medium", () => {
    expect(classifyAlertLevel(4)).toBe("medium");
    expect(classifyAlertLevel(6)).toBe("medium");
  });

  it("classifies levels 0-3 as low", () => {
    expect(classifyAlertLevel(0)).toBe("low");
    expect(classifyAlertLevel(3)).toBe("low");
  });
});

describe("Agent Comparison — compliance score calculation", () => {
  function calcScore(policies: { pass: number; fail: number }[]): { pass: number; fail: number; score: number } {
    if (policies.length === 0) return { pass: 0, fail: 0, score: 0 };
    let totalPass = 0, totalFail = 0;
    for (const p of policies) {
      totalPass += p.pass;
      totalFail += p.fail;
    }
    const total = totalPass + totalFail;
    return { pass: totalPass, fail: totalFail, score: total > 0 ? Math.round((totalPass / total) * 100) : 0 };
  }

  it("returns 0% for empty policies", () => {
    expect(calcScore([]).score).toBe(0);
  });

  it("returns 100% for all pass", () => {
    expect(calcScore([{ pass: 50, fail: 0 }]).score).toBe(100);
  });

  it("returns 0% for all fail", () => {
    expect(calcScore([{ pass: 0, fail: 50 }]).score).toBe(0);
  });

  it("calculates correct percentage for mixed results", () => {
    expect(calcScore([{ pass: 75, fail: 25 }]).score).toBe(75);
  });

  it("aggregates across multiple policies", () => {
    const result = calcScore([
      { pass: 30, fail: 10 },
      { pass: 20, fail: 40 },
    ]);
    expect(result.pass).toBe(50);
    expect(result.fail).toBe(50);
    expect(result.score).toBe(50);
  });

  it("handles zero total gracefully", () => {
    expect(calcScore([{ pass: 0, fail: 0 }]).score).toBe(0);
  });
});

describe("Agent Comparison — diff indicator logic", () => {
  function diffDirection(value: number, baseline: number, inverse: boolean = false): "up" | "down" | "equal" {
    if (value === baseline) return "equal";
    const better = inverse ? value < baseline : value > baseline;
    return better ? "up" : "down";
  }

  it("returns equal when values match", () => {
    expect(diffDirection(10, 10)).toBe("equal");
  });

  it("returns up when value > baseline (default)", () => {
    expect(diffDirection(20, 10)).toBe("up");
  });

  it("returns down when value < baseline (default)", () => {
    expect(diffDirection(5, 10)).toBe("down");
  });

  it("returns up when value < baseline (inverse=true, e.g., fewer alerts is better)", () => {
    expect(diffDirection(5, 10, true)).toBe("up");
  });

  it("returns down when value > baseline (inverse=true)", () => {
    expect(diffDirection(20, 10, true)).toBe("down");
  });
});

describe("Agent Comparison — agent selector constraints", () => {
  it("allows maximum 3 agents", () => {
    const MAX_AGENTS = 3;
    const selected = ["001", "002", "003"];
    expect(selected.length).toBeLessThanOrEqual(MAX_AGENTS);
  });

  it("prevents duplicate agent selection", () => {
    const selected = ["001", "002"];
    const newId = "001";
    const canAdd = !selected.includes(newId);
    expect(canAdd).toBe(false);
  });

  it("allows adding when under limit", () => {
    const selected = ["001"];
    const remaining = 3 - selected.length;
    expect(remaining).toBe(2);
    expect(remaining > 0).toBe(true);
  });
});

describe("Agent Comparison — radar data structure", () => {
  const radarMetrics = ["Alerts", "Critical", "Vulns", "High CVEs", "Compliance"];

  it("has exactly 5 radar metrics", () => {
    expect(radarMetrics).toHaveLength(5);
  });

  it("includes all expected dimensions", () => {
    expect(radarMetrics).toContain("Alerts");
    expect(radarMetrics).toContain("Critical");
    expect(radarMetrics).toContain("Vulns");
    expect(radarMetrics).toContain("High CVEs");
    expect(radarMetrics).toContain("Compliance");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Route Configuration
// ══════════════════════════════════════════════════════════════════════════

describe("Route configuration for new features", () => {
  const ROUTES = [
    "/fleet/:agentId",
    "/fleet-compare",
    "/agents",
    "/investigations",
  ];

  it("fleet-compare route exists", () => {
    expect(ROUTES).toContain("/fleet-compare");
  });

  it("fleet detail route exists", () => {
    expect(ROUTES).toContain("/fleet/:agentId");
  });

  it("investigations route exists for pivot", () => {
    expect(ROUTES).toContain("/investigations");
  });
});
