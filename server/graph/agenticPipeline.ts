/**
 * Agentic LLM Pipeline — Policy-Constrained Reasoning Engine
 *
 * Implements the Nemotron-3 Nano architecture:
 * Phase 1: Query Intent Analysis & Orchestration
 * Phase 2: Structured Graph Retrieval (4-Layer Knowledge Graph)
 * Phase 3: Semantic Search (Wazuh Indexer full-text search)
 * Phase 4: LLM Synthesis with trust scoring & safety rails
 *
 * Safety Rails:
 * - Graph-level exclusion: MUTATING/DESTRUCTIVE endpoints never returned
 * - Prompt-level prohibition: System prompt forbids suggesting write ops
 * - Output validator: Post-generation scan for blocked patterns
 * - Confidence gate: Minimum threshold before presenting findings
 *
 * Uses invokeLLMWithFallback which routes to custom LLM (e.g., Nemotron3 Nano)
 * when configured, with automatic fallback to the built-in LLM.
 */

import { invokeLLMWithFallback as invokeLLM } from "../llm/llmService";
import { searchGraph, getGraphStats, getRiskAnalysis, getEndpoints, getResourceOverview, getUseCases, getErrorPatterns, recordProvenance } from "./graphQueryService";
import {
  getEffectiveIndexerConfig,
  indexerSearch,
  INDEX_PATTERNS,
  boolQuery,
} from "../indexer/indexerClient";
import { getDb } from "../db";
import { livingCaseState, responseActions, triageObjects, pipelineRuns } from "../../drizzle/schema";
import { eq, desc, sql, and, inArray } from "drizzle-orm";

// ── Types ───────────────────────────────────────────────────────────────────

export interface AnalystMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface RetrievalSource {
  type: "graph" | "indexer" | "stats" | "pipeline";
  label: string;
  data: unknown;
  relevance: string;
}

/** Each pipeline step emits an AgentStep for the live activity feed */
export interface AgentStep {
  agent: "orchestrator" | "graph_retriever" | "indexer_retriever" | "synthesizer" | "safety_validator" | "pipeline_retriever";
  phase: number;
  action: string;
  detail: string;
  status: "running" | "complete" | "error" | "blocked";
  timestamp: number;
  durationMs?: number;
  dataPoints?: number;
}

export interface AnalystResponse {
  answer: string;
  reasoning: string;
  sources: RetrievalSource[];
  suggestedFollowUps: string[];
  trustScore: number;
  confidence: number;
  safetyStatus: "clean" | "filtered" | "blocked";
  provenance: ProvenanceRecord;
  agentSteps: AgentStep[];
}

interface ProvenanceRecord {
  queryHash: string;
  graphSourceCount: number;
  indexerSourceCount: number;
  totalDataPoints: number;
  blockedEndpoints: string[];
  filteredPatterns: string[];
  retrievalLatencyMs: number;
  synthesisLatencyMs: number;
}

interface IntentAnalysis {
  intent: "threat_hunt" | "vulnerability_assessment" | "endpoint_investigation" | "compliance_check" | "general_query" | "mitre_mapping" | "api_exploration";
  entities: {
    agentIds: string[];
    hostnames: string[];
    cveIds: string[];
    ipAddresses: string[];
    ruleIds: string[];
    mitreTactics: string[];
    keywords: string[];
  };
  retrievalStrategy: ("graph" | "indexer" | "both")[];
  timeRange?: string;
  confidence: number;
}

// ── Safety Rails ────────────────────────────────────────────────────────────

/** Patterns that must NEVER appear in LLM output */
const BLOCKED_PATTERNS = [
  /DELETE\s+\/api\/v\d+/i,
  /PUT\s+\/api\/v\d+.*\/restart/i,
  /POST\s+\/api\/v\d+.*\/active-response/i,
  /curl\s+.*-X\s*(DELETE|PUT|POST)/i,
  /remove.*agent/i,
  /delete.*agent/i,
  /restart.*manager/i,
  /active.response.*trigger/i,
  /run.*command.*on.*agent/i,
  /execute.*remote/i,
];

/** Hard refusal template — immutable */
const HARD_REFUSAL = `⛔ **Safety Rail Triggered**

This request involves a write/mutate/destructive operation on the Wazuh environment. Walter operates in **read-only mode** and cannot:

- Delete or modify agents
- Trigger active responses
- Modify rules or decoders
- Execute remote commands
- Restart services

If you need to perform these actions, use the Wazuh Manager CLI or Dashboard directly with appropriate authorization.`;

/** Minimum confidence threshold for presenting findings */
const CONFIDENCE_THRESHOLD = 0.3;

/** Scan output for blocked patterns and filter them */
function validateOutput(text: string): { clean: string; filtered: string[]; status: "clean" | "filtered" } {
  const filtered: string[] = [];
  let clean = text;

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(clean)) {
      filtered.push(pattern.source);
      clean = clean.replace(pattern, "[REDACTED — write operation blocked by safety rail]");
    }
  }

  return {
    clean,
    filtered,
    status: filtered.length > 0 ? "filtered" : "clean",
  };
}

/** Simple hash for provenance tracking */
function hashQuery(q: string): string {
  let hash = 0;
  for (let i = 0; i < q.length; i++) {
    const char = q.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36).padStart(8, "0");
}

