/**
 * callerParam.test.ts — Regression tests for LLM caller param
 *
 * Ensures every invokeLLM / invokeLLMWithFallback call site passes
 * a `caller` string so token usage is attributed correctly.
 *
 * Also verifies the autoTriageQueueItem success path sets all required
 * queue item fields (status, processedAt, completedAt).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── 1. LLM caller param presence ─────────────────────────────────────────────

describe("LLM caller param — all invokeLLM call sites must pass caller", () => {
  const CALL_SITES: Array<{
    file: string;
    relPath: string;
    expectedCaller: string;
    expectedCallCount: number;
  }> = [
    {
      file: "correlationAgent.ts",
      relPath: "./correlationAgent.ts",
      expectedCaller: "correlation_agent",
      expectedCallCount: 1,
    },
    {
      file: "triageAgent.ts",
      relPath: "./triageAgent.ts",
      expectedCaller: "triage_agent",
      expectedCallCount: 1,
    },
    {
      file: "hypothesisAgent.ts",
      relPath: "./hypothesisAgent.ts",
      expectedCaller: "hypothesis_agent",
      expectedCallCount: 1,
    },
    {
      file: "graph/agenticPipeline.ts (analyst_chat)",
      relPath: "../graph/agenticPipeline.ts",
      expectedCaller: "analyst_chat",
      expectedCallCount: 3,
    },
  ];

  for (const site of CALL_SITES) {
    it(`${site.file} passes caller: "${site.expectedCaller}"`, () => {
      const source = readFileSync(resolve(__dirname, site.relPath), "utf8");

      // Count occurrences of the caller string
      const callerPattern = `caller: "${site.expectedCaller}"`;
      const matches = source.split(callerPattern).length - 1;

      expect(matches).toBe(site.expectedCallCount);
    });
  }

  it("no invokeLLM call site is missing caller param", () => {
    // Scan all files that import invokeLLM or invokeLLMWithFallback
    const filesToCheck = [
      resolve(__dirname, "./correlationAgent.ts"),
      resolve(__dirname, "./triageAgent.ts"),
      resolve(__dirname, "./hypothesisAgent.ts"),
      resolve(__dirname, "../graph/agenticPipeline.ts"),
    ];

    for (const filePath of filesToCheck) {
      const source = readFileSync(filePath, "utf8");

      // Find all invokeLLM({ or invokeLLMWithFallback({ calls
      const callRegex = /invoke(?:LLM|LLMWithFallback)\(\{/g;
      let match: RegExpExecArray | null;
      while ((match = callRegex.exec(source)) !== null) {
        // Extract the next ~500 chars after the opening brace to find the closing
        const snippet = source.slice(match.index, match.index + 500);
        expect(snippet).toContain("caller:");
      }
    }
  });
});

// ── 2. autoTriageQueueItem success path fields ───────────────────────────────

describe("autoTriageQueueItem success path — sets all required fields", () => {
  it("pipelineRouter.ts success .set() includes status, processedAt, completedAt", () => {
    const source = readFileSync(
      resolve(__dirname, "./pipelineRouter.ts"),
      "utf8"
    );

    // Find the autoTriageQueueItem procedure definition (the one with protectedProcedure)
    const autoTriageIdx = source.indexOf("autoTriageQueueItem: protectedProcedure");
    expect(autoTriageIdx).toBeGreaterThan(-1);

    // Extract a generous section after the procedure definition
    const section = source.slice(autoTriageIdx, autoTriageIdx + 4000);

    // The success path .set() must include all three fields
    expect(section).toContain('status: "completed"');
    expect(section).toContain("processedAt:");
    expect(section).toContain("completedAt:");
    expect(section).toContain("pipelineTriageId:");
    expect(section).toContain('autoTriageStatus: "completed"');
  });
});

// ── 3. audit-splitbrain accepts renamed normalizer ───────────────────────────

describe("audit-splitbrain.mjs — accepts parseAndNormalizeCorrelationBundle", () => {
  it("checks for both parseLLMCorrelation and parseAndNormalizeCorrelationBundle", () => {
    const source = readFileSync(
      resolve(__dirname, "../../scripts/audit-splitbrain.mjs"),
      "utf8"
    );

    // The audit script must accept the combined function name
    expect(source).toContain("parseAndNormalizeCorrelationBundle");
    // And still reference the original for backward compat
    expect(source).toContain("parseLLMCorrelation");
  });
});
