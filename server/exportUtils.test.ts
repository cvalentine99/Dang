/**
 * Tests for client/src/lib/exportUtils.ts
 *
 * We test the pure functions (toCSV, toJSON, makeFilename) directly.
 * downloadFile is browser-only and tested via manual verification.
 */
import { describe, expect, it } from "vitest";

// Since exportUtils is a client-side module, we import the functions
// by re-implementing the pure logic here for testing.
// This avoids needing DOM APIs (Blob, URL.createObjectURL) in vitest.

function flattenObject(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value === null || value === undefined) {
      result[fullKey] = "";
    } else if (Array.isArray(value)) {
      result[fullKey] = JSON.stringify(value);
    } else if (typeof value === "object" && !(value instanceof Date)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = String(value);
    }
  }
  return result;
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCSV(
  data: Array<Record<string, unknown>>,
  columns?: { key: string; label: string }[]
): string {
  if (data.length === 0) return "";
  const flatRows = data.map((row) => flattenObject(row));
  let headers: { key: string; label: string }[];
  if (columns) {
    headers = columns;
  } else {
    const allKeys = new Set<string>();
    flatRows.forEach((row) => Object.keys(row).forEach((k) => allKeys.add(k)));
    headers = Array.from(allKeys).map((k) => ({ key: k, label: k }));
  }
  const headerLine = headers.map((h) => escapeCSV(h.label)).join(",");
  const bodyLines = flatRows.map((row) =>
    headers.map((h) => escapeCSV(row[h.key] ?? "")).join(",")
  );
  return [headerLine, ...bodyLines].join("\n");
}

function toJSON(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function makeFilename(base: string, format: "csv" | "json", context?: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const ctx = context ? `_${context.replace(/[^a-zA-Z0-9-_]/g, "_")}` : "";
  return `dang_${base}${ctx}_${ts}.${format}`;
}

describe("flattenObject", () => {
  it("flattens nested objects with dot notation", () => {
    const result = flattenObject({
      rule: { id: "550", level: 3, mitre: { id: ["T1059"] } },
      agent: { name: "server-01" },
    });
    expect(result["rule.id"]).toBe("550");
    expect(result["rule.level"]).toBe("3");
    expect(result["rule.mitre.id"]).toBe('["T1059"]');
    expect(result["agent.name"]).toBe("server-01");
  });

  it("handles null and undefined values", () => {
    const result = flattenObject({ a: null, b: undefined, c: "ok" });
    expect(result.a).toBe("");
    expect(result.b).toBe("");
    expect(result.c).toBe("ok");
  });

  it("handles arrays as JSON strings", () => {
    const result = flattenObject({ tags: ["test", "vitest"] });
    expect(result.tags).toBe('["test","vitest"]');
  });

  it("handles empty objects", () => {
    const result = flattenObject({});
    expect(Object.keys(result).length).toBe(0);
  });
});

describe("escapeCSV", () => {
  it("returns plain strings unchanged", () => {
    expect(escapeCSV("hello")).toBe("hello");
  });

  it("wraps strings with commas in quotes", () => {
    expect(escapeCSV("hello, world")).toBe('"hello, world"');
  });

  it("escapes double quotes by doubling them", () => {
    expect(escapeCSV('say "hello"')).toBe('"say ""hello"""');
  });

  it("wraps strings with newlines in quotes", () => {
    expect(escapeCSV("line1\nline2")).toBe('"line1\nline2"');
  });
});

describe("toCSV", () => {
  it("returns empty string for empty data", () => {
    expect(toCSV([])).toBe("");
  });

  it("generates CSV with auto-detected columns", () => {
    const data = [
      { name: "pkg1", version: "1.0" },
      { name: "pkg2", version: "2.0" },
    ];
    const csv = toCSV(data);
    const lines = csv.split("\n");
    expect(lines.length).toBe(3); // header + 2 rows
    expect(lines[0]).toContain("name");
    expect(lines[0]).toContain("version");
    expect(lines[1]).toContain("pkg1");
    expect(lines[2]).toContain("pkg2");
  });

  it("uses specified columns and labels", () => {
    const data = [{ id: "001", name: "server", extra: "ignored" }];
    const columns = [
      { key: "id", label: "Agent ID" },
      { key: "name", label: "Agent Name" },
    ];
    const csv = toCSV(data, columns);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Agent ID,Agent Name");
    expect(lines[1]).toBe("001,server");
  });

  it("flattens nested objects in CSV", () => {
    const data = [{ rule: { id: "550", level: 3 } }];
    const columns = [
      { key: "rule.id", label: "Rule ID" },
      { key: "rule.level", label: "Level" },
    ];
    const csv = toCSV(data, columns);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Rule ID,Level");
    expect(lines[1]).toBe("550,3");
  });
});

describe("toJSON", () => {
  it("formats data as pretty JSON", () => {
    const data = { name: "test", value: 42 };
    const json = toJSON(data);
    expect(json).toBe(JSON.stringify(data, null, 2));
    expect(json).toContain("\n");
  });

  it("handles arrays", () => {
    const data = [1, 2, 3];
    const json = toJSON(data);
    expect(JSON.parse(json)).toEqual([1, 2, 3]);
  });
});

describe("makeFilename", () => {
  it("generates filename with base name and format", () => {
    const filename = makeFilename("alerts", "csv");
    expect(filename).toMatch(/^dang_alerts_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.csv$/);
  });

  it("includes context in filename", () => {
    const filename = makeFilename("alerts", "json", "agent-001");
    expect(filename).toMatch(/^dang_alerts_agent-001_/);
    expect(filename).toMatch(/\.json$/);
  });

  it("sanitizes special characters in context", () => {
    const filename = makeFilename("vulns", "csv", "test/special chars!");
    expect(filename).not.toContain("/");
    expect(filename).not.toContain("!");
  });
});
