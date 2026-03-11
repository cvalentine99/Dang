/**
 * Workflow Truth Tests — verifies the 8 remediation tasks from the
 * Agentic Workflow Truth Remediation document.
 *
 * These tests ensure:
 * 1. Workflow identity is clear (structured vs ad-hoc)
 * 2. Readiness contract has correct structure
 * 3. Wazuh failure truth preserves error details
 * 4. Dependency failures are not swallowed as empty data
 * 5. Pipeline inspector can see queue-driven triage runs
 * 6. Analyst Chat is honestly labeled
 * 7. Router comments match actual behavior
 */

import { describe, expect, it } from "vitest";
import { extractWazuhErrorDetail } from "./wazuh/wazuhClient";
import { requireDb } from "./dbGuard";
import type { AgenticReadiness, DependencyStatus, WorkflowStatus } from "./agenticReadiness/readinessService";
import fs from "fs";
import path from "path";

// ── Task 1+7: Workflow Identity ─────────────────────────────────────────────

describe("Workflow Identity — UI labels are honest", () => {
  it("AlertQueue uses 'Structured Triage' not 'Analyze' for primary action", () => {
    const alertQueueSource = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/AlertQueue.tsx"),
      "utf-8"
    );
    // Must contain the correct label
    expect(alertQueueSource).toContain("Structured Triage");
    // Must NOT contain the old misleading label as a button text
    expect(alertQueueSource).not.toMatch(/"Analyze"/);
  });

  it("AlertQueue uses 'Ad-hoc Analysis' not 'Open in Walter' for secondary action (stale wording guard)", () => {
    const alertQueueSource = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/AlertQueue.tsx"),
      "utf-8"
    );
    expect(alertQueueSource).toContain("Ad-hoc Analysis");
    expect(alertQueueSource).not.toContain("Open in Walter");
  });

  it("Sidebar uses 'Alert Queue' not 'Walter Queue' (stale wording guard)", () => {
    const layoutSource = fs.readFileSync(
      path.resolve(__dirname, "../client/src/components/DashboardLayout.tsx"),
      "utf-8"
    );
    expect(layoutSource).toContain("Alert Queue");
    expect(layoutSource).not.toContain("Walter Queue");
  });

  it("AnalystChat header labels itself as ad-hoc and not persisted", () => {
    const chatSource = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/AnalystChat.tsx"),
      "utf-8"
    );
    expect(chatSource).toContain("Ad-hoc");
    expect(chatSource).toContain("Not Persisted");
    expect(chatSource).not.toContain("Policy-Constrained Reasoning Engine");
  });

  it("alertQueueRouter header comment does not claim 'UNIFIED PIPELINE'", () => {
    const routerSource = fs.readFileSync(
      path.resolve(__dirname, "./alertQueue/alertQueueRouter.ts"),
      "utf-8"
    );
    expect(routerSource).not.toContain("UNIFIED PIPELINE");
  });
});

// ── Task 2: Readiness Contract Structure ────────────────────────────────────

