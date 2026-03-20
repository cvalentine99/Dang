/**
 * Splunk HEC Client Service
 *
 * Provides a server-side client for Splunk's HTTP Event Collector (HEC).
 * Used to push agentic triage reports as structured events to Splunk ES
 * Mission Control for ticket/notable event creation.
 *
 * Architecture:
 * - Reads config from env vars (SPLUNK_HOST, SPLUNK_PORT, SPLUNK_HEC_TOKEN, SPLUNK_HEC_PORT)
 * - Falls back to connection_settings DB table for overrides
 * - Self-signed TLS certs accepted for on-prem deployments
 * - Feature-gated: requires explicit enablement
 */

import { getDb } from "../db";
import { connectionSettings } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { Agent } from "undici";
import { SKIP_TLS_VERIFY } from "../_core/tlsAgent";
import { decrypt } from "../admin/encryptionService";

// Audit #28: Use centralized TLS policy for Splunk connections
function getSplunkDispatcher() {
  return new Agent({
    connect: {
      rejectUnauthorized: !SKIP_TLS_VERIFY,
    },
  });
}

// ── Environment defaults ──────────────────────────────────────────────────

const ENV_DEFAULTS = {
  host: process.env.SPLUNK_HOST ?? "",
  port: process.env.SPLUNK_PORT ?? "8000",
  hecToken: process.env.SPLUNK_HEC_TOKEN ?? "",
  hecPort: process.env.SPLUNK_HEC_PORT ?? "8088",
};

export interface SplunkConfig {
  host: string;
  port: string;
  hecToken: string;
  hecPort: string;
  protocol: string;
  enabled: boolean;
}

/**
 * Get the effective Splunk configuration by merging env vars with DB overrides.
 */
export async function getEffectiveSplunkConfig(): Promise<SplunkConfig> {
  const config: SplunkConfig = {
    host: ENV_DEFAULTS.host,
    port: ENV_DEFAULTS.port,
    hecToken: ENV_DEFAULTS.hecToken,
    hecPort: ENV_DEFAULTS.hecPort,
    protocol: "https",
    enabled: false,
  };

  try {
    const db = await getDb();
    if (db) {
      const rows = await db
        .select()
        .from(connectionSettings)
        .where(eq(connectionSettings.category, "splunk"));

      for (const row of rows) {
        switch (row.settingKey) {
          case "host":
            if (row.settingValue) config.host = row.settingValue;
            break;
          case "port":
            if (row.settingValue) config.port = row.settingValue;
            break;
          case "hec_token":
            if (row.settingValue) config.hecToken = row.isEncrypted ? decrypt(row.settingValue) : row.settingValue;
            break;
          case "hec_port":
            if (row.settingValue) config.hecPort = row.settingValue;
            break;
          case "protocol":
            if (row.settingValue) config.protocol = row.settingValue;
            break;
          case "enabled":
            config.enabled = row.settingValue === "true";
            break;
        }
      }
    }
  } catch {
    // Fall back to env-only config
  }

  // If host and token are set from env but no DB override, consider it enabled
  if (!config.enabled && config.host && config.hecToken) {
    config.enabled = true;
  }

  return config;
}

/**
 * Check if Splunk integration is configured and enabled.
 */
export async function isSplunkEnabled(): Promise<boolean> {
  const config = await getEffectiveSplunkConfig();
  return config.enabled && !!config.host && !!config.hecToken;
}

// ── HEC Event Types ───────────────────────────────────────────────────────

export interface SplunkHECEvent {
  /** The event data payload */
  event: Record<string, unknown>;
  /** Splunk source type */
  sourcetype?: string;
  /** Splunk source */
  source?: string;
  /** Target index */
  index?: string;
  /** Event timestamp (epoch seconds) */
  time?: number;
  /** Host that generated the event */
  host?: string;
}

export interface SplunkTicketPayload {
  alertId: string;
  ruleId: string;
  ruleDescription: string;
  ruleLevel: number;
  agentId: string;
  agentName: string;
  alertTimestamp: string;
  triageSummary: string;
  triageReasoning: string;
  trustScore: number;
  confidence: number;
  safetyStatus: string;
  mitreIds: string[];
  mitreTactics: string[];
  suggestedFollowUps: string[];
  rawAlertJson?: Record<string, unknown>;
  createdBy: string;
  // ── Enriched fields from TriageObject ──────────────────────────────────
  /** Normalized alert type/family (e.g., "brute_force", "malware_execution") */
  alertFamily?: string;
  /** AI-assigned severity (may differ from ruleLevel) */
  severity?: string;
  /** Confidence in the severity assignment (0.0–1.0) */
  severityConfidence?: number;
  /** Evidence-backed reasoning for the severity */
  severityReasoning?: string;
  /** Recommended pipeline route */
  route?: string;
  /** Why this route was chosen */
  routeReasoning?: string;
  /** Extracted entities (IPs, users, hashes, etc.) */
  entities?: Array<{ type: string; value: string; context?: string }>;
  /** Key evidence items that informed the triage */
  keyEvidence?: Array<{ type: string; value: string; relevance?: string }>;
  /** Deduplication assessment */
  dedup?: { isDuplicate: boolean; similarityScore: number; reasoning: string };
  /** Uncertainties the triage agent flagged */
  uncertainties?: Array<{ area: string; detail: string; impact?: string }>;
  /** Case link suggestion */
  caseLink?: { shouldLink: boolean; suggestedCaseTitle?: string; reasoning: string };
  /** Agent OS, groups, IP from triage */
  agentOs?: string;
  agentIp?: string;
  agentGroups?: string[];
  /** Triage ID for cross-referencing */
  triageId?: string;
  /** When the triage was performed */
  triagedAt?: string;
  /** Queue item ID — used for deterministic ticket ID generation */
  queueItemId?: number;
}

