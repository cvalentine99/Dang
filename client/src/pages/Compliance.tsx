import { trpc } from "@/lib/trpc";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { StatCard } from "@/components/shared/StatCard";
import { IndexerLoadingState, IndexerErrorState, StatCardSkeleton } from "@/components/shared/IndexerStates";
import { ChartSkeleton } from "@/components/shared/ChartSkeleton";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { WazuhGuard } from "@/components/shared/WazuhGuard";
import { ThreatBadge } from "@/components/shared/ThreatBadge";
import { RawJsonViewer } from "@/components/shared/RawJsonViewer";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  ShieldCheck, ShieldAlert, CheckCircle2, XCircle, MinusCircle,
  Search, Layers, ChevronLeft, ChevronRight, Database, Activity,
  AlertTriangle, Clock, TrendingUp, BarChart3, Eye,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, AreaChart, Area,
  RadialBarChart, RadialBar,
} from "recharts";

const COLORS = {
  purple: "oklch(0.541 0.281 293.009)",
  green: "oklch(0.765 0.177 163.223)",
  red: "oklch(0.637 0.237 25.331)",
  yellow: "oklch(0.795 0.184 86.047)",
  cyan: "oklch(0.789 0.154 211.53)",
  gray: "oklch(0.551 0.02 286)",
  orange: "oklch(0.705 0.191 22.216)",
};

const SEVERITY_COLORS: Record<string, string> = {
  Critical: COLORS.red,
  High: COLORS.orange,
  Medium: COLORS.yellow,
  Low: COLORS.green,
};

const FRAMEWORKS = [
  { id: "pci_dss", label: "PCI DSS", icon: "💳", indexerField: "pci_dss", desc: "Payment Card Industry" },
  { id: "nist_800_53", label: "NIST 800-53", icon: "🏛️", indexerField: "nist_800_53", desc: "Federal Information Systems" },
  { id: "hipaa", label: "HIPAA", icon: "🏥", indexerField: "hipaa", desc: "Health Information Privacy" },
  { id: "gdpr", label: "GDPR", icon: "🇪🇺", indexerField: "gdpr", desc: "EU Data Protection" },
  { id: "tsc", label: "TSC", icon: "📋", indexerField: "tsc", desc: "Trust Services Criteria" },
];

const TIME_RANGES = [
  { label: "24h", value: "24h", ms: 86400000 },
  { label: "7d", value: "7d", ms: 604800000 },
  { label: "30d", value: "30d", ms: 2592000000 },
];

function SourceBadge({ source }: { source: "indexer" | "server" }) {
  const cfg = source === "indexer" ? { bg: "bg-green-500/10", text: "text-green-400", label: "Indexer" }
    : { bg: "bg-blue-500/10", text: "text-blue-400", label: "Server API" };
  return <span className={`text-[9px] px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text} font-mono`}>{cfg.label}</span>;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover/95 backdrop-blur-md border border-border/40 rounded-lg px-3 py-2 shadow-xl">
      {label ? <p className="text-[10px] text-muted-foreground mb-1 font-mono">{label}</p> : null}
      {payload.map((p, i) => <p key={i} className="text-xs font-medium" style={{ color: p.color }}>{p.name}: <span className="font-bold">{typeof p.value === "number" ? p.value.toLocaleString() : p.value}</span></p>)}
    </div>
  );
}

