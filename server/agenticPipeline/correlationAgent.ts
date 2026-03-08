/**
 * Correlation Agent — Pipeline Step 2
 * 
 * Consumes a TriageObject, retrieves related evidence from 6 data sources
 * (same-host alerts, same-user alerts, same-IOC alerts, vulnerabilities,
 * FIM events, threat intel), then uses the LLM to synthesize a
 * CorrelationBundle with blast radius, campaign assessment, and case recommendation.
 * 
 * Architecture: Fresh-context-per-stage — no shared conversation state with triage.
 * The TriageObject is the only handoff contract.
 */

import { getDb } from "../db";
import { triageObjects, correlationBundles, investigationSessions } from "../../drizzle/schema";
import { eq, desc, and, inArray, sql, gte } from "drizzle-orm";
import { invokeLLMWithFallback } from "../llm/llmService";
import {
  getEffectiveIndexerConfig,
  indexerSearch,
  INDEX_PATTERNS,
  type IndexerConfig,
  type ESSearchBody,
} from "../indexer/indexerClient";
import { getEffectiveWazuhConfig } from "../wazuh/wazuhClient";
import { wazuhGet } from "../wazuh/wazuhClient";
import { otxGet, isOtxConfigured } from "../otx/otxClient";
import type {
  TriageObject,
  CorrelationBundle,
  ExtractedEntity,
  MitreMapping,
  EvidenceItem,
  Uncertainty,
} from "../../shared/agenticSchemas";
import { parseLLMCorrelation } from "./types/LLMCorrelationRaw";
import { normalizeCorrelationBundle } from "./normalizeCorrelationBundle";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CorrelationAgentInput {
  triageId: string;
  /** Time window for correlation lookback (hours) */
  lookbackHours?: number;
  /** Max related alerts to retrieve per source */
  maxAlertsPerSource?: number;
  /** Whether to include OTX threat intel lookups */
  includeThreatIntel?: boolean;
}

export interface CorrelationAgentResult {
  correlationId: string;
  bundle: CorrelationBundle;
  latencyMs: number;
  tokensUsed: number;
  evidencePackSize: number;
}

// ── Evidence Pack Assembly ───────────────────────────────────────────────────

interface EvidencePack {
  sameHostAlerts: any[];
  sameUserAlerts: any[];
  sameIocAlerts: any[];
  vulnerabilities: any[];
  fimEvents: any[];
  threatIntel: any[];
  priorInvestigations: any[];
  totalItems: number;
}

/**
 * Retrieve same-host alerts from the indexer.
 */
async function fetchSameHostAlerts(
  config: IndexerConfig,
  agentId: string | undefined,
  agentName: string | undefined,
  alertId: string,
  lookbackHours: number,
  limit: number
): Promise<any[]> {
  if (!agentId && !agentName) return [];
  try {
    const must: any[] = [];
    if (agentId) {
      must.push({ match: { "agent.id": agentId } });
    } else if (agentName) {
      must.push({ match: { "agent.name": agentName } });
    }
    must.push({
      range: {
        timestamp: {
          gte: `now-${lookbackHours}h`,
          lte: "now",
        },
      },
    });
    // Exclude the triggering alert itself
    const mustNot = [{ term: { _id: alertId } }];
    const body: ESSearchBody = {
      query: {
        bool: { must, must_not: mustNot },
      },
      size: limit,
      sort: [{ timestamp: { order: "desc" } }],
      _source: [
        "timestamp", "rule.id", "rule.description", "rule.level", "rule.mitre",
        "agent.id", "agent.name", "data.srcip", "data.dstip", "data.srcuser",
        "data.dstuser", "data.srcport", "data.dstport",
      ],
    };
    const result = await indexerSearch(config, INDEX_PATTERNS.ALERTS, body, "correlation");
    return result.hits.hits.map((h: any) => ({ _id: h._id, ...h._source }));
  } catch {
    return [];
  }
}

/**
 * Retrieve alerts involving the same user(s) across different hosts.
 */
