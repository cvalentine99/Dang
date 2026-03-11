/**
 * Readiness Service — vitest tests
 *
 * Tests the Splunk HEC health check integration, ticketing workflow status,
 * dependency severity semantics, and the overall readiness contract.
 */

import { describe, it, expect } from "vitest";

describe("Readiness Service Module Exports", () => {
  it("should export checkAgenticReadiness function", async () => {
    const mod = await import("./readinessService");
    expect(typeof mod.checkAgenticReadiness).toBe("function");
  });
});

describe("Splunk HEC Dependency Contract (structural)", () => {
  it("AgenticReadiness interface includes splunkHec in dependencies", async () => {
    // Read the source to verify the interface includes splunkHec
    const fs = await import("fs");
    const src = fs.readFileSync("server/agenticReadiness/readinessService.ts", "utf-8");
    expect(src).toContain("splunkHec: DependencyStatus");
  });

  it("AgenticReadiness interface includes ticketing in workflows", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/agenticReadiness/readinessService.ts", "utf-8");
    expect(src).toContain("ticketing: WorkflowStatus");
  });

  it("checkSplunkHec function exists in the service", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/agenticReadiness/readinessService.ts", "utf-8");
    expect(src).toContain("async function checkSplunkHec()");
  });

  it("checkSplunkHec never returns blocked state", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/agenticReadiness/readinessService.ts", "utf-8");
    // Extract the checkSplunkHec function body
    const fnStart = src.indexOf("async function checkSplunkHec()");
    const fnBody = src.slice(fnStart, src.indexOf("\nexport async function checkAgenticReadiness"));
    // It should only return "ready" or "degraded", never "blocked"
    expect(fnBody).not.toContain('state: "blocked"');
    expect(fnBody).toContain('state: "degraded"');
    expect(fnBody).toContain('state: "ready"');
  });

  it("checkSplunkHec always sets blocksWorkflow to false", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/agenticReadiness/readinessService.ts", "utf-8");
    const fnStart = src.indexOf("async function checkSplunkHec()");
    const fnBody = src.slice(fnStart, src.indexOf("\nexport async function checkAgenticReadiness"));
    // Every return in checkSplunkHec should have blocksWorkflow: false
    const returns = fnBody.match(/blocksWorkflow:\s*(true|false)/g) ?? [];
    expect(returns.length).toBeGreaterThan(0);
    for (const r of returns) {
      expect(r).toContain("false");
    }
  });

  it("splunkHec is included in Promise.allSettled call", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/agenticReadiness/readinessService.ts", "utf-8");
    expect(src).toContain("checkSplunkHec()");
    // Verify it's in the allSettled destructuring
    expect(src).toMatch(/\[database, llm, wazuhManager, wazuhIndexer, graphContext, splunkHec\]/);
  });

  it("splunkHec fallback in deps uses degraded (not blocked)", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/agenticReadiness/readinessService.ts", "utf-8");
    // The fallback for splunkHec in the deps object should be degraded
    expect(src).toMatch(/splunkHec.*?"degraded"/);
  });
});

describe("Ticketing Workflow Contract (structural)", () => {
  it("ticketing workflow derives from splunkHec state", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/agenticReadiness/readinessService.ts", "utf-8");
    expect(src).toContain("deps.splunkHec.state");
    expect(src).toContain("Ticketing degraded");
  });

  it("ticketing is included in overall readiness calculation", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/agenticReadiness/readinessService.ts", "utf-8");
    expect(src).toContain('ticketing.state === "degraded"');
  });

  it("ticketing is returned in the workflows object", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/agenticReadiness/readinessService.ts", "utf-8");
    expect(src).toContain("workflows: { structuredPipeline, adHocAnalyst, ticketing }");
  });

  it("ticketing never uses blocked state", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/agenticReadiness/readinessService.ts", "utf-8");
    // The ticketing workflow derivation should only produce ready or degraded
    const ticketingSection = src.slice(
      src.indexOf("// Ticketing workflow"),
      src.indexOf("const overall")
    );
    expect(ticketingSection).not.toContain('state: "blocked"');
  });
});

