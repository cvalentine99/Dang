import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * Tests for Knowledge Graph Phase 2 enhancements:
 * 1. Context menu — relies on existing graph procedures (endpointsByResource for "Show Connected")
 * 2. Add to Investigation — uses listInvestigations + updateInvestigation
 * 3. Graph export — frontend-only (canvas/SVG serialization), tested via procedure data availability
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

const HAS_DB = !!process.env.DATABASE_URL;

describe.skipIf(!HAS_DB)("Knowledge Graph — Context Menu Support", () => {
  it("endpointsByResource supports 'Show Connected Nodes' for resource nodes", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    // "Show Connected" triggers endpointsByResource for resource nodes
    const result = await caller.graph.endpointsByResource({ resource: "agents" });

    expect(result).toHaveProperty("nodes");
    expect(result).toHaveProperty("edges");
    // Should return connected endpoints for the resource
    if (result.nodes.length > 0) {
      const types = new Set(result.nodes.map((n: any) => n.type));
      expect(types.has("resource") || types.has("endpoint")).toBe(true);
    }
  });

  it("endpointDetail supports 'Show Connected Nodes' for endpoint nodes", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    // Get an endpoint to test expansion
    const overview = await caller.graph.overviewGraph({ limit: 5 });
    const endpointNode = overview.nodes.find((n: any) => n.type === "endpoint");

    if (endpointNode) {
      const idNum = parseInt(endpointNode.id.replace("endpoint-", ""), 10);
      if (!isNaN(idNum)) {
        const detail = await caller.graph.endpointDetail({ endpointId: idNum });
        expect(detail).toHaveProperty("nodes");
        expect(detail).toHaveProperty("edges");
        // Should return params/responses connected to the endpoint
        if (detail.edges.length > 0) {
          const relationships = new Set(detail.edges.map((e: any) => e.relationship));
          // Edges should be ACCEPTS or RETURNS
          for (const rel of Array.from(relationships)) {
            expect(["ACCEPTS", "RETURNS"]).toContain(rel);
          }
        }
      }
    }
  });

  it("searchGraph returns nodes with id field usable for 'Copy Node ID'", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.graph.searchGraph({ query: "agent", limit: 5 });

    if (result.length > 0) {
      for (const node of result) {
        expect(typeof node.id).toBe("string");
        expect(node.id.length).toBeGreaterThan(0);
      }
    }
  });

  it("overviewGraph nodes have id field for hide/pin tracking", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.graph.overviewGraph({ limit: 10 });

    for (const node of result.nodes) {
      expect(typeof (node as any).id).toBe("string");
      expect((node as any).id.length).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(!HAS_DB)("Knowledge Graph — Add to Investigation", () => {
  it("listInvestigations returns sessions array for investigation picker", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.graph.listInvestigations({ status: "active" });

    // Result should have sessions property (or be an array)
    const sessions = (result as any).sessions ?? (Array.isArray(result) ? result : []);
    expect(Array.isArray(sessions)).toBe(true);

    // Each session should have id, title, status
    for (const session of sessions) {
      expect(session).toHaveProperty("id");
      expect(session).toHaveProperty("title");
      expect(session).toHaveProperty("status");
    }
  });

  it("createInvestigation and updateInvestigation can attach evidence", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    // Create a test investigation
    const created = await caller.graph.createInvestigation({
      title: "KG Test Investigation",
      description: "Testing evidence attachment from KG context menu",
      tags: ["test", "kg"],
    });

    expect(created).toHaveProperty("id");
    const invId = (created as any).id;

    // Simulate adding a node as evidence
    const evidence = [
      {
        type: "endpoint",
        label: "GET /agents",
        data: { nodeId: "endpoint-1", method: "GET", path: "/agents" },
        addedAt: new Date().toISOString(),
      },
    ];

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
      expect(inv.evidence[0].label).toBe("GET /agents");
    }

    // Note: no deleteInvestigation procedure exists; test investigation will remain
    // in the database. In production, investigations are archived, not deleted.
  });
});

describe.skipIf(!HAS_DB)("Knowledge Graph — Export Data Availability", () => {
  it("overviewGraph returns enough data for graph export", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.graph.overviewGraph({ limit: 50 });

    expect(result).toHaveProperty("nodes");
    expect(result).toHaveProperty("edges");
    // Graph export needs at least some nodes to render
    expect(Array.isArray(result.nodes)).toBe(true);
    expect(Array.isArray(result.edges)).toBe(true);
  });

  it("graphStats returns metadata for export filename/watermark", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.graph.graphStats();

    expect(result).toHaveProperty("endpoints");
    expect(result).toHaveProperty("resources");
    expect(typeof result.endpoints).toBe("number");
    expect(typeof result.resources).toBe("number");
  });
});
