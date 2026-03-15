/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Dang! — Agentic SOC Pipeline: Zod Runtime Validation Schemas
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * CR-5: Runtime Zod schemas that mirror the TypeScript interfaces in
 * agenticSchemas.ts. These are used as guards before every JSON column
 * INSERT/UPDATE to prevent malformed data from reaching the database.
 *
 * Design:
 * - Schemas are intentionally lenient on optional fields (.optional())
 *   but strict on required fields and their types
 * - Confidence values are clamped to [0, 1] via .min(0).max(1)
 * - String enums use z.enum() for compile-time safety
 * - The validate* functions return { success, data?, error? } — callers
 *   decide whether to throw or log
 * - The assertValid* functions throw with descriptive messages for use
 *   in critical INSERT paths
 *
 * Adapted for NEW optional-field semantics:
 * - CorrelationBundle: vulnerabilityContext, fimContext, threatIntelMatches,
 *   priorInvestigations are optional (not yet populated by normalizer)
 * - CorrelationBundle: blastRadius.affectedAgentIds is optional
 * - LivingCaseObject: recommendedActionIds and actionSummary are optional
 *
 * Usage:
 *   import { assertValidTriageObject } from "../../shared/agenticZodSchemas";
 *   assertValidTriageObject(triageObject); // throws ZodError if invalid
 *   await db.insert(triageObjects).values({ triageData: triageObject, ... });
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { z } from "zod";

// ── Shared Primitives ──────────────────────────────────────────────────────

const ConfidenceSchema = z.number().min(0).max(1);

const ProvenanceSourceSchema = z.enum([
  "wazuh_alert", "wazuh_agent", "wazuh_vuln", "wazuh_fim", "wazuh_sca",
  "threat_intel", "llm_inference", "analyst_input", "system_computed",
]);

const AgenticSeveritySchema = z.enum(["critical", "high", "medium", "low", "info"]);

const ExtractedEntitySchema = z.object({
  type: z.enum([
    "host", "user", "process", "hash", "ip", "domain",
    "rule_id", "mitre_technique", "cve", "file_path", "port", "registry_key",
  ]),
  value: z.string(),
  source: ProvenanceSourceSchema,
  confidence: ConfidenceSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const EvidenceItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum([
    "alert", "vulnerability", "fim_event", "sca_result", "agent_metadata",
    "threat_intel", "analyst_note", "network_event", "process_event",
  ]),
  source: ProvenanceSourceSchema,
  data: z.record(z.string(), z.unknown()),
  collectedAt: z.string(),
  relevance: ConfidenceSchema.optional(),
});

const UncertaintySchema = z.object({
  description: z.string(),
  impact: z.string(),
  suggestedAction: z.string().optional(),
});

