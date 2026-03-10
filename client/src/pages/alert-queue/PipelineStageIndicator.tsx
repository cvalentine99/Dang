/**
 * PipelineStageIndicator — inline progress tracker for the 4-stage pipeline.
 *
 * Shows the completion status of each pipeline stage (Triage → Correlation →
 * Hypothesis → Response Actions) with visual indicators and inline "Continue"
 * buttons so analysts can advance the pipeline without navigating away.
 *
 * Renders inside QueueItemCard for items that have an associated pipeline run.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Shield,
  GitBranch,
  Brain,
  Swords,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  ArrowRight,
  Clock,
  ExternalLink,
} from "lucide-react";

type StageStatus = "pending" | "running" | "completed" | "failed" | "skipped";

interface PipelineRun {
  id: number;
  runId: string;
  status: string;
  currentStage: string;
  triageStatus: string;
  triageId: string | null;
  correlationStatus: string;
  correlationId: string | null;
  hypothesisStatus: string;
  livingCaseId: number | null;
  responseActionsStatus: string;
  responseActionsCount: number;
  totalLatencyMs: number | null;
  error: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

interface PipelineStageIndicatorProps {
  pipelineRun: PipelineRun;
  queueItemId: number;
  onPipelineUpdated?: () => void;
}

const STAGES = [
  { key: "triage", label: "Triage", icon: Shield, statusField: "triageStatus" as const },
  { key: "correlation", label: "Correlation", icon: GitBranch, statusField: "correlationStatus" as const },
  { key: "hypothesis", label: "Hypothesis", icon: Brain, statusField: "hypothesisStatus" as const },
  { key: "responseActions", label: "Response", icon: Swords, statusField: "responseActionsStatus" as const },
] as const;

function stageStatusColor(status: StageStatus): string {
  switch (status) {
    case "completed": return "text-emerald-400 bg-emerald-500/15 border-emerald-500/30";
    case "running": return "text-cyan-400 bg-cyan-500/15 border-cyan-500/30 animate-pulse";
    case "failed": return "text-red-400 bg-red-500/15 border-red-500/30";
    case "skipped": return "text-zinc-500 bg-zinc-500/10 border-zinc-500/20";
    default: return "text-zinc-500 bg-white/[0.03] border-white/[0.08]";
  }
}

function stageStatusIcon(status: StageStatus) {
  switch (status) {
    case "completed": return CheckCircle2;
    case "running": return Loader2;
    case "failed": return XCircle;
    case "skipped": return Clock;
    default: return Clock;
  }
}

function connectorColor(status: StageStatus): string {
  switch (status) {
    case "completed": return "bg-emerald-500/40";
    case "running": return "bg-cyan-500/40";
    case "failed": return "bg-red-500/30";
    default: return "bg-white/10";
  }
}

/** Determine the next actionable stage for a partial/failed pipeline run. */
function getNextActionableStage(run: PipelineRun): string | null {
  if (run.status === "completed") return null;
  if (run.triageStatus === "failed" || run.triageStatus === "pending") return "triage";
  if (run.correlationStatus === "failed" || run.correlationStatus === "pending") return "correlation";
  if (run.hypothesisStatus === "failed" || run.hypothesisStatus === "pending") return "hypothesis";
  return null;
}

