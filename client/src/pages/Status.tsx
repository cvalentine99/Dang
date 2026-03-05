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
} from "lucide-react";

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
  connected: { bg: "oklch(0.765 0.177 163.223 / 15%)", border: "oklch(0.765 0.177 163.223 / 30%)", text: "oklch(0.765 0.177 163.223)", label: "Connected" },
  disconnected: { bg: "oklch(0.637 0.237 25.331 / 15%)", border: "oklch(0.637 0.237 25.331 / 30%)", text: "oklch(0.637 0.237 25.331)", label: "Disconnected" },
  not_configured: { bg: "oklch(0.795 0.184 86.047 / 15%)", border: "oklch(0.795 0.184 86.047 / 30%)", text: "oklch(0.795 0.184 86.047)", label: "Not Configured" },
  error: { bg: "oklch(0.637 0.237 25.331 / 15%)", border: "oklch(0.637 0.237 25.331 / 30%)", text: "oklch(0.637 0.237 25.331)", label: "Error" },
} as const;

const OVERALL_COLORS = {
  healthy: { bg: "oklch(0.765 0.177 163.223 / 12%)", border: "oklch(0.765 0.177 163.223 / 25%)", text: "oklch(0.765 0.177 163.223)", icon: CheckCircle2 },
  degraded: { bg: "oklch(0.795 0.184 86.047 / 12%)", border: "oklch(0.795 0.184 86.047 / 25%)", text: "oklch(0.795 0.184 86.047)", icon: AlertTriangle },
  unhealthy: { bg: "oklch(0.637 0.237 25.331 / 12%)", border: "oklch(0.637 0.237 25.331 / 25%)", text: "oklch(0.637 0.237 25.331)", icon: XCircle },
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
  const color = ms < 200 ? "oklch(0.765 0.177 163.223)" : ms < 500 ? "oklch(0.795 0.184 86.047)" : "oklch(0.637 0.237 25.331)";

  return (
    <div className="flex items-center gap-2 mt-2">
      <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
      <div className="flex-1 h-1.5 rounded-full bg-[oklch(0.2_0.02_286)]">
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
        style={{ borderBottom: `1px solid oklch(0.3 0.04 286 / 20%)` }}
      >
        <StatusIcon status={status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <ServiceIcon className="w-4 h-4 text-[oklch(0.7_0.15_286)]" />
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
        <div className="flex items-center gap-1.5 rounded-lg px-1 py-1" style={{ background: "oklch(0.18 0.03 286 / 60%)", border: "1px solid oklch(0.3 0.04 286 / 30%)" }}>
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
          className="shrink-0 p-2.5 rounded-lg bg-[oklch(0.2_0.03_286/50%)] border border-[oklch(0.3_0.04_286/30%)] hover:bg-[oklch(0.25_0.04_286/60%)] transition-all disabled:opacity-50"
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
              <Server className="w-4 h-4 text-[oklch(0.7_0.15_286)]" />
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
              <Activity className="w-4 h-4 text-[oklch(0.7_0.15_286)]" />
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
              <Users className="w-4 h-4 text-[oklch(0.7_0.15_286)]" />
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
              <Search className="w-4 h-4 text-[oklch(0.7_0.15_286)]" />
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
                      ? "oklch(0.765 0.177 163.223)"
                      : String(data.checks.wazuhIndexer.details.clusterStatus) === "yellow"
                        ? "oklch(0.795 0.184 86.047)"
                        : "oklch(0.637 0.237 25.331)"
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

  const managerStatsQ = trpc.wazuh.managerStats.useQuery(undefined, {
    staleTime: 60_000,
    retry: 1,
  });

  const isLoading = apiInfoQ.isLoading || versionCheckQ.isLoading || securityConfigQ.isLoading;

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-foreground font-[Space_Grotesk] flex items-center gap-2">
        <Info className="w-5 h-5 text-[oklch(0.7_0.15_286)]" />
        Wazuh API Intelligence
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-5">
        {/* API Info — GET / */}
        <GlassPanel className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-[oklch(0.3_0.04_286/20%)]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground font-[Space_Grotesk] flex items-center gap-2">
                <Info className="w-4 h-4 text-[oklch(0.7_0.15_286)]" />
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
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-violet-400" />
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
          <div className="px-5 py-4 border-b border-[oklch(0.3_0.04_286/20%)]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground font-[Space_Grotesk] flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-[oklch(0.7_0.15_286)]" />
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
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-violet-400" />
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
          <div className="px-5 py-4 border-b border-[oklch(0.3_0.04_286/20%)]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground font-[Space_Grotesk] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[oklch(0.7_0.15_286)]" />
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
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-violet-400" />
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
          <div className="px-5 py-4 border-b border-[oklch(0.3_0.04_286/20%)]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground font-[Space_Grotesk] flex items-center gap-2">
                <Activity className="w-4 h-4 text-[oklch(0.7_0.15_286)]" />
                Manager Stats
              </h3>
              {managerStatsQ.data ? <RawJsonViewer data={managerStatsQ.data} title="Manager Stats JSON" /> : null}
            </div>
            <p className="text-xs text-muted-foreground mt-1">GET /manager/stats — Runtime statistics</p>
          </div>
          <BrokerWarnings data={managerStatsQ.data} context="managerStats" />
          <div className="px-5 py-3">
            {managerStatsQ.isLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-violet-400" />
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
    <div className="flex items-center justify-between py-1.5 border-b border-[oklch(0.3_0.04_286/15%)] last:border-0">
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
    <div className="flex items-center justify-between py-1.5 border-b border-[oklch(0.3_0.04_286/15%)] last:border-0">
      <div className="flex items-center gap-2">
        {available ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-[oklch(0.765_0.177_163.223)]" />
        ) : (
          <XCircle className="w-3.5 h-3.5 text-[oklch(0.5_0.02_286)]" />
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
        style={{ color: isRunning ? "oklch(0.765 0.177 163.223)" : "oklch(0.637 0.237 25.331)" }}
      >
        {state}
      </p>
    </div>
  );
}

function DetailCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg px-3 py-2 bg-[oklch(0.15_0.02_286)] border border-[oklch(0.3_0.04_286/20%)]">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p
        className="text-sm font-mono font-medium mt-0.5 capitalize"
        style={{ color: color || "oklch(0.93 0.005 286)" }}
      >
        {value}
      </p>
    </div>
  );
}
