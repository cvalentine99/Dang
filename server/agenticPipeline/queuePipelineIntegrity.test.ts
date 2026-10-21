/**
 * Phase 1 queue + pipeline integrity regressions (CODE_REVIEW_2026-10-21 §4–§5):
 * C14, H-D2, H-L1, H-L6, H-L7, H-L10, H-C2 (server half) and the list FIELD() ordering.
 *
 * Source-level checks (the behavioural versions need a live MySQL; see the
 * HAS_DB-gated suites) plus pure unit tests of the shared write-guard helpers.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  getAffectedRows,
  assertRunLive,
  noteIfSuperseded,
  RunSupersededError,
  STALE_RUN_TTL_MS,
} from "./resumePipelineHelper";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf-8");

const queueSrc = read("server/alertQueue/alertQueueRouter.ts");
const autoQueueSrc = read("server/alertQueue/autoQueueRouter.ts");
const pipelineSrc = read("server/agenticPipeline/pipelineRouter.ts");
const resumeSrc = read("server/agenticPipeline/resumePipelineHelper.ts");
const corrSrc = read("server/agenticPipeline/correlationAgent.ts");

function slice(src: string, startMarker: string, endMarker: string): string {
  const a = src.indexOf(startMarker);
  expect(a, `marker not found: ${startMarker}`).toBeGreaterThan(-1);
  const b = src.indexOf(endMarker, a + startMarker.length);
  return src.slice(a, b === -1 ? undefined : b);
}

describe("write-guard helpers", () => {
  it("getAffectedRows reads mysql2 [header] and bare header shapes", () => {
    expect(getAffectedRows([{ affectedRows: 1 }, undefined])).toBe(1);
    expect(getAffectedRows({ affectedRows: 2 })).toBe(2);
    expect(getAffectedRows(undefined)).toBe(0);
    expect(getAffectedRows([])).toBe(0);
  });

  it("assertRunLive throws a typed RunSupersededError on 0 rows and passes on 1", () => {
    expect(() => assertRunLive([{ affectedRows: 1 }], "run-x", "triage:running")).not.toThrow();
    let caught: unknown;
    try { assertRunLive([{ affectedRows: 0 }], "run-x", "triage:running"); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(RunSupersededError);
    expect((caught as RunSupersededError).code).toBe("RUN_SUPERSEDED");
    expect((caught as RunSupersededError).runId).toBe("run-x");
  });

  it("noteIfSuperseded never throws and reports supersession", () => {
    expect(noteIfSuperseded([{ affectedRows: 0 }], "run-x", "f")).toBe(true);
    expect(noteIfSuperseded([{ affectedRows: 1 }], "run-x", "f")).toBe(false);
  });

  it("stale TTL is 15 minutes", () => {
    expect(STALE_RUN_TTL_MS).toBe(15 * 60 * 1000);
  });
});

describe("C14: claims advance status and guard on autoTriageStatus", () => {
  it("autoTriageQueueItem claim sets status=processing and guards queued + not running", () => {
    const body = slice(pipelineSrc, "autoTriageQueueItem: protectedProcedure", "getAutoTriageStatus:");
    expect(body).toMatch(/set\(\{ autoTriageStatus: "running", status: "processing", processedAt: new Date\(\) \}\)/);
    expect(body).toContain('eq(alertQueue.status, "queued")');
    expect(body).toContain("<> 'running'");
    expect(body).toMatch(/getAffectedRows\(claimRes\) === 0/);
  });

  it("autoTriageAllPending claim sets status=processing", () => {
    const body = slice(pipelineSrc, "autoTriageAllPending: protectedProcedure", "runFullPipeline: protectedProcedure");
    expect(body).toMatch(/set\(\{ autoTriageStatus: "running", status: "processing", processedAt: new Date\(\) \}\)/);
  });

  it("process claim guards on autoTriageStatus and uses affectedRows", () => {
    const body = slice(queueSrc, "process: protectedProcedure", "getTriageResult:");
    expect(body).toMatch(/eq\(alertQueue\.status, "queued"\), NOT_AUTO_TRIAGE_RUNNING/);
    expect(body).toContain("affectedRowsOf(claimResult) === 0");
  });

  it("eviction only considers queued items not mid auto-triage, and re-asserts it in the UPDATE", () => {
    const body = slice(queueSrc, "enqueue: protectedProcedure", "remove: protectedProcedure");
    expect(body).toContain('.where(and(eq(alertQueue.status, "queued"), NOT_AUTO_TRIAGE_RUNNING))');
    expect(body).toMatch(/set\(\{ status: "dismissed" \}\)\s*\.where\(and\(\s*eq\(alertQueue\.id, lowestPriority\.id\),\s*eq\(alertQueue\.status, "queued"\),\s*NOT_AUTO_TRIAGE_RUNNING/);
  });

  it("no queue write sets triaged/completed/failed with a bare WHERE id (no resurrection)", () => {
    const files = [queueSrc, pipelineSrc];
    for (const src of files) {
      const re = /\.update\(alertQueue\)[\s\S]*?\.where\(([^;]*?)\);/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const stmt = m[0];
        if (!/status: "(triaged|completed|failed)"/.test(stmt)) continue;
        expect(stmt, `unguarded terminal queue write:\n${stmt}`).toMatch(/inArray\(alertQueue\.status, \[/);
      }
    }
  });
});

describe("H-D2: stale autoTriageStatus='running' sweep", () => {
  it("resets running items older than the TTL to pending/queued, measured from processedAt", () => {
    const body = slice(resumeSrc, "export async function sweepStaleAutoTriage", "/** The stage names");
    expect(body).toContain('.set({ autoTriageStatus: "pending", status: "queued" })');
    expect(body).toContain('eq(alertQueue.autoTriageStatus, "running")');
    expect(body).toContain('inArray(alertQueue.status, ["queued", "processing"])');
    expect(body).toContain("COALESCE(${alertQueue.processedAt}, ${alertQueue.queuedAt}) < ${cutoff}");
  });

  it("runs wherever the pipeline_runs stale sweep runs", () => {
    expect(slice(pipelineSrc, "runFullPipeline: protectedProcedure", "getPipelineRun:")).toContain("await sweepStaleAutoTriage(db);");
    expect(resumeSrc).toMatch(/await sweepStaleAutoTriage\(db\);\s*\n\s*const \[resumedRow\] = await db\.transaction/);
  });
});

describe("H-L1: stale-run TTL scoped to the alert; stage writes guarded on status='running'", () => {
  it("runFullPipeline sweep includes AND alertId = ?", () => {
    const body = slice(pipelineSrc, "runFullPipeline: protectedProcedure", "getPipelineRun:");
    expect(body).toMatch(/eq\(pipelineRuns\.status, "running"\),\s*eq\(pipelineRuns\.alertId, alertId\),\s*lt\(pipelineRuns\.startedAt, staleCutoff\)/);
  });

  it("resume sweep is alert-scoped and skipped for unknown alertIds", () => {
    expect(resumeSrc).toContain("if (alertIdKnown) {");
    expect(resumeSrc).toMatch(/eq\(pipelineRuns\.alertId, alertIdVal\),\s*sql`\$\{pipelineRuns\.startedAt\} < \$\{staleCutoff\}`/);
  });

  it("every pipeline_runs write during a run is guarded and checked", () => {
    const runBody = slice(pipelineSrc, "runFullPipeline: protectedProcedure", "getPipelineRun:");
    const resumeBody = slice(resumeSrc, "let currentTriageId = originalRun.triageId;", "result.totalLatencyMs = Date.now() - startTime;\n  if (result.status");
    for (const [body, row] of [[runBody, "runRow"], [resumeBody, "resumedRow"]] as const) {
      expect(body).not.toContain(`.where(eq(pipelineRuns.id, ${row}.id))`);
      const guarded = body.match(new RegExp(`eq\\(pipelineRuns\\.id, ${row}\\.id\\), eq\\(pipelineRuns\\.status, "running"\\)`, "g")) ?? [];
      const checks = body.match(/(assertRunLive|noteIfSuperseded)\(runWrite\d+/g) ?? [];
      expect(guarded.length).toBeGreaterThan(5);
      expect(checks.length).toBe(guarded.length);
    }
  });

  it("superseded runs abort with no further writes", () => {
    expect(pipelineSrc.match(/if \(err instanceof RunSupersededError\) return \{ \.\.\.result, status: "superseded"/g)?.length).toBe(3);
    expect(resumeSrc.match(/if \(err instanceof RunSupersededError\) return abortSuperseded\(\);/g)?.length).toBe(4);
  });
});

describe("H-L6: resume atomically claims the original run", () => {
  it("claims via resumedByRunId IS NULL AND status IN (failed, partial) and CONFLICTs on 0 rows", () => {
    const tx = slice(resumeSrc, "const [resumedRow] = await db.transaction", "return tx.insert(pipelineRuns)");
    expect(tx).toContain(".set({ resumedByRunId: resumedRunId })");
    expect(tx).toContain("sql`${pipelineRuns.resumedByRunId} IS NULL`");
    expect(tx).toContain('inArray(pipelineRuns.status, ["failed", "partial"])');
    expect(tx).toMatch(/getAffectedRows\(claimRes\) === 0\) \{\s*throw new TRPCError\(\{\s*code: "CONFLICT"/);
    expect(tx).toContain("already resumed or still running");
  });

  it("no longer exempts alertId === 'unknown' from the guard", () => {
    expect(resumeSrc).not.toContain('alertIdVal !== "unknown"');
  });
});

describe("H-L7: one correlation bundle per triage", () => {
  it("claims/reuses by sourceTriageId before inserting and handles ER_DUP_ENTRY", () => {
    expect(corrSrc).toContain("const claim = await claimCorrelationBundle(db, input.triageId);");
    expect(corrSrc).toMatch(/if \(claim\.kind === "reuse"\)/);
    expect(corrSrc).toContain("e?.errno === 1062");
    expect(corrSrc).toContain('if (row.status === "completed") return { kind: "reuse", row };');
    expect(corrSrc).toMatch(/code: "CONFLICT",\s*message: `Correlation for triage/);
  });

  it("failure write is guarded on status='processing'", () => {
    expect(corrSrc).toMatch(/eq\(correlationBundles\.correlationId, correlationId\),\s*eq\(correlationBundles\.status, "processing"\)/);
  });
});

describe("H-L10: bulk auto-triage only claims queued + pending", () => {
  it("SELECT ... FOR UPDATE filters status='queued' AND autoTriageStatus='pending'", () => {
    const body = slice(pipelineSrc, "autoTriageAllPending: protectedProcedure", "runFullPipeline: protectedProcedure");
    expect(body).toMatch(/eq\(alertQueue\.status, "queued"\),\s*eq\(alertQueue\.autoTriageStatus, "pending"\)/);
  });
});

describe("H-C2 (server) + list ordering", () => {
  it("recentAlerts: newest first, limit 50, optional since", () => {
    const body = slice(queueSrc, "recentAlerts: protectedProcedure", "clearHistory:");
    expect(body).toContain("since: z.string().datetime({ offset: true }).optional()");
    expect(body).toContain(".orderBy(desc(alertQueue.queuedAt), desc(alertQueue.id))");
    expect(body).toContain(".limit(50)");
    expect(body).not.toContain("desc(alertQueue.ruleLevel)");
  });

  it("list FIELD() orders processing, triaged, queued and active depth counts triaged", () => {
    expect(queueSrc).toContain("FIELD(${alertQueue.status}, 'processing', 'triaged', 'queued', 'completed', 'failed', 'dismissed')");
    expect(queueSrc).toContain('const ACTIVE_QUEUE_STATUSES = ["queued", "processing", "triaged"] as const;');
    expect(queueSrc).not.toContain('inArray(alertQueue.status, ["queued", "processing"])');
    expect(autoQueueSrc).not.toContain('inArray(alertQueue.status, ["queued", "processing"])');
  });
});
