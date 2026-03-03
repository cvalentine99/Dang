/**
 * Alert Queue — 10-deep FIFO queue for alerts awaiting structured triage.
 *
 * Two workflow paths:
 *   1. "Structured Triage" (primary) — runs triage-only via runTriageAgent(),
 *      creates triageObjects + pipelineRuns rows. Downstream stages (correlation,
 *      hypothesis) must be triggered separately.
 *   2. "Ad-hoc Analysis" (secondary) — opens Walter for conversational analysis.
 *      Does NOT create pipeline artifacts. Results are not persisted.
 */

import { trpc } from "@/lib/trpc";
import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { ReadinessBanner } from "@/components/shared/ReadinessBanner";
import { useAgenticReadiness } from "@/hooks/useAgenticReadiness";
import {
  Brain,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  Play,
  ChevronDown,
  ChevronRight,
  Shield,
  Activity,
  Eye,
  FileJson,
  Inbox,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Ticket,
  ExternalLink,
} from "lucide-react";

// Severity color mapping
function severityColor(level: number): string {
  if (level >= 12) return "text-red-400 bg-red-500/10 border-red-500/20";
  if (level >= 8) return "text-orange-400 bg-orange-500/10 border-orange-500/20";
  if (level >= 4) return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
  return "text-blue-400 bg-blue-500/10 border-blue-500/20";
}

function severityLabel(level: number): string {
  if (level >= 12) return "Critical";
  if (level >= 8) return "High";
  if (level >= 4) return "Medium";
  return "Low";
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: typeof Clock; color: string; label: string }> = {
    queued: { icon: Clock, color: "text-amber-400 bg-amber-500/10 border-amber-500/20", label: "Queued" },
    processing: { icon: Loader2, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20", label: "Analyzing" },
    completed: { icon: CheckCircle2, color: "text-green-400 bg-green-500/10 border-green-500/20", label: "Completed" },
    failed: { icon: XCircle, color: "text-red-400 bg-red-500/10 border-red-500/20", label: "Failed" },
    dismissed: { icon: Trash2, color: "text-muted-foreground bg-white/5 border-white/10", label: "Dismissed" },
  };

  const c = config[status] ?? config.queued;
  const Icon = c.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-mono ${c.color}`}>
      <Icon className={`h-2.5 w-2.5 ${status === "processing" ? "animate-spin" : ""}`} />
      {c.label}
    </span>
  );
}

/**
 * Splunk deep link — clickable ticket ID that opens the notable event
 * in Splunk ES Mission Control's Incident Review dashboard.
 */
function SplunkTicketLink({ ticketId }: { ticketId: string }) {
  const splunkBaseUrl = trpc.splunk.getSplunkBaseUrl.useQuery(undefined, { staleTime: 60_000 });

  const url = splunkBaseUrl.data?.incidentReviewUrl
    ? `${splunkBaseUrl.data.incidentReviewUrl}?search=${encodeURIComponent(`ticket_id="${ticketId}"`)}`
    : null;

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-mono hover:bg-emerald-500/20 hover:text-emerald-200 transition-all group"
        title="Open in Splunk ES Mission Control"
      >
        <Ticket className="h-3 w-3" />
        {ticketId}
        <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
      </a>
    );
  }

  // Fallback: no Splunk host configured, show plain text
  return (
    <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-mono">
      <Ticket className="h-3 w-3" />
      {ticketId}
    </span>
  );
}

// ── Pipeline Triage Badge Components ─────────────────────────────────────────

const ROUTE_BADGE_COLORS: Record<string, { label: string; color: string }> = {
  A_DUPLICATE_NOISY: { label: "Duplicate/Noisy", color: "text-gray-400 bg-gray-500/10 border-gray-500/20" },
  B_LOW_CONFIDENCE: { label: "Low Confidence", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  C_HIGH_CONFIDENCE: { label: "High Confidence", color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  D_LIKELY_BENIGN: { label: "Likely Benign", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
};

const SEVERITY_BADGE_COLORS: Record<string, string> = {
  critical: "text-red-400 bg-red-500/15 border-red-500/30",
  high: "text-orange-400 bg-orange-500/15 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30",
  low: "text-blue-400 bg-blue-500/15 border-blue-500/30",
  info: "text-gray-400 bg-gray-500/15 border-gray-500/30",
};

function TriageRouteBadge({ route }: { route: string }) {
  const r = ROUTE_BADGE_COLORS[route] ?? ROUTE_BADGE_COLORS.B_LOW_CONFIDENCE;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${r.color}`}>
      {r.label}
    </span>
  );
}

function TriageSeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${SEVERITY_BADGE_COLORS[severity] ?? ""}`}>
      {severity}
    </span>
  );
}

// Queue item card
function QueueItemCard({
  item,
  onAnalyze,
  onDismiss,
  isProcessing,
  elapsedSeconds = 0,
  canRunStructuredPipeline = true,
  canRunAdHoc = true,
}: {
  item: {
    id: number;
    alertId: string;
    ruleId: string;
    ruleDescription: string | null;
    ruleLevel: number;
    agentId: string | null;
    agentName: string | null;
    alertTimestamp: string | null;
    rawJson: Record<string, unknown> | null;
    status: string;
    triageResult: Record<string, unknown> | null;
    queuedAt: Date;
    processedAt: Date | null;
    completedAt: Date | null;
    pipelineTriageId?: string | null;
    autoTriageStatus?: string | null;
  };
  onAnalyze: (id: number) => void;
  onDismiss: (id: number) => void;
  isProcessing: boolean;
  elapsedSeconds?: number;
  canRunStructuredPipeline?: boolean;
  canRunAdHoc?: boolean;
}) {
  const elapsedDisplay = elapsedSeconds;
  const [expanded, setExpanded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [, navigate] = useLocation();

  // Auto-triage mutation (kept for backward compatibility — both buttons now use the same pipeline)
  const autoTriageMutation = trpc.pipeline.autoTriageQueueItem.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Pipeline triage complete", {
          description: `Triage ID: ${result.triageId}`,
        });
        trpc.useUtils().alertQueue.list.invalidate();
      } else {
        toast.error("Pipeline triage failed", { description: result.error });
      }
    },
    onError: (err) => {
      toast.error("Pipeline triage error", { description: err.message });
    },
  });

  // Auto-triage status query (only if item has a pipeline triage ID)
  const autoTriageStatusQ = trpc.pipeline.getAutoTriageStatus.useQuery(
    { queueItemId: item.id },
    { enabled: !!item.pipelineTriageId || item.autoTriageStatus === "running" || item.autoTriageStatus === "completed", staleTime: 10_000 }
  );

  const triageSummary = autoTriageStatusQ.data?.triageSummary;

  const triage = item.triageResult as {
    answer?: string;
    reasoning?: string;
    trustScore?: number;
    confidence?: number;
    safetyStatus?: string;
    suggestedFollowUps?: string[];
    splunkTicketId?: string;
    splunkTicketCreatedAt?: string;
    splunkTicketCreatedBy?: string;
  } | null;

  const splunkEnabled = trpc.splunk.isEnabled.useQuery(undefined, { staleTime: 60_000 });
  const createTicketMutation = trpc.splunk.createTicket.useMutation({
    onSuccess: (result) => {
      if (result.success === true && result.ticketId) {
        toast.success("Splunk ticket created", {
          description: `Ticket ${result.ticketId} sent to Splunk ES Mission Control`,
        });
      } else {
        // Backend returned success:false without throwing — HEC rejected the event
        toast.error("Splunk ticket creation failed", {
          description: result.message || "HEC accepted the request but did not create a ticket",
        });
      }
      // Refetch regardless — if ticket was created, show it; if not, state is unchanged
      trpc.useUtils().alertQueue.list.invalidate();
    },
    onError: (err) => {
      toast.error("Failed to create Splunk ticket", { description: err.message });
    },
  });

  const handleAdHocAnalysis = () => {
    // Navigate to Walter for ad-hoc conversational analysis (not persisted to pipeline)
    const alertSummary = `Triage alert ${item.alertId}: Rule ${item.ruleId} (Level ${item.ruleLevel}) - ${item.ruleDescription ?? "Unknown"} on agent ${item.agentId ?? "unknown"} (${item.agentName ?? "unknown"})`;
    navigate(`/analyst?q=${encodeURIComponent(alertSummary)}`);
  };

  return (
    <div className={`glass-panel rounded-xl overflow-hidden transition-all ${
      item.status === "processing" ? "ring-1 ring-cyan-500/30 shadow-[0_0_20px_rgba(34,211,238,0.1)]" : ""
    }`}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3">
        {/* Severity indicator */}
        <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center border ${severityColor(item.ruleLevel)}`}>
          <span className="text-sm font-mono font-bold">{item.ruleLevel}</span>
        </div>

        {/* Alert info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-foreground font-medium truncate max-w-md">
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
          {/* Pipeline Triage Summary Badge Row */}
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
          {/* Pipeline Auto-Triage indicator */}
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
              {/* Structured Triage button — runs triage-only, creates triageObjects + pipelineRuns */}
              {!item.pipelineTriageId && item.autoTriageStatus !== "running" && (
                isProcessing ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/40 shadow-[0_0_12px_rgba(168,85,247,0.15)] animate-pulse-subtle">
                    <Loader2 className="h-3.5 w-3.5 text-purple-300 animate-spin" />
                    <span className="text-xs font-medium text-purple-200">Analyzing…</span>
                    <span className="text-[10px] font-mono text-purple-400/70 tabular-nums">
                      {elapsedDisplay}s
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={() => onAnalyze(item.id)}
                    disabled={!canRunStructuredPipeline}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      canRunStructuredPipeline
                        ? "bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 hover:shadow-[0_0_10px_rgba(168,85,247,0.15)]"
                        : "bg-white/5 border border-white/10 text-muted-foreground/50 cursor-not-allowed"
                    }`}
                    title={canRunStructuredPipeline ? "Run structured triage pipeline" : "Pipeline blocked — check readiness banner for details"}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Structured Triage
                  </button>
                )
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
              {/* Create Splunk Ticket button — only for completed items with triage */}
              {item.status === "completed" && triage?.answer && splunkEnabled.data?.enabled && !triage?.splunkTicketId && (
                <button
                  onClick={() => createTicketMutation.mutate({ queueItemId: item.id })}
                  disabled={createTicketMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                  title="Create ticket in Splunk ES Mission Control"
                >
                  {createTicketMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Ticket className="h-3.5 w-3.5" />
                  )}
                  Create Ticket
                </button>
              )}
              {/* Show ticket ID if already created — clickable deep link to Splunk ES */}
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

      {/* Processing indicator */}
      {(item.status === "processing" || isProcessing) && (
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
                {elapsedDisplay < 3 ? "Preparing triage pipeline…" : elapsedDisplay < 8 ? "Running structured triage agent…" : elapsedDisplay < 15 ? "Analyzing alert context & MITRE mapping…" : "Finalizing triage assessment…"}
              </p>
            </div>
            <span className="text-[10px] font-mono text-purple-400/60 tabular-nums">{elapsedDisplay}s</span>
          </div>
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-white/5 px-4 py-3 space-y-3">
          {/* Triage result */}
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
                  <span className="text-[10px] font-mono text-muted-foreground">
                    Conf {(triage.confidence * 100).toFixed(0)}%
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

          {/* Raw JSON toggle */}
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

          {/* Timing info */}
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

// Main page
export default function AlertQueue() {
  const utils = trpc.useUtils();
  const { canRunStructuredPipeline, structuredPipelineBlocked, canRunAdHoc, adHocBlocked } = useAgenticReadiness();
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [, navigate] = useLocation();

  // Elapsed time ticker for the processing indicator
  useEffect(() => {
    if (!processingStartTime) {
      setElapsedSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - processingStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [processingStartTime]);

  const listQuery = trpc.alertQueue.list.useQuery(undefined, {
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const processMutation = trpc.alertQueue.process.useMutation({
    onMutate: ({ id }) => {
      setProcessingId(id);
      setProcessingStartTime(Date.now());
    },
    onSuccess: (result) => {
      if (result.success && result.triageId) {
        toast.success("Structured triage complete", {
          description: `Triage ID: ${result.triageId} — view on Triage Pipeline page`,
          action: {
            label: "View Triage",
            onClick: () => navigate("/triage"),
          },
        });
      } else if (result.success && result.alreadyTriaged) {
        toast.info("Already triaged", {
          description: `Triage ID: ${result.triageId}`,
        });
      } else {
        toast.error("Triage failed", { description: (result as any).error ?? "Unknown error" });
      }
      utils.alertQueue.list.invalidate();
      utils.alertQueue.count.invalidate();
    },
    onError: (err) => {
      toast.error("Analysis failed", { description: err.message });
    },
    onSettled: () => {
      setProcessingId(null);
      setProcessingStartTime(null);
    },
  });

  const dismissMutation = trpc.alertQueue.remove.useMutation({
    onSuccess: () => {
      toast.info("Alert dismissed from queue");
      utils.alertQueue.list.invalidate();
      utils.alertQueue.count.invalidate();
    },
  });

  const clearHistoryMutation = trpc.alertQueue.clearHistory.useMutation({
    onSuccess: () => {
      toast.info("Queue history cleared");
      utils.alertQueue.list.invalidate();
      utils.alertQueue.count.invalidate();
    },
  });

  // Splunk batch ticket creation with progress tracking
  const splunkEnabled = trpc.splunk.isEnabled.useQuery(undefined, { staleTime: 60_000 });
  const [isBatchRunning, setIsBatchRunning] = useState(false);

  const batchProgress = trpc.splunk.batchProgress.useQuery(undefined, {
    enabled: isBatchRunning,
    refetchInterval: isBatchRunning ? 500 : false,
    staleTime: 0,
  });

  // Stop polling when batch completes
  useEffect(() => {
    const status = batchProgress.data?.status;
    if (status === "completed" || status === "failed") {
      const p = batchProgress.data;
      if (p && p.sent > 0) {
        toast.success(`${p.sent} Splunk ticket${p.sent > 1 ? "s" : ""} created`, {
          description: `${p.sent} sent, ${p.failed} failed out of ${p.total} total`,
        });
      } else if (p && status === "completed" && p.sent === 0) {
        toast.info("No new tickets created");
      } else if (status === "failed") {
        toast.error("Batch ticket creation failed");
      }
      setIsBatchRunning(false);
      utils.alertQueue.list.invalidate();
    }
  }, [batchProgress.data?.status]);

  const batchCreateMutation = trpc.splunk.batchCreateTickets.useMutation({
    onMutate: () => {
      setIsBatchRunning(true);
    },
    onSuccess: (result) => {
      // Final toast handled by the useEffect above via batchProgress polling
      // But if the batch was so fast that polling didn't catch "running", handle here
      if (!isBatchRunning) {
        if (result.sent > 0) {
          toast.success(`${result.sent} Splunk ticket${result.sent > 1 ? "s" : ""} created`, {
            description: result.message,
          });
        } else {
          toast.info("No new tickets to create", { description: result.message });
        }
      }
      setIsBatchRunning(false);
      utils.alertQueue.list.invalidate();
    },
    onError: (err) => {
      setIsBatchRunning(false);
      toast.error("Batch ticket creation failed", { description: err.message });
    },
  });

  const handleAnalyze = useCallback((id: number) => {
    processMutation.mutate({ id });
  }, [processMutation]);

  const handleDismiss = useCallback((id: number) => {
    dismissMutation.mutate({ id });
  }, [dismissMutation]);

  const items = listQuery.data?.items ?? [];
  const activeCount = listQuery.data?.total ?? 0;
  const queuedItems = items.filter(i => i.status === "queued" || i.status === "processing");
  const completedItems = items.filter(i => i.status === "completed" || i.status === "failed" || i.status === "dismissed");

  // Count completed items eligible for ticketing (no existing splunkTicketId)
  const ticketEligibleCount = items.filter(i => {
    if (i.status !== "completed") return false;
    const triage = i.triageResult as Record<string, unknown> | null;
    if (!triage || !triage.answer) return false;
    if (triage.splunkTicketId) return false;
    return true;
  }).length;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
              <Inbox className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-display font-bold text-foreground">Alert Queue</h1>
              <p className="text-xs text-muted-foreground">
                {activeCount}/10 alerts queued · Sorted by severity (critical first) · Click "Structured Triage" to create pipeline artifacts
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => listQuery.refetch()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${listQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
            {/* Batch Create All Tickets — progress bar when running, button when idle */}
            {splunkEnabled.data?.enabled && (isBatchRunning || ticketEligibleCount > 0) && (
              isBatchRunning && batchProgress.data ? (
                <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 min-w-[280px]">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-medium text-emerald-300">
                        {batchProgress.data.completed}/{batchProgress.data.total} tickets created
                      </span>
                      <span className="text-[10px] text-emerald-400/70 font-mono">
                        {batchProgress.data.percentage}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-black/30 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-400 transition-all duration-300 ease-out"
                        style={{ width: `${batchProgress.data.percentage}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[9px] text-muted-foreground font-mono truncate max-w-[160px]">
                        {batchProgress.data.currentAlert
                          ? `Processing: ${batchProgress.data.currentAlert}`
                          : "Finalizing..."}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {batchProgress.data.sent > 0 && (
                          <span className="text-emerald-400">{batchProgress.data.sent} sent</span>
                        )}
                        {batchProgress.data.failed > 0 && (
                          <span className="text-red-400 ml-1">{batchProgress.data.failed} failed</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              ) : ticketEligibleCount > 0 ? (
                <button
                  onClick={() => batchCreateMutation.mutate()}
                  disabled={batchCreateMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                  title={`Create Splunk tickets for ${ticketEligibleCount} completed triage report${ticketEligibleCount > 1 ? "s" : ""}`}
                >
                  <Ticket className="h-3.5 w-3.5" />
                  Create All Tickets ({ticketEligibleCount})
                </button>
              ) : null
            )}
            {completedItems.length > 0 && (
              <button
                onClick={() => clearHistoryMutation.mutate()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear History
              </button>
            )}
            <button
              onClick={() => navigate("/alerts")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Alerts Timeline
            </button>
          </div>
        </div>

        {/* Queue depth indicator — color-coded by severity of each slot */}
        <div className="mt-3 flex items-center gap-2">
          {Array.from({ length: 10 }, (_, i) => {
            const slotItem = queuedItems[i];
            let segmentColor = "bg-white/5";
            if (slotItem) {
              const lvl = slotItem.ruleLevel;
              if (lvl >= 12) segmentColor = "bg-red-500/70 shadow-[0_0_4px_rgba(239,68,68,0.4)]";
              else if (lvl >= 8) segmentColor = "bg-orange-500/60 shadow-[0_0_4px_rgba(249,115,22,0.3)]";
              else if (lvl >= 4) segmentColor = "bg-yellow-500/50 shadow-[0_0_4px_rgba(234,179,8,0.3)]";
              else segmentColor = "bg-blue-500/50 shadow-[0_0_4px_rgba(59,130,246,0.3)]";
            }
            return (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-all ${segmentColor}`}
                title={slotItem ? `Level ${slotItem.ruleLevel}: ${slotItem.ruleDescription ?? slotItem.ruleId}` : "Empty slot"}
              />
            );
          })}
          <span className="text-[10px] font-mono text-muted-foreground ml-1">{activeCount}/10</span>
        </div>
        {/* Severity legend */}
        {activeCount > 0 && (
          <div className="mt-1.5 flex items-center gap-3 text-[9px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500/70" />Critical (12+)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500/60" />High (8-11)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500/50" />Medium (4-7)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500/50" />Low (0-3)</span>
          </div>
        )}
      </div>

      {/* Queue content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Readiness banner — shows when agentic workflows are degraded or blocked */}
          <ReadinessBanner />
          {/* Empty state */}
          {items.length === 0 && !listQuery.isLoading && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                <Brain className="w-8 h-8 text-purple-400/50" />
              </div>
              <h3 className="text-lg font-display font-semibold text-foreground mb-1">No Alerts Queued</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
                Send alerts to the queue from the Alerts Timeline using the <Brain className="inline h-3 w-3 text-purple-400" /> button on each alert row.
              </p>
              <button
                onClick={() => navigate("/alerts")}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-300 text-sm hover:bg-purple-500/25 transition-all"
              >
                <AlertTriangle className="h-4 w-4" />
                Go to Alerts Timeline
              </button>
            </div>
          )}

          {/* Loading state */}
          {listQuery.isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 text-purple-400 animate-spin" />
            </div>
          )}

          {/* Active queue */}
          {queuedItems.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Activity className="h-4 w-4 text-purple-400" />
                <h2 className="text-sm font-medium text-foreground">Active Queue</h2>
                <span className="text-[10px] font-mono text-muted-foreground">({queuedItems.length})</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded border border-purple-500/20 bg-purple-500/5 text-purple-300 font-mono">severity priority</span>
              </div>
              <div className="space-y-2">
                {queuedItems.map(item => (
                  <QueueItemCard
                    key={item.id}
                    item={item}
                    onAnalyze={handleAnalyze}
                    onDismiss={handleDismiss}
                    isProcessing={processingId === item.id || processMutation.isPending}
                    elapsedSeconds={processingId === item.id ? elapsedSeconds : 0}
                    canRunStructuredPipeline={canRunStructuredPipeline}
                    canRunAdHoc={canRunAdHoc}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed/history */}
          {completedItems.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                <h2 className="text-sm font-medium text-foreground">Analysis History</h2>
                <span className="text-[10px] font-mono text-muted-foreground">({completedItems.length})</span>
              </div>
              <div className="space-y-2">
                {completedItems.map(item => (
                  <QueueItemCard
                    key={item.id}
                    item={item}
                    onAnalyze={handleAnalyze}
                    onDismiss={handleDismiss}
                    isProcessing={false}
                    canRunStructuredPipeline={canRunStructuredPipeline}
                    canRunAdHoc={canRunAdHoc}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