async function fetchSameUserAlerts(
  config: IndexerConfig,
  users: string[],
  agentId: string | undefined,
  alertId: string,
  lookbackHours: number,
  limit: number
): Promise<any[]> {
  if (users.length === 0) return [];
  try {
    const should = users.map((u) => ({
      multi_match: {
        query: u,
        fields: ["data.srcuser", "data.dstuser", "data.win.eventdata.targetUserName"],
      },
    }));
    const must: any[] = [
      { bool: { should, minimum_should_match: 1 } },
      { range: { timestamp: { gte: `now-${lookbackHours}h`, lte: "now" } } },
    ];
    // Exclude same host to find cross-host activity
    const mustNot: any[] = [{ term: { _id: alertId } }];
    if (agentId) {
      mustNot.push({ term: { "agent.id": agentId } });
    }
    const body: ESSearchBody = {
      query: { bool: { must, must_not: mustNot } },
      size: limit,
      sort: [{ timestamp: { order: "desc" } }],
      _source: [
        "timestamp", "rule.id", "rule.description", "rule.level", "rule.mitre",
        "agent.id", "agent.name", "data.srcuser", "data.dstuser",
        "data.srcip", "data.dstip",
      ],
    };
    const result = await indexerSearch(config, INDEX_PATTERNS.ALERTS, body, "correlation");
    return result.hits.hits.map((h: any) => ({ _id: h._id, ...h._source }));
  } catch {
    return [];
  }
}

/**
 * Retrieve alerts involving the same IOCs (IPs, hashes, domains).
 */
async function fetchSameIocAlerts(
  config: IndexerConfig,
  iocs: { ips: string[]; hashes: string[]; domains: string[] },
  alertId: string,
  lookbackHours: number,
  limit: number
): Promise<any[]> {
  const allIocs = [...iocs.ips, ...iocs.hashes, ...iocs.domains];
  if (allIocs.length === 0) return [];
  try {
    const should: any[] = [];
    for (const ip of iocs.ips) {
      should.push({ multi_match: { query: ip, fields: ["data.srcip", "data.dstip", "data.ip"] } });
    }
    for (const hash of iocs.hashes) {
      should.push({ multi_match: { query: hash, fields: ["syscheck.md5_after", "syscheck.sha1_after", "syscheck.sha256_after"] } });
    }
    for (const domain of iocs.domains) {
      should.push({ multi_match: { query: domain, fields: ["data.hostname", "data.url", "data.dns.question.name"] } });
    }
    if (should.length === 0) return [];
    const body: ESSearchBody = {
      query: {
        bool: {
          must: [
            { bool: { should, minimum_should_match: 1 } },
            { range: { timestamp: { gte: `now-${lookbackHours}h`, lte: "now" } } },
          ],
          must_not: [{ term: { _id: alertId } }],
        },
      },
      size: limit,
      sort: [{ timestamp: { order: "desc" } }],
      _source: [
        "timestamp", "rule.id", "rule.description", "rule.level", "rule.mitre",
        "agent.id", "agent.name", "data.srcip", "data.dstip",
      ],
    };
    const result = await indexerSearch(config, INDEX_PATTERNS.ALERTS, body, "correlation");
    return result.hits.hits.map((h: any) => ({ _id: h._id, ...h._source }));
  } catch {
    return [];
  }
}

/**
 * Retrieve vulnerabilities for the affected agent.
 */
async function fetchVulnerabilities(
  config: IndexerConfig,
  agentId: string | undefined,
  limit: number
): Promise<any[]> {
  if (!agentId) return [];
  try {
    const body: ESSearchBody = {
      query: {
        bool: {
          must: [{ match: { "agent.id": agentId } }],
        },
      },
      size: limit,
      sort: [{ "vulnerability.severity": { order: "asc" } }],
      _source: [
        "vulnerability.cve", "vulnerability.severity", "vulnerability.name",
        "vulnerability.status", "package.name", "package.version",
        "agent.id", "agent.name",
      ],
    };
    const result = await indexerSearch(config, INDEX_PATTERNS.VULNERABILITIES, body, "correlation");
    return result.hits.hits.map((h: any) => h._source);
  } catch {
    return [];
  }
}

