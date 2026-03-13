# Transparency Note: Prompt-Stack Guardrail Corrections

**Date:** 2026-03-13
**Scope:** LLM agentic pipeline prompt safety and documentation
**Commit:** `53dac88` on `release/broker-coverage-cockpit`

---

## What changed

We recently completed an internal audit of the Dang! prompt stack and made a set of corrective updates to align documented safety claims with actual runtime behavior.

The audit confirmed that the documented prompt inventory was accurate, but it also found several places where safety semantics were overstated or inconsistently implemented across subsystems. In response, we shipped the following changes:

- Added shared prompt sanitization for raw triage alert input (control character stripping, code fence escaping, field length caps)
- Hard-enforced `requiresApproval=true` in code for critical action categories (`isolate_host`, `disable_account`, `block_ioc`, `escalate_ir`)
- Standardized untrusted-data wrapping (`<<<UNTRUSTED_DATA_BEGIN>>>` delimiters) in the HybridRAG retrieval/chat path
- Added a missing Zod validation boundary for follow-up suggestion output
- Expanded regression test coverage for prompt safety guarantees (27 tests across 4 contract areas)
- Corrected the prompt audit documentation and added a per-subsystem protection matrix

## Why it changed

An internal audit found that some safety documentation overstated runtime guarantees in a few areas, and some protections were inconsistent across subsystems. Specifically:

- **READ-ONLY language** was documented as present in "all 8 prompts" but was actually present in 3 of 8. The agentic pipeline prompts (Triage, Correlation, Hypothesis) produce structured JSON and do not include explicit READ-ONLY instructions.
- **Untrusted-data delimiter handling** was not consistently applied. The HybridRAG path used an ad-hoc label ("treat as untrusted data") instead of the standard delimiter/anti-obedience wrapper used elsewhere.
- **Approval requirements** for critical action categories were represented in LLM prompts and Zod schema defaults, but were not fully enforced in the downstream materialization code. A model returning `requiresApproval: false` for a critical category would have been accepted as-is.
- **Triage prompt ingestion** accepted raw Wazuh alert content (up to 12KB) without the sanitization layer that was already applied in the Correlation Agent path.

## What was affected

The following subsystems had gaps between documented and actual safety posture:

| Subsystem | Gap |
|-----------|-----|
| Triage Agent | Raw alert body entered prompt without sanitization |
| Hypothesis Agent | Critical action categories lacked code-enforced approval override |
| HybridRAG Chat | Page context used ad-hoc untrusted label instead of standard delimiters |
| Follow-up Suggestions | Only structured output path without Zod validation boundary |
| Documentation | Safety Rails Summary overstated scope of READ-ONLY, untrusted wrapping, and approval enforcement |

## What did not happen

Our review did not find evidence of:

- Unauthorized or automatic destructive action execution
- Exposure of mutating graph endpoints through the audited prompt paths
- Bypass of structured output enforcement (JSON schema + Zod validation on primary pipeline paths)
- Live mutation capability being exposed through any affected path

The strongest existing hard controls — graph endpoint exclusion via SQL `allowedForLlm=1` filtering plus `gateSafeOnly()` post-retrieval stripping, structured output enforcement, state machine transition guards, and the restriction to 6 read-only tool definitions — remained in place throughout.

## Verification

All corrections are covered by regression tests in `server/agenticPipeline/promptSafetyTruth.test.ts`:

- `requiresApproval — hard enforcement for critical categories` (8 tests)
- `sanitizeForPrompt — prompt injection defense` (8 tests)
- `wrapUntrustedData — delimiter and anti-obedience contract` (6 tests)
- `Follow-up suggestions — Zod validation contract` (5 tests)

The canonical per-subsystem protection matrix is maintained in `docs/agent-prompts-audit.md` and serves as the authoritative source for which controls are present in which subsystems.

---

This release is part of our effort to keep runtime behavior, safety controls, and documentation aligned.
