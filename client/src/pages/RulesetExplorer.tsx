import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { GlassPanel, StatCard, ThreatBadge, RawJsonViewer, RefreshControl } from "@/components/shared";
import { BrokerWarnings } from "@/components/shared/BrokerWarnings";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { WazuhGuard } from "@/components/shared/WazuhGuard";
import { trpc } from "@/lib/trpc";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  Search, Shield, FileText, Terminal, ChevronDown, ChevronRight,
  ExternalLink, Copy, X, BookOpen, Code, Filter, Layers,
  AlertTriangle, Eye, Hash, Cpu, Database, Globe, Activity,
  ChevronUp, Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────
type WazuhRule = {
  id: number;
  level: number;
  description: string;
  groups: string[];
  mitre: { id: string[]; tactic: string[]; technique: string[] };
  pci_dss: string[];
  gdpr: string[];
  hipaa: string[];
  filename: string;
  relative_dirname: string;
  status: string;
  details: Record<string, string>;
};

type WazuhDecoder = {
  name: string;
  position: number;
  status: string;
  file: string;
  path: string;
  details: Record<string, string>;
  relative_dirname: string;
};

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

const CHART_COLORS = [
  "oklch(0.72 0.19 295)",
  "oklch(0.637 0.237 25.331)",
  "oklch(0.705 0.191 22.216)",
  "oklch(0.795 0.184 86.047)",
  "oklch(0.765 0.177 163.223)",
  "oklch(0.789 0.154 211.53)",
  "oklch(0.65 0.2 260)",
  "oklch(0.7 0.15 320)",
];

type TabType = "rules" | "decoders" | "rulesFiles" | "decoderFiles" | "cdbLists";

