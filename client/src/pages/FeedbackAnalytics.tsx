/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Feedback Analytics — Direction 10
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * SOC manager view into analyst feedback patterns:
 *   - Coverage rate (how many triages have analyst review)
 *   - Confirmation vs. override rates
 *   - Severity override distribution (AI → analyst corrections)
 *   - Route override patterns
 *   - Per-analyst activity breakdown
 *   - Recent feedback activity feed
 *
 * This surfaces how well the AI triage is performing and where it needs tuning.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { trpc } from "@/lib/trpc";
import { GlassPanel, StatCard } from "@/components/shared";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BarChart3,
  Users,
  MessageSquare,
  TrendingUp,
  ArrowRight,
  Shield,
  Loader2,
  RefreshCw,
  Clock,
  Target,
  Zap,
} from "lucide-react";

// ── Severity / Route Colors ──────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: "bg-red-500/15", text: "text-red-300", border: "border-red-500/30" },
  high: { bg: "bg-orange-500/15", text: "text-orange-300", border: "border-orange-500/30" },
  medium: { bg: "bg-yellow-500/15", text: "text-yellow-300", border: "border-yellow-500/30" },
  low: { bg: "bg-cyan-500/15", text: "text-cyan-300", border: "border-cyan-500/30" },
  info: { bg: "bg-violet-500/15", text: "text-violet-300", border: "border-violet-500/30" },
};

const ROUTE_LABELS: Record<string, string> = {
  A_DUPLICATE_NOISY: "Duplicate/Noisy",
  B_LOW_CONFIDENCE: "Low Confidence",
  C_HIGH_CONFIDENCE: "High Confidence",
  D_LIKELY_BENIGN: "Likely Benign",
};

// ── Main Page ─────────────────────────────────────────────────────────────

