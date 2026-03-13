import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { inferRouteFromCallsite, inferPrimaryRoute, inferAllRoutes } from "@/lib/routeInference";
import { PageHeader } from "@/components/shared/PageHeader";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Shield,
  AlertTriangle,
  ArrowRight,
  Search,
  Database,
  Layers,
  Lock,
  Zap,
  BarChart3,
  FileCode2,
  ExternalLink,
  Copy,
  Play,
  Code2,
  Navigation,
  Wrench,
  Info,
  type LucideIcon,
} from "lucide-react";

// ── Wiring level badge ───────────────────────────────────────────────────────

function WiringBadge({ level }: { level: string }) {
  const variants: Record<string, { className: string; label: string }> = {
    broker: { className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", label: "Broker-Wired" },
    manual: { className: "bg-amber-500/20 text-amber-400 border-amber-500/30", label: "Manual Params" },
    passthrough: { className: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30", label: "Passthrough" },
  };
  const v = variants[level] || variants.passthrough;
  return <Badge variant="outline" className={`text-[10px] font-mono ${v.className}`}>{v.label}</Badge>;
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sublabel, color }: {
  icon: LucideIcon; label: string; value: string | number; sublabel?: string; color: string;
}) {
  return (
    <GlassPanel className="flex items-center gap-4 p-4">
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-display font-bold text-foreground">{value}</p>
        {sublabel && <p className="text-[10px] text-muted-foreground">{sublabel}</p>}
      </div>
    </GlassPanel>
  );
}

// ── Coverage ring (SVG donut) ────────────────────────────────────────────────

function CoverageRing({ percent, label, size = 120 }: { percent: number; label: string; size?: number }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const color = percent >= 80 ? "oklch(0.72 0.19 155)" : percent >= 50 ? "oklch(0.75 0.18 85)" : "oklch(0.65 0.25 25)";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="oklch(0.25 0.02 280)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-display font-bold text-foreground">{percent}%</span>
      </div>
      </div>
      <p className="text-xs text-muted-foreground text-center">{label}</p>
    </div>
  );
}

// ── Category bar ─────────────────────────────────────────────────────────────