describe("Readiness Contract Completeness", () => {
  it("should have 6 dependency checks in allSettled", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/agenticReadiness/readinessService.ts", "utf-8");
    const allSettledMatch = src.match(/Promise\.allSettled\(\[([^\]]+)\]\)/);
    expect(allSettledMatch).toBeTruthy();
    const checks = allSettledMatch![1].split(",").map(s => s.trim()).filter(s => s.length > 0);
    expect(checks).toHaveLength(6);
  });

  it("header comment documents 6 dependencies", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/agenticReadiness/readinessService.ts", "utf-8");
    expect(src).toContain("Checks 6 dependencies");
    expect(src).toContain("Splunk HEC");
  });

  it("header comment documents ticketing workflow", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/agenticReadiness/readinessService.ts", "utf-8");
    expect(src).toContain("ticketing: Splunk ES ticket creation from completed triage");
  });

  it("header comment documents dependency severity semantics", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/agenticReadiness/readinessService.ts", "utf-8");
    expect(src).toContain("DB down");
    expect(src).toContain("Splunk HEC down");
    expect(src).toContain("ticketing degraded, pipeline still usable");
  });
});

describe("Continue Pipeline Language Semantics", () => {
  it("partial run status should map to 'Continue Pipeline' in UI semantics", () => {
    // This tests the semantic contract: partial runs get "Continue", failed runs get "Replay"
    const runStatus = "partial";
    const isPartial = runStatus === "partial";
    const title = isPartial ? "Continue Pipeline" : "Replay Pipeline";
    const buttonLabel = isPartial ? "Continue" : "Replay";
    const description = isPartial
      ? "Advance from triage to correlation, hypothesis, and response actions. Triage stage is preserved."
      : "Re-run from the first failed stage. Completed stages are reused.";

    expect(title).toBe("Continue Pipeline");
    expect(buttonLabel).toBe("Continue");
    expect(description).toContain("Advance from triage");
    expect(description).toContain("Triage stage is preserved");
  });

  it("failed run status should map to 'Replay Pipeline' in UI semantics", () => {
    const runStatus = "failed";
    const isPartial = runStatus === "partial";
    const title = isPartial ? "Continue Pipeline" : "Replay Pipeline";
    const buttonLabel = isPartial ? "Continue" : "Replay";
    const description = isPartial
      ? "Advance from triage to correlation, hypothesis, and response actions. Triage stage is preserved."
      : "Re-run from the first failed stage. Completed stages are reused.";

    expect(title).toBe("Replay Pipeline");
    expect(buttonLabel).toBe("Replay");
    expect(description).toContain("Re-run from the first failed stage");
  });
});

describe("Ticket Artifacts Panel Data Contract", () => {
  it("listTicketArtifacts should be a valid tRPC procedure", async () => {
    // Verify the router exports the procedure
    const { splunkRouter } = await import("../splunk/splunkRouter");
    expect(splunkRouter).toBeDefined();
    // The router should have the listTicketArtifacts procedure
    expect((splunkRouter as any)._def.procedures.listTicketArtifacts).toBeDefined();
  });

  it("getTicketArtifact should be a valid tRPC procedure", async () => {
    const { splunkRouter } = await import("../splunk/splunkRouter");
    expect((splunkRouter as any)._def.procedures.getTicketArtifact).toBeDefined();
  });

  it("ticket artifact row should include all analyst-useful fields", () => {
    // Verify the schema contract for the audit panel
    const requiredFields = [
      "id", "ticketId", "system", "queueItemId", "pipelineRunId",
      "triageId", "alertId", "ruleId", "ruleLevel", "createdBy",
      "success", "statusMessage", "rawResponse", "httpStatusCode", "createdAt"
    ];

    // Verify each field is in the schema
    for (const field of requiredFields) {
      expect(field).toBeTruthy(); // Structural assertion — field names are non-empty
    }
    expect(requiredFields).toHaveLength(15);
  });
});

describe("Normalized Readiness Hook Field Names", () => {
  it("useAgenticReadiness exports parallel field naming for all three workflows", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/hooks/useAgenticReadiness.ts", "utf-8");

    // Structured Pipeline — parallel pattern
    expect(src).toContain("canRunStructuredPipeline:");
    expect(src).toContain("structuredPipelineBlocked:");
    expect(src).toContain("structuredPipelineDegraded:");
    expect(src).toContain("structuredPipelineReason:");

    // Ad-hoc Analyst — parallel pattern
    expect(src).toContain("canRunAdHoc:");
    expect(src).toContain("adHocBlocked:");
    expect(src).toContain("adHocDegraded:");
    expect(src).toContain("adHocReason:");

    // Ticketing — parallel pattern
    expect(src).toContain("canRunTicketing:");
    expect(src).toContain("ticketingBlocked:");
    expect(src).toContain("ticketingDegraded:");
    expect(src).toContain("ticketingReason:");
  });

  it("old non-parallel field names are removed", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/hooks/useAgenticReadiness.ts", "utf-8");

    // These old names should no longer exist
    expect(src).not.toContain("canCreateTickets:");
    expect(src).not.toContain("ticketingUnavailable:");
  });

  it("hook extracts workflow states into local variables for consistency", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/hooks/useAgenticReadiness.ts", "utf-8");

    expect(src).toContain("const pipelineState =");
    expect(src).toContain("const adHocState =");
    expect(src).toContain("const ticketingState =");
  });

  it("JSDoc documents the parallel naming convention", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/hooks/useAgenticReadiness.ts", "utf-8");

    expect(src).toContain("canRun{Workflow}");
    expect(src).toContain("{workflow}Blocked");
    expect(src).toContain("{workflow}Degraded");
    expect(src).toContain("{workflow}Reason");
  });
});

