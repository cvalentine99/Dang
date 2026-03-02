/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Triage Pipeline Dashboard
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Displays triage pipeline results, stats, and allows running triage on alerts.
 * This is the analyst-facing view of the agentic SOC pipeline Step 1.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { useState, useMemo, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { GlassPanel, StatCard, RawJsonViewer, ThreatBadge } from "@/components/shared";
import { PageHeader } from "@/components/shared/PageHeader";
import { useLocation } from "wouter";
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
  Network,
  User,
  Globe,
  Hash,
  Cpu,
  FileText,
  ThumbsUp,
  ThumbsDown,
  GitBranch,
  MessageSquare,
  Lightbulb,
} from "lucide-react";

// ── Severity & Route Colors ──────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-red-400 bg-red-500/15 border-red-500/30",
  high: "text-orange-400 bg-orange-500/15 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30",
  low: "text-blue-400 bg-blue-500/15 border-blue-500/30",
  info: "text-slate-400 bg-slate-500/15 border-slate-500/30",
};

const ROUTE_LABELS: Record<string, { label: string; color: string; description: string }> = {
  A_DUPLICATE_NOISY: { label: "Duplicate/Noisy", color: "text-slate-400 bg-slate-500/10", description: "Suppression candidate" },
  B_LOW_CONFIDENCE: { label: "Low Confidence", color: "text-yellow-400 bg-yellow-500/10", description: "Needs enrichment" },
  C_HIGH_CONFIDENCE: { label: "High Confidence", color: "text-red-400 bg-red-500/10", description: "Proceed to correlation" },
  D_LIKELY_BENIGN: { label: "Likely Benign", color: "text-green-400 bg-green-500/10", description: "Closure candidate" },
};

const ENTITY_ICONS: Record<string, typeof Globe> = {
  host: Cpu,
  user: User,
  ip: Globe,
  domain: Globe,
  hash: Hash,
  process: Cpu,
  file_path: FileText,
  rule_id: Shield,
  mitre_technique: Target,
  cve: AlertTriangle,
  port: Network,
  registry_key: FileSearch,
};

// ── Triage Stats Panel ───────────────────────────────────────────────────────

