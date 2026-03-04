import { trpc } from "@/lib/trpc";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { StatCard } from "@/components/shared/StatCard";
import { IndexerLoadingState, IndexerErrorState, StatCardSkeleton } from "@/components/shared/IndexerStates";
import { ChartSkeleton } from "@/components/shared/ChartSkeleton";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { WazuhGuard } from "@/components/shared/WazuhGuard";
import { RawJsonViewer } from "@/components/shared/RawJsonViewer";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Crosshair, Shield, Layers, Grid3X3, Target, ExternalLink,
  Database, Activity, TrendingUp, Flame, Clock, Loader2,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, AreaChart, Area, Legend,
} from "recharts";

const COLORS = {
  purple: "oklch(0.541 0.281 293.009)",
  cyan: "oklch(0.789 0.154 211.53)",
  red: "oklch(0.637 0.237 25.331)",
  orange: "oklch(0.705 0.191 22.216)",
  green: "oklch(0.765 0.177 163.223)",
  yellow: "oklch(0.795 0.184 86.047)",
  gray: "oklch(0.551 0.02 286)",
};

const MITRE_TACTICS = [
  "initial-access", "execution", "persistence", "privilege-escalation",
  "defense-evasion", "credential-access", "discovery", "lateral-movement",
  "collection", "command-and-control", "exfiltration", "impact",
  "reconnaissance", "resource-development",
];

const TACTIC_LABELS: Record<string, string> = {
  "initial-access": "Initial Access", "execution": "Execution", "persistence": "Persistence",
  "privilege-escalation": "Privilege Escalation", "defense-evasion": "Defense Evasion",
  "credential-access": "Credential Access", "discovery": "Discovery",
  "lateral-movement": "Lateral Movement", "collection": "Collection",
  "command-and-control": "Command & Control", "exfiltration": "Exfiltration",
  "impact": "Impact", "reconnaissance": "Reconnaissance", "resource-development": "Resource Development",
};

const TACTIC_COLORS: Record<string, string> = {
  "initial-access": COLORS.red, "execution": COLORS.orange, "persistence": COLORS.yellow,
  "privilege-escalation": COLORS.red, "defense-evasion": COLORS.purple, "credential-access": COLORS.orange,
  "discovery": COLORS.cyan, "lateral-movement": COLORS.red, "collection": COLORS.yellow,
  "command-and-control": COLORS.purple, "exfiltration": COLORS.red, "impact": COLORS.red,
  "reconnaissance": COLORS.cyan, "resource-development": COLORS.gray,
};

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
    <div className="glass-panel p-3 text-xs border border-glass-border">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color }} className="font-medium">{p.name}: {p.value?.toLocaleString()}</p>)}
    </div>
  );
}

interface MitreTechnique {
  id: string;
  name: string;
  tactics: string[];
  description?: string;
  ruleIds: string[];
  ruleCount: number;
  alertCount?: number;
}

