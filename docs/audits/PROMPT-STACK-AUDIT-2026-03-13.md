# Dang! SIEM — LLM Prompt Stack Truth Audit

**Date:** 2026-03-13
**Auditor:** Truth Marshal (Claude Opus 4.6)
**Inputs:** `agent-prompts-audit.md`, actual source tree, runtime code paths
**Standard:** Code execution paths beat docs, comments, tests, and summaries.

---

## 1. EXECUTIVE VERDICT

The documentation in `agent-prompts-audit.md` is **accurate but incomplete, with three materially overstated safety claims** in the Safety Rails Summary table. The prompt inventory is correct in substance — every documented prompt exists in code at or near the stated locations, and the system prompt texts are faithful reproductions. However, the summary table at the bottom makes three claims that don't survive code-level verification:

1. **"READ-ONLY constraint — All 8 prompts"** → Only 3 of 8 have explicit READ-ONLY language
2. **"<<<UNTRUSTED_DATA_BEGIN>>> delimiters — Enhanced LLM, HybridRAG"** → HybridRAG does NOT use these delimiters
3. **"requiresApproval: true for destructive response actions"** → Prompt-instructed only; no code-level category enforcement

The individual prompt sections are honest. The summary table is where the documentation flatters itself.

**Overall classification: Accurate but incomplete, with a materially overstated safety summary.**

---

## 2. PROMPT INVENTORY TRUTH TABLE

| # | Prompt Family | Doc Source | Actual Source | Prompt Text Match | Reachable? | Output Contract | Tool Access | Drift |
|---|---|---|---|---|---|---|---|---|
| 1 | Triage Agent | `triageAgent.ts:133-170` | `triageAgent.ts:132-170` | **Exact match** | Yes | JSON schema strict + Zod `.parse()` | None | Line off by 1 |
| 2 | Correlation Agent | `correlationAgent.ts:529-546` | `correlationAgent.ts:529-546` | **Exact match** | Yes | JSON schema strict + Zod `.parse()` | None | None |
| 3 | Hypothesis Agent | `hypothesisAgent.ts:197-248` | `hypothesisAgent.ts:197-248` | **Exact match** | Yes | JSON schema strict + Zod `.parse()` | None | None |
| 4a | Enhanced LLM Chat | `enhancedLLMService.ts:350-388` | `enhancedLLMService.ts:350-388` | **Exact match** | Yes | Freeform (routes through graph pipeline) | 6 tools (conditional) | None |
| 4b | Enhanced LLM Classify | `enhancedLLMService.ts` | `enhancedLLMService.ts:477-509` | **Exact match** | Yes | JSON schema strict + Zod `.parse()` with `.catch()` | None | None |
| 5 | Graph Intent Classifier | `agenticPipeline.ts:263-291` | `agenticPipeline.ts:263-291` | **Exact match** | Yes | JSON schema strict + Zod `.parse()` with `.catch()` | None | None |
| 6 | Graph Synthesis | `agenticPipeline.ts:888-931` | `agenticPipeline.ts:888-931` | **Exact match** | Yes | Freeform markdown + output validator | None | None |
| 7 | Follow-up Suggestions | `agenticPipeline.ts:966-977` | `agenticPipeline.ts:966-977` | **Exact match** | Yes | JSON schema strict, **NO Zod** | None | **Missing Zod** |
| 8 | HybridRAG Chat | `hybridragRouter.ts:97-123` | `hybridragRouter.ts:97-123` | **Exact match** | Yes | Freeform markdown | None | None |

**Verdict on inventory:** All 8 prompt families exist, are reachable in production paths, and the prompt texts are faithful to code. The documentation is honest about what the prompts say.

### Notable details not captured in docs:

- **Enhanced LLM Chat** routes through `runAnalystPipeline()` (graph pipeline), which applies its own synthesis system prompt. The session-type system prompt is prepended to conversation history but the synthesis phase uses the IMMUTABLE SAFETY CONTRACT prompt regardless of session mode.
- **Triage Agent** required field count: docs say 13, code has **12** (`triageAgent.ts:120-124`). `caseLink` is the 12th.
- **Hypothesis Agent** required field count: docs say 6, code has **7** (includes `draftDocumentation` at `hypothesisAgent.ts:471-479`).

---

## 3. RUNTIME PATH VERIFICATION TABLE

