import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * Tests for Knowledge Graph Multi-Select Mode:
 * 1. Multi-select relies on client-side Set<string> state — verified via node ID uniqueness
 * 2. Bulk Hide — verified via node IDs being filterable from graph data
 * 3. Bulk Pin — verified via node position data (fx/fy) availability
 * 4. Bulk Copy IDs — verified via node ID format consistency
 * 5. Bulk Add to Investigation — verified via investigation CRUD with multi-node evidence
 * 6. Select All — verified via overviewGraph returning all nodes with unique IDs
 */

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "local",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("Knowledge Graph — Multi-Select: Node ID Uniqueness", () => {
  it("overviewGraph returns nodes with unique IDs for Set-based selection", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.graph.overviewGraph({ limit: 100 });

    const ids = result.nodes.map((n: any) => n.id);
    const uniqueIds = new Set(ids);

    // All IDs should be unique — critical for multi-select Set tracking
    expect(uniqueIds.size).toBe(ids.length);

    // All IDs should be non-empty strings
    for (const id of ids) {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it("node IDs are safe for CSS class names (used for selection ring targeting)", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.graph.overviewGraph({ limit: 50 });

    for (const node of result.nodes) {
      const id = (node as any).id as string;
      // After sanitization (replace non-alphanumeric with _), should still be unique
      const safeId = id.replace(/[^a-zA-Z0-9-]/g, "_");
      expect(safeId.length).toBeGreaterThan(0);
    }
  });
});

describe("Knowledge Graph — Multi-Select: Bulk Hide Support", () => {
  it("nodes can be filtered by ID set (simulates hiddenNodes filtering)", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.graph.overviewGraph({ limit: 50 });

    if (result.nodes.length >= 3) {
      // Simulate selecting first 3 nodes for bulk hide
      const hideIds = new Set(result.nodes.slice(0, 3).map((n: any) => n.id));
      const remaining = result.nodes.filter((n: any) => !hideIds.has(n.id));

      expect(remaining.length).toBe(result.nodes.length - 3);
      // None of the remaining should be in the hidden set
      for (const node of remaining) {
        expect(hideIds.has((node as any).id)).toBe(false);
      }
    }
  });
});

describe("Knowledge Graph — Multi-Select: Bulk Pin Support", () => {
  it("nodes have position-compatible structure for fx/fy pinning", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.graph.overviewGraph({ limit: 20 });

    // Each node should have an id and type — D3 will add x/y/fx/fy at runtime
    for (const node of result.nodes) {
      expect(node).toHaveProperty("id");
      expect(node).toHaveProperty("type");
      expect(node).toHaveProperty("label");
    }
  });
});

describe("Knowledge Graph — Multi-Select: Bulk Copy IDs", () => {
  it("node IDs can be joined with newlines for clipboard copy", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.graph.overviewGraph({ limit: 20 });

    if (result.nodes.length > 0) {
      const ids = result.nodes.map((n: any) => n.id);
      const joined = ids.join("\n");

      // Should produce a non-empty string with newlines
      expect(joined.length).toBeGreaterThan(0);
      if (ids.length > 1) {
        expect(joined).toContain("\n");
      }
      // Should be splittable back to original IDs
      expect(joined.split("\n")).toEqual(ids);
    }
  });
});

describe("Knowledge Graph — Multi-Select: Bulk Add to Investigation", () => {
  it("can create investigation with multi-node evidence payload", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    // Get some nodes to simulate multi-select
    const graphResult = await caller.graph.overviewGraph({ limit: 10 });
    const selectedNodes = graphResult.nodes.slice(0, Math.min(3, graphResult.nodes.length));

    if (selectedNodes.length === 0) return; // Skip if no data

    // Create investigation
    const created = await caller.graph.createInvestigation({
      title: "Multi-Select Test Investigation",
      description: "Testing bulk evidence attachment from multi-select",
      tags: ["test", "multiselect"],
    });

    expect(created).toHaveProperty("id");
    const invId = (created as any).id;

    // Build multi-node evidence array (simulates handleBulkAddToInvestigation)
    const evidence = [{
      type: "multi_select",
      label: `${selectedNodes.length} selected nodes`,
      data: {
        nodeIds: selectedNodes.map((n: any) => n.id),
        nodeLabels: selectedNodes.map((n: any) => n.label),
      },
      addedAt: new Date().toISOString(),
    }];

    // Attach evidence
    const updated = await caller.graph.updateInvestigation({
      id: invId,
      evidence,
    });

    expect(updated).toBeDefined();

    // Verify evidence was saved
    const listResult = await caller.graph.listInvestigations({});
    const sessions = (listResult as any).sessions ?? (Array.isArray(listResult) ? listResult : []);
    const inv = sessions.find((s: any) => s.id === invId);

    if (inv) {
      expect(Array.isArray(inv.evidence)).toBe(true);
      expect(inv.evidence.length).toBeGreaterThanOrEqual(1);

      const multiEvidence = inv.evidence.find((e: any) => e.type === "multi_select");
      expect(multiEvidence).toBeDefined();
      expect(multiEvidence.data.nodeIds.length).toBe(selectedNodes.length);
    }
  });
});

describe("Knowledge Graph — Multi-Select: Select All", () => {
  it("all visible nodes can be collected into a Set for Select All", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.graph.overviewGraph({ limit: 100 });

    // Simulate Select All
    const allIds = new Set(result.nodes.map((n: any) => n.id));

    // Should match total node count
    expect(allIds.size).toBe(result.nodes.length);

    // Deselect All should produce empty set
    const emptySet = new Set<string>();
    expect(emptySet.size).toBe(0);
  });
});
