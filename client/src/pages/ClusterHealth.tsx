import { trpc } from "@/lib/trpc";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { WazuhGuard } from "@/components/shared/WazuhGuard";
import { ThreatBadge } from "@/components/shared/ThreatBadge";
import { RawJsonViewer } from "@/components/shared/RawJsonViewer";
import { BrokerWarnings } from "@/components/shared/BrokerWarnings";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Input } from "@/components/ui/input";
import {
  Server, Activity, CheckCircle2,
  XCircle, AlertTriangle, Network, Gauge, BarChart3,
  ChevronDown, ChevronUp, FileText, Search, X,
  ChevronLeft, ChevronRight, Settings, ScrollText,
} from "lucide-react";
import React, { useMemo, useCallback, useState, type ReactNode } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = {
  purple: "oklch(0.541 0.281 293.009)",
  cyan: "oklch(0.789 0.154 211.53)",
  green: "oklch(0.765 0.177 163.223)",
  yellow: "oklch(0.795 0.184 86.047)",
  red: "oklch(0.637 0.237 25.331)",
  orange: "oklch(0.705 0.191 22.216)",
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

function QueueGauge({ label, used, total }: { label: string; used: number; total: number }) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (pct / 100) * circumference;
  const color = pct >= 90 ? COLORS.red : pct >= 70 ? COLORS.yellow : COLORS.green;
  return (
    <div className="flex flex-col items-center">
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r="36" fill="none" stroke="oklch(0.3 0.04 286 / 20%)" strokeWidth="7" />
        <circle cx="45" cy="45" r="36" fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 45 45)" className="transition-all duration-700" />
        <text x="45" y="42" textAnchor="middle" fill="oklch(0.93 0.005 286)" fontSize="16" fontWeight="bold">{pct}%</text>
        <text x="45" y="56" textAnchor="middle" fill="oklch(0.65 0.02 286)" fontSize="7">USED</text>
      </svg>
      <span className="text-xs font-medium text-muted-foreground mt-1 text-center">{label}</span>
      <span className="text-[10px] text-muted-foreground">{used.toLocaleString()} / {total.toLocaleString()}</span>
    </div>
  );
}

function extractItems(raw: unknown): Array<Record<string, unknown>> {
  const d = (raw as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  return (d?.affected_items as Array<Record<string, unknown>>) ?? [];
}

function MetricRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/10">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] font-mono text-foreground">{value != null ? String(value) : "—"}</span>
    </div>
  );
}

