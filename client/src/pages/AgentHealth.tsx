import { trpc } from "@/lib/trpc";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { StatCard } from "@/components/shared/StatCard";
import { IndexerLoadingState, IndexerErrorState, StatCardSkeleton } from "@/components/shared/IndexerStates";
import { ChartSkeleton } from "@/components/shared/ChartSkeleton";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { WazuhGuard } from "@/components/shared/WazuhGuard";
import { RawJsonViewer } from "@/components/shared/RawJsonViewer";
import { AddNoteDialog } from "@/components/shared/AddNoteDialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Users, Activity, AlertTriangle, Wifi, WifiOff, Clock, Search,
  Monitor, Server, Cpu, ChevronLeft, ChevronRight, X,
  ArrowDownCircle, FolderX, BarChart3,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";

const COLORS = {
  purple: "oklch(0.541 0.281 293.009)",
  cyan: "oklch(0.789 0.154 211.53)",
  green: "oklch(0.765 0.177 163.223)",
  yellow: "oklch(0.795 0.184 86.047)",
  red: "oklch(0.637 0.237 25.331)",
  orange: "oklch(0.705 0.191 22.216)",
};
const PIE_COLORS = [COLORS.green, COLORS.red, COLORS.yellow, COLORS.cyan, COLORS.purple];

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

