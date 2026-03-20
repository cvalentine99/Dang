import React, { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/shared/PageHeader";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { RawJsonViewer } from "@/components/shared/RawJsonViewer";
import { BrokerWarnings } from "@/components/shared/BrokerWarnings";
import { Button } from "@/components/ui/button";
import {
  Database,
  Shield,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Settings2,
  Clock,
  Wifi,
  WifiOff,
  RefreshCw,
  Server,
  Lock,
  Users,
  Activity,
  Zap,
  Timer,
  TimerOff,
  Info,
  ShieldCheck,
  GitBranch,
  type LucideIcon,
  X,
  ChevronLeft,
  ChevronRight,
  Layers,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { TableSkeleton } from "@/components/shared/TableSkeleton";

// ── Auto-Refresh Intervals ──────────────────────────────────────────────────

const REFRESH_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "15s", value: 15 },
  { label: "30s", value: 30 },
  { label: "60s", value: 60 },
  { label: "5m", value: 300 },
] as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface ServiceCheck {
  status: "connected" | "disconnected" | "not_configured" | "error";
  latencyMs?: number;
  details?: Record<string, string | number | boolean | null | Record<string, string>>;
  error?: string;
}

interface StatusResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  totalLatencyMs: number;
  authMode: string;
  version: string;
  nodeEnv: string;
  checks: {
    database?: ServiceCheck;
    wazuhManager?: ServiceCheck;
    wazuhIndexer?: ServiceCheck;
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  connected: { bg: "oklch(0.765 0.177 163.223 / 15%)", border: "oklch(0.765 0.177 163.223 / 30%)", text: "oklch(0.723 0.219 149.579)", label: "Connected" },
  disconnected: { bg: "oklch(0.637 0.237 25.331 / 15%)", border: "oklch(0.637 0.237 25.331 / 30%)", text: "oklch(0.628 0.258 29.234)", label: "Disconnected" },
  not_configured: { bg: "oklch(0.795 0.184 86.047 / 15%)", border: "oklch(0.795 0.184 86.047 / 30%)", text: "oklch(0.769 0.188 70.08)", label: "Not Configured" },
  error: { bg: "oklch(0.637 0.237 25.331 / 15%)", border: "oklch(0.637 0.237 25.331 / 30%)", text: "oklch(0.628 0.258 29.234)", label: "Error" },
} as const;

const OVERALL_COLORS = {
  healthy: { bg: "oklch(0.765 0.177 163.223 / 12%)", border: "oklch(0.765 0.177 163.223 / 25%)", text: "oklch(0.723 0.219 149.579)", icon: CheckCircle2 },
  degraded: { bg: "oklch(0.795 0.184 86.047 / 12%)", border: "oklch(0.795 0.184 86.047 / 25%)", text: "oklch(0.769 0.188 70.08)", icon: AlertTriangle },
  unhealthy: { bg: "oklch(0.637 0.237 25.331 / 12%)", border: "oklch(0.637 0.237 25.331 / 25%)", text: "oklch(0.628 0.258 29.234)", icon: XCircle },
} as const;

// ── Status Icon Component ────────────────────────────────────────────────────

function StatusIcon({ status }: { status: ServiceCheck["status"] }): React.JSX.Element {
  const colors = STATUS_COLORS[status];
  const Icon = status === "connected" ? Wifi : status === "not_configured" ? Settings2 : WifiOff;

  return (
    <div
      className="relative w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
    >
      <Icon className="w-5 h-5" style={{ color: colors.text }} />
      {status === "connected" && (
        <span
          className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-pulse"
          style={{ background: colors.text, boxShadow: `0 0 8px ${colors.text}` }}
        />
      )}
    </div>
  );
}

// ── Latency Bar ──────────────────────────────────────────────────────────────

function LatencyBar({ ms }: { ms?: number }): React.JSX.Element | null {
  if (ms === undefined) return null;
  const maxMs = 2000;
  const pct = Math.min((ms / maxMs) * 100, 100);
  const color = ms < 200 ? "oklch(0.723 0.219 149.579)" : ms < 500 ? "oklch(0.769 0.188 70.08)" : "oklch(0.628 0.258 29.234)";

  return (
    <div className="flex items-center gap-2 mt-2">
      <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
      <div className="flex-1 h-1.5 rounded-full bg-[oklch(0.2_0.01_260)]">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-xs font-mono shrink-0" style={{ color }}>{ms}ms</span>
    </div>
  );
}

// ── Service Card ─────────────────────────────────────────────────────────────

