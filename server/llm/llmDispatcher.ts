/**
 * LLM Dispatcher — H-L5 (CODE_REVIEW_2026-10-21 §5.3) + M9 prompt budget.
 *
 * Process-wide bound on live LLM spend. Every call through
 * `invokeLLMWithFallback` (server/llm/llmService.ts) — pipeline agents,
 * enhancedLLM, HybridRAG chat — acquires a slot here first.
 *
 *  - LLM_MAX_CONCURRENT          (default 2)        max calls in flight
 *  - LLM_QUEUE_TIMEOUT_MS        (default 120000)   max queue wait → TOO_MANY_REQUESTS
 *  - LLM_MAX_PER_USER_INFLIGHT   (default 1)        per-userId in-flight cap (when userId given)
 *  - LLM_DAILY_TOKEN_BUDGET      (default 5000000; 0 = unlimited) → PRECONDITION_FAILED
 *  - LLM_MAX_PROMPT_CHARS        (default 120000)   total prompt chars → PAYLOAD_TOO_LARGE
 *
 * Queue is FIFO; a waiter whose user is already at the per-user cap is skipped
 * (not reordered) until that user's call finishes. The daily token sum comes
 * from `llm_usage` (today, server-local midnight like llmRouter.usageStats),
 * cached for 60 s, plus tokens observed by this process since the last refresh.
 *
 * Scope: process-local (one replica). Multi-replica deployments get N× the
 * concurrency, but the budget is read from the shared table.
 */
import { TRPCError } from "@trpc/server";
import { gte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { llmUsage } from "../../drizzle/schema";

// ── Config ──────────────────────────────────────────────────────────────────

function intEnv(name: string, def: number, min = 0): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return def;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= min ? n : def;
}

export function getDispatcherConfig() {
  return {
    maxConcurrent: intEnv("LLM_MAX_CONCURRENT", 2, 1),
    queueTimeoutMs: intEnv("LLM_QUEUE_TIMEOUT_MS", 120_000, 1),
    maxPerUserInflight: intEnv("LLM_MAX_PER_USER_INFLIGHT", 1, 1),
    dailyTokenBudget: intEnv("LLM_DAILY_TOKEN_BUDGET", 5_000_000, 0),
    maxPromptChars: intEnv("LLM_MAX_PROMPT_CHARS", 120_000, 1),
  };
}

export const TODAY_TOKENS_CACHE_MS = 60_000;

// ── State ───────────────────────────────────────────────────────────────────

interface Waiter {
  userKey: string | null;
  stage: string;
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
  enqueuedAt: number;
}

let inflight = 0;
const perUserInflight = new Map<string, number>();
const queue: Waiter[] = [];

let todayCache: { dayStart: number; tokens: number; fetchedAt: number } | null = null;
let todayFetch: Promise<number> | null = null;

let rejectedQueueTimeout = 0;
let rejectedBudget = 0;
let rejectedPromptSize = 0;

// ── Helpers ─────────────────────────────────────────────────────────────────

