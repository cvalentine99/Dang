import { trpc } from "@/lib/trpc";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { StatCard } from "@/components/shared/StatCard";
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
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText, Shield, Search, ChevronLeft, ChevronRight,
  Layers, Eye, Clock, Hash, FileDiff,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, PieChart, Pie, Legend,
} from "recharts";

const COLORS = {
  gold: "oklch(0.795 0.184 85)",
  cyan: "oklch(0.75 0.15 195)",
  green: "oklch(0.723 0.219 149.579)",
  yellow: "oklch(0.769 0.188 70.08)",
  red: "oklch(0.628 0.258 29.234)",
};

const EVENT_COLORS: Record<string, string> = {
  added: COLORS.green, modified: COLORS.yellow, deleted: COLORS.red,
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

function extractItems(raw: unknown): Array<Record<string, unknown>> {
  const d = (raw as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  return (d?.affected_items as Array<Record<string, unknown>>) ?? [];
}

export default function FileIntegrity() {
  const utils = trpc.useUtils();
  const [agentId, setAgentId] = useState("001");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedFile, setSelectedFile] = useState<Record<string, unknown> | null>(null);
  const pageSize = 50;

  const statusQ = trpc.wazuh.status.useQuery(undefined, { retry: 1, staleTime: 60_000 });
  const isConnected = statusQ.data?.configured === true && statusQ.data?.data != null;

  const agentsQ = trpc.wazuh.agents.useQuery({ limit: 100, offset: 0, status: "active" }, { retry: 1, staleTime: 30_000, enabled: isConnected });
  const agentList = useMemo(() => {
    if (isConnected && agentsQ.data) return extractItems(agentsQ.data).filter(a => String(a.id ?? "") !== "");
    return [];
  }, [agentsQ.data, isConnected]);

  const syscheckQ = trpc.wazuh.syscheckFiles.useQuery({
    agentId, limit: pageSize, offset: page * pageSize, search: search || undefined,
  }, { retry: 1, staleTime: 15_000, enabled: isConnected });

  const lastScanQ = trpc.wazuh.syscheckLastScan.useQuery({ agentId }, { retry: 1, staleTime: 30_000, enabled: isConnected });

  const handleRefresh = useCallback(() => { utils.wazuh.invalidate(); }, [utils]);

  // ── Files (real or fallback) ──────────────────────────────────────────
  const files = useMemo(() => {
    if (isConnected && syscheckQ.data) return extractItems(syscheckQ.data);
    return [];
  }, [syscheckQ.data, isConnected, search]);

  const totalFiles = useMemo(() => {
    if (isConnected && syscheckQ.data) {
      const d = (syscheckQ.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
      return Number(d?.total_affected_items ?? files.length);
    }
    return files.length;
  }, [syscheckQ.data, isConnected, files.length]);

  // ── Last scan (real or fallback) ──────────────────────────────────────
  const lastScan = useMemo(() => {
    if (isConnected && lastScanQ.data) {
      const items = extractItems(lastScanQ.data);
      return items[0] ?? null;
    }
    return null;
  }, [lastScanQ.data, isConnected]);

  const eventDist = useMemo(() => {
    const counts: Record<string, number> = {};
    files.forEach(f => { const e = String(f.event ?? f.type ?? "unknown"); counts[e] = (counts[e] ?? 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value, fill: EVENT_COLORS[name.toLowerCase()] ?? COLORS.gold }));
  }, [files]);

  const extDist = useMemo(() => {
    const counts: Record<string, number> = {};
    files.forEach(f => {
      const path = String(f.file ?? f.path ?? "");
      const ext = path.includes(".") ? path.split(".").pop()?.toLowerCase() ?? "none" : "none";
      counts[ext] = (counts[ext] ?? 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name: `.${name}`, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  }, [files]);

  const addedCount = files.filter(f => String(f.event ?? f.type ?? "").toLowerCase() === "added").length;
  const modifiedCount = files.filter(f => String(f.event ?? f.type ?? "").toLowerCase() === "modified").length;
  const deletedCount = files.filter(f => String(f.event ?? f.type ?? "").toLowerCase() === "deleted").length;

  const isLoading = statusQ.isLoading;
  const totalPages = Math.ceil(totalFiles / pageSize);

  return (
    <WazuhGuard>
      <div className="space-y-6">
        <PageHeader title="File Integrity Monitoring" subtitle="Syscheck analysis — file changes, hash comparison, and integrity scan results" onRefresh={handleRefresh} isLoading={isLoading} />

        <GlassPanel className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /><span className="text-sm font-medium text-muted-foreground">Target Agent:</span></div>
          <Select value={agentId} onValueChange={(v) => { setAgentId(v); setPage(0); }}>
            <SelectTrigger className="w-[280px] h-8 text-xs bg-secondary/50 border-border"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover border-border max-h-60">
              {agentList.map(a => <SelectItem key={String(a.id)} value={String(a.id)}>{String(a.id)} — {String(a.name ?? "Unknown")} ({String(a.ip ?? "")})</SelectItem>)}
            </SelectContent>
          </Select>
          {lastScan ? (
            <div className="flex items-center gap-4 text-xs text-muted-foreground ml-auto">
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Start: {String(lastScan.start ?? "—")}</span>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> End: {String(lastScan.end ?? "—")}</span>
            </div>
          ) : null}
        </GlassPanel>

        <motion.div
          className="grid grid-cols-2 md:grid-cols-5 gap-4"
          initial="hidden" animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08 } } }}
        >
          {[
            { label: "Total Files", value: totalFiles, icon: FileText, colorClass: "text-primary" },
            { label: "Added", value: addedCount, icon: FileText, colorClass: "text-threat-low" },
            { label: "Modified", value: modifiedCount, icon: FileDiff, colorClass: "text-threat-medium" },
            { label: "Deleted", value: deletedCount, icon: FileText, colorClass: "text-threat-critical" },
            { label: "Scan Status", value: lastScan ? "Complete" : "Unknown", icon: Shield, colorClass: "text-primary" },
          ].map((card) => (
            <motion.div
              key={card.label}
              variants={{
                hidden: { opacity: 0, y: 20, scale: 0.95 },
                visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const } },
              }}
            >
              <StatCard label={card.label} value={card.value} icon={card.icon} colorClass={card.colorClass} />
            </motion.div>
          ))}
        </motion.div>

        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <ChartSkeleton variant="pie" height={200} title="Event Types" className="lg:col-span-4" />
            <ChartSkeleton variant="bar" height={200} title="File Extensions" className="lg:col-span-8" />
          </div>
        ) : (
        <motion.div
          className="grid grid-cols-1 lg:grid-cols-12 gap-4"
          initial="hidden" animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }}
        >
          <motion.div className="lg:col-span-4" variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const } } }}>
          <GlassPanel>
            <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Eye className="h-4 w-4 text-primary" /> Event Types</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={eventDist} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value" stroke="none" />
                <ReTooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "oklch(0.6 0.01 260)" }} />
              </PieChart>
            </ResponsiveContainer>
          </GlassPanel>
          </motion.div>

          <motion.div className="lg:col-span-8" variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const } } }}>
          <GlassPanel>
            <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2"><Hash className="h-4 w-4 text-primary" /> File Extensions</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={extDist}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.01 260 / 20%)" />
                <XAxis dataKey="name" tick={{ fill: "oklch(0.6 0.01 260)", fontSize: 10 }} />
                <YAxis tick={{ fill: "oklch(0.6 0.01 260)", fontSize: 10 }} />
                <ReTooltip content={<ChartTooltip />} />
                <Bar dataKey="count" fill={COLORS.cyan} name="Files" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </GlassPanel>
          </motion.div>
        </motion.div>
        )}

        <GlassPanel>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Monitored Files ({totalFiles})</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Search files..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="h-8 w-56 pl-8 text-xs bg-secondary/50 border-border" />
              </div>
              {syscheckQ.data ? <RawJsonViewer data={syscheckQ.data as Record<string, unknown>} title="Syscheck JSON" /> : null}
            </div>
          </div>

          {isLoading ? (
            <TableSkeleton columns={9} rows={10} columnWidths={[3, 1, 1, 1, 1, 1, 2, 2, 1]} />
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-border/30">
                {["File Path", "Event", "Size", "UID", "GID", "Perm", "MD5", "SHA1", "Modified"].map(h => <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>)}
              </tr></thead>
              <tbody>
                {files.map((f, i) => {
                  const event = String(f.event ?? f.type ?? "unknown").toLowerCase();
                  const level: "low" | "medium" | "critical" | "info" = event === "added" ? "low" : event === "modified" ? "medium" : event === "deleted" ? "critical" : "info";
                  const hashObj = (f.hash as Record<string, unknown>) ?? {};
                  return (
                    <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors cursor-pointer" onClick={() => setSelectedFile(f)}>
                      <td className="py-2 px-3 font-mono text-foreground max-w-[300px] truncate">{String(f.file ?? f.path ?? "—")}</td>
                      <td className="py-2 px-3"><ThreatBadge level={level} /></td>
                      <td className="py-2 px-3 font-mono text-muted-foreground">{String(f.size ?? "—")}</td>
                      <td className="py-2 px-3 font-mono text-muted-foreground">{String(f.uid ?? "—")}</td>
                      <td className="py-2 px-3 font-mono text-muted-foreground">{String(f.gid ?? "—")}</td>
                      <td className="py-2 px-3 font-mono text-muted-foreground">{String(f.perm ?? f.attributes ?? "—")}</td>
                      <td className="py-2 px-3 font-mono text-primary text-[10px] max-w-[100px] truncate">{String(f.md5 ?? hashObj.md5 ?? "—")}</td>
                      <td className="py-2 px-3 font-mono text-primary text-[10px] max-w-[100px] truncate">{String(f.sha1 ?? hashObj.sha1 ?? "—")}</td>
                      <td className="py-2 px-3 text-muted-foreground">{String(f.mtime ?? f.date ?? "—")}</td>
                    </tr>
                  );
                })}
                {files.length === 0 ? <tr><td colSpan={9} className="py-12 text-center text-muted-foreground">{isLoading ? "Loading files..." : "No syscheck files found"}</td></tr> : null}
              </tbody>
            </table>
          </div>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/30">
              <p className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="h-7 bg-transparent border-border"><ChevronLeft className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="h-7 bg-transparent border-border"><ChevronRight className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ) : null}
        </GlassPanel>

        <Dialog open={!!selectedFile} onOpenChange={(open) => !open && setSelectedFile(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-card border-border">
            <DialogHeader>
              <DialogTitle className="font-display text-foreground flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" /> File Detail
              </DialogTitle>
            </DialogHeader>
            {selectedFile ? (
              <div className="space-y-4">
                <div className="bg-secondary/20 rounded-lg p-3 border border-border/20">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">File Path</p>
                  <p className="text-sm font-mono text-foreground mt-1 break-all">{String(selectedFile.file ?? selectedFile.path ?? "—")}</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {([
                    ["Event", selectedFile.event ?? selectedFile.type],
                    ["Size", selectedFile.size],
                    ["UID", selectedFile.uid],
                    ["GID", selectedFile.gid],
                    ["Permissions", selectedFile.perm ?? selectedFile.attributes],
                    ["Inode", selectedFile.inode],
                    ["Modified", selectedFile.mtime ?? selectedFile.date],
                    ["User Name", selectedFile.uname],
                    ["Group Name", selectedFile.gname],
                  ] as [string, unknown][]).map(([label, val]) => (
                    <div key={label} className="bg-secondary/30 rounded-lg p-3 border border-border/30">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
                      <p className="text-sm font-medium text-foreground mt-1 truncate">{String(val ?? "—")}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-secondary/20 rounded-lg p-3 border border-border/20">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Hash Values</p>
                  <div className="space-y-2">
                    {(["md5", "sha1", "sha256"] as const).map(algo => {
                      const hashObj = (selectedFile.hash as Record<string, unknown>) ?? {};
                      const hash = selectedFile[algo] ?? hashObj[algo];
                      return hash ? (
                        <div key={algo} className="flex items-start gap-2">
                          <span className="text-[10px] font-medium text-primary uppercase w-12 shrink-0 mt-0.5">{algo}</span>
                          <span className="text-[10px] font-mono text-foreground break-all">{String(hash)}</span>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>
                <RawJsonViewer data={selectedFile} title="Full Syscheck JSON" />
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </WazuhGuard>
  );
}
