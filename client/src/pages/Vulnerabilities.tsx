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
  Bug, Shield, Search, ChevronLeft, ChevronRight,
  ExternalLink, AlertTriangle, TrendingDown, Layers,
  Database, Globe, Package, Server, Loader2,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  Treemap,
} from "recharts";

// ── Theme tokens ─────────────────────────────────────────────────────────────
const COLORS = {
  purple: "oklch(0.541 0.281 293.009)",
  cyan: "oklch(0.789 0.154 211.53)",
  green: "oklch(0.765 0.177 163.223)",
  yellow: "oklch(0.795 0.184 86.047)",
  red: "oklch(0.637 0.237 25.331)",
  orange: "oklch(0.705 0.191 22.216)",
};
const SEV_COLORS: Record<string, string> = {
  Critical: COLORS.red, High: COLORS.orange, Medium: COLORS.yellow, Low: COLORS.green, Untriaged: COLORS.cyan,
};

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-panel p-3 text-xs border border-glass-border">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color }} className="font-medium">{p.name}: {p.value?.toLocaleString()}</p>)}
    </div>
  );
}

function sevToThreat(sev: string): "critical" | "high" | "medium" | "low" | "info" {
  const s = sev.toLowerCase();
  if (s === "critical") return "critical";
  if (s === "high") return "high";
  if (s === "medium") return "medium";
  if (s === "low") return "low";
  return "info";
}