| Prompt Family | Entry Route | Controller/Router | Service Function | LLM Invocation | Fallback Path |
|---|---|---|---|---|---|
| Triage | `pipelineRouter.triageAlert` | `pipelineRouter.ts` | `runTriageAgent()` | `invokeLLMWithFallback()` | Custom LLM → built-in |
| Correlation | `pipelineRouter.correlateFromTriage` | `pipelineRouter.ts` | `runCorrelationAgent()` | `invokeLLMWithFallback()` | Custom LLM → built-in |
| Hypothesis | `pipelineRouter.hypothesisFromCorrelation` | `pipelineRouter.ts` | `runHypothesisAgent()` | `invokeLLMWithFallback()` | Custom LLM → built-in |
| Enhanced Chat | `enhancedLLMRouter.chat` | `enhancedLLMRouter.ts` | `enhancedChat()` → `runAnalystPipeline()` | `invokeLLMWithFallback()` × 3 (intent + synth + follow-up) | Custom LLM → built-in |
| Enhanced Classify | `enhancedLLMRouter.classifyAlert` | `enhancedLLMRouter.ts` | `classifyAlert()` | `invokeLLMWithFallback()` | Custom LLM → built-in |
| Graph Intent | Internal (Phase 1 of pipeline) | `agenticPipeline.ts` | `analyzeIntent()` | `invokeLLMWithFallback()` | Falls back to `general_query` defaults |
| Graph Synthesis | Internal (Phase 4 of pipeline) | `agenticPipeline.ts` | `synthesizeResponse()` | `invokeLLMWithFallback()` | Returns "Unable to generate analysis" |
| Follow-ups | Internal (Phase 4 of pipeline) | `agenticPipeline.ts` | Inline in `synthesizeResponse()` | `invokeLLMWithFallback()` | Returns 3 hardcoded defaults |
| HybridRAG | `hybridragRouter.chat` | `hybridragRouter.ts` | `callLLM()` | `invokeLLMWithFallback()` | Custom LLM → built-in |

All paths verified as reachable. No dead code or phantom prompts found.

---

## 4. SAFETY CONTROL STRENGTH MATRIX

