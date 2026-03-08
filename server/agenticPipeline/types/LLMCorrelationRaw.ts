/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * LLM Correlation Raw Output Schema
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This file defines the ACTUAL shape the LLM emits, as specified by the
 * JSON schema in CORRELATION_JSON_SCHEMA (correlationAgent.ts lines 577-696).
 *
 * This is NOT the canonical CorrelationBundle (shared/agenticSchemas.ts).
 * The two shapes diverge in several places:
 *
 *   Raw LLM output                          Canonical CorrelationBundle
 *   ─────────────────────────────────────    ─────────────────────────────────
 *   blastRadius.affectedHosts: string[]     blastRadius.affectedHosts: number
 *   blastRadius.affectedUsers: string[]     blastRadius.affectedUsers: number
 *   blastRadius.affectedServices: string[]  (no affectedServices field)
 *   campaignAssessment.campaignName         campaignAssessment.campaignLabel
 *   campaignAssessment.indicators           campaignAssessment.clusteredTechniques
 *   top-level confidence                    synthesis.confidence
 *   top-level summary                       synthesis.narrative
 *   top-level evidenceSummary               synthesis.supportingEvidence
 *   top-level inferenceSummary              synthesis.conflictingEvidence
 *   top-level uncertainties                 synthesis.missingEvidence
 *   top-level riskScore                     (no riskScore field)
 *
 * The normalizeCorrelationBundle() function converts this raw shape into
 * the canonical CorrelationBundle. No raw JSON should ever be cast directly
 * to CorrelationBundle.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { z } from "zod";

// ── Raw sub-schemas matching the LLM JSON schema ────────────────────────────

const LLMRelatedAlertSchema = z.object({
  alertId: z.string(),
  ruleId: z.string(),
  ruleDescription: z.string(),
  ruleLevel: z.number(),
  agentId: z.string(),
  agentName: z.string().optional().default(""),
  timestamp: z.string(),
  relationship: z.string(),
});

const LLMDiscoveredEntitySchema = z.object({
  type: z.string(),
  value: z.string(),
  confidence: z.number(),  // Normalizer clamps to [0,1] — Zod is lenient here
  source: z.string(),
});

const LLMBlastRadiusSchema = z.object({
  affectedHosts: z.array(z.string()),
  affectedUsers: z.array(z.string()),
  affectedServices: z.array(z.string()),
  assetCriticality: z.string(),
});

const LLMCampaignAssessmentSchema = z.object({
  likelyCampaign: z.boolean(),
  campaignName: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  indicators: z.array(z.string()),
});

const LLMCaseRecommendationSchema = z.object({
  action: z.string(),
  mergeTargetId: z.number().nullable(),
  mergeTargetTitle: z.string().nullable(),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
});

const LLMUncertaintySchema = z.object({
  description: z.string(),
  impact: z.string(),
  suggestedAction: z.string(),
});

const LLMMitreMappingSchema = z.object({
  techniqueId: z.string(),
  techniqueName: z.string(),
  tactic: z.string(),
  confidence: z.number().min(0).max(1),
});

// ── Top-level raw LLM output schema ────────────────────────────────────────

export const LLMCorrelationRawSchema = z.object({
  correlationId: z.string(),
  sourceTriageId: z.string(),
  relatedAlerts: z.array(LLMRelatedAlertSchema),
  discoveredEntities: z.array(LLMDiscoveredEntitySchema),
  blastRadius: LLMBlastRadiusSchema,
  campaignAssessment: LLMCampaignAssessmentSchema,
  caseRecommendation: LLMCaseRecommendationSchema,
  riskScore: z.number().min(0).max(100),
  summary: z.string(),
  evidenceSummary: z.string(),
  inferenceSummary: z.string(),
  uncertainties: z.array(LLMUncertaintySchema),
  confidence: z.number().min(0).max(1),
  mitreMapping: z.array(LLMMitreMappingSchema),
});

/** The inferred TypeScript type for raw LLM correlation output */
export type LLMCorrelationRaw = z.infer<typeof LLMCorrelationRawSchema>;

/**
 * Parse and validate raw LLM JSON into the LLMCorrelationRaw shape.
 * Throws ZodError if the payload is malformed.
 */
export function parseLLMCorrelation(raw: unknown): LLMCorrelationRaw {
  return LLMCorrelationRawSchema.parse(raw);
}
