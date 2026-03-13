/**
 * Broker Param Playground — test query params against any broker config.
 *
 * Analysts can select a config, enter arbitrary params, and see the broker
 * result (forwarded, unsupported, errors) without making any Wazuh API call.
 *
 * Features:
 * - Param presets: one-click common query patterns per config
 * - Copy as cURL: generate Wazuh API cURL command from validated params
 */

import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/shared/PageHeader";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Trash2,
  Plus,
  Info,
  Copy,
  Terminal,
  Bookmark,
  Zap,
  X,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────────────

interface ParamEntry {
  id: string;
  key: string;
  value: string;
}

interface PlaygroundResult {
  configName: string;
  endpoint: string;
  forwardedQuery: Record<string, string | number | boolean>;
  recognizedParams: string[];
  unsupportedParams: string[];
  errors: string[];
  paramDefs: Array<{
    key: string;
    wazuhName: string;
    type: string;
    description: string;
    aliases: string[];
  }>;
}

// ── Presets ──────────────────────────────────────────────────────────────────

interface Preset {
  name: string;
  description: string;
  params: Record<string, string>;
}

interface PresetGroup {
  /** Config name pattern (exact match or "startsWith" prefix) */
  match: (configName: string) => boolean;
  presets: Preset[];
}

const PRESET_GROUPS: PresetGroup[] = [
  {
    match: (n) => n === "AGENTS_CONFIG",
    presets: [
      {
        name: "Active agents (sorted by name)",
        description: "List all active agents sorted alphabetically by name",
        params: { status: "active", sort: "+name", limit: "50" },
      },
      {
        name: "Disconnected agents",
        description: "Find agents that have lost connection",
        params: { status: "disconnected", sort: "-lastKeepAlive", limit: "100" },
      },
      {
        name: "Never connected",
        description: "Agents registered but never checked in",
        params: { status: "never_connected", sort: "+dateAdd", limit: "50" },
      },
      {
        name: "Agents by OS (Windows)",
        description: "Filter agents running Windows",
        params: { "os.platform": "windows", sort: "+name", limit: "50" },
      },
      {
        name: "Agents by OS (Linux)",
        description: "Filter agents running Linux",
        params: { "os.platform": "linux", sort: "+name", limit: "50" },
      },
      {
        name: "Search by IP",
        description: "Find agents by IP address pattern",
        params: { search: "192.168", sort: "+ip", limit: "50" },
      },
      {
        name: "Outdated agents",
        description: "Agents sorted by oldest version first",
        params: { status: "active", sort: "+version", limit: "50" },
      },
    ],
  },
  {
    match: (n) => n === "ALERTS_CONFIG" || n === "MANAGER_LOGS_CONFIG",
    presets: [
      {
        name: "Critical alerts",
        description: "Show only high-severity alerts (level >= 12)",
        params: { sort: "-timestamp", limit: "50", search: "level:12" },
      },
      {
        name: "Recent errors",
        description: "Recent error-level log entries",
        params: { type_log: "error", sort: "-timestamp", limit: "100" },
      },
      {
        name: "Authentication events",
        description: "Filter for authentication-related entries",
        params: { search: "authentication", sort: "-timestamp", limit: "50" },
      },
    ],
  },
  {
    match: (n) => n === "RULES_CONFIG",
    presets: [
      {
        name: "High-level rules (≥12)",
        description: "Rules with severity level 12 or higher",
        params: { level: "12-15", sort: "-level", limit: "50" },
      },
      {
        name: "MITRE-mapped rules",
        description: "Rules that have MITRE ATT&CK technique mappings",
        params: { search: "mitre", sort: "+id", limit: "100" },
      },
      {
        name: "PCI DSS rules",
        description: "Rules tagged with PCI DSS requirements",
        params: { pci_dss: "10.6.1", sort: "+id", limit: "50" },
      },
    ],
  },
  {
    match: (n) => n === "VULNERABILITY_CONFIG",
    presets: [
      {
        name: "Critical CVEs",
        description: "Vulnerabilities with critical severity",
        params: { severity: "Critical", sort: "-cvss", limit: "50" },
      },
      {
        name: "High severity",
        description: "High-severity vulnerabilities sorted by CVSS",
        params: { severity: "High", sort: "-cvss", limit: "100" },
      },
      {
        name: "Pending remediation",
        description: "Vulnerabilities awaiting fix",
        params: { status: "VALID", sort: "-severity", limit: "50" },
      },
    ],
  },
  {
    match: (n) => n === "SYSCHECK_CONFIG",
    presets: [
      {
        name: "Recent file changes",
        description: "Most recently modified files",
        params: { sort: "-date", limit: "50" },
      },
      {
        name: "Hash mismatches",
        description: "Files with changed hashes",
        params: { search: "changed", sort: "-date", limit: "50" },
      },
    ],
  },
  {
    match: (n) => n === "SCA_CONFIG" || n === "SCA_CHECKS_CONFIG",
    presets: [
      {
        name: "Failed checks",
        description: "Compliance checks that failed",
        params: { result: "failed", sort: "+id", limit: "100" },
      },
      {
        name: "Not applicable",
        description: "Checks marked as not applicable",
        params: { result: "not applicable", sort: "+id", limit: "50" },
      },
    ],
  },
  {
    match: (n) => n === "ROOTCHECK_CONFIG",
    presets: [
      {
        name: "Outstanding issues",
        description: "Rootcheck findings that are still outstanding",
        params: { status: "outstanding", sort: "-event", limit: "50" },
      },
      {
        name: "PCI DSS findings",
        description: "Rootcheck results tagged with PCI DSS",
        params: { pci_dss: "2.2", sort: "+event", limit: "50" },
      },
    ],
  },
  {
    match: (n) => n === "DECODERS_CONFIG",
    presets: [
      {
        name: "Custom decoders",
        description: "User-defined decoders (not built-in)",
        params: { relative_dirname: "etc/decoders", sort: "+name", limit: "50" },
      },
      {
        name: "Search decoder by name",
        description: "Find decoders matching a name pattern",
        params: { search: "syslog", sort: "+name", limit: "50" },
      },
    ],
  },
  {
    match: (n) => n === "MITRE_REFERENCES_CONFIG",
    presets: [
      {
        name: "All MITRE references",
        description: "Full list of MITRE technique references",
        params: { sort: "+id", limit: "100" },
      },
    ],
  },
  {
    match: (n) => n.startsWith("SECURITY_"),
    presets: [
      {
        name: "All entries (paginated)",
        description: "List all entries with pagination",
        params: { sort: "+id", limit: "50", offset: "0" },
      },
      {
        name: "Search by name",
        description: "Find entries by name pattern",
        params: { search: "admin", sort: "+name", limit: "50" },
      },
    ],
  },
  {
    match: (n) => n.startsWith("EXP_SYSCOLLECTOR_"),
    presets: [
      {
        name: "All agents (paginated)",
        description: "Cross-agent syscollector data",
        params: { sort: "+agent_id", limit: "50", offset: "0" },
      },
    ],
  },
  {
    match: (n) => n.startsWith("SYSCOLLECTOR_"),
    presets: [
      {
        name: "Full inventory",
        description: "Complete syscollector data for the agent",
        params: { sort: "+scan.time", limit: "100" },
      },
    ],
  },
  // Universal fallback — always matches
  {
    match: () => true,
    presets: [
      {
        name: "Paginated (50)",
        description: "First 50 results sorted by default",
        params: { limit: "50", offset: "0" },
      },
      {
        name: "Paginated (100)",
        description: "First 100 results",
        params: { limit: "100", offset: "0" },
      },
      {
        name: "Wait for cluster sync",
        description: "Include wait_for_complete for cluster consistency",
        params: { wait_for_complete: "true", limit: "50" },
      },
    ],
  },
];