/**
 * Retrieve FIM events for the affected agent.
 */
async function fetchFimEvents(
  wazuhConfig: any,
  agentId: string | undefined,
  limit: number
): Promise<any[]> {
  if (!agentId || !wazuhConfig) return [];
  try {
    const result = await wazuhGet(wazuhConfig, {
      path: `/syscheck/${agentId}`,
      params: { limit, sort: "-date" },
      rateLimitGroup: "correlation",
    }) as any;
    return result?.data?.affected_items ?? [];
  } catch {
    return [];
  }
}

/**
 * Lookup IOCs against OTX threat intelligence.
 */
async function fetchThreatIntel(
  entities: ExtractedEntity[]
): Promise<any[]> {
  if (!isOtxConfigured()) return [];
  const results: any[] = [];
  // Lookup IPs
  const ips = entities.filter((e) => e.type === "ip").slice(0, 5);
  for (const ip of ips) {
    try {
      const data = await otxGet(
        `/api/v1/indicators/IPv4/${ip.value}/general`,
        {},
        "indicators",
        600
      );
      if (data) {
        results.push({
          type: "ip",
          value: ip.value,
          source: "OTX",
          data: summarizeOtxResult(data),
        });
      }
    } catch { /* skip failed lookups */ }
  }
  // Lookup hashes
  const hashes = entities.filter((e) => e.type === "hash").slice(0, 3);
  for (const hash of hashes) {
    try {
      const data = await otxGet(
        `/api/v1/indicators/file/${hash.value}/general`,
        {},
        "indicators",
        600
      );
      if (data) {
        results.push({
          type: "hash",
          value: hash.value,
          source: "OTX",
          data: summarizeOtxResult(data),
        });
      }
    } catch { /* skip failed lookups */ }
  }
  // Lookup domains
  const domains = entities.filter((e) => e.type === "domain").slice(0, 3);
  for (const domain of domains) {
    try {
      const data = await otxGet(
        `/api/v1/indicators/domain/${domain.value}/general`,
        {},
        "indicators",
        600
      );
      if (data) {
        results.push({
          type: "domain",
          value: domain.value,
          source: "OTX",
          data: summarizeOtxResult(data),
        });
      }
    } catch { /* skip failed lookups */ }
  }
  return results;
}

function summarizeOtxResult(data: any): Record<string, unknown> {
  return {
    pulseCount: data?.pulse_info?.count ?? 0,
    reputation: data?.reputation ?? null,
    country: data?.country_name ?? null,
    asn: data?.asn ?? null,
    malwareCount: data?.malware?.count ?? 0,
    tags: (data?.pulse_info?.pulses ?? []).slice(0, 5).flatMap((p: any) => p.tags ?? []).slice(0, 10),
    relatedPulses: (data?.pulse_info?.pulses ?? []).slice(0, 3).map((p: any) => ({
      name: p.name,
      created: p.created,
      adversary: p.adversary,
    })),
  };
}

/**
 * Find prior investigations that may be related to this triage.
 */
async function fetchPriorInvestigations(
  entities: ExtractedEntity[],
  agentId: string | undefined
): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const sessions = await db.select()
      .from(investigationSessions)
      .where(inArray(investigationSessions.status, ["active", "closed"]))
      .orderBy(desc(investigationSessions.updatedAt))
      .limit(50);
    
    const entityValues = new Set(entities.map((e) => e.value.toLowerCase()));
    if (agentId) entityValues.add(agentId);
    
    return sessions.filter((s) => {
      // Check evidence for entity overlap
      if (Array.isArray(s.evidence)) {
        for (const ev of s.evidence) {
          const data = ev.data ?? {};
          for (const val of Object.values(data)) {
            if (typeof val === "string" && entityValues.has(val.toLowerCase())) return true;
          }
        }
      }
      // Check title/description
      for (const val of Array.from(entityValues)) {
        if (s.title?.toLowerCase().includes(val) || s.description?.toLowerCase().includes(val)) return true;
      }
      return false;
    }).slice(0, 10).map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      evidenceCount: Array.isArray(s.evidence) ? s.evidence.length : 0,
      updatedAt: s.updatedAt,
    }));
  } catch {
    return [];
  }
}