| # | Mechanism | Implementation | Enforcement Class | What It Truly Prevents | What It Does NOT Prevent | Doc Accuracy | Severity if Overstated |
|---|---|---|---|---|---|---|---|
| 1 | **READ-ONLY prompt language** | Enhanced LLM (`enhancedLLMService.ts:356`), Graph Synthesis (`agenticPipeline.ts:891`), HybridRAG (`hybridragRouter.ts:108`) | **Soft guidance** | Nothing by code. Depends entirely on model cooperation | Model suggesting write ops if it decides to ignore instructions | **OVERSTATED** — docs claim "All 8 prompts", code shows 3 of 8 | **HIGH** — creates false sense of universal coverage |
| 2 | **Untrusted data delimiters** | `wrapUntrustedData()` in `enhancedLLMService.ts:222-239` | **Soft guidance + hard truncation** | Context overflow (8KB cap enforced by code). Prompt injection (soft — depends on model) | Sophisticated injection that works within the delimiters | **OVERSTATED** — docs claim "Enhanced LLM, HybridRAG", but HybridRAG uses informal "treat as untrusted" label, NOT <<<>>> delimiters | **MEDIUM** |
| 3 | **Prompt sanitization** | `sanitizeForPrompt()` in `correlationAgent.ts:549-566` | **Strong runtime guard** | Control character injection, markdown code fence escape, field overflow (4096 cap) | Semantic prompt injection within sanitized content | **ACCURATE** — correctly scoped to "Correlation Agent" only | N/A |
| 4 | **JSON schema enforcement** | `response_format: { type: "json_schema", strict: true }` on 6 paths | **Hard enforcement** (API-level) | Structurally malformed output — the LLM API will reject non-conformant JSON | Semantically wrong values within valid structure (e.g., wrong severity) | **ACCURATE** | N/A |
| 5 | **Zod runtime validation** | Separate files: `LLMTriageRaw.ts`, `LLMCorrelationRaw.ts`, `LLMHypothesisRaw.ts`; inline in `agenticPipeline.ts`, `enhancedLLMService.ts` | **Strong runtime guard** (with caveats) | Type mismatches, missing required fields, out-of-range values | See fallback analysis below | **OVERSTATED** — docs say "All structured outputs" + ".catch() fallbacks". Follow-up suggestions have NO Zod. Triage/Correlation/Hypothesis use `.parse()` (throws), not `.catch()` | **LOW** |
| 6 | **Output safety validator** | `validateOutput()` in `agenticPipeline.ts:131-151` | **Medium enforcement** (regex scan + replace) | Specific blocked patterns (DELETE, PUT, POST, curl, agent deletion, restart, active-response commands) being shown to user | Creative rephrasing ("remove the endpoint agent" vs "delete agent"), conceptual write recommendations that avoid regex patterns | **ACCURATE** — correctly scoped to "Graph Pipeline synthesis" | N/A |
| 7 | **Graph-level endpoint exclusion** | `searchGraph({llmSafe:true})` in `graphQueryService.ts` (SQL WHERE), `gateSafeOnly()` in `agenticPipeline.ts:1106-1170` (post-retrieval strip) | **Hard enforcement** (multi-layer) | MUTATING/DESTRUCTIVE endpoints appearing in LLM context. SQL-level filter + post-retrieval gate + `allowedForLlm` column | Nothing — this is genuinely robust. Two independent code layers, tested | **ACCURATE** | N/A |
| 8 | **Approval gates** | `stateMachine.ts` — full state machine with invariant checks, optimistic concurrency, audit trail | **Hard enforcement** on the flow, **soft guidance** on category-to-approval mapping | Executing `requiresApproval=true` actions without approval. Skipping states. Concurrent stomping | LLM setting `requiresApproval=false` on categories that should require approval (isolate_host, block_ioc, etc.) — no code enforces this | **OVERSTATED** — docs say "requiresApproval: true for destructive response actions" implying hard enforcement; actual enforcement is prompt-only for the category-to-boolean mapping | **HIGH** |
| 9 | **Tool exposure restrictions** | `WAZUH_TOOLS` in `enhancedLLMService.ts:248-346` — 6 read-only tools | **Hard enforcement** | LLM calling write/delete/mutation operations via tools — no such tools are defined | Tools don't exist in non-Enhanced paths. Graph/Hypothesis/Correlation have no tool access | **ACCURATE** | N/A |
| 10 | **Write-operation query detection** | `writePatterns` regex array in `agenticPipeline.ts:1209-1218` | **Medium enforcement** (pre-flight regex on user query) | Users explicitly asking to "delete agent", "restart manager", etc. | Indirect requests ("make the noisy agent go away"), queries that don't match the 8 patterns | UNDOCUMENTED — not mentioned in `agent-prompts-audit.md` | N/A |

---

## 5. UNTRUSTED DATA INGRESS MAP

| # | Prompt Family | Data Source | Injection Point | Delimited? | Sanitized? | Length Cap | Anti-obedience? | Tool Access? | Risk |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Triage** | Raw Wazuh alert | User message (JSON stringify) | **NO** | **NO** | 12,000 chars (`.slice()`) | **NO** | No | **HIGH** — raw alert body from Wazuh goes directly into prompt without any sanitization or delimiting |
| 2 | **Correlation** | Evidence pack (6 sources) | User message (JSON sections) | **NO** | **YES** (`sanitizeForPrompt`) | 1,500–3,000 per section | **NO** | No | **MEDIUM** — sanitized but no explicit untrusted markers or anti-obedience instructions |
| 3 | **Hypothesis** | Triage + Correlation bundle | User message (JSON blocks) | **NO** | **NO** | 4,000 + 6,000 chars (`.slice()`) | **NO** | No | **MEDIUM** — input is already LLM-processed (from triage/correlation), so indirect injection risk |
| 4 | **Enhanced LLM Chat** | User-provided `untrustedData` | Appended to query | **YES** (`<<<UNTRUSTED_DATA_BEGIN>>>`) | **NO** (raw data) | 8,000 chars | **YES** (system prompt) | Yes (6 tools) | **LOW** — best-protected path |
| 5 | **Enhanced LLM Classify** | Alert data + agent context | User message | **YES** (`wrapUntrustedData`) | **NO** | 8,000 chars | **YES** (system prompt) | No | **LOW** |
| 6 | **Graph Intent** | User query + conversation history | User message | **NO** | **NO** | 6 messages sliced | **NO** | No | **MEDIUM** — user query goes directly into classifier prompt |
| 7 | **Graph Synthesis** | Retrieved sources + user query | User message (source context) | **NO** | **NO** | 3,000 per source, 8 messages | **NO** | No | **MEDIUM** — retrieved data (which may contain alert payloads) goes unsanitized into synthesis prompt |
| 8 | **HybridRAG** | `pageContext` (user-provided) | System prompt | **NO** (labeled "untrusted" but no `<<<>>>` delimiters) | **NO** | 4,096 chars | **NO** | No | **MEDIUM** — inconsistent with Enhanced LLM protection |
| 9 | **Follow-ups** | Raw answer (LLM output) + user query | User message | **NO** | **NO** | 500 chars of answer | **NO** | No | **LOW** — input is own LLM output |

