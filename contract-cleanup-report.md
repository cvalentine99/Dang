# Names / Contract Cleanup Report

**Author:** Manus AI
**Date:** 2026-03-03
**Scope:** 7 contract cleanup tasks across naming, authorization, readiness, comments, UI labels, and tests

---

## Summary

This pass aligned the codebase's naming, authorization wording, readiness convenience fields, comments, and UI labels to match the actual runtime semantics. No behavioral changes were made — this is a truth-of-naming cleanup, not a feature change.

**Proof:** 1,357 tests passing across 55 test files, zero TypeScript errors.

---

## Task 1+6: Pipeline Continuation / Replay Naming

The core mutation was renamed from `replayPipelineRun` to `resumePipelineRun` to reflect its broadened contract (it handles both failed-run replay and partial-run continuation). A semantic alias `continuePipelineRun` was added so the UI call-site reads naturally.

| Aspect | Before | After |
|--------|--------|-------|
| Canonical procedure name | `replayPipelineRun` | `resumePipelineRun` |
| Semantic alias for partial runs | (none) | `continuePipelineRun` |
| UI call for partial runs | `trpc.pipeline.replayPipelineRun` | `trpc.pipeline.continuePipelineRun` |
| UI call for failed runs | `trpc.pipeline.replayPipelineRun` | `trpc.pipeline.resumePipelineRun` |
| Run ID prefix (partial) | `replay-` | `continue-` (alias), `replay-` (canonical) |
| Section header | (mixed) | `PIPELINE CONTINUATION / REPLAY` |

**Files changed:** `server/agenticPipeline/pipelineRouter.ts`, `client/src/pages/PipelineInspector.tsx`

**Implementation note:** The alias duplicates the mutation handler inline rather than using `createCaller()` self-reference, which causes TS7022 circular initialization errors. Both procedures share identical stage-detection logic. A maintenance comment documents this decision.

---

## Task 2: Role / Authorization Wording

All references to `SECURITY_ADMIN` (a role that does not exist in the app's actual role system) were replaced with `admin role`, which matches the actual `ctx.user.role === "admin"` enforcement.

| Location | Before | After |
|----------|--------|-------|
| `splunkRouter.ts` header JSDoc | "SECURITY_ADMIN equivalent" | "admin role" |
| `splunkRouter.ts` createTicket JSDoc | "Requires admin role (SECURITY_ADMIN equivalent)" | "Requires admin role (ticket creation is a privileged action)" |
| `splunkRouter.ts` error messages (×2) | "requires SECURITY_ADMIN role" | "requires admin role" |
| `AdminSettings.tsx` Splunk description | "Requires SECURITY_ADMIN role" | "Requires admin role" |

**Verification:** `grep -rn "SECURITY_ADMIN"` returns zero results across the entire codebase.

---

## Task 3: Ticketing Convenience Fields in Readiness Hook

Added four convenience fields to `useAgenticReadiness` so UI components can check ticketing health without parsing the raw readiness data.

| Field | Type | Semantics |
|-------|------|-----------|
| `canCreateTickets` | `boolean` | `true` when Splunk HEC state is `"ready"` |
| `ticketingDegraded` | `boolean` | `true` when Splunk HEC state is `"degraded"` |
| `ticketingUnavailable` | `boolean` | `true` when state is `"blocked"` or `"degraded"` |
| `ticketingReason` | `string \| null` | Human-readable reason for degradation/unavailability |

**File changed:** `client/src/hooks/useAgenticReadiness.ts`

---

## Task 4: Comment Scrub

Error messages in `resumePipelineRun` were updated from "replay" to "resume" language to match the canonical procedure name.

| Error message | Before | After |
|---------------|--------|-------|
| Running pipeline guard | "Cannot replay a currently running pipeline" | "Cannot resume a currently running pipeline" |
| Correlation prerequisite | "Cannot replay from correlation — no triage ID" | "Cannot resume from correlation — no triage ID" |
| Hypothesis prerequisite | "Cannot replay from hypothesis — no correlation ID" | "Cannot resume from hypothesis — no correlation ID" |
| Triage raw alert missing | "Cannot replay triage — original raw alert not found" | "Cannot resume triage — original raw alert not found" |
| Pipeline run record comment | "Create a new pipeline run record for the replay" | "...for the resume" |

**File changed:** `server/agenticPipeline/pipelineRouter.ts`

---

## Task 5: UI Label Tightening

The `PipelineInspector` `ReplayButton` component now uses two separate tRPC mutations with semantic call-site alignment:

```tsx
// Partial runs → "Continue Pipeline"
const continueMutation = trpc.pipeline.continuePipelineRun.useMutation({ ... });
// Failed runs → "Replay Pipeline"
const resumeMutation = trpc.pipeline.resumePipelineRun.useMutation({ ... });
const replay = isPartial ? continueMutation : resumeMutation;
```

The `AdminSettings.tsx` Splunk description was updated to remove the "Walter" product name reference and use "admin role" instead of "SECURITY_ADMIN."

---

## Task 7: Test Updates

| Test file | Changes |
|-----------|---------|
| `server/directions1-6.test.ts` | Updated to check for `resumePipelineRun` and `continuePipelineRun` instead of `replayPipelineRun` |
| `server/partialRunContinuation.test.ts` | Updated describe block name, JSDoc search markers, error message assertions, and icon/call-site assertions to match new naming |

**Verification:** `grep -rn "SECURITY_ADMIN\|replayPipelineRun"` across all test files returns zero results.

---

## Files Changed (Complete List)

| File | Tasks |
|------|-------|
| `server/agenticPipeline/pipelineRouter.ts` | 1, 4, 5, 6 |
| `client/src/pages/PipelineInspector.tsx` | 1, 5 |
| `server/splunk/splunkRouter.ts` | 2 |
| `client/src/pages/AdminSettings.tsx` | 2, 5 |
| `client/src/hooks/useAgenticReadiness.ts` | 3 |
| `server/directions1-6.test.ts` | 7 |
| `server/partialRunContinuation.test.ts` | 7 |

---

## Proof

```
Test Files  55 passed (55)
     Tests  1357 passed (1357)
TypeScript  0 errors
```
