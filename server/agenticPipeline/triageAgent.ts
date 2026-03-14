/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Triage Agent — Step 1 of the Agentic SOC Pipeline
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Takes a raw Wazuh alert and produces a canonical TriageObject.
 * Fresh context per invocation — no shared conversation state.
 *
 * Pipeline: Raw Alert → Entity Extraction → Severity Assignment →
 *           Dedup Detection → Route Recommendation → TriageObject
 *
 * This agent uses structured JSON output via response_format to ensure
 * the LLM produces a valid TriageObject schema every time.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { invokeLLMWithFallback } from "../llm/llmService";
import type { InvokeResult } from "../_core/llm";
import { getDb } from "../db";
import { triageObjects, investigationSessions, correlationBundles } from "../../drizzle/schema";
import { eq, desc, and, or, like, sql, getTableColumns } from "drizzle-orm";
import { randomUUID } from "crypto";
import type {
  TriageObject,
  AgenticSeverity,
  TriageRoute,
  ExtractedEntity,
  MitreMapping,
  EvidenceItem,
  Uncertainty,
  Confidence,
} from "../../shared/agenticSchemas";
import { sanitizeForPrompt } from "./sanitizeForPrompt";
import { assertValidTriageObject } from "../../shared/agenticZodSchemas";

// ── Triage JSON Schema (for structured LLM output) ──────────────────────────

const TRIAGE_OUTPUT_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "triage_object",
    strict: true,
    schema: {
      type: "object",
      properties: {
        alertFamily: { type: "string", description: "Normalized alert type/family (e.g., brute_force, malware_execution, policy_violation, authentication_failure, file_integrity_change, vulnerability_exploit, lateral_movement, data_exfiltration, privilege_escalation, reconnaissance)" },
        severity: { type: "string", enum: ["critical", "high", "medium", "low", "info"], description: "AI-assigned severity" },
        severityConfidence: { type: "number", description: "Confidence in severity (0.0–1.0)" },
        severityReasoning: { type: "string", description: "Brief evidence-backed reasoning for severity" },
        entities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["host", "user", "process", "hash", "ip", "domain", "rule_id", "mitre_technique", "cve", "file_path", "port", "registry_key"] },
              value: { type: "string" },
              confidence: { type: "number" },
            },
            required: ["type", "value", "confidence"],
            additionalProperties: false,
          },
          description: "All entities extracted from this alert",
        },
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
          description: "MITRE ATT&CK technique mappings",
        },
        dedup: {
          type: "object",
          properties: {
            isDuplicate: { type: "boolean" },
            similarityScore: { type: "number" },
            similarTriageId: { type: "string" },
            reasoning: { type: "string" },
          },
          required: ["isDuplicate", "similarityScore", "reasoning"],
          additionalProperties: false,
          description: "Dedup/similarity assessment",
        },
        route: { type: "string", enum: ["A_DUPLICATE_NOISY", "B_LOW_CONFIDENCE", "C_HIGH_CONFIDENCE", "D_LIKELY_BENIGN"], description: "Recommended pipeline route" },
        routeReasoning: { type: "string", description: "Why this route was chosen" },
        summary: { type: "string", description: "Concise analyst-readable summary (2–4 sentences)" },
        uncertainties: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              impact: { type: "string" },
              suggestedAction: { type: "string" },
            },
            required: ["description", "impact"],
            additionalProperties: false,
          },
          description: "Things the triage agent doesn't know",
        },
        caseLink: {
          type: "object",
          properties: {
            shouldLink: { type: "boolean" },
            suggestedCaseId: { type: "number" },
            suggestedCaseTitle: { type: "string" },
            confidence: { type: "number" },
            reasoning: { type: "string" },
          },
          required: ["shouldLink", "confidence", "reasoning"],
          additionalProperties: false,
          description: "Suggestion for linking to an existing investigation",
        },
      },
      required: [
        "alertFamily", "severity", "severityConfidence", "severityReasoning",
        "entities", "mitreMapping", "dedup", "route", "routeReasoning",
        "summary", "uncertainties", "caseLink",
      ],
      additionalProperties: false,
    },
  },
};

// ── System Prompt ────────────────────────────────────────────────────────────

