/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Pipeline Inspector — Direction 6
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Dedicated view showing pipeline run history, per-stage status/latency,
 * and the ability to inspect each stage's input/output artifacts.
 * This is the SOC manager's view into automation health.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { GlassPanel, StatCard, RawJsonViewer } from "@/components/shared";
import { PageHeader } from "@/components/shared/PageHeader";
import { useLocation } from "wouter";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Zap,
  RefreshCw,
  BarChart3,
  Layers,
  Timer,
  Target,
} from "lucide-react";

// ── Stage Config ───────────────────────────────────────────────────────────

const STAGE_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  triage: { label: "Triage", color: "text-cyan-400", bgColor: "bg-cyan-500/15 border-cyan-500/30" },
  correlation: { label: "Correlation", color: "text-violet-400", bgColor: "bg-violet-500/15 border-violet-500/30" },
  hypothesis: { label: "Hypothesis", color: "text-amber-400", bgColor: "bg-amber-500/15 border-amber-500/30" },
  response_actions: { label: "Response Actions", color: "text-emerald-400", bgColor: "bg-emerald-500/15 border-emerald-500/30" },
};

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  completed: { icon: CheckCircle2, color: "text-emerald-400", label: "Completed" },
  failed: { icon: XCircle, color: "text-red-400", label: "Failed" },
  running: { icon: Loader2, color: "text-cyan-400", label: "Running" },
  partial: { icon: AlertTriangle, color: "text-yellow-400", label: "Partial" },
  pending: { icon: Clock, color: "text-muted-foreground/50", label: "Pending" },
  skipped: { icon: Clock, color: "text-muted-foreground/30", label: "Skipped" },
};

// ── Main Page ──────────────────────────────────────────────────────────────

