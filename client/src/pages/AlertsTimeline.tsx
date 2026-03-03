import { trpc } from "@/lib/trpc";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { StatCard } from "@/components/shared/StatCard";
import { IndexerLoadingState, IndexerErrorState, StatCardSkeleton } from "@/components/shared/IndexerStates";
import { ChartSkeleton } from "@/components/shared/ChartSkeleton";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { WazuhGuard } from "@/components/shared/WazuhGuard";
import { ThreatBadge, threatLevelFromNumber } from "@/components/shared/ThreatBadge";
import { RawJsonViewer } from "@/components/shared/RawJsonViewer";

import { ExportButton } from "@/components/shared/ExportButton";
import { AddNoteDialog } from "@/components/shared/AddNoteDialog";
import { EXPORT_COLUMNS } from "@/lib/exportUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle, Shield, Search, ChevronLeft, ChevronRight,
  BarChart3, Clock, Layers, TrendingUp, FileWarning,
  Zap, Target, Eye, ExternalLink, Filter, RefreshCw,
  Database, Radio, Brain, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearch } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, Legend, AreaChart, Area,
} from "recharts";

const COLORS = {
  purple: "oklch(0.541 0.281 293.009)",
  cyan: "oklch(0.789 0.154 211.53)",
  green: "oklch(0.765 0.177 163.223)",
  yellow: "oklch(0.795 0.184 86.047)",
  red: "oklch(0.637 0.237 25.331)",
  orange: "oklch(0.705 0.191 22.216)",
  pink: "oklch(0.656 0.241 354.308)",
};

const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const TIME_PRESETS = [
  { label: "15m", value: "now-15m" },
  { label: "1h", value: "now-1h" },
  { label: "6h", value: "now-6h" },
  { label: "24h", value: "now-24h" },
  { label: "7d", value: "now-7d" },
  { label: "30d", value: "now-30d" },
] as const;

const SEVERITY_COLORS: Record<string, string> = {
  "0": "oklch(0.65 0.02 286)", "1": "oklch(0.65 0.02 286)", "2": "oklch(0.65 0.05 286)",
  "3": COLORS.cyan, "4": COLORS.cyan, "5": COLORS.green, "6": COLORS.green,
  "7": COLORS.yellow, "8": COLORS.yellow, "9": COLORS.orange, "10": COLORS.orange,
  "11": COLORS.red, "12": COLORS.red, "13": COLORS.red, "14": COLORS.pink, "15": COLORS.pink,
};

