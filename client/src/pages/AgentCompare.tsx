import { GlassPanel } from "@/components/shared/GlassPanel";
import { ThreatBadge } from "@/components/shared/ThreatBadge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Monitor, Search, X, Plus, Shield, Bug, AlertTriangle,
  CheckCircle2, XCircle, Wifi, WifiOff, Server, BarChart3, Minus,
  ArrowUp, ArrowDown, Equal,
} from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, PieChart, Pie, RadarChart, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────
interface AgentSlot {
  agentId: string;
  agent: any;
  alerts: any;
  vulns: any;
  sca: any;
}

const SEVERITY_COLORS: Record<string, string> = {
  Critical: "oklch(0.637 0.237 25.331)",
  High: "oklch(0.705 0.191 47)",
  Medium: "oklch(0.795 0.184 86.047)",
  Low: "oklch(0.765 0.177 163.223)",
};

const AGENT_COLORS = [
  "oklch(0.541 0.281 293.009)",
  "oklch(0.789 0.154 211.53)",
  "oklch(0.705 0.191 47)",
];

// ── Safe data extractors ──────────────────────────────────────────────────
function getAlertHits(slot: AgentSlot | undefined): any[] {
  return (slot?.alerts as any)?.data?.hits?.hits ?? [];
}

function getVulnHits(slot: AgentSlot | undefined): any[] {
  return (slot?.vulns as any)?.data?.hits?.hits ?? [];
}

function getScaPolicies(slot: AgentSlot | undefined): any[] {
  return (slot?.sca as any)?.data?.affected_items ?? [];
}