/**
 * Extract real KG node IDs from retrieval sources for provenance recording.
 *
 * Scans all graph-type RetrievalSource entries and extracts numeric IDs from:
 * - GraphNode.id strings like "endpoint-42" → endpointId 42
 * - GraphNode.id strings like "param-17" → parameterId 17
 * - Direct endpoint rows from getEndpoints() which have .id (numeric)
 * - Risk analysis rows from getRiskAnalysis() which have .id (numeric)
 *
 * Returns deduplicated arrays of real numeric IDs that were actually used
 * in the retrieval path for this query. Empty arrays are truthful — they
 * mean no nodes of that type were retrieved for this particular query.
 */
export function extractProvenanceIds(sources: RetrievalSource[]): {
  endpointIds: number[];
  parameterIds: number[];
} {
  const endpointIdSet = new Set<number>();
  const parameterIdSet = new Set<number>();

  for (const source of sources) {
    if (source.type !== "graph" && source.type !== "stats") continue;
    const data = source.data;
    if (!data) continue;

    // Handle arrays of GraphNode objects (from searchGraph, getEndpoints, etc.)
    if (Array.isArray(data)) {
      for (const item of data) {
        if (typeof item !== "object" || item === null) continue;
        const record = item as Record<string, unknown>;

        // GraphNode format: id is "endpoint-42", "param-17", etc.
        if (typeof record.id === "string") {
          const parts = record.id.split("-");
          const numericId = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(numericId)) {
            if (record.id.startsWith("endpoint-") || record.type === "endpoint") {
              endpointIdSet.add(numericId);
            } else if (record.id.startsWith("param-") || record.type === "parameter") {
              parameterIdSet.add(numericId);
            }
          }
        }

        // Direct endpoint row format: { id: number, method: string, path: string, ... }
        if (typeof record.id === "number" && ("method" in record || "path" in record || "riskLevel" in record)) {
          endpointIdSet.add(record.id);
        }

        // Parameter rows with endpointId linkage
        if (typeof record.id === "number" && "endpointId" in record && typeof record.endpointId === "number") {
          parameterIdSet.add(record.id);
          endpointIdSet.add(record.endpointId);
        }
      }
    }

    // Handle risk analysis object: { dangerousEndpoints: [{ id, ... }] }
    if (typeof data === "object" && !Array.isArray(data)) {
      const obj = data as Record<string, unknown>;
      if (Array.isArray(obj.dangerousEndpoints)) {
        for (const ep of obj.dangerousEndpoints) {
          if (typeof ep === "object" && ep !== null && typeof (ep as Record<string, unknown>).id === "number") {
            endpointIdSet.add((ep as Record<string, unknown>).id as number);
          }
        }
      }
    }
  }

  return {
    endpointIds: Array.from(endpointIdSet).sort((a, b) => a - b),
    parameterIds: Array.from(parameterIdSet).sort((a, b) => a - b),
  };
}

// ── Phase 1: Intent Analysis ────────────────────────────────────────────────