### Higher-level findings:

1. **Untrusted-data treatment is PATCHY, not universal.** Only Enhanced LLM (chat + classify) uses the <<<>>> delimiter pattern consistently. The docs overstate consistency.
2. **Highest-risk injection surface:** Triage Agent. Raw Wazuh alert bodies go into the prompt with no sanitization, no delimiters, no anti-obedience instructions, and a generous 12KB cap. A crafted alert payload could contain prompt injection instructions.
3. **The agentic pipeline stages (triage → correlation → hypothesis) have no prompt injection defense.** This is somewhat mitigated by the fact that the data sources are Wazuh telemetry (not directly user-authored), but a compromised agent or alert rule could craft malicious payloads.
4. **Could hostile content influence behavior?** Yes — in the triage path, hostile content in a Wazuh alert body could theoretically influence severity classification, entity extraction, or route recommendation. Tool access is not available in this path, limiting blast radius.

---

## 6. REASONING POLICY CONSISTENCY

| Subsystem / Mode | Reasoning Requested? | Reasoning Visible to User? | Doc Accurate? |
|---|---|---|---|
| Enhanced LLM: `quick_lookup` | No ("No reasoning traces") | No | **Yes** |
| Enhanced LLM: `alert_triage` | No ("Be structured and actionable") | No | **Yes** |
| Enhanced LLM: `investigation` | Yes (`enableReasoning: true`) | Yes (via response) | **Yes** |
| Enhanced LLM: `deep_dive` | Yes ("Show your reasoning step by step") | Yes | **Yes** |
| Enhanced LLM: `threat_hunt` | Yes (`enableReasoning: true`) | Yes | **Yes** |
| Graph Synthesis | **Always** ("Use chain-of-thought reasoning: explain your analytical process step by step") | **Yes** (markdown output) | **Not documented** |
| Triage/Correlation/Hypothesis | Not explicitly requested | No (JSON output) | N/A |

### Policy drift:

**The Enhanced LLM chat routes through the graph pipeline** (`enhancedChat()` → `runAnalystPipeline()`). The graph synthesis prompt **always requests chain-of-thought reasoning** regardless of session mode. This means:

- A `quick_lookup` session will still receive chain-of-thought reasoning in the synthesis phase
- The `enableReasoning: false` flag in the context allocation affects token limits but NOT the synthesis prompt's reasoning instructions
- This is not a bug per se (the reasoning is in the final user-facing output, and analysts generally want explanations), but it's an **undocumented policy inconsistency**

No dangerous reasoning leakage was found. The structured output paths (triage, correlation, hypothesis) produce JSON, not narrative, so internal reasoning traces don't leak.

---

## 7. TOOL EXPOSURE AND MUTATION RISK

| Surface | Available Tools | Actual Mutation Risk | Boundary Type | Doc Accurate? |
|---|---|---|---|---|
| Enhanced LLM (tools enabled) | 6 read-only Wazuh tools | **None** — all tools query Wazuh API read-only endpoints | **Hard** (no write tools defined) | **Yes** |
| Graph Pipeline | No tools — retrieval is server-side | **None** — graph query service + indexer are read-only | **Hard** (no LLM tool access) | **Yes** |
| Hypothesis Agent | No tools | **Indirect** — recommends actions that are materialized as response_actions rows | **Mixed** — actions are proposed (not executed), but see approval gap below | **Partially** |
| HybridRAG | No tools | **None** | **Hard** | **Yes** |
| Agentic Pipeline (Triage/Correlation) | No tools | **None** (writes to own DB tables, not Wazuh) | **Hard** | **Yes** |

### The approval gap (expanded):

