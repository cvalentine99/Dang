# Correlation Bundle Split-Brain Repair — Proof Artifacts

**Date:** 2026-03-07
**Sprint:** Contract-alignment sprint for CorrelationBundle LLM ↔ TypeScript ↔ DB

---

## 1. Root Cause Summary

The LLM JSON schema (`CORRELATION_JSON_SCHEMA` in `correlationAgent.ts:577-696`) instructs the model to emit a shape that diverges from the canonical `CorrelationBundle` TypeScript interface (`shared/agenticSchemas.ts:230-368`). The persistence code trusted the TypeScript types at compile time but received different data at runtime.

| Line | Field | LLM returns | Code expected | DB column | Failure mode |
|------|-------|-------------|---------------|-----------|-------------|
| 771 | `blastRadius.affectedHosts` | `string[]` (hostnames) | `number` (count) | `int` | MySQL bind error → parameter cascade |
| 772 | `blastRadius.affectedUsers` | `string[]` (usernames) | `number` (count) | `int` | MySQL bind error → parameter cascade |
| 777 | `confidence` | top-level `number` | `bundle.synthesis.confidence` | `float` | Always 0 (synthesis undefined) |

## 2. Fix Architecture

```
LLM JSON output
       │
       ▼
┌─────────────────────────┐
│  parseLLMCorrelation()  │  ← Zod validates raw shape
│  types/LLMCorrelationRaw│
└───────────┬─────────────┘
            │
            ▼
┌──────────────────────────────┐
│  normalizeCorrelationBundle()│  ← Deterministic mapping
│  normalizeCorrelationBundle.ts│
└───────────┬──────────────────┘
            │
            ▼
   CorrelationBundle (canonical)
       │
       ▼
   Persistence (correlationAgent.ts)
```

**No raw JSON is ever cast directly to `CorrelationBundle`.**

## 3. Changed Files

| File | Change |
|------|--------|
| `server/agenticPipeline/types/LLMCorrelationRaw.ts` | **NEW** — Zod schema matching the LLM JSON schema |
| `server/agenticPipeline/normalizeCorrelationBundle.ts` | **NEW** — Deterministic raw → canonical mapper |
| `server/agenticPipeline/correlationAgent.ts` | Replace raw cast with `parseLLMCorrelation()` → `normalizeCorrelationBundle()` |
| `server/agenticPipeline/correlationAgent.test.ts` | Rewrite fixtures to raw LLM shape; add 40+ normalization tests |
| `server/agenticPipeline/stageOutput.test.ts` | Update correlation mock to raw LLM shape |
| `server/agenticPipeline/hypothesisAgent.test.ts` | Update correlation mock to raw LLM shape |
| `server/agenticPipeline/resumePipelineHelper.test.ts` | Update correlation mock to raw LLM shape |
| `server/agenticPipeline/stateMachine.test.ts` | Update correlation mock to raw LLM shape |
| `todo.md` | Sprint tracking |

## 4. Normalization Proof

The normalizer performs these deterministic transformations:

```
Raw LLM                              → Canonical CorrelationBundle
─────────────────────────────────────   ─────────────────────────────────
blastRadius.affectedHosts: string[]  → blastRadius.affectedHosts: number (array.length)
blastRadius.affectedUsers: string[]  → blastRadius.affectedUsers: number (array.length)
blastRadius.affectedServices: string[]→ (dropped — not in canonical)
campaignAssessment.campaignName      → campaignAssessment.campaignLabel
campaignAssessment.indicators        → campaignAssessment.clusteredTechniques (MitreMapping[])
top-level confidence                 → synthesis.confidence
top-level summary                    → synthesis.narrative
top-level evidenceSummary            → synthesis.supportingEvidence[0]
top-level inferenceSummary           → synthesis.conflictingEvidence[0]
top-level uncertainties              → synthesis.missingEvidence
top-level riskScore                  → (dropped — not in canonical)
```

All confidence values are clamped to `[0, 1]` by the normalizer, not by Zod.

## 5. Persistence Proof

Before (broken):
```ts
blastRadiusHosts: bundle.blastRadius?.affectedHosts ?? 0,  // string[] → int column = crash
blastRadiusUsers: bundle.blastRadius?.affectedUsers ?? 0,  // string[] → int column = crash
confidence: bundle.synthesis?.confidence ?? 0,              // undefined → always 0
```

After (fixed):
```ts
blastRadiusHosts: bundle.blastRadius.affectedHosts,  // number (from normalizer)
blastRadiusUsers: bundle.blastRadius.affectedUsers,   // number (from normalizer)
confidence: bundle.synthesis.confidence,               // number (from normalizer)
```

## 6. Contract Proof

The normalizer's return type is `CorrelationBundle` (imported from `shared/agenticSchemas.ts`). TypeScript enforces that every required field is present. If the normalizer's output doesn't match the interface, `tsc --noEmit` fails.

**TypeScript exit code: 0** — all fields match.

## 7. Test Results

```
Test Files  87 passed (87)
     Tests  2739 passed (2739)
  Duration  119.57s
```

Zero failures. Zero regressions.