async function analyzeIntent(query: string, conversationHistory: AnalystMessage[], steps: AgentStep[]): Promise<IntentAnalysis> {
  const stepStart = Date.now();
  steps.push({
    agent: "orchestrator",
    phase: 1,
    action: "Analyzing query intent",
    detail: `Classifying: "${query.slice(0, 80)}${query.length > 80 ? "..." : ""}"`,
    status: "running",
    timestamp: Date.now(),
  });

  const historyContext = conversationHistory
    .slice(-6)
    .map(m => `${m.role}: ${m.content}`)
    .join("\n");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a security query intent classifier for a Wazuh SIEM system with a 4-layer Knowledge Graph.
Analyze the user's query and extract structured intent information.
You must respond with valid JSON matching this schema exactly:
{
  "intent": "threat_hunt" | "vulnerability_assessment" | "endpoint_investigation" | "compliance_check" | "general_query" | "mitre_mapping" | "api_exploration",
  "entities": {
    "agentIds": ["string array of agent IDs mentioned"],
    "hostnames": ["string array of hostnames mentioned"],
    "cveIds": ["string array of CVE IDs mentioned"],
    "ipAddresses": ["string array of IP addresses mentioned"],
    "ruleIds": ["string array of Wazuh rule IDs mentioned"],
    "mitreTactics": ["string array of MITRE ATT&CK tactics mentioned"],
    "keywords": ["string array of key search terms"]
  },
  "retrievalStrategy": ["graph", "indexer", or "both"],
  "timeRange": "optional time range like 'last 24h', 'last 7d', etc.",
  "confidence": 0.0 to 1.0
}

Context about available data:
- Knowledge Graph (4 layers):
  Layer 1 — API Ontology: 178 Wazuh REST endpoints with parameters, responses, auth methods
  Layer 2 — Operational Semantics: 16 use cases, risk levels (SAFE/MUTATING/DESTRUCTIVE), LLM access rules
  Layer 3 — Schema Lineage: 5 index patterns (wazuh-alerts-*, wazuh-states-vulnerabilities-*, etc.), field mappings
  Layer 4 — Error/Failure: 9 error patterns with causes and mitigations
- Wazuh Indexer: wazuh-alerts-*, wazuh-states-vulnerabilities-*
- For "api_exploration" intent: user is asking about Wazuh API capabilities, endpoints, parameters

IMPORTANT: Set confidence to how well you understand the query (0.0 = no idea, 1.0 = perfectly clear).`,
      },
      {
        role: "user",
        content: `Conversation history:\n${historyContext}\n\nCurrent query: ${query}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "intent_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            intent: { type: "string", enum: ["threat_hunt", "vulnerability_assessment", "endpoint_investigation", "compliance_check", "general_query", "mitre_mapping", "api_exploration"] },
            entities: {
              type: "object",
              properties: {
                agentIds: { type: "array", items: { type: "string" } },
                hostnames: { type: "array", items: { type: "string" } },
                cveIds: { type: "array", items: { type: "string" } },
                ipAddresses: { type: "array", items: { type: "string" } },
                ruleIds: { type: "array", items: { type: "string" } },
                mitreTactics: { type: "array", items: { type: "string" } },
                keywords: { type: "array", items: { type: "string" } },
              },
              required: ["agentIds", "hostnames", "cveIds", "ipAddresses", "ruleIds", "mitreTactics", "keywords"],
              additionalProperties: false,
            },
            retrievalStrategy: { type: "array", items: { type: "string", enum: ["graph", "indexer", "both"] } },
            timeRange: { type: "string" },
            confidence: { type: "number" },
          },
          required: ["intent", "entities", "retrievalStrategy", "timeRange", "confidence"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content as string | undefined;
  const durationMs = Date.now() - stepStart;

  let result: IntentAnalysis;
  try {
    result = content ? JSON.parse(content) as IntentAnalysis : {
      intent: "general_query" as const,
      entities: { agentIds: [], hostnames: [], cveIds: [], ipAddresses: [], ruleIds: [], mitreTactics: [], keywords: [query] },
      retrievalStrategy: ["both" as const],
      confidence: 0.5,
    };
  } catch {
    result = {
      intent: "general_query",
      entities: { agentIds: [], hostnames: [], cveIds: [], ipAddresses: [], ruleIds: [], mitreTactics: [], keywords: [query] },
      retrievalStrategy: ["both"],
      confidence: 0.5,
    };
  }

  // Update step
  steps[steps.length - 1] = {
    ...steps[steps.length - 1],
    status: "complete",
    durationMs,
    detail: `Intent: ${result.intent} | Confidence: ${(result.confidence * 100).toFixed(0)}% | Strategy: ${result.retrievalStrategy.join(", ")}`,
  };

  return result;
}

// ── Phase 2: Graph Retrieval ────────────────────────────────────────────────

async function retrieveFromGraph(intent: IntentAnalysis, steps: AgentStep[]): Promise<RetrievalSource[]> {
  const stepStart = Date.now();
  steps.push({
    agent: "graph_retriever",
    phase: 2,
    action: "Querying Knowledge Graph",
    detail: "Traversing 4-layer API ontology...",
    status: "running",
    timestamp: Date.now(),
  });

  const sources: RetrievalSource[] = [];
  let dataPoints = 0;

  try {
    // Always get graph stats for context
    const stats = await getGraphStats();
    sources.push({ type: "stats", label: "Knowledge Graph Statistics", data: stats, relevance: "context" });
    dataPoints += 1;

    // Resource overview for context
    const resources = await getResourceOverview();
    if (resources.length > 0) {
      sources.push({ type: "graph", label: "API Resource Categories", data: resources, relevance: "context" });
      dataPoints += resources.length;
    }

    // Use cases for operational context
    if (intent.intent === "api_exploration" || intent.intent === "general_query") {
      const useCases = await getUseCases();
      if (useCases.length > 0) {
        sources.push({ type: "graph", label: "Wazuh API Use Cases", data: useCases, relevance: "primary" });
        dataPoints += useCases.length;
      }
    }

    // Risk analysis for threat-related queries
    if (intent.intent === "threat_hunt" || intent.intent === "vulnerability_assessment" || intent.intent === "endpoint_investigation") {
      const risk = await getRiskAnalysis();
      sources.push({ type: "graph", label: "Risk Analysis (Endpoint Classification)", data: risk, relevance: "primary" });
      dataPoints += 1;
    }

    // Error patterns for troubleshooting
    if (intent.entities.keywords.some(k => /error|fail|timeout|401|403|500/i.test(k))) {
      const errors = await getErrorPatterns();
      if (errors.length > 0) {
        sources.push({ type: "graph", label: "Error & Failure Patterns", data: errors, relevance: "primary" });
        dataPoints += errors.length;
      }
    }

    // Endpoint search — ONLY SAFE endpoints returned by the query service
    const allKeywords = [
      ...intent.entities.keywords,
      ...intent.entities.hostnames,
      ...intent.entities.ruleIds,
      ...intent.entities.mitreTactics,
    ].filter(Boolean);

    for (const keyword of allKeywords.slice(0, 3)) {
      const results = await searchGraph(keyword, 20);
      if (results.length > 0) {
        sources.push({ type: "graph", label: `KG search: "${keyword}"`, data: results, relevance: "supporting" });
        dataPoints += results.length;
      }
    }

    // Direct endpoint listing for API exploration
    if (intent.intent === "api_exploration") {
      const { endpoints } = await getEndpoints({ limit: 20 });
      if (endpoints.length > 0) {
        sources.push({ type: "graph", label: "API Endpoints (SAFE only)", data: endpoints, relevance: "primary" });
        dataPoints += endpoints.length;
      }
    }
  } catch (err) {
    sources.push({ type: "graph", label: "Graph retrieval error", data: { error: (err as Error).message }, relevance: "error" });
    steps[steps.length - 1] = {
      ...steps[steps.length - 1],
      status: "error",
      durationMs: Date.now() - stepStart,
      detail: `Error: ${(err as Error).message}`,
    };
    return sources;
  }

  steps[steps.length - 1] = {
    ...steps[steps.length - 1],
    status: "complete",
    durationMs: Date.now() - stepStart,
    dataPoints,
    detail: `Retrieved ${dataPoints} data points from ${sources.length} graph queries`,
  };

  return sources;
}