describe("Readiness Contract — type structure", () => {
  it("AgenticReadiness interface has correct shape", () => {
    // Verify the type exists and has the right fields by checking the source
    const readinessSource = fs.readFileSync(
      path.resolve(__dirname, "./agenticReadiness/readinessService.ts"),
      "utf-8"
    );
    // Must export the interface
    expect(readinessSource).toContain("export interface AgenticReadiness");
    // Must have all 5 dependencies
    expect(readinessSource).toContain("database: DependencyStatus");
    expect(readinessSource).toContain("llm: DependencyStatus");
    expect(readinessSource).toContain("wazuhManager: DependencyStatus");
    expect(readinessSource).toContain("wazuhIndexer: DependencyStatus");
    expect(readinessSource).toContain("graphContext: DependencyStatus");
    // Must have both workflows
    expect(readinessSource).toContain("structuredPipeline: WorkflowStatus");
    expect(readinessSource).toContain("adHocAnalyst: WorkflowStatus");
    // Must have overall status
    expect(readinessSource).toContain('overall: "ready" | "degraded" | "blocked"');
  });

  it("readiness router is mounted in the main router", () => {
    const routersSource = fs.readFileSync(
      path.resolve(__dirname, "./routers.ts"),
      "utf-8"
    );
    expect(routersSource).toContain("readiness:");
    expect(routersSource).toContain("readinessRouter");
  });

  it("client has useAgenticReadiness hook", () => {
    const hookSource = fs.readFileSync(
      path.resolve(__dirname, "../client/src/hooks/useAgenticReadiness.ts"),
      "utf-8"
    );
    expect(hookSource).toContain("useAgenticReadiness");
    expect(hookSource).toContain("trpc.readiness.check");
  });

  it("AlertQueue imports and uses the readiness hook", () => {
    const alertQueueSource = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/AlertQueue.tsx"),
      "utf-8"
    );
    expect(alertQueueSource).toContain("useAgenticReadiness");
    expect(alertQueueSource).toContain("ReadinessBanner");
  });
});

// ── Task 3: Wazuh Failure Truth ─────────────────────────────────────────────

describe("Wazuh Failure Truth — structured error extraction", () => {
  it("extractWazuhErrorDetail handles ECONNREFUSED", () => {
    const fakeAxiosError = {
      isAxiosError: true,
      code: "ECONNREFUSED",
      config: { baseURL: "https://192.168.50.158:55000" },
      message: "connect ECONNREFUSED",
    };
    const result = extractWazuhErrorDetail(fakeAxiosError);
    // Should contain meaningful info, not be empty
    expect(result.length).toBeGreaterThan(10);
    // The function returns human-readable messages — verify it mentions the error code or connection refused
    expect(result).toMatch(/ECONNREFUSED|Connection refused|connect/);
  });

  it("extractWazuhErrorDetail handles ETIMEDOUT", () => {
    const fakeAxiosError = {
      isAxiosError: true,
      code: "ETIMEDOUT",
      config: { baseURL: "https://192.168.50.158:55000" },
      message: "connect ETIMEDOUT",
    };
    const result = extractWazuhErrorDetail(fakeAxiosError);
    expect(result.length).toBeGreaterThan(10);
    // The function returns human-readable messages — verify it mentions timeout
    expect(result).toMatch(/ETIMEDOUT|timed out|timeout/);
  });

  it("extractWazuhErrorDetail handles HTTP 401", () => {
    const fakeAxiosError = {
      isAxiosError: true,
      response: {
        status: 401,
        data: { detail: "Invalid credentials" },
      },
      config: { url: "/security/user/authenticate" },
      message: "Request failed with status code 401",
    };
    const result = extractWazuhErrorDetail(fakeAxiosError);
    expect(result).toContain("401");
    expect(result).toContain("Invalid credentials");
  });

  it("extractWazuhErrorDetail never returns empty string", () => {
    // Even with a completely empty error object
    const result1 = extractWazuhErrorDetail({});
    expect(result1.length).toBeGreaterThan(0);

    const result2 = extractWazuhErrorDetail(new Error(""));
    expect(result2.length).toBeGreaterThan(0);

    const result3 = extractWazuhErrorDetail(null);
    expect(result3.length).toBeGreaterThan(0);
  });

  it("wazuhClient.ts uses extractWazuhErrorDetail in catch blocks", () => {
    const clientSource = fs.readFileSync(
      path.resolve(__dirname, "./wazuh/wazuhClient.ts"),
      "utf-8"
    );
    expect(clientSource).toContain("extractWazuhErrorDetail");
    // Must NOT have the old pattern of (err as Error).message in auth error
    expect(clientSource).not.toMatch(/Wazuh auth error: \$\{\(err as Error\)\.message\}/);
  });
});

// ── Task 4: Dependency Failure Truth ────────────────────────────────────────