/* ── Enhanced ScoreGauge with animated ring and glow ── */
function ScoreGauge({ score, label, size = "md" }: { score: number; label: string; size?: "sm" | "md" | "lg" }) {
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? COLORS.green : score >= 60 ? COLORS.yellow : COLORS.red;
  const glowColor = score >= 80 ? "oklch(0.765 0.177 163.223 / 30%)" : score >= 60 ? "oklch(0.795 0.184 86.047 / 30%)" : "oklch(0.637 0.237 25.331 / 30%)";
  const dim = size === "sm" ? 80 : size === "lg" ? 120 : 100;
  const scale = dim / 100;
  return (
    <div className="flex flex-col items-center group">
      <div className="relative">
        <svg width={dim} height={dim} viewBox="0 0 100 100" className="drop-shadow-sm">
          {/* Background track */}
          <circle cx="50" cy="50" r="40" fill="none" stroke="oklch(0.3 0.04 286 / 15%)" strokeWidth="7" />
          {/* Glow ring */}
          <circle cx="50" cy="50" r="40" fill="none" stroke={glowColor} strokeWidth="12" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 50 50)" className="transition-all duration-1000 ease-out" style={{ filter: `blur(4px)` }} />
          {/* Main ring */}
          <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 50 50)" className="transition-all duration-1000 ease-out" />
          {/* Score text */}
          <text x="50" y="44" textAnchor="middle" fill="oklch(0.93 0.005 286)" fontSize={18 * scale} fontWeight="bold" className="font-display">{score}%</text>
          <text x="50" y="60" textAnchor="middle" fill="oklch(0.55 0.02 286)" fontSize={8 * scale} className="uppercase tracking-wider">Score</text>
        </svg>
      </div>
      <span className="text-xs font-medium text-muted-foreground mt-1.5 text-center max-w-[110px] truncate group-hover:text-foreground transition-colors">{label}</span>
    </div>
  );
}