// ── Phase 3: Indexer Search ─────────────────────────────────────────────────

async function retrieveFromIndexer(intent: IntentAnalysis, steps: AgentStep[]): Promise<RetrievalSource[]> {
  const stepStart = Date.now();
  steps.push({
    agent: "indexer_retriever",
    phase: 3,
    action: "Searching Wazuh Indexer",
    detail: "Querying wazuh-alerts-* and wazuh-states-vulnerabilities-*...",
    status: "running",
    timestamp: Date.now(),
  });

  const sources: RetrievalSource[] = [];
  let dataPoints = 0;

  const config = await getEffectiveIndexerConfig();
  if (!config) {
    steps[steps.length - 1] = {
      ...steps[steps.length - 1],
      status: "error",
      durationMs: Date.now() - stepStart,
      detail: "Indexer not configured",
    };
    sources.push({ type: "indexer", label: "Indexer not configured", data: null, relevance: "error" });
    return sources;
  }

  try {
    const searchTerms = [
      ...intent.entities.keywords,
      ...intent.entities.hostnames,
      ...intent.entities.ipAddresses,
      ...intent.entities.cveIds,
      ...intent.entities.ruleIds,
    ].filter(Boolean);

    if (searchTerms.length > 0) {
      const queryString = searchTerms.join(" ");

      // Search alerts
      try {
        const alertResults = await indexerSearch(
          config,
          INDEX_PATTERNS.ALERTS,
          {
            query: {
              multi_match: {
                query: queryString,
                fields: ["rule.description", "agent.name", "data.srcip", "data.dstip", "rule.mitre.tactic", "rule.mitre.technique"],
                type: "best_fields",
                fuzziness: "AUTO",
              },
            },
            size: 20,
            sort: [{ timestamp: { order: "desc" } }],
          },
          "alerts"
        );

        const alertHits = alertResults.hits?.hits ?? [];
        if (alertHits.length > 0) {
          sources.push({
            type: "indexer",
            label: `Alert search: "${queryString}" (${alertHits.length} hits)`,
            data: alertHits.map((h: { _source: unknown }) => h._source),
            relevance: "primary",
          });
          dataPoints += alertHits.length;
        }
      } catch {
        // Alert index may not exist
      }

      // Search vulnerabilities
      if (intent.intent === "vulnerability_assessment" || intent.entities.cveIds.length > 0) {
        try {
          const vulnResults = await indexerSearch(
            config,
            INDEX_PATTERNS.VULNERABILITIES,
            {
              query: {
                multi_match: {
                  query: queryString,
                  fields: ["vulnerability.id", "vulnerability.title", "vulnerability.severity", "package.name", "agent.name"],
                  type: "best_fields",
                },
              },
              size: 20,
            },
            "vulnerabilities"
          );

          const vulnHits = vulnResults.hits?.hits ?? [];
          if (vulnHits.length > 0) {
            sources.push({
              type: "indexer",
              label: `Vulnerability search: "${queryString}" (${vulnHits.length} hits)`,
              data: vulnHits.map((h: { _source: unknown }) => h._source),
              relevance: "primary",
            });
            dataPoints += vulnHits.length;
          }
        } catch {
          // Vulnerability index may not exist
        }
      }
    }

    // Agent-specific alert search
    for (const agentId of intent.entities.agentIds.slice(0, 3)) {
      try {
        const agentAlerts = await indexerSearch(
          config,
          INDEX_PATTERNS.ALERTS,
          {
            query: boolQuery({
              filter: [{ term: { "agent.id": agentId } }],
            }),
            size: 20,
            sort: [{ timestamp: { order: "desc" } }],
          },
          "alerts"
        );

        const hits = agentAlerts.hits?.hits ?? [];
        if (hits.length > 0) {
          sources.push({
            type: "indexer",
            label: `Agent ${agentId} alerts (${hits.length} hits)`,
            data: hits.map((h: { _source: unknown }) => h._source),
            relevance: "primary",
          });
          dataPoints += hits.length;
        }
      } catch {
        // Skip if index doesn't exist
      }
    }
  } catch (err) {
    sources.push({ type: "indexer", label: "Indexer search error", data: { error: (err as Error).message }, relevance: "error" });
    steps[steps.length - 1] = {
      ...steps[steps.length - 1],
      status: "error",
      durationMs: Date.now() - stepStart,
      detail: `Error: ${(err as Error).message}`,
    };
    return sources;
  }

  steps[steps.length - 1] = {
    ...steps[steps.length - 1],
    status: "complete",
    durationMs: Date.now() - stepStart,
    dataPoints,
    detail: `Retrieved ${dataPoints} data points from ${sources.length} indexer queries`,
  };

  return sources;
}