The hypothesis agent generates `recommendedActions` with a `requiresApproval` boolean. The **prompt says** this MUST be true for `isolate_host`, `disable_account`, `block_ioc`, `escalate_ir`. The **Zod schema** defaults to `true` if omitted. But the **materialization code** (`hypothesisAgent.ts:1316`) does:

```typescript
requiresApproval: rec.requiresApproval ? 1 : 0,
```

This directly uses the LLM's value. If the LLM explicitly returns `requiresApproval: false` for `isolate_host`, the system will accept it. The state machine will then allow direct `proposed → executed` without approval.

**This is a genuine enforcement gap.** The fix is a 5-line code change: after Zod parsing, force `requiresApproval=true` for the four critical categories regardless of what the LLM returned.

---

## 8. OUTPUT CONTRACT INTEGRITY (Strongest → Weakest)

| Rank | Prompt Family | Schema | Strictness | Runtime Validation | Failure Mode | Fallback Weakens? |
|---|---|---|---|---|---|---|
| 1 | **Triage** | JSON schema strict | API enforced | Zod `.parse()` (throws) | Error → DB row marked "failed" | No — failure is terminal |
| 2 | **Correlation** | JSON schema strict | API enforced | Zod `.parse()` (throws) + normalizer | Error → DB row marked "failed" | No — failure is terminal |
| 3 | **Hypothesis** | JSON schema strict | API enforced | Zod `.parse()` (throws) | Error → propagated to caller | No — failure is terminal |
| 4 | **Alert Classification** | JSON schema strict | API enforced | Zod `.parse()` with `.catch()` per field | **Silently defaults** — severity→"medium", confidence→0.5, arrays→[] | **YES** — a completely garbled response produces a plausible-looking classification with default values |
| 5 | **Intent Analysis** | JSON schema strict | API enforced | Zod `.parse()` with `.catch()` per field | **Silently defaults** to `general_query`, confidence 0.5 | **YES** — bad intent analysis defaults to "search everything" |
| 6 | **Follow-up Suggestions** | JSON schema strict | API enforced | **JSON.parse only — NO Zod** | Falls back to 3 hardcoded suggestions | Moderate — hardcoded fallbacks are safe but mask failures |
| 7 | **Graph Synthesis** | None (freeform) | N/A | Output validator (regex scan) | Patterns redacted inline | No schema to enforce |
| 8 | **HybridRAG** | None (freeform) | N/A | **None** | Raw LLM output returned directly | No validation at all |

### Key observation on `.catch()` fallbacks:

The Alert Classification path (`enhancedLLMService.ts:518-526`) uses `.catch()` on every field. This means if the LLM returns `{"severity": 42, "iocs": "not an array"}`, Zod silently coerces to `{severity: "medium", iocs: []}`. The **outer catch** (`enhancedLLMService.ts:530-541`) returns a hardcoded default classification with `confidence: 0.3` and a message saying "Structured classification failed."

The docs call this "Zod runtime validation with .catch() fallbacks — All structured outputs." This is overstated in two ways:
1. Follow-up suggestions have no Zod at all
2. The `.catch()` behavior is fundamentally different from `.parse()` — it silently accepts garbage vs. failing loudly

---

## 9. DRIFT / CONTRADICTION FINDINGS

