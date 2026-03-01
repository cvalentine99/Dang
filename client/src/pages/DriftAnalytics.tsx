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

import { useState, useMemo, useCallback } from "react";
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
  Plus,
  Trash2,
  RotateCcw,
  PauseCircle,
  PlayCircle,
} from "lucide-react";

// ─── Amethyst Nexus palette ─────────────────────────────────────────────────
const PURPLE = "oklch(0.541 0.281 293.009)";
const PURPLE_DIM = "oklch(0.4 0.15 293)";
const VIOLET = "oklch(0.6 0.2 293)";
const CYAN = "oklch(0.789 0.154 211.53)";
const AMBER = "oklch(0.795 0.184 86.047)";
const RED = "oklch(0.637 0.237 25.331)";
const GREEN = "oklch(0.765 0.177 163.223)";
const MUTED = "oklch(0.65 0.02 286)";
const CARD_BG = "oklch(0.17 0.025 286)";
const GLASS_BG = "oklch(0.15 0.02 286 / 70%)";
const BORDER = "oklch(0.3 0.04 286 / 40%)";

const SCHEDULE_COLORS = [PURPLE, CYAN, AMBER, GREEN, VIOLET, RED, "oklch(0.7 0.15 330)", "oklch(0.7 0.15 200)"];
const CATEGORY_COLORS = { packages: CYAN, services: VIOLET, users: AMBER };
const CHANGE_COLORS = { added: GREEN, removed: RED, changed: AMBER };

// ─── Time range presets ─────────────────────────────────────────────────────
const TIME_RANGES = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
function formatPct(v: number): string {
  return `${Math.round(v * 100) / 100}%`;
}