// ── Phase 2.5: Pipeline Context Retrieval ──────────────────────────────────

/**
 * Retrieves active SOC pipeline context — living cases, pending response actions,
 * recent triage results, and pipeline run status. This makes the analyst chat
 * pipeline-aware so Walter can reference ongoing investigations, pending approvals,
 * and recent automated findings without the analyst needing to switch views.
 */
async function retrievePipelineContext(
  intent: IntentAnalysis,
  steps: AgentStep[]
): Promise<RetrievalSource[]> {
  const stepStart = Date.now();
  steps.push({
    agent: "pipeline_retriever",
    phase: 2,
    action: "Retrieving SOC pipeline context",
    detail: "Fetching active cases, pending actions, recent triages...",
    status: "running",
    timestamp: Date.now(),
  });

  const sources: RetrievalSource[] = [];

  try {
    const db = await getDb();
    if (!db) {
      steps[steps.length - 1] = {
        ...steps[steps.length - 1],
        status: "complete",
        durationMs: Date.now() - stepStart,
        detail: "Database unavailable — skipping pipeline context",
      };
      return [];
    }

    // ── Active Living Cases (most recent 5) ──
    const activeCases = await db
      .select({
        id: livingCaseState.id,
        sessionId: livingCaseState.sessionId,
        workingTheory: livingCaseState.workingTheory,
        theoryConfidence: livingCaseState.theoryConfidence,
        caseData: livingCaseState.caseData,
        pendingActionCount: livingCaseState.pendingActionCount,
        createdAt: livingCaseState.createdAt,
      })
      .from(livingCaseState)
      .orderBy(desc(livingCaseState.createdAt))
      .limit(5);

    if (activeCases.length > 0) {
      const caseSummaries = activeCases.map(c => {
        let alertFamily = "";
        let riskScore = 0;
        try {
          const data = c.caseData as unknown as Record<string, unknown>;
          alertFamily = (data?.alertFamily as string) ?? "";
          riskScore = (data?.riskScore as number) ?? 0;
        } catch { /* ignore parse errors */ }
        return {
          id: c.id,
          sessionId: c.sessionId,
          riskScore,
          alertFamily,
          workingTheory: (c.workingTheory ?? "").slice(0, 200),
          theoryConfidence: c.theoryConfidence,
          pendingActions: c.pendingActionCount,
          createdAt: c.createdAt,
        };
      });

      sources.push({
        type: "pipeline",
        label: `Active Living Cases (${activeCases.length})`,
        data: caseSummaries,
        relevance: "context",
      });
    }

    // ── Pending Response Actions ──
    const pendingActions = await db
      .select({
        id: responseActions.id,
        actionId: responseActions.actionId,
        category: responseActions.category,
        title: responseActions.title,
        urgency: responseActions.urgency,
        targetValue: responseActions.targetValue,
        targetType: responseActions.targetType,
        state: responseActions.state,
        createdAt: responseActions.createdAt,
      })
      .from(responseActions)
      .where(eq(responseActions.state, "proposed"))
      .orderBy(desc(responseActions.createdAt))
      .limit(10);

    if (pendingActions.length > 0) {
      sources.push({
        type: "pipeline",
        label: `Pending Response Actions (${pendingActions.length})`,
        data: pendingActions,
        relevance: "context",
      });
    }

    // ── Recent Triage Results (last 10) ──
    const recentTriages = await db
      .select({
        id: triageObjects.id,
        triageId: triageObjects.triageId,
        alertId: triageObjects.alertId,
        severity: triageObjects.severity,
        route: triageObjects.route,
        alertFamily: triageObjects.alertFamily,
        agentId: triageObjects.agentId,
        createdAt: triageObjects.createdAt,
      })
      .from(triageObjects)
      .orderBy(desc(triageObjects.createdAt))
      .limit(10);

    if (recentTriages.length > 0) {
      sources.push({
        type: "pipeline",
        label: `Recent Triage Results (${recentTriages.length})`,
        data: recentTriages,
        relevance: "context",
      });
    }

    // ── Pipeline Run Stats ──
    const [runStats] = await db.select({
      total: sql<number>`COUNT(*)`,
      completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
      partial: sql<number>`SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END)`,
      failed: sql<number>`SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)`,
      running: sql<number>`SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END)`,
    }).from(pipelineRuns);

    if (runStats && runStats.total > 0) {
      sources.push({
        type: "pipeline",
        label: "Pipeline Run Statistics",
        data: runStats,
        relevance: "context",
      });
    }

    // ── Entity-Specific Context ──
    // If the analyst query mentions specific agents, hosts, or IPs that have
    // active cases or pending actions, surface those specifically.
    const mentionedAgents = intent.entities.agentIds;
    const mentionedHosts = intent.entities.hostnames;
    const mentionedIPs = intent.entities.ipAddresses;

    if (mentionedAgents.length > 0 || mentionedHosts.length > 0 || mentionedIPs.length > 0) {
      // Check for triage results matching mentioned entities
      const entityTriages = await db
        .select()
        .from(triageObjects)
        .where(
          mentionedAgents.length > 0
            ? inArray(triageObjects.agentId, mentionedAgents)
            : sql`1=0`
        )
        .orderBy(desc(triageObjects.createdAt))
        .limit(5);

      if (entityTriages.length > 0) {
        sources.push({
          type: "pipeline",
          label: `Triage History for Mentioned Entities (${entityTriages.length})`,
          data: entityTriages.map(t => ({
            triageId: t.triageId,
            alertId: t.alertId,
            severity: t.severity,
            route: t.route,
            alertFamily: t.alertFamily,
            agentId: t.agentId,
            summary: (t.summary ?? "").slice(0, 200),
          })),
          relevance: "direct",
        });
      }
    }

    steps[steps.length - 1] = {
      ...steps[steps.length - 1],
      status: "complete",
      durationMs: Date.now() - stepStart,
      dataPoints: sources.reduce((sum, s) => sum + (Array.isArray(s.data) ? (s.data as unknown[]).length : 1), 0),
      detail: `Retrieved ${sources.length} pipeline context sources (${activeCases.length} cases, ${pendingActions.length} pending actions, ${recentTriages.length} triages)`,
    };
  } catch (err) {
    steps[steps.length - 1] = {
      ...steps[steps.length - 1],
      status: "error",
      durationMs: Date.now() - stepStart,
      detail: `Pipeline context retrieval failed: ${(err as Error).message}`,
    };
  }

  return sources;
}