| # | Claim | Location | Reality | Severity |
|---|---|---|---|---|
| D-1 | "READ-ONLY constraint — All 8 prompts" | Safety Rails Summary table | Only 3 of 8 (Enhanced LLM, Graph Synthesis, HybridRAG) have explicit READ-ONLY language. Triage, Correlation, Hypothesis, Graph Intent, and Follow-ups do not mention READ-ONLY | **HIGH** |
| D-2 | "Untrusted data wrapping: <<<UNTRUSTED_DATA_BEGIN>>> — Enhanced LLM, HybridRAG" | Safety Rails Summary table | HybridRAG labels pageContext as "untrusted" in a comment (`hybridragRouter.ts:174`) but does NOT use the `<<<UNTRUSTED_DATA_BEGIN>>>` delimiters or the `wrapUntrustedData()` function | **MEDIUM** |
| D-3 | "requiresApproval MUST be true for: isolate_host, disable_account, block_ioc, escalate_ir" | Hypothesis Agent prompt (doc §3) | Prompt instruction only. `materializeResponseActions()` at `hypothesisAgent.ts:1316` passes the LLM's value directly. No code forces `true` for these categories | **HIGH** |
| D-4 | "Zod runtime validation with .catch() fallbacks — All structured outputs" | Safety Rails Summary table | (a) Follow-up suggestions have no Zod. (b) Triage/Correlation/Hypothesis use `.parse()` (throws), not `.catch()`. The `.catch()` pattern is used in Intent Analysis and Alert Classification only | **LOW** |
| D-5 | "13 required fields" for triage output | Doc §1 | Code has 12 required fields in `TRIAGE_OUTPUT_SCHEMA.required` (`triageAgent.ts:120-124`) | **LOW** |
| D-6 | "6 required fields" for hypothesis output | Doc §3 | Code has 7 required fields (`hypothesisAgent.ts:471-479`) — includes `draftDocumentation` | **LOW** |
| D-7 | Chain-of-thought always on in graph synthesis | Not documented | Graph synthesis prompt says "Use chain-of-thought reasoning" regardless of session mode. Quick_lookup and alert_triage sessions still get chain-of-thought in the synthesis phase | **LOW** |
| D-8 | Write-operation query pre-flight check | Not documented | `agenticPipeline.ts:1209-1255` has regex-based pre-flight detection of write-intent queries, returning a hard refusal before any LLM invocation | **LOW** (beneficial omission) |
| D-9 | No sanitization in triage path | Not flagged | Raw Wazuh alert JSON (up to 12KB) enters the triage prompt with no sanitization, no delimiters, no anti-obedience instruction | **MEDIUM** |

---

## 10. SEVERITY-RANKED REMEDIATION LIST

### CRITICAL (0)
None.

### HIGH (2)

**H-1. Enforce `requiresApproval` by category in code, not just prompt.**
- File: `server/agenticPipeline/hypothesisAgent.ts`
- Location: `materializeResponseActions()`, around line 1316
- Fix: After Zod parsing, add:
  ```typescript
  const FORCE_APPROVAL_CATEGORIES = new Set([
    "isolate_host", "disable_account", "block_ioc", "escalate_ir"
  ]);
  const requiresApproval = FORCE_APPROVAL_CATEGORIES.has(category)
    ? true
    : (rec.requiresApproval ?? true);
  ```
- Impact: Closes the gap between documentation promise and runtime behavior

**H-2. Correct the Safety Rails Summary table — READ-ONLY claim.**
- File: `docs/agent-prompts-audit.md`
- Fix: Change "All 8 prompts" to "Enhanced LLM, Graph Synthesis, HybridRAG (3 of 8). Agentic pipeline prompts (Triage, Correlation, Hypothesis) operate in a non-interactive pipeline context and do not include explicit READ-ONLY language."
- Impact: Aligns documentation with reality

### MEDIUM (3)

**M-1. Add `wrapUntrustedData()` to HybridRAG pageContext.**
- File: `server/hybridrag/hybridragRouter.ts`
- Location: Lines 171-174
- Fix: Replace the ad-hoc "treat as untrusted" comment with actual `wrapUntrustedData()` call from `enhancedLLMService.ts`
- Impact: Standardizes untrusted data handling across all user-facing LLM paths

**M-2. Add sanitization to the Triage Agent's raw alert injection.**
- File: `server/agenticPipeline/triageAgent.ts`
- Location: `runTriageAgent()`, around line 360
- Fix: Apply `sanitizeForPrompt()` (from correlationAgent.ts) to `input.rawAlert` before JSON.stringify
- Impact: Closes the highest-risk prompt injection surface

**M-3. Add Zod validation to follow-up suggestions.**
- File: `server/graph/agenticPipeline.ts`
- Location: `synthesizeResponse()`, around line 997
- Fix: Add `z.object({ suggestions: z.array(z.string()).catch([]) }).parse(parsed)` instead of raw JSON.parse
- Impact: Completes the Zod boundary across all structured outputs

### LOW (4)

**L-1.** Correct triage required field count: 13 → 12 in docs
**L-2.** Correct hypothesis required field count: 6 → 7 in docs
**L-3.** Document the write-operation pre-flight check (beneficial, currently undocumented)
**L-4.** Document the reasoning policy inconsistency (chain-of-thought always on in synthesis phase regardless of session mode)

---

## 11. CLAIM-BY-CLAIM HONESTY TABLE