export default function PipelineInspector() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data: stats } = trpc.pipeline.pipelineRunStats.useQuery();
  const { data, isLoading, refetch } = trpc.pipeline.listPipelineRuns.useQuery({
    limit,
    offset: page * limit,
    ...(statusFilter !== "all" ? { status: statusFilter as any } : {}),
  });

  const runs = data?.runs ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline Inspector"
        subtitle="Monitor automation health — per-stage status, latency, and artifact lineage for every pipeline run."
      />

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <StatCard
          label="Total Runs"
          value={stats?.total ?? 0}
          icon={Layers}
        />
        <StatCard
          label="Completed"
          value={stats?.completed ?? 0}
          icon={CheckCircle2}
        />
        <StatCard
          label="Partial"
          value={stats?.partial ?? 0}
          icon={AlertTriangle}
        />
        <StatCard
          label="Failed"
          value={stats?.failed ?? 0}
          icon={XCircle}
        />
        <StatCard
          label="Running"
          value={stats?.running ?? 0}
          icon={Loader2}
        />
        <StatCard
          label="Avg Latency"
          value={stats?.avgLatencyMs ? `${(stats.avgLatencyMs / 1000).toFixed(1)}s` : "—"}
          icon={Timer}
        />
      </div>

      {/* Filter Bar */}
      <GlassPanel className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-muted-foreground/50 uppercase tracking-wider font-[Space_Grotesk]">Filter:</span>
          {["all", "running", "completed", "partial", "failed"].map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(0); }}
              className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                statusFilter === s
                  ? "bg-violet-500/20 border border-violet-500/30 text-violet-300"
                  : "bg-white/[0.03] border border-white/[0.06] text-muted-foreground/50 hover:text-foreground/70"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <button
            onClick={() => refetch()}
            className="ml-auto p-1.5 rounded-lg hover:bg-white/[0.06] text-muted-foreground/40 hover:text-foreground/70 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </GlassPanel>

      {/* Pipeline Runs List */}
      {isLoading ? (
        <GlassPanel className="p-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-violet-400 animate-spin mr-2" />
          <span className="text-sm text-muted-foreground/50">Loading pipeline runs...</span>
        </GlassPanel>
      ) : runs.length === 0 ? (
        <GlassPanel className="p-8 text-center">
          <Activity className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground/40">No pipeline runs found.</p>
          <p className="text-xs text-muted-foreground/25 mt-1">Pipeline runs are created when alerts enter the Walter Queue with auto-triage enabled.</p>
        </GlassPanel>
      ) : (
        <div className="space-y-3">
          {runs.map((run: any) => (
            <PipelineRunCard key={run.id} run={run} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground/40">
            Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 rounded-lg text-xs bg-white/[0.03] border border-white/[0.06] text-muted-foreground/50 hover:text-foreground/70 disabled:opacity-30 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(page + 1)}
              disabled={(page + 1) * limit >= total}
              className="px-3 py-1.5 rounded-lg text-xs bg-white/[0.03] border border-white/[0.06] text-muted-foreground/50 hover:text-foreground/70 disabled:opacity-30 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pipeline Run Card ──────────────────────────────────────────────────────

function PipelineRunCard({ run }: { run: any }) {
  const [expanded, setExpanded] = useState(false);
  const [, navigate] = useLocation();

  const overallStatus = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.pending;
  const OverallIcon = overallStatus.icon;

  const stages = [
    {
      key: "triage",
      status: run.triageStatus,
      latencyMs: run.triageLatencyMs,
      artifactId: run.triageId,
      artifactLabel: "Triage ID",
    },
    {
      key: "correlation",
      status: run.correlationStatus,
      latencyMs: run.correlationLatencyMs,
      artifactId: run.correlationId,
      artifactLabel: "Correlation ID",
    },
    {
      key: "hypothesis",
      status: run.hypothesisStatus,
      latencyMs: run.hypothesisLatencyMs,
      artifactId: run.livingCaseId ? `case-${run.livingCaseId}` : null,
      artifactLabel: "Living Case ID",
    },
    {
      key: "response_actions",
      status: run.responseActionsStatus,
      latencyMs: null,
      artifactId: run.responseActionsCount > 0 ? `${run.responseActionsCount} actions` : null,
      artifactLabel: "Actions Created",
    },
  ];

  return (
    <GlassPanel className="overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center gap-3 hover:bg-white/[0.02] transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground/40 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
        )}

        <OverallIcon className={`w-4 h-4 ${overallStatus.color} shrink-0 ${run.status === "running" ? "animate-spin" : ""}`} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-foreground/70">{run.runId}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
              run.status === "completed" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" :
              run.status === "failed" ? "bg-red-500/10 border-red-500/20 text-red-300" :
              run.status === "partial" ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-300" :
              "bg-cyan-500/10 border-cyan-500/20 text-cyan-300"
            }`}>
              {overallStatus.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            {run.alertId && (
              <span className="text-[10px] text-muted-foreground/40 font-mono">Alert: {run.alertId}</span>
            )}
            <span className="text-[10px] text-muted-foreground/30">
              by {run.triggeredBy}
            </span>
          </div>
        </div>

        {/* Stage progress mini-bar */}
        <div className="flex items-center gap-1 shrink-0">
          {stages.map((stage, i) => {
            const stageStatus = STATUS_CONFIG[stage.status] ?? STATUS_CONFIG.pending;
            const StageIcon = stageStatus.icon;
            return (
              <div key={stage.key} className="flex items-center">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  stage.status === "completed" ? "bg-emerald-500/15" :
                  stage.status === "failed" ? "bg-red-500/15" :
                  stage.status === "running" ? "bg-cyan-500/15" :
                  "bg-white/[0.04]"
                }`}>
                  <StageIcon className={`w-3 h-3 ${stageStatus.color} ${stage.status === "running" ? "animate-spin" : ""}`} />
                </div>
                {i < stages.length - 1 && (
                  <ArrowRight className="w-3 h-3 text-muted-foreground/20 mx-0.5" />
                )}
              </div>
            );
          })}
        </div>

        {/* Latency */}
        <div className="text-right shrink-0 w-20">
          {run.totalLatencyMs ? (
            <span className="text-xs font-mono text-muted-foreground/50">
              {(run.totalLatencyMs / 1000).toFixed(1)}s
            </span>
          ) : run.status === "running" ? (
            <span className="text-[10px] text-cyan-400 animate-pulse">running...</span>
          ) : (
            <span className="text-xs text-muted-foreground/20">—</span>
          )}
          <div className="text-[10px] text-muted-foreground/25 mt-0.5">
            {run.startedAt ? new Date(run.startedAt).toLocaleTimeString() : "—"}
          </div>
        </div>
      </button>

      {/* Expanded Detail */}
      {expanded && (
        <div className="border-t border-white/[0.06] p-4 space-y-4">
          {/* Stage Detail Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {stages.map((stage) => {
              const config = STAGE_CONFIG[stage.key];
              const stageStatus = STATUS_CONFIG[stage.status] ?? STATUS_CONFIG.pending;
              const StageIcon = stageStatus.icon;

              return (
                <div
                  key={stage.key}
                  className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <StageIcon className={`w-3.5 h-3.5 ${stageStatus.color} ${stage.status === "running" ? "animate-spin" : ""}`} />
                    <span className={`text-xs font-semibold font-[Space_Grotesk] ${config.color}`}>
                      {config.label}
                    </span>
                    <span className={`text-[9px] ml-auto ${stageStatus.color}`}>
                      {stageStatus.label}
                    </span>
                  </div>

                  {/* Latency */}
                  {stage.latencyMs != null && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Timer className="w-3 h-3 text-muted-foreground/30" />
                      <span className="text-[10px] font-mono text-muted-foreground/50">
                        {(stage.latencyMs / 1000).toFixed(2)}s
                      </span>
                    </div>
                  )}

                  {/* Artifact ID */}
                  {stage.artifactId && (
                    <div className="flex items-center gap-1.5">
                      <Target className="w-3 h-3 text-muted-foreground/30" />
                      <span className="text-[10px] text-muted-foreground/40">{stage.artifactLabel}:</span>
                      <span className="text-[10px] font-mono text-violet-300/70 truncate">
                        {stage.artifactId}
                      </span>
                    </div>
                  )}

                  {/* Navigate to artifact */}
                  {stage.key === "hypothesis" && run.livingCaseId && (
                    <button
                      onClick={() => navigate(`/living-cases/${run.livingCaseId}`)}
                      className="mt-2 text-[10px] text-violet-400/60 hover:text-violet-400 transition-colors flex items-center gap-1"
                    >
                      View Living Case <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Error Display */}
          {run.error && (
            <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="w-3.5 h-3.5 text-red-400" />
                <span className="text-xs font-semibold text-red-300">Error</span>
              </div>
              <pre className="text-[10px] font-mono text-red-300/70 whitespace-pre-wrap break-all">
                {run.error}
              </pre>
            </div>
          )}

          {/* Replay Button for failed/partial runs */}
          {(run.status === "failed" || run.status === "partial") && (
            <ReplayButton runId={run.runId} />
          )}

          {/* Metadata */}
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground/30">
            <span>Run ID: <span className="font-mono">{run.runId}</span></span>
            {run.queueItemId && <span>Queue Item: <span className="font-mono">#{run.queueItemId}</span></span>}
            <span>Started: {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}</span>
            {run.completedAt && <span>Completed: {new Date(run.completedAt).toLocaleString()}</span>}
          </div>
        </div>
      )}
    </GlassPanel>
  );
}

