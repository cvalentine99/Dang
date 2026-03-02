import { useState, useMemo, useCallback } from "react";
import { GlassPanel, StatCard, ThreatBadge, RawJsonViewer, RefreshControl, IndexerLoadingState, IndexerErrorState, StatCardSkeleton } from "@/components/shared";
import { ChartSkeleton } from "@/components/shared/ChartSkeleton";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { WazuhGuard } from "@/components/shared/WazuhGuard";
import { trpc } from "@/lib/trpc";

import { ExportButton } from "@/components/shared/ExportButton";
import { EXPORT_COLUMNS } from "@/lib/exportUtils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, CartesianGrid,
} from "recharts";
import {
  Search, Filter, ChevronDown, ChevronRight, Clock, AlertTriangle,
  Shield, Eye, FileText, Terminal, ExternalLink, Copy, X, Layers,
  Activity, Database, Globe, Cpu, ArrowUpDown, Link2, Save,
  BookmarkPlus, Bookmark, Trash2, Radar, Loader2, AlertCircle,
  CheckCircle2, MapPin, Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────
interface SiemEvent {
  id: string;
  timestamp: string;
  agent: { id: string; name: string; ip: string };
  rule: {
    id: number;
    level: number;
    description: string;
    groups: string[];
    mitre: { id: string[]; tactic: string[]; technique: string[] };
    pci_dss?: string[];
    gdpr?: string[];
    hipaa?: string[];
    firedtimes?: number;
  };
  decoder: { name: string; parent: string };
  data: Record<string, unknown>;
  location: string;
  full_log: string;
  [key: string]: unknown;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
  info: "#6366f1",
};

const LEVEL_TO_SEVERITY = (level: number): string => {
  if (level >= 14) return "critical";
  if (level >= 10) return "high";
  if (level >= 7) return "medium";
  if (level >= 4) return "low";
  return "info";
};

const DECODER_ICONS: Record<string, typeof Shield> = {
  sshd: Terminal,
  pam: Shield,
  windows_eventchannel: Cpu,
  "web-accesslog": Globe,
  json: Database,
  syscheck_integrity_changed: FileText,
  suricata: Activity,
};

const CORRELATION_WINDOWS = [
  { label: "5 min", value: 5 },
  { label: "15 min", value: 15 },
  { label: "1 hour", value: 60 },
  { label: "4 hours", value: 240 },
  { label: "24 hours", value: 1440 },
];

export default function SiemEvents() {
  // ─── State ───────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [mitreFilter, setMitreFilter] = useState<string>("all");
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState<string | null>(null);
  const [sortField, setSortField] = useState<"timestamp" | "level">("timestamp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [timeRange, setTimeRange] = useState("1h");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Correlation state
  const [correlationWindow, setCorrelationWindow] = useState(60); // minutes
  const [showCorrelation, setShowCorrelation] = useState<string | null>(null);

  // Saved search state
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [showSavedSearches, setShowSavedSearches] = useState(false);

  // OTX IOC lookup state
  const [otxLookupIndicator, setOtxLookupIndicator] = useState<{ type: "IPv4" | "IPv6" | "domain" | "hostname" | "file" | "url" | "cve"; value: string } | null>(null);

  // ─── API Queries ─────────────────────────────────────────────────────────
  const statusQ = trpc.wazuh.status.useQuery();
  const isConfigured = !!(statusQ.data as Record<string, unknown>)?.configured;

  const rulesQ = trpc.wazuh.rules.useQuery(
    { limit: 500, offset: 0 },
    { enabled: isConfigured }
  );
  const agentsQ = trpc.wazuh.agents.useQuery(
    { limit: 500, offset: 0 },
    { enabled: isConfigured }
  );

  // OTX IOC lookup query
  const otxLookupQ = trpc.otx.indicatorLookup.useQuery(
    { type: otxLookupIndicator?.type ?? "IPv4", value: otxLookupIndicator?.value ?? "", section: "general" },
    { enabled: !!otxLookupIndicator, retry: false, staleTime: 120_000 }
  );
  const otxStatusQ = trpc.otx.status.useQuery(undefined, { staleTime: 300_000 });
  const isOtxConfigured = !!otxStatusQ.data?.configured;

  // Saved searches
  const savedSearchesQ = trpc.savedSearches.list.useQuery({ searchType: "siem" });
  const createSearchMut = trpc.savedSearches.create.useMutation({
    onSuccess: () => {
      savedSearchesQ.refetch();
      setShowSaveDialog(false);
      setSaveName("");
      setSaveDescription("");
      toast.success("Search saved successfully");
    },
    onError: (err) => toast.error(`Failed to save: ${err.message}`),
  });
  const deleteSearchMut = trpc.savedSearches.delete.useMutation({
    onSuccess: () => {
      savedSearchesQ.refetch();
      toast.success("Saved search deleted");
    },
    onError: (err) => toast.error(`Failed to delete: ${err.message}`),
  });

  // ─── Indexer alerts query ─────────────────────────────────────────────────
  const indexerStatusQ = trpc.indexer.status.useQuery(undefined, { retry: 1, staleTime: 60_000 });
  const indexerHealthy = indexerStatusQ.data?.configured === true && indexerStatusQ.data?.healthy === true;
  const timeRangeMs = useMemo(() => {
    const map: Record<string, number> = { "1h": 3600000, "6h": 21600000, "24h": 86400000, "7d": 604800000 };
    return map[timeRange] ?? 86400000;
  }, [timeRange]);
  const timeWindow = useMemo(() => ({
    from: new Date(Date.now() - timeRangeMs).toISOString(),
    to: new Date().toISOString(),
  }), [timeRange]); // eslint-disable-line react-hooks/exhaustive-deps
  const alertsSearchQ = trpc.indexer.alertsSearch.useQuery(
    { from: timeWindow.from, to: timeWindow.to, size: 500, offset: 0, query: searchQuery || undefined, sortField: "timestamp", sortOrder: "desc" },
    { retry: 1, staleTime: 15_000, enabled: indexerHealthy }
  );

  // ─── Data ────────────────────────────────────────────────────────────────
  const events: SiemEvent[] = useMemo(() => {
    if (!alertsSearchQ.data) return [];
    const safeData = (alertsSearchQ.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    const hits = (safeData?.hits as Record<string, unknown>)?.hits as Array<{ _source: Record<string, unknown> }> ?? [];
    return hits.map((h) => {
      const s = h._source;
      const agent = (s.agent ?? {}) as Record<string, unknown>;
      const rule = (s.rule ?? {}) as Record<string, unknown>;
      const mitre = (rule.mitre ?? {}) as Record<string, unknown>;
      const decoder = (s.decoder ?? {}) as Record<string, unknown>;
      return {
        id: String(s.id ?? h._source._id ?? Math.random()),
        timestamp: String(s.timestamp ?? ""),
        agent: { id: String(agent.id ?? ""), name: String(agent.name ?? ""), ip: String(agent.ip ?? "") },
        rule: {
          id: Number(rule.id ?? 0),
          level: Number(rule.level ?? 0),
          description: String(rule.description ?? ""),
          groups: (rule.groups ?? []) as string[],
          mitre: { id: (mitre.id ?? []) as string[], tactic: (mitre.tactic ?? []) as string[], technique: (mitre.technique ?? []) as string[] },
          pci_dss: (rule.pci_dss ?? []) as string[],
          gdpr: (rule.gdpr ?? []) as string[],
          hipaa: (rule.hipaa ?? []) as string[],
          firedtimes: Number(rule.firedtimes ?? 0),
        },
        decoder: { name: String(decoder.name ?? ""), parent: String(decoder.parent ?? "") },
        data: (s.data ?? {}) as Record<string, unknown>,
        location: String(s.location ?? ""),
        full_log: String(s.full_log ?? ""),
      } as SiemEvent;
    });
  }, [alertsSearchQ.data]);

  const logSources = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach(e => { const d = e.decoder.name || "unknown"; counts[d] = (counts[d] ?? 0) + 1; });
    return Object.entries(counts).map(([name, count]) => ({ name, count, category: name })).sort((a, b) => b.count - a.count);
  }, [events]);

  const rules = rulesQ.data ?? { data: { affected_items: [] } };
  const agents = agentsQ.data ?? { data: { affected_items: [] } };

  const agentList = (agents as Record<string, unknown>)?.data
    ? ((agents as Record<string, { affected_items: Array<{ id: string; name: string }> }>).data.affected_items || [])
    : [];

  // ─── Filtering ───────────────────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    let result = [...events];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.rule.description.toLowerCase().includes(q) ||
          e.full_log.toLowerCase().includes(q) ||
          e.agent.name.toLowerCase().includes(q) ||
          e.agent.ip.includes(q) ||
          (e.data as Record<string, unknown>)?.srcip?.toString().includes(q) ||
          e.decoder.name.toLowerCase().includes(q) ||
          e.rule.id.toString().includes(q) ||
          e.id.includes(q)
      );
    }

    if (severityFilter !== "all") {
      result = result.filter((e) => LEVEL_TO_SEVERITY(e.rule.level) === severityFilter);
    }

    if (sourceFilter !== "all") {
      result = result.filter((e) => e.decoder.name === sourceFilter || e.decoder.parent === sourceFilter);
    }

    if (agentFilter !== "all") {
      result = result.filter((e) => e.agent.id === agentFilter);
    }

    if (mitreFilter !== "all") {
      result = result.filter((e) => (e.rule.mitre.id as string[]).includes(mitreFilter) || (e.rule.mitre.tactic as string[]).includes(mitreFilter));
    }

    result.sort((a, b) => {
      if (sortField === "timestamp") {
        return sortDir === "desc"
          ? new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          : new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      }
      return sortDir === "desc" ? b.rule.level - a.rule.level : a.rule.level - b.rule.level;
    });

    return result;
  }, [events, searchQuery, severityFilter, sourceFilter, agentFilter, mitreFilter, sortField, sortDir]);

  const pagedEvents = filteredEvents.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filteredEvents.length / pageSize);

  // ─── Correlation Engine ──────────────────────────────────────────────────
  const getRelatedEvents = useCallback(
    (event: SiemEvent) => {
      const eventTime = new Date(event.timestamp).getTime();
      const windowMs = correlationWindow * 60 * 1000;
      const minTime = eventTime - windowMs;
      const maxTime = eventTime + windowMs;

      const sameAgent: SiemEvent[] = [];
      const sameRule: SiemEvent[] = [];
      const sameMitre: SiemEvent[] = [];

      events.forEach((e) => {
        if (e.id === event.id) return;
        const t = new Date(e.timestamp).getTime();
        if (t < minTime || t > maxTime) return;

        if (e.agent.id === event.agent.id) sameAgent.push(e);
        if (e.rule.id === event.rule.id) sameRule.push(e);
        if (
          event.rule.mitre.id.length > 0 &&
          (e.rule.mitre.id as string[]).some((id) => (event.rule.mitre.id as string[]).includes(id))
        ) {
          sameMitre.push(e);
        }
      });

      return { sameAgent, sameRule, sameMitre };
    },
    [events, correlationWindow]
  );

  // ─── Computed Stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const severityCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    const sourceCounts: Record<string, number> = {};
    const agentCounts: Record<string, number> = {};
    const tacticCounts: Record<string, number> = {};
    const hourlyBuckets: Record<number, number> = {};

    events.forEach((e) => {
      severityCounts[LEVEL_TO_SEVERITY(e.rule.level)]++;
      sourceCounts[e.decoder.parent || e.decoder.name] = (sourceCounts[e.decoder.parent || e.decoder.name] || 0) + 1;
      agentCounts[e.agent.name] = (agentCounts[e.agent.name] || 0) + 1;
      e.rule.mitre.tactic.forEach((t) => {
        tacticCounts[t] = (tacticCounts[t] || 0) + 1;
      });
      const hour = new Date(e.timestamp).getHours();
      hourlyBuckets[hour] = (hourlyBuckets[hour] || 0) + 1;
    });

    return { severityCounts, sourceCounts, agentCounts, tacticCounts, hourlyBuckets };
  }, [events]);

  const severityPieData = Object.entries(stats.severityCounts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: k.charAt(0).toUpperCase() + k.slice(1), value: v, color: SEVERITY_COLORS[k] }));

  const sourceBarData = Object.entries(stats.sourceCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([k, v]) => ({ name: k, count: v }));

  const tacticBarData = Object.entries(stats.tacticCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([k, v]) => ({ name: k, count: v }));

  const hourlyData = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i.toString().padStart(2, "0")}:00`,
    events: stats.hourlyBuckets[i] || 0,
  }));

  const activeFilters = [severityFilter, sourceFilter, agentFilter, mitreFilter].filter((f) => f !== "all").length;

  const clearFilters = () => {
    setSeverityFilter("all");
    setSourceFilter("all");
    setAgentFilter("all");
    setMitreFilter("all");
    setSearchQuery("");
  };

  // ─── Saved Search Helpers ────────────────────────────────────────────────
  const getCurrentFilters = () => ({
    searchQuery,
    severityFilter,
    sourceFilter,
    agentFilter,
    mitreFilter,
    timeRange,
    sortField,
    sortDir,
  });

  const loadSavedSearch = (filters: Record<string, unknown>) => {
    if (filters.searchQuery !== undefined) setSearchQuery(filters.searchQuery as string);
    if (filters.severityFilter !== undefined) setSeverityFilter(filters.severityFilter as string);
    if (filters.sourceFilter !== undefined) setSourceFilter(filters.sourceFilter as string);
    if (filters.agentFilter !== undefined) setAgentFilter(filters.agentFilter as string);
    if (filters.mitreFilter !== undefined) setMitreFilter(filters.mitreFilter as string);
    if (filters.timeRange !== undefined) setTimeRange(filters.timeRange as string);
    if (filters.sortField !== undefined) setSortField(filters.sortField as "timestamp" | "level");
    if (filters.sortDir !== undefined) setSortDir(filters.sortDir as "asc" | "desc");
    setPage(0);
    setShowSavedSearches(false);
    toast.success("Search loaded");
  };

  const handleSaveSearch = () => {
    if (!saveName.trim()) {
      toast.error("Please enter a name for this search");
      return;
    }
    createSearchMut.mutate({
      name: saveName.trim(),
      searchType: "siem",
      filters: getCurrentFilters(),
      description: saveDescription.trim() || undefined,
    });
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-6 max-w-[2400px] mx-auto">
      <WazuhGuard><div /></WazuhGuard>
      <PageHeader
        title="SIEM Events"
        subtitle="Unified security event viewer — normalized alerts, log correlation, and forensic drill-down"
      >
        <div className="flex items-center gap-2">
          {/* Saved Searches Dropdown */}
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSavedSearches(!showSavedSearches)}
              className="text-xs bg-transparent border-white/10 text-slate-300 hover:bg-white/10"
            >
              <Bookmark className="h-3.5 w-3.5 mr-1" />
              Saved ({savedSearchesQ.data?.searches?.length ?? 0})
            </Button>
            {showSavedSearches && (
              <div className="absolute right-0 top-full mt-1 w-80 bg-[oklch(0.17_0.025_286)] border border-white/10 rounded-lg shadow-xl z-50 max-h-[400px] overflow-y-auto">
                <div className="p-3 border-b border-white/10">
                  <h4 className="text-xs font-semibold text-violet-300">Saved SIEM Searches</h4>
                </div>
                {(savedSearchesQ.data?.searches ?? []).length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    No saved searches yet
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {(savedSearchesQ.data?.searches ?? []).map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between px-3 py-2.5 hover:bg-white/5 cursor-pointer group"
                      >
                        <div
                          className="flex-1 min-w-0"
                          onClick={() => loadSavedSearch(s.filters as Record<string, unknown>)}
                        >
                          <p className="text-xs text-slate-200 truncate font-medium">{s.name}</p>
                          {s.description && (
                            <p className="text-[10px] text-slate-500 truncate mt-0.5">{s.description}</p>
                          )}
                          <p className="text-[10px] text-slate-600 mt-0.5">
                            {new Date(s.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSearchMut.mutate({ id: s.id });
                          }}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Save Current Search */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSaveDialog(true)}
            className="text-xs bg-transparent border-white/10 text-slate-300 hover:bg-white/10"
          >
            <BookmarkPlus className="h-3.5 w-3.5 mr-1" />
            Save Search
          </Button>

          <RefreshControl
            onRefresh={() => {
              rulesQ.refetch();
              agentsQ.refetch();
              savedSearchesQ.refetch();
            }}
          />
        </div>
      </PageHeader>

      {/* ── Save Search Dialog ─────────────────────────────────────────────── */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowSaveDialog(false)}>
          <div className="bg-[oklch(0.17_0.025_286)] border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-violet-300 mb-4 flex items-center gap-2">
              <Save className="h-4 w-4" /> Save SIEM Search
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Name *</label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g., SSH brute force on prod servers"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500/50"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  placeholder="Brief description of this search..."
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500/50"
                />
              </div>
              <div className="bg-white/5 rounded-lg p-3 text-xs text-slate-400 space-y-1">
                <p className="font-semibold text-slate-300">Current Filters:</p>
                {searchQuery && <p>Search: <span className="font-mono text-violet-300">{searchQuery}</span></p>}
                {severityFilter !== "all" && <p>Severity: <span className="text-violet-300">{severityFilter}</span></p>}
                {sourceFilter !== "all" && <p>Source: <span className="text-violet-300">{sourceFilter}</span></p>}
                {agentFilter !== "all" && <p>Agent: <span className="text-violet-300">{agentFilter}</span></p>}
                {mitreFilter !== "all" && <p>MITRE: <span className="text-violet-300">{mitreFilter}</span></p>}
                <p>Time Range: <span className="text-violet-300">{timeRange}</span></p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSaveDialog(false)}
                className="bg-transparent border-white/10 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveSearch}
                disabled={createSearchMut.isPending}
                className="bg-violet-600 hover:bg-violet-500 text-white"
              >
                {createSearchMut.isPending ? "Saving..." : "Save Search"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Loading State ────────────────────────────────────────────────── */}
      {alertsSearchQ.isLoading && <IndexerLoadingState message="Fetching SIEM events from indexer…" />}
      {/* ── Error State ──────────────────────────────────────────────────── */}
      {alertsSearchQ.isError && (
        <IndexerErrorState
          message="Failed to fetch SIEM events from indexer"
          detail={alertsSearchQ.error?.message}
          onRetry={() => alertsSearchQ.refetch()}
        />
      )}

      {/* ── KPI Row ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {alertsSearchQ.isLoading ? <StatCardSkeleton count={6} /> : (<>
        <StatCard label="Total Events" value={events.length.toLocaleString()} icon={Layers} />
        <StatCard
          label="Critical"
          value={stats.severityCounts.critical}
          icon={AlertTriangle}
          colorClass="text-red-400"
          className="border-red-500/20"
        />
        <StatCard
          label="High"
          value={stats.severityCounts.high}
          icon={AlertTriangle}
          colorClass="text-orange-400"
          className="border-orange-500/20"
        />
        <StatCard
          label="Medium"
          value={stats.severityCounts.medium}
          icon={Shield}
          colorClass="text-yellow-400"
          className="border-yellow-500/20"
        />
        <StatCard label="Low" value={stats.severityCounts.low} icon={Shield} colorClass="text-green-400" />
        <StatCard
          label="Log Sources"
          value={logSources.length}
          icon={Database}
          colorClass="text-violet-400"
        />
        </>)}
      </div>

      {/* ── Charts Row ────────────────────────────────────────────────────── */}
      {alertsSearchQ.isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartSkeleton variant="area" height={180} title="Event Volume (24h)" />
          <ChartSkeleton variant="pie" height={180} title="Severity Distribution" />
          <ChartSkeleton variant="bar" height={180} title="MITRE Tactic Hits" />
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Event Timeline */}
        <GlassPanel className="lg:col-span-1">
          <h3 className="text-sm font-semibold text-violet-300 mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4" /> Event Volume (24h)
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={hourlyData}>
              <defs>
                <linearGradient id="siemGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="hour" tick={{ fill: "#94a3b8", fontSize: 10 }} interval={3} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} width={30} />
              <RTooltip
                contentStyle={{ background: "#1e1b4b", border: "1px solid #7c3aed40", borderRadius: 8, color: "#e2e8f0" }}
              />
              <Area type="monotone" dataKey="events" stroke="#8b5cf6" fill="url(#siemGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </GlassPanel>

        {/* Severity Distribution */}
        <GlassPanel>
          <h3 className="text-sm font-semibold text-violet-300 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Severity Distribution
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={severityPieData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={3}
                dataKey="value"
              >
                {severityPieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <RTooltip
                contentStyle={{ background: "#1e1b4b", border: "1px solid #7c3aed40", borderRadius: 8, color: "#e2e8f0" }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 justify-center mt-1">
            {severityPieData.map((d) => (
              <span key={d.name} className="flex items-center gap-1 text-xs text-slate-400">
                <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                {d.name}: {d.value}
              </span>
            ))}
          </div>
        </GlassPanel>

        {/* MITRE Tactic Distribution */}
        <GlassPanel>
          <h3 className="text-sm font-semibold text-violet-300 mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4" /> MITRE Tactic Hits
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={tacticBarData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <YAxis dataKey="name" type="category" tick={{ fill: "#94a3b8", fontSize: 9 }} width={120} />
              <RTooltip
                contentStyle={{ background: "#1e1b4b", border: "1px solid #7c3aed40", borderRadius: 8, color: "#e2e8f0" }}
              />
              <Bar dataKey="count" fill="#a78bfa" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </GlassPanel>
      </div>
      )}

      {/* ── Log Source + Decoder Breakdown ─────────────────────────────────── */}
      {alertsSearchQ.isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <ChartSkeleton variant="bar" height={200} title="Log Sources" />
          <ChartSkeleton variant="bar" height={200} title="Events by Decoder" className="lg:col-span-3" />
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <GlassPanel className="lg:col-span-1">
          <h3 className="text-sm font-semibold text-violet-300 mb-3 flex items-center gap-2">
            <Database className="h-4 w-4" /> Log Sources
          </h3>
          <div className="space-y-2">
            {logSources.map((src) => (
              <button
                key={src.name}
                onClick={() => setSourceFilter(sourceFilter === src.name ? "all" : src.name)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                  sourceFilter === src.name
                    ? "bg-violet-600/30 border border-violet-500/50 text-violet-200"
                    : "bg-white/5 hover:bg-white/10 text-slate-300"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
                  <span className="font-mono">{src.name}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-slate-500">{src.category}</span>
                  <span className="bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                    {src.count}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </GlassPanel>

        {/* ── Decoder Bar Chart ─────────────────────────────────────────── */}
        <GlassPanel className="lg:col-span-3">
          <h3 className="text-sm font-semibold text-violet-300 mb-3 flex items-center gap-2">
            <Cpu className="h-4 w-4" /> Events by Decoder
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={sourceBarData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} width={30} />
              <RTooltip
                contentStyle={{ background: "#1e1b4b", border: "1px solid #7c3aed40", borderRadius: 8, color: "#e2e8f0" }}
              />
              <Bar dataKey="count" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </GlassPanel>
      </div>
      )}

      {/* ── Search + Filters ──────────────────────────────────────────────── */}
      <GlassPanel>
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
              placeholder="Search events — IP, hash, rule ID, agent, description, full log..."
              className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30 font-mono"
            />
          </div>

          {/* Severity filter */}
          <select
            value={severityFilter}
            onChange={(e) => { setSeverityFilter(e.target.value); setPage(0); }}
            className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-violet-500/50"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical (14-15)</option>
            <option value="high">High (10-13)</option>
            <option value="medium">Medium (7-9)</option>
            <option value="low">Low (4-6)</option>
            <option value="info">Info (0-3)</option>
          </select>

          {/* Agent filter */}
          <select
            value={agentFilter}
            onChange={(e) => { setAgentFilter(e.target.value); setPage(0); }}
            className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-violet-500/50"
          >
            <option value="all">All Agents</option>
            {agentList.map((a: { id: string; name: string }) => (
              <option key={a.id} value={a.id}>
                {a.id} — {a.name}
              </option>
            ))}
          </select>

          {/* MITRE filter */}
          <select
            value={mitreFilter}
            onChange={(e) => { setMitreFilter(e.target.value); setPage(0); }}
            className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-violet-500/50"
          >
            <option value="all">All MITRE Tactics</option>
            {Object.keys(stats.tacticCounts).sort().map((t) => (
              <option key={t} value={t}>{t} ({stats.tacticCounts[t]})</option>
            ))}
          </select>

          {/* Time range */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-violet-500/50"
          >
            <option value="15m">Last 15m</option>
            <option value="1h">Last 1h</option>
            <option value="6h">Last 6h</option>
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7d</option>
          </select>

          {/* Sort */}
          <button
            onClick={() => {
              if (sortField === "timestamp") {
                setSortDir(sortDir === "desc" ? "asc" : "desc");
              } else {
                setSortField("timestamp");
                setSortDir("desc");
              }
            }}
            className="flex items-center gap-1 px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-300 hover:bg-white/10 transition-colors"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortField === "timestamp" ? "Time" : "Level"} {sortDir === "desc" ? "↓" : "↑"}
          </button>

          {activeFilters > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300 hover:bg-red-500/20 transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Clear ({activeFilters})
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Showing {pagedEvents.length} of {filteredEvents.length} events
            {filteredEvents.length !== events.length && ` (filtered from ${events.length} total)`}
          </span>
          <ExportButton
            getData={() => filteredEvents.map(e => ({
              timestamp: e.timestamp,
              agent: e.agent.name,
              agentId: e.agent.id,
              ruleId: e.rule.id,
              ruleDescription: e.rule.description,
              level: e.rule.level,
              decoder: e.decoder.name,
              srcIp: String((e.data as Record<string, unknown>)?.srcip ?? ""),
              dstIp: String((e.data as Record<string, unknown>)?.dstip ?? ""),
              mitreTactic: e.rule.mitre?.tactic?.join(", ") ?? "",
              mitreId: e.rule.mitre?.id?.join(", ") ?? "",
              logSource: e.location,
            }) as Record<string, unknown>)}
            baseName="siem-events"
            columns={EXPORT_COLUMNS.siemEvents}
            label="Export"
          />
        </div>
      </GlassPanel>

      {/* ── Event Table ───────────────────────────────────────────────────── */}
      <GlassPanel className="!p-0 overflow-hidden">
        {alertsSearchQ.isLoading ? (
          <TableSkeleton columns={7} rows={12} columnWidths={[1, 2, 4, 2, 1, 1, 1]} />
        ) : (<>
        {/* Table Header */}
        <div className="grid grid-cols-[60px_160px_1fr_180px_120px_100px_80px] gap-2 px-4 py-3 bg-white/5 border-b border-white/10 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          <span>Level</span>
          <span>Timestamp</span>
          <span>Description</span>
          <span>Agent</span>
          <span>Rule ID</span>
          <span>Decoder</span>
          <span>Actions</span>
        </div>

        {/* Event Rows */}
        <div className="divide-y divide-white/5">
          {pagedEvents.map((event) => {
            const severity = LEVEL_TO_SEVERITY(event.rule.level);
            const isExpanded = expandedEvent === event.id;
            const DecoderIcon = DECODER_ICONS[event.decoder.name] || DECODER_ICONS[event.decoder.parent] || Database;
            const srcip = (event.data as Record<string, unknown>)?.srcip as string | undefined;
            const dstuser = (event.data as Record<string, unknown>)?.dstuser as string | undefined;

            // Compute correlation counts for the badge
            const correlationCounts = isExpanded
              ? (() => {
                  const rel = getRelatedEvents(event);
                  return {
                    agent: rel.sameAgent.length,
                    rule: rel.sameRule.length,
                    mitre: rel.sameMitre.length,
                    total: rel.sameAgent.length + rel.sameRule.length + rel.sameMitre.length,
                  };
                })()
              : null;

            return (
              <div key={event.id}>
                {/* Main Row */}
                <div
                  className={`grid grid-cols-[60px_160px_1fr_180px_120px_100px_80px] gap-2 px-4 py-3 text-sm cursor-pointer transition-colors ${
                    isExpanded ? "bg-violet-500/10" : "hover:bg-white/5"
                  }`}
                  onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                >
                  {/* Level */}
                  <div className="flex items-center">
                    <span
                      className="inline-flex items-center justify-center w-8 h-6 rounded text-[10px] font-bold"
                      style={{
                        background: `${SEVERITY_COLORS[severity]}20`,
                        color: SEVERITY_COLORS[severity],
                        border: `1px solid ${SEVERITY_COLORS[severity]}40`,
                      }}
                    >
                      {event.rule.level}
                    </span>
                  </div>

                  {/* Timestamp */}
                  <div className="flex items-center text-xs text-slate-400 font-mono">
                    <Clock className="h-3 w-3 mr-1.5 text-slate-600 flex-shrink-0" />
                    {new Date(event.timestamp).toLocaleString()}
                  </div>

                  {/* Description */}
                  <div className="flex items-center min-w-0">
                    <div className="flex items-center gap-1.5 flex-shrink-0 mr-2">
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-violet-400" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                      )}
                    </div>
                    <span className="truncate text-slate-200">{event.rule.description}</span>
                    {event.rule.mitre.id.length > 0 && (
                      <span className="ml-2 flex-shrink-0 text-[10px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded font-mono">
                        {event.rule.mitre.id[0]}
                      </span>
                    )}
                  </div>

                  {/* Agent */}
                  <div className="flex items-center text-xs">
                    <span className="text-violet-300 font-mono mr-1">{event.agent.id}</span>
                    <span className="text-slate-400 truncate">{event.agent.name}</span>
                  </div>

                  {/* Rule ID */}
                  <div className="flex items-center text-xs font-mono text-slate-300">
                    {event.rule.id}
                    {(event.rule.firedtimes ?? 0) > 1 && (
                      <span className="ml-1 text-[10px] text-slate-500">×{event.rule.firedtimes}</span>
                    )}
                  </div>

                  {/* Decoder */}
                  <div className="flex items-center text-xs text-slate-400">
                    <DecoderIcon className="h-3 w-3 mr-1 text-violet-400 flex-shrink-0" />
                    <span className="truncate font-mono">{event.decoder.name}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowRawJson(showRawJson === event.id ? null : event.id);
                      }}
                      className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-violet-300 transition-colors"
                      title="View raw JSON"
                    >
                      <FileText className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(JSON.stringify(event, null, 2));
                        toast.success("Event JSON copied to clipboard");
                      }}
                      className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-violet-300 transition-colors"
                      title="Copy JSON"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="px-4 py-4 bg-violet-500/5 border-t border-violet-500/20 space-y-4">
                    {/* Full Log */}
                    <div>
                      <h4 className="text-xs font-semibold text-violet-300 mb-1.5">Full Log</h4>
                      <pre className="text-xs text-slate-300 bg-black/30 rounded-lg p-3 overflow-x-auto font-mono whitespace-pre-wrap break-all border border-white/5">
                        {event.full_log}
                      </pre>
                    </div>

                    {/* Event Details Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Source Info */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-violet-300">Source</h4>
                        <div className="space-y-1 text-xs">
                          {srcip && (
                            <div className="flex justify-between items-center">
                              <span className="text-slate-500">Source IP</span>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-slate-200">{srcip}</span>
                                {isOtxConfigured && !srcip.startsWith("10.") && !srcip.startsWith("192.168.") && !srcip.startsWith("172.") && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setOtxLookupIndicator({ type: "IPv4", value: srcip }); }}
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 transition-colors"
                                    title="Check in OTX"
                                  >
                                    <Radar className="h-2.5 w-2.5" /> OTX
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                          {(event.data as Record<string, unknown>)?.srcport ? (
                            <div className="flex justify-between">
                              <span className="text-slate-500">Source Port</span>
                              <span className="font-mono text-slate-200">{String((event.data as Record<string, unknown>).srcport)}</span>
                            </div>
                          ) : null}
                          {(event.data as Record<string, unknown>)?.dstip ? (
                            <div className="flex justify-between items-center">
                              <span className="text-slate-500">Dest IP</span>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-slate-200">{String((event.data as Record<string, unknown>).dstip)}</span>
                                {isOtxConfigured && (() => {
                                  const dip = String((event.data as Record<string, unknown>).dstip);
                                  return !dip.startsWith("10.") && !dip.startsWith("192.168.") && !dip.startsWith("172.") ? (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setOtxLookupIndicator({ type: "IPv4", value: dip }); }}
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 transition-colors"
                                      title="Check in OTX"
                                    >
                                      <Radar className="h-2.5 w-2.5" /> OTX
                                    </button>
                                  ) : null;
                                })()}
                              </div>
                            </div>
                          ) : null}
                          {(event.data as Record<string, unknown>)?.dstport ? (
                            <div className="flex justify-between">
                              <span className="text-slate-500">Dest Port</span>
                              <span className="font-mono text-slate-200">{String((event.data as Record<string, unknown>).dstport)}</span>
                            </div>
                          ) : null}
                          {dstuser && (
                            <div className="flex justify-between">
                              <span className="text-slate-500">Target User</span>
                              <span className="font-mono text-slate-200">{dstuser}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-slate-500">Location</span>
                            <span className="font-mono text-slate-200 text-right truncate max-w-[180px]">{event.location}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Decoder</span>
                            <span className="font-mono text-slate-200">{event.decoder.name} → {event.decoder.parent}</span>
                          </div>
                        </div>
                      </div>

                      {/* Rule Info */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-violet-300">Rule</h4>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Rule ID</span>
                            <span className="font-mono text-slate-200">{event.rule.id}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Level</span>
                            <ThreatBadge level={severity as "critical" | "high" | "medium" | "low" | "info"} />
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Fired Times</span>
                            <span className="font-mono text-slate-200">{event.rule.firedtimes}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Groups</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {event.rule.groups.map((g) => (
                                <span key={g} className="px-1.5 py-0.5 bg-white/5 rounded text-[10px] font-mono text-slate-400">
                                  {g}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Compliance + MITRE */}
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-violet-300">Compliance & MITRE</h4>
                        <div className="space-y-1 text-xs">
                          {event.rule.mitre.id.length > 0 && (
                            <div>
                              <span className="text-slate-500">MITRE ATT&CK</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {event.rule.mitre.id.map((id) => (
                                  <a
                                    key={id}
                                    href={`https://attack.mitre.org/techniques/${id.replace(".", "/")}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-violet-500/20 text-violet-300 rounded text-[10px] font-mono hover:bg-violet-500/30 transition-colors"
                                  >
                                    {id} <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                ))}
                              </div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {event.rule.mitre.tactic.map((t) => (
                                  <span key={t} className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-[10px]">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {(event.rule.pci_dss?.length ?? 0) > 0 && (
                            <div className="flex items-start gap-2">
                              <span className="text-slate-500 flex-shrink-0">PCI DSS</span>
                              <div className="flex flex-wrap gap-1">
                                {event.rule.pci_dss?.map((p) => (
                                  <span key={p} className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded text-[10px] font-mono">
                                    {p}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {(event.rule.gdpr?.length ?? 0) > 0 && (
                            <div className="flex items-start gap-2">
                              <span className="text-slate-500 flex-shrink-0">GDPR</span>
                              <div className="flex flex-wrap gap-1">
                                {event.rule.gdpr?.map((g) => (
                                  <span key={g} className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded text-[10px] font-mono">
                                    {g}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {(event.rule.hipaa?.length ?? 0) > 0 && (
                            <div className="flex items-start gap-2">
                              <span className="text-slate-500 flex-shrink-0">HIPAA</span>
                              <div className="flex flex-wrap gap-1">
                                {event.rule.hipaa?.map((h) => (
                                  <span key={h} className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded text-[10px] font-mono">
                                    {h}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ── Related Events Correlation Panel ─────────────────────── */}
                    <div className="border-t border-violet-500/20 pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-semibold text-violet-300 flex items-center gap-2">
                          <Link2 className="h-4 w-4" />
                          Related Events
                          {correlationCounts && correlationCounts.total > 0 && (
                            <span className="bg-violet-500/30 text-violet-200 px-1.5 py-0.5 rounded text-[10px] font-bold">
                              {correlationCounts.total}
                            </span>
                          )}
                        </h4>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500">Time Window:</span>
                          <div className="flex gap-1">
                            {CORRELATION_WINDOWS.map((w) => (
                              <button
                                key={w.value}
                                onClick={() => setCorrelationWindow(w.value)}
                                className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                                  correlationWindow === w.value
                                    ? "bg-violet-500/30 text-violet-200 border border-violet-500/50"
                                    : "bg-white/5 text-slate-400 hover:bg-white/10"
                                }`}
                              >
                                {w.label}
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={() => setShowCorrelation(showCorrelation === event.id ? null : event.id)}
                            className={`px-2 py-1 rounded text-[10px] transition-colors ${
                              showCorrelation === event.id
                                ? "bg-violet-500/30 text-violet-200"
                                : "bg-white/5 text-slate-400 hover:bg-white/10"
                            }`}
                          >
                            {showCorrelation === event.id ? "Hide" : "Show"} Details
                          </button>
                        </div>
                      </div>

                      {/* Correlation summary badges */}
                      {correlationCounts && (
                        <div className="flex gap-3 mb-3">
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                            <span className="text-[10px] text-blue-400">Same Agent</span>
                            <span className="text-xs font-bold text-blue-300 font-mono">{correlationCounts.agent}</span>
                          </div>
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                            <span className="text-[10px] text-amber-400">Same Rule</span>
                            <span className="text-xs font-bold text-amber-300 font-mono">{correlationCounts.rule}</span>
                          </div>
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-violet-500/10 border border-violet-500/20 rounded-lg">
                            <span className="text-[10px] text-violet-400">Same MITRE</span>
                            <span className="text-xs font-bold text-violet-300 font-mono">{correlationCounts.mitre}</span>
                          </div>
                        </div>
                      )}

                      {/* Expanded correlation details */}
                      {showCorrelation === event.id && (() => {
                        const related = getRelatedEvents(event);
                        return (
                          <div className="space-y-3">
                            {/* Same Agent */}
                            {related.sameAgent.length > 0 && (
                              <div>
                                <h5 className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-1.5">
                                  Same Agent ({event.agent.id} — {event.agent.name}) — {related.sameAgent.length} events
                                </h5>
                                <div className="bg-black/20 rounded-lg border border-white/5 overflow-hidden">
                                  <div className="max-h-[200px] overflow-y-auto divide-y divide-white/5">
                                    {related.sameAgent.slice(0, 10).map((re) => (
                                      <div
                                        key={re.id}
                                        className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-white/5 cursor-pointer"
                                        onClick={() => {
                                          setExpandedEvent(re.id);
                                          setShowCorrelation(null);
                                        }}
                                      >
                                        <span
                                          className="w-6 h-5 rounded text-[9px] font-bold flex items-center justify-center"
                                          style={{
                                            background: `${SEVERITY_COLORS[LEVEL_TO_SEVERITY(re.rule.level)]}20`,
                                            color: SEVERITY_COLORS[LEVEL_TO_SEVERITY(re.rule.level)],
                                          }}
                                        >
                                          {re.rule.level}
                                        </span>
                                        <span className="text-slate-500 font-mono w-[120px] flex-shrink-0">
                                          {new Date(re.timestamp).toLocaleTimeString()}
                                        </span>
                                        <span className="text-slate-300 truncate">{re.rule.description}</span>
                                        <span className="text-slate-500 font-mono flex-shrink-0">{re.rule.id}</span>
                                      </div>
                                    ))}
                                    {related.sameAgent.length > 10 && (
                                      <div className="px-3 py-1.5 text-[10px] text-slate-500 text-center">
                                        +{related.sameAgent.length - 10} more events
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Same Rule */}
                            {related.sameRule.length > 0 && (
                              <div>
                                <h5 className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1.5">
                                  Same Rule ({event.rule.id}) — {related.sameRule.length} events
                                </h5>
                                <div className="bg-black/20 rounded-lg border border-white/5 overflow-hidden">
                                  <div className="max-h-[200px] overflow-y-auto divide-y divide-white/5">
                                    {related.sameRule.slice(0, 10).map((re) => (
                                      <div
                                        key={re.id}
                                        className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-white/5 cursor-pointer"
                                        onClick={() => {
                                          setExpandedEvent(re.id);
                                          setShowCorrelation(null);
                                        }}
                                      >
                                        <span
                                          className="w-6 h-5 rounded text-[9px] font-bold flex items-center justify-center"
                                          style={{
                                            background: `${SEVERITY_COLORS[LEVEL_TO_SEVERITY(re.rule.level)]}20`,
                                            color: SEVERITY_COLORS[LEVEL_TO_SEVERITY(re.rule.level)],
                                          }}
                                        >
                                          {re.rule.level}
                                        </span>
                                        <span className="text-slate-500 font-mono w-[120px] flex-shrink-0">
                                          {new Date(re.timestamp).toLocaleTimeString()}
                                        </span>
                                        <span className="text-violet-300 font-mono flex-shrink-0">{re.agent.id}</span>
                                        <span className="text-slate-300 truncate">{re.agent.name}</span>
                                        <span className="text-slate-500 font-mono flex-shrink-0">
                                          {(re.data as Record<string, unknown>)?.srcip as string || "—"}
                                        </span>
                                      </div>
                                    ))}
                                    {related.sameRule.length > 10 && (
                                      <div className="px-3 py-1.5 text-[10px] text-slate-500 text-center">
                                        +{related.sameRule.length - 10} more events
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Same MITRE Technique */}
                            {related.sameMitre.length > 0 && (
                              <div>
                                <h5 className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider mb-1.5">
                                  Same MITRE Technique ({event.rule.mitre.id.join(", ")}) — {related.sameMitre.length} events
                                </h5>
                                <div className="bg-black/20 rounded-lg border border-white/5 overflow-hidden">
                                  <div className="max-h-[200px] overflow-y-auto divide-y divide-white/5">
                                    {related.sameMitre.slice(0, 10).map((re) => (
                                      <div
                                        key={re.id}
                                        className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-white/5 cursor-pointer"
                                        onClick={() => {
                                          setExpandedEvent(re.id);
                                          setShowCorrelation(null);
                                        }}
                                      >
                                        <span
                                          className="w-6 h-5 rounded text-[9px] font-bold flex items-center justify-center"
                                          style={{
                                            background: `${SEVERITY_COLORS[LEVEL_TO_SEVERITY(re.rule.level)]}20`,
                                            color: SEVERITY_COLORS[LEVEL_TO_SEVERITY(re.rule.level)],
                                          }}
                                        >
                                          {re.rule.level}
                                        </span>
                                        <span className="text-slate-500 font-mono w-[120px] flex-shrink-0">
                                          {new Date(re.timestamp).toLocaleTimeString()}
                                        </span>
                                        <span className="text-violet-300 font-mono flex-shrink-0">{re.agent.id}</span>
                                        <span className="text-slate-300 truncate">{re.rule.description}</span>
                                        <span className="flex gap-1 flex-shrink-0">
                                          {re.rule.mitre.id.map((id) => (
                                            <span key={id} className="px-1 py-0.5 bg-violet-500/20 text-violet-300 rounded text-[9px] font-mono">
                                              {id}
                                            </span>
                                          ))}
                                        </span>
                                      </div>
                                    ))}
                                    {related.sameMitre.length > 10 && (
                                      <div className="px-3 py-1.5 text-[10px] text-slate-500 text-center">
                                        +{related.sameMitre.length - 10} more events
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {related.sameAgent.length === 0 && related.sameRule.length === 0 && related.sameMitre.length === 0 && (
                              <div className="text-center py-4 text-xs text-slate-500">
                                No related events found within the selected time window
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Raw JSON Panel */}
                {showRawJson === event.id && (
                  <div className="px-4 py-3 bg-black/20 border-t border-white/5">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-violet-300">Raw Event JSON</h4>
                      <button
                        onClick={() => setShowRawJson(null)}
                        className="text-slate-500 hover:text-slate-300"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <RawJsonViewer data={event as unknown as Record<string, unknown>} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 bg-white/5">
            <span className="text-xs text-slate-500">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="text-xs bg-transparent border-white/10 text-slate-300 hover:bg-white/10"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="text-xs bg-transparent border-white/10 text-slate-300 hover:bg-white/10"
              >
                Next
              </Button>
            </div>
          </div>
        )}
        </>)}
      </GlassPanel>

      {/* ── OTX IOC Lookup Dialog ──────────────────────────────────────── */}
      <Dialog open={!!otxLookupIndicator} onOpenChange={(open) => { if (!open) setOtxLookupIndicator(null); }}>
        <DialogContent className="max-w-2xl bg-slate-900/95 border-violet-500/30 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="text-violet-300 flex items-center gap-2">
              <Radar className="h-5 w-5" /> OTX Threat Intelligence Lookup
            </DialogTitle>
          </DialogHeader>
          {otxLookupIndicator && (
            <div className="space-y-4">
              {/* Indicator info */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-black/30 border border-white/5">
                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                  {otxLookupIndicator.type}
                </span>
                <span className="font-mono text-sm text-slate-200">{otxLookupIndicator.value}</span>
              </div>

              {/* Loading state */}
              {otxLookupQ.isLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 text-violet-400 animate-spin" />
                  <span className="ml-2 text-sm text-slate-400">Querying OTX...</span>
                </div>
              )}

              {/* Error state */}
              {otxLookupQ.isError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <AlertCircle className="h-4 w-4 text-red-400" />
                  <span className="text-sm text-red-300">Failed to query OTX: {otxLookupQ.error?.message}</span>
                </div>
              )}

              {/* Results */}
              {otxLookupQ.data && !otxLookupQ.isLoading && (() => {
                const d = otxLookupQ.data as Record<string, unknown>;
                if (!d.configured) {
                  return (
                    <div className="text-center py-4 text-sm text-slate-500">OTX is not configured</div>
                  );
                }
                const data = d.data as Record<string, unknown> | null;
                if (!data) return <div className="text-center py-4 text-sm text-slate-500">No data returned</div>;

                const pulseCount = Number((data.pulse_info as Record<string, unknown>)?.count ?? 0);
                const pulses = ((data.pulse_info as Record<string, unknown>)?.pulses ?? []) as Array<Record<string, unknown>>;
                const reputation = data.reputation as number | null | undefined;
                const country = String((data as Record<string, unknown>)?.country_name ?? (data as Record<string, unknown>)?.country ?? "");
                const asn = String((data as Record<string, unknown>)?.asn ?? "");
                const validation = ((data as Record<string, unknown>)?.validation ?? []) as Array<Record<string, unknown>>;
                const sections = ((data as Record<string, unknown>)?.sections ?? []) as string[];

                return (
                  <div className="space-y-4">
                    {/* Summary KPIs */}
                    <div className="grid grid-cols-4 gap-3">
                      <div className="p-3 rounded-lg bg-black/20 border border-white/5 text-center">
                        <p className={`text-lg font-display font-bold ${pulseCount > 0 ? "text-red-400" : "text-green-400"}`}>{pulseCount}</p>
                        <p className="text-[10px] text-slate-500">Pulses</p>
                      </div>
                      <div className="p-3 rounded-lg bg-black/20 border border-white/5 text-center">
                        <p className={`text-lg font-display font-bold ${reputation != null && reputation < 0 ? "text-red-400" : "text-green-400"}`}>
                          {reputation != null ? reputation : "N/A"}
                        </p>
                        <p className="text-[10px] text-slate-500">Reputation</p>
                      </div>
                      <div className="p-3 rounded-lg bg-black/20 border border-white/5 text-center">
                        <p className="text-lg font-display font-bold text-slate-200">{country || "—"}</p>
                        <p className="text-[10px] text-slate-500">Country</p>
                      </div>
                      <div className="p-3 rounded-lg bg-black/20 border border-white/5 text-center">
                        <p className="text-lg font-display font-bold text-slate-200 truncate">{asn || "—"}</p>
                        <p className="text-[10px] text-slate-500">ASN</p>
                      </div>
                    </div>

                    {/* Verdict */}
                    <div className={`flex items-center gap-2 p-3 rounded-lg border ${
                      pulseCount > 5 ? "bg-red-500/10 border-red-500/20" :
                      pulseCount > 0 ? "bg-amber-500/10 border-amber-500/20" :
                      "bg-green-500/10 border-green-500/20"
                    }`}>
                      {pulseCount > 5 ? (
                        <><AlertCircle className="h-4 w-4 text-red-400" /><span className="text-sm text-red-300 font-medium">Malicious — Found in {pulseCount} threat pulses</span></>
                      ) : pulseCount > 0 ? (
                        <><AlertTriangle className="h-4 w-4 text-amber-400" /><span className="text-sm text-amber-300 font-medium">Suspicious — Found in {pulseCount} threat pulse{pulseCount > 1 ? "s" : ""}</span></>
                      ) : (
                        <><CheckCircle2 className="h-4 w-4 text-green-400" /><span className="text-sm text-green-300 font-medium">No known threats — Clean indicator</span></>
                      )}
                    </div>

                    {/* Validation tags */}
                    {validation.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-violet-300 mb-2">Validation</h4>
                        <div className="flex flex-wrap gap-1">
                          {validation.map((v, i) => (
                            <span key={i} className="px-2 py-0.5 rounded text-[10px] font-mono bg-violet-500/20 text-violet-300 border border-violet-500/30">
                              {String(v.source ?? v.name ?? JSON.stringify(v))}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Related Pulses */}
                    {pulses.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-violet-300 mb-2">Related Threat Pulses ({pulseCount})</h4>
                        <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                          {pulses.slice(0, 10).map((p) => (
                            <a
                              key={String(p.id)}
                              href={`https://otx.alienvault.com/pulse/${String(p.id)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between p-2 rounded-lg bg-black/20 border border-white/5 hover:border-violet-500/30 transition-colors group"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-xs text-slate-200 truncate group-hover:text-violet-300 transition-colors">{String(p.name)}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] text-slate-500">{String(p.author_name ?? "—")}</span>
                                  <span className="text-[10px] text-slate-600">•</span>
                                  <span className="text-[10px] text-slate-500">{p.created ? new Date(String(p.created)).toLocaleDateString() : "—"}</span>
                                  {(p.tags as string[] | undefined)?.slice(0, 3).map((tag) => (
                                    <span key={tag} className="px-1 py-0.5 rounded text-[9px] bg-white/5 text-slate-400">{tag}</span>
                                  ))}
                                </div>
                              </div>
                              <ExternalLink className="h-3 w-3 text-slate-600 group-hover:text-violet-400 flex-shrink-0 ml-2" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Available sections */}
                    {sections.length > 0 && (
                      <div className="text-[10px] text-slate-600">
                        Available sections: {sections.join(", ")}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
