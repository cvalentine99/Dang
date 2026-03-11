/**
 * Pipeline Integration Test — Full triage → correlation → hypothesis flow
 *
 * Runs the complete 3-stage agentic pipeline end-to-end against the real DB
 * with mocked LLM and external services. Validates:
 *   - Triage creates a valid triage object in the DB
 *   - Correlation reads the triage and creates a correlation bundle
 *   - Hypothesis reads the bundle and creates an investigation session + living case
 *   - No null-serialization issues on any insert
 *   - All FK references are valid
 *   - Response actions are materialized correctly
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
  getEffectiveIndexerConfig: async () => ({
    host: "mock", port: 9200, user: "admin", pass: "admin", protocol: "https",
  }),
  indexerSearch: async () => ({ hits: { hits: [], total: { value: 0 } } }),
  indexerGet: async () => ({}),
  INDEX_PATTERNS: { ALERTS: "wazuh-alerts-*" },
  timeRangeFilter: () => ({}),
  boolQuery: () => ({}),
}));
vi.mock("../wazuh/wazuhClient", () => ({
  wazuhGet: async () => ({ data: { affected_items: [] } }),
  getEffectiveWazuhConfig: async () => ({
    host: "mock", port: 55000, user: "admin", pass: "admin", protocol: "https",
  }),
}));
vi.mock("../otx/otxClient", () => ({
  otxGet: async () => ({}),
  isOtxConfigured: () => false,
}));

const HAS_DB = !!process.env.DATABASE_URL;

// ── LLM Response Fixtures ───────────────────────────────────────────────────

function makeTriageLLMResponse() {
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          severity: "high",
          alertFamily: "brute_force",
          summary: "Repeated SSH authentication failures from 192.168.50.158 targeting gx10-beta, indicating a brute-force attack.",
          isFalsePositive: false,
          falsePositiveReason: null,
          entities: [
            { type: "ip", value: "192.168.50.158", role: "attacker", context: "Source of brute-force attempts" },
            { type: "host", value: "gx10-beta", role: "target", context: "Target of SSH brute-force" },
          ],
          mitre: {
            techniqueId: "T1110",
            techniqueName: "Brute Force",
            tactic: "Credential Access",
          },
          rawAlert: {},
          agent: { id: "003", name: "gx10-beta", ip: "192.168.50.54" },
          rule: { id: "2502", description: "sshd: authentication failed", level: 10 },
          timestamp: new Date().toISOString(),
        }),
      },
    }],
    usage: { total_tokens: 500 },
  };
}

function makeCorrelationLLMResponse(triageId = "triage-placeholder") {
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          correlationId: `corr-test-${Date.now()}`,
          sourceTriageId: triageId,
          relatedAlerts: [],
          discoveredEntities: [
            { type: "ip", value: "192.168.50.158", confidence: 0.95, source: "triage" },
            { type: "host", value: "gx10-beta", confidence: 0.95, source: "triage" },
          ],
          blastRadius: {
            affectedHosts: ["gx10-beta"],
            affectedUsers: ["root"],
            affectedServices: ["sshd"],
            assetCriticality: "medium",
          },
          campaignAssessment: {
            likelyCampaign: false,
            campaignName: null,
            confidence: 0.2,
            reasoning: "Isolated brute-force event with no correlated lateral movement.",
            indicators: [],
          },
          caseRecommendation: {
            action: "create_new",
            mergeTargetId: null,
            mergeTargetTitle: null,
            reasoning: "No existing investigation matches this alert pattern",
            confidence: 0.8,
          },
          riskScore: 65,
          summary: "Isolated SSH brute-force from 192.168.50.158 targeting gx10-beta.",
          evidenceSummary: "Multiple failed SSH logins detected by rule 2502.",
          inferenceSummary: "Likely external attacker; no lateral movement observed.",
          uncertainties: [
            { description: "No EDR data", impact: "Cannot confirm compromise", suggestedAction: "Check endpoint logs" },
          ],
          confidence: 0.7,
          mitreMapping: [
            { techniqueId: "T1110", techniqueName: "Brute Force", tactic: "Credential Access", confidence: 0.9 },
          ],
        }),
      },
    }],
    usage: { total_tokens: 400 },
  };
}

function makeHypothesisLLMResponse() {
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          workingTheory: {
            statement: "External attacker attempting SSH brute-force against gx10-beta from 192.168.50.158",
            confidence: 0.85,
            supportingEvidence: ["Multiple failed SSH logins", "Known attack pattern"],
            conflictingEvidence: [],
          },
          alternateTheories: [
            {
              statement: "Misconfigured automation script causing repeated auth failures",
              confidence: 0.15,
              supportingEvidence: ["Internal IP range"],
              conflictingEvidence: ["Pattern matches brute-force"],
            },
          ],
          evidenceGaps: [
            { description: "No EDR telemetry from gx10-beta", impact: "Cannot confirm if any login succeeded" },
          ],
          suggestedNextSteps: [
            { action: "Check auth.log on gx10-beta for successful logins", priority: "high", reasoning: "Determine if brute-force succeeded" },
          ],
          recommendedActions: [
            {
              action: "Block 192.168.50.158 at firewall",
              category: "block_ip",
              urgency: "immediate",
              targetType: "ip",
              targetValue: "192.168.50.158",
              requiresApproval: true,
              justification: "Active brute-force source",
            },
          ],
          timelineReconstruction: [
            {
              timestamp: new Date().toISOString(),
              event: "SSH brute-force detected",
              source: "Wazuh",
              significance: "Initial detection",
            },
          ],
          entities: [
            { type: "ip", value: "192.168.50.158", role: "attacker" },
            { type: "host", value: "gx10-beta", role: "target" },
          ],
        }),
      },
    }],
    usage: { total_tokens: 800 },
  };
}

// ── Raw Wazuh Alert Fixture ─────────────────────────────────────────────────

const RAW_ALERT = {
  _id: `integration-test-${Date.now()}`,
  timestamp: new Date().toISOString(),
  rule: {
    id: "2502",
    description: "sshd: authentication failed",
    level: 10,
    mitre: {
      id: ["T1110"],
      tactic: ["Credential Access"],
      technique: ["Brute Force"],
    },
    groups: ["syslog", "sshd", "authentication_failed"],
  },
  agent: {
    id: "003",
    name: "gx10-beta",
    ip: "192.168.50.54",
  },
  data: {
    srcip: "192.168.50.158",
    dstuser: "root",
  },
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Pipeline Integration — triage → correlation → hypothesis", () => {
  beforeAll(() => {
    if (!HAS_DB) return;
  });

  it.skipIf(!HAS_DB)("runs the full 3-stage pipeline end-to-end", async () => {
    // Configure LLM mock to return stage-appropriate responses
    let callCount = 0;
    mockLLMResponse.mockImplementation(async (opts: any) => {
      callCount++;
      const callerHint = opts?.caller ?? "";
      if (callerHint.includes("triage") || callCount === 1) {
        return makeTriageLLMResponse();
      }
      if (callerHint.includes("correlation") || callCount === 2) {
        return makeCorrelationLLMResponse();
      }
      // Hypothesis (call 3+)
      return makeHypothesisLLMResponse();
    });

    // ── Stage 1: Triage ──────────────────────────────────────────────────
    const { runTriageAgent } = await import("./triageAgent");
    const triageResult = await runTriageAgent({
      rawAlert: RAW_ALERT,
      userId: 1,
    });

    expect(triageResult.success).toBe(true);
    expect(triageResult.triageId).toBeDefined();
    expect(triageResult.triageId).toMatch(/^triage-/);
    expect(triageResult.latencyMs).toBeGreaterThanOrEqual(0);

    // Verify triage row exists in DB
    const { getDb } = await import("../db");
    const { triageObjects, correlationBundles, investigationSessions, livingCaseState, responseActions } =
      await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    expect(db).toBeTruthy();

    const [triageRow] = await db!.select()
      .from(triageObjects)
      .where(eq(triageObjects.triageId, triageResult.triageId!))
      .limit(1);

    expect(triageRow).toBeDefined();
    expect(triageRow.status).toBe("completed");
    expect(triageRow.alertId).toBeTruthy();

    // ── Stage 2: Correlation ─────────────────────────────────────────────
    const { runCorrelationAgent } = await import("./correlationAgent");
    const corrResult = await runCorrelationAgent({
      triageId: triageResult.triageId!,
    });

    expect(corrResult.correlationId).toBeDefined();
    expect(corrResult.correlationId).toMatch(/^corr-/);
    expect(corrResult.latencyMs).toBeGreaterThanOrEqual(0);

    // Verify correlation bundle exists in DB
    const [corrRow] = await db!.select()
      .from(correlationBundles)
      .where(eq(correlationBundles.correlationId, corrResult.correlationId))
      .limit(1);

    expect(corrRow).toBeDefined();
    expect(corrRow.status).toBe("completed");
    expect(corrRow.sourceTriageId).toBe(triageResult.triageId);

    // ── Stage 3: Hypothesis ──────────────────────────────────────────────
    const { runHypothesisAgent } = await import("./hypothesisAgent");
    const hypoResult = await runHypothesisAgent({
      correlationId: corrResult.correlationId,
    });

    expect(hypoResult.caseId).toBeDefined();
    expect(hypoResult.caseId).toBeGreaterThan(0);
    expect(hypoResult.sessionId).toBeDefined();
    expect(hypoResult.sessionId).toBeGreaterThan(0);
    expect(hypoResult.latencyMs).toBeGreaterThanOrEqual(0);
    expect(hypoResult.livingCase).toBeDefined();
    expect(hypoResult.livingCase.workingTheory).toBeDefined();

    // ── Verify investigation session (no null-serialization) ─────────────
    const [sessionRow] = await db!.select()
      .from(investigationSessions)
      .where(eq(investigationSessions.id, hypoResult.sessionId))
      .limit(1);

    expect(sessionRow).toBeDefined();
    expect(sessionRow.status).toBe("active");
    expect(sessionRow.title).toBeTruthy();
    // userId should be NULL (system-created), not empty string
    expect(sessionRow.userId).toBeNull();

    // ── Verify living case state ─────────────────────────────────────────
    const [caseRow] = await db!.select()
      .from(livingCaseState)
      .where(eq(livingCaseState.id, hypoResult.caseId))
      .limit(1);

    expect(caseRow).toBeDefined();
    expect(caseRow.sessionId).toBe(hypoResult.sessionId);
    expect(caseRow.sourceCorrelationId).toBe(corrResult.correlationId);

    // ── Verify response actions materialized ─────────────────────────────
    const actionRows = await db!.select()
      .from(responseActions)
      .where(eq(responseActions.caseId, hypoResult.caseId));

    // The hypothesis LLM response includes 1 recommended action
    expect(actionRows.length).toBeGreaterThanOrEqual(1);
    expect(actionRows[0].state).toBe("proposed");
    // The hypothesis agent maps the LLM category to a valid DB enum value
    expect(actionRows[0].category).toBeTruthy();
    expect(actionRows[0].proposedBy).toBe("hypothesis_agent");
    expect(actionRows[0].targetValue).toBe("192.168.50.158");

    // ── Verify no null-serialization: all int FK columns are either valid ints or actual NULL ──
    expect(sessionRow.userId === null || typeof sessionRow.userId === "number").toBe(true);
    expect(caseRow.sessionId === null || typeof caseRow.sessionId === "number").toBe(true);
    for (const action of actionRows) {
      expect(action.caseId === null || typeof action.caseId === "number").toBe(true);
    }
  }, 30_000);

  it.skipIf(!HAS_DB)("creates distinct triage IDs for separate alerts", async () => {
    mockLLMResponse.mockImplementation(async () => makeTriageLLMResponse());

    const { runTriageAgent } = await import("./triageAgent");

    const result1 = await runTriageAgent({
      rawAlert: { ...RAW_ALERT, _id: `distinct-test-1-${Date.now()}` },
      userId: 1,
    });
    const result2 = await runTriageAgent({
      rawAlert: { ...RAW_ALERT, _id: `distinct-test-2-${Date.now()}` },
      userId: 1,
    });

    expect(result1.triageId).not.toBe(result2.triageId);
    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
  }, 15_000);

  it.skipIf(!HAS_DB)("hypothesis agent creates session without userId (null-serialization regression)", async () => {
    // This test specifically validates the fix for the investigation_sessions insert bug
    // where Drizzle serialized userId: null as empty string
    let callCount = 0;
    mockLLMResponse.mockImplementation(async (opts: any) => {
      callCount++;
      const callerHint = opts?.caller ?? "";
      if (callerHint.includes("triage") || callCount === 1) return makeTriageLLMResponse();
      if (callerHint.includes("correlation") || callCount === 2) return makeCorrelationLLMResponse();
      return makeHypothesisLLMResponse();
    });

    const { runTriageAgent } = await import("./triageAgent");
    const { runCorrelationAgent } = await import("./correlationAgent");
    const { runHypothesisAgent } = await import("./hypothesisAgent");

    const triage = await runTriageAgent({
      rawAlert: { ...RAW_ALERT, _id: `null-regression-${Date.now()}` },
      userId: 1,
    });
    const corr = await runCorrelationAgent({ triageId: triage.triageId! });
    const hypo = await runHypothesisAgent({ correlationId: corr.correlationId });

    // The critical assertion: userId must be actual NULL, not empty string
    const { getDb } = await import("../db");
    const { investigationSessions } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();

    const [session] = await db!.select()
      .from(investigationSessions)
      .where(eq(investigationSessions.id, hypo.sessionId))
      .limit(1);

    expect(session).toBeDefined();
    // This was the bug: userId was "" instead of null
    expect(session.userId).toBeNull();
    expect(session.title).toBeTruthy();
    expect(session.status).toBe("active");
  }, 30_000);
});
