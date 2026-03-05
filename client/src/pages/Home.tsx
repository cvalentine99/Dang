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
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { EXPORT_COLUMNS } from "@/lib/exportUtils";

import {
  Activity, AlertTriangle, Shield, ShieldCheck, Bug, Server,
  Cpu, Zap, Users, Clock, Target, BarChart3, Wifi, WifiOff,
  ArrowUpRight, ArrowDownRight, Eye, FileSearch, Monitor,
  Database, Lock, Globe, TrendingUp, Layers, Radio, Radar,
  MapPin, Flame, Hash, TriangleAlert, GitCompare, CheckCircle2, X,
} from "lucide-react";
import { useMemo, useCallback, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";
import { useLocation } from "wouter";

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

const SEVERITY_COLORS: Record<string, string> = {
  "0": "oklch(0.65 0.02 286)",
  "1": "oklch(0.65 0.02 286)",
  "2": "oklch(0.65 0.05 286)",
  "3": COLORS.cyan,
  "4": COLORS.cyan,
  "5": COLORS.green,
  "6": COLORS.green,
  "7": COLORS.yellow,
  "8": COLORS.yellow,
  "9": COLORS.orange,
  "10": COLORS.orange,
  "11": COLORS.red,
  "12": COLORS.red,
  "13": COLORS.red,
  "14": COLORS.pink,
  "15": COLORS.pink,
};

const PIE_COLORS = [COLORS.green, COLORS.red, COLORS.yellow, COLORS.cyan, COLORS.purple, COLORS.orange];
const TOP_TALKER_COLORS = [COLORS.red, COLORS.orange, COLORS.yellow, COLORS.purple, COLORS.cyan, COLORS.green, COLORS.pink, COLORS.blue];

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-panel p-3 text-xs border border-glass-border">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color }} className="font-medium">{p.name}: {p.value?.toLocaleString()}</p>)}
    </div>
  );
}

function EpsGauge({ eps, maxEps }: { eps: number; maxEps: number }) {
  const pct = Math.min((eps / maxEps) * 100, 100);
  const color = pct > 80 ? COLORS.red : pct > 50 ? COLORS.yellow : COLORS.green;
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (pct / 100) * circumference * 0.75;
  return (
    <div className="flex flex-col items-center justify-center">
      <svg width="150" height="130" viewBox="0 0 120 110">
        <circle cx="60" cy="60" r="45" fill="none" stroke="oklch(0.25 0.03 286 / 40%)" strokeWidth="10"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`} strokeLinecap="round" transform="rotate(135 60 60)" />
        <circle cx="60" cy="60" r="45" fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(135 60 60)" className="transition-all duration-1000"
          style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
        <text x="60" y="55" textAnchor="middle" className="fill-foreground text-2xl font-display font-bold" fontSize="22">{eps.toLocaleString()}</text>
        <text x="60" y="72" textAnchor="middle" className="fill-muted-foreground" fontSize="9">events/sec</text>
      </svg>
      <p className="text-xs text-muted-foreground mt-1">Capacity: {pct.toFixed(0)}% of {maxEps.toLocaleString()} EPS</p>
    </div>
  );
}

function ActionCard({ icon: Icon, label, path, color }: { icon: React.ElementType; label: string; path: string; color: string }) {
  const [, setLocation] = useLocation();
  return (
    <button onClick={() => setLocation(path)}
      className="flex items-center gap-3 px-4 py-3 rounded-lg border transition-all hover:scale-[1.02] text-left w-full"
      style={{ borderColor: `${color}33`, background: `${color}0a` }}>
      <Icon className="h-4 w-4 shrink-0" style={{ color }} />
      <span className="text-xs font-medium text-foreground">{label}</span>
      <ArrowUpRight className="h-3 w-3 ml-auto text-muted-foreground" />
    </button>
  );
}

function ConnectivityItem({ label, subtitle, connected, status }: { label: string; subtitle: string; connected: boolean; status?: string }) {
  const statusColor = status === "green" ? "text-threat-low bg-threat-low/10 border-threat-low/20"
    : status === "yellow" ? "text-yellow-400 bg-yellow-400/10 border-yellow-400/20"
    : connected ? "text-threat-low bg-threat-low/10 border-threat-low/20"
    : "text-threat-high bg-threat-high/10 border-threat-high/20";
  const statusLabel = connected ? (status === "yellow" ? "Degraded" : "Online") : "Not Set";
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-secondary/20 border border-border/20">
      <div className="flex items-center gap-3">
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${connected ? "bg-threat-low/10 border border-threat-low/20" : "bg-threat-high/10 border border-threat-high/20"}`}>
          {connected ? <Wifi className="h-3.5 w-3.5 text-threat-low" /> : <WifiOff className="h-3.5 w-3.5 text-threat-high" />}
        </div>
        <div>
          <p className="text-xs font-medium text-foreground">{label}</p>
          <p className="text-[10px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusColor}`}>
        {statusLabel}
      </span>
    </div>
  );
}

