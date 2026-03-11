/**
 * Alert Queue — 10-deep FIFO queue for alerts awaiting structured triage.
 *
 * Two workflow paths:
 *   1. "Structured Triage" (primary) — runs triage-only via runTriageAgent(),
 *      creates triageObjects + pipelineRuns rows. Downstream stages (correlation,
 *      hypothesis) must be triggered separately.
 *   2. "Ad-hoc Analysis" (secondary) — opens the AI analyst for conversational analysis.
 *      Does NOT create pipeline artifacts. Results are not persisted.
 */

import { trpc } from "@/lib/trpc";
import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { ReadinessBanner } from "@/components/shared/ReadinessBanner";
import { useAgenticReadiness } from "@/hooks/useAgenticReadiness";
import {
  Brain,
  CheckCircle2,
  Loader2,
  Activity,
} from "lucide-react";
import { QueueItemCard, TicketArtifactsPanel, QueueHeader } from "./alert-queue";

// Main page
export default function AlertQueue() {
  const utils = trpc.useUtils();
  const { canRunStructuredPipeline, canRunAdHoc, canRunTicketing, ticketingDegraded, ticketingReason } = useAgenticReadiness();
  const [, navigate] = useLocation();

  const listQuery = trpc.alertQueue.list.useQuery(undefined, {
    refetchInterval: 10_000,
    staleTime: 5_000,
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

  // Stop polling when batch completes — truthful toast based on actual results
  useEffect(() => {
    const status = batchProgress.data?.status;
    if (status === "completed" || status === "failed") {
      const p = batchProgress.data;
      if (p && p.sent > 0 && p.failed === 0) {
        toast.success(`${p.sent} Splunk ticket${p.sent > 1 ? "s" : ""} created`, {
          description: `All ${p.sent} tickets sent to Splunk ES`,
        });
      } else if (p && p.sent > 0 && p.failed > 0) {
        toast.warning(`${p.sent} of ${p.total} tickets created`, {
          description: `${p.failed} ticket${p.failed > 1 ? "s" : ""} failed — check Splunk HEC connectivity`,
        });
      } else if (p && p.sent === 0 && p.failed > 0) {
        toast.error(`All ${p.failed} ticket${p.failed > 1 ? "s" : ""} failed`, {
          description: "Splunk HEC rejected all events — check connection and token",
        });
      } else if (p && status === "completed" && p.sent === 0 && p.failed === 0) {
        toast.info("No eligible tickets to create");
      }
      setIsBatchRunning(false);
      utils.alertQueue.list.invalidate();
      utils.splunk.ticketArtifactCountsByQueueItem.invalidate();
    }
  }, [batchProgress.data?.status]);

  const batchCreateMutation = trpc.splunk.batchCreateTickets.useMutation({
    onMutate: () => {
      setIsBatchRunning(true);
    },
    onSuccess: (result) => {
      if (!isBatchRunning) {
        if (result.sent > 0 && result.failed === 0) {
          toast.success(`${result.sent} Splunk ticket${result.sent > 1 ? "s" : ""} created`, {
            description: result.message,
          });
        } else if (result.sent > 0 && result.failed > 0) {
          toast.warning(`${result.sent} of ${result.total} tickets created`, {
            description: `${result.failed} failed — ${result.message}`,
          });
        } else if (result.failed > 0) {
          toast.error(`All ${result.failed} tickets failed`, {
            description: result.message,
          });
        } else {
          toast.info("No eligible tickets to create", { description: result.message });
        }
      }
      setIsBatchRunning(false);
      utils.alertQueue.list.invalidate();
      utils.splunk.ticketArtifactCountsByQueueItem.invalidate();
    },
    onError: (err) => {
      setIsBatchRunning(false);
      toast.error("Batch ticket creation failed", { description: err.message });
    },
  });

  const handleDismiss = useCallback((id: number) => {
    dismissMutation.mutate({ id });
  }, [dismissMutation]);

  const items = listQuery.data?.items ?? [];
  const activeCount = listQuery.data?.total ?? 0;
  const queuedItems = items.filter(i => i.status === "queued" || i.status === "processing");
  const completedItems = items.filter(i => i.status === "completed" || i.status === "failed" || i.status === "dismissed");

  // Batch query ticket artifact counts for all queue items — avoids N+1 queries
  const allItemIds = items.map(i => i.id).filter(Boolean);
  const ticketCountsQuery = trpc.splunk.ticketArtifactCountsByQueueItem.useQuery(
    { queueItemIds: allItemIds },
    { enabled: allItemIds.length > 0, staleTime: 15_000 }
  );
  const ticketCounts = ticketCountsQuery.data?.counts ?? {};

  const hasSuccessfulTicketForItem = (itemId: number): boolean => {
    const counts = ticketCounts[itemId];
    return counts != null && counts.success > 0;
  };

  // Count completed items eligible for ticketing
  const ticketEligibleCount = items.filter(i => {
    if (i.status !== "completed") return false;
    const triage = i.triageResult as Record<string, unknown> | null;
    if (!triage || !triage.answer) return false;
    if (triage.splunkTicketId) return false;
    if (hasSuccessfulTicketForItem(i.id)) return false;
    return true;
  }).length;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header with batch toolbar */}
      <QueueHeader
        activeCount={activeCount}
        queuedItems={queuedItems as any}
        completedItemsCount={completedItems.length}
        ticketEligibleCount={ticketEligibleCount}
        splunkEnabled={!!splunkEnabled.data?.enabled}
        canRunTicketing={canRunTicketing}
        ticketingDegraded={ticketingDegraded}
        ticketingReason={ticketingReason}
        isBatchRunning={isBatchRunning}
        batchProgress={batchProgress.data ?? null}
        isFetching={listQuery.isFetching}
        isBatchPending={batchCreateMutation.isPending}
        onRefresh={() => listQuery.refetch()}
        onBatchCreate={() => batchCreateMutation.mutate()}
        onClearHistory={() => clearHistoryMutation.mutate()}
        onNavigateAlerts={() => navigate("/alerts")}
      />

      {/* Queue content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-5xl mx-auto space-y-6" aria-live="polite" aria-label="Alert triage queue">
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
                    item={item as any}
                    onDismiss={handleDismiss}
                    canRunStructuredPipeline={canRunStructuredPipeline}
                    canRunAdHoc={canRunAdHoc}
                    canRunTicketing={canRunTicketing}
                    ticketingDegraded={ticketingDegraded}
                    ticketingReason={ticketingReason}
                    hasSuccessfulTicket={hasSuccessfulTicketForItem(item.id)}
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
                    item={item as any}
                    onDismiss={handleDismiss}
                    canRunStructuredPipeline={canRunStructuredPipeline}
                    canRunAdHoc={canRunAdHoc}
                    canRunTicketing={canRunTicketing}
                    ticketingDegraded={ticketingDegraded}
                    ticketingReason={ticketingReason}
                    hasSuccessfulTicket={hasSuccessfulTicketForItem(item.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Ticket Audit Trail */}
          <TicketArtifactsPanel />
        </div>
      </div>
    </div>
  );
}
