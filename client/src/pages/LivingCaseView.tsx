/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Living Case View — Hypothesis Agent Results
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Displays the LivingCaseObject produced by the Hypothesis Agent (Step 3).
 * Shows working theory, alternate theories, investigative pivots, evidence gaps,
 * timeline reconstruction, recommended actions, and draft documentation.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { GlassPanel, StatCard, RawJsonViewer, ThreatBadge } from "@/components/shared";
import { PageHeader } from "@/components/shared/PageHeader";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import {
  Brain,
  ChevronDown,
  ChevronRight,
  Clock,
  AlertTriangle,
  Shield,
  Target,
  Zap,
  FileSearch,
  ArrowRight,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  Info,
  Lightbulb,
  Eye,
  EyeOff,
  Crosshair,
  MapPin,
  FileText,
  CheckSquare,
  XSquare,
  PauseCircle,
  ListChecks,
  ScrollText,
  Network,
  GitBranch,
  BarChart3,
  Layers,
  ArrowUpRight,
  CircleDot,
  Download,
  ClipboardCopy,
  Play,
} from "lucide-react";

// ── Severity & Priority Colors ──────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-red-400 bg-red-500/15 border-red-500/30",
  high: "text-orange-400 bg-orange-500/15 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30",
  low: "text-blue-400 bg-blue-500/15 border-blue-500/30",
  info: "text-slate-400 bg-slate-500/15 border-slate-500/30",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-yellow-400",
  low: "text-blue-400",
};

const EFFORT_LABELS: Record<string, { label: string; color: string }> = {
  quick: { label: "Quick Win", color: "text-emerald-400 bg-emerald-500/10" },
  moderate: { label: "Moderate", color: "text-yellow-400 bg-yellow-500/10" },
  deep_dive: { label: "Deep Dive", color: "text-orange-400 bg-orange-500/10" },
};

const ACTION_STATE_CONFIG: Record<string, { icon: typeof CheckSquare; color: string; label: string }> = {
  proposed: { icon: CircleDot, color: "text-violet-400", label: "Proposed" },
  approved: { icon: CheckSquare, color: "text-emerald-400", label: "Approved" },
  rejected: { icon: XSquare, color: "text-red-400", label: "Rejected" },
  deferred: { icon: PauseCircle, color: "text-yellow-400", label: "Deferred" },
};

const TIMELINE_SOURCE_COLORS: Record<string, string> = {
  wazuh_alert: "border-l-red-500/60",
  wazuh_fim: "border-l-orange-500/60",
  wazuh_vuln: "border-l-yellow-500/60",
  wazuh_agent: "border-l-blue-500/60",
  wazuh_sca: "border-l-cyan-500/60",
  threat_intel: "border-l-purple-500/60",
  llm_inference: "border-l-violet-500/60",
  analyst_input: "border-l-emerald-500/60",
  system_computed: "border-l-slate-500/60",
};

// ── Confidence Gauge ────────────────────────────────────────────────────────

function ConfidenceGauge({ value, size = "md" }: { value: number; size?: "sm" | "md" | "lg" }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "text-emerald-400" : pct >= 40 ? "text-yellow-400" : "text-red-400";
  const bgColor = pct >= 70 ? "bg-emerald-500/20" : pct >= 40 ? "bg-yellow-500/20" : "bg-red-500/20";
  const sizeClass = size === "sm" ? "w-8 h-8 text-[10px]" : size === "lg" ? "w-16 h-16 text-lg" : "w-12 h-12 text-sm";

  return (
    <div className={`${sizeClass} rounded-full ${bgColor} flex items-center justify-center font-bold font-[Space_Grotesk] ${color}`}>
      {pct}%
    </div>
  );
}

// ── Working Theory Card ─────────────────────────────────────────────────────

