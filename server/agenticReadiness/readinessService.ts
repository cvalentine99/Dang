/**
 * Agentic Readiness Service — Central pre-flight check for all agentic workflows.
 *
 * Checks 6 dependencies:
 *   1. Database — required by both workflows (blocker)
 *   2. LLM — required by both workflows, custom or built-in fallback (blocker)
 *   3. Wazuh Manager — required for structured pipeline, used by ad-hoc (degraded)
 *   4. Wazuh Indexer — used by correlation and ad-hoc retrieval (degraded)
 *   5. Graph Context — used by ad-hoc analyst only (degraded)
 *   6. Splunk HEC — used by ticketing only (degraded, never blocks pipeline)
 *
 * Derives workflow-level readiness:
 *   - structuredPipeline: triage -> correlation -> hypothesis -> living case
 *   - adHocAnalyst: AI conversational analysis (ad-hoc, not persisted)
 *   - ticketing: Splunk ES ticket creation from completed triage
 *
 * Dependency severity semantics:
 *   - DB down → blocked
 *   - LLM down → blocked/degraded depending on fallback
 *   - Wazuh down → degraded
 *   - Splunk HEC down → ticketing degraded, pipeline still usable
 */

import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { getEffectiveLLMConfig } from "../llm/llmService";
import { getEffectiveWazuhConfig, wazuhGet } from "../wazuh/wazuhClient";
import { getEffectiveIndexerConfig, indexerHealth } from "../indexer/indexerClient";
import { getGraphStats } from "../graph/graphQueryService";
import { getEffectiveSplunkConfig, testSplunkConnection } from "../splunk/splunkService";

export interface DependencyStatus {
  state: "ready" | "degraded" | "blocked";
  reason: string | null;
  fallbackActive: boolean;
  blocksWorkflow: boolean;
  lastChecked: string;
}

export interface WorkflowStatus {
  state: "ready" | "degraded" | "blocked";
  reason: string | null;
  blockedBy: string[];
}

export interface AgenticReadiness {
  overall: "ready" | "degraded" | "blocked";
  timestamp: string;
  dependencies: {
    database: DependencyStatus;
    llm: DependencyStatus;
    wazuhManager: DependencyStatus;
    wazuhIndexer: DependencyStatus;
    graphContext: DependencyStatus;
    splunkHec: DependencyStatus;
  };
  workflows: {
    structuredPipeline: WorkflowStatus;
    adHocAnalyst: WorkflowStatus;
    ticketing: WorkflowStatus;
  };
}

async function checkDatabase(): Promise<DependencyStatus> {
  const now = new Date().toISOString();
  try {
    const db = await getDb();
    if (!db) return { state: "blocked", reason: "Database connection not available", fallbackActive: false, blocksWorkflow: true, lastChecked: now };
    // Audit #69: Actually probe the DB with a lightweight query instead of just checking the handle
    await db.execute(sql`SELECT 1`);
    return { state: "ready", reason: null, fallbackActive: false, blocksWorkflow: true, lastChecked: now };
  } catch (err) {
    return { state: "blocked", reason: `Database error: ${(err as Error).message}`, fallbackActive: false, blocksWorkflow: true, lastChecked: now };
  }
}

async function checkLLM(): Promise<DependencyStatus> {
  const now = new Date().toISOString();
  try {
    const config = await getEffectiveLLMConfig();
    // LLMConfig has host, port, model, apiKey, enabled, protocol — no "source" field.
    // If host is set, it's a custom LLM; otherwise it's built-in.
    if (config.host) {
      try {
        const url = `${config.protocol || "http"}://${config.host}:${config.port || 11434}/v1/models`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (resp.ok) return { state: "ready", reason: `Custom LLM at ${config.host}:${config.port}`, fallbackActive: false, blocksWorkflow: true, lastChecked: now };
        return { state: "degraded", reason: `Custom LLM responded ${resp.status} — falling back to built-in`, fallbackActive: true, blocksWorkflow: true, lastChecked: now };
      } catch {
        return { state: "degraded", reason: `Custom LLM unreachable at ${config.host}:${config.port} — falling back to built-in`, fallbackActive: true, blocksWorkflow: true, lastChecked: now };
      }
    }
    return { state: "ready", reason: "Using built-in LLM", fallbackActive: false, blocksWorkflow: true, lastChecked: now };
  } catch (err) {
    return { state: "blocked", reason: `LLM check failed: ${(err as Error).message}`, fallbackActive: false, blocksWorkflow: true, lastChecked: now };
  }
}

