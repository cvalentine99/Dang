/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Correlation Bundle Normalizer
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Single normalization boundary between raw LLM output and the canonical
 * CorrelationBundle (shared/agenticSchemas.ts).
 *
 * After this function, all downstream code (persistence, hypothesis agent,
 * living case report, frontend) consumes only the canonical shape.
 *
 * Mapping rules (deterministic, tested):
 *
 *   Raw field                              → Canonical field
 *   ─────────────────────────────────────    ──────────────────────────────────
 *   blastRadius.affectedHosts.length       → blastRadius.affectedHosts (number)
 *   blastRadius.affectedUsers.length       → blastRadius.affectedUsers (number)
 *   blastRadius.affectedServices           → (dropped — not in canonical schema)
 *   campaignAssessment.campaignName        → campaignAssessment.campaignLabel
 *   campaignAssessment.indicators          → campaignAssessment.clusteredTechniques
 *   top-level confidence                   → synthesis.confidence
 *   top-level summary                      → synthesis.narrative
 *   top-level evidenceSummary              → synthesis.supportingEvidence
 *   top-level inferenceSummary             → synthesis.conflictingEvidence
 *   top-level uncertainties                → synthesis.missingEvidence
 *   top-level riskScore                    → (preserved in bundleData only)
 *
 * Explicit non-actions:
 *   - affectedAgentIds is set to [] unless raw payload contains real agent IDs
 *   - No hostnames or services are smuggled into affectedAgentIds
 *   - If data is lossy (indicators don't map to MITRE techniques),
 *     the field is set to [] and the loss is documented
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import type { LLMCorrelationRaw } from "./types/LLMCorrelationRaw";
import type {
  CorrelationBundle,
  ExtractedEntity,
  MitreMapping,
  EvidenceItem,
  Uncertainty,
} from "../../shared/agenticSchemas";

// ── Normalizer Options ──────────────────────────────────────────────────────

export interface NormalizerOptions {
  /** The correlation ID to stamp on the canonical bundle */
  correlationId: string;
  /** The source triage ID (authoritative — not from LLM output) */
  triageId: string;
  /** Timestamp for correlatedAt (defaults to now) */
  now?: Date;
}

// ── Asset Criticality Normalization ─────────────────────────────────────────

const VALID_ASSET_CRITICALITY = new Set(["critical", "high", "medium", "low", "unknown"]);

function normalizeAssetCriticality(
  value: string
): "critical" | "high" | "medium" | "low" | "unknown" {
  const lower = value.toLowerCase().trim();
  return VALID_ASSET_CRITICALITY.has(lower)
    ? (lower as "critical" | "high" | "medium" | "low" | "unknown")
    : "unknown";
}

// ── Case Action Normalization ───────────────────────────────────────────────

const VALID_CASE_ACTIONS = new Set(["merge_existing", "create_new", "defer_to_analyst"]);

function normalizeCaseAction(
  value: string
): "merge_existing" | "create_new" | "defer_to_analyst" {
  const lower = value.toLowerCase().trim();
  return VALID_CASE_ACTIONS.has(lower)
    ? (lower as "merge_existing" | "create_new" | "defer_to_analyst")
    : "defer_to_analyst";
}

// ── Indicators → Clustered Techniques ───────────────────────────────────────

/**
 * Map raw campaign indicators to MitreMapping[].
 *
 * If an indicator looks like a MITRE technique ID (e.g., "T1059", "T1053.005"),
 * it is mapped to a MitreMapping. Otherwise it is dropped.
 * This is intentionally lossy — we do not fabricate technique metadata.
 */
function mapIndicatorsToClusteredTechniques(indicators: string[]): MitreMapping[] {
  const mitreTechniquePattern = /^T\d{4}(\.\d{3})?$/;
  return indicators
    .filter((ind) => mitreTechniquePattern.test(ind.trim()))
    .map((ind) => ({
      techniqueId: ind.trim(),
      techniqueName: ind.trim(),
      tactic: "unknown",
      confidence: 0.5,
      source: "llm_inference" as const,
    }));
}

// ── Entity Normalization ────────────────────────────────────────────────────

const VALID_ENTITY_TYPES = new Set([
  "host", "user", "process", "hash", "ip", "domain",
  "rule_id", "mitre_technique", "cve", "file_path", "port", "registry_key",
]);

const VALID_PROVENANCE_SOURCES = new Set([
  "wazuh_alert", "wazuh_agent", "wazuh_vuln", "wazuh_fim", "wazuh_sca",
  "threat_intel", "llm_inference", "analyst_input", "system_computed",
]);

function normalizeEntity(raw: { type: string; value: string; confidence: number; source: string }): ExtractedEntity {
  return {
    type: VALID_ENTITY_TYPES.has(raw.type) ? (raw.type as ExtractedEntity["type"]) : "host",
    value: raw.value,
    source: VALID_PROVENANCE_SOURCES.has(raw.source) ? (raw.source as ExtractedEntity["source"]) : "llm_inference",
    confidence: Math.max(0, Math.min(1, raw.confidence)),
  };
}

// ── Uncertainty Normalization ───────────────────────────────────────────────

function normalizeUncertainty(raw: { description: string; impact: string; suggestedAction: string }): Uncertainty {
  return {
    description: raw.description,
    impact: raw.impact,
    suggestedAction: raw.suggestedAction,
  };
}

// ── Main Normalizer ─────────────────────────────────────────────────────────

/**
 * Convert a validated LLMCorrelationRaw into the canonical CorrelationBundle.
 *
 * This is the ONLY place where raw LLM output crosses into the canonical schema.
 * All mapping rules are explicit, deterministic, and tested.
 */
export function normalizeCorrelationBundle(
  raw: LLMCorrelationRaw,
  opts: NormalizerOptions
): CorrelationBundle {
  const now = opts.now ?? new Date();

  // ── Related Alerts ──────────────────────────────────────────────────────
  // Raw shape has `relationship` (string); canonical has `linkedBy` (ExtractedEntity).
  // We create a synthetic entity from the relationship description.
  const relatedAlerts = (raw.relatedAlerts ?? []).map((ra) => ({
    alertId: ra.alertId,
    ruleId: ra.ruleId,
    ruleDescription: ra.ruleDescription,
    ruleLevel: ra.ruleLevel,
    timestamp: ra.timestamp,
    agentId: ra.agentId,
    linkedBy: {
      type: "rule_id" as const,
      value: ra.relationship,
      source: "llm_inference" as const,
      confidence: 0.7,
    },
    relevance: 0.7 as number,
  }));

  // ── Discovered Entities ─────────────────────────────────────────────────
  const discoveredEntities = (raw.discoveredEntities ?? []).map(normalizeEntity);

  // ── Blast Radius ────────────────────────────────────────────────────────
  // Raw: string[] → Canonical: number (count)
  // affectedAgentIds: [] — we do NOT populate from hostnames/services
  const blastRadius = {
    affectedHosts: raw.blastRadius.affectedHosts.length,
    affectedUsers: raw.blastRadius.affectedUsers.length,
    affectedAgentIds: [] as string[],
    assetCriticality: normalizeAssetCriticality(raw.blastRadius.assetCriticality),
    confidence: raw.confidence,
  };

  // ── Campaign Assessment ─────────────────────────────────────────────────
  // Raw: campaignName → Canonical: campaignLabel
  // Raw: indicators (string[]) → Canonical: clusteredTechniques (MitreMapping[])
  const clusteredTechniques = mapIndicatorsToClusteredTechniques(
    raw.campaignAssessment.indicators
  );
  const campaignAssessment = {
    likelyCampaign: raw.campaignAssessment.likelyCampaign,
    campaignLabel: raw.campaignAssessment.campaignName ?? undefined,
    clusteredTechniques,
    confidence: raw.campaignAssessment.confidence,
    reasoning: raw.campaignAssessment.reasoning,
  };

  // ── Case Recommendation ─────────────────────────────────────────────────
  const caseRecommendation = {
    action: normalizeCaseAction(raw.caseRecommendation.action),
    mergeTargetId: raw.caseRecommendation.mergeTargetId ?? undefined,
    mergeTargetTitle: raw.caseRecommendation.mergeTargetTitle ?? undefined,
    confidence: raw.caseRecommendation.confidence,
    reasoning: raw.caseRecommendation.reasoning,
  };

  // ── Synthesis ───────────────────────────────────────────────────────────
  // Raw has top-level fields; canonical nests them under synthesis.
  //
  // Mapping:
  //   raw.summary           → synthesis.narrative
  //   raw.evidenceSummary   → synthesis.supportingEvidence (as a single EvidenceItem)
  //   raw.inferenceSummary  → synthesis.conflictingEvidence (as a single EvidenceItem)
  //   raw.uncertainties     → synthesis.missingEvidence
  //   raw.confidence        → synthesis.confidence
  const synthesis = {
    narrative: raw.summary,
    supportingEvidence: [
      {
        id: `evidence-summary-${opts.correlationId}`,
        label: "Evidence Summary",
        type: "analyst_note" as const,
        source: "llm_inference" as const,
        data: { text: raw.evidenceSummary },
        collectedAt: now.toISOString(),
      },
    ] as EvidenceItem[],
    conflictingEvidence: [
      {
        id: `inference-summary-${opts.correlationId}`,
        label: "Inference Summary",
        type: "analyst_note" as const,
        source: "llm_inference" as const,
        data: { text: raw.inferenceSummary },
        collectedAt: now.toISOString(),
      },
    ] as EvidenceItem[],
    missingEvidence: raw.uncertainties.map(normalizeUncertainty),
    confidence: raw.confidence,
  };

  // ── Assemble Canonical Bundle ───────────────────────────────────────────
  const bundle: CorrelationBundle = {
    schemaVersion: "1.0",
    correlationId: opts.correlationId,
    correlatedAt: now.toISOString(),
    sourceTriageId: opts.triageId,
    relatedAlerts,
    discoveredEntities,
    vulnerabilityContext: [],
    fimContext: [],
    threatIntelMatches: [],
    priorInvestigations: [],
    blastRadius,
    campaignAssessment,
    caseRecommendation,
    synthesis,
  };

  return bundle;
}
