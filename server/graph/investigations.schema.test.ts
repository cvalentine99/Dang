/**
 * Investigations Schema Tests
 * 
 * Pure schema-level z.parse() tests for all investigation CRUD procedures.
 * These tests validate input schemas without hitting the database.
 * They run in any environment (no env gating needed).
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";

// ── Input schemas extracted from graphRouter procedure definitions ──────────

const createInvestigationSchema = z.object({
  title: z.string().min(1).max(512),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const getInvestigationSchema = z.object({ id: z.number() });

const updateInvestigationSchema = z.object({
  id: z.number(),
  title: z.string().min(1).max(512).optional(),
  description: z.string().optional(),
  status: z.enum(["active", "closed", "archived"]).optional(),
  tags: z.array(z.string()).optional(),
  evidence: z.array(z.object({
    type: z.string(),
    label: z.string(),
    data: z.record(z.string(), z.unknown()),
    addedAt: z.string(),
  })).optional(),
  timeline: z.array(z.object({
    timestamp: z.string(),
    event: z.string(),
    source: z.string(),
    severity: z.string().optional(),
  })).optional(),
});

const addInvestigationNoteSchema = z.object({
  sessionId: z.number(),
  content: z.string().min(1),
});

const deleteInvestigationNoteSchema = z.object({ noteId: z.number() });

const listInvestigationsSchema = z.object({
  status: z.enum(["active", "closed", "archived"]).optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
});

const investigationsByAgentSchema = z.object({ agentId: z.string() });

// ── Tests ──────────────────────────────────────────────────────────────────

describe("investigations.schema — createInvestigation", () => {
  it("accepts valid minimal input", () => {
    const result = createInvestigationSchema.safeParse({ title: "Incident #42" });
    expect(result.success).toBe(true);
  });

  it("accepts full input with description and tags", () => {
    const result = createInvestigationSchema.safeParse({
      title: "Lateral Movement Investigation",
      description: "Investigating suspicious lateral movement from agent 003",
      tags: ["lateral-movement", "agent-003", "priority-high"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty title", () => {
    const result = createInvestigationSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("rejects title exceeding 512 chars", () => {
    const result = createInvestigationSchema.safeParse({ title: "x".repeat(513) });
    expect(result.success).toBe(false);
  });

  it("rejects missing title", () => {
    const result = createInvestigationSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects non-string tags", () => {
    const result = createInvestigationSchema.safeParse({
      title: "Test",
      tags: [123, true],
    });
    expect(result.success).toBe(false);
  });
});

describe("investigations.schema — getInvestigation", () => {
  it("accepts valid numeric id", () => {
    const result = getInvestigationSchema.safeParse({ id: 42 });
    expect(result.success).toBe(true);
  });

  it("rejects string id", () => {
    const result = getInvestigationSchema.safeParse({ id: "42" });
    expect(result.success).toBe(false);
  });

  it("rejects missing id", () => {
    const result = getInvestigationSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("investigations.schema — updateInvestigation", () => {
  it("accepts id-only update (no fields changed)", () => {
    const result = updateInvestigationSchema.safeParse({ id: 1 });
    expect(result.success).toBe(true);
  });

  it("accepts status transition to closed", () => {
    const result = updateInvestigationSchema.safeParse({
      id: 1,
      status: "closed",
    });
    expect(result.success).toBe(true);
  });

  it("accepts status transition to archived", () => {
    const result = updateInvestigationSchema.safeParse({
      id: 1,
      status: "archived",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status value", () => {
    const result = updateInvestigationSchema.safeParse({
      id: 1,
      status: "deleted",
    });
    expect(result.success).toBe(false);
  });

  it("accepts evidence array with proper structure", () => {
    const result = updateInvestigationSchema.safeParse({
      id: 1,
      evidence: [
        {
          type: "alert",
          label: "Rule 5710 fired",
          data: { ruleId: 5710, agentId: "003", level: 12 },
          addedAt: "2026-03-06T09:00:00Z",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects evidence missing required fields", () => {
    const result = updateInvestigationSchema.safeParse({
      id: 1,
      evidence: [{ type: "alert" }], // missing label, data, addedAt
    });
    expect(result.success).toBe(false);
  });

  it("accepts timeline array with proper structure", () => {
    const result = updateInvestigationSchema.safeParse({
      id: 1,
      timeline: [
        {
          timestamp: "2026-03-06T09:00:00Z",
          event: "Initial alert triggered",
          source: "wazuh",
          severity: "high",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts timeline without optional severity", () => {
    const result = updateInvestigationSchema.safeParse({
      id: 1,
      timeline: [
        {
          timestamp: "2026-03-06T09:00:00Z",
          event: "Analyst began review",
          source: "manual",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts full update with all fields", () => {
    const result = updateInvestigationSchema.safeParse({
      id: 1,
      title: "Updated Title",
      description: "Updated description",
      status: "active",
      tags: ["updated", "priority-critical"],
      evidence: [],
      timeline: [],
    });
    expect(result.success).toBe(true);
  });
});

describe("investigations.schema — addInvestigationNote", () => {
  it("accepts valid note", () => {
    const result = addInvestigationNoteSchema.safeParse({
      sessionId: 1,
      content: "Confirmed lateral movement via RDP from 10.0.0.5",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty content", () => {
    const result = addInvestigationNoteSchema.safeParse({
      sessionId: 1,
      content: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing sessionId", () => {
    const result = addInvestigationNoteSchema.safeParse({
      content: "Some note",
    });
    expect(result.success).toBe(false);
  });
});

describe("investigations.schema — deleteInvestigationNote", () => {
  it("accepts valid noteId", () => {
    const result = deleteInvestigationNoteSchema.safeParse({ noteId: 42 });
    expect(result.success).toBe(true);
  });

  it("rejects string noteId", () => {
    const result = deleteInvestigationNoteSchema.safeParse({ noteId: "42" });
    expect(result.success).toBe(false);
  });
});

describe("investigations.schema — listInvestigations", () => {
  it("accepts empty input (all defaults)", () => {
    const result = listInvestigationsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts status filter", () => {
    const result = listInvestigationsSchema.safeParse({ status: "active" });
    expect(result.success).toBe(true);
  });

  it("accepts pagination params", () => {
    const result = listInvestigationsSchema.safeParse({ limit: 25, offset: 50 });
    expect(result.success).toBe(true);
  });

  it("rejects limit > 100", () => {
    const result = listInvestigationsSchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });

  it("rejects negative offset", () => {
    const result = listInvestigationsSchema.safeParse({ offset: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid status", () => {
    const result = listInvestigationsSchema.safeParse({ status: "pending" });
    expect(result.success).toBe(false);
  });
});

describe("investigations.schema — investigationsByAgent", () => {
  it("accepts valid agentId", () => {
    const result = investigationsByAgentSchema.safeParse({ agentId: "003" });
    expect(result.success).toBe(true);
  });

  it("rejects missing agentId", () => {
    const result = investigationsByAgentSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects numeric agentId (must be string)", () => {
    const result = investigationsByAgentSchema.safeParse({ agentId: 3 });
    expect(result.success).toBe(false);
  });
});
