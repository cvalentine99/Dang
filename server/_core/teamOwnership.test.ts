/**
 * Team-global SOC ownership model — router-level decisions via createCaller with a
 * scripted mock db (no MySQL). Covers C8/C9/H-A4/H-A5/M9/M12.
 *
 * The mock db is a chainable query builder: every awaited query pops the next
 * scripted result; inserts/updates/deletes are recorded.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./context";
import { analystActionAudit, analystNotes, alertQueue, ragSessions, triageObjects } from "../../drizzle/schema";

const state = vi.hoisted(() => ({
  results: [] as unknown[][],
  inserts: [] as Array<{ table: unknown; row: unknown }>,
  updates: [] as Array<{ table: unknown; set: unknown }>,
  deletes: [] as unknown[],
}));

function makeChain(): unknown {
  const chain: Record<string, unknown> = {};
  const pass = () => chain;
  for (const m of ["from", "where", "orderBy", "limit", "offset", "for", "groupBy", "innerJoin", "leftJoin", "$returningId"]) {
    chain[m] = pass;
  }
  chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(state.results.shift() ?? []).then(res, rej);
  return chain;
}

const mockDb = {
  select: () => makeChain(),
  selectDistinct: () => makeChain(),
  insert: (table: unknown) => ({
    values: (row: unknown) => { state.inserts.push({ table, row }); return Promise.resolve([{ insertId: 1 }]); },
  }),
  update: (table: unknown) => ({
    set: (set: unknown) => { state.updates.push({ table, set }); return { where: () => Promise.resolve([{ affectedRows: 1 }]) }; },
  }),
  delete: (table: unknown) => ({ where: () => { state.deletes.push(table); return Promise.resolve([{ affectedRows: 1 }]); } }),
  transaction: (fn: (tx: unknown) => unknown) => fn(mockDb),
};

vi.mock("../db", () => ({ getDb: vi.fn(async () => mockDb) }));

const { appRouter } = await import("../routers");

function ctxFor(id: number, role: "user" | "admin" = "user"): TrpcContext {
  return {
    user: { id, name: `u${id}`, openId: `o${id}`, role } as unknown as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}
const caller = (id: number, role: "user" | "admin" = "user") => appRouter.createCaller(ctxFor(id, role));
const audits = () => state.inserts.filter((i) => i.table === analystActionAudit).map((i) => i.row as Record<string, unknown>);

beforeEach(() => {
  state.results = [];
  state.inserts = [];
  state.updates = [];
  state.deletes = [];
});

// ── H-A4/C8: RAG chat sessions are strictly per-analyst ───────────────────────
describe("hybridrag sessions (per-analyst)", () => {
  it("sessionHistory: FORBIDDEN for a session owned by another analyst", async () => {
    state.results = [[{ userId: 2 }]];
    await expect(caller(3).hybridrag.sessionHistory({ sessionId: "s1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("sessionHistory: FORBIDDEN for a legacy (NULL-owner) session to a non-admin", async () => {
    state.results = [[{ userId: null }]];
    await expect(caller(3).hybridrag.sessionHistory({ sessionId: "legacy" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("sessionHistory: owner gets their rows; unknown session id is just empty (no existence leak)", async () => {
    state.results = [[{ userId: 3 }], [{ id: 1, sessionId: "s1", userId: 3 }]];
    await expect(caller(3).hybridrag.sessionHistory({ sessionId: "s1" })).resolves.toHaveLength(1);
    state.results = [[], []];
    await expect(caller(3).hybridrag.sessionHistory({ sessionId: "nope" })).resolves.toEqual([]);
  });

  it("sessionHistory: admin may read any session (incl. legacy)", async () => {
    state.results = [[{ id: 1, sessionId: "legacy", userId: null }]];
    await expect(caller(9, "admin").hybridrag.sessionHistory({ sessionId: "legacy" })).resolves.toHaveLength(1);
  });

  it("clearSession: FORBIDDEN for another analyst's session and nothing is deleted", async () => {
    state.results = [[{ userId: 2 }]];
    await expect(caller(3).hybridrag.clearSession({ sessionId: "s1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.deletes).toHaveLength(0);
  });

  it("clearSession: admin clearing is audited as hybridrag.clearSession", async () => {
    await caller(9, "admin").hybridrag.clearSession({ sessionId: "s1" });
    expect(state.deletes).toEqual([ragSessions]);
    expect(audits()[0]).toMatchObject({ userId: 9, action: "hybridrag.clearSession", targetId: "s1" });
  });

  it("chat: FORBIDDEN (before any LLM call) when writing into another analyst's session", async () => {
    state.results = [[{ userId: 2 }]];
    await expect(
      caller(3).hybridrag.chat({ sessionId: "victim", message: "hi", injectWazuhContext: false }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.inserts).toHaveLength(0);
  });
});

// ── H-A4: analyst notes ────────────────────────────────────────────────────────
describe("hybridrag.notes ownership", () => {
  it("update: legacy NULL-owner note is FORBIDDEN to a non-admin (no `!== null` fail-open)", async () => {
    state.results = [[{ createdBy: null }]];
    await expect(caller(3).hybridrag.notes.update({ id: 1, title: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.updates).toHaveLength(0);
  });

  it("delete: another analyst's note is FORBIDDEN", async () => {
    state.results = [[{ createdBy: 2 }]];
    await expect(caller(3).hybridrag.notes.delete({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.deletes).toHaveLength(0);
  });

  it("update by owner is audited as notes.update", async () => {
    state.results = [[{ createdBy: 3 }]];
    await caller(3).hybridrag.notes.update({ id: 5, title: "x" });
    expect(state.updates.map((u) => u.table)).toEqual([analystNotes]);
    expect(audits()[0]).toMatchObject({ userId: 3, action: "notes.update", targetId: "5" });
  });

  it("admin may delete a legacy note (audited as notes.delete)", async () => {
    state.results = [[{ createdBy: null }]];
    await caller(9, "admin").hybridrag.notes.delete({ id: 5 });
    expect(audits()[0]).toMatchObject({ userId: 9, action: "notes.delete" });
  });

  it("getById is team-readable", async () => {
    state.results = [[{ id: 5, createdBy: 2 }]];
    await expect(caller(3).hybridrag.notes.getById({ id: 5 })).resolves.toMatchObject({ id: 5 });
  });
});

// ── H-A5: alertQueue.remove ────────────────────────────────────────────────────
describe("alertQueue.remove", () => {
  it("FORBIDDEN for an analyst who did not queue the item", async () => {
    state.results = [[{ queuedBy: 2, status: "queued", alertId: "A" }]];
    await expect(caller(3).alertQueue.remove({ id: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.updates).toHaveLength(0);
    expect(audits()).toHaveLength(0);
  });

  it("auto-queued items (queuedBy NULL) are team-owned: any analyst may dismiss, audited", async () => {
    state.results = [[{ queuedBy: null, status: "queued", alertId: "A" }]];
    await expect(caller(3).alertQueue.remove({ id: 7 })).resolves.toEqual({ success: true });
    expect(audits()[0]).toMatchObject({ userId: 3, action: "alertQueue.remove", targetId: "7", metadata: { priorStatus: "queued", queuedBy: null } });
  });

  it("human-queued items belong to their queuer: another analyst is FORBIDDEN", async () => {
    state.results = [[{ queuedBy: 2, status: "queued", alertId: "A" }]];
    await expect(caller(3).alertQueue.remove({ id: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("owner may dismiss; audited with prior status", async () => {
    state.results = [[{ queuedBy: 3, status: "triaged", alertId: "A" }]];
    await expect(caller(3).alertQueue.remove({ id: 7 })).resolves.toEqual({ success: true });
    expect(state.updates[0]).toMatchObject({ table: alertQueue, set: { status: "dismissed" } });
    expect(audits()[0]).toMatchObject({ userId: 3, action: "alertQueue.remove", targetId: "7", metadata: { priorStatus: "triaged" } });
  });

  it("NOT_FOUND for a missing item", async () => {
    state.results = [[]];
    await expect(caller(3).alertQueue.remove({ id: 7 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ── H-A5: pipeline.submitFeedback ──────────────────────────────────────────────
describe("pipeline.submitFeedback", () => {
  const signedOff = { id: 1, triageId: "t1", analystUserId: 2, analystConfirmed: 1, analystSeverityOverride: "high", analystRouteOverride: null };

  it("FORBIDDEN when another analyst already signed off", async () => {
    state.results = [[signedOff]];
    await expect(
      caller(3).pipeline.submitFeedback({ triageId: "t1", severityOverride: "info" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.updates).toHaveLength(0);
  });

  it("admin may override; audit records before/after severity + confirmed", async () => {
    state.results = [[signedOff]];
    await caller(9, "admin").pipeline.submitFeedback({ triageId: "t1", severityOverride: "info", confirmed: false });
    expect(state.updates[0].table).toBe(triageObjects);
    expect(audits()[0]).toMatchObject({
      userId: 9,
      action: "pipeline.submitFeedback",
      targetId: "t1",
      metadata: {
        before: { analystUserId: 2, confirmed: 1, severityOverride: "high" },
        after: { confirmed: 0, severityOverride: "info" },
        overrodeOtherAnalyst: true,
      },
    });
  });

  it("first sign-off (no prior analyst) is allowed for any analyst", async () => {
    state.results = [[{ ...signedOff, analystUserId: null }]];
    await expect(caller(3).pipeline.submitFeedback({ triageId: "t1", confirmed: true })).resolves.toMatchObject({ success: true });
    expect(audits()).toHaveLength(1);
  });
});

// ── C9: generateHypothesis existingSessionId ownership ────────────────────────
describe("pipeline.generateHypothesis", () => {
  it("FORBIDDEN merging into another analyst's investigation session", async () => {
    state.results = [[{ userId: 2 }]];
    await expect(
      caller(3).pipeline.generateHypothesis({ correlationId: "c1", existingSessionId: 11 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("FORBIDDEN (same error) for a non-existent session — no existence oracle", async () => {
    state.results = [[]];
    await expect(
      caller(3).pipeline.generateHypothesis({ correlationId: "c1", existingSessionId: 11 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admins cannot write into another analyst's session either (read-only)", async () => {
    state.results = [[{ userId: 2 }]];
    await expect(
      caller(9, "admin").pipeline.generateHypothesis({ correlationId: "c1", existingSessionId: 11 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ── H-A5: recordPivot audits every pivot ─────────────────────────────────────
describe("pipeline.recordPivot", () => {
  it("audits the pivot as pipeline.recordPivot (team-global write)", async () => {
    state.results = [[{ id: 4, sessionId: 8, caseData: { completedPivots: [] } }]];
    await expect(
      caller(3).pipeline.recordPivot({ caseId: 4, action: "check host", finding: "clean", impactedTheory: false }),
    ).resolves.toMatchObject({ success: true, pivotCount: 1 });
    expect(audits()[0]).toMatchObject({ userId: 3, action: "pipeline.recordPivot", targetType: "living_case", targetId: "4" });
  });
});

// ── P2-8/M12: bulkApprove bound to one case ───────────────────────────────────
describe("responseActions.bulkApprove", () => {
  it("BAD_REQUEST listing actionIds not in the given case; nothing transitioned or audited", async () => {
    state.results = [[{ actionId: "a", caseId: 1 }, { actionId: "b", caseId: 2 }]];
    const err = await caller(9, "admin").responseActions
      .bulkApprove({ caseId: 1, actionIds: ["a", "b", "c"] })
      .catch((e) => e);
    expect(err).toMatchObject({ code: "BAD_REQUEST" });
    expect(String(err.message)).toContain("b, c");
    expect(String(err.message)).not.toMatch(/\ba,/);
    expect(audits()).toHaveLength(0);
  });

  it("requires caseId", async () => {
    await expect(
      caller(9, "admin").responseActions.bulkApprove({ actionIds: ["a"] } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

// ── H-A5: autoQueue rule CRUD stays admin-only ────────────────────────────────
describe("autoQueue CRUD", () => {
  it("non-admin update/delete remain FORBIDDEN", async () => {
    await expect(caller(3).autoQueue.update({ id: 1, enabled: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller(3).autoQueue.delete({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("admin update is audited with the rule id and a before/after diff of changed fields only", async () => {
    state.results = [[{ id: 1, name: "r", enabled: 1, maxPerHour: 10 }]];
    await caller(9, "admin").autoQueue.update({ id: 1, enabled: false, maxPerHour: 10 });
    expect(audits()[0]).toMatchObject({
      userId: 9, action: "autoQueue.update", targetType: "auto_queue_rule", targetId: "1",
      metadata: { diff: { enabled: { before: 1, after: 0 } } },
    });
    expect((audits()[0].metadata as { diff: Record<string, unknown> }).diff).not.toHaveProperty("maxPerHour");
  });

  it("admin delete is audited with the deleted rule snapshot", async () => {
    state.results = [[{ id: 2, name: "gone" }]];
    await caller(9, "admin").autoQueue.delete({ id: 2 });
    expect(audits()[0]).toMatchObject({ action: "autoQueue.delete", targetId: "2", metadata: { before: { name: "gone" } } });
  });

  it("admin create is audited", async () => {
    await caller(9, "admin").autoQueue.create({ name: "new", enabled: false });
    expect(audits()[0]).toMatchObject({ action: "autoQueue.create", targetType: "auto_queue_rule" });
  });
});

// ── M9: ticket artifact rawResponse is admin-only ────────────────────────────
describe("splunk.getTicketArtifact rawResponse", () => {
  const artifact = { id: 1, ticketId: "T", rawResponse: { message: "upstream detail" } };
  it("non-admin gets rawResponse null + rawResponseRedacted", async () => {
    state.results = [[artifact]];
    await expect(caller(3).splunk.getTicketArtifact({ id: 1 })).resolves.toMatchObject({ rawResponse: null, rawResponseRedacted: true });
  });
  it("admin gets the raw response", async () => {
    state.results = [[artifact]];
    await expect(caller(9, "admin").splunk.getTicketArtifact({ id: 1 })).resolves.toMatchObject({
      rawResponse: { message: "upstream detail" }, rawResponseRedacted: false,
    });
  });
  it("listTicketArtifacts redacts each row for non-admins", async () => {
    state.results = [[artifact], [{ total: 1 }]];
    const r = await caller(3).splunk.listTicketArtifacts({});
    expect(r.artifacts[0]).toMatchObject({ rawResponse: null, rawResponseRedacted: true });
  });
});

// ── Source-level guarantees that need a real DB to exercise ──────────────────
describe("source checks (DB-only paths)", async () => {
  const { readFileSync } = await import("fs");
  const { resolve } = await import("path");
  const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf-8");

  it("C9: hypothesisAgent existingSessionId lookup is owner-scoped and new sessions are never unattributed", () => {
    const src = read("server/agenticPipeline/hypothesisAgent.ts");
    const resolveFn = src.slice(src.indexOf("async function resolveSession("), src.indexOf("CR-8: Entity overlap validation"));
    expect(resolveFn).toMatch(/eq\(investigationSessions\.id, existingSessionId\),\s*eq\(investigationSessions\.userId, userId\)/);
    expect(resolveFn).not.toContain("...(userId ? { userId } : {})");
    expect(resolveFn).toMatch(/\n\s*userId,\n/);
    expect(src).toMatch(/\n  userId: number;\n\}/); // HypothesisAgentInput.userId is required
  });

  it("H-A4: notes.list defaults to own notes; includeTeam opts into team-global read", () => {
    const src = read("server/hybridrag/hybridragRouter.ts");
    expect(src).toContain("includeTeam: z.boolean().default(false)");
    expect(src).toContain("if (!input.includeTeam) conditions.push(eq(analystNotes.createdBy, ctx.user.id));");
    expect(src).not.toContain("createdBy !== null &&");
  });

  it("H-A4: chat stamps userId on both persisted turns", () => {
    const src = read("server/hybridrag/hybridragRouter.ts");
    expect(src.match(/userId: ctx\.user\.id,/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("M8: live Wazuh telemetry in the system prompt is wrapped as untrusted data", () => {
    const src = read("server/hybridrag/hybridragRouter.ts");
    const fn = src.slice(src.indexOf("async function buildWazuhContext"), src.indexOf("// ── RAG session ownership"));
    expect(fn).toContain("wrapUntrustedData(data)");
    expect(fn).not.toContain("JSON.stringify(data");
  });
});