function ServiceCard({
  title,
  description,
  icon: ServiceIcon,
  check,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  check?: ServiceCheck;
}): React.JSX.Element {
  const status = check?.status ?? "not_configured";
  const colors = STATUS_COLORS[status];

  return (
    <GlassPanel className="p-0 overflow-hidden">
      {/* Header with status indicator */}
      <div
        className="px-5 py-4 flex items-start gap-4"
        style={{ borderBottom: `1px solid oklch(0.3 0.01 260 / 20%)` }}
      >
        <StatusIcon status={status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <ServiceIcon className="w-4 h-4 text-[oklch(0.795_0.184_85)]" />
            <h3 className="text-sm font-semibold text-foreground font-[Space_Grotesk]">{title}</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          <div className="flex items-center gap-2 mt-2">
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider"
              style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: colors.text }} />
              {colors.label}
            </span>
          </div>
        </div>
      </div>

      {/* Details section */}
      <div className="px-5 py-3 space-y-2">
        <LatencyBar ms={check?.latencyMs} />

        {check?.error && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-[oklch(0.637_0.237_25.331/8%)] border border-[oklch(0.637_0.237_25.331/15%)]">
            <p className="text-xs font-mono text-[oklch(0.637_0.237_25.331)] break-all leading-relaxed">
              {check.error}
            </p>
          </div>
        )}

        {check?.details && Object.keys(check.details).length > 0 && (
          <div className="mt-2 space-y-1">
            {Object.entries(check.details)
              .filter(([, value]) => typeof value !== "object" || value === null)
              .map(([key, value]) => (
                <div key={key} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</span>
                  <span className="font-mono text-foreground">{String(value as string | number | boolean)}</span>
                </div>
              ))}
          </div>
        )}

        {status === "not_configured" && (
          <p className="text-xs text-[oklch(0.795_0.184_86.047/80%)] italic">
            Set the required environment variables to enable this service.
          </p>
        )}
      </div>
    </GlassPanel>
  );
}

// ── Main Status Page ─────────────────────────────────────────────────────────

