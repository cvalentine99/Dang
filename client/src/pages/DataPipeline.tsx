import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Database, RefreshCw, Play, CheckCircle2, XCircle, Clock, Loader2,
  Globe, Layers, AlertTriangle, Activity, ArrowRight, Info, Shield,
} from "lucide-react";

// ── Layer Config (matches the 4-layer KG model) ────────────────────────────

const LAYER_CONFIG: Record<string, { label: string; icon: typeof Globe; color: string; description: string }> = {
  api_ontology:           { label: "API Ontology",           icon: Globe,           color: "#818cf8", description: "Endpoints, parameters, responses, auth methods, resources" },
  operational_semantics:  { label: "Operational Semantics",  icon: Activity,        color: "#34d399", description: "Use cases, risk classification, LLM access rules" },
  schema_lineage:         { label: "Schema & Field Lineage", icon: Database,        color: "#fbbf24", description: "Index patterns, fields, data types, endpoint→index mapping" },
  error_failure:          { label: "Error & Failure",        icon: AlertTriangle,   color: "#f87171", description: "Error codes, causes, mitigations, affected endpoints" },
};

// ── Sync Status Card ────────────────────────────────────────────────────────

function SyncLayerCard({
  layerName,
  syncStatus,
  isRunning,
}: {
  layerName: string;
  syncStatus?: { lastSyncAt: string | Date | null; entityCount: number; status: string; errorMessage: string | null };
  isRunning: boolean;
}): React.JSX.Element {
  const config = LAYER_CONFIG[layerName] || { label: layerName, icon: Database, color: "#888", description: "" };
  const Icon = config.icon;

  const statusColor = !syncStatus ? "text-muted-foreground" :
    syncStatus.status === "completed" ? "text-green-400" :
    syncStatus.status === "error" ? "text-red-400" :
    syncStatus.status === "syncing" ? "text-blue-400" : "text-muted-foreground";

  const StatusIcon = !syncStatus ? Clock :
    syncStatus.status === "completed" ? CheckCircle2 :
    syncStatus.status === "error" ? XCircle :
    syncStatus.status === "syncing" ? Loader2 : Clock;

  return (
    <div className="glass-panel rounded-xl border border-white/10 p-4 hover:border-white/15 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${config.color}15`, border: `1px solid ${config.color}30` }}
          >
            <Icon className="w-4 h-4" style={{ color: config.color }} />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">{config.label}</h3>
            <p className="text-[10px] text-muted-foreground">{config.description}</p>
          </div>
        </div>
        <div className={`flex items-center gap-1 ${statusColor}`}>
          <StatusIcon className={`w-3.5 h-3.5 ${isRunning || syncStatus?.status === "syncing" ? "animate-spin" : ""}`} />
          <span className="text-[10px] font-mono">
            {isRunning ? "syncing" : syncStatus?.status ?? "never synced"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] text-muted-foreground mb-0.5">Records</p>
          <p className="text-lg font-display font-bold text-foreground">
            {syncStatus?.entityCount?.toLocaleString() ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground mb-0.5">Last Sync</p>
          <p className="text-xs font-mono text-foreground">
            {syncStatus?.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleString() : "Never"}
          </p>
        </div>
      </div>

      {syncStatus?.errorMessage && (
        <div className="mt-3 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-[10px] text-red-300 font-mono">{syncStatus.errorMessage}</p>
        </div>
      )}
    </div>
  );
}

// ── Main Data Pipeline Page ─────────────────────────────────────────────────

export default function DataPipeline(): React.JSX.Element {
  const [isRunning, setIsRunning] = useState(false);
  const [syncResults, setSyncResults] = useState<Record<string, { success: boolean; count: number; error?: string }> | null>(null);

  const syncStatusQuery = trpc.graph.etlStatus.useQuery();
  const graphStatsQuery = trpc.graph.graphStats.useQuery();

  const syncMutation = trpc.graph.etlFullSync.useMutation({
    onMutate: () => {
      setIsRunning(true);
      setSyncResults(null);
    },
    onSuccess: (data: any) => {
      setIsRunning(false);
      setSyncResults(data.results as Record<string, { success: boolean; count: number; error?: string }>);
      syncStatusQuery.refetch();
      graphStatsQuery.refetch();
    },
    onError: () => {
      setIsRunning(false);
    },
  });

  const statusMap: Record<string, { lastSyncAt: string | Date | null; entityCount: number; status: string; errorMessage: string | null }> = {};
  if (syncStatusQuery.data) {
    for (const s of syncStatusQuery.data) {
      statusMap[s.layer] = s;
    }
  }

  const stats = graphStatsQuery.data;
  const totalRecords = stats
    ? (stats.endpoints ?? 0) + (stats.parameters ?? 0) + (stats.responses ?? 0) +
      (stats.authMethods ?? 0) + (stats.resources ?? 0) + (stats.useCases ?? 0) +
      (stats.indices ?? 0) + (stats.fields ?? 0) + (stats.errorPatterns ?? 0)
    : 0;

  const lastSync = syncStatusQuery.data?.length
    ? syncStatusQuery.data.reduce((latest: Date | null, s: { lastSyncAt: string | Date | null }) => {
        if (!s.lastSyncAt) return latest;
        const d = new Date(s.lastSyncAt);
        return !latest || d > latest ? d : latest;
      }, null as Date | null)
    : null;

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
            <Database className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold text-foreground">Data Pipeline</h1>
            <p className="text-xs text-muted-foreground">KG extraction from Wazuh OpenAPI spec</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { syncStatusQuery.refetch(); graphStatsQuery.refetch(); }}
            disabled={syncStatusQuery.isLoading || graphStatsQuery.isLoading}
            className="p-2 rounded-lg border border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
            title="Refresh status"
          >
            <RefreshCw className={`w-4 h-4 ${syncStatusQuery.isLoading || graphStatsQuery.isLoading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-200 hover:bg-purple-500/30 disabled:opacity-50 transition-colors"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Extracting...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Extraction
              </>
            )}
          </button>
        </div>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="glass-panel rounded-xl border border-white/10 px-4 py-3">
          <p className="text-[10px] text-muted-foreground mb-1">Total Records</p>
          <p className="text-2xl font-display font-bold text-foreground">{totalRecords.toLocaleString()}</p>
        </div>
        <div className="glass-panel rounded-xl border border-white/10 px-4 py-3">
          <p className="text-[10px] text-muted-foreground mb-1">KG Layers</p>
          <p className="text-2xl font-display font-bold text-foreground">{Object.keys(LAYER_CONFIG).length}</p>
        </div>
        <div className="glass-panel rounded-xl border border-white/10 px-4 py-3">
          <p className="text-[10px] text-muted-foreground mb-1">Endpoints</p>
          <p className="text-2xl font-display font-bold text-foreground">{stats?.endpoints ?? 0}</p>
        </div>
        <div className="glass-panel rounded-xl border border-white/10 px-4 py-3">
          <p className="text-[10px] text-muted-foreground mb-1">Last Sync</p>
          <p className="text-sm font-mono text-foreground">{lastSync ? lastSync.toLocaleString() : "Never"}</p>
        </div>
      </div>

      {/* Risk breakdown */}
      {stats?.byRiskLevel && (
        <div className="glass-panel rounded-xl border border-white/10 px-4 py-3">
          <p className="text-[10px] text-muted-foreground mb-2 font-medium">Risk Classification</p>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-green-400" />
              <div>
                <p className="text-lg font-display font-bold text-green-400">{stats.byRiskLevel.safe}</p>
                <p className="text-[10px] text-muted-foreground">SAFE (LLM allowed)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              <div>
                <p className="text-lg font-display font-bold text-yellow-400">{stats.byRiskLevel.mutating}</p>
                <p className="text-[10px] text-muted-foreground">MUTATING (LLM blocked)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-400" />
              <div>
                <p className="text-lg font-display font-bold text-red-400">{stats.byRiskLevel.destructive}</p>
                <p className="text-[10px] text-muted-foreground">DESTRUCTIVE (LLM blocked)</p>
              </div>
            </div>
            <div className="h-8 w-px bg-white/10" />
            <div className="flex items-center gap-3">
              {["GET", "POST", "PUT", "DELETE"].map(m => (
                <div key={m} className="text-center">
                  <p className="text-sm font-mono font-bold text-foreground">{stats.byMethod?.[m as keyof typeof stats.byMethod] ?? 0}</p>
                  <p className={`text-[9px] font-mono ${
                    m === "GET" ? "text-green-400" : m === "POST" ? "text-blue-400" : m === "PUT" ? "text-yellow-400" : "text-red-400"
                  }`}>{m}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pipeline flow diagram */}
      <div className="glass-panel rounded-xl border border-white/10 px-4 py-3">
        <p className="text-[10px] text-muted-foreground mb-2 font-medium">Pipeline Flow</p>
        <div className="flex items-center justify-center gap-3 py-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs text-blue-300">Wazuh OpenAPI Spec</span>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
            <Layers className="w-3.5 h-3.5 text-green-400" />
            <span className="text-xs text-green-300">Deterministic Parser</span>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <Database className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs text-purple-300">4-Layer Knowledge Graph</span>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <Shield className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-xs text-orange-300">Trust & Safety Rails</span>
          </div>
        </div>
      </div>

      {/* Sync results banner */}
      {syncResults && (
        <div className="glass-panel rounded-xl border border-white/10 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <p className="text-sm font-medium text-foreground">Extraction Complete</p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(syncResults).map(([key, result]) => (
              <div key={key} className={`px-2.5 py-1.5 rounded-lg border ${result.success ? "bg-green-500/5 border-green-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                <p className="text-[10px] text-muted-foreground">{key}</p>
                <p className={`text-xs font-mono ${result.success ? "text-green-300" : "text-red-300"}`}>
                  {result.success ? `${result.count} records` : result.error || "failed"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Layer cards grid */}
      <div>
        <h2 className="text-sm font-medium text-foreground mb-3">Layer Sync Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.keys(LAYER_CONFIG).map(layerName => (
            <SyncLayerCard
              key={layerName}
              layerName={layerName}
              syncStatus={statusMap[layerName]}
              isRunning={isRunning}
            />
          ))}
        </div>
      </div>

      {/* Info note */}
      <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
        <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs text-blue-300">
            The extraction pipeline parses the Wazuh OpenAPI specification deterministically (no LLMs in ingestion)
            and populates the Knowledge Graph. This enables the analyst tools to query structured API metadata with
            trust scoring and safety rails.
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Each endpoint is classified by risk level (SAFE / MUTATING / DESTRUCTIVE) and gated for LLM access accordingly.
          </p>
        </div>
      </div>
    </div>
  );
}
