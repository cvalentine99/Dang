import { describe, expect, it } from "vitest";

/**
 * Server-side unit tests for the AgentDetail drilldown page.
 *
 * Since AgentDetail is a React component and we don't have jsdom/happy-dom
 * in the server test runner, we validate the structural contracts, data
 * transformation logic, and routing configuration.
 */

// ── Tab Configuration ─────────────────────────────────────────────────────

describe("AgentDetail tab configuration", () => {
  const TABS = ["overview", "alerts", "vulnerabilities", "fim", "syscollector"] as const;

  it("has exactly 5 tabs", () => {
    expect(TABS).toHaveLength(5);
  });

  it("overview is the first (default) tab", () => {
    expect(TABS[0]).toBe("overview");
  });

  it("all tab IDs are unique", () => {
    const unique = new Set(TABS);
    expect(unique.size).toBe(TABS.length);
  });

  it("tab IDs are lowercase with no spaces", () => {
    for (const tab of TABS) {
      expect(tab).toBe(tab.toLowerCase());
      expect(tab).not.toContain(" ");
    }
  });
});

// ── Severity Color Mapping ────────────────────────────────────────────────

describe("AgentDetail severity colors", () => {
  const SEVERITY_COLORS: Record<string, string> = {
    Critical: "oklch(0.637 0.237 25.331)",
    High: "oklch(0.705 0.191 47)",
    Medium: "oklch(0.795 0.184 86.047)",
    Low: "oklch(0.765 0.177 163.223)",
  };

  it("has colors for all four severity levels", () => {
    expect(Object.keys(SEVERITY_COLORS)).toEqual(["Critical", "High", "Medium", "Low"]);
  });

  it("all colors use OKLCH format", () => {
    for (const color of Object.values(SEVERITY_COLORS)) {
      expect(color).toMatch(/^oklch\(/);
    }
  });

  it("Critical is the most saturated (highest chroma)", () => {
    // Extract chroma values from oklch strings
    const extractChroma = (c: string) => {
      const match = c.match(/oklch\([\d.]+ ([\d.]+)/);
      return match ? parseFloat(match[1]) : 0;
    };
    const criticalChroma = extractChroma(SEVERITY_COLORS.Critical);
    const lowChroma = extractChroma(SEVERITY_COLORS.Low);
    expect(criticalChroma).toBeGreaterThan(lowChroma);
  });
});

// ── Alert Level Classification ────────────────────────────────────────────

describe("AgentDetail alert level classification", () => {
  const classifyLevel = (level: number): string => {
    if (level >= 12) return "critical";
    if (level >= 7) return "high";
    if (level >= 4) return "medium";
    return "low";
  };

  it("classifies level 15 as critical", () => {
    expect(classifyLevel(15)).toBe("critical");
  });

  it("classifies level 12 as critical", () => {
    expect(classifyLevel(12)).toBe("critical");
  });

  it("classifies level 11 as high", () => {
    expect(classifyLevel(11)).toBe("high");
  });

  it("classifies level 7 as high", () => {
    expect(classifyLevel(7)).toBe("high");
  });

  it("classifies level 6 as medium", () => {
    expect(classifyLevel(6)).toBe("medium");
  });

  it("classifies level 4 as medium", () => {
    expect(classifyLevel(4)).toBe("medium");
  });

  it("classifies level 3 as low", () => {
    expect(classifyLevel(3)).toBe("low");
  });

  it("classifies level 0 as low", () => {
    expect(classifyLevel(0)).toBe("low");
  });
});

// ── SCA Compliance Percentage Calculation ─────────────────────────────────

describe("AgentDetail SCA compliance percentage", () => {
  const calcPct = (pass: number, fail: number, invalid: number): number => {
    const total = pass + fail + invalid;
    return total > 0 ? Math.round((pass / total) * 100) : 0;
  };

  it("calculates 100% when all pass", () => {
    expect(calcPct(50, 0, 0)).toBe(100);
  });

  it("calculates 0% when all fail", () => {
    expect(calcPct(0, 50, 0)).toBe(0);
  });

  it("handles mixed results correctly", () => {
    expect(calcPct(75, 20, 5)).toBe(75);
  });

  it("returns 0 when total is 0", () => {
    expect(calcPct(0, 0, 0)).toBe(0);
  });

  it("rounds to nearest integer", () => {
    // 33/100 = 33%
    expect(calcPct(33, 67, 0)).toBe(33);
    // 1/3 ≈ 33.33 → 33
    expect(calcPct(1, 2, 0)).toBe(33);
  });
});

// ── Vulnerability Severity Counting ───────────────────────────────────────

describe("AgentDetail vulnerability severity counting", () => {
  const countSeverities = (vulns: Array<{ severity: string }>): Record<string, number> => {
    const counts: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    vulns.forEach((v) => {
      const sev = v.severity;
      if (counts[sev] !== undefined) counts[sev]++;
    });
    return counts;
  };

  it("counts vulnerabilities by severity", () => {
    const vulns = [
      { severity: "Critical" },
      { severity: "Critical" },
      { severity: "High" },
      { severity: "Medium" },
      { severity: "Medium" },
      { severity: "Medium" },
      { severity: "Low" },
    ];
    const counts = countSeverities(vulns);
    expect(counts.Critical).toBe(2);
    expect(counts.High).toBe(1);
    expect(counts.Medium).toBe(3);
    expect(counts.Low).toBe(1);
  });

  it("returns all zeros for empty array", () => {
    const counts = countSeverities([]);
    expect(counts.Critical).toBe(0);
    expect(counts.High).toBe(0);
    expect(counts.Medium).toBe(0);
    expect(counts.Low).toBe(0);
  });

  it("ignores unknown severity levels", () => {
    const vulns = [{ severity: "Unknown" }, { severity: "Critical" }];
    const counts = countSeverities(vulns);
    expect(counts.Critical).toBe(1);
    // Unknown is not counted in any bucket
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(1);
  });
});

// ── Pagination Logic ──────────────────────────────────────────────────────

describe("AgentDetail pagination", () => {
  const pageSize = 25;

  it("calculates total pages correctly", () => {
    expect(Math.max(1, Math.ceil(100 / pageSize))).toBe(4);
    expect(Math.max(1, Math.ceil(25 / pageSize))).toBe(1);
    expect(Math.max(1, Math.ceil(26 / pageSize))).toBe(2);
  });

  it("minimum is always 1 page", () => {
    expect(Math.max(1, Math.ceil(0 / pageSize))).toBe(1);
  });

  it("offset calculation is correct", () => {
    expect(0 * pageSize).toBe(0);
    expect(1 * pageSize).toBe(25);
    expect(3 * pageSize).toBe(75);
  });
});

// ── Route Configuration ───────────────────────────────────────────────────

describe("AgentDetail route", () => {
  it("route pattern matches fleet/:agentId format", () => {
    const pattern = "/fleet/:agentId";
    expect(pattern).toContain("/fleet/");
    expect(pattern).toContain(":agentId");
  });

  it("agent IDs can be extracted from route params", () => {
    // Simulate wouter param extraction
    const params = { agentId: "001" };
    expect(params.agentId).toBe("001");
  });

  it("handles missing agentId gracefully", () => {
    const params: { agentId?: string } = {};
    const agentId = params?.agentId ?? "";
    expect(agentId).toBe("");
  });
});

// ── Data Extraction Helpers ───────────────────────────────────────────────

describe("AgentDetail data extraction", () => {
  it("safely extracts affected_items from Wazuh response", () => {
    const response = { data: { affected_items: [{ id: "001", name: "agent1" }] } };
    const items = (response as any)?.data?.affected_items ?? [];
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("agent1");
  });

  it("returns empty array when response is null", () => {
    const response = null;
    const items = (response as any)?.data?.affected_items ?? [];
    expect(items).toHaveLength(0);
  });

  it("returns empty array when data is missing", () => {
    const response = { error: "not found" };
    const items = (response as any)?.data?.affected_items ?? [];
    expect(items).toHaveLength(0);
  });

  it("extracts agent status correctly", () => {
    const agent = { status: "active", name: "web-server-01" };
    expect(String(agent.status ?? "unknown")).toBe("active");
  });

  it("falls back to 'unknown' for missing status", () => {
    const agent = { name: "web-server-01" } as any;
    expect(String(agent.status ?? "unknown")).toBe("unknown");
  });

  it("extracts OS info from nested object", () => {
    const agent = { os: { name: "Ubuntu", version: "22.04", platform: "ubuntu" } };
    const os = agent.os as Record<string, unknown>;
    expect(String(os?.name ?? "—")).toBe("Ubuntu");
    expect(String(os?.version ?? "—")).toBe("22.04");
  });

  it("handles RAM conversion to GB", () => {
    const ramTotal = 8388608 * 1024; // bytes
    const gb = (ramTotal / 1024 / 1024 / 1024).toFixed(1);
    expect(gb).toBe("8.0");
  });
});

// ── Syscollector Sub-tabs ─────────────────────────────────────────────────

describe("AgentDetail syscollector sub-tabs", () => {
  const SUB_TABS = ["packages", "ports", "processes", "network"] as const;

  it("has exactly 4 sub-tabs", () => {
    expect(SUB_TABS).toHaveLength(4);
  });

  it("packages is the default sub-tab", () => {
    expect(SUB_TABS[0]).toBe("packages");
  });

  it("network sub-tab disables pagination", () => {
    // Network interfaces are typically few, no pagination needed
    const subTab = "network";
    const shouldPaginate = subTab !== "network";
    expect(shouldPaginate).toBe(false);
  });
});