function extractItems(raw: unknown): Array<Record<string, unknown>> {
  const d = (raw as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  return (d?.affected_items as Array<Record<string, unknown>>) ?? [];
}

function SourceBadge({ source }: { source: "indexer" | "server" }) {
  const colors = { indexer: "bg-green-500/20 text-green-400 border-green-500/30", server: "bg-primary/20 text-primary border-primary/30" };
  const icons = { indexer: Database, server: Server };
  const Icon = icons[source];
  return <span className={`inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-full border ${colors[source]}`}><Icon className="h-2.5 w-2.5" />{source.toUpperCase()}</span>;
}

// ── Helpers to parse Indexer aggregation responses ───────────────────────────
function parseAggs(data: unknown): Record<string, unknown> {
  const resp = data as unknown as Record<string, unknown>;
  return (resp?.aggregations as Record<string, unknown>) ?? {};
}
function parseBuckets(agg: unknown): Array<Record<string, unknown>> {
  return ((agg as Record<string, unknown>)?.buckets as Array<Record<string, unknown>>) ?? [];
}

// ── View mode ────────────────────────────────────────────────────────────────
type ViewMode = "fleet" | "agent";

export default function Vulnerabilities() {
  const utils = trpc.useUtils();
  const [viewMode, setViewMode] = useState<ViewMode>("fleet");
  const [agentId, setAgentId] = useState("001");
  const [sevFilter, setSevFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedVuln, setSelectedVuln] = useState<Record<string, unknown> | null>(null);
  const pageSize = 50;

  // ── Connectivity ──────────────────────────────────────────────────────────
  const statusQ = trpc.wazuh.status.useQuery(undefined, { retry: 1, staleTime: 60_000 });
  const isWazuhConnected = statusQ.data?.configured === true && statusQ.data?.data != null;

  const indexerStatusQ = trpc.indexer.status.useQuery(undefined, { retry: 1, staleTime: 60_000 });
  const isIndexerConnected = indexerStatusQ.data?.configured === true && indexerStatusQ.data?.healthy === true;

  // ── Agent list ────────────────────────────────────────────────────────────
  const agentsQ = trpc.wazuh.agents.useQuery({ limit: 100, offset: 0, status: "active" }, { retry: 1, staleTime: 30_000, enabled: isWazuhConnected });
  const agentList = useMemo(() => {
    if (isWazuhConnected && agentsQ.data) return extractItems(agentsQ.data).filter(a => String(a.id ?? "") !== "");
    return [];
  }, [agentsQ.data, isWazuhConnected]);

  // ── Indexer: Fleet-wide aggregations ──────────────────────────────────────
  const vulnSevQ = trpc.indexer.vulnAggBySeverity.useQuery(undefined, { retry: 1, staleTime: 30_000, enabled: isIndexerConnected && viewMode === "fleet" });
  const vulnAgentQ = trpc.indexer.vulnAggByAgent.useQuery({ topN: 15 }, { retry: 1, staleTime: 30_000, enabled: isIndexerConnected && viewMode === "fleet" });
  const vulnPkgQ = trpc.indexer.vulnAggByPackage.useQuery({ topN: 15 }, { retry: 1, staleTime: 30_000, enabled: isIndexerConnected && viewMode === "fleet" });
  const vulnCveQ = trpc.indexer.vulnAggByCVE.useQuery({ topN: 20 }, { retry: 1, staleTime: 30_000, enabled: isIndexerConnected && viewMode === "fleet" });
  const vulnSearchQ = trpc.indexer.vulnSearch.useQuery(
    { size: pageSize, offset: page * pageSize, severity: sevFilter !== "all" ? sevFilter as "Critical" | "High" | "Medium" | "Low" : undefined, query: search || undefined },
    { retry: 1, staleTime: 15_000, enabled: isIndexerConnected && viewMode === "fleet" }
  );

  // ── Indexer: Per-agent vulnerabilities (replaces removed GET /vulnerability/{id}) ──
  const vulnsQ = trpc.indexer.vulnSearch.useQuery({
    agentId, size: pageSize, offset: page * pageSize,
    severity: sevFilter !== "all" ? (sevFilter.charAt(0).toUpperCase() + sevFilter.slice(1)) as "Critical" | "High" | "Medium" | "Low" : undefined,
  }, { retry: 1, staleTime: 15_000, enabled: isIndexerConnected && viewMode === "agent" });

  const handleRefresh = useCallback(() => { utils.wazuh.invalidate(); utils.indexer.invalidate(); }, [utils]);

  // ── Per-agent vulns from indexer (same shape as fleet search) ──────────────
  const agentVulnsParsed = useMemo(() => {
    if (viewMode !== "agent" || !isIndexerConnected || !vulnsQ.data?.data) return { items: [] as Array<Record<string, unknown>>, total: 0 };
    const resp = vulnsQ.data.data as unknown as Record<string, unknown>;
    const hits = (resp.hits as Record<string, unknown>) ?? {};
    const hitArr = ((hits.hits as Array<Record<string, unknown>>) ?? []);
    const total = typeof hits.total === "object" ? Number((hits.total as Record<string, unknown>).value ?? 0) : Number(hits.total ?? 0);
    const mapped = hitArr.map(h => {
      const src = (h._source as Record<string, unknown>) ?? {};
      const vuln = (src.vulnerability as Record<string, unknown>) ?? {};
      const pkg = (src.package as Record<string, unknown>) ?? {};
      const agent = (src.agent as Record<string, unknown>) ?? {};
      return {
        _id: String(h._id ?? ""),
        cve: vuln.id, severity: vuln.severity, title: vuln.title,
        cvss3_score: (vuln.score as Record<string, unknown>)?.base,
        name: pkg.name, version: pkg.version, architecture: pkg.architecture,
        status: vuln.status ?? vuln.condition,
        published: vuln.published, updated: vuln.updated,
        agent_id: agent.id, agent_name: agent.name,
        _raw: src,
      } as Record<string, unknown>;
    });
    return { items: mapped, total };
  }, [viewMode, isIndexerConnected, vulnsQ.data]);

  // ── Fleet severity distribution (Indexer or empty fallback) ──────────────────
  const { fleetSevDist, fleetTotal, fleetAvgCvss, fleetSource } = useMemo(() => {
    if (isIndexerConnected && vulnSevQ.data?.data) {
      const aggs = parseAggs(vulnSevQ.data.data);
      const sevBuckets = parseBuckets(aggs.severity);
      const avgCvss = Number((aggs.avg_cvss as Record<string, unknown>)?.value ?? 0);
      const total = sevBuckets.reduce((s, b) => s + Number(b.doc_count ?? 0), 0);
      return {
        fleetSevDist: sevBuckets.map(b => ({ name: String(b.key), value: Number(b.doc_count ?? 0) })),
        fleetTotal: total,
        fleetAvgCvss: avgCvss.toFixed(1),
        fleetSource: "indexer" as const,
      };
    }
    return {
      fleetSevDist: [],
      fleetTotal: 0,
      fleetAvgCvss: "0.0",
      fleetSource: "server" as const,
    };
  }, [isIndexerConnected, vulnSevQ.data]);

  // ── Top vulnerable agents (Indexer or empty fallback) ────────────────────────
  const { topAgents, agentSource } = useMemo(() => {
    if (isIndexerConnected && vulnAgentQ.data?.data) {
      const aggs = parseAggs(vulnAgentQ.data.data);
      const buckets = parseBuckets((aggs.top_agents as Record<string, unknown>));
      return {
        topAgents: buckets.map(b => {
          const nameBuckets = parseBuckets((b.agent_name as Record<string, unknown>));
          return {
            id: String(b.key),
            name: nameBuckets.length > 0 ? String(nameBuckets[0].key) : String(b.key),
            count: Number(b.doc_count ?? 0),
            avgCvss: Number((b.avg_cvss as Record<string, unknown>)?.value ?? 0).toFixed(1),
            sevBreakdown: parseBuckets(b.severity).map(s => ({ sev: String(s.key), count: Number(s.doc_count ?? 0) })),
          };
        }),
        agentSource: "indexer" as const,
      };
    }
    return {
      topAgents: [],
      agentSource: "server" as const,
    };
  }, [isIndexerConnected, vulnAgentQ.data]);

  // ── Top packages (Indexer or empty fallback) ─────────────────────────────────
  const { topPackages, pkgSource } = useMemo(() => {
    if (isIndexerConnected && vulnPkgQ.data?.data) {
      const aggs = parseAggs(vulnPkgQ.data.data);
      const buckets = parseBuckets((aggs.top_packages as Record<string, unknown>));
      return {
        topPackages: buckets.map(b => ({
          name: String(b.key),
          count: Number(b.doc_count ?? 0),
          avgCvss: Number((b.avg_cvss as Record<string, unknown>)?.value ?? 0).toFixed(1),
          sevBreakdown: parseBuckets(b.severity).map(s => ({ sev: String(s.key), count: Number(s.doc_count ?? 0) })),
        })),
        pkgSource: "indexer" as const,
      };
    }
    return {
      topPackages: [],
      pkgSource: "server" as const,
    };
  }, [isIndexerConnected, vulnPkgQ.data]);

  // ── Top CVEs (Indexer or empty fallback) ─────────────────────────────────────
  const { topCves, cveSource } = useMemo(() => {
    if (isIndexerConnected && vulnCveQ.data?.data) {
      const aggs = parseAggs(vulnCveQ.data.data);
      const buckets = parseBuckets((aggs.top_cves as Record<string, unknown>));
      return {
        topCves: buckets.map(b => {
          const sevBuckets = parseBuckets(b.severity);
          return {
            cve: String(b.key),
            count: Number(b.doc_count ?? 0),
            severity: sevBuckets.length > 0 ? String(sevBuckets[0].key) : "Unknown",
            affectedAgents: Number((b.affected_agents as Record<string, unknown>)?.value ?? 0),
            avgCvss: Number((b.avg_cvss as Record<string, unknown>)?.value ?? 0).toFixed(1),
            packages: parseBuckets(b.packages).map(p => String(p.key)).slice(0, 3),
          };
        }),
        cveSource: "indexer" as const,
      };
    }
    return {
      topCves: [],
      cveSource: "server" as const,
    };
  }, [isIndexerConnected, vulnCveQ.data]);

  // ── Per-agent vulns (Indexer-powered) ──────────────────────────────────────
  const { agentVulns, agentTotal, agentVulnSource } = useMemo(() => {
    if (agentVulnsParsed.items.length > 0) {
      return { agentVulns: agentVulnsParsed.items, agentTotal: agentVulnsParsed.total, agentVulnSource: "indexer" as const };
    }
    return { agentVulns: [] as Array<Record<string, unknown>>, agentTotal: 0, agentVulnSource: "indexer" as const };
  }, [agentVulnsParsed]);

  // ── Indexer fleet-wide search results ─────────────────────────────────────
  const { fleetVulns, fleetSearchTotal, fleetSearchSource } = useMemo(() => {
    if (isIndexerConnected && vulnSearchQ.data?.data) {
      const resp = vulnSearchQ.data.data as unknown as Record<string, unknown>;
      const hits = (resp.hits as Record<string, unknown>) ?? {};
      const hitArr = ((hits.hits as Array<Record<string, unknown>>) ?? []);
      const total = typeof hits.total === "object" ? Number((hits.total as Record<string, unknown>).value ?? 0) : Number(hits.total ?? 0);
      const mapped = hitArr.map(h => {
        const src = (h._source as Record<string, unknown>) ?? {};
        const vuln = (src.vulnerability as Record<string, unknown>) ?? {};
        const pkg = (src.package as Record<string, unknown>) ?? {};
        const agent = (src.agent as Record<string, unknown>) ?? {};
        return {
          _id: String(h._id ?? ""),
          cve: vuln.id, severity: vuln.severity, title: vuln.title,
          cvss3_score: (vuln.score as Record<string, unknown>)?.base,
          name: pkg.name, version: pkg.version, architecture: pkg.architecture,
          status: vuln.status ?? vuln.condition,
          published: vuln.published, updated: vuln.updated,
          agent_id: agent.id, agent_name: agent.name,
          _raw: src,
        } as Record<string, unknown>;
      });
      return { fleetVulns: mapped, fleetSearchTotal: total, fleetSearchSource: "indexer" as const };
    }
    return { fleetVulns: [] as Array<Record<string, unknown>>, fleetSearchTotal: 0, fleetSearchSource: "server" as const };
  }, [isIndexerConnected, vulnSearchQ.data, sevFilter, search]);

  // ── Computed KPIs ─────────────────────────────────────────────────────────
  const criticalCount = fleetSevDist.find(d => d.name === "Critical")?.value ?? 0;
  const highCount = fleetSevDist.find(d => d.name === "High")?.value ?? 0;
  const mediumCount = fleetSevDist.find(d => d.name === "Medium")?.value ?? 0;

  const activeVulns = viewMode === "fleet" ? fleetVulns : agentVulns;
  const activeTotal = viewMode === "fleet" ? fleetSearchTotal : agentTotal;
  const totalPages = Math.ceil(activeTotal / pageSize);

  // ── Treemap data for packages ─────────────────────────────────────────────
  const treemapData = useMemo(() => {
    return topPackages.slice(0, 12).map(p => ({
      name: p.name.length > 18 ? p.name.slice(0, 16) + "…" : p.name,
      fullName: p.name,
      size: p.count,
      avgCvss: p.avgCvss,
    }));
  }, [topPackages]);

  return (
    <WazuhGuard>
      <div className="space-y-6">
        <PageHeader title="Vulnerability Intelligence" subtitle="Fleet-wide CVE analysis — severity scoring, affected packages, top vulnerable agents, and NVD deep-links" onRefresh={handleRefresh} isLoading={statusQ.isLoading || indexerStatusQ.isLoading} />

        {/* View Mode Toggle + Agent Selector */}
        <GlassPanel className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(["fleet", "agent"] as ViewMode[]).map(mode => (
                <button key={mode} onClick={() => { setViewMode(mode); setPage(0); }}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === mode ? "bg-primary/20 text-primary" : "bg-secondary/30 text-muted-foreground hover:bg-secondary/50"}`}>
                  {mode === "fleet" ? "Fleet-Wide" : "Per-Agent"}
                </button>
              ))}
            </div>
          </div>
          {viewMode === "agent" && (
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-muted-foreground">Target Agent:</span>
              <Select value={agentId} onValueChange={(v) => { setAgentId(v); setPage(0); }}>
                <SelectTrigger className="w-[280px] h-8 text-xs bg-secondary/50 border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover border-border max-h-60">
                  {agentList.map(a => <SelectItem key={String(a.id)} value={String(a.id)}>{String(a.id)} — {String(a.name ?? "Unknown")} ({String(a.ip ?? "")})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </GlassPanel>

        {/* ── Loading State ── */}
        {vulnSearchQ.isLoading && <IndexerLoadingState message="Fetching vulnerability data from indexer…" />}
        {/* ── Error State ── */}
        {vulnSearchQ.isError && (
          <IndexerErrorState
            message="Failed to fetch vulnerability data from indexer"
            detail={vulnSearchQ.error?.message}
            onRetry={() => vulnSearchQ.refetch()}
          />
        )}

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {vulnSearchQ.isLoading ? <StatCardSkeleton count={5} /> : (<>
          <StatCard label="Total CVEs" value={viewMode === "fleet" ? fleetTotal : agentTotal} icon={Bug} colorClass="text-primary" />
          <StatCard label="Critical" value={criticalCount} icon={AlertTriangle} colorClass="text-threat-critical" />
          <StatCard label="High" value={highCount} icon={Shield} colorClass="text-threat-high" />
          <StatCard label="Medium" value={mediumCount} icon={TrendingDown} colorClass="text-threat-medium" />
          <StatCard label="Avg CVSS" value={fleetAvgCvss} icon={Bug} colorClass="text-primary" />
          </>)}
        </div>

        {/* Fleet-Wide Dashboard (Indexer-powered) */}
        {viewMode === "fleet" && (
          <div className="space-y-4">
            {/* Row 1: Severity Pie + Top CVEs */}
            {vulnSearchQ.isLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <ChartSkeleton variant="pie" height={220} title="Severity Distribution" className="lg:col-span-4" />
                <ChartSkeleton variant="bar" height={220} title="Top CVEs Across Fleet" className="lg:col-span-8" />
              </div>
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <GlassPanel className="lg:col-span-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Severity Distribution</h3>
                  <SourceBadge source={fleetSource} />
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={fleetSevDist} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value" stroke="none">
                      {fleetSevDist.map((entry, i) => <Cell key={i} fill={SEV_COLORS[entry.name] ?? COLORS.purple} />)}
                    </Pie>
                    <ReTooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.02 286)" }} />
                  </PieChart>
                </ResponsiveContainer>
              </GlassPanel>

              <GlassPanel className="lg:col-span-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Bug className="h-4 w-4 text-primary" /> Top CVEs Across Fleet</h3>
                  <SourceBadge source={cveSource} />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-border/30">
                      {["CVE", "Severity", "CVSS", "Occurrences", "Agents", "Packages", "NVD"].map(h => <th key={h} className="text-left py-1.5 px-2 text-muted-foreground font-medium">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {topCves.slice(0, 12).map((c, i) => (
                        <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                          <td className="py-1.5 px-2 font-mono text-primary text-[11px]">{c.cve}</td>
                          <td className="py-1.5 px-2"><ThreatBadge level={sevToThreat(c.severity)} /></td>
                          <td className="py-1.5 px-2 font-mono text-muted-foreground">{c.avgCvss}</td>
                          <td className="py-1.5 px-2 text-foreground font-medium">{c.count.toLocaleString()}</td>
                          <td className="py-1.5 px-2 text-muted-foreground">{c.affectedAgents}</td>
                          <td className="py-1.5 px-2 text-muted-foreground text-[10px]">{c.packages.join(", ") || "—"}</td>
                          <td className="py-1.5 px-2">
                            {c.cve.startsWith("CVE-") ? (
                              <a href={`https://nvd.nist.gov/vuln/detail/${c.cve}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassPanel>
            </div>
            )}

            {/* Row 2: Top Vulnerable Agents + Top Packages Treemap */}
            {vulnSearchQ.isLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <ChartSkeleton variant="bar" height={240} title="Top Vulnerable Agents" className="lg:col-span-6" />
                <ChartSkeleton variant="bar" height={240} title="Most Affected Packages" className="lg:col-span-6" />
              </div>
            ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <GlassPanel className="lg:col-span-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Server className="h-4 w-4 text-primary" /> Top Vulnerable Agents</h3>
                  <SourceBadge source={agentSource} />
                </div>
                <div className="space-y-2">
                  {topAgents.slice(0, 8).map((a, i) => {
                    const maxCount = topAgents[0]?.count ?? 1;
                    const pct = Math.round((a.count / maxCount) * 100);
                    return (
                      <div key={i} className="group">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono text-muted-foreground w-8">{a.id}</span>
                            <span className="text-xs text-foreground font-medium">{a.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">CVSS {a.avgCvss}</span>
                            <span className="text-xs font-medium text-foreground">{a.count.toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-secondary/30 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${COLORS.purple}, ${COLORS.orange})` }} />
                        </div>
                        {a.sevBreakdown.length > 0 && (
                          <div className="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {a.sevBreakdown.map((s, j) => (
                              <span key={j} className="text-[9px]" style={{ color: SEV_COLORS[s.sev] ?? COLORS.cyan }}>{s.sev}: {s.count}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </GlassPanel>

              <GlassPanel className="lg:col-span-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Package className="h-4 w-4 text-primary" /> Most Affected Packages</h3>
                  <SourceBadge source={pkgSource} />
                </div>
                {treemapData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <Treemap
                      data={treemapData}
                      dataKey="size"
                      nameKey="name"
                      stroke="oklch(0.3 0.04 286 / 30%)"
                      fill={COLORS.purple}
                      content={(({ x, y, width, height, name, size }: { x: number; y: number; width: number; height: number; name?: string; size?: number }) => {
                        if (width < 30 || height < 20) return <rect x={x} y={y} width={width} height={height} fill={COLORS.purple} stroke="oklch(0.3 0.04 286 / 30%)" />;
                        return (
                          <g>
                            <rect x={x} y={y} width={width} height={height} fill={COLORS.purple} fillOpacity={0.6} stroke="oklch(0.3 0.04 286 / 30%)" rx={4} />
                            <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="oklch(0.9 0.02 286)" fontSize={width > 80 ? 10 : 8} fontFamily="Inter">{name}</text>
                            <text x={x + width / 2} y={y + height / 2 + 8} textAnchor="middle" fill="oklch(0.65 0.02 286)" fontSize={8} fontFamily="JetBrains Mono">{size}</text>
                          </g>
                        );
                      }) as unknown as React.ReactElement}
                    >
                      <ReTooltip content={({ payload }: { payload?: Array<{ payload?: { fullName?: string; size?: number; avgCvss?: string } }> }) => {
                        if (!payload?.length) return null;
                        const d = payload[0]?.payload;
                        if (!d) return null;
                        return (
                          <div className="glass-panel p-3 text-xs border border-glass-border">
                            <p className="text-foreground font-medium">{d.fullName ?? ""}</p>
                            <p className="text-muted-foreground">CVEs: {d.size ?? 0}</p>
                            <p className="text-muted-foreground">Avg CVSS: {d.avgCvss ?? "0"}</p>
                          </div>
                        );
                      }} />
                    </Treemap>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">No package data</div>
                )}
              </GlassPanel>
            </div>
            )}
          </div>
        )}

        {/* CVE Table */}
        <GlassPanel>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Bug className="h-4 w-4 text-primary" />
              {viewMode === "fleet" ? "Fleet CVE Database" : `Agent ${agentId} CVEs`} ({activeTotal.toLocaleString()})
              <SourceBadge source={viewMode === "fleet" ? fleetSearchSource : agentVulnSource} />
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search CVEs..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 w-48 pl-8 text-xs bg-secondary/50 border-border" />
              </div>
              <Select value={sevFilter} onValueChange={(v) => { setSevFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[130px] h-8 text-xs bg-secondary/50 border-border"><SelectValue placeholder="Severity" /></SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="all">All Severity</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
              <ExportButton
                getData={() => activeVulns as Array<Record<string, unknown>>}
                baseName="vulnerabilities"
                columns={EXPORT_COLUMNS.vulnerabilities}
                context={sevFilter !== "all" ? sevFilter : viewMode === "agent" ? `agent-${agentId}` : "fleet"}
                label="Export"
              />
            </div>
          </div>

          {vulnSearchQ.isLoading ? (
            <TableSkeleton columns={9} rows={12} columnWidths={[2, 1, 1, 2, 1, 2, 1, 1, 1]} />
          ) : (
          <div className="overflow-x-auto" aria-live="polite" aria-label="Vulnerabilities table">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border/30">
                {(viewMode === "fleet" ? ["CVE", "Severity", "CVSS3", "Package", "Version", "Agent", "Status", "Published", "NVD"] : ["CVE", "Severity", "CVSS3", "Package", "Version", "Title", "Status", "Published", "NVD"]).map(h => <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>)}
              </tr></thead>
              <tbody>
                {activeVulns.map((v, i) => {
                  const cve = String(v.cve ?? "—");
                  const cvss3 = v.cvss3_score != null ? Number(v.cvss3_score).toFixed(1) : "—";
                  return (
                    <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors cursor-pointer" onClick={() => setSelectedVuln(v)}>
                      <td className="py-2 px-3 font-mono text-primary">{cve}</td>
                      <td className="py-2 px-3"><ThreatBadge level={sevToThreat(String(v.severity ?? ""))} /></td>
                      <td className="py-2 px-3 font-mono text-muted-foreground">{cvss3}</td>
                      <td className="py-2 px-3 text-foreground font-medium">{String(v.name ?? "—")}</td>
                      <td className="py-2 px-3 font-mono text-muted-foreground text-[10px]">{String(v.version ?? "—")}</td>
                      {viewMode === "fleet" ? (
                        <td className="py-2 px-3 text-muted-foreground text-[10px]">{String(v.agent_name ?? v.agent_id ?? "—")}</td>
                      ) : (
                        <td className="py-2 px-3 text-muted-foreground text-[10px] max-w-[200px] truncate">{String(v.title ?? "—")}</td>
                      )}
                      <td className="py-2 px-3"><span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${String(v.status) === "Fixed" ? "bg-green-500/20 text-green-400" : String(v.status) === "Active" ? "bg-threat-critical/20 text-threat-critical" : "bg-primary/10 text-primary"}`}>{String(v.status ?? "—")}</span></td>
                      <td className="py-2 px-3 text-muted-foreground text-[10px]">{String(v.published ?? "—")}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1">
                          {cve.startsWith("CVE-") ? (
                            <a href={`https://nvd.nist.gov/vuln/detail/${cve}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80" onClick={e => e.stopPropagation()}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                          <span onClick={e => e.stopPropagation()}>
                            <AddNoteDialog entityType="cve" entityId={cve} defaultTitle={`CVE: ${cve} — ${String(v.title ?? v.name ?? "")}`} defaultSeverity={String(v.severity ?? "").toLowerCase() === "critical" ? "critical" : String(v.severity ?? "").toLowerCase() === "high" ? "high" : String(v.severity ?? "").toLowerCase() === "medium" ? "medium" : "low"} compact />
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/30">
              <p className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-7 bg-transparent border-border"><ChevronLeft className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-7 bg-transparent border-border"><ChevronRight className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          )}
        </GlassPanel>

        {/* CVE Detail Dialog */}
        <Dialog open={!!selectedVuln} onOpenChange={(open) => !open && setSelectedVuln(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-card border-border">
            <DialogHeader>
              <DialogTitle className="font-display text-foreground flex items-center gap-2">
                <Bug className="h-5 w-5 text-primary" /> {String(selectedVuln?.cve ?? "CVE Detail")}
              </DialogTitle>
            </DialogHeader>
            {selectedVuln ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {([
                    ["Severity", selectedVuln.severity], ["CVSS v3", selectedVuln.cvss3_score],
                    ["Package", selectedVuln.name], ["Version", selectedVuln.version],
                    ["Architecture", selectedVuln.architecture], ["Status", selectedVuln.status ?? selectedVuln.condition],
                    ["Published", selectedVuln.published], ["Updated", selectedVuln.updated],
                    ["Detection Time", selectedVuln.detection_time],
                    ...(selectedVuln.agent_name ? [["Agent", `${selectedVuln.agent_id} — ${selectedVuln.agent_name}`]] : []),
                  ] as [string, unknown][]).map(([label, val]) => (
                    <div key={label} className="bg-secondary/30 rounded-lg p-3 border border-border/30">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
                      <p className="text-sm font-medium text-foreground mt-1 truncate">{String(val ?? "—")}</p>
                    </div>
                  ))}
                </div>
                {selectedVuln.title ? <div className="bg-secondary/20 rounded-lg p-3 border border-border/20"><p className="text-[10px] text-muted-foreground uppercase tracking-wider">Title</p><p className="text-sm text-foreground mt-1">{String(selectedVuln.title)}</p></div> : null}
                {Array.isArray(selectedVuln.external_references) ? (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">External References</p>
                    <div className="space-y-1">
                      {(selectedVuln.external_references as Array<Record<string, unknown>>).map((ref, i) => (
                        <a key={i} href={String(ref.url ?? "#")} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-primary hover:text-primary/80 transition-colors">
                          <ExternalLink className="h-3 w-3" /> {String(ref.url ?? ref.source ?? "Link")}
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}
                <RawJsonViewer data={selectedVuln._raw ?? selectedVuln} title="Full CVE JSON" />
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </WazuhGuard>
  );
}
