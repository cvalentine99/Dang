/**
 * useAgenticReadiness — Client-side hook for consuming the readiness contract.
 *
 * Returns the overall readiness state, per-dependency status, and per-workflow status.
 * Polls every 30 seconds to keep the UI honest about dependency changes.
 */
import { trpc } from "../lib/trpc";

export function useAgenticReadiness() {
  const readinessQ = trpc.readiness.check.useQuery(undefined, {
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });

  const data = readinessQ.data ?? null;

  return {
    /** Raw readiness data from the backend */
    data,
    /** Whether the readiness check is still loading */
    isLoading: readinessQ.isLoading,
    /** Whether the readiness check errored */
    isError: readinessQ.isError,
    /** Overall readiness: "ready" | "degraded" | "blocked" | null (loading) */
    overall: data?.overall ?? null,
    /** Whether the structured pipeline (triage -> correlation -> hypothesis -> living case) can run */
    canRunStructuredPipeline: data?.workflows.structuredPipeline.state === "ready" || data?.workflows.structuredPipeline.state === "degraded",
    /** Whether the structured pipeline is fully blocked */
    structuredPipelineBlocked: data?.workflows.structuredPipeline.state === "blocked",
    /** Reason the structured pipeline is blocked or degraded */
    structuredPipelineReason: data?.workflows.structuredPipeline.reason ?? null,
    /** Whether ad-hoc analyst (Walter) can run */
    canRunAdHoc: data?.workflows.adHocAnalyst.state === "ready" || data?.workflows.adHocAnalyst.state === "degraded",
    /** Whether ad-hoc analyst is fully blocked */
    adHocBlocked: data?.workflows.adHocAnalyst.state === "blocked",
    /** Reason the ad-hoc analyst is blocked or degraded */
    adHocReason: data?.workflows.adHocAnalyst.reason ?? null,
  };
}