export default function AgentHealth() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const pageSize = 25;

  const statusQ = trpc.wazuh.status.useQuery(undefined, { retry: 1, staleTime: 60_000 });
  const isConnected = statusQ.data?.configured === true && statusQ.data?.data != null;

  const agentSummaryQ = trpc.wazuh.agentSummaryStatus.useQuery(undefined, { retry: 1, staleTime: 30_000, enabled: isConnected });
  const agentSummaryOsQ = trpc.wazuh.agentSummaryOs.useQuery(undefined, { retry: 1, staleTime: 60_000, enabled: isConnected });
  const groupsQ = trpc.wazuh.agentGroups.useQuery(undefined, { retry: 1, staleTime: 60_000, enabled: isConnected });

  const agentsQ = trpc.wazuh.agents.useQuery({
    limit: pageSize, offset: page * pageSize,
    status: statusFilter !== "all" ? statusFilter as "active" | "disconnected" | "never_connected" | "pending" : undefined,
    group: groupFilter !== "all" ? groupFilter : undefined,
    search: search || undefined, sort: "-dateAdd",
  }, { retry: 1, staleTime: 15_000, enabled: isConnected });

  // New: outdated & ungrouped agent queries
  const outdatedQ = trpc.wazuh.agentsOutdated.useQuery({ limit: 1, offset: 0 }, { retry: 1, staleTime: 60_000, enabled: isConnected });
  const noGroupQ = trpc.wazuh.agentsNoGroup.useQuery({ limit: 1, offset: 0 }, { retry: 1, staleTime: 60_000, enabled: isConnected });

  const outdatedCount = useMemo(() => {
    const d = (outdatedQ.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    return Number(d?.total_affected_items ?? 0);
  }, [outdatedQ.data]);

  const noGroupCount = useMemo(() => {
    const d = (noGroupQ.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    return Number(d?.total_affected_items ?? 0);
  }, [noGroupQ.data]);

  const agentDetailQ = trpc.wazuh.agentById.useQuery({ agentId: selectedAgent ?? "000" }, { enabled: !!selectedAgent && isConnected });
  const agentOsQ = trpc.wazuh.agentOs.useQuery({ agentId: selectedAgent ?? "000" }, { enabled: !!selectedAgent && isConnected });
  const agentHwQ = trpc.wazuh.agentHardware.useQuery({ agentId: selectedAgent ?? "000" }, { enabled: !!selectedAgent && isConnected });

  const [, navigate] = useLocation();
  const handleRefresh = useCallback(() => { utils.wazuh.invalidate(); }, [utils]);

  // ── Agent summary (real or fallback) ──────────────────────────────────
  const agentData = useMemo(() => {
    const raw = agentSummaryQ.data;
    const items = extractItems(raw);
    const first = items[0];
    if (!first) return { total: 0, active: 0, disconnected: 0, never: 0, pending: 0 };
    return {
      total: Number(first.total ?? 0),
      active: Number(first.active ?? (first.connection as Record<string, number>)?.active ?? 0),
      disconnected: Number(first.disconnected ?? (first.connection as Record<string, number>)?.disconnected ?? 0),
      never: Number(first.never_connected ?? (first.connection as Record<string, number>)?.never_connected ?? 0),
      pending: Number(first.pending ?? (first.connection as Record<string, number>)?.pending ?? 0),
    };
  }, [agentSummaryQ.data, isConnected]);

  // ── OS distribution (real or fallback) ────────────────────────────────
  const osDistribution = useMemo(() => {
    if (isConnected && agentSummaryOsQ.data) {
      const items = extractItems(agentSummaryOsQ.data);
      const counts: Record<string, number> = {};
      items.forEach(item => { const os = String(item.os ?? item.platform ?? "Unknown"); counts[os] = (counts[os] ?? 0) + 1; });
      return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
    }
    return [];
  }, [agentSummaryOsQ.data, isConnected]);

  // ── Groups (real or fallback) ─────────────────────────────────────────
  const groups = useMemo(() => {
    if (isConnected && groupsQ.data) {
      const items = extractItems(groupsQ.data);
      return items.map(g => ({ name: String(g.name ?? ""), count: Number(g.count ?? 0) }));
    }
    return [];
  }, [groupsQ.data, isConnected]);

  // ── Agents list (real or fallback) ────────────────────────────────────
  const agents = useMemo(() => {
    if (isConnected && agentsQ.data) return extractItems(agentsQ.data);
    return [];
  }, [agentsQ.data, isConnected, statusFilter, groupFilter, search, page]);

  const totalAgents = useMemo(() => {
    if (isConnected && agentsQ.data) {
      const d = (agentsQ.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
      return Number(d?.total_affected_items ?? agents.length);
    }
    return agents.length;
  }, [agentsQ.data, isConnected, agents.length]);

  const statusPieData = useMemo(() => [
    { name: "Active", value: agentData.active },
    { name: "Disconnected", value: agentData.disconnected },
    { name: "Never Connected", value: agentData.never },
    { name: "Pending", value: agentData.pending },
  ].filter(d => d.value > 0), [agentData]);

  // ── Agent detail (real or fallback) ───────────────────────────────────
  const agentDetail = useMemo(() => {
    if (isConnected && agentDetailQ.data) {
      const items = extractItems(agentDetailQ.data);
      return items[0] ?? null;
    }
    if (selectedAgent) {
      return null;
    }
    return null;
  }, [agentDetailQ.data, isConnected, selectedAgent]);

  const agentOsDetail = useMemo(() => {
    if (isConnected && agentOsQ.data) return extractItems(agentOsQ.data)[0] ?? null;
    if (selectedAgent) {
      return null;
    }
    return null;
  }, [agentOsQ.data, isConnected, selectedAgent]);

  const agentHwDetail = useMemo(() => {
    if (isConnected && agentHwQ.data) return extractItems(agentHwQ.data)[0] ?? null;
    if (selectedAgent) return { cpu: { name: "Intel Xeon E5-2680 v4", cores: 4, mhz: 2400 }, ram: { total: 8388608, free: 4194304, usage: 50 }, board_serial: "VMware-42 01 a8 3b" } as unknown as Record<string, unknown>;
    return null;
  }, [agentHwQ.data, isConnected, selectedAgent]);

  const isLoading = statusQ.isLoading;
  const totalPages = Math.ceil(totalAgents / pageSize);

  return (
    <WazuhGuard>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <PageHeader title="Fleet Command" subtitle="Agent lifecycle management — status, OS distribution, groups, and deep inspection" onRefresh={handleRefresh} isLoading={isLoading} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/fleet-compare")}
            className="h-8 bg-transparent border-purple-500/30 text-purple-300 hover:bg-purple-500/10 flex-shrink-0"
          >
            <BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Compare Agents
          </Button>
        </div>

        {/* ── Loading State ── */}
        {isLoading && <IndexerLoadingState message="Fetching fleet status from Wazuh…" />}
        {/* ── Error State ── */}
        {statusQ.isError && (
          <IndexerErrorState
            message="Failed to connect to Wazuh Manager"
            detail={statusQ.error?.message}
            onRetry={() => statusQ.refetch()}
          />
        )}

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {isLoading ? <StatCardSkeleton count={7} /> : (<>
          <StatCard label="Total Agents" value={agentData.total} icon={Users} colorClass="text-primary" />
          <StatCard label="Active" value={agentData.active} icon={Wifi} colorClass="text-threat-low" />
          <StatCard label="Disconnected" value={agentData.disconnected} icon={WifiOff} colorClass="text-threat-high" />
          <StatCard label="Never Connected" value={agentData.never} icon={AlertTriangle} colorClass="text-threat-medium" />
          <StatCard label="Pending" value={agentData.pending} icon={Clock} colorClass="text-info-cyan" />
          <StatCard label="Outdated" value={outdatedCount} icon={ArrowDownCircle} colorClass="text-threat-medium" />
          <StatCard label="Ungrouped" value={noGroupCount} icon={FolderX} colorClass="text-threat-high" />
          </>)}
        </div>

        {/* Charts Row */}
        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <ChartSkeleton variant="pie" height={200} title="Connection Status" className="lg:col-span-3" />
            <ChartSkeleton variant="bar" height={200} title="OS Distribution" className="lg:col-span-5" />
            <ChartSkeleton variant="bar" height={200} title="Agent Groups" className="lg:col-span-4" />
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <GlassPanel className="lg:col-span-3">
            <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Connection Status</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value" stroke="none">
                  {statusPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <ReTooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.02 286)" }} />
              </PieChart>
            </ResponsiveContainer>
          </GlassPanel>

          <GlassPanel className="lg:col-span-5">
            <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Monitor className="h-4 w-4 text-primary" /> OS Distribution</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={osDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.04 286 / 20%)" />
                <XAxis dataKey="name" tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 9 }} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 10 }} />
                <ReTooltip content={<ChartTooltip />} />
                <Bar dataKey="value" fill={COLORS.purple} radius={[4, 4, 0, 0]} name="Agents" />
              </BarChart>
            </ResponsiveContainer>
          </GlassPanel>

          <GlassPanel className="lg:col-span-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Server className="h-4 w-4 text-primary" /> Agent Groups ({groups.length})</h3>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {groups.map(g => (
                <button key={g.name} onClick={() => { setGroupFilter(g.name); setPage(0); }}
                  className={`w-full flex items-center justify-between py-2 px-3 rounded-lg transition-colors text-left ${groupFilter === g.name ? "bg-primary/15 border border-primary/30" : "bg-secondary/30 border border-border/30 hover:bg-secondary/50"}`}>
                  <span className="text-xs font-medium text-foreground">{g.name}</span>
                  <span className="text-xs font-mono text-muted-foreground">{g.count}</span>
                </button>
              ))}
            </div>
          </GlassPanel>
        </div>
        )}

        {/* Agent Table */}
        <GlassPanel>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Agent Fleet ({totalAgents} total)</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search agents..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="h-8 w-48 pl-8 text-xs bg-secondary/50 border-border" />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[140px] h-8 text-xs bg-secondary/50 border-border"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="disconnected">Disconnected</SelectItem>
                  <SelectItem value="never_connected">Never Connected</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              {groupFilter !== "all" && (
                <Button variant="outline" size="sm" onClick={() => setGroupFilter("all")} className="h-8 text-xs bg-transparent border-border gap-1"><X className="h-3 w-3" /> {groupFilter}</Button>
              )}
            </div>
          </div>

          {isLoading ? (
            <TableSkeleton columns={9} rows={10} columnWidths={[1, 2, 2, 2, 1, 2, 1, 2, 1]} />
          ) : (
          <div className="overflow-x-auto" aria-live="polite" aria-label="Agent fleet table">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border/30">
                {["ID", "Name", "IP", "OS", "Version", "Group", "Status", "Last Keep Alive", "Actions"].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {agents.map((agent) => {
                  const status = String(agent.status ?? "unknown");
                  const os = agent.os as Record<string, unknown> | undefined;
                  return (
                    <tr key={String(agent.id)} className="border-b border-border/10 hover:bg-secondary/20 transition-colors cursor-pointer" onClick={() => navigate(`/fleet/${String(agent.id)}`)}>
                      <td className="py-2.5 px-3 font-mono text-primary">{String(agent.id)}</td>
                      <td className="py-2.5 px-3 text-foreground font-medium">{String(agent.name ?? "—")}</td>
                      <td className="py-2.5 px-3 font-mono text-muted-foreground">{String(agent.ip ?? "—")}</td>
                      <td className="py-2.5 px-3 text-muted-foreground truncate max-w-[150px]">{String(os?.name ?? os?.platform ?? "—")}</td>
                      <td className="py-2.5 px-3 font-mono text-muted-foreground">{String(agent.version ?? "—")}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{Array.isArray(agent.group) ? (agent.group as string[]).join(", ") : "—"}</td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${status === "active" ? "text-threat-low" : status === "disconnected" ? "text-threat-high" : "text-muted-foreground"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${status === "active" ? "bg-threat-low" : status === "disconnected" ? "bg-threat-high" : "bg-muted-foreground"}`} />
                          {status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground font-mono text-[10px]">{agent.lastKeepAlive ? new Date(String(agent.lastKeepAlive)).toLocaleString() : "—"}</td>
                      <td className="py-2.5 px-3">
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/fleet/${String(agent.id)}`); }} className="h-6 text-[10px] bg-transparent border-border hover:bg-accent px-2">Drilldown</Button>
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
              <p className="text-xs text-muted-foreground">Page {page + 1} of {totalPages} ({totalAgents} agents)</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-7 bg-transparent border-border"><ChevronLeft className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-7 bg-transparent border-border"><ChevronRight className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          )}
        </GlassPanel>

        {/* Agent Detail Drawer */}
        <Dialog open={!!selectedAgent} onOpenChange={(open) => !open && setSelectedAgent(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-card border-border">
            <DialogHeader>
              <DialogTitle className="font-display text-foreground flex items-center gap-2"><Monitor className="h-5 w-5 text-primary" /> Agent {selectedAgent} — Deep Inspection</DialogTitle>
            </DialogHeader>
            {agentDetail ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {([["Name", agentDetail.name], ["IP", agentDetail.ip], ["Status", agentDetail.status], ["Version", agentDetail.version], ["Manager", agentDetail.manager], ["Node", agentDetail.node_name], ["Registered", agentDetail.dateAdd ? new Date(String(agentDetail.dateAdd)).toLocaleString() : "—"], ["Last Alive", agentDetail.lastKeepAlive ? new Date(String(agentDetail.lastKeepAlive)).toLocaleString() : "—"], ["Groups", Array.isArray(agentDetail.group) ? (agentDetail.group as string[]).join(", ") : "—"]] as [string, unknown][]).map(([label, val]) => (
                    <div key={label} className="bg-secondary/30 rounded-lg p-3 border border-border/30">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
                      <p className="text-sm font-medium text-foreground mt-1 truncate">{String(val ?? "—")}</p>
                    </div>
                  ))}
                </div>
                {agentOsDetail && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2"><Monitor className="h-3.5 w-3.5 text-primary" /> Operating System</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(agentOsDetail).filter(([k]) => k !== "scan").map(([k, v]) => (
                        <div key={k} className="bg-secondary/20 rounded p-2 border border-border/20">
                          <p className="text-[10px] text-muted-foreground">{k}</p>
                          <p className="text-xs font-mono text-foreground truncate">{typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {agentHwDetail && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2"><Cpu className="h-3.5 w-3.5 text-primary" /> Hardware</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(agentHwDetail).filter(([k]) => k !== "scan").map(([k, v]) => (
                        <div key={k} className="bg-secondary/20 rounded p-2 border border-border/20">
                          <p className="text-[10px] text-muted-foreground">{k}</p>
                          <p className="text-xs font-mono text-foreground truncate">{typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <AddNoteDialog entityType="agent" entityId={selectedAgent ?? ""} defaultTitle={`Agent ${selectedAgent}: ${String(agentDetail.name ?? "")} investigation`} triggerLabel="Annotate Agent" />
                  <RawJsonViewer data={agentDetail} title="Agent Detail JSON" />
                  {agentOsDetail ? <RawJsonViewer data={agentOsDetail} title="OS Detail JSON" /> : null}
                  {agentHwDetail ? <RawJsonViewer data={agentHwDetail} title="Hardware Detail JSON" /> : null}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-12"><div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </WazuhGuard>
  );
}
