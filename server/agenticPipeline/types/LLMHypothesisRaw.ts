/**
 * Zod schema for the raw LLM hypothesis output.
 *
 * Audit #23: All LLM output must pass through a Zod boundary before being
 * trusted. The hypothesis agent uses response_format with strict: true,
 * so the LLM should always return valid JSON matching the schema. This Zod
 * layer is a defense-in-depth check.
 *
 * All fields use .optional().default() because LLM output is inherently
 * unpredictable — the goal is structural validation, not strict enforcement.
 */
import { z } from "zod";

const WorkingTheorySchema = z.object({
  statement: z.string().optional().default(""),
  confidence: z.number().min(0).max(1).optional().default(0.5),
  supportingEvidence: z.array(z.string()).optional().default([]),
  conflictingEvidence: z.array(z.string()).optional().default([]),
}).strip();

const AlternateTheorySchema = z.object({
  statement: z.string().optional().default(""),
  confidence: z.number().min(0).max(1).optional().default(0.5),
  supportingEvidence: z.array(z.string()).optional().default([]),
  whyLessLikely: z.string().optional().default(""),
}).strip();

const NextStepSchema = z.object({
  action: z.string().optional().default(""),
  rationale: z.string().optional().default(""),
  priority: z.string().optional().default("medium"),
  effort: z.string().optional().default("unknown"),
}).strip();

const EvidenceGapSchema = z.object({
  description: z.string().optional().default(""),
  impact: z.string().optional().default(""),
  suggestedAction: z.string().optional().default(""),
  priority: z.string().optional().default("medium"),
}).strip();

const TimelineEntrySchema = z.object({
  timestamp: z.string().optional().default(""),
  event: z.string().optional().default(""),
  source: z.string().optional().default(""),
  significance: z.string().optional().default(""),
}).strip();

const RecommendedActionSchema = z.object({
  action: z.string().optional().default(""),
  category: z.string().optional().default(""),
  urgency: z.string().optional().default("medium"),
  targetType: z.string().optional().default(""),
  targetValue: z.string().optional().default(""),
  requiresApproval: z.boolean().optional().default(true),
  evidenceBasis: z.array(z.string()).optional().default([]),
  state: z.string().optional().default("proposed"),
}).strip();

const DraftDocumentationSchema = z.object({
  shiftHandoff: z.string().optional().default(""),
  escalationSummary: z.string().nullable().optional().default(null),
  executiveSummary: z.string().optional().default(""),
  tuningSuggestions: z.string().nullable().optional().default(null),
}).strip();

export const LLMHypothesisRawSchema = z.object({
  workingTheory: WorkingTheorySchema.optional().default({
    statement: "", confidence: 0.5, supportingEvidence: [], conflictingEvidence: [],
  }),
  alternateTheories: z.array(AlternateTheorySchema).optional().default([]),
  suggestedNextSteps: z.array(NextStepSchema).optional().default([]),
  evidenceGaps: z.array(EvidenceGapSchema).optional().default([]),
  timelineSummary: z.array(TimelineEntrySchema).optional().default([]),
  recommendedActions: z.array(RecommendedActionSchema).optional().default([]),
  draftDocumentation: DraftDocumentationSchema.optional().default({
    shiftHandoff: "", escalationSummary: null, executiveSummary: "", tuningSuggestions: null,
  }),
}).strip();

export type LLMHypothesisRaw = z.infer<typeof LLMHypothesisRawSchema>;

/**
 * Parse raw LLM hypothesis output with Zod validation.
 * Returns the parsed object on success, throws on structural failure.
 */
export function parseHypothesisOutput(raw: unknown): LLMHypothesisRaw {
  return LLMHypothesisRawSchema.parse(raw);
}
