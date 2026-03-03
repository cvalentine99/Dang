import { trpc } from "@/lib/trpc";
import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  ChevronUp,
  History,
  RefreshCw,
  Ticket,
  FileText,
} from "lucide-react";
import { SplunkTicketLink } from "./Badges";

export function TicketArtifactsPanel() {
  const [expanded, setExpanded] = useState(false);
  const [showRawFor, setShowRawFor] = useState<number | null>(null);

  const artifactsQuery = trpc.splunk.listTicketArtifacts.useQuery(
    { limit: 50, offset: 0 },
    { enabled: expanded, staleTime: 15_000 }
  );

  const artifacts = artifactsQuery.data?.artifacts ?? [];

  if (!expanded) {
    return (
      <div>
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 w-full"
        >
          <History className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-medium text-foreground">Ticket Audit Trail</h2>
          <span className="text-[10px] text-muted-foreground ml-1">Click to expand</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setExpanded(false)} className="flex items-center gap-2">
          <History className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-medium text-foreground">Ticket Audit Trail</h2>
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <span className="text-[10px] font-mono text-muted-foreground">({artifacts.length})</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/5 text-emerald-300 font-mono">
          success + failure records
        </span>
        <button
          onClick={() => artifactsQuery.refetch()}
          className="ml-auto p-1 rounded hover:bg-white/5 text-muted-foreground/40 hover:text-foreground/70 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`h-3 w-3 ${artifactsQuery.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {artifactsQuery.isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-4 w-4 text-emerald-400 animate-spin mr-2" />
          <span className="text-xs text-muted-foreground">Loading ticket history...</span>
        </div>
      ) : artifacts.length === 0 ? (
        <div className="glass-panel rounded-lg p-6 text-center">
          <Ticket className="h-6 w-6 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground/40">No ticket creation attempts recorded yet.</p>
          <p className="text-[10px] text-muted-foreground/25 mt-1">
            Ticket artifacts are created when analysts manually trigger Splunk ticket creation from completed triage reports.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {artifacts.map((a: any) => (
            <div
              key={a.id}
              className={`glass-panel rounded-lg overflow-hidden transition-all ${
                a.success
                  ? "border-emerald-500/10 hover:border-emerald-500/20"
                  : "border-red-500/10 hover:border-red-500/20"
              }`}
            >
              <div className="px-3 py-2.5 flex items-center gap-3">
                <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-mono ${
                  a.success
                    ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                    : "text-red-400 bg-red-500/10 border-red-500/20"
                }`}>
                  {a.success ? <CheckCircle2 className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                  {a.success ? "Created" : "Failed"}
                </span>

                {a.success && a.ticketId && !a.ticketId.startsWith("failed-") ? (
                  <SplunkTicketLink ticketId={a.ticketId} />
                ) : (
                  <span className="text-[10px] font-mono text-muted-foreground/40 truncate max-w-[160px]">
                    {a.ticketId}
                  </span>
                )}

                <span className="text-[9px] px-1.5 py-0.5 rounded border border-white/[0.06] bg-white/[0.03] text-muted-foreground/50 font-mono">
                  {a.system}
                </span>

                {a.ruleLevel != null && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${
                    a.ruleLevel >= 12 ? "text-red-400 bg-red-500/10 border-red-500/20" :
                    a.ruleLevel >= 8 ? "text-orange-400 bg-orange-500/10 border-orange-500/20" :
                    a.ruleLevel >= 4 ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" :
                    "text-blue-400 bg-blue-500/10 border-blue-500/20"
                  }`}>
                    L{a.ruleLevel}
                  </span>
                )}

                <span className="text-[10px] text-muted-foreground/40 font-mono ml-auto">
                  {a.createdAt ? new Date(a.createdAt).toLocaleString() : "—"}
                </span>

                <span className="text-[10px] text-muted-foreground/30">
                  by {a.createdBy}
                </span>
              </div>

              {a.statusMessage && (
                <div className="px-3 pb-2 -mt-0.5">
                  <span className={`text-[10px] ${a.success ? "text-emerald-300/60" : "text-red-300/60"}`}>
                    {a.statusMessage}
                  </span>
                </div>
              )}

              <div className="px-3 pb-2 flex items-center gap-3 flex-wrap text-[9px] text-muted-foreground/30 font-mono">
                <span>Queue #{a.queueItemId}</span>
                {a.alertId && (
                  <><span className="text-muted-foreground/15">·</span><span>Alert: {a.alertId}</span></>
                )}
                {a.triageId && (
                  <><span className="text-muted-foreground/15">·</span><span>Triage: {a.triageId}</span></>
                )}
                {a.pipelineRunId && (
                  <><span className="text-muted-foreground/15">·</span><span>Run #{a.pipelineRunId}</span></>
                )}
                {a.ruleId && (
                  <><span className="text-muted-foreground/15">·</span><span>Rule {a.ruleId}</span></>
                )}

                <button
                  onClick={() => setShowRawFor(showRawFor === a.id ? null : a.id)}
                  className="ml-auto flex items-center gap-1 text-[9px] text-muted-foreground/30 hover:text-foreground/50 transition-colors"
                >
                  <FileText className="h-2.5 w-2.5" />
                  {showRawFor === a.id ? "Hide" : "Raw"}
                </button>
              </div>

              {showRawFor === a.id && a.rawResponse && (
                <div className="border-t border-white/[0.04] px-3 py-2">
                  <pre className="text-[9px] font-mono text-muted-foreground/40 overflow-x-auto max-h-32 overflow-y-auto">
                    {JSON.stringify(a.rawResponse, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