async function checkWazuhManager(): Promise<DependencyStatus> {
  const now = new Date().toISOString();
  try {
    const config = await getEffectiveWazuhConfig();
    if (!config || !config.host) return { state: "blocked", reason: "Wazuh Manager host not configured", fallbackActive: false, blocksWorkflow: false, lastChecked: now };
    // Use a lightweight GET to verify auth + connectivity (triggers token acquisition)
    await wazuhGet(config, { path: "/manager/info", rateLimitGroup: "readiness" });
    return { state: "ready", reason: null, fallbackActive: false, blocksWorkflow: false, lastChecked: now };
  } catch (err) {
    return { state: "blocked", reason: `Wazuh Manager: ${(err as Error).message}`, fallbackActive: false, blocksWorkflow: false, lastChecked: now };
  }
}

async function checkWazuhIndexer(): Promise<DependencyStatus> {
  const now = new Date().toISOString();
  try {
    const config = await getEffectiveIndexerConfig();
    // getEffectiveIndexerConfig returns IndexerConfig | null
    if (!config || !config.host) return { state: "blocked", reason: "Wazuh Indexer host not configured", fallbackActive: false, blocksWorkflow: false, lastChecked: now };
    // indexerHealth requires the config argument
    const health = await indexerHealth(config);
    const status = (health as Record<string, unknown>).status as string | undefined;
    const clusterName = (health as Record<string, unknown>).cluster_name as string | undefined;
    if (status === "green" || status === "yellow") return { state: "ready", reason: `Cluster: ${clusterName ?? "unknown"}, status: ${status}`, fallbackActive: false, blocksWorkflow: false, lastChecked: now };
    return { state: "degraded", reason: `Indexer cluster status: ${status ?? "unknown"}`, fallbackActive: false, blocksWorkflow: false, lastChecked: now };
  } catch (err) {
    return { state: "blocked", reason: `Wazuh Indexer: ${(err as Error).message}`, fallbackActive: false, blocksWorkflow: false, lastChecked: now };
  }
}

async function checkGraphContext(): Promise<DependencyStatus> {
  const now = new Date().toISOString();
  try {
    const stats = await getGraphStats();
    // KgStats uses 'endpoints', 'parameters', etc. — not 'totalNodes'/'totalEdges'
    const totalEntities = stats.endpoints + stats.parameters + stats.responses + stats.resources;
    if (totalEntities > 0) return { state: "ready", reason: `Graph: ${stats.endpoints} endpoints, ${stats.parameters} params, ${stats.resources} resources`, fallbackActive: false, blocksWorkflow: false, lastChecked: now };
    return { state: "degraded", reason: "Knowledge graph is empty — ad-hoc retrieval will have limited context", fallbackActive: false, blocksWorkflow: false, lastChecked: now };
  } catch (err) {
    return { state: "degraded", reason: `Graph context check failed: ${(err as Error).message}`, fallbackActive: false, blocksWorkflow: false, lastChecked: now };
  }
}

/**
 * Check Splunk HEC reachability.
 * Splunk is a degraded dependency, not a global blocker.
 * Semantics:
 *   - DB down → blocked
 *   - LLM down → blocked/degraded depending on fallback
 *   - Wazuh down → degraded
 *   - Splunk HEC down → ticketing degraded, pipeline still usable
 */
async function checkSplunkHec(): Promise<DependencyStatus> {
  const now = new Date().toISOString();
  try {
    const config = await getEffectiveSplunkConfig();
    if (!config.host || !config.hecToken) {
      return { state: "degraded", reason: "Splunk HEC not configured (missing host or token) — ticketing unavailable", fallbackActive: false, blocksWorkflow: false, lastChecked: now };
    }
    if (!config.enabled) {
      return { state: "degraded", reason: "Splunk integration disabled — ticketing unavailable", fallbackActive: false, blocksWorkflow: false, lastChecked: now };
    }
    const result = await testSplunkConnection();
    if (result.success) {
      return { state: "ready", reason: `Splunk HEC healthy (${result.latencyMs}ms)`, fallbackActive: false, blocksWorkflow: false, lastChecked: now };
    }
    return { state: "degraded", reason: `Splunk HEC: ${result.message}`, fallbackActive: false, blocksWorkflow: false, lastChecked: now };
  } catch (err) {
    return { state: "degraded", reason: `Splunk HEC check failed: ${(err as Error).message}`, fallbackActive: false, blocksWorkflow: false, lastChecked: now };
  }
}