const MitreMappingSchema = z.object({
  techniqueId: z.string(),
  techniqueName: z.string(),
  tactic: z.string(),
  confidence: ConfidenceSchema,
  source: ProvenanceSourceSchema,
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRACT 1: TRIAGE OBJECT SCHEMA
// ═══════════════════════════════════════════════════════════════════════════════

export const TriageObjectSchema = z.object({
  schemaVersion: z.literal("1.0"),
  triageId: z.string().min(1),
  triagedAt: z.string(),
  triagedBy: z.enum(["triage_agent", "analyst_manual"]),

  // Alert Identity
  alertId: z.string(),
  ruleId: z.string(),
  ruleDescription: z.string(),
  ruleLevel: z.number().int().min(0).max(15),
  alertTimestamp: z.string(),
  agent: z.object({
    id: z.string(),
    name: z.string(),
    ip: z.string().optional(),
    os: z.string().optional(),
    groups: z.array(z.string()).optional(),
  }),

  // Normalized Classification
  alertFamily: z.string(),
  severity: AgenticSeveritySchema,
  severityConfidence: ConfidenceSchema,
  severityReasoning: z.string(),

  // Entity Extraction
  entities: z.array(ExtractedEntitySchema),

  // MITRE ATT&CK
  mitreMapping: z.array(MitreMappingSchema),

  // Deduplication
  dedup: z.object({
    isDuplicate: z.boolean(),
    similarityScore: ConfidenceSchema,
    similarTriageId: z.string().optional(),
    reasoning: z.string(),
  }),

  // Route
  route: z.enum([
    "A_DUPLICATE_NOISY",
    "B_LOW_CONFIDENCE",
    "C_HIGH_CONFIDENCE",
    "D_LIKELY_BENIGN",
  ]),
  routeReasoning: z.string(),

  // Evidence Summary
  summary: z.string(),
  keyEvidence: z.array(EvidenceItemSchema),

  // Uncertainties
  uncertainties: z.array(UncertaintySchema),

  // Case Link
  caseLink: z.object({
    shouldLink: z.boolean(),
    suggestedCaseId: z.number().optional(),
    suggestedCaseTitle: z.string().optional(),
    confidence: ConfidenceSchema,
    reasoning: z.string(),
  }),

  // Raw Data
  rawAlert: z.record(z.string(), z.unknown()),
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRACT 2: CORRELATION BUNDLE SCHEMA
// Adapted for NEW: context arrays are optional (not yet populated by normalizer)
// ═══════════════════════════════════════════════════════════════════════════════

export const CorrelationBundleSchema = z.object({
  schemaVersion: z.literal("1.0"),
  correlationId: z.string().min(1),
  correlatedAt: z.string(),
  sourceTriageId: z.string(),

  // Related Alerts
  relatedAlerts: z.array(z.object({
    alertId: z.string(),
    ruleId: z.string(),
    ruleDescription: z.string(),
    ruleLevel: z.number(),
    timestamp: z.string(),
    agentId: z.string(),
    linkedBy: ExtractedEntitySchema,
    relevance: ConfidenceSchema,
  })),

  // Related Entities
  discoveredEntities: z.array(ExtractedEntitySchema),

  // Evidence Context — optional in NEW (not yet populated by normalizer)
  vulnerabilityContext: z.array(z.object({
    cveId: z.string(),
    severity: AgenticSeveritySchema,
    name: z.string(),
    affectedPackage: z.string().optional(),
    relevance: ConfidenceSchema,
  })).optional(),

  fimContext: z.array(z.object({
    path: z.string(),
    event: z.string(),
    timestamp: z.string(),
    relevance: ConfidenceSchema,
  })).optional(),

  threatIntelMatches: z.array(z.object({
    ioc: z.string(),
    iocType: z.string(),
    source: z.string(),
    threatName: z.string().optional(),
    confidence: ConfidenceSchema,
  })).optional(),

  priorInvestigations: z.array(z.object({
    investigationId: z.number(),
    title: z.string(),
    status: z.string(),
    linkReason: z.string(),
    relevance: ConfidenceSchema,
  })).optional(),

  // Blast Radius — affectedAgentIds optional in NEW
  blastRadius: z.object({
    affectedHosts: z.number().int().min(0),
    affectedUsers: z.number().int().min(0),
    affectedAgentIds: z.array(z.string()).optional(),
    assetCriticality: z.enum(["critical", "high", "medium", "low", "unknown"]),
    confidence: ConfidenceSchema,
  }),

  // Campaign Assessment
  campaignAssessment: z.object({
    likelyCampaign: z.boolean(),
    campaignLabel: z.string().optional(),
    clusteredTechniques: z.array(MitreMappingSchema),
    confidence: ConfidenceSchema,
    reasoning: z.string(),
  }),

  // Case Recommendation
  caseRecommendation: z.object({
    action: z.enum(["merge_existing", "create_new", "defer_to_analyst"]),
    mergeTargetId: z.number().optional(),
    mergeTargetTitle: z.string().optional(),
    confidence: ConfidenceSchema,
    reasoning: z.string(),
  }),

  // Synthesis
  synthesis: z.object({
    narrative: z.string(),
    supportingEvidence: z.array(EvidenceItemSchema),
    conflictingEvidence: z.array(EvidenceItemSchema),
    missingEvidence: z.array(UncertaintySchema),
    confidence: ConfidenceSchema,
  }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRACT 3: LIVING CASE OBJECT SCHEMA
// Adapted for NEW: recommendedActionIds and actionSummary are optional
// ═══════════════════════════════════════════════════════════════════════════════

const PrioritySchema = z.enum(["critical", "high", "medium", "low"]);

export const LivingCaseObjectSchema = z.object({
  schemaVersion: z.literal("1.0"),
  caseId: z.number().int(),
  lastUpdatedAt: z.string(),
  lastUpdatedBy: z.enum(["case_agent", "hypothesis_agent", "response_agent", "analyst_manual"]),

  // Working Theory
  workingTheory: z.object({
    statement: z.string(),
    confidence: ConfidenceSchema,
    supportingEvidence: z.array(z.string()),
    conflictingEvidence: z.array(z.string()),
  }),

  // Alternate Theories
  alternateTheories: z.array(z.object({
    statement: z.string(),
    confidence: ConfidenceSchema,
    supportingEvidence: z.array(z.string()),
    whyLessLikely: z.string(),
  })),

  // Pivots & Gaps
  completedPivots: z.array(z.object({
    action: z.string(),
    performedAt: z.string(),
    performedBy: z.string(),
    finding: z.string(),
    impactedTheory: z.boolean(),
  })),

  evidenceGaps: z.array(z.object({
    description: z.string(),
    impact: z.string(),
    suggestedAction: z.string(),
    priority: PrioritySchema,
  })),

  suggestedNextSteps: z.array(z.object({
    action: z.string(),
    rationale: z.string(),
    priority: PrioritySchema,
    effort: z.enum(["quick", "moderate", "deep_dive"]),
  })),

  // Response Recommendations — optional in NEW (Direction 4)
  recommendedActionIds: z.array(z.string()).optional(),
  actionSummary: z.object({
    total: z.number().int().min(0),
    proposed: z.number().int().min(0),
    approved: z.number().int().min(0),
    rejected: z.number().int().min(0),
    executed: z.number().int().min(0),
    deferred: z.number().int().min(0),
  }).optional(),

  recommendedActions: z.array(z.object({
    action: z.string(),
    category: z.enum(["immediate", "next", "scheduled", "optional"]),
    urgency: z.enum(["immediate", "next", "scheduled", "optional"]).optional(),
    targetType: z.string().optional(),
    targetValue: z.string().optional(),
    requiresApproval: z.boolean(),
    evidenceBasis: z.array(z.string()),
    playbookRef: z.string().optional(),
    state: z.enum(["proposed", "approved", "rejected", "executed", "deferred"]),
    decidedBy: z.string().optional(),
    decidedAt: z.string().optional(),
  })),

  // Timeline Summary
  timelineSummary: z.array(z.object({
    timestamp: z.string(),
    event: z.string(),
    source: ProvenanceSourceSchema,
    significance: PrioritySchema,
  })),

  // Linked Artifacts
  linkedAlertIds: z.array(z.string()),
  linkedTriageIds: z.array(z.string()),
  linkedCorrelationIds: z.array(z.string()),
  linkedEntities: z.array(ExtractedEntitySchema),

  // Documentation Readiness
  draftDocumentation: z.object({
    shiftHandoff: z.string().optional(),
    escalationSummary: z.string().optional(),
    closureRationale: z.string().optional(),
    executiveSummary: z.string().optional(),
    tuningSuggestions: z.string().optional(),
  }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; issues: z.ZodIssue[] };

/**
 * Validate a TriageObject. Returns { success, data } or { success: false, error, issues }.
 */
export function validateTriageObject(data: unknown): ValidationResult<z.infer<typeof TriageObjectSchema>> {
  const result = TriageObjectSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    error: `TriageObject validation failed: ${result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    issues: result.error.issues,
  };
}

/**
 * Validate a CorrelationBundle. Returns { success, data } or { success: false, error, issues }.
 */
export function validateCorrelationBundle(data: unknown): ValidationResult<z.infer<typeof CorrelationBundleSchema>> {
  const result = CorrelationBundleSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    error: `CorrelationBundle validation failed: ${result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    issues: result.error.issues,
  };
}

/**
 * Validate a LivingCaseObject. Returns { success, data } or { success: false, error, issues }.
 */
export function validateLivingCaseObject(data: unknown): ValidationResult<z.infer<typeof LivingCaseObjectSchema>> {
  const result = LivingCaseObjectSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    error: `LivingCaseObject validation failed: ${result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    issues: result.error.issues,
  };
}

/**
 * Assert a TriageObject is valid. Throws if not.
 * Use before INSERT/UPDATE to triageData JSON column.
 */
export function assertValidTriageObject(data: unknown): asserts data is z.infer<typeof TriageObjectSchema> {
  const result = validateTriageObject(data);
  if (!result.success) throw new Error(result.error);
}

/**
 * Assert a CorrelationBundle is valid. Throws if not.
 * Use before INSERT/UPDATE to bundleData JSON column.
 */
export function assertValidCorrelationBundle(data: unknown): asserts data is z.infer<typeof CorrelationBundleSchema> {
  const result = validateCorrelationBundle(data);
  if (!result.success) throw new Error(result.error);
}

/**
 * Assert a LivingCaseObject is valid. Throws if not.
 * Use before INSERT/UPDATE to caseData JSON column.
 */
export function assertValidLivingCaseObject(data: unknown): asserts data is z.infer<typeof LivingCaseObjectSchema> {
  const result = validateLivingCaseObject(data);
  if (!result.success) throw new Error(result.error);
}
