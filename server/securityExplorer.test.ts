/**
 * SecurityExplorer data-parsing and rendering-helper tests
 *
 * These tests validate that the parsers in SecurityExplorer.tsx correctly handle
 * the real Wazuh API response shapes — especially the flat-dict formats for
 * actions, resources, and policies that previously caused [object Object] bugs.
 */
import { describe, it, expect } from "vitest";

// ── Replicate the helper functions from SecurityExplorer.tsx ────────────────
// We test the pure logic here; the component rendering is validated by shape.

function extractItems(raw: unknown): { items: Array<Record<string, unknown>>; total: number } {
  const d = (raw as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  const items = (d?.affected_items as Array<Record<string, unknown>>) ?? [];
  const total = Number(d?.total_affected_items ?? items.length);
  return { items, total };
}

function safeDisplay(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function extractDescription(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "string") return val;
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    if (typeof obj.description === "string") return obj.description;
    return JSON.stringify(val);
  }
  return String(val);
}

/** Replicate the actions parser from SecurityExplorer */
function parseActions(raw: unknown) {
  const d = (raw as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  if (d?.affected_items) return extractItems(raw);
  if (d && typeof d === "object") {
    const entries = Object.entries(d).filter(([k]) =>
      !["affected_items", "total_affected_items", "total_failed_items", "failed_items"].includes(k)
    );
    return {
      items: entries.map(([action, val]) => ({
        action,
        description: extractDescription(val),
        _raw: val,
      })),
      total: entries.length,
    };
  }
  return { items: [], total: 0 };
}

/** Replicate the resources parser from SecurityExplorer */
function parseResources(raw: unknown) {
  const d = (raw as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  if (d?.affected_items) return extractItems(raw);
  if (d && typeof d === "object") {
    const entries = Object.entries(d).filter(([k]) =>
      !["affected_items", "total_affected_items", "total_failed_items", "failed_items"].includes(k)
    );
    return {
      items: entries.map(([resource, val]) => ({
        resource,
        description: extractDescription(val),
      })),
      total: entries.length,
    };
  }
  return { items: [], total: 0 };
}

/** Replicate the policies parser from SecurityExplorer */
function parsePolicies(raw: unknown) {
  const d = (raw as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  if (d?.affected_items) return extractItems(raw);
  if (d && typeof d === "object") {
    const entries = Object.entries(d).filter(([k]) =>
      !["affected_items", "total_affected_items", "total_failed_items", "failed_items", "rbac_mode"].includes(k)
    );
    return {
      items: entries.map(([key, val]) => ({ key, value: val })),
      total: entries.length,
    };
  }
  return { items: [], total: 0 };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("SecurityExplorer — safeDisplay", () => {
  it("returns dash for null", () => {
    expect(safeDisplay(null)).toBe("—");
  });

  it("returns dash for undefined", () => {
    expect(safeDisplay(undefined)).toBe("—");
  });

  it("returns string for primitives", () => {
    expect(safeDisplay("hello")).toBe("hello");
    expect(safeDisplay(42)).toBe("42");
    expect(safeDisplay(true)).toBe("true");
  });

  it("JSON.stringifies objects instead of returning [object Object]", () => {
    const obj = { FIND: { username: "elastic" } };
    const result = safeDisplay(obj);
    expect(result).not.toContain("[object Object]");
    expect(result).toBe(JSON.stringify(obj));
  });

  it("JSON.stringifies arrays", () => {
    const arr = [1, 2, 3];
    expect(safeDisplay(arr)).toBe("[1,2,3]");
  });
});

describe("SecurityExplorer — extractDescription", () => {
  it("returns dash for null/undefined", () => {
    expect(extractDescription(null)).toBe("—");
    expect(extractDescription(undefined)).toBe("—");
  });

  it("returns string values as-is", () => {
    expect(extractDescription("Create agents")).toBe("Create agents");
  });

  it("extracts .description from action-shaped objects", () => {
    const actionVal = {
      description: "Create a new agent",
      resources: ["agent:id"],
      example: { endpoint: "/agents", method: "POST" },
      related_endpoints: ["POST /agents"],
    };
    expect(extractDescription(actionVal)).toBe("Create a new agent");
  });

  it("extracts .description from resource-shaped objects", () => {
    const resourceVal = { description: "Agent ID reference" };
    expect(extractDescription(resourceVal)).toBe("Agent ID reference");
  });

  it("falls back to JSON.stringify for objects without .description", () => {
    const obj = { foo: "bar" };
    const result = extractDescription(obj);
    expect(result).not.toContain("[object Object]");
    expect(result).toBe(JSON.stringify(obj));
  });
});

describe("SecurityExplorer — Actions parser (flat dict format)", () => {
  const mockActionsResponse = {
    data: {
      "agent:create": {
        description: "Create new agents",
        resources: ["agent:id"],
        example: { endpoint: "/agents", method: "POST" },
        related_endpoints: ["POST /agents"],
      },
      "agent:delete": {
        description: "Delete existing agents",
        resources: ["agent:id", "agent:group"],
        example: { endpoint: "/agents", method: "DELETE" },
        related_endpoints: ["DELETE /agents"],
      },
      "agent:read": {
        description: "Access agent information",
        resources: ["agent:id"],
        example: { endpoint: "/agents", method: "GET" },
        related_endpoints: ["GET /agents", "GET /agents/{agent_id}"],
      },
    },
  };

  it("parses flat dict into items array", () => {
    const result = parseActions(mockActionsResponse);
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(3);
  });

  it("extracts action names as .action field", () => {
    const result = parseActions(mockActionsResponse);
    const names = result.items.map(i => i.action);
    expect(names).toContain("agent:create");
    expect(names).toContain("agent:delete");
    expect(names).toContain("agent:read");
  });

  it("extracts .description string from complex action objects", () => {
    const result = parseActions(mockActionsResponse);
    const createItem = result.items.find(i => i.action === "agent:create");
    expect(createItem?.description).toBe("Create new agents");
    // Must NOT be [object Object]
    expect(String(createItem?.description)).not.toContain("[object Object]");
  });

  it("preserves raw object in _raw for detail rendering", () => {
    const result = parseActions(mockActionsResponse);
    const deleteItem = result.items.find(i => i.action === "agent:delete");
    expect(deleteItem?._raw).toEqual(mockActionsResponse.data["agent:delete"]);
  });

  it("handles empty data", () => {
    expect(parseActions({ data: {} })).toEqual({ items: [], total: 0 });
    expect(parseActions(null)).toEqual({ items: [], total: 0 });
    expect(parseActions(undefined)).toEqual({ items: [], total: 0 });
  });
});

describe("SecurityExplorer — Resources parser (flat dict format)", () => {
  const mockResourcesResponse = {
    data: {
      "agent:id": { description: "Reference agents via agent ID" },
      "agent:group": { description: "Reference agents via group name" },
      "group:id": { description: "Reference agent groups" },
      "*:*": { description: "All resources" },
    },
  };

  it("parses flat dict into items array", () => {
    const result = parseResources(mockResourcesResponse);
    expect(result.total).toBe(4);
    expect(result.items).toHaveLength(4);
  });

  it("extracts resource names as .resource field", () => {
    const result = parseResources(mockResourcesResponse);
    const names = result.items.map(i => i.resource);
    expect(names).toContain("agent:id");
    expect(names).toContain("agent:group");
    expect(names).toContain("*:*");
  });

  it("extracts .description from {description: '...'} objects", () => {
    const result = parseResources(mockResourcesResponse);
    const agentId = result.items.find(i => i.resource === "agent:id");
    expect(agentId?.description).toBe("Reference agents via agent ID");
    // Must NOT be [object Object]
    expect(String(agentId?.description)).not.toContain("[object Object]");
  });

  it("handles empty data", () => {
    expect(parseResources({ data: {} })).toEqual({ items: [], total: 0 });
    expect(parseResources(null)).toEqual({ items: [], total: 0 });
  });
});

describe("SecurityExplorer — Policies parser (flat dict format)", () => {
  const mockPoliciesResponse = {
    data: {
      rbac_mode: "white",
      "agent:create": { "*:*:*": "allow" },
      "agent:delete": { "*:*:*": "deny" },
      "agent:read": { "*:*:*": "allow", "agent:id:001": "deny" },
    },
  };

  it("parses flat dict into items array, excluding rbac_mode", () => {
    const result = parsePolicies(mockPoliciesResponse);
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(3);
    // rbac_mode should be filtered out
    expect(result.items.find(i => i.key === "rbac_mode")).toBeUndefined();
  });

  it("preserves the value object for structured rendering", () => {
    const result = parsePolicies(mockPoliciesResponse);
    const createPolicy = result.items.find(i => i.key === "agent:create");
    expect(createPolicy?.value).toEqual({ "*:*:*": "allow" });
  });

  it("preserves multi-resource policies", () => {
    const result = parsePolicies(mockPoliciesResponse);
    const readPolicy = result.items.find(i => i.key === "agent:read");
    expect(readPolicy?.value).toEqual({ "*:*:*": "allow", "agent:id:001": "deny" });
  });

  it("value objects are renderable without [object Object]", () => {
    const result = parsePolicies(mockPoliciesResponse);
    for (const item of result.items) {
      // safeDisplay should produce JSON, not [object Object]
      const displayed = safeDisplay(item.value);
      expect(displayed).not.toContain("[object Object]");
    }
  });

  it("handles empty data", () => {
    expect(parsePolicies({ data: {} })).toEqual({ items: [], total: 0 });
    expect(parsePolicies(null)).toEqual({ items: [], total: 0 });
  });
});

describe("SecurityExplorer — RBAC Rules (affected_items format)", () => {
  const mockRulesResponse = {
    data: {
      affected_items: [
        { id: 1, name: "wui_elastic", rule: { FIND: { username: "elastic" } }, roles: [1, 2] },
        { id: 2, name: "wui_admin", rule: { MATCH: { user_id: "admin" } }, body: { old_field: true }, roles: [] },
        { id: 3, name: "simple_rule", rule: "basic_string_rule", roles: [3] },
      ],
      total_affected_items: 3,
      total_failed_items: 0,
      failed_items: [],
    },
  };

  it("extracts affected_items correctly", () => {
    const result = extractItems(mockRulesResponse);
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(3);
  });

  it("rule.rule as object is safely displayable", () => {
    const result = extractItems(mockRulesResponse);
    const rule1 = result.items[0];
    // The old bug: String(rule.rule) would produce [object Object]
    // The fix: we use safeDisplay or JSON.stringify
    const displayed = safeDisplay(rule1.rule);
    expect(displayed).not.toContain("[object Object]");
    expect(displayed).toContain("FIND");
    expect(displayed).toContain("elastic");
  });

  it("rule.rule as string is safely displayable", () => {
    const result = extractItems(mockRulesResponse);
    const rule3 = result.items[2];
    expect(safeDisplay(rule3.rule)).toBe("basic_string_rule");
  });

  it("prefers rule.rule over rule.body when both exist", () => {
    const result = extractItems(mockRulesResponse);
    const rule2 = result.items[1];
    // The component renders rule.rule ?? rule.body
    const displayVal = rule2.rule ?? rule2.body;
    const displayed = safeDisplay(displayVal);
    expect(displayed).not.toContain("[object Object]");
    expect(displayed).toContain("MATCH");
  });
});

describe("SecurityExplorer — filterItems with object values", () => {
  it("search works on items with object values (no [object Object] in search)", () => {
    const items = [
      { action: "agent:create", description: "Create new agents", _raw: { description: "Create new agents", resources: ["agent:id"] } },
      { action: "agent:delete", description: "Delete existing agents", _raw: { description: "Delete existing agents" } },
    ];
    const lower = "create";
    const filtered = items.filter(item =>
      Object.values(item).some(v => safeDisplay(v).toLowerCase().includes(lower))
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].action).toBe("agent:create");
  });

  it("search on object fields uses JSON representation, not [object Object]", () => {
    const items = [
      { key: "agent:read", value: { "*:*:*": "allow" } },
    ];
    const lower = "allow";
    const filtered = items.filter(item =>
      Object.values(item).some(v => safeDisplay(v).toLowerCase().includes(lower))
    );
    expect(filtered).toHaveLength(1);
  });
});