export function PipelineStageIndicator({
  pipelineRun,
  queueItemId,
  onPipelineUpdated,
}: PipelineStageIndicatorProps) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const continueMutation = trpc.pipeline.continuePipelineRun.useMutation({
    onSuccess: () => {
      toast.success("Pipeline continued successfully");
      utils.pipeline.getPipelineRunByQueueItem.invalidate({ queueItemId });
      utils.alertQueue.list.invalidate();
      onPipelineUpdated?.();
    },
    onError: (err) => {
      toast.error("Failed to continue pipeline", { description: err.message });
    },
  });

  const resumeMutation = trpc.pipeline.resumePipelineRun.useMutation({
    onSuccess: () => {
      toast.success("Pipeline resumed from failed stage");
      utils.pipeline.getPipelineRunByQueueItem.invalidate({ queueItemId });
      utils.alertQueue.list.invalidate();
      onPipelineUpdated?.();
    },
    onError: (err) => {
      toast.error("Failed to resume pipeline", { description: err.message });
    },
  });

  const nextStage = getNextActionableStage(pipelineRun);
  const isRunning = pipelineRun.status === "running" || continueMutation.isPending || resumeMutation.isPending;
  const completedCount = STAGES.filter(s => {
    const status = pipelineRun[s.statusField] as StageStatus;
    return status === "completed" || status === "skipped";
  }).length;

  const handleContinue = () => {
    if (!nextStage) return;
    const hasFailed = STAGES.some(s => (pipelineRun[s.statusField] as StageStatus) === "failed");
    if (hasFailed) {
      resumeMutation.mutate({ runId: pipelineRun.runId });
    } else {
      continueMutation.mutate({ runId: pipelineRun.runId });
    }
  };

  return (
    <div className="px-4 pb-3 pt-1">
      {/* Stage progress bar */}
      <div className="flex items-center gap-1">
        {STAGES.map((stage, idx) => {
          const status = pipelineRun[stage.statusField] as StageStatus;
          const StatusIcon = stageStatusIcon(status);
          const StageIcon = stage.icon;

          return (
            <div key={stage.key} className="flex items-center flex-1 min-w-0">
              {/* Stage node */}
              <div
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[10px] font-medium transition-all ${stageStatusColor(status)}`}
                title={`${stage.label}: ${status}`}
              >
                <StageIcon className="h-3 w-3 flex-shrink-0" />
                <span className="hidden sm:inline truncate">{stage.label}</span>
                <StatusIcon className={`h-3 w-3 flex-shrink-0 ${status === "running" ? "animate-spin" : ""}`} />
              </div>

              {/* Connector line between stages */}
              {idx < STAGES.length - 1 && (
                <div className={`flex-1 h-px mx-1 ${connectorColor(status)}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Summary row */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-3">
          {/* Progress fraction */}
          <span className="text-[10px] font-mono text-muted-foreground">
            Stage {completedCount}/{STAGES.length}
            {pipelineRun.status === "completed" && " — Complete"}
            {pipelineRun.status === "partial" && " — Partial"}
            {pipelineRun.status === "running" && " — Running"}
            {pipelineRun.status === "failed" && " — Failed"}
          </span>

          {/* Latency */}
          {pipelineRun.totalLatencyMs != null && pipelineRun.totalLatencyMs > 0 && (
            <span className="text-[9px] font-mono text-muted-foreground/50">
              {(pipelineRun.totalLatencyMs / 1000).toFixed(1)}s
            </span>
          )}

          {/* Error message */}
          {pipelineRun.error && (
            <span className="text-[9px] text-red-400/70 truncate max-w-xs" title={pipelineRun.error}>
              {pipelineRun.error.length > 60 ? pipelineRun.error.slice(0, 60) + "…" : pipelineRun.error}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Continue / Resume button */}
          {nextStage && !isRunning && (
            <button
              onClick={handleContinue}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-violet-500/15 border border-violet-500/30 text-violet-300 hover:bg-violet-500/25 transition-all"
              title={`Continue pipeline from ${nextStage} stage`}
            >
              <Play className="h-3 w-3" />
              Continue → {nextStage.charAt(0).toUpperCase() + nextStage.slice(1)}
            </button>
          )}

          {isRunning && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
              <Loader2 className="h-3 w-3 animate-spin" />
              Processing…
            </span>
          )}

          {/* View in Pipeline Inspector */}
          <button
            onClick={() => navigate(`/pipeline-inspector?runId=${pipelineRun.runId}`)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-medium bg-white/[0.04] border border-white/[0.08] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground transition-all"
            title="View full pipeline run details"
          >
            <ExternalLink className="h-2.5 w-2.5" />
            Inspect
          </button>
        </div>
      </div>
    </div>
  );
}
