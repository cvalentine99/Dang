import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/shared/PageHeader";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import {
  Shield,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Search,
  Database,
  Layers,
  Lock,
  Zap,
  BarChart3,
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

// ── Main page ────────────────────────────────────────────────────────────────

export default function BrokerCoverage() {
  const { data, isLoading, refetch } = trpc.wazuh.brokerCoverage.useQuery();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const filteredEndpoints = useMemo(() => {
    if (!data) return [];
    return data.endpoints.filter(e => {
      const matchesSearch = !search || 
        e.procedure.toLowerCase().includes(search.toLowerCase()) ||
        e.wazuhPath.toLowerCase().includes(search.toLowerCase()) ||
        (e.brokerConfig || "").toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "all" || e.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [data, search, categoryFilter]);

  const categories = useMemo(() => {
    if (!data) return [];
    return ["all", ...data.categories.map(c => c.category)];
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

  return (
    <div className="p-6 space-y-6 max-w-[2400px] mx-auto">
      <PageHeader
        title="Broker Coverage"
        subtitle={`Wazuh API v${data.specVersion} — ${data.totalProcedures} endpoints analyzed`}
        onRefresh={() => refetch()}
        isLoading={isLoading}
      />

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

      {/* ── Tabs: Endpoints / Broker Configs ── */}
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
                  {cat === "all" ? "All" : cat}
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEndpoints.map(ep => (
                    <TableRow key={ep.procedure} className="border-white/5 hover:bg-white/[0.02]">
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
      </Tabs>

      {/* ── Spec Info ── */}
      <GlassPanel className="p-3 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Analysis based on Wazuh REST API OpenAPI spec v{data.specVersion}</span>
        <span className="font-mono">Generated: {new Date(data.analyzedAt).toLocaleString()}</span>
      </GlassPanel>
    </div>
  );
}
