import { GlassPanel } from "@/components/shared/GlassPanel";
import { RawJsonViewer } from "@/components/shared/RawJsonViewer";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { ChartSkeleton } from "@/components/shared/ChartSkeleton";
import { ThreatBadge } from "@/components/shared/ThreatBadge";
import { Button } from "@/components/ui/button";
import { BrokerWarnings } from "@/components/shared/BrokerWarnings";
import {
  ArrowLeft, Shield, Activity, Bug, FileSearch, Cpu, Monitor,
  Server, Wifi, WifiOff, Clock, Package, Globe, Users, HardDrive,
  AlertTriangle, ChevronLeft, ChevronRight, ExternalLink, Eye,
  FolderSearch, Plus, Link2, GitBranch, Settings, BarChart3, Key,
  Copy, EyeOff, Loader2, Lock, ShieldAlert,
} from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────
type Tab = "overview" | "alerts" | "vulnerabilities" | "fim" | "syscollector" | "timeline" | "config";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <Monitor className="w-3.5 h-3.5" /> },
  { id: "alerts", label: "Alerts", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  { id: "vulnerabilities", label: "Vulnerabilities", icon: <Bug className="w-3.5 h-3.5" /> },
  { id: "fim", label: "File Integrity", icon: <FileSearch className="w-3.5 h-3.5" /> },
  { id: "syscollector", label: "System Info", icon: <Cpu className="w-3.5 h-3.5" /> },
  { id: "timeline", label: "Timeline", icon: <GitBranch className="w-3.5 h-3.5" /> },
  { id: "config", label: "Config & Stats", icon: <Settings className="w-3.5 h-3.5" /> },
];

