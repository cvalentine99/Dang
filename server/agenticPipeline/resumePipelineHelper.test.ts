/**
 * Resume Pipeline Helper Integration Tests
 *
 * Tests the executeResumePipeline function:
 *   - Stage detection: auto-detects first failed or pending stage
 *   - Explicit fromStage override
 *   - Prerequisite validation (no triage ID for correlation, etc.)
 *   - Full pipeline resume from partial runs
 *   - Error handling for already-complete runs
 *
 * What is real:
 *   - The executeResumePipeline function
 *   - The database (real MySQL)
 *   - Stage detection logic
 *
 * What is mocked:
 *   - LLM, Wazuh, Indexer, OTX
 */
import { describe, it, expect, vi, beforeAll } from "vitest";

// ── Mock external services ──────────────────────────────────────────────────
const mockLLMResponse = vi.fn();
vi.mock("../llm/llmService", () => ({
  invokeLLMWithFallback: (...args: any[]) => mockLLMResponse(...args),
  getEffectiveLLMConfig: async () => ({ host: "mock", port: 0, model: "mock", enabled: true }),
  isCustomLLMEnabled: async () => true,
}));

vi.mock("../indexer/indexerClient", () => ({
  getEffectiveIndexerConfig: async () => ({ host: "mock", port: 9200, user: "admin", pass: "admin", protocol: "https" }),
  indexerSearch: async () => ({ hits: { hits: [], total: { value: 0 } } }),
  indexerGet: async () => ({}),
}));

vi.mock("../wazuh/wazuhClient", () => ({
  wazuhGet: async () => ({ data: { affected_items: [] } }),
  getEffectiveWazuhConfig: async () => ({ host: "mock", port: 55000, user: "admin", pass: "admin", protocol: "https" }),
}));

vi.mock("../threatIntel/otxService", () => ({
  otxGet: async () => ({}),
}));

const HAS_DB = !!process.env.DATABASE_URL;

// ── Fixtures ────────────────────────────────────────────────────────────────

const TRIAGE_LLM_RESPONSE = {
  choices: [{ message: { content: JSON.stringify({
    alertFamily: "brute_force",
    severity: "high",
    severityConfidence: 0.85,
    severityReasoning: "SSH brute force",
    entities: [{ type: "ip", value: "10.0.0.1", confidence: 1.0 }],
    mitreMapping: [{ techniqueId: "T1110", techniqueName: "Brute Force", tactic: "Credential Access", confidence: 0.9 }],
    dedup: { isDuplicate: false, similarityScore: 0.1, reasoning: "New alert" },
    route: "C_HIGH_CONFIDENCE",
    routeReasoning: "Clear brute force",
    summary: "SSH brute force from 10.0.0.1",
    uncertainties: [],
    caseLink: { shouldLink: false, confidence: 0.1, reasoning: "No match" },
  }) } }],
  usage: { prompt_tokens: 800, completion_tokens: 300 },
};

const CORRELATION_LLM_RESPONSE = {
  choices: [{ message: { content: JSON.stringify({
    schemaVersion: "1.0",
    correlationId: "x",
    correlatedAt: new Date().toISOString(),
    sourceTriageId: "x",
    relatedAlerts: [],
    discoveredEntities: [],
    vulnerabilityContext: [],
    fimContext: [],
    threatIntelMatches: [],
    priorInvestigations: [],
    blastRadius: { affectedHosts: 1, affectedUsers: 1, affectedAgentIds: ["001"], assetCriticality: "medium", confidence: 0.7 },
    campaignAssessment: { likelyCampaign: false, clusteredTechniques: [], confidence: 0.3, reasoning: "No campaign" },
    caseRecommendation: { action: "create_new", confidence: 0.8, reasoning: "New case" },
    synthesis: {
      narrative: "SSH brute force from 10.0.0.1",
      supportingEvidence: [{ id: "ev-1", label: "Alert", type: "alert", source: "wazuh_alert", data: {}, collectedAt: new Date().toISOString(), relevance: 1.0 }],
      conflictingEvidence: [],
      missingEvidence: [],
      confidence: 0.75,
    },
  }) } }],
  usage: { prompt_tokens: 1500, completion_tokens: 500 },
};

