/**
 * Zod schema for the raw LLM triage output.
 *
 * Audit #23: All LLM output must pass through a Zod boundary before being
 * trusted. This schema uses .strip() so extra fields don't cause
 * Required structural fields are validated; extra fields are stripped for safety.
 *
 * The schema is intentionally lenient (coerce, defaults, optionals) because
 * LLM output is inherently unpredictable. The goal is to catch structural
 * failures (missing severity, wrong types) not to enforce strict contracts.
 */
import { z } from "zod";

const LLMEntitySchema = z.object({
  type: z.string().default("unknown"),
  value: z.string().default(""),
  confidence: z.number().min(0).max(1).optional().default(0.5),
}).strip();

const LLMMitreMappingSchema = z.object({
  techniqueId: z.string().default(""),
  techniqueName: z.string().default(""),
  tactic: z.string().default(""),
  confidence: z.number().min(0).max(1).optional().default(0.5),
}).strip();

const LLMDedupSchema = z.object({
  isDuplicate: z.boolean().optional().default(false),
  similarityScore: z.number().optional().default(0),
  similarTriageId: z.string().optional(),
  reasoning: z.string().optional().default(""),
}).strip();

const LLMUncertaintySchema = z.object({
  description: z.string().default(""),
  impact: z.string().optional().default(""),
  suggestedAction: z.string().optional().default(""),
}).strip();

const LLMCaseLinkSchema = z.object({
  shouldLink: z.boolean().optional().default(false),
  suggestedCaseId: z.number().optional(),
  suggestedCaseTitle: z.string().optional(),
  confidence: z.number().optional().default(0),
  reasoning: z.string().optional().default(""),
}).strip();

export const LLMTriageRawSchema = z.object({
  alertFamily: z.string().optional().default("unknown"),
  severity: z.string().optional().default("medium"),
  severityConfidence: z.preprocess(
    (v) => { const n = Number(v); return Number.isNaN(n) ? 0 : n; },
    z.number().optional().default(0.5)
  ),
  severityReasoning: z.string().optional().default(""),
  entities: z.array(LLMEntitySchema).optional().default([]),
  mitreMapping: z.array(LLMMitreMappingSchema).optional().default([]),
  dedup: LLMDedupSchema.optional().default({ isDuplicate: false, similarityScore: 0, reasoning: "" }),
  route: z.string().optional().default("B_LOW_CONFIDENCE"),
  routeReasoning: z.string().optional().default(""),
  summary: z.string().optional().default(""),
  uncertainties: z.array(LLMUncertaintySchema).optional().default([]),
  caseLink: LLMCaseLinkSchema.optional().default({ shouldLink: false, confidence: 0, reasoning: "" }),
}).strip();

export type LLMTriageRaw = z.infer<typeof LLMTriageRawSchema>;

/**
 * Parse raw LLM triage output with Zod validation.
 * Returns the parsed object on success, throws on structural failure.
 */
export function parseTriageOutput(raw: unknown): LLMTriageRaw {
  return LLMTriageRawSchema.parse(raw);
}
