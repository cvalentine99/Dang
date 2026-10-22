/**
 * Manual response-action recording (C11).
 *
 * Dang performs no external containment. When an analyst carries out an
 * approved action by hand, they record the outcome and what they did; the
 * action moves to the terminal `acknowledged` state. These components are the
 * only UI for that transition and for displaying the recorded outcome.
 */

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import type { LivingCaseObject } from "@shared/agenticSchemas";

/** Response-action state union, sourced from the shared schema. */
export type ResponseActionState = LivingCaseObject["recommendedActions"][number]["state"];

export type ManualActionOutcome = "success" | "failed" | "partial";

export const MANUAL_ACTION_OUTCOMES: ReadonlyArray<{ value: ManualActionOutcome; label: string }> = [
  { value: "success", label: "Succeeded" },
  { value: "partial", label: "Partially succeeded" },
  { value: "failed", label: "Failed" },
];

const OUTCOME_STYLE: Record<ManualActionOutcome, { panel: string; label: string }> = {
  success: { panel: "border-emerald-500/20 bg-emerald-500/5 text-emerald-300", label: "Succeeded" },
  partial: { panel: "border-amber-500/20 bg-amber-500/5 text-amber-300", label: "Partially succeeded" },
  failed: { panel: "border-red-500/20 bg-red-500/5 text-red-300", label: "Failed" },
};

export const RESULT_MAX_LENGTH = 5000;

function isOutcome(v: unknown): v is ManualActionOutcome {
  return v === "success" || v === "failed" || v === "partial";
}

/**
 * Derive the recorded outcome from a response_actions row.
 * Uses the analyst-attested `executionOutcome` column; for rows written before that
 * column existed, falls back to the legacy `executionSuccess` int (1 = success, 0 = failed).
 * Returns null when nothing was recorded.
 */
export function getRecordedOutcome(action: {
  executionOutcome?: string | null;
  executionSuccess?: number | boolean | null;
}): ManualActionOutcome | null {
  if (isOutcome(action.executionOutcome)) return action.executionOutcome;
  const s = action.executionSuccess;
  if (s === true || s === 1) return "success";
  if (s === false || s === 0) return "failed";
  return null;
}

/** Form: outcome radio (required) + non-empty result text (required). */
export function RecordManualActionForm({
  actionId,
  isPending,
  onSubmit,
  onCancel,
}: {
  actionId: string;
  isPending: boolean;
  onSubmit: (input: { actionId: string; outcome: ManualActionOutcome; result: string }) => void;
  onCancel: () => void;
}) {
  const [outcome, setOutcome] = useState<ManualActionOutcome | null>(null);
  const [result, setResult] = useState("");
  const trimmed = result.trim();
  const canSubmit = !isPending && outcome !== null && trimmed.length > 0 && trimmed.length <= RESULT_MAX_LENGTH;

  return (
    <div className="space-y-2 pt-2">
      <p className="text-[10px] text-muted-foreground/50">
        Dang does not perform this action. Record what you did manually and how it turned out.
      </p>
      <div role="radiogroup" aria-label="Outcome" className="flex flex-wrap items-center gap-3">
        {MANUAL_ACTION_OUTCOMES.map((o) => (
          <label key={o.value} className="flex items-center gap-1.5 text-xs text-foreground/70 cursor-pointer">
            <input
              type="radio"
              name={`outcome-${actionId}`}
              value={o.value}
              checked={outcome === o.value}
              onChange={() => setOutcome(o.value)}
              className="accent-amber-500"
            />
            {o.label}
          </label>
        ))}
      </div>
      <textarea
        value={result}
        onChange={(e) => setResult(e.target.value)}
        maxLength={RESULT_MAX_LENGTH}
        placeholder="What did you do, where, and what was the result? (required)"
        className="w-full h-20 bg-white/[0.04] border border-white/[0.08] rounded px-3 py-2 text-xs text-foreground/80 placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-amber-500/40 resize-none"
      />
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded text-xs text-muted-foreground/60 hover:text-foreground/80 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => {
            if (outcome && trimmed) onSubmit({ actionId, outcome, result: trimmed });
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-500/20 text-blue-300 text-xs font-medium hover:bg-blue-500/30 disabled:opacity-50"
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          Record manual action
        </button>
      </div>
    </div>
  );
}

/** Display the recorded outcome (success=green, partial=amber, failed=red). */
export function RecordedOutcomePanel({
  action,
}: {
  action: {
    executionOutcome?: string | null;
    executionSuccess?: number | boolean | null;
    executionResult?: string | null;
    executedBy?: string | null;
    executedAt?: string | Date | null;
  };
}) {
  const outcome = getRecordedOutcome(action);
  if (!outcome && !action.executionResult) return null;
  const style = outcome ? OUTCOME_STYLE[outcome] : null;

  return (
    <div>
      <label className="text-[10px] text-muted-foreground/40 mb-1 block uppercase tracking-wider">
        Recorded Manual Action
      </label>
      <div className={`text-xs p-2 rounded border ${style ? style.panel : "border-white/[0.08] bg-white/[0.02] text-foreground/70"}`}>
        <div className="flex flex-wrap items-center gap-2 mb-1 text-[10px] font-medium uppercase tracking-wider">
          <span>{style ? style.label : "Outcome not recorded"}</span>
          {action.executedBy && (
            <span className="font-mono normal-case tracking-normal opacity-70">recorded by {action.executedBy}</span>
          )}
          {action.executedAt && (
            <span className="normal-case tracking-normal opacity-60">
              {new Date(action.executedAt).toLocaleString()}
            </span>
          )}
        </div>
        {action.executionResult && <p className="whitespace-pre-wrap">{action.executionResult}</p>}
      </div>
    </div>
  );
}