function extractItems(raw: unknown): Array<Record<string, unknown>> {
  const d = (raw as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  return (d?.affected_items as Array<Record<string, unknown>>) ?? [];
}

export default function MitreAttack() {
  const utils = trpc.useUtils();
  const [selectedTechnique, setSelectedTechnique] = useState<MitreTechnique | null>(null);
  const [activeTab, setActiveTab] = useState("matrix");
  const [timeRange, setTimeRange] = useState("24h");

  const statusQ = trpc.wazuh.status.useQuery(undefined, { retry: 1, staleTime: 60_000 });
  const isConnected = statusQ.data?.configured === true && statusQ.data?.data != null;

  // Check Indexer availability
  const indexerStatusQ = trpc.indexer.status.useQuery(undefined, { retry: 1, staleTime: 60_000 });
  const indexerConfigured = indexerStatusQ.data?.configured === true;
  const indexerHealthy = indexerConfigured && indexerStatusQ.data?.healthy === true;

  const trMs = TIME_RANGES.find(t => t.value === timeRange)?.ms ?? 86400000;

  const tacticsQ = trpc.wazuh.mitreTactics.useQuery(undefined, { retry: 1, staleTime: 120_000, enabled: isConnected });
  const techniquesQ = trpc.wazuh.mitreTechniques.useQuery({ limit: 500 }, { retry: 1, staleTime: 60_000, enabled: isConnected });
  const groupsQ = trpc.wazuh.mitreGroups.useQuery({ limit: 100 }, { retry: 1, staleTime: 120_000, enabled: isConnected });
  const rulesQ = trpc.wazuh.rules.useQuery({ limit: 500, offset: 0, sort: "-level" }, { retry: 1, staleTime: 60_000, enabled: isConnected });

  // Indexer MITRE aggregation
  const mitreTimeWindow = useMemo(() => ({
    from: new Date(Date.now() - trMs).toISOString(),
    to: new Date().toISOString(),
  }), [timeRange]); // eslint-disable-line react-hooks/exhaustive-deps
  const mitreAggQ = trpc.indexer.alertsAggByMitre.useQuery(
    { from: mitreTimeWindow.from, to: mitreTimeWindow.to },
    { retry: 1, staleTime: 60_000, enabled: indexerHealthy }
  );

  const handleRefresh = useCallback(() => { utils.wazuh.invalidate(); utils.indexer.invalidate(); }, [utils]);

  // ── Tactics (real or fallback) ────────────────────────────────────────
  const mitreTactics = useMemo(() => {
    if (isConnected && tacticsQ.data) return extractItems(tacticsQ.data);
    return [];
  }, [tacticsQ.data, isConnected]);

  // ── Techniques (real or fallback) ─────────────────────────────────────
  const mitreTechniques = useMemo(() => {
    if (isConnected && techniquesQ.data) return extractItems(techniquesQ.data);
    return [];
  }, [techniquesQ.data, isConnected]);

  // ── Threat Groups (real or fallback) ──────────────────────────────────
  const threatGroups = useMemo(() => {
    if (isConnected && groupsQ.data) return extractItems(groupsQ.data);
    return [];
  }, [groupsQ.data, isConnected]);

  // ── Build technique map from rules (real or fallback) ─────────────────
  const { techniques, tacticCounts, totalTechniques, totalRulesWithMitre } = useMemo(() => {
    let rules: Array<Record<string, unknown>>;
    if (isConnected && rulesQ.data) {
      rules = extractItems(rulesQ.data);
    } else {
      rules = [];
    }

    const techMap = new Map<string, MitreTechnique>();
    const tacticCounts: Record<string, number> = {};
    let rulesWithMitre = 0;

    rules.forEach(rule => {
      const mitre = rule.mitre as Record<string, unknown> | undefined;
      if (!mitre) return;
      const ids = (mitre.id as string[]) ?? [];
      const tactics = (mitre.tactic as string[]) ?? [];
      const techNames = (mitre.technique as string[]) ?? [];
      if (ids.length === 0 && tactics.length === 0) return;
      rulesWithMitre++;
      tactics.forEach(t => { const key = t.toLowerCase().replace(/\s+/g, "-"); tacticCounts[key] = (tacticCounts[key] ?? 0) + 1; });
      ids.forEach((id, idx) => {
        const existing = techMap.get(id);
        const techName = techNames[idx] ?? id;
        if (existing) {
          existing.ruleCount++;
          existing.ruleIds.push(String(rule.id));
          tactics.forEach(t => { const key = t.toLowerCase().replace(/\s+/g, "-"); if (!existing.tactics.includes(key)) existing.tactics.push(key); });
        } else {
          techMap.set(id, { id, name: techName, tactics: tactics.map(t => t.toLowerCase().replace(/\s+/g, "-")), ruleIds: [String(rule.id)], ruleCount: 1 });
        }
      });
    });

    return { techniques: Array.from(techMap.values()), tacticCounts, totalTechniques: techMap.size, totalRulesWithMitre: rulesWithMitre };
  }, [rulesQ.data, isConnected]);

  // ── Indexer MITRE data (real or empty fallback) ─────────────────────────────
  const mitreSource: "indexer" | "server" = indexerHealthy && mitreAggQ.data ? "indexer" : "server";
  const { indexerTacticAlerts, indexerTimeline, indexerTopTechniques, totalMitreAlerts } = useMemo(() => {
    if (indexerHealthy && mitreAggQ.data) {
      const raw = mitreAggQ.data as Record<string, unknown>;
      const esData = raw.data as Record<string, unknown> | undefined;
      const aggs = esData?.aggregations as Record<string, unknown> | undefined;
      if (aggs) {
        const tacticBuckets = ((aggs.tactics as Record<string, unknown>)?.buckets ?? []) as Array<{ key: string; doc_count: number }>;
        const techBuckets = ((aggs.techniques as Record<string, unknown>)?.buckets ?? []) as Array<{ key: string; doc_count: number }>;
        const timelineBuckets = ((aggs.timeline as Record<string, unknown>)?.buckets ?? []) as Array<{ key_as_string: string; doc_count: number; tactics?: { buckets: Array<{ key: string; doc_count: number }> } }>;
        const totalHits = ((esData?.hits as Record<string, unknown>)?.total as Record<string, unknown>)?.value as number ?? 0;

        const tacticAlerts = tacticBuckets.map(b => ({ tactic: b.key, alerts: b.doc_count, delta: 0 }));
        const topTechniques = techBuckets.slice(0, 10).map(b => ({ id: b.key, name: b.key, tactic: "", alerts: b.doc_count }));
        const timeline = timelineBuckets.map(b => {
          const entry: Record<string, string | number> = { time: new Date(b.key_as_string).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
          if (b.tactics?.buckets) {
            b.tactics.buckets.forEach(tb => { entry[tb.key] = tb.doc_count; });
          } else {
            entry["Alerts"] = b.doc_count;
          }
          return entry;
        });

        return { indexerTacticAlerts: tacticAlerts, indexerTimeline: timeline, indexerTopTechniques: topTechniques, totalMitreAlerts: totalHits };
      }
    }
    return {
      indexerTacticAlerts: [] as Array<{ tactic: string; alerts: number; delta: number }>,
      indexerTimeline: [] as Array<Record<string, string | number>>,
      indexerTopTechniques: [] as Array<{ id: string; name: string; tactic: string; alerts: number }>,
      totalMitreAlerts: 0,
    };
  }, [mitreAggQ.data, indexerHealthy]);

  // ── Tactic counts from dedicated MITRE techniques ─────────────────────
  const dedicatedTacticCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    mitreTechniques.forEach(t => {
      const tactics = (t.tactics as string[]) ?? [];
      tactics.forEach(tac => { const key = tac.toLowerCase().replace(/\s+/g, "-"); counts[key] = (counts[key] ?? 0) + 1; });
    });
    return counts;
  }, [mitreTechniques]);

  const tacticChartData = useMemo(() => {
    const merged: Record<string, number> = { ...tacticCounts };
    Object.entries(dedicatedTacticCounts).forEach(([k, v]) => { merged[k] = Math.max(merged[k] ?? 0, v); });
    return MITRE_TACTICS.filter(t => (merged[t] ?? 0) > 0).map(t => ({ name: TACTIC_LABELS[t] ?? t, count: merged[t] ?? 0 })).sort((a, b) => b.count - a.count);
  }, [tacticCounts, dedicatedTacticCounts]);

  const tacticMatrix = useMemo(() => {
    const matrix: Record<string, MitreTechnique[]> = {};
    MITRE_TACTICS.forEach(t => { matrix[t] = []; });
    mitreTechniques.forEach(tech => {
      const tactics = (tech.tactics as string[]) ?? [];
      const techId = String(tech.external_id ?? "");
      const techName = String(tech.name ?? "");
      const techDesc = String(tech.description ?? "");
      tactics.forEach(tac => {
        const key = tac.toLowerCase().replace(/\s+/g, "-");
        if (matrix[key]) {
          matrix[key].push({ id: techId, name: techName, description: techDesc, tactics: [key], ruleIds: [], ruleCount: 1 });
        }
      });
    });
    techniques.forEach(tech => {
      tech.tactics.forEach(t => {
        if (matrix[t] && !matrix[t].find(m => m.id === tech.id)) {
          matrix[t].push(tech);
        }
      });
    });
    return matrix;
  }, [mitreTechniques, techniques]);

  // ── Detection coverage heatmap data ───────────────────────────────────
  const heatmapData = useMemo(() => {
    // Build a map of technique ID -> alert count from indexer data
    const alertMap = new Map<string, number>();
    indexerTopTechniques.forEach(t => alertMap.set(t.id, t.alerts));

    // For each tactic, compute detection coverage
    return MITRE_TACTICS.map(tactic => {
      const techs = tacticMatrix[tactic] ?? [];
      const withRules = techs.filter(t => t.ruleCount > 0 || t.ruleIds.length > 0);
      const withAlerts = techs.filter(t => alertMap.has(t.id) || t.alertCount);
      const coverage = techs.length > 0 ? Math.round((withRules.length / techs.length) * 100) : 0;
      const alertCoverage = techs.length > 0 ? Math.round((withAlerts.length / techs.length) * 100) : 0;
      return {
        tactic,
        label: TACTIC_LABELS[tactic] ?? tactic,
        totalTechniques: techs.length,
        detectedTechniques: withRules.length,
        alertedTechniques: withAlerts.length,
        coverage,
        alertCoverage,
        color: TACTIC_COLORS[tactic] ?? COLORS.purple,
      };
    }).filter(d => d.totalTechniques > 0);
  }, [tacticMatrix, indexerTopTechniques]);

  const activeTactics = MITRE_TACTICS.filter(t => (tacticMatrix[t]?.length ?? 0) > 0);
  const maxTechPerTactic = useMemo(() => Math.max(...Object.values(tacticMatrix).map(arr => arr.length), 1), [tacticMatrix]);
  const isLoading = statusQ.isLoading;

  // Timeline area chart keys
  const timelineKeys = useMemo(() => {
    if (indexerTimeline.length === 0) return [];
    const keys = new Set<string>();
    indexerTimeline.forEach(entry => { Object.keys(entry).forEach(k => { if (k !== "time") keys.add(k); }); });
    return Array.from(keys).slice(0, 6);
  }, [indexerTimeline]);

  const AREA_COLORS = [COLORS.purple, COLORS.red, COLORS.orange, COLORS.yellow, COLORS.cyan, COLORS.green];

  return (
    <WazuhGuard>
      <div className="space-y-6">
        <PageHeader title="MITRE ATT&CK" subtitle="Adversary technique mapping — detection coverage, tactic progression, and alert correlation" onRefresh={handleRefresh} isLoading={isLoading} />

        {/* ── Loading State ── */}
        {mitreAggQ.isLoading && <IndexerLoadingState message="Fetching MITRE ATT&CK data…" />}
        {/* ── Error State ── */}
        {mitreAggQ.isError && (
          <IndexerErrorState
            message="Failed to fetch MITRE ATT&CK data from indexer"
            detail={mitreAggQ.error?.message}
            onRetry={() => mitreAggQ.refetch()}
          />
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          {mitreAggQ.isLoading ? <StatCardSkeleton count={6} /> : (<>
          <StatCard label="Techniques Detected" value={mitreTechniques.length || totalTechniques} icon={Crosshair} colorClass="text-primary" />
          <StatCard label="Rules with MITRE" value={totalRulesWithMitre} icon={Shield} colorClass="text-threat-medium" />
          <StatCard label="Tactics Covered" value={activeTactics.length} icon={Grid3X3} colorClass="text-info-cyan" />
          <StatCard label="Threat Groups" value={threatGroups.length} icon={Target} colorClass="text-threat-high" />
          <StatCard label="MITRE Alerts" value={totalMitreAlerts.toLocaleString()} icon={Activity} colorClass="text-threat-critical" />
          <StatCard label="Coverage" value={`${Math.round((activeTactics.length / 14) * 100)}%`} icon={Layers} colorClass="text-primary" />
          </>)}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-secondary/30 border border-border/30">
            <TabsTrigger value="matrix" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary"><Grid3X3 className="h-3 w-3 mr-1" /> ATT&CK Matrix</TabsTrigger>
            <TabsTrigger value="heatmap" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary"><Flame className="h-3 w-3 mr-1" /> Detection Heatmap</TabsTrigger>
            <TabsTrigger value="alerts" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary"><Database className="h-3 w-3 mr-1" /> Alert Activity</TabsTrigger>
            <TabsTrigger value="groups" className="text-xs data-[state=active]:bg-primary/20 data-[state=active]:text-primary"><Target className="h-3 w-3 mr-1" /> Threat Groups</TabsTrigger>
          </TabsList>

          {/* ── ATT&CK Matrix Tab ──────────────────────────────────────── */}
          <TabsContent value="matrix" className="space-y-4 mt-4">
            {isLoading ? (
              <ChartSkeleton variant="bar" height={240} title="Tactic Distribution" />
            ) : (
            <GlassPanel>
              <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Tactic Distribution <SourceBadge source={"server"} /></h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={tacticChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.04 286 / 20%)" />
                  <XAxis dataKey="name" tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 9 }} angle={-20} textAnchor="end" height={65} />
                  <YAxis tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 10 }} />
                  <ReTooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" fill={COLORS.purple} name="Techniques" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </GlassPanel>
            )}

            <GlassPanel>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Grid3X3 className="h-4 w-4 text-primary" /> ATT&CK Technique Matrix</h3>
                <span className="text-[10px] text-muted-foreground">{activeTactics.length} active tactics · {mitreTechniques.length || totalTechniques} techniques</span>
              </div>
              <div className="overflow-x-auto pb-4">
                <div className="flex gap-2 min-w-max">
                  {activeTactics.map(tactic => {
                    const techs = tacticMatrix[tactic] ?? [];
                    return (
                      <div key={tactic} className="w-48 shrink-0">
                        <div className="bg-primary/10 border border-primary/20 rounded-t-lg p-2 text-center">
                          <p className="text-[10px] font-medium text-primary uppercase tracking-wider truncate">{TACTIC_LABELS[tactic] ?? tactic}</p>
                          <p className="text-[9px] font-mono text-muted-foreground">{techs.length} techniques</p>
                        </div>
                        <div className="space-y-1 pt-1 max-h-[50vh] overflow-y-auto">
                          {techs.sort((a, b) => b.ruleCount - a.ruleCount).map((tech, i) => {
                            const intensity = Math.min(tech.ruleCount / maxTechPerTactic, 1);
                            return (
                              <button key={`${tech.id}-${i}`} onClick={() => setSelectedTechnique(tech)} className="w-full text-left p-1.5 rounded border transition-all hover:scale-[1.02]" style={{
                                backgroundColor: `oklch(0.541 ${0.281 * (0.2 + intensity * 0.8)} 293.009 / ${0.1 + intensity * 0.3})`,
                                borderColor: `oklch(0.541 0.281 293.009 / ${0.2 + intensity * 0.4})`,
                              }}>
                                <span className="text-[9px] font-mono text-primary block">{tech.id}</span>
                                <span className="text-[9px] text-foreground block truncate">{tech.name}</span>
                                {tech.ruleCount > 0 ? <span className="text-[8px] text-muted-foreground">{tech.ruleCount} rules</span> : null}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </GlassPanel>
          </TabsContent>

          {/* ── Detection Heatmap Tab ──────────────────────────────────── */}
          <TabsContent value="heatmap" className="space-y-4 mt-4">
            <GlassPanel>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Flame className="h-4 w-4 text-primary" /> Detection Coverage Heatmap</h3>
                <SourceBadge source={"server"} />
              </div>
              <p className="text-xs text-muted-foreground mb-4">Each cell represents a tactic. Color intensity reflects the percentage of techniques within that tactic that have at least one detection rule mapped.</p>

              {/* Heatmap Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
                {heatmapData.map(d => {
                  const intensity = d.coverage / 100;
                  const bgOpacity = 0.1 + intensity * 0.5;
                  const borderOpacity = 0.2 + intensity * 0.5;
                  return (
                    <div key={d.tactic} className="rounded-lg p-3 border text-center transition-all hover:scale-105 cursor-default" style={{
                      backgroundColor: `oklch(0.541 0.281 293.009 / ${bgOpacity})`,
                      borderColor: `oklch(0.541 0.281 293.009 / ${borderOpacity})`,
                    }}>
                      <p className="text-[9px] font-medium text-primary uppercase tracking-wider mb-1 truncate">{d.label}</p>
                      <p className="text-2xl font-bold text-foreground">{d.coverage}%</p>
                      <p className="text-[9px] text-muted-foreground mt-1">{d.detectedTechniques}/{d.totalTechniques} techniques</p>
                    </div>
                  );
                })}
              </div>

              {/* Coverage Bar Chart */}
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={heatmapData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.04 286 / 20%)" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="label" width={130} tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 9 }} />
                  <ReTooltip content={<ChartTooltip />} />
                  <Bar dataKey="coverage" fill={COLORS.purple} name="Rule Coverage %" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </GlassPanel>

            {/* Coverage Legend */}
            <GlassPanel>
              <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /> Coverage Legend</h3>
              <div className="flex items-center gap-4 flex-wrap">
                {[0, 25, 50, 75, 100].map(pct => (
                  <div key={pct} className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded border" style={{
                      backgroundColor: `oklch(0.541 0.281 293.009 / ${0.1 + (pct / 100) * 0.5})`,
                      borderColor: `oklch(0.541 0.281 293.009 / ${0.2 + (pct / 100) * 0.5})`,
                    }} />
                    <span className="text-[10px] text-muted-foreground">{pct}%</span>
                  </div>
                ))}
                <span className="text-[10px] text-muted-foreground ml-4">Darker = higher detection coverage</span>
              </div>
            </GlassPanel>
          </TabsContent>

          {/* ── Alert Activity Tab (Indexer-powered) ──────────────────── */}
          <TabsContent value="alerts" className="space-y-4 mt-4">
            <GlassPanel className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-muted-foreground">MITRE Alert Activity</span>
              </div>
              <div className="flex items-center gap-2">
                {TIME_RANGES.map(tr => (
                  <Button key={tr.value} variant="outline" size="sm" onClick={() => setTimeRange(tr.value)} className={`h-7 text-xs bg-transparent border-border ${timeRange === tr.value ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                    {tr.label}
                  </Button>
                ))}
                <SourceBadge source={mitreSource} />
              </div>
            </GlassPanel>

            {/* Tactic Alert Timeline */}
            <GlassPanel>
              <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Tactic Progression Timeline</h3>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={indexerTimeline}>
                  <defs>
                    {timelineKeys.map((key, i) => (
                      <linearGradient key={key} id={`mitreArea${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={AREA_COLORS[i % AREA_COLORS.length]} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={AREA_COLORS[i % AREA_COLORS.length]} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.04 286 / 20%)" />
                  <XAxis dataKey="time" tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 9 }} />
                  <YAxis tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 10 }} />
                  <ReTooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 10, color: "oklch(0.65 0.02 286)" }} />
                  {timelineKeys.map((key, i) => (
                    <Area key={key} type="monotone" dataKey={key} stroke={AREA_COLORS[i % AREA_COLORS.length]} fill={`url(#mitreArea${i})`} name={key} strokeWidth={1.5} stackId="1" />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </GlassPanel>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Tactic Alert Counts */}
              <GlassPanel className="lg:col-span-5">
                <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Alerts by Tactic</h3>
                <div className="space-y-2">
                  {indexerTacticAlerts.sort((a, b) => b.alerts - a.alerts).map((t, i) => {
                    const maxAlerts = indexerTacticAlerts[0]?.alerts ?? 1;
                    const pct = (t.alerts / maxAlerts) * 100;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-[10px] text-muted-foreground w-4 text-right">{i + 1}</span>
                        <span className="text-xs text-foreground w-36 truncate">{t.tactic}</span>
                        <div className="flex-1 h-2 bg-secondary/40 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: COLORS.purple }} />
                        </div>
                        <span className="text-xs font-mono text-foreground w-16 text-right">{t.alerts.toLocaleString()}</span>
                        {t.delta !== 0 ? (
                          <span className={`text-[10px] w-10 text-right ${t.delta > 0 ? "text-threat-high" : "text-threat-low"}`}>
                            {t.delta > 0 ? "+" : ""}{t.delta}%
                          </span>
                        ) : <span className="w-10" />}
                      </div>
                    );
                  })}
                </div>
              </GlassPanel>

              {/* Top Techniques by Alert Count */}
              <GlassPanel className="lg:col-span-7">
                <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Crosshair className="h-4 w-4 text-primary" /> Top Techniques by Alert Volume</h3>
                {mitreAggQ.isLoading ? (
                  <TableSkeleton columns={5} rows={10} columnWidths={[1, 3, 2, 1, 3]} />
                ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30">
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium w-8">#</th>
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">Technique</th>
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">Tactic</th>
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">Alerts</th>
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium w-1/3">Volume</th>
                      </tr>
                    </thead>
                    <tbody>
                      {indexerTopTechniques.map((t, i) => {
                        const maxA = indexerTopTechniques[0]?.alerts ?? 1;
                        const pct = (t.alerts / maxA) * 100;
                        return (
                          <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                            <td className="py-2.5 px-3 text-muted-foreground">{i + 1}</td>
                            <td className="py-2.5 px-3">
                              <span className="font-mono text-primary text-[10px]">{t.id}</span>
                              <span className="text-foreground ml-2">{t.name}</span>
                            </td>
                            <td className="py-2.5 px-3 text-muted-foreground">{t.tactic}</td>
                            <td className="py-2.5 px-3 font-mono text-foreground font-medium">{t.alerts.toLocaleString()}</td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-secondary/40 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: COLORS.purple }} />
                                </div>
                                <span className="text-[10px] text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
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
            </div>
          </TabsContent>

          {/* ── Threat Groups Tab ─────────────────────────────────────── */}
          <TabsContent value="groups" className="space-y-4 mt-4">
            <GlassPanel>
              <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Threat Groups ({threatGroups.length}) <SourceBadge source={"server"} /></h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {threatGroups.map((group, i) => (
                  <div key={i} className="bg-secondary/20 rounded-lg p-3 border border-border/20 hover:bg-secondary/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-foreground">{String(group.name ?? "")}</p>
                      <a href={`https://attack.mitre.org/groups/${String(group.external_id ?? "")}/`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <p className="text-[10px] font-mono text-primary mt-0.5">{String(group.external_id ?? "")}</p>
                    {typeof group.description === "string" && group.description ? (
                      <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{group.description.slice(0, 150)}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </GlassPanel>
          </TabsContent>
        </Tabs>

        {/* Technique Detail Dialog */}
        <Dialog open={!!selectedTechnique} onOpenChange={(open) => !open && setSelectedTechnique(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-card border-border">
            <DialogHeader>
              <DialogTitle className="font-display text-foreground flex items-center gap-2">
                <Crosshair className="h-5 w-5 text-primary" /> {selectedTechnique?.id} — {selectedTechnique?.name}
              </DialogTitle>
            </DialogHeader>
            {selectedTechnique ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-secondary/30 rounded-lg p-3 border border-border/30">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Technique ID</p>
                    <p className="text-sm font-mono text-primary mt-1">{selectedTechnique.id}</p>
                  </div>
                  <div className="bg-secondary/30 rounded-lg p-3 border border-border/30">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Rule Count</p>
                    <p className="text-sm font-medium text-foreground mt-1">{selectedTechnique.ruleCount}</p>
                  </div>
                </div>
                {selectedTechnique.description ? (
                  <div className="bg-secondary/20 rounded-lg p-3 border border-border/20">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Description</p>
                    <p className="text-xs text-foreground">{selectedTechnique.description}</p>
                  </div>
                ) : null}
                <div className="bg-secondary/20 rounded-lg p-3 border border-border/20">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Tactics</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTechnique.tactics.map(t => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">{TACTIC_LABELS[t] ?? t}</span>
                    ))}
                  </div>
                </div>
                {selectedTechnique.ruleIds.length > 0 ? (
                  <div className="bg-secondary/20 rounded-lg p-3 border border-border/20">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Associated Rule IDs</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedTechnique.ruleIds.slice(0, 30).map((id, idx) => (
                        <span key={`${id}-${idx}`} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/50 text-foreground font-mono border border-border/30">{id}</span>
                      ))}
                      {selectedTechnique.ruleIds.length > 30 ? <span className="text-[10px] text-muted-foreground">+{selectedTechnique.ruleIds.length - 30} more</span> : null}
                    </div>
                  </div>
                ) : null}
                <a href={`https://attack.mitre.org/techniques/${selectedTechnique.id.replace(".", "/")}/`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-xs text-primary hover:text-primary/80 transition-colors">
                  <Shield className="h-3.5 w-3.5" /> View on MITRE ATT&CK
                </a>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </WazuhGuard>
  );
}
