/**
 * H-L5 / M9 tests for the process-wide LLM dispatcher.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let dbTotal = 0;
let dbQueries = 0;
vi.mock("../db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({
      from: () => ({
        where: async () => {
          dbQueries++;
          return [{ total: dbTotal }];
        },
      }),
    }),
  })),
}));

const {
  dispatchLLM,
  getDispatcherStats,
  getTodayTokens,
  __resetDispatcherForTests,
  countPromptChars,
} = await import("./llmDispatcher");
const { resolveMaxTokens } = await import("../_core/llm");

const ENV_KEYS = [
  "LLM_MAX_CONCURRENT",
  "LLM_QUEUE_TIMEOUT_MS",
  "LLM_MAX_PER_USER_INFLIGHT",
  "LLM_DAILY_TOKEN_BUDGET",
  "LLM_MAX_PROMPT_CHARS",
  "LLM_MAX_OUTPUT_TOKENS",
];
const saved: Record<string, string | undefined> = {};

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const tick = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  dbTotal = 0;
  dbQueries = 0;
  __resetDispatcherForTests();
});

afterEach(() => {
  __resetDispatcherForTests();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("llmDispatcher — concurrency", () => {
  it("defaults to 2 concurrent calls and queues the rest FIFO", async () => {
    const gates = [deferred(), deferred(), deferred()];
    const order: number[] = [];
    const runs = gates.map((g, i) =>
      dispatchLLM({ stage: `s${i}` }, async () => { order.push(i); await g.promise; return i; })
    );
    await tick();
    let stats = await getDispatcherStats();
    expect(stats.inflight).toBe(2);
    expect(stats.queued).toBe(1);
    expect(order).toEqual([0, 1]);

    gates[0].resolve();
    await tick(); await tick();
    expect(order).toEqual([0, 1, 2]);
    gates[1].resolve(); gates[2].resolve();
    expect(await Promise.all(runs)).toEqual([0, 1, 2]);
    stats = await getDispatcherStats();
    expect(stats.inflight).toBe(0);
    expect(stats.queued).toBe(0);
  });

  it("releases the slot when the call throws", async () => {
    process.env.LLM_MAX_CONCURRENT = "1";
    await expect(dispatchLLM({}, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await dispatchLLM({}, async () => "ok")).toBe("ok");
    expect((await getDispatcherStats()).inflight).toBe(0);
  });

  it("rejects with TOO_MANY_REQUESTS after the queue-wait timeout", async () => {
    process.env.LLM_MAX_CONCURRENT = "1";
    process.env.LLM_QUEUE_TIMEOUT_MS = "30";
    const gate = deferred();
    const first = dispatchLLM({ stage: "first" }, () => gate.promise);
    await tick();
    const err = await dispatchLLM({ stage: "triage_agent" }, async () => "never").catch(e => e);
    expect(err.code).toBe("TOO_MANY_REQUESTS");
    expect(err.message).toContain("triage_agent");
    expect((await getDispatcherStats()).queued).toBe(0);
    gate.resolve();
    await first;
  });
});

describe("llmDispatcher — per-user fairness", () => {
  it("allows at most 1 in flight per user by default, while other users proceed", async () => {
    process.env.LLM_MAX_CONCURRENT = "3";
    const g1 = deferred();
    const started: string[] = [];
    const a1 = dispatchLLM({ userId: 7 }, async () => { started.push("a1"); await g1.promise; });
    const a2 = dispatchLLM({ userId: 7 }, async () => { started.push("a2"); });
    const b1 = dispatchLLM({ userId: 8 }, async () => { started.push("b1"); });
    const anon = dispatchLLM({}, async () => { started.push("anon"); });
    await tick(); await tick();
    // a2 is blocked behind a1 (same user), but b1 and anon are not blocked by a2.
    expect(started).toContain("a1");
    expect(started).toContain("b1");
    expect(started).toContain("anon");
    expect(started).not.toContain("a2");
    g1.resolve();
    await Promise.all([a1, a2, b1, anon]);
    expect(started).toContain("a2");
  });
});

describe("llmDispatcher — daily token budget", () => {
  it("throws PRECONDITION_FAILED with remaining/limit when today's usage is over budget", async () => {
    process.env.LLM_DAILY_TOKEN_BUDGET = "1000";
    dbTotal = 1500;
    const fn = vi.fn(async () => "x");
    const err = await dispatchLLM({ stage: "hypothesis_agent" }, fn).catch(e => e);
    expect(err.code).toBe("PRECONDITION_FAILED");
    expect(err.message).toContain("1000");
    expect(err.message).toMatch(/remaining 0/);
    expect(err.message).toContain("hypothesis_agent");
    expect(fn).not.toHaveBeenCalled();
  });

  it("0 means unlimited", async () => {
    process.env.LLM_DAILY_TOKEN_BUDGET = "0";
    dbTotal = 10_000_000_000;
    expect(await dispatchLLM({}, async () => "ok")).toBe("ok");
  });

  it("caches today's sum for 60 s and adds tokens observed since", async () => {
    process.env.LLM_DAILY_TOKEN_BUDGET = "1000";
    dbTotal = 100;
    await dispatchLLM({}, async () => ({ t: 950 }), r => r.t);
    const queriesAfterFirst = dbQueries;
    // Cached value is now 100 + 950 = 1050 → over budget without a new DB read.
    const err = await dispatchLLM({}, async () => "x").catch(e => e);
    expect(err.code).toBe("PRECONDITION_FAILED");
    expect(dbQueries).toBe(queriesAfterFirst);
    expect(await getTodayTokens()).toBe(1050);
    // After 60 s the DB is re-read.
    dbTotal = 0;
    expect(await getTodayTokens(Date.now() + 61_000)).toBe(0);
  });

  it("stats report todayTokens, budget and remaining", async () => {
    process.env.LLM_DAILY_TOKEN_BUDGET = "5000";
    dbTotal = 1200;
    const stats = await getDispatcherStats();
    expect(stats.todayTokens).toBe(1200);
    expect(stats.budget).toBe(5000);
    expect(stats.remaining).toBe(3800);
    expect(stats.maxConcurrent).toBe(2);
  });

  it("defaults the budget to 5,000,000", async () => {
    expect((await getDispatcherStats()).budget).toBe(5_000_000);
  });
});

describe("llmDispatcher — prompt budget (M9)", () => {
  it("rejects prompts over LLM_MAX_PROMPT_CHARS naming the stage", async () => {
    process.env.LLM_MAX_PROMPT_CHARS = "100";
    const fn = vi.fn(async () => "x");
    const err = await dispatchLLM(
      { stage: "correlation_agent", messages: [{ content: "a".repeat(60) }, { content: "b".repeat(60) }] },
      fn,
    ).catch(e => e);
    expect(err.code).toBe("PAYLOAD_TOO_LARGE");
    expect(err.message).toContain("correlation_agent");
    expect(err.message).toContain("120");
    expect(fn).not.toHaveBeenCalled();
  });

  it("defaults to 120,000 chars", async () => {
    expect((await getDispatcherStats()).maxPromptChars).toBe(120_000);
    expect(countPromptChars([{ content: "abc" }, { content: [{ type: "text", text: "x" }] }])).toBeGreaterThan(3);
  });
});

describe("_core/llm resolveMaxTokens (M9)", () => {
  it("honors the caller's request, capped by LLM_MAX_OUTPUT_TOKENS", () => {
    expect(resolveMaxTokens({})).toBe(32768);
    expect(resolveMaxTokens({ maxTokens: 1024 })).toBe(1024);
    expect(resolveMaxTokens({ max_tokens: 2048 })).toBe(2048);
    expect(resolveMaxTokens({ maxTokens: 999_999 })).toBe(32768);
    process.env.LLM_MAX_OUTPUT_TOKENS = "4096";
    expect(resolveMaxTokens({})).toBe(4096);
    expect(resolveMaxTokens({ maxTokens: 8192 })).toBe(4096);
    expect(resolveMaxTokens({ maxTokens: -5 })).toBe(4096);
  });
});
