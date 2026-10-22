/**
 * Pipeline mutation result helpers.
 *
 * Server contract (H-L1): resume/continue/run procedures may return
 * `status: "superseded"` when another worker took over the run. That is a
 * benign outcome — show an informational toast, never an error.
 */
import { toast } from "sonner";

export const SUPERSEDED_MESSAGE = "Another worker completed this run";

export function isSupersededResult(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as { status?: unknown }).status === "superseded"
  );
}

/** Shows the superseded toast and returns true when `result` is superseded. */
export function toastIfSuperseded(result: unknown): boolean {
  if (!isSupersededResult(result)) return false;
  toast.info(SUPERSEDED_MESSAGE, {
    id: "pipeline-superseded",
    description: "This run was taken over by another worker; refreshing its latest state.",
  });
  return true;
}
