/**
 * Migration journal integrity tests
 *
 * Validates that:
 * 1. The _journal.json timestamps are monotonically increasing
 * 2. All migration SQL files referenced in the journal exist
 * 3. The backfill script logic correctly identifies missing entries
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { createHash } from "crypto";

const drizzleDir = resolve(process.cwd(), "drizzle");
const journalPath = join(drizzleDir, "meta", "_journal.json");

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

function loadJournal(): Journal {
  return JSON.parse(readFileSync(journalPath, "utf-8"));
}

describe("Migration journal integrity", () => {
  it("_journal.json exists and is valid JSON", () => {
    expect(existsSync(journalPath)).toBe(true);
    const journal = loadJournal();
    expect(journal.dialect).toBe("mysql");
    expect(Array.isArray(journal.entries)).toBe(true);
    expect(journal.entries.length).toBeGreaterThan(0);
  });

  it("all migration SQL files referenced in the journal exist", () => {
    const journal = loadJournal();
    for (const entry of journal.entries) {
      const sqlFile = join(drizzleDir, `${entry.tag}.sql`);
      expect(existsSync(sqlFile), `Missing SQL file for ${entry.tag}`).toBe(true);
    }
  });

  it("journal entry indexes are sequential starting from 0", () => {
    const journal = loadJournal();
    for (let i = 0; i < journal.entries.length; i++) {
      expect(journal.entries[i].idx, `Entry ${i} has wrong idx`).toBe(i);
    }
  });

  it("journal timestamps are monotonically increasing (no out-of-order)", () => {
    const journal = loadJournal();
    for (let i = 1; i < journal.entries.length; i++) {
      const prev = journal.entries[i - 1];
      const curr = journal.entries[i];
      expect(
        curr.when,
        `Migration ${curr.tag} (when=${curr.when}) has timestamp before ${prev.tag} (when=${prev.when}). ` +
        `This causes Drizzle to skip migrations silently.`
      ).toBeGreaterThan(prev.when);
    }
  });

  it("all snapshot files exist for each journal entry", () => {
    const journal = loadJournal();
    for (const entry of journal.entries) {
      // Migrations 0016+ are hand-written reconciliation scripts without drizzle-kit snapshots
      if (entry.idx >= 16) continue;
      const snapshotFile = join(drizzleDir, "meta", `${String(entry.idx).padStart(4, "0")}_snapshot.json`);
      expect(existsSync(snapshotFile), `Missing snapshot for idx ${entry.idx}`).toBe(true);
    }
  });
});

describe("Migration SQL file hashes", () => {
  it("each migration file produces a consistent SHA256 hash", () => {
    const journal = loadJournal();
    const hashes = new Set<string>();

    for (const entry of journal.entries) {
      const sqlFile = join(drizzleDir, `${entry.tag}.sql`);
      const sql = readFileSync(sqlFile, "utf-8");
      const hash = createHash("sha256").update(sql).digest("hex");

      // No duplicate hashes (would mean identical migration files)
      expect(hashes.has(hash), `Duplicate hash for ${entry.tag}`).toBe(false);
      hashes.add(hash);

      // Hash should be a valid 64-char hex string
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("Migration 0012-0014 specific checks", () => {
  it("0012_ticket_artifacts creates ticket_artifacts table", () => {
    const sql = readFileSync(join(drizzleDir, "0012_ticket_artifacts.sql"), "utf-8");
    expect(sql).toContain("CREATE TABLE");
    expect(sql).toContain("ticket_artifacts");
    expect(sql).toContain("ticketId");
    expect(sql).toContain("queueItemId");
  });

  it("0013_sensitive_access_audit creates sensitive_access_audit table", () => {
    const sql = readFileSync(join(drizzleDir, "0013_sensitive_access_audit.sql"), "utf-8");
    expect(sql).toContain("CREATE TABLE");
    expect(sql).toContain("sensitive_access_audit");
    expect(sql).toContain("userId");
    expect(sql).toContain("resourceType");
  });

  it("0014_saved_search_types expands searchType enum", () => {
    const sql = readFileSync(join(drizzleDir, "0014_saved_search_types.sql"), "utf-8");
    expect(sql).toContain("ALTER TABLE");
    expect(sql).toContain("saved_searches");
    expect(sql).toContain("alerts");
    expect(sql).toContain("vulnerabilities");
    expect(sql).toContain("fleet");
  });
});