// ── Evidence Pack Assembly ───────────────────────────────────────────────────

async function assembleEvidencePack(
  triage: TriageObject,
  lookbackHours: number,
  maxPerSource: number,
  includeThreatIntel: boolean
): Promise<EvidencePack> {
  const indexerConfig = await getEffectiveIndexerConfig();
  const wazuhConfig = await getEffectiveWazuhConfig();
  
  // Extract entity values by type for targeted queries
  const entities = triage.entities ?? [];
  const users = entities.filter((e) => e.type === "user").map((e) => e.value);
  const ips = entities.filter((e) => e.type === "ip").map((e) => e.value);
  const hashes = entities.filter((e) => e.type === "hash").map((e) => e.value);
  const domains = entities.filter((e) => e.type === "domain").map((e) => e.value);
  
  // Run all retrievals in parallel
  const [sameHostAlerts, sameUserAlerts, sameIocAlerts, vulnerabilities, fimEvents, threatIntel, priorInvestigations] =
    await Promise.all([
      indexerConfig
        ? fetchSameHostAlerts(indexerConfig, triage.agent?.id, triage.agent?.name, triage.alertId, lookbackHours, maxPerSource)
        : Promise.resolve([]),
      indexerConfig
        ? fetchSameUserAlerts(indexerConfig, users, triage.agent?.id, triage.alertId, lookbackHours, maxPerSource)
        : Promise.resolve([]),
      indexerConfig
        ? fetchSameIocAlerts(indexerConfig, { ips, hashes, domains }, triage.alertId, lookbackHours, maxPerSource)
        : Promise.resolve([]),
      indexerConfig
        ? fetchVulnerabilities(indexerConfig, triage.agent?.id, maxPerSource)
        : Promise.resolve([]),
      fetchFimEvents(wazuhConfig, triage.agent?.id, maxPerSource),
      includeThreatIntel ? fetchThreatIntel(entities) : Promise.resolve([]),
      fetchPriorInvestigations(entities, triage.agent?.id),
    ]);
  
  const totalItems = sameHostAlerts.length + sameUserAlerts.length + sameIocAlerts.length +
    vulnerabilities.length + fimEvents.length + threatIntel.length + priorInvestigations.length;
  
  return {
    sameHostAlerts,
    sameUserAlerts,
    sameIocAlerts,
    vulnerabilities,
    fimEvents,
    threatIntel,
    priorInvestigations,
    totalItems,
  };
}

// ── LLM Correlation Synthesis ────────────────────────────────────────────────

const CORRELATION_SYSTEM_PROMPT = `You are a senior SOC analyst performing evidence correlation.
You receive a triage object (the alert that triggered this analysis) and an evidence pack
(related alerts, vulnerabilities, FIM events, threat intel, and prior investigations).

Your job is to synthesize a CorrelationBundle — a structured assessment of:
1. How the triggering alert relates to other activity across the environment
2. The blast radius (affected hosts, users, services)
3. Whether this is part of a campaign or isolated incident
4. Whether to merge into an existing investigation, create a new one, or defer to analyst

Rules:
- Distinguish between EVIDENCE (what the data shows), INFERENCE (your analysis), and UNCERTAINTY (what you don't know)
- Every claim must cite specific evidence from the pack
- Do NOT hallucinate IOCs, alert IDs, or entity values — only reference what's in the data
- If the evidence pack is sparse, say so — do not inflate the correlation
- Assign confidence scores honestly — low data = low confidence
- For campaign assessment: require at least 3 correlated signals across 2+ hosts to suggest "likely campaign"
- For case action: recommend "merge_existing" only if there's a clear entity overlap with an active investigation`;