function TriageStatsPanel() {
  const { data: stats, isLoading } = trpc.pipeline.triageStats.useQuery();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <GlassPanel key={i} className="p-4 animate-pulse h-20">&nbsp;</GlassPanel>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const severityOrder = ["critical", "high", "medium", "low", "info"];

  return (
    <div className="space-y-4">
      {/* Total + Status */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <GlassPanel className="p-4">
          <div className="text-xs text-muted-foreground/70 uppercase tracking-wider mb-1">Total Triages</div>
          <div className="text-2xl font-bold font-[Space_Grotesk]">{stats.total}</div>
        </GlassPanel>
        {["completed", "processing", "pending", "failed"].map(status => (
          <GlassPanel key={status} className="p-4">
            <div className="text-xs text-muted-foreground/70 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              {status === "completed" && <CheckCircle2 className="w-3 h-3 text-green-400" />}
              {status === "processing" && <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />}
              {status === "pending" && <Clock className="w-3 h-3 text-yellow-400" />}
              {status === "failed" && <XCircle className="w-3 h-3 text-red-400" />}
              {status}
            </div>
            <div className="text-xl font-bold font-[Space_Grotesk]">
              {(stats.byStatus as Record<string, number>)[status] ?? 0}
            </div>
          </GlassPanel>
        ))}
      </div>

      {/* Severity Distribution */}
      <div className="grid grid-cols-5 gap-3">
        {severityOrder.map(sev => (
          <GlassPanel key={sev} className="p-3">
            <div className={`text-xs uppercase tracking-wider mb-1 ${SEVERITY_COLORS[sev]?.split(" ")[0]}`}>
              {sev}
            </div>
            <div className="text-lg font-bold font-[Space_Grotesk]">
              {(stats.bySeverity as Record<string, number>)[sev] ?? 0}
            </div>
          </GlassPanel>
        ))}
      </div>

      {/* Route Distribution */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(ROUTE_LABELS).map(([route, info]) => (
          <GlassPanel key={route} className="p-3">
            <div className={`text-xs uppercase tracking-wider mb-1 ${info.color.split(" ")[0]}`}>
              {info.label}
            </div>
            <div className="text-lg font-bold font-[Space_Grotesk]">
              {(stats.byRoute as Record<string, number>)[route] ?? 0}
            </div>
            <div className="text-[10px] text-muted-foreground/50">{info.description}</div>
          </GlassPanel>
        ))}
      </div>
    </div>
  );
}

// ── Correlation Bundle Card ─────────────────────────────────────────────────

function CorrelationBundleCard({ bundle }: { bundle: any }) {
  const [showDetails, setShowDetails] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [, navigate] = useLocation();

  const hypothesisMutation = trpc.pipeline.generateHypothesis.useMutation({
    onSuccess: (result: any) => {
      if (result.success) {
        toast.success("Hypothesis generated", {
          description: `Living Case #${result.caseId} created (Session #${result.sessionId})`,
        });
        navigate(`/living-cases/${result.caseId}`);
      } else {
        toast.error("Hypothesis generation failed", { description: result.error });
      }
    },
    onError: (err: any) => toast.error("Hypothesis error", { description: err.message }),
  });

  if (!bundle || !bundle.found) {
    return (
      <div className="mt-3 p-4 rounded-lg bg-white/[0.02] border border-white/[0.06] text-xs text-muted-foreground/50">
        No correlation bundle found.
      </div>
    );
  }

  const corr = bundle.correlation;
  const bd = corr?.bundleData as any;
  if (!bd) return null;

  const blastRadius = bd.blastRadius ?? {};
  const campaign = bd.campaignAssessment ?? {};
  const synthesis = bd.synthesis ?? {};
  const caseRec = bd.caseRecommendation ?? {};
  const relatedAlerts = bd.relatedAlerts ?? [];
  const discoveredEntities = bd.discoveredEntities ?? [];
  const vulnContext = bd.vulnerabilityContext ?? [];
  const fimContext = bd.fimContext ?? [];
  const threatIntel = bd.threatIntelMatches ?? [];
  const priorInvestigations = bd.priorInvestigations ?? [];

  const CASE_ACTION_LABELS: Record<string, { label: string; color: string }> = {
    merge_existing: { label: "Merge into Existing Case", color: "text-cyan-400" },
    create_new: { label: "Create New Case", color: "text-emerald-400" },
    defer_to_analyst: { label: "Defer to Analyst", color: "text-yellow-400" },
  };

  return (
    <div className="mt-3 rounded-lg bg-gradient-to-br from-violet-500/[0.04] to-cyan-500/[0.04] border border-violet-500/15 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/[0.04]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-semibold text-violet-300">Correlation Bundle</span>
            <span className="text-[10px] font-mono text-muted-foreground/40">{corr.correlationId}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
              corr.status === "completed" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" :
              corr.status === "failed" ? "text-red-400 bg-red-500/10 border-red-500/20" :
              "text-blue-400 bg-blue-500/10 border-blue-500/20"
            }`}>{corr.status}</span>
            {campaign.likelyCampaign && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/15 border border-red-500/30 text-red-400">
                Campaign Detected
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4">
        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Related Alerts</div>
          <div className="text-lg font-bold font-[Space_Grotesk] text-violet-300">{relatedAlerts.length}</div>
        </div>
        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Blast Radius</div>
          <div className="text-lg font-bold font-[Space_Grotesk] text-orange-300">
            {blastRadius.affectedHosts ?? 0} hosts / {blastRadius.affectedUsers ?? 0} users
          </div>
        </div>
        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Discovered Entities</div>
          <div className="text-lg font-bold font-[Space_Grotesk] text-cyan-300">{discoveredEntities.length}</div>
        </div>
        <div className="p-3 rounded-lg bg-white/[0.03] border border-white/[0.06]">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Confidence</div>
          <div className="text-lg font-bold font-[Space_Grotesk] text-emerald-300">
            {((corr.confidence ?? 0) * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Synthesis Narrative */}
      {synthesis.narrative && (
        <div className="px-4 pb-3">
          <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2">Synthesis</div>
            <p className="text-xs text-foreground/80 leading-relaxed">{synthesis.narrative}</p>
          </div>
        </div>
      )}

      {/* Campaign Assessment */}
      {campaign.likelyCampaign && (
        <div className="px-4 pb-3">
          <div className="p-3 rounded-lg bg-red-500/[0.04] border border-red-500/15">
            <div className="text-[10px] uppercase tracking-wider text-red-400/70 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" />
              Campaign Assessment
            </div>
            {campaign.campaignLabel && (
              <div className="text-sm font-semibold text-red-300 mb-1">{campaign.campaignLabel}</div>
            )}
            <p className="text-xs text-foreground/70">{campaign.reasoning}</p>
            {campaign.clusteredTechniques?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {campaign.clusteredTechniques.map((t: any, i: number) => (
                  <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-500/10 border border-red-500/20 text-red-300">
                    {t.techniqueId}: {t.techniqueName}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Case Recommendation */}
      <div className="px-4 pb-3">
        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2">Case Recommendation</div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${CASE_ACTION_LABELS[caseRec.action]?.color ?? "text-muted-foreground"}`}>
              {CASE_ACTION_LABELS[caseRec.action]?.label ?? caseRec.action}
            </span>
            <span className="text-[10px] text-muted-foreground/40">
              ({((caseRec.confidence ?? 0) * 100).toFixed(0)}% confidence)
            </span>
          </div>
          {caseRec.mergeTargetTitle && (
            <div className="text-xs text-muted-foreground/60 mt-1">Target: {caseRec.mergeTargetTitle}</div>
          )}
          {caseRec.reasoning && (
            <p className="text-xs text-foreground/60 mt-1">{caseRec.reasoning}</p>
          )}
        </div>
      </div>

      {/* Expandable Details */}
      <div className="px-4 pb-4">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1.5 text-xs text-violet-400/70 hover:text-violet-400 transition-colors"
        >
          {showDetails ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {showDetails ? "Hide" : "Show"} Detailed Evidence ({relatedAlerts.length} alerts, {vulnContext.length} vulns, {fimContext.length} FIM, {threatIntel.length} TI)
        </button>

        {showDetails && (
          <div className="mt-3 space-y-3">
            {/* Related Alerts */}
            {relatedAlerts.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2">Related Alerts</div>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {relatedAlerts.map((a: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                      <span className="font-mono text-violet-300/80">{a.ruleId}</span>
                      <span className="text-foreground/70 truncate flex-1">{a.ruleDescription}</span>
                      <span className="text-muted-foreground/40 font-mono text-[10px]">{a.agentId}</span>
                      <span className="text-muted-foreground/30 text-[10px]">
                        {a.timestamp ? new Date(a.timestamp).toLocaleString() : ""}
                      </span>
                      <span className="px-1 py-0.5 rounded text-[9px] bg-white/[0.04] text-muted-foreground/50">
                        {((a.relevance ?? 0) * 100).toFixed(0)}% rel
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Discovered Entities */}
            {discoveredEntities.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2">Discovered Entities</div>
                <div className="flex flex-wrap gap-1">
                  {discoveredEntities.map((e: any, i: number) => (
                    <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
                      {e.type}: {e.value}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Vulnerability Context */}
            {vulnContext.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2">Vulnerability Context</div>
                <div className="space-y-1">
                  {vulnContext.map((v: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${SEVERITY_COLORS[v.severity] ?? ""}`}>
                        {v.severity}
                      </span>
                      <span className="font-mono text-orange-300/80">{v.cveId}</span>
                      <span className="text-foreground/70 truncate flex-1">{v.name}</span>
                      {v.affectedPackage && <span className="text-muted-foreground/40 text-[10px]">{v.affectedPackage}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* FIM Context */}
            {fimContext.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2">FIM Changes</div>
                <div className="space-y-1">
                  {fimContext.map((f: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 border border-amber-500/20 text-amber-300">
                        {f.event}
                      </span>
                      <span className="font-mono text-foreground/70 truncate flex-1">{f.path}</span>
                      <span className="text-muted-foreground/30 text-[10px]">
                        {f.timestamp ? new Date(f.timestamp).toLocaleString() : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Threat Intel Matches */}
            {threatIntel.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2">Threat Intelligence</div>
                <div className="space-y-1">
                  {threatIntel.map((t: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-red-500/[0.03] border border-red-500/10">
                      <span className="font-mono text-red-300/80">{t.iocType}: {t.ioc}</span>
                      <span className="text-foreground/60 flex-1">{t.threatName ?? t.source}</span>
                      <span className="text-[10px] text-muted-foreground/40">
                        {((t.confidence ?? 0) * 100).toFixed(0)}% conf
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prior Investigations */}
            {priorInvestigations.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2">Prior Investigations</div>
                <div className="space-y-1">
                  {priorInvestigations.map((p: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-white/[0.02] border border-white/[0.04]">
                      <span className="text-violet-300">#{p.investigationId}</span>
                      <span className="text-foreground/70 flex-1">{p.title}</span>
                      <span className="text-muted-foreground/40">{p.status}</span>
                      <span className="text-[10px] text-muted-foreground/40">{p.linkReason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Blast Radius Detail */}
            {blastRadius.affectedAgentIds?.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2">Affected Agents</div>
                <div className="flex flex-wrap gap-1">
                  {blastRadius.affectedAgentIds.map((id: string, i: number) => (
                    <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-orange-500/10 border border-orange-500/20 text-orange-300">
                      {id}
                    </span>
                  ))}
                </div>
                <div className="text-[10px] text-muted-foreground/40 mt-1">
                  Asset Criticality: <span className="font-semibold">{blastRadius.assetCriticality ?? "unknown"}</span>
                </div>
              </div>
            )}

            {/* Missing Evidence / Uncertainties */}
            {synthesis.missingEvidence?.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2">Missing Evidence / Gaps</div>
                <div className="space-y-1">
                  {synthesis.missingEvidence.map((m: any, i: number) => (
                    <div key={i} className="text-xs p-2 rounded bg-yellow-500/[0.03] border border-yellow-500/10">
                      <div className="text-yellow-300/80">{m.description}</div>
                      <div className="text-muted-foreground/40 mt-0.5">Impact: {m.impact}</div>
                      {m.suggestedAction && (
                        <div className="text-violet-300/60 mt-0.5">Suggested: {m.suggestedAction}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Generate Hypothesis Button */}
        {corr.status === "completed" && (
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => hypothesisMutation.mutate({ correlationId: corr.correlationId })}
              disabled={hypothesisMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-500/15 to-cyan-500/15 border border-violet-500/25 text-violet-300 text-xs font-medium hover:from-violet-500/25 hover:to-cyan-500/25 transition-all disabled:opacity-50"
            >
              {hypothesisMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Lightbulb className="w-3 h-3" />
              )}
              Generate Hypothesis
            </button>
            {hypothesisMutation.isPending && (
              <span className="text-[10px] text-muted-foreground/40 animate-pulse">Running hypothesis agent...</span>
            )}
          </div>
        )}

        {/* Raw JSON toggle */}
        <div className="mt-3">
          <button
            onClick={() => setShowRawJson(!showRawJson)}
            className="text-[10px] uppercase tracking-wider text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
          >
            {showRawJson ? "Hide" : "Show"} Full Correlation Bundle JSON
          </button>
          {showRawJson && (
            <div className="mt-2">
              <RawJsonViewer data={bd} title="Correlation Bundle" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Triage Result Card ───────────────────────────────────────────────────────

function TriageResultCard({ triage, onRefresh, isHighlighted, highlightCorrelationId }: { triage: any; onRefresh?: () => void; isHighlighted?: boolean; highlightCorrelationId?: string | null }) {
  const cardRef = useRef<HTMLDivElement>(null);
  // Determine if this card's correlation is highlighted
  const isCorrelationHighlighted = !!(highlightCorrelationId && triage.correlationBundleId && triage.correlationBundleId === highlightCorrelationId);

  // Auto-scroll and expand when highlighted (triage or correlation)
  useEffect(() => {
    if ((isHighlighted || isCorrelationHighlighted) && cardRef.current) {
      setExpanded(true);
      if (isCorrelationHighlighted) setShowCorrelation(true);
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [isHighlighted, isCorrelationHighlighted]);
  const [expanded, setExpanded] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [overrideSeverity, setOverrideSeverity] = useState("");
  const [overrideRoute, setOverrideRoute] = useState("");
  const [showCorrelation, setShowCorrelation] = useState(false);
  const [, navigate] = useLocation();

  // Feedback mutation
  const feedbackMutation = trpc.pipeline.submitFeedback.useMutation({
    onSuccess: () => {
      toast.success("Feedback recorded", { description: "Your override has been saved for future context" });
      setShowFeedback(false);
      setFeedbackNote("");
      setOverrideSeverity("");
      setOverrideRoute("");
      onRefresh?.();
    },
    onError: (err) => toast.error("Feedback failed", { description: err.message }),
  });

  // Correlation mutation
  const correlationMutation = trpc.pipeline.correlateFromTriage.useMutation({
    onSuccess: (result: any) => {
      if (result.success) {
        toast.success("Correlation complete", { description: `Bundle ID: ${result.correlationId}` });
        setShowCorrelation(true);
        onRefresh?.();
      } else {
        toast.error("Correlation failed", { description: result.error });
      }
    },
    onError: (err: any) => toast.error("Correlation error", { description: err.message }),
  });

  // Get correlation bundle if exists
  const correlationQuery = trpc.pipeline.getCorrelationByTriageId.useQuery(
    { triageId: triage.triageId },
    { enabled: !!triage.triageId && (showCorrelation || triage.correlationBundleId != null || isCorrelationHighlighted) }
  );

  const triageData = triage.triageData as any;
  const severity = triage.severity || "info";
  const route = triage.route || "B_LOW_CONFIDENCE";
  const routeInfo = ROUTE_LABELS[route] || ROUTE_LABELS.B_LOW_CONFIDENCE;

  return (
    <GlassPanel ref={cardRef} className={`p-0 overflow-hidden transition-all duration-500 ${isHighlighted ? "ring-2 ring-violet-500/60 shadow-[0_0_20px_rgba(139,92,246,0.2)]" : ""} ${isCorrelationHighlighted ? "ring-2 ring-cyan-500/60 shadow-[0_0_20px_rgba(6,182,212,0.2)]" : ""}`}>
      {/* Header Row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 hover:bg-white/[0.02] transition-colors text-left"
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground/50 shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground/50 shrink-0" />}

        {/* Severity Badge */}
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${SEVERITY_COLORS[severity]}`}>
          {severity}
        </span>

        {/* Route Badge */}
        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${routeInfo.color}`}>
          {routeInfo.label}
        </span>

        {/* Alert Family */}
        <span className="text-xs font-mono text-violet-300/80">
          {triage.alertFamily || "unknown"}
        </span>

        {/* Rule ID */}
        <span className="text-xs font-mono text-muted-foreground/60">
          Rule {triage.ruleId}
        </span>

        {/* Agent */}
        {triage.agentName && (
          <span className="text-xs text-muted-foreground/50">
            {triage.agentName} ({triage.agentId})
          </span>
        )}

        {/* Confidence */}
        <span className="ml-auto text-xs text-muted-foreground/40">
          {Math.round((triage.severityConfidence ?? 0) * 100)}% conf
        </span>

        {/* Status */}
        <span className={`text-xs ${triage.status === "completed" ? "text-green-400" : triage.status === "failed" ? "text-red-400" : "text-yellow-400"}`}>
          {triage.status}
        </span>

        {/* Latency */}
        {triage.latencyMs && (
          <span className="text-[10px] text-muted-foreground/30 font-mono">
            {(triage.latencyMs / 1000).toFixed(1)}s
          </span>
        )}
      </button>

      {/* Expanded Details */}
      {expanded && triageData && (
        <div className="border-t border-white/[0.06] p-4 space-y-4">
          {/* Summary */}
          {triageData.summary && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Summary</div>
              <p className="text-sm text-foreground/80 leading-relaxed">{triageData.summary}</p>
            </div>
          )}

          {/* Severity Reasoning */}
          {triageData.severityReasoning && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Severity Reasoning</div>
              <p className="text-xs text-foreground/60 leading-relaxed">{triageData.severityReasoning}</p>
            </div>
          )}

          {/* Route Reasoning */}
          {triageData.routeReasoning && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Route Reasoning</div>
              <p className="text-xs text-foreground/60 leading-relaxed">{triageData.routeReasoning}</p>
            </div>
          )}

          {/* Entities */}
          {triageData.entities?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2">Extracted Entities ({triageData.entities.length})</div>
              <div className="flex flex-wrap gap-2">
                {triageData.entities.map((entity: any, i: number) => {
                  const Icon = ENTITY_ICONS[entity.type] || Info;
                  return (
                    <span key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.04] border border-white/[0.06] text-xs">
                      <Icon className="w-3 h-3 text-violet-400/60" />
                      <span className="text-muted-foreground/50 text-[10px]">{entity.type}</span>
                      <span className="font-mono text-foreground/80">{entity.value}</span>
                      <span className="text-[9px] text-muted-foreground/30">{Math.round(entity.confidence * 100)}%</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* MITRE Mapping */}
          {triageData.mitreMapping?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2">MITRE ATT&CK Mapping</div>
              <div className="flex flex-wrap gap-2">
                {triageData.mitreMapping.map((m: any, i: number) => (
                  <span key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-violet-500/10 border border-violet-500/20 text-xs">
                    <Target className="w-3 h-3 text-violet-400" />
                    <span className="font-mono text-violet-300">{m.techniqueId}</span>
                    <span className="text-muted-foreground/60">{m.techniqueName}</span>
                    <span className="text-[9px] text-muted-foreground/30">{m.tactic}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Dedup Assessment */}
          {triageData.dedup && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Deduplication</div>
              <div className="flex items-center gap-3 text-xs">
                <span className={triageData.dedup.isDuplicate ? "text-yellow-400" : "text-green-400"}>
                  {triageData.dedup.isDuplicate ? "Likely Duplicate" : "Unique Alert"}
                </span>
                <span className="text-muted-foreground/40">
                  Similarity: {Math.round((triageData.dedup.similarityScore ?? 0) * 100)}%
                </span>
                {triageData.dedup.similarTriageId && (
                  <span className="font-mono text-muted-foreground/40">
                    Similar to: {triageData.dedup.similarTriageId}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-foreground/50 mt-1">{triageData.dedup.reasoning}</p>
            </div>
          )}

          {/* Case Link */}
          {triageData.caseLink?.shouldLink && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">Case Link Suggestion</div>
              <div className="flex items-center gap-2 text-xs">
                <FileSearch className="w-3.5 h-3.5 text-violet-400" />
                {triageData.caseLink.suggestedCaseId ? (
                  <button
                    onClick={() => navigate(`/investigations`)}
                    className="text-violet-400 hover:text-violet-300 underline underline-offset-2"
                  >
                    Case #{triageData.caseLink.suggestedCaseId}: {triageData.caseLink.suggestedCaseTitle || "View Case"}
                  </button>
                ) : (
                  <span className="text-foreground/60">{triageData.caseLink.suggestedCaseTitle || "New case recommended"}</span>
                )}
                <span className="text-muted-foreground/30">
                  ({Math.round((triageData.caseLink.confidence ?? 0) * 100)}% conf)
                </span>
              </div>
              <p className="text-[11px] text-foreground/50 mt-1">{triageData.caseLink.reasoning}</p>
            </div>
          )}

          {/* Uncertainties */}
          {triageData.uncertainties?.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-2">Uncertainties</div>
              <div className="space-y-2">
                {triageData.uncertainties.map((u: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs bg-yellow-500/5 border border-yellow-500/10 rounded p-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-yellow-400/60 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-foreground/70">{u.description}</p>
                      <p className="text-muted-foreground/40 mt-0.5">Impact: {u.impact}</p>
                      {u.suggestedAction && (
                        <p className="text-violet-400/60 mt-0.5">Suggested: {u.suggestedAction}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Analyst Feedback Section ── */}
          <div className="border-t border-white/[0.04] pt-4">
            {/* Existing feedback display */}
            {triage.analystOverrideSeverity && (
              <div className="mb-3 flex items-center gap-2 text-xs bg-emerald-500/5 border border-emerald-500/15 rounded p-2">
                <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-300">Analyst Override:</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${SEVERITY_COLORS[triage.analystOverrideSeverity] || ""}`}>
                  {triage.analystOverrideSeverity}
                </span>
                {triage.analystOverrideRoute && (
                  <span className="text-muted-foreground/50">→ {ROUTE_LABELS[triage.analystOverrideRoute]?.label || triage.analystOverrideRoute}</span>
                )}
                {triage.analystFeedbackNote && (
                  <span className="text-muted-foreground/40 italic ml-2">"{triage.analystFeedbackNote}"</span>
                )}
              </div>
            )}

            {/* Feedback + Correlation Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Confirm button */}
              {!triage.analystOverrideSeverity && triage.status === "completed" && (
                <button
                  onClick={() => feedbackMutation.mutate({
                    triageId: triage.triageId,
                    confirmed: true,
                  })}
                  disabled={feedbackMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                >
                  <ThumbsUp className="w-3 h-3" />
                  Confirm Triage
                </button>
              )}

              {/* Override button */}
              {!triage.analystOverrideSeverity && triage.status === "completed" && (
                <button
                  onClick={() => setShowFeedback(!showFeedback)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs font-medium hover:bg-orange-500/20 transition-all"
                >
                  <ThumbsDown className="w-3 h-3" />
                  Override
                </button>
              )}

              {/* Run Correlation button */}
              {triage.status === "completed" && !triage.correlationBundleId && (
                <button
                  onClick={() => correlationMutation.mutate({ triageId: triage.triageId })}
                  disabled={correlationMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium hover:bg-violet-500/20 transition-all disabled:opacity-50"
                >
                  {correlationMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <GitBranch className="w-3 h-3" />
                  )}
                  Run Correlation
                </button>
              )}

              {/* View Correlation button */}
              {triage.correlationBundleId && (
                <button
                  onClick={() => setShowCorrelation(!showCorrelation)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-medium hover:bg-cyan-500/20 transition-all"
                >
                  <GitBranch className="w-3 h-3" />
                  {showCorrelation ? "Hide" : "View"} Correlation
                </button>
              )}
            </div>

            {/* Override Form */}
            {showFeedback && (
              <div className="mt-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] space-y-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50">Analyst Override</div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground/40 mb-1 block">Override Severity</label>
                    <select
                      value={overrideSeverity}
                      onChange={(e) => setOverrideSeverity(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-xs text-foreground/80 focus:outline-none focus:border-violet-500/40"
                    >
                      <option value="">Keep Original</option>
                      {["critical", "high", "medium", "low", "info"].map(s => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-muted-foreground/40 mb-1 block">Override Route</label>
                    <select
                      value={overrideRoute}
                      onChange={(e) => setOverrideRoute(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-xs text-foreground/80 focus:outline-none focus:border-violet-500/40"
                    >
                      <option value="">Keep Original</option>
                      {Object.entries(ROUTE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground/40 mb-1 block">Analyst Note</label>
                  <textarea
                    value={feedbackNote}
                    onChange={(e) => setFeedbackNote(e.target.value)}
                    placeholder="Why is this override needed? This will be used as future retrieval context..."
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1.5 text-xs text-foreground/80 focus:outline-none focus:border-violet-500/40 resize-none h-16"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => feedbackMutation.mutate({
                      triageId: triage.triageId,
                      confirmed: false,
                      severityOverride: (overrideSeverity || undefined) as any,
                      routeOverride: (overrideRoute || undefined) as any,
                      notes: feedbackNote || undefined,
                    })}
                    disabled={feedbackMutation.isPending || (!overrideSeverity && !overrideRoute)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/15 border border-orange-500/30 text-orange-300 text-xs font-medium hover:bg-orange-500/25 transition-all disabled:opacity-50"
                  >
                    {feedbackMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageSquare className="w-3 h-3" />}
                    Submit Override
                  </button>
                  <button
                    onClick={() => setShowFeedback(false)}
                    className="px-3 py-1.5 rounded-lg border border-white/10 text-muted-foreground text-xs hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Correlation Bundle Display */}
            {showCorrelation && correlationQuery.data && (
              <CorrelationBundleCard bundle={correlationQuery.data} />
            )}
            {showCorrelation && correlationQuery.isLoading && (
              <div className="mt-3 p-4 rounded-lg bg-white/[0.02] border border-white/[0.06] flex items-center gap-2 text-xs text-muted-foreground/50">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading correlation bundle...
              </div>
            )}
          </div>

          {/* Raw JSON Toggle */}
          <div>
            <button
              onClick={() => setShowRawJson(!showRawJson)}
              className="text-[10px] uppercase tracking-wider text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
            >
              {showRawJson ? "Hide" : "Show"} Full Triage Object JSON
            </button>
            {showRawJson && (
              <div className="mt-2">
                <RawJsonViewer data={triageData} title="Triage Object" />
              </div>
            )}
          </div>
        </div>
      )}
    </GlassPanel>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function TriagePipeline() {
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [routeFilter, setRouteFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  // Deep-link highlight support: /triage?highlight=<triageId>&highlightCorrelation=<correlationId>
  const highlightId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("highlight") || null;
  }, []);
  const highlightCorrelationId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("highlightCorrelation") || null;
  }, []);

  const { data, isLoading, refetch, isFetching } = trpc.pipeline.listTriages.useQuery({
    limit: pageSize,
    offset: page * pageSize,
    severity: severityFilter || undefined,
    route: routeFilter || undefined,
    status: statusFilter || undefined,
  } as any);

  const triages = data?.triages ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6 p-6 max-w-[2400px] mx-auto">
      <PageHeader
        title="Triage Pipeline"
        subtitle="Agentic SOC Pipeline — Step 1: Structured Alert Triage"
      />

      {/* Stats */}
      <TriageStatsPanel />

      {/* Filters */}
      <GlassPanel className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground/50 uppercase tracking-wider">Filters:</span>

          <select
            value={severityFilter}
            onChange={(e) => { setSeverityFilter(e.target.value); setPage(0); }}
            className="bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-xs text-foreground/80 focus:outline-none focus:border-violet-500/40"
          >
            <option value="">All Severities</option>
            {["critical", "high", "medium", "low", "info"].map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>

          <select
            value={routeFilter}
            onChange={(e) => { setRouteFilter(e.target.value); setPage(0); }}
            className="bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-xs text-foreground/80 focus:outline-none focus:border-violet-500/40"
          >
            <option value="">All Routes</option>
            {Object.entries(ROUTE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-xs text-foreground/80 focus:outline-none focus:border-violet-500/40"
          >
            <option value="">All Statuses</option>
            {["completed", "processing", "pending", "failed"].map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 text-xs transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </GlassPanel>

      {/* Triage List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <GlassPanel key={i} className="p-4 animate-pulse h-16">&nbsp;</GlassPanel>
          ))}
        </div>
      ) : triages.length === 0 ? (
        <GlassPanel className="p-12 text-center">
          <Brain className="w-12 h-12 text-violet-400/30 mx-auto mb-4" />
          <h3 className="text-lg font-[Space_Grotesk] text-foreground/60 mb-2">No Triage Objects Yet</h3>
          <p className="text-sm text-muted-foreground/40 max-w-md mx-auto">
            Triage objects are created when alerts are processed through the agentic pipeline.
            Use the "Structured Triage" button on any alert, or send alerts from the Alert Queue.
          </p>
        </GlassPanel>
      ) : (
        <div className="space-y-2">
          {triages.map((triage: any) => (
            <TriageResultCard key={triage.id} triage={triage} onRefresh={() => refetch()} isHighlighted={triage.triageId === highlightId} highlightCorrelationId={highlightCorrelationId} />
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
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 rounded bg-white/[0.04] text-xs text-foreground/60 hover:bg-white/[0.08] disabled:opacity-30 transition-colors"
            >
              Previous
            </button>
            <span className="text-xs text-muted-foreground/40">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
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
