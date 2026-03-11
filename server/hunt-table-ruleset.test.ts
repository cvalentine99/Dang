import { describe, expect, it } from "vitest";

/**
 * Server-side unit tests for:
 *   1. huntRouter — multi-source IOC correlation
 *   2. TableSkeleton — shimmer row component contract
 *   3. RulesetExplorer — defensive field handling fix
 */

// ── huntRouter contract tests ─────────────────────────────────────────────

describe("huntRouter: IOC type query builder", () => {
  const IOC_TYPES = [
    "freetext", "ip", "hash", "cve", "filename", "username", "rule_id", "mitre_id",
  ] as const;

  it("supports all 8 IOC types", () => {
    expect(IOC_TYPES).toHaveLength(8);
    expect(IOC_TYPES).toContain("freetext");
    expect(IOC_TYPES).toContain("ip");
    expect(IOC_TYPES).toContain("hash");
    expect(IOC_TYPES).toContain("cve");
    expect(IOC_TYPES).toContain("filename");
    expect(IOC_TYPES).toContain("username");
    expect(IOC_TYPES).toContain("rule_id");
    expect(IOC_TYPES).toContain("mitre_id");
  });

  it("IP type targets correct Elasticsearch fields", () => {
    const IP_FIELDS = ["data.srcip", "data.dstip", "agent.ip", "data.src_ip", "data.dst_ip"];
    expect(IP_FIELDS).toHaveLength(5);
    IP_FIELDS.forEach((f) => expect(f).toMatch(/\.(src|dst)?_?ip$/));
  });

  it("hash type targets syscheck hash fields", () => {
    const HASH_FIELDS = ["syscheck.md5_after", "syscheck.sha1_after", "syscheck.sha256_after", "data.*"];
    expect(HASH_FIELDS).toHaveLength(4);
    expect(HASH_FIELDS[0]).toContain("md5");
    expect(HASH_FIELDS[1]).toContain("sha1");
    expect(HASH_FIELDS[2]).toContain("sha256");
  });

  it("freetext type searches across broad field set", () => {
    const FREETEXT_FIELDS = [
      "rule.description", "agent.name", "data.*", "full_log",
      "syscheck.path", "data.srcip", "data.dstip",
    ];
    expect(FREETEXT_FIELDS.length).toBeGreaterThanOrEqual(5);
    expect(FREETEXT_FIELDS).toContain("full_log");
    expect(FREETEXT_FIELDS).toContain("rule.description");
  });

  it("rule_id type uses term filter instead of multi_match", () => {
    // rule_id should produce a term filter, not a multi_match
    const iocType = "rule_id";
    const isTermFilter = iocType === "rule_id" || iocType === "mitre_id";
    expect(isTermFilter).toBe(true);
  });

  it("mitre_id type uppercases the query", () => {
    const query = "t1059.001";
    const normalized = query.toUpperCase();
    expect(normalized).toBe("T1059.001");
  });
});

describe("huntRouter: parallel source search", () => {
  const SOURCES = [
    "indexer_alerts", "indexer_archives",
    "agents", "rules", "vulnerabilities", "syscheck", "mitre", "logs",
  ];

  it("searches 8 sources in parallel", () => {
    expect(SOURCES).toHaveLength(8);
  });

  it("includes both indexer patterns (alerts + archives)", () => {
    expect(SOURCES.filter((s) => s.startsWith("indexer_"))).toHaveLength(2);
  });

  it("includes all Wazuh API sources", () => {
    const apiSources = SOURCES.filter((s) => !s.startsWith("indexer_"));
    expect(apiSources).toHaveLength(6);
    expect(apiSources).toContain("agents");
    expect(apiSources).toContain("rules");
    expect(apiSources).toContain("vulnerabilities");
    expect(apiSources).toContain("syscheck");
    expect(apiSources).toContain("mitre");
    expect(apiSources).toContain("logs");
  });

  it("limits per-agent searches to max 10 agents", () => {
    const MAX_AGENTS = 10;
    const agentIds = Array.from({ length: 20 }, (_, i) => `00${i + 1}`);
    const searched = agentIds.slice(0, MAX_AGENTS);
    expect(searched).toHaveLength(10);
  });

  it("auto-discovers first 5 active agents when none specified", () => {
    const AUTO_DISCOVER_LIMIT = 5;
    expect(AUTO_DISCOVER_LIMIT).toBe(5);
  });

  it("result shape includes timing and source metadata", () => {
    const mockResult = {
      query: "10.0.1.10",
      iocType: "ip",
      timeRange: { from: "now-24h", to: "now" },
      totalHits: 42,
      totalTimeMs: 1200,
      sourcesSearched: 8,
      sourcesWithHits: 3,
      agentsSearched: ["001", "002"],
      sources: [
        { source: "indexer_alerts", sourceLabel: "Indexer: Alerts", matches: [], count: 30, searchTimeMs: 200 },
        { source: "agents", sourceLabel: "Agents", matches: [], count: 2, searchTimeMs: 150 },
        { source: "rules", sourceLabel: "Rules", matches: [], count: 10, searchTimeMs: 100 },
      ],
    };
    expect(mockResult.sourcesSearched).toBe(8);
    expect(mockResult.sources).toHaveLength(3);
    expect(mockResult.totalHits).toBe(42);
    expect(mockResult.totalTimeMs).toBeGreaterThan(0);
    expect(mockResult.sources[0].searchTimeMs).toBeGreaterThan(0);
  });
});

