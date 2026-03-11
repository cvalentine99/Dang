import {
  AlertTriangle,
  XCircle,
  Loader2,
  Trash2,
  Inbox,
  RefreshCw,
  Ticket,
} from "lucide-react";
import type { QueueItem } from "./types";

interface QueueHeaderProps {
  activeCount: number;
  queuedItems: QueueItem[];
  completedItemsCount: number;
  ticketEligibleCount: number;
  splunkEnabled: boolean;
  canRunTicketing: boolean;
  ticketingDegraded: boolean;
  ticketingReason: string | null;
  isBatchRunning: boolean;
  batchProgress: {
    completed: number;
    total: number;
    percentage: number;
    currentAlert: string | null;
    sent: number;
    failed: number;
  } | null;
  isFetching: boolean;
  isBatchPending: boolean;
  onRefresh: () => void;
  onBatchCreate: () => void;
  onClearHistory: () => void;
  onNavigateAlerts: () => void;
}

export function QueueHeader({
  activeCount,
  queuedItems,
  completedItemsCount,
  ticketEligibleCount,
  splunkEnabled,
  canRunTicketing,
  ticketingDegraded,
  ticketingReason,
  isBatchRunning,
  batchProgress,
  isFetching,
  isBatchPending,
  onRefresh,
  onBatchCreate,
  onClearHistory,
  onNavigateAlerts,
}: QueueHeaderProps) {
  return (
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
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
          {/* Batch Create All Tickets */}
          {splunkEnabled && (isBatchRunning || ticketEligibleCount > 0) && (
            isBatchRunning && batchProgress ? (
              <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 min-w-[280px]">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-medium text-emerald-300">
                      {batchProgress.completed}/{batchProgress.total} tickets created
                    </span>
                    <span className="text-[10px] text-emerald-400/70 font-mono">
                      {batchProgress.percentage}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-black/30 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-400 transition-all duration-300 ease-out"
                      style={{ width: `${batchProgress.percentage}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[9px] text-muted-foreground font-mono truncate max-w-[160px]">
                      {batchProgress.currentAlert
                        ? `Processing: ${batchProgress.currentAlert}`
                        : "Finalizing..."}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {batchProgress.sent > 0 && (
                        <span className="text-emerald-400">{batchProgress.sent} sent</span>
                      )}
                      {batchProgress.failed > 0 && (
                        <span className="text-red-400 ml-1">{batchProgress.failed} failed</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            ) : ticketEligibleCount > 0 ? (
              <button
                onClick={onBatchCreate}
                disabled={isBatchPending || !canRunTicketing}
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
                    ? `Ticketing degraded (${ticketingReason}) — ${ticketEligibleCount} eligible`
                    : `Create Splunk tickets for ${ticketEligibleCount} completed triage report${ticketEligibleCount > 1 ? "s" : ""}`
                }
              >
                {!canRunTicketing ? (
                  <XCircle className="h-3.5 w-3.5" />
                ) : ticketingDegraded ? (
                  <AlertTriangle className="h-3.5 w-3.5" />
                ) : (
                  <Ticket className="h-3.5 w-3.5" />
                )}
                Create All Tickets ({ticketEligibleCount})
                {ticketingDegraded && canRunTicketing && (
                  <span className="ml-0.5 text-[9px] text-amber-400/60">(degraded)</span>
                )}
              </button>
            ) : null
          )}
          {completedItemsCount > 0 && (
            <button
              onClick={onClearHistory}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear History
            </button>
          )}
          <button
            onClick={onNavigateAlerts}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Alerts Timeline
          </button>
        </div>
      </div>

      {/* Queue depth indicator */}
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
  );
}