// ─── Glass Panel ────────────────────────────────────────────────────────────
function GlassPanel({
  children,
  className = "",
  title,
  icon: Icon,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border backdrop-blur-md ${className}`}
      style={{
        background: GLASS_BG,
        borderColor: BORDER,
      }}
    >
      {title && (
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4" style={{ color: PURPLE }} />}
            <h3 className="font-display text-sm font-semibold tracking-wide" style={{ color: "oklch(0.85 0.01 286)" }}>
              {title}
            </h3>
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── KPI Card ───────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color = PURPLE,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color?: string;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg border px-4 py-3"
      style={{ background: CARD_BG, borderColor: BORDER }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}20` }}>
        <Icon className="h-5 w-5" style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>{label}</div>
        <div className="font-display text-xl font-bold" style={{ color: "oklch(0.93 0.005 286)" }}>{value}</div>
        {sub && <div className="text-xs" style={{ color: MUTED }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Tooltip ────────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg backdrop-blur-md"
      style={{ background: CARD_BG, borderColor: BORDER, color: "oklch(0.85 0.01 286)" }}
    >
      <div className="mb-1 font-semibold">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span style={{ color: MUTED }}>{p.name}:</span>
          <span className="font-mono">{typeof p.value === "number" ? formatPct(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Heatmap Cell ───────────────────────────────────────────────────────────
function HeatmapGrid({
  grid,
  agents,
  buckets,
}: {
  grid: Array<{ agentId: string; bucket: number; driftPercent: number }>;
  agents: string[];
  buckets: number[];
}) {
  if (agents.length === 0 || buckets.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm" style={{ color: MUTED }}>
        No heatmap data available
      </div>
    );
  }

  // Build lookup
  const lookup: Record<string, Record<number, number>> = {};
  for (const cell of grid) {
    if (!lookup[cell.agentId]) lookup[cell.agentId] = {};
    lookup[cell.agentId][cell.bucket] = cell.driftPercent;
  }

  // Show max 15 buckets to keep it readable
  const displayBuckets = buckets.length > 15 ? buckets.slice(-15) : buckets;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Header row */}
        <div className="flex items-center gap-0.5 mb-1">
          <div className="w-20 shrink-0 text-xs font-mono" style={{ color: MUTED }}>Agent</div>
          {displayBuckets.map((b) => (
            <div
              key={b}
              className="flex-1 text-center text-[10px] font-mono"
              style={{ color: MUTED }}
              title={formatDateTime(b)}
            >
              {formatDate(b)}
            </div>
          ))}
        </div>

        {/* Agent rows */}
        {agents.map((agentId) => (
          <div key={agentId} className="flex items-center gap-0.5 mb-0.5">
            <div
              className="w-20 shrink-0 truncate text-xs font-mono"
              style={{ color: "oklch(0.85 0.01 286)" }}
              title={agentId}
            >
              {agentId}
            </div>
            {displayBuckets.map((b) => {
              const val = lookup[agentId]?.[b] ?? 0;
              // Map 0-100 to opacity
              const intensity = Math.min(val / 50, 1); // 50% = full intensity
              const bg = val === 0
                ? "oklch(0.2 0.02 286 / 30%)"
                : `oklch(${0.5 + intensity * 0.15} ${0.1 + intensity * 0.17} ${val > 30 ? 25 : 293} / ${0.3 + intensity * 0.7})`;
              return (
                <div
                  key={b}
                  className="flex-1 h-7 rounded-sm flex items-center justify-center text-[10px] font-mono cursor-default transition-all hover:ring-1 hover:ring-purple-400/40"
                  style={{ background: bg, color: val > 0 ? "oklch(0.95 0 0)" : "transparent" }}
                  title={`Agent ${agentId} | ${formatDate(b)} | ${formatPct(val)} drift`}
                >
                  {val > 0 ? Math.round(val) : ""}
                </div>
              );
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center gap-3 mt-3 text-[10px]" style={{ color: MUTED }}>
          <span>Drift intensity:</span>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-sm" style={{ background: "oklch(0.2 0.02 286 / 30%)" }} />
            <span>0%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-sm" style={{ background: "oklch(0.55 0.15 293 / 50%)" }} />
            <span>Low</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-sm" style={{ background: "oklch(0.6 0.2 293 / 80%)" }} />
            <span>Medium</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-sm" style={{ background: "oklch(0.65 0.27 25 / 100%)" }} />
            <span>High</span>
          </div>
        </div>
      </div>
    </div>
  );
}

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
    onSuccess: () => { suppressionListQ.refetch(); setShowCreateRule(false); },
  });
  const deactivateSuppressionMut = trpc.suppression.deactivate.useMutation({
    onSuccess: () => suppressionListQ.refetch(),
  });
  const deleteSuppressionMut = trpc.suppression.delete.useMutation({
    onSuccess: () => suppressionListQ.refetch(),
  });
  const [showCreateRule, setShowCreateRule] = useState(false);
  const [newRule, setNewRule] = useState({
    scheduleId: null as number | null,
    severityFilter: "all" as "critical" | "high" | "medium" | "all",
    durationHours: 24,
    reason: "",
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

    // Group by schedule for multi-line chart
    const scheduleNames = Array.from(new Set(points.map((p) => p.scheduleName)));

    if (scheduleNames.length <= 1) {
      return points.map((p) => ({
        time: formatDate(p.timestamp),
        timestamp: p.timestamp,
        drift: p.driftPercent,
        scheduleName: p.scheduleName,
      }));
    }

    // Multi-schedule: pivot into { time, schedule1: drift, schedule2: drift, ... }
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

  // KPI aggregates
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
                      <YAxis dataKey="category" type="category" tick={{ fill: MUTED, fontSize: 11 }} width={70} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="added" name="Added" stackId="a" fill={CHANGE_COLORS.added} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="changed" name="Changed" stackId="a" fill={CHANGE_COLORS.changed} />
                      <Bar dataKey="removed" name="Removed" stackId="a" fill={CHANGE_COLORS.removed} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Category legend */}
                  <div className="mt-3 flex flex-wrap gap-4 text-xs" style={{ color: MUTED }}>
                    {Object.entries(CHANGE_COLORS).map(([key, color]) => (
                      <div key={key} className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
                        <span className="capitalize">{key}</span>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {categoryData.map((c) => (
                      <div key={c.category} className="rounded-lg border px-3 py-2 text-center" style={{ borderColor: BORDER }}>
                        <div className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>{c.category}</div>
                        <div className="font-display text-lg font-bold" style={{ color: "oklch(0.93 0.005 286)" }}>{c.total}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </GlassPanel>

          {/* ── Agent Volatility Heatmap (spans 2 cols) ────────────────── */}
          <GlassPanel className="xl:col-span-2" title="Agent Drift Heatmap" icon={Zap}>
            <div className="px-5 pb-5">
              {heatmapQuery.isLoading ? (
                <div className="flex h-48 items-center justify-center">
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
          <GlassPanel title="Agent Volatility Ranking" icon={AlertTriangle}>
            <div className="px-5 pb-5">
              {volatilityQuery.isLoading ? (
                <div className="flex h-48 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: PURPLE }} />
                </div>
              ) : (volatilityQuery.data?.agents.length ?? 0) === 0 ? (
                <div className="flex h-48 items-center justify-center text-sm" style={{ color: MUTED }}>
                  No agent data available
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
        <div className="space-y-5">
          {/* Notification KPIs */}
          {notifStatsQ.data && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard icon={Bell} label="Total Sent" value={notifStatsQ.data.sent} sub="notifications" color={GREEN} />
              <KpiCard icon={AlertTriangle} label="Failed" value={notifStatsQ.data.failed} sub="delivery errors" color={RED} />
              <KpiCard icon={ShieldOff} label="Suppressed" value={notifStatsQ.data.suppressed} sub="by rules" color={AMBER} />
              <KpiCard icon={TriangleAlert} label="Anomaly Alerts" value={notifStatsQ.data.byType.anomaly} sub="anomaly type" color={VIOLET} />
              <KpiCard icon={TrendingUp} label="Drift Alerts" value={notifStatsQ.data.byType.drift_threshold} sub="threshold type" color={CYAN} />
              <KpiCard icon={RotateCcw} label="Retrying" value={notifStatsQ.data.retrying} sub="pending retry" color={PURPLE} />
            </div>
          )}

          {/* Notification History Table */}
          <GlassPanel title="Notification History" icon={History}>
            <div className="px-5 pb-5">
              {notifHistoryQ.isLoading ? (
                <div className="flex h-48 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: PURPLE }} />
                </div>
              ) : (notifHistoryQ.data?.notifications.length ?? 0) === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center text-center">
                  <History className="mb-3 h-10 w-10" style={{ color: PURPLE_DIM }} />
                  <p className="text-sm" style={{ color: MUTED }}>No notifications sent in the selected time range.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ color: MUTED }}>
                        <th className="pb-2 text-left font-medium">Time</th>
                        <th className="pb-2 text-left font-medium">Type</th>
                        <th className="pb-2 text-left font-medium">Schedule</th>
                        <th className="pb-2 text-center font-medium">Severity</th>
                        <th className="pb-2 text-center font-medium">Status</th>
                        <th className="pb-2 text-right font-medium">Drift %</th>
                        <th className="pb-2 text-right font-medium">Retries</th>
                        <th className="pb-2 text-center font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notifHistoryQ.data!.notifications.map((n) => {
                        const statusColor = n.deliveryStatus === "sent" ? GREEN : n.deliveryStatus === "failed" ? RED : n.deliveryStatus === "suppressed" ? AMBER : CYAN;
                        const sevColor = n.severity === "critical" ? RED : n.severity === "high" ? "oklch(0.705 0.191 22.216)" : n.severity === "medium" ? AMBER : CYAN;
                        return (
                          <tr key={n.id} className="border-t" style={{ borderColor: "oklch(0.25 0.02 286 / 20%)" }}>
                            <td className="py-2.5 pr-3 font-mono text-[10px]" style={{ color: MUTED }}>
                              {formatDateTime(n.timestamp)}
                            </td>
                            <td className="py-2.5 pr-3">
                              <span
                                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                                style={{ background: n.notificationType === "anomaly" ? `${VIOLET}20` : `${CYAN}20`, color: n.notificationType === "anomaly" ? VIOLET : CYAN }}
                              >
                                {n.notificationType === "anomaly" ? <TriangleAlert className="h-2.5 w-2.5" /> : <TrendingUp className="h-2.5 w-2.5" />}
                                {n.notificationType}
                              </span>
                            </td>
                            <td className="py-2.5 pr-3 text-xs" style={{ color: "oklch(0.85 0.01 286)" }}>
                              {n.scheduleName || "—"}
                            </td>
                            <td className="py-2.5 text-center">
                              <span
                                className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                                style={{ background: `${sevColor}20`, color: sevColor }}
                              >
                                {n.severity}
                              </span>
                            </td>
                            <td className="py-2.5 text-center">
                              <span
                                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                                style={{ background: `${statusColor}15`, color: statusColor }}
                              >
                                {n.deliveryStatus === "sent" && <CheckCircle2 className="h-2.5 w-2.5" />}
                                {n.deliveryStatus === "failed" && <AlertTriangle className="h-2.5 w-2.5" />}
                                {n.deliveryStatus === "suppressed" && <ShieldOff className="h-2.5 w-2.5" />}
                                {n.deliveryStatus}
                              </span>
                            </td>
                            <td className="py-2.5 pr-3 text-right font-mono" style={{ color: "oklch(0.85 0.01 286)" }}>
                              {n.driftPercent != null ? formatPct(n.driftPercent) : "—"}
                            </td>
                            <td className="py-2.5 pr-3 text-right font-mono" style={{ color: MUTED }}>
                              {n.retryCount}
                            </td>
                            <td className="py-2.5 text-center">
                              {n.deliveryStatus === "failed" && (
                                <button
                                  onClick={() => retryMutation.mutate({ id: n.id })}
                                  disabled={retryMutation.isPending}
                                  className="rounded p-1 transition-colors hover:bg-white/10"
                                  title="Retry notification"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" style={{ color: CYAN }} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </GlassPanel>
        </div>
      )}

      {/* ═══════════════════ SUPPRESSION RULES TAB ═══════════════════ */}
      {activeTab === "suppression" && (
        <div className="space-y-5">
          {/* Header with Create button */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold" style={{ color: "oklch(0.9 0.005 286)" }}>Suppression Rules</h2>
              <p className="text-xs" style={{ color: MUTED }}>Mute anomaly alerts during maintenance windows or known-noisy periods</p>
            </div>
            <button
              onClick={() => setShowCreateRule(true)}
              className="flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-medium transition-colors hover:bg-white/5"
              style={{ borderColor: PURPLE, color: PURPLE }}
            >
              <Plus className="h-3.5 w-3.5" />
              Create Rule
            </button>
          </div>

          {/* Create Rule Form */}
          {showCreateRule && (
            <GlassPanel title="New Suppression Rule" icon={ShieldOff}>
              <div className="px-5 pb-5 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Schedule selector */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: MUTED }}>Target Schedule</label>
                    <select
                      value={newRule.scheduleId ?? ""}
                      onChange={(e) => setNewRule({ ...newRule, scheduleId: e.target.value ? Number(e.target.value) : null })}
                      className="w-full rounded-lg border px-3 py-2 text-xs"
                      style={{ background: "oklch(0.12 0.02 286)", borderColor: BORDER, color: "oklch(0.85 0.01 286)" }}
                    >
                      <option value="">All Schedules</option>
                      {(summaryQuery.data?.schedules || []).map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Severity filter */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: MUTED }}>Suppress Severity</label>
                    <select
                      value={newRule.severityFilter}
                      onChange={(e) => setNewRule({ ...newRule, severityFilter: e.target.value as any })}
                      className="w-full rounded-lg border px-3 py-2 text-xs"
                      style={{ background: "oklch(0.12 0.02 286)", borderColor: BORDER, color: "oklch(0.85 0.01 286)" }}
                    >
                      <option value="all">All Severities</option>
                      <option value="critical">Critical & below</option>
                      <option value="high">High & below</option>
                      <option value="medium">Medium only</option>
                    </select>
                  </div>

                  {/* Duration */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: MUTED }}>Duration (hours)</label>
                    <input
                      type="number"
                      min={1}
                      max={720}
                      value={newRule.durationHours}
                      onChange={(e) => setNewRule({ ...newRule, durationHours: Math.max(1, Math.min(720, Number(e.target.value))) })}
                      className="w-full rounded-lg border px-3 py-2 text-xs"
                      style={{ background: "oklch(0.12 0.02 286)", borderColor: BORDER, color: "oklch(0.85 0.01 286)" }}
                    />
                    <div className="mt-1 flex gap-2">
                      {[1, 4, 8, 24, 72, 168].map((h) => (
                        <button
                          key={h}
                          onClick={() => setNewRule({ ...newRule, durationHours: h })}
                          className="rounded px-2 py-0.5 text-[10px] transition-colors hover:bg-white/10"
                          style={{ color: newRule.durationHours === h ? CYAN : MUTED, background: newRule.durationHours === h ? `${CYAN}15` : "transparent" }}
                        >
                          {h < 24 ? `${h}h` : `${h / 24}d`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Reason */}
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: MUTED }}>Reason</label>
                    <input
                      type="text"
                      value={newRule.reason}
                      onChange={(e) => setNewRule({ ...newRule, reason: e.target.value })}
                      placeholder="e.g., Scheduled maintenance window"
                      className="w-full rounded-lg border px-3 py-2 text-xs"
                      style={{ background: "oklch(0.12 0.02 286)", borderColor: BORDER, color: "oklch(0.85 0.01 286)" }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => {
                      if (!newRule.reason.trim()) return;
                      createSuppressionMut.mutate(newRule);
                    }}
                    disabled={!newRule.reason.trim() || createSuppressionMut.isPending}
                    className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-colors disabled:opacity-50"
                    style={{ background: PURPLE, color: "oklch(0.98 0.005 285)" }}
                  >
                    {createSuppressionMut.isPending ? "Creating..." : "Create Rule"}
                  </button>
                  <button
                    onClick={() => setShowCreateRule(false)}
                    className="rounded-lg border px-4 py-2 text-xs transition-colors hover:bg-white/5"
                    style={{ borderColor: BORDER, color: MUTED }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </GlassPanel>
          )}

          {/* Rules List */}
          <GlassPanel title="Active & Expired Rules" icon={Shield}>
            <div className="px-5 pb-5">
              {suppressionListQ.isLoading ? (
                <div className="flex h-48 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: PURPLE }} />
                </div>
              ) : (suppressionListQ.data?.rules.length ?? 0) === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center text-center">
                  <ShieldOff className="mb-3 h-10 w-10" style={{ color: PURPLE_DIM }} />
                  <p className="text-sm" style={{ color: MUTED }}>No suppression rules configured.</p>
                  <p className="text-xs mt-1" style={{ color: MUTED }}>Create a rule to mute anomaly alerts during maintenance windows.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {suppressionListQ.data!.rules.map((rule) => {
                    const isActive = rule.active && !rule.isExpired;
                    const sevColor = rule.severityFilter === "critical" ? RED : rule.severityFilter === "high" ? "oklch(0.705 0.191 22.216)" : rule.severityFilter === "medium" ? AMBER : VIOLET;
                    return (
                      <div
                        key={rule.id}
                        className="flex items-center gap-4 rounded-lg border px-4 py-3"
                        style={{ borderColor: isActive ? `${PURPLE}40` : BORDER, background: isActive ? "oklch(0.16 0.025 286)" : "oklch(0.13 0.015 286)" }}
                      >
                        {/* Status icon */}
                        <div className="shrink-0">
                          {isActive ? (
                            <PauseCircle className="h-5 w-5" style={{ color: AMBER }} />
                          ) : (
                            <PlayCircle className="h-5 w-5" style={{ color: MUTED }} />
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold" style={{ color: isActive ? "oklch(0.9 0.005 286)" : MUTED }}>
                              {rule.scheduleName || "All Schedules"}
                            </span>
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                              style={{ background: `${sevColor}20`, color: sevColor }}
                            >
                              {rule.severityFilter === "all" ? "all severities" : `≤ ${rule.severityFilter}`}
                            </span>
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                              style={{ background: isActive ? `${GREEN}15` : `${RED}15`, color: isActive ? GREEN : RED }}
                            >
                              {isActive ? "Active" : rule.isExpired ? "Expired" : "Deactivated"}
                            </span>
                          </div>
                          <div className="text-xs" style={{ color: MUTED }}>
                            {rule.reason}
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-[10px] font-mono" style={{ color: MUTED }}>
                            <span>Duration: {rule.durationHours}h</span>
                            <span>Expires: {new Date(rule.expiresAtTs).toLocaleString()}</span>
                            <span>Suppressed: {rule.suppressedCount} alerts</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isActive && (
                            <button
                              onClick={() => deactivateSuppressionMut.mutate({ id: rule.id })}
                              className="rounded p-1.5 transition-colors hover:bg-white/10"
                              title="Deactivate rule"
                              disabled={deactivateSuppressionMut.isPending}
                            >
                              <PauseCircle className="h-4 w-4" style={{ color: AMBER }} />
                            </button>
                          )}
                          <button
                            onClick={() => deleteSuppressionMut.mutate({ id: rule.id })}
                            className="rounded p-1.5 transition-colors hover:bg-white/10"
                            title="Delete rule"
                            disabled={deleteSuppressionMut.isPending}
                          >
                            <Trash2 className="h-4 w-4" style={{ color: RED }} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </GlassPanel>
        </div>
      )}

      {/* ── Anomaly Detail Slide-over ───────────────────────────── */}
      {selectedAnomalyId !== null && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedAnomalyId(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg overflow-y-auto border-l shadow-2xl"
            style={{ background: "oklch(0.14 0.025 286)", borderColor: BORDER }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b px-5 py-4" style={{ background: "oklch(0.14 0.025 286)", borderColor: BORDER }}>
              <h3 className="font-display text-sm font-semibold flex items-center gap-2">
                <TriangleAlert className="h-4 w-4" style={{ color: RED }} />
                Anomaly Detail
              </h3>
              <button onClick={() => setSelectedAnomalyId(null)} className="rounded p-1 hover:bg-white/10">
                <X className="h-4 w-4" style={{ color: MUTED }} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {anomalyDetailQ.isLoading ? (
                <div className="flex h-48 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: PURPLE }} />
                </div>
              ) : anomalyDetailQ.data?.anomaly ? (
                (() => {
                  const a = anomalyDetailQ.data.anomaly;
                  const sevColor = a.severity === "critical" ? RED : a.severity === "high" ? "oklch(0.705 0.191 22.216)" : AMBER;
                  const byCat = a.byCategory as { packages: { added: number; removed: number; changed: number }; services: { added: number; removed: number; changed: number }; users: { added: number; removed: number; changed: number } } | null;
                  const topItems = (a.topDriftItems as Array<{ category: string; agentId: string; name: string; changeType: string; previousValue?: string; currentValue?: string }>) || [];

                  return (
                    <>
                      {/* Severity + Status */}
                      <div className="flex items-center gap-3">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase"
                          style={{ background: `${sevColor}20`, color: sevColor }}
                        >
                          <TriangleAlert className="h-3.5 w-3.5" />
                          {a.severity}
                        </span>
                        {a.acknowledged ? (
                          <span className="inline-flex items-center gap-1 text-xs" style={{ color: GREEN }}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Acknowledged
                          </span>
                        ) : (
                          <button
                            onClick={() => ackMutation.mutate({ id: a.id })}
                            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-white/5"
                            style={{ borderColor: BORDER, color: PURPLE }}
                            disabled={ackMutation.isPending}
                          >
                            <CheckCircle2 className="h-3 w-3" /> Acknowledge
                          </button>
                        )}
                      </div>

                      {/* Statistical summary */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg border p-3 text-center" style={{ borderColor: BORDER }}>
                          <div className="text-[10px] uppercase" style={{ color: MUTED }}>Drift</div>
                          <div className="font-display text-2xl font-bold" style={{ color: sevColor }}>
                            {formatPct(a.driftPercent)}
                          </div>
                        </div>
                        <div className="rounded-lg border p-3 text-center" style={{ borderColor: BORDER }}>
                          <div className="text-[10px] uppercase" style={{ color: MUTED }}>Z-Score</div>
                          <div className="font-display text-2xl font-bold" style={{ color: "oklch(0.9 0.005 286)" }}>
                            {a.zScore.toFixed(2)}σ
                          </div>
                        </div>
                        <div className="rounded-lg border p-3 text-center" style={{ borderColor: BORDER }}>
                          <div className="text-[10px] uppercase" style={{ color: MUTED }}>Threshold</div>
                          <div className="font-display text-2xl font-bold" style={{ color: MUTED }}>
                            {a.sigmaThreshold}σ
                          </div>
                        </div>
                      </div>

                      {/* Rolling stats */}
                      <div className="rounded-lg border p-4" style={{ borderColor: BORDER }}>
                        <h4 className="text-xs font-semibold mb-2" style={{ color: MUTED }}>Statistical Context</h4>
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span style={{ color: MUTED }}>Rolling Average</span>
                            <span className="font-mono" style={{ color: "oklch(0.85 0.01 286)" }}>{a.rollingAvg.toFixed(2)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: MUTED }}>Standard Deviation</span>
                            <span className="font-mono" style={{ color: "oklch(0.85 0.01 286)" }}>±{a.rollingStdDev.toFixed(2)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: MUTED }}>Expected Range</span>
                            <span className="font-mono" style={{ color: "oklch(0.85 0.01 286)" }}>
                              {Math.max(0, a.rollingAvg - a.sigmaThreshold * a.rollingStdDev).toFixed(2)}% – {(a.rollingAvg + a.sigmaThreshold * a.rollingStdDev).toFixed(2)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span style={{ color: MUTED }}>Actual Drift</span>
                            <span className="font-mono font-bold" style={{ color: sevColor }}>{formatPct(a.driftPercent)}</span>
                          </div>
                          {/* Visual deviation bar */}
                          <div className="mt-2">
                            <div className="h-3 rounded-full relative overflow-hidden" style={{ background: "oklch(0.2 0.02 286 / 50%)" }}>
                              {/* Expected range */}
                              <div
                                className="absolute h-full rounded-full"
                                style={{
                                  left: `${Math.max(0, (a.rollingAvg - a.sigmaThreshold * a.rollingStdDev) / Math.max(a.driftPercent * 1.2, 1) * 100)}%`,
                                  width: `${Math.min(100, (a.sigmaThreshold * a.rollingStdDev * 2) / Math.max(a.driftPercent * 1.2, 1) * 100)}%`,
                                  background: `${GREEN}30`,
                                }}
                              />
                              {/* Actual value marker */}
                              <div
                                className="absolute h-full w-1 rounded-full"
                                style={{
                                  left: `${Math.min(100, a.driftPercent / Math.max(a.driftPercent * 1.2, 1) * 100)}%`,
                                  background: sevColor,
                                  boxShadow: `0 0 6px ${sevColor}`,
                                }}
                              />
                            </div>
                            <div className="flex justify-between mt-1 text-[9px]" style={{ color: MUTED }}>
                              <span>0%</span>
                              <span>Expected</span>
                              <span>Actual</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Category breakdown */}
                      {byCat && (
                        <div>
                          <h4 className="text-xs font-semibold mb-2" style={{ color: MUTED }}>Category Breakdown</h4>
                          <div className="space-y-1.5">
                            {(["packages", "services", "users"] as const).map((cat) => {
                              const d = byCat[cat];
                              const total = d.added + d.removed + d.changed;
                              return (
                                <div key={cat} className="flex items-center gap-3 text-xs">
                                  <span className="w-16 capitalize" style={{ color: "oklch(0.85 0.01 286)" }}>{cat}</span>
                                  <div className="flex gap-2 font-mono" style={{ color: MUTED }}>
                                    {d.added > 0 && <span style={{ color: GREEN }}>+{d.added}</span>}
                                    {d.changed > 0 && <span style={{ color: AMBER }}>~{d.changed}</span>}
                                    {d.removed > 0 && <span style={{ color: RED }}>-{d.removed}</span>}
                                    {total === 0 && <span>—</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Top drift items */}
                      {topItems.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold mb-2" style={{ color: MUTED }}>Top Changes ({topItems.length})</h4>
                          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                            {topItems.map((item, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs"
                                style={{ borderColor: "oklch(0.25 0.02 286 / 30%)" }}
                              >
                                <span
                                  className="shrink-0 rounded px-1 py-0.5 text-[10px] font-bold"
                                  style={{
                                    background: item.changeType === "added" ? `${GREEN}20` : item.changeType === "removed" ? `${RED}20` : `${AMBER}20`,
                                    color: item.changeType === "added" ? GREEN : item.changeType === "removed" ? RED : AMBER,
                                  }}
                                >
                                  {item.changeType === "added" ? "+" : item.changeType === "removed" ? "−" : "~"}
                                </span>
                                <span className="font-mono truncate" style={{ color: "oklch(0.85 0.01 286)" }}>
                                  {item.name}
                                </span>
                                <span className="shrink-0 text-[10px]" style={{ color: MUTED }}>[{item.category}]</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Metadata */}
                      <div className="rounded-lg border p-3 text-xs" style={{ borderColor: BORDER }}>
                        <h4 className="font-semibold mb-1.5" style={{ color: MUTED }}>Metadata</h4>
                        <div className="space-y-1 font-mono" style={{ color: "oklch(0.75 0.01 286)" }}>
                          <div>Anomaly ID: {a.id}</div>
                          <div>Snapshot ID: {a.snapshotId}</div>
                          <div>Schedule: {a.scheduleName} (ID: {a.scheduleId})</div>
                          <div>Agents: {(a.agentIds as string[])?.join(", ") || "—"}</div>
                          <div>Notification: {a.notificationSent ? "Sent" : "Not sent"}</div>
                          <div>Detected: {new Date(a.timestamp).toLocaleString()}</div>
                          {a.acknowledged && a.acknowledgedAtTs && (
                            <div>Acknowledged: {new Date(a.acknowledgedAtTs).toLocaleString()}</div>
                          )}
                          {a.acknowledgeNote && <div>Note: {a.acknowledgeNote}</div>}
                        </div>
                      </div>

                      {/* Raw JSON */}
                      <details className="group">
                        <summary className="cursor-pointer text-xs font-semibold flex items-center gap-1" style={{ color: MUTED }}>
                          <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                          Raw JSON
                        </summary>
                        <pre
                          className="mt-2 max-h-64 overflow-auto rounded-lg border p-3 font-mono text-[10px] leading-relaxed"
                          style={{ background: "oklch(0.12 0.02 286)", borderColor: BORDER, color: "oklch(0.75 0.01 286)" }}
                        >
                          {JSON.stringify(a, null, 2)}
                        </pre>
                      </details>
                    </>
                  );
                })()
              ) : (
                <div className="text-sm" style={{ color: MUTED }}>Anomaly not found</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Detail Slide-over Panel ──────────────────────────────── */}
      {detailSnapshotId !== null && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setDetailSnapshotId(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg overflow-y-auto border-l shadow-2xl"
            style={{ background: "oklch(0.14 0.025 286)", borderColor: BORDER }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b px-5 py-4" style={{ background: "oklch(0.14 0.025 286)", borderColor: BORDER }}>
              <h3 className="font-display text-sm font-semibold">Drift Snapshot Detail</h3>
              <button onClick={() => setDetailSnapshotId(null)} className="rounded p-1 hover:bg-white/10">
                <X className="h-4 w-4" style={{ color: MUTED }} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {detailQuery.isLoading ? (
                <div className="flex h-48 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: PURPLE }} />
                </div>
              ) : detailQuery.data?.snapshot ? (
                (() => {
                  const snap = detailQuery.data.snapshot;
                  const byCat = snap.byCategory as { packages: { added: number; removed: number; changed: number }; services: { added: number; removed: number; changed: number }; users: { added: number; removed: number; changed: number } } | null;
                  const topItems = (snap.topDriftItems as Array<{ category: string; agentId: string; name: string; changeType: string; previousValue?: string; currentValue?: string }>) || [];

                  return (
                    <>
                      {/* Summary */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-lg border p-3 text-center" style={{ borderColor: BORDER }}>
                          <div className="text-[10px] uppercase" style={{ color: MUTED }}>Drift</div>
                          <div className="font-display text-2xl font-bold" style={{ color: snap.driftPercent > 50 ? RED : snap.driftPercent > 20 ? AMBER : CYAN }}>
                            {formatPct(snap.driftPercent)}
                          </div>
                        </div>
                        <div className="rounded-lg border p-3 text-center" style={{ borderColor: BORDER }}>
                          <div className="text-[10px] uppercase" style={{ color: MUTED }}>Changes</div>
                          <div className="font-display text-2xl font-bold" style={{ color: "oklch(0.9 0.005 286)" }}>
                            {snap.driftCount}
                          </div>
                        </div>
                        <div className="rounded-lg border p-3 text-center" style={{ borderColor: BORDER }}>
                          <div className="text-[10px] uppercase" style={{ color: MUTED }}>Total</div>
                          <div className="font-display text-2xl font-bold" style={{ color: "oklch(0.9 0.005 286)" }}>
                            {snap.totalItems}
                          </div>
                        </div>
                      </div>

                      {/* Category breakdown */}
                      {byCat && (
                        <div>
                          <h4 className="text-xs font-semibold mb-2" style={{ color: MUTED }}>Category Breakdown</h4>
                          <div className="space-y-1.5">
                            {(["packages", "services", "users"] as const).map((cat) => {
                              const d = byCat[cat];
                              const total = d.added + d.removed + d.changed;
                              return (
                                <div key={cat} className="flex items-center gap-3 text-xs">
                                  <span className="w-16 capitalize" style={{ color: "oklch(0.85 0.01 286)" }}>{cat}</span>
                                  <div className="flex gap-2 font-mono" style={{ color: MUTED }}>
                                    {d.added > 0 && <span style={{ color: GREEN }}>+{d.added}</span>}
                                    {d.changed > 0 && <span style={{ color: AMBER }}>~{d.changed}</span>}
                                    {d.removed > 0 && <span style={{ color: RED }}>-{d.removed}</span>}
                                    {total === 0 && <span>—</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Top drift items */}
                      {topItems.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold mb-2" style={{ color: MUTED }}>
                            Top Changes ({topItems.length})
                          </h4>
                          <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                            {topItems.map((item, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs"
                                style={{ borderColor: "oklch(0.25 0.02 286 / 30%)" }}
                              >
                                <span
                                  className="shrink-0 rounded px-1 py-0.5 text-[10px] font-bold"
                                  style={{
                                    background: item.changeType === "added" ? `${GREEN}20` : item.changeType === "removed" ? `${RED}20` : `${AMBER}20`,
                                    color: item.changeType === "added" ? GREEN : item.changeType === "removed" ? RED : AMBER,
                                  }}
                                >
                                  {item.changeType === "added" ? "+" : item.changeType === "removed" ? "−" : "~"}
                                </span>
                                <span className="font-mono truncate" style={{ color: "oklch(0.85 0.01 286)" }}>
                                  {item.name}
                                </span>
                                <span className="shrink-0 text-[10px]" style={{ color: MUTED }}>
                                  [{item.category}]
                                </span>
                                <span className="shrink-0 font-mono text-[10px]" style={{ color: MUTED }}>
                                  agent {item.agentId}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Metadata */}
                      <div className="rounded-lg border p-3 text-xs" style={{ borderColor: BORDER }}>
                        <h4 className="font-semibold mb-1.5" style={{ color: MUTED }}>Metadata</h4>
                        <div className="space-y-1 font-mono" style={{ color: "oklch(0.75 0.01 286)" }}>
                          <div>Snapshot ID: {snap.id}</div>
                          <div>Schedule ID: {snap.scheduleId}</div>
                          <div>Baseline ID: {snap.baselineId}</div>
                          <div>Previous Baseline: {snap.previousBaselineId}</div>
                          <div>Agents: {(snap.agentIds as string[])?.join(", ")}</div>
                          <div>Notification: {snap.notificationSent ? "Sent" : "Not sent"}</div>
                          <div>Captured: {new Date(snap.createdAt).toLocaleString()}</div>
                        </div>
                      </div>

                      {/* Raw JSON */}
                      <details className="group">
                        <summary className="cursor-pointer text-xs font-semibold flex items-center gap-1" style={{ color: MUTED }}>
                          <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                          Raw JSON
                        </summary>
                        <pre
                          className="mt-2 max-h-64 overflow-auto rounded-lg border p-3 font-mono text-[10px] leading-relaxed"
                          style={{ background: "oklch(0.12 0.02 286)", borderColor: BORDER, color: "oklch(0.75 0.01 286)" }}
                        >
                          {JSON.stringify(snap, null, 2)}
                        </pre>
                      </details>
                    </>
                  );
                })()
              ) : (
                <div className="text-sm" style={{ color: MUTED }}>Snapshot not found</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