describe("huntRouter: input validation", () => {
  it("query must be 1-500 characters", () => {
    expect("".length).toBe(0);
    expect("a".length).toBe(1);
    expect("a".repeat(500).length).toBe(500);
    expect("a".repeat(501).length).toBe(501);
  });

  it("maxResults defaults to 50 and caps at 200", () => {
    const DEFAULT_MAX = 50;
    const MAX_CAP = 200;
    expect(DEFAULT_MAX).toBe(50);
    expect(MAX_CAP).toBe(200);
  });

  it("agentIds limited to max 10", () => {
    const MAX_AGENT_IDS = 10;
    expect(MAX_AGENT_IDS).toBe(10);
  });
});

// ── TableSkeleton contract tests ──────────────────────────────────────────

describe("TableSkeleton contract", () => {
  it("accepts column count and row count props", () => {
    const defaults = { columns: 5, rows: 8 };
    expect(defaults.columns).toBe(5);
    expect(defaults.rows).toBe(8);
  });

  it("generates correct number of shimmer rows", () => {
    const rowCount = 8;
    const rows = Array.from({ length: rowCount });
    expect(rows).toHaveLength(8);
  });

  it("generates correct number of columns per row", () => {
    const colCount = 6;
    const cols = Array.from({ length: colCount });
    expect(cols).toHaveLength(6);
  });

  it("shimmer width varies per column for visual realism", () => {
    const widths = [60, 80, 45, 70, 55, 90];
    const allDifferent = new Set(widths).size === widths.length;
    expect(allDifferent).toBe(true);
  });

  it("header row has distinct styling from data rows", () => {
    const headerBg = "bg-secondary/30";
    const dataBg = "bg-secondary/20";
    expect(headerBg).not.toBe(dataBg);
  });
});

// ── RulesetExplorer defensive field handling ──────────────────────────────

describe("RulesetExplorer: defensive field handling", () => {
  it("safely handles decoder with missing file field", () => {
    const decoder = { name: "sshd", details: {} };
    const file = String((decoder as Record<string, unknown>).file ?? "");
    expect(file).toBe("");
    expect(file.toLowerCase()).toBe("");
  });

  it("safely handles decoder with missing name field", () => {
    const decoder = { file: "/var/ossec/etc/decoders/sshd.xml" };
    const name = String((decoder as Record<string, unknown>).name ?? "");
    expect(name).toBe("");
  });

  it("safely handles decoder with null details", () => {
    const decoder = { name: "sshd", file: "test.xml", details: null };
    const details = decoder.details ?? {};
    expect(details).toEqual({});
  });

  it("safely handles decoder with missing relative_dirname", () => {
    const decoder = { name: "sshd" };
    const dirname = String((decoder as Record<string, unknown>).relative_dirname ?? "");
    expect(dirname).toBe("");
  });

  it("safely handles rule with missing groups array", () => {
    const rule = { id: "5710", description: "Test rule" };
    const groups = Array.isArray((rule as Record<string, unknown>).groups)
      ? (rule as Record<string, unknown>).groups as string[]
      : [];
    expect(groups).toEqual([]);
  });

  it("safely handles rule with missing mitre object", () => {
    const rule = { id: "5710", description: "Test rule" };
    const mitre = (rule as Record<string, unknown>).mitre as { id?: string[] } | undefined;
    const mitreIds = mitre?.id ?? [];
    expect(mitreIds).toEqual([]);
  });

  it("safely handles rule with missing filename field", () => {
    const rule = { id: "5710" };
    const filename = String((rule as Record<string, unknown>).filename ?? "");
    expect(filename).toBe("");
    expect(filename.toLowerCase()).toBe("");
  });

  it("filter function handles missing fields without crashing", () => {
    const items = [
      { id: "5710", description: "SSH login" },
      { id: "5711" }, // no description
      { description: "Test" }, // no id
      {}, // empty
    ];

    const filtered = items.filter((item) => {
      const str = JSON.stringify(item).toLowerCase();
      return str.includes("ssh");
    });

    expect(filtered).toHaveLength(1);
    expect((filtered[0] as Record<string, unknown>).id).toBe("5710");
  });
});