function SourceBadge({ source }: { source: "indexer" | "server" }) {
  const styles = {
    indexer: { label: "Indexer", color: "text-threat-low bg-threat-low/10 border-threat-low/20" },
    server: { label: "Server API", color: "text-primary bg-primary/10 border-primary/20" },
  };
  const s = styles[source];
  return <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${s.color}`}>{s.label}</span>;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-panel p-3 text-xs border border-glass-border">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color }} className="font-medium">{p.name}: {p.value?.toLocaleString()}</p>)}
    </div>
  );
}

function extractItems(raw: unknown): Array<Record<string, unknown>> {
  const d = (raw as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  return (d?.affected_items as Array<Record<string, unknown>>) ?? [];
}

/**
 * Send to Queue button — queues an alert for structured triage.
 * Shows on each alert row in the table.
 */
function SendToQueueButton({ alert }: { alert: Record<string, unknown> }) {
  const utils = trpc.useUtils();
  const enqueueMutation = trpc.alertQueue.enqueue.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Alert queued for triage", {
          description: "Click the queue badge in the sidebar to start analysis",
        });
        utils.alertQueue.count.invalidate();
        utils.alertQueue.list.invalidate();
      } else {
        toast.info(result.message);
      }
    },
    onError: (err) => {
      toast.error("Failed to queue alert", { description: err.message });
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Don't open alert detail dialog
    const rule = (alert.rule as Record<string, unknown>) ?? {};
    const agent = (alert.agent as Record<string, unknown>) ?? {};

    enqueueMutation.mutate({
      alertId: String(alert._id ?? alert.id ?? `alert-${Date.now()}`),
      ruleId: String(rule.id ?? "unknown"),
      ruleDescription: rule.description ? String(rule.description) : undefined,
      ruleLevel: Number(rule.level ?? 0),
      agentId: agent.id ? String(agent.id) : undefined,
      agentName: agent.name ? String(agent.name) : undefined,
      alertTimestamp: alert.timestamp ? String(alert.timestamp) : undefined,
      rawJson: alert,
    });
  };

  return (
    <button
      onClick={handleClick}
      disabled={enqueueMutation.isPending}
      className="group flex items-center gap-1 px-1.5 py-0.5 rounded border border-purple-500/20 bg-purple-500/5 text-purple-300 hover:bg-purple-500/15 hover:border-purple-500/40 transition-all disabled:opacity-50"
      title="Send to Alert Queue for structured triage"
    >
      <Brain className={`h-3 w-3 ${enqueueMutation.isPending ? "animate-spin" : "group-hover:animate-pulse"}`} />
      <span className="text-[9px] font-medium hidden xl:inline">Queue</span>
    </button>
  );
}

export default function AlertsTimeline() {
  const utils = trpc.useUtils();
  const searchString = useSearch();
  const urlParams = useMemo(() => new URLSearchParams(searchString), [searchString]);

  const [timeRange, setTimeRange] = useState<string>("now-24h");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [countryFilter, setCountryFilter] = useState<string>("");
  const [srcipFilter, setSrcipFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const [selectedAlert, setSelectedAlert] = useState<Record<string, unknown> | null>(null);
  const pageSize = 50;

  // Parse URL search params for country/srcip filters from ThreatMap click-to-filter
  useEffect(() => {
    const country = urlParams.get("country");
    const srcip = urlParams.get("srcip");
    if (country) setCountryFilter(country);
    if (srcip) setSrcipFilter(srcip);
  }, [urlParams]);

  // ── Server API queries ─────────────────────────────────────────────────
  const statusQ = trpc.wazuh.status.useQuery(undefined, { retry: 1, staleTime: 60_000 });
  const isConnected = statusQ.data?.configured === true && statusQ.data?.data != null;

  const statsHourlyQ = trpc.wazuh.statsHourly.useQuery(undefined, { retry: 1, staleTime: 60_000, enabled: isConnected });
  const statsWeeklyQ = trpc.wazuh.statsWeekly.useQuery(undefined, { retry: 1, staleTime: 120_000, enabled: isConnected });

  // ── Indexer queries ────────────────────────────────────────────────────
  const indexerStatusQ = trpc.indexer.status.useQuery(undefined, { retry: 1, staleTime: 60_000 });
  const isIndexerConnected = indexerStatusQ.data?.configured === true && indexerStatusQ.data?.healthy === true;

  const alertsSearchQ = trpc.indexer.alertsSearch.useQuery({
    from: timeRange, to: "now", size: pageSize, offset: page * pageSize,
    query: searchQuery || undefined,
    ruleLevel: levelFilter !== "all" ? Number(levelFilter) : undefined,
    agentId: agentFilter !== "all" ? agentFilter : undefined,
    srcip: srcipFilter || undefined,
    geoCountry: countryFilter || undefined,
    sortField: "timestamp", sortOrder: "desc",
  }, { retry: false, staleTime: 15_000, enabled: isIndexerConnected });

  const alertsTimelineQ = trpc.indexer.alertsTimeline.useQuery(
    { from: timeRange, to: "now", interval: timeRange === "now-15m" ? "1m" : timeRange === "now-1h" ? "5m" : timeRange === "now-6h" ? "15m" : "1h" },
    { retry: false, staleTime: 30_000, enabled: isIndexerConnected }
  );

  const alertsAggByLevelQ = trpc.indexer.alertsAggByLevel.useQuery(
    { from: timeRange, to: "now", interval: timeRange === "now-15m" ? "1m" : timeRange === "now-1h" ? "5m" : timeRange === "now-6h" ? "15m" : "1h" },
    { retry: false, staleTime: 30_000, enabled: isIndexerConnected }
  );

  const alertsAggByRuleQ = trpc.indexer.alertsAggByRule.useQuery(
    { from: timeRange, to: "now", topN: 10 },
    { retry: false, staleTime: 30_000, enabled: isIndexerConnected }
  );

  const alertsAggByAgentQ = trpc.indexer.alertsAggByAgent.useQuery(
    { from: timeRange, to: "now", topN: 20 },
    { retry: false, staleTime: 30_000, enabled: isIndexerConnected }
  );

  const handleRefresh = useCallback(() => {
    utils.wazuh.invalidate();
    utils.indexer.invalidate();
  }, [utils]);

  // ── Alerts (Indexer or empty fallback) ─────────────────────────────────
  const { alerts, totalAlerts } = useMemo(() => {
    if (isIndexerConnected && alertsSearchQ.data?.data) {
      const resp = alertsSearchQ.data.data as unknown as Record<string, unknown>;
      const hits = (resp.hits as Record<string, unknown>) ?? {};
      const hitArr = (hits.hits as Array<Record<string, unknown>>) ?? [];
      const total = typeof hits.total === "object" ? Number((hits.total as Record<string, unknown>).value ?? 0) : Number(hits.total ?? 0);
      const mapped = hitArr.map(h => ({ _id: String(h._id ?? ""), ...(h._source as Record<string, unknown> ?? {}) } as Record<string, unknown>));
      return { alerts: mapped, totalAlerts: total };
    }
    return { alerts: [] as Array<Record<string, unknown>>, totalAlerts: 0 };
  }, [alertsSearchQ.data, isIndexerConnected, levelFilter, agentFilter, searchQuery, page]);

  const alertsSource: "indexer" | "server" = isIndexerConnected && alertsSearchQ.data?.data ? "indexer" : "server";
  // ── Severity Timeline (Indexer or empty fallback) ──────────────────────────────
  const severityTimeline = useMemo(() => {
    if (isIndexerConnected && alertsAggByLevelQ.data?.data) {
      const resp = alertsAggByLevelQ.data.data as unknown as Record<string, unknown>;
      const aggs = resp.aggregations as Record<string, unknown> ?? {};
      const timeline = aggs.timeline as Record<string, unknown> ?? {};
      const buckets = (timeline.buckets as Array<Record<string, unknown>>) ?? [];
      return buckets.map(b => {
        const levels = b.levels as Record<string, unknown> ?? {};
        const levelBuckets = (levels.buckets as Array<Record<string, unknown>>) ?? [];
        const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
        levelBuckets.forEach(lb => {
          const lvl = Number(lb.key ?? 0);
          const cnt = Number(lb.doc_count ?? 0);
          if (lvl >= 12) counts.critical += cnt;
          else if (lvl >= 8) counts.high += cnt;
          else if (lvl >= 4) counts.medium += cnt;
          else if (lvl >= 2) counts.low += cnt;
          else counts.info += cnt;
        });
        const ts = new Date(String(b.key_as_string ?? ""));
        return { time: `${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}`, ...counts };
      });
    }
    return [];
  }, [alertsAggByLevelQ.data, isIndexerConnected]);

  const timelineSource: "indexer" | "server" = isIndexerConnected && alertsAggByLevelQ.data?.data ? "indexer" : "server";

  // ── Rule Distribution (Indexer or empty fallback) ──────────────────────────────
  const ruleDistribution = useMemo(() => {
    if (isIndexerConnected && alertsAggByRuleQ.data?.data) {
      const resp = alertsAggByRuleQ.data.data as unknown as Record<string, unknown>;
      const aggs = resp.aggregations as Record<string, unknown> ?? {};
      const topRules = aggs.top_rules as Record<string, unknown> ?? {};
      const buckets = (topRules.buckets as Array<Record<string, unknown>>) ?? [];
      return buckets.map(b => ({
        ruleId: String(b.key ?? ""),
        description: String(b.key ?? "Rule"),
        count: Number(b.doc_count ?? 0),
        level: 0,
      }));
    }
    return [];
  }, [alertsAggByRuleQ.data, isIndexerConnected]);

  const ruleDistSource: "indexer" | "server" = isIndexerConnected && alertsAggByRuleQ.data?.data ? "indexer" : "server";

  // ── Agent list for filter ──────────────────────────────────────────────
  const agentOptions = useMemo(() => {
    if (isIndexerConnected && alertsAggByAgentQ.data?.data) {
      const resp = alertsAggByAgentQ.data.data as unknown as Record<string, unknown>;
      const aggs = resp.aggregations as Record<string, unknown> ?? {};
      const topAgents = aggs.top_agents as Record<string, unknown> ?? {};
      const buckets = (topAgents.buckets as Array<Record<string, unknown>>) ?? [];
      return buckets.map(b => ({ id: String(b.key ?? ""), count: Number(b.doc_count ?? 0) })).filter(a => a.id !== "");
    }
    return [];
  }, [alertsAggByAgentQ.data, isIndexerConnected]);

  // ── Weekly heatmap (Server API or zeroed grid) ────────────────────────────────
  const weeklyHeatmap = useMemo(() => {
    if (isConnected && statsWeeklyQ.data) {
      const items = extractItems(statsWeeklyQ.data);
      return items.map((item, i) => ({ day: DAYS[Math.floor(i / 24)] ?? `Day ${Math.floor(i / 24)}`, hour: HOURS[i % 24] ?? `${i % 24}`, value: Number(item.totalItems ?? item.events ?? 0) }));
    }
    const grid: Array<{ day: string; hour: string; value: number }> = [];
    DAYS.forEach(day => {
      HOURS.forEach(h => {
        grid.push({ day, hour: h, value: 0 });
      });
    });
    return grid;
  }, [statsWeeklyQ.data, isConnected]);

  const maxHeatVal = useMemo(() => Math.max(...weeklyHeatmap.map(h => h.value), 1), [weeklyHeatmap]);

  // ── KPI counts ─────────────────────────────────────────────────────────
  const { criticalCount, highCount, mediumCount, lowCount } = useMemo(() => {
    let critical = 0, high = 0, medium = 0, low = 0;
    alerts.forEach(a => {
      const lvl = Number((a.rule as Record<string, unknown>)?.level ?? 0);
      if (lvl >= 12) critical++;
      else if (lvl >= 8) high++;
      else if (lvl >= 4) medium++;
      else low++;
    });
    return { criticalCount: critical, highCount: high, mediumCount: medium, lowCount: low };
  }, [alerts]);

  const totalPages = Math.ceil(totalAlerts / pageSize);
  const isLoading = statusQ.isLoading || indexerStatusQ.isLoading;

  return (
    <WazuhGuard>
      <div className="space-y-6">
        <PageHeader title="Alert Intelligence" subtitle="Dense SOC-grade alert table — severity trends, rule distribution, and weekly heatmap" onRefresh={handleRefresh} isLoading={isLoading} />

        {/* Time Range Presets */}
        <GlassPanel className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">Time Range:</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {TIME_PRESETS.map(p => (
              <Button key={p.value} variant="outline" size="sm"
                className={`h-7 text-xs border-border ${timeRange === p.value ? "bg-primary/20 text-primary border-primary/40" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
                onClick={() => { setTimeRange(p.value); setPage(0); }}
              >{p.label}</Button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <SourceBadge source={alertsSource} />
            <Button variant="outline" size="sm" className="h-7 text-xs bg-transparent border-border" onClick={handleRefresh}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </div>
        </GlassPanel>

        {/* ── Loading State ── */}
        {alertsSearchQ.isLoading && <IndexerLoadingState message="Fetching alerts from indexer…" />}
        {/* ── Error State ── */}
        {alertsSearchQ.isError && (
          <IndexerErrorState
            message="Failed to fetch alerts from indexer"
            detail={alertsSearchQ.error?.message}
            onRetry={() => alertsSearchQ.refetch()}
          />
        )}

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {alertsSearchQ.isLoading ? <StatCardSkeleton count={5} /> : (<>
          <StatCard label="Total Alerts" value={totalAlerts.toLocaleString()} icon={Zap} colorClass="text-primary" />
          <StatCard label="Critical (12+)" value={criticalCount} icon={AlertTriangle} colorClass="text-threat-critical" />
          <StatCard label="High (8-11)" value={highCount} icon={TrendingUp} colorClass="text-threat-high" />
          <StatCard label="Medium (4-7)" value={mediumCount} icon={BarChart3} colorClass="text-threat-medium" />
          <StatCard label="Low / Info" value={lowCount} icon={Shield} colorClass="text-info-cyan" />
          </>)}
        </div>

        {/* Charts Row: Severity Timeline + Rule Distribution */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {alertsSearchQ.isLoading ? (
            <>
              <ChartSkeleton variant="area" height={240} title="Severity Trends" className="lg:col-span-8" />
              <ChartSkeleton variant="bar" height={240} title="Top Firing Rules" className="lg:col-span-4" />
            </>
          ) : (<>
          <GlassPanel className="lg:col-span-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Severity Trends</h3>
              <SourceBadge source={timelineSource} />
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={severityTimeline}>
                <defs>
                  <linearGradient id="critGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.red} stopOpacity={0.5} /><stop offset="95%" stopColor={COLORS.red} stopOpacity={0} /></linearGradient>
                  <linearGradient id="highGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.orange} stopOpacity={0.4} /><stop offset="95%" stopColor={COLORS.orange} stopOpacity={0} /></linearGradient>
                  <linearGradient id="medGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.yellow} stopOpacity={0.3} /><stop offset="95%" stopColor={COLORS.yellow} stopOpacity={0} /></linearGradient>
                  <linearGradient id="lowGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.green} stopOpacity={0.3} /><stop offset="95%" stopColor={COLORS.green} stopOpacity={0} /></linearGradient>
                  <linearGradient id="infoGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.cyan} stopOpacity={0.2} /><stop offset="95%" stopColor={COLORS.cyan} stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.04 286 / 20%)" />
                <XAxis dataKey="time" tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 10 }} />
                <ReTooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="critical" stackId="1" stroke={COLORS.red} fill="url(#critGrad)" name="Critical" strokeWidth={2} />
                <Area type="monotone" dataKey="high" stackId="1" stroke={COLORS.orange} fill="url(#highGrad)" name="High" strokeWidth={1.5} />
                <Area type="monotone" dataKey="medium" stackId="1" stroke={COLORS.yellow} fill="url(#medGrad)" name="Medium" strokeWidth={1} />
                <Area type="monotone" dataKey="low" stackId="1" stroke={COLORS.green} fill="url(#lowGrad)" name="Low" strokeWidth={1} />
                <Area type="monotone" dataKey="info" stackId="1" stroke={COLORS.cyan} fill="url(#infoGrad)" name="Info" strokeWidth={1} />
                <Legend wrapperStyle={{ fontSize: 10, color: "oklch(0.65 0.02 286)" }} />
              </AreaChart>
            </ResponsiveContainer>
          </GlassPanel>

          <GlassPanel className="lg:col-span-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Top Firing Rules</h3>
              <SourceBadge source={ruleDistSource} />
            </div>
            <div className="space-y-2 max-h-[220px] overflow-y-auto">
              {ruleDistribution.map((r, i) => {
                const maxCount = ruleDistribution[0]?.count ?? 1;
                const pct = (r.count / maxCount) * 100;
                return (
                  <div key={r.ruleId} className="group">
                    <div className="flex items-center justify-between text-[10px] mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-muted-foreground w-4">{i + 1}.</span>
                        <span className="font-mono text-primary">{r.ruleId}</span>
                        <span className="text-muted-foreground truncate max-w-[120px]">{r.description}</span>
                      </div>
                      <span className="font-mono text-foreground font-medium shrink-0">{r.count.toLocaleString()}</span>
                    </div>
                    <div className="h-1 bg-secondary/30 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: r.level >= 12 ? COLORS.red : r.level >= 8 ? COLORS.orange : r.level >= 4 ? COLORS.yellow : COLORS.purple }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassPanel>
          </>)}
        </div>

        {/* Weekly Heatmap */}
        {alertsSearchQ.isLoading ? (
          <ChartSkeleton variant="heatmap" height={200} title="Weekly Alert Heatmap" />
        ) : (
        <GlassPanel>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Weekly Alert Heatmap</h3>
            <SourceBadge source="server" />
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[700px]">
              <div className="flex ml-12 mb-1">
                {HOURS.filter((_, i) => i % 3 === 0).map(h => <span key={h} className="text-[9px] text-muted-foreground" style={{ width: `${100 / 8}%` }}>{h}</span>)}
              </div>
              {DAYS.map(day => (
                <div key={day} className="flex items-center gap-1 mb-1">
                  <span className="text-[10px] text-muted-foreground w-10 text-right">{day}</span>
                  <div className="flex gap-[2px] flex-1">
                    {Array.from({ length: 24 }, (_, hourIdx) => {
                      const cell = weeklyHeatmap.find(h => h.day === day && h.hour === HOURS[hourIdx]);
                      const val = cell?.value ?? 0;
                      const intensity = val / maxHeatVal;
                      return (
                        <div key={hourIdx} className="flex-1 h-6 rounded-sm cursor-default" style={{
                          backgroundColor: intensity > 0.7 ? `oklch(0.637 ${0.237 * intensity} 25.331 / ${0.3 + intensity * 0.7})` : intensity > 0.3 ? `oklch(0.795 ${0.184 * intensity} 86.047 / ${0.3 + intensity * 0.7})` : `oklch(0.541 ${0.281 * intensity} 293.009 / ${0.15 + intensity * 0.5})`,
                        }} title={`${day} ${HOURS[hourIdx]}: ${val} events`} />
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-end gap-2 mt-2">
                <span className="text-[9px] text-muted-foreground">Less</span>
                {[0.1, 0.3, 0.5, 0.7, 0.9].map(i => (
                  <div key={i} className="w-4 h-4 rounded-sm" style={{ backgroundColor: i > 0.7 ? `oklch(0.637 ${0.237 * i} 25.331 / ${0.3 + i * 0.7})` : i > 0.3 ? `oklch(0.795 ${0.184 * i} 86.047 / ${0.3 + i * 0.7})` : `oklch(0.541 ${0.281 * i} 293.009 / ${0.15 + i * 0.5})` }} />
                ))}
                <span className="text-[9px] text-muted-foreground">More</span>
              </div>
            </div>
          </div>
        </GlassPanel>
        )}

        {/* Dense Alert Table */}
        <GlassPanel>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" /> Alert Stream ({totalAlerts.toLocaleString()})
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search alerts..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }} className="h-8 w-48 pl-8 text-xs bg-secondary/50 border-border" />
              </div>
              <Select value={levelFilter} onValueChange={(v) => { setLevelFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[120px] h-8 text-xs bg-secondary/50 border-border"><SelectValue placeholder="Level" /></SelectTrigger>
                <SelectContent className="bg-popover border-border max-h-60">
                  <SelectItem value="all">All Levels</SelectItem>
                  {Array.from({ length: 16 }, (_, i) => <SelectItem key={i} value={String(i)}>{`Level ${i}`}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={agentFilter} onValueChange={(v) => { setAgentFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[140px] h-8 text-xs bg-secondary/50 border-border"><SelectValue placeholder="Agent" /></SelectTrigger>
                <SelectContent className="bg-popover border-border max-h-60">
                  <SelectItem value="all">All Agents</SelectItem>
                  {agentOptions.map(a => <SelectItem key={a.id} value={a.id}>Agent {a.id} ({a.count})</SelectItem>)}
                </SelectContent>
              </Select>
              <ExportButton
                getData={() => alerts as Array<Record<string, unknown>>}
                baseName="alerts"
                columns={EXPORT_COLUMNS.alerts}
                context={levelFilter !== "all" ? `level-${levelFilter}` : agentFilter !== "all" ? `agent-${agentFilter}` : timeRange}
                label="Export"
              />
            </div>
            {/* Active geo-filter badges from ThreatMap click-to-filter */}
            {(countryFilter || srcipFilter) && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="text-[10px] text-muted-foreground">Active Filters:</span>
                {countryFilter && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    <Target className="h-3 w-3" /> Country: {countryFilter}
                    <button onClick={() => setCountryFilter("")} className="ml-1 hover:text-destructive">&times;</button>
                  </span>
                )}
                {srcipFilter && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-threat-high/10 text-threat-high border border-threat-high/20">
                    <Zap className="h-3 w-3" /> Source IP: {srcipFilter}
                    <button onClick={() => setSrcipFilter("")} className="ml-1 hover:text-destructive">&times;</button>
                  </span>
                )}
                <button
                  onClick={() => { setCountryFilter(""); setSrcipFilter(""); }}
                  className="text-[10px] text-muted-foreground hover:text-foreground underline"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>

          {alertsSearchQ.isLoading ? (
            <TableSkeleton columns={9} rows={12} columnWidths={[2, 1, 1, 3, 2, 1, 1, 1, 1]} />
          ) : (
          <div className="overflow-x-auto" aria-live="polite" aria-label="Alerts table">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border/30">
                {["Timestamp", "Level", "Rule ID", "Description", "Agent", "MITRE", "Source", "", ""].map((h, idx) => (
                  <th key={`${h}-${idx}`} className="text-left py-2 px-2 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {alerts.map((alert, i) => {
                  const a = alert as Record<string, unknown>;
                  const rule = (a.rule as Record<string, unknown>) ?? {};
                  const agent = (a.agent as Record<string, unknown>) ?? {};
                  const mitre = (rule.mitre as Record<string, unknown>) ?? {};
                  const mitreIds = Array.isArray(mitre.id) ? (mitre.id as string[]) : [];
                  const level = Number(rule.level ?? 0);
                  const ts = a.timestamp ? new Date(String(a.timestamp)) : null;
                  const srcip = (a.data as Record<string, unknown>)?.srcip;

                  return (
                    <tr key={String(alert._id ?? i)} className="border-b border-border/10 hover:bg-secondary/20 transition-colors cursor-pointer" onClick={() => setSelectedAlert(alert)}>
                      <td className="py-1.5 px-2 font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                        {ts ? ts.toLocaleString() : "—"}
                      </td>
                      <td className="py-1.5 px-2"><ThreatBadge level={threatLevelFromNumber(level)} /></td>
                      <td className="py-1.5 px-2 font-mono text-primary text-[10px]">{String(rule.id ?? "—")}</td>
                      <td className="py-1.5 px-2 text-foreground max-w-[300px] truncate">{String(rule.description ?? "—")}</td>
                      <td className="py-1.5 px-2">
                        <span className="text-[10px] font-mono text-muted-foreground">{String(agent.id ?? "")}</span>
                        <span className="text-[10px] text-foreground ml-1">{String(agent.name ?? "")}</span>
                      </td>
                      <td className="py-1.5 px-2">
                        {mitreIds.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {mitreIds.slice(0, 2).map(id => (
                              <span key={id} className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-mono">{id}</span>
                            ))}
                            {mitreIds.length > 2 && <span className="text-[9px] text-muted-foreground">+{mitreIds.length - 2}</span>}
                          </div>
                        ) : <span className="text-[10px] text-muted-foreground">—</span>}
                      </td>
                      <td className="py-1.5 px-2 font-mono text-[10px] text-muted-foreground">{srcip ? String(srcip) : "—"}</td>
                      <td className="py-1.5 px-2">
                        <Eye className="h-3 w-3 text-muted-foreground hover:text-primary transition-colors" />
                      </td>
                      <td className="py-1.5 px-2">
                        <SendToQueueButton alert={a} />
                      </td>
                    </tr>
                  );
                })}
                {alerts.length === 0 && (
                  <tr><td colSpan={9} className="py-12 text-center text-muted-foreground">
                    {alertsSearchQ.isLoading ? "Loading alerts..." : "No alerts found for the selected filters"}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/30">
              <p className="text-xs text-muted-foreground">Page {page + 1} of {totalPages} ({totalAlerts.toLocaleString()} alerts)</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-7 bg-transparent border-border"><ChevronLeft className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-7 bg-transparent border-border"><ChevronRight className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          )}
        </GlassPanel>

        {/* Alert Detail Dialog */}
        <Dialog open={!!selectedAlert} onOpenChange={(open) => !open && setSelectedAlert(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-card border-border">
            <DialogHeader>
              <DialogTitle className="font-display text-foreground flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" /> Alert Detail
              </DialogTitle>
            </DialogHeader>
            {selectedAlert ? ((): React.ReactNode => {
              const rule = (selectedAlert.rule as Record<string, unknown>) ?? {};
              const agent = (selectedAlert.agent as Record<string, unknown>) ?? {};
              const mitre = (rule.mitre as Record<string, unknown>) ?? {};
              const mitreIds = Array.isArray(mitre.id) ? (mitre.id as string[]) : [];
              const mitreTactics = Array.isArray(mitre.tactic) ? (mitre.tactic as string[]) : [];
              const mitreTechniques = Array.isArray(mitre.technique) ? (mitre.technique as string[]) : [];
              const data = (selectedAlert.data as Record<string, unknown>) ?? {};
              const level = Number(rule.level ?? 0);
              const hasGroups = Array.isArray(rule.groups) && (rule.groups as string[]).length > 0;
              const hasFullLog = Boolean(selectedAlert.full_log);

              return (
                <div className="space-y-4">
                  {/* Key fields */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {([
                      ["Timestamp", selectedAlert.timestamp ? new Date(String(selectedAlert.timestamp)).toLocaleString() : "—"],
                      ["Rule ID", rule.id], ["Level", level],
                      ["Agent", `${agent.id} — ${agent.name}`], ["Agent IP", agent.ip],
                      ["Manager", (selectedAlert.manager as Record<string, unknown>)?.name],
                      ["Decoder", (selectedAlert.decoder as Record<string, unknown>)?.name],
                      ["Location", selectedAlert.location],
                      ["Source IP", data.srcip], ["Dest IP", data.dstip],
                    ] as [string, unknown][]).map(([label, val]) => (
                      <div key={label} className="bg-secondary/30 rounded-lg p-3 border border-border/30">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
                        <p className="text-sm font-medium text-foreground mt-1 truncate font-mono">{String(val ?? "—")}</p>
                      </div>
                    ))}
                  </div>

                  {/* Severity */}
                  <div className="bg-secondary/20 rounded-lg p-3 border border-border/20">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Severity</p>
                    <div className="flex items-center gap-2">
                      <ThreatBadge level={threatLevelFromNumber(level)} />
                      <span className="text-sm text-foreground">{String(rule.description ?? "")}</span>
                    </div>
                  </div>

                  {/* Rule Groups */}
                  {hasGroups ? (
                    <div className="bg-secondary/20 rounded-lg p-3 border border-border/20">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Rule Groups</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(rule.groups as string[]).map(g => (
                          <span key={g} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/50 text-foreground border border-border/30">{g}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* MITRE */}
                  {mitreIds.length > 0 && (
                    <div className="bg-secondary/20 rounded-lg p-3 border border-border/20">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">MITRE ATT&CK</p>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <p className="text-[9px] text-muted-foreground mb-1">Techniques</p>
                          <div className="flex flex-wrap gap-1">
                            {mitreIds.map(id => (
                              <a key={id} href={`https://attack.mitre.org/techniques/${id.replace(".", "/")}/`} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/20 font-mono hover:bg-primary/25 transition-colors inline-flex items-center gap-1">
                                {id} <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground mb-1">Tactics</p>
                          <div className="flex flex-wrap gap-1">
                            {mitreTactics.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-threat-high/10 text-threat-high border border-threat-high/20">{t}</span>)}
                          </div>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground mb-1">Technique Names</p>
                          <div className="flex flex-wrap gap-1">
                            {mitreTechniques.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/50 text-foreground border border-border/30">{t}</span>)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Full Log */}
                  {hasFullLog ? (
                    <div className="bg-secondary/20 rounded-lg p-3 border border-border/20">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Full Log</p>
                      <pre className="text-[10px] font-mono text-foreground whitespace-pre-wrap break-all bg-secondary/30 rounded p-2 max-h-32 overflow-y-auto">{String(selectedAlert.full_log)}</pre>
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2">
                    <AddNoteDialog
                      entityType="alert"
                      entityId={String(rule.id ?? "")}
                      defaultTitle={`Alert: ${String(rule.description ?? rule.id ?? "Unknown")}`}
                      defaultSeverity={level >= 14 ? "critical" : level >= 10 ? "high" : level >= 7 ? "medium" : level >= 4 ? "low" : "info"}
                      triggerLabel="Annotate Alert"
                    />
                    <RawJsonViewer data={selectedAlert} title="Full Alert JSON" />
                  </div>
                </div>
              );
            })() : null}
          </DialogContent>
        </Dialog>
      </div>
    </WazuhGuard>
  );
}