function startOfToday(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function userKeyOf(userId: unknown): string | null {
  if (userId === undefined || userId === null || userId === "") return null;
  return String(userId);
}

function canRun(userKey: string | null, cfg = getDispatcherConfig()): boolean {
  if (inflight >= cfg.maxConcurrent) return false;
  if (userKey !== null && (perUserInflight.get(userKey) ?? 0) >= cfg.maxPerUserInflight) return false;
  return true;
}

function acquire(userKey: string | null): void {
  inflight++;
  if (userKey !== null) perUserInflight.set(userKey, (perUserInflight.get(userKey) ?? 0) + 1);
}

function release(userKey: string | null): void {
  inflight = Math.max(0, inflight - 1);
  if (userKey !== null) {
    const n = (perUserInflight.get(userKey) ?? 1) - 1;
    if (n <= 0) perUserInflight.delete(userKey);
    else perUserInflight.set(userKey, n);
  }
  pump();
}

/** Start every waiter that can run, in FIFO order (skipping users at their cap). */
function pump(): void {
  const cfg = getDispatcherConfig();
  for (let i = 0; i < queue.length && inflight < cfg.maxConcurrent; ) {
    const w = queue[i];
    if (canRun(w.userKey, cfg)) {
      queue.splice(i, 1);
      if (w.timer) clearTimeout(w.timer);
      acquire(w.userKey);
      w.resolve();
    } else {
      i++;
    }
  }
}

function waitForSlot(userKey: string | null, stage: string): Promise<void> {
  const cfg = getDispatcherConfig();
  // Fast path only when nobody is waiting (preserves FIFO).
  if (queue.length === 0 && canRun(userKey, cfg)) {
    acquire(userKey);
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const waiter: Waiter = { userKey, stage, resolve, reject, timer: null, enqueuedAt: Date.now() };
    waiter.timer = setTimeout(() => {
      const idx = queue.indexOf(waiter);
      if (idx >= 0) queue.splice(idx, 1);
      rejectedQueueTimeout++;
      reject(new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `LLM queue wait exceeded ${cfg.queueTimeoutMs} ms for stage "${stage}" (in flight: ${inflight}, queued: ${queue.length}). Try again later.`,
      }));
    }, cfg.queueTimeoutMs);
    // Don't keep the process alive just for a queued LLM request.
    (waiter.timer as { unref?: () => void }).unref?.();
    queue.push(waiter);
    pump();
  });
}

// ── Token budget ────────────────────────────────────────────────────────────

async function queryTodayTokens(dayStart: Date): Promise<number> {
  try {
    const db = await getDb();
    if (!db) return 0;
    const rows = await db
      .select({ total: sql<number>`COALESCE(SUM(${llmUsage.totalTokens}), 0)` })
      .from(llmUsage)
      .where(gte(llmUsage.createdAt, dayStart));
    const n = Number((rows as Array<{ total?: unknown }>)[0]?.total ?? 0);
    return Number.isFinite(n) ? n : 0;
  } catch (err) {
    // Fail open on telemetry outage: usage logging would be failing too, and
    // blocking every LLM call on a DB hiccup is worse. Logged for operators.
    console.warn(`[LLMDispatcher] Could not read today's llm_usage total: ${(err as Error).message}`);
    return todayCache?.tokens ?? 0;
  }
}

/** Today's total tokens (llm_usage sum, cached 60 s, plus tokens seen since). */
export async function getTodayTokens(now = Date.now()): Promise<number> {
  const dayStart = startOfToday(new Date(now)).getTime();
  if (todayCache && todayCache.dayStart === dayStart && now - todayCache.fetchedAt < TODAY_TOKENS_CACHE_MS) {
    return todayCache.tokens;
  }
  if (!todayFetch) {
    todayFetch = queryTodayTokens(new Date(dayStart))
      .then(tokens => {
        todayCache = { dayStart, tokens, fetchedAt: Date.now() };
        return tokens;
      })
      .finally(() => { todayFetch = null; });
  }
  return todayFetch;
}

/** Account tokens consumed by a completed call (keeps the cache honest between refreshes). */
export function recordDispatcherUsage(tokens: number): void {
  if (!Number.isFinite(tokens) || tokens <= 0) return;
  if (todayCache && todayCache.dayStart === startOfToday().getTime()) {
    todayCache.tokens += tokens;
  }
}

