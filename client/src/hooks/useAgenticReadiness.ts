/**
 * useAgenticReadiness — Client-side hook for consuming the readiness contract.
 *
 * Returns the overall readiness state, per-dependency status, and per-workflow status.
 * Polls every 30 seconds to keep the UI honest about dependency changes.
 *
 * Field naming convention (parallel across all three workflows):
 *   canRun{Workflow}    — boolean: workflow is ready or degraded (usable)
 *   {workflow}Blocked   — boolean: workflow is fully blocked
 *   {workflow}Degraded  — boolean: workflow is degraded but usable
 *   {workflow}Reason    — string | null: human-readable reason for non-ready state
 */
import { trpc } from "../lib/trpc";

export function useAgenticReadiness() {
  const readinessQ = trpc.readiness.check.useQuery(undefined, {
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });

  const data = readinessQ.data ?? null;

  // Extract workflow states for consistent access
  const pipelineState = data?.workflows.structuredPipeline.state ?? null;
  const adHocState = data?.workflows.adHocAnalyst.state ?? null;
  const ticketingState = data?.workflows.ticketing?.state ?? null;

  return {
    /** Raw readiness data from the backend */
    data,
    /** Whether the readiness check is still loading */
    isLoading: readinessQ.isLoading,
    /** Whether the readiness check errored */
    isError: readinessQ.isError,
    /** Overall readiness: "ready" | "degraded" | "blocked" | null (loading) */
    overall: data?.overall ?? null,

    // ── Structured Pipeline ──────────────────────────────────────────────
    /** Whether the structured pipeline can run (ready or degraded) */
    canRunStructuredPipeline: pipelineState === "ready" || pipelineState === "degraded",
    /** Whether the structured pipeline is fully blocked */
    structuredPipelineBlocked: pipelineState === "blocked",
    /** Whether the structured pipeline is degraded but usable */
    structuredPipelineDegraded: pipelineState === "degraded",
    /** Reason the structured pipeline is blocked or degraded */
    structuredPipelineReason: data?.workflows.structuredPipeline.reason ?? null,

    // ── Ad-hoc Analyst ───────────────────────────────────────────────────
    /** Whether ad-hoc analyst can run (ready or degraded) */
    canRunAdHoc: adHocState === "ready" || adHocState === "degraded",
    /** Whether ad-hoc analyst is fully blocked */
    adHocBlocked: adHocState === "blocked",
    /** Whether ad-hoc analyst is degraded but usable */
    adHocDegraded: adHocState === "degraded",
    /** Reason the ad-hoc analyst is blocked or degraded */
    adHocReason: data?.workflows.adHocAnalyst.reason ?? null,

    // ── Ticketing (Splunk HEC) ───────────────────────────────────────────
    /** Whether ticketing can run (ready — HEC is reachable and configured) */
    canRunTicketing: ticketingState === "ready",
    /** Whether ticketing is fully blocked (not configured or unreachable) */
    ticketingBlocked: ticketingState === "blocked",
    /** Whether ticketing is degraded (configured but HEC unreachable) */
    ticketingDegraded: ticketingState === "degraded",
    /** Reason ticketing is blocked or degraded */
    ticketingReason: data?.workflows.ticketing?.reason ?? null,
  };
}
