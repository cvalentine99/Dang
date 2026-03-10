import { trpc } from "@/lib/trpc";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { WazuhGuard } from "@/components/shared/WazuhGuard";
import { ThreatBadge, threatLevelFromNumber } from "@/components/shared/ThreatBadge";
import { RawJsonViewer } from "@/components/shared/RawJsonViewer";
import { ExportButton } from "@/components/shared/ExportButton";
import { ThreatMap } from "@/components/shared/ThreatMap";
import { ChartSkeleton } from "@/components/shared/ChartSkeleton";
import { BrokerWarnings } from "@/components/shared/BrokerWarnings";
import { EXPORT_COLUMNS } from "@/lib/exportUtils";

import {
  Activity, AlertTriangle, Shield, ShieldCheck, Bug, Server,
  Cpu, Zap, Users, Clock, Target, BarChart3, Wifi, WifiOff,
  ArrowUpRight, ArrowDownRight, Eye, FileSearch, Monitor,
  Database, Lock, Globe, TrendingUp, Layers, Radio, Radar,
  MapPin, Flame, Hash, TriangleAlert, GitCompare, CheckCircle2, X,
  Brain, Network, FolderSearch, Inbox, Workflow, Lightbulb,
  ScanSearch, BookOpen, Crosshair, Package, HeartPulse, FolderOpen,
  UserCog, Settings, StickyNote, Gauge, ShieldAlert,
  ChevronRight, Sparkles, Play,
} from "lucide-react";
import { useMemo, useCallback, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { useLocation } from "wouter";

// ── Amethyst Nexus OKLCH palette ──────────────────────────────────────────────
const COLORS = {
  purple: "oklch(0.541 0.281 293.009)",
  cyan: "oklch(0.789 0.154 211.53)",
  green: "oklch(0.765 0.177 163.223)",
  yellow: "oklch(0.795 0.184 86.047)",
  red: "oklch(0.637 0.237 25.331)",
  orange: "oklch(0.705 0.191 22.216)",
  pink: "oklch(0.656 0.241 354.308)",
  blue: "oklch(0.623 0.214 259.815)",
};

const PIE_COLORS = [COLORS.green, COLORS.red, COLORS.yellow, COLORS.cyan, COLORS.purple, COLORS.orange];

// ── Shared tooltip ────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-panel p-3 text-xs border border-glass-border">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color }} className="font-medium">{p.name}: {p.value?.toLocaleString()}</p>)}
    </div>
  );
}

// ── EPS Gauge ─────────────────────────────────────────────────────────────────
function EpsGauge({ eps, maxEps }: { eps: number; maxEps: number }) {
  const pct = Math.min((eps / maxEps) * 100, 100);
  const color = pct > 80 ? COLORS.red : pct > 50 ? COLORS.yellow : COLORS.green;
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (pct / 100) * circumference * 0.75;
  return (
    <div className="flex flex-col items-center justify-center">
      <svg width="140" height="120" viewBox="0 0 120 110">
        <circle cx="60" cy="60" r="45" fill="none" stroke="oklch(0.25 0.03 286 / 40%)" strokeWidth="10"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`} strokeLinecap="round" transform="rotate(135 60 60)" />
        <circle cx="60" cy="60" r="45" fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(135 60 60)" className="transition-all duration-1000"
          style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
        <text x="60" y="55" textAnchor="middle" className="fill-foreground text-2xl font-display font-bold" fontSize="22">{eps.toLocaleString()}</text>
        <text x="60" y="72" textAnchor="middle" className="fill-muted-foreground" fontSize="9">events/sec</text>
      </svg>
      <p className="text-[10px] text-muted-foreground">Capacity: {pct.toFixed(0)}% of {maxEps.toLocaleString()} EPS</p>
    </div>
  );
}

// ── Source badge ───────────────────────────────────────────────────────────────
function SourceBadge({ source }: { source: "indexer" | "server" }) {
  const config = {
    indexer: { label: "Indexer", color: "text-threat-low bg-threat-low/10 border-threat-low/20" },
    server: { label: "Server API", color: "text-primary bg-primary/10 border-primary/20" },
  }[source];
  return <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded border ${config.color}`}>{config.label}</span>;
}

// ── Connectivity dot ──────────────────────────────────────────────────────────
function StatusDot({ connected, label, subtitle }: { connected: boolean; label: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-2 px-3 rounded-lg bg-secondary/20 border border-border/20">
      <div className={`h-2 w-2 rounded-full shrink-0 ${connected ? "bg-threat-low shadow-[0_0_6px] shadow-threat-low/50" : "bg-threat-high shadow-[0_0_6px] shadow-threat-high/50"}`} />
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-foreground truncate">{label}</p>
        {subtitle && <p className="text-[9px] text-muted-foreground">{subtitle}</p>}
      </div>
      <span className={`ml-auto text-[9px] font-medium px-1.5 py-0.5 rounded-full border shrink-0 ${connected ? "text-threat-low bg-threat-low/10 border-threat-low/20" : "text-threat-high bg-threat-high/10 border-threat-high/20"}`}>
        {connected ? "Online" : "Offline"}
      </span>
    </div>
  );
}

// ── Navigation card ───────────────────────────────────────────────────────────
function NavCard({ icon: Icon, label, path, color, description }: { icon: React.ElementType; label: string; path: string; color: string; description: string }) {
  const [, setLocation] = useLocation();
  return (
    <button onClick={() => setLocation(path)}
      className="group flex flex-col gap-2 p-3.5 rounded-xl border transition-all duration-200 hover:scale-[1.02] hover:shadow-lg text-left w-full"
      style={{ borderColor: `${color}25`, background: `${color}06` }}>
      <div className="flex items-center justify-between">
        <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div>
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{description}</p>
      </div>
    </button>
  );
}