function extractItems(raw: unknown): Array<Record<string, unknown>> {
  const d = (raw as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  return (d?.affected_items as Array<Record<string, unknown>>) ?? [];
}

/* ── Compliance Posture Meter (compact radial) ── */
function PostureMeter({ score }: { score: number }) {
  const data = [{ name: "score", value: score, fill: score >= 80 ? COLORS.green : score >= 60 ? COLORS.yellow : COLORS.red }];
  return (
    <div className="relative w-[140px] h-[80px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart cx="50%" cy="100%" innerRadius="60%" outerRadius="100%" startAngle={180} endAngle={0} data={data} barSize={10}>
          <RadialBar background={{ fill: "oklch(0.3 0.04 286 / 15%)" }} dataKey="value" cornerRadius={5} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
        <p className="text-lg font-display font-bold text-foreground leading-none">{score}%</p>
        <p className="text-[9px] text-muted-foreground">Posture</p>
      </div>
    </div>
  );
}

export default function Compliance() {
  const utils = trpc.useUtils();
  const [agentId, setAgentId] = useState("001");
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedPolicy, setSelectedPolicy] = useState<string | null>(null);
  const [checkFilter, setCheckFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);
  const pageSize = 50;

  // Indexer-specific state
  const [selectedFramework, setSelectedFramework] = useState<"pci_dss" | "nist_800_53" | "hipaa" | "gdpr" | "tsc">("pci_dss");
  const [timeRange, setTimeRange] = useState("24h");

  const statusQ = trpc.wazuh.status.useQuery(undefined, { retry: 1, staleTime: 60_000 });
  const isConnected = statusQ.data?.configured === true && statusQ.data?.data != null;

  // Check Indexer availability
  const indexerStatusQ = trpc.indexer.status.useQuery(undefined, { retry: 1, staleTime: 60_000 });
  const indexerConfigured = indexerStatusQ.data?.configured === true;
  const indexerHealthy = indexerConfigured && indexerStatusQ.data?.healthy === true;

  const agentsQ = trpc.wazuh.agents.useQuery({ limit: 100, offset: 0, status: "active" }, { retry: 1, staleTime: 30_000, enabled: isConnected });
  const agentList = useMemo(() => {
    if (isConnected && agentsQ.data) return extractItems(agentsQ.data).filter(a => String(a.id ?? "") !== "");
    return [];
  }, [agentsQ.data, isConnected]);

  const scaQ = trpc.wazuh.scaPolicies.useQuery({ agentId }, { retry: 1, staleTime: 30_000, enabled: isConnected });
  const checksQ = trpc.wazuh.scaChecks.useQuery(
    { agentId, policyId: selectedPolicy ?? "" },
    { retry: 1, staleTime: 30_000, enabled: isConnected && !!selectedPolicy }
  );

  // Indexer compliance aggregation query
  const trMs = TIME_RANGES.find(t => t.value === timeRange)?.ms ?? 86400000;
  const complianceTimeWindow = useMemo(() => ({
    from: new Date(Date.now() - trMs).toISOString(),
    to: new Date().toISOString(),
  }), [timeRange]); // eslint-disable-line react-hooks/exhaustive-deps
  const complianceQ = trpc.indexer.alertsComplianceAgg.useQuery(
    { framework: selectedFramework, from: complianceTimeWindow.from, to: complianceTimeWindow.to },
    { retry: 1, staleTime: 60_000, enabled: indexerHealthy }
  );

  const handleRefresh = useCallback(() => { utils.wazuh.invalidate(); utils.indexer.invalidate(); }, [utils]);

  // ── Policies (real or fallback) ───────────────────────────────────────
  const policies = useMemo(() => {
    if (isConnected && scaQ.data) return extractItems(scaQ.data);
    return [];
  }, [scaQ.data, isConnected]);

  // ── Checks (real or fallback) ─────────────────────────────────────────
  const checks = useMemo(() => {
    if (isConnected && checksQ.data) return extractItems(checksQ.data);
    return [];
  }, [checksQ.data, isConnected, selectedPolicy]);

  const { totalPolicies, avgScore, totalPass, totalFail, totalNA } = useMemo(() => {
    let pass = 0, fail = 0, na = 0, scoreSum = 0;
    policies.forEach(p => {
      pass += Number(p.pass ?? 0);
      fail += Number(p.fail ?? 0);
      na += Number(p.not_applicable ?? p.invalid ?? 0);
      scoreSum += Number(p.score ?? 0);
    });
    return { totalPolicies: policies.length, avgScore: policies.length > 0 ? Math.round(scoreSum / policies.length) : 0, totalPass: pass, totalFail: fail, totalNA: na };
  }, [policies]);

  const policyScoreData = useMemo(() => policies.map(p => ({ name: String(p.name ?? "").slice(0, 30), score: Number(p.score ?? 0), pass: Number(p.pass ?? 0), fail: Number(p.fail ?? 0) })), [policies]);

  const resultPie = useMemo(() => [
    { name: "Pass", value: totalPass, color: COLORS.green },
    { name: "Fail", value: totalFail, color: COLORS.red },
    { name: "N/A", value: totalNA, color: COLORS.gray },
  ].filter(d => d.value > 0), [totalPass, totalFail, totalNA]);

  const filteredChecks = useMemo(() => {
    let filtered = checks;
    if (checkFilter !== "all") filtered = filtered.filter(c => String(c.result ?? "").toLowerCase() === checkFilter);
    if (search) { const q = search.toLowerCase(); filtered = filtered.filter(c => String(c.title ?? "").toLowerCase().includes(q) || String(c.description ?? "").toLowerCase().includes(q) || String(c.id ?? "").toLowerCase().includes(q)); }
    return filtered;
  }, [checks, checkFilter, search]);

  const totalChecks = filteredChecks.length;
  const totalPages = Math.ceil(totalChecks / pageSize);
  const pagedChecks = filteredChecks.slice(page * pageSize, (page + 1) * pageSize);

  // ── Indexer compliance data (real or empty fallback) ────────────────────
  const complianceSource: "indexer" | "server" = indexerHealthy && complianceQ.data ? "indexer" : "server";
  const complianceData = useMemo(() => {
    if (indexerHealthy && complianceQ.data) {
      const raw = complianceQ.data as Record<string, unknown>;
      const esData = raw.data as Record<string, unknown> | undefined;
      const aggs = esData?.aggregations as Record<string, unknown> | undefined;
      if (aggs) {
        const controlBuckets = ((aggs.controls as Record<string, unknown>)?.buckets ?? []) as Array<{ key: string; doc_count: number }>;
        const levelBuckets = ((aggs.levels as Record<string, unknown>)?.buckets ?? []) as Array<{ key: number; doc_count: number }>;
        const timelineBuckets = ((aggs.timeline as Record<string, unknown>)?.buckets ?? []) as Array<{ key_as_string: string; doc_count: number }>;
        const totalHits = ((esData?.hits as Record<string, unknown>)?.total as Record<string, unknown>)?.value as number ?? 0;
        const byControl = controlBuckets.map(b => ({ control: b.key, count: b.doc_count }));
        const bySeverity = levelBuckets.map(b => ({
          level: b.key >= 12 ? "Critical" : b.key >= 8 ? "High" : b.key >= 4 ? "Medium" : "Low",
          count: b.doc_count,
        }));
        const severityMap = new Map<string, number>();
        bySeverity.forEach(s => severityMap.set(s.level, (severityMap.get(s.level) ?? 0) + s.count));
        const mergedSeverity = Array.from(severityMap.entries()).map(([level, count]) => ({ level, count }));
        const timeline = timelineBuckets.map(b => ({ time: new Date(b.key_as_string).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), count: b.doc_count }));
        return { total: totalHits, byControl, bySeverity: mergedSeverity, timeline };
      }
    }
    return { total: 0, byControl: [] as Array<{ control: string; count: number }>, bySeverity: [] as Array<{ level: string; count: number }>, timeline: [] as Array<{ time: string; count: number }> };
  }, [complianceQ.data, indexerHealthy, selectedFramework]);

  const currentFw = FRAMEWORKS.find(f => f.id === selectedFramework) ?? FRAMEWORKS[0];
  const isLoading = statusQ.isLoading;

  // ── Pass/Fail ratio for policies ──
  const passRate = totalPass + totalFail > 0 ? Math.round((totalPass / (totalPass + totalFail)) * 100) : 0;

  return (
    <WazuhGuard>
      <div className="space-y-6">
        <PageHeader title="Compliance Posture" subtitle="SCA policy assessment and Indexer-powered framework alert analysis" onRefresh={handleRefresh} isLoading={isLoading} />

        {/* ── Loading State ── */}
        {isLoading && <IndexerLoadingState message="Fetching compliance data from Wazuh…" />}
        {/* ── Error State ── */}
        {statusQ.isError && (
          <IndexerErrorState
            message="Failed to connect to Wazuh Manager"
            detail={statusQ.error?.message}
            onRetry={() => statusQ.refetch()}
          />
        )}

        {/* ── KPI Row ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {isLoading ? <StatCardSkeleton count={5} /> : (<>
          <StatCard label="Avg Score" value={`${avgScore}%`} icon={ShieldCheck} colorClass={avgScore >= 80 ? "text-threat-low" : avgScore >= 60 ? "text-threat-medium" : "text-threat-critical"} />
          <StatCard label="Policies" value={totalPolicies} icon={Layers} colorClass="text-primary" />
          <StatCard label="Passed" value={totalPass} icon={CheckCircle2} colorClass="text-threat-low" />
          <StatCard label="Failed" value={totalFail} icon={XCircle} colorClass="text-threat-critical" />
          <StatCard label="N/A" value={totalNA} icon={MinusCircle} colorClass="text-muted-foreground" />
          </>)}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-secondary/30 border border-border/30">
            <TabsTrigger value="overview" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Overview</TabsTrigger>
            <TabsTrigger value="framework-alerts" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Database className="h-3 w-3 mr-1" /> Framework Alerts
            </TabsTrigger>
            <TabsTrigger value="policies" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Policies</TabsTrigger>
            <TabsTrigger value="checks" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary">Checks</TabsTrigger>
          </TabsList>

          {/* ── Overview Tab ─────────────────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-4 mt-4">
            {isLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <ChartSkeleton variant="pie" height={240} title="Policy Scores" className="lg:col-span-5" />
                <ChartSkeleton variant="pie" height={240} title="Check Results" className="lg:col-span-3" />
                <ChartSkeleton variant="bar" height={240} title="Score by Policy" className="lg:col-span-4" />
              </div>
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Policy Scores — enhanced with posture meter */}
              <GlassPanel className="lg:col-span-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Policy Scores</h3>
                  <PostureMeter score={avgScore} />
                </div>
                <div className="flex flex-wrap justify-center gap-5">
                  {policies.slice(0, 6).map((p, i) => <ScoreGauge key={i} score={Number(p.score ?? 0)} label={String(p.name ?? "").slice(0, 25)} />)}
                </div>
              </GlassPanel>

              {/* Check Results — enhanced donut */}
              <GlassPanel className="lg:col-span-3">
                <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Check Results</h3>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={resultPie} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value" stroke="none" animationDuration={800}>
                        {resultPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <ReTooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center label */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <p className="text-xl font-display font-bold text-foreground">{passRate}%</p>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Pass Rate</p>
                    </div>
                  </div>
                </div>
                {/* Legend below */}
                <div className="flex justify-center gap-4 mt-2">
                  {resultPie.map((entry, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="text-[10px] text-muted-foreground">{entry.name} ({entry.value})</span>
                    </div>
                  ))}
                </div>
              </GlassPanel>

              {/* Score by Policy — enhanced bar chart */}
              <GlassPanel className="lg:col-span-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Score by Policy</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={policyScoreData} layout="vertical">
                    <defs>
                      <linearGradient id="scoreBarGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={COLORS.purple} stopOpacity={0.6} />
                        <stop offset="100%" stopColor={COLORS.purple} stopOpacity={1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.04 286 / 15%)" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 9 }} />
                    <ReTooltip content={<ChartTooltip />} />
                    <Bar dataKey="score" fill="url(#scoreBarGrad)" name="Score %" radius={[0, 6, 6, 0]} animationDuration={800} />
                  </BarChart>
                </ResponsiveContainer>
              </GlassPanel>
            </div>
            )}

            {/* ── Regulatory Frameworks — enhanced cards ── */}
            <GlassPanel>
              <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /> Regulatory Frameworks</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {FRAMEWORKS.map(fw => {
                  const matchingPolicy = policies.find(p => String(p.policy_id ?? "").toLowerCase().includes(fw.id.replace(/_/g, "")) || String(p.name ?? "").toLowerCase().includes(fw.id.replace(/_/g, " ")));
                  const score = matchingPolicy ? Number(matchingPolicy.score ?? 0) : null;
                  const borderColor = score !== null ? (score >= 80 ? "border-threat-low/30 hover:border-threat-low/60" : score >= 60 ? "border-yellow-500/30 hover:border-yellow-500/60" : "border-threat-critical/30 hover:border-threat-critical/60") : "border-border/20 hover:border-border/40";
                  return (
                    <button key={fw.id} onClick={() => { setSelectedFramework(fw.id as typeof selectedFramework); setActiveTab("framework-alerts"); }}
                      className={`group relative overflow-hidden rounded-xl p-5 border-2 ${borderColor} bg-secondary/10 hover:bg-secondary/20 transition-all duration-300 cursor-pointer text-left`}>
                      {/* Subtle gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <div className="relative">
                        <div className="flex items-start justify-between">
                          <span className="text-3xl">{fw.icon}</span>
                          {score !== null && (
                            <div className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${score >= 80 ? "bg-threat-low/10 text-threat-low" : score >= 60 ? "bg-yellow-500/10 text-yellow-400" : "bg-threat-critical/10 text-threat-critical"}`}>
                              {score >= 80 ? "Good" : score >= 60 ? "Fair" : "At Risk"}
                            </div>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-foreground mt-3">{fw.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{fw.desc}</p>
                        {score !== null ? (
                          <div className="mt-3">
                            <div className="flex items-end gap-1">
                              <span className={`text-2xl font-display font-bold ${score >= 80 ? "text-threat-low" : score >= 60 ? "text-yellow-400" : "text-threat-critical"}`}>{score}</span>
                              <span className="text-xs text-muted-foreground mb-1">%</span>
                            </div>
                            <div className="mt-2 h-1.5 bg-secondary/40 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, backgroundColor: score >= 80 ? COLORS.green : score >= 60 ? COLORS.yellow : COLORS.red }} />
                            </div>
                          </div>
                        ) : <p className="text-xs text-muted-foreground mt-3 italic">No policy</p>}
                        <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                          <Activity className="h-3 w-3" /> {complianceData.total?.toLocaleString() ?? 0} alerts
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </GlassPanel>
          </TabsContent>

          {/* ── Framework Alerts Tab (Indexer-powered) ────────────────────── */}
          <TabsContent value="framework-alerts" className="space-y-4 mt-4">
            <GlassPanel className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-muted-foreground">Framework:</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {FRAMEWORKS.map(fw => (
                  <Button key={fw.id} variant="outline" size="sm" onClick={() => setSelectedFramework(fw.id as typeof selectedFramework)} className={`h-7 text-xs bg-transparent border-border ${selectedFramework === fw.id ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                    {fw.icon} {fw.label}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                {TIME_RANGES.map(tr => (
                  <Button key={tr.value} variant="outline" size="sm" onClick={() => setTimeRange(tr.value)} className={`h-7 text-xs bg-transparent border-border ${timeRange === tr.value ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                    {tr.label}
                  </Button>
                ))}
                <SourceBadge source={complianceSource} />
              </div>
            </GlassPanel>

            {/* Framework KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label={`${currentFw.label} Alerts`} value={complianceData.total.toLocaleString()} icon={Activity} colorClass="text-primary" />
              <StatCard label="Critical" value={complianceData.bySeverity.find(s => s.level === "Critical")?.count ?? 0} icon={AlertTriangle} colorClass="text-threat-critical" />
              <StatCard label="High" value={complianceData.bySeverity.find(s => s.level === "High")?.count ?? 0} icon={ShieldAlert} colorClass="text-threat-high" />
              <StatCard label="Controls Triggered" value={complianceData.byControl.length} icon={Layers} colorClass="text-info-cyan" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Alert Timeline */}
              <GlassPanel className="lg:col-span-8">
                <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" /> {currentFw.label} Alert Timeline
                </h3>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={complianceData.timeline}>
                    <defs>
                      <linearGradient id="compAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.purple} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={COLORS.purple} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.04 286 / 15%)" />
                    <XAxis dataKey="time" tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 9 }} />
                    <YAxis tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 10 }} />
                    <ReTooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="count" stroke={COLORS.purple} fill="url(#compAreaGrad)" name="Alerts" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: COLORS.purple, stroke: "oklch(0.15 0.02 286)", strokeWidth: 2 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </GlassPanel>

              {/* Severity Distribution — enhanced */}
              <GlassPanel className="lg:col-span-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-primary" /> Severity Distribution
                </h3>
                {complianceData.bySeverity.length > 0 ? (
                  <div className="space-y-3 mt-2">
                    {complianceData.bySeverity.sort((a, b) => {
                      const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
                      return (order[a.level as keyof typeof order] ?? 4) - (order[b.level as keyof typeof order] ?? 4);
                    }).map((s, i) => {
                      const pct = complianceData.total > 0 ? (s.count / complianceData.total) * 100 : 0;
                      const color = SEVERITY_COLORS[s.level] ?? COLORS.gray;
                      return (
                        <div key={i} className="group">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                              <span className="text-xs font-medium text-foreground">{s.level}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-foreground">{s.count.toLocaleString()}</span>
                              <span className="text-[10px] text-muted-foreground">({pct.toFixed(1)}%)</span>
                            </div>
                          </div>
                          <div className="h-2 bg-secondary/30 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">No severity data available</div>
                )}
              </GlassPanel>
            </div>

            {/* Top Controls Table — enhanced */}
            <GlassPanel>
              <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" /> Top {currentFw.label} Controls by Alert Count
              </h3>
              {isLoading ? (
                <TableSkeleton columns={4} rows={8} columnWidths={[1, 3, 1, 4]} />
              ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30">
                      <th className="text-left py-2.5 px-3 text-muted-foreground font-medium w-8">#</th>
                      <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Control</th>
                      <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Alert Count</th>
                      <th className="text-left py-2.5 px-3 text-muted-foreground font-medium w-1/2">Distribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {complianceData.byControl.map((c, i) => {
                      const pct = complianceData.total > 0 ? (c.count / complianceData.total) * 100 : 0;
                      const isTop3 = i < 3;
                      return (
                        <tr key={i} className={`border-b border-border/10 hover:bg-secondary/20 transition-colors ${isTop3 ? "bg-primary/[0.02]" : ""}`}>
                          <td className="py-2.5 px-3">
                            {isTop3 ? (
                              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">{i + 1}</span>
                            ) : (
                              <span className="text-muted-foreground">{i + 1}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-primary font-medium">{c.control}</td>
                          <td className="py-2.5 px-3 text-foreground font-bold">{c.count.toLocaleString()}</td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-secondary/30 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${COLORS.purple}80, ${COLORS.purple})` }} />
                              </div>
                              <span className="text-[10px] text-muted-foreground w-12 text-right font-mono">{pct.toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
            </GlassPanel>
          </TabsContent>

          {/* ── Policies Tab — enhanced cards ─────────────────────────────── */}
          <TabsContent value="policies" className="space-y-4 mt-4">
            <GlassPanel className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /><span className="text-sm font-medium text-muted-foreground">Target Agent:</span></div>
              <Select value={agentId} onValueChange={(v) => { setAgentId(v); setSelectedPolicy(null); setPage(0); }}>
                <SelectTrigger className="w-[280px] h-8 text-xs bg-secondary/50 border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover border-border max-h-60">
                  {agentList.map(a => <SelectItem key={String(a.id)} value={String(a.id)}>{String(a.id)} — {String(a.name ?? "Unknown")} ({String(a.ip ?? "")})</SelectItem>)}
                </SelectContent>
              </Select>
              {scaQ.data ? <RawJsonViewer data={scaQ.data as Record<string, unknown>} title="SCA Policies JSON" /> : null}
            </GlassPanel>

            <GlassPanel>
              <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /> SCA Policies ({policies.length})</h3>
              <div className="space-y-3">
                {policies.map((p, i) => {
                  const score = Number(p.score ?? 0);
                  const policyId = String(p.policy_id ?? "");
                  const passCount = Number(p.pass ?? 0);
                  const failCount = Number(p.fail ?? 0);
                  const naCount = Number(p.not_applicable ?? p.invalid ?? 0);
                  const totalC = passCount + failCount + naCount;
                  const borderColor = score >= 80 ? "border-threat-low/30" : score >= 60 ? "border-yellow-500/30" : "border-threat-critical/30";
                  return (
                    <div key={i}
                      className={`group relative rounded-xl p-5 border-2 transition-all duration-300 cursor-pointer ${selectedPolicy === policyId ? `${borderColor} bg-primary/5 shadow-lg shadow-primary/5` : "border-border/20 hover:border-border/40 bg-secondary/10 hover:bg-secondary/20"}`}
                      onClick={() => { setSelectedPolicy(policyId); setActiveTab("checks"); setPage(0); }}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-foreground truncate">{String(p.name ?? "")}</p>
                            <Eye className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{policyId}</p>
                          {typeof p.description === "string" ? <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p> : null}
                        </div>
                        <div className="flex items-center gap-6 ml-6">
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pass</p>
                            <p className="text-base font-display font-bold text-threat-low">{passCount}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Fail</p>
                            <p className="text-base font-display font-bold text-threat-critical">{failCount}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">N/A</p>
                            <p className="text-base font-display font-bold text-muted-foreground">{naCount}</p>
                          </div>
                          <ScoreGauge score={score} label="" size="sm" />
                        </div>
                      </div>
                      {/* Stacked progress bar */}
                      <div className="mt-4 h-2 bg-secondary/30 rounded-full overflow-hidden flex">
                        {totalC > 0 && <>
                          <div className="h-full transition-all duration-700" style={{ width: `${(passCount / totalC) * 100}%`, backgroundColor: COLORS.green }} />
                          <div className="h-full transition-all duration-700" style={{ width: `${(failCount / totalC) * 100}%`, backgroundColor: COLORS.red }} />
                          <div className="h-full transition-all duration-700" style={{ width: `${(naCount / totalC) * 100}%`, backgroundColor: COLORS.gray }} />
                        </>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassPanel>
          </TabsContent>

          {/* ── Checks Tab — enhanced with expandable rows ───────────────── */}
          <TabsContent value="checks" className="space-y-4 mt-4">
            <GlassPanel>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Policy Checks
                  {selectedPolicy ? <span className="font-mono text-primary">({selectedPolicy})</span> : null}
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  {!selectedPolicy ? (
                    <Select value={selectedPolicy ?? "none"} onValueChange={(v) => { setSelectedPolicy(v === "none" ? null : v); setPage(0); }}>
                      <SelectTrigger className="w-[200px] h-8 text-xs bg-secondary/50 border-border"><SelectValue placeholder="Select policy..." /></SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        <SelectItem value="none" disabled>Select policy...</SelectItem>
                        {policies.map((p, i) => <SelectItem key={i} value={String(p.policy_id ?? `policy-${i}`)}>{String(p.name ?? "").slice(0, 40)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : null}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input placeholder="Search checks..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="h-8 w-48 pl-8 text-xs bg-secondary/50 border-border" />
                  </div>
                  <Select value={checkFilter} onValueChange={(v) => { setCheckFilter(v); setPage(0); }}>
                    <SelectTrigger className="w-[110px] h-8 text-xs bg-secondary/50 border-border"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover border-border">
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="passed">Passed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="not applicable">N/A</SelectItem>
                    </SelectContent>
                  </Select>
                  {checksQ.data ? <RawJsonViewer data={checksQ.data as Record<string, unknown>} title="SCA Checks JSON" /> : null}
                </div>
              </div>

              {!selectedPolicy ? (
                <div className="text-center text-sm text-muted-foreground py-12">
                  <ShieldCheck className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
                  Select a policy from the Policies tab to view checks
                </div>
              ) : (
                <>
                  {checksQ.isLoading ? (
                    <TableSkeleton columns={6} rows={10} columnWidths={[1, 1, 3, 2, 2, 2]} />
                  ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-border/30">
                        {["ID", "Result", "Title", "Rationale", "Remediation", "Compliance"].map(h =>
                          <th key={h} className="text-left py-2.5 px-3 text-muted-foreground font-medium text-[11px] uppercase tracking-wider">{h}</th>
                        )}
                      </tr></thead>
                      <tbody>
                        {pagedChecks.map((c, i) => {
                          const result = String(c.result ?? "").toLowerCase();
                          const checkId = String(c.id ?? `check-${i}`);
                          const isExpanded = expandedCheck === checkId;
                          return (
                            <tr key={i}
                              className={`border-b border-border/10 cursor-pointer transition-colors ${isExpanded ? "bg-primary/5" : "hover:bg-secondary/20"} ${result === "failed" ? "border-l-2 border-l-threat-critical/40" : result === "passed" ? "border-l-2 border-l-threat-low/20" : "border-l-2 border-l-transparent"}`}
                              onClick={() => setExpandedCheck(isExpanded ? null : checkId)}>
                              <td className="py-2.5 px-3 font-mono text-primary font-medium">{checkId}</td>
                              <td className="py-2.5 px-3"><ThreatBadge level={result === "passed" ? "low" : result === "failed" ? "critical" : "info"} /></td>
                              <td className="py-2.5 px-3 text-foreground max-w-[300px]">
                                <span className={isExpanded ? "" : "line-clamp-1"}>{String(c.title ?? "—")}</span>
                              </td>
                              <td className="py-2.5 px-3 text-muted-foreground max-w-[200px]">
                                <span className={isExpanded ? "" : "truncate block"}>{String(c.rationale ?? "—")}</span>
                              </td>
                              <td className="py-2.5 px-3 text-muted-foreground max-w-[200px]">
                                <span className={isExpanded ? "text-yellow-400/80" : "truncate block"}>{String(c.remediation ?? "—")}</span>
                              </td>
                              <td className="py-2.5 px-3 text-muted-foreground max-w-[150px]">
                                {c.compliance ? (c.compliance as Array<Record<string, unknown>>).map((comp, j) => (
                                  <span key={j} className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary mr-1 mb-0.5">{String(comp.key ?? "")}: {String(comp.value ?? "")}</span>
                                )) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                        {pagedChecks.length === 0 ? <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">{checksQ.isLoading ? "Loading checks..." : "No checks found"}</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                  )}
                  {totalPages > 1 ? (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/30">
                      <p className="text-xs text-muted-foreground">Page {page + 1} of {totalPages} ({totalChecks} checks)</p>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-7 bg-transparent border-border"><ChevronLeft className="h-3.5 w-3.5" /></Button>
                        <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-7 bg-transparent border-border"><ChevronRight className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </GlassPanel>
          </TabsContent>
        </Tabs>
      </div>
    </WazuhGuard>
  );
}
