/**
 * M6 poison-alert guard — bounded auto-triage attempts.
 */
import { describe, it, expect, vi } from "vitest";
import {
  parseMaxTriageAttempts,
  nextTriageFailureState,
  isTriageHistoryExhausted,
  recordAutoTriageFailure,
  DEFAULT_MAX_TRIAGE_ATTEMPTS,
  MAX_TRIAGE_ATTEMPTS,
} from "./triageAttempts";
import { analystActionAudit, alertQueue } from "../../drizzle/schema";

describe("MAX_TRIAGE_ATTEMPTS", () => {
  it("defaults to 3", () => {
    expect(DEFAULT_MAX_TRIAGE_ATTEMPTS).toBe(3);
    if (process.env.MAX_TRIAGE_ATTEMPTS === undefined) expect(MAX_TRIAGE_ATTEMPTS).toBe(3);
  });
  it("is env-overridable within 1..100 and ignores junk", () => {
    expect(parseMaxTriageAttempts("5")).toBe(5);
    expect(parseMaxTriageAttempts("1")).toBe(1);
    expect(parseMaxTriageAttempts("0")).toBe(3);
    expect(parseMaxTriageAttempts("-2")).toBe(3);
    expect(parseMaxTriageAttempts("2.5")).toBe(3);
    expect(parseMaxTriageAttempts("abc")).toBe(3);
    expect(parseMaxTriageAttempts("1000")).toBe(3);
    expect(parseMaxTriageAttempts(undefined)).toBe(3);
  });
});

describe("nextTriageFailureState", () => {
  it("releases back to queued/failed below the cap", () => {
    expect(nextTriageFailureState(0, 3)).toEqual({ triageAttempts: 1, autoTriageStatus: "failed", status: "queued", exhausted: false });
    expect(nextTriageFailureState(1, 3)).toEqual({ triageAttempts: 2, autoTriageStatus: "failed", status: "queued", exhausted: false });
  });
  it("parks the item as failed/exhausted on reaching the cap", () => {
    expect(nextTriageFailureState(2, 3)).toEqual({ triageAttempts: 3, autoTriageStatus: "exhausted", status: "failed", exhausted: true });
    expect(nextTriageFailureState(7, 3).exhausted).toBe(true);
  });
  it("treats null attempts (legacy) as 0", () => {
    expect(nextTriageFailureState(null, 3).triageAttempts).toBe(1);
  });
});

describe("isTriageHistoryExhausted (lifecycle-aware re-enqueue dedup)", () => {
  it("blocks when any prior row is exhausted or attempts reached the cap", () => {
    expect(isTriageHistoryExhausted({ maxAttempts: 0, exhaustedRows: 1 }, 3)).toBe(true);
    expect(isTriageHistoryExhausted({ maxAttempts: 3, exhaustedRows: 0 }, 3)).toBe(true);
    expect(isTriageHistoryExhausted({ maxAttempts: 2, exhaustedRows: 0 }, 3)).toBe(false);
  });
});

function makeDb(opts: { attempts: number; affectedRows: number }) {
  const inserted: Array<{ table: unknown; row: unknown }> = [];
  const updates: unknown[] = [];
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ triageAttempts: opts.attempts, alertId: "A-1" }] }) }) }),
    update: (table: unknown) => ({
      set: (v: unknown) => { updates.push({ table, v }); return { where: async () => [{ affectedRows: opts.affectedRows }] }; },
    }),
    insert: (table: unknown) => ({ values: async (row: unknown) => { inserted.push({ table, row }); return [{}]; } }),
  };
  return { db: db as never, inserted, updates };
}

describe("recordAutoTriageFailure", () => {
  it("increments attempts and releases to queued without auditing below the cap", async () => {
    const { db, inserted, updates } = makeDb({ attempts: 0, affectedRows: 1 });
    const r = await recordAutoTriageFailure(db, 10, { actorUserId: 4, source: "test" });
    expect(r).toEqual({ released: true, exhausted: false, attempts: 1 });
    expect(updates[0]).toEqual({ table: alertQueue, v: { autoTriageStatus: "failed", status: "queued", triageAttempts: 1 } });
    expect(inserted).toHaveLength(0);
  });

  it("parks + audits 'alertQueue.triageExhausted' on reaching the cap", async () => {
    const { db, inserted, updates } = makeDb({ attempts: MAX_TRIAGE_ATTEMPTS - 1, affectedRows: 1 });
    const r = await recordAutoTriageFailure(db, 10, { actorUserId: 4, source: "test", error: "LLM 500" });
    expect(r.exhausted).toBe(true);
    expect((updates[0] as { v: Record<string, unknown> }).v).toMatchObject({ autoTriageStatus: "exhausted", status: "failed" });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].table).toBe(analystActionAudit);
    expect(inserted[0].row).toMatchObject({ userId: 4, action: "alertQueue.triageExhausted", targetType: "alert_queue", targetId: "10" });
  });

  it("does not audit when the claim was lost (item left 'processing')", async () => {
    const { db, inserted } = makeDb({ attempts: MAX_TRIAGE_ATTEMPTS - 1, affectedRows: 0 });
    const r = await recordAutoTriageFailure(db, 10, { actorUserId: 4, source: "test" });
    expect(r.released).toBe(false);
    expect(inserted).toHaveLength(0);
  });

  it("never-claim guards: autoTriageAllPending claims only 'pending'; enqueue + poller consult the history", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const root = resolve(__dirname, "../..");
    const pipe = readFileSync(resolve(root, "server/agenticPipeline/pipelineRouter.ts"), "utf-8");
    const bulk = pipe.slice(pipe.indexOf("autoTriageAllPending: protectedProcedure"), pipe.indexOf("runFullPipeline: protectedProcedure"));
    expect(bulk).toContain('eq(alertQueue.autoTriageStatus, "pending")');
    expect(bulk).toContain("recordAutoTriageFailure(db, item.id");
    expect(bulk).toContain("triageAttempts: 0");
    expect(bulk).not.toMatch(/\.set\(\{ autoTriageStatus: "failed", status: "queued" \}\)/);
    const single = pipe.slice(pipe.indexOf("autoTriageQueueItem: protectedProcedure"), pipe.indexOf("getAutoTriageStatus:"));
    // exhausted ⇒ status 'failed', which the claim's status==='queued' guard already rejects
    expect(single).toContain('if (item.status !== "queued") return { claimed: false as const, reason: "not_queued"');
    expect(single).toContain("recordAutoTriageFailure(db, input.queueItemId");
    expect(single).toContain("triageAttempts: 0");
    const poller = readFileSync(resolve(root, "server/alertQueue/autoQueueRouter.ts"), "utf-8");
    expect(poller).toMatch(/isTriageHistoryExhausted\(history\)\) \{\s*result\.skipped\+\+;/);
    expect(poller).toContain("triageAttempts: history.maxAttempts");
    const queue = readFileSync(resolve(root, "server/alertQueue/alertQueueRouter.ts"), "utf-8");
    expect(queue).toContain("isTriageHistoryExhausted(history)");
    expect(queue).toContain("triageAttempts: inheritedAttempts");
  });
});