function buildCorrelationPrompt(triage: TriageObject, pack: EvidencePack): string {
  const parts: string[] = [
    "## Triggering Triage Object",
    "```json",
    JSON.stringify({
      triageId: triage.triageId,
      alertId: triage.alertId,
      ruleId: triage.ruleId,
      ruleDescription: triage.ruleDescription,
      severity: triage.severity,
      severityConfidence: triage.severityConfidence,
      route: triage.route,
      agentId: triage.agent?.id,
      agentName: triage.agent?.name,
      alertFamily: triage.alertFamily,
      entities: triage.entities,
      mitreMapping: triage.mitreMapping,
      summary: triage.summary,
    }, null, 2).slice(0, 3000),
    "```",
    "",
    "## Evidence Pack",
    "",
  ];
  
  if (pack.sameHostAlerts.length > 0) {
    parts.push(`### Same-Host Alerts (${pack.sameHostAlerts.length} found)`);
    parts.push("```json");
    parts.push(JSON.stringify(pack.sameHostAlerts.slice(0, 15), null, 2).slice(0, 3000));
    parts.push("```");
    parts.push("");
  }
  
  if (pack.sameUserAlerts.length > 0) {
    parts.push(`### Cross-Host Same-User Alerts (${pack.sameUserAlerts.length} found)`);
    parts.push("```json");
    parts.push(JSON.stringify(pack.sameUserAlerts.slice(0, 10), null, 2).slice(0, 2000));
    parts.push("```");
    parts.push("");
  }
  
  if (pack.sameIocAlerts.length > 0) {
    parts.push(`### Same-IOC Alerts (${pack.sameIocAlerts.length} found)`);
    parts.push("```json");
    parts.push(JSON.stringify(pack.sameIocAlerts.slice(0, 10), null, 2).slice(0, 2000));
    parts.push("```");
    parts.push("");
  }
  
  if (pack.vulnerabilities.length > 0) {
    parts.push(`### Agent Vulnerabilities (${pack.vulnerabilities.length} found)`);
    parts.push("```json");
    parts.push(JSON.stringify(pack.vulnerabilities.slice(0, 10), null, 2).slice(0, 2000));
    parts.push("```");
    parts.push("");
  }
  
  if (pack.fimEvents.length > 0) {
    parts.push(`### FIM Events (${pack.fimEvents.length} found)`);
    parts.push("```json");
    parts.push(JSON.stringify(pack.fimEvents.slice(0, 10), null, 2).slice(0, 2000));
    parts.push("```");
    parts.push("");
  }
  
  if (pack.threatIntel.length > 0) {
    parts.push(`### Threat Intelligence (${pack.threatIntel.length} lookups)`);
    parts.push("```json");
    parts.push(JSON.stringify(pack.threatIntel, null, 2).slice(0, 2000));
    parts.push("```");
    parts.push("");
  }
  
  if (pack.priorInvestigations.length > 0) {
    parts.push(`### Prior Investigations (${pack.priorInvestigations.length} related)`);
    parts.push("```json");
    parts.push(JSON.stringify(pack.priorInvestigations, null, 2).slice(0, 1500));
    parts.push("```");
    parts.push("");
  }
  
  if (pack.totalItems === 0) {
    parts.push("### No Related Evidence Found");
    parts.push("The evidence pack is empty — no related alerts, vulnerabilities, FIM events, or threat intel were found.");
    parts.push("This may indicate an isolated event or insufficient data coverage.");
    parts.push("");
  }
  
  parts.push("## Instructions");
  parts.push("Produce a CorrelationBundle JSON object with these exact fields:");
  parts.push("- correlationId: use the provided ID");
  parts.push("- sourceTriageId: the triage ID from the triggering object");
  parts.push("- relatedAlerts: array of { alertId, ruleId, ruleDescription, ruleLevel, agentId, agentName, timestamp, relationship } — only include alerts from the evidence pack");
  parts.push("- discoveredEntities: array of { type, value, confidence, source } — entities found across the evidence pack (not just the triage)");
  parts.push("- blastRadius: { affectedHosts: string[], affectedUsers: string[], affectedServices: string[], assetCriticality: 'critical'|'high'|'medium'|'low'|'unknown' }");
  parts.push("- campaignAssessment: { likelyCampaign: boolean, campaignName: string|null, confidence: number, reasoning: string, indicators: string[] }");
  parts.push("- caseRecommendation: { action: 'merge_existing'|'create_new'|'defer_to_analyst', mergeTargetId: number|null, mergeTargetTitle: string|null, reasoning: string, confidence: number }");
  parts.push("- riskScore: number 0-100 (composite risk considering severity, blast radius, campaign likelihood, asset criticality)");
  parts.push("- summary: string — 2-3 sentence executive summary of the correlation findings");
  parts.push("- evidenceSummary: string — what the data shows (facts only)");
  parts.push("- inferenceSummary: string — what you conclude from the evidence");
  parts.push("- uncertainties: array of { description, impact, suggestedAction }");
  parts.push("- confidence: number 0.0-1.0 — overall correlation confidence");
  parts.push("- mitreMapping: array of { techniqueId, techniqueName, tactic, confidence } — aggregated across all evidence");
  
  return parts.join("\n");
}