// ── HEC Client ────────────────────────────────────────────────────────────

/**
 * Send an event to Splunk via HEC.
 */
export async function sendHECEvent(event: SplunkHECEvent): Promise<{
  success: boolean;
  message: string;
  statusCode?: number;
}> {
  const config = await getEffectiveSplunkConfig();

  if (!config.host || !config.hecToken) {
    return { success: false, message: "Splunk HEC not configured (missing host or token)" };
  }

  const url = `${config.protocol}://${config.host}:${config.hecPort}/services/collector/event`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    // Audit #28: Use centralized TLS agent for self-signed cert support
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Splunk ${config.hecToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
      signal: controller.signal,
      // @ts-expect-error -- undici dispatcher is supported in Node 22 native fetch
      dispatcher: getSplunkDispatcher(),
    });

    clearTimeout(timeout);

    const body = await response.text();

    if (response.ok) {
      return { success: true, message: "Event sent to Splunk HEC", statusCode: response.status };
    } else {
      return {
        success: false,
        message: `Splunk HEC error (${response.status}): ${body}`,
        statusCode: response.status,
      };
    }
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("abort")) {
      return { success: false, message: "Splunk HEC request timed out (15s)" };
    }
    return { success: false, message: `Splunk HEC connection error: ${msg}` };
  }
}

/**
 * SSRF-safe host validation for Splunk connection testing.
 * Blocks cloud metadata endpoints and loopback addresses.
 * Allows RFC 1918 and public IPs (Splunk instances can be anywhere).
 */
export async function validateSplunkHost(host: string): Promise<{ allowed: boolean; reason: string }> {
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) return { allowed: false, reason: "Host is empty" };

  // Block known dangerous hostnames
  const blockedHostnames = ["localhost", "metadata.google.internal", "metadata.internal", "instance-data"];
  for (const blocked of blockedHostnames) {
    if (trimmed === blocked || trimmed.endsWith(`.${blocked}`)) {
      return { allowed: false, reason: `Blocked hostname: ${host}` };
    }
  }

  // Block loopback and metadata IPs
  const blockedPrefixes = ["127.", "0.", "169.254."];
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) {
    for (const prefix of blockedPrefixes) {
      if (trimmed.startsWith(prefix)) {
        return { allowed: false, reason: `Blocked IP range: ${host}` };
      }
    }
    if (trimmed === "0.0.0.0" || trimmed === "255.255.255.255") {
      return { allowed: false, reason: `Blocked IP: ${host}` };
    }
  }

  // For hostnames, resolve and check the IP
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) {
    try {
      const { lookup } = await import("dns/promises");
      const result = await lookup(trimmed, { family: 4 });
      const ip = result.address;
      for (const prefix of blockedPrefixes) {
        if (ip.startsWith(prefix)) {
          return { allowed: false, reason: `${host} resolves to blocked IP: ${ip}` };
        }
      }
    } catch {
      return { allowed: false, reason: `Cannot resolve hostname: ${host}` };
    }
  }

  return { allowed: true, reason: "Host allowed" };
}

/**
 * Test Splunk HEC connectivity by hitting the health endpoint.
 */
/**
 * Audit #29: Accept optional overrides so the "Test Connection" button
 * in the settings form can test unsaved values from the form fields.
 */