const HYPOTHESIS_LLM_RESPONSE = {
  choices: [{ message: { content: JSON.stringify({
    workingTheory: {
      statement: "SSH brute force attack",
      confidence: 0.85,
      supportingEvidence: ["Multiple failed attempts"],
      conflictingEvidence: [],
    },
    alternateTheories: [],
    evidenceGaps: [],
    suggestedNextSteps: [],
    recommendedActions: [],
    timelineSummary: [{ timestamp: new Date().toISOString(), event: "Brute force detected", source: "wazuh_alert", significance: "high" }],
    linkedEntities: [{ type: "ip", value: "10.0.0.1" }],
    draftDocumentation: { executiveSummary: "SSH brute force attack" },
  }) } }],
  usage: { prompt_tokens: 2000, completion_tokens: 800 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("executeResumePipeline — stage detection and resume", () => {
  /**
   * Helper: create a partial pipeline run (triage-only) by running triage
   * and inserting a pipeline_runs row with correlation/hypothesis pending.
   */
  async function createPartialRun(alertId: string) {
    const { runTriageAgent } = await import("./triageAgent");
    const { getDb } = await import("../db");
    const { pipelineRuns } = await import("../../drizzle/schema");

    mockLLMResponse.mockResolvedValueOnce(TRIAGE_LLM_RESPONSE);
    const triageResult = await runTriageAgent({
      rawAlert: {
        id: alertId,
        timestamp: new Date().toISOString(),
        rule: { id: "5710", level: 10, description: "SSH brute force" },
        agent: { id: "001", name: "test-host" },
        data: { srcip: "10.0.0.1" },
      },
      userId: 1,
    });

    const db = await getDb();
    const runId = `test-partial-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    await db!.insert(pipelineRuns).values({
      runId,
      alertId,
      currentStage: "correlation",
      status: "partial",
      triggeredBy: "user:1",
      triageId: triageResult.triageId,
      triageStatus: "completed",
      triageLatencyMs: triageResult.latencyMs,
      correlationStatus: "pending",
      hypothesisStatus: "pending",
    });

    return { runId, triageId: triageResult.triageId! };
  }

  /**
   * Helper: create a failed pipeline run (correlation failed).
   */
  async function createFailedCorrelationRun(alertId: string) {
    const { runTriageAgent } = await import("./triageAgent");
    const { getDb } = await import("../db");
    const { pipelineRuns } = await import("../../drizzle/schema");

    mockLLMResponse.mockResolvedValueOnce(TRIAGE_LLM_RESPONSE);
    const triageResult = await runTriageAgent({
      rawAlert: {
        id: alertId,
        timestamp: new Date().toISOString(),
        rule: { id: "5710", level: 10, description: "SSH brute force" },
        agent: { id: "001", name: "test-host" },
        data: { srcip: "10.0.0.1" },
      },
      userId: 1,
    });

    const db = await getDb();
    const runId = `test-failed-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    await db!.insert(pipelineRuns).values({
      runId,
      alertId,
      currentStage: "correlation",
      status: "failed",
      triggeredBy: "user:1",
      triageId: triageResult.triageId,
      triageStatus: "completed",
      triageLatencyMs: triageResult.latencyMs,
      correlationStatus: "failed",
      hypothesisStatus: "pending",
      error: "Simulated correlation failure",
    });

    return { runId, triageId: triageResult.triageId! };
  }

  it.skipIf(!HAS_DB)(
    "resumes a partial run from correlation stage (auto-detected)",
    async () => {
      const { executeResumePipeline } = await import("./resumePipelineHelper");
      const { runId } = await createPartialRun("resume-auto-1");

      // Mock correlation + hypothesis LLM calls
      mockLLMResponse.mockResolvedValueOnce(CORRELATION_LLM_RESPONSE);
      mockLLMResponse.mockResolvedValueOnce(HYPOTHESIS_LLM_RESPONSE);

      const result = await executeResumePipeline(
        { runId },
        { user: { id: 1 } },
        "continue",
      );

      expect(result.status).toBe("completed");
      expect(result.startedFromStage).toBe("correlation");
      expect(result.stages.triage.status).toBe("completed");
      expect(result.stages.triage.reused).toBe(true);
      expect(result.stages.correlation.status).toBe("completed");
      expect(result.stages.hypothesis.status).toBe("completed");
      expect(result.totalLatencyMs).toBeGreaterThan(0);
    }
  );

  it.skipIf(!HAS_DB)(
    "resumes a failed run from the failed stage (auto-detected)",
    async () => {
      const { executeResumePipeline } = await import("./resumePipelineHelper");
      const { runId } = await createFailedCorrelationRun("resume-failed-1");

      // Mock correlation + hypothesis LLM calls
      mockLLMResponse.mockResolvedValueOnce(CORRELATION_LLM_RESPONSE);
      mockLLMResponse.mockResolvedValueOnce(HYPOTHESIS_LLM_RESPONSE);

      const result = await executeResumePipeline(
        { runId },
        { user: { id: 1 } },
        "replay",
      );

      expect(result.status).toBe("completed");
      expect(result.startedFromStage).toBe("correlation");
      expect(result.stages.triage.reused).toBe(true);
      expect(result.stages.correlation.status).toBe("completed");
      expect(result.stages.hypothesis.status).toBe("completed");
    }
  );

  it.skipIf(!HAS_DB)(
    "uses explicit fromStage override when provided",
    async () => {
      const { executeResumePipeline } = await import("./resumePipelineHelper");
      const { runId } = await createPartialRun("resume-explicit-1");

      // Mock correlation + hypothesis LLM calls
      mockLLMResponse.mockResolvedValueOnce(CORRELATION_LLM_RESPONSE);
      mockLLMResponse.mockResolvedValueOnce(HYPOTHESIS_LLM_RESPONSE);

      const result = await executeResumePipeline(
        { runId, fromStage: "correlation" },
        { user: { id: 1 } },
        "replay",
      );

      expect(result.startedFromStage).toBe("correlation");
      expect(result.status).toBe("completed");
    }
  );

  it.skipIf(!HAS_DB)(
    "throws when run ID does not exist",
    async () => {
      const { executeResumePipeline } = await import("./resumePipelineHelper");

      await expect(
        executeResumePipeline(
          { runId: "nonexistent-run-id" },
          { user: { id: 1 } },
        ),
      ).rejects.toThrow(/not found/i);
    }
  );

  it.skipIf(!HAS_DB)(
    "throws when trying to resume a currently running pipeline",
    async () => {
      const { executeResumePipeline } = await import("./resumePipelineHelper");
      const { getDb } = await import("../db");
      const { pipelineRuns } = await import("../../drizzle/schema");

      const db = await getDb();
      const runId = `test-running-${Date.now().toString(36)}`;

      await db!.insert(pipelineRuns).values({
        runId,
        alertId: "running-test-1",
        currentStage: "triage",
        status: "running",
        triggeredBy: "user:1",
        triageStatus: "running",
      });

      await expect(
        executeResumePipeline(
          { runId },
          { user: { id: 1 } },
        ),
      ).rejects.toThrow(/currently running/i);
    }
  );

  it.skipIf(!HAS_DB)(
    "throws when all stages are already completed (no actionable stage)",
    async () => {
      const { executeResumePipeline } = await import("./resumePipelineHelper");
      const { getDb } = await import("../db");
      const { pipelineRuns } = await import("../../drizzle/schema");

      const db = await getDb();
      const runId = `test-complete-${Date.now().toString(36)}`;

      await db!.insert(pipelineRuns).values({
        runId,
        alertId: "complete-test-1",
        currentStage: "completed",
        status: "completed",
        triggeredBy: "user:1",
        triageId: "triage-complete-1",
        triageStatus: "completed",
        correlationId: "corr-complete-1",
        correlationStatus: "completed",
        hypothesisStatus: "completed",
        responseActionsStatus: "completed",
      });

      await expect(
        executeResumePipeline(
          { runId },
          { user: { id: 1 } },
        ),
      ).rejects.toThrow(/already completed/i);
    }
  );

  it.skipIf(!HAS_DB)(
    "throws when resuming from hypothesis without correlation ID",
    async () => {
      const { executeResumePipeline } = await import("./resumePipelineHelper");
      const { getDb } = await import("../db");
      const { pipelineRuns } = await import("../../drizzle/schema");

      const db = await getDb();
      const runId = `test-no-corr-${Date.now().toString(36)}`;

      await db!.insert(pipelineRuns).values({
        runId,
        alertId: "no-corr-test-1",
        currentStage: "hypothesis",
        status: "partial",
        triggeredBy: "user:1",
        triageId: "triage-no-corr-1",
        triageStatus: "completed",
        correlationId: null,
        correlationStatus: "failed",
        hypothesisStatus: "pending",
      });

      await expect(
        executeResumePipeline(
          { runId, fromStage: "hypothesis" },
          { user: { id: 1 } },
        ),
      ).rejects.toThrow(/no correlation ID/i);
    }
  );

  it.skipIf(!HAS_DB)(
    "creates a new pipeline_runs row with correct prefix",
    async () => {
      const { executeResumePipeline } = await import("./resumePipelineHelper");
      const { runId } = await createPartialRun("resume-prefix-1");

      mockLLMResponse.mockResolvedValueOnce(CORRELATION_LLM_RESPONSE);
      mockLLMResponse.mockResolvedValueOnce(HYPOTHESIS_LLM_RESPONSE);

      const result = await executeResumePipeline(
        { runId },
        { user: { id: 1 } },
        "continue",
      );

      expect(result.resumedRunId).toMatch(/^continue-/);
      expect(result.originalRunId).toBe(runId);
    }
  );

  it.skipIf(!HAS_DB)(
    "replay prefix is used for replay mode",
    async () => {
      const { executeResumePipeline } = await import("./resumePipelineHelper");
      const { runId } = await createFailedCorrelationRun("resume-replay-prefix-1");

      mockLLMResponse.mockResolvedValueOnce(CORRELATION_LLM_RESPONSE);
      mockLLMResponse.mockResolvedValueOnce(HYPOTHESIS_LLM_RESPONSE);

      const result = await executeResumePipeline(
        { runId },
        { user: { id: 1 } },
        "replay",
      );

      expect(result.resumedRunId).toMatch(/^replay-/);
    }
  );
});