const CORRELATION_JSON_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "correlation_bundle",
    strict: true,
    schema: {
      type: "object",
      properties: {
        correlationId: { type: "string" },
        sourceTriageId: { type: "string" },
        relatedAlerts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              alertId: { type: "string" },
              ruleId: { type: "string" },
              ruleDescription: { type: "string" },
              ruleLevel: { type: "number" },
              agentId: { type: "string" },
              agentName: { type: "string" },
              timestamp: { type: "string" },
              relationship: { type: "string" },
            },
            required: ["alertId", "ruleId", "ruleDescription", "ruleLevel", "agentId", "timestamp", "relationship"],
            additionalProperties: false,
          },
        },
        discoveredEntities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string" },
              value: { type: "string" },
              confidence: { type: "number" },
              source: { type: "string" },
            },
            required: ["type", "value", "confidence", "source"],
            additionalProperties: false,
          },
        },
        blastRadius: {
          type: "object",
          properties: {
            affectedHosts: { type: "array", items: { type: "string" } },
            affectedUsers: { type: "array", items: { type: "string" } },
            affectedServices: { type: "array", items: { type: "string" } },
            assetCriticality: { type: "string" },
          },
          required: ["affectedHosts", "affectedUsers", "affectedServices", "assetCriticality"],
          additionalProperties: false,
        },
        campaignAssessment: {
          type: "object",
          properties: {
            likelyCampaign: { type: "boolean" },
            campaignName: { type: ["string", "null"] },
            confidence: { type: "number" },
            reasoning: { type: "string" },
            indicators: { type: "array", items: { type: "string" } },
          },
          required: ["likelyCampaign", "campaignName", "confidence", "reasoning", "indicators"],
          additionalProperties: false,
        },
        caseRecommendation: {
          type: "object",
          properties: {
            action: { type: "string" },
            mergeTargetId: { type: ["number", "null"] },
            mergeTargetTitle: { type: ["string", "null"] },
            reasoning: { type: "string" },
            confidence: { type: "number" },
          },
          required: ["action", "mergeTargetId", "mergeTargetTitle", "reasoning", "confidence"],
          additionalProperties: false,
        },
        riskScore: { type: "number" },
        summary: { type: "string" },
        evidenceSummary: { type: "string" },
        inferenceSummary: { type: "string" },
        uncertainties: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              impact: { type: "string" },
              suggestedAction: { type: "string" },
            },
            required: ["description", "impact", "suggestedAction"],
            additionalProperties: false,
          },
        },
        confidence: { type: "number" },
        mitreMapping: {
          type: "array",
          items: {
            type: "object",
            properties: {
              techniqueId: { type: "string" },
              techniqueName: { type: "string" },
              tactic: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["techniqueId", "techniqueName", "tactic", "confidence"],
            additionalProperties: false,
          },
        },
      },
      required: [
        "correlationId", "sourceTriageId", "relatedAlerts", "discoveredEntities",
        "blastRadius", "campaignAssessment", "caseRecommendation", "riskScore",
        "summary", "evidenceSummary", "inferenceSummary", "uncertainties",
        "confidence", "mitreMapping",
      ],
      additionalProperties: false,
    },
  },
};

