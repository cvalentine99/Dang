/**
 * Token Usage Dashboard — LLM inference monitoring and analytics.
 *
 * Displays:
 * - Health status card with live model endpoint status
 * - Aggregate stats cards (total tokens, requests, avg latency, model distribution)
 * - Time-series chart of token usage over time
 * - Recent LLM calls table with model, tokens, latency, source, timestamp
 *
 * Follows the Amethyst Nexus dark theme with glass-morphism panels.
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  Brain,
  Clock,
  Cpu,
  Gauge,
  Hash,
  RefreshCw,
  Server,
  Zap,
  ArrowUpDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type TimeRange = "today" | "7d" | "30d" | "all";
type ChartRange = "24h" | "7d" | "30d";

// ── Stat Card ──────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  color = "text-primary",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  color?: string;
}) {
  return (
    <div className="glass-panel p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className={`h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          {label}
        </span>
      </div>
      <div>
        <p className="text-2xl font-display font-bold text-foreground tabular-nums">
          {value}
        </p>
        {subValue && (
          <p className="text-xs text-muted-foreground mt-1">{subValue}</p>
        )}
      </div>
    </div>
  );
}

// ── Health Status Card ─────────────────────────────────────────────────────

function HealthCard() {
  const health = trpc.llm.healthCheck.useQuery(undefined, {
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  const status = health.data?.status ?? "disabled";
  const latency = health.data?.latencyMs ?? 0;
  const model = health.data?.model ?? "—";
  const endpoint = health.data?.endpoint ?? "—";

  const statusConfig = {
    online: {
      icon: CheckCircle2,
      label: "Online",
      color: "text-emerald-400",
      bg: "bg-emerald-400/10 border-emerald-400/20",
      dot: "bg-emerald-400",
    },
    offline: {
      icon: XCircle,
      label: "Offline",
      color: "text-red-400",
      bg: "bg-red-400/10 border-red-400/20",
      dot: "bg-red-400",
    },
    disabled: {
      icon: AlertTriangle,
      label: "Disabled",
      color: "text-amber-400",
      bg: "bg-amber-400/10 border-amber-400/20",
      dot: "bg-amber-400/60",
    },
  };

  const cfg = statusConfig[status];
  const StatusIcon = cfg.icon;

  return (
    <div className={`glass-panel p-5 border ${cfg.bg}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative">
          <div className={`h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center`}>
            <Brain className={`h-5 w-5 ${cfg.color}`} />
          </div>
          <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ${cfg.dot} border-2 border-background`} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Custom LLM Endpoint</h3>
          <div className="flex items-center gap-1.5 mt-0.5">
            <StatusIcon className={`h-3 w-3 ${cfg.color}`} />
            <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
            {status === "online" && (
              <span className="text-xs text-muted-foreground ml-1">({latency}ms)</span>
            )}
          </div>
        </div>
      </div>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Model</span>
          <span className="text-foreground font-mono truncate max-w-[200px]" title={model}>
            {model}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Endpoint</span>
          <span className="text-foreground font-mono truncate max-w-[200px]" title={endpoint}>
            {endpoint || "Not configured"}
          </span>
        </div>
        {status === "online" && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Latency</span>
            <span className={`font-mono ${latency < 100 ? "text-emerald-400" : latency < 500 ? "text-amber-400" : "text-red-400"}`}>
              {latency}ms
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Mini Bar Chart (pure CSS) ──────────────────────────────────────────────

function MiniBarChart({
  data,
  maxHeight = 80,
}: {
  data: Array<{ bucket: string; totalTokens: number; requests: number }>;
  maxHeight?: number;
}) {
  const maxTokens = Math.max(...data.map((d) => d.totalTokens), 1);

  return (
    <div className="flex items-end gap-[2px] h-full" style={{ minHeight: maxHeight }}>
      {data.map((d, i) => {
        const height = Math.max((d.totalTokens / maxTokens) * maxHeight, 2);
        const isRecent = i >= data.length - 3;
        return (
          <div
            key={d.bucket}
            className="group relative flex-1 min-w-[3px]"
            style={{ height: maxHeight }}
          >
            <div
              className={`absolute bottom-0 w-full rounded-t-sm transition-all ${
                isRecent ? "bg-primary/80" : "bg-primary/40"
              } group-hover:bg-primary`}
              style={{ height }}
            />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
              <div className="glass-panel px-2 py-1 text-[10px] whitespace-nowrap border border-border/50">
                <p className="text-foreground font-mono">{d.totalTokens.toLocaleString()} tokens</p>
                <p className="text-muted-foreground">{d.requests} requests</p>
                <p className="text-muted-foreground">{d.bucket}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Recent Calls Table ─────────────────────────────────────────────────────

function RecentCallsTable() {
  const [page, setPage] = useState(0);
  const pageSize = 15;

  const calls = trpc.llm.recentCalls.useQuery(
    { limit: pageSize, offset: page * pageSize },
    {}
  );

  const rows = calls.data?.calls ?? [];
  const total = calls.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const sourceColors: Record<string, string> = {
    custom: "text-primary bg-primary/10 border-primary/20",
    builtin: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    fallback: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  };

  return (
    <div className="glass-panel overflow-hidden">
      <div className="p-4 border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Recent LLM Calls</h3>
          <span className="text-xs text-muted-foreground">({total} total)</span>
        </div>
        <button
          onClick={() => calls.refetch()}
          className="h-7 w-7 rounded-md flex items-center justify-center hover:bg-primary/10 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${calls.isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/20">
              <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Time</th>
              <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Model</th>
              <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Source</th>
              <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Prompt</th>
              <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Completion</th>
              <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Total</th>
              <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Latency</th>
              <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Caller</th>
              <th className="text-center px-4 py-2.5 text-muted-foreground font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Gauge className="h-8 w-8 text-muted-foreground/30" />
                    <p>No LLM calls recorded yet</p>
                    <p className="text-xs">Usage data will appear here as the agentic pipeline and AI assistant process queries</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/10 hover:bg-primary/5 transition-colors"
                >
                  <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap font-mono">
                    {new Date(row.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-foreground max-w-[180px] truncate" title={row.model}>
                    {row.model.split("/").pop() ?? row.model}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                        sourceColors[row.source] ?? "text-muted-foreground"
                      }`}
                    >
                      {row.source}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-foreground tabular-nums">
                    {row.promptTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-foreground tabular-nums">
                    {row.completionTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-primary font-semibold tabular-nums">
                    {row.totalTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    <span
                      className={
                        row.latencyMs < 1000
                          ? "text-emerald-400"
                          : row.latencyMs < 5000
                          ? "text-amber-400"
                          : "text-red-400"
                      }
                    >
                      {row.latencyMs < 1000
                        ? `${row.latencyMs}ms`
                        : `${(row.latencyMs / 1000).toFixed(1)}s`}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[120px]" title={row.caller ?? ""}>
                    {row.caller ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {row.success ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mx-auto" />
                    ) : (
                      <span title={row.errorMessage ?? "Failed"}>
                        <XCircle className="h-3.5 w-3.5 text-red-400 mx-auto" />
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="p-3 border-t border-border/30 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-1 text-xs rounded hover:bg-primary/10 disabled:opacity-30 text-muted-foreground transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 text-xs rounded hover:bg-primary/10 disabled:opacity-30 text-muted-foreground transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function TokenUsage() {
  const [statsRange, setStatsRange] = useState<TimeRange>("today");
  const [chartRange, setChartRange] = useState<ChartRange>("24h");

  const stats = trpc.llm.usageStats.useQuery(
    { range: statsRange },
    { refetchInterval: 60_000 }
  );

  const history = trpc.llm.usageHistory.useQuery(
    { range: chartRange },
    { refetchInterval: 60_000 }
  );

  const s = stats.data;
  const chartData = history.data ?? [];

  const rangeOptions: { value: TimeRange; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "7d", label: "7 Days" },
    { value: "30d", label: "30 Days" },
    { value: "all", label: "All Time" },
  ];

  const chartRangeOptions: { value: ChartRange; label: string }[] = [
    { value: "24h", label: "24h" },
    { value: "7d", label: "7d" },
    { value: "30d", label: "30d" },
  ];

  return (
    <div className="space-y-6 max-w-[2400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-foreground flex items-center gap-3">
            <Gauge className="h-7 w-7 text-primary" />
            Token Usage
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            LLM inference monitoring — track token consumption, latency, and model health
          </p>
        </div>
        <div className="flex items-center gap-1 glass-panel p-1">
          {rangeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatsRange(opt.value)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                statsRange === opt.value
                  ? "bg-primary/20 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-primary/5"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top row: Health + Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <HealthCard />
        <StatCard
          icon={Hash}
          label="Total Requests"
          value={s?.totalRequests?.toLocaleString() ?? "0"}
          subValue={
            s
              ? `${Number(s.customEndpointRequests ?? 0).toLocaleString()} custom · ${Number(s.builtInRequests ?? 0).toLocaleString()} built-in`
              : undefined
          }
        />
        <StatCard
          icon={Zap}
          label="Total Tokens"
          value={formatTokenCount(Number(s?.totalTokens ?? 0))}
          subValue={
            s
              ? `${formatTokenCount(Number(s.totalPromptTokens ?? 0))} prompt · ${formatTokenCount(Number(s.totalCompletionTokens ?? 0))} completion`
              : undefined
          }
          color="text-violet-400"
        />
        <StatCard
          icon={Clock}
          label="Avg Latency"
          value={`${Number(s?.avgLatencyMs ?? 0).toLocaleString()}ms`}
          subValue={
            Number(s?.avgLatencyMs ?? 0) < 1000
              ? "Excellent response time"
              : Number(s?.avgLatencyMs ?? 0) < 5000
              ? "Acceptable response time"
              : "High latency — check model load"
          }
          color={
            Number(s?.avgLatencyMs ?? 0) < 1000
              ? "text-emerald-400"
              : Number(s?.avgLatencyMs ?? 0) < 5000
              ? "text-amber-400"
              : "text-red-400"
          }
        />
        <StatCard
          icon={ArrowUpDown}
          label="Fallbacks"
          value={Number(s?.fallbackCount ?? 0).toLocaleString()}
          subValue="Custom endpoint failures recovered via built-in LLM"
          color={Number(s?.fallbackCount ?? 0) > 0 ? "text-amber-400" : "text-emerald-400"}
        />
      </div>

      {/* Chart */}
      <div className="glass-panel p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Token Usage Over Time</h3>
          </div>
          <div className="flex items-center gap-1 bg-background/50 rounded-md p-0.5">
            {chartRangeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setChartRange(opt.value)}
                className={`px-2.5 py-1 text-[11px] rounded transition-colors ${
                  chartRange === opt.value
                    ? "bg-primary/20 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Activity className="h-10 w-10 text-muted-foreground/20 mb-3" />
            <p className="text-sm">No usage data for this time range</p>
            <p className="text-xs mt-1">Token usage will appear here as LLM calls are made</p>
          </div>
        ) : (
          <div className="h-[200px]">
            <MiniBarChart data={chartData} maxHeight={200} />
          </div>
        )}

        {chartData.length > 0 && (
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/20">
            <span className="text-[10px] text-muted-foreground">
              {chartData.length} data points · {chartData.reduce((sum, d) => sum + d.requests, 0)} total requests
            </span>
            <span className="text-[10px] text-muted-foreground">
              Peak: {formatTokenCount(Math.max(...chartData.map((d) => d.totalTokens)))} tokens
            </span>
          </div>
        )}
      </div>

      {/* Recent Calls Table */}
      <RecentCallsTable />
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toLocaleString();
}
