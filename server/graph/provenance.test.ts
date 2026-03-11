/**
 * Provenance Tests
 *
 * Section 1: extractProvenanceIds — pure function tests (always run)
 * Section 2: recordProvenance — REAL DB persistence test
 *   - Calls recordProvenance() against the live database
 *   - Reads the row back with a SELECT query
 *   - Proves write → read roundtrip
 *   - Skipped if DATABASE_URL is not set (CI without DB)
 */

import { describe, it, expect, afterAll } from "vitest";
import { extractProvenanceIds, type RetrievalSource } from "./agenticPipeline";

// ── Section 1: extractProvenanceIds (pure function, no DB) ──────────────────

describe("extractProvenanceIds", () => {

  it("returns empty arrays when sources have no graph data", () => {
    const sources: RetrievalSource[] = [
      { type: "indexer", label: "Wazuh alerts", data: [{ _id: "abc" }], relevance: "primary" },
    ];
    const result = extractProvenanceIds(sources);
    expect(result.endpointIds).toEqual([]);
    expect(result.parameterIds).toEqual([]);
  });

  it("returns empty arrays when sources is empty", () => {
    const result = extractProvenanceIds([]);
    expect(result.endpointIds).toEqual([]);
    expect(result.parameterIds).toEqual([]);
  });

  it("extracts endpoint IDs from GraphNode format (searchGraph results)", () => {
    const sources: RetrievalSource[] = [
      {
        type: "graph",
        label: 'KG search: "agents"',
        data: [
          { id: "endpoint-42", type: "endpoint", label: "GET /agents", properties: {} },
          { id: "endpoint-17", type: "endpoint", label: "GET /agents/summary", properties: {} },
          { id: "param-5", type: "parameter", label: "agent_id", properties: {} },
        ],
        relevance: "supporting",
      },
    ];
    const result = extractProvenanceIds(sources);
    expect(result.endpointIds).toEqual([17, 42]); // sorted
    expect(result.parameterIds).toEqual([5]);
  });

  it("extracts endpoint IDs from direct endpoint rows (getEndpoints results)", () => {
    const sources: RetrievalSource[] = [
      {
        type: "graph",
        label: "API Endpoints (SAFE only)",
        data: [
          { id: 10, method: "GET", path: "/agents", summary: "List agents", riskLevel: "safe" },
          { id: 20, method: "GET", path: "/alerts", summary: "List alerts", riskLevel: "safe" },
        ],
        relevance: "primary",
      },
    ];
    const result = extractProvenanceIds(sources);
    expect(result.endpointIds).toEqual([10, 20]);
    expect(result.parameterIds).toEqual([]);
  });

  it("extracts endpoint IDs from risk analysis dangerousEndpoints", () => {
    const sources: RetrievalSource[] = [
      {
        type: "graph",
        label: "Risk Analysis (Endpoint Classification)",
        data: {
          dangerousEndpoints: [
            { id: 99, method: "DELETE", path: "/agents/{agent_id}" },
            { id: 101, method: "PUT", path: "/agents/{agent_id}/restart" },
          ],
          safeEndpoints: 50,
          totalEndpoints: 52,
        },
        relevance: "primary",
      },
    ];
    const result = extractProvenanceIds(sources);
    expect(result.endpointIds).toEqual([99, 101]);
  });

  it("extracts parameter IDs and their parent endpointIds from parameter rows", () => {
    const sources: RetrievalSource[] = [
      {
        type: "graph",
        label: "KG search: params",
        data: [
          { id: 30, endpointId: 10, name: "agent_id", location: "path" },
          { id: 31, endpointId: 10, name: "status", location: "query" },
          { id: 32, endpointId: 20, name: "limit", location: "query" },
        ],
        relevance: "supporting",
      },
    ];
    const result = extractProvenanceIds(sources);
    expect(result.parameterIds).toEqual([30, 31, 32]);
    expect(result.endpointIds).toEqual([10, 20]);
  });

  it("deduplicates IDs across multiple sources", () => {
    const sources: RetrievalSource[] = [
      {
        type: "graph",
        label: "KG search: agents",
        data: [
          { id: "endpoint-42", type: "endpoint", label: "GET /agents", properties: {} },
        ],
        relevance: "supporting",
      },
      {
        type: "graph",
        label: "API Endpoints",
        data: [
          { id: 42, method: "GET", path: "/agents", summary: "List agents", riskLevel: "safe" },
          { id: 43, method: "GET", path: "/agents/summary", summary: "Agent summary", riskLevel: "safe" },
        ],
        relevance: "primary",
      },
    ];
    const result = extractProvenanceIds(sources);
    expect(result.endpointIds).toEqual([42, 43]);
  });

  it("ignores indexer-type sources entirely", () => {
    const sources: RetrievalSource[] = [
      {
        type: "indexer",
        label: "Wazuh alerts",
        data: [
          { id: "endpoint-999", type: "endpoint", label: "fake", properties: {} },
        ],
        relevance: "primary",
      },
    ];
    const result = extractProvenanceIds(sources);
    expect(result.endpointIds).toEqual([]);
    expect(result.parameterIds).toEqual([]);
  });

  it("handles mixed source types in a realistic pipeline output", () => {
    const sources: RetrievalSource[] = [
      { type: "stats", label: "Knowledge Graph Statistics", data: { totalEndpoints: 81 }, relevance: "context" },
      {
        type: "graph",
        label: "API Resource Categories",
        data: [
          { id: 1, name: "Agents", endpointCount: 15 },
          { id: 2, name: "Alerts", endpointCount: 8 },
        ],
        relevance: "context",
      },
      {
        type: "graph",
        label: "Risk Analysis (Endpoint Classification)",
        data: {
          dangerousEndpoints: [{ id: 55, method: "DELETE", path: "/agents/{id}" }],
          safeEndpoints: 78,
        },
        relevance: "primary",
      },
      {
        type: "graph",
        label: 'KG search: "vulnerability"',
        data: [
          { id: "endpoint-12", type: "endpoint", label: "GET /vulnerability", properties: {} },
          { id: "endpoint-13", type: "endpoint", label: "GET /vulnerability/{agent_id}", properties: {} },
          { id: "param-7", type: "parameter", label: "agent_id", properties: { endpointId: 13 } },
        ],
        relevance: "supporting",
      },
      {
        type: "indexer",
        label: "Wazuh vulnerability alerts",
        data: [{ _id: "alert-123", rule: { id: "23504" } }],
        relevance: "primary",
      },
    ];

    const result = extractProvenanceIds(sources);
    expect(result.endpointIds).toContain(12);
    expect(result.endpointIds).toContain(13);
    expect(result.endpointIds).toContain(55);
    expect(result.endpointIds.length).toBeGreaterThanOrEqual(3);
    expect(result.parameterIds).toContain(7);
  });

  it("handles null/undefined data gracefully", () => {
    const sources: RetrievalSource[] = [
      { type: "graph", label: "Empty", data: null, relevance: "context" },
      { type: "graph", label: "Undefined", data: undefined, relevance: "context" },
    ];
    const result = extractProvenanceIds(sources);
    expect(result.endpointIds).toEqual([]);
    expect(result.parameterIds).toEqual([]);
  });

  it("handles non-numeric IDs in GraphNode format gracefully", () => {
    const sources: RetrievalSource[] = [
      {
        type: "graph",
        label: "KG search",
        data: [
          { id: "usecase-abc", type: "use_case", label: "List agents", properties: {} },
          { id: "field-xyz", type: "field", label: "agent.id", properties: {} },
        ],
        relevance: "supporting",
      },
    ];
    const result = extractProvenanceIds(sources);
    expect(result.endpointIds).toEqual([]);
    expect(result.parameterIds).toEqual([]);
  });
});

