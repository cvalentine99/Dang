/**
 * Phase 1 data-layer fail-closed guards (CODE_REVIEW_2026-10-21 §5.4:
 * H-D3, H-D5, H-D6, H-D7, H-D8, H-D9, M-11).
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("../db", () => ({ getDb: vi.fn(async () => null) }));

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf-8");

describe("M-11 — suppression / anomaly checks fail closed on !db", () => {
  it("checkSuppression throws instead of returning suppressed:false", async () => {
    const { checkSuppression } = await import("./suppressionRules");
    await expect(checkSuppression(1, 1, "high")).rejects.toThrow(/Database unavailable/);
  });

  it("checkForAnomaly throws instead of returning isAnomaly:false", async () => {
    const { checkForAnomaly } = await import("./anomalyDetection");
    await expect(
      checkForAnomaly({ id: 1, scheduleId: 1, userId: 1, driftPercent: 50 } as never),
    ).rejects.toThrow(/Database unavailable/);
  });

  it("recordTicketArtifact throws on !db (H-D7)", async () => {
    const { recordTicketArtifact } = await import("../splunk/splunkHelpers");
    await expect(recordTicketArtifact({
      ticketId: "t", queueItemId: 1, triageId: null, pipelineRunId: null, alertId: "a",
      ruleId: null, ruleLevel: 1, createdBy: "x", success: true, statusMessage: null,
      rawResponse: null, httpStatusCode: null,
    })).rejects.toThrow(/database connection failed/);
  });
});

describe("source guards", () => {
  it("H-D9: fullReport export throws PRECONDITION_FAILED instead of a zero-count report", () => {
    const src = read("server/baselines/exportRouter.ts");
    expect(src).toContain('code: "PRECONDITION_FAILED"');
    expect(src).not.toMatch(/summary: \{ snapshots: 0, anomalies: 0, notifications: 0, schedules: 0 \}/);
  });

  it("H-D9: agentic pipeline never marks the !db pipeline step complete", () => {
    const src = read("server/graph/agenticPipeline.ts");
    const idx = src.indexOf("Database unavailable — pipeline context NOT retrieved");
    expect(idx).toBeGreaterThan(-1);
    expect(src.slice(idx - 300, idx)).toContain('status: "error"');
  });

  it("H-D6: sensitive access viewer uses requireDb, no empty fallbacks", () => {
    const src = read("server/admin/sensitiveAccessRouter.ts");
    expect(src).toContain("requireDb()");
    expect(src).not.toContain("rows: [], total: 0");
    expect(src).not.toContain("totalRecords: 0");
  });

  it("H-D3: prune deletes referencing drift_snapshots first, in one transaction, and is isolated", () => {
    const src = read("server/baselines/baselineSchedulerService.ts");
    const fn = src.slice(src.indexOf("async function pruneOldBaselines"));
    expect(fn).toContain("db.transaction(");
    const snap = fn.indexOf("tx\n      .delete(driftSnapshots)");
    const base = fn.indexOf("tx.delete(configBaselines)");
    expect(snap).toBeGreaterThan(-1);
    expect(base).toBeGreaterThan(snap);
    expect(fn).toContain("inArray(driftSnapshots.previousBaselineId, ids)");
    expect(src).toContain("Retention prune failed for schedule");
  });

  it("H-D5: pre-migrate check never mutates the schema", () => {
    const src = read("scripts/docker-pre-migrate.mjs");
    const code = src.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/conn\.query\(\s*`?\s*(DROP|ALTER|CREATE|DELETE|INSERT|UPDATE)/i);
    expect(code).toContain("[pre-migrate-check]");
    expect(code).toContain("information_schema.STATISTICS");
    expect(code).toContain("information_schema.COLUMNS");
    expect(code).toContain("information_schema.TABLE_CONSTRAINTS");
    expect(code).toContain("--has-pending");
  });

  it("H-D8: entrypoint backs up before migrate when migrations are pending", () => {
    const src = read("docker-entrypoint.sh");
    expect(src).toContain("--has-pending");
    expect(src).toContain("mysqldump --defaults-extra-file");
    expect(src).toContain("--single-transaction");
    expect(src).toContain("pre-migrate-$TS.sql");
    expect(src).toMatch(/-mtime \+"\$BACKUP_RETENTION_DAYS"/);
    expect(src.indexOf("backup_before_migrate; then")).toBeLessThan(src.indexOf("npx drizzle-kit migrate"));
    expect(read("Dockerfile")).toContain("default-mysql-client");
  });
});