function buildTriageSystemPrompt(recentTriages: string, activeInvestigations: string): string {
  return `You are a Triage Agent in a Security Operations Center (SOC). Your job is to analyze a raw Wazuh security alert and produce a structured triage assessment.

## Your Role
- You are the FIRST agent in a pipeline. Your output will be consumed by downstream agents (Correlation, Hypothesis, Case).
- You must be precise, evidence-based, and honest about uncertainty.
- NEVER fabricate evidence. If you're unsure, say so in the uncertainties field.
- Preserve all original identifiers (agent IDs, rule IDs, timestamps) verbatim.

## Classification Guidelines

### Severity Assignment
- **critical**: Active exploitation, confirmed breach, data exfiltration in progress, ransomware execution
- **high**: Strong indicators of compromise, successful authentication bypass, privilege escalation
- **medium**: Suspicious activity requiring investigation, repeated failed auth, unusual process execution
- **low**: Policy violations, configuration drift, informational security events
- **info**: Routine events, successful operations, baseline activity

### Route Recommendation
- **A_DUPLICATE_NOISY**: This alert is substantially similar to a recent triage (>0.8 similarity). Recommend suppression/tuning.
- **B_LOW_CONFIDENCE**: You cannot confidently classify this alert. Needs enrichment and correlation before routing.
- **C_HIGH_CONFIDENCE**: Clear indicators of concern. Should proceed directly to correlation and investigation.
- **D_LIKELY_BENIGN**: Strong evidence this is normal/expected behavior. Draft closure rationale.

### Entity Extraction
Extract ALL observable entities: IPs, hostnames, usernames, process names, file paths, hashes, domains, ports, CVEs, MITRE technique IDs, rule IDs.
Mark each with a confidence score (0.0–1.0).

### Deduplication
Compare against recent triage objects provided in context. If the alert has the same rule ID, same agent, and similar entities within a short time window, it's likely a duplicate.

## Recent Triage Objects (for dedup comparison)
${recentTriages || "No recent triage objects available."}

## Active Investigations (for case-link suggestions)
${activeInvestigations || "No active investigations."}

## Output Format
Respond with a JSON object matching the triage_object schema exactly. Do not include any text outside the JSON.`;
}

// ── Retrieval: Recent Triages for Dedup ──────────────────────────────────────