// ── Section 2: recordProvenance — REAL DB persistence roundtrip ─────────────
//
// This test actually calls recordProvenance() against the live database,
// then reads the row back with a raw SQL SELECT to prove the write persisted.
//
// If DATABASE_URL is not set, the test is skipped (not faked).

const HAS_DB = !!process.env.DATABASE_URL;

describe("recordProvenance (real DB persistence)", () => {
  // Unique marker so we can find our test row and clean it up
  const TEST_SESSION_ID = `provenance-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  afterAll(async () => {
    // Clean up the test row
    if (!HAS_DB) return;
    try {
      const { getDb } = await import("../db");
      const db = await getDb();
      if (db) {
        const { kgAnswerProvenance } = await import("../../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        await db.delete(kgAnswerProvenance).where(eq(kgAnswerProvenance.sessionId, TEST_SESSION_ID));
      }
    } catch {
      // Best-effort cleanup
    }
  });

  it.skipIf(!HAS_DB)(
    "writes a provenance row to the database and reads it back",
    async () => {
      // ── Step 1: Build a realistic provenance payload ──────────────────
      // These IDs come from extractProvenanceIds in a real pipeline run.
      const payload = {
        sessionId: TEST_SESSION_ID,
        question: "Which agents have critical vulnerabilities?",
        answer: "Based on the Wazuh vulnerability data, agents 001 and 003 have critical CVEs.",
        confidence: "0.850",
        endpointIds: [12, 13, 55],
        parameterIds: [7],
        docChunkIds: [] as number[],
        warnings: ["indexer_timeout: 1 source timed out"],
      };

      // ── Step 2: Call the real recordProvenance function ────────────────
      const { recordProvenance } = await import("./graphQueryService");
      await recordProvenance(payload);

      // ── Step 3: Read the row back from the database ───────────────────
      const { getDb } = await import("../db");
      const db = await getDb();
      expect(db).not.toBeNull();

      const { kgAnswerProvenance } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const rows = await db!.select()
        .from(kgAnswerProvenance)
        .where(eq(kgAnswerProvenance.sessionId, TEST_SESSION_ID))
        .limit(1);

      // ── Step 4: Assert the row exists and contains our data ───────────
      expect(rows.length).toBe(1);
      const row = rows[0];

      expect(row.sessionId).toBe(TEST_SESSION_ID);
      expect(row.question).toBe("Which agents have critical vulnerabilities?");
      expect(row.answer).toContain("agents 001 and 003");
      expect(row.confidence).toBe("0.850");

      // Verify the JSON arrays persisted correctly
      expect(row.endpointIds).toEqual([12, 13, 55]);
      expect(row.parameterIds).toEqual([7]);
      expect(row.docChunkIds).toEqual([]);
      expect(row.warnings).toEqual(["indexer_timeout: 1 source timed out"]);

      // Verify the row has a real auto-generated ID and timestamp
      expect(row.id).toBeGreaterThan(0);
      expect(row.createdAt).toBeInstanceOf(Date);
    }
  );

  it.skipIf(!HAS_DB)(
    "extraction → persistence roundtrip: extractProvenanceIds output persists correctly",
    async () => {
      // This test proves the FULL pipeline path:
      // retrieval sources → extractProvenanceIds() → recordProvenance() → DB row → read back

      // ── Step 1: Realistic retrieval sources ───────────────────────────
      const sources: RetrievalSource[] = [
        {
          type: "graph",
          label: 'KG search: "syscheck"',
          data: [
            { id: "endpoint-30", type: "endpoint", label: "GET /syscheck/{agent_id}", properties: {} },
            { id: "param-15", type: "parameter", label: "agent_id", properties: {} },
          ],
          relevance: "supporting",
        },
        {
          type: "graph",
          label: "API Endpoints (SAFE only)",
          data: [
            { id: 30, method: "GET", path: "/syscheck/{agent_id}", summary: "FIM results", riskLevel: "safe" },
            { id: 31, method: "GET", path: "/syscheck/{agent_id}/last_scan", summary: "Last scan", riskLevel: "safe" },
          ],
          relevance: "primary",
        },
      ];

      // ── Step 2: Extract IDs (pure function) ───────────────────────────
      const ids = extractProvenanceIds(sources);
      expect(ids.endpointIds.length).toBeGreaterThan(0);
      expect(ids.parameterIds.length).toBeGreaterThan(0);

      // ── Step 3: Persist via recordProvenance ──────────────────────────
      const roundtripSessionId = `${TEST_SESSION_ID}-roundtrip`;
      const { recordProvenance } = await import("./graphQueryService");
      await recordProvenance({
        sessionId: roundtripSessionId,
        question: "Show FIM changes for agent 001",
        answer: "The following file integrity changes were detected...",
        confidence: "0.920",
        endpointIds: ids.endpointIds,
        parameterIds: ids.parameterIds,
        docChunkIds: [],
        warnings: [],
      });

      // ── Step 4: Read back and verify ──────────────────────────────────
      const { getDb } = await import("../db");
      const db = await getDb();
      const { kgAnswerProvenance } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const rows = await db!.select()
        .from(kgAnswerProvenance)
        .where(eq(kgAnswerProvenance.sessionId, roundtripSessionId))
        .limit(1);

      expect(rows.length).toBe(1);
      const row = rows[0];

      // The persisted IDs must match what extractProvenanceIds produced
      expect(row.endpointIds).toEqual(ids.endpointIds);
      expect(row.parameterIds).toEqual(ids.parameterIds);
      expect(row.endpointIds!.length).toBeGreaterThan(0);
      expect(row.parameterIds!.length).toBeGreaterThan(0);

      // Clean up the roundtrip row
      await db!.delete(kgAnswerProvenance).where(eq(kgAnswerProvenance.sessionId, roundtripSessionId));
    }
  );
});