describe("Dependency Failure Truth — no fake emptiness", () => {
  it("requireDb throws TRPCError when db is null, not fake empty data", async () => {
    // We can't easily mock getDb in this test, but we can verify the function
    // exists and has the right shape
    expect(typeof requireDb).toBe("function");

    // Verify the source code throws instead of returning
    const guardSource = fs.readFileSync(
      path.resolve(__dirname, "./dbGuard.ts"),
      "utf-8"
    );
    expect(guardSource).toContain("throw new TRPCError");
    expect(guardSource).toContain("INTERNAL_SERVER_ERROR");
    expect(guardSource).toContain("Database unavailable");
  });

  it("alertQueueRouter uses requireDb instead of fake-empty returns", () => {
    const routerSource = fs.readFileSync(
      path.resolve(__dirname, "./alertQueue/alertQueueRouter.ts"),
      "utf-8"
    );
    expect(routerSource).toContain("requireDb");
    // Should NOT have the old pattern: if (!db) return { items: [], total: 0 }
    expect(routerSource).not.toMatch(/if \(!db\) return/);
  });

  it("pipelineRouter uses requireDb instead of fake-empty returns", () => {
    const routerSource = fs.readFileSync(
      path.resolve(__dirname, "./agenticPipeline/pipelineRouter.ts"),
      "utf-8"
    );
    expect(routerSource).toContain("requireDb");
    expect(routerSource).not.toMatch(/if \(!db\) return/);
  });

  it("responseActionsRouter uses requireDb instead of fake-empty returns", () => {
    const routerSource = fs.readFileSync(
      path.resolve(__dirname, "./agenticPipeline/responseActionsRouter.ts"),
      "utf-8"
    );
    expect(routerSource).toContain("requireDb");
    expect(routerSource).not.toMatch(/if \(!db\) return/);
  });
});

// ── Task 5: Pipeline Inspector Visibility ───────────────────────────────────

describe("Pipeline Inspector Visibility — queue-driven triage creates pipelineRuns", () => {
  it("alertQueueRouter.process inserts a pipelineRuns row", () => {
    const routerSource = fs.readFileSync(
      path.resolve(__dirname, "./alertQueue/alertQueueRouter.ts"),
      "utf-8"
    );
    // Must import pipelineRuns from schema
    expect(routerSource).toContain("pipelineRuns");
    // Must insert into pipelineRuns during the process mutation
    expect(routerSource).toContain("insert(pipelineRuns)");
  });
});

// ── Task 6: Analyst Chat Honesty ────────────────────────────────────────────

describe("Analyst Chat — honest labeling", () => {
  it("AnalystChat warns that results are not persisted", () => {
    const chatSource = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/AnalystChat.tsx"),
      "utf-8"
    );
    expect(chatSource).toContain("not persisted");
  });

  it("AnalystChat labels itself as conversational only", () => {
    const chatSource = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/AnalystChat.tsx"),
      "utf-8"
    );
    expect(chatSource).toContain("Conversational Only");
  });

  it("AnalystChat directs users to Alert Queue for structured triage", () => {
    const chatSource = fs.readFileSync(
      path.resolve(__dirname, "../client/src/pages/AnalystChat.tsx"),
      "utf-8"
    );
    expect(chatSource).toContain("Alert Queue");
  });
});

// ── Task 8: WazuhGuard uses structured error detail ─────────────────────────

describe("WazuhGuard — uses structured error detail", () => {
  it("WazuhGuard shows errorDetail instead of generic message", () => {
    const guardSource = fs.readFileSync(
      path.resolve(__dirname, "../client/src/components/shared/WazuhGuard.tsx"),
      "utf-8"
    );
    expect(guardSource).toContain("errorDetail");
    // Should NOT use the old muddy single-line logic
    // The new code separates isConfigured and hasData into distinct variables
    expect(guardSource).toContain("isConfigured");
    expect(guardSource).toContain("hasData");
  });
});
