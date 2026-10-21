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

/**
 * H-L2: every free-text field is bounded. `summary` in particular is fed back
 * into later triage prompts (dedup context), so an unbounded LLM output must
 * never be stored. Over-length output fails the Zod boundary (no silent cut).
 */
export const TRIAGE_TEXT_LIMITS = Object.freeze({
  id: 128,
  label: 256,
  short: 64,
  entityValue: 2048,
  reasoning: 4000,
  summary: 4000,
  note: 2000,
});
const L = TRIAGE_TEXT_LIMITS;

const LLMEntitySchema = z.object({
  type: z.string().max(L.short).default("unknown"),
  value: z.string().max(L.entityValue).default(""),
  confidence: z.number().min(0).max(1).optional().default(0.5),
}).strip();

const LLMMitreMappingSchema = z.object({
  techniqueId: z.string().max(L.short).default(""),
  techniqueName: z.string().max(L.label).default(""),
  tactic: z.string().max(L.label).default(""),
  confidence: z.number().min(0).max(1).optional().default(0.5),
}).strip();

const LLMDedupSchema = z.object({
  isDuplicate: z.boolean().optional().default(false),
  similarityScore: z.number().optional().default(0),
  similarTriageId: z.string().max(L.id).optional(),
  reasoning: z.string().max(L.note).optional().default(""),
}).strip();

const LLMUncertaintySchema = z.object({
  description: z.string().max(L.note).default(""),
  impact: z.string().max(L.note).optional().default(""),
  suggestedAction: z.string().max(L.note).optional().default(""),
}).strip();

const LLMCaseLinkSchema = z.object({
  shouldLink: z.boolean().optional().default(false),
  suggestedCaseId: z.number().optional(),
  suggestedCaseTitle: z.string().max(L.label * 2).optional(),
  confidence: z.number().optional().default(0),
  reasoning: z.string().max(L.note).optional().default(""),
}).strip();

export const LLMTriageRawSchema = z.object({
  alertFamily: z.string().max(L.id).optional().default("unknown"),
  severity: z.string().max(L.short).optional().default("medium"),
  severityConfidence: z.preprocess(
    (v) => { const n = Number(v); return Number.isNaN(n) ? 0 : n; },
    z.number().optional().default(0.5)
  ),
  severityReasoning: z.string().max(L.reasoning).optional().default(""),
  entities: z.array(LLMEntitySchema).max(500).optional().default([]),
  mitreMapping: z.array(LLMMitreMappingSchema).max(100).optional().default([]),
  dedup: LLMDedupSchema.optional().default({ isDuplicate: false, similarityScore: 0, reasoning: "" }),
  route: z.string().max(L.short).optional().default("B_LOW_CONFIDENCE"),
  routeReasoning: z.string().max(L.reasoning).optional().default(""),
  summary: z.string().max(L.summary).optional().default(""),
  uncertainties: z.array(LLMUncertaintySchema).max(100).optional().default([]),
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