// ── Agent Selector ─────────────────────────────────────────────────────────
function AgentSelector({
  selectedIds,
  onAdd,
  onRemove,
}: {
  selectedIds: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const agentsQ = trpc.wazuh.agents.useQuery(
    { limit: 500, offset: 0, search: search || undefined },
    { retry: false, staleTime: 30_000 }
  );

  const agents = (agentsQ.data as any)?.data?.affected_items ?? [];
  const available = agents.filter((a: any) => !selectedIds.includes(String(a.id)));

  return (
    <div className="relative">
      <div className="flex items-center gap-2 flex-wrap">
        {selectedIds.map((id, i) => (
          <span
            key={id}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border"
            style={{
              background: `color-mix(in oklch, ${AGENT_COLORS[i] ?? AGENT_COLORS[0]}, transparent 85%)`,
              borderColor: `color-mix(in oklch, ${AGENT_COLORS[i] ?? AGENT_COLORS[0]}, transparent 70%)`,
              color: AGENT_COLORS[i] ?? AGENT_COLORS[0],
            }}
          >
            <Monitor className="w-3 h-3" />
            Agent {id}
            <button onClick={() => onRemove(id)} className="ml-0.5 hover:text-white transition-colors">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}

        {selectedIds.length < 3 && (
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs text-muted-foreground border border-dashed border-white/10 hover:border-purple-500/30 hover:text-purple-300 transition-colors"
            >
              <Plus className="w-3 h-3" /> Add Agent ({3 - selectedIds.length} remaining)
            </button>

            {showDropdown && (
              <div className="absolute top-full left-0 mt-1 w-72 rounded-lg border border-white/10 bg-[oklch(0.16_0.02_286)] shadow-xl z-50">
                <div className="p-2 border-b border-white/5">
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white/5">
                    <Search className="w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search agents..."
                      className="bg-transparent text-xs text-foreground outline-none flex-1 placeholder:text-muted-foreground/50"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto p-1">
                  {agentsQ.isLoading ? (
                    <div className="p-3 text-center text-xs text-muted-foreground">Loading agents...</div>
                  ) : available.length === 0 ? (
                    <div className="p-3 text-center text-xs text-muted-foreground">No agents found</div>
                  ) : (
                    available.slice(0, 20).map((a: any) => (
                      <button
                        key={a.id}
                        onClick={() => { onAdd(String(a.id)); setShowDropdown(false); setSearch(""); }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left hover:bg-white/5 transition-colors"
                      >
                        <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-foreground font-medium">{a.name}</span>
                        <span className="text-muted-foreground font-mono">#{a.id}</span>
                        <span className={`ml-auto text-[10px] ${a.status === "active" ? "text-green-400" : "text-red-400"}`}>
                          {a.status}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Diff Indicator ─────────────────────────────────────────────────────────
function DiffArrow({ value, baseline, inverse = false }: { value: number; baseline: number; inverse?: boolean }) {
  if (value === baseline) return <Equal className="w-3 h-3 text-muted-foreground" />;
  const better = inverse ? value < baseline : value > baseline;
  return better
    ? <ArrowUp className="w-3 h-3 text-green-400" />
    : <ArrowDown className="w-3 h-3 text-red-400" />;
}

// ── Agent Column ───────────────────────────────────────────────────────────
function AgentColumn({ slot, index, allSlots }: { slot: AgentSlot; index: number; allSlots: AgentSlot[] }) {
  const agent = slot.agent;
  const color = AGENT_COLORS[index] ?? AGENT_COLORS[0];

  // Parse alert counts by level — safe extraction
  const alertHits = getAlertHits(slot);
  const alertLevels = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, total: alertHits.length };
    for (const h of alertHits) {
      const lvl = Number(h._source?.rule?.level ?? 0);
      if (lvl >= 12) counts.critical++;
      else if (lvl >= 7) counts.high++;
      else if (lvl >= 4) counts.medium++;
      else counts.low++;
    }
    return counts;
  }, [alertHits]);

  // Parse vulnerability counts — safe extraction
  const vulnHits = getVulnHits(slot);
  const vulnCounts = useMemo(() => {
    const counts = { Critical: 0, High: 0, Medium: 0, Low: 0, total: vulnHits.length };
    for (const h of vulnHits) {
      const sev = String(h._source?.vulnerability?.severity ?? "Low");
      if (sev in counts) (counts as any)[sev]++;
    }
    return counts;
  }, [vulnHits]);

  // Parse SCA compliance — safe extraction
  const scaPolicies = getScaPolicies(slot);
  const scaScore = useMemo(() => {
    if (scaPolicies.length === 0) return { pass: 0, fail: 0, score: 0 };
    let totalPass = 0, totalFail = 0;
    for (const p of scaPolicies) {
      totalPass += Number(p.pass ?? 0);
      totalFail += Number(p.fail ?? 0);
    }
    const total = totalPass + totalFail;
    return { pass: totalPass, fail: totalFail, score: total > 0 ? Math.round((totalPass / total) * 100) : 0 };
  }, [scaPolicies]);

  // Baseline for comparison (first agent) — SAFE: guard against undefined
  const baseSlot = allSlots.length > 0 ? allSlots[0] : undefined;
  const isBase = index === 0;

  // Radar data
  const radarData = [
    { metric: "Alerts", value: alertLevels.total, max: 200 },
    { metric: "Critical", value: alertLevels.critical, max: 50 },
    { metric: "Vulns", value: vulnCounts.total, max: 200 },
    { metric: "High CVEs", value: vulnCounts.Critical + vulnCounts.High, max: 100 },
    { metric: "Compliance", value: scaScore.score, max: 100 },
  ];

  return (
    <div className="flex flex-col gap-4 min-w-0">
      {/* Agent Identity Card */}
      <GlassPanel className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center border"
            style={{
              background: `color-mix(in oklch, ${color}, transparent 85%)`,
              borderColor: `color-mix(in oklch, ${color}, transparent 70%)`,
            }}
          >
            <Monitor className="w-5 h-5" style={{ color }} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-display font-bold text-foreground truncate">
              {agent?.name ?? `Agent ${slot.agentId}`}
            </h3>
            <p className="text-[10px] text-muted-foreground font-mono">
              ID: {slot.agentId} · {agent?.ip ?? "—"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="flex items-center gap-1.5">
            {agent?.status === "active"
              ? <><Wifi className="w-3 h-3 text-green-400" /><span className="text-green-300">Active</span></>
              : <><WifiOff className="w-3 h-3 text-red-400" /><span className="text-red-300">{agent?.status ?? "Unknown"}</span></>
            }
          </div>
          <div className="text-muted-foreground">
            <Server className="w-3 h-3 inline mr-1" />{agent?.os?.name ?? "—"} {agent?.os?.version ?? ""}
          </div>
          <div className="text-muted-foreground">
            v{agent?.version ?? "—"}
          </div>
          <div className="text-muted-foreground font-mono">
            {Array.isArray(agent?.group) ? agent.group.join(", ") : "No group"}
          </div>
        </div>
      </GlassPanel>

      {/* Alert Volume */}
      <GlassPanel className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-display font-bold text-foreground flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-purple-400" /> Alerts
          </h4>
          <span className="text-lg font-mono font-bold" style={{ color }}>{alertLevels.total}</span>
        </div>

        <div className="space-y-2">
          {(["critical", "high", "medium", "low"] as const).map(sev => {
            const count = alertLevels[sev];
            const maxCount = Math.max(...allSlots.map(s => {
              const hits = getAlertHits(s);
              return hits.filter((h: any) => {
                const l = Number(h._source?.rule?.level ?? 0);
                if (sev === "critical") return l >= 12;
                if (sev === "high") return l >= 7 && l < 12;
                if (sev === "medium") return l >= 4 && l < 7;
                return l < 4;
              }).length;
            }), 1);
            return (
              <div key={sev} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-14 capitalize">{sev}</span>
                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(count / maxCount) * 100}%`,
                      background: SEVERITY_COLORS[sev.charAt(0).toUpperCase() + sev.slice(1)] ?? color,
                    }}
                  />
                </div>
                <span className="text-[10px] font-mono text-foreground w-6 text-right">{count}</span>
                {!isBase && baseSlot && (
                  <DiffArrow value={count} baseline={(() => {
                    const bHits = getAlertHits(baseSlot);
                    return bHits.filter((h: any) => {
                      const l = Number(h._source?.rule?.level ?? 0);
                      if (sev === "critical") return l >= 12;
                      if (sev === "high") return l >= 7 && l < 12;
                      if (sev === "medium") return l >= 4 && l < 7;
                      return l < 4;
                    }).length;
                  })()} inverse />
                )}
              </div>
            );
          })}
        </div>
      </GlassPanel>

      {/* Vulnerability Breakdown */}
      <GlassPanel className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-display font-bold text-foreground flex items-center gap-1.5">
            <Bug className="w-3.5 h-3.5 text-orange-400" /> Vulnerabilities
          </h4>
          <span className="text-lg font-mono font-bold" style={{ color }}>{vulnCounts.total}</span>
        </div>

        <div className="space-y-2">
          {(["Critical", "High", "Medium", "Low"] as const).map(sev => {
            const count = (vulnCounts as any)[sev] ?? 0;
            const maxCount = Math.max(...allSlots.map(s => {
              const hits = getVulnHits(s);
              return hits.filter((h: any) => String(h._source?.vulnerability?.severity ?? "") === sev).length;
            }), 1);
            return (
              <div key={sev} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-14">{sev}</span>
                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(count / maxCount) * 100}%`, background: SEVERITY_COLORS[sev] }}
                  />
                </div>
                <span className="text-[10px] font-mono text-foreground w-6 text-right">{count}</span>
                {!isBase && baseSlot && (
                  <DiffArrow
                    value={count}
                    baseline={(() => {
                      const bHits = getVulnHits(baseSlot);
                      return bHits.filter((h: any) => String(h._source?.vulnerability?.severity ?? "") === sev).length;
                    })()}
                    inverse
                  />
                )}
              </div>
            );
          })}
        </div>
      </GlassPanel>

      {/* Compliance Score */}
      <GlassPanel className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-display font-bold text-foreground flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-cyan-400" /> Compliance
          </h4>
          <div className="flex items-center gap-1.5">
            <span className="text-lg font-mono font-bold" style={{ color }}>{scaScore.score}%</span>
            {!isBase && baseSlot && <DiffArrow value={scaScore.score} baseline={(() => {
              const bPolicies = getScaPolicies(baseSlot);
              let p = 0, f = 0;
              for (const pol of bPolicies) { p += Number(pol.pass ?? 0); f += Number(pol.fail ?? 0); }
              const t = p + f;
              return t > 0 ? Math.round((p / t) * 100) : 0;
            })()} />}
          </div>
        </div>

        <div className="flex items-center gap-4 mb-3">
          <div className="flex items-center gap-1 text-[10px]">
            <CheckCircle2 className="w-3 h-3 text-green-400" />
            <span className="text-green-300">{scaScore.pass} pass</span>
          </div>
          <div className="flex items-center gap-1 text-[10px]">
            <XCircle className="w-3 h-3 text-red-400" />
            <span className="text-red-300">{scaScore.fail} fail</span>
          </div>
        </div>

        {/* Score bar */}
        <div className="h-3 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${scaScore.score}%`,
              background: scaScore.score >= 80 ? "oklch(0.765 0.177 163.223)" : scaScore.score >= 50 ? "oklch(0.795 0.184 86.047)" : "oklch(0.637 0.237 25.331)",
            }}
          />
        </div>

        {/* SCA Policies */}
        {scaPolicies.length > 0 && (
          <div className="mt-3 space-y-1">
            {scaPolicies.slice(0, 5).map((p: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground truncate max-w-[70%]">{p.name ?? p.policy_id}</span>
                <span className="font-mono text-foreground">{p.score ?? "—"}%</span>
              </div>
            ))}
          </div>
        )}
      </GlassPanel>

      {/* Radar Chart */}
      <GlassPanel className="p-5">
        <h4 className="text-xs font-display font-bold text-foreground mb-3 flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5 text-purple-400" /> Risk Profile
        </h4>
        <ResponsiveContainer width="100%" height={200}>
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke="oklch(0.3 0.02 286 / 30%)" />
            <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9, fill: "oklch(0.7 0.01 286)" }} />
            <PolarRadiusAxis tick={false} axisLine={false} />
            <Radar
              dataKey="value"
              stroke={color}
              fill={color}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      </GlassPanel>
    </div>
  );
}

// ── Data Fetcher Wrapper ───────────────────────────────────────────────────
function AgentDataColumn({ agentId, index, allSlots, onSlotReady }: {
  agentId: string;
  index: number;
  allSlots: AgentSlot[];
  onSlotReady: (slot: AgentSlot) => void;
}) {
  const agentQ = trpc.wazuh.agentById.useQuery({ agentId }, { retry: false });
  const alertsQ = trpc.indexer.alertsSearch.useQuery({
    agentId, from: "now-7d", to: "now", size: 200, offset: 0, sortField: "timestamp", sortOrder: "desc",
  }, { retry: false });
  const vulnsQ = trpc.indexer.vulnSearch.useQuery({ agentId, size: 200, offset: 0 }, { retry: false });
  const scaQ = trpc.wazuh.scaPolicies.useQuery({ agentId }, { retry: false });

  const agent = (agentQ.data as any)?.data?.affected_items?.[0] ?? null;
  const isLoading = agentQ.isLoading || alertsQ.isLoading || vulnsQ.isLoading || scaQ.isLoading;

  const slot: AgentSlot = useMemo(() => ({
    agentId,
    agent,
    alerts: alertsQ.data,
    vulns: vulnsQ.data,
    sca: scaQ.data,
  }), [agentId, agent, alertsQ.data, vulnsQ.data, scaQ.data]);

  // FIX: Report slot to parent via useEffect (not useMemo) to avoid setState during render
  const onSlotReadyRef = useRef(onSlotReady);
  onSlotReadyRef.current = onSlotReady;
  useEffect(() => {
    if (!isLoading) {
      onSlotReadyRef.current(slot);
    }
  }, [isLoading, slot]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <GlassPanel key={i} className="p-5">
            <div className="animate-pulse space-y-3">
              <div className="h-4 bg-white/5 rounded w-3/4" />
              <div className="h-3 bg-white/5 rounded w-1/2" />
              <div className="h-20 bg-white/5 rounded" />
            </div>
          </GlassPanel>
        ))}
      </div>
    );
  }

  return <AgentColumn slot={slot} index={index} allSlots={allSlots} />;
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function AgentCompare() {
  const [, navigate] = useLocation();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [slots, setSlots] = useState<Record<string, AgentSlot>>({});

  const allSlots = useMemo(() => selectedIds.map(id => slots[id]).filter(Boolean) as AgentSlot[], [selectedIds, slots]);

  const handleSlotReady = (slot: AgentSlot) => {
    setSlots(prev => ({ ...prev, [slot.agentId]: slot }));
  };

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
            <div>
              <h1 className="text-lg font-display font-bold text-foreground">Agent Comparison</h1>
              <p className="text-xs text-muted-foreground">
                Side-by-side analysis of up to 3 agents — vulnerabilities, alerts, and compliance
              </p>
            </div>
          </div>
        </div>

        {/* Agent Selector */}
        <div className="mt-4">
          <AgentSelector
            selectedIds={selectedIds}
            onAdd={(id) => setSelectedIds(prev => prev.length < 3 ? [...prev, id] : prev)}
            onRemove={(id) => {
              setSelectedIds(prev => prev.filter(x => x !== id));
              setSlots(prev => { const n = { ...prev }; delete n[id]; return n; });
            }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedIds.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
              <BarChart3 className="w-8 h-8 text-purple-400/50" />
            </div>
            <h2 className="text-lg font-display font-bold text-foreground mb-2">Select Agents to Compare</h2>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Choose 2 or 3 agents from your fleet to compare their alert volumes, vulnerability counts,
              and compliance scores side by side. Use the selector above to add agents.
            </p>
          </div>
        ) : selectedIds.length === 1 ? (
          <div className="max-w-md mx-auto">
            <AgentDataColumn
              agentId={selectedIds[0]}
              index={0}
              allSlots={allSlots}
              onSlotReady={handleSlotReady}
            />
            <div className="mt-6 text-center">
              <p className="text-xs text-muted-foreground">Add at least one more agent to compare.</p>
            </div>
          </div>
        ) : (
          <div className={`grid gap-6 ${selectedIds.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
            {selectedIds.map((id, i) => (
              <AgentDataColumn
                key={id}
                agentId={id}
                index={i}
                allSlots={allSlots}
                onSlotReady={handleSlotReady}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
