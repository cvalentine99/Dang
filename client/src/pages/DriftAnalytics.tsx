/**
 * Drift Analytics Dashboard — Visualizes configuration drift trends over time.
 *
 * Panels:
 * 1. KPI row: total snapshots, avg drift, max drift, notification count
 * 2. Drift trend line chart (drift % over time, per schedule)
 * 3. Category breakdown stacked bar chart (packages/services/users)
 * 4. Agent volatility heatmap (agent × time → drift intensity)
 * 5. Schedule comparison cards
 * 6. Top drifting agents ranked table
 * 7. Recent drift events feed
 * 8. Drift snapshot detail panel
 */

import { useState, useMemo, useCallback, lazy, Suspense } from "react";
import { LazyTabFallback } from "@/components/shared/LazyTabFallback";
import { trpc } from "@/lib/trpc";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  BellOff,
  Calendar,
  ChevronDown,
  ChevronRight,
  Clock,
  Filter,
  GitCompare,
  Layers,
  Package,
  Server,
  Shield,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
  Eye,
  X,
  TriangleAlert,
  CheckCircle2,
  Sigma,
  Download,
  FileText,
  History,
  ShieldOff,
} from "lucide-react";

// Lazy-loaded tab sub-components — only loaded when the tab is first activated
const NotificationHistoryTab = lazy(() => import("./drift-analytics/NotificationHistoryTab").then(m => ({ default: m.NotificationHistoryTab })));
const SuppressionRulesTab = lazy(() => import("./drift-analytics/SuppressionRulesTab").then(m => ({ default: m.SuppressionRulesTab })));

import {
  GlassPanel,
  KpiCard,
  ChartTooltip,
  HeatmapGrid,
  AnomalyDetailPanel,
  SnapshotDetailPanel,
  PURPLE,
  PURPLE_DIM,
  VIOLET,
  CYAN,
  AMBER,
  RED,
  GREEN,
  MUTED,
  CARD_BG,
  BORDER,
  SCHEDULE_COLORS,
  CATEGORY_COLORS,
  CHANGE_COLORS,
  TIME_RANGES,
  formatDate,
  formatDateTime,
  formatPct,
} from "./drift-analytics";