// ── Replay Button ─────────────────────────────────────────────────────────

function ReplayButton({ runId }: { runId: string }) {
  const utils = trpc.useUtils();
  const replay = trpc.pipeline.replayPipelineRun.useMutation({
    onSuccess: () => {
      utils.pipeline.listPipelineRuns.invalidate();
      utils.pipeline.pipelineRunStats.invalidate();
    },
  });

  return (
    <div className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 text-violet-400" />
          <div>
            <span className="text-xs font-semibold text-violet-300 font-[Space_Grotesk]">Replay Pipeline</span>
            <p className="text-[10px] text-muted-foreground/40 mt-0.5">
              Re-run from the first failed stage. Completed stages are reused.
            </p>
          </div>
        </div>
        <button
          onClick={() => replay.mutate({ runId })}
          disabled={replay.isPending}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-500/15 border border-violet-500/30 text-violet-300 hover:bg-violet-500/25 transition-colors disabled:opacity-40 flex items-center gap-1.5"
        >
          {replay.isPending ? (
            <><Loader2 className="w-3 h-3 animate-spin" /> Replaying...</>
          ) : (
            <><Zap className="w-3 h-3" /> Replay</>
          )}
        </button>
      </div>
      {replay.isSuccess && replay.data && (
        <div className="mt-2 p-2 rounded bg-emerald-500/5 border border-emerald-500/20">
          <span className="text-[10px] text-emerald-300">Replay started: </span>
          <span className="text-[10px] font-mono text-emerald-300/70">{replay.data.replayRunId}</span>
          <span className="text-[10px] text-muted-foreground/40 ml-2">
            from stage: {replay.data.startedFromStage}
          </span>
        </div>
      )}
      {replay.isError && (
        <div className="mt-2 p-2 rounded bg-red-500/5 border border-red-500/20">
          <span className="text-[10px] text-red-300">{replay.error.message}</span>
        </div>
      )}
    </div>
  );
}