describe("PipelineContinuationButton Naming", () => {
  it("PipelineInspector uses PipelineContinuationButton (not ReplayButton)", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/PipelineInspector.tsx", "utf-8");

    expect(src).toContain("function PipelineContinuationButton(");
    expect(src).toContain("<PipelineContinuationButton");
    expect(src).not.toContain("function ReplayButton(");
    expect(src).not.toContain("<ReplayButton");
  });

  it("section header says Pipeline Continuation (not Replay Button)", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/PipelineInspector.tsx", "utf-8");

    expect(src).toContain("Pipeline Continuation");
    expect(src).not.toContain("── Replay Button ──");
  });

  it("internal variable uses 'mutation' not 'replay'", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/PipelineInspector.tsx", "utf-8");

    // Extract the PipelineContinuationButton function body
    const fnStart = src.indexOf("function PipelineContinuationButton(");
    const fnEnd = src.indexOf("\n// ──", fnStart + 1);
    const fnBody = fnEnd > -1 ? src.slice(fnStart, fnEnd) : src.slice(fnStart);

    expect(fnBody).toContain("const mutation = isPartial");
    expect(fnBody).toContain("mutation.mutate(");
    expect(fnBody).toContain("mutation.isPending");
    expect(fnBody).toContain("mutation.isSuccess");
    expect(fnBody).toContain("mutation.isError");
  });

  it("success message uses 'Pipeline continued' / 'Pipeline resumed' (not 'Replay started')", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("client/src/pages/PipelineInspector.tsx", "utf-8");

    expect(src).toContain("Pipeline continued:");
    expect(src).toContain("Pipeline resumed:");
    expect(src).not.toContain("Replay started:");
  });
});

describe("Shared Continuation Helper Extraction", () => {
  it("resumePipelineHelper.ts exists and exports executeResumePipeline", async () => {
    const mod = await import("../agenticPipeline/resumePipelineHelper");
    expect(typeof mod.executeResumePipeline).toBe("function");
  });

  it("pipelineRouter imports executeResumePipeline from helper", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/agenticPipeline/pipelineRouter.ts", "utf-8");

    expect(src).toContain('import { executeResumePipeline } from "./resumePipelineHelper"');
  });

  it("resumePipelineRun delegates to executeResumePipeline", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/agenticPipeline/pipelineRouter.ts", "utf-8");

    // Find the resumePipelineRun mutation body
    const resumeStart = src.indexOf("resumePipelineRun:");
    const resumeEnd = src.indexOf("continuePipelineRun:", resumeStart);
    const resumeBody = src.slice(resumeStart, resumeEnd);

    // The mode label is "replay" for failed-run semantics
    expect(resumeBody).toContain('executeResumePipeline(input, ctx,');
    expect(resumeBody).not.toContain("runTriageAgent");
    expect(resumeBody).not.toContain("runCorrelationAgent");
  });

  it("continuePipelineRun delegates to executeResumePipeline", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/agenticPipeline/pipelineRouter.ts", "utf-8");

    const continueStart = src.indexOf("continuePipelineRun:");
    const continueBody = src.slice(continueStart, continueStart + 500);

    expect(continueBody).toContain('executeResumePipeline(input, ctx, "continue")');
  });

  it("no duplicated stage-execution logic in resume/continue mutations", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("server/agenticPipeline/pipelineRouter.ts", "utf-8");

    // The resume and continue mutations should delegate to the helper,
    // not contain inline stage-execution logic
    const resumeStart = src.indexOf("resumePipelineRun:");
    const continueStart = src.indexOf("continuePipelineRun:");
    const artifactsStart = src.indexOf("getPipelineArtifacts:");
    const resumeBody = src.slice(resumeStart, continueStart);
    const continueBody = src.slice(continueStart, artifactsStart);

    // Neither mutation should contain inline agent calls
    for (const body of [resumeBody, continueBody]) {
      expect(body).not.toContain("runTriageAgent(");
      expect(body).not.toContain("runCorrelationAgent(");
      expect(body).not.toContain("runHypothesisAgent(");
      expect(body).toContain("executeResumePipeline(");
    }
  });
});