export async function checkAgenticReadiness(): Promise<AgenticReadiness> {
  const [database, llm, wazuhManager, wazuhIndexer, graphContext, splunkHec] = await Promise.allSettled([
    checkDatabase(), checkLLM(), checkWazuhManager(), checkWazuhIndexer(), checkGraphContext(), checkSplunkHec(),
  ]);

  const deps = {
    database: database.status === "fulfilled" ? database.value : { state: "blocked" as const, reason: `Check threw: ${(database as PromiseRejectedResult).reason}`, fallbackActive: false, blocksWorkflow: true, lastChecked: new Date().toISOString() },
    llm: llm.status === "fulfilled" ? llm.value : { state: "blocked" as const, reason: `Check threw: ${(llm as PromiseRejectedResult).reason}`, fallbackActive: false, blocksWorkflow: true, lastChecked: new Date().toISOString() },
    wazuhManager: wazuhManager.status === "fulfilled" ? wazuhManager.value : { state: "blocked" as const, reason: `Check threw: ${(wazuhManager as PromiseRejectedResult).reason}`, fallbackActive: false, blocksWorkflow: false, lastChecked: new Date().toISOString() },
    wazuhIndexer: wazuhIndexer.status === "fulfilled" ? wazuhIndexer.value : { state: "blocked" as const, reason: `Check threw: ${(wazuhIndexer as PromiseRejectedResult).reason}`, fallbackActive: false, blocksWorkflow: false, lastChecked: new Date().toISOString() },
    graphContext: graphContext.status === "fulfilled" ? graphContext.value : { state: "degraded" as const, reason: `Check threw: ${(graphContext as PromiseRejectedResult).reason}`, fallbackActive: false, blocksWorkflow: false, lastChecked: new Date().toISOString() },
    splunkHec: splunkHec.status === "fulfilled" ? splunkHec.value : { state: "degraded" as const, reason: `Check threw: ${(splunkHec as PromiseRejectedResult).reason}`, fallbackActive: false, blocksWorkflow: false, lastChecked: new Date().toISOString() },
  };

  const structuredBlockers: string[] = [];
  const structuredDegraders: string[] = [];
  if (deps.database.state === "blocked") structuredBlockers.push("database");
  if (deps.llm.state === "blocked") structuredBlockers.push("llm");
  if (deps.llm.state === "degraded") structuredDegraders.push("llm (fallback active)");
  if (deps.wazuhManager.state === "blocked") structuredDegraders.push("wazuhManager");
  if (deps.wazuhIndexer.state === "blocked") structuredDegraders.push("wazuhIndexer");

  const structuredPipeline: WorkflowStatus = structuredBlockers.length > 0
    ? { state: "blocked", reason: `Blocked by: ${structuredBlockers.join(", ")}`, blockedBy: structuredBlockers }
    : structuredDegraders.length > 0
      ? { state: "degraded", reason: `Degraded: ${structuredDegraders.join(", ")}`, blockedBy: [] }
      : { state: "ready", reason: null, blockedBy: [] };

  const adHocBlockers: string[] = [];
  const adHocDegraders: string[] = [];
  if (deps.database.state === "blocked") adHocBlockers.push("database");
  if (deps.llm.state === "blocked") adHocBlockers.push("llm");
  if (deps.llm.state === "degraded") adHocDegraders.push("llm (fallback active)");
  if (deps.wazuhManager.state === "blocked") adHocDegraders.push("wazuhManager");
  if (deps.wazuhIndexer.state === "blocked") adHocDegraders.push("wazuhIndexer");
  if (deps.graphContext.state !== "ready") adHocDegraders.push("graphContext");

  const adHocAnalyst: WorkflowStatus = adHocBlockers.length > 0
    ? { state: "blocked", reason: `Blocked by: ${adHocBlockers.join(", ")}`, blockedBy: adHocBlockers }
    : adHocDegraders.length > 0
      ? { state: "degraded", reason: `Degraded: ${adHocDegraders.join(", ")}`, blockedBy: [] }
      : { state: "ready", reason: null, blockedBy: [] };

  // Ticketing workflow — Splunk HEC is the sole dependency
  const ticketing: WorkflowStatus = deps.splunkHec.state === "ready"
    ? { state: "ready", reason: null, blockedBy: [] }
    : { state: "degraded", reason: `Ticketing degraded: ${deps.splunkHec.reason}`, blockedBy: [] };

  const overall = structuredPipeline.state === "blocked" || adHocAnalyst.state === "blocked" ? "blocked"
    : structuredPipeline.state === "degraded" || adHocAnalyst.state === "degraded" || ticketing.state === "degraded" ? "degraded" : "ready";

  return { overall, timestamp: new Date().toISOString(), dependencies: deps, workflows: { structuredPipeline, adHocAnalyst, ticketing } };
}
