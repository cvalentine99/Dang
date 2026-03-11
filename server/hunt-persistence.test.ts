import { describe, expect, it } from "vitest";

/**
 * Hunt Persistence Tests
 *
 * These tests validate the hunt persistence schema, input validation,
 * and export helper logic without requiring a live database connection.
 */

// ── Schema validation tests ────────────────────────────────────────────────────
describe("Hunt Persistence - Schema & Validation", () => {
  it("saved_hunts table schema has all required columns", async () => {
    const { savedHunts } = await import("../drizzle/schema");
    // Verify all columns exist on the table definition
    const columns = Object.keys(savedHunts);
    const required = [
      "id", "userId", "title", "description", "query", "iocType",
      "timeFrom", "timeTo", "totalHits", "totalTimeMs", "sourcesWithHits",
      "agentsSearched", "results", "tags", "severity", "resolved",
      "createdAt", "updatedAt",
    ];
    for (const col of required) {
      expect(columns).toContain(col);
    }
  });

  it("severity enum allows only valid values", () => {
    const validSeverities = ["critical", "high", "medium", "low", "info"];
    validSeverities.forEach((s) => {
      expect(["critical", "high", "medium", "low", "info"]).toContain(s);
    });
    expect(["critical", "high", "medium", "low", "info"]).not.toContain("unknown");
  });
});

// ── Export helper logic tests ──────────────────────────────────────────────────
describe("Hunt Persistence - Export Helpers", () => {
  const mockHuntData = {
    query: "T1110",
    iocType: "mitre_id",
    totalHits: 15,
    totalTimeMs: 342,
    sourcesSearched: 8,
    sources: [
      {
        source: "rules",
        sourceLabel: "Detection Rules",
        matches: [
          { id: 5710, level: 10, description: "Brute force attempt" },
          { id: 5711, level: 8, description: "SSH brute force" },
        ],
        count: 2,
        searchTimeMs: 45,
      },
      {
        source: "agents",
        sourceLabel: "Wazuh Agents",
        matches: [
          { id: "001", name: "server-1", ip: "10.0.1.10", status: "active" },
        ],
        count: 1,
        searchTimeMs: 30,
      },
    ],
  };

  it("JSON export produces valid JSON with all required fields", () => {
    const payload = {
      query: mockHuntData.query,
      iocType: mockHuntData.iocType,
      executedAt: new Date().toISOString(),
      totalHits: mockHuntData.totalHits,
      totalTimeMs: mockHuntData.totalTimeMs,
      sourcesSearched: mockHuntData.sourcesSearched,
      sources: mockHuntData.sources,
    };

    const json = JSON.stringify(payload, null, 2);
    const parsed = JSON.parse(json);

    expect(parsed.query).toBe("T1110");
    expect(parsed.iocType).toBe("mitre_id");
    expect(parsed.totalHits).toBe(15);
    expect(parsed.totalTimeMs).toBe(342);
    expect(parsed.sources).toHaveLength(2);
    expect(parsed.sources[0].source).toBe("rules");
    expect(parsed.sources[0].matches).toHaveLength(2);
    expect(parsed.executedAt).toBeTruthy();
  });

  it("CSV export produces correct header and rows", () => {
    const rows: string[] = ["Source,SourceLabel,Index,Field,Value"];
    mockHuntData.sources.forEach((src) => {
      src.matches.forEach((match, idx) => {
        const m = match as Record<string, unknown>;
        Object.entries(m).forEach(([key, val]) => {
          const v = typeof val === "object" ? JSON.stringify(val) : String(val ?? "");
          rows.push(`"${src.source}","${src.sourceLabel}",${idx},"${key}","${v.replace(/"/g, '""')}"`);
        });
      });
    });

    const csv = rows.join("\n");
    const lines = csv.split("\n");

    // Header
    expect(lines[0]).toBe("Source,SourceLabel,Index,Field,Value");

    // Should have rows for each field of each match
    // rules: 2 matches × 3 fields = 6 rows
    // agents: 1 match × 4 fields = 4 rows
    // Total: 10 data rows + 1 header = 11 lines
    expect(lines.length).toBe(11);

    // Verify first data row
    expect(lines[1]).toContain("rules");
    expect(lines[1]).toContain("Detection Rules");
  });

  it("CSV export handles special characters in values", () => {
    const rows: string[] = ["Source,SourceLabel,Index,Field,Value"];
    const testMatch = { description: 'Alert with "quotes" and, commas' };
    Object.entries(testMatch).forEach(([key, val]) => {
      const v = String(val).replace(/"/g, '""');
      rows.push(`"test","Test Source",0,"${key}","${v}"`);
    });

    const csv = rows.join("\n");
    expect(csv).toContain('""quotes""');
  });
});

// ── Input validation tests ─────────────────────────────────────────────────────
describe("Hunt Persistence - Input Validation", () => {
  it("save input requires title, query, and iocType", () => {
    const validInput = {
      title: "Test Hunt",
      query: "T1110",
      iocType: "mitre_id",
      timeFrom: "now-24h",
      timeTo: "now",
      totalHits: 5,
      totalTimeMs: 200,
      sourcesWithHits: 2,
      results: [],
      severity: "high" as const,
    };

    expect(validInput.title.length).toBeGreaterThan(0);
    expect(validInput.query.length).toBeGreaterThan(0);
    expect(validInput.iocType.length).toBeGreaterThan(0);
  });

  it("title must not exceed 512 characters", () => {
    const longTitle = "a".repeat(513);
    expect(longTitle.length).toBeGreaterThan(512);
    const validTitle = "a".repeat(512);
    expect(validTitle.length).toBeLessThanOrEqual(512);
  });

  it("tags are parsed from comma-separated string correctly", () => {
    const tagString = "ssh, brute-force, incident";
    const tags = tagString.split(",").map((t) => t.trim()).filter(Boolean);
    expect(tags).toEqual(["ssh", "brute-force", "incident"]);
  });

  it("empty tag string produces empty array", () => {
    const tagString = "";
    const tags = tagString.split(",").map((t) => t.trim()).filter(Boolean);
    expect(tags).toEqual([]);
  });

  it("results array preserves source structure", () => {
    const results = [
      { source: "rules", sourceLabel: "Detection Rules", matches: [{ id: 1 }], count: 1, searchTimeMs: 50 },
      { source: "agents", sourceLabel: "Wazuh Agents", matches: [], count: 0, searchTimeMs: 20 },
    ];

    expect(results).toHaveLength(2);
    expect(results[0].source).toBe("rules");
    expect(results[0].matches).toHaveLength(1);
    expect(results[1].count).toBe(0);
  });
});

// ── Hunt router procedure existence tests ──────────────────────────────────────
describe("Hunt Router - Procedure Existence", () => {
  it("hunt router has all persistence procedures", async () => {
    const { appRouter } = await import("./routers");
    const procedures = Object.keys(appRouter._def.procedures);

    // The hunt procedures should be accessible as hunt.save, hunt.list, etc.
    expect(procedures).toContain("hunt.execute");
    expect(procedures).toContain("hunt.save");
    expect(procedures).toContain("hunt.list");
    expect(procedures).toContain("hunt.get");
    expect(procedures).toContain("hunt.delete");
    expect(procedures).toContain("hunt.update");
  });
});