async function fetchRecentTriages(agentId?: string, ruleId?: string, limit = 10): Promise<Array<{
  triageId: string;
  alertFamily: string;
  ruleId: string;
  severity: string;
  triagedAt: string;
  summary: string | null;
}>> {
  try {
    const db = await getDb();
    if (!db) return [];

    const conditions = [eq(triageObjects.status, "completed")];
    if (agentId) conditions.push(eq(triageObjects.agentId, agentId));
    if (ruleId) conditions.push(eq(triageObjects.ruleId, ruleId));

    const rows = await db
      .select({
        triageId: triageObjects.triageId,
        alertFamily: triageObjects.alertFamily,
        ruleId: triageObjects.ruleId,
        severity: triageObjects.severity,
        triagedAt: triageObjects.createdAt,
        summary: triageObjects.summary,
      })
      .from(triageObjects)
      .where(and(...conditions))
      .orderBy(desc(triageObjects.createdAt))
      .limit(limit);

    return rows.map(r => ({
      ...r,
      alertFamily: r.alertFamily ?? "unknown",
      triagedAt: r.triagedAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

// ── Retrieval: Active Investigations for Case-Link ───────────────────────────

async function fetchActiveInvestigations(userId: number, limit = 20): Promise<Array<{
  id: number;
  title: string;
  description: string | null;
}>> {
  try {
    const db = await getDb();
    if (!db) return [];

    const rows = await db
      .select({
        id: investigationSessions.id,
        title: investigationSessions.title,
        description: investigationSessions.description,
      })
      .from(investigationSessions)
      .where(
        and(
          eq(investigationSessions.userId, userId),
          eq(investigationSessions.status, "active"),
        )
      )
      .orderBy(desc(investigationSessions.updatedAt))
      .limit(limit);

    return rows;
  } catch {
    return [];
  }
}

// ── Core Triage Function ─────────────────────────────────────────────────────

export interface TriageResult {
  success: boolean;
  triageObject?: TriageObject;
  triageId?: string;
  dbId?: number;
  latencyMs: number;
  tokensUsed?: number;
  error?: string;
}

/**
 * Run the triage agent on a raw Wazuh alert.
 * This is the primary entry point for Step 1 of the pipeline.
 */
export async function runTriageAgent(input: {
  rawAlert: Record<string, unknown>;
  userId: number;
  alertQueueItemId?: number;
}): Promise<TriageResult> {
  const startTime = Date.now();
  const triageId = `triage-${randomUUID().slice(0, 12)}`;

  // Extract basic alert fields for retrieval queries
  const alertId = extractAlertId(input.rawAlert);
  const ruleId = extractRuleId(input.rawAlert);
  const ruleDescription = extractRuleDescription(input.rawAlert);
  const ruleLevel = extractRuleLevel(input.rawAlert);
  const alertTimestamp = extractTimestamp(input.rawAlert);
  const agentInfo = extractAgentInfo(input.rawAlert);

  // Insert a pending triage row — DB persistence is required for pipeline truth.
  // If the INSERT fails, the triage cannot report success because downstream
  // stages (correlation, hypothesis) read from DB, not from in-memory results.
  let dbId: number | undefined;
  const db = await getDb();
  if (db) {
    const result = await db.insert(triageObjects).values({
      triageId,
      alertId: alertId || "unknown",
      ruleId: ruleId || "unknown",
      ruleDescription,
      ruleLevel: ruleLevel ?? 0,
      alertTimestamp,
      agentId: agentInfo.id || null,
      agentName: agentInfo.name || null,
      status: "processing",
      route: "B_LOW_CONFIDENCE", // default until LLM responds
      triagedBy: "triage_agent",
      triggeredByUserId: input.userId,
      alertQueueItemId: input.alertQueueItemId ?? null,
      triageData: {
        schemaVersion: "1.0",
        triageId,
        triagedAt: new Date().toISOString(),
        triagedBy: "triage_agent",
        alertId: alertId || "unknown",
        ruleId: ruleId || "unknown",
        ruleDescription: ruleDescription || "",
        ruleLevel: ruleLevel ?? 0,
        alertTimestamp: alertTimestamp || new Date().toISOString(),
        agent: agentInfo,
        alertFamily: "pending",
        severity: "info",
        severityConfidence: 0,
        severityReasoning: "",
        entities: [],
        mitreMapping: [],
        dedup: { isDuplicate: false, similarityScore: 0, reasoning: "Processing" },
        route: "B_LOW_CONFIDENCE",
        routeReasoning: "Processing — awaiting LLM triage",
        summary: "Triage in progress",
        keyEvidence: [],
        uncertainties: [],
        caseLink: { shouldLink: false, confidence: 0, reasoning: "Processing" },
        rawAlert: input.rawAlert,
      } satisfies TriageObject, // valid sentinel — updated after LLM response
    });
    dbId = result[0]?.insertId;
  }

  if (!dbId) {
    return {
      success: false,
      triageId,
      latencyMs: Date.now() - startTime,
      error: "Database not available or INSERT failed — cannot persist triage",
    };
  }

  try {
    // ── Retrieval Phase ──────────────────────────────────────────────────
    const [recentTriages, activeInvestigations] = await Promise.all([
      fetchRecentTriages(agentInfo.id, ruleId),
      fetchActiveInvestigations(input.userId),
    ]);

    const recentTriagesStr = recentTriages.length > 0
      ? recentTriages.map(t => `- [${t.triageId}] ${t.alertFamily} | Rule ${t.ruleId} | ${t.severity} | ${t.triagedAt}\n  ${t.summary || "No summary"}`).join("\n")
      : "";

    const activeInvestigationsStr = activeInvestigations.length > 0
      ? activeInvestigations.map(i => `- [Case #${i.id}] ${i.title}${i.description ? `: ${i.description.slice(0, 100)}` : ""}`).join("\n")
      : "";

    // ── LLM Invocation ───────────────────────────────────────────────────
    const systemPrompt = buildTriageSystemPrompt(recentTriagesStr, activeInvestigationsStr);

    // ── Ticket 2: Sanitize raw alert body before prompt insertion ──────────
    // Raw Wazuh alert bodies can contain attacker-controlled content (e.g.,
    // malicious filenames, command arguments, log messages). sanitizeForPrompt()
    // strips control characters and escapes code fences before interpolation.
    const sanitizedAlert = sanitizeForPrompt(input.rawAlert) as Record<string, unknown>;

    const userMessage = `Analyze this Wazuh alert and produce a structured triage assessment:

\`\`\`json
${JSON.stringify(sanitizedAlert, null, 2).slice(0, 12000)}
\`\`\`

Agent context:
- Agent ID: ${agentInfo.id || "unknown"}
- Agent Name: ${agentInfo.name || "unknown"}
- Agent IP: ${agentInfo.ip || "unknown"}
- Agent OS: ${agentInfo.os || "unknown"}
- Agent Groups: ${agentInfo.groups?.join(", ") || "none"}`;

    const llmResult = await invokeLLMWithFallback({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: TRIAGE_OUTPUT_SCHEMA,
      caller: "triage_agent",
    });

    const latencyMs = Date.now() - startTime;
    const content = llmResult.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("LLM returned empty response");
    }

    // ── Parse and Validate (Audit #23: Zod boundary on LLM output) ────────────────
    const { parseTriageOutput } = await import("./types/LLMTriageRaw");
    const rawJson = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
    const parsed = parseTriageOutput(rawJson);

    // Build the full TriageObject with provenance
    const triageObject: TriageObject = {
      schemaVersion: "1.0",
      triageId,
      triagedAt: new Date().toISOString(),
      triagedBy: "triage_agent",
      alertId: alertId || "unknown",
      ruleId: ruleId || "unknown",
      ruleDescription: ruleDescription || "",
      ruleLevel: ruleLevel ?? 0,
      alertTimestamp: alertTimestamp || new Date().toISOString(),
      agent: agentInfo,
      alertFamily: parsed.alertFamily || "unknown",
      severity: validateSeverity(parsed.severity),
      severityConfidence: clampConfidence(parsed.severityConfidence),
      severityReasoning: parsed.severityReasoning || "",
      entities: (parsed.entities || []).reduce<ExtractedEntity[]>((acc, e) => {
        const validType = validateEntityType(e.type);
        if (validType) {
          acc.push({
            type: validType,
            value: e.value,
            source: "llm_inference" as const,
            confidence: clampConfidence(e.confidence),
          });
        } else {
          console.warn(`[TriageAgent] Dropping entity with invalid type '${e.type}' (value: '${String(e.value).slice(0, 50)}')`);
        }
        return acc;
      }, []),
      mitreMapping: (parsed.mitreMapping || []).map((m) => ({
        techniqueId: m.techniqueId,
        techniqueName: m.techniqueName,
        tactic: m.tactic,
        confidence: clampConfidence(m.confidence),
        source: "llm_inference" as const,
      })),
      dedup: {
        isDuplicate: !!parsed.dedup?.isDuplicate,
        similarityScore: clampConfidence(parsed.dedup?.similarityScore ?? 0),
        similarTriageId: parsed.dedup?.similarTriageId,
        reasoning: parsed.dedup?.reasoning || "",
      },
      route: validateRoute(parsed.route),
      routeReasoning: parsed.routeReasoning || "",
      summary: parsed.summary || "",
      keyEvidence: buildKeyEvidence(input.rawAlert, agentInfo),
      uncertainties: (parsed.uncertainties || []).map((u) => ({
        description: u.description,
        impact: u.impact,
        suggestedAction: u.suggestedAction,
      })),
      caseLink: {
        shouldLink: !!parsed.caseLink?.shouldLink,
        suggestedCaseId: parsed.caseLink?.suggestedCaseId,
        suggestedCaseTitle: parsed.caseLink?.suggestedCaseTitle,
        confidence: clampConfidence(parsed.caseLink?.confidence ?? 0),
        reasoning: parsed.caseLink?.reasoning || "",
      },
      rawAlert: input.rawAlert,
    };

    // Also add Wazuh-native MITRE mappings if present
    const wazuhMitre = extractWazuhMitre(input.rawAlert);
    if (wazuhMitre.length > 0) {
      triageObject.mitreMapping = [
        ...wazuhMitre,
        ...triageObject.mitreMapping.filter(
          m => !wazuhMitre.some(w => w.techniqueId === m.techniqueId)
        ),
      ];
    }

    // Also add Wazuh-native entities (agent ID, rule ID, IPs from data fields)
    const wazuhEntities = extractWazuhEntities(input.rawAlert);
    triageObject.entities = [
      ...wazuhEntities,
      ...triageObject.entities.filter(
        e => !wazuhEntities.some(w => w.type === e.type && w.value === e.value)
      ),
    ];

    // ── CR-5: Runtime validation before DB persistence ─────────────────
    // Validate the post-normalized triageObject against the Zod schema
    // before writing to the triageData JSON column. This catches malformed
    // LLM output that passed the Zod parse but was corrupted during
    // normalization (entity merging, MITRE dedup, etc.).
    assertValidTriageObject(triageObject);

    // ── Persist ──────────────────────────────────────────────────────────
    // DB UPDATE is mandatory — if it fails, the triage row stays as a
    // "processing" placeholder with empty triageData, which is worse than
    // reporting failure. Downstream stages read from DB, not memory.
    const tokensUsed = extractTokenCount(llmResult);
    await db!.update(triageObjects)
      .set({
        alertFamily: triageObject.alertFamily,
        severity: triageObject.severity,
        severityConfidence: triageObject.severityConfidence,
        route: triageObject.route,
        isDuplicate: triageObject.dedup.isDuplicate ? 1 : 0,
        similarityScore: triageObject.dedup.similarityScore,
        similarTriageId: triageObject.dedup.similarTriageId ?? null,
        summary: triageObject.summary,
        triageData: triageObject,
        status: "completed",
        latencyMs,
        tokensUsed,
      })
      .where(eq(triageObjects.id, dbId));

    return {
      success: true,
      triageObject,
      triageId,
      dbId,
      latencyMs,
      tokensUsed,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = (err as Error).message;

    // Mark as failed in DB
    try {
      const db = await getDb();
      if (db && dbId) {
        await db.update(triageObjects)
          .set({ status: "failed", errorMessage })
          .where(eq(triageObjects.id, dbId));
      }
    } catch {
      // ignore DB error during error handling
    }

    return {
      success: false,
      triageId,
      dbId,
      latencyMs,
      error: errorMessage,
    };
  }
}

// ── Retrieval: Get Triage by ID ──────────────────────────────────────────────

export async function getTriageById(triageId: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(triageObjects).where(eq(triageObjects.triageId, triageId)).limit(1);
  return rows[0] ?? null;
}

// ── Retrieval: List Triages ──────────────────────────────────────────────────

export async function listTriages(opts: {
  limit?: number;
  offset?: number;
  severity?: string;
  route?: string;
  status?: string;
  agentId?: string;
}) {
  const db = await getDb();
  if (!db) return { triages: [], total: 0 };

  type TriageSeverity = "critical" | "high" | "medium" | "low" | "info";
  type TriageRoute = "A_DUPLICATE_NOISY" | "B_LOW_CONFIDENCE" | "C_HIGH_CONFIDENCE" | "D_LIKELY_BENIGN";
  type TriageStatus = "pending" | "processing" | "completed" | "failed";
  const conditions: ReturnType<typeof eq>[] = [];
  if (opts.severity) conditions.push(eq(triageObjects.severity, opts.severity as TriageSeverity));
  if (opts.route) conditions.push(eq(triageObjects.route, opts.route as TriageRoute));
  if (opts.status) conditions.push(eq(triageObjects.status, opts.status as TriageStatus));
  if (opts.agentId) conditions.push(eq(triageObjects.agentId, opts.agentId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db.select({
      ...getTableColumns(triageObjects),
      correlationBundleId: correlationBundles.correlationId,
    })
      .from(triageObjects)
      .leftJoin(correlationBundles, eq(correlationBundles.sourceTriageId, triageObjects.triageId))
      .where(where)
      .orderBy(desc(triageObjects.createdAt))
      .limit(opts.limit ?? 50)
      .offset(opts.offset ?? 0),
    db.select({ count: sql<number>`count(*)` }).from(triageObjects).where(where),
  ]);
  return { triages: rows, total: countResult[0]?.count ?? 0 };
}

// ── Retrieval: Triage Stats ──────────────────────────────────────────────────

export async function getTriageStats() {
  const db = await getDb();
  if (!db) return null;

  const [totalResult, severityResult, routeResult, statusResult] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(triageObjects),
    db.select({
      severity: triageObjects.severity,
      count: sql<number>`count(*)`,
    }).from(triageObjects).where(eq(triageObjects.status, "completed")).groupBy(triageObjects.severity),
    db.select({
      route: triageObjects.route,
      count: sql<number>`count(*)`,
    }).from(triageObjects).where(eq(triageObjects.status, "completed")).groupBy(triageObjects.route),
    db.select({
      status: triageObjects.status,
      count: sql<number>`count(*)`,
    }).from(triageObjects).groupBy(triageObjects.status),
  ]);

  return {
    total: totalResult[0]?.count ?? 0,
    bySeverity: Object.fromEntries(severityResult.map(r => [r.severity, r.count])),
    byRoute: Object.fromEntries(routeResult.map(r => [r.route, r.count])),
    byStatus: Object.fromEntries(statusResult.map(r => [r.status, r.count])),
  };
}

// ── Helper: Extract fields from raw alert ────────────────────────────────────

function extractAlertId(raw: Record<string, unknown>): string {
  return String(raw.id ?? raw._id ?? raw.alert_id ?? "");
}

function extractRuleId(raw: Record<string, unknown>): string {
  const rule = raw.rule as Record<string, unknown> | undefined;
  return String(rule?.id ?? "");
}

function extractRuleDescription(raw: Record<string, unknown>): string {
  const rule = raw.rule as Record<string, unknown> | undefined;
  return String(rule?.description ?? "");
}

function extractRuleLevel(raw: Record<string, unknown>): number {
  const rule = raw.rule as Record<string, unknown> | undefined;
  const level = Number(rule?.level ?? 0);
  return isNaN(level) ? 0 : level;
}

function extractTimestamp(raw: Record<string, unknown>): string {
  return String(raw.timestamp ?? raw["@timestamp"] ?? new Date().toISOString());
}

function extractAgentInfo(raw: Record<string, unknown>): TriageObject["agent"] {
  const agent = raw.agent as Record<string, unknown> | undefined;
  return {
    id: String(agent?.id ?? ""),
    name: String(agent?.name ?? ""),
    ip: agent?.ip ? String(agent.ip) : undefined,
    os: extractOS(raw),
    groups: Array.isArray(agent?.groups) ? agent.groups.map(String) : undefined,
  };
}

function extractOS(raw: Record<string, unknown>): string | undefined {
  const agent = raw.agent as Record<string, unknown> | undefined;
  const os = agent?.os as Record<string, unknown> | undefined;
  if (os?.name) return `${os.name}${os.version ? ` ${os.version}` : ""}`;
  return undefined;
}

function extractWazuhMitre(raw: Record<string, unknown>): MitreMapping[] {
  const rule = raw.rule as Record<string, unknown> | undefined;
  const mitre = rule?.mitre as Record<string, unknown> | undefined;
  if (!mitre) return [];

  const ids = Array.isArray(mitre.id) ? mitre.id : [];
  const techniques = Array.isArray(mitre.technique) ? mitre.technique : [];
  const tactics = Array.isArray(mitre.tactic) ? mitre.tactic : [];

  return ids.map((id: string, i: number) => ({
    techniqueId: String(id),
    techniqueName: String(techniques[i] ?? id),
    tactic: String(tactics[i] ?? "unknown"),
    confidence: 1.0, // Wazuh-native mappings are high confidence
    source: "wazuh_alert" as const,
  }));
}

function extractWazuhEntities(raw: Record<string, unknown>): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const agent = raw.agent as Record<string, unknown> | undefined;
  const data = raw.data as Record<string, unknown> | undefined;
  const rule = raw.rule as Record<string, unknown> | undefined;

  // Agent ID
  if (agent?.id) {
    entities.push({ type: "host", value: String(agent.id), source: "wazuh_alert", confidence: 1.0 });
  }
  // Agent name as host
  if (agent?.name) {
    entities.push({ type: "host", value: String(agent.name), source: "wazuh_alert", confidence: 1.0 });
  }
  // Rule ID
  if (rule?.id) {
    entities.push({ type: "rule_id", value: String(rule.id), source: "wazuh_alert", confidence: 1.0 });
  }
  // Source IP
  if (data?.srcip) {
    entities.push({ type: "ip", value: String(data.srcip), source: "wazuh_alert", confidence: 1.0 });
  }
  // Destination IP
  if (data?.dstip) {
    entities.push({ type: "ip", value: String(data.dstip), source: "wazuh_alert", confidence: 1.0 });
  }
  // Source user
  if (data?.srcuser) {
    entities.push({ type: "user", value: String(data.srcuser), source: "wazuh_alert", confidence: 1.0 });
  }
  // Destination user
  if (data?.dstuser) {
    entities.push({ type: "user", value: String(data.dstuser), source: "wazuh_alert", confidence: 1.0 });
  }
  // File path (FIM)
  const syscheck = raw.syscheck as Record<string, unknown> | undefined;
  if (syscheck?.path) {
    entities.push({ type: "file_path", value: String(syscheck.path), source: "wazuh_alert", confidence: 1.0 });
  }
  // Hash values
  if (syscheck?.md5_after) {
    entities.push({ type: "hash", value: String(syscheck.md5_after), source: "wazuh_alert", confidence: 1.0, metadata: { hashType: "md5" } });
  }
  if (syscheck?.sha256_after) {
    entities.push({ type: "hash", value: String(syscheck.sha256_after), source: "wazuh_alert", confidence: 1.0, metadata: { hashType: "sha256" } });
  }

  return entities;
}

function buildKeyEvidence(raw: Record<string, unknown>, agent: TriageObject["agent"]): EvidenceItem[] {
  const alertId = extractAlertId(raw);
  const ts = extractTimestamp(raw);
  const evidence: EvidenceItem[] = [{
    id: `evidence-raw-alert-${alertId}`,
    label: "Original Wazuh Alert",
    type: "alert",
    source: "wazuh_alert",
    data: raw,
    collectedAt: ts,
    relevance: 1.0,
  }];

  // Agent metadata evidence
  if (agent.id && agent.id !== "unknown") {
    evidence.push({
      id: `evidence-agent-${agent.id}`,
      label: `Agent: ${agent.name || agent.id}${agent.os ? ` (${agent.os})` : ""}`,
      type: "agent_metadata",
      source: "wazuh_agent",
      data: { id: agent.id, name: agent.name, ip: agent.ip, os: agent.os, groups: agent.groups },
      collectedAt: ts,
      relevance: 0.8,
    });
  }

  // FIM / syscheck data — file integrity evidence if present
  const syscheck = raw.syscheck as Record<string, unknown> | undefined;
  if (syscheck?.path) {
    evidence.push({
      id: `evidence-fim-${alertId}`,
      label: `File change: ${String(syscheck.path).slice(0, 120)}`,
      type: "fim_event",
      source: "wazuh_fim",
      data: {
        path: syscheck.path,
        event: syscheck.event,
        md5_before: syscheck.md5_before,
        md5_after: syscheck.md5_after,
        sha256_before: syscheck.sha256_before,
        sha256_after: syscheck.sha256_after,
        uid_before: syscheck.uid_before,
        uid_after: syscheck.uid_after,
        gid_before: syscheck.gid_before,
        gid_after: syscheck.gid_after,
        perm_before: syscheck.perm_before,
        perm_after: syscheck.perm_after,
        size_before: syscheck.size_before,
        size_after: syscheck.size_after,
      },
      collectedAt: ts,
      relevance: 0.9,
    });
  }

  // Network context — source/dest IPs, users, protocol info
  const data = raw.data as Record<string, unknown> | undefined;
  if (data) {
    const networkFields: Record<string, unknown> = {};
    const networkKeys = ["srcip", "dstip", "srcport", "dstport", "srcuser", "dstuser", "protocol", "action"];
    let hasNetworkData = false;
    for (const key of networkKeys) {
      if (data[key] != null) {
        networkFields[key] = data[key];
        hasNetworkData = true;
      }
    }
    if (hasNetworkData) {
      const src = data.srcip ? String(data.srcip) : "";
      const dst = data.dstip ? String(data.dstip) : "";
      const label = src && dst ? `Network: ${src} → ${dst}` : src ? `Source: ${src}` : dst ? `Destination: ${dst}` : "Network context";
      evidence.push({
        id: `evidence-network-${alertId}`,
        label,
        type: "network_event",
        source: "wazuh_alert",
        data: networkFields,
        collectedAt: ts,
        relevance: 0.85,
      });
    }

    // Process context — if process-related fields exist
    const processFields: Record<string, unknown> = {};
    const processKeys = ["command", "exe", "name", "pid", "ppid", "parentName"];
    let hasProcessData = false;
    for (const key of processKeys) {
      if (data[key] != null) {
        processFields[key] = data[key];
        hasProcessData = true;
      }
    }
    if (hasProcessData) {
      evidence.push({
        id: `evidence-process-${alertId}`,
        label: `Process: ${data.exe || data.name || data.command || "unknown"}`,
        type: "process_event",
        source: "wazuh_alert",
        data: processFields,
        collectedAt: ts,
        relevance: 0.85,
      });
    }
  }

  // Vulnerability data — if the alert contains CVE references
  const vulnData = raw.data as Record<string, unknown> | undefined;
  const vulnerability = vulnData?.vulnerability as Record<string, unknown> | undefined;
  if (vulnerability && (vulnerability.cve || vulnerability.reference)) {
    evidence.push({
      id: `evidence-vuln-${alertId}`,
      label: `Vulnerability: ${vulnerability.cve || vulnerability.reference || "unknown CVE"}`,
      type: "vulnerability",
      source: "wazuh_vuln",
      data: {
        cve: vulnerability.cve,
        reference: vulnerability.reference,
        severity: vulnerability.severity,
        package: vulnerability.package,
        title: vulnerability.title,
        rationale: vulnerability.rationale,
        status: vulnerability.status,
      },
      collectedAt: ts,
      relevance: 0.9,
    });
  }

  // MITRE mapping evidence from the raw alert rule
  const rule = raw.rule as Record<string, unknown> | undefined;
  const mitre = rule?.mitre as Record<string, unknown> | undefined;
  if (mitre?.id && Array.isArray(mitre.id) && mitre.id.length > 0) {
    evidence.push({
      id: `evidence-mitre-${alertId}`,
      label: `MITRE ATT&CK: ${(mitre.id as string[]).join(", ")}`,
      type: "alert",
      source: "wazuh_alert",
      data: mitre,
      collectedAt: ts,
      relevance: 0.85,
    });
  }

  return evidence;
}

function extractTokenCount(result: InvokeResult): number {
  if (result?.usage?.total_tokens) return result.usage.total_tokens;
  const prompt = result?.usage?.prompt_tokens ?? 0;
  const completion = result?.usage?.completion_tokens ?? 0;
  return prompt + completion;
}

// ── Validation Helpers ───────────────────────────────────────────────────────

function validateSeverity(s: unknown): AgenticSeverity {
  const valid: AgenticSeverity[] = ["critical", "high", "medium", "low", "info"];
  return valid.includes(s as AgenticSeverity) ? (s as AgenticSeverity) : "info";
}

function validateRoute(r: unknown): TriageRoute {
  const valid: TriageRoute[] = ["A_DUPLICATE_NOISY", "B_LOW_CONFIDENCE", "C_HIGH_CONFIDENCE", "D_LIKELY_BENIGN"];
  return valid.includes(r as TriageRoute) ? (r as TriageRoute) : "B_LOW_CONFIDENCE";
}

const VALID_ENTITY_TYPES = new Set<ExtractedEntity["type"]>([
  "host", "user", "process", "hash", "ip", "domain",
  "rule_id", "mitre_technique", "cve", "file_path", "port", "registry_key",
]);

function validateEntityType(t: unknown): ExtractedEntity["type"] | null {
  return VALID_ENTITY_TYPES.has(t as ExtractedEntity["type"]) ? (t as ExtractedEntity["type"]) : null;
}

function clampConfidence(c: unknown): Confidence {
  const n = Number(c);
  if (isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