function WorkingTheoryCard({ theory }: { theory: any }) {
  const [showEvidence, setShowEvidence] = useState(false);

  if (!theory) return null;

  return (
    <GlassPanel className="p-0 overflow-hidden border-violet-500/20">
      <div className="p-5 bg-gradient-to-r from-violet-500/[0.06] to-transparent">
        <div className="flex items-start gap-4">
          <div className="shrink-0 mt-1">
            <ConfidenceGauge value={theory.confidence} size="lg" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-5 h-5 text-violet-400" />
              <h3 className="text-sm font-semibold font-[Space_Grotesk] text-violet-300 uppercase tracking-wider">Working Theory</h3>
            </div>
            <p className="text-sm text-foreground/90 leading-relaxed">{theory.statement}</p>
          </div>
        </div>
      </div>

      {/* Evidence toggle */}
      <div className="px-5 py-3 border-t border-white/[0.04]">
        <button
          onClick={() => setShowEvidence(!showEvidence)}
          className="flex items-center gap-1.5 text-xs text-violet-400/70 hover:text-violet-400 transition-colors"
        >
          {showEvidence ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {showEvidence ? "Hide" : "Show"} Evidence ({theory.supportingEvidence?.length ?? 0} supporting, {theory.conflictingEvidence?.length ?? 0} conflicting)
        </button>

        {showEvidence && (
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Supporting */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-emerald-400/60 mb-2 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Supporting Evidence
              </div>
              <div className="space-y-1">
                {(theory.supportingEvidence ?? []).map((e: string, i: number) => (
                  <div key={i} className="text-xs p-2 rounded bg-emerald-500/[0.04] border border-emerald-500/10 text-foreground/75">
                    {e}
                  </div>
                ))}
                {(!theory.supportingEvidence || theory.supportingEvidence.length === 0) && (
                  <div className="text-xs text-muted-foreground/30 italic">No supporting evidence cited</div>
                )}
              </div>
            </div>

            {/* Conflicting */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-red-400/60 mb-2 flex items-center gap-1">
                <XCircle className="w-3 h-3" />
                Conflicting Evidence
              </div>
              <div className="space-y-1">
                {(theory.conflictingEvidence ?? []).map((e: string, i: number) => (
                  <div key={i} className="text-xs p-2 rounded bg-red-500/[0.04] border border-red-500/10 text-foreground/75">
                    {e}
                  </div>
                ))}
                {(!theory.conflictingEvidence || theory.conflictingEvidence.length === 0) && (
                  <div className="text-xs text-muted-foreground/30 italic">No conflicting evidence found</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </GlassPanel>
  );
}

// ── Alternate Theories Card ─────────────────────────────────────────────────

function AlternateTheoriesCard({ theories }: { theories: any[] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (!theories || theories.length === 0) return null;

  return (
    <GlassPanel className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Layers className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-semibold font-[Space_Grotesk] text-cyan-300 uppercase tracking-wider">Alternate Theories</h3>
        <span className="text-[10px] text-muted-foreground/40 ml-auto">{theories.length} theories</span>
      </div>

      <div className="space-y-2">
        {theories.map((theory: any, i: number) => (
          <div
            key={i}
            className="rounded-lg bg-white/[0.02] border border-white/[0.06] overflow-hidden"
          >
            <button
              onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
              className="w-full flex items-center gap-3 p-3 hover:bg-white/[0.02] transition-colors text-left"
            >
              <ConfidenceGauge value={theory.confidence} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground/80 line-clamp-2">{theory.statement}</p>
              </div>
              {expandedIdx === i ? <ChevronDown className="w-3 h-3 text-muted-foreground/40 shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />}
            </button>

            {expandedIdx === i && (
              <div className="px-3 pb-3 space-y-2 border-t border-white/[0.04]">
                {theory.supportingEvidence?.length > 0 && (
                  <div className="mt-2">
                    <div className="text-[10px] uppercase tracking-wider text-emerald-400/50 mb-1">Supporting</div>
                    {theory.supportingEvidence.map((e: string, j: number) => (
                      <div key={j} className="text-[11px] text-foreground/60 pl-3 border-l border-emerald-500/20 mb-1">{e}</div>
                    ))}
                  </div>
                )}
                {theory.whyLessLikely && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-orange-400/50 mb-1">Why Less Likely</div>
                    <p className="text-[11px] text-foreground/60 pl-3 border-l border-orange-500/20">{theory.whyLessLikely}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

// ── Investigative Pivots Card ───────────────────────────────────────────────

function InvestigativePivotsCard({ pivots }: { pivots: any[] }) {
  if (!pivots || pivots.length === 0) return null;

  return (
    <GlassPanel className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Crosshair className="w-4 h-4 text-emerald-400" />
        <h3 className="text-sm font-semibold font-[Space_Grotesk] text-emerald-300 uppercase tracking-wider">Suggested Next Steps</h3>
        <span className="text-[10px] text-muted-foreground/40 ml-auto">{pivots.length} pivots</span>
      </div>

      <div className="space-y-2">
        {pivots.map((pivot: any, i: number) => {
          const effort = EFFORT_LABELS[pivot.effort] ?? EFFORT_LABELS.moderate;
          const priorityColor = PRIORITY_COLORS[pivot.priority] ?? PRIORITY_COLORS.medium;

          return (
            <div key={i} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-start gap-3">
                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                  <span className={`text-[10px] font-bold uppercase ${priorityColor}`}>
                    {pivot.priority}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] ${effort.color}`}>
                    {effort.label}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground/85 font-medium">{pivot.action}</p>
                  <p className="text-[11px] text-muted-foreground/50 mt-1">{pivot.rationale}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </GlassPanel>
  );
}

// ── Evidence Gaps Card ──────────────────────────────────────────────────────

function EvidenceGapsCard({ gaps }: { gaps: any[] }) {
  if (!gaps || gaps.length === 0) return null;

  return (
    <GlassPanel className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Eye className="w-4 h-4 text-yellow-400" />
        <h3 className="text-sm font-semibold font-[Space_Grotesk] text-yellow-300 uppercase tracking-wider">Evidence Gaps</h3>
        <span className="text-[10px] text-muted-foreground/40 ml-auto">{gaps.length} gaps</span>
      </div>

      <div className="space-y-2">
        {gaps.map((gap: any, i: number) => (
          <div key={i} className="p-3 rounded-lg bg-yellow-500/[0.03] border border-yellow-500/10">
            <div className="flex items-start gap-2">
              <span className={`text-[10px] font-bold uppercase mt-0.5 ${PRIORITY_COLORS[gap.priority] ?? "text-yellow-400"}`}>
                {gap.priority}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground/80">{gap.description}</p>
                <p className="text-[11px] text-muted-foreground/50 mt-1">
                  <span className="text-muted-foreground/40">Impact:</span> {gap.impact}
                </p>
                <p className="text-[11px] text-violet-400/60 mt-0.5">
                  <span className="text-muted-foreground/40">Action:</span> {gap.suggestedAction}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

// ── Timeline Card ───────────────────────────────────────────────────────────

function TimelineCard({ events }: { events: any[] }) {
  if (!events || events.length === 0) return null;

  return (
    <GlassPanel className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-semibold font-[Space_Grotesk] text-blue-300 uppercase tracking-wider">Timeline Reconstruction</h3>
        <span className="text-[10px] text-muted-foreground/40 ml-auto">{events.length} events</span>
      </div>

      <div className="space-y-0">
        {events.map((event: any, i: number) => {
          const borderColor = TIMELINE_SOURCE_COLORS[event.source] ?? "border-l-slate-500/60";
          const sigColor = SEVERITY_COLORS[event.significance] ?? SEVERITY_COLORS.medium;

          return (
            <div key={i} className={`pl-4 pb-3 border-l-2 ${borderColor} relative`}>
              {/* Dot */}
              <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-white/20 border border-white/40" />

              <div className="flex items-start gap-3">
                <div className="shrink-0">
                  <div className="text-[10px] font-mono text-muted-foreground/50">
                    {event.timestamp ? new Date(event.timestamp).toLocaleString() : "Unknown"}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground/80">{event.event}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] font-mono text-muted-foreground/40">{event.source}</span>
                    <span className={`px-1 py-0.5 rounded text-[9px] border ${sigColor}`}>
                      {event.significance}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </GlassPanel>
  );
}

// ── Recommended Actions Card ────────────────────────────────────────────────

/**
 * Direction 3: RecommendedActionsCard now fetches from responseActions.getByCase
 * — the single source of truth. caseData.recommendedActions is a display-only snapshot;
 * operational state (approve/reject/defer/execute) lives in response_actions table.
 */
function RecommendedActionsCard({
  caseId,
}: {
  caseId: number;
}) {
  const [reasonDialogAction, setReasonDialogAction] = useState<{ actionId: string; targetState: string } | null>(null);
  const [reasonText, setReasonText] = useState("");

  // Fetch from the REAL source of truth: response_actions table
  const { data, isLoading, refetch } = trpc.responseActions.getByCase.useQuery(
    { caseId },
    { enabled: caseId > 0, refetchInterval: 15_000 }
  );

  const approveMut = trpc.responseActions.approve.useMutation({
    onSuccess: () => { toast.success("Action approved"); refetch(); },
    onError: (err) => toast.error("Approval failed", { description: err.message }),
  });
  const rejectMut = trpc.responseActions.reject.useMutation({
    onSuccess: () => { toast.success("Action rejected"); refetch(); setReasonDialogAction(null); setReasonText(""); },
    onError: (err) => toast.error("Rejection failed", { description: err.message }),
  });
  const deferMut = trpc.responseActions.defer.useMutation({
    onSuccess: () => { toast.success("Action deferred"); refetch(); setReasonDialogAction(null); setReasonText(""); },
    onError: (err) => toast.error("Defer failed", { description: err.message }),
  });
  const executeMut = trpc.responseActions.execute.useMutation({
    onSuccess: () => { toast.success("Action executed"); refetch(); },
    onError: (err) => toast.error("Execution failed", { description: err.message }),
  });

  const actions = data?.actions ?? [];
  const isPending = approveMut.isPending || rejectMut.isPending || deferMut.isPending || executeMut.isPending;

  if (isLoading) {
    return (
      <GlassPanel className="p-5 animate-pulse">
        <div className="h-4 w-48 bg-white/[0.06] rounded mb-4" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-white/[0.03] rounded" />)}
        </div>
      </GlassPanel>
    );
  }

  if (actions.length === 0) return null;

  const urgencyOrder = ["immediate", "next", "scheduled", "optional"] as const;

  const handleReasonSubmit = () => {
    if (!reasonDialogAction || !reasonText.trim()) return;
    if (reasonDialogAction.targetState === "rejected") {
      rejectMut.mutate({ actionId: reasonDialogAction.actionId, reason: reasonText.trim() });
    } else if (reasonDialogAction.targetState === "deferred") {
      deferMut.mutate({ actionId: reasonDialogAction.actionId, reason: reasonText.trim() });
    }
  };

  return (
    <GlassPanel className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <ListChecks className="w-4 h-4 text-orange-400" />
        <h3 className="text-sm font-semibold font-[Space_Grotesk] text-orange-300 uppercase tracking-wider">Response Actions</h3>
        <span className="text-[10px] bg-violet-500/10 border border-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded">
          DB-backed
        </span>
        <span className="text-[10px] text-muted-foreground/40 ml-auto">
          {actions.filter((a: any) => a.state === "proposed").length} pending / {actions.length} total
        </span>
      </div>

      {urgencyOrder.map((urg) => {
        const urgActions = actions.filter((a: any) => a.urgency === urg);
        if (urgActions.length === 0) return null;

        const urgLabel = urg === "immediate" ? "Immediate (< 1 hour)" : urg === "next" ? "Next (< 24 hours)" : urg === "scheduled" ? "Scheduled" : "Optional";
        const urgColor = urg === "immediate" ? "text-red-400" : urg === "next" ? "text-yellow-400" : urg === "scheduled" ? "text-cyan-400" : "text-blue-400";

        return (
          <div key={urg} className="mb-4 last:mb-0">
            <div className={`text-[10px] uppercase tracking-wider ${urgColor} mb-2`}>{urgLabel}</div>
            <div className="space-y-2">
              {urgActions.map((action: any) => {
                const stateConfig = ACTION_STATE_CONFIG[action.state] ?? ACTION_STATE_CONFIG.proposed;
                const StateIcon = stateConfig.icon;

                return (
                  <div key={action.actionId} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                    <div className="flex items-start gap-3">
                      <StateIcon className={`w-4 h-4 ${stateConfig.color} shrink-0 mt-0.5`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-foreground/85 font-medium">{action.title}</p>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-muted-foreground/50 font-mono">
                            {action.category}
                          </span>
                        </div>
                        {action.description && (
                          <p className="text-[10px] text-muted-foreground/50 mt-1">{action.description}</p>
                        )}
                        {action.targetValue && (
                          <div className="mt-1">
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-300 font-mono">
                              {action.targetType}: {action.targetValue}
                            </span>
                          </div>
                        )}
                        {action.evidenceBasis?.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(action.evidenceBasis as string[]).map((e: string, j: number) => (
                              <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.04] text-muted-foreground/50">
                                {e}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          {action.requiresApproval === 1 && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-orange-300">
                              Requires Approval
                            </span>
                          )}
                          <span className={`text-[9px] ${stateConfig.color}`}>{stateConfig.label}</span>
                          {action.proposedBy && (
                            <span className="text-[9px] text-muted-foreground/30 font-mono">
                              by {action.proposedBy}
                            </span>
                          )}
                          <span className="text-[9px] text-muted-foreground/30 font-mono ml-auto">
                            {action.actionId}
                          </span>
                        </div>
                      </div>

                      {/* State transition buttons — use the REAL responseActions endpoints */}
                      <div className="flex items-center gap-1 shrink-0">
                        {action.state === "proposed" && (
                          <>
                            <button
                              onClick={() => approveMut.mutate({ actionId: action.actionId })}
                              disabled={isPending}
                              className="p-1.5 rounded hover:bg-emerald-500/15 text-emerald-400/60 hover:text-emerald-400 transition-colors"
                              title="Approve"
                            >
                              <CheckSquare className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setReasonDialogAction({ actionId: action.actionId, targetState: "rejected" })}
                              disabled={isPending}
                              className="p-1.5 rounded hover:bg-red-500/15 text-red-400/60 hover:text-red-400 transition-colors"
                              title="Reject (requires reason)"
                            >
                              <XSquare className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setReasonDialogAction({ actionId: action.actionId, targetState: "deferred" })}
                              disabled={isPending}
                              className="p-1.5 rounded hover:bg-yellow-500/15 text-yellow-400/60 hover:text-yellow-400 transition-colors"
                              title="Defer (requires reason)"
                            >
                              <PauseCircle className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {action.state === "approved" && (
                          <button
                            onClick={() => executeMut.mutate({ actionId: action.actionId })}
                            disabled={isPending}
                            className="p-1.5 rounded hover:bg-violet-500/15 text-violet-400/60 hover:text-violet-400 transition-colors"
                            title="Mark Executed"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Reason dialog for reject/defer — invariant: these require a reason */}
      {reasonDialogAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[oklch(0.18_0.02_280)] border border-white/[0.08] rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h4 className="text-sm font-semibold font-[Space_Grotesk] text-foreground/80 mb-3">
              {reasonDialogAction.targetState === "rejected" ? "Reject" : "Defer"} Action
            </h4>
            <p className="text-xs text-muted-foreground/50 mb-3">
              A reason is required for {reasonDialogAction.targetState === "rejected" ? "rejecting" : "deferring"} actions.
            </p>
            <textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="Enter reason..."
              className="w-full h-24 bg-white/[0.04] border border-white/[0.08] rounded-lg p-3 text-xs text-foreground/80 placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-violet-500/40 resize-none"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => { setReasonDialogAction(null); setReasonText(""); }}
                className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground/60 hover:text-foreground/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReasonSubmit}
                disabled={!reasonText.trim() || isPending}
                className="px-3 py-1.5 rounded-lg text-xs bg-violet-500/20 border border-violet-500/30 text-violet-300 hover:bg-violet-500/30 disabled:opacity-30 transition-colors"
              >
                {reasonDialogAction.targetState === "rejected" ? "Reject" : "Defer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </GlassPanel>
  );
}

// ── Completed Pivots Card ───────────────────────────────────────────────────

function CompletedPivotsCard({
  pivots,
  caseId,
  onRefresh,
}: {
  pivots: any[];
  caseId: number;
  onRefresh?: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [action, setAction] = useState("");
  const [finding, setFinding] = useState("");
  const [impacted, setImpacted] = useState(false);

  const recordPivot = trpc.pipeline.recordPivot.useMutation({
    onSuccess: () => {
      toast.success("Pivot recorded");
      setShowForm(false);
      setAction("");
      setFinding("");
      setImpacted(false);
      onRefresh?.();
    },
    onError: (err) => toast.error("Failed to record pivot", { description: err.message }),
  });

  return (
    <GlassPanel className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <MapPin className="w-4 h-4 text-emerald-400" />
        <h3 className="text-sm font-semibold font-[Space_Grotesk] text-emerald-300 uppercase tracking-wider">Completed Pivots</h3>
        <span className="text-[10px] text-muted-foreground/40 ml-auto">{pivots?.length ?? 0} recorded</span>
        <button
          onClick={() => setShowForm(!showForm)}
          className="ml-2 px-2 py-1 rounded text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 transition-colors"
        >
          + Record Pivot
        </button>
      </div>

      {/* Record form */}
      {showForm && (
        <div className="mb-4 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-3">
          <div>
            <label className="text-[10px] text-muted-foreground/40 mb-1 block">What did you investigate?</label>
            <input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="e.g., Checked DHCP logs for IP 10.0.1.45 reassignment..."
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1.5 text-xs text-foreground/80 focus:outline-none focus:border-violet-500/40"
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground/40 mb-1 block">What did you find?</label>
            <textarea
              value={finding}
              onChange={(e) => setFinding(e.target.value)}
              placeholder="Findings from this investigative step..."
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1.5 text-xs text-foreground/80 focus:outline-none focus:border-violet-500/40 resize-none h-16"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={impacted}
              onChange={(e) => setImpacted(e.target.checked)}
              className="rounded border-white/20"
            />
            <label className="text-xs text-foreground/60">This finding impacted the working theory</label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => recordPivot.mutate({ caseId, action, finding, impactedTheory: impacted })}
              disabled={recordPivot.isPending || !action.trim() || !finding.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium hover:bg-emerald-500/25 transition-all disabled:opacity-50"
            >
              {recordPivot.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
              Save Pivot
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded-lg border border-white/10 text-muted-foreground text-xs hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Completed pivots list */}
      {pivots && pivots.length > 0 ? (
        <div className="space-y-2">
          {pivots.map((pivot: any, i: number) => (
            <div key={i} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/60 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground/80 font-medium">{pivot.action}</p>
                  <p className="text-[11px] text-foreground/60 mt-1">{pivot.finding}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[9px] font-mono text-muted-foreground/40">
                      {pivot.performedAt ? new Date(pivot.performedAt).toLocaleString() : ""}
                    </span>
                    {pivot.impactedTheory && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/20 text-violet-300">
                        Theory Impact
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground/30 italic text-center py-4">
          No pivots recorded yet. Use the button above to document investigative steps.
        </div>
      )}
    </GlassPanel>
  );
}

// ── Draft Documentation Card ────────────────────────────────────────────────

// ── Report Generator Button ─────────────────────────────────────────────────

function ReportGeneratorButton({ caseId }: { caseId: number }) {
  const [reportType, setReportType] = useState<string>("full");
  const [showReport, setShowReport] = useState(false);
  const [reportMarkdown, setReportMarkdown] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  const generateReport = trpc.pipeline.generateCaseReport.useMutation({
    onSuccess: (data) => {
      if (data.success && data.markdown) {
        setReportMarkdown(data.markdown);
        setShowReport(true);
        toast.success(`${data.reportType} report generated`);
      } else {
        toast.error(data.error ?? "Failed to generate report");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const reportTypes = [
    { value: "full", label: "Full Investigation Report", icon: FileText, color: "text-violet-400" },
    { value: "executive", label: "Executive Summary", icon: BarChart3, color: "text-blue-400" },
    { value: "handoff", label: "Shift Handoff", icon: ScrollText, color: "text-emerald-400" },
    { value: "escalation", label: "Escalation Brief", icon: AlertTriangle, color: "text-red-400" },
    { value: "tuning", label: "Detection Tuning", icon: Target, color: "text-yellow-400" },
  ];

  const copyToClipboard = () => {
    if (reportMarkdown) {
      navigator.clipboard.writeText(reportMarkdown);
      toast.success("Report copied to clipboard");
    }
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          disabled={generateReport.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs transition-colors disabled:opacity-50"
        >
          {generateReport.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Download className="w-3 h-3" />
          )}
          Generate Report
        </button>

        {showMenu && (
          <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-2xl p-1">
            {reportTypes.map((rt) => {
              const Icon = rt.icon;
              return (
                <button
                  key={rt.value}
                  onClick={() => {
                    setReportType(rt.value);
                    setShowMenu(false);
                    generateReport.mutate({ caseId, reportType: rt.value as any });
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs text-foreground/80 hover:bg-white/[0.06] transition-colors"
                >
                  <Icon className={`w-3.5 h-3.5 ${rt.color}`} />
                  {rt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Report Modal */}
      {showReport && reportMarkdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-4xl max-h-[85vh] rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-semibold text-foreground/90 font-[Space_Grotesk]">
                  {reportTypes.find((r) => r.value === reportType)?.label ?? "Report"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 text-xs transition-colors"
                >
                  <ClipboardCopy className="w-3 h-3" />
                  Copy
                </button>
                <button
                  onClick={() => setShowReport(false)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-white/[0.06] hover:bg-white/10 text-foreground/60 text-xs transition-colors"
                >
                  <XCircle className="w-3 h-3" />
                  Close
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-6">
              <pre className="text-xs text-foreground/80 font-mono whitespace-pre-wrap leading-relaxed">{reportMarkdown}</pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Draft Documentation Card ────────────────────────────────────────────────

function DraftDocumentationCard({ docs }: { docs: any }) {
  const [expanded, setExpanded] = useState(false);

  if (!docs) return null;

  const sections = [
    { key: "shiftHandoff", label: "Shift Handoff", icon: ScrollText, color: "text-blue-400" },
    { key: "escalationSummary", label: "Escalation Summary", icon: AlertTriangle, color: "text-red-400" },
    { key: "executiveSummary", label: "Executive Summary", icon: FileText, color: "text-violet-400" },
    { key: "tuningSuggestions", label: "Tuning Suggestions", icon: Target, color: "text-emerald-400" },
  ].filter((s) => docs[s.key]);

  if (sections.length === 0) return null;

  return (
    <GlassPanel className="p-5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 text-left"
      >
        <ScrollText className="w-4 h-4 text-slate-400" />
        <h3 className="text-sm font-semibold font-[Space_Grotesk] text-slate-300 uppercase tracking-wider">Draft Documentation</h3>
        <span className="text-[10px] text-muted-foreground/40 ml-auto">{sections.length} sections</span>
        {expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground/40" /> : <ChevronRight className="w-3 h-3 text-muted-foreground/40" />}
      </button>

      {expanded && (
        <div className="mt-4 space-y-3">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.key} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                <div className={`text-[10px] uppercase tracking-wider ${section.color} mb-2 flex items-center gap-1.5`}>
                  <Icon className="w-3 h-3" />
                  {section.label}
                </div>
                <p className="text-xs text-foreground/75 leading-relaxed whitespace-pre-wrap">{docs[section.key]}</p>
              </div>
            );
          })}
        </div>
      )}
    </GlassPanel>
  );
}

// ── Living Case List View ───────────────────────────────────────────────────

function LivingCaseListView() {
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const { data, isLoading, refetch, isFetching } = trpc.pipeline.listLivingCases.useQuery({
    limit: pageSize,
    offset: page * pageSize,
  });

  const [, navigate] = useLocation();
  const cases = data?.cases ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6 p-6 max-w-[2400px] mx-auto">
      <PageHeader
        title="Living Cases"
        subtitle="Agentic SOC Pipeline — Step 3: Hypothesis Agent / Investigation State"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Active Cases"
          value={total}
          icon={Brain}
          colorClass="text-violet-400"
        />
        <StatCard
          label="Pending Actions"
          value={cases.reduce((sum: number, c: any) => sum + (c.pendingActionCount ?? 0), 0)}
          icon={ListChecks}
          colorClass="text-orange-400"
        />
        <StatCard
          label="Approval Required"
          value={cases.reduce((sum: number, c: any) => sum + (c.approvalRequiredCount ?? 0), 0)}
          icon={Shield}
          colorClass="text-red-400"
        />
        <StatCard
          label="Evidence Gaps"
          value={cases.reduce((sum: number, c: any) => sum + (c.evidenceGapCount ?? 0), 0)}
          icon={Eye}
          colorClass="text-yellow-400"
        />
      </div>

      {/* Refresh */}
      <div className="flex justify-end">
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1 rounded bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 text-xs transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Case List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <GlassPanel key={i} className="p-4 animate-pulse h-20">&nbsp;</GlassPanel>
          ))}
        </div>
      ) : cases.length === 0 ? (
        <GlassPanel className="p-12 text-center">
          <Brain className="w-12 h-12 text-violet-400/30 mx-auto mb-4" />
          <h3 className="text-lg font-[Space_Grotesk] text-foreground/60 mb-2">No Living Cases Yet</h3>
          <p className="text-sm text-muted-foreground/40 max-w-md mx-auto">
            Living cases are created when the Hypothesis Agent processes a correlation bundle.
            Run "Generate Hypothesis" on any completed correlation to create a case.
          </p>
        </GlassPanel>
      ) : (
        <div className="space-y-2">
          {cases.map((c: any) => (
            <GlassPanel key={c.id} className="p-0 overflow-hidden hover:border-violet-500/20 transition-colors">
              <button
                onClick={() => navigate(`/living-cases/${c.id}`)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-white/[0.02] transition-colors"
              >
                <ConfidenceGauge value={c.theoryConfidence ?? 0} size="sm" />

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground/85 truncate">{c.workingTheory || "No theory generated"}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-muted-foreground/40">Session #{c.sessionId}</span>
                    <span className="text-[10px] text-muted-foreground/40">
                      {c.updatedAt ? new Date(c.updatedAt).toLocaleString() : ""}
                    </span>
                    <span className="text-[10px] text-violet-400/50">{c.lastUpdatedBy}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-center">
                    <div className="text-xs font-bold text-foreground/70">{c.completedPivotCount ?? 0}</div>
                    <div className="text-[9px] text-muted-foreground/40">Pivots</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-bold text-orange-400">{c.pendingActionCount ?? 0}</div>
                    <div className="text-[9px] text-muted-foreground/40">Pending</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-bold text-yellow-400">{c.evidenceGapCount ?? 0}</div>
                    <div className="text-[9px] text-muted-foreground/40">Gaps</div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-muted-foreground/30" />
                </div>
              </button>
            </GlassPanel>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground/40">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 rounded bg-white/[0.04] text-xs text-foreground/60 hover:bg-white/[0.08] disabled:opacity-30 transition-colors"
            >
              Previous
            </button>
            <span className="text-xs text-muted-foreground/40">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 rounded bg-white/[0.04] text-xs text-foreground/60 hover:bg-white/[0.08] disabled:opacity-30 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Living Case Detail View ─────────────────────────────────────────────────

function LivingCaseDetailView({ caseId }: { caseId: number }) {
  const [showRawJson, setShowRawJson] = useState(false);
  const [, navigate] = useLocation();

  const { data, isLoading, refetch, isFetching } = trpc.pipeline.getLivingCaseById.useQuery(
    { id: caseId },
    { enabled: caseId > 0 }
  );

  if (isLoading) {
    return (
      <div className="space-y-6 p-6 max-w-[2400px] mx-auto">
        <PageHeader title="Loading Case..." subtitle="Hypothesis Agent" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <GlassPanel key={i} className="p-6 animate-pulse h-32">&nbsp;</GlassPanel>
          ))}
        </div>
      </div>
    );
  }

  if (!data?.found) {
    return (
      <div className="space-y-6 p-6 max-w-[2400px] mx-auto">
        <PageHeader title="Case Not Found" subtitle="Hypothesis Agent" />
        <GlassPanel className="p-12 text-center">
          <XCircle className="w-12 h-12 text-red-400/30 mx-auto mb-4" />
          <h3 className="text-lg font-[Space_Grotesk] text-foreground/60 mb-2">Living Case Not Found</h3>
          <p className="text-sm text-muted-foreground/40 mb-4">Case ID {caseId} does not exist.</p>
          <button
            onClick={() => navigate("/living-cases")}
            className="px-4 py-2 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-300 text-sm hover:bg-violet-500/25 transition-colors"
          >
            Back to Cases
          </button>
        </GlassPanel>
      </div>
    );
  }

  const row = data.livingCase;
  const caseData = row.caseData as any;

  return (
    <div className="space-y-6 p-6 max-w-[2400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate("/living-cases")}
            className="text-xs text-violet-400/60 hover:text-violet-400 mb-2 flex items-center gap-1 transition-colors"
          >
            <ChevronRight className="w-3 h-3 rotate-180" />
            Back to Cases
          </button>
          <PageHeader
            title={`Living Case #${row.id}`}
            subtitle={`Session #${row.sessionId} — Last updated by ${row.lastUpdatedBy} at ${row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "unknown"}`}
          />
        </div>
        <div className="flex items-center gap-2">
          <ReportGeneratorButton caseId={row.id} />
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 text-xs transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Theory Confidence"
          value={`${Math.round((row.theoryConfidence ?? 0) * 100)}%`}
          icon={Brain}
          colorClass="text-violet-400"
        />
        <StatCard
          label="Completed Pivots"
          value={row.completedPivotCount ?? 0}
          icon={MapPin}
          colorClass="text-emerald-400"
        />
        <StatCard
          label="Evidence Gaps"
          value={row.evidenceGapCount ?? 0}
          icon={Eye}
          colorClass="text-yellow-400"
        />
        <StatCard
          label="Pending Actions"
          value={row.pendingActionCount ?? 0}
          icon={ListChecks}
          colorClass="text-orange-400"
        />
        <StatCard
          label="Approval Required"
          value={row.approvalRequiredCount ?? 0}
          icon={Shield}
          colorClass="text-red-400"
        />
      </div>

      {/* Working Theory */}
      <WorkingTheoryCard theory={caseData?.workingTheory} />

      {/* Two-column layout for theories + pivots */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <AlternateTheoriesCard theories={caseData?.alternateTheories ?? []} />
        <InvestigativePivotsCard pivots={caseData?.suggestedNextSteps ?? []} />
      </div>

      {/* Evidence Gaps */}
      <EvidenceGapsCard gaps={caseData?.evidenceGaps ?? []} />

      {/* Timeline */}
      <TimelineCard events={caseData?.timelineSummary ?? []} />

      {/* Response Actions — fetched from response_actions table, NOT caseData JSON */}
      <RecommendedActionsCard caseId={row.id} />

      {/* Completed Pivots */}
      <CompletedPivotsCard
        pivots={caseData?.completedPivots ?? []}
        caseId={row.id}
        onRefresh={() => refetch()}
      />

      {/* Draft Documentation */}
      <DraftDocumentationCard docs={caseData?.draftDocumentation} />

      {/* Linked IDs */}
      <GlassPanel className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Network className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold font-[Space_Grotesk] text-slate-300 uppercase tracking-wider">Linked Artifacts</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2">Triage IDs</div>
            <div className="flex flex-wrap gap-1">
              {(caseData?.linkedTriageIds ?? []).map((id: string, i: number) => (
                <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-violet-500/10 border border-violet-500/20 text-violet-300">
                  {id}
                </span>
              ))}
              {(!caseData?.linkedTriageIds || caseData.linkedTriageIds.length === 0) && (
                <span className="text-[10px] text-muted-foreground/30">None</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2">Correlation IDs</div>
            <div className="flex flex-wrap gap-1">
              {(caseData?.linkedCorrelationIds ?? []).map((id: string, i: number) => (
                <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
                  {id}
                </span>
              ))}
              {(!caseData?.linkedCorrelationIds || caseData.linkedCorrelationIds.length === 0) && (
                <span className="text-[10px] text-muted-foreground/30">None</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2">Alert IDs</div>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              {(caseData?.linkedAlertIds ?? []).slice(0, 20).map((id: string, i: number) => (
                <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-500/10 border border-red-500/20 text-red-300">
                  {id}
                </span>
              ))}
              {(caseData?.linkedAlertIds?.length ?? 0) > 20 && (
                <span className="text-[10px] text-muted-foreground/30">+{caseData.linkedAlertIds.length - 20} more</span>
              )}
            </div>
          </div>
        </div>
      </GlassPanel>

      {/* Raw JSON */}
      <GlassPanel className="p-5">
        <button
          onClick={() => setShowRawJson(!showRawJson)}
          className="text-[10px] uppercase tracking-wider text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
        >
          {showRawJson ? "Hide" : "Show"} Full Living Case Object JSON
        </button>
        {showRawJson && (
          <div className="mt-3">
            <RawJsonViewer data={caseData} title="Living Case Object" />
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

// ── Main Page Export ─────────────────────────────────────────────────────────

export default function LivingCaseView() {
  const [matchDetail, params] = useRoute("/living-cases/:id");

  if (matchDetail && params?.id) {
    const caseId = parseInt(params.id, 10);
    if (!isNaN(caseId)) {
      return <LivingCaseDetailView caseId={caseId} />;
    }
  }

  return <LivingCaseListView />;
}
