/**
 * Transaction Guards Regression Tests — Audit #48
 *
 * Verifies that:
 * 1. The `propose` mutation wraps INSERT + audit INSERT in a single db.transaction()
 * 2. The `acknowledged` state machine case merges executionResult/executionOutcome
 *    into the atomic UPDATE payload (no separate UPDATE after the transaction)
 * 3. The `execute` router mutation no longer does a post-transaction UPDATE
 *
 * These are source-level structural tests — they verify the code patterns
 * without requiring a live database.
 */
import { describe, it, expect } from "vitest";
import { origDir } from "./_origDir";
const __origDir = origDir("server/agenticPipeline");
import * as fs from "fs";
import * as path from "path";

const ROUTER_PATH = path.join(__origDir, "responseActionsRouter.ts");
const STATE_MACHINE_PATH = path.join(__origDir, "stateMachine.ts");

describe("Audit #48 — Response Action Transaction Guards", () => {
  // ── Propose mutation ──────────────────────────────────────────────────────
  describe("propose mutation — transactional", () => {
    const routerSrc = fs.readFileSync(ROUTER_PATH, "utf-8");

    it("wraps action INSERT + audit INSERT in db.transaction()", () => {
      // Find the propose mutation body
      const proposeStart = routerSrc.indexOf("propose: adminProcedure");
      expect(proposeStart).toBeGreaterThan(-1);

      // Extract a window around the propose mutation (up to the next endpoint)
      const proposeEnd = routerSrc.indexOf("approve: adminProcedure", proposeStart);
      const proposeBody = routerSrc.slice(proposeStart, proposeEnd);

      // Must use db.transaction()
      expect(proposeBody).toContain("db.transaction(async (tx)");
    });

    it("uses tx (not db) for INSERT responseActions inside propose", () => {
      const proposeStart = routerSrc.indexOf("propose: adminProcedure");
      const proposeEnd = routerSrc.indexOf("approve: adminProcedure", proposeStart);
      const proposeBody = routerSrc.slice(proposeStart, proposeEnd);

      // tx.insert(responseActions) should be present
      expect(proposeBody).toContain("tx.insert(responseActions)");
      // db.insert(responseActions) should NOT be present (would be outside tx)
      expect(proposeBody).not.toContain("db.insert(responseActions)");
    });

    it("uses tx (not db) for INSERT responseActionAudit inside propose", () => {
      const proposeStart = routerSrc.indexOf("propose: adminProcedure");
      const proposeEnd = routerSrc.indexOf("approve: adminProcedure", proposeStart);
      const proposeBody = routerSrc.slice(proposeStart, proposeEnd);

      // tx.insert(responseActionAudit) should be present
      expect(proposeBody).toContain("tx.insert(responseActionAudit)");
      // db.insert(responseActionAudit) should NOT be present
      expect(proposeBody).not.toContain("db.insert(responseActionAudit)");
    });

    it("uses tx (not db) for SELECT after INSERT inside propose", () => {
      const proposeStart = routerSrc.indexOf("propose: adminProcedure");
      const proposeEnd = routerSrc.indexOf("approve: adminProcedure", proposeStart);
      const proposeBody = routerSrc.slice(proposeStart, proposeEnd);

      // The SELECT to fetch the inserted row should use tx
      expect(proposeBody).toMatch(/tx\s*\.\s*select\(\)/);
    });
  });

  // ── Execute state machine case ────────────────────────────────────────────
  describe("execute — metadata merged into atomic UPDATE", () => {
    const smSrc = fs.readFileSync(STATE_MACHINE_PATH, "utf-8");

    it("merges executionResult into updatePayload inside the acknowledged case", () => {
      // Find the executed case in the switch
      const executedCase = smSrc.indexOf('case "acknowledged": {');
      expect(executedCase).toBeGreaterThan(-1);

      // Extract the case body (up to the next case or closing brace)
      const nextCase = smSrc.indexOf("case \"deferred\":", executedCase);
      const caseBody = smSrc.slice(executedCase, nextCase);

      // Must set updatePayload.executionResult from req.metadata
      expect(caseBody).toContain("updatePayload.executionResult");
      expect(caseBody).toContain("req.metadata?.executionResult");
    });

    it("merges executionOutcome into updatePayload inside the acknowledged case", () => {
      const executedCase = smSrc.indexOf('case "acknowledged": {');
      const nextCase = smSrc.indexOf("case \"deferred\":", executedCase);
      const caseBody = smSrc.slice(executedCase, nextCase);

      expect(caseBody).toContain("updatePayload.executionOutcome");
      expect(caseBody).toContain("req.metadata?.executionOutcome");
    });
  });

  // ── Execute router mutation — no post-transaction UPDATE ──────────────────
  describe("execute router mutation — no orphan-risk UPDATE", () => {
    const routerSrc = fs.readFileSync(ROUTER_PATH, "utf-8");

    it("does NOT do a separate db.update(responseActions) after acknowledgeAction()", () => {
      // Find the execute mutation body
      const executeStart = routerSrc.indexOf("acknowledge: adminProcedure");
      expect(executeStart).toBeGreaterThan(-1);

      // Extract up to the next endpoint
      const executeEnd = routerSrc.indexOf("defer: adminProcedure", executeStart);
      const executeBody = routerSrc.slice(executeStart, executeEnd);

      // Should NOT contain a separate db.update() call — all metadata is
      // now merged inside the state machine's transaction
      expect(executeBody).not.toContain("db.update(responseActions)");
      expect(executeBody).not.toContain("await db");
      // But should still call executeAction
      expect(executeBody).toContain("acknowledgeAction(");
    });

    it("passes outcome and result as the attestation to acknowledgeAction", () => {
      const executeStart = routerSrc.indexOf("acknowledge: adminProcedure");
      const executeEnd = routerSrc.indexOf("defer: adminProcedure", executeStart);
      const executeBody = routerSrc.slice(executeStart, executeEnd);

      // The metadata object should contain both fields
      expect(executeBody).toContain("executionResult: input.result");
      expect(executeBody).toContain("executionOutcome: input.outcome");
    });
  });
});