// ─── View Source File Button ────────────────────────────────────────────────
function ViewSourceButton({ type, filename }: { type: "rules" | "decoders"; filename: string }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fileQ = type === "rules"
    ? trpc.wazuh.ruleFileContent.useQuery({ filename }, { enabled: open })
    : trpc.wazuh.decoderFileContent.useQuery({ filename }, { enabled: open });

  useEffect(() => {
    if (fileQ.data) {
      const raw = fileQ.data as Record<string, unknown>;
      const data = raw?.data as Record<string, unknown> | undefined;
      const items = data?.affected_items as string[] | undefined;
      setContent(items?.[0] ?? JSON.stringify(raw, null, 2));
      setLoading(false);
    }
    if (fileQ.isLoading) setLoading(true);
  }, [fileQ.data, fileQ.isLoading]);

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors"
      >
        <FileText className="h-3.5 w-3.5" />
        {open ? "Hide Source" : "View Source File"}
      </button>
      {open && (
        <div className="mt-2 relative">
          {loading ? (
            <div className="py-4 text-center text-xs text-slate-500">Loading source file...</div>
          ) : (
            <div className="relative">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(content ?? "");
                  toast.success("Source copied to clipboard");
                }}
                className="absolute top-2 right-2 p-1 rounded bg-white/5 hover:bg-white/10 text-slate-500 hover:text-violet-300 transition-colors z-10"
                title="Copy source"
              >
                <Copy className="h-3 w-3" />
              </button>
              <pre className="text-[11px] text-slate-200 bg-black/40 rounded-lg px-4 py-3 font-mono overflow-x-auto max-h-[400px] overflow-y-auto whitespace-pre-wrap break-all border border-white/5">
                {content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RulesetExplorer() {
  // ─── State ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabType>("rules");
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [expandedRule, setExpandedRule] = useState<number | null>(null);
  const [expandedDecoder, setExpandedDecoder] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState<number | string | null>(null);
  const [sortField, setSortField] = useState<"id" | "level">("level");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showComplianceFilters, setShowComplianceFilters] = useState(false);
  const [filenameFilter, setFilenameFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Compliance framework filters — each holds a requirement string or empty
  const [pciDssFilter, setPciDssFilter] = useState("");
  const [gdprFilter, setGdprFilter] = useState("");
  const [hipaaFilter, setHipaaFilter] = useState("");
  const [nist80053Filter, setNist80053Filter] = useState("");
  const [tscFilter, setTscFilter] = useState("");
  const [gpg13Filter, setGpg13Filter] = useState("");
  const [mitreFilter, setMitreFilter] = useState("");

  // ─── Debounce (300ms) for text inputs to reduce Wazuh API calls ──────────
  function useDebounced<T>(value: T, delayMs = 300): T {
    const [debounced, setDebounced] = useState(value);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    useEffect(() => {
      timer.current = setTimeout(() => setDebounced(value), delayMs);
      return () => clearTimeout(timer.current);
    }, [value, delayMs]);
    return debounced;
  }

  const debouncedSearch = useDebounced(searchQuery);
  const debouncedPciDss = useDebounced(pciDssFilter);
  const debouncedGdpr = useDebounced(gdprFilter);
  const debouncedHipaa = useDebounced(hipaaFilter);
  const debouncedNist80053 = useDebounced(nist80053Filter);
  const debouncedTsc = useDebounced(tscFilter);
  const debouncedGpg13 = useDebounced(gpg13Filter);
  const debouncedMitre = useDebounced(mitreFilter);

  // ─── API Queries ─────────────────────────────────────────────────────────
  const statusQ = trpc.wazuh.status.useQuery();
  const isConfigured = !!(statusQ.data as Record<string, unknown>)?.configured;

  // ─── Server-side query params (broker-wired, using debounced values) ──────
  const rulesQueryParams = useMemo(() => {
    const params: Record<string, unknown> = { limit: 500, offset: 0 };

    // Sort — server-side via broker
    if (sortField && sortDir) {
      params.sort = `${sortDir === "desc" ? "-" : "+"}${sortField === "id" ? "id" : "level"}`;
    }

    // Search — debounced, forwarded as native Wazuh search (not q=name~)
    if (debouncedSearch.trim()) {
      params.search = debouncedSearch.trim();
    }

    // Group filter — server-side
    if (groupFilter !== "all") {
      params.group = groupFilter;
    }

    // Filename filter — server-side
    if (filenameFilter !== "all") {
      params.filename = filenameFilter;
    }

    // Status filter — server-side
    if (statusFilter !== "all") {
      params.status = statusFilter;
    }

    // Compliance filters — debounced, server-side via broker
    if (debouncedPciDss) params.pci_dss = debouncedPciDss;
    if (debouncedGdpr) params.gdpr = debouncedGdpr;
    if (debouncedHipaa) params.hipaa = debouncedHipaa;
    if (debouncedNist80053) params["nist-800-53"] = debouncedNist80053;
    if (debouncedTsc) params.tsc = debouncedTsc;
    if (debouncedGpg13) params.gpg13 = debouncedGpg13;
    if (debouncedMitre) params.mitre = debouncedMitre;

    return params;
  }, [sortField, sortDir, debouncedSearch, groupFilter, filenameFilter, statusFilter, debouncedPciDss, debouncedGdpr, debouncedHipaa, debouncedNist80053, debouncedTsc, debouncedGpg13, debouncedMitre]);

  const rulesQ = trpc.wazuh.rules.useQuery(
    rulesQueryParams as any,
    { enabled: isConfigured, placeholderData: (prev: unknown) => prev }
  );
  const decodersQ = trpc.wazuh.decoders.useQuery(
    { limit: 500, offset: 0 },
    { enabled: isConfigured }
  );
  const ruleGroupsQ = trpc.wazuh.ruleGroups.useQuery(undefined, {
    enabled: isConfigured,
  });

  // ─── New file-level queries (Task 4: Ruleset File Content) ──────────────
  const rulesFilesQ = trpc.wazuh.rulesFiles.useQuery(
    { limit: 500, offset: 0 },
    { enabled: isConfigured && activeTab === "rulesFiles" }
  );
  const decoderFilesQ = trpc.wazuh.decoderFiles.useQuery(
    { limit: 500, offset: 0 },
    { enabled: isConfigured && activeTab === "decoderFiles" }
  );
  const listsQ = trpc.wazuh.lists.useQuery(
    { limit: 500, offset: 0 },
    { enabled: isConfigured && activeTab === "cdbLists" }
  );
  const listsFilesQ = trpc.wazuh.listsFiles.useQuery(
    { limit: 500, offset: 0 },
    { enabled: isConfigured && activeTab === "cdbLists" }
  );

  // ─── CDB List file viewer state ────────────────────────────────────────
  const [cdbFileToView, setCdbFileToView] = useState<string | null>(null);
  const cdbFileContentQ = trpc.wazuh.listsFileContent.useQuery(
    { filename: cdbFileToView ?? "" },
    { enabled: !!cdbFileToView }
  );

  // ─── Data ────────────────────────────────────────────────────────────────
  const rulesRaw = rulesQ.data ?? { data: { affected_items: [] } };
  const decodersRaw = decodersQ.data ?? { data: { affected_items: [] } };
  const ruleGroupsRaw = ruleGroupsQ.data ?? { data: { affected_items: [] } };

  const rules: WazuhRule[] = ((
    (rulesRaw as Record<string, unknown>)?.data as Record<string, unknown> | undefined
  )?.affected_items as Array<Record<string, unknown>> ?? []).map((r): WazuhRule => ({
    id: Number(r.id ?? 0),
    level: Number(r.level ?? 0),
    description: String(r.description ?? ""),
    groups: Array.isArray(r.groups) ? r.groups as string[] : [],
    mitre: {
      id: Array.isArray((r.mitre as Record<string, unknown>)?.id) ? (r.mitre as Record<string, unknown>).id as string[] : [],
      tactic: Array.isArray((r.mitre as Record<string, unknown>)?.tactic) ? (r.mitre as Record<string, unknown>).tactic as string[] : [],
      technique: Array.isArray((r.mitre as Record<string, unknown>)?.technique) ? (r.mitre as Record<string, unknown>).technique as string[] : [],
    },
    pci_dss: Array.isArray(r.pci_dss) ? r.pci_dss as string[] : [],
    gdpr: Array.isArray(r.gdpr) ? r.gdpr as string[] : [],
    hipaa: Array.isArray(r.hipaa) ? r.hipaa as string[] : [],
    filename: String(r.filename ?? ""),
    relative_dirname: String(r.relative_dirname ?? ""),
    status: String(r.status ?? ""),
    details: (r.details as Record<string, string>) ?? {},
  }));

  const decoders: WazuhDecoder[] = ((
    (decodersRaw as Record<string, unknown>)?.data as Record<string, unknown> | undefined
  )?.affected_items as Array<Record<string, unknown>> ?? []).map((d): WazuhDecoder => ({
    name: String(d.name ?? ""),
    position: Number(d.position ?? 0),
    status: String(d.status ?? "unknown"),
    file: String(d.file ?? ""),
    path: String(d.path ?? ""),
    details: (d.details as Record<string, string>) ?? {},
    relative_dirname: String(d.relative_dirname ?? ""),
  }));

  const ruleGroups: string[] = ((
    (ruleGroupsRaw as Record<string, unknown>)?.data as Record<string, unknown> | undefined
  )?.affected_items as unknown[] ?? []).map((g) => String(g ?? "")).filter(Boolean);

  // ─── Filtering: Rules (client-side refinement for severity bucket) ───────
  const filteredRules = useMemo(() => {
    let result = [...rules];

    // Level/severity is a client-side bucket filter since Wazuh level is numeric
    // and our severity mapping (critical/high/medium/low/info) is app-defined
    if (levelFilter !== "all") {
      const severity = levelFilter;
      result = result.filter((r) => LEVEL_TO_SEVERITY(r.level) === severity);
    }

    return result;
  }, [rules, levelFilter]);

  // ─── Filtering: Decoders ─────────────────────────────────────────────────
  const filteredDecoders = useMemo(() => {
    if (!searchQuery) return decoders;
    const q = searchQuery.toLowerCase();
    return decoders.filter(
      (d) =>
        (d.name || "").toLowerCase().includes(q) ||
        (d.file || "").toLowerCase().includes(q) ||
        (d.details?.parent ?? "").toLowerCase().includes(q) ||
        (d.details?.prematch ?? "").toLowerCase().includes(q)
    );
  }, [decoders, searchQuery]);

  // ─── Computed Stats ──────────────────────────────────────────────────────
  const ruleStats = useMemo(() => {
    const levelCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    const groupCounts: Record<string, number> = {};
    const fileCounts: Record<string, number> = {};

    rules.forEach((r) => {
      levelCounts[LEVEL_TO_SEVERITY(r.level)]++;
      r.groups.forEach((g) => {
        groupCounts[g] = (groupCounts[g] || 0) + 1;
      });
      fileCounts[r.filename] = (fileCounts[r.filename] || 0) + 1;
    });

    return { levelCounts, groupCounts, fileCounts };
  }, [rules]);

  const decoderStats = useMemo(() => {
    const fileCounts: Record<string, number> = {};
    const parentCounts: Record<string, number> = {};

    decoders.forEach((d) => {
      const fname = d.file || "unknown";
      fileCounts[fname] = (fileCounts[fname] || 0) + 1;
      const parent = d.details?.parent ?? "root";
      parentCounts[parent] = (parentCounts[parent] || 0) + 1;
    });

    return { fileCounts, parentCounts };
  }, [decoders]);

  const levelPieData = Object.entries(ruleStats.levelCounts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: k.charAt(0).toUpperCase() + k.slice(1), value: v, color: SEVERITY_COLORS[k] }));

  const topGroups = Object.entries(ruleStats.groupCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([k, v]) => ({ name: k, count: v }));

  const decoderFileData = Object.entries(decoderStats.fileCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([k, v]) => ({ name: k.replace(/^\d+-/, "").replace(/_decoders\.xml$/, ""), count: v }));

  const mitreRuleCount = rules.filter((r) => r.mitre.id.length > 0).length;
  const complianceRuleCount = rules.filter((r) => r.pci_dss.length > 0 || r.gdpr.length > 0 || r.hipaa.length > 0).length;

  // ─── Unique filenames for dropdown ────────────────────────────────────────
  const ruleFilenames = useMemo(() => {
    const fnames = new Set<string>();
    rules.forEach((r) => { if (r.filename) fnames.add(r.filename); });
    return Array.from(fnames).sort();
  }, [rules]);

  const clearFilters = () => {
    setSearchQuery("");
    setLevelFilter("all");
    setGroupFilter("all");
    setFilenameFilter("all");
    setStatusFilter("all");
    setPciDssFilter("");
    setGdprFilter("");
    setHipaaFilter("");
    setNist80053Filter("");
    setTscFilter("");
    setGpg13Filter("");
    setMitreFilter("");
  };

  const complianceFiltersActive = [pciDssFilter, gdprFilter, hipaaFilter, nist80053Filter, tscFilter, gpg13Filter, mitreFilter].filter(Boolean).length;
  const activeFilters = [levelFilter, groupFilter, filenameFilter, statusFilter].filter((f) => f !== "all").length + complianceFiltersActive + (searchQuery.trim() ? 1 : 0);

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-6 max-w-[2400px] mx-auto">
      <WazuhGuard><div /></WazuhGuard>
      <PageHeader
        title="Ruleset Explorer"
        subtitle="Search, filter, and inspect Wazuh rule definitions and decoder logic"
      >
        <RefreshControl
          onRefresh={() => {
            rulesQ.refetch();
            decodersQ.refetch();
            ruleGroupsQ.refetch();
          }}
        />
      </PageHeader>

      {/* ── KPI Row ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Total Rules" value={rules.length} icon={Shield} />
        <StatCard label="Total Decoders" value={decoders.length} icon={Code} />
        <StatCard
          label="Critical Rules"
          value={ruleStats.levelCounts.critical}
          icon={AlertTriangle}
          colorClass="text-red-400"
          className="border-red-500/20"
        />
        <StatCard
          label="High Rules"
          value={ruleStats.levelCounts.high}
          icon={AlertTriangle}
          colorClass="text-orange-400"
          className="border-orange-500/20"
        />
        <StatCard
          label="MITRE Mapped"
          value={mitreRuleCount}
          icon={Activity}
          colorClass="text-violet-400"
        />
        <StatCard
          label="Compliance Mapped"
          value={complianceRuleCount}
          icon={BookOpen}
          colorClass="text-emerald-400"
        />
      </div>

      {/* ── Charts Row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Rule Level Distribution */}
        <GlassPanel>
          <h3 className="text-sm font-semibold text-violet-300 mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4" /> Rule Severity Distribution
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={levelPieData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={3}
                dataKey="value"
              >
                {levelPieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <RTooltip
                contentStyle={{
                  background: "#1e1b4b",
                  border: "1px solid #7c3aed40",
                  borderRadius: 8,
                  color: "#e2e8f0",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            {levelPieData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-1.5 text-[10px]">
                <div className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
                <span className="text-slate-400">{entry.name}</span>
                <span className="text-slate-300 font-mono">{entry.value}</span>
              </div>
            ))}
          </div>
        </GlassPanel>

        {/* Top Rule Groups */}
        <GlassPanel>
          <h3 className="text-sm font-semibold text-violet-300 mb-3 flex items-center gap-2">
            <Layers className="h-4 w-4" /> Top Rule Groups
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topGroups} layout="vertical">
              <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                width={100}
              />
              <RTooltip
                contentStyle={{
                  background: "#1e1b4b",
                  border: "1px solid #7c3aed40",
                  borderRadius: 8,
                  color: "#e2e8f0",
                }}
              />
              <Bar dataKey="count" fill="oklch(0.72 0.19 295)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </GlassPanel>

        {/* Decoder Files */}
        <GlassPanel>
          <h3 className="text-sm font-semibold text-violet-300 mb-3 flex items-center gap-2">
            <Code className="h-4 w-4" /> Decoder Distribution
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={decoderFileData} layout="vertical">
              <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                width={100}
              />
              <RTooltip
                contentStyle={{
                  background: "#1e1b4b",
                  border: "1px solid #7c3aed40",
                  borderRadius: 8,
                  color: "#e2e8f0",
                }}
              />
              <Bar dataKey="count" fill="oklch(0.65 0.2 260)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </GlassPanel>
      </div>

      {/* ── Tab Switcher + Search/Filters ─────────────────────────────────── */}
      <GlassPanel className="space-y-4">
        {/* Tabs */}
        <div className="flex items-center gap-4 border-b border-white/10 pb-3">
          <button
            onClick={() => setActiveTab("rules")}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === "rules"
                ? "bg-violet-500/20 text-violet-300 border-b-2 border-violet-400"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Shield className="h-4 w-4" />
            Rules ({rules.length})
          </button>
          <button
            onClick={() => setActiveTab("decoders")}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === "decoders"
                ? "bg-violet-500/20 text-violet-300 border-b-2 border-violet-400"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Code className="h-4 w-4" />
            Decoders ({decoders.length})
          </button>
          <button
            onClick={() => setActiveTab("rulesFiles")}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === "rulesFiles"
                ? "bg-violet-500/20 text-violet-300 border-b-2 border-violet-400"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <FileText className="h-4 w-4" />
            Rule Files
          </button>
          <button
            onClick={() => setActiveTab("decoderFiles")}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === "decoderFiles"
                ? "bg-violet-500/20 text-violet-300 border-b-2 border-violet-400"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Terminal className="h-4 w-4" />
            Decoder Files
          </button>
          <button
            onClick={() => setActiveTab("cdbLists")}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === "cdbLists"
                ? "bg-violet-500/20 text-violet-300 border-b-2 border-violet-400"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Database className="h-4 w-4" />
            CDB Lists
          </button>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder={
                activeTab === "rules"
                  ? "Search rules by ID, description, group, MITRE..."
                  : "Search decoders by name, file, parent..."
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30"
            />
          </div>

          {activeTab === "rules" && (
            <>
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-violet-500/50"
              >
                <option value="all">All Levels</option>
                <option value="critical">Critical (14-16)</option>
                <option value="high">High (10-13)</option>
                <option value="medium">Medium (7-9)</option>
                <option value="low">Low (4-6)</option>
                <option value="info">Info (0-3)</option>
              </select>

              <select
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-violet-500/50 max-w-[200px]"
              >
                <option value="all">All Groups</option>
                {ruleGroups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>

              <select
                value={filenameFilter}
                onChange={(e) => setFilenameFilter(e.target.value)}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-violet-500/50 max-w-[180px]"
              >
                <option value="all">All Files</option>
                {ruleFilenames.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-violet-500/50"
              >
                <option value="all">All Status</option>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>

              <button
                onClick={() => setShowComplianceFilters(!showComplianceFilters)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${
                  showComplianceFilters || complianceFiltersActive > 0
                    ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                    : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/20"
                }`}
              >
                <Scale className="h-3.5 w-3.5" />
                Compliance
                {complianceFiltersActive > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 bg-violet-500/30 rounded-full text-[10px] font-bold">
                    {complianceFiltersActive}
                  </span>
                )}
                {showComplianceFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </>
          )}

          {activeFilters > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="text-xs bg-transparent border-white/10 text-slate-300 hover:bg-white/10"
            >
              <X className="h-3 w-3 mr-1" />
              Clear ({activeFilters})
            </Button>
          )}

          {activeTab === "rules" && (
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => {
                  if (sortField === "level") setSortDir(sortDir === "desc" ? "asc" : "desc");
                  else { setSortField("level"); setSortDir("desc"); }
                }}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  sortField === "level" ? "bg-violet-500/20 text-violet-300" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Level {sortField === "level" && (sortDir === "desc" ? "↓" : "↑")}
              </button>
              <button
                onClick={() => {
                  if (sortField === "id") setSortDir(sortDir === "desc" ? "asc" : "desc");
                  else { setSortField("id"); setSortDir("desc"); }
                }}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  sortField === "id" ? "bg-violet-500/20 text-violet-300" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Rule ID {sortField === "id" && (sortDir === "desc" ? "↓" : "↑")}
              </button>
            </div>
          )}
        </div>

        {/* Compliance Filter Panel */}
        {activeTab === "rules" && showComplianceFilters && (
          <div className="mt-3 p-4 bg-white/[0.03] border border-white/10 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-violet-300 uppercase tracking-wider">Compliance Framework Filters</h4>
              <span className="text-[10px] text-slate-500">Enter a requirement ID to filter (e.g., "10.6.1" for PCI DSS)</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
              {[
                { label: "PCI DSS", value: pciDssFilter, setter: setPciDssFilter, placeholder: "e.g. 10.6.1",
                  labelClass: "text-blue-400", activeClass: "border-blue-500/40 focus:border-blue-500/60 ring-1 ring-blue-500/20" },
                { label: "GDPR", value: gdprFilter, setter: setGdprFilter, placeholder: "e.g. IV_35.7.d",
                  labelClass: "text-emerald-400", activeClass: "border-emerald-500/40 focus:border-emerald-500/60 ring-1 ring-emerald-500/20" },
                { label: "HIPAA", value: hipaaFilter, setter: setHipaaFilter, placeholder: "e.g. 164.312.b",
                  labelClass: "text-amber-400", activeClass: "border-amber-500/40 focus:border-amber-500/60 ring-1 ring-amber-500/20" },
                { label: "NIST 800-53", value: nist80053Filter, setter: setNist80053Filter, placeholder: "e.g. AU.6",
                  labelClass: "text-cyan-400", activeClass: "border-cyan-500/40 focus:border-cyan-500/60 ring-1 ring-cyan-500/20" },
                { label: "TSC", value: tscFilter, setter: setTscFilter, placeholder: "e.g. CC7.2",
                  labelClass: "text-rose-400", activeClass: "border-rose-500/40 focus:border-rose-500/60 ring-1 ring-rose-500/20" },
                { label: "GPG13", value: gpg13Filter, setter: setGpg13Filter, placeholder: "e.g. 4.12",
                  labelClass: "text-orange-400", activeClass: "border-orange-500/40 focus:border-orange-500/60 ring-1 ring-orange-500/20" },
                { label: "MITRE", value: mitreFilter, setter: setMitreFilter, placeholder: "e.g. T1110",
                  labelClass: "text-purple-400", activeClass: "border-purple-500/40 focus:border-purple-500/60 ring-1 ring-purple-500/20" },
              ].map(({ label, value, setter, placeholder, labelClass, activeClass }) => (
                <div key={label} className="space-y-1">
                  <label className={`text-[10px] font-semibold uppercase tracking-wider ${labelClass}`}>{label}</label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    placeholder={placeholder}
                    className={`w-full px-2.5 py-1.5 bg-white/5 border rounded text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none transition-colors ${
                      value ? activeClass : "border-white/10 focus:border-violet-500/50"
                    }`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Result count + loading indicator */}
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {rulesQ.isFetching && (
            <div className="h-3 w-3 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
          )}
          {activeTab === "rules"
            ? `${filteredRules.length} rules found${complianceFiltersActive > 0 ? " (compliance-filtered)" : ""}`
            : `${filteredDecoders.length} decoders found`}
        </div>
      </GlassPanel>      {/* ── Rules Table ─────────────────────────────────────────────────────────── */}
      {activeTab === "rules" && (
        <GlassPanel className="overflow-hidden">
          <BrokerWarnings data={rulesQ.data} context="Rules" />
          {rulesQ.isLoading ? (         <TableSkeleton columns={7} rows={12} columnWidths={[1, 1, 4, 2, 1, 1, 1]} />
          ) : (<>
          {/* Header */}
          <div className="grid grid-cols-[60px_60px_1fr_150px_120px_100px_60px] gap-3 px-4 py-2.5 bg-white/5 border-b border-white/10 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            <span>Level</span>
            <span>ID</span>
            <span>Description</span>
            <span>Groups</span>
            <span>MITRE</span>
            <span>File</span>
            <span></span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto">
            {filteredRules.map((rule) => {
              const severity = LEVEL_TO_SEVERITY(rule.level);
              const isExpanded = expandedRule === rule.id;

              return (
                <div key={rule.id}>
                  <div
                    className={`grid grid-cols-[60px_60px_1fr_150px_120px_100px_60px] gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      isExpanded ? "bg-violet-500/10" : "hover:bg-white/5"
                    }`}
                    onClick={() => setExpandedRule(isExpanded ? null : rule.id)}
                  >
                    {/* Level */}
                    <div className="flex items-center">
                      <span
                        className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                        style={{
                          background: `${SEVERITY_COLORS[severity]}20`,
                          color: SEVERITY_COLORS[severity],
                          border: `1px solid ${SEVERITY_COLORS[severity]}40`,
                        }}
                      >
                        {rule.level}
                      </span>
                    </div>

                    {/* ID */}
                    <div className="flex items-center text-xs font-mono text-violet-300">
                      {rule.id}
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
                      <span className="truncate text-sm text-slate-200">{rule.description}</span>
                    </div>

                    {/* Groups */}
                    <div className="flex items-center flex-wrap gap-1">
                      {rule.groups.slice(0, 2).map((g) => (
                        <span
                          key={g}
                          className="px-1.5 py-0.5 bg-white/5 rounded text-[10px] font-mono text-slate-400 truncate max-w-[60px]"
                          title={g}
                        >
                          {g}
                        </span>
                      ))}
                      {rule.groups.length > 2 && (
                        <span className="text-[10px] text-slate-500">+{rule.groups.length - 2}</span>
                      )}
                    </div>

                    {/* MITRE */}
                    <div className="flex items-center flex-wrap gap-1">
                      {rule.mitre.id.length > 0 ? (
                        rule.mitre.id.slice(0, 2).map((id) => (
                          <span
                            key={id}
                            className="px-1.5 py-0.5 bg-violet-500/20 text-violet-300 rounded text-[10px] font-mono"
                          >
                            {id}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-slate-600">—</span>
                      )}
                    </div>

                    {/* File */}
                    <div className="flex items-center text-[10px] text-slate-500 font-mono truncate" title={rule.filename}>
                      {rule.filename.replace(/^\d+-/, "").replace(/_rules\.xml$/, "")}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowRawJson(showRawJson === rule.id ? null : rule.id);
                        }}
                        className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-violet-300 transition-colors"
                        title="View raw JSON"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(JSON.stringify(rule, null, 2));
                          toast.success("Rule JSON copied");
                        }}
                        className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-violet-300 transition-colors"
                        title="Copy JSON"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Rule Detail */}
                  {isExpanded && (
                    <div className="px-4 py-4 bg-violet-500/5 border-t border-violet-500/20 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Rule Details */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-violet-300">Rule Definition</h4>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Rule ID</span>
                              <span className="font-mono text-slate-200">{rule.id}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Level</span>
                              <ThreatBadge level={severity as "critical" | "high" | "medium" | "low" | "info"} />
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Status</span>
                              <span className="font-mono text-emerald-400">{rule.status}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">File</span>
                              <span className="font-mono text-slate-200 text-right truncate max-w-[180px]">{rule.filename}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Path</span>
                              <span className="font-mono text-slate-200">{rule.relative_dirname}</span>
                            </div>
                          </div>
                        </div>

                        {/* Match Logic */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-violet-300">Match Logic</h4>
                          <div className="space-y-1.5 text-xs">
                            {Object.entries(rule.details || {}).map(([key, val]) => (
                              <div key={key} className="flex justify-between gap-2">
                                <span className="text-slate-500 flex-shrink-0">{key}</span>
                                <span className="font-mono text-slate-200 text-right break-all">{typeof val === "object" && val !== null ? JSON.stringify(val) : String(val)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2">
                            <span className="text-slate-500 text-xs">Groups</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {rule.groups.map((g) => (
                                <span
                                  key={g}
                                  className="px-1.5 py-0.5 bg-white/5 rounded text-[10px] font-mono text-slate-400 cursor-pointer hover:bg-white/10"
                                  onClick={() => { setGroupFilter(g); setActiveTab("rules"); }}
                                >
                                  {g}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Compliance & MITRE */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-violet-300">Compliance & MITRE</h4>
                          <div className="space-y-1 text-xs">
                            {rule.mitre.id.length > 0 && (
                              <div>
                                <span className="text-slate-500">MITRE ATT&CK</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {rule.mitre.id.map((id) => (
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
                                  {rule.mitre.tactic.map((t) => (
                                    <span key={t} className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-[10px]">
                                      {t}
                                    </span>
                                  ))}
                                </div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {rule.mitre.technique.map((t) => (
                                    <span key={t} className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded text-[10px]">
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {rule.pci_dss.length > 0 && (
                              <div className="flex items-start gap-2 mt-1">
                                <span className="text-slate-500 flex-shrink-0">PCI DSS</span>
                                <div className="flex flex-wrap gap-1">
                                  {rule.pci_dss.map((p) => (
                                    <span key={p} className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded text-[10px] font-mono">{p}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {rule.gdpr.length > 0 && (
                              <div className="flex items-start gap-2">
                                <span className="text-slate-500 flex-shrink-0">GDPR</span>
                                <div className="flex flex-wrap gap-1">
                                  {rule.gdpr.map((g) => (
                                    <span key={g} className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded text-[10px] font-mono">{g}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {rule.hipaa.length > 0 && (
                              <div className="flex items-start gap-2">
                                <span className="text-slate-500 flex-shrink-0">HIPAA</span>
                                <div className="flex flex-wrap gap-1">
                                  {rule.hipaa.map((h) => (
                                    <span key={h} className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded text-[10px] font-mono">{h}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* View Source File */}
                      <ViewSourceButton type="rules" filename={rule.filename} />
                    </div>
                  )}

                  {/* Raw JSON Panel */}
                  {showRawJson === rule.id && (                    <div className="px-4 py-3 bg-black/20 border-t border-white/5">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-semibold text-violet-300">Raw Rule JSON</h4>
                        <button onClick={() => setShowRawJson(null)} className="text-slate-500 hover:text-slate-300">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <RawJsonViewer data={rule as unknown as Record<string, unknown>} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {filteredRules.length === 0 && (
            <div className="py-12 text-center text-slate-500">
              <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No rules match your filters</p>
            </div>
          )}
          </>)}
        </GlassPanel>
      )}

      {/* ── Decoders Table ────────────────────────────────────────────────── */}
      {activeTab === "decoders" && (
        <GlassPanel className="overflow-hidden">
          <BrokerWarnings data={decodersQ.data} context="Decoders" />
          {decodersQ.isLoading ? (
            <TableSkeleton columns={6} rows={12} columnWidths={[2, 1, 3, 2, 1, 1]} />
          ) : (<>
          {/* Header */}
          <div className="grid grid-cols-[180px_80px_1fr_200px_120px_60px] gap-3 px-4 py-2.5 bg-white/5 border-b border-white/10 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            <span>Name</span>
            <span>Position</span>
            <span>Pattern / Logic</span>
            <span>File</span>
            <span>Status</span>
            <span></span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto">
            {filteredDecoders.map((decoder) => {
              const isExpanded = expandedDecoder === decoder.name;

              return (
                <div key={`${decoder.name}-${decoder.position}`}>
                  <div
                    className={`grid grid-cols-[180px_80px_1fr_200px_120px_60px] gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      isExpanded ? "bg-violet-500/10" : "hover:bg-white/5"
                    }`}
                    onClick={() => setExpandedDecoder(isExpanded ? null : decoder.name)}
                  >
                    {/* Name */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-violet-400" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                        )}
                      </div>
                      <span className="font-mono text-sm text-violet-300 truncate">{decoder.name}</span>
                    </div>

                    {/* Position */}
                    <div className="flex items-center text-xs font-mono text-slate-400">
                      {decoder.position}
                    </div>

                    {/* Pattern */}
                    <div className="flex items-center min-w-0">
                      <span className="text-xs text-slate-300 font-mono truncate">
                        {(() => {
                          const v = decoder.details?.prematch || decoder.details?.regex || decoder.details?.plugin_decoder;
                          if (!v) return "—";
                          return typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
                        })()}
                      </span>
                    </div>

                    {/* File */}
                    <div className="flex items-center text-xs text-slate-500 font-mono truncate" title={decoder.file}>
                      {decoder.file}
                    </div>

                    {/* Status */}
                    <div className="flex items-center">
                      <span className={`text-xs font-mono ${decoder.status === "enabled" ? "text-emerald-400" : "text-slate-500"}`}>
                        {decoder.status}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(JSON.stringify(decoder, null, 2));
                          toast.success("Decoder JSON copied");
                        }}
                        className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-violet-300 transition-colors"
                        title="Copy JSON"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Decoder Detail */}
                  {isExpanded && (
                    <div className="px-4 py-4 bg-violet-500/5 border-t border-violet-500/20 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Decoder Info */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-violet-300">Decoder Definition</h4>
                          <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between">
                              <span className="text-slate-500">Name</span>
                              <span className="font-mono text-violet-300">{decoder.name}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Position</span>
                              <span className="font-mono text-slate-200">{decoder.position}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">File</span>
                              <span className="font-mono text-slate-200">{decoder.file}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Path</span>
                              <span className="font-mono text-slate-200">{decoder.relative_dirname}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Status</span>
                              <span className={`font-mono ${decoder.status === "enabled" ? "text-emerald-400" : "text-red-400"}`}>
                                {decoder.status}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Extraction Logic */}
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-violet-300">Extraction Logic</h4>
                          <div className="space-y-1.5 text-xs">
                            {Object.entries(decoder.details || {}).map(([key, val]) => (
                              <div key={key}>
                                <span className="text-slate-500 block mb-0.5">{key}</span>
                                <pre className="text-[11px] text-slate-200 bg-black/30 rounded px-2 py-1 font-mono overflow-x-auto whitespace-pre-wrap break-all border border-white/5">
                                  {typeof val === "object" && val !== null ? JSON.stringify(val) : String(val)}
                                </pre>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Parent decoder chain */}
                      {decoder.details?.parent && (
                        <div>
                          <h4 className="text-xs font-semibold text-violet-300 mb-2">Decoder Chain</h4>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded font-mono">
                              {typeof decoder.details.parent === "object" && decoder.details.parent !== null ? JSON.stringify(decoder.details.parent) : String(decoder.details.parent)}
                            </span>
                            <span className="text-slate-500">→</span>
                            <span className="px-2 py-1 bg-violet-500/20 text-violet-300 rounded font-mono">
                              {decoder.name}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* View Source File */}
                      <ViewSourceButton type="decoders" filename={decoder.file} />

                      {/* Raw JSON */}
                      <div>
                        <h4 className="text-xs font-semibold text-violet-300 mb-2">Raw Decoder JSON</h4>
                        <RawJsonViewer data={decoder as unknown as Record<string, unknown>} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {filteredDecoders.length === 0 && (
            <div className="py-12 text-center text-slate-500">
              <Code className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No decoders match your search</p>
            </div>
          )}
          </>)}
        </GlassPanel>
      )}

      {/* ── Rule Files Tab ──────────────────────────────────────────────── */}
      {activeTab === "rulesFiles" && (
        <GlassPanel>
          <BrokerWarnings data={rulesFilesQ.data} context="rulesFiles" />
          <h3 className="text-sm font-semibold text-violet-300 mb-3">Rule Files</h3>
          {rulesFilesQ.isLoading ? (
            <TableSkeleton columns={3} rows={10} />
          ) : (() => {
            const items = ((rulesFilesQ.data as any)?.data?.affected_items ?? []) as Array<Record<string, unknown>>;
            return items.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No rule files found</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-500 uppercase border-b border-white/10">
                        <th className="py-2 px-3">Filename</th>
                        <th className="py-2 px-3">Relative Path</th>
                        <th className="py-2 px-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((f, i) => (
                        <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                          <td className="py-2 px-3 font-mono text-xs text-violet-300">{String(f.filename ?? "")}</td>
                          <td className="py-2 px-3 font-mono text-xs text-slate-400">{String(f.relative_dirname ?? "")}</td>
                          <td className="py-2 px-3">
                            <ViewSourceButton type="rules" filename={String(f.filename ?? "")} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <RawJsonViewer data={rulesFilesQ.data} title="rulesFiles" />
              </>
            );
          })()}
        </GlassPanel>
      )}

      {/* ── Decoder Files Tab ──────────────────────────────────────────── */}
      {activeTab === "decoderFiles" && (
        <GlassPanel>
          <BrokerWarnings data={decoderFilesQ.data} context="decoderFiles" />
          <h3 className="text-sm font-semibold text-violet-300 mb-3">Decoder Files</h3>
          {decoderFilesQ.isLoading ? (
            <TableSkeleton columns={3} rows={10} />
          ) : (() => {
            const items = ((decoderFilesQ.data as any)?.data?.affected_items ?? []) as Array<Record<string, unknown>>;
            return items.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                <Terminal className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No decoder files found</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-500 uppercase border-b border-white/10">
                        <th className="py-2 px-3">Filename</th>
                        <th className="py-2 px-3">Relative Path</th>
                        <th className="py-2 px-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((f, i) => (
                        <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                          <td className="py-2 px-3 font-mono text-xs text-violet-300">{String(f.filename ?? "")}</td>
                          <td className="py-2 px-3 font-mono text-xs text-slate-400">{String(f.relative_dirname ?? "")}</td>
                          <td className="py-2 px-3">
                            <ViewSourceButton type="decoders" filename={String(f.filename ?? "")} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <RawJsonViewer data={decoderFilesQ.data} title="decoderFiles" />
              </>
            );
          })()}
        </GlassPanel>
      )}

      {/* ── CDB Lists Tab ──────────────────────────────────────────────── */}
      {activeTab === "cdbLists" && (
        <>
          <GlassPanel>
            <BrokerWarnings data={listsQ.data} context="lists" />
            <h3 className="text-sm font-semibold text-violet-300 mb-3">CDB Lists</h3>
            {listsQ.isLoading ? (
              <TableSkeleton columns={3} rows={8} />
            ) : (() => {
              const items = ((listsQ.data as any)?.data?.affected_items ?? []) as Array<Record<string, unknown>>;
              return items.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <Database className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No CDB lists found</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-500 uppercase border-b border-white/10">
                          <th className="py-2 px-3">Relative Path</th>
                          <th className="py-2 px-3">Items</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((l, i) => (
                          <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                            <td className="py-2 px-3 font-mono text-xs text-violet-300">{String(l.relative_dirname ?? "")}/{String(l.filename ?? "")}</td>
                            <td className="py-2 px-3 font-mono text-xs text-slate-400">{String((l.items as any[])?.length ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <RawJsonViewer data={listsQ.data} title="lists" />
                </>
              );
            })()}
          </GlassPanel>

          <GlassPanel>
            <BrokerWarnings data={listsFilesQ.data} context="listsFiles" />
            <h3 className="text-sm font-semibold text-violet-300 mb-3">CDB List Files</h3>
            {listsFilesQ.isLoading ? (
              <TableSkeleton columns={3} rows={8} />
            ) : (() => {
              const items = ((listsFilesQ.data as any)?.data?.affected_items ?? []) as Array<Record<string, unknown>>;
              return items.length === 0 ? (
                <div className="py-12 text-center text-slate-500">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No CDB list files found</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-500 uppercase border-b border-white/10">
                          <th className="py-2 px-3">Filename</th>
                          <th className="py-2 px-3">Relative Path</th>
                          <th className="py-2 px-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((f, i) => (
                          <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                            <td className="py-2 px-3 font-mono text-xs text-violet-300">{String(f.filename ?? "")}</td>
                            <td className="py-2 px-3 font-mono text-xs text-slate-400">{String(f.relative_dirname ?? "")}</td>
                            <td className="py-2 px-3">
                              <button
                                onClick={() => setCdbFileToView(String(f.filename ?? ""))}
                                className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
                              >
                                <Eye className="h-3 w-3" /> View Content
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <RawJsonViewer data={listsFilesQ.data} title="listsFiles" />
                </>
              );
            })()}
          </GlassPanel>

          {/* CDB List File Content Viewer */}
          {cdbFileToView && (
            <GlassPanel>
              <BrokerWarnings data={cdbFileContentQ.data} context="listsFileContent" />
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-violet-300">
                  <span className="font-mono">{cdbFileToView}</span> — Content
                </h3>
                <button
                  onClick={() => setCdbFileToView(null)}
                  className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
                >
                  <X className="h-3 w-3" /> Close
                </button>
              </div>
              {cdbFileContentQ.isLoading ? (
                <TableSkeleton columns={2} rows={6} />
              ) : (
                <>
                  <pre className="bg-black/30 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-auto max-h-[400px] whitespace-pre-wrap">
                    {JSON.stringify(cdbFileContentQ.data, null, 2)}
                  </pre>
                  <RawJsonViewer data={cdbFileContentQ.data} title="listsFileContent" />
                </>
              )}
            </GlassPanel>
          )}
        </>
      )}
    </div>
  );
}
