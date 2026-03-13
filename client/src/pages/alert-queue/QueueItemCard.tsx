import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import {
  Brain,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  Play,
  ChevronDown,
  ChevronRight,
  Eye,
  FileJson,
  ArrowRight,
  Sparkles,
  Ticket,
  Zap,
} from "lucide-react";
import { severityColor, StatusBadge, TriageRouteBadge, TriageSeverityBadge, SplunkTicketLink } from "./Badges";
import { PipelineStageIndicator } from "./PipelineStageIndicator";
import type { QueueItem, TriageData } from "./types";

interface QueueItemCardProps {
  item: QueueItem;
  onDismiss: (id: number) => void;
  canRunStructuredPipeline?: boolean;
  canRunAdHoc?: boolean;
  canRunTicketing?: boolean;
  ticketingDegraded?: boolean;
  ticketingReason?: string | null;
  hasSuccessfulTicket?: boolean;
}

export function QueueItemCard({
  item,
  onDismiss,
  canRunStructuredPipeline = true,
  canRunAdHoc = true,
  canRunTicketing = false,
  ticketingDegraded = false,
  ticketingReason = null,
  hasSuccessfulTicket = false,
}: QueueItemCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  // ── Stage 1 only: Auto-Triage mutation ──────────────────────────────────
  const autoTriageMutation = trpc.pipeline.autoTriageQueueItem.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Pipeline triage complete", {
          description: `Triage ID: ${result.triageId}`,
        });
        utils.alertQueue.list.invalidate();
        utils.pipeline.getPipelineRunByQueueItem.invalidate({ queueItemId: item.id });
      } else {
        toast.error("Pipeline triage failed", { description: result.error });
      }
    },
    onError: (err) => {
      toast.error("Pipeline triage error", { description: err.message });
    },
  });

  // ── Full Pipeline (all 4 stages) mutation ───────────────────────────────
  const fullPipelineMutation = trpc.pipeline.runFullPipeline.useMutation({
    onSuccess: (result) => {
      if (result.status === "completed") {
        toast.success("Full pipeline completed", {
          description: `All 4 stages done in ${(result.totalLatencyMs / 1000).toFixed(1)}s — Run ID: ${result.runId}`,
        });
      } else if (result.status === "partial") {
        const failedStages = Object.entries(result.stages)
          .filter(([, v]) => v.status === "failed")
          .map(([k]) => k);
        toast.warning("Pipeline partially completed", {
          description: `Failed at: ${failedStages.join(", ")}. Use "Continue" to retry.`,
        });
      }
      utils.alertQueue.list.invalidate();
      utils.pipeline.getPipelineRunByQueueItem.invalidate({ queueItemId: item.id });
    },
    onError: (err) => {
      toast.error("Full pipeline error", { description: err.message });
    },
  });

  const autoTriageStatusQ = trpc.pipeline.getAutoTriageStatus.useQuery(
    { queueItemId: item.id },
    { enabled: !!item.pipelineTriageId || item.autoTriageStatus === "running" || item.autoTriageStatus === "completed", staleTime: 10_000 }
  );

  // ── Pipeline run status for this queue item ─────────────────────────────
  const pipelineRunQ = trpc.pipeline.getPipelineRunByQueueItem.useQuery(
    { queueItemId: item.id },
    {
      enabled: !!item.pipelineTriageId || item.autoTriageStatus === "completed" || fullPipelineMutation.isSuccess,
      staleTime: 5_000,
      refetchInterval: (query) => {
        // Poll while mutations are in-flight OR while the server-side pipeline is still running.
        // Without this, passive viewers (analysts who didn't trigger the pipeline) see stale stage status.
        if (fullPipelineMutation.isPending || autoTriageMutation.isPending) return 2_000;
        const run = query.state.data as { status?: string } | undefined;
        if (run?.status === "running") return 3_000;
        return false;
      },
    }
  );

  const triageSummary = autoTriageStatusQ.data?.triageSummary;
  const triage = item.triageResult as TriageData | null;
  const pipelineRun = pipelineRunQ.data;

  const splunkEnabled = trpc.splunk.isEnabled.useQuery(undefined, { staleTime: 60_000 });
  const createTicketMutation = trpc.splunk.createTicket.useMutation({
    onSuccess: (result) => {
      if (result.success === true && result.ticketId) {
        toast.success("Splunk ticket created", {
          description: `Ticket ${result.ticketId} sent to Splunk ES Mission Control`,
        });
      } else {
        toast.error("Splunk ticket creation failed", {
          description: result.message || "HEC accepted the request but did not create a ticket",
        });
      }
      utils.alertQueue.list.invalidate();
      utils.splunk.ticketArtifactCountsByQueueItem.invalidate();
    },
    onError: (err) => {
      toast.error("Failed to create Splunk ticket", { description: err.message });
    },
  });

  const handleAdHocAnalysis = () => {
    const alertSummary = `Triage alert ${item.alertId}: Rule ${item.ruleId} (Level ${item.ruleLevel}) - ${item.ruleDescription ?? "Unknown"} on agent ${item.agentId ?? "unknown"} (${item.agentName ?? "unknown"})`;
    navigate(`/analyst?q=${encodeURIComponent(alertSummary)}`);
  };

  const handleRunFullPipeline = () => {
    const rawAlert = item.rawJson ?? {
      id: item.alertId,
      rule: {
        id: item.ruleId,
        description: item.ruleDescription,
        level: item.ruleLevel,
      },
      agent: {
        id: item.agentId,
        name: item.agentName,
      },
      timestamp: item.alertTimestamp,
    };
    fullPipelineMutation.mutate({
      rawAlert,
      queueItemId: item.id,
    });
  };

  const isAnyPipelineRunning = autoTriageMutation.isPending || fullPipelineMutation.isPending;

  return (
    <div className={`glass-panel rounded-xl overflow-hidden transition-all ${
      item.status === "processing" ? "ring-1 ring-cyan-500/30 shadow-[0_0_20px_rgba(34,211,238,0.1)]" : ""
    }`}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border ${severityColor(item.ruleLevel)}`}>
          <span className="text-sm font-mono font-bold">{item.ruleLevel}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-foreground font-medium truncate">
              {item.ruleDescription ?? `Rule ${item.ruleId}`}
            </span>
            <StatusBadge status={item.status} />
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground font-mono">
            <span>Rule {item.ruleId}</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>Agent {item.agentId ?? "—"} ({item.agentName ?? "—"})</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>{item.alertTimestamp ? new Date(item.alertTimestamp).toLocaleString() : "—"}</span>
          </div>
          {triageSummary && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <TriageRouteBadge route={triageSummary.route} />
              <TriageSeverityBadge severity={triageSummary.severity} />
              {triageSummary.alertFamily && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-white/[0.04] border border-white/[0.08] text-muted-foreground/60">
                  {triageSummary.alertFamily}
                </span>
              )}
              {triageSummary.summary && (
                <span className="text-[10px] text-muted-foreground/50 truncate max-w-xs" title={triageSummary.summary}>
                  {triageSummary.summary.length > 80 ? triageSummary.summary.slice(0, 80) + "…" : triageSummary.summary}
                </span>
              )}
              {triageSummary.analystConfirmed && (
                <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  ✓ Confirmed
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {item.pipelineTriageId && (
            <button
              onClick={() => navigate(`/triage?highlight=${item.pipelineTriageId}`)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-300 text-[10px] font-medium hover:bg-violet-500/20 transition-all"
              title={`Pipeline Triage: ${item.pipelineTriageId}`}
            >
              <Brain className="h-3 w-3" />
              Triaged
            </button>
          )}
          {item.autoTriageStatus === "running" && !item.pipelineTriageId && (
            <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-[10px]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Triaging...
            </span>
          )}
          {item.status === "queued" && (
            <>
              {!item.pipelineTriageId && item.autoTriageStatus !== "running" && !isAnyPipelineRunning && (
                <div className="flex items-center gap-1.5">
                  {/* Stage 1 only: Triage Pipeline */}
                  <button
                    onClick={() => autoTriageMutation.mutate({ queueItemId: item.id })}
                    disabled={!canRunStructuredPipeline || isAnyPipelineRunning}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      canRunStructuredPipeline
                        ? "bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 hover:shadow-[0_0_10px_rgba(168,85,247,0.15)]"
                        : "bg-white/5 border border-white/10 text-muted-foreground/50 cursor-not-allowed"
                    }`}
                    title={canRunStructuredPipeline ? "Run Stage 1 only (Triage) — creates triage artifacts" : "Pipeline blocked — check readiness banner for details"}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Triage Only
                  </button>

                  {/* Full Pipeline: All 4 stages */}
                  <button
                    onClick={handleRunFullPipeline}
                    disabled={!canRunStructuredPipeline || isAnyPipelineRunning}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      canRunStructuredPipeline
                        ? "bg-gradient-to-r from-violet-500/20 to-purple-500/20 border border-violet-500/40 text-violet-200 hover:from-violet-500/30 hover:to-purple-500/30 hover:shadow-[0_0_12px_rgba(139,92,246,0.2)]"
                        : "bg-white/5 border border-white/10 text-muted-foreground/50 cursor-not-allowed"
                    }`}
                    title={canRunStructuredPipeline ? "Run all 4 stages: Triage → Correlation → Hypothesis → Response Actions" : "Pipeline blocked — check readiness banner for details"}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Full Pipeline
                  </button>
                </div>
              )}

              {/* Loading state for pipeline mutations */}
              {isAnyPipelineRunning && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/40 shadow-[0_0_12px_rgba(168,85,247,0.15)] animate-pulse-subtle">
                  <Loader2 className="h-3.5 w-3.5 text-purple-300 animate-spin" />
                  <span className="text-xs font-medium text-purple-200">
                    {fullPipelineMutation.isPending ? "Running full pipeline…" : "Triaging…"}
                  </span>
                </div>
              )}

              <button
                onClick={() => onDismiss(item.id)}
                className="p-1.5 rounded-lg border border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground transition-all"
                title="Dismiss"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {(item.status === "completed" || item.status === "failed") && (
            <div className="flex items-center gap-1.5">
              {item.status === "completed" && triage?.answer && splunkEnabled.data?.enabled && (
                hasSuccessfulTicket && !triage?.splunkTicketId ? (
                  <span
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/8 border border-emerald-500/15 text-emerald-400/70 text-xs font-medium cursor-default"
                    title="Ticket already created for this queue item"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Ticketed
                  </span>
                ) : !triage?.splunkTicketId && !hasSuccessfulTicket ? (
                  <button
                    onClick={() => createTicketMutation.mutate({ queueItemId: item.id })}
                    disabled={createTicketMutation.isPending || !canRunTicketing}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50 ${
                      !canRunTicketing
                        ? "bg-white/5 border border-white/10 text-muted-foreground/50 cursor-not-allowed"
                        : ticketingDegraded
                        ? "bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20"
                        : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20"
                    }`}
                    title={
                      !canRunTicketing
                        ? `Ticketing unavailable: ${ticketingReason ?? "Splunk HEC not reachable"}`
                        : ticketingDegraded
                        ? `Ticketing degraded: ${ticketingReason ?? "HEC connectivity issues"}`
                        : "Create ticket in Splunk ES Mission Control"
                    }
                  >
                    {createTicketMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : !canRunTicketing ? (
                      <XCircle className="h-3.5 w-3.5" />
                    ) : ticketingDegraded ? (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    ) : (
                      <Ticket className="h-3.5 w-3.5" />
                    )}
                    Create Ticket
                    {ticketingDegraded && canRunTicketing && (
                      <span className="ml-0.5 text-[9px] text-amber-400/60">(degraded)</span>
                    )}
                  </button>
                ) : null
              )}
              {triage?.splunkTicketId && (
                <SplunkTicketLink ticketId={triage.splunkTicketId} />
              )}
              {item.pipelineTriageId && (
                <button
                  onClick={() => navigate(`/triage?highlight=${item.pipelineTriageId}`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium hover:bg-violet-500/20 transition-all"
                  title="View triage result on the Triage Pipeline page"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View in Triage
                </button>
              )}
              <button
                onClick={handleAdHocAnalysis}
                disabled={!canRunAdHoc}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  canRunAdHoc
                    ? "bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 hover:bg-cyan-500/20"
                    : "bg-white/5 border border-white/10 text-muted-foreground/50 cursor-not-allowed"
                }`}
                title={canRunAdHoc ? "Open ad-hoc conversational analysis (not persisted to pipeline)" : "Ad-hoc analyst blocked — check readiness banner"}
              >
                <ArrowRight className="h-3.5 w-3.5" />
                Ad-hoc Analysis
              </button>
            </div>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg border border-white/10 text-muted-foreground hover:bg-white/5 transition-all"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Processing indicator — shown during triage-only or full pipeline */}
      {(item.status === "processing" || item.autoTriageStatus === "running" || autoTriageMutation.isPending) && !fullPipelineMutation.isPending && (
        <div className="px-4 pb-3 pt-1">
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-purple-500 via-cyan-500 to-purple-500 animate-shimmer-slide" style={{ width: "80%", backgroundSize: "200% 100%" }} />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
              </span>
              <p className="text-[10px] text-purple-300 font-mono">
                Running triage pipeline…
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Full pipeline progress indicator — shown during full pipeline execution */}
      {fullPipelineMutation.isPending && (
        <div className="px-4 pb-3 pt-1">
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-purple-500 via-cyan-500 to-violet-500 animate-shimmer-slide" style={{ width: "100%", backgroundSize: "300% 100%" }} />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
              </span>
              <p className="text-[10px] text-violet-300 font-mono">
                Running full pipeline (4 stages)… This may take 30–60 seconds.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pipeline Stage Progress Indicator — shown when a pipeline run exists */}
      {pipelineRun && !fullPipelineMutation.isPending && !autoTriageMutation.isPending && (
        <PipelineStageIndicator
          pipelineRun={pipelineRun as any}
          queueItemId={item.id}
          onPipelineUpdated={() => {
            utils.alertQueue.list.invalidate();
          }}
        />
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-white/5 px-4 py-3 space-y-3">
          {triage?.answer && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                <span className="text-xs font-medium text-foreground">Structured Triage Report</span>
                {triage.trustScore != null && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border ${
                    triage.trustScore >= 0.7 ? "text-green-400 bg-green-500/10 border-green-500/20" :
                    triage.trustScore >= 0.4 ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" :
                    "text-red-400 bg-red-500/10 border-red-500/20"
                  }`}>
                    Trust {(triage.trustScore * 100).toFixed(0)}%
                  </span>
                )}
                {triage.confidence != null && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border ${
                    triage.confidence >= 0.7 ? "text-green-400 bg-green-500/10 border-green-500/20" :
                    triage.confidence >= 0.4 ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" :
                    "text-red-400 bg-red-500/10 border-red-500/20"
                  }`}>
                    AI Conf {(triage.confidence * 100).toFixed(0)}%
                  </span>
                )}
              </div>
              <div className="rounded-lg bg-black/30 border border-white/5 px-3 py-2 text-sm text-foreground prose prose-invert prose-sm max-w-none prose-headings:text-purple-200 prose-strong:text-foreground prose-code:text-cyan-300 prose-code:bg-black/30 prose-code:px-1 prose-code:py-0.5 prose-code:rounded">
                <Streamdown>{triage.answer}</Streamdown>
              </div>
              {triage.suggestedFollowUps && triage.suggestedFollowUps.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {triage.suggestedFollowUps.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => navigate(`/analyst?q=${encodeURIComponent(q)}`)}
                      className="text-[10px] px-2 py-1 rounded-lg border border-purple-500/20 bg-purple-500/5 text-purple-300 hover:bg-purple-500/15 transition-all"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <FileJson className="h-3 w-3" />
              {showRaw ? "Hide" : "Show"} Raw Alert JSON
            </button>
            {showRaw && item.rawJson && (
              <pre className="mt-2 rounded-lg bg-black/40 border border-white/5 p-3 text-[10px] font-mono text-muted-foreground overflow-x-auto max-h-64 overflow-y-auto">
                {JSON.stringify(item.rawJson, null, 2)}
              </pre>
            )}
          </div>

          <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-mono">
            <span>Queued: {new Date(item.queuedAt).toLocaleString()}</span>
            {item.processedAt && <span>Started: {new Date(item.processedAt).toLocaleString()}</span>}
            {item.completedAt && <span>Completed: {new Date(item.completedAt).toLocaleString()}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
