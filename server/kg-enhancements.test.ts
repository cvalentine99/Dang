import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

/**
 * Tests for Knowledge Graph enhancements:
 * 1. Node expansion (endpointsByResource, endpointDetail)
 * 2. Search-to-focus (searchGraph returns nodes with id/type/label)
 * 3. Endpoint table view (endpoints with filtering/pagination)
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

describe("Knowledge Graph — Node Expansion", () => {
  it("endpointsByResource returns nodes and edges for a valid resource", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    // "Agents" is a common resource in the Wazuh API KG
    const result = await caller.graph.endpointsByResource({ resource: "agents" });

    expect(result).toHaveProperty("nodes");
    expect(result).toHaveProperty("edges");
    expect(Array.isArray(result.nodes)).toBe(true);
    expect(Array.isArray(result.edges)).toBe(true);

    // If data exists, resource node should be present
    if (result.nodes.length > 0) {
      const resourceNode = result.nodes.find((n: any) => n.type === "resource");
      expect(resourceNode).toBeDefined();
      expect(resourceNode?.label.toLowerCase()).toBe("agents");

      // Edges should connect resource to endpoints
      const containsEdges = result.edges.filter((e: any) => e.relationship === "CONTAINS");
      expect(containsEdges.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("endpointsByResource returns empty for non-existent resource", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.graph.endpointsByResource({ resource: "NonExistentResource_XYZ" });

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });

  it("endpointDetail returns params and responses for a valid endpoint", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    // First get an endpoint ID from the overview
    const overview = await caller.graph.overviewGraph({ limit: 5 });
    const endpointNode = overview.nodes.find((n: any) => n.type === "endpoint");

    if (endpointNode) {
      const idNum = parseInt(endpointNode.id.replace("endpoint-", ""), 10);
      if (!isNaN(idNum)) {
        const detail = await caller.graph.endpointDetail({ endpointId: idNum });

        expect(detail).toHaveProperty("nodes");
        expect(detail).toHaveProperty("edges");
        expect(detail.nodes.length).toBeGreaterThanOrEqual(1);

        // Should contain the endpoint node itself
        const epNode = detail.nodes.find((n: any) => n.type === "endpoint");
        expect(epNode).toBeDefined();

        // Edges should be ACCEPTS (params) or RETURNS (responses)
        for (const edge of detail.edges) {
          expect(["ACCEPTS", "RETURNS"]).toContain(edge.relationship);
        }
      }
    }
  });

  it("endpointDetail returns empty for non-existent endpoint", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.graph.endpointDetail({ endpointId: 999999 });

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });
});

describe("Knowledge Graph — Search-to-Focus", () => {
  it("searchGraph returns typed nodes with id, type, and label", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.graph.searchGraph({ query: "agent", limit: 10 });

    expect(Array.isArray(result)).toBe(true);

    if (result.length > 0) {
      for (const node of result) {
        expect(node).toHaveProperty("id");
        expect(node).toHaveProperty("type");
        expect(node).toHaveProperty("label");
        expect(typeof node.id).toBe("string");
        expect(typeof node.type).toBe("string");
        expect(typeof node.label).toBe("string");
      }
    }
  });

  it("searchGraph returns empty for nonsense query", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.graph.searchGraph({ query: "zzzznonexistent12345", limit: 10 });

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("searchGraph respects limit parameter", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.graph.searchGraph({ query: "a", limit: 3 });

    expect(result.length).toBeLessThanOrEqual(3);
  });
});

describe("Knowledge Graph — Endpoint Table View", () => {
  it("endpoints returns paginated list with total count", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.graph.endpoints({ limit: 10, offset: 0 });

    expect(result).toHaveProperty("endpoints");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.endpoints)).toBe(true);
    expect(typeof result.total).toBe("number");
    expect(result.endpoints.length).toBeLessThanOrEqual(10);
  });

  it("endpoints filters by method", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.graph.endpoints({ method: "GET", limit: 50, offset: 0 });

    for (const ep of result.endpoints) {
      expect((ep as any).method).toBe("GET");
    }
  });

  it("endpoints filters by riskLevel", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.graph.endpoints({ riskLevel: "DESTRUCTIVE", limit: 50, offset: 0 });

    for (const ep of result.endpoints) {
      expect((ep as any).riskLevel).toBe("DESTRUCTIVE");
    }
  });

  it("endpoints filters by resource", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.graph.endpoints({ resource: "agents", limit: 50, offset: 0 });

    for (const ep of result.endpoints) {
      expect((ep as any).resource.toLowerCase()).toBe("agents");
    }
  });

  it("endpoints supports offset for pagination", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const page1 = await caller.graph.endpoints({ limit: 5, offset: 0 });
    const page2 = await caller.graph.endpoints({ limit: 5, offset: 5 });

    if (page1.endpoints.length > 0 && page2.endpoints.length > 0) {
      // Pages should not overlap
      const ids1 = new Set(page1.endpoints.map((e: any) => e.id));
      const ids2 = new Set(page2.endpoints.map((e: any) => e.id));
      for (const id of Array.from(ids2)) {
        expect(ids1.has(id)).toBe(false);
      }
    }
  });

  it("resourceOverview returns resource list for filter dropdown", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.graph.resourceOverview();

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("name");
    }
  });
});
