/**
 * Regression tests for audit fixes #24/#25/#27 (concurrency) and #52 (LLM schema drop).
 *
 * These are source-level checks that verify the code patterns are correct,
 * not integration tests (those require a running DB).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../..");

function readSource(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), "utf-8");
}

describe("Audit #24: recordPivot transaction wrapping", () => {
  const source = readSource("server/agenticPipeline/pipelineRouter.ts");

  it("recordPivot uses db.transaction()", () => {
    // Find the recordPivot procedure and verify it wraps in a transaction
    const recordPivotIdx = source.indexOf("recordPivot:");
    expect(recordPivotIdx).toBeGreaterThan(-1);
    // Look for db.transaction within the next 500 chars after recordPivot
    const chunk = source.slice(recordPivotIdx, recordPivotIdx + 900);
    expect(chunk).toContain("db.transaction(async (tx)");
  });

  it("recordPivot uses tx (not db) for SELECT and UPDATE", () => {
    const recordPivotIdx = source.indexOf("recordPivot:");
    // Find the transaction body — between db.transaction and the next procedure
    const txStart = source.indexOf("db.transaction(async (tx)", recordPivotIdx);
    expect(txStart).toBeGreaterThan(-1);
    // Get ~800 chars of the transaction body
    const txBody = source.slice(txStart, txStart + 800);
    // Should use tx.select and tx.update, not db.select and db.update
    expect(txBody).toContain("await tx");
    expect(txBody).not.toMatch(/await db\s*\.\s*select/);
    expect(txBody).not.toMatch(/await db\s*\.\s*update/);
  });
});

describe("Audit #25: persistLivingCase transaction wrapping", () => {
  const source = readSource("server/agenticPipeline/hypothesisAgent.ts");

  it("persistLivingCase uses db.transaction()", () => {
    const fnIdx = source.indexOf("async function persistLivingCase");
    expect(fnIdx).toBeGreaterThan(-1);
    // Transaction should appear within the function body (may span multiple lines)
    const fnBody = source.slice(fnIdx, fnIdx + 800);
    expect(fnBody).toContain("db.transaction(async (tx)");
  });

  it("persistLivingCase uses tx for all DB operations", () => {
    const fnIdx = source.indexOf("async function persistLivingCase");
    const txStart = source.indexOf("db.transaction(async (tx)", fnIdx);
    expect(txStart).toBeGreaterThan(-1);
    // Find the closing of the transaction — look for the next top-level function
    const fnEnd = source.indexOf("\n}", txStart + 100);
    const txBody = source.slice(txStart, fnEnd);
    // All selects and inserts should use tx, not db
    const dbDirectCalls = txBody.match(/await db\s*\.\s*(select|insert|update)/g);
    expect(dbDirectCalls).toBeNull();
  });
});

describe("Audit #27: alertQueue.process atomic claim", () => {
  const source = readSource("server/alertQueue/alertQueueRouter.ts");

  it("process endpoint uses atomic claim pattern with status='queued' in WHERE", () => {
    // Find the process procedure
    const processIdx = source.indexOf("process: protectedProcedure");
    expect(processIdx).toBeGreaterThan(-1);
    // The atomic claim should have both eq(alertQueue.id, ...) AND eq(alertQueue.status, "queued")
    const chunk = source.slice(processIdx, processIdx + 2000);
    expect(chunk).toContain('eq(alertQueue.status, "queued")');
    expect(chunk).toContain("affectedRows");
  });

  it("process endpoint throws CONFLICT when claim fails", () => {
    const processIdx = source.indexOf("process: protectedProcedure");
    const chunk = source.slice(processIdx, processIdx + 2000);
    expect(chunk).toContain("CONFLICT");
    expect(chunk).toContain("already being processed");
  });
});

describe("Audit #52: LLM schema instruction drop", () => {
  const source = readSource("server/llm/llmService.ts");

  it("handles missing system message by prepending one", () => {
    // The fix should have an else branch that creates a system message
    expect(source).toContain("messages.unshift");
    expect(source).toContain('role: "system"');
  });

  it("still appends to existing system message when present", () => {
    // The original behavior should be preserved
    expect(source).toContain("messages[systemIdx].content +=");
  });

  it("schema instruction is defined before the if/else branch", () => {
    // The schemaInstruction variable should be defined once and used in both branches
    expect(source).toContain("const schemaInstruction =");
    // Both branches should reference it
    const schemaInstructionIdx = source.indexOf("const schemaInstruction =");
    const afterDef = source.slice(schemaInstructionIdx, schemaInstructionIdx + 500);
    // Should appear at least twice (append + unshift)
    const matches = afterDef.match(/schemaInstruction/g);
    expect(matches!.length).toBeGreaterThanOrEqual(3); // definition + append + unshift
  });
});