/** Data source badge */
function SourceBadge({ source }: { source: "indexer" | "server" }) {
  const config = {
    indexer: { label: "Indexer", color: "text-threat-low bg-threat-low/10 border-threat-low/20" },
    server: { label: "Server API", color: "text-primary bg-primary/10 border-primary/20" },
  }[source];
  return (
    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded border ${config.color}`}>
      {config.label}
    </span>
  );
}

// ── Helper: extract Wazuh response shape ────────────────────────────────────
function extractItems(raw: unknown): Array<Record<string, unknown>> {
  const d = (raw as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  return (d?.affected_items as Array<Record<string, unknown>>) ?? [];
}



export default function Home() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();

  // ── Server API queries ──────────────────────────────────────────────────────
  const statusQ = trpc.wazuh.status.useQuery(undefined, { retry: 1, staleTime: 60_000 });
  const isConnected = statusQ.data?.configured === true && statusQ.data?.data != null;

  const agentSummaryQ = trpc.wazuh.agentSummaryStatus.useQuery(undefined, { retry: false, staleTime: 30_000, enabled: isConnected });
  const analysisdQ = trpc.wazuh.analysisd.useQuery(undefined, { retry: false, staleTime: 30_000, enabled: isConnected });
  const statsHourlyQ = trpc.wazuh.statsHourly.useQuery(undefined, { retry: false, staleTime: 60_000, enabled: isConnected });
  const managerStatusQ = trpc.wazuh.managerStatus.useQuery(undefined, { retry: false, staleTime: 60_000, enabled: isConnected });
  const rulesQ = trpc.wazuh.rules.useQuery({ limit: 10, sort: "-level" }, { retry: false, staleTime: 60_000, enabled: isConnected });
  const agentsQ = trpc.wazuh.agents.useQuery({ limit: 8, sort: "-dateAdd" }, { retry: false, staleTime: 30_000, enabled: isConnected });
  const mitreTacticsQ = trpc.wazuh.mitreTactics.useQuery(undefined, { retry: false, staleTime: 120_000, enabled: isConnected });
  const agentOverviewQ = trpc.wazuh.agentOverview.useQuery(undefined, { retry: false, staleTime: 60_000, enabled: isConnected });
  const logsSummaryQ = trpc.wazuh.managerLogsSummary.useQuery(undefined, { retry: false, staleTime: 60_000, enabled: isConnected });

  // ── Indexer queries ─────────────────────────────────────────────────────────
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
  const alertsGeoAggQ = trpc.indexer.alertsGeoAgg.useQuery(
    { ...indexerTimeRange, topN: 10 },
    { retry: false, staleTime: 60_000, enabled: isIndexerConnected }
  );
  const alertsGeoEnrichedQ = trpc.indexer.alertsGeoEnriched.useQuery(
    { ...indexerTimeRange, topN: 20 },
    { retry: false, staleTime: 60_000, enabled: isIndexerConnected }
  );
  const alertsAggByRuleQ = trpc.indexer.alertsAggByRule.useQuery(
    { ...indexerTimeRange, topN: 10 },
    { retry: false, staleTime: 30_000, enabled: isIndexerConnected }
  );
  const alertsAggByMitreQ = trpc.indexer.alertsAggByMitre.useQuery(
    { ...indexerTimeRange },
    { retry: false, staleTime: 60_000, enabled: isIndexerConnected }
  );

  // ── Anomaly detection query ─────────────────────────────────────────────
  const anomalyStatsQ = trpc.anomalies.stats.useQuery(undefined, { retry: false, staleTime: 30_000 });
  const anomalyListQ = trpc.anomalies.list.useQuery(
    { days: 7, acknowledged: false, limit: 5 },
    { retry: false, staleTime: 30_000 }
  );
  const ackMutation = trpc.anomalies.acknowledge.useMutation({
    onSuccess: () => {
      utils.anomalies.stats.invalidate();
      utils.anomalies.list.invalidate();
    },
  });
  const ackAllMutation = trpc.anomalies.acknowledgeAll.useMutation({
    onSuccess: () => {
      utils.anomalies.stats.invalidate();
      utils.anomalies.list.invalidate();
    },
  });
  const [anomalyBannerDismissed, setAnomalyBannerDismissed] = useState(false);

  const handleRefresh = useCallback(() => {
    utils.wazuh.invalidate();
    utils.indexer.invalidate();
    utils.anomalies.invalidate();
  }, [utils]);

  // ── Agent summary (real or fallback) ──────────────────────────────────────
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
  }, [agentSummaryQ.data, isConnected]);

  // ── EPS data ──────────────────────────────────────────────────────────────
  const epsData = useMemo(() => {
    if (isConnected && analysisdQ.data) {
      const items = extractItems(analysisdQ.data);
      const first = items[0];
      return { eps: Number(first?.events_received ?? first?.total_events_decoded ?? 0), totalEvents: Number(first?.total_events ?? first?.events_received ?? 0), decodedEvents: Number(first?.total_events_decoded ?? 0), droppedEvents: Number(first?.events_dropped ?? 0) };
    }
    return { eps: 0, totalEvents: 0, decodedEvents: 0, droppedEvents: 0 };
  }, [analysisdQ.data, isConnected]);

  // ── Hourly trend (Server API) ────────────────────────────────────────────
  const hourlyData = useMemo(() => {
    const raw = statsHourlyQ.data;
    const items = extractItems(raw);
    if (items.length === 0) return [];
    return items.map((item, i) => ({
      hour: `${String(item.hour ?? i).padStart(2, "0")}:00`,
      events: Number(item.totalall ?? item.totalItems ?? item.events ?? 0),
      alerts: Number(item.alerts ?? Math.round(Number(item.totalall ?? 0) * 0.12)),
    }));
  }, [statsHourlyQ.data, isConnected]);

  // ── Daemon status ─────────────────────────────────────────────────────────
  const daemonData = useMemo(() => {
    const raw = managerStatusQ.data;
    const items = extractItems(raw);
    const first = items[0];
    if (!first) return [];
    return Object.entries(first).filter(([k]) => !["affected_items", "total_affected_items", "total_failed_items", "failed_items"].includes(k)).map(([name, status]) => ({ name, status: String(status) }));
  }, [managerStatusQ.data, isConnected]);

  // ── Top rules (Server API definition) ─────────────────────────────────────
  const topRulesDef = useMemo(() => {
    const raw = rulesQ.data;
    return extractItems(raw).slice(0, 8);
  }, [rulesQ.data, isConnected]);

  // ── Recent agents ─────────────────────────────────────────────────────────
  const recentAgents = useMemo(() => {
    const raw = agentsQ.data;
    return extractItems(raw).slice(0, 8);
  }, [agentsQ.data, isConnected]);

  // ── MITRE tactics (Server API) ────────────────────────────────────────────
  const mitreData = useMemo(() => {
    const raw = mitreTacticsQ.data;
    return extractItems(raw).slice(0, 14).map(t => ({
      name: String(t.name ?? "").replace(/^TA\d+\s*-?\s*/, "").slice(0, 22),
      id: String(t.external_id ?? t.id ?? ""),
      count: Number(t.techniques_count ?? 1),
    }));
  }, [mitreTacticsQ.data, isConnected]);

  // ── Log summary ───────────────────────────────────────────────────────────
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

  // ═══════════════════════════════════════════════════════════════════════════
  // INDEXER DATA — Threat Trends, Top Talkers, Geo, Top Rules, MITRE
  // ═══════════════════════════════════════════════════════════════════════════

  /** Threat Trends: stacked severity area chart from alertsAggByLevel */
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

  /** Top Talkers: agents ranked by alert volume */
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

  const topTalkersSource: "indexer" | "server" = isIndexerConnected && alertsAggByAgentQ.data?.data ? "indexer" : "server";

  /** Geographic distribution — prefer GeoIP-enriched endpoint, fallback to basic agg, then empty */
  const geoData = useMemo(() => {
    // Try enriched GeoIP data first (includes coordinates, cities, IPs)
    if (isIndexerConnected && alertsGeoEnrichedQ.data?.data) {
      const enriched = alertsGeoEnrichedQ.data.data as Array<{
        country: string; count: number; avgLevel: number;
        lat: number; lng: number; cities: string[]; topIps: string[]; source: string;
      }>;
      if (enriched.length > 0) {
        return enriched.map(e => ({
          country: e.country,
          count: e.count,
          avgLevel: e.avgLevel,
          lat: e.lat,
          lng: e.lng,
          cities: e.cities,
          topIps: e.topIps,
          source: e.source,
        }));
      }
    }
    // Fallback to basic geo agg
    if (isIndexerConnected && alertsGeoAggQ.data?.data) {
      const aggs = (alertsGeoAggQ.data.data as unknown as Record<string, unknown>)?.aggregations as Record<string, unknown> | undefined;
      const countries = aggs?.countries as { buckets?: Array<{ key: string; doc_count: number; avg_level: { value: number } }> } | undefined;
      if (countries?.buckets) {
        return countries.buckets.map(b => ({
          country: b.key,
          count: b.doc_count,
          avgLevel: Math.round((b.avg_level?.value ?? 0) * 10) / 10,
        }));
      }
    }
    return [];
  }, [alertsGeoEnrichedQ.data, alertsGeoAggQ.data, isIndexerConnected]);

  const geoSource: "indexer" | "server" = isIndexerConnected && (alertsGeoEnrichedQ.data?.data || alertsGeoAggQ.data?.data) ? "indexer" : "server";

  /** Top Firing Rules from Indexer */
  const topFiringRules = useMemo(() => {
    if (isIndexerConnected && alertsAggByRuleQ.data?.data) {
      const aggs = (alertsAggByRuleQ.data.data as unknown as Record<string, unknown>)?.aggregations as Record<string, unknown> | undefined;
      const topRules = aggs?.top_rules as { buckets?: Array<{ key: string; doc_count: number; rule_description: { buckets: Array<{ key: string }> }; rule_level: { value: number } }> } | undefined;
      if (topRules?.buckets) {
        return topRules.buckets.map(b => ({
          ruleId: b.key,
          description: b.rule_description?.buckets?.[0]?.key ?? "—",
          count: b.doc_count,
          level: Math.round(b.rule_level?.value ?? 0),
        }));
      }
    }
    return [];
  }, [alertsAggByRuleQ.data, isIndexerConnected]);

  const topFiringSource: "indexer" | "server" = isIndexerConnected && alertsAggByRuleQ.data?.data ? "indexer" : "server";

  /** MITRE Tactic Trends from Indexer */
  const mitreTrends = useMemo(() => {
    if (isIndexerConnected && alertsAggByMitreQ.data?.data) {
      const aggs = (alertsAggByMitreQ.data.data as unknown as Record<string, unknown>)?.aggregations as Record<string, unknown> | undefined;
      const tactics = aggs?.tactics as { buckets?: Array<{ key: string; doc_count: number }> } | undefined;
      if (tactics?.buckets) {
        return tactics.buckets.map(b => ({
          tactic: b.key,
          count: b.doc_count,
          trend: 0,
        }));
      }
    }
    return [];
  }, [alertsAggByMitreQ.data, isIndexerConnected]);

  const mitreSource: "indexer" | "server" = isIndexerConnected && alertsAggByMitreQ.data?.data ? "indexer" : "server";

  const isLoading = statusQ.isLoading;

  return (
    <WazuhGuard>
      <div className="space-y-5">
        <PageHeader title="SOC Console" subtitle="Security Operations Center — Real-time threat intelligence and fleet telemetry" onRefresh={handleRefresh} isLoading={isLoading} />

        {/* ── Drift Anomaly Alert Banner ──────────────────────────────── */}
        {!anomalyBannerDismissed && anomalyStatsQ.data && anomalyStatsQ.data.unacknowledged > 0 && (
          <div className={`relative rounded-xl border p-4 backdrop-blur-md ${
            anomalyStatsQ.data.critical > 0
              ? "border-threat-critical/40 bg-threat-critical/5"
              : anomalyStatsQ.data.high > 0
              ? "border-threat-high/40 bg-threat-high/5"
              : "border-yellow-500/40 bg-yellow-500/5"
          }`}>
            <button
              onClick={() => setAnomalyBannerDismissed(true)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-start gap-4">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                anomalyStatsQ.data.critical > 0
                  ? "bg-threat-critical/20 border border-threat-critical/30"
                  : anomalyStatsQ.data.high > 0
                  ? "bg-threat-high/20 border border-threat-high/30"
                  : "bg-yellow-500/20 border border-yellow-500/30"
              }`}>
                <TriangleAlert className={`h-5 w-5 ${
                  anomalyStatsQ.data.critical > 0 ? "text-threat-critical" : anomalyStatsQ.data.high > 0 ? "text-threat-high" : "text-yellow-400"
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="text-sm font-display font-semibold text-foreground">
                    {anomalyStatsQ.data.unacknowledged} Drift Anomal{anomalyStatsQ.data.unacknowledged === 1 ? "y" : "ies"} Detected
                  </h3>
                  <div className="flex items-center gap-1.5">
                    {anomalyStatsQ.data.critical > 0 && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-threat-critical/30 bg-threat-critical/10 text-threat-critical">
                        {anomalyStatsQ.data.critical} Critical
                      </span>
                    )}
                    {anomalyStatsQ.data.high > 0 && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-threat-high/30 bg-threat-high/10 text-threat-high">
                        {anomalyStatsQ.data.high} High
                      </span>
                    )}
                    {anomalyStatsQ.data.medium > 0 && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 text-yellow-400">
                        {anomalyStatsQ.data.medium} Medium
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Statistical drift anomalies exceed the rolling average by 2+ standard deviations. Review and acknowledge to clear.
                </p>
                {/* Recent anomaly items */}
                {anomalyListQ.data && anomalyListQ.data.anomalies.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {anomalyListQ.data.anomalies.slice(0, 3).map((a) => (
                      <div key={a.id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-secondary/30 border border-border/20">
                        <div className="flex items-center gap-2 min-w-0">
                          <GitCompare className={`h-3.5 w-3.5 shrink-0 ${
                            a.severity === "critical" ? "text-threat-critical" : a.severity === "high" ? "text-threat-high" : "text-yellow-400"
                          }`} />
                          <span className="text-[11px] text-foreground truncate">{a.scheduleName || `Schedule #${a.scheduleId}`}</span>
                          <span className="text-[10px] font-mono text-muted-foreground">{a.driftPercent.toFixed(1)}%</span>
                          <span className="text-[10px] text-muted-foreground">({a.zScore.toFixed(1)}σ)</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-muted-foreground">{new Date(a.timestamp).toLocaleString()}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); ackMutation.mutate({ id: a.id }); }}
                            className="text-[10px] px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                            disabled={ackMutation.isPending}
                          >
                            <CheckCircle2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setLocation("/drift-analytics")}
                    className="text-xs px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                  >
                    View Drift Analytics
                  </button>
                  <button
                    onClick={() => ackAllMutation.mutate({})}
                    className="text-xs px-3 py-1.5 rounded-lg border border-border/30 bg-secondary/20 text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
                    disabled={ackAllMutation.isPending}
                  >
                    Acknowledge All
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── KPI Row ───────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <StatCard label="Total Agents" value={agentData.total} icon={Users} colorClass="text-primary" trend={agentData.active > 0 ? `${agentData.active} active` : undefined} trendUp={true} />
          <StatCard label="Active Agents" value={agentData.active} icon={Activity} colorClass="text-threat-low" />
          <StatCard label="Disconnected" value={agentData.disconnected} icon={AlertTriangle} colorClass="text-threat-high" trend={agentData.disconnected > 0 ? "Needs attention" : undefined} trendUp={false} />
          <StatCard label="Audit Events" value={logSummary.info.toLocaleString()} icon={Zap} colorClass="text-info-cyan" trend={logSummary.errors > 0 ? `${logSummary.errors} failures (24h)` : undefined} trendUp={false} />
          <StatCard label="Log Errors" value={logSummary.errors} icon={AlertTriangle} colorClass="text-threat-critical" trend={logSummary.warnings > 0 ? `${logSummary.warnings} warnings` : undefined} trendUp={false} />
          <StatCard label="Rules Loaded" value={topRulesDef.length > 0 ? topRulesDef.length : "—"} icon={Shield} colorClass="text-primary" />
        </div>

        {/* ── Row 2: EPS Gauge + Threat Trends (Indexer) + Fleet Status ──── */}
        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <ChartSkeleton variant="bar" height={210} title="Events Per Second" className="lg:col-span-3" />
            <ChartSkeleton variant="area" height={210} title="Threat Trends — Last 24h" className="lg:col-span-6" />
            <div className="lg:col-span-3 space-y-3">
              <div className="h-5" />
              {[1,2,3,4].map(i => <ChartSkeleton key={i} variant="bar" height={48} title="" />)}
            </div>
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <GlassPanel className="lg:col-span-3 flex flex-col items-center justify-center py-6">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Cpu className="h-4 w-4 text-primary" /> Events Per Second</h3>
              <SourceBadge source="server" />
            </div>
            <EpsGauge eps={epsData.eps} maxEps={10000} />
            <div className="grid grid-cols-2 gap-4 mt-4 w-full text-center">
              <div><p className="text-lg font-display font-bold text-foreground">{epsData.totalEvents.toLocaleString()}</p><p className="text-[10px] text-muted-foreground">Total Events</p></div>
              <div><p className="text-lg font-display font-bold text-foreground">{epsData.decodedEvents.toLocaleString()}</p><p className="text-[10px] text-muted-foreground">Decoded</p></div>
            </div>
            {epsData.droppedEvents > 0 && <p className="text-[10px] text-threat-high mt-2 flex items-center gap-1"><ArrowDownRight className="h-3 w-3" /> {epsData.droppedEvents.toLocaleString()} dropped</p>}
          </GlassPanel>

          <GlassPanel className="lg:col-span-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Threat Trends — Last 24h
              </h3>
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

          <div className="lg:col-span-3 flex flex-col gap-3">
            <div className="flex items-center gap-2 px-1">
              <Users className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-medium text-muted-foreground">Fleet Status</h3>
              <SourceBadge source="server" />
            </div>
            <GlassPanel className="!py-3 !px-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-threat-low/15 border border-threat-low/25 flex items-center justify-center shrink-0">
                  <Activity className="h-4 w-4 text-threat-low" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-display font-bold text-foreground leading-none">{agentData.active}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Active</p>
                </div>
                <div className="h-1.5 w-1.5 rounded-full bg-threat-low animate-pulse" />
              </div>
            </GlassPanel>
            <GlassPanel className="!py-3 !px-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-threat-high/15 border border-threat-high/25 flex items-center justify-center shrink-0">
                  <WifiOff className="h-4 w-4 text-threat-high" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-display font-bold text-foreground leading-none">{agentData.disconnected}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Disconnected</p>
                </div>
                {agentData.disconnected > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-threat-high/10 border border-threat-high/20 text-threat-high font-medium">Attention</span>}
              </div>
            </GlassPanel>
            <GlassPanel className="!py-3 !px-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-yellow-500/15 border border-yellow-500/25 flex items-center justify-center shrink-0">
                  <Clock className="h-4 w-4 text-yellow-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-display font-bold text-foreground leading-none">{agentData.never}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Never Connected</p>
                </div>
              </div>
            </GlassPanel>
            <GlassPanel className="!py-3 !px-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-info-cyan/15 border border-info-cyan/25 flex items-center justify-center shrink-0">
                  <Wifi className="h-4 w-4 text-info-cyan" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-display font-bold text-foreground leading-none">{agentData.pending}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Pending</p>
                </div>
              </div>
            </GlassPanel>
          </div>
        </div>
        )}

        {/* ── Row 3: Top Talkers + Geographic Heatmap + Top Firing Rules ─── */}
        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <ChartSkeleton variant="pie" height={220} title="Top Talkers" className="lg:col-span-4" />
            <ChartSkeleton variant="area" height={340} title="Geographic Threat Distribution" className="lg:col-span-4" />
            <ChartSkeleton variant="bar" height={340} title="Top Firing Rules" className="lg:col-span-4" />
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <GlassPanel className="lg:col-span-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Flame className="h-4 w-4 text-threat-high" /> Top Talkers</h3>
              <div className="flex items-center gap-2">
                <ExportButton getData={() => topTalkersData.map(t => ({ agent_id: t.agentId, agent_name: t.agentName, count: t.count }) as Record<string, unknown>)} baseName="top-talkers" columns={EXPORT_COLUMNS.topTalkers} compact />
                <SourceBadge source={topTalkersSource} />
              </div>
            </div>
            {topTalkersData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[320px] text-muted-foreground">
                <Flame className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-xs">No agent alert data available</p>
              </div>
            ) : (
              <div className="space-y-2">
                {topTalkersData.slice(0, 8).map((t, i) => {
                  const maxCount = topTalkersData[0]?.count ?? 1;
                  const pct = Math.max((t.count / maxCount) * 100, 4);
                  const barColor = TOP_TALKER_COLORS[i % TOP_TALKER_COLORS.length];
                  const rankBg = i === 0 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" : i === 1 ? "bg-slate-300/10 text-slate-300 border-slate-400/20" : i === 2 ? "bg-amber-700/15 text-amber-600 border-amber-700/25" : "bg-secondary/30 text-muted-foreground border-border/20";
                  return (
                    <div key={t.agentId} className="group relative rounded-lg border border-border/20 bg-secondary/10 hover:bg-secondary/25 hover:border-primary/20 transition-all duration-200 cursor-pointer px-3 py-2" onClick={() => setLocation(`/agents/${t.agentId}`)}>
                      <div className="flex items-center gap-3">
                        {/* Rank badge */}
                        <span className={`shrink-0 h-6 w-6 rounded-md border flex items-center justify-center text-[10px] font-bold font-mono ${rankBg}`}>
                          {i + 1}
                        </span>
                        {/* Agent info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-foreground truncate">{t.agentName}</span>
                            <span className="text-[9px] font-mono text-muted-foreground">#{t.agentId}</span>
                            <ThreatBadge level={threatLevelFromNumber(Math.round(t.avgLevel))} />
                          </div>
                          {/* Proportional bar */}
                          <div className="h-1.5 w-full rounded-full bg-secondary/40 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, backgroundColor: barColor, boxShadow: `0 0 8px ${barColor}50` }} />
                          </div>
                        </div>
                        {/* Count */}
                        <span className="shrink-0 text-xs font-mono font-semibold text-foreground tabular-nums">{t.count.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </GlassPanel>

          <GlassPanel className="lg:col-span-4 !p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Globe className="h-4 w-4 text-info-cyan" /> Geographic Threat Distribution</h3>
              <SourceBadge source={geoSource} />
            </div>
            <div className="h-[340px] relative">
              <ThreatMap data={geoData} className="w-full h-full" />
              {/* Legend overlay */}
              <div className="absolute bottom-2 left-2 flex items-center gap-2 px-2 py-1 rounded-md" style={{ background: 'rgba(15, 10, 26, 0.85)', backdropFilter: 'blur(8px)', border: '1px solid rgba(139, 92, 246, 0.15)' }}>
                <span className="text-[9px] text-muted-foreground">Severity:</span>
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#06b6d4' }} />
                <span className="text-[9px] text-muted-foreground">Info</span>
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#a855f7' }} />
                <span className="text-[9px] text-muted-foreground">Low</span>
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#eab308' }} />
                <span className="text-[9px] text-muted-foreground">Med</span>
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#f97316' }} />
                <span className="text-[9px] text-muted-foreground">High</span>
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: '#ef4444' }} />
                <span className="text-[9px] text-muted-foreground">Crit</span>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel className="lg:col-span-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Hash className="h-4 w-4 text-primary" /> Top Firing Rules</h3>
              <div className="flex items-center gap-2">
                <ExportButton getData={() => topFiringRules.map(r => ({ id: r.ruleId, description: r.description, level: r.level, count: r.count }) as Record<string, unknown>)} baseName="top-rules" columns={EXPORT_COLUMNS.topRules} compact />
                <SourceBadge source={topFiringSource} />
              </div>
            </div>
            <div className="space-y-1.5 max-h-[340px] overflow-y-auto">
              {topFiringRules.map((r) => (
                <div key={r.ruleId} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-secondary/20 transition-colors cursor-pointer" onClick={() => setLocation("/rules")}>
                  <span className="text-[10px] font-mono text-primary w-10 shrink-0">{r.ruleId}</span>
                  <ThreatBadge level={threatLevelFromNumber(r.level)} />
                  <span className="text-[10px] text-foreground truncate flex-1">{r.description}</span>
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">{r.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </GlassPanel>
        </div>
        )}

        {/* ── Row 4: Quick Actions + MITRE Trends (Indexer) + API Connectivity */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <GlassPanel className="lg:col-span-3">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /> Quick Actions</h3>
            <div className="space-y-2">
              <ActionCard icon={Eye} label="View Alerts" path="/alerts" color={COLORS.red} />
              <ActionCard icon={Bug} label="Vulnerabilities" path="/vulnerabilities" color={COLORS.orange} />
              <ActionCard icon={Target} label="MITRE ATT&CK" path="/mitre" color={COLORS.purple} />
              <ActionCard icon={ShieldCheck} label="Compliance" path="/compliance" color={COLORS.green} />
              <ActionCard icon={FileSearch} label="File Integrity" path="/fim" color={COLORS.cyan} />
              <ActionCard icon={Monitor} label="IT Hygiene" path="/hygiene" color={COLORS.yellow} />
              <ActionCard icon={Radar} label="Threat Intel" path="/threat-intel" color={COLORS.pink} />
            </div>
          </GlassPanel>

          <GlassPanel className="lg:col-span-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> MITRE ATT&CK Tactic Activity</h3>
              <SourceBadge source={mitreSource} />
            </div>
            <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
              {mitreTrends.map((t, i) => {
                const maxCount = mitreTrends[0]?.count ?? 1;
                const pct = (t.count / maxCount) * 100;
                return (
                  <div key={t.tactic} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-secondary/20 transition-colors cursor-pointer" onClick={() => setLocation("/mitre")}>
                    <span className="text-[10px] text-muted-foreground w-4 text-right">{i + 1}</span>
                    <span className="text-[10px] text-foreground truncate w-36">{t.tactic}</span>
                    <div className="flex-1 h-2 rounded-full bg-secondary/40 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: COLORS.purple, boxShadow: `0 0 6px ${COLORS.purple}40` }} />
                    </div>
                    <span className="text-[10px] font-mono text-foreground w-12 text-right">{t.count.toLocaleString()}</span>
                    {t.trend !== 0 && (
                      <span className={`text-[9px] flex items-center gap-0.5 ${t.trend > 0 ? "text-threat-high" : "text-threat-low"}`}>
                        {t.trend > 0 ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
                        {Math.abs(t.trend)}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </GlassPanel>

          <GlassPanel className="lg:col-span-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2"><Radio className="h-4 w-4 text-primary" /> API Connectivity</h3>
            <div className="space-y-2 mb-4">
              <ConnectivityItem label="Wazuh Manager" subtitle="REST API v4.x" connected={isConnected} />
              <ConnectivityItem label="Wazuh Indexer" subtitle="OpenSearch / Elasticsearch" connected={isIndexerConnected} status={indexerClusterStatus} />
              <ConnectivityItem label="AlienVault OTX" subtitle="Threat Intelligence Feed" connected={true} />
            </div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 mt-4 flex items-center gap-2"><Server className="h-4 w-4 text-primary" /> Manager Daemons</h3>
            <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
              {daemonData.map((d) => (
                <div key={d.name} className="flex items-center justify-between py-1.5 px-3 rounded bg-secondary/20 border border-border/20">
                  <span className="text-[11px] font-mono text-foreground">{d.name}</span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${d.status === "running" ? "text-threat-low bg-threat-low/10 border-threat-low/20" : "text-threat-critical bg-threat-critical/10 border-threat-critical/20"}`}>{d.status}</span>
                </div>
              ))}
            </div>
          </GlassPanel>
        </div>

        {/* ── Row 5: Event Ingestion + Fleet Agents ───────────────────────── */}
        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartSkeleton variant="area" height={210} title="Event Ingestion — Last 24h" />
            <ChartSkeleton variant="bar" height={210} title="Fleet Agents" />
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <GlassPanel>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Event Ingestion — Last 24h</h3>
              <div className="flex items-center gap-2">
                <SourceBadge source="server" />
                {(isConnected && statsHourlyQ.data) ? <RawJsonViewer data={statsHourlyQ.data as Record<string, unknown>} title="Hourly Stats" /> : null}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={hourlyData}>
                <defs>
                  <linearGradient id="gradEvents" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.purple} stopOpacity={0.4} /><stop offset="95%" stopColor={COLORS.purple} stopOpacity={0} /></linearGradient>
                  <linearGradient id="gradAlerts" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.red} stopOpacity={0.3} /><stop offset="95%" stopColor={COLORS.red} stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.04 286 / 20%)" />
                <XAxis dataKey="hour" tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 10 }} />
                <YAxis tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 10 }} />
                <ReTooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="events" stroke={COLORS.purple} fill="url(#gradEvents)" strokeWidth={2} name="Events" />
                <Area type="monotone" dataKey="alerts" stroke={COLORS.red} fill="url(#gradAlerts)" strokeWidth={2} name="Alerts" />
                <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.02 286)" }} />
              </AreaChart>
            </ResponsiveContainer>
          </GlassPanel>

          <GlassPanel>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Fleet Agents</h3>
              <div className="flex items-center gap-2">
                <SourceBadge source="server" />
                {(isConnected && agentsQ.data) ? <RawJsonViewer data={agentsQ.data as Record<string, unknown>} title="Agents Data" /> : null}
              </div>
            </div>
            {isLoading ? (
              <TableSkeleton columns={5} rows={6} columnWidths={[1, 2, 2, 2, 1]} />
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-border/30">
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">ID</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Name</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">IP</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">OS</th>
                  <th className="text-left py-2 px-2 text-muted-foreground font-medium">Status</th>
                </tr></thead>
                <tbody>
                  {recentAgents.map((agent) => {
                    const status = String(agent.status ?? "unknown");
                    return (
                      <tr key={String(agent.id)} className="border-b border-border/10 hover:bg-secondary/20 transition-colors cursor-pointer" onClick={() => setLocation("/agents")}>
                        <td className="py-2 px-2 font-mono text-primary">{String(agent.id)}</td>
                        <td className="py-2 px-2 text-foreground">{String(agent.name ?? "—")}</td>
                        <td className="py-2 px-2 font-mono text-muted-foreground">{String(agent.ip ?? "—")}</td>
                        <td className="py-2 px-2 text-muted-foreground truncate max-w-[120px]">{String((agent.os as Record<string, unknown>)?.name ?? (agent.os as Record<string, unknown>)?.platform ?? "—")}</td>
                        <td className="py-2 px-2">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${status === "active" ? "text-threat-low" : status === "disconnected" ? "text-threat-high" : "text-muted-foreground"}`}>
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
            )}
          </GlassPanel>
        </div>
        )}

        {/* ── Row 6: Agent Overview (Wazuh /overview/agents) ─────────────── */}
        {isConnected && (
          <GlassPanel>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Agent Overview
              </h3>
              <div className="flex items-center gap-2">
                <SourceBadge source="server" />
                {agentOverviewQ.data ? <RawJsonViewer data={agentOverviewQ.data as Record<string, unknown>} title="Agent Overview" /> : null}
              </div>
            </div>
            {agentOverviewQ.isLoading ? (
              <div className="animate-pulse space-y-2">
                {[...Array(3)].map((_, i) => <div key={i} className="h-4 bg-white/5 rounded" />)}
              </div>
            ) : agentOverviewQ.isError ? (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                <p className="text-xs text-red-300">Failed to load agent overview: {agentOverviewQ.error?.message}</p>
              </div>
            ) : agentOverviewQ.data ? (
              <div className="overflow-x-auto">
                <AgentOverviewTable data={agentOverviewQ.data} />
              </div>
            ) : null}
          </GlassPanel>
        )}
      </div>
    </WazuhGuard>
  );
}

/** Renders the agent overview data as a structured summary table */
function AgentOverviewTable({ data }: { data: unknown }) {
  const raw = data as Record<string, unknown>;
  const items = (raw?.data as Record<string, unknown>)?.affected_items as Array<Record<string, unknown>> | undefined;
  const nodes = items?.[0]?.nodes as Array<Record<string, unknown>> | undefined;

  if (!nodes?.length) {
    return <p className="text-xs text-muted-foreground">No overview data available.</p>;
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border/30">
          <th className="text-left py-2 px-2 text-muted-foreground font-medium">Node</th>
          <th className="text-left py-2 px-2 text-muted-foreground font-medium">Type</th>
          <th className="text-right py-2 px-2 text-muted-foreground font-medium">Active</th>
          <th className="text-right py-2 px-2 text-muted-foreground font-medium">Disconnected</th>
          <th className="text-right py-2 px-2 text-muted-foreground font-medium">Never Connected</th>
          <th className="text-right py-2 px-2 text-muted-foreground font-medium">Pending</th>
          <th className="text-right py-2 px-2 text-muted-foreground font-medium">Total</th>
        </tr>
      </thead>
      <tbody>
        {nodes.map((node, i) => {
          const count = node.count as Record<string, number> | undefined;
          return (
            <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
              <td className="py-2 px-2 font-mono text-primary">{String(node.node_name ?? "—")}</td>
              <td className="py-2 px-2 text-muted-foreground">{String(node.node_type ?? "—")}</td>
              <td className="py-2 px-2 text-right font-mono text-threat-low">{count?.active ?? 0}</td>
              <td className="py-2 px-2 text-right font-mono text-threat-high">{count?.disconnected ?? 0}</td>
              <td className="py-2 px-2 text-right font-mono text-yellow-400">{count?.never_connected ?? 0}</td>
              <td className="py-2 px-2 text-right font-mono text-info-cyan">{count?.pending ?? 0}</td>
              <td className="py-2 px-2 text-right font-mono font-bold text-foreground">{count?.total ?? 0}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
