#!/usr/bin/env node
/**
 * Split-Brain Architecture Audit
 *
 * Checks for the reintroduction of the three resolved split-brain patterns:
 *
 *   1. Walter path: alertQueue.process must NOT use runAnalystPipeline()
 *   2. Correlation boundary: no direct raw→CorrelationBundle cast, persistence
 *      must go through the normalizer
 *   3. Response action state: no direct caseData action-state mutation, no
 *      runtime updateActionState
 *
 * Also verifies:
 *   4. Read-only analyst paths (runAnalystPipeline, enhancedLLMService) do NOT
 *      write to pipeline artifact tables
 *
 * Usage:
 *   node scripts/audit-splitbrain.mjs
 *   pnpm audit:splitbrain
 *
 * Exit code 0: clean
 * Exit code 1: violations found
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

/** Recursively collect .ts/.tsx files, skipping tests, node_modules, .bak */
function collectSourceFiles(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", "dist", "test-output"].includes(entry.name)) continue;
      collectSourceFiles(full, files);
    } else if (/\.(ts|tsx|mjs)$/.test(entry.name) && !entry.name.endsWith(".bak")) {
      files.push(full);
    }
  }
  return files;
}

/** True if path is a test file */
function isTestFile(path) {
  return /\.test\.|\.spec\.|__tests__|test-output/.test(path);
}

/** True if path is in a runtime server directory (not client, not docs, not scripts) */
function isRuntimeServerFile(path) {
  const rel = relative(ROOT, path);
  return rel.startsWith("server/") && !isTestFile(path);
}

const violations = [];

function fail(rule, file, line, message) {
  violations.push({ rule, file: relative(ROOT, file), line, message });
}

// ─── Collect files ──────────────────────────────────────────────────────────

const allFiles = collectSourceFiles(join(ROOT, "server"));
const runtimeFiles = allFiles.filter(isRuntimeServerFile);

// ─── Rule 1: Walter path — alertQueueRouter must NOT import runAnalystPipeline ─

const ALERT_QUEUE_ROUTER = runtimeFiles.filter(f => f.includes("alertQueueRouter") && !isTestFile(f));

for (const file of ALERT_QUEUE_ROUTER) {
  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    if (/runAnalystPipeline/.test(line) && !/\/\//.test(line.split("runAnalystPipeline")[0])) {
      fail(
        "WALTER_PATH",
        file,
        i + 1,
        `alertQueueRouter imports or references runAnalystPipeline — this was the old dead-end path`
      );
    }
  });
}

// ─── Rule 2: Correlation boundary — no direct raw→CorrelationBundle cast ────

const CORRELATION_FILES = runtimeFiles.filter(
  f => f.includes("correlationAgent") || f.includes("Correlation")
);

for (const file of CORRELATION_FILES) {
  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    // Catch: const/let/var bundle: CorrelationBundle = rawJson/parsed/result/data/etc
    // But NOT: function return types, interface definitions, or normalizeCorrelationBundle return types
    if (
      /(?:const|let|var)\s+\w+\s*(?::\s*CorrelationBundle)?\s*=\s*(?:raw|parsed|result|data|json)/i.test(line) &&
      /as\s+CorrelationBundle/.test(line)
    ) {
      fail(
        "CORRELATION_CAST",
        file,
        i + 1,
        `Direct raw→CorrelationBundle cast detected — must go through normalizeCorrelationBundle()`
      );
    }
  });
}

// Rule 2b: The ONE insert path to correlationBundles must be in correlationAgent.ts
// and must be preceded by parseLLMCorrelation + normalizeCorrelationBundle

for (const file of runtimeFiles) {
  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");
  const rel = relative(ROOT, file);

  lines.forEach((line, i) => {
    // Any file that inserts into correlationBundles
    if (/\.insert\s*\(\s*correlationBundles\s*\)/.test(line)) {
      if (!rel.includes("correlationAgent.ts")) {
        fail(
          "CORRELATION_WRITE_PATH",
          file,
          i + 1,
          `Insert into correlationBundles found outside correlationAgent.ts — only one write path allowed`
        );
      }
    }
  });
}

// Verify correlationAgent.ts imports the normalizer
const corrAgentFiles = runtimeFiles.filter(f => f.endsWith("correlationAgent.ts"));
for (const file of corrAgentFiles) {
  const content = readFileSync(file, "utf-8");
  if (!content.includes("parseLLMCorrelation")) {
    fail(
      "CORRELATION_NORMALIZER",
      file,
      0,
      `correlationAgent.ts does not import parseLLMCorrelation — normalization boundary missing`
    );
  }
  if (!content.includes("normalizeCorrelationBundle")) {
    fail(
      "CORRELATION_NORMALIZER",
      file,
      0,
      `correlationAgent.ts does not import normalizeCorrelationBundle — normalization boundary missing`
    );
  }
}

// ─── Rule 3: Response action state — no direct caseData action mutation ─────