// ── Main Correlation Agent ───────────────────────────────────────────────────

export async function runCorrelationAgent(
  input: CorrelationAgentInput
): Promise<CorrelationAgentResult> {
  const startTime = Date.now();
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // 1. Load the source triage object
  const [triageRow] = await db.select()
    .from(triageObjects)
    .where(eq(triageObjects.triageId, input.triageId))
    .limit(1);
  
  if (!triageRow) throw new Error(`Triage object not found: ${input.triageId}`);
  if (triageRow.status !== "completed") throw new Error(`Triage not completed: ${triageRow.status}`);
  
  const triage = triageRow.triageData as TriageObject;
  
  // 2. Generate correlation ID and create pending record
  const correlationId = `corr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  await db.insert(correlationBundles).values({
    correlationId,
    sourceTriageId: input.triageId,
    status: "processing",
    confidence: 0,
    bundleData: {} as any, // placeholder
  });
  
  try {
    // 3. Assemble evidence pack (parallel retrieval from 6+ sources)
    const lookbackHours = input.lookbackHours ?? 24;
    const maxPerSource = input.maxAlertsPerSource ?? 20;
    const includeThreatIntel = input.includeThreatIntel ?? true;
    
    const evidencePack = await assembleEvidencePack(triage, lookbackHours, maxPerSource, includeThreatIntel);
    
    // 4. Build prompt and invoke LLM
    const prompt = buildCorrelationPrompt(triage, evidencePack);
    
    const llmResult = await invokeLLMWithFallback({
      messages: [
        { role: "system", content: CORRELATION_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      response_format: CORRELATION_JSON_SCHEMA,
    });
    
    // 5. Parse and validate the structured LLM response via Zod schema
    const content = llmResult.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM returned empty response");
    
    const rawJson = typeof content === "string" ? JSON.parse(content) : content;
    
    // Zod-validate the raw LLM output — throws ZodError if malformed
    const validatedRaw = parseLLMCorrelation(rawJson);
    
    // 6. Normalize raw LLM shape → canonical CorrelationBundle
    // This is the ONLY place where raw crosses into canonical.
    // IDs are stamped by the normalizer, not by mutating the raw object.
    const bundle = normalizeCorrelationBundle(validatedRaw, {
      correlationId,
      triageId: input.triageId,
    });
    
    // 7. Calculate tokens used
    const tokensUsed = extractTokenCount(llmResult);
    const latencyMs = Date.now() - startTime;
    
    // 8. Persist the completed correlation bundle
    // All fields now read from the CANONICAL bundle, not raw LLM output.
    // blastRadius.affectedHosts is a number (count), not string[]
    // blastRadius.affectedUsers is a number (count), not string[]
    // synthesis.confidence is the canonical path, not top-level
    await db.update(correlationBundles)
      .set({
        status: "completed",
        bundleData: bundle,
        relatedAlertCount: bundle.relatedAlerts?.length ?? 0,
        discoveredEntityCount: bundle.discoveredEntities?.length ?? 0,
        blastRadiusHosts: bundle.blastRadius.affectedHosts,
        blastRadiusUsers: bundle.blastRadius.affectedUsers,
        assetCriticality: bundle.blastRadius.assetCriticality,
        likelyCampaign: bundle.campaignAssessment.likelyCampaign ? 1 : 0,
        caseAction: bundle.caseRecommendation.action,
        mergeTargetId: bundle.caseRecommendation.mergeTargetId ?? null,
        confidence: bundle.synthesis.confidence,
        latencyMs,
        tokensUsed,
      })
      .where(eq(correlationBundles.correlationId, correlationId));
    
    return {
      correlationId,
      bundle,
      latencyMs,
      tokensUsed,
      evidencePackSize: evidencePack.totalItems,
    };
  } catch (err) {
    // Mark as failed
    await db.update(correlationBundles)
      .set({
        status: "failed",
        errorMessage: (err as Error).message,
      })
      .where(eq(correlationBundles.correlationId, correlationId));
    throw err;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractTokenCount(result: any): number {
  const usage = result?.usage;
  if (!usage) return 0;
  return (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
}

function normalizeAssetCriticality(value: string | undefined): "critical" | "high" | "medium" | "low" | "unknown" {
  const valid = ["critical", "high", "medium", "low", "unknown"];
  return valid.includes(value ?? "") ? (value as any) : "unknown";
}

function normalizeCaseAction(value: string | undefined): "merge_existing" | "create_new" | "defer_to_analyst" {
  const valid = ["merge_existing", "create_new", "defer_to_analyst"];
  return valid.includes(value ?? "") ? (value as any) : "defer_to_analyst";
}

// ── Query Helpers ────────────────────────────────────────────────────────────

export async function getCorrelationByTriageId(triageId: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select()
    .from(correlationBundles)
    .where(eq(correlationBundles.sourceTriageId, triageId))
    .orderBy(desc(correlationBundles.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getCorrelationById(correlationId: string) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select()
    .from(correlationBundles)
    .where(eq(correlationBundles.correlationId, correlationId))
    .limit(1);
  return row ?? null;
}

export async function listCorrelations(opts: {
  limit?: number;
  offset?: number;
  status?: string;
  caseAction?: string;
}) {
  const db = await getDb();
  if (!db) return { bundles: [], total: 0 };
  
  const conditions: any[] = [];
  if (opts.status) conditions.push(eq(correlationBundles.status, opts.status as any));
  if (opts.caseAction) conditions.push(eq(correlationBundles.caseAction, opts.caseAction as any));
  
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  
  const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(correlationBundles)
    .where(where);
  
  const bundles = await db.select()
    .from(correlationBundles)
    .where(where)
    .orderBy(desc(correlationBundles.createdAt))
    .limit(opts.limit ?? 20)
    .offset(opts.offset ?? 0);
  
  return { bundles, total: countResult?.count ?? 0 };
}

export async function getCorrelationStats() {
  const db = await getDb();
  if (!db) return { total: 0, completed: 0, failed: 0, avgConfidence: 0, avgLatency: 0, campaignCount: 0, mergeCount: 0, createCount: 0 };
  
  const [stats] = await db.select({
    total: sql<number>`COUNT(*)`,
    completed: sql<number>`SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)`,
    failed: sql<number>`SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)`,
    avgConfidence: sql<number>`AVG(CASE WHEN status = 'completed' THEN confidence ELSE NULL END)`,
    avgLatency: sql<number>`AVG(CASE WHEN status = 'completed' THEN latencyMs ELSE NULL END)`,
    campaignCount: sql<number>`SUM(CASE WHEN likelyCampaign = 1 THEN 1 ELSE 0 END)`,
    mergeCount: sql<number>`SUM(CASE WHEN caseAction = 'merge_existing' THEN 1 ELSE 0 END)`,
    createCount: sql<number>`SUM(CASE WHEN caseAction = 'create_new' THEN 1 ELSE 0 END)`,
  }).from(correlationBundles);
  
  return {
    total: stats?.total ?? 0,
    completed: stats?.completed ?? 0,
    failed: stats?.failed ?? 0,
    avgConfidence: Math.round((stats?.avgConfidence ?? 0) * 100) / 100,
    avgLatency: Math.round(stats?.avgLatency ?? 0),
    campaignCount: stats?.campaignCount ?? 0,
    mergeCount: stats?.mergeCount ?? 0,
    createCount: stats?.createCount ?? 0,
  };
}