// ─── Main Component ─────────────────────────────────────────────────────────
export default function DriftAnalytics() {
  const [days, setDays] = useState(30);
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | undefined>(undefined);
  const [detailSnapshotId, setDetailSnapshotId] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [anomalyFilter, setAnomalyFilter] = useState<"all" | "critical" | "high" | "medium">("all");
  const [showAcknowledged, setShowAcknowledged] = useState(false);

  // ─── Queries ────────────────────────────────────────────────────────────
  const trendQuery = trpc.driftAnalytics.trend.useQuery(
    { days, scheduleId: selectedScheduleId, limit: 300 },
    { refetchOnWindowFocus: false }
  );

  const volatilityQuery = trpc.driftAnalytics.agentVolatility.useQuery(
    { days, scheduleId: selectedScheduleId },
    { refetchOnWindowFocus: false }
  );

  const categoryQuery = trpc.driftAnalytics.categoryBreakdown.useQuery(
    { days, scheduleId: selectedScheduleId },
    { refetchOnWindowFocus: false }
  );

  const summaryQuery = trpc.driftAnalytics.scheduleSummary.useQuery(
    { days },
    { refetchOnWindowFocus: false }
  );

  const recentQuery = trpc.driftAnalytics.recentEvents.useQuery(
    { limit: 20, scheduleId: selectedScheduleId },
    { refetchOnWindowFocus: false }
  );

  const heatmapQuery = trpc.driftAnalytics.agentHeatmap.useQuery(
    { days: Math.min(days, 90), scheduleId: selectedScheduleId, bucketHours: days <= 7 ? 6 : 24 },
    { refetchOnWindowFocus: false }
  );

  const detailQuery = trpc.driftAnalytics.detail.useQuery(
    { id: detailSnapshotId! },
    { enabled: detailSnapshotId !== null, refetchOnWindowFocus: false }
  );

  // ── Anomaly queries ────────────────────────────────────────────────────
  const anomalyStatsQ = trpc.anomalies.stats.useQuery(
    { days },
    { refetchOnWindowFocus: false }
  );
  const anomalyListQ = trpc.anomalies.list.useQuery(
    {
      days,
      scheduleId: selectedScheduleId,
      severity: anomalyFilter === "all" ? undefined : anomalyFilter,
      acknowledged: showAcknowledged ? undefined : false,
      limit: 50,
    },
    { refetchOnWindowFocus: false }
  );
  const ackMutation = trpc.anomalies.acknowledge.useMutation({
    onSuccess: () => {
      anomalyStatsQ.refetch();
      anomalyListQ.refetch();
    },
  });
  const ackAllMutation = trpc.anomalies.acknowledgeAll.useMutation({
    onSuccess: () => {
      anomalyStatsQ.refetch();
      anomalyListQ.refetch();
    },
  });
  const [selectedAnomalyId, setSelectedAnomalyId] = useState<number | null>(null);
  const anomalyDetailQ = trpc.anomalies.detail.useQuery(
    { id: selectedAnomalyId! },
    { enabled: selectedAnomalyId !== null, refetchOnWindowFocus: false }
  );

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"analytics" | "notifications" | "suppression">("analytics");

  // ── Notification History queries ───────────────────────────────────────────
  const notifHistoryQ = trpc.notificationHistory.list.useQuery(
    { days, limit: 100 },
    { enabled: activeTab === "notifications", refetchOnWindowFocus: false }
  );
  const notifStatsQ = trpc.notificationHistory.stats.useQuery(
    { days },
    { enabled: activeTab === "notifications", refetchOnWindowFocus: false }
  );
  const retryMutation = trpc.notificationHistory.retry.useMutation({
    onSuccess: () => { notifHistoryQ.refetch(); notifStatsQ.refetch(); },
  });

  // ── Suppression Rules queries ─────────────────────────────────────────────
  const suppressionListQ = trpc.suppression.list.useQuery(
    undefined,
    { enabled: activeTab === "suppression", refetchOnWindowFocus: false }
  );
  const createSuppressionMut = trpc.suppression.create.useMutation({
    onSuccess: () => { suppressionListQ.refetch(); },
  });
  const deactivateSuppressionMut = trpc.suppression.deactivate.useMutation({
    onSuccess: () => suppressionListQ.refetch(),
  });
  const deleteSuppressionMut = trpc.suppression.delete.useMutation({
    onSuccess: () => suppressionListQ.refetch(),
  });

  // ── Export queries (lazy) ─────────────────────────────────────────────────
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportingType, setExportingType] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const downloadCsv = useCallback((csv: string, filename: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setExportingType(null);
    setShowExportMenu(false);
  }, []);

  // ─── Derived data ──────────────────────────────────────────────────────
  const trendData = useMemo(() => {
    if (!trendQuery.data?.points.length) return [];
    const points = trendQuery.data.points;

    const schedNames = Array.from(new Set(points.map((p) => p.scheduleName)));

    if (schedNames.length <= 1) {
      return points.map((p) => ({
        time: formatDate(p.timestamp),
        timestamp: p.timestamp,
        drift: p.driftPercent,
        scheduleName: p.scheduleName,
      }));
    }

    const byTime: Record<number, Record<string, number>> = {};
    for (const p of points) {
      if (!byTime[p.timestamp]) byTime[p.timestamp] = {};
      byTime[p.timestamp][p.scheduleName] = p.driftPercent;
    }

    return Object.entries(byTime)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([ts, vals]) => ({
        time: formatDate(Number(ts)),
        timestamp: Number(ts),
        ...vals,
      }));
  }, [trendQuery.data]);

  const scheduleNames = useMemo(() => {
    if (!trendQuery.data?.points.length) return [];
    return Array.from(new Set(trendQuery.data.points.map((p) => p.scheduleName)));
  }, [trendQuery.data]);

  const categoryData = useMemo(() => {
    if (!categoryQuery.data) return [];
    const { totals } = categoryQuery.data;
    return [
      {
        category: "Packages",
        added: totals.packages.added,
        removed: totals.packages.removed,
        changed: totals.packages.changed,
        total: totals.packages.added + totals.packages.removed + totals.packages.changed,
      },
      {
        category: "Services",
        added: totals.services.added,
        removed: totals.services.removed,
        changed: totals.services.changed,
        total: totals.services.added + totals.services.removed + totals.services.changed,
      },
      {
        category: "Users",
        added: totals.users.added,
        removed: totals.users.removed,
        changed: totals.users.changed,
        total: totals.users.added + totals.users.removed + totals.users.changed,
      },
    ];
  }, [categoryQuery.data]);

  const kpis = useMemo(() => {
    const schedules = summaryQuery.data?.schedules || [];
    const totalCaptures = schedules.reduce((s, x) => s + x.captureCount, 0);
    const allDrifts = schedules.filter((s) => s.captureCount > 0);
    const avgDrift = allDrifts.length > 0
      ? Math.round((allDrifts.reduce((s, x) => s + x.avgDrift, 0) / allDrifts.length) * 100) / 100
      : 0;
    const maxDrift = allDrifts.length > 0 ? Math.max(...allDrifts.map((s) => s.maxDrift)) : 0;
    const totalNotifications = schedules.reduce((s, x) => s + x.notificationCount, 0);
    return { totalCaptures, avgDrift, maxDrift, totalNotifications, scheduleCount: schedules.length };
  }, [summaryQuery.data]);

  // ─── Render ────────────────────────────────────────────────────────────
  const isLoading = trendQuery.isLoading || volatilityQuery.isLoading || categoryQuery.isLoading || summaryQuery.isLoading;

  return (
    <div className="min-h-screen p-6" style={{ color: "oklch(0.93 0.005 286)" }}>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <GitCompare className="h-6 w-6" style={{ color: PURPLE }} />
            Drift Analytics
          </h1>
          <p className="mt-1 text-sm" style={{ color: MUTED }}>
            Configuration drift trends, agent volatility, and category breakdowns
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Time range selector */}
          <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: BORDER }}>
            {TIME_RANGES.map((tr) => (
              <button
                key={tr.days}
                onClick={() => setDays(tr.days)}
                className="px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: days === tr.days ? PURPLE : "transparent",
                  color: days === tr.days ? "oklch(0.98 0.005 285)" : MUTED,
                }}
              >
                {tr.label}
              </button>
            ))}
          </div>

          {/* Schedule filter */}
          <div className="relative">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors hover:bg-white/5"
              style={{ borderColor: BORDER, color: selectedScheduleId ? CYAN : MUTED }}
            >
              <Filter className="h-3.5 w-3.5" />
              {selectedScheduleId
                ? summaryQuery.data?.schedules.find((s) => s.id === selectedScheduleId)?.name || "Selected"
                : "All Schedules"}
              <ChevronDown className="h-3 w-3" />
            </button>

            {showFilters && (
              <div
                className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border p-2 shadow-xl backdrop-blur-md"
                style={{ background: CARD_BG, borderColor: BORDER }}
              >
                <button
                  onClick={() => { setSelectedScheduleId(undefined); setShowFilters(false); }}
                  className="w-full rounded px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/5"
                  style={{ color: !selectedScheduleId ? CYAN : "oklch(0.85 0.01 286)" }}
                >
                  All Schedules
                </button>
                {(summaryQuery.data?.schedules || []).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setSelectedScheduleId(s.id); setShowFilters(false); }}
                    className="w-full rounded px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/5"
                    style={{ color: selectedScheduleId === s.id ? CYAN : "oklch(0.85 0.01 286)" }}
                  >
                    {s.name}
                    <span className="ml-2 font-mono" style={{ color: MUTED }}>({s.captureCount} captures)</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Export button */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors hover:bg-white/5"
              style={{ borderColor: BORDER, color: MUTED }}
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
            {showExportMenu && (
              <div
                className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border p-1.5 shadow-xl backdrop-blur-md"
                style={{ background: CARD_BG, borderColor: BORDER }}
              >
                {[
                  { key: "drift", label: "Drift Trend CSV", icon: TrendingUp },
                  { key: "anomaly", label: "Anomaly History CSV", icon: TriangleAlert },
                  { key: "volatility", label: "Agent Volatility CSV", icon: Server },
                  { key: "notifications", label: "Notification Log CSV", icon: Bell },
                ].map((item) => (
                  <button
                    key={item.key}
                    disabled={exportingType !== null}
                    onClick={async () => {
                      setExportingType(item.key);
                      try {
                        if (item.key === "drift") {
                          const res = await utils.export.driftTrend.fetch({ days, scheduleId: selectedScheduleId });
                          downloadCsv(res.csv, res.filename);
                        } else if (item.key === "anomaly") {
                          const res = await utils.export.anomalyHistory.fetch({ days, scheduleId: selectedScheduleId });
                          downloadCsv(res.csv, res.filename);
                        } else if (item.key === "volatility") {
                          const res = await utils.export.agentVolatility.fetch({ days });
                          downloadCsv(res.csv, res.filename);
                        } else if (item.key === "notifications") {
                          const res = await utils.export.notificationHistory.fetch({ days });
                          downloadCsv(res.csv, res.filename);
                        }
                      } catch { setExportingType(null); }
                    }}
                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs transition-colors hover:bg-white/5"
                    style={{ color: exportingType === item.key ? CYAN : "oklch(0.85 0.01 286)" }}
                  >
                    <item.icon className="h-3.5 w-3.5" style={{ color: MUTED }} />
                    {exportingType === item.key ? "Exporting..." : item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="mb-6 flex items-center gap-1 rounded-lg border p-1" style={{ borderColor: BORDER, background: CARD_BG }}>
        {([
          { key: "analytics" as const, label: "Analytics", icon: BarChart3 },
          { key: "notifications" as const, label: "Notification History", icon: History },
          { key: "suppression" as const, label: "Suppression Rules", icon: ShieldOff },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-2 rounded-md px-4 py-2 text-xs font-medium transition-colors"
            style={{
              background: activeTab === tab.key ? `${PURPLE}30` : "transparent",
              color: activeTab === tab.key ? "oklch(0.93 0.005 286)" : MUTED,
            }}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════ ANALYTICS TAB ═══════════════════ */}
      {activeTab === "analytics" && (
      <>
      {/* KPI Row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard icon={Layers} label="Drift Snapshots" value={kpis.totalCaptures} sub={`${kpis.scheduleCount} schedules`} color={PURPLE} />
        <KpiCard icon={Activity} label="Avg Drift" value={formatPct(kpis.avgDrift)} sub="across all schedules" color={CYAN} />
        <KpiCard icon={TrendingUp} label="Max Drift" value={formatPct(kpis.maxDrift)} sub="peak observed" color={kpis.maxDrift > 50 ? RED : AMBER} />
        <KpiCard icon={Bell} label="Notifications" value={kpis.totalNotifications} sub="threshold alerts sent" color={VIOLET} />
        <KpiCard icon={Server} label="Agents Tracked" value={volatilityQuery.data?.agents.length ?? 0} sub="unique agents" color={GREEN} />
      </div>

      {/* ── Anomaly Detection Panel ──────────────────────────────────── */}
      {anomalyStatsQ.data && anomalyStatsQ.data.total > 0 && (
        <GlassPanel
          title="Drift Anomaly Detection"
          icon={TriangleAlert}
          className="mb-6"
          action={
            <div className="flex items-center gap-2">
              {/* Severity filter */}
              <div className="flex rounded-md border overflow-hidden" style={{ borderColor: BORDER }}>
                {(["all", "critical", "high", "medium"] as const).map((sev) => (
                  <button
                    key={sev}
                    onClick={() => setAnomalyFilter(sev)}
                    className="px-2 py-1 text-[10px] font-medium transition-colors capitalize"
                    style={{
                      background: anomalyFilter === sev ? (sev === "critical" ? `${RED}40` : sev === "high" ? "oklch(0.705 0.191 22.216 / 40%)" : sev === "medium" ? `${AMBER}40` : `${PURPLE}40`) : "transparent",
                      color: anomalyFilter === sev ? "oklch(0.95 0 0)" : MUTED,
                    }}
                  >
                    {sev}
                  </button>
                ))}
              </div>
              {/* Toggle acknowledged */}
              <button
                onClick={() => setShowAcknowledged(!showAcknowledged)}
                className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition-colors"
                style={{
                  borderColor: BORDER,
                  color: showAcknowledged ? CYAN : MUTED,
                  background: showAcknowledged ? `${CYAN}15` : "transparent",
                }}
              >
                <CheckCircle2 className="h-3 w-3" />
                {showAcknowledged ? "All" : "Unacked"}
              </button>
              {/* Bulk acknowledge */}
              {anomalyStatsQ.data.unacknowledged > 0 && (
                <button
                  onClick={() => ackAllMutation.mutate({ scheduleId: selectedScheduleId })}
                  className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] transition-colors hover:bg-white/5"
                  style={{ borderColor: BORDER, color: MUTED }}
                  disabled={ackAllMutation.isPending}
                >
                  Ack All
                </button>
              )}
            </div>
          }
        >
          <div className="px-5 pb-5">
            {/* Anomaly KPI strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg border px-3 py-2 text-center" style={{ borderColor: BORDER }}>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>Total</div>
                <div className="font-display text-xl font-bold" style={{ color: "oklch(0.93 0.005 286)" }}>{anomalyStatsQ.data.total}</div>
              </div>
              <div className="rounded-lg border px-3 py-2 text-center" style={{ borderColor: `${RED}40` }}>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: RED }}>Critical</div>
                <div className="font-display text-xl font-bold" style={{ color: RED }}>{anomalyStatsQ.data.critical}</div>
              </div>
              <div className="rounded-lg border px-3 py-2 text-center" style={{ borderColor: "oklch(0.705 0.191 22.216 / 40%)" }}>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: "oklch(0.705 0.191 22.216)" }}>High</div>
                <div className="font-display text-xl font-bold" style={{ color: "oklch(0.705 0.191 22.216)" }}>{anomalyStatsQ.data.high}</div>
              </div>
              <div className="rounded-lg border px-3 py-2 text-center" style={{ borderColor: `${AMBER}40` }}>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: AMBER }}>Medium</div>
                <div className="font-display text-xl font-bold" style={{ color: AMBER }}>{anomalyStatsQ.data.medium}</div>
              </div>
            </div>

            {/* Anomaly list table */}
            {anomalyListQ.isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: PURPLE }} />
              </div>
            ) : (anomalyListQ.data?.anomalies.length ?? 0) === 0 ? (
              <div className="flex h-24 items-center justify-center text-sm" style={{ color: MUTED }}>
                No anomalies match the current filters
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ color: MUTED }}>
                      <th className="pb-2 text-left font-medium">Time</th>
                      <th className="pb-2 text-left font-medium">Schedule</th>
                      <th className="pb-2 text-left font-medium">Severity</th>
                      <th className="pb-2 text-right font-medium">Drift %</th>
                      <th className="pb-2 text-right font-medium">Z-Score</th>
                      <th className="pb-2 text-right font-medium">Rolling Avg</th>
                      <th className="pb-2 text-right font-medium">σ Threshold</th>
                      <th className="pb-2 text-center font-medium">Status</th>
                      <th className="pb-2 text-center font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalyListQ.data!.anomalies.map((a) => {
                      const sevColor = a.severity === "critical" ? RED : a.severity === "high" ? "oklch(0.705 0.191 22.216)" : AMBER;
                      return (
                        <tr
                          key={a.id}
                          className="border-t transition-colors hover:bg-white/3 cursor-pointer"
                          style={{ borderColor: "oklch(0.25 0.02 286 / 30%)" }}
                          onClick={() => setSelectedAnomalyId(a.id)}
                        >
                          <td className="py-2 pr-3 font-mono" style={{ color: MUTED }}>
                            {formatDateTime(a.timestamp)}
                          </td>
                          <td className="py-2 pr-3" style={{ color: "oklch(0.85 0.01 286)" }}>
                            {a.scheduleName || `Schedule #${a.scheduleId}`}
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                              style={{ background: `${sevColor}20`, color: sevColor }}
                            >
                              {a.severity}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-right font-mono font-semibold" style={{ color: sevColor }}>
                            {formatPct(a.driftPercent)}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono" style={{ color: "oklch(0.85 0.01 286)" }}>
                            {a.zScore.toFixed(2)}σ
                          </td>
                          <td className="py-2 pr-3 text-right font-mono" style={{ color: MUTED }}>
                            {a.rollingAvg.toFixed(2)}% ± {a.rollingStdDev.toFixed(2)}%
                          </td>
                          <td className="py-2 pr-3 text-right font-mono" style={{ color: MUTED }}>
                            {a.sigmaThreshold}σ
                          </td>
                          <td className="py-2 text-center">
                            {a.acknowledged ? (
                              <CheckCircle2 className="mx-auto h-3.5 w-3.5" style={{ color: GREEN }} />
                            ) : (
                              <span className="inline-flex h-2 w-2 rounded-full animate-pulse" style={{ background: sevColor }} />
                            )}
                          </td>
                          <td className="py-2 text-center">
                            {!a.acknowledged && (
                              <button
                                onClick={(e) => { e.stopPropagation(); ackMutation.mutate({ id: a.id }); }}
                                className="rounded p-1 transition-colors hover:bg-white/10"
                                title="Acknowledge"
                                disabled={ackMutation.isPending}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" style={{ color: PURPLE }} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {(anomalyListQ.data?.total ?? 0) > 50 && (
                  <div className="mt-2 text-center text-[10px]" style={{ color: MUTED }}>
                    Showing 50 of {anomalyListQ.data?.total} anomalies
                  </div>
                )}
              </div>
            )}
          </div>
        </GlassPanel>
      )}

      {/* Empty state */}
      {!isLoading && kpis.totalCaptures === 0 && (
        <GlassPanel className="mb-6">
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <GitCompare className="mb-4 h-12 w-12" style={{ color: PURPLE_DIM }} />
            <h3 className="font-display text-lg font-semibold mb-2">No Drift Data Yet</h3>
            <p className="max-w-md text-sm" style={{ color: MUTED }}>
              Drift analytics are populated automatically when baseline schedules capture consecutive snapshots.
              Create a schedule in IT Hygiene → Drift Comparison → Schedules, then trigger at least two captures.
            </p>
          </div>
        </GlassPanel>
      )}

      {/* Main grid */}
      {(kpis.totalCaptures > 0 || isLoading) && (
        <div className="grid gap-5 xl:grid-cols-3">
          {/* ── Drift Trend (spans 2 cols) ──────────────────────────────── */}
          <GlassPanel className="xl:col-span-2" title="Drift Trend Over Time" icon={TrendingUp}>
            <div className="px-5 pb-5">
              {trendQuery.isLoading ? (
                <div className="flex h-64 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: PURPLE }} />
                </div>
              ) : trendData.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm" style={{ color: MUTED }}>
                  No trend data in the selected range
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={trendData}>
                    <defs>
                      {scheduleNames.map((name, i) => (
                        <linearGradient key={name} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={SCHEDULE_COLORS[i % SCHEDULE_COLORS.length]} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={SCHEDULE_COLORS[i % SCHEDULE_COLORS.length]} stopOpacity={0} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 286 / 30%)" />
                    <XAxis dataKey="time" tick={{ fill: MUTED, fontSize: 11 }} />
                    <YAxis
                      tick={{ fill: MUTED, fontSize: 11 }}
                      tickFormatter={(v) => `${v}%`}
                      domain={[0, "auto"]}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    {scheduleNames.length <= 1 ? (
                      <Area
                        type="monotone"
                        dataKey="drift"
                        name={scheduleNames[0] || "Drift"}
                        stroke={PURPLE}
                        fill={`url(#grad-0)`}
                        strokeWidth={2}
                        dot={{ r: 3, fill: PURPLE }}
                        activeDot={{ r: 5, fill: PURPLE }}
                      />
                    ) : (
                      scheduleNames.map((name, i) => (
                        <Area
                          key={name}
                          type="monotone"
                          dataKey={name}
                          name={name}
                          stroke={SCHEDULE_COLORS[i % SCHEDULE_COLORS.length]}
                          fill={`url(#grad-${i})`}
                          strokeWidth={2}
                          dot={{ r: 2, fill: SCHEDULE_COLORS[i % SCHEDULE_COLORS.length] }}
                        />
                      ))
                    )}
                    {scheduleNames.length > 1 && (
                      <Legend
                        wrapperStyle={{ fontSize: 11, color: MUTED }}
                        iconType="circle"
                        iconSize={8}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </GlassPanel>

          {/* ── Category Breakdown ──────────────────────────────────────── */}
          <GlassPanel title="Category Breakdown" icon={Package}>
            <div className="px-5 pb-5">
              {categoryQuery.isLoading ? (
                <div className="flex h-64 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: PURPLE }} />
                </div>
              ) : categoryData.every((c) => c.total === 0) ? (
                <div className="flex h-64 items-center justify-center text-sm" style={{ color: MUTED }}>
                  No category data available
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={categoryData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 286 / 30%)" />
                      <XAxis type="number" tick={{ fill: MUTED, fontSize: 11 }} />
                      <YAxis type="category" dataKey="category" tick={{ fill: MUTED, fontSize: 11 }} width={80} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="added" stackId="a" fill={CHANGE_COLORS.added} name="Added" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="changed" stackId="a" fill={CHANGE_COLORS.changed} name="Changed" />
                      <Bar dataKey="removed" stackId="a" fill={CHANGE_COLORS.removed} name="Removed" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex justify-center gap-4 mt-2 text-[10px]" style={{ color: MUTED }}>
                    {Object.entries(CHANGE_COLORS).map(([key, color]) => (
                      <div key={key} className="flex items-center gap-1.5">
                        <div className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
                        <span className="capitalize">{key}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </GlassPanel>

          {/* ── Agent Heatmap (full width) ──────────────────────────────── */}
          <GlassPanel className="xl:col-span-3" title="Agent Drift Heatmap" icon={Zap}>
            <div className="px-5 pb-5">
              {heatmapQuery.isLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: PURPLE }} />
                </div>
              ) : (
                <HeatmapGrid
                  grid={heatmapQuery.data?.grid || []}
                  agents={heatmapQuery.data?.agents || []}
                  buckets={heatmapQuery.data?.buckets || []}
                />
              )}
            </div>
          </GlassPanel>

          {/* ── Top Drifting Agents ─────────────────────────────────────── */}
          <GlassPanel className="xl:col-span-2" title="Top Drifting Agents" icon={AlertTriangle}>
            <div className="px-5 pb-5">
              {volatilityQuery.isLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: PURPLE }} />
                </div>
              ) : (
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {volatilityQuery.data!.agents.slice(0, 15).map((agent, idx) => (
                    <div
                      key={agent.agentId}
                      className="flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors hover:bg-white/3"
                      style={{ borderColor: BORDER }}
                    >
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold"
                        style={{
                          background: idx < 3 ? `${RED}30` : `${PURPLE}20`,
                          color: idx < 3 ? RED : PURPLE,
                        }}
                      >
                        {idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-xs font-semibold" style={{ color: "oklch(0.9 0.005 286)" }}>
                          Agent {agent.agentId}
                        </div>
                        <div className="text-[10px]" style={{ color: MUTED }}>
                          {agent.snapshotCount} snapshots · {agent.driftEvents} drift events
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm font-bold" style={{ color: agent.volatilityScore > 60 ? RED : agent.volatilityScore > 30 ? AMBER : GREEN }}>
                          {agent.volatilityScore}%
                        </div>
                        <div className="text-[10px]" style={{ color: MUTED }}>volatility</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-xs" style={{ color: MUTED }}>
                          avg {formatPct(agent.avgDrift)}
                        </div>
                        <div className="font-mono text-xs" style={{ color: MUTED }}>
                          max {formatPct(agent.maxDrift)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </GlassPanel>

          {/* ── Schedule Comparison Cards (full width) ──────────────────── */}
          <GlassPanel className="xl:col-span-3" title="Schedule Performance" icon={Calendar}>
            <div className="px-5 pb-5">
              {summaryQuery.isLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: PURPLE }} />
                </div>
              ) : (summaryQuery.data?.schedules.length ?? 0) === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm" style={{ color: MUTED }}>
                  No schedules found
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {summaryQuery.data!.schedules.map((sched) => (
                    <div
                      key={sched.id}
                      className="rounded-lg border p-4 transition-all hover:bg-white/3 cursor-pointer"
                      style={{ borderColor: BORDER, background: selectedScheduleId === sched.id ? `${PURPLE}10` : "transparent" }}
                      onClick={() => setSelectedScheduleId(selectedScheduleId === sched.id ? undefined : sched.id)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-display text-sm font-semibold truncate" style={{ color: "oklch(0.9 0.005 286)" }}>
                          {sched.name}
                        </div>
                        <div className="flex items-center gap-1.5">
                          {sched.notifyOnDrift ? (
                            <Bell className="h-3 w-3" style={{ color: VIOLET }} />
                          ) : (
                            <BellOff className="h-3 w-3" style={{ color: MUTED }} />
                          )}
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                            style={{
                              background: sched.enabled ? `${GREEN}20` : `${RED}20`,
                              color: sched.enabled ? GREEN : RED,
                            }}
                          >
                            {sched.enabled ? "Active" : "Paused"}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span style={{ color: MUTED }}>Avg Drift</span>
                          <div className="font-mono font-semibold" style={{ color: sched.avgDrift > 30 ? RED : sched.avgDrift > 10 ? AMBER : GREEN }}>
                            {formatPct(sched.avgDrift)}
                          </div>
                        </div>
                        <div>
                          <span style={{ color: MUTED }}>Max Drift</span>
                          <div className="font-mono font-semibold" style={{ color: sched.maxDrift > 50 ? RED : sched.maxDrift > 20 ? AMBER : GREEN }}>
                            {formatPct(sched.maxDrift)}
                          </div>
                        </div>
                        <div>
                          <span style={{ color: MUTED }}>Captures</span>
                          <div className="font-mono font-semibold" style={{ color: "oklch(0.85 0.01 286)" }}>
                            {sched.captureCount}
                          </div>
                        </div>
                        <div>
                          <span style={{ color: MUTED }}>Alerts</span>
                          <div className="font-mono font-semibold" style={{ color: sched.notificationCount > 0 ? AMBER : MUTED }}>
                            {sched.notificationCount}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between text-[10px]" style={{ color: MUTED }}>
                        <span className="font-mono">{sched.frequency}</span>
                        <span>{sched.agentIds.length} agent{sched.agentIds.length !== 1 ? "s" : ""}</span>
                        {sched.driftThreshold > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Shield className="h-2.5 w-2.5" style={{ color: VIOLET }} />
                            {sched.driftThreshold}%
                          </span>
                        )}
                      </div>

                      {sched.lastCaptureAt && (
                        <div className="mt-1.5 text-[10px]" style={{ color: MUTED }}>
                          Last: {formatDateTime(sched.lastCaptureAt)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </GlassPanel>

          {/* ── Recent Drift Events (full width) ───────────────────────── */}
          <GlassPanel className="xl:col-span-3" title="Recent Drift Events" icon={Clock}>
            <div className="px-5 pb-5">
              {recentQuery.isLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: PURPLE }} />
                </div>
              ) : (recentQuery.data?.events.length ?? 0) === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm" style={{ color: MUTED }}>
                  No drift events recorded yet
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ color: MUTED }}>
                        <th className="pb-2 text-left font-medium">Time</th>
                        <th className="pb-2 text-left font-medium">Schedule</th>
                        <th className="pb-2 text-right font-medium">Drift %</th>
                        <th className="pb-2 text-right font-medium">Changes</th>
                        <th className="pb-2 text-right font-medium">Total Items</th>
                        <th className="pb-2 text-center font-medium">Notified</th>
                        <th className="pb-2 text-right font-medium">Agents</th>
                        <th className="pb-2 text-center font-medium">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentQuery.data!.events.map((evt) => (
                        <tr
                          key={evt.id}
                          className="border-t transition-colors hover:bg-white/3"
                          style={{ borderColor: "oklch(0.25 0.02 286 / 30%)" }}
                        >
                          <td className="py-2 pr-3 font-mono" style={{ color: MUTED }}>
                            {formatDateTime(evt.timestamp)}
                          </td>
                          <td className="py-2 pr-3" style={{ color: "oklch(0.85 0.01 286)" }}>
                            {evt.scheduleName}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono font-semibold" style={{
                            color: evt.driftPercent > 50 ? RED : evt.driftPercent > 20 ? AMBER : evt.driftPercent > 0 ? CYAN : MUTED,
                          }}>
                            {formatPct(evt.driftPercent)}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono" style={{ color: "oklch(0.85 0.01 286)" }}>
                            {evt.driftCount}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono" style={{ color: MUTED }}>
                            {evt.totalItems}
                          </td>
                          <td className="py-2 text-center">
                            {evt.notificationSent ? (
                              <Bell className="mx-auto h-3.5 w-3.5" style={{ color: AMBER }} />
                            ) : (
                              <span style={{ color: MUTED }}>—</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono text-[10px]" style={{ color: MUTED }}>
                            {(evt.agentIds as string[])?.length ?? 0}
                          </td>
                          <td className="py-2 text-center">
                            <button
                              onClick={() => setDetailSnapshotId(evt.id)}
                              className="rounded p-1 transition-colors hover:bg-white/10"
                              title="View details"
                            >
                              <Eye className="h-3.5 w-3.5" style={{ color: PURPLE }} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </GlassPanel>
        </div>
      )}

       </>
      )}

      {/* ═══════════════════ NOTIFICATION HISTORY TAB ═══════════════════ */}
      {activeTab === "notifications" && (
        <Suspense fallback={<LazyTabFallback />}>
          <NotificationHistoryTab
            notifStatsQ={notifStatsQ}
            notifListQ={notifHistoryQ}
            retryMutation={retryMutation}
          />
        </Suspense>
      )}

      {/* ═══════════════════ SUPPRESSION RULES TAB ═══════════════════ */}
      {activeTab === "suppression" && (
        <Suspense fallback={<LazyTabFallback />}>
          <SuppressionRulesTab
            schedules={summaryQuery.data?.schedules.map((s) => ({ id: s.id, name: s.name })) || []}
            suppressionListQ={suppressionListQ}
            createSuppressionMut={createSuppressionMut}
            deactivateSuppressionMut={deactivateSuppressionMut}
            deleteSuppressionMut={deleteSuppressionMut}
          />
        </Suspense>
      )}

      {/* ── Anomaly Detail Slide-over ───────────────────────────── */}
      {selectedAnomalyId !== null && (
        <AnomalyDetailPanel
          anomaly={anomalyDetailQ.data?.anomaly}
          isLoading={anomalyDetailQ.isLoading}
          onClose={() => setSelectedAnomalyId(null)}
          onAcknowledge={(id) => ackMutation.mutate({ id })}
          ackPending={ackMutation.isPending}
        />
      )}

      {/* ── Detail Slide-over Panel ──────────────────────────────── */}
      {detailSnapshotId !== null && (
        <SnapshotDetailPanel
          snapshot={detailQuery.data?.snapshot}
          isLoading={detailQuery.isLoading}
          onClose={() => setDetailSnapshotId(null)}
        />
      )}
    </div>
  );
}