for (const file of runtimeFiles) {
  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");
  const rel = relative(ROOT, file);

  // Skip the stateMachine itself — it's the canonical path
  if (rel.includes("stateMachine.ts")) continue;
  // Skip responseActionsRouter — it delegates to stateMachine
  if (rel.includes("responseActionsRouter.ts")) continue;

  lines.forEach((line, i) => {
    // Catch: updateActionState (should be gone from runtime code)
    if (/\bupdateActionState\b/.test(line) && !/\/\//.test(line.split("updateActionState")[0]) && !/\*/.test(line.split("updateActionState")[0])) {
      fail(
        "ACTION_STATE_DEPRECATED",
        file,
        i + 1,
        `Runtime reference to deprecated updateActionState — action state must flow through stateMachine.ts`
      );
    }

    // Catch: direct mutation of caseData.actions or caseData.actionSummary.state
    // outside the stateMachine
    if (
      /caseData\s*\.\s*(?:actions|actionStates)\s*(?:\[|\.(?:state|status))/.test(line) &&
      !/\/\//.test(line.split("caseData")[0])
    ) {
      fail(
        "ACTION_STATE_DIRECT_MUTATION",
        file,
        i + 1,
        `Direct caseData action-state mutation — action state must flow through stateMachine.ts`
      );
    }
  });
}

// ─── Rule 4: Read-only analyst paths must not write to pipeline tables ──────

const PIPELINE_TABLES = [
  "triageObjects",
  "correlationBundles",
  "livingCaseState",
  "pipelineRuns",
  "responseActions",
  "responseActionAudit",
];

const READ_ONLY_PATHS = runtimeFiles.filter(
  f =>
    f.includes("graph/agenticPipeline.ts") ||
    f.includes("enhancedLLM")
);

for (const file of READ_ONLY_PATHS) {
  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");

  lines.forEach((line, i) => {
    for (const table of PIPELINE_TABLES) {
      // Catch: .insert(tableName) or .update(tableName)
      if (
        new RegExp(`\\.(?:insert|update)\\s*\\(\\s*${table}\\s*\\)`).test(line)
      ) {
        fail(
          "READ_ONLY_WRITE",
          file,
          i + 1,
          `Read-only analyst path writes to ${table} — runAnalystPipeline/enhancedLLM must not mutate pipeline tables`
        );
      }
    }
  });
}

// ─── Rule 5: Transaction + optimistic guard — transitionActionState must be concurrent-safe ──

const stateMachineFiles = runtimeFiles.filter(f => f.endsWith("stateMachine.ts"));
for (const file of stateMachineFiles) {
  const content = readFileSync(file, "utf-8");

  // Extract the transitionActionState function body (generous window)
  const fnStart = content.indexOf("export async function transitionActionState");
  if (fnStart === -1) {
    fail("CONCURRENCY", file, 0, "transitionActionState function not found");
    continue;
  }

  const fnBody = content.slice(fnStart, fnStart + 5000);

  // 5a. Must use db.transaction
  if (!fnBody.includes(".transaction(")) {
    fail(
      "CONCURRENCY",
      file,
      0,
      `transitionActionState does not use db.transaction() — action mutation + audit + sync must be atomic`
    );
  }

  // 5b. Action fetch must be INSIDE the transaction (not before it)
  //     Check that .select().from(responseActions) appears AFTER .transaction(
  const txPos = fnBody.indexOf(".transaction(");
  const selectPos = fnBody.indexOf(".from(responseActions)");
  if (txPos >= 0 && selectPos >= 0 && selectPos < txPos) {
    fail(
      "CONCURRENCY",
      file,
      0,
      `transitionActionState reads action OUTSIDE the transaction — stale-state race window`
    );
  }

  // 5c. UPDATE must include optimistic guard on fromState
  //     Check for pattern: eq(responseActions.state, fromState) in the update WHERE clause
  if (!fnBody.includes("responseActions.state") || !fnBody.includes("fromState")) {
    fail(
      "CONCURRENCY",
      file,
      0,
      `transitionActionState UPDATE missing optimistic guard (WHERE state = fromState) — concurrent stomping possible`
    );
  }

  // 5d. Must check affectedRows after the guarded UPDATE
  if (!fnBody.includes("affectedRows")) {
    fail(
      "CONCURRENCY",
      file,
      0,
      `transitionActionState does not check affectedRows after guarded UPDATE — lost-race detection missing`
    );
  }
}

// ─── Report ─────────────────────────────────────────────────────────────────

console.log("");
console.log(`${BOLD}═══════════════════════════════════════════════════════${RESET}`);
console.log(`${BOLD}  Split-Brain Architecture Audit${RESET}`);
console.log(`${BOLD}═══════════════════════════════════════════════════════${RESET}`);
console.log("");
console.log(`  Scanned: ${runtimeFiles.length} runtime server files`);
console.log("");

if (violations.length === 0) {
  console.log(`  ${GREEN}${BOLD}✓ PASS${RESET} — No split-brain patterns detected`);
  console.log("");
  console.log("  Verified:");
  console.log("    ✓ alertQueueRouter uses structured triage path (not runAnalystPipeline)");
  console.log("    ✓ correlationBundles persistence goes through normalizer");
  console.log("    ✓ No direct CorrelationBundle cast from raw JSON");
  console.log("    ✓ No deprecated updateActionState in runtime code");
  console.log("    ✓ No direct caseData action-state mutation");
  console.log("    ✓ runAnalystPipeline/enhancedLLM remain read-only");
  console.log("    ✓ transitionActionState uses db.transaction()");
  console.log("    ✓ Action fetch is inside the transaction (no stale-read window)");
  console.log("    ✓ UPDATE has optimistic guard (WHERE state = fromState)");
  console.log("    ✓ affectedRows checked after guarded UPDATE (lost-race detection)");  console.log("");
  process.exit(0);
} else {
  console.log(`  ${RED}${BOLD}✗ FAIL${RESET} — ${violations.length} violation(s) found`);
  console.log("");

  const byRule = {};
  for (const v of violations) {
    (byRule[v.rule] ??= []).push(v);
  }

  for (const [rule, vs] of Object.entries(byRule)) {
    console.log(`  ${YELLOW}${BOLD}[${rule}]${RESET}`);
    for (const v of vs) {
      console.log(`    ${RED}✗${RESET} ${v.file}${v.line ? `:${v.line}` : ""}`);
      console.log(`      ${v.message}`);
    }
    console.log("");
  }

  process.exit(1);
}