export default function Status() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(0); // seconds, 0 = off
  const [countdown, setCountdown] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/status");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json: StatusResponse = await resp.json();
      setData(json);
      setLastChecked(new Date());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-refresh interval
  useEffect(() => {
    // Clear existing timers
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    intervalRef.current = null;
    countdownRef.current = null;

    if (refreshInterval > 0) {
      setCountdown(refreshInterval);

      // Countdown ticker (every second)
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => (prev <= 1 ? refreshInterval : prev - 1));
      }, 1000);

      // Actual refresh
      intervalRef.current = setInterval(() => {
        fetchStatus();
        setCountdown(refreshInterval);
      }, refreshInterval * 1000);
    } else {
      setCountdown(0);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [refreshInterval, fetchStatus]);

  const overallStyle = data ? OVERALL_COLORS[data.status] : OVERALL_COLORS.unhealthy;
  const OverallIcon = overallStyle.icon;

  const connectedCount = data
    ? (Object.values(data.checks) as Array<ServiceCheck | undefined>).filter((c) => c?.status === "connected").length
    : 0;
  const totalChecks = data ? Object.keys(data.checks).length : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Status"
        subtitle="Connection health, latency, and configuration overview"
        onRefresh={fetchStatus}
        isLoading={isLoading}
      >
        {/* Auto-refresh control */}
        <div className="flex items-center gap-1.5 rounded-lg px-1 py-1" style={{ background: "oklch(0.18 0.03 60 / 60%)", border: "1px solid oklch(0.3 0.01 260 / 30%)" }}>
          {refreshInterval > 0 ? (
            <Timer className="w-3.5 h-3.5 ml-2 text-primary animate-pulse" />
          ) : (
            <TimerOff className="w-3.5 h-3.5 ml-2 text-muted-foreground" />
          )}
          {REFRESH_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={refreshInterval === opt.value ? "default" : "ghost"}
              size="sm"
              onClick={() => setRefreshInterval(opt.value)}
              className={`h-7 px-2.5 text-xs font-mono ${
                refreshInterval === opt.value
                  ? "bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </Button>
          ))}
          {refreshInterval > 0 && (
            <span className="text-[10px] font-mono text-muted-foreground ml-1 mr-2 tabular-nums">
              {countdown}s
            </span>
          )}
        </div>
      </PageHeader>

      {/* Overall Status Banner */}
      <div
        className="rounded-xl p-5 flex items-center gap-5 transition-all"
        style={{
          background: overallStyle.bg,
          border: `1px solid ${overallStyle.border}`,
        }}
        role="status"
        aria-live="polite"
        aria-label={`System status: ${data?.status ?? "checking"}`}
      >
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${overallStyle.text}20`, border: `1px solid ${overallStyle.text}30` }}
        >
          <OverallIcon className="w-7 h-7" style={{ color: overallStyle.text }} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2
              className="text-xl font-bold font-[Space_Grotesk] uppercase tracking-wider"
              style={{ color: overallStyle.text }}
            >
              {data?.status ?? "Checking..."}
            </h2>
            {data && (
              <span className="text-xs text-muted-foreground font-mono">
                ({connectedCount}/{totalChecks} services connected)
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.status === "healthy"
              ? "All configured services are reachable and responding normally."
              : data?.status === "degraded"
                ? "Some services are unreachable or returning errors. Check individual cards below."
                : data
                  ? "Critical services are down. Immediate attention required."
                  : "Running connectivity checks..."}
          </p>
          {lastChecked && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Last checked: {lastChecked.toLocaleTimeString()} ({data?.totalLatencyMs}ms total)
            </p>
          )}
        </div>
        <button
          onClick={fetchStatus}
          disabled={isLoading}
          className="shrink-0 p-2.5 rounded-lg bg-[oklch(0.2_0.03_60/50%)] border border-[oklch(0.3_0.01_260/30%)] hover:bg-[oklch(0.25_0.04_60/60%)] transition-all disabled:opacity-50"
          aria-label="Refresh system status"
        >
          <RefreshCw className={`w-4 h-4 text-muted-foreground ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && !data && (
        <GlassPanel className="border-[oklch(0.637_0.237_25.331/30%)]">
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-[oklch(0.637_0.237_25.331)]" />
            <div>
              <p className="text-sm font-medium text-[oklch(0.637_0.237_25.331)]">
                Failed to reach status endpoint
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">{error}</p>
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Service Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5" aria-live="polite" aria-label="Service connection status">
        <ServiceCard
          title="MySQL Database"
          description="Primary data store for users, notes, baselines, and saved searches"
          icon={Database}
          check={data?.checks.database}
        />
        <ServiceCard
          title="Wazuh Manager API"
          description="REST API for agents, alerts, vulnerabilities, compliance, and FIM data"
          icon={Shield}
          check={data?.checks.wazuhManager}
        />
        <ServiceCard
          title="Wazuh Indexer"
          description="OpenSearch/Elasticsearch for SIEM events, search, and aggregations"
          icon={Search}
          check={data?.checks.wazuhIndexer}
        />
      </div>

      {/* Configuration Summary */}
      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Environment Info */}
          <GlassPanel>
            <h3 className="text-sm font-semibold text-foreground font-[Space_Grotesk] mb-4 flex items-center gap-2">
              <Server className="w-4 h-4 text-[oklch(0.795_0.184_85)]" />
              Environment
            </h3>
            <div className="space-y-3">
              <ConfigRow label="Auth Mode" value="Local (JWT + bcrypt)" icon={Lock} />
              <ConfigRow label="Environment" value={data.nodeEnv} icon={Settings2} />
              <ConfigRow label="Version" value={data.version} icon={Activity} />
              <ConfigRow
                label="Total Check Time"
                value={`${data.totalLatencyMs}ms`}
                icon={Zap}
              />
            </div>
          </GlassPanel>

          {/* Feature Availability */}
          <GlassPanel>
            <h3 className="text-sm font-semibold text-foreground font-[Space_Grotesk] mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-[oklch(0.795_0.184_85)]" />
              Feature Availability
            </h3>
            <div className="space-y-2">
              <FeatureRow
                label="Agent Health & Fleet Command"
                available={data.checks.wazuhManager?.status === "connected"}
                source="Wazuh Manager"
              />
              <FeatureRow
                label="Alerts Timeline & SIEM Events"
                available={data.checks.wazuhManager?.status === "connected" || data.checks.wazuhIndexer?.status === "connected"}
                source="Manager + Indexer"
              />
              <FeatureRow
                label="Vulnerability Management"
                available={data.checks.wazuhManager?.status === "connected"}
                source="Wazuh Manager"
              />
              <FeatureRow
                label="MITRE ATT&CK Coverage"
                available={data.checks.wazuhManager?.status === "connected"}
                source="Wazuh Manager"
              />
              <FeatureRow
                label="Compliance Posture"
                available={data.checks.wazuhManager?.status === "connected"}
                source="Wazuh Manager"
              />
              <FeatureRow
                label="Analyst Notes & Saved Searches"
                available={data.checks.database?.status === "connected"}
                source="Database"
              />
              <FeatureRow
                label="User Authentication"
                available={data.checks.database?.status === "connected"}
                source="Database"
              />
            </div>
          </GlassPanel>
        </div>
      )}

      {/* Wazuh Manager Daemon Details */}
      {data?.checks.wazuhManager?.status === "connected" &&
        data.checks.wazuhManager.details?.daemons && (
          <GlassPanel>
            <h3 className="text-sm font-semibold text-foreground font-[Space_Grotesk] mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-[oklch(0.795_0.184_85)]" />
              Wazuh Manager Daemons
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {Object.entries(
                data.checks.wazuhManager.details.daemons as Record<string, string>
              ).map(([daemon, state]) => (
                <DaemonCard key={daemon} name={daemon} state={state} />
              ))}
            </div>
          </GlassPanel>
        )}

      {/* Wazuh Indexer Cluster Details */}
      {data?.checks.wazuhIndexer?.status === "connected" &&
        data.checks.wazuhIndexer.details && (
          <GlassPanel>
            <h3 className="text-sm font-semibold text-foreground font-[Space_Grotesk] mb-4 flex items-center gap-2">
              <Search className="w-4 h-4 text-[oklch(0.795_0.184_85)]" />
              Indexer Cluster Details
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {data.checks.wazuhIndexer.details.clusterName != null ? (
                <DetailCard label="Cluster Name" value={String(data.checks.wazuhIndexer.details.clusterName)} />
              ) : null}
              {data.checks.wazuhIndexer.details.clusterStatus != null ? (
                <DetailCard
                  label="Cluster Status"
                  value={String(data.checks.wazuhIndexer.details.clusterStatus)}
                  color={
                    String(data.checks.wazuhIndexer.details.clusterStatus) === "green"
                      ? "oklch(0.723 0.219 149.579)"
                      : String(data.checks.wazuhIndexer.details.clusterStatus) === "yellow"
                        ? "oklch(0.769 0.188 70.08)"
                        : "oklch(0.628 0.258 29.234)"
                  }
                />
              ) : null}
              {data.checks.wazuhIndexer.details.numberOfNodes !== undefined ? (
                <DetailCard label="Nodes" value={String(data.checks.wazuhIndexer.details.numberOfNodes)} />
              ) : null}
              {data.checks.wazuhIndexer.details.activeShards !== undefined ? (
                <DetailCard label="Active Shards" value={String(data.checks.wazuhIndexer.details.activeShards)} />
              ) : null}
            </div>
          </GlassPanel>
        )}

      {/* ── Wazuh API Intelligence ─────────────────────────────────────── */}
      <WazuhApiIntelligence />
    </div>
  );
}

// ── Wazuh API Intelligence Component ────────────────────────────────────────

function WazuhApiIntelligence() {
  const apiInfoQ = trpc.wazuh.apiInfo.useQuery(undefined, {
    staleTime: 60_000,
    retry: 1,
  });

  const versionCheckQ = trpc.wazuh.managerVersionCheck.useQuery(undefined, {
    staleTime: 60_000,
    retry: 1,
  });

  const securityConfigQ = trpc.wazuh.securityConfig.useQuery(undefined, {
    staleTime: 60_000,
    retry: 1,
  });

  // Manager stats date picker
  const [statsDate, setStatsDate] = useState("");

  // Task status filters
  const [taskPage, setTaskPage] = useState(0);
  const [taskStatusFilter, setTaskStatusFilter] = useState("");
  const [taskModule, setTaskModule] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const taskPageSize = 25;

  const managerStatsQ = trpc.wazuh.managerStats.useQuery(
    statsDate ? { date: statsDate } : undefined,
    { staleTime: 60_000, retry: 1 }
  );

  const isConfiguredQ = trpc.wazuh.isConfigured.useQuery(undefined, {
    staleTime: 60_000,
    retry: 1,
  });

  const [compConfigComponent, setCompConfigComponent] = useState("agent");
  const [compConfigConfiguration, setCompConfigConfiguration] = useState("internal");


  const managerCompConfigQ = trpc.wazuh.managerComponentConfig.useQuery(
    { component: compConfigComponent, configuration: compConfigConfiguration },
    { staleTime: 60_000, retry: 1 }
  );

  const agentsUninstallPermQ = trpc.wazuh.agentsUninstallPermission.useQuery(undefined, {
    staleTime: 120_000,
    retry: 1,
  });

  const taskStatusQ = trpc.wazuh.taskStatus.useQuery(
    {
      offset: taskPage * taskPageSize,
      limit: taskPageSize,
      ...(taskStatusFilter ? { status: taskStatusFilter } : {}),
      ...(taskModule ? { module: taskModule } : {}),
      ...(taskSearch ? { search: taskSearch } : {}),
    },
    { staleTime: 60_000, retry: 1 }
  );

  const isLoading = apiInfoQ.isLoading || versionCheckQ.isLoading || securityConfigQ.isLoading;

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-foreground font-[Space_Grotesk] flex items-center gap-2">
        <Info className="w-5 h-5 text-[oklch(0.795_0.184_85)]" />
        Wazuh API Intelligence
      </h2>

      {/* Config Validation Panel */}
      <GlassPanel className="mb-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" /> Configuration Validation
            <span className="text-[10px] font-mono text-muted-foreground">(isConfigured)</span>
          </h3>
          <div className="flex items-center gap-2">
            {isConfiguredQ.data ? <RawJsonViewer data={isConfiguredQ.data as Record<string, unknown>} title="Config Validation JSON" /> : null}
          </div>
        </div>
        {isConfiguredQ.isLoading ? (
          <div className="animate-pulse h-6 bg-white/5 rounded w-48" />
        ) : isConfiguredQ.isError ? (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
            <p className="text-xs text-red-300">{isConfiguredQ.error.message}</p>
          </div>
        ) : isConfiguredQ.data ? (
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium ${
              (isConfiguredQ.data as Record<string, unknown>).configured
                ? "bg-[oklch(0.765_0.177_163.223/10%)] border-[oklch(0.765_0.177_163.223/20%)] text-[oklch(0.765_0.177_163.223)]"
                : "bg-[oklch(0.637_0.237_25.331/10%)] border-[oklch(0.637_0.237_25.331/20%)] text-[oklch(0.637_0.237_25.331)]"
            }`}>
              {(isConfiguredQ.data as Record<string, unknown>).configured ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
              {(isConfiguredQ.data as Record<string, unknown>).configured ? "Configured" : "Not Configured"}
            </div>
            {(isConfiguredQ.data as Record<string, unknown>).host ? (
              <span className="text-xs font-mono text-muted-foreground">
                Host: {String((isConfiguredQ.data as Record<string, unknown>).host)}
                :{String((isConfiguredQ.data as Record<string, unknown>).port ?? "55000")}
              </span>
            ) : null}
          </div>
        ) : null}
      </GlassPanel>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-5">
        {/* API Info — GET / */}
        <GlassPanel className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-[oklch(0.3_0.01_260/20%)]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground font-[Space_Grotesk] flex items-center gap-2">
                <Info className="w-4 h-4 text-[oklch(0.795_0.184_85)]" />
                API Info
              </h3>
              {apiInfoQ.data ? <RawJsonViewer data={apiInfoQ.data} title="API Info JSON" /> : null}
            </div>
            <p className="text-xs text-muted-foreground mt-1">GET / — Root endpoint metadata</p>
          </div>
          <BrokerWarnings data={apiInfoQ.data} context="apiInfo" />
          <div className="px-5 py-3">
            {apiInfoQ.isLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-400" />
              </div>
            ) : apiInfoQ.isError ? (
              <div className="flex items-center gap-2 text-red-400 text-xs">
                <XCircle className="w-4 h-4" />
                <span>{apiInfoQ.error.message}</span>
              </div>
            ) : apiInfoQ.data ? (
              <div className="space-y-2">
                {extractKeyValues(apiInfoQ.data).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground capitalize">{formatKey(key)}</span>
                    <span className="font-mono text-foreground truncate max-w-[60%] text-right">{String(value)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No data available</p>
            )}
          </div>
        </GlassPanel>

        {/* Version Check — GET /manager/version/check */}
        <GlassPanel className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-[oklch(0.3_0.01_260/20%)]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground font-[Space_Grotesk] flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-[oklch(0.795_0.184_85)]" />
                Version Check
              </h3>
              {versionCheckQ.data ? <RawJsonViewer data={versionCheckQ.data} title="Version Check JSON" /> : null}
            </div>
            <p className="text-xs text-muted-foreground mt-1">GET /manager/version/check — CTI version status</p>
          </div>
          <BrokerWarnings data={versionCheckQ.data} context="managerVersionCheck" />
          <div className="px-5 py-3">
            {versionCheckQ.isLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-400" />
              </div>
            ) : versionCheckQ.isError ? (
              <div className="flex items-center gap-2 text-red-400 text-xs">
                <XCircle className="w-4 h-4" />
                <span>{versionCheckQ.error.message}</span>
              </div>
            ) : versionCheckQ.data ? (
              <div className="space-y-2">
                {extractKeyValues(versionCheckQ.data).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground capitalize">{formatKey(key)}</span>
                    <span className="font-mono text-foreground truncate max-w-[60%] text-right">{String(value)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No data available</p>
            )}
          </div>
        </GlassPanel>

        {/* Security Config — GET /security/config */}
        <GlassPanel className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-[oklch(0.3_0.01_260/20%)]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground font-[Space_Grotesk] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[oklch(0.795_0.184_85)]" />
                Security Config
              </h3>
              {securityConfigQ.data ? <RawJsonViewer data={securityConfigQ.data} title="Security Config JSON" /> : null}
            </div>
            <p className="text-xs text-muted-foreground mt-1">GET /security/config — Auth & RBAC settings</p>
          </div>
          <BrokerWarnings data={securityConfigQ.data} context="securityConfig" />
          <div className="px-5 py-3">
            {securityConfigQ.isLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-400" />
              </div>
            ) : securityConfigQ.isError ? (
              <div className="flex items-center gap-2 text-red-400 text-xs">
                <XCircle className="w-4 h-4" />
                <span>{securityConfigQ.error.message}</span>
              </div>
            ) : securityConfigQ.data ? (
              <div className="space-y-2">
                {extractKeyValues(securityConfigQ.data).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground capitalize">{formatKey(key)}</span>
                    <span className="font-mono text-foreground truncate max-w-[60%] text-right">{String(value)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No data available</p>
            )}
          </div>
        </GlassPanel>
        {/* Manager Stats — GET /manager/stats */}
        <GlassPanel className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-[oklch(0.3_0.01_260/20%)]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground font-[Space_Grotesk] flex items-center gap-2">
                <Activity className="w-4 h-4 text-[oklch(0.795_0.184_85)]" />
                Manager Stats
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Date:</span>
                <Input
                  type="date"
                  value={statsDate}
                  onChange={(e) => setStatsDate(e.target.value)}
                  className="h-7 w-36 text-[11px] bg-secondary/20 border-border/30"
                />
                {statsDate && (
                  <button onClick={() => setStatsDate("")} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                )}
                {managerStatsQ.data ? <RawJsonViewer data={managerStatsQ.data} title="Manager Stats JSON" /> : null}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">GET /manager/stats — Runtime statistics</p>
          </div>
          <BrokerWarnings data={managerStatsQ.data} context="managerStats" />
          <div className="px-5 py-3">
            {managerStatsQ.isLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-400" />
              </div>
            ) : managerStatsQ.isError ? (
              <div className="flex items-center gap-2 text-red-400 text-xs">
                <XCircle className="w-4 h-4" />
                <span>{managerStatsQ.error.message}</span>
              </div>
            ) : managerStatsQ.data ? (
              <div className="space-y-2">
                {extractKeyValues(managerStatsQ.data).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground capitalize">{formatKey(key)}</span>
                    <span className="font-mono text-foreground truncate max-w-[60%] text-right">{String(value)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No data available</p>
            )}
          </div>
        </GlassPanel>
      </div>

      {/* Manager Component Config */}
      <GlassPanel>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" /> Manager Component Config
            <span className="text-[10px] font-mono text-muted-foreground">(GET /manager/configuration/{'{component}'}/{'{configuration}'})</span>
          </h3>
          <div className="flex items-center gap-2">
            {managerCompConfigQ.data ? <RawJsonViewer data={managerCompConfigQ.data as Record<string, unknown>} title="Manager Component Config JSON" /> : null}
          </div>
        </div>
        <BrokerWarnings data={managerCompConfigQ.data} context="managerComponentConfig" />
        <div className="flex items-center gap-2 mb-3">
          <select
            value={compConfigComponent}
            onChange={(e) => setCompConfigComponent(e.target.value)}
            className="h-8 px-3 rounded-lg bg-secondary/30 border border-border/30 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            {["agent", "agentless", "analysis", "auth", "com", "csyslogd", "integratord", "logcollector", "mail", "monitor", "request", "syscheck", "wmodules"].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={compConfigConfiguration}
            onChange={(e) => setCompConfigConfiguration(e.target.value)}
            className="h-8 px-3 rounded-lg bg-secondary/30 border border-border/30 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            {["internal", "global", "logging", "cluster", "active-response", "alerts", "command", "decoders", "localfile", "remote", "rootcheck", "rules", "syscheck", "wmodules"].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        {managerCompConfigQ.isLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-400" />
          </div>
        ) : managerCompConfigQ.isError ? (
          <div className="flex items-center gap-2 text-red-400 text-xs">
            <XCircle className="w-4 h-4" />
            <span>{managerCompConfigQ.error.message}</span>
          </div>
        ) : managerCompConfigQ.data ? (
          <pre className="bg-black/30 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-auto max-h-[300px] whitespace-pre-wrap">
            {JSON.stringify(managerCompConfigQ.data, null, 2)}
          </pre>
        ) : (
          <p className="text-xs text-muted-foreground italic">No data available</p>
        )}
      </GlassPanel>

      {/* Agents Uninstall Permission + Task Status row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <GlassPanel>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" /> Agents Uninstall Permission
              <span className="text-[10px] font-mono text-muted-foreground">(GET /agents/uninstall)</span>
            </h3>
            {agentsUninstallPermQ.data ? <RawJsonViewer data={agentsUninstallPermQ.data as Record<string, unknown>} title="Uninstall Permission JSON" /> : null}
          </div>
          <BrokerWarnings data={agentsUninstallPermQ.data} context="agentsUninstallPermission" />
          {agentsUninstallPermQ.isLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-400" />
            </div>
          ) : agentsUninstallPermQ.isError ? (
            <div className="flex items-center gap-2 text-red-400 text-xs">
              <XCircle className="w-4 h-4" />
              <span>{agentsUninstallPermQ.error.message}</span>
            </div>
          ) : agentsUninstallPermQ.data ? (
            <pre className="bg-black/30 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-auto max-h-[200px] whitespace-pre-wrap">
              {JSON.stringify(agentsUninstallPermQ.data, null, 2)}
            </pre>
          ) : (
            <p className="text-xs text-muted-foreground italic">No data available</p>
          )}
        </GlassPanel>

        <GlassPanel>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Task Status
              <span className="text-[10px] font-mono text-muted-foreground">(GET /tasks/status)</span>
            </h3>
            {taskStatusQ.data ? <RawJsonViewer data={taskStatusQ.data as Record<string, unknown>} title="Task Status JSON" /> : null}
          </div>
          <div className="flex items-center gap-3 mb-3">
            <Input
              placeholder="Search tasks..."
              value={taskSearch}
              onChange={(e) => { setTaskSearch(e.target.value); setTaskPage(0); }}
              className="h-7 w-40 text-xs bg-secondary/20 border-border/30"
            />
            <select
              value={taskStatusFilter}
              onChange={(e) => { setTaskStatusFilter(e.target.value); setTaskPage(0); }}
              className="h-7 text-xs bg-secondary/20 border border-border/30 rounded px-2 text-foreground"
            >
              <option value="">All Statuses</option>
              <option value="In progress">In progress</option>
              <option value="Done">Done</option>
              <option value="Failed">Failed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            <select
              value={taskModule}
              onChange={(e) => { setTaskModule(e.target.value); setTaskPage(0); }}
              className="h-7 text-xs bg-secondary/20 border border-border/30 rounded px-2 text-foreground"
            >
              <option value="">All Modules</option>
              <option value="upgrade_module">Upgrade</option>
              <option value="api">API</option>
            </select>
          </div>
          <BrokerWarnings data={taskStatusQ.data} context="taskStatus" />
          {taskStatusQ.isLoading ? (
            <TableSkeleton columns={6} rows={5} />
          ) : taskStatusQ.isError ? (
            <div className="flex items-center gap-2 text-red-400 text-xs">
              <XCircle className="w-4 h-4" />
              <span>{taskStatusQ.error.message}</span>
            </div>
          ) : taskStatusQ.data ? (() => {
            const raw = taskStatusQ.data as Record<string, unknown>;
            const d = (raw?.data ?? raw) as Record<string, unknown>;
            const items = (d?.affected_items ?? d?.items ?? []) as Array<Record<string, unknown>>;
            const total = Number(d?.total_affected_items ?? d?.total ?? items.length);
            const totalPages = Math.max(1, Math.ceil(total / taskPageSize));
            return (
              <>
                {items.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    <Layers className="h-6 w-6 mx-auto mb-2 opacity-40" />
                    No tasks found
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/30">
                          {["Task ID", "Agent", "Command", "Module", "Status", "Create Time"].map(h => (
                            <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((task, i) => (
                          <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                            <td className="py-1.5 px-3 font-mono text-primary">{String(task.task_id ?? "\u2014")}</td>
                            <td className="py-1.5 px-3 font-mono text-muted-foreground">{String(task.agent_id ?? "\u2014")}</td>
                            <td className="py-1.5 px-3 text-foreground">{String(task.command ?? "\u2014")}</td>
                            <td className="py-1.5 px-3 text-muted-foreground">{String(task.module ?? "\u2014")}</td>
                            <td className="py-1.5 px-3">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                String(task.status) === "Done" ? "bg-emerald-500/10 text-emerald-400" :
                                String(task.status) === "Failed" ? "bg-red-500/10 text-red-400" :
                                String(task.status) === "In progress" ? "bg-amber-500/10 text-amber-400" :
                                "bg-secondary/30 text-muted-foreground"
                              }`}>
                                {String(task.status ?? "\u2014")}
                              </span>
                            </td>
                            <td className="py-1.5 px-3 text-muted-foreground font-mono">{String(task.create_time ?? "\u2014")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/10">
                    <span className="text-xs text-muted-foreground">{total} total tasks</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setTaskPage(p => Math.max(0, p - 1))}
                        disabled={taskPage === 0}
                        className="p-1 rounded hover:bg-secondary/30 disabled:opacity-30 transition-colors"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="text-xs text-muted-foreground">Page {taskPage + 1} of {totalPages}</span>
                      <button
                        onClick={() => setTaskPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={taskPage >= totalPages - 1}
                        className="p-1 rounded hover:bg-secondary/30 disabled:opacity-30 transition-colors"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            );
          })() : (
            <p className="text-xs text-muted-foreground italic">No data available</p>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}

/** Extract flat key-value pairs from a Wazuh response, skipping nested objects and _brokerWarnings */
function extractKeyValues(data: unknown): [string, string | number | boolean][] {
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  // If there's a nested data.data or data.data.affected_items, unwrap
  const inner = (obj.data && typeof obj.data === "object")
    ? (obj.data as Record<string, unknown>)
    : obj;
  const result: [string, string | number | boolean][] = [];
  for (const [key, value] of Object.entries(inner)) {
    if (key === "_brokerWarnings" || key === "error") continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      // Flatten one level of nested objects
      for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
        if (subValue !== null && subValue !== undefined && typeof subValue !== "object") {
          result.push([`${key}.${subKey}`, subValue as string | number | boolean]);
        }
      }
    } else if (Array.isArray(value)) {
      result.push([key, `[${value.length} items]`]);
    } else {
      result.push([key, value as string | number | boolean]);
    }
  }
  return result.slice(0, 20); // Cap at 20 rows
}

/** Format a camelCase or dot-separated key into a human-readable label */
function formatKey(key: string): string {
  return key
    .replace(/\./g, " \u203A ")
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim();
}

// ── Helper Components ────────────────────────────────────────────────────────

function ConfigRow({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[oklch(0.3_0.01_260/15%)] last:border-0">
      <span className="text-xs text-muted-foreground flex items-center gap-2">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </span>
      <span className="text-xs font-mono text-foreground capitalize">{value}</span>
    </div>
  );
}

function FeatureRow({ label, available, source }: { label: string; available: boolean; source: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[oklch(0.3_0.01_260/15%)] last:border-0">
      <div className="flex items-center gap-2">
        {available ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-[oklch(0.765_0.177_163.223)]" />
        ) : (
          <XCircle className="w-3.5 h-3.5 text-[oklch(0.5_0.02_60)]" />
        )}
        <span className={`text-xs ${available ? "text-foreground" : "text-muted-foreground"}`}>
          {label}
        </span>
      </div>
      <span className="text-[10px] text-muted-foreground font-mono">{source}</span>
    </div>
  );
}

function DaemonCard({ name, state }: { name: string; state: string }) {
  const isRunning = state === "running";
  return (
    <div
      className="rounded-lg px-3 py-2 text-center"
      style={{
        background: isRunning ? "oklch(0.765 0.177 163.223 / 8%)" : "oklch(0.637 0.237 25.331 / 8%)",
        border: `1px solid ${isRunning ? "oklch(0.765 0.177 163.223 / 20%)" : "oklch(0.637 0.237 25.331 / 20%)"}`,
      }}
    >
      <p className="text-[10px] font-mono text-muted-foreground truncate" title={name}>
        {name.replace("wazuh-", "")}
      </p>
      <p
        className="text-xs font-medium mt-0.5 capitalize"
        style={{ color: isRunning ? "oklch(0.723 0.219 149.579)" : "oklch(0.628 0.258 29.234)" }}
      >
        {state}
      </p>
    </div>
  );
}

function DetailCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg px-3 py-2 bg-[oklch(0.15_0.02_60)] border border-[oklch(0.3_0.01_260/20%)]">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p
        className="text-sm font-mono font-medium mt-0.5 capitalize"
        style={{ color: color || "oklch(0.95 0.005 85)" }}
      >
        {value}
      </p>
    </div>
  );
}