export default function FeedbackAnalytics() {
  const { data, isLoading, refetch } = trpc.pipeline.feedbackAnalytics.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Feedback Analytics"
          subtitle="AI triage accuracy metrics and analyst feedback patterns."
        />
        <GlassPanel className="p-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-violet-400 animate-spin mr-2" />
          <span className="text-sm text-muted-foreground/50">Loading analytics...</span>
        </GlassPanel>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Feedback Analytics"
          subtitle="AI triage accuracy metrics and analyst feedback patterns."
        />
        <GlassPanel className="p-8 text-center">
          <BarChart3 className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground/40">No analytics data available.</p>
          <p className="text-xs text-muted-foreground/25 mt-1">
            Submit feedback on triage results to start building analytics.
          </p>
        </GlassPanel>
      </div>
    );
  }

  const { coverage, severityOverrides, routeOverrides, bySeverity, byAnalyst, recentFeedback } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feedback Analytics"
        subtitle="AI triage accuracy metrics and analyst feedback patterns — Direction 10."
      />

      {/* ── Coverage Stats Row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <StatCard label="Total Triages" value={coverage.total} icon={Target} />
        <StatCard label="With Feedback" value={coverage.withFeedback} icon={MessageSquare} />
        <StatCard
          label="Coverage Rate"
          value={`${coverage.coverageRate.toFixed(1)}%`}
          icon={TrendingUp}
        />
        <StatCard label="Confirmed" value={coverage.confirmed} icon={CheckCircle2} />
        <StatCard
          label="Confirmation Rate"
          value={`${coverage.confirmationRate.toFixed(1)}%`}
          icon={Shield}
        />
        <StatCard label="Severity Overrides" value={coverage.severityOverridden} icon={AlertTriangle} />
        <StatCard label="Route Overrides" value={coverage.routeOverridden} icon={Zap} />
        <StatCard label="With Notes" value={coverage.withNotes} icon={MessageSquare} />
      </div>

      {/* ── Two-Column: Severity Accuracy + Route Accuracy ──────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Severity Accuracy by Level */}
        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-foreground/80 font-[Space_Grotesk]">
              AI Accuracy by Severity
            </h3>
            <button
              onClick={() => refetch()}
              className="ml-auto p-1 rounded hover:bg-white/[0.06] text-muted-foreground/30 hover:text-foreground/60 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          {bySeverity.length === 0 ? (
            <p className="text-xs text-muted-foreground/30 text-center py-4">No data yet.</p>
          ) : (
            <div className="space-y-3">
              {bySeverity.map((row: any) => {
                const colors = SEVERITY_COLORS[row.severity] ?? SEVERITY_COLORS.info;
                const confirmRate = row.total > 0 ? ((row.confirmed ?? 0) / row.total) * 100 : 0;
                const overrideRate = row.total > 0 ? ((row.overridden ?? 0) / row.total) * 100 : 0;
                const pendingRate = row.total > 0 ? ((row.pending ?? 0) / row.total) * 100 : 0;

                return (
                  <div key={row.severity} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-semibold capitalize ${colors.text}`}>
                        {row.severity}
                      </span>
                      <span className="text-[10px] text-muted-foreground/40">
                        {row.total} triages
                      </span>
                    </div>
                    {/* Stacked bar */}
                    <div className="h-3 rounded-full bg-white/[0.04] overflow-hidden flex">
                      {confirmRate > 0 && (
                        <div
                          className="h-full bg-emerald-500/60 transition-all"
                          style={{ width: `${confirmRate}%` }}
                          title={`Confirmed: ${confirmRate.toFixed(1)}%`}
                        />
                      )}
                      {overrideRate > 0 && (
                        <div
                          className="h-full bg-amber-500/60 transition-all"
                          style={{ width: `${overrideRate}%` }}
                          title={`Overridden: ${overrideRate.toFixed(1)}%`}
                        />
                      )}
                      {pendingRate > 0 && (
                        <div
                          className="h-full bg-white/[0.06] transition-all"
                          style={{ width: `${pendingRate}%` }}
                          title={`Pending: ${pendingRate.toFixed(1)}%`}
                        />
                      )}
                    </div>
                    <div className="flex gap-4 text-[9px] text-muted-foreground/40">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-emerald-500/60" />
                        Confirmed {confirmRate.toFixed(0)}%
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber-500/60" />
                        Overridden {overrideRate.toFixed(0)}%
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-white/[0.15]" />
                        Pending {pendingRate.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassPanel>

        {/* Severity Override Flow */}
        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-foreground/80 font-[Space_Grotesk]">
              Severity Override Flow
            </h3>
          </div>

          {severityOverrides.length === 0 ? (
            <p className="text-xs text-muted-foreground/30 text-center py-4">No severity overrides yet.</p>
          ) : (
            <div className="space-y-2">
              {severityOverrides.map((row: any, i: number) => {
                const fromColors = SEVERITY_COLORS[row.aiSeverity] ?? SEVERITY_COLORS.info;
                const toColors = SEVERITY_COLORS[row.analystSeverity] ?? SEVERITY_COLORS.info;

                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]"
                  >
                    <span className={`text-[10px] px-2 py-0.5 rounded ${fromColors.bg} ${fromColors.text} ${fromColors.border} border capitalize`}>
                      {row.aiSeverity}
                    </span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                    <span className={`text-[10px] px-2 py-0.5 rounded ${toColors.bg} ${toColors.text} ${toColors.border} border capitalize`}>
                      {row.analystSeverity}
                    </span>
                    <span className="ml-auto text-[10px] font-mono text-muted-foreground/50">
                      ×{row.count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </GlassPanel>
      </div>

      {/* ── Route Override Patterns ─────────────────────────────────── */}
      {routeOverrides.length > 0 && (
        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-foreground/80 font-[Space_Grotesk]">
              Route Override Patterns
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {routeOverrides.map((row: any, i: number) => (
              <div
                key={i}
                className="flex items-center gap-2 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]"
              >
                <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.06] border border-white/[0.08] text-muted-foreground/60">
                  {ROUTE_LABELS[row.aiRoute] ?? row.aiRoute}
                </span>
                <ArrowRight className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                <span className="text-[10px] px-2 py-0.5 rounded bg-violet-500/10 border border-violet-500/20 text-violet-300">
                  {ROUTE_LABELS[row.analystRoute] ?? row.analystRoute}
                </span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground/50">
                  ×{row.count}
                </span>
              </div>
            ))}
          </div>
        </GlassPanel>
      )}

      {/* ── Per-Analyst Activity ────────────────────────────────────── */}
      {byAnalyst.length > 0 && (
        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-foreground/80 font-[Space_Grotesk]">
              Per-Analyst Activity
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left py-2 px-3 text-muted-foreground/40 font-normal">Analyst</th>
                  <th className="text-right py-2 px-3 text-muted-foreground/40 font-normal">Reviews</th>
                  <th className="text-right py-2 px-3 text-muted-foreground/40 font-normal">Confirmed</th>
                  <th className="text-right py-2 px-3 text-muted-foreground/40 font-normal">Sev. Overrides</th>
                  <th className="text-right py-2 px-3 text-muted-foreground/40 font-normal">Route Overrides</th>
                  <th className="text-right py-2 px-3 text-muted-foreground/40 font-normal">Notes</th>
                  <th className="text-right py-2 px-3 text-muted-foreground/40 font-normal">Confirm Rate</th>
                </tr>
              </thead>
              <tbody>
                {byAnalyst.map((row: any) => {
                  const confirmRate = row.feedbackCount > 0
                    ? ((row.confirmations ?? 0) / row.feedbackCount * 100).toFixed(1)
                    : "—";
                  return (
                    <tr key={row.analystUserId} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                      <td className="py-2 px-3 font-mono text-foreground/60">
                        User #{row.analystUserId ?? "?"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-foreground/70">{row.feedbackCount}</td>
                      <td className="py-2 px-3 text-right font-mono text-emerald-300/70">{row.confirmations ?? 0}</td>
                      <td className="py-2 px-3 text-right font-mono text-amber-300/70">{row.severityOverrides ?? 0}</td>
                      <td className="py-2 px-3 text-right font-mono text-cyan-300/70">{row.routeOverrides ?? 0}</td>
                      <td className="py-2 px-3 text-right font-mono text-violet-300/70">{row.notesWritten ?? 0}</td>
                      <td className="py-2 px-3 text-right">
                        <span className={`font-mono ${
                          Number(confirmRate) >= 80 ? "text-emerald-300" :
                          Number(confirmRate) >= 50 ? "text-yellow-300" :
                          "text-red-300"
                        }`}>
                          {confirmRate}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassPanel>
      )}

      {/* ── Recent Feedback Activity ───────────────────────────────── */}
      <GlassPanel className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-foreground/80 font-[Space_Grotesk]">
            Recent Feedback Activity
          </h3>
        </div>

        {recentFeedback.length === 0 ? (
          <p className="text-xs text-muted-foreground/30 text-center py-4">No feedback submitted yet.</p>
        ) : (
          <div className="space-y-2">
            {recentFeedback.map((fb: any) => {
              const confirmed = fb.analystConfirmed === 1;
              const hasOverride = fb.analystSeverityOverride || fb.analystRouteOverride;
              const aiColors = SEVERITY_COLORS[fb.aiSeverity] ?? SEVERITY_COLORS.info;

              return (
                <div
                  key={fb.triageId}
                  className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.08] transition-colors"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Status icon */}
                    {confirmed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : hasOverride ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    )}

                    {/* Triage ID */}
                    <span className="text-[10px] font-mono text-foreground/60 truncate max-w-[160px]">
                      {fb.triageId}
                    </span>

                    {/* AI severity badge */}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${aiColors.bg} ${aiColors.text} ${aiColors.border} border capitalize`}>
                      AI: {fb.aiSeverity}
                    </span>

                    {/* Severity override */}
                    {fb.analystSeverityOverride && (
                      <>
                        <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/20" />
                        <span className={`text-[9px] px-1.5 py-0.5 rounded capitalize ${
                          (SEVERITY_COLORS[fb.analystSeverityOverride] ?? SEVERITY_COLORS.info).bg
                        } ${
                          (SEVERITY_COLORS[fb.analystSeverityOverride] ?? SEVERITY_COLORS.info).text
                        } border ${
                          (SEVERITY_COLORS[fb.analystSeverityOverride] ?? SEVERITY_COLORS.info).border
                        }`}>
                          → {fb.analystSeverityOverride}
                        </span>
                      </>
                    )}

                    {/* Route override */}
                    {fb.analystRouteOverride && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/20 text-violet-300">
                        Route → {ROUTE_LABELS[fb.analystRouteOverride] ?? fb.analystRouteOverride}
                      </span>
                    )}

                    {/* Rule info */}
                    {fb.ruleId && (
                      <span className="text-[9px] text-muted-foreground/30 font-mono ml-auto">
                        Rule {fb.ruleId}
                      </span>
                    )}

                    {/* Timestamp */}
                    <span className="text-[9px] text-muted-foreground/25">
                      {fb.feedbackAt ? new Date(fb.feedbackAt).toLocaleString() : "—"}
                    </span>
                  </div>

                  {/* Notes */}
                  {fb.analystNotes && (
                    <div className="mt-1.5 pl-5">
                      <p className="text-[10px] text-muted-foreground/40 italic line-clamp-2">
                        "{fb.analystNotes}"
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
