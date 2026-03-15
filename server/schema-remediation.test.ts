/**
 * Schema Remediation Blocker-Guard Tests
 *
 * These tests verify that the remediation artifacts exist and contain the
 * correct fixes. They fail before the fixes are applied and pass after.
 *
 * Categories:
 *   1. Migration file content guards (crasher fixes exist in SQL)
 *   2. Code guards (rate limiter, trust proxy, entrypoint)
 *   3. Journal integrity (new migrations are journaled)
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";

const drizzleDir = resolve(process.cwd(), "drizzle");
const serverDir = resolve(process.cwd(), "server");
const rootDir = process.cwd();

// ── Migration File Guards ───────────────────────────────────────────────────

describe("Crasher #1: alert_queue.status 'triaged' enum fix", () => {
  it("migration 0018 exists", () => {
    expect(existsSync(join(drizzleDir, "0018_schema_reconciliation.sql"))).toBe(true);
  });

  it("migration 0018 ALTERs alert_queue.status to include 'triaged'", () => {
    const sql = readFileSync(join(drizzleDir, "0018_schema_reconciliation.sql"), "utf-8");
    expect(sql).toContain("alert_queue");
    expect(sql).toContain("'triaged'");
    // Must be a MODIFY COLUMN that expands the enum
    expect(sql).toMatch(/MODIFY\s+COLUMN\s+`status`\s+enum\([^)]*'triaged'[^)]*\)/i);
  });
});

describe("Crasher #2: pipeline_runs.responseActionsStatus 'partial' enum fix", () => {
  it("migration 0018 ALTERs responseActionsStatus to include 'partial'", () => {
    const sql = readFileSync(join(drizzleDir, "0018_schema_reconciliation.sql"), "utf-8");
    expect(sql).toContain("pipeline_runs");
    expect(sql).toContain("'partial'");
    expect(sql).toMatch(/MODIFY\s+COLUMN\s+`responseActionsStatus`\s+enum\([^)]*'partial'[^)]*\)/i);
  });
});

describe("Crasher #3: config_baselines.scheduleId column fix", () => {
  it("migration 0018 adds scheduleId column to config_baselines", () => {
    const sql = readFileSync(join(drizzleDir, "0018_schema_reconciliation.sql"), "utf-8");
    expect(sql).toContain("config_baselines");
    expect(sql).toContain("scheduleId");
    expect(sql).toMatch(/ADD\s+COLUMN\s+`scheduleId`\s+int\s+NULL/i);
  });
});

describe("Integrity: connection_settings unique constraint", () => {
  it("migration 0018 adds UNIQUE(category, settingKey)", () => {
    const sql = readFileSync(join(drizzleDir, "0018_schema_reconciliation.sql"), "utf-8");
    expect(sql).toContain("cs_category_key_uniq");
    expect(sql).toMatch(/UNIQUE\s+INDEX\s+`cs_category_key_uniq`\s*\(\s*`category`\s*,\s*`settingKey`\s*\)/i);
  });
});

describe("Integrity: response_actions.actionId unique constraint", () => {
  it("migration 0018 drops old non-unique index and adds unique", () => {
    const sql = readFileSync(join(drizzleDir, "0018_schema_reconciliation.sql"), "utf-8");
    // Drops old non-unique index
    expect(sql).toContain("ra_actionId_idx");
    // Adds unique index
    expect(sql).toContain("ra_actionId_unique_idx");
    expect(sql).toMatch(/UNIQUE\s+INDEX\s+`ra_actionId_unique_idx`\s*\(\s*`actionId`\s*\)/i);
  });
});

// ── Foreign Key Migration Guards ────────────────────────────────────────────

describe("Nullability reconciliation (0019)", () => {
  it("migration 0019 exists", () => {
    expect(existsSync(join(drizzleDir, "0019_nullability_reconciliation.sql"))).toBe(true);
  });

  it("migration 0019 makes investigation_sessions.userId nullable", () => {
    const sql = readFileSync(join(drizzleDir, "0019_nullability_reconciliation.sql"), "utf-8");
    expect(sql).toContain("investigation_sessions");
    expect(sql).toContain("userId");
    expect(sql).toMatch(/MODIFY\s+COLUMN\s+`userId`\s+int\s+NULL/i);
  });
});

describe("Foreign key migration (0020)", () => {
  it("migration 0020 exists", () => {
    expect(existsSync(join(drizzleDir, "0020_foreign_keys.sql"))).toBe(true);
  });

  it("migration 0020 contains all FK constraints from fk_migration.sql", () => {
    const sql = readFileSync(join(drizzleDir, "0020_foreign_keys.sql"), "utf-8");

    const expectedConstraints = [
      "fk_ss_userId", "fk_cb_userId", "fk_bs_userId", "fk_ds_userId",
      "fk_da_userId", "fk_dnh_userId", "fk_asr_userId", "fk_anv2_userId",
      "fk_is_userId", "fk_in_userId", "fk_sh_userId", "fk_saa_userId",
      "fk_cb_scheduleId", "fk_ds_scheduleId", "fk_ds_baselineId",
      "fk_ds_previousBaselineId", "fk_da_snapshotId", "fk_da_scheduleId",
      "fk_dnh_scheduleId", "fk_dnh_snapshotId", "fk_dnh_anomalyId",
      "fk_asr_scheduleId", "fk_kgp_endpointId", "fk_kgr_endpointId",
      "fk_kgth_endpointId", "fk_kgf_indexId", "fk_in_sessionId",
      "fk_to_triggeredByUserId", "fk_to_alertQueueItemId",
      "fk_to_analystUserId", "fk_to_linkedCaseId", "fk_ra_caseId",
      "fk_pr_queueItemId", "fk_pr_livingCaseId",
      "fk_ta_queueItemId", "fk_ta_pipelineRunId",
    ];

    for (const fk of expectedConstraints) {
      expect(sql, `Missing FK constraint: ${fk}`).toContain(fk);
    }
  });

  it("migration 0020 uses single-statement DDL with statement-breakpoints", () => {
    const sql = readFileSync(join(drizzleDir, "0020_foreign_keys.sql"), "utf-8");
    expect(sql).toContain("ADD CONSTRAINT");
    expect(sql).toContain("FOREIGN KEY");
    expect(sql).toContain("statement-breakpoint");
  });
});

// ── Journal Integrity Guards ────────────────────────────────────────────────

describe("Migration journal includes remediation entries", () => {
  it("journal contains entry for 0018_schema_reconciliation", () => {
    const journal = JSON.parse(readFileSync(join(drizzleDir, "meta", "_journal.json"), "utf-8"));
    const entry = journal.entries.find((e: { tag: string }) => e.tag === "0018_schema_reconciliation");
    expect(entry, "Missing journal entry for 0018").toBeTruthy();
    expect(entry.idx).toBe(18);
  });

  it("journal contains entry for 0019_nullability_reconciliation", () => {
    const journal = JSON.parse(readFileSync(join(drizzleDir, "meta", "_journal.json"), "utf-8"));
    const entry = journal.entries.find((e: { tag: string }) => e.tag === "0019_nullability_reconciliation");
    expect(entry, "Missing journal entry for 0019").toBeTruthy();
    expect(entry.idx).toBe(19);
  });

  it("journal contains entry for 0020_foreign_keys", () => {
    const journal = JSON.parse(readFileSync(join(drizzleDir, "meta", "_journal.json"), "utf-8"));
    const entry = journal.entries.find((e: { tag: string }) => e.tag === "0020_foreign_keys");
    expect(entry, "Missing journal entry for 0020").toBeTruthy();
    expect(entry.idx).toBe(20);
  });

  it("journal timestamps remain monotonically increasing", () => {
    const journal = JSON.parse(readFileSync(join(drizzleDir, "meta", "_journal.json"), "utf-8"));
    for (let i = 1; i < journal.entries.length; i++) {
      const prev = journal.entries[i - 1];
      const curr = journal.entries[i];
      expect(curr.when, `${curr.tag} timestamp <= ${prev.tag}`).toBeGreaterThan(prev.when);
    }
  });
});

// ── Preflight Script Guards ─────────────────────────────────────────────────

describe("Preflight scripts exist", () => {
  it("preflight-0018.sql exists", () => {
    expect(existsSync(join(rootDir, "scripts", "preflight-0018.sql"))).toBe(true);
  });

  it("preflight-0019.sql exists", () => {
    expect(existsSync(join(rootDir, "scripts", "preflight-0019.sql"))).toBe(true);
  });
});

// ── Rate Limiter Security Guards ────────────────────────────────────────────

describe("Rate limiter spoof resistance", () => {
  it("localAuthRouter does NOT read raw x-forwarded-for header for rate limiting", () => {
    const src = readFileSync(join(serverDir, "localAuth", "localAuthRouter.ts"), "utf-8");
    // Must not contain direct header access for rate limiting
    expect(src).not.toContain('ctx.req.headers["x-forwarded-for"]');
    expect(src).not.toContain("ctx.req.headers['x-forwarded-for']");
  });

  it("localAuthRouter uses req.ip for rate limiting (respects trust proxy)", () => {
    const src = readFileSync(join(serverDir, "localAuth", "localAuthRouter.ts"), "utf-8");
    // Must use req.ip which respects Express trust proxy setting
    expect(src).toContain("ctx.req.ip");
  });
});

describe("Trust proxy configuration", () => {
  it("server/index.ts configures trust proxy from TRUST_PROXY env var", () => {
    const src = readFileSync(join(serverDir, "_core", "index.ts"), "utf-8");
    expect(src).toContain("trust proxy");
    expect(src).toContain("TRUST_PROXY");
    expect(src).toMatch(/app\.set\(\s*["']trust proxy["']/);
  });

  it("docker-compose.yml exposes TRUST_PROXY env var", () => {
    const compose = readFileSync(join(rootDir, "docker-compose.yml"), "utf-8");
    expect(compose).toContain("TRUST_PROXY");
  });
});

// ── Entrypoint Hard-Fail Guard ──────────────────────────────────────────────

describe("Entrypoint migration failure handling", () => {
  it("entrypoint exits on migration failure by default", () => {
    const src = readFileSync(join(rootDir, "docker-entrypoint.sh"), "utf-8");
    // Must contain exit 1 for migration failure
    expect(src).toContain("exit 1");
    // Must check ALLOW_MIGRATION_FAILURE for escape hatch
    expect(src).toContain("ALLOW_MIGRATION_FAILURE");
  });

  it("entrypoint does NOT silently continue on migration failure", () => {
    const src = readFileSync(join(rootDir, "docker-entrypoint.sh"), "utf-8");
    // Old behavior: "The server will start, but some features may not work"
    expect(src).not.toContain("The server will start, but some features may not work");
  });
});