// ── Phase 4: LLM Synthesis with Safety Rails ───────────────────────────────

async function synthesizeResponse(
  query: string,
  intent: IntentAnalysis,
  sources: RetrievalSource[],
  conversationHistory: AnalystMessage[],
  steps: AgentStep[]
): Promise<{ answer: string; suggestedFollowUps: string[]; safetyResult: ReturnType<typeof validateOutput> }> {
  const stepStart = Date.now();
  steps.push({
    agent: "synthesizer",
    phase: 4,
    action: "Generating analysis",
    detail: `Synthesizing from ${sources.length} sources...`,
    status: "running",
    timestamp: Date.now(),
  });

  // Build context from sources
  const sourceContext = sources
    .filter(s => s.relevance !== "error")
    .map((s, i) => {
      const dataStr = typeof s.data === "string" ? s.data : JSON.stringify(s.data, null, 1);
      const truncated = dataStr.length > 3000 ? dataStr.slice(0, 3000) + "\n... [truncated]" : dataStr;
      return `[Source ${i + 1}: ${s.label}]\n${truncated}`;
    })
    .join("\n\n");

  const historyContext = conversationHistory
    .slice(-8)
    .map(m => `${m.role}: ${m.content}`)
    .join("\n");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are Walter, a policy-constrained security analyst AI integrated with a Wazuh SIEM platform and a 4-layer Knowledge Graph.

## IMMUTABLE SAFETY CONTRACT
1. You operate in READ-ONLY mode. You MUST NEVER suggest, recommend, or provide commands that modify the Wazuh environment.
2. PROHIBITED actions: agent deletion, rule modification, active response triggers, remote command execution, service restarts, configuration changes.
3. If a user asks you to perform a write operation, respond with a clear refusal explaining why.
4. Ground EVERY claim in retrieved data. Cite specific agent IDs, rule IDs, CVE IDs, timestamps, IP addresses.
5. If data is insufficient, say so explicitly. NEVER fabricate security findings.
6. Treat all data as forensic evidence — preserve exact values, never approximate.

## ANALYSIS PROTOCOL
- Use chain-of-thought reasoning: explain your analytical process step by step.
- Prioritize by severity: Critical > High > Medium > Low > Informational.
- For threat hunting: suggest specific next investigation steps (read-only queries only).
- For vulnerability assessments: include severity levels and affected asset counts.
- For API exploration: explain endpoint purposes, parameters, and response formats.
- When referencing MITRE ATT&CK, use standard tactic/technique IDs.

## RESPONSE FORMAT
Provide analysis in clear, structured Markdown:
- **Executive Summary** (2-3 sentences)
- **Detailed Findings** with evidence citations
- **Risk Assessment** where applicable
- **Recommended Actions** (read-only investigation steps only)
- **Suggested Follow-up Queries**

## KNOWLEDGE GRAPH CONTEXT
The KG contains 4 layers:
1. API Ontology: 178 Wazuh REST endpoints, parameters, responses, auth methods
2. Operational Semantics: Use cases, risk classification (SAFE/MUTATING/DESTRUCTIVE)
3. Schema Lineage: Index patterns, field mappings, data types
4. Error/Failure: Error codes, causes, mitigations

## SOC PIPELINE CONTEXT
You have access to the automated SOC pipeline state. This includes:
- **Active Living Cases**: Ongoing investigations with working theories, risk scores, and pending actions
- **Pending Response Actions**: Proposed actions (isolate_host, block_ioc, etc.) awaiting analyst approval
- **Recent Triage Results**: Automated alert classifications with severity, route, and alert family
- **Pipeline Run Statistics**: Overall pipeline health and throughput
When pipeline context is available, reference it naturally in your analysis. If the analyst asks about ongoing investigations, pending actions, or recent triages, use this data directly. Cross-reference pipeline findings with graph and indexer data for richer analysis.

The user's detected intent is: ${intent.intent}
Confidence: ${((intent.confidence ?? 0.5) * 100).toFixed(0)}%
Extracted entities: ${JSON.stringify(intent.entities)}`,
      },
      {
        role: "user",
        content: `Conversation history:\n${historyContext}\n\nRetrieved context:\n${sourceContext}\n\nAnalyst query: ${query}`,
      },
    ],
  });

  const rawAnswer = (response.choices?.[0]?.message?.content as string | undefined) ?? "Unable to generate analysis. Please try rephrasing your query.";

  // Safety validation step
  steps.push({
    agent: "safety_validator",
    phase: 4,
    action: "Validating output safety",
    detail: "Scanning for blocked patterns...",
    status: "running",
    timestamp: Date.now(),
  });

  const safetyResult = validateOutput(rawAnswer);

  steps[steps.length - 1] = {
    ...steps[steps.length - 1],
    status: safetyResult.status === "clean" ? "complete" : "blocked",
    durationMs: Date.now() - stepStart,
    detail: safetyResult.status === "clean"
      ? "Output clean — no blocked patterns detected"
      : `Filtered ${safetyResult.filtered.length} blocked pattern(s)`,
  };

  // Generate follow-up suggestions
  let suggestedFollowUps: string[] = [];
  try {
    const followUpResponse = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `Based on a security analysis conversation, suggest 3 follow-up investigation queries.
Return a JSON object with a "suggestions" array of 3 strings. Each should be a specific, actionable READ-ONLY security question.
Example: {"suggestions": ["What MITRE techniques are associated with agent 001?", "Show me all critical CVEs affecting the web servers", "What lateral movement indicators exist in the last 24 hours?"]}`,
        },
        {
          role: "user",
          content: `Original query: ${query}\nIntent: ${intent.intent}\nAnalysis provided: ${rawAnswer.slice(0, 500)}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "follow_ups",
          strict: true,
          schema: {
            type: "object",
            properties: {
              suggestions: { type: "array", items: { type: "string" } },
            },
            required: ["suggestions"],
            additionalProperties: false,
          },
        },
      },
    });

    const parsed = JSON.parse((followUpResponse.choices?.[0]?.message?.content as string | undefined) ?? "{}");
    suggestedFollowUps = parsed.suggestions ?? [];
  } catch {
    suggestedFollowUps = [
      "Show me the most critical alerts from the last 24 hours",
      "Which endpoints have the most vulnerabilities?",
      "What Wazuh API endpoints are available for agent monitoring?",
    ];
  }

  // Update synthesis step
  const synthStep = steps.find(s => s.agent === "synthesizer");
  if (synthStep) {
    synthStep.status = "complete";
    synthStep.durationMs = Date.now() - stepStart;
    synthStep.detail = `Generated ${rawAnswer.length} chars with ${suggestedFollowUps.length} follow-ups`;
  }

  return {
    answer: safetyResult.clean,
    suggestedFollowUps: suggestedFollowUps.slice(0, 3),
    safetyResult,
  };
}