// ── Node Logs Panel (render function to isolate tRPC unknown type) ────────
function renderNodeLogs(props: {
  nodeLogsQ: { data: unknown; isLoading: boolean };
  nodeLogs: { items: Array<Record<string, unknown>>; total: number };
  nodeName: string;
  logSearch: string;
  setLogSearch: (v: string) => void;
  logPage: number;
  setLogPage: (fn: (p: number) => number) => void;
  logTotalPages: number;
}): React.JSX.Element {
  const { nodeLogsQ, nodeLogs, nodeName, logSearch, setLogSearch, logPage, setLogPage, logTotalPages } = props;
  const rawData = nodeLogsQ.data != null ? (nodeLogsQ.data as Record<string, unknown>) : null;
  return (
    <GlassPanel>
      <div className="flex items-center justify-between mb-3">
        <h5 className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-primary" /> Node Logs
          <span className="text-muted-foreground/60">({nodeLogs.total.toLocaleString()} entries)</span>
        </h5>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              value={logSearch}
              onChange={(e) => { setLogSearch(e.target.value); setLogPage(() => 1); }}
              className="pl-7 h-7 text-xs bg-secondary/20 border-border/30 w-48"
            />
            {logSearch && (
              <button onClick={() => { setLogSearch(""); setLogPage(() => 1); }} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
          {rawData ? <RawJsonViewer data={rawData} title={`${nodeName} Logs JSON`} /> : null}
        </div>
      </div>

      {nodeLogsQ.isLoading ? (
        <TableSkeleton columns={4} rows={5} />
      ) : nodeLogs.items.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No logs found</p>
      ) : (
        <div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border/30">
                  {["Timestamp", "Tag", "Level", "Description"].map(h => (
                    <th key={h} className="text-left py-1.5 px-2 text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nodeLogs.items.map((log: Record<string, unknown>, i: number) => {
                  const level = String(log.level ?? log.tag ?? "info").toLowerCase();
                  const levelColor = level.includes("error") ? "text-red-400" :
                    level.includes("warn") ? "text-yellow-400" :
                    level.includes("debug") ? "text-gray-400" : "text-blue-400";
                  return (
                    <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                      <td className="py-1.5 px-2 font-mono text-muted-foreground whitespace-nowrap">{String(log.timestamp ?? "\u2014")}</td>
                      <td className="py-1.5 px-2 font-mono text-primary">{String(log.tag ?? "\u2014")}</td>
                      <td className="py-1.5 px-2">
                        <span className={`font-mono ${levelColor}`}>{String(log.level ?? "\u2014")}</span>
                      </td>
                      <td className="py-1.5 px-2 text-foreground truncate max-w-[500px]">{String(log.description ?? "\u2014")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {logTotalPages > 1 && (
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/10">
              <span className="text-[10px] text-muted-foreground">{nodeLogs.total.toLocaleString()} total</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setLogPage(p => Math.max(1, p - 1))} disabled={logPage <= 1} className="p-0.5 rounded hover:bg-secondary/30 disabled:opacity-30">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-[10px] text-muted-foreground">Page {logPage}/{logTotalPages}</span>
                <button onClick={() => setLogPage(p => Math.min(logTotalPages, p + 1))} disabled={logPage >= logTotalPages} className="p-0.5 rounded hover:bg-secondary/30 disabled:opacity-30">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </GlassPanel>
  );
}

// ── Per-Node Drill-Down Component ──────────────────────────────────────────
function NodeDrillDown({ nodeId, nodeName, isConnected }: { nodeId: string; nodeName: string; isConnected: boolean }) {
  const [logSearch, setLogSearch] = useState("");
  const [logPage, setLogPage] = useState(1);
  const logPageSize = 20;

  // Per-node queries
  const nodeStatusQ = trpc.wazuh.clusterNodeStatus.useQuery(
    { nodeId },
    { retry: 1, staleTime: 30_000, enabled: isConnected }
  );
  const nodeConfigQ = trpc.wazuh.clusterNodeConfiguration.useQuery(
    { nodeId },
    { retry: 1, staleTime: 60_000, enabled: isConnected }
  );
  const nodeDaemonStatsQ = trpc.wazuh.clusterNodeDaemonStats.useQuery(
    { nodeId },
    { retry: 1, staleTime: 15_000, enabled: isConnected }
  );
  const nodeLogsQ = trpc.wazuh.clusterNodeLogs.useQuery(
    { nodeId, limit: logPageSize, offset: (logPage - 1) * logPageSize, ...(logSearch ? { search: logSearch } : {}) },
    { retry: 1, staleTime: 15_000, enabled: isConnected }
  );
  const nodeLogsSummaryQ = trpc.wazuh.clusterNodeLogsSummary.useQuery(
    { nodeId },
    { retry: 1, staleTime: 30_000, enabled: isConnected }
  );
  const nodeAnalysisdQ = trpc.wazuh.clusterNodeStatsAnalysisd.useQuery(
    { nodeId },
    { retry: 1, staleTime: 30_000, enabled: isConnected }
  );
  const nodeRemotedQ = trpc.wazuh.clusterNodeStatsRemoted.useQuery(
    { nodeId },
    { retry: 1, staleTime: 30_000, enabled: isConnected }
  );
  const nodeWeeklyQ = trpc.wazuh.clusterNodeStatsWeekly.useQuery(
    { nodeId },
    { retry: 1, staleTime: 60_000, enabled: isConnected }
  );
  const nodeInfoQ = trpc.wazuh.clusterNodeInfo.useQuery(
    { nodeId },
    { retry: 1, staleTime: 30_000, enabled: isConnected }
  );
  const nodeStatsQ = trpc.wazuh.clusterNodeStats.useQuery(
    { nodeId },
    { retry: 1, staleTime: 30_000, enabled: isConnected }
  );
  const nodeStatsHourlyQ = trpc.wazuh.clusterNodeStatsHourly.useQuery(
    { nodeId },
    { retry: 1, staleTime: 30_000, enabled: isConnected }
  );
  const [compComponent, setCompComponent] = useState("agent");
  const [compConfiguration, setCompConfiguration] = useState("client");
  const nodeComponentConfigQ = trpc.wazuh.clusterNodeComponentConfig.useQuery(
    { nodeId, component: compComponent, configuration: compConfiguration },
    { retry: 1, staleTime: 30_000, enabled: isConnected }
  );

  // Parse data
  const nodeStatus: Record<string, unknown> = useMemo((): Record<string, unknown> => {
    const d = (nodeStatusQ.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    const items = (d?.affected_items as Array<Record<string, unknown>>) ?? [];
    if (items.length > 0) return items[0];
    if (d && typeof d === "object") {
      const keys = Object.keys(d).filter(k => !["affected_items", "total_affected_items", "total_failed_items", "failed_items"].includes(k));
      if (keys.length > 0) return d;
    }
    return {};
  }, [nodeStatusQ.data]);

  const nodeDaemonStats = useMemo(() => extractItems(nodeDaemonStatsQ.data), [nodeDaemonStatsQ.data]);
  const nodeLogs = useMemo(() => {
    const d = (nodeLogsQ.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    const items = (d?.affected_items as Array<Record<string, unknown>>) ?? [];
    const total = Number(d?.total_affected_items ?? items.length);
    return { items, total };
  }, [nodeLogsQ.data]);

  const nodeLogsSummary: Record<string, unknown> = useMemo(() => {
    const d = (nodeLogsSummaryQ.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    const items = (d?.affected_items as Array<Record<string, unknown>>) ?? [];
    return (items[0] ?? d ?? {}) as Record<string, unknown>;
  }, [nodeLogsSummaryQ.data]);

  const nodeAnalysisd = useMemo(() => extractItems(nodeAnalysisdQ.data), [nodeAnalysisdQ.data]);
  const nodeRemoted = useMemo(() => extractItems(nodeRemotedQ.data), [nodeRemotedQ.data]);
  const nodeWeekly = useMemo(() => extractItems(nodeWeeklyQ.data), [nodeWeeklyQ.data]);

  // Status entries
  const statusEntries: [string, unknown][] = Object.entries(nodeStatus).filter(([k]) =>
    !["affected_items", "total_affected_items", "total_failed_items", "failed_items"].includes(k)
  );

  const logTotalPages = Math.max(1, Math.ceil(nodeLogs.total / logPageSize));

  // Log summary badges
  const logSummaryEntries: [string, unknown][] = Object.entries(nodeLogsSummary).filter(([k]) =>
    !["affected_items", "total_affected_items", "total_failed_items", "failed_items"].includes(k)
  );

  const isLoading = nodeStatusQ.isLoading;

  return (
    <div className="space-y-4 mt-4 pl-4 border-l-2 border-primary/30">
      <div className="flex items-center gap-2 mb-2">
        <Server className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-display font-semibold text-foreground">{nodeName} — Drill-Down</h4>
      </div>

      {isLoading ? (
        <TableSkeleton columns={4} rows={3} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Node Daemon Status */}
          <GlassPanel>
            <h5 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-primary" /> Daemon Status
            </h5>
            <div className="grid grid-cols-2 gap-1.5">
              {statusEntries.map(([name, status]) => {
                const isRunning = String(status) === "running";
                return (
                  <div key={name} className={`flex items-center gap-1.5 p-2 rounded border text-[11px] ${
                    isRunning ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"
                  }`}>
                    <div className={`h-1.5 w-1.5 rounded-full ${isRunning ? "bg-green-400" : "bg-red-400"}`} />
                    <span className="font-mono text-foreground truncate">{name}</span>
                  </div>
                );
              })}
            </div>
            {nodeStatusQ.data != null ? <div className="mt-2"><RawJsonViewer data={nodeStatusQ.data as Record<string, unknown>} title={`${nodeName} Status JSON`} /></div> : null}
          </GlassPanel>

          {/* Node Analysisd Stats */}
          <GlassPanel>
            <h5 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5 text-primary" /> Analysisd Stats
            </h5>
            <div className="space-y-1">
              {nodeAnalysisd.length > 0 ? (
                ([
                  ["Events Received", nodeAnalysisd[0]?.events_received],
                  ["Events Dropped", nodeAnalysisd[0]?.events_dropped],
                  ["Alerts Written", nodeAnalysisd[0]?.alerts_written],
                  ["Syscheck Decoded", nodeAnalysisd[0]?.syscheck_events_decoded],
                  ["SCA Decoded", nodeAnalysisd[0]?.sca_events_decoded],
                ] as [string, unknown][]).map(([l, v]) => <MetricRow key={l} label={l} value={v != null ? Number(v).toLocaleString() : "—"} />)
              ) : (
                <p className="text-xs text-muted-foreground">No analysisd stats available</p>
              )}
            </div>
            {nodeAnalysisdQ.data != null ? <div className="mt-2"><RawJsonViewer data={nodeAnalysisdQ.data as Record<string, unknown>} title={`${nodeName} Analysisd JSON`} /></div> : null}
          </GlassPanel>

          {/* Node Remoted Stats */}
          <GlassPanel>
            <h5 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
              <Network className="h-3.5 w-3.5 text-primary" /> Remoted Stats
            </h5>
            <div className="space-y-1">
              {nodeRemoted.length > 0 ? (
                ([
                  ["Queue Size", nodeRemoted[0]?.queue_size],
                  ["TCP Sessions", nodeRemoted[0]?.tcp_sessions],
                  ["Events Count", nodeRemoted[0]?.evt_count],
                  ["Control Messages", nodeRemoted[0]?.ctrl_msg_count],
                  ["Discarded", nodeRemoted[0]?.discarded_count],
                ] as [string, unknown][]).map(([l, v]) => <MetricRow key={l} label={l} value={v != null ? Number(v).toLocaleString() : "—"} />)
              ) : (
                <p className="text-xs text-muted-foreground">No remoted stats available</p>
              )}
            </div>
            {nodeRemotedQ.data != null ? <div className="mt-2"><RawJsonViewer data={nodeRemotedQ.data as Record<string, unknown>} title={`${nodeName} Remoted JSON`} /></div> : null}
          </GlassPanel>
        </div>
      )}

      {/* Log Summary Badges */}
      {logSummaryEntries.length > 0 && (
        <GlassPanel>
          <h5 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-primary" /> Log Level Summary
          </h5>
          <div className="flex flex-wrap gap-2">
            {logSummaryEntries.map(([level, data]: [string, unknown]) => {
              const count: number = typeof data === "object" && data !== null
                ? Object.values(data as Record<string, number>).reduce((a: number, b: number) => a + (Number(b) || 0), 0)
                : Number(data) || 0;
              const colorMap: Record<string, string> = {
                error: "bg-red-500/20 text-red-300 border-red-500/30",
                warning: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
                info: "bg-blue-500/20 text-blue-300 border-blue-500/30",
                debug: "bg-gray-500/20 text-gray-300 border-gray-500/30",
              };
              return (
                <span key={level} className={`text-[10px] px-2 py-1 rounded border font-mono ${colorMap[level] ?? "bg-secondary/30 text-muted-foreground border-border/30"}`}>
                  {level}: {count.toLocaleString()}
                </span>
              );
            })}
          </div>
        </GlassPanel>
      )}

      {/* Node Logs Table */}
      {renderNodeLogs({
        nodeLogsQ, nodeLogs, nodeName, logSearch, setLogSearch, logPage, setLogPage, logTotalPages
      })}

      {/* Weekly Stats Chart */}
      {nodeWeekly.length > 0 && (
        <GlassPanel>
          <h5 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-primary" /> Weekly Stats
          </h5>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={nodeWeekly.map((d, i) => ({
              day: String(d.hour ?? d.day ?? i),
              totalall: Number(d.totalall ?? 0),
              events: Number(d.events ?? 0),
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.04 286 / 20%)" />
              <XAxis dataKey="day" tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 9 }} />
              <YAxis tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 9 }} />
              <ReTooltip content={<ChartTooltip />} />
              <Bar dataKey="totalall" fill={COLORS.purple} name="Total" radius={[2, 2, 0, 0]} />
              <Bar dataKey="events" fill={COLORS.cyan} name="Events" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          {nodeWeeklyQ.data != null ? <div className="mt-2"><RawJsonViewer data={nodeWeeklyQ.data as Record<string, unknown>} title={`${nodeName} Weekly JSON`} /></div> : null}
        </GlassPanel>
      )}

      {/* Node Configuration */}
      {nodeConfigQ.data != null ? (
        <GlassPanel>
          <h5 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-primary" /> Node Configuration
          </h5>
          <RawJsonViewer data={nodeConfigQ.data as Record<string, unknown>} title={`${nodeName} Configuration JSON`} />
        </GlassPanel>
      ) : null}

      {/* Node Info */}
      <GlassPanel>
        <h5 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
          <Server className="h-3.5 w-3.5 text-primary" /> Node Info
        </h5>
        <BrokerWarnings data={nodeInfoQ.data} context={`${nodeName} Info`} />
        {nodeInfoQ.isLoading ? <TableSkeleton columns={2} rows={3} /> : (() => {
          const infoItems = extractItems(nodeInfoQ.data);
          const info = infoItems[0] ?? ((nodeInfoQ.data as Record<string, unknown>)?.data as Record<string, unknown>) ?? {};
          const entries = Object.entries(info).filter(([k]) => !["affected_items", "total_affected_items", "total_failed_items", "failed_items"].includes(k));
          return entries.length === 0 ? <p className="text-xs text-muted-foreground py-2">No info available.</p> : (
            <div className="space-y-1">{entries.map(([k, v]) => <MetricRow key={k} label={k} value={typeof v === "object" ? JSON.stringify(v) : String(v ?? "\u2014")} />)}</div>
          );
        })()}
        {nodeInfoQ.data != null ? <div className="mt-2"><RawJsonViewer data={nodeInfoQ.data as Record<string, unknown>} title={`${nodeName} Info JSON`} /></div> : null}
      </GlassPanel>

      {/* Node Stats */}
      <GlassPanel>
        <h5 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
          <Gauge className="h-3.5 w-3.5 text-primary" /> Node Stats
        </h5>
        <BrokerWarnings data={nodeStatsQ.data} context={`${nodeName} Stats`} />
        {nodeStatsQ.isLoading ? <TableSkeleton columns={2} rows={3} /> : (() => {
          const statsItems = extractItems(nodeStatsQ.data);
          return statsItems.length === 0 ? <p className="text-xs text-muted-foreground py-2">No stats available.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead><tr className="border-b border-border/20 text-muted-foreground">
                  <th className="text-left py-1.5 px-2 font-medium">Hour</th>
                  <th className="text-right py-1.5 px-2 font-medium">Total</th>
                  <th className="text-right py-1.5 px-2 font-medium">Events</th>
                  <th className="text-right py-1.5 px-2 font-medium">Syscheck</th>
                  <th className="text-right py-1.5 px-2 font-medium">Firewall</th>
                </tr></thead>
                <tbody>
                  {statsItems.slice(0, 24).map((s, i) => (
                    <tr key={i} className="border-b border-border/5 hover:bg-secondary/10">
                      <td className="py-1 px-2 font-mono text-muted-foreground">{String(s.hour ?? i)}</td>
                      <td className="py-1 px-2 text-right font-mono text-foreground">{Number(s.totalall ?? 0).toLocaleString()}</td>
                      <td className="py-1 px-2 text-right font-mono text-foreground">{Number(s.events ?? 0).toLocaleString()}</td>
                      <td className="py-1 px-2 text-right font-mono text-foreground">{Number(s.syscheck ?? 0).toLocaleString()}</td>
                      <td className="py-1 px-2 text-right font-mono text-foreground">{Number(s.firewall ?? 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
        {nodeStatsQ.data != null ? <div className="mt-2"><RawJsonViewer data={nodeStatsQ.data as Record<string, unknown>} title={`${nodeName} Stats JSON`} /></div> : null}
      </GlassPanel>

      {/* Node Stats Hourly */}
      <GlassPanel>
        <h5 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5 text-primary" /> Node Stats (Hourly)
        </h5>
        <BrokerWarnings data={nodeStatsHourlyQ.data} context={`${nodeName} Stats Hourly`} />
        {nodeStatsHourlyQ.isLoading ? <TableSkeleton columns={3} rows={3} /> : (() => {
          const hourlyItems = extractItems(nodeStatsHourlyQ.data);
          return hourlyItems.length === 0 ? <p className="text-xs text-muted-foreground py-2">No hourly stats available.</p> : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={hourlyItems.map((d, i) => ({ hour: String(d.id ?? d.hour ?? i), total: Number(d.totalall ?? 0), events: Number(d.events ?? 0) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.04 286 / 20%)" />
                <XAxis dataKey="hour" tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 9 }} />
                <YAxis tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 9 }} />
                <ReTooltip content={<ChartTooltip />} />
                <Bar dataKey="total" fill={COLORS.purple} name="Total" radius={[2, 2, 0, 0]} />
                <Bar dataKey="events" fill={COLORS.cyan} name="Events" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          );
        })()}
        {nodeStatsHourlyQ.data != null ? <div className="mt-2"><RawJsonViewer data={nodeStatsHourlyQ.data as Record<string, unknown>} title={`${nodeName} Hourly Stats JSON`} /></div> : null}
      </GlassPanel>

      {/* Node Component Config */}
      <GlassPanel>
        <h5 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
          <Settings className="h-3.5 w-3.5 text-primary" /> Node Component Config
        </h5>
        <div className="flex items-center gap-2 mb-3">
          <select value={compComponent} onChange={e => setCompComponent(e.target.value)} className="bg-secondary/30 border border-border/20 rounded px-2 py-1 text-xs text-foreground">
            {["agent", "agentless", "analysis", "auth", "com", "csyslog", "integrator", "logcollector", "mail", "monitor", "request", "syscheck", "wdb", "wmodules"].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={compConfiguration} onChange={e => setCompConfiguration(e.target.value)} className="bg-secondary/30 border border-border/20 rounded px-2 py-1 text-xs text-foreground">
            {["client", "buffer", "labels", "internal", "cluster", "active-response", "alerts", "command", "decoders", "global", "localfile", "remote", "rules", "socket", "syscheck", "vulnerability-detector", "wmodules", "integration"].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <BrokerWarnings data={nodeComponentConfigQ.data} context={`${nodeName} Component Config`} />
        {nodeComponentConfigQ.isLoading ? <TableSkeleton columns={2} rows={3} /> : nodeComponentConfigQ.data != null ? (
          <RawJsonViewer data={nodeComponentConfigQ.data as Record<string, unknown>} title={`${nodeName} ${compComponent}/${compConfiguration} Config JSON`} />
        ) : <p className="text-xs text-muted-foreground py-2">No component config available.</p>}
      </GlassPanel>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
export default function ClusterHealth() {
  const [expandedNode, setExpandedNode] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const statusQ = trpc.wazuh.status.useQuery(undefined, { retry: 1, staleTime: 60_000 });
  const isConnected = statusQ.data?.configured === true && statusQ.data?.data != null;
  const managerStatusQ = trpc.wazuh.managerStatus.useQuery(undefined, { retry: 1, staleTime: 15_000, enabled: isConnected });
  const managerInfoQ = trpc.wazuh.managerInfo.useQuery(undefined, { retry: 1, staleTime: 60_000, enabled: isConnected });
  const managerStatsHourlyQ = trpc.wazuh.statsHourly.useQuery(undefined, { retry: 1, staleTime: 30_000, enabled: isConnected });
  const daemonStatsQ = trpc.wazuh.daemonStats.useQuery({ daemons: ["wazuh-analysisd", "wazuh-remoted", "wazuh-db"] }, { retry: 1, staleTime: 15_000, enabled: isConnected });
  const configValidQ = trpc.wazuh.managerConfigValidation.useQuery(undefined, { retry: 1, staleTime: 60_000, enabled: isConnected });
  const clusterStatusQ = trpc.wazuh.clusterStatus.useQuery(undefined, { retry: 1, staleTime: 30_000, enabled: isConnected });
  const clusterNodesQ = trpc.wazuh.clusterNodes.useQuery(undefined, { retry: 1, staleTime: 30_000, enabled: isConnected });
  const clusterHealthcheckQ = trpc.wazuh.clusterHealthcheck.useQuery(undefined, { retry: 1, staleTime: 30_000, enabled: isConnected });
  const clusterLocalInfoQ = trpc.wazuh.clusterLocalInfo.useQuery(undefined, { retry: 1, staleTime: 60_000, enabled: isConnected });
  const clusterLocalConfigQ = trpc.wazuh.clusterLocalConfig.useQuery(undefined, { retry: 1, staleTime: 60_000, enabled: isConnected });
  // ── Manager Logs (the actual procedure, not summary) ──────────────────────
  const [logLevel, setLogLevel] = useState<string>("");
  const [logTag, setLogTag] = useState("");
  const [mgrLogPage, setMgrLogPage] = useState(0);
  const managerLogsQ = trpc.wazuh.managerLogs.useQuery(
    { offset: mgrLogPage * 20, limit: 20, ...(logLevel ? { level: logLevel as "info" | "error" | "warning" | "debug" } : {}), ...(logTag ? { tag: logTag } : {}) },
    { retry: 1, staleTime: 15_000, enabled: isConnected }
  );
  // ── Manager Configuration (the actual procedure, not validation) ───────────
  const [cfgSection, setCfgSection] = useState("");
  const managerConfigQ = trpc.wazuh.managerConfiguration.useQuery(
    cfgSection ? { section: cfgSection } : undefined,
    { retry: 1, staleTime: 60_000, enabled: isConnected }
  );
  const handleRefresh = useCallback(() => { utils.wazuh.invalidate(); }, [utils]);

  const daemonStatuses = useMemo(() => {
    const src = managerStatusQ.data;
    const d = (src as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    const items = (d?.affected_items as Array<Record<string, unknown>>) ?? [];
    if (items.length > 0) return items[0];
    if (d && typeof d === "object" && !Array.isArray(d)) {
      const keys = Object.keys(d).filter(k => !["affected_items", "total_affected_items", "total_failed_items", "failed_items"].includes(k));
      if (keys.length > 0) return d;
    }
    return {};
  }, [managerStatusQ.data]);

  const managerInfo = useMemo(() => {
    const items = extractItems(managerInfoQ.data);
    return items[0] ?? {};
  }, [managerInfoQ.data]);

  const hourlyData = useMemo(() => {
    const items = extractItems(managerStatsHourlyQ.data);
    return items.map((item, i) => ({
      hour: `${String(item.hour ?? i).toString().padStart(2, "0")}:00`,
      totalall: Number(item.totalall ?? 0),
      events: Number(item.events ?? 0),
      syscheck: Number(item.syscheck ?? 0),
      firewall: Number(item.firewall ?? 0),
    }));
  }, [managerStatsHourlyQ.data]);

  const daemonMetrics = useMemo(() => extractItems(daemonStatsQ.data), [daemonStatsQ.data]);

  const configValid = useMemo(() => {
    const items = extractItems(configValidQ.data);
    return items[0] ?? {};
  }, [configValidQ.data]);

  const clusterStatus = useMemo(() => {
    const d = (clusterStatusQ.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    return d ?? {};
  }, [clusterStatusQ.data]);

  const clusterNodes = useMemo(() => extractItems(clusterNodesQ.data), [clusterNodesQ.data]);

  const daemonEntries = Object.entries(daemonStatuses).filter(([k]) => !["affected_items", "total_affected_items", "total_failed_items", "failed_items"].includes(k));
  const runningCount = daemonEntries.filter(([, v]) => String(v) === "running").length;
  const stoppedCount = daemonEntries.filter(([, v]) => String(v) !== "running").length;

  const isLoading = statusQ.isLoading;

  const daemonPie = useMemo(() => [
    { name: "Running", value: runningCount, color: COLORS.green },
    { name: "Stopped", value: stoppedCount, color: COLORS.red },
  ].filter(d => d.value > 0), [runningCount, stoppedCount]);

  const remotedDaemon = daemonMetrics.find(d => String(d.name) === "wazuh-remoted");
  const queueUsed = Number(remotedDaemon?.queue_size ?? 128);
  const queueTotal = Number(remotedDaemon?.total_queue_size ?? 131072);
  const analysisdDaemon = daemonMetrics.find(d => String(d.name) === "wazuh-analysisd");
  const dbDaemon = daemonMetrics.find(d => String(d.name) === "wazuh-db");

  return (
    <WazuhGuard>
      <div className="space-y-6">
        <PageHeader title="Cluster Health" subtitle="Manager daemons, event queues, cluster topology with per-node drill-down, and configuration validation" onRefresh={handleRefresh} isLoading={isLoading} />

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Daemons Running" value={runningCount} icon={CheckCircle2} colorClass="text-threat-low" />
          <StatCard label="Daemons Stopped" value={stoppedCount} icon={XCircle} colorClass={stoppedCount > 0 ? "text-threat-critical" : "text-muted-foreground"} />
          <StatCard label="Cluster" value={String(clusterStatus.enabled ?? "yes")} icon={Network} colorClass="text-primary" />
          <StatCard label="Config Status" value={String(configValid.status ?? "OK")} icon={String(configValid.status) === "OK" || !configValid.status ? CheckCircle2 : AlertTriangle} colorClass={String(configValid.status) === "OK" || !configValid.status ? "text-threat-low" : "text-threat-critical"} />
          <StatCard label="Version" value={String(managerInfo.version ?? "v4.7.2")} icon={Server} colorClass="text-primary" />
        </div>

        {/* Row: Daemon Status + Queue Gauges + Manager Info */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <GlassPanel className="lg:col-span-5">
            <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Daemon Status</h3>
            <div className="grid grid-cols-2 gap-2">
              {daemonEntries.map(([name, status]) => {
                const isRunning = String(status) === "running";
                return (
                  <div key={name} className={`flex items-center gap-2 p-2.5 rounded-lg border ${isRunning ? "bg-threat-low/5 border-threat-low/20" : "bg-threat-critical/5 border-threat-critical/20"}`}>
                    <div className={`h-2 w-2 rounded-full ${isRunning ? "bg-threat-low animate-pulse" : "bg-threat-critical"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-foreground truncate">{name}</p>
                      <p className={`text-[10px] ${isRunning ? "text-threat-low" : "text-threat-critical"}`}>{String(status)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {managerStatusQ.data ? <div className="mt-3"><RawJsonViewer data={managerStatusQ.data as Record<string, unknown>} title="Manager Status JSON" /></div> : null}
          </GlassPanel>

          <GlassPanel className="lg:col-span-3">
            <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Gauge className="h-4 w-4 text-primary" /> Event Queues</h3>
            <div className="flex flex-col items-center gap-4">
              <QueueGauge label="Remoted Queue" used={queueUsed} total={queueTotal} />
              {daemonPie.length > 0 ? (
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie data={daemonPie} cx="50%" cy="50%" innerRadius={30} outerRadius={48} paddingAngle={3} dataKey="value" stroke="none">
                      {daemonPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <ReTooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 10, color: "oklch(0.65 0.02 286)" }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </GlassPanel>

          <GlassPanel className="lg:col-span-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Server className="h-4 w-4 text-primary" /> Manager Info</h3>
            <div className="space-y-2">
              {([
                ["Name", managerInfo.name],
                ["Version", managerInfo.version],
                ["Type", managerInfo.type],
                ["Compilation Date", managerInfo.compilation_date],
                ["Path", managerInfo.path],
                ["Max Agents", managerInfo.max_agents],
                ["OpenSSL", managerInfo.openssl_support],
                ["Ruleset Version", managerInfo.ruleset_version],
                ["TZ Name", managerInfo.tz_name],
                ["TZ Offset", managerInfo.tz_offset],
              ] as [string, unknown][]).filter(([, v]) => v != null).map(([label, val]) => (
                <div key={label} className="flex items-center justify-between py-1.5 border-b border-border/10">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="text-xs font-mono text-foreground">{String(val)}</span>
                </div>
              ))}
            </div>
            {managerInfoQ.data ? <div className="mt-3"><RawJsonViewer data={managerInfoQ.data as Record<string, unknown>} title="Manager Info JSON" /></div> : null}
          </GlassPanel>
        </div>

        {/* Daemon Metrics Detail */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <GlassPanel>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> wazuh-analysisd</h3>
            <div className="space-y-2">
              {([
                ["Events Received", analysisdDaemon?.events_received],
                ["Events Dropped", analysisdDaemon?.events_dropped],
                ["Alerts Written", analysisdDaemon?.alerts_written],
                ["Firewall Written", analysisdDaemon?.firewall_written],
                ["FTS Written", analysisdDaemon?.fts_written],
                ["Syscheck Decoded", analysisdDaemon?.syscheck_events_decoded],
                ["Syscheck EDPS", analysisdDaemon?.syscheck_edps],
                ["Rootcheck Decoded", analysisdDaemon?.rootcheck_events_decoded],
                ["SCA Decoded", analysisdDaemon?.sca_events_decoded],
              ] as [string, unknown][]).map(([label, val]) => (
                <MetricRow key={label} label={label} value={val != null ? Number(val).toLocaleString() : "—"} />
              ))}
            </div>
          </GlassPanel>

          <GlassPanel>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2"><Network className="h-4 w-4 text-primary" /> wazuh-remoted</h3>
            <div className="space-y-2">
              {([
                ["Queue Size", remotedDaemon?.queue_size],
                ["Total Queue", remotedDaemon?.total_queue_size],
                ["TCP Sessions", remotedDaemon?.tcp_sessions],
                ["Events Count", remotedDaemon?.evt_count],
                ["Control Messages", remotedDaemon?.ctrl_msg_count],
                ["Discarded", remotedDaemon?.discarded_count],
                ["Messages Sent", remotedDaemon?.msg_sent],
                ["Bytes Received", remotedDaemon?.recv_bytes],
              ] as [string, unknown][]).map(([label, val]) => (
                <MetricRow key={label} label={label} value={val != null ? Number(val).toLocaleString() : "—"} />
              ))}
            </div>
          </GlassPanel>

          <GlassPanel>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2"><Server className="h-4 w-4 text-primary" /> wazuh-db</h3>
            <div className="space-y-2">
              {(() => {
                const breakdown = (dbDaemon?.queries_breakdown as Record<string, unknown>) ?? {};
                return ([
                  ["Queries Received", dbDaemon?.queries_received],
                  ["Agent Queries", breakdown.agent],
                  ["Global Queries", breakdown.global],
                  ["Task Queries", breakdown.task],
                  ["MITRE Queries", breakdown.mitre],
                  ["Wazuh Queries", breakdown.wazuh],
                ] as [string, unknown][]).map(([label, val]) => (
                  <MetricRow key={label} label={label} value={val != null ? Number(val).toLocaleString() : "—"} />
                ));
              })()}
            </div>
          </GlassPanel>
        </div>

        {/* Hourly Stats Chart */}
        <GlassPanel>
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Hourly Event Ingestion</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.04 286 / 20%)" />
              <XAxis dataKey="hour" tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 10 }} />
              <YAxis tick={{ fill: "oklch(0.65 0.02 286)", fontSize: 10 }} />
              <ReTooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.65 0.02 286)" }} />
              <Bar dataKey="totalall" fill={COLORS.purple} name="Total" radius={[3, 3, 0, 0]} />
              <Bar dataKey="events" fill={COLORS.cyan} name="Events" radius={[3, 3, 0, 0]} />
              <Bar dataKey="syscheck" fill={COLORS.green} name="Syscheck" radius={[3, 3, 0, 0]} />
              <Bar dataKey="firewall" fill={COLORS.orange} name="Firewall" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </GlassPanel>

        {/* Cluster Nodes with Drill-Down */}
        <GlassPanel>
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Network className="h-4 w-4 text-primary" /> Cluster Topology</h3>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs text-muted-foreground">Cluster Enabled:</span>
            <ThreatBadge level={String(clusterStatus.enabled) === "yes" ? "low" : "info"} />
            <span className="text-xs text-muted-foreground ml-4">Running:</span>
            <ThreatBadge level={String(clusterStatus.running) === "yes" ? "low" : "critical"} />
          </div>
          <BrokerWarnings data={clusterNodesQ.data} context="Cluster Nodes" />

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {clusterNodes.map((node, i) => {
              const nodeType = String(node.type ?? "worker");
              const isMaster = nodeType === "master";
              const nodeName = String(node.name ?? "Unknown");
              const isExpanded = expandedNode === nodeName;
              return (
                <button
                  key={i}
                  onClick={() => setExpandedNode(isExpanded ? null : nodeName)}
                  className={`text-left bg-secondary/20 rounded-lg p-4 border transition-all hover:bg-secondary/30 ${
                    isMaster ? "border-primary/40 bg-primary/5" : "border-border/20"
                  } ${isExpanded ? "ring-1 ring-primary/50" : ""}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Server className={`h-4 w-4 ${isMaster ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="text-sm font-medium text-foreground">{nodeName}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${isMaster ? "bg-primary/20 text-primary" : "bg-secondary/40 text-muted-foreground"}`}>{nodeType}</span>
                    <span className="ml-auto">
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-primary" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">IP</span><span className="font-mono text-foreground">{String(node.ip ?? "—")}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Version</span><span className="font-mono text-foreground">{String(node.version ?? "—")}</span></div>
                  </div>
                </button>
              );
            })}
          </div>
          {clusterNodesQ.data ? <div className="mt-3"><RawJsonViewer data={clusterNodesQ.data as Record<string, unknown>} title="Cluster Nodes JSON" /></div> : null}

          {/* Expanded Node Drill-Down */}
          {expandedNode && (
            <NodeDrillDown nodeId={expandedNode} nodeName={expandedNode} isConnected={isConnected} />
          )}
        </GlassPanel>

        {/* ── Manager Logs (actual procedure) ────────────────────────── */}
        <GlassPanel>
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><ScrollText className="h-4 w-4 text-primary" /> Manager Logs</h3>
          <BrokerWarnings data={managerLogsQ.data} context="Manager Logs" />
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <select value={logLevel} onChange={e => { setLogLevel(e.target.value); setMgrLogPage(0); }} className="bg-secondary/30 border border-border/20 rounded px-2 py-1 text-xs text-foreground">
              <option value="">All Levels</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
              <option value="debug">Debug</option>
            </select>
            <Input placeholder="Filter by tag…" value={logTag} onChange={e => { setLogTag(e.target.value); setMgrLogPage(0); }} className="w-40 h-7 text-xs bg-secondary/30" />
          </div>
          {managerLogsQ.isLoading ? (
            <TableSkeleton columns={4} rows={5} />
          ) : (() => {
            const mgrLogs = extractItems(managerLogsQ.data);
            const mgrLogsTotal = Number(((managerLogsQ.data as Record<string, unknown>)?.data as Record<string, unknown>)?.total_affected_items ?? mgrLogs.length);
            return mgrLogs.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No log entries found.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead><tr className="border-b border-border/20 text-muted-foreground">
                      <th className="text-left py-1.5 px-2 font-medium">Timestamp</th>
                      <th className="text-left py-1.5 px-2 font-medium">Level</th>
                      <th className="text-left py-1.5 px-2 font-medium">Tag</th>
                      <th className="text-left py-1.5 px-2 font-medium">Description</th>
                    </tr></thead>
                    <tbody>
                      {mgrLogs.map((log, i) => {
                        const lvl = String(log.level ?? log.type ?? "").toLowerCase();
                        const lvlColor = lvl === "error" ? "text-threat-critical" : lvl === "warning" ? "text-threat-high" : "text-muted-foreground";
                        return (
                          <tr key={i} className="border-b border-border/5 hover:bg-secondary/10">
                            <td className="py-1 px-2 font-mono text-muted-foreground whitespace-nowrap">{String(log.timestamp ?? "")}</td>
                            <td className={`py-1 px-2 font-mono uppercase ${lvlColor}`}>{lvl || "—"}</td>
                            <td className="py-1 px-2 font-mono text-foreground">{String(log.tag ?? "—")}</td>
                            <td className="py-1 px-2 text-foreground">{String(log.description ?? "—")}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-muted-foreground">{mgrLogsTotal.toLocaleString()} total</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setMgrLogPage(p => Math.max(0, p - 1))} disabled={mgrLogPage === 0} className="p-1 rounded hover:bg-secondary/30 disabled:opacity-30"><ChevronLeft className="h-3 w-3" /></button>
                    <span className="text-[10px] text-muted-foreground">Page {mgrLogPage + 1}</span>
                    <button onClick={() => setMgrLogPage(p => p + 1)} disabled={mgrLogs.length < 20} className="p-1 rounded hover:bg-secondary/30 disabled:opacity-30"><ChevronRight className="h-3 w-3" /></button>
                  </div>
                </div>
              </>
            );
          })()}
          {managerLogsQ.data ? <div className="mt-3"><RawJsonViewer data={managerLogsQ.data as Record<string, unknown>} title="Manager Logs JSON" /></div> : null}
        </GlassPanel>

        {/* ── Manager Configuration (actual procedure) ──────────────── */}
        <GlassPanel>
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Settings className="h-4 w-4 text-primary" /> Manager Configuration</h3>
          <BrokerWarnings data={managerConfigQ.data} context="Manager Configuration" />
          <div className="flex items-center gap-2 mb-3">
            <select value={cfgSection} onChange={e => setCfgSection(e.target.value)} className="bg-secondary/30 border border-border/20 rounded px-2 py-1 text-xs text-foreground">
              <option value="">All Sections</option>
              <option value="global">Global</option>
              <option value="alerts">Alerts</option>
              <option value="command">Command</option>
              <option value="localfile">Local File</option>
              <option value="syscheck">Syscheck</option>
              <option value="rootcheck">Rootcheck</option>
              <option value="remote">Remote</option>
              <option value="auth">Auth</option>
              <option value="cluster">Cluster</option>
              <option value="vulnerability-detection">Vulnerability Detection</option>
              <option value="cis-cat">CIS-CAT</option>
              <option value="osquery">OSQuery</option>
            </select>
          </div>
          {managerConfigQ.isLoading ? (
            <TableSkeleton columns={2} rows={6} />
          ) : (() => {
            const cfgItems = extractItems(managerConfigQ.data);
            const cfgRaw = (managerConfigQ.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
            // Manager config returns nested objects, render as key-value pairs
            const entries: Array<[string, unknown]> = [];
            if (cfgItems.length > 0) {
              cfgItems.forEach(item => Object.entries(item).forEach(([k, v]) => entries.push([k, v])));
            } else if (cfgRaw && typeof cfgRaw === "object") {
              Object.entries(cfgRaw).filter(([k]) => !["affected_items", "total_affected_items", "total_failed_items", "failed_items"].includes(k)).forEach(([k, v]) => entries.push([k, v]));
            }
            return entries.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No configuration data available.</p>
            ) : (
              <div className="space-y-1 max-h-[500px] overflow-y-auto">
                {entries.map(([key, val], i) => (
                  <div key={i} className="flex items-start gap-3 py-1.5 border-b border-border/10">
                    <span className="text-[11px] font-mono text-primary min-w-[180px] shrink-0">{key}</span>
                    <span className="text-[11px] font-mono text-foreground break-all">
                      {typeof val === "object" && val !== null ? JSON.stringify(val, null, 2) : String(val ?? "—")}
                    </span>
                  </div>
                ))}
              </div>
            );
          })()}
          {managerConfigQ.data ? <div className="mt-3"><RawJsonViewer data={managerConfigQ.data as Record<string, unknown>} title="Manager Configuration JSON" /></div> : null}
        </GlassPanel>

        {/* ── Cluster Healthcheck ──────────────────────────────── */}
        <GlassPanel>
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Cluster Healthcheck</h3>
          <BrokerWarnings data={clusterHealthcheckQ.data} context="Cluster Healthcheck" />
          {clusterHealthcheckQ.isLoading ? <TableSkeleton columns={3} rows={2} /> : (() => {
            const hcItems = extractItems(clusterHealthcheckQ.data);
            const hcRaw = (clusterHealthcheckQ.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
            const nodes = hcItems.length > 0 ? hcItems : (hcRaw?.nodes as Record<string, unknown>) ? Object.entries(hcRaw!.nodes as Record<string, unknown>).map(([name, info]) => ({ name, ...(typeof info === "object" && info !== null ? info as Record<string, unknown> : {}) })) : [];
            return (nodes as Array<Record<string, unknown>>).length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No healthcheck data available.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead><tr className="border-b border-border/20 text-muted-foreground">
                    <th className="text-left py-1.5 px-2 font-medium">Node</th>
                    <th className="text-left py-1.5 px-2 font-medium">Info</th>
                  </tr></thead>
                  <tbody>
                    {(nodes as Array<Record<string, unknown>>).map((n, i) => (
                      <tr key={i} className="border-b border-border/5 hover:bg-secondary/10">
                        <td className="py-1 px-2 font-mono text-primary">{String(n.name ?? n.node ?? `Node ${i}`)}</td>
                        <td className="py-1 px-2 font-mono text-foreground text-[10px] break-all">{JSON.stringify(Object.fromEntries(Object.entries(n).filter(([k]) => k !== "name" && k !== "node")))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
          {clusterHealthcheckQ.data != null ? <div className="mt-2"><RawJsonViewer data={clusterHealthcheckQ.data as Record<string, unknown>} title="Cluster Healthcheck JSON" /></div> : null}
        </GlassPanel>

        {/* ── Cluster Local Info ───────────────────────────────── */}
        <GlassPanel>
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Server className="h-4 w-4 text-primary" /> Local Node Info</h3>
          <BrokerWarnings data={clusterLocalInfoQ.data} context="Cluster Local Info" />
          {clusterLocalInfoQ.isLoading ? <TableSkeleton columns={2} rows={3} /> : (() => {
            const localItems = extractItems(clusterLocalInfoQ.data);
            const localInfo = localItems[0] ?? ((clusterLocalInfoQ.data as Record<string, unknown>)?.data as Record<string, unknown>) ?? {};
            const entries = Object.entries(localInfo).filter(([k]) => !["affected_items", "total_affected_items", "total_failed_items", "failed_items"].includes(k));
            return entries.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No local info available.</p>
            ) : (
              <div className="space-y-1">
                {entries.map(([k, v]) => <MetricRow key={k} label={k} value={typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")} />)}
              </div>
            );
          })()}
          {clusterLocalInfoQ.data != null ? <div className="mt-2"><RawJsonViewer data={clusterLocalInfoQ.data as Record<string, unknown>} title="Cluster Local Info JSON" /></div> : null}
        </GlassPanel>

        {/* ── Cluster Local Config ──────────────────────────────── */}
        <GlassPanel>
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Settings className="h-4 w-4 text-primary" /> Local Cluster Config</h3>
          <BrokerWarnings data={clusterLocalConfigQ.data} context="Cluster Local Config" />
          {clusterLocalConfigQ.isLoading ? <TableSkeleton columns={2} rows={3} /> : (() => {
            const cfgItems = extractItems(clusterLocalConfigQ.data);
            const cfgRaw = (clusterLocalConfigQ.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
            const entries: Array<[string, unknown]> = [];
            if (cfgItems.length > 0) cfgItems.forEach(item => Object.entries(item).forEach(([k, v]) => entries.push([k, v])));
            else if (cfgRaw) Object.entries(cfgRaw).filter(([k]) => !["affected_items", "total_affected_items", "total_failed_items", "failed_items"].includes(k)).forEach(([k, v]) => entries.push([k, v]));
            return entries.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">No local config available.</p>
            ) : (
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {entries.map(([k, v], i) => (
                  <div key={i} className="flex items-start gap-3 py-1.5 border-b border-border/10">
                    <span className="text-[11px] font-mono text-primary min-w-[180px] shrink-0">{k}</span>
                    <span className="text-[11px] font-mono text-foreground break-all">{typeof v === "object" && v !== null ? JSON.stringify(v, null, 2) : String(v ?? "—")}</span>
                  </div>
                ))}
              </div>
            );
          })()}
          {clusterLocalConfigQ.data != null ? <div className="mt-2"><RawJsonViewer data={clusterLocalConfigQ.data as Record<string, unknown>} title="Cluster Local Config JSON" /></div> : null}
        </GlassPanel>

        {/* Config Validation */}
        <GlassPanel>
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Configuration Validation</h3>
          <div className="flex items-center gap-3">
            <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${String(configValid.status) === "OK" || !configValid.status ? "bg-threat-low/10 border border-threat-low/20" : "bg-threat-critical/10 border border-threat-critical/20"}`}>
              {String(configValid.status) === "OK" || !configValid.status ? <CheckCircle2 className="h-6 w-6 text-threat-low" /> : <XCircle className="h-6 w-6 text-threat-critical" />}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Status: {String(configValid.status ?? "OK")}</p>
              {typeof configValid.details === "string" ? <p className="text-xs text-muted-foreground mt-0.5">{configValid.details}</p> : null}
            </div>
          </div>
          {configValidQ.data ? <div className="mt-3"><RawJsonViewer data={configValidQ.data as Record<string, unknown>} title="Config Validation JSON" /></div> : null}
        </GlassPanel>
      </div>
    </WazuhGuard>
  );
}