function CategoryBar({ category, total, brokerWired, manualParam, passthrough }: {
  category: string; total: number; brokerWired: number; manualParam: number; passthrough: number;
}) {
  const brokerPct = (brokerWired / total) * 100;
  const manualPct = (manualParam / total) * 100;
  const passPct = (passthrough / total) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{category}</span>
        <span className="text-xs text-muted-foreground font-mono">{total} endpoints</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden bg-zinc-800/50">
        {brokerPct > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="bg-emerald-500/80 transition-all" style={{ width: `${brokerPct}%` }} />
              </TooltipTrigger>
              <TooltipContent><p>{brokerWired} broker-wired</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {manualPct > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="bg-amber-500/80 transition-all" style={{ width: `${manualPct}%` }} />
              </TooltipTrigger>
              <TooltipContent><p>{manualParam} manual params</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {passPct > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="bg-zinc-600/80 transition-all" style={{ width: `${passPct}%` }} />
              </TooltipTrigger>
              <TooltipContent><p>{passthrough} passthrough</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

// ── Wiring filter chips ─────────────────────────────────────────────────────

const WIRING_FILTERS = [
  { key: "all", label: "All", className: "bg-primary/20 text-primary border-primary/30" },
  { key: "broker", label: "Broker", className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  { key: "manual", label: "Manual", className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  { key: "passthrough", label: "Passthrough", className: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30" },
] as const;

// ── Helper: extract short filename from path ─────────────────────────────────

function shortPath(fullPath: string): string {
  // "client/src/pages/AgentHealth.tsx:87" → "AgentHealth.tsx:87"
  const parts = fullPath.split("/");
  return parts[parts.length - 1];
}

function extractPage(fullPath: string): string {
  // "client/src/pages/AgentHealth.tsx:87" → "AgentHealth"
  const match = fullPath.match(/\/([^/]+)\.\w+:\d+$/);
  return match ? match[1] : fullPath;
}

// ── Parity summary helpers ──────────────────────────────────────────────────

type ParityLevel = "none" | "minimal" | "moderate" | "rich";

function computeParitySummary(parityCallsites: Array<{ passedKeys: Record<string, string> }>) {
  const allKeys = new Set<string>();
  for (const pc of parityCallsites) {
    for (const k of Object.keys(pc.passedKeys)) {
      allKeys.add(k);
    }
  }
  const uniqueKeys = Array.from(allKeys);
  const total = parityCallsites.length;
  const keyCount = uniqueKeys.length;

  let level: ParityLevel = "none";
  if (total === 0) level = "none";
  else if (keyCount <= 2) level = "minimal";
  else if (keyCount <= 5) level = "moderate";
  else level = "rich";

  return { total, uniqueKeys, keyCount, level };
}

const PARITY_STYLES: Record<ParityLevel, { className: string; label: string }> = {
  none: { className: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30", label: "No parity observed" },
  minimal: { className: "bg-amber-500/20 text-amber-400 border-amber-500/30", label: "Minimal parity" },
  moderate: { className: "bg-blue-500/20 text-blue-400 border-blue-500/30", label: "Moderate parity" },
  rich: { className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", label: "Rich parity" },
};

// ── Remediation scoring ─────────────────────────────────────────────────────

interface RemediationCandidate {
  procedure: string;
  category: string;
  wiringLevel: string;
  paramCount: number;
  callsiteCount: number;
  parityCount: number;
  score: number;
  reasons: string[];
  suggestion: string;
}

function computeRemediationQueue(endpoints: Array<{
  procedure: string; category: string; wiringLevel: string;
  paramCount: number; callsites: string[];
  parityCallsites: Array<{ passedKeys: Record<string, string> }>;
  brokerConfig?: string;
}>): RemediationCandidate[] {
  const candidates: RemediationCandidate[] = [];

  for (const ep of endpoints) {
    // Only manual/passthrough endpoints need remediation attention
    if (ep.wiringLevel === "broker") continue;

    let score = 0;
    const reasons: string[] = [];

    // Manual with params = higher priority than passthrough with 0
    if (ep.wiringLevel === "manual") {
      score += 3;
      reasons.push("manual wiring (inline params)");
    } else {
      score += 1;
      reasons.push("passthrough (no param handling)");
    }

    // Zero callsites = possibly dead code or missed wiring
    if (ep.callsites.length === 0) {
      score += 2;
      reasons.push("no frontend callsites");
    }

    // High param count but not broker-wired = more to gain
    if (ep.paramCount >= 5) {
      score += 2;
      reasons.push(`${ep.paramCount} params unwired`);
    } else if (ep.paramCount >= 2) {
      score += 1;
      reasons.push(`${ep.paramCount} params unwired`);
    }

    // Low parity = less UI coverage
    if (ep.parityCallsites.length === 0 && ep.callsites.length > 0) {
      score += 1;
      reasons.push("callsites but no observed parity");
    }

    // Derive actionable suggestion from evidence
    let suggestion: string;
    if (ep.wiringLevel === "manual" && ep.paramCount >= 3) {
      suggestion = "Add broker config";
    } else if (ep.wiringLevel === "manual" && ep.callsites.length > 0 && ep.parityCallsites.length === 0) {
      suggestion = "Expand frontend params";
    } else if (ep.callsites.length === 0 && ep.paramCount === 0) {
      suggestion = "Verify if used";
    } else if (ep.callsites.length === 0 && ep.paramCount > 0) {
      suggestion = "Verify dead code";
    } else if (ep.wiringLevel === "passthrough" && ep.paramCount <= 1) {
      suggestion = "OK as passthrough";
    } else if (ep.wiringLevel === "manual" && ep.paramCount <= 2) {
      suggestion = "Consider broker promotion";
    } else {
      suggestion = "Add broker config";
    }

    candidates.push({
      procedure: ep.procedure,
      category: ep.category,
      wiringLevel: ep.wiringLevel,
      paramCount: ep.paramCount,
      callsiteCount: ep.callsites.length,
      parityCount: ep.parityCallsites.length,
      score,
      reasons,
      suggestion,
    });
  }

  return candidates.sort((a, b) => b.score - a.score);
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function BrokerCoverage() {
  const { data, isLoading, refetch } = trpc.wazuh.brokerCoverage.useQuery();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [wiringFilter, setWiringFilter] = useState<string>("all");
  type Endpoint = NonNullable<typeof data>["endpoints"][number];
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint | null>(null);

  const filteredEndpoints = useMemo(() => {
    if (!data) return [];
    return data.endpoints.filter(e => {
      const matchesSearch = !search ||
        e.procedure.toLowerCase().includes(search.toLowerCase()) ||
        e.wazuhPath.toLowerCase().includes(search.toLowerCase()) ||
        (e.brokerConfig || "").toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "all" || e.category === categoryFilter;
      const matchesWiring = wiringFilter === "all" || e.wiringLevel === wiringFilter;
      return matchesSearch && matchesCategory && matchesWiring;
    });
  }, [data, search, categoryFilter, wiringFilter]);

  const categories = useMemo(() => {
    if (!data) return [];
    return ["all", ...data.categories.map(c => c.category)];
  }, [data]);

  const remediationQueue = useMemo(() => {
    if (!data) return [];
    return computeRemediationQueue(data.endpoints);
  }, [data]);

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-6 max-w-[2400px] mx-auto">
        <PageHeader title="Broker Coverage" subtitle="Loading API surface analysis..." />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <GlassPanel key={i} className="h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Build playground deep-link with full context
  function buildPlaygroundLink(ep: Endpoint): string {
    const params = new URLSearchParams();
    if (ep.brokerConfig) params.set("config", ep.brokerConfig);
    params.set("procedure", ep.procedure);
    params.set("wazuhPath", ep.wazuhPath);
    params.set("wiringLevel", ep.wiringLevel);
    return `/admin/broker-playground?${params.toString()}`;
  }

  return (
    <div className="p-6 space-y-6 max-w-[2400px] mx-auto">
      <PageHeader
        title="Broker Coverage"
        subtitle={`Wazuh API v${data.specVersion} — ${data.totalProcedures} endpoints analyzed`}
        onRefresh={() => refetch()}
        isLoading={isLoading}
      />

      {/* ── Enrichment Notice (missing or stale artifacts) ── */}
      {data.enrichment && (() => {
        const e = data.enrichment;
        const wiringMissing = !e.wiringLedgerLoaded;
        const parityMissing = !e.parityArtifactLoaded;
        const wiringStale = e.wiringLedgerStale === true;
        const parityStale = e.parityArtifactStale === true;
        const hasIssue = wiringMissing || parityMissing || wiringStale || parityStale;
        if (!hasIssue) return null;

        const messages: string[] = [];
        if (wiringMissing && parityMissing) {
          messages.push("Wiring ledger and parity artifacts not loaded — callsite and parity data unavailable. Generate with audit scripts.");
        } else {
          if (wiringMissing) messages.push("Wiring ledger artifact not loaded — callsite data unavailable.");
          if (parityMissing) messages.push("Parity artifact not loaded — param parity data unavailable.");
        }
        if (wiringStale) {
          messages.push(
            `Wiring ledger may be stale — source files modified since last generation${e.wiringLedgerGeneratedAt ? ` (generated ${new Date(e.wiringLedgerGeneratedAt).toLocaleDateString()})` : ""}.`
          );
        }
        if (parityStale) {
          messages.push(
            `Parity artifact may be stale — source files modified since last generation${e.parityArtifactGeneratedAt ? ` (generated ${new Date(e.parityArtifactGeneratedAt).toLocaleDateString()})` : ""}.`
          );
        }

        return (
          <GlassPanel className="flex items-center gap-3 p-3 border-amber-500/20">
            <Info className="h-4 w-4 text-amber-400 shrink-0" />
            <div className="text-[11px] text-amber-400/80 space-y-0.5">
              {messages.map((msg, i) => (
                <div key={i}>{msg}</div>
              ))}
            </div>
          </GlassPanel>
        );
      })()}

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        <StatCard icon={Database} label="Total Endpoints" value={data.totalProcedures} color="bg-primary/20 text-primary" />
        <StatCard icon={Shield} label="Broker-Wired" value={data.brokerWired} sublabel={`${data.brokerCoveragePercent}% of total`} color="bg-emerald-500/20 text-emerald-400" />
        <StatCard icon={AlertTriangle} label="Manual Params" value={data.manualParam} sublabel="Inline Zod schemas" color="bg-amber-500/20 text-amber-400" />
        <StatCard icon={ArrowRight} label="Passthrough" value={data.passthrough} sublabel="No query params" color="bg-zinc-500/20 text-zinc-400" />
        <StatCard icon={Layers} label="Broker Configs" value={data.totalBrokerConfigs} sublabel={`${data.totalBrokerParams} total params`} color="bg-violet-500/20 text-violet-400" />
        <StatCard icon={Zap} label="Param Coverage" value={`${data.paramCoveragePercent}%`} sublabel="Broker + Manual" color="bg-cyan-500/20 text-cyan-400" />
      </div>

      {/* ── Coverage Rings + Category Bars ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Rings */}
        <GlassPanel className="flex items-center justify-around p-6">
          <div className="relative">
            <CoverageRing percent={data.brokerCoveragePercent} label="Broker Coverage" />
          </div>
          <div className="relative">
            <CoverageRing percent={data.paramCoveragePercent} label="Param Coverage" />
          </div>
        </GlassPanel>

        {/* Category breakdown */}
        <GlassPanel className="xl:col-span-2 p-6 space-y-4">
          <h3 className="text-sm font-display font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Coverage by Category
          </h3>
          <div className="space-y-3">
            {data.categories.map(cat => (
              <CategoryBar
                key={cat.category}
                category={cat.category}
                total={cat.total}
                brokerWired={cat.brokerWired}
                manualParam={cat.manualParam}
                passthrough={cat.passthrough}
              />
            ))}
          </div>
          <div className="flex items-center gap-4 pt-2 border-t border-white/5">
            <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" /><span className="text-[10px] text-muted-foreground">Broker</span></div>
            <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-amber-500/80" /><span className="text-[10px] text-muted-foreground">Manual</span></div>
            <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-full bg-zinc-600/80" /><span className="text-[10px] text-muted-foreground">Passthrough</span></div>
          </div>
        </GlassPanel>
      </div>

      {/* ── Tabs: Endpoints / Broker Configs / Remediation Queue ── */}
      <Tabs defaultValue="endpoints" className="space-y-4">
        <TabsList className="bg-glass-bg border border-glass-border">
          <TabsTrigger value="endpoints" className="data-[state=active]:bg-primary/20">
            <Database className="h-3.5 w-3.5 mr-1.5" />
            Endpoints ({data.totalProcedures})
          </TabsTrigger>
          <TabsTrigger value="configs" className="data-[state=active]:bg-primary/20">
            <Lock className="h-3.5 w-3.5 mr-1.5" />
            Broker Configs ({data.totalBrokerConfigs})
          </TabsTrigger>
          <TabsTrigger value="remediation" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
            <Wrench className="h-3.5 w-3.5 mr-1.5" />
            Needs Attention ({remediationQueue.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Endpoints Tab ── */}
        <TabsContent value="endpoints" className="space-y-4">
          {/* Filters */}
          <GlassPanel className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search procedures, paths, configs..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 bg-transparent border-white/10 text-sm"
              />
            </div>
            {/* Wiring level filter */}
            <div className="flex gap-1.5">
              {WIRING_FILTERS.map(wf => (
                <button
                  key={wf.key}
                  onClick={() => setWiringFilter(wf.key)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    wiringFilter === wf.key
                      ? wf.className + " border"
                      : "bg-white/5 text-muted-foreground hover:bg-white/10 border border-transparent"
                  }`}
                >
                  {wf.label}
                </button>
              ))}
            </div>
            {/* Category filter */}
            <div className="flex flex-wrap gap-1.5">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    categoryFilter === cat
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "bg-white/5 text-muted-foreground hover:bg-white/10 border border-transparent"
                  }`}
                >
                  {cat === "all" ? "All Categories" : cat}
                </button>
              ))}
            </div>
          </GlassPanel>

          {/* Table */}
          <GlassPanel className="p-0 overflow-hidden">
            <ScrollArea className="max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold w-[200px]">Procedure</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Wazuh Path</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold w-[120px]">Category</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold w-[130px]">Wiring</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold w-[200px]">Broker Config</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold text-right w-[80px]">Params</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold text-right w-[80px]">Callsites</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEndpoints.map(ep => (
                    <TableRow
                      key={ep.procedure}
                      className="border-white/5 hover:bg-white/[0.04] cursor-pointer transition-colors"
                      onClick={() => setSelectedEndpoint(ep)}
                    >
                      <TableCell className="font-mono text-xs text-foreground">{ep.procedure}</TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">{ep.wazuhPath}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-mono border-white/10 text-muted-foreground">
                          {ep.category}
                        </Badge>
                      </TableCell>
                      <TableCell><WiringBadge level={ep.wiringLevel} /></TableCell>
                      <TableCell className="font-mono text-[10px] text-violet-400/80">{ep.brokerConfig || "—"}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-foreground">{ep.paramCount}</TableCell>
                      <TableCell className="text-right">
                        {ep.callsites.length > 0 ? (
                          <Badge variant="outline" className="text-[10px] font-mono border-cyan-500/30 text-cyan-400 bg-cyan-500/10">
                            {ep.callsites.length}
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/40">0</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            <div className="px-4 py-2 border-t border-white/5 text-[10px] text-muted-foreground">
              Showing {filteredEndpoints.length} of {data.totalProcedures} endpoints
            </div>
          </GlassPanel>
        </TabsContent>

        {/* ── Broker Configs Tab ── */}
        <TabsContent value="configs" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.brokerConfigs.map(config => (
              <GlassPanel key={config.name} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-mono text-xs text-primary font-semibold">{config.name}</h4>
                  <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                    {config.totalParams} params
                  </Badge>
                </div>
                <p className="font-mono text-[11px] text-muted-foreground">{config.endpoint}</p>

                {/* Universal params */}
                {config.universalParams.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Universal</p>
                    <div className="flex flex-wrap gap-1">
                      {config.universalParams.map(p => (
                        <span key={p} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 text-zinc-400">{p}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Specific params */}
                {config.specificParams.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Endpoint-Specific</p>
                    <div className="flex flex-wrap gap-1">
                      {config.specificParams.map(p => (
                        <span key={p} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-violet-500/10 text-violet-400">{p}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Coverage bar */}
                <div className="pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                    <span>Param utilization</span>
                    <span>{config.universalParams.length}/{7} universal</span>
                  </div>
                  <Progress value={(config.universalParams.length / 7) * 100} className="h-1.5" />
                </div>
              </GlassPanel>
            ))}
          </div>
        </TabsContent>

        {/* ── Remediation Queue Tab ── */}
        <TabsContent value="remediation" className="space-y-4">
          <GlassPanel className="p-3 flex items-center gap-3">
            <Info className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-[11px] text-muted-foreground">
              Endpoints ranked by wiring attention needed. Score based on: wiring level, callsite count, param count, and parity coverage.
            </p>
          </GlassPanel>
          <GlassPanel className="p-0 overflow-hidden">
            <ScrollArea className="max-h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/5 hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold w-[50px]">Score</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold w-[200px]">Procedure</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold w-[100px]">Category</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold w-[120px]">Wiring</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold text-right w-[70px]">Params</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold text-right w-[70px]">Sites</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Reasons</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold w-[160px]">Next Step</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {remediationQueue.map(item => {
                    const ep = data.endpoints.find(e => e.procedure === item.procedure);
                    return (
                      <TableRow
                        key={item.procedure}
                        className="border-white/5 hover:bg-white/[0.04] cursor-pointer transition-colors"
                        onClick={() => { if (ep) setSelectedEndpoint(ep); }}
                      >
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] font-mono ${
                            item.score >= 6 ? "bg-red-500/20 text-red-400 border-red-500/30" :
                            item.score >= 4 ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                            "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
                          }`}>
                            {item.score}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-foreground">{item.procedure}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-mono border-white/10 text-muted-foreground">
                            {item.category}
                          </Badge>
                        </TableCell>
                        <TableCell><WiringBadge level={item.wiringLevel} /></TableCell>
                        <TableCell className="text-right font-mono text-xs text-foreground">{item.paramCount}</TableCell>
                        <TableCell className="text-right font-mono text-xs text-foreground">{item.callsiteCount}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground/70">{item.reasons.join(", ")}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[9px] font-mono ${
                            item.suggestion.startsWith("OK") || item.suggestion.startsWith("Verify")
                              ? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                              : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                          }`}>
                            {item.suggestion}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
            <div className="px-4 py-2 border-t border-white/5 text-[10px] text-muted-foreground">
              {remediationQueue.length} endpoints need wiring attention
            </div>
          </GlassPanel>
        </TabsContent>
      </Tabs>

      {/* ── Spec Info ── */}
      <GlassPanel className="p-3 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Analysis based on Wazuh REST API OpenAPI spec v{data.specVersion}</span>
        <span className="font-mono">Generated: {new Date(data.analyzedAt).toLocaleString()}</span>
      </GlassPanel>

      {/* ── Endpoint Detail Drawer ── */}
      <Sheet open={!!selectedEndpoint} onOpenChange={(open) => { if (!open) setSelectedEndpoint(null); }}>
        <SheetContent className="w-[480px] sm:max-w-[480px] bg-zinc-950 border-white/10 overflow-y-auto">
          {selectedEndpoint && (() => {
            const primaryRoute = inferPrimaryRoute(selectedEndpoint.callsites);
            const allRoutes = inferAllRoutes(selectedEndpoint.callsites);
            const parity = computeParitySummary(selectedEndpoint.parityCallsites);
            const parityStyle = PARITY_STYLES[parity.level];

            return (
              <>
                <SheetHeader className="pb-4 border-b border-white/5">
                  <SheetTitle className="font-mono text-base text-foreground flex items-center gap-2">
                    {selectedEndpoint.procedure}
                  </SheetTitle>
                  <SheetDescription className="font-mono text-[11px] text-muted-foreground">
                    {selectedEndpoint.wazuhPath}
                  </SheetDescription>
                  <div className="flex items-center gap-2 pt-1">
                    <WiringBadge level={selectedEndpoint.wiringLevel} />
                    <Badge variant="outline" className="text-[10px] font-mono border-white/10 text-muted-foreground">
                      {selectedEndpoint.category}
                    </Badge>
                  </div>
                </SheetHeader>

                <div className="space-y-5 pt-5">
                  {/* ── Details ── */}
                  <div className="space-y-2">
                    <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Details</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-white/[0.02] rounded-md p-2.5">
                        <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">Wiring Level</p>
                        <p className="text-xs text-foreground font-mono mt-0.5">{selectedEndpoint.wiringLevel}</p>
                      </div>
                      <div className="bg-white/[0.02] rounded-md p-2.5">
                        <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">Param Count</p>
                        <p className="text-xs text-foreground font-mono mt-0.5">{selectedEndpoint.paramCount}</p>
                      </div>
                      {selectedEndpoint.brokerConfig && (
                        <div className="bg-white/[0.02] rounded-md p-2.5 col-span-2">
                          <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">Broker Config</p>
                          <p className="text-xs text-violet-400 font-mono mt-0.5">{selectedEndpoint.brokerConfig}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Actions ── */}
                  <div className="space-y-2">
                    <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Actions</h4>
                    <div className="flex flex-col gap-1.5">
                      {selectedEndpoint.brokerConfig ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="justify-start h-8 text-[11px] border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 gap-2"
                          onClick={() => navigate(buildPlaygroundLink(selectedEndpoint))}
                        >
                          <Play className="h-3.5 w-3.5" />
                          Open in Broker Playground
                          <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-zinc-800/50 text-[11px] text-muted-foreground/60">
                          <Play className="h-3.5 w-3.5" />
                          <span>
                            {selectedEndpoint.wiringLevel === "passthrough"
                              ? "Passthrough — no broker config to test"
                              : "Manual params — no broker config to test"}
                          </span>
                        </div>
                      )}
                      {primaryRoute && !primaryRoute.hasParams && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="justify-start h-8 text-[11px] border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/10 gap-2"
                          onClick={() => navigate(primaryRoute.route)}
                        >
                          <Navigation className="h-3.5 w-3.5" />
                          Open {primaryRoute.pageName}
                          <ExternalLink className="h-3 w-3 ml-auto opacity-50" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="justify-start h-8 text-[11px] border-white/10 text-muted-foreground hover:text-foreground gap-2"
                        onClick={() => {
                          navigator.clipboard.writeText(selectedEndpoint.procedure);
                          toast.success("Procedure name copied");
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy procedure name
                      </Button>
                      {selectedEndpoint.brokerConfig && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="justify-start h-8 text-[11px] border-white/10 text-muted-foreground hover:text-foreground gap-2"
                          onClick={() => {
                            navigator.clipboard.writeText(selectedEndpoint.brokerConfig!);
                            toast.success("Config name copied");
                          }}
                        >
                          <Code2 className="h-3.5 w-3.5" />
                          Copy config name
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* ── Callsites with route links ── */}
                  <div className="space-y-2">
                    <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2">
                      <FileCode2 className="h-3.5 w-3.5" />
                      Frontend Callsites ({selectedEndpoint.callsites.length})
                    </h4>
                    {selectedEndpoint.callsites.length > 0 ? (
                      <div className="space-y-1">
                        {selectedEndpoint.callsites.map((cs, i) => {
                          const inferred = inferRouteFromCallsite(cs);
                          return (
                            <div
                              key={i}
                              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white/[0.02] hover:bg-white/[0.04] transition-colors group"
                            >
                              <FileCode2 className="h-3 w-3 text-cyan-400/60 shrink-0" />
                              <span className="font-mono text-[11px] text-foreground/80 truncate flex-1" title={cs}>
                                {shortPath(cs)}
                              </span>
                              {inferred ? (
                                inferred.hasParams ? (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Badge variant="outline" className="text-[9px] font-mono border-white/5 text-muted-foreground/50 shrink-0">
                                          {inferred.pageName}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="text-[11px]">{inferred.route} (requires params)</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(inferred.route);
                                    }}
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono border border-cyan-500/20 text-cyan-400/70 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors shrink-0"
                                  >
                                    {inferred.pageName}
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </button>
                                )
                              ) : (
                                <Badge variant="outline" className="text-[9px] font-mono border-white/5 text-muted-foreground/50 shrink-0">
                                  {extractPage(cs)}
                                </Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground/50 italic px-2">
                        No frontend callsites found in wiring ledger
                      </p>
                    )}

                    {/* Owning pages summary */}
                    {allRoutes.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">Routes:</span>
                        {allRoutes.map(r => (
                          <span key={r.route} className="text-[9px] font-mono text-cyan-400/50">
                            {r.route}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Parity Summary ── */}
                  {selectedEndpoint.parityCallsites.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2">
                        <Zap className="h-3.5 w-3.5" />
                        Param Parity
                      </h4>

                      {/* Summary row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] font-mono ${parityStyle.className}`}>
                          {parityStyle.label}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {parity.total} callsite{parity.total !== 1 ? "s" : ""}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {parity.keyCount} unique param{parity.keyCount !== 1 ? "s" : ""}
                        </span>
                      </div>

                      {/* Top params chips */}
                      {parity.uniqueKeys.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {parity.uniqueKeys.slice(0, 8).map(k => (
                            <span key={k} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-violet-500/10 text-violet-400/80 border border-violet-500/10">
                              {k}
                            </span>
                          ))}
                          {parity.uniqueKeys.length > 8 && (
                            <span className="text-[9px] text-muted-foreground/40 self-center">
                              +{parity.uniqueKeys.length - 8} more
                            </span>
                          )}
                        </div>
                      )}

                      {/* Raw per-callsite detail */}
                      <div className="space-y-2 pt-1">
                        <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">Per-callsite detail</p>
                        {selectedEndpoint.parityCallsites.map((pc, i) => {
                          const keys = Object.keys(pc.passedKeys);
                          return (
                            <div key={i} className="rounded-md bg-white/[0.02] p-2.5 space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[10px] text-cyan-400/70 truncate" title={pc.file}>
                                  {shortPath(`${pc.file}:${pc.line}`)}
                                </span>
                                <Badge variant="outline" className="text-[9px] font-mono border-white/5 text-muted-foreground/50 ml-auto shrink-0">
                                  {keys.length} params
                                </Badge>
                              </div>
                              {keys.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {keys.map(k => (
                                    <TooltipProvider key={k}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-violet-500/10 text-violet-400/80 border border-violet-500/10 cursor-default">
                                            {k}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                          <p className="text-[11px] font-mono">{k} = {pc.passedKeys[k]}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* No parity case */}
                  {selectedEndpoint.parityCallsites.length === 0 && selectedEndpoint.callsites.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2">
                        <Zap className="h-3.5 w-3.5" />
                        Param Parity
                      </h4>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] font-mono ${PARITY_STYLES.none.className}`}>
                          {PARITY_STYLES.none.label}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground/50 italic px-1">
                        Callsites exist but no params observed in parity scan
                      </p>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>
    </div>
  );
}