const SEVERITY_COLORS: Record<string, string> = {
  Critical: "oklch(0.637 0.237 25.331)",
  High: "oklch(0.705 0.191 47)",
  Medium: "oklch(0.795 0.184 86.047)",
  Low: "oklch(0.765 0.177 163.223)",
};

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-panel p-3 text-xs border border-glass-border">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-foreground">{p.name}: {p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Overview Tab ───────────────────────────────────────────────────────────
function OverviewTab({ agentId, agent }: { agentId: string; agent: any }) {
  const osQ = trpc.wazuh.agentOs.useQuery({ agentId }, { retry: false });
  const hwQ = trpc.wazuh.agentHardware.useQuery({ agentId }, { retry: false });
  const scaQ = trpc.wazuh.scaPolicies.useQuery({ agentId }, { retry: false });
  const lastScanQ = trpc.wazuh.syscheckLastScan.useQuery({ agentId }, { retry: false });

  const os = (osQ.data as any)?.data?.affected_items?.[0] ?? null;
  const hw = (hwQ.data as any)?.data?.affected_items?.[0] ?? null;
  const scaPolicies = (scaQ.data as any)?.data?.affected_items ?? [];
  const lastScan = (lastScanQ.data as any)?.data?.affected_items?.[0] ?? null;

  const status = String(agent?.status ?? "unknown");
  const agentOs = agent?.os as Record<string, unknown> | undefined;

  return (
    <div className="space-y-6">
      {/* Agent Identity Card */}
      <GlassPanel className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Identity */}
          <div className="space-y-3">
            <h3 className="text-sm font-display font-bold text-foreground flex items-center gap-2">
              <Monitor className="w-4 h-4 text-purple-400" /> Agent Identity
            </h3>
            <div className="space-y-2 text-xs">
              <Row label="Name" value={String(agent?.name ?? "—")} />
              <Row label="ID" value={agentId} mono />
              <Row label="IP" value={String(agent?.ip ?? "—")} mono />
              <Row label="Status">
                <span className={`inline-flex items-center gap-1.5 font-medium ${status === "active" ? "text-threat-low" : status === "disconnected" ? "text-threat-high" : "text-muted-foreground"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${status === "active" ? "bg-threat-low" : status === "disconnected" ? "bg-threat-high" : "bg-muted-foreground"}`} />
                  {status}
                </span>
              </Row>
              <Row label="Version" value={String(agent?.version ?? "—")} mono />
              <Row label="Groups" value={Array.isArray(agent?.group) ? (agent.group as string[]).join(", ") : "—"} />
              <Row label="Last Keep Alive" value={agent?.lastKeepAlive ? new Date(String(agent.lastKeepAlive)).toLocaleString() : "—"} />
              <Row label="Registration Date" value={agent?.dateAdd ? new Date(String(agent.dateAdd)).toLocaleString() : "—"} />
            </div>
          </div>

          {/* OS Info */}
          <div className="space-y-3">
            <h3 className="text-sm font-display font-bold text-foreground flex items-center gap-2">
              <Server className="w-4 h-4 text-cyan-400" /> Operating System
            </h3>
            {osQ.isLoading ? (
              <div className="animate-pulse space-y-2">
                {[...Array(5)].map((_, i) => <div key={i} className="h-4 bg-white/5 rounded" />)}
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <Row label="OS" value={String(os?.os_name ?? agentOs?.name ?? "—")} />
                <Row label="Version" value={String(os?.os_version ?? agentOs?.version ?? "—")} />
                <Row label="Platform" value={String(os?.os_platform ?? agentOs?.platform ?? "—")} />
                <Row label="Architecture" value={String(os?.architecture ?? "—")} />
                <Row label="Kernel" value={String(os?.sysname ?? "—") + " " + String(os?.release ?? "")} />
                <Row label="Hostname" value={String(os?.hostname ?? "—")} />
              </div>
            )}
          </div>

          {/* Hardware */}
          <div className="space-y-3">
            <h3 className="text-sm font-display font-bold text-foreground flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-green-400" /> Hardware
            </h3>
            {hwQ.isLoading ? (
              <div className="animate-pulse space-y-2">
                {[...Array(4)].map((_, i) => <div key={i} className="h-4 bg-white/5 rounded" />)}
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                <Row label="CPU" value={String(hw?.cpu_name ?? "—")} />
                <Row label="Cores" value={String(hw?.cpu_cores ?? "—")} />
                <Row label="RAM" value={hw?.ram_total ? `${(Number(hw.ram_total) / 1024 / 1024 / 1024).toFixed(1)} GB` : "—"} />
                <Row label="Board Serial" value={String(hw?.board_serial ?? "—")} mono />
              </div>
            )}
          </div>
        </div>
      </GlassPanel>

      {/* SCA Compliance Summary */}
      <GlassPanel className="p-6">
        <h3 className="text-sm font-display font-bold text-foreground mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4 text-purple-400" /> Compliance Posture (SCA)
        </h3>
        {scaQ.isLoading ? (
          <ChartSkeleton variant="bar" height={120} />
        ) : scaPolicies.length === 0 ? (
          <p className="text-xs text-muted-foreground">No SCA policies found for this agent.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {scaPolicies.map((p: any) => {
              const pass = Number(p.pass ?? 0);
              const fail = Number(p.fail ?? 0);
              const total = pass + fail + Number(p.invalid ?? 0);
              const pct = total > 0 ? Math.round((pass / total) * 100) : 0;
              return (
                <div key={String(p.policy_id)} className="glass-panel p-4 rounded-xl border border-white/5">
                  <p className="text-xs font-medium text-foreground truncate mb-2">{String(p.name ?? p.policy_id)}</p>
                  <div className="flex items-center gap-3">
                    <div className="relative w-12 h-12">
                      <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke="oklch(0.2 0.02 286)" strokeWidth="3" />
                        <circle cx="18" cy="18" r="15.9" fill="none" stroke={pct >= 80 ? "oklch(0.765 0.177 163.223)" : pct >= 50 ? "oklch(0.795 0.184 86.047)" : "oklch(0.637 0.237 25.331)"} strokeWidth="3" strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">{pct}%</span>
                    </div>
                    <div className="text-[10px] space-y-0.5">
                      <p className="text-threat-low">Pass: {pass}</p>
                      <p className="text-threat-high">Fail: {fail}</p>
                      <p className="text-muted-foreground">Total: {total}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassPanel>

      {/* Last FIM Scan */}
      <GlassPanel className="p-6">
        <h3 className="text-sm font-display font-bold text-foreground mb-3 flex items-center gap-2">
          <FileSearch className="w-4 h-4 text-cyan-400" /> Last FIM Scan
        </h3>
        {lastScanQ.isLoading ? (
          <div className="animate-pulse h-8 bg-white/5 rounded w-64" />
        ) : lastScan ? (
          <div className="flex items-center gap-6 text-xs">
            <Row label="Start" value={lastScan.start ? new Date(String(lastScan.start)).toLocaleString() : "—"} />
            <Row label="End" value={lastScan.end ? new Date(String(lastScan.end)).toLocaleString() : "—"} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No FIM scan data available.</p>
        )}
      </GlassPanel>

      {/* Related Investigations */}
      <RelatedInvestigations agentId={agentId} agentName={String(agent?.name ?? agentId)} />

      {/* Raw Agent JSON */}
      <GlassPanel className="p-6">
        <h3 className="text-sm font-display font-bold text-foreground mb-3 flex items-center gap-2">
          <Eye className="w-4 h-4 text-muted-foreground" /> Raw Agent Data
        </h3>
        <RawJsonViewer data={agent} />
      </GlassPanel>
    </div>
  );
}

// ── Related Investigations ────────────────────────────────────────────────
function RelatedInvestigations({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [, navigate] = useLocation();
  const investigationsQ = trpc.graph.investigationsByAgent.useQuery({ agentId }, { retry: false });
  const utils = trpc.useUtils();
  const createMutation = trpc.graph.createInvestigation.useMutation({
    onSuccess: (data) => {
      utils.graph.investigationsByAgent.invalidate({ agentId });
      utils.graph.listInvestigations.invalidate();
      // Add agent as evidence to the new investigation
      addEvidenceMutation.mutate({
        id: data.id,
        evidence: [{
          type: "agent",
          label: `Agent ${agentId}: ${agentName}`,
          data: { agentId, agentName, addedFrom: "agent-detail" },
          addedAt: new Date().toISOString(),
        }],
      });
    },
  });
  const addEvidenceMutation = trpc.graph.updateInvestigation.useMutation({
    onSuccess: () => {
      utils.graph.investigationsByAgent.invalidate({ agentId });
    },
  });

  const sessions = investigationsQ.data?.sessions ?? [];
  const STATUS_COLORS: Record<string, string> = {
    active: "bg-green-500/15 text-green-300 border-green-500/20",
    closed: "bg-blue-500/15 text-blue-300 border-blue-500/20",
    archived: "bg-gray-500/15 text-gray-300 border-gray-500/20",
  };

  return (
    <GlassPanel className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-display font-bold text-foreground flex items-center gap-2">
          <FolderSearch className="w-4 h-4 text-purple-400" /> Related Investigations
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => createMutation.mutate({ title: `Investigation: Agent ${agentId} (${agentName})`, description: `Auto-created from agent detail drilldown for agent ${agentId}` })}
          disabled={createMutation.isPending}
          className="h-7 text-[10px] bg-transparent border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
        >
          <Plus className="w-3 h-3 mr-1" /> New Investigation
        </Button>
      </div>

      {investigationsQ.isLoading ? (
        <div className="animate-pulse space-y-2">
          {[...Array(2)].map((_, i) => <div key={i} className="h-12 bg-white/5 rounded-lg" />)}
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-6">
          <FolderSearch className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No investigations linked to this agent.</p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">Create one to start tracking findings.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s: any) => {
            const evidenceCount = Array.isArray(s.evidence) ? s.evidence.length : 0;
            const noteCount = Array.isArray(s.timeline) ? s.timeline.length : 0;
            return (
              <div
                key={s.id}
                onClick={() => navigate("/investigations")}
                className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <GitBranch className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{s.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border ${STATUS_COLORS[s.status] ?? STATUS_COLORS.active}`}>
                        {s.status}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{evidenceCount} evidence</span>
                      <span className="text-[10px] text-muted-foreground">{noteCount} events</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : "—"}
                      </span>
                    </div>
                  </div>
                </div>
                <Link2 className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-purple-400 transition-colors flex-shrink-0" />
              </div>
            );
          })}
        </div>
      )}
    </GlassPanel>
  );
}

// ── Alerts Tab ────────────────────────────────────────────────────────────
function AlertsTab({ agentId }: { agentId: string }) {
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const alertsQ = trpc.indexer.alertsSearch.useQuery({
    agentId,
    from: "now-7d",
    to: "now",
    size: pageSize,
    offset: page * pageSize,
  }, { retry: false });

  const severityQ = trpc.indexer.alertsAggByLevel.useQuery({
    from: "now-7d",
    to: "now",
  }, { retry: false });

  const alerts = (alertsQ.data as any)?.data?.hits?.hits ?? [];
  const totalHits = (alertsQ.data as any)?.data?.hits?.total?.value ?? alerts.length;
  const totalPages = Math.max(1, Math.ceil(totalHits / pageSize));

  const severityData = useMemo(() => {
    const buckets = (severityQ.data as any)?.data?.aggregations?.severity_total?.buckets ?? [];
    return (buckets as any[]).map((b: any) => ({
      name: `Level ${b.key}`,
      value: b.doc_count,
    }));
  }, [severityQ.data]);

  const PIE_COLORS = ["oklch(0.765 0.177 163.223)", "oklch(0.795 0.184 86.047)", "oklch(0.705 0.191 47)", "oklch(0.637 0.237 25.331)", "oklch(0.541 0.281 293.009)"];

  return (
    <div className="space-y-6">
      {/* Severity Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GlassPanel className="p-6 lg:col-span-1">
          <h3 className="text-sm font-display font-bold text-foreground mb-4">Alert Severity (7d)</h3>
          {severityQ.isLoading ? (
            <ChartSkeleton variant="pie" height={200} />
          ) : severityData.length === 0 ? (
            <p className="text-xs text-muted-foreground">No severity data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={severityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={2}>
                  {severityData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <ReTooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </GlassPanel>

        {/* Alert Stats */}
        <GlassPanel className="p-6 lg:col-span-2">
          <h3 className="text-sm font-display font-bold text-foreground mb-4">Recent Alerts (7d)</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="glass-panel p-3 rounded-xl border border-white/5 text-center">
              <p className="text-2xl font-bold font-display text-foreground">{totalHits}</p>
              <p className="text-[10px] text-muted-foreground">Total Alerts</p>
            </div>
            <div className="glass-panel p-3 rounded-xl border border-white/5 text-center">
              <p className="text-2xl font-bold font-display text-threat-high">
                {alerts.filter((a: any) => Number(a._source?.rule?.level ?? 0) >= 12).length}
              </p>
              <p className="text-[10px] text-muted-foreground">Critical (≥12)</p>
            </div>
            <div className="glass-panel p-3 rounded-xl border border-white/5 text-center">
              <p className="text-2xl font-bold font-display text-threat-medium">
                {alerts.filter((a: any) => { const l = Number(a._source?.rule?.level ?? 0); return l >= 7 && l < 12; }).length}
              </p>
              <p className="text-[10px] text-muted-foreground">High (7-11)</p>
            </div>
          </div>
        </GlassPanel>
      </div>

      {/* Alerts Table */}
      <GlassPanel className="p-6">
        <h3 className="text-sm font-display font-bold text-foreground mb-4">Alert Log</h3>
        {alertsQ.isLoading ? (
          <TableSkeleton columns={6} rows={10} />
        ) : alerts.length === 0 ? (
          <p className="text-xs text-muted-foreground">No alerts found for this agent in the last 7 days.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-border/30 text-muted-foreground">
                  {["Time", "Level", "Rule ID", "Description", "MITRE", "Source IP"].map(h => (
                    <th key={h} className="py-2 px-3 text-left font-medium">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {alerts.map((hit: any, i: number) => {
                    const src = hit._source ?? {};
                    const rule = src.rule ?? {};
                    const level = Number(rule.level ?? 0);
                    const mitre = rule.mitre ?? {};
                    return (
                      <tr key={hit._id ?? i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                        <td className="py-2 px-3 font-mono text-muted-foreground whitespace-nowrap">
                          {src.timestamp ? new Date(src.timestamp).toLocaleString() : "—"}
                        </td>
                        <td className="py-2 px-3">
                          <ThreatBadge level={level >= 12 ? "critical" : level >= 7 ? "high" : level >= 4 ? "medium" : "low"} />
                        </td>
                        <td className="py-2 px-3 font-mono text-primary">{String(rule.id ?? "—")}</td>
                        <td className="py-2 px-3 text-foreground max-w-[300px] truncate">{String(rule.description ?? "—")}</td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {Array.isArray(mitre.technique) ? (mitre.technique as string[]).slice(0, 2).join(", ") : "—"}
                        </td>
                        <td className="py-2 px-3 font-mono text-muted-foreground">{String(src.data?.srcip ?? src.srcip ?? "—")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/30">
                <p className="text-[10px] text-muted-foreground">Page {page + 1} of {totalPages}</p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-6 text-[10px] bg-transparent"><ChevronLeft className="w-3 h-3" /></Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-6 text-[10px] bg-transparent"><ChevronRight className="w-3 h-3" /></Button>
                </div>
              </div>
            )}
          </>
        )}
      </GlassPanel>
    </div>
  );
}

// ── Vulnerabilities Tab ───────────────────────────────────────────────────
function VulnerabilitiesTab({ agentId }: { agentId: string }) {
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const vulnQ = trpc.indexer.vulnSearch.useQuery({
    agentId,
    size: pageSize,
    offset: page * pageSize,
  }, { retry: false });

  const vulns = (vulnQ.data as any)?.data?.hits?.hits ?? [];
  const totalHits = (vulnQ.data as any)?.data?.hits?.total?.value ?? vulns.length;
  const totalPages = Math.max(1, Math.ceil(totalHits / pageSize));

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    vulns.forEach((v: any) => {
      const sev = String(v._source?.vulnerability?.severity ?? "Low");
      if (counts[sev] !== undefined) counts[sev]++;
    });
    return counts;
  }, [vulns]);

  return (
    <div className="space-y-6">
      {/* Severity Cards */}
      <div className="grid grid-cols-4 gap-4">
        {Object.entries(severityCounts).map(([sev, count]) => (
          <GlassPanel key={sev} className="p-4 text-center">
            <p className="text-2xl font-bold font-display" style={{ color: SEVERITY_COLORS[sev] }}>{count}</p>
            <p className="text-[10px] text-muted-foreground">{sev}</p>
          </GlassPanel>
        ))}
      </div>

      {/* Vuln Table */}
      <GlassPanel className="p-6">
        <h3 className="text-sm font-display font-bold text-foreground mb-4">Vulnerability Inventory</h3>
        {vulnQ.isLoading ? (
          <TableSkeleton columns={6} rows={10} />
        ) : vulns.length === 0 ? (
          <p className="text-xs text-muted-foreground">No vulnerabilities found for this agent.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-border/30 text-muted-foreground">
                  {["CVE", "Severity", "CVSS", "Package", "Version", "Status"].map(h => (
                    <th key={h} className="py-2 px-3 text-left font-medium">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {vulns.map((hit: any, i: number) => {
                    const v = hit._source?.vulnerability ?? {};
                    const sev = String(v.severity ?? "—");
                    return (
                      <tr key={hit._id ?? i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                        <td className="py-2 px-3">
                          <a href={`https://nvd.nist.gov/vuln/detail/${v.cve}`} target="_blank" rel="noopener noreferrer" className="font-mono text-primary hover:underline flex items-center gap-1">
                            {String(v.cve ?? "—")} <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </td>
                        <td className="py-2 px-3">
                          <ThreatBadge level={sev.toLowerCase() as any} />
                        </td>
                        <td className="py-2 px-3 font-mono text-foreground">{v.cvss?.cvss3?.base_score ?? v.cvss?.cvss2?.base_score ?? "—"}</td>
                        <td className="py-2 px-3 text-foreground">{String(v.package?.name ?? "—")}</td>
                        <td className="py-2 px-3 font-mono text-muted-foreground">{String(v.package?.version ?? "—")}</td>
                        <td className="py-2 px-3 text-muted-foreground">{String(v.status ?? "—")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/30">
                <p className="text-[10px] text-muted-foreground">Page {page + 1} of {totalPages}</p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-6 text-[10px] bg-transparent"><ChevronLeft className="w-3 h-3" /></Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-6 text-[10px] bg-transparent"><ChevronRight className="w-3 h-3" /></Button>
                </div>
              </div>
            )}
          </>
        )}
      </GlassPanel>
    </div>
  );
}

// ── FIM Tab ───────────────────────────────────────────────────────────────
function FIMTab({ agentId }: { agentId: string }) {
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const fimQ = trpc.wazuh.syscheckFiles.useQuery({
    agentId,
    limit: pageSize,
    offset: page * pageSize,
  }, { retry: false });

  const lastScanQ = trpc.wazuh.syscheckLastScan.useQuery({ agentId }, { retry: false });

  const files = (fimQ.data as any)?.data?.affected_items ?? [];
  const totalFiles = (fimQ.data as any)?.data?.total_affected_items ?? files.length;
  const totalPages = Math.max(1, Math.ceil(totalFiles / pageSize));
  const lastScan = (lastScanQ.data as any)?.data?.affected_items?.[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Last Scan Info */}
      <GlassPanel className="p-6">
        <h3 className="text-sm font-display font-bold text-foreground mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" /> Last Scan
        </h3>
        {lastScanQ.isLoading ? (
          <div className="animate-pulse h-6 bg-white/5 rounded w-48" />
        ) : lastScan ? (
          <div className="flex items-center gap-6 text-xs">
            <span className="text-muted-foreground">Start: <span className="text-foreground font-mono">{lastScan.start ? new Date(String(lastScan.start)).toLocaleString() : "—"}</span></span>
            <span className="text-muted-foreground">End: <span className="text-foreground font-mono">{lastScan.end ? new Date(String(lastScan.end)).toLocaleString() : "—"}</span></span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No scan data available.</p>
        )}
      </GlassPanel>

      {/* FIM Files Table */}
      <GlassPanel className="p-6">
        <h3 className="text-sm font-display font-bold text-foreground mb-4">Monitored Files ({totalFiles})</h3>
        {fimQ.isLoading ? (
          <TableSkeleton columns={5} rows={10} />
        ) : files.length === 0 ? (
          <p className="text-xs text-muted-foreground">No FIM data found for this agent.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-border/30 text-muted-foreground">
                  {["File", "Type", "Size", "MD5", "Modified"].map(h => (
                    <th key={h} className="py-2 px-3 text-left font-medium">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {files.map((f: any, i: number) => (
                    <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                      <td className="py-2 px-3 font-mono text-foreground max-w-[300px] truncate">{String(f.file ?? "—")}</td>
                      <td className="py-2 px-3 text-muted-foreground">{String(f.type ?? "—")}</td>
                      <td className="py-2 px-3 font-mono text-muted-foreground">{f.size != null ? String(f.size) : "—"}</td>
                      <td className="py-2 px-3 font-mono text-muted-foreground text-[10px] max-w-[120px] truncate">{String(f.md5 ?? f.hash_md5 ?? "—")}</td>
                      <td className="py-2 px-3 font-mono text-muted-foreground">{f.mtime ? new Date(String(f.mtime)).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/30">
                <p className="text-[10px] text-muted-foreground">Page {page + 1} of {totalPages}</p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-6 text-[10px] bg-transparent"><ChevronLeft className="w-3 h-3" /></Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-6 text-[10px] bg-transparent"><ChevronRight className="w-3 h-3" /></Button>
                </div>
              </div>
            )}
          </>
        )}
      </GlassPanel>
    </div>
  );
}

// ── Syscollector Tab ──────────────────────────────────────────────────────
function SyscollectorTab({ agentId }: { agentId: string }) {
  const [subTab, setSubTab] = useState<"packages" | "ports" | "processes" | "network">("packages");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const pkgQ = trpc.wazuh.agentPackages.useQuery({ agentId, limit: pageSize, offset: page * pageSize }, { retry: false, enabled: subTab === "packages" });
  const portQ = trpc.wazuh.agentPorts.useQuery({ agentId, limit: pageSize, offset: page * pageSize }, { retry: false, enabled: subTab === "ports" });
  const procQ = trpc.wazuh.agentProcesses.useQuery({ agentId, limit: pageSize, offset: page * pageSize }, { retry: false, enabled: subTab === "processes" });
  const netQ = trpc.wazuh.agentNetiface.useQuery({ agentId }, { retry: false, enabled: subTab === "network" });
  const addrQ = trpc.wazuh.agentNetaddr.useQuery({ agentId }, { retry: false, enabled: subTab === "network" });

  const SUB_TABS = [
    { id: "packages" as const, label: "Packages", icon: <Package className="w-3 h-3" /> },
    { id: "ports" as const, label: "Ports", icon: <Globe className="w-3 h-3" /> },
    { id: "processes" as const, label: "Processes", icon: <Activity className="w-3 h-3" /> },
    { id: "network" as const, label: "Network", icon: <Wifi className="w-3 h-3" /> },
  ];

  const activeQ = subTab === "packages" ? pkgQ : subTab === "ports" ? portQ : subTab === "processes" ? procQ : netQ;
  const items = (activeQ.data as any)?.data?.affected_items ?? [];
  const totalItems = (activeQ.data as any)?.data?.total_affected_items ?? items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 p-1 glass-panel rounded-xl border border-white/5 w-fit">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setSubTab(t.id); setPage(0); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
              subTab === t.id ? "bg-purple-500/15 text-purple-300 border border-purple-500/30" : "text-muted-foreground hover:bg-white/5"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <GlassPanel className="p-6">
        <h3 className="text-sm font-display font-bold text-foreground mb-4 capitalize">{subTab} ({totalItems})</h3>
        {activeQ.isLoading ? (
          <TableSkeleton columns={5} rows={10} />
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground">No {subTab} data found for this agent.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-border/30 text-muted-foreground">
                  {subTab === "packages" && ["Name", "Version", "Architecture", "Vendor", "Format"].map(h => <th key={h} className="py-2 px-3 text-left font-medium">{h}</th>)}
                  {subTab === "ports" && ["Protocol", "Local Address", "Local Port", "Remote Address", "PID", "Process"].map(h => <th key={h} className="py-2 px-3 text-left font-medium">{h}</th>)}
                  {subTab === "processes" && ["PID", "Name", "State", "User", "CPU", "RSS"].map(h => <th key={h} className="py-2 px-3 text-left font-medium">{h}</th>)}
                  {subTab === "network" && ["Interface", "Type", "State", "MTU", "MAC", "TX/RX"].map(h => <th key={h} className="py-2 px-3 text-left font-medium">{h}</th>)}
                </tr></thead>
                <tbody>
                  {items.map((item: any, i: number) => (
                    <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                      {subTab === "packages" && (
                        <>
                          <td className="py-2 px-3 text-foreground">{String(item.name ?? "—")}</td>
                          <td className="py-2 px-3 font-mono text-muted-foreground">{String(item.version ?? "—")}</td>
                          <td className="py-2 px-3 text-muted-foreground">{String(item.architecture ?? "—")}</td>
                          <td className="py-2 px-3 text-muted-foreground truncate max-w-[150px]">{String(item.vendor ?? "—")}</td>
                          <td className="py-2 px-3 text-muted-foreground">{String(item.format ?? "—")}</td>
                        </>
                      )}
                      {subTab === "ports" && (
                        <>
                          <td className="py-2 px-3 font-mono text-foreground">{String(item.protocol ?? "—")}</td>
                          <td className="py-2 px-3 font-mono text-muted-foreground">{String(item.local?.ip ?? "—")}</td>
                          <td className="py-2 px-3 font-mono text-primary">{String(item.local?.port ?? "—")}</td>
                          <td className="py-2 px-3 font-mono text-muted-foreground">{String(item.remote?.ip ?? "—")}</td>
                          <td className="py-2 px-3 font-mono text-muted-foreground">{String(item.pid ?? "—")}</td>
                          <td className="py-2 px-3 text-foreground">{String(item.process ?? "—")}</td>
                        </>
                      )}
                      {subTab === "processes" && (
                        <>
                          <td className="py-2 px-3 font-mono text-primary">{String(item.pid ?? "—")}</td>
                          <td className="py-2 px-3 text-foreground">{String(item.name ?? "—")}</td>
                          <td className="py-2 px-3 text-muted-foreground">{String(item.state ?? "—")}</td>
                          <td className="py-2 px-3 text-muted-foreground">{String(item.euser ?? item.ruser ?? "—")}</td>
                          <td className="py-2 px-3 font-mono text-muted-foreground">{item.processor ? `${item.processor}%` : "—"}</td>
                          <td className="py-2 px-3 font-mono text-muted-foreground">{item.resident ? `${(Number(item.resident) / 1024).toFixed(1)} MB` : "—"}</td>
                        </>
                      )}
                      {subTab === "network" && (
                        <>
                          <td className="py-2 px-3 font-mono text-foreground">{String(item.name ?? "—")}</td>
                          <td className="py-2 px-3 text-muted-foreground">{String(item.type ?? "—")}</td>
                          <td className="py-2 px-3">
                            <span className={`text-xs ${item.state === "up" ? "text-threat-low" : "text-threat-high"}`}>{String(item.state ?? "—")}</span>
                          </td>
                          <td className="py-2 px-3 font-mono text-muted-foreground">{String(item.mtu ?? "—")}</td>
                          <td className="py-2 px-3 font-mono text-muted-foreground text-[10px]">{String(item.mac ?? "—")}</td>
                          <td className="py-2 px-3 font-mono text-muted-foreground text-[10px]">
                            {item.tx?.bytes ? `↑${(Number(item.tx.bytes) / 1024 / 1024).toFixed(1)}MB` : "—"} / {item.rx?.bytes ? `↓${(Number(item.rx.bytes) / 1024 / 1024).toFixed(1)}MB` : "—"}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {subTab !== "network" && totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/30">
                <p className="text-[10px] text-muted-foreground">Page {page + 1} of {totalPages}</p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-6 text-[10px] bg-transparent"><ChevronLeft className="w-3 h-3" /></Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-6 text-[10px] bg-transparent"><ChevronRight className="w-3 h-3" /></Button>
                </div>
              </div>
            )}
          </>
        )}
      </GlassPanel>
    </div>
  );
}

// ── Activity Timeline Tab ─────────────────────────────────────────────────
type TimelineEvent = {
  id: string;
  timestamp: string;
  source: "alert" | "fim" | "vulnerability";
  title: string;
  detail: string;
  severity: string;
  raw: unknown;
};

const SOURCE_CONFIG = {
  alert: { color: "oklch(0.541 0.281 293.009)", bg: "bg-purple-500/15", border: "border-purple-500/30", text: "text-purple-300", icon: AlertTriangle, label: "Alert" },
  fim: { color: "oklch(0.789 0.154 211.53)", bg: "bg-cyan-500/15", border: "border-cyan-500/30", text: "text-cyan-300", icon: FileSearch, label: "FIM" },
  vulnerability: { color: "oklch(0.705 0.191 47)", bg: "bg-orange-500/15", border: "border-orange-500/30", text: "text-orange-300", icon: Bug, label: "Vuln" },
} as const;

function ActivityTimelineTab({ agentId }: { agentId: string }) {
  const [timeRange] = useState("now-7d");
  const [sourceFilter, setSourceFilter] = useState<"all" | "alert" | "fim" | "vulnerability">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch alerts
  const alertsQ = trpc.indexer.alertsSearch.useQuery({
    agentId,
    from: timeRange,
    to: "now",
    size: 100,
    offset: 0,
    sortField: "timestamp",
    sortOrder: "desc",
  }, { retry: false });

  // Fetch FIM events
  const fimQ = trpc.wazuh.syscheckFiles.useQuery({
    agentId,
    limit: 100,
    offset: 0,
  }, { retry: false });

  // Fetch vulnerabilities
  const vulnQ = trpc.indexer.vulnSearch.useQuery({
    agentId,
    size: 100,
    offset: 0,
  }, { retry: false });

  const events = useMemo(() => {
    const items: TimelineEvent[] = [];

    // Alerts
    const alertHits = (alertsQ.data as any)?.data?.hits?.hits ?? [];
    for (const hit of alertHits) {
      const src = hit._source ?? {};
      const rule = src.rule ?? {};
      const level = Number(rule.level ?? 0);
      items.push({
        id: `alert-${hit._id ?? items.length}`,
        timestamp: String(src.timestamp ?? ""),
        source: "alert",
        title: String(rule.description ?? "Alert"),
        detail: `Rule ${rule.id ?? "?"} · Level ${level}${rule.mitre?.technique ? ` · ${(rule.mitre.technique as string[]).join(", ")}` : ""}`,
        severity: level >= 12 ? "critical" : level >= 7 ? "high" : level >= 4 ? "medium" : "low",
        raw: src,
      });
    }

    // FIM events
    const fimItems = (fimQ.data as any)?.data?.affected_items ?? [];
    for (const f of fimItems) {
      items.push({
        id: `fim-${String(f.file ?? items.length)}`,
        timestamp: String(f.mtime ?? f.date ?? ""),
        source: "fim",
        title: String(f.file ?? "Unknown file"),
        detail: `Type: ${f.type ?? "?"} · Size: ${f.size ?? "?"} · MD5: ${String(f.md5 ?? f.hash_md5 ?? "?").slice(0, 12)}…`,
        severity: "info",
        raw: f,
      });
    }

    // Vulnerabilities
    const vulnHits = (vulnQ.data as any)?.data?.hits?.hits ?? [];
    for (const hit of vulnHits) {
      const v = hit._source?.vulnerability ?? {};
      items.push({
        id: `vuln-${hit._id ?? items.length}`,
        timestamp: String(hit._source?.timestamp ?? v.detected_at ?? ""),
        source: "vulnerability",
        title: String(v.cve ?? "CVE Unknown"),
        detail: `${v.severity ?? "?"} · CVSS ${v.cvss?.cvss3?.base_score ?? v.cvss?.cvss2?.base_score ?? "?"} · ${v.package?.name ?? "?"} ${v.package?.version ?? ""}`,
        severity: String(v.severity ?? "low").toLowerCase(),
        raw: hit._source,
      });
    }

    // Sort by timestamp descending
    items.sort((a, b) => {
      const ta = new Date(a.timestamp).getTime() || 0;
      const tb = new Date(b.timestamp).getTime() || 0;
      return tb - ta;
    });

    return items;
  }, [alertsQ.data, fimQ.data, vulnQ.data]);

  const filtered = sourceFilter === "all" ? events : events.filter(e => e.source === sourceFilter);
  const isLoading = alertsQ.isLoading || fimQ.isLoading || vulnQ.isLoading;

  // Source counts for filter badges
  const counts = useMemo(() => {
    const c = { all: events.length, alert: 0, fim: 0, vulnerability: 0 };
    events.forEach(e => c[e.source]++);
    return c;
  }, [events]);

  return (
    <div className="space-y-6">
      {/* Source Filter Bar */}
      <div className="flex items-center gap-2">
        {(["all", "alert", "fim", "vulnerability"] as const).map(s => (
          <button
            key={s}
            onClick={() => setSourceFilter(s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors border ${
              sourceFilter === s
                ? s === "all" ? "bg-purple-500/15 text-purple-300 border-purple-500/30" : `${SOURCE_CONFIG[s as keyof typeof SOURCE_CONFIG].bg} ${SOURCE_CONFIG[s as keyof typeof SOURCE_CONFIG].text} ${SOURCE_CONFIG[s as keyof typeof SOURCE_CONFIG].border}`
                : "text-muted-foreground hover:bg-white/5 border-transparent"
            }`}
          >
            {s === "all" ? "All Events" : SOURCE_CONFIG[s as keyof typeof SOURCE_CONFIG].label}
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-white/5 text-[9px] font-mono">{counts[s]}</span>
          </button>
        ))}
      </div>

      {/* Timeline */}
      <GlassPanel className="p-6">
        <h3 className="text-sm font-display font-bold text-foreground mb-4 flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-purple-400" /> Activity Timeline (7d)
        </h3>

        {isLoading ? (
          <div className="space-y-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex gap-4 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-white/5" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-white/5 rounded w-3/4" />
                  <div className="h-3 bg-white/5 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <GitBranch className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-xs text-muted-foreground">No events found for this agent in the last 7 days.</p>
          </div>
        ) : (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-px bg-gradient-to-b from-purple-500/30 via-purple-500/10 to-transparent" />

            <div className="space-y-1">
              {filtered.map((event) => {
                const cfg = SOURCE_CONFIG[event.source];
                const Icon = cfg.icon;
                const isExpanded = expandedId === event.id;
                return (
                  <div key={event.id} className="relative pl-10">
                    {/* Timeline dot */}
                    <div
                      className={`absolute left-2 top-3 w-4 h-4 rounded-full border-2 flex items-center justify-center ${cfg.bg} ${cfg.border}`}
                      style={{ borderColor: cfg.color }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
                    </div>

                    {/* Event card */}
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : event.id)}
                      className={`p-3 rounded-lg border transition-colors cursor-pointer ${
                        isExpanded ? "bg-white/[0.04] border-white/10" : "bg-transparent border-transparent hover:bg-white/[0.02] hover:border-white/5"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                            <Icon className="w-2.5 h-2.5" />
                            {cfg.label}
                          </span>
                          <span className="text-xs text-foreground truncate">{event.title}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap ml-2">
                          {event.timestamp ? new Date(event.timestamp).toLocaleString() : "—"}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 truncate">{event.detail}</p>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-white/5">
                          <div className="flex items-center gap-2 mb-2">
                            <ThreatBadge level={event.severity as any} />
                            <span className="text-[10px] text-muted-foreground">Source: {event.source}</span>
                          </div>
                          <RawJsonViewer data={event.raw} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

// ── Config & Stats Tab ───────────────────────────────────────────────────

/** Known Wazuh agent component/configuration pairs for the picker */
const AGENT_CONFIG_PAIRS: { component: string; configuration: string; label: string }[] = [
  { component: "agent", configuration: "client", label: "Agent Client" },
  { component: "agent", configuration: "buffer", label: "Agent Buffer" },
  { component: "agent", configuration: "labels", label: "Agent Labels" },
  { component: "agent", configuration: "internal", label: "Agent Internal" },
  { component: "logcollector", configuration: "logcollector", label: "Log Collector" },
  { component: "logcollector", configuration: "internal", label: "Log Collector Internal" },
  { component: "syscheck", configuration: "syscheck", label: "Syscheck (FIM)" },
  { component: "syscheck", configuration: "internal", label: "Syscheck Internal" },
  { component: "rootcheck", configuration: "rootcheck", label: "Rootcheck" },
  { component: "rootcheck", configuration: "internal", label: "Rootcheck Internal" },
  { component: "wmodules", configuration: "wmodules", label: "Wazuh Modules" },
  { component: "com", configuration: "active-response", label: "Active Response" },
  { component: "com", configuration: "internal", label: "COM Internal" },
  { component: "auth", configuration: "auth", label: "Auth" },
];

/** Known Wazuh agent stats component options */
const AGENT_STATS_COMPONENTS = [
  { value: "logcollector", label: "Log Collector" },
  { value: "agent", label: "Agent" },
];

function ConfigStatsTab({ agentId }: { agentId: string }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // ── Agent Config ──
  const [configPairIdx, setConfigPairIdx] = useState(0);
  const pair = AGENT_CONFIG_PAIRS[configPairIdx];
  const configQ = trpc.wazuh.agentConfig.useQuery(
    { agentId, component: pair.component, configuration: pair.configuration },
    { retry: false }
  );

  // ── Agent Stats ──
  const [statsComponent, setStatsComponent] = useState("logcollector");
  const statsQ = trpc.wazuh.agentStats.useQuery(
    { agentId, component: statsComponent },
    { retry: false }
  );

  // ── Agent Daemon Stats ──
  const daemonStatsQ = trpc.wazuh.agentDaemonStats.useQuery(
    { agentId },
    { retry: false }
  );

  // ── Agent Key (admin-only, disclosure policy) ──
  const [keyRevealed, setKeyRevealed] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const keyQ = trpc.wazuh.agentKey.useQuery(
    { agentId },
    {
      enabled: isAdmin && keyRevealed,
      retry: false,
      gcTime: 0,          // No cache persistence
      staleTime: 0,       // Always refetch on reveal
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    }
  );

  // Evict key data from cache on unmount
  const utils = trpc.useUtils();
  useEffect(() => {
    return () => {
      utils.wazuh.agentKey.invalidate({ agentId });
    };
  }, [agentId, utils]);

  const keyData = (keyQ.data as any)?.data?.affected_items?.[0] ?? null;
  const keyStr = keyData?.key ?? "";

  const handleRevealKey = useCallback(() => {
    setKeyRevealed(true);
    setKeyCopied(false);
  }, []);

  const handleCopyKey = useCallback(async () => {
    if (!keyStr) return;
    try {
      await navigator.clipboard.writeText(keyStr);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 3000);
    } catch {
      // Clipboard API may fail in some contexts
    }
  }, [keyStr]);

  const handleHideKey = useCallback(() => {
    setKeyRevealed(false);
    setKeyCopied(false);
    utils.wazuh.agentKey.invalidate({ agentId });
  }, [agentId, utils]);

  return (
    <div className="space-y-6">
      {/* ── Agent Configuration Viewer ── */}
      <GlassPanel className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-display font-bold text-foreground flex items-center gap-2">
            <Settings className="w-4 h-4 text-purple-400" /> Agent Configuration
          </h3>
          <select
            value={configPairIdx}
            onChange={e => setConfigPairIdx(Number(e.target.value))}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/50"
          >
            {AGENT_CONFIG_PAIRS.map((p, i) => (
              <option key={i} value={i} className="bg-gray-900 text-white">
                {p.label} ({p.component}/{p.configuration})
              </option>
            ))}
          </select>
        </div>

        <BrokerWarnings data={configQ.data} context="Agent Config" />

        <div className="text-[10px] text-muted-foreground mb-3 font-mono">
          GET /agents/{agentId}/config/{pair.component}/{pair.configuration}
        </div>

        {configQ.isLoading ? (
          <div className="animate-pulse space-y-2">
            {[...Array(6)].map((_, i) => <div key={i} className="h-4 bg-white/5 rounded" />)}
          </div>
        ) : configQ.isError ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
            <p className="text-xs text-red-300">Failed to fetch configuration: {configQ.error?.message ?? "Unknown error"}</p>
          </div>
        ) : (
          <RawJsonViewer data={configQ.data} />
        )}
      </GlassPanel>

      {/* ── Agent Stats Viewer ── */}
      <GlassPanel className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-display font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" /> Agent Component Stats
          </h3>
          <div className="flex items-center gap-1 p-1 glass-panel rounded-xl border border-white/5">
            {AGENT_STATS_COMPONENTS.map(c => (
              <button
                key={c.value}
                onClick={() => setStatsComponent(c.value)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  statsComponent === c.value
                    ? "bg-purple-500/15 text-purple-300 border border-purple-500/30"
                    : "text-muted-foreground hover:bg-white/5 border border-transparent"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <BrokerWarnings data={statsQ.data} context="Agent Stats" />

        <div className="text-[10px] text-muted-foreground mb-3 font-mono">
          GET /agents/{agentId}/stats/{statsComponent}
        </div>

        {statsQ.isLoading ? (
          <div className="animate-pulse space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-4 bg-white/5 rounded" />)}
          </div>
        ) : statsQ.isError ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
            <p className="text-xs text-red-300">Failed to fetch stats: {statsQ.error?.message ?? "Unknown error"}</p>
          </div>
        ) : (
          <RawJsonViewer data={statsQ.data} />
        )}
      </GlassPanel>

      {/* ── Agent Daemon Stats ── */}
      <GlassPanel className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-display font-bold text-foreground flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" /> Daemon Stats
          </h3>
          <span className="text-[10px] text-muted-foreground font-mono">
            GET /agents/{agentId}/daemons/stats
          </span>
        </div>

        <BrokerWarnings data={daemonStatsQ.data} context="Daemon Stats" />

        {daemonStatsQ.isLoading ? (
          <div className="animate-pulse space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-4 bg-white/5 rounded" />)}
          </div>
        ) : daemonStatsQ.isError ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
            <p className="text-xs text-red-300">Failed to fetch daemon stats: {daemonStatsQ.error?.message ?? "Unknown error"}</p>
          </div>
        ) : (
          <RawJsonViewer data={daemonStatsQ.data} />
        )}
      </GlassPanel>

      {/* ── Agent Key (Admin-Only, Full Disclosure Policy) ── */}
      <GlassPanel className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-display font-bold text-foreground flex items-center gap-2">
            <Key className="w-4 h-4 text-amber-400" /> Agent Registration Key
          </h3>
          {isAdmin && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
              <ShieldAlert className="w-2.5 h-2.5" /> Admin Only
            </span>
          )}
        </div>

        {!isAdmin ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-center">
            <Lock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-xs text-muted-foreground">Agent registration keys are restricted to administrators.</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">Contact your security administrator if you need access.</p>
          </div>
        ) : !keyRevealed ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="text-xs space-y-1">
                  <p className="text-amber-200 font-medium">Disclosure Policy</p>
                  <ul className="text-amber-200/70 space-y-0.5 list-disc list-inside">
                    <li>This key is the agent's authentication credential with the Wazuh manager</li>
                    <li>Revealing this key is logged with your user ID, timestamp, and IP address</li>
                    <li>The key is not cached — it is fetched fresh each time and discarded on navigation</li>
                    <li>Treat this key as a secret: do not share it in chat, tickets, or screenshots</li>
                  </ul>
                </div>
              </div>
            </div>
            <Button
              onClick={handleRevealKey}
              variant="outline"
              size="sm"
              className="h-8 text-xs bg-transparent border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
            >
              <Eye className="w-3.5 h-3.5 mr-1.5" /> Reveal Agent Key
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {keyQ.isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching key (audit logged)...
              </div>
            ) : keyQ.isError ? (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                <p className="text-xs text-red-300">Failed to fetch key: {keyQ.error?.message ?? "Unknown error"}</p>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
                  <p className="text-[10px] text-muted-foreground mb-2">Agent Key</p>
                  <p className="font-mono text-xs text-foreground break-all select-all leading-relaxed">
                    {keyStr || "(empty)"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleCopyKey}
                    variant="outline"
                    size="sm"
                    disabled={!keyStr}
                    className="h-7 text-[10px] bg-transparent border-white/10 text-muted-foreground hover:bg-white/5"
                  >
                    <Copy className="w-3 h-3 mr-1" /> {keyCopied ? "Copied" : "Copy"}
                  </Button>
                  <Button
                    onClick={handleHideKey}
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] bg-transparent border-white/10 text-muted-foreground hover:bg-white/5"
                  >
                    <EyeOff className="w-3 h-3 mr-1" /> Hide
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────
function Row({ label, value, mono, children }: { label: string; value?: string; mono?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-28 shrink-0">{label}:</span>
      {children ?? <span className={`text-foreground ${mono ? "font-mono" : ""}`}>{value}</span>}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────
export default function AgentDetail() {
  const [, params] = useRoute("/fleet/:agentId");
  const [, navigate] = useLocation();
  const agentId = params?.agentId ?? "";
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const agentQ = trpc.wazuh.agentById.useQuery({ agentId }, { enabled: !!agentId, retry: false });
  const agent = (agentQ.data as any)?.data?.affected_items?.[0] ?? null;
  const agentName = String(agent?.name ?? `Agent ${agentId}`);

  if (!agentId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3.5rem)]">
        <p className="text-muted-foreground">No agent ID provided.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/agents")}
              className="h-8 bg-transparent border-white/10 hover:bg-white/5 text-muted-foreground"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Fleet
            </Button>
            <div className="w-px h-8 bg-white/10" />
            <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-display font-bold text-foreground">{agentName}</h1>
              <p className="text-xs text-muted-foreground font-mono">
                ID: {agentId}
                {agent?.ip && ` · ${agent.ip}`}
                {agent?.version && ` · ${agent.version}`}
              </p>
            </div>
          </div>

          {/* Status badge */}
          {agent && (
            <div className="flex items-center gap-2">
              {String(agent.status) === "active" ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-threat-low font-medium">
                  <Wifi className="w-3.5 h-3.5" /> Active
                </span>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-threat-high font-medium">
                  <WifiOff className="w-3.5 h-3.5" /> {String(agent.status)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 mt-4">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs rounded-lg transition-colors ${
                activeTab === tab.id
                  ? "bg-purple-500/15 text-purple-300 border border-purple-500/30"
                  : "text-muted-foreground hover:bg-white/5 border border-transparent"
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {agentQ.isLoading ? (
          <div className="space-y-6">
            <GlassPanel className="p-6">
              <div className="animate-pulse space-y-3">
                {[...Array(6)].map((_, i) => <div key={i} className="h-5 bg-white/5 rounded" />)}
              </div>
            </GlassPanel>
          </div>
        ) : (
          <>
            {activeTab === "overview" && <OverviewTab agentId={agentId} agent={agent} />}
            {activeTab === "alerts" && <AlertsTab agentId={agentId} />}
            {activeTab === "vulnerabilities" && <VulnerabilitiesTab agentId={agentId} />}
            {activeTab === "fim" && <FIMTab agentId={agentId} />}
            {activeTab === "syscollector" && <SyscollectorTab agentId={agentId} />}
            {activeTab === "timeline" && <ActivityTimelineTab agentId={agentId} />}
            {activeTab === "config" && <ConfigStatsTab agentId={agentId} />}
          </>
        )}
      </div>
    </div>
  );
}