function getPresetsForConfig(configName: string): Preset[] {
  const presets: Preset[] = [];
  const seen = new Set<string>();
  for (const group of PRESET_GROUPS) {
    if (group.match(configName)) {
      for (const p of group.presets) {
        if (!seen.has(p.name)) {
          seen.add(p.name);
          presets.push(p);
        }
      }
    }
  }
  return presets;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function buildCurlCommand(
  endpoint: string,
  forwardedQuery: Record<string, string | number | boolean>,
  wazuhHost?: string,
): string {
  const host = wazuhHost || "https://<WAZUH_HOST>:55000";
  const queryParts: string[] = [];
  for (const [k, v] of Object.entries(forwardedQuery)) {
    queryParts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  const qs = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
  const url = `${host}${endpoint}${qs}`;

  const lines = [
    `curl -k -X GET \\`,
    `  "${url}" \\`,
    `  -H "Authorization: Bearer <JWT_TOKEN>" \\`,
    `  -H "Content-Type: application/json"`,
  ];
  return lines.join("\n");
}

function ResultBadge({ type, count }: { type: "forwarded" | "unsupported" | "error"; count: number }) {
  const variants = {
    forwarded: { className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
    unsupported: { className: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: AlertTriangle },
    error: { className: "bg-red-500/20 text-red-400 border-red-500/30", icon: XCircle },
  };
  const v = variants[type];
  const Icon = v.icon;
  return (
    <Badge variant="outline" className={`text-[10px] font-mono gap-1 ${v.className}`}>
      <Icon className="h-3 w-3" />
      {count} {type}
    </Badge>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    string: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    number: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
    boolean: "bg-purple-500/20 text-purple-400 border-purple-500/30",
    enum: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  };
  return (
    <Badge variant="outline" className={`text-[9px] font-mono ${colors[type] || colors.string}`}>
      {type}
    </Badge>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function BrokerPlayground() {
  const [, navigate] = useLocation();
  const { data: configs, isLoading } = trpc.wazuh.brokerConfigList.useQuery();
  const playgroundMutation = trpc.wazuh.brokerPlayground.useMutation();

  const [selectedConfig, setSelectedConfig] = useState<string>("");
  const [searchFilter, setSearchFilter] = useState("");
  const [params, setParams] = useState<ParamEntry[]>([
    { id: generateId(), key: "", value: "" },
  ]);
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [showCurl, setShowCurl] = useState(false);

  // Context from Broker Coverage deep-link
  const [coverageContext, setCoverageContext] = useState<{
    procedure?: string;
    wazuhPath?: string;
    wiringLevel?: string;
    config?: string;
  } | null>(null);

  // Deep-link: auto-select config from URL query param (?config=CONFIG_NAME)
  // Also consume optional context params (procedure, wazuhPath, wiringLevel)
  useEffect(() => {
    if (!configs) return;
    const urlParams = new URLSearchParams(window.location.search);
    const preselect = urlParams.get("config");
    const procedure = urlParams.get("procedure");
    const wazuhPath = urlParams.get("wazuhPath");
    const wiringLevel = urlParams.get("wiringLevel");

    // Build context if any coverage params are present
    if ((preselect || procedure) && !selectedConfig) {
      if (procedure || wazuhPath || wiringLevel) {
        setCoverageContext({
          procedure: procedure || undefined,
          wazuhPath: wazuhPath || undefined,
          wiringLevel: wiringLevel || undefined,
          config: preselect || undefined,
        });
      }

      if (preselect) {
        const match = configs.find(c => c.name === preselect);
        if (match) {
          setSelectedConfig(match.name);
        }
      }

      // Clean up the URL without navigation
      const url = new URL(window.location.href);
      url.search = "";
      window.history.replaceState({}, "", url.pathname);
    }
  }, [configs, selectedConfig]);

  // Filtered configs for the dropdown
  const filteredConfigs = useMemo(() => {
    if (!configs) return [];
    if (!searchFilter) return configs;
    const lower = searchFilter.toLowerCase();
    return configs.filter(
      c => c.name.toLowerCase().includes(lower) || c.endpoint.toLowerCase().includes(lower)
    );
  }, [configs, searchFilter]);

  // Currently selected config details
  const activeConfig = useMemo(() => {
    return configs?.find(c => c.name === selectedConfig);
  }, [configs, selectedConfig]);

  // Presets for the selected config
  const presets = useMemo(() => {
    if (!selectedConfig) return [];
    return getPresetsForConfig(selectedConfig);
  }, [selectedConfig]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function addParam() {
    setParams(prev => [...prev, { id: generateId(), key: "", value: "" }]);
  }

  function removeParam(id: string) {
    setParams(prev => prev.filter(p => p.id !== id));
  }

  function updateParam(id: string, field: "key" | "value", val: string) {
    setParams(prev => prev.map(p => p.id === id ? { ...p, [field]: val } : p));
  }

  function prefillParam(key: string) {
    // Add a new param row with the key pre-filled
    setParams(prev => [...prev, { id: generateId(), key, value: "" }]);
  }

  function applyPreset(preset: Preset) {
    const entries: ParamEntry[] = Object.entries(preset.params).map(([key, value]) => ({
      id: generateId(),
      key,
      value,
    }));
    // Always keep at least one empty row at the end for manual additions
    entries.push({ id: generateId(), key: "", value: "" });
    setParams(entries);
    setResult(null);
    toast.success(`Preset "${preset.name}" applied`);
  }

  function clearAll() {
    setParams([{ id: generateId(), key: "", value: "" }]);
    setResult(null);
    setShowCurl(false);
  }

  async function runTest() {
    if (!selectedConfig) {
      toast.error("Select a broker config first");
      return;
    }

    // Build the params object from the entries
    const paramObj: Record<string, unknown> = {};
    for (const p of params) {
      if (p.key.trim()) {
        // Try to parse as number or boolean
        const v = p.value.trim();
        if (v === "true") paramObj[p.key.trim()] = true;
        else if (v === "false") paramObj[p.key.trim()] = false;
        else if (v !== "" && !isNaN(Number(v))) paramObj[p.key.trim()] = Number(v);
        else paramObj[p.key.trim()] = v;
      }
    }

    try {
      const res = await playgroundMutation.mutateAsync({
        configName: selectedConfig,
        params: paramObj,
      });
      setResult(res);
      setShowCurl(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(message);
    }
  }

  function copyForwardedQuery() {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result.forwardedQuery, null, 2));
    toast.success("Forwarded query copied to clipboard");
  }

  function copyCurlCommand() {
    if (!result) return;
    const curl = buildCurlCommand(result.endpoint, result.forwardedQuery);
    navigator.clipboard.writeText(curl);
    toast.success("cURL command copied to clipboard");
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-[2400px] mx-auto">
        <PageHeader
          title="Broker Param Playground"
          subtitle="Loading broker configs..."
        />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <GlassPanel key={i} className="h-64 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[2400px] mx-auto">
        <PageHeader
          title="Broker Param Playground"
          subtitle="Test query parameters against any broker config without making Wazuh API calls. Pure server-side validation."
      />

      {/* ── Context banner from Broker Coverage deep-link ── */}
      {coverageContext && (
        <GlassPanel className="flex items-center gap-3 p-3 border-cyan-500/20">
          <button
            onClick={() => navigate("/admin/broker-coverage")}
            className="flex items-center gap-1.5 text-[11px] text-cyan-400/70 hover:text-cyan-400 transition-colors shrink-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Coverage
          </button>
          <div className="h-4 w-px bg-white/10 shrink-0" />
          <div className="flex items-center gap-2 flex-wrap flex-1 text-[11px]">
            {coverageContext.procedure && (
              <span className="font-mono text-foreground/90 font-medium">
                {coverageContext.procedure}
              </span>
            )}
            {coverageContext.config && coverageContext.procedure && (
              <span className="text-muted-foreground/40">via</span>
            )}
            {coverageContext.config && (
              <span className="font-mono text-[10px] text-violet-400/80">{coverageContext.config}</span>
            )}
            {coverageContext.wazuhPath && (
              <span className="font-mono text-[10px] text-muted-foreground/60">{coverageContext.wazuhPath}</span>
            )}
            {coverageContext.wiringLevel && (
              <Badge variant="outline" className={`text-[9px] font-mono ${
                coverageContext.wiringLevel === "broker"
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                  : coverageContext.wiringLevel === "manual"
                    ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                    : "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"
              }`}>
                {coverageContext.wiringLevel}
              </Badge>
            )}
          </div>
          <button
            onClick={() => setCoverageContext(null)}
            className="text-muted-foreground/40 hover:text-foreground transition-colors p-1 rounded hover:bg-white/5 shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </GlassPanel>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* ── Left: Config Selector + Param Reference ── */}
        <div className="xl:col-span-4 space-y-4">
          {/* Config selector */}
          <GlassPanel className="p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Select Broker Config
            </h3>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter configs..."
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                className="pl-8 bg-transparent border-white/10 text-sm h-8"
              />
            </div>
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-1">
                {filteredConfigs.map(c => (
                  <button
                    key={c.name}
                    onClick={() => {
                      setSelectedConfig(c.name);
                      setResult(null);
                      setShowCurl(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors ${
                      selectedConfig === c.name
                        ? "bg-primary/20 text-primary border border-primary/30"
                        : "hover:bg-white/5 text-muted-foreground"
                    }`}
                  >
                    <div className="font-mono font-medium truncate">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground/60 truncate mt-0.5">
                      {c.endpoint} · {c.paramCount} params
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </GlassPanel>

          {/* Presets for selected config */}
          {selectedConfig && presets.length > 0 && (
            <GlassPanel className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Bookmark className="h-3.5 w-3.5 text-violet-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Quick Presets
                </h3>
                <Badge variant="outline" className="text-[9px] font-mono border-violet-500/30 text-violet-400 bg-violet-500/10">
                  {presets.length}
                </Badge>
              </div>
              <ScrollArea className="max-h-[250px]">
                <div className="space-y-1.5">
                  {presets.map((preset, i) => (
                    <TooltipProvider key={`${preset.name}-${i}`}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => applyPreset(preset)}
                            className="w-full text-left px-3 py-2 rounded-md hover:bg-violet-500/10 transition-colors group border border-transparent hover:border-violet-500/20"
                          >
                            <div className="flex items-center gap-2">
                              <Zap className="h-3 w-3 text-violet-400/60 group-hover:text-violet-400 transition-colors shrink-0" />
                              <span className="text-[11px] text-foreground/80 group-hover:text-foreground transition-colors truncate">
                                {preset.name}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1.5 ml-5">
                              {Object.entries(preset.params).map(([k, v]) => (
                                <span key={k} className="text-[9px] font-mono text-muted-foreground/50 bg-white/5 rounded px-1.5 py-0.5">
                                  {k}={v}
                                </span>
                              ))}
                            </div>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[300px]">
                          <p className="text-xs">{preset.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
              </ScrollArea>
            </GlassPanel>
          )}

          {/* Param reference for selected config */}
          {activeConfig && (
            <GlassPanel className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Accepted Parameters
                </h3>
                <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                  {activeConfig.paramCount} params
                </Badge>
              </div>
              <p className="font-mono text-[11px] text-violet-400/80">{activeConfig.endpoint}</p>
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-1.5">
                  {activeConfig.params.map(p => (
                    <TooltipProvider key={p.key}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => prefillParam(p.key)}
                            className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-white/5 transition-colors group"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] text-foreground group-hover:text-primary transition-colors">
                                {p.key}
                              </span>
                              <TypeBadge type={p.type} />
                              {p.key !== p.wazuhName && (
                                <span className="text-[9px] text-muted-foreground/50">
                                  → {p.wazuhName}
                                </span>
                              )}
                              <Plus className="h-3 w-3 text-muted-foreground/20 group-hover:text-primary/60 transition-colors ml-auto shrink-0" />
                            </div>
                            {p.aliases.length > 0 && (
                              <div className="text-[9px] text-muted-foreground/40 mt-0.5">
                                aliases: {p.aliases.join(", ")}
                              </div>
                            )}
                            {p.enumValues && p.enumValues.length > 0 && (
                              <div className="flex flex-wrap gap-0.5 mt-1 ml-0">
                                {p.enumValues.slice(0, 6).map(v => (
                                  <span key={v} className="text-[8px] font-mono text-amber-400/60 bg-amber-500/5 rounded px-1 py-0.5 border border-amber-500/10">
                                    {v}
                                  </span>
                                ))}
                                {p.enumValues.length > 6 && (
                                  <span className="text-[8px] text-muted-foreground/40">+{p.enumValues.length - 6} more</span>
                                )}
                              </div>
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[300px]">
                          <p className="text-xs">{p.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
              </ScrollArea>
            </GlassPanel>
          )}
        </div>

        {/* ── Center: Input Params ── */}
        <div className="xl:col-span-4 space-y-4">
          <GlassPanel className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Test Parameters
              </h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearAll}
                  className="h-7 text-[10px] border-white/10 text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addParam}
                  className="h-7 text-[10px] border-white/10 text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Param
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {params.map((p, i) => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/40 w-4 text-right font-mono">
                    {i + 1}
                  </span>
                  <Input
                    placeholder="key"
                    value={p.key}
                    onChange={e => updateParam(p.id, "key", e.target.value)}
                    className="bg-transparent border-white/10 text-xs font-mono h-8 flex-1"
                  />
                  <ArrowRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                  {(() => {
                    const paramDef = activeConfig?.params.find(pd => pd.key === p.key);
                    const enumVals = paramDef?.enumValues;
                    if (enumVals && enumVals.length > 0 && enumVals.length <= 30) {
                      return (
                        <div className="flex-1 flex gap-1">
                          <Select
                            value={p.value || "__placeholder__"}
                            onValueChange={v => updateParam(p.id, "value", v === "__placeholder__" ? "" : v)}
                          >
                            <SelectTrigger className="bg-transparent border-white/10 text-xs font-mono h-8 flex-1">
                              <SelectValue placeholder="select..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-[250px]">
                              {enumVals.map(v => (
                                <SelectItem key={v} value={v} className="text-xs font-mono">
                                  {v}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="or type..."
                            value={p.value}
                            onChange={e => updateParam(p.id, "value", e.target.value)}
                            className="bg-transparent border-white/10 text-xs font-mono h-8 w-24"
                          />
                        </div>
                      );
                    }
                    if (paramDef?.type === "boolean") {
                      return (
                        <Select
                          value={p.value || "__placeholder__"}
                          onValueChange={v => updateParam(p.id, "value", v === "__placeholder__" ? "" : v)}
                        >
                          <SelectTrigger className="bg-transparent border-white/10 text-xs font-mono h-8 flex-1">
                            <SelectValue placeholder="select..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true" className="text-xs font-mono">true</SelectItem>
                            <SelectItem value="false" className="text-xs font-mono">false</SelectItem>
                          </SelectContent>
                        </Select>
                      );
                    }
                    return (
                      <Input
                        placeholder="value"
                        value={p.value}
                        onChange={e => updateParam(p.id, "value", e.target.value)}
                        className="bg-transparent border-white/10 text-xs font-mono h-8 flex-1"
                      />
                    );
                  })()}
                  <button
                    onClick={() => removeParam(p.id)}
                    className="text-muted-foreground/30 hover:text-red-400 transition-colors"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <Button
              onClick={runTest}
              disabled={!selectedConfig || playgroundMutation.isPending}
              className="w-full bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30"
            >
              <Play className="h-4 w-4 mr-2" />
              {playgroundMutation.isPending ? "Running..." : "Test Broker Params"}
            </Button>

            {selectedConfig && (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
                <Info className="h-3 w-3" />
                <span>
                  Testing against <span className="font-mono text-violet-400/60">{selectedConfig}</span> — no Wazuh API call is made
                </span>
              </div>
            )}
          </GlassPanel>
        </div>

        {/* ── Right: Results ── */}
        <div className="xl:col-span-4 space-y-4">
          {result ? (
            <>
              {/* Summary badges */}
              <GlassPanel className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Broker Result
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <ResultBadge type="forwarded" count={result.recognizedParams.length} />
                    <ResultBadge type="unsupported" count={result.unsupportedParams.length} />
                    <ResultBadge type="error" count={result.errors.length} />
                  </div>
                </div>
                <p className="font-mono text-[11px] text-violet-400/80">
                  {result.endpoint}
                </p>
              </GlassPanel>

              {/* Forwarded query */}
              <GlassPanel className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400/80">
                    Forwarded Query
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={copyForwardedQuery}
                            className="text-muted-foreground/40 hover:text-foreground transition-colors p-1 rounded hover:bg-white/5"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-xs">Copy JSON</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setShowCurl(prev => !prev)}
                            className={`p-1 rounded transition-colors ${
                              showCurl
                                ? "text-violet-400 bg-violet-500/10"
                                : "text-muted-foreground/40 hover:text-foreground hover:bg-white/5"
                            }`}
                          >
                            <Terminal className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-xs">Toggle cURL</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
                <ScrollArea className="max-h-[200px]">
                  <pre className="text-[11px] font-mono text-emerald-400/90 bg-emerald-500/5 rounded-md p-3 border border-emerald-500/10">
                    {Object.keys(result.forwardedQuery).length > 0
                      ? JSON.stringify(result.forwardedQuery, null, 2)
                      : "{ }  // No params forwarded"}
                  </pre>
                </ScrollArea>
              </GlassPanel>

              {/* cURL command */}
              {showCurl && (
                <GlassPanel className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-3.5 w-3.5 text-violet-400" />
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-violet-400/80">
                        cURL Command
                      </h3>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={copyCurlCommand}
                      className="h-6 text-[10px] border-violet-500/20 text-violet-400 hover:bg-violet-500/10 gap-1"
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                    </Button>
                  </div>
                  <ScrollArea className="max-h-[200px]">
                    <pre className="text-[11px] font-mono text-violet-300/90 bg-violet-500/5 rounded-md p-3 border border-violet-500/10 whitespace-pre-wrap break-all">
                      {buildCurlCommand(result.endpoint, result.forwardedQuery)}
                    </pre>
                  </ScrollArea>
                  <div className="flex items-center gap-2 text-[9px] text-muted-foreground/40">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span>
                      Replace <code className="font-mono text-violet-400/50">&lt;WAZUH_HOST&gt;</code> and{" "}
                      <code className="font-mono text-violet-400/50">&lt;JWT_TOKEN&gt;</code> with your actual values.
                      Token is never exposed by Dang.
                    </span>
                  </div>
                </GlassPanel>
              )}

              {/* Recognized params */}
              {result.recognizedParams.length > 0 && (
                <GlassPanel className="p-4 space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400/80">
                    Recognized ({result.recognizedParams.length})
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {result.recognizedParams.map(p => (
                      <Badge key={p} variant="outline" className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </GlassPanel>
              )}

              {/* Unsupported params */}
              {result.unsupportedParams.length > 0 && (
                <GlassPanel className="p-4 space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400/80">
                    Unsupported ({result.unsupportedParams.length})
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {result.unsupportedParams.map(p => (
                      <Badge key={p} variant="outline" className="text-[10px] font-mono bg-amber-500/10 text-amber-400 border-amber-500/20">
                        {p}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground/50">
                    These params were provided but are not in the endpoint config. They will be silently dropped.
                  </p>
                </GlassPanel>
              )}

              {/* Errors */}
              {result.errors.length > 0 && (
                <GlassPanel className="p-4 space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-red-400/80">
                    Validation Errors ({result.errors.length})
                  </h3>
                  <div className="space-y-1">
                    {result.errors.map((err, i) => (
                      <div key={i} className="text-[11px] font-mono text-red-400/90 bg-red-500/5 rounded px-2 py-1 border border-red-500/10">
                        {err}
                      </div>
                    ))}
                  </div>
                </GlassPanel>
              )}
            </>
          ) : (
            <GlassPanel className="p-8 flex flex-col items-center justify-center text-center min-h-[300px]">
              <div className="h-12 w-12 rounded-xl bg-white/5 flex items-center justify-center mb-4">
                <Play className="h-6 w-6 text-muted-foreground/30" />
              </div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">No Results Yet</h3>
              <p className="text-[11px] text-muted-foreground/50 max-w-[250px]">
                Select a broker config, enter test parameters, and click "Test Broker Params" to see the validation result.
              </p>
              {selectedConfig && presets.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/5 w-full">
                  <p className="text-[10px] text-muted-foreground/40 mb-2">Or try a quick preset:</p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {presets.slice(0, 3).map((preset, i) => (
                      <Button
                        key={`${preset.name}-${i}`}
                        variant="outline"
                        size="sm"
                        onClick={() => applyPreset(preset)}
                        className="h-6 text-[10px] border-violet-500/20 text-violet-400/70 hover:text-violet-400 hover:bg-violet-500/10 gap-1"
                      >
                        <Zap className="h-3 w-3" />
                        {preset.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </GlassPanel>
          )}
        </div>
      </div>
    </div>
  );
}