export async function testSplunkConnection(overrides?: {
  host?: string;
  port?: string;
  hecToken?: string;
  hecPort?: string;
  protocol?: string;
}): Promise<{
  success: boolean;
  message: string;
  latencyMs?: number;
}> {
  const saved = await getEffectiveSplunkConfig();
  // Merge form overrides on top of saved config
  const config = {
    ...saved,
    ...(overrides?.host && { host: overrides.host }),
    ...(overrides?.port && { port: overrides.port }),
    ...(overrides?.hecToken && { hecToken: overrides.hecToken }),
    ...(overrides?.hecPort && { hecPort: overrides.hecPort }),
    ...(overrides?.protocol && { protocol: overrides.protocol }),
  };

  // SSRF prevention: validate user-provided host overrides
  if (overrides?.host) {
    const validation = await validateSplunkHost(config.host);
    if (!validation.allowed) {
      return { success: false, message: `Host validation failed: ${validation.reason}` };
    }
  }

  if (!config.host || !config.hecToken) {
    return { success: false, message: "Splunk not configured (missing host or HEC token)" };
  }

  const start = Date.now();
  const healthUrl = `${config.protocol}://${config.host}:${config.hecPort}/services/collector/health`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    // Audit #28: Use centralized TLS agent
    const response = await fetch(healthUrl, {
      method: "GET",
      headers: { Authorization: `Splunk ${config.hecToken}` },
      signal: controller.signal,
      // @ts-expect-error -- undici dispatcher is supported in Node 22 native fetch
      dispatcher: getSplunkDispatcher(),
    });

    clearTimeout(timeout);
    const latencyMs = Date.now() - start;

    if (response.ok) {
      return {
        success: true,
        message: `Splunk HEC is healthy (${response.status}) — ${latencyMs}ms`,
        latencyMs,
      };
    } else {
      return {
        success: false,
        message: `Splunk HEC returned ${response.status}`,
        latencyMs,
      };
    }
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      success: false,
      message: `Cannot reach Splunk HEC: ${(err as Error).message}`,
      latencyMs,
    };
  }
}

/**
 * Create a Splunk ES ticket (notable event) from an agentic triage report.
 * Sends a structured event to HEC with the `dang:agentic_triage` sourcetype.
 */
export async function createSplunkTicket(payload: SplunkTicketPayload): Promise<{
  success: boolean;
  message: string;
  ticketId?: string;
  statusCode?: number;
}> {
  const config = await getEffectiveSplunkConfig();

  if (!config.enabled) {
    return { success: false, message: "Splunk integration is not enabled" };
  }

  // Map Wazuh severity to Splunk urgency
  const urgency =
    payload.ruleLevel >= 12
      ? "critical"
      : payload.ruleLevel >= 8
        ? "high"
        : payload.ruleLevel >= 4
          ? "medium"
          : "low";

  // Build the HEC event
  // Deterministic ticket ID: same queue item + triage always produces the same ID.
  // Falls back to timestamp-based ID when queueItemId is unavailable.
  const triageSlug = payload.triageId ? payload.triageId.slice(-8) : payload.alertId.slice(-8);
  const ticketId = payload.queueItemId
    ? `DANG-${payload.queueItemId}-${triageSlug}`
    : `DANG-${Date.now()}-${payload.alertId.slice(-6)}`;

  const event: SplunkHECEvent = {
    time: Math.floor(Date.now() / 1000),
    sourcetype: "dang:agentic_triage",
    source: "dang_security_platform",
    host: "dang-siem",
    index: "notable",
    event: {
      // Ticket metadata
      ticket_id: ticketId,
      ticket_type: "agentic_triage",
      created_by: payload.createdBy,
      created_at: new Date().toISOString(),
      triage_id: payload.triageId ?? null,
      triaged_at: payload.triagedAt ?? null,

      // Alert details
      alert_id: payload.alertId,
      rule_id: payload.ruleId,
      rule_description: payload.ruleDescription,
      rule_level: payload.ruleLevel,
      urgency,
      agent_id: payload.agentId,
      agent_name: payload.agentName,
      agent_os: payload.agentOs ?? null,
      agent_ip: payload.agentIp ?? null,
      agent_groups: payload.agentGroups ?? [],
      alert_timestamp: payload.alertTimestamp,

      // Normalized classification
      alert_family: payload.alertFamily ?? null,
      ai_severity: payload.severity ?? null,
      severity_confidence: payload.severityConfidence ?? null,
      severity_reasoning: payload.severityReasoning ?? null,

      // Agentic triage analysis
      triage_summary: payload.triageSummary,
      triage_reasoning: payload.triageReasoning,
      trust_score: payload.trustScore,
      confidence: payload.confidence,
      safety_status: payload.safetyStatus,

      // Pipeline routing
      route: payload.route ?? null,
      route_reasoning: payload.routeReasoning ?? null,

      // Extracted entities (IPs, users, hashes, domains)
      entities: payload.entities ?? [],

      // Key evidence items
      key_evidence: payload.keyEvidence ?? [],

      // Deduplication assessment
      dedup: payload.dedup ?? null,

      // Uncertainties flagged by triage agent
      uncertainties: payload.uncertainties ?? [],

      // Case link suggestion
      case_link: payload.caseLink ?? null,

      // MITRE ATT&CK
      mitre_technique_ids: payload.mitreIds,
      mitre_tactics: payload.mitreTactics,

      // Recommendations
      suggested_follow_ups: payload.suggestedFollowUps,

      // Raw data for forensic reference
      raw_alert_json: payload.rawAlertJson ?? {},

      // Dang! platform metadata
      platform: "Dang! SIEM",
      analysis_engine: "Dang! Agentic Pipeline",
    },
  };

  const result = await sendHECEvent(event);

  if (result.success) {
    return {
      success: true,
      message: `Ticket ${ticketId} created in Splunk ES`,
      ticketId,
      statusCode: result.statusCode,
    };
  }

  return { success: false, message: result.message, statusCode: result.statusCode };
}