// ── Helper: extract Wazuh response shape ──────────────────────────────────────
function extractItems(raw: unknown): Array<Record<string, unknown>> {
  const d = (raw as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  return (d?.affected_items as Array<Record<string, unknown>>) ?? [];
}

// ── AgentOverviewTable — node-level agent breakdown ──────────────────────────
function AgentOverviewTable({ data }: { data: unknown }) {
  const items = extractItems(data);
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-6">No agent overview data available</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-border/30">
            <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">node_name</th>
            <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">node_type</th>
            <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">active</th>
            <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">disconnected</th>
            <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">never_connected</th>
            <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">pending</th>
            <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const nodeName = String(item.node_name ?? "—");
            const nodeType = String(item.node_type ?? "—");
            const active = Number(item.active ?? 0);
            const disconnected = Number(item.disconnected ?? 0);
            const never_connected = Number(item.never_connected ?? 0);
            const pending = Number(item.pending ?? 0);
            const total = Number(item.total ?? active + disconnected + never_connected + pending);
            return (
              <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                <td className="py-1.5 px-2 font-mono text-primary">{nodeName}</td>
                <td className="py-1.5 px-2 text-foreground">{nodeType}</td>
                <td className="py-1.5 px-2 text-right text-threat-low font-mono">{active}</td>
                <td className="py-1.5 px-2 text-right text-threat-high font-mono">{disconnected}</td>
                <td className="py-1.5 px-2 text-right text-muted-foreground font-mono">{never_connected}</td>
                <td className="py-1.5 px-2 text-right text-yellow-400 font-mono">{pending}</td>
                <td className="py-1.5 px-2 text-right text-foreground font-mono font-semibold">{total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── AgentSummaryPanel — aggregate status counts ──────────────────────────────
function AgentSummaryPanel({ data }: { data: unknown }) {
  const items = extractItems(data);
  const first = items[0];
  if (!first) {
    return <p className="text-xs text-muted-foreground text-center py-6">No agent summary data available</p>;
  }
  const statuses = [
    { key: "active", label: "Active", color: "text-threat-low", bgColor: "bg-threat-low" },
    { key: "disconnected", label: "Disconnected", color: "text-threat-high", bgColor: "bg-threat-high" },
    { key: "never_connected", label: "Never Connected", color: "text-muted-foreground", bgColor: "bg-muted-foreground" },
    { key: "pending", label: "Pending", color: "text-yellow-400", bgColor: "bg-yellow-400" },
  ];
  const total = Number(first.total ?? 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/20 border border-border/20">
        <span className="text-xs font-medium text-foreground">Total Agents</span>
        <span className="text-sm font-display font-bold text-foreground">{total.toLocaleString()}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {statuses.map(s => {
          const val = Number(first[s.key] ?? 0);
          const pct = total > 0 ? (val / total) * 100 : 0;
          return (
            <div key={s.key} className="py-2 px-3 rounded-lg bg-secondary/20 border border-border/20">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] font-medium ${s.color}`}>{s.label}</span>
                <span className={`text-xs font-mono font-semibold ${s.color}`}>{val.toLocaleString()}</span>
              </div>
              <div className="h-1 rounded-full bg-secondary/40 overflow-hidden">
                <div className={`h-full rounded-full ${s.bgColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function Home() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();

  // ── Server API queries ────────────────────────────────────────────────────
  const statusQ = trpc.wazuh.status.useQuery(undefined, { retry: 1, staleTime: 60_000 });
  const isConnected = statusQ.data?.configured === true && statusQ.data?.data != null;

  const agentSummaryQ = trpc.wazuh.agentSummaryStatus.useQuery(undefined, { retry: false, staleTime: 30_000, enabled: isConnected });
  const analysisdQ = trpc.wazuh.analysisd.useQuery(undefined, { retry: false, staleTime: 30_000, enabled: isConnected });
  const statsHourlyQ = trpc.wazuh.statsHourly.useQuery(undefined, { retry: false, staleTime: 60_000, enabled: isConnected });
  const managerStatusQ = trpc.wazuh.managerStatus.useQuery(undefined, { retry: false, staleTime: 60_000, enabled: isConnected });
  const rulesQ = trpc.wazuh.rules.useQuery({ limit: 10, sort: "-level" }, { retry: false, staleTime: 60_000, enabled: isConnected });
  const agentsQ = trpc.wazuh.agents.useQuery({ limit: 8, sort: "-dateAdd" }, { retry: false, staleTime: 30_000, enabled: isConnected });
  const mitreTacticsQ = trpc.wazuh.mitreTactics.useQuery(undefined, { retry: false, staleTime: 120_000, enabled: isConnected });
  const logsSummaryQ = trpc.wazuh.managerLogsSummary.useQuery(undefined, { retry: false, staleTime: 60_000, enabled: isConnected });
  const agentOverviewQ = trpc.wazuh.agentOverview.useQuery(undefined, { retry: false, staleTime: 60_000, enabled: isConnected });
  const agentsSummaryQ = trpc.wazuh.agentsSummary.useQuery(undefined, { retry: false, staleTime: 60_000, enabled: isConnected });

  // ── Indexer queries ───────────────────────────────────────────────────────
  const indexerStatusQ = trpc.indexer.status.useQuery(undefined, { retry: 1, staleTime: 60_000 });
  const isIndexerConnected = indexerStatusQ.data?.configured === true && indexerStatusQ.data?.healthy === true;
  const indexerClusterStatus = isIndexerConnected ? String((indexerStatusQ.data?.data as Record<string, unknown>)?.status ?? "unknown") : undefined;

  const [indexerTimeRange] = useState({ from: "now-24h", to: "now" });

  const alertsAggByLevelQ = trpc.indexer.alertsAggByLevel.useQuery(
    { ...indexerTimeRange, interval: "1h" },
    { retry: false, staleTime: 30_000, enabled: isIndexerConnected }
  );
  const alertsAggByAgentQ = trpc.indexer.alertsAggByAgent.useQuery(
    { ...indexerTimeRange, topN: 8 },
    { retry: false, staleTime: 30_000, enabled: isIndexerConnected }
  );
  const alertsGeoEnrichedQ = trpc.indexer.alertsGeoEnriched.useQuery(
    { ...indexerTimeRange, topN: 20 },
    { retry: false, staleTime: 60_000, enabled: isIndexerConnected }
  );
  const alertsGeoAggQ = trpc.indexer.alertsGeoAgg.useQuery(
    { ...indexerTimeRange, topN: 10 },
    { retry: false, staleTime: 60_000, enabled: isIndexerConnected }
  );
  const alertsAggByRuleQ = trpc.indexer.alertsAggByRule.useQuery(
    { ...indexerTimeRange, topN: 10 },
    { retry: false, staleTime: 30_000, enabled: isIndexerConnected }
  );
  const alertsAggByMitreQ = trpc.indexer.alertsAggByMitre.useQuery(
    { ...indexerTimeRange },
    { retry: false, staleTime: 30_000, enabled: isIndexerConnected }
  );

  // ── Anomaly detection ─────────────────────────────────────────────────────
  const anomalyStatsQ = trpc.anomalies.stats.useQuery(undefined, { retry: false, staleTime: 30_000 });
  const anomalyListQ = trpc.anomalies.list.useQuery(
    { days: 7, acknowledged: false, limit: 5 },
    { retry: false, staleTime: 30_000 }
  );
  const ackMutation = trpc.anomalies.acknowledge.useMutation({
    onSuccess: () => { utils.anomalies.stats.invalidate(); utils.anomalies.list.invalidate(); },
  });
  const ackAllMutation = trpc.anomalies.acknowledgeAll.useMutation({
    onSuccess: () => { utils.anomalies.stats.invalidate(); utils.anomalies.list.invalidate(); },
  });
  const [anomalyBannerDismissed, setAnomalyBannerDismissed] = useState(false);

  const handleRefresh = useCallback(() => {
    utils.wazuh.invalidate();
    utils.indexer.invalidate();
    utils.anomalies.invalidate();
    utils.wazuh.agentOverview.invalidate();
    utils.wazuh.agentsSummary.invalidate();
  }, [utils]);

  // ═══════════════════════════════════════════════════════════════════════════
  // DERIVED DATA
  // ═══════════════════════════════════════════════════════════════════════════

  const agentData = useMemo(() => {
    const raw = agentSummaryQ.data;
    const d = (raw as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    if (!d) return { total: 0, active: 0, disconnected: 0, never: 0, pending: 0 };
    const items = d.affected_items as Array<Record<string, unknown>> | undefined;
    const first = items?.[0] ?? d;
    const connection = (first as Record<string, unknown>)?.connection as Record<string, number> | undefined;
    if (connection) {
      return { total: Number((first as Record<string, unknown>).total ?? 0), active: connection.active ?? 0, disconnected: connection.disconnected ?? 0, never: connection.never_connected ?? 0, pending: connection.pending ?? 0 };
    }
    return { total: Number(first?.total ?? first?.active ?? 0) + Number(first?.disconnected ?? 0) + Number(first?.never_connected ?? 0), active: Number(first?.active ?? 0), disconnected: Number(first?.disconnected ?? 0), never: Number(first?.never_connected ?? 0), pending: Number(first?.pending ?? 0) };
  }, [agentSummaryQ.data]);

  const epsData = useMemo(() => {
    if (isConnected && analysisdQ.data) {
      const items = extractItems(analysisdQ.data);
      const first = items[0];
      return { eps: Number(first?.events_received ?? first?.total_events_decoded ?? 0), totalEvents: Number(first?.total_events ?? first?.events_received ?? 0), decodedEvents: Number(first?.total_events_decoded ?? 0), droppedEvents: Number(first?.events_dropped ?? 0) };
    }
    return { eps: 0, totalEvents: 0, decodedEvents: 0, droppedEvents: 0 };
  }, [analysisdQ.data, isConnected]);

  const hourlyData = useMemo(() => {
    const items = extractItems(statsHourlyQ.data);
    if (items.length === 0) return [];
    return items.map((item, i) => ({
      hour: `${String(item.hour ?? i).padStart(2, "0")}:00`,
      events: Number(item.totalall ?? item.totalItems ?? item.events ?? 0),
    }));
  }, [statsHourlyQ.data]);

  const daemonData = useMemo(() => {
    const items = extractItems(managerStatusQ.data);
    const first = items[0];
    if (!first) return [];
    return Object.entries(first).filter(([k]) => !["affected_items", "total_affected_items", "total_failed_items", "failed_items"].includes(k)).map(([name, status]) => ({ name, status: String(status) }));
  }, [managerStatusQ.data]);

  const runningDaemons = daemonData.filter(d => d.status === "running").length;
  const totalDaemons = daemonData.length;

  const topRulesDef = useMemo(() => extractItems(rulesQ.data).slice(0, 8), [rulesQ.data]);

  const recentAgents = useMemo(() => extractItems(agentsQ.data).slice(0, 6), [agentsQ.data]);

  const mitreData = useMemo(() => {
    return extractItems(mitreTacticsQ.data).slice(0, 14).map(t => ({
      name: String(t.name ?? "").replace(/^TA\d+\s*-?\s*/, "").slice(0, 22),
      id: String(t.external_id ?? t.id ?? ""),
      count: Number(t.techniques_count ?? 1),
    }));
  }, [mitreTacticsQ.data]);

  const logSummary = useMemo(() => {
    if (isConnected && logsSummaryQ.data) {
      const items = extractItems(logsSummaryQ.data);
      const first = items[0];
      if (first) {
        let errors = 0, warnings = 0, info = 0;
        for (const [, v] of Object.entries(first)) {
          if (v && typeof v === "object") { const sub = v as Record<string, number>; errors += sub.error ?? 0; warnings += sub.warning ?? 0; info += sub.info ?? 0; }
        }
        return { errors, warnings, info };
      }
    }
    return { errors: 0, warnings: 0, info: 0 };
  }, [logsSummaryQ.data, isConnected]);

  const agentPieData = useMemo(() => [
    { name: "Active", value: agentData.active },
    { name: "Disconnected", value: agentData.disconnected },
    { name: "Never Connected", value: agentData.never },
    { name: "Pending", value: agentData.pending },
  ].filter(d => d.value > 0), [agentData]);

  // ── Indexer-derived data ──────────────────────────────────────────────────
  const threatTrendsData = useMemo(() => {
    if (isIndexerConnected && alertsAggByLevelQ.data?.data) {
      const aggs = (alertsAggByLevelQ.data.data as unknown as Record<string, unknown>)?.aggregations as Record<string, unknown> | undefined;
      const timeline = aggs?.timeline as { buckets?: Array<{ key_as_string: string; levels: { buckets: Array<{ key: number; doc_count: number }> } }> } | undefined;
      if (timeline?.buckets) {
        return timeline.buckets.map(b => {
          const levelMap: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
          for (const lb of b.levels.buckets) {
            const lvl = lb.key;
            if (lvl >= 12) levelMap.critical += lb.doc_count;
            else if (lvl >= 9) levelMap.high += lb.doc_count;
            else if (lvl >= 6) levelMap.medium += lb.doc_count;
            else if (lvl >= 3) levelMap.low += lb.doc_count;
            else levelMap.info += lb.doc_count;
          }
          const ts = new Date(b.key_as_string);
          return { hour: `${String(ts.getHours()).padStart(2, "0")}:00`, ...levelMap };
        });
      }
    }
    return [];
  }, [alertsAggByLevelQ.data, isIndexerConnected]);

  const threatTrendsSource: "indexer" | "server" = isIndexerConnected && alertsAggByLevelQ.data?.data ? "indexer" : "server";

  const topTalkersData = useMemo(() => {
    if (isIndexerConnected && alertsAggByAgentQ.data?.data) {
      const aggs = (alertsAggByAgentQ.data.data as unknown as Record<string, unknown>)?.aggregations as Record<string, unknown> | undefined;
      const topAgents = aggs?.top_agents as { buckets?: Array<{ key: string; doc_count: number; agent_name: { buckets: Array<{ key: string }> }; avg_level: { value: number } }> } | undefined;
      if (topAgents?.buckets) {
        return topAgents.buckets.map(b => ({
          agentId: b.key,
          agentName: b.agent_name?.buckets?.[0]?.key ?? `Agent ${b.key}`,
          count: b.doc_count,
          avgLevel: Math.round((b.avg_level?.value ?? 0) * 10) / 10,
        }));
      }
    }
    return [];
  }, [alertsAggByAgentQ.data, isIndexerConnected]);

  const geoData = useMemo(() => {
    if (isIndexerConnected && alertsGeoEnrichedQ.data?.data) {
      const enriched = alertsGeoEnrichedQ.data.data as Array<{
        country: string; count: number; avgLevel: number;
        lat: number; lng: number; cities: string[]; topIps: string[]; source: string;
      }>;
      if (enriched.length > 0) return enriched;
    }
    if (isIndexerConnected && alertsGeoAggQ.data?.data) {
      const aggs = (alertsGeoAggQ.data.data as unknown as Record<string, unknown>)?.aggregations as Record<string, unknown> | undefined;
      const countries = aggs?.countries as { buckets?: Array<{ key: string; doc_count: number; avg_level: { value: number } }> } | undefined;
      if (countries?.buckets) {
        return countries.buckets.map(b => ({
          country: b.key, count: b.doc_count, avgLevel: Math.round((b.avg_level?.value ?? 0) * 10) / 10,
        }));
      }
    }
    return [];
  }, [alertsGeoEnrichedQ.data, alertsGeoAggQ.data, isIndexerConnected]);

  const topFiringRules = useMemo(() => {
    if (isIndexerConnected && alertsAggByRuleQ.data?.data) {
      const aggs = (alertsAggByRuleQ.data.data as unknown as Record<string, unknown>)?.aggregations as Record<string, unknown> | undefined;
      const topRules = aggs?.top_rules as { buckets?: Array<{ key: string; doc_count: number; rule_description: { buckets: Array<{ key: string }> }; rule_level: { value: number } }> } | undefined;
      if (topRules?.buckets) {
        return topRules.buckets.map(b => ({
          ruleId: b.key, description: b.rule_description?.buckets?.[0]?.key ?? "—",
          count: b.doc_count, level: Math.round(b.rule_level?.value ?? 0),
        }));
      }
    }
    return [];
  }, [alertsAggByRuleQ.data, isIndexerConnected]);

  const mitreTrends = useMemo(() => {
    if (isIndexerConnected && alertsAggByMitreQ.data?.data) {
      const aggs = (alertsAggByMitreQ.data.data as unknown as Record<string, unknown>)?.aggregations as Record<string, unknown> | undefined;
      const tactics = aggs?.tactics as { buckets?: Array<{ key: string; doc_count: number }> } | undefined;
      if (tactics?.buckets) {
        return tactics.buckets.map(b => ({ tactic: b.key, count: b.doc_count }));
      }
    }
    return [];
  }, [alertsAggByMitreQ.data, isIndexerConnected]);

  const anomalyStats = anomalyStatsQ.data;
  const isLoading = statusQ.isLoading;

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <WazuhGuard>
      <div className="space-y-5">
        <PageHeader
          title="SOC Console"
          subtitle="Security Operations Center — Real-time threat intelligence, fleet telemetry, and analyst workflows"
          onRefresh={handleRefresh}
          isLoading={isLoading}
        />

        {/* ═══════════════════════════════════════════════════════════════════
            ROW 1: DRIFT ANOMALY ALERT BANNER
        ═══════════════════════════════════════════════════════════════════ */}
        {!anomalyBannerDismissed && anomalyStats && anomalyStats.unacknowledged > 0 && (
          <div className={`relative rounded-xl border p-4 backdrop-blur-md ${
            anomalyStats.critical > 0 ? "border-threat-critical/40 bg-threat-critical/5"
              : anomalyStats.high > 0 ? "border-threat-high/40 bg-threat-high/5"
              : "border-yellow-500/40 bg-yellow-500/5"
          }`}>
            <button onClick={() => setAnomalyBannerDismissed(true)} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-4">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                anomalyStats.critical > 0 ? "bg-threat-critical/20 border border-threat-critical/30"
                  : anomalyStats.high > 0 ? "bg-threat-high/20 border border-threat-high/30"
                  : "bg-yellow-500/20 border border-yellow-500/30"
              }`}>
                <TriangleAlert className={`h-5 w-5 ${anomalyStats.critical > 0 ? "text-threat-critical" : anomalyStats.high > 0 ? "text-threat-high" : "text-yellow-400"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-sm font-display font-semibold text-foreground">
                    {anomalyStats.unacknowledged} Drift Anomal{anomalyStats.unacknowledged === 1 ? "y" : "ies"} Detected
                  </h3>
                  <div className="flex items-center gap-1.5">
                    {anomalyStats.critical > 0 && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-threat-critical/30 bg-threat-critical/10 text-threat-critical">{anomalyStats.critical} Critical</span>}
                    {anomalyStats.high > 0 && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-threat-high/30 bg-threat-high/10 text-threat-high">{anomalyStats.high} High</span>}
                    {anomalyStats.medium > 0 && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 text-yellow-400">{anomalyStats.medium} Medium</span>}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Statistical drift anomalies exceed the rolling average by 2+ standard deviations.</p>
                {anomalyListQ.data && anomalyListQ.data.anomalies.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {anomalyListQ.data.anomalies.slice(0, 3).map((a) => (
                      <div key={a.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-secondary/30 border border-border/20">
                        <div className="flex items-center gap-2 min-w-0">
                          <GitCompare className={`h-3.5 w-3.5 shrink-0 ${a.severity === "critical" ? "text-threat-critical" : a.severity === "high" ? "text-threat-high" : "text-yellow-400"}`} />
                          <span className="text-[11px] text-foreground truncate">{a.scheduleName || `Schedule #${a.scheduleId}`}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">{a.driftPercent.toFixed(1)}%</span>
                          <span className="text-[10px] text-muted-foreground">({a.zScore.toFixed(1)}σ)</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-muted-foreground">{new Date(a.timestamp).toLocaleString()}</span>
                          <button onClick={(e) => { e.stopPropagation(); ackMutation.mutate({ id: a.id }); }}
                            className="text-[10px] px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                            disabled={ackMutation.isPending}>
                            <CheckCircle2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button onClick={() => setLocation("/drift-analytics")} className="text-xs px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium">View Drift Analytics</button>
                  <button onClick={() => ackAllMutation.mutate({})} className="text-xs px-3 py-1.5 rounded-lg border border-border/30 bg-secondary/20 text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors" disabled={ackAllMutation.isPending}>Acknowledge All</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            ROW 2: PLATFORM HEALTH STRIP + KPI CARDS
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Platform Health */}
          <GlassPanel className="xl:col-span-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 text-primary" /> Platform Health
            </h3>
            <div className="space-y-2">
              <StatusDot connected={isConnected} label="Wazuh Manager" subtitle="REST API v4.x" />
              <StatusDot connected={isIndexerConnected} label="Wazuh Indexer" subtitle={indexerClusterStatus ? `Cluster: ${indexerClusterStatus}` : "OpenSearch"} />
              <StatusDot connected={true} label="AlienVault OTX" subtitle="Threat Intel Feed" />
              <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/20 border border-border/20">
                <div className="flex items-center gap-2.5">
                  <Server className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[11px] font-medium text-foreground">Daemons</span>
                </div>
                <span className={`text-[10px] font-mono ${runningDaemons === totalDaemons && totalDaemons > 0 ? "text-threat-low" : totalDaemons === 0 ? "text-muted-foreground" : "text-threat-high"}`}>
                  {totalDaemons > 0 ? `${runningDaemons}/${totalDaemons} running` : "—"}
                </span>
              </div>
            </div>
          </GlassPanel>

          {/* KPI Cards */}
          <div className="xl:col-span-9 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Total Agents" value={agentData.total} icon={Users} colorClass="text-primary" trend={agentData.active > 0 ? `${agentData.active} active` : undefined} trendUp={true} />
            <StatCard label="Active Agents" value={agentData.active} icon={Activity} colorClass="text-threat-low" />
            <StatCard label="Disconnected" value={agentData.disconnected} icon={AlertTriangle} colorClass="text-threat-high" trend={agentData.disconnected > 0 ? "Needs attention" : undefined} trendUp={false} />
            <StatCard label="Audit Events" value={logSummary.info.toLocaleString()} icon={Zap} colorClass="text-info-cyan" trend={logSummary.errors > 0 ? `${logSummary.errors} failures` : undefined} trendUp={false} />
            <StatCard label="Log Errors" value={logSummary.errors} icon={AlertTriangle} colorClass="text-threat-critical" trend={logSummary.warnings > 0 ? `${logSummary.warnings} warnings` : undefined} trendUp={false} />
            <StatCard label="Rules Loaded" value={topRulesDef.length > 0 ? topRulesDef.length : "—"} icon={Shield} colorClass="text-primary" />
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            ROW 3: EPS GAUGE + THREAT TRENDS + FLEET PIE
        ═══════════════════════════════════════════════════════════════════ */}
        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <ChartSkeleton variant="bar" height={210} title="Events Per Second" className="lg:col-span-3" />
            <ChartSkeleton variant="area" height={210} title="Threat Trends — Last 24h" className="lg:col-span-6" />
            <ChartSkeleton variant="bar" height={210} title="Fleet Composition" className="lg:col-span-3" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <GlassPanel className="lg:col-span-3 flex flex-col items-center justify-center py-5">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-2"><Cpu className="h-3.5 w-3.5 text-primary" /> Events Per Second</h3>
                <SourceBadge source="server" />
              </div>
              <EpsGauge eps={epsData.eps} maxEps={10000} />
              <div className="grid grid-cols-2 gap-4 mt-3 w-full text-center">
                <div><p className="text-base font-display font-bold text-foreground">{epsData.totalEvents.toLocaleString()}</p><p className="text-[10px] text-muted-foreground">Total Events</p></div>
                <div><p className="text-base font-display font-bold text-foreground">{epsData.decodedEvents.toLocaleString()}</p><p className="text-[10px] text-muted-foreground">Decoded</p></div>
              </div>
              {epsData.droppedEvents > 0 && <p className="text-[10px] text-threat-high mt-2 flex items-center gap-1"><ArrowDownRight className="h-3 w-3" /> {epsData.droppedEvents.toLocaleString()} dropped</p>}
            </GlassPanel>

            <GlassPanel className="lg:col-span-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-2"><TrendingUp className="h-3.5 w-3.5 text-primary" /> Threat Trends — Last 24h</h3>
                <SourceBadge source={threatTrendsSource} />
              </div>
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={threatTrendsData}>
                  <defs>
                    <linearGradient id="gradCritical" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.pink} stopOpacity={0.5} /><stop offset="95%" stopColor={COLORS.pink} stopOpacity={0} /></linearGradient>
                    <linearGradient id="gradHigh" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.red} stopOpacity={0.4} /><stop offset="95%" stopColor={COLORS.red} stopOpacity={0} /></linearGradient>
                    <linearGradient id="gradMedium" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.yellow} stopOpacity={0.3} /><stop offset="95%" stopColor={COLORS.yellow} stopOpacity={0} /></linearGradient>
                    <linearGradient id="gradLow" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.green} stopOpacity={0.2} /><stop offset="95%" stopColor={COLORS.green} stopOpacity={0} /></linearGradient>
                    <linearGradient id="gradInfo" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.cyan} stopOpacity={0.15} /><stop offset="95%" stopColor={COLORS.cyan} stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.04 286 / 20%)" />
                  <XAxis dataKey="hour" tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 10 }} />
                  <YAxis tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 10 }} />
                  <ReTooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="info" stackId="1" stroke={COLORS.cyan} fill="url(#gradInfo)" strokeWidth={1} name="Info (0-2)" />
                  <Area type="monotone" dataKey="low" stackId="1" stroke={COLORS.green} fill="url(#gradLow)" strokeWidth={1} name="Low (3-5)" />
                  <Area type="monotone" dataKey="medium" stackId="1" stroke={COLORS.yellow} fill="url(#gradMedium)" strokeWidth={1.5} name="Medium (6-8)" />
                  <Area type="monotone" dataKey="high" stackId="1" stroke={COLORS.red} fill="url(#gradHigh)" strokeWidth={2} name="High (9-11)" />
                  <Area type="monotone" dataKey="critical" stackId="1" stroke={COLORS.pink} fill="url(#gradCritical)" strokeWidth={2} name="Critical (12+)" />
                  <Legend wrapperStyle={{ fontSize: 10, color: "oklch(0.65 0.02 286)" }} />
                </AreaChart>
              </ResponsiveContainer>
            </GlassPanel>

            <GlassPanel className="lg:col-span-3 flex flex-col">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-2"><Users className="h-3.5 w-3.5 text-primary" /> Fleet Composition</h3>
                <SourceBadge source="server" />
              </div>
              {agentPieData.length > 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={agentPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value" strokeWidth={0}>
                        {agentPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                      <ReTooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 10, color: "oklch(0.65 0.02 286)" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-xs text-muted-foreground">No agent data</p>
                </div>
              )}
            </GlassPanel>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            ROW 4: GEO THREAT MAP + TOP TALKERS + TOP FIRING RULES
        ═══════════════════════════════════════════════════════════════════ */}
        {!isLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <GlassPanel className="lg:col-span-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-primary" /> Geographic Threat Distribution</h3>
                <SourceBadge source={isIndexerConnected ? "indexer" : "server"} />
              </div>
              {geoData.length > 0 ? (
                <ThreatMap data={geoData as Array<{ country: string; count: number; avgLevel: number; lat?: number; lng?: number; cities?: string[]; topIps?: string[] }>} />
              ) : (
                <div className="h-[260px] flex items-center justify-center rounded-lg border border-border/20 bg-secondary/10">
                  <p className="text-xs text-muted-foreground">Connect Indexer for geographic data</p>
                </div>
              )}
            </GlassPanel>

            <GlassPanel className="lg:col-span-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-2"><Flame className="h-3.5 w-3.5 text-primary" /> Top Talkers</h3>
                <SourceBadge source={isIndexerConnected ? "indexer" : "server"} />
              </div>
              <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
                {topTalkersData.length > 0 ? topTalkersData.map((t, i) => {
                  const maxCount = topTalkersData[0]?.count ?? 1;
                  const pct = (t.count / maxCount) * 100;
                  return (
                    <div key={t.agentId} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-secondary/20 transition-colors cursor-pointer" onClick={() => setLocation("/agents")}>
                      <span className="text-[10px] text-muted-foreground w-4 text-right">{i + 1}</span>
                      <span className="text-[10px] font-mono text-primary w-8 shrink-0">{t.agentId}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-foreground truncate">{t.agentName}</p>
                        <div className="h-1 rounded-full bg-secondary/40 overflow-hidden mt-0.5">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: COLORS.red }} />
                        </div>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">{t.count.toLocaleString()}</span>
                    </div>
                  );
                }) : (
                  <p className="text-xs text-muted-foreground text-center py-8">Connect Indexer for top talkers</p>
                )}
              </div>
            </GlassPanel>

            <GlassPanel className="lg:col-span-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-2"><Hash className="h-3.5 w-3.5 text-primary" /> Top Firing Rules</h3>
                <div className="flex items-center gap-2">
                  <ExportButton getData={() => topFiringRules.map(r => ({ id: r.ruleId, description: r.description, level: r.level, count: r.count }) as Record<string, unknown>)} baseName="top-rules" columns={EXPORT_COLUMNS.topRules} compact />
                  <SourceBadge source={isIndexerConnected ? "indexer" : "server"} />
                </div>
              </div>
              <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
                {topFiringRules.length > 0 ? topFiringRules.map((r) => (
                  <div key={r.ruleId} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-secondary/20 transition-colors cursor-pointer" onClick={() => setLocation("/rules")}>
                    <span className="text-[10px] font-mono text-primary w-10 shrink-0">{r.ruleId}</span>
                    <ThreatBadge level={threatLevelFromNumber(r.level)} />
                    <span className="text-[10px] text-foreground truncate flex-1">{r.description}</span>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">{r.count.toLocaleString()}</span>
                  </div>
                )) : (
                  <p className="text-xs text-muted-foreground text-center py-8">Connect Indexer for rule analytics</p>
                )}
              </div>
            </GlassPanel>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            ROW 5: EVENT INGESTION + MITRE TACTICS + FLEET AGENTS
        ═══════════════════════════════════════════════════════════════════ */}
        {!isLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <GlassPanel className="lg:col-span-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-2"><BarChart3 className="h-3.5 w-3.5 text-primary" /> Event Ingestion — 24h</h3>
                <div className="flex items-center gap-2">
                  <SourceBadge source="server" />
                  {statsHourlyQ.data ? <RawJsonViewer data={statsHourlyQ.data as Record<string, unknown>} title="Hourly Stats" /> : null}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={hourlyData}>
                  <defs>
                    <linearGradient id="gradEvents" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.purple} stopOpacity={0.4} /><stop offset="95%" stopColor={COLORS.purple} stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.04 286 / 20%)" />
                  <XAxis dataKey="hour" tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 9 }} />
                  <YAxis tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 9 }} />
                  <ReTooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="events" stroke={COLORS.purple} fill="url(#gradEvents)" strokeWidth={2} name="Events" />
                </AreaChart>
              </ResponsiveContainer>
            </GlassPanel>

            <GlassPanel className="lg:col-span-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-2"><Target className="h-3.5 w-3.5 text-primary" /> MITRE ATT&CK Tactics</h3>
                <SourceBadge source={isIndexerConnected ? "indexer" : "server"} />
              </div>
              <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                {(mitreTrends.length > 0 ? mitreTrends : mitreData.map(m => ({ tactic: m.name, count: m.count }))).map((t, i) => {
                  const maxCount = (mitreTrends.length > 0 ? mitreTrends : mitreData.map(m => ({ tactic: m.name, count: m.count })))[0]?.count ?? 1;
                  const pct = (t.count / maxCount) * 100;
                  return (
                    <div key={t.tactic} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-secondary/20 transition-colors cursor-pointer" onClick={() => setLocation("/mitre")}>
                      <span className="text-[10px] text-muted-foreground w-4 text-right">{i + 1}</span>
                      <span className="text-[10px] text-foreground truncate w-32">{t.tactic}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-secondary/40 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: COLORS.purple, boxShadow: `0 0 6px ${COLORS.purple}40` }} />
                      </div>
                      <span className="text-[10px] font-mono text-foreground w-10 text-right">{t.count.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </GlassPanel>

            <GlassPanel className="lg:col-span-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-primary" /> Recent Agents</h3>
                <div className="flex items-center gap-2">
                  <SourceBadge source="server" />
                  {agentsQ.data ? <RawJsonViewer data={agentsQ.data as Record<string, unknown>} title="Agents Data" /> : null}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead><tr className="border-b border-border/30">
                    <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">ID</th>
                    <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">Name</th>
                    <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">Status</th>
                  </tr></thead>
                  <tbody>
                    {recentAgents.map((agent) => {
                      const status = String(agent.status ?? "unknown");
                      return (
                        <tr key={String(agent.id)} className="border-b border-border/10 hover:bg-secondary/20 transition-colors cursor-pointer" onClick={() => setLocation("/agents")}>
                          <td className="py-1.5 px-2 font-mono text-primary">{String(agent.id)}</td>
                          <td className="py-1.5 px-2 text-foreground truncate max-w-[100px]">{String(agent.name ?? "—")}</td>
                          <td className="py-1.5 px-2">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${status === "active" ? "text-threat-low" : status === "disconnected" ? "text-threat-high" : "text-muted-foreground"}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${status === "active" ? "bg-threat-low" : status === "disconnected" ? "bg-threat-high" : "bg-muted-foreground"}`} />
                              {status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </GlassPanel>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            ROW 5.5: AGENT OVERVIEW & AGENT SUMMARY
        ═══════════════════════════════════════════════════════════════════ */}
        {!isLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Agent Overview — node-level breakdown */}
            <GlassPanel className="lg:col-span-7">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-2"><Server className="h-3.5 w-3.5 text-primary" /> Agent Overview</h3>
                <div className="flex items-center gap-2">
                  <SourceBadge source="server" />
                  {agentOverviewQ.data ? <RawJsonViewer data={agentOverviewQ.data as Record<string, unknown>} title="Agent Overview" /> : null}
                </div>
              </div>
              <AgentOverviewTable data={agentOverviewQ.data} />
            </GlassPanel>

            {/* Agent Summary — aggregate status counts */}
            <GlassPanel className="lg:col-span-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium text-muted-foreground flex items-center gap-2"><Users className="h-3.5 w-3.5 text-primary" /> Agent Summary</h3>
                <div className="flex items-center gap-2">
                  <SourceBadge source="server" />
                  {agentsSummaryQ.data ? <RawJsonViewer data={agentsSummaryQ.data as Record<string, unknown>} title="agentsSummary" /> : null}
                </div>
              </div>
              <BrokerWarnings data={agentsSummaryQ.data} context="agentsSummary" />
              <AgentSummaryPanel data={agentsSummaryQ.data} />
            </GlassPanel>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            ROW 6: FEATURE NAVIGATION GRID — All Platform Capabilities
        ═══════════════════════════════════════════════════════════════════ */}
        <div>
          <div className="flex items-center gap-2 mb-3 px-1">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-display font-semibold text-foreground">Platform Capabilities</h3>
            <span className="text-[10px] text-muted-foreground ml-1">Navigate to any feature</span>
          </div>

          {/* Operations & Detection */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-3">
            <NavCard icon={Activity} label="Fleet Command" path="/agents" color={COLORS.green} description="Agent health, OS, and connection status" />
            <NavCard icon={Radar} label="Threat Intel" path="/threat-intel" color={COLORS.pink} description="AlienVault OTX pulse correlation" />
            <NavCard icon={Eye} label="Alerts Timeline" path="/alerts" color={COLORS.red} description="Real-time alert stream with severity" />
            <NavCard icon={Bug} label="Vulnerabilities" path="/vulnerabilities" color={COLORS.orange} description="CVE scanning and risk scoring" />
            <NavCard icon={Target} label="MITRE ATT&CK" path="/mitre" color={COLORS.purple} description="Tactic/technique mapping matrix" />
            <NavCard icon={Crosshair} label="Threat Hunting" path="/hunting" color={COLORS.red} description="Custom queries across all indices" />
          </div>

          {/* Posture & Compliance */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-3">
            <NavCard icon={ShieldCheck} label="Compliance" path="/compliance" color={COLORS.green} description="PCI-DSS, HIPAA, GDPR, CIS-CAT" />
            <NavCard icon={FileSearch} label="File Integrity" path="/fim" color={COLORS.cyan} description="FIM events and change tracking" />
            <NavCard icon={Monitor} label="IT Hygiene" path="/hygiene" color={COLORS.yellow} description="System hardening posture checks" />
            <NavCard icon={Package} label="Fleet Inventory" path="/fleet-inventory" color={COLORS.blue} description="Syscollector hardware and packages" />
            <NavCard icon={GitCompare} label="Drift Analytics" path="/drift-analytics" color={COLORS.orange} description="Statistical anomaly detection" />
            <NavCard icon={BookOpen} label="Ruleset Explorer" path="/rules" color={COLORS.purple} description="Rule definitions and decoders" />
          </div>

          {/* Intelligence & Analyst */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-3">
            <NavCard icon={Brain} label="Security Analyst" path="/analyst" color={COLORS.purple} description="AI-powered threat analysis chat" />
            <NavCard icon={Network} label="Knowledge Graph" path="/graph" color={COLORS.cyan} description="Entity relationship visualization" />
            <NavCard icon={FolderSearch} label="Investigations" path="/investigations" color={COLORS.blue} description="Case management and evidence" />
            <NavCard icon={Inbox} label="Alert Queue" path="/alert-queue" color={COLORS.red} description="Prioritized triage queue" />
            <NavCard icon={Workflow} label="Triage Pipeline" path="/triage" color={COLORS.orange} description="Automated classification workflow" />
            <NavCard icon={Lightbulb} label="Living Cases" path="/living-cases" color={COLORS.yellow} description="Evolving investigation cases" />
          </div>

          {/* System & Admin */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            <NavCard icon={Server} label="Cluster Health" path="/cluster" color={COLORS.green} description="Nodes, daemons, cache, and config" />
            <NavCard icon={Lock} label="Security Explorer" path="/security" color={COLORS.red} description="RBAC roles, policies, and rules" />
            <NavCard icon={Layers} label="Broker Coverage" path="/admin/broker-coverage" color={COLORS.purple} description="API endpoint wiring audit" />
            <NavCard icon={Zap} label="Param Playground" path="/admin/broker-playground" color={COLORS.yellow} description="Test broker params interactively" />
            <NavCard icon={Cpu} label="DGX Health" path="/admin/dgx-health" color={COLORS.cyan} description="Nemotron model and GPU metrics" />
            <NavCard icon={Settings} label="Connection Settings" path="/admin/settings" color={COLORS.blue} description="Wazuh, Indexer, and OTX config" />
          </div>
        </div>
      </div>
    </WazuhGuard>
  );
}