async function assertBudget(stage: string): Promise<void> {
  const { dailyTokenBudget } = getDispatcherConfig();
  if (dailyTokenBudget <= 0) return; // 0 = unlimited
  const used = await getTodayTokens();
  if (used >= dailyTokenBudget) {
    rejectedBudget++;
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Daily LLM token budget exhausted for stage "${stage}": used ${used} of ${dailyTokenBudget} tokens (remaining ${Math.max(0, dailyTokenBudget - used)}). Resets at local midnight; raise LLM_DAILY_TOKEN_BUDGET to change.`,
    });
  }
}

// ── Prompt budget (M9) ──────────────────────────────────────────────────────

export function countPromptChars(messages: ReadonlyArray<{ content: unknown }> | undefined): number {
  if (!messages) return 0;
  let total = 0;
  for (const m of messages) {
    const c = m?.content;
    if (typeof c === "string") total += c.length;
    else if (c !== undefined && c !== null) total += (JSON.stringify(c) ?? "").length;
  }
  return total;
}

export function assertPromptBudget(messages: ReadonlyArray<{ content: unknown }> | undefined, stage: string): void {
  const { maxPromptChars } = getDispatcherConfig();
  const chars = countPromptChars(messages);
  if (chars > maxPromptChars) {
    rejectedPromptSize++;
    throw new TRPCError({
      code: "PAYLOAD_TOO_LARGE",
      message: `LLM prompt for stage "${stage}" is ${chars} chars, over the ${maxPromptChars}-char budget (LLM_MAX_PROMPT_CHARS).`,
    });
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface DispatchOptions {
  /** Caller/stage label, used in error messages. */
  stage?: string;
  /** Triggering user; enables the per-user in-flight cap. */
  userId?: number | string;
  /** Messages, for the prompt-size budget. */
  messages?: ReadonlyArray<{ content: unknown }>;
}

/**
 * Run `fn` under the dispatcher: prompt budget → token budget → slot (FIFO,
 * per-user cap, queue timeout) → token budget re-check → fn → release.
 * `tokensOf` extracts total tokens from the result to keep the budget current.
 */
export async function dispatchLLM<T>(
  opts: DispatchOptions,
  fn: () => Promise<T>,
  tokensOf?: (result: T) => number,
): Promise<T> {
  const stage = opts.stage || "unknown";
  assertPromptBudget(opts.messages, stage);
  await assertBudget(stage);

  const userKey = userKeyOf(opts.userId);
  await waitForSlot(userKey, stage);
  try {
    // The wait may have been long — re-check (cheap, cached).
    await assertBudget(stage);
    const result = await fn();
    if (tokensOf) {
      try { recordDispatcherUsage(tokensOf(result)); } catch { /* ignore */ }
    }
    return result;
  } finally {
    release(userKey);
  }
}

export interface DispatcherStats {
  inflight: number;
  queued: number;
  perUserInflight: number;
  maxConcurrent: number;
  maxPerUserInflight: number;
  queueTimeoutMs: number;
  maxPromptChars: number;
  todayTokens: number;
  /** 0 = unlimited */
  budget: number;
  remaining: number | null;
  rejected: { queueTimeout: number; budget: number; promptSize: number };
}

export async function getDispatcherStats(): Promise<DispatcherStats> {
  const cfg = getDispatcherConfig();
  const todayTokens = await getTodayTokens();
  return {
    inflight,
    queued: queue.length,
    perUserInflight: perUserInflight.size,
    maxConcurrent: cfg.maxConcurrent,
    maxPerUserInflight: cfg.maxPerUserInflight,
    queueTimeoutMs: cfg.queueTimeoutMs,
    maxPromptChars: cfg.maxPromptChars,
    todayTokens,
    budget: cfg.dailyTokenBudget,
    remaining: cfg.dailyTokenBudget > 0 ? Math.max(0, cfg.dailyTokenBudget - todayTokens) : null,
    rejected: { queueTimeout: rejectedQueueTimeout, budget: rejectedBudget, promptSize: rejectedPromptSize },
  };
}

/** Test-only: reset all dispatcher state. */
export function __resetDispatcherForTests(): void {
  for (const w of queue.splice(0)) {
    if (w.timer) clearTimeout(w.timer);
    w.reject(new Error("dispatcher reset"));
  }
  inflight = 0;
  perUserInflight.clear();
  todayCache = null;
  todayFetch = null;
  rejectedQueueTimeout = 0;
  rejectedBudget = 0;
  rejectedPromptSize = 0;
}