// ── Main Pipeline ───────────────────────────────────────────────────────────

/**
 * Execute the full 4-phase agentic analysis pipeline with trust scoring and safety rails.
 */
export async function runAnalystPipeline(
  query: string,
  conversationHistory: AnalystMessage[] = []
): Promise<AnalystResponse> {
  const pipelineStart = Date.now();
  const steps: AgentStep[] = [];

  // ── Check for write-operation queries (hard refusal) ──
  const writePatterns = [
    /delete\s+(an?\s+)?agent/i,
    /remove\s+(an?\s+)?agent/i,
    /restart\s+(the\s+)?manager/i,
    /trigger\s+(an?\s+)?active.response/i,
    /run\s+(a\s+)?command\s+on/i,
    /modify\s+(the\s+)?rules?/i,
    /change\s+(the\s+)?configuration/i,
    /update\s+(the\s+)?decoder/i,
  ];

  if (writePatterns.some(p => p.test(query))) {
    steps.push({
      agent: "safety_validator",
      phase: 0,
      action: "Pre-flight safety check",
      detail: "BLOCKED — write operation detected in query",
      status: "blocked",
      timestamp: Date.now(),
      durationMs: 1,
    });

    return {
      answer: HARD_REFUSAL,
      reasoning: "Hard refusal: query contains write/mutate/destructive intent",
      sources: [],
      suggestedFollowUps: [
        "Show me the current agent inventory",
        "What are the most recent security alerts?",
        "Which API endpoints are available for read-only monitoring?",
      ],
      trustScore: 1.0,
      confidence: 1.0,
      safetyStatus: "blocked",
      provenance: {
        queryHash: hashQuery(query),
        graphSourceCount: 0,
        indexerSourceCount: 0,
        totalDataPoints: 0,
        blockedEndpoints: [],
        filteredPatterns: ["write_operation_query"],
        retrievalLatencyMs: 0,
        synthesisLatencyMs: 0,
      },
      agentSteps: steps,
    };
  }

  // ── Phase 1: Intent Analysis ──
  const intent = await analyzeIntent(query, conversationHistory, steps);

  // ── Confidence Gate ──
  if (intent.confidence < CONFIDENCE_THRESHOLD) {
    steps.push({
      agent: "orchestrator",
      phase: 1,
      action: "Confidence gate",
      detail: `Confidence ${(intent.confidence * 100).toFixed(0)}% below threshold ${(CONFIDENCE_THRESHOLD * 100).toFixed(0)}%`,
      status: "complete",
      timestamp: Date.now(),
    });
  }

  // ── Phase 2 & 3: Parallel Retrieval ──
  const retrievalStart = Date.now();
  const retrievalPromises: Promise<RetrievalSource[]>[] = [];

  const strategy = intent.retrievalStrategy;
  const useGraph = strategy.includes("graph") || strategy.includes("both");
  const useIndexer = strategy.includes("indexer") || strategy.includes("both");

  if (useGraph) retrievalPromises.push(retrieveFromGraph(intent, steps));
  if (useIndexer) retrievalPromises.push(retrieveFromIndexer(intent, steps));

  // Always inject pipeline context — active cases, pending actions, recent triages
  retrievalPromises.push(retrievePipelineContext(intent, steps));

  // Always get graph stats for context
  if (!useGraph) {
    retrievalPromises.push(
      getGraphStats().then(stats => [{ type: "stats" as const, label: "Knowledge Graph Statistics", data: stats, relevance: "context" }])
    );
  }

  const allSources = (await Promise.all(retrievalPromises)).flat();
  const retrievalLatencyMs = Date.now() - retrievalStart;

  // ── Phase 4: LLM Synthesis ──
  const synthesisStart = Date.now();
  const { answer, suggestedFollowUps, safetyResult } = await synthesizeResponse(
    query, intent, allSources, conversationHistory, steps
  );
  const synthesisLatencyMs = Date.now() - synthesisStart;

  // ── Compute Trust Score ──
  const graphSources = allSources.filter(s => s.type === "graph" || s.type === "stats");
  const indexerSources = allSources.filter(s => s.type === "indexer");
  const pipelineSources = allSources.filter(s => s.type === "pipeline");
  const errorSources = allSources.filter(s => s.relevance === "error");
  const totalDataPoints = allSources.reduce((sum, s) => {
    if (Array.isArray(s.data)) return sum + s.data.length;
    if (s.data && typeof s.data === "object") return sum + 1;
    return sum;
  }, 0);

  // Trust score: 0.0 (no data) to 1.0 (rich evidence)
  let trustScore = 0.3; // base
  if (graphSources.length > 0) trustScore += 0.2;
  if (indexerSources.length > 0) trustScore += 0.2;
  if (pipelineSources.length > 0) trustScore += 0.1; // pipeline context boosts trust
  if (totalDataPoints > 10) trustScore += 0.15;
  if (totalDataPoints > 50) trustScore += 0.1;
  if (errorSources.length > 0) trustScore -= 0.15;
  if (safetyResult.status === "filtered") trustScore -= 0.1;
  trustScore = Math.max(0, Math.min(1, trustScore));

  const totalDurationMs = Date.now() - pipelineStart;

  // ── Extract real KG node IDs from retrieval sources for provenance ──
  const provenanceIds = extractProvenanceIds(allSources);

  // ── Record Provenance (fire-and-forget, never blocks the response) ──
  // endpointIds and parameterIds are extracted from actual graph retrieval results.
  // docChunkIds is always [] because the current KG architecture has no document
  // chunk layer — the 4 layers are: API Ontology, Operational Semantics, Schema
  // Lineage, and Error/Failure. A future RAG integration could populate this field.
  recordProvenance({
    sessionId: hashQuery(query),
    question: query,
    answer: answer.slice(0, 4000), // truncate to avoid DB column overflow
    confidence: trustScore.toFixed(3),
    endpointIds: provenanceIds.endpointIds,
    parameterIds: provenanceIds.parameterIds,
    docChunkIds: [], // No doc chunk layer in current KG architecture — genuinely empty
    warnings: [
      ...(safetyResult.status === "filtered" ? [`safety_filtered: ${safetyResult.filtered.join(", ")}`] : []),
      ...(errorSources.length > 0 ? [`retrieval_errors: ${errorSources.length}`] : []),
    ],
  }).catch(() => { /* provenance is best-effort — never fail the pipeline */ });

  // Final orchestrator step
  steps.push({
    agent: "orchestrator",
    phase: 4,
    action: "Pipeline complete",
    detail: `Trust: ${(trustScore * 100).toFixed(0)}% | ${totalDataPoints} data points | ${totalDurationMs}ms total`,
    status: "complete",
    timestamp: Date.now(),
    durationMs: totalDurationMs,
    dataPoints: totalDataPoints,
  });

  return {
    answer,
    reasoning: `Intent: ${intent.intent} | Confidence: ${((intent.confidence ?? 0.5) * 100).toFixed(0)}% | Strategy: ${intent.retrievalStrategy.join(", ")} | Sources: ${allSources.length} (${pipelineSources.length} pipeline) | Trust: ${(trustScore * 100).toFixed(0)}%`,
    sources: allSources,
    suggestedFollowUps,
    trustScore,
    confidence: intent.confidence ?? 0.5,
    safetyStatus: safetyResult.status === "filtered" ? "filtered" : "clean",
    provenance: {
      queryHash: hashQuery(query),
      graphSourceCount: graphSources.length,
      indexerSourceCount: indexerSources.length,
      totalDataPoints,
      blockedEndpoints: [],
      filteredPatterns: safetyResult.filtered,
      retrievalLatencyMs,
      synthesisLatencyMs,
    },
    agentSteps: steps,
  };
}