| Claim | Verdict |
|---|---|
| Prompt inventory covers all LLM call sites | **Accurate** |
| Prompt text reproductions are faithful | **Accurate** |
| Source file locations are correct | **Accurate** (±1 line) |
| Output format descriptions are correct | **Accurate** |
| Session type context allocation | **Accurate** |
| Tool definitions (6 read-only tools) | **Accurate** |
| "READ-ONLY constraint — All 8 prompts" | **Materially misleading** — 3 of 8 |
| "Untrusted data wrapping — Enhanced LLM, HybridRAG" | **Technically correct but overstated** — HybridRAG uses a different, weaker pattern |
| "Prompt sanitization — Correlation Agent" | **Accurate** |
| "JSON schema enforcement — Triage, Correlation, Hypothesis, Intent, Follow-ups, Alert Classification" | **Accurate** |
| "Zod runtime validation — All structured outputs" | **Accurate but incomplete** — Follow-ups lack Zod; .catch() vs .parse() distinction not noted |
| "Output safety validator — Graph Pipeline synthesis" | **Accurate** |
| "Graph-level exclusion — MUTATING/DESTRUCTIVE endpoints never returned" | **Accurate** — multi-layer hard enforcement verified |
| "Approval gates — requiresApproval: true for destructive actions" | **Technically correct but overstated** — the state machine enforces the flow, but category-to-boolean mapping is prompt-only |
| Untrusted data handling is consistent | **Misleading by omission** — patchy across subsystems |

---

## 12. WHAT THE DOCS SHOULD SAY INSTEAD

### Current (Safety Rails Summary, Row 1):
> System prompt | READ-ONLY constraint, no-fabrication rule | All 8 prompts

### Truth-aligned replacement:
> System prompt | READ-ONLY constraint: Enhanced LLM, Graph Synthesis, HybridRAG (3 of 8). No-fabrication rule: All 8 prompts. Agentic pipeline prompts (Triage, Correlation, Hypothesis) are non-interactive and operate within a structured-output contract; they do not include explicit READ-ONLY language because they produce JSON, not user-facing prose.

### Current (Safety Rails Summary, Row 2):
> Untrusted data wrapping | `<<<UNTRUSTED_DATA_BEGIN>>>` delimiters | Enhanced LLM, HybridRAG

### Truth-aligned replacement:
> Untrusted data wrapping | `<<<UNTRUSTED_DATA_BEGIN>>>` delimiters with 8KB truncation | Enhanced LLM only. HybridRAG uses informal "treat as untrusted" labeling with 4KB truncation but does not use the standard delimiter pattern. Agentic pipeline stages have no untrusted data delimiters; the Correlation Agent applies `sanitizeForPrompt()` (control char strip, code fence escape, 4KB cap per field).

### Current (Safety Rails Summary, Row 8):
> Approval gates | `requiresApproval: true` for destructive response actions | Hypothesis Agent

### Truth-aligned replacement:
> Approval gates | State machine enforces proposed→approved→executed flow when `requiresApproval=true` (hard enforcement via `stateMachine.ts`). Category-to-approval mapping (`isolate_host`, `disable_account`, `block_ioc`, `escalate_ir` → `requiresApproval=true`) is instructed by the hypothesis prompt and defaulted by Zod schema, but NOT enforced by post-parse code. A code-level enforcement patch is recommended.

---

## 13. FINAL TRUTH-SAFE SUMMARY

Dang! SIEM's LLM prompt stack is a well-architected, layered system with genuine safety engineering. The agentic pipeline uses structured JSON schemas with strict mode, Zod validation boundaries, a real state machine for response action approval, and multi-layer graph endpoint exclusion that is verifiably hard-enforced. The documentation is mostly honest — the prompt texts match code exactly, the source locations are accurate, and the individual subsystem descriptions are faithful. Where the documentation falls short is in its summary table, which makes three universality claims that don't hold under code inspection: READ-ONLY coverage is 3/8 not 8/8, untrusted data delimiting is inconsistent across subsystems, and the `requiresApproval` category enforcement exists only as prompt instruction and Zod defaults, not as post-parse code-level validation. The highest-risk finding is that raw Wazuh alert data enters the triage prompt without sanitization or delimiting, creating a prompt injection surface — though exploitation requires a compromised Wazuh agent or alert source. All findings are remediable with targeted code changes; no architectural redesign is needed.

---

*Generated by Truth Marshal audit, 2026-03-13.*
*Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>*
