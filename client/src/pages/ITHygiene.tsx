import { trpc } from "@/lib/trpc";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { WazuhGuard } from "@/components/shared/WazuhGuard";
import { RawJsonViewer } from "@/components/shared/RawJsonViewer";
import { ExportButton } from "@/components/shared/ExportButton";
import { EXPORT_COLUMNS } from "@/lib/exportUtils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Package,
  Globe,
  Cpu,
  Network,
  HardDrive,
  Search,
  ChevronLeft,
  ChevronRight,
  Layers,
  Puzzle,
  Server,
  Users,
  UserCheck,
  Shield,
  Activity,
  ChevronDown,
  ChevronUp,
  GitCompare,
} from "lucide-react";
import { useState, useMemo, useCallback, lazy, Suspense } from "react";

const DriftComparison = lazy(() => import("@/components/DriftComparison"));

// ── Column layout type ─────────────────────────────────────────────────────────
type ColumnView = "software" | "services" | "identity";
type TabKey =
  | "packages"
  | "ports"
  | "processes"
  | "network"
  | "hotfixes"
  | "extensions"
  | "services"
  | "users"
  | "groups";

function extractItems(data: unknown): {
  items: Array<Record<string, unknown>>;
  total: number;
} {
  const d = (data as Record<string, unknown>)?.data as
    | Record<string, unknown>
    | undefined;
  const items = (d?.affected_items as Array<Record<string, unknown>>) ?? [];
  const total = Number(d?.total_affected_items ?? items.length);
  return { items, total };
}

// ── State badge helper ─────────────────────────────────────────────────────────
function ServiceStateBadge({ state }: { state: string }) {
  const s = state.toLowerCase();
  const isRunning = s === "running";
  const isStopped = ["stopped", "dead", "inactive", "exited"].includes(s);
  const color = isRunning
    ? "bg-[oklch(0.765_0.177_163.223)]/15 text-[oklch(0.765_0.177_163.223)] border-[oklch(0.765_0.177_163.223)]/30"
    : isStopped
      ? "bg-[oklch(0.637_0.237_25.331)]/15 text-[oklch(0.637_0.237_25.331)] border-[oklch(0.637_0.237_25.331)]/30"
      : "bg-secondary/50 text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${color}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full mr-1.5 ${isRunning ? "bg-[oklch(0.765_0.177_163.223)]" : isStopped ? "bg-[oklch(0.637_0.237_25.331)]" : "bg-muted-foreground"}`}
      />
      {state}
    </span>
  );
}

function ShellBadge({ shell }: { shell: string }) {
  const isLogin = shell && !shell.includes("nologin") && !shell.includes("false");
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
        isLogin
          ? "bg-[oklch(0.795_0.184_86.047)]/15 text-[oklch(0.795_0.184_86.047)] border-[oklch(0.795_0.184_86.047)]/30"
          : "bg-secondary/50 text-muted-foreground border-border"
      }`}
    >
      {isLogin ? "interactive" : "system"}
    </span>
  );
}

export default function ITHygiene() {
  const utils = trpc.useUtils();
  const [agentId, setAgentId] = useState("001");
  const [activeColumn, setActiveColumn] = useState<ColumnView>("software");
  const [tab, setTab] = useState<TabKey>("packages");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [comparisonMode, setComparisonMode] = useState(false);
  const pageSize = 50;

  // ── Wazuh connection status ──────────────────────────────────────────────
  const statusQ = trpc.wazuh.status.useQuery(undefined, {
    retry: 1,
    staleTime: 60_000,
  });
  const isConnected =
    statusQ.data?.configured === true && statusQ.data?.data != null;

  // ── Agent list ───────────────────────────────────────────────────────────
  const agentsQ = trpc.wazuh.agents.useQuery(
    { limit: 100, offset: 0, status: "active" },
    { retry: 1, staleTime: 30_000, enabled: isConnected }
  );
  const agentList = useMemo(() => {
    if (isConnected && agentsQ.data) return extractItems(agentsQ.data).items.filter(a => String(a.id ?? "") !== "");
    return [];
  }, [agentsQ.data, isConnected]);

  // ── Software column queries ──────────────────────────────────────────────
  const packagesQ = trpc.wazuh.agentPackages.useQuery(
    {
      agentId,
      limit: pageSize,
      offset: page * pageSize,
      search: search || undefined,
    },
    {
      retry: 1,
      staleTime: 30_000,
      enabled: isConnected && tab === "packages",
    }
  );
  const portsQ = trpc.wazuh.agentPorts.useQuery(
    { agentId, limit: pageSize, offset: page * pageSize },
    { retry: 1, staleTime: 30_000, enabled: isConnected && tab === "ports" }
  );
  const processesQ = trpc.wazuh.agentProcesses.useQuery(
    {
      agentId,
      limit: pageSize,
      offset: page * pageSize,
      search: search || undefined,
    },
    {
      retry: 1,
      staleTime: 30_000,
      enabled: isConnected && tab === "processes",
    }
  );
  const netifaceQ = trpc.wazuh.agentNetiface.useQuery(
    { agentId },
    { retry: 1, staleTime: 60_000, enabled: isConnected && tab === "network" }
  );
  const netaddrQ = trpc.wazuh.agentNetaddr.useQuery(
    { agentId },
    { retry: 1, staleTime: 60_000, enabled: isConnected && tab === "network" }
  );
  const netprotoQ = trpc.wazuh.agentNetproto.useQuery(
    { agentId },
    { retry: 1, staleTime: 60_000, enabled: isConnected && tab === "network" }
  );
  const hotfixesQ = trpc.wazuh.agentHotfixes.useQuery(
    { agentId, limit: pageSize, offset: page * pageSize },
    {
      retry: 1,
      staleTime: 60_000,
      enabled: isConnected && tab === "hotfixes",
    }
  );

  // ── Extensions column queries ────────────────────────────────────────────
  const extensionsQ = trpc.wazuh.agentBrowserExtensions.useQuery(
    { agentId, limit: pageSize, offset: page * pageSize },
    {
      retry: 1,
      staleTime: 60_000,
      enabled: isConnected && tab === "extensions",
    }
  );

  // ── Services column queries ──────────────────────────────────────────────
  const servicesQ = trpc.wazuh.agentServices.useQuery(
    { agentId, limit: pageSize, offset: page * pageSize },
    {
      retry: 1,
      staleTime: 60_000,
      enabled: isConnected && tab === "services",
    }
  );

  // ── Identity column queries ──────────────────────────────────────────────
  const usersQ = trpc.wazuh.agentUsers.useQuery(
    { agentId, limit: pageSize, offset: page * pageSize },
    { retry: 1, staleTime: 60_000, enabled: isConnected && tab === "users" }
  );
  const groupsQ = trpc.wazuh.agentGroups2.useQuery(
    { agentId, limit: pageSize, offset: page * pageSize },
    { retry: 1, staleTime: 60_000, enabled: isConnected && tab === "groups" }
  );

  const handleRefresh = useCallback(() => {
    utils.wazuh.invalidate();
  }, [utils]);

  // ── Fallback-aware data extraction ───────────────────────────────────────
  const packagesData = useMemo(() => {
    if (isConnected && packagesQ.data) return extractItems(packagesQ.data);
    return { items: [] as Array<Record<string, unknown>>, total: 0 };
  }, [packagesQ.data, isConnected, search]);

  const portsData = useMemo(() => {
    if (isConnected && portsQ.data) return extractItems(portsQ.data);
    return { items: [] as Array<Record<string, unknown>>, total: 0 };
  }, [portsQ.data, isConnected]);

  const processesData = useMemo(() => {
    if (isConnected && processesQ.data) return extractItems(processesQ.data);
    return { items: [] as Array<Record<string, unknown>>, total: 0 };
  }, [processesQ.data, isConnected, search]);

  const netifaceData = useMemo(() => {
    if (isConnected && netifaceQ.data) return extractItems(netifaceQ.data);
    return { items: [] as Array<Record<string, unknown>>, total: 0 };
  }, [netifaceQ.data, isConnected]);

  const netaddrData = useMemo(() => {
    if (isConnected && netaddrQ.data) return extractItems(netaddrQ.data);
    return { items: [] as Array<Record<string, unknown>>, total: 0 };
  }, [netaddrQ.data, isConnected]);

  const netprotoData = useMemo(() => {
    if (isConnected && netprotoQ.data) return extractItems(netprotoQ.data);
    return { items: [] as Array<Record<string, unknown>>, total: 0 };
  }, [netprotoQ.data, isConnected]);

  const hotfixesData = useMemo(() => {
    if (isConnected && hotfixesQ.data) return extractItems(hotfixesQ.data);
    return { items: [] as Array<Record<string, unknown>>, total: 0 };
  }, [hotfixesQ.data, isConnected]);

  const extensionsData = useMemo(() => {
    if (isConnected && extensionsQ.data) {
      const raw = extractItems(extensionsQ.data);
      return {
        ...raw,
        items: raw.items.map((ext: Record<string, unknown>) => ({
          ...ext,
          name: (ext as any).package?.name ?? ext.name ?? "—",
          version: (ext as any).package?.version ?? ext.version ?? "—",
          description: (ext as any).package?.description ?? ext.description ?? "—",
          browser: (ext as any).browser?.name ?? ext.browser ?? "—",
          path: (ext as any).path ?? "—",
        })),
      };
    }
    return { items: [] as Array<Record<string, unknown>>, total: 0 };
  }, [extensionsQ.data, isConnected]);

  const servicesData = useMemo(() => {
    if (isConnected && servicesQ.data) {
      const raw = extractItems(servicesQ.data);
      return {
        ...raw,
        items: raw.items.map((svc: Record<string, unknown>) => ({
          ...svc,
          name: (svc as any).service?.name ?? svc.name ?? "—",
          state: (svc as any).service?.state ?? (svc as any).service?.sub_state ?? svc.state ?? "—",
          enabled: (svc as any).service?.enabled ?? svc.enabled ?? "—",
          pid: (svc as any).process?.pid ?? svc.pid ?? "—",
          display_name: (svc as any).service?.display_name ?? (svc as any).display_name ?? "—",
          start_type: (svc as any).service?.start_type ?? (svc as any).start_type ?? "—",
          description: (svc as any).service?.description ?? (svc as any).description ?? "—",
        })),
      };
    }
    return { items: [] as Array<Record<string, unknown>>, total: 0 };
  }, [servicesQ.data, isConnected, search, tab]);

  const usersData = useMemo(() => {
    if (isConnected && usersQ.data) {
      const raw = extractItems(usersQ.data);
      return {
        ...raw,
        items: raw.items.map((item: Record<string, unknown>) => ({
          ...item,
          name: (item as any).user?.name ?? item.name ?? "—",
          uid: (item as any).user?.id ?? item.uid ?? "—",
          gid: (item as any).user?.group_id ?? item.gid ?? "—",
          home: (item as any).user?.home ?? item.home ?? "—",
          shell: (item as any).user?.shell ?? item.shell ?? "—",
          last_login: (item as any).user?.last_login ?? (item as any).last_login ?? null,
        })),
      };
    }
    return { items: [] as Array<Record<string, unknown>>, total: 0 };
  }, [usersQ.data, isConnected]);

  const groupsData = useMemo(() => {
    if (isConnected && groupsQ.data) {
      const raw = extractItems(groupsQ.data);
      return {
        ...raw,
        items: raw.items.map((item: Record<string, unknown>) => {
          const usersStr = (item as any).group?.users ?? "";
          return {
            ...item,
            name: (item as any).group?.name ?? item.name ?? "—",
            gid: (item as any).group?.id ?? item.gid ?? "—",
            members: typeof usersStr === "string" && usersStr
              ? usersStr.split(":").filter(Boolean)
              : Array.isArray(item.members) ? item.members : [],
          };
        }),
      };
    }
    return { items: [] as Array<Record<string, unknown>>, total: 0 };
  }, [groupsQ.data, isConnected]);

  const isLoading = statusQ.isLoading;

  // ── KPI stats ────────────────────────────────────────────────────────────
  const runningServices = servicesData.items.filter(
    (s) => String(s.state ?? "").toLowerCase() === "running"
  ).length;
  const interactiveUsers = usersData.items.filter((u) => {
    const shell = String(u.shell ?? "");
    return shell && !shell.includes("nologin") && !shell.includes("false");
  }).length;

  // ── Column definitions ───────────────────────────────────────────────────
  const columns: {
    id: ColumnView;
    label: string;
    icon: typeof Package;
    description: string;
  }[] = [
    {
      id: "software",
      label: "Software & Network",
      icon: Package,
      description: "Packages, ports, processes, network, hotfixes",
    },
    {
      id: "services",
      label: "Extensions & Services",
      icon: Server,
      description: "Browser extensions, system services",
    },
    {
      id: "identity",
      label: "Identity & Access",
      icon: Users,
      description: "Local users, groups, privileges",
    },
  ];

  // Map column to its tabs
  const columnTabs: Record<ColumnView, { key: TabKey; label: string; icon: typeof Package }[]> = {
    software: [
      { key: "packages", label: "Packages", icon: Package },
      { key: "ports", label: "Ports", icon: Globe },
      { key: "processes", label: "Processes", icon: Cpu },
      { key: "network", label: "Network", icon: Network },
      { key: "hotfixes", label: "Hotfixes", icon: HardDrive },
    ],
    services: [
      { key: "extensions", label: "Browser Extensions", icon: Puzzle },
      { key: "services", label: "System Services", icon: Server },
    ],
    identity: [
      { key: "users", label: "Local Users", icon: UserCheck },
      { key: "groups", label: "Groups", icon: Users },
    ],
  };

  // When switching columns, auto-select first tab
  const handleColumnChange = (col: ColumnView) => {
    setActiveColumn(col);
    setTab(columnTabs[col][0].key);
    setPage(0);
    setSearch("");
  };

  return (
    <WazuhGuard>
      <div className="space-y-5">
        <PageHeader
          title="IT Hygiene Ecosystem"
          subtitle={comparisonMode ? "Multi-agent configuration drift analysis" : "Comprehensive syscollector inventory — software, services, and identity across your fleet"}
          onRefresh={handleRefresh}
          isLoading={isLoading}
        >
          <Button
            variant={comparisonMode ? "default" : "outline"}
            size="sm"
            onClick={() => setComparisonMode(!comparisonMode)}
            className={`h-8 gap-2 text-xs ${
              comparisonMode
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-transparent border-border hover:bg-secondary/50"
            }`}
          >
            <GitCompare className="h-3.5 w-3.5" />
            {comparisonMode ? "Exit Comparison" : "Compare Agents"}
          </Button>
        </PageHeader>

        {/* ── Comparison Mode ──────────────────────────────────────── */}
        {comparisonMode && (
          <Suspense fallback={<div className="glass-panel p-8 text-center text-muted-foreground text-sm">Loading comparison view…</div>}>
            <DriftComparison isConnected={isConnected} />
          </Suspense>
        )}

        {/* ── Single-Agent View ────────────────────────────────────────── */}
        {!comparisonMode && (<>
        {/* ── KPI Row ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
          <StatCard
            label="Packages"
            value={packagesData.total}
            icon={Package}
            colorClass="text-primary"
          />
          <StatCard
            label="Open Ports"
            value={portsData.total}
            icon={Globe}
            colorClass="text-threat-info"
          />
          <StatCard
            label="Processes"
            value={processesData.total}
            icon={Cpu}
            colorClass="text-[oklch(0.795_0.184_86.047)]"
          />
          <StatCard
            label="Extensions"
            value={extensionsData.total}
            icon={Puzzle}
            colorClass="text-[oklch(0.789_0.154_211.53)]"
          />
          <StatCard
            label="Services"
            value={servicesData.total}
            icon={Server}
            colorClass="text-[oklch(0.765_0.177_163.223)]"
          />
          <StatCard
            label="Running"
            value={runningServices}
            icon={Activity}
            colorClass="text-[oklch(0.765_0.177_163.223)]"
          />
          <StatCard
            label="Users"
            value={usersData.total}
            icon={UserCheck}
            colorClass="text-[oklch(0.705_0.191_22.216)]"
          />
          <StatCard
            label="Interactive"
            value={interactiveUsers}
            icon={Shield}
            colorClass="text-threat-high"
          />
        </div>

        {/* ── Agent Selector + Search ──────────────────────────────────── */}
        <GlassPanel className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">
              Target Agent:
            </span>
          </div>
          <Select
            value={agentId}
            onValueChange={(v) => {
              setAgentId(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-[280px] h-8 text-xs bg-secondary/50 border-border">
              <SelectValue placeholder="Select agent" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border max-h-60">
              {agentList.map((a) => (
                <SelectItem key={String(a.id)} value={String(a.id)}>
                  {String(a.id)} — {String(a.name ?? "Unknown")} (
                  {String(a.ip ?? "")})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="h-8 w-48 pl-8 text-xs bg-secondary/50 border-border"
            />
          </div>
        </GlassPanel>

        {/* ── Three-Column Selector ────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {columns.map((col) => {
            const Icon = col.icon;
            const isActive = activeColumn === col.id;
            return (
              <button
                key={col.id}
                onClick={() => handleColumnChange(col.id)}
                className={`glass-card p-4 text-left transition-all duration-200 ${
                  isActive
                    ? "ring-2 ring-primary/50 bg-primary/5 border-primary/30"
                    : "hover:bg-secondary/30 border-border/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                      isActive
                        ? "bg-primary/15 border border-primary/30"
                        : "bg-secondary/50 border border-border/30"
                    }`}
                  >
                    <Icon
                      className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium ${isActive ? "text-primary" : "text-foreground"}`}
                    >
                      {col.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {col.description}
                    </p>
                  </div>
                  {isActive && (
                    <ChevronDown className="h-4 w-4 text-primary shrink-0" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Tab Content Area ─────────────────────────────────────────── */}
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as TabKey);
            setPage(0);
            setSearch("");
          }}
        >
          <TabsList className="bg-secondary/30 border border-border/30">
            {columnTabs[activeColumn].map((t) => {
              const TIcon = t.icon;
              return (
                <TabsTrigger
                  key={t.key}
                  value={t.key}
                  className="text-xs gap-1.5 data-[state=active]:bg-primary/15 data-[state=active]:text-primary"
                >
                  <TIcon className="h-3.5 w-3.5" /> {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* ── SOFTWARE COLUMN ──────────────────────────────────────── */}

          {/* Packages Tab */}
          <TabsContent value="packages">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground">
                  {packagesData.total} packages
                </span>
                <div className="flex items-center gap-2">
                  <ExportButton getData={() => packagesData.items} baseName="packages" columns={EXPORT_COLUMNS.packages} context={`agent-${agentId}`} compact />
                  {packagesQ.data ? (
                    <RawJsonViewer
                      data={packagesQ.data as Record<string, unknown>}
                      title="Packages JSON"
                    />
                  ) : null}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30">
                      {[
                        "Name",
                        "Version",
                        "Architecture",
                        "Vendor",
                        "Format",
                        "Description",
                      ].map((h) => (
                        <th
                          key={h}
                          className="text-left py-2 px-3 text-muted-foreground font-medium"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {packagesData.items.map((p, i) => (
                      <tr
                        key={i}
                        className="border-b border-border/10 hover:bg-secondary/20 transition-colors"
                      >
                        <td className="py-2 px-3 text-foreground font-medium">
                          {String(p.name ?? "—")}
                        </td>
                        <td className="py-2 px-3 font-mono text-primary">
                          {String(p.version ?? "—")}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {String(p.architecture ?? "—")}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground truncate max-w-[200px]">
                          {String(p.vendor ?? "—")}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {String(p.format ?? "—")}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground truncate max-w-[300px]">
                          {String(p.description ?? "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {Math.ceil(packagesData.total / pageSize) > 1 && (
                <Pagination
                  page={page}
                  totalPages={Math.ceil(packagesData.total / pageSize)}
                  onPageChange={setPage}
                  total={packagesData.total}
                />
              )}
            </GlassPanel>
          </TabsContent>

          {/* Ports Tab */}
          <TabsContent value="ports">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground">
                  {portsData.total} open ports
                </span>
                <div className="flex items-center gap-2">
                  <ExportButton getData={() => portsData.items} baseName="ports" columns={EXPORT_COLUMNS.ports} context={`agent-${agentId}`} compact />
                  {portsQ.data ? (
                    <RawJsonViewer
                      data={portsQ.data as Record<string, unknown>}
                      title="Ports JSON"
                    />
                  ) : null}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30">
                      {[
                        "Local IP",
                        "Local Port",
                        "Remote IP",
                        "Remote Port",
                        "Protocol",
                        "State",
                        "PID",
                        "Process",
                      ].map((h) => (
                        <th
                          key={h}
                          className="text-left py-2 px-3 text-muted-foreground font-medium"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {portsData.items.map((p, i) => {
                      const local = p.local as
                        | Record<string, unknown>
                        | undefined;
                      const remote = p.remote as
                        | Record<string, unknown>
                        | undefined;
                      return (
                        <tr
                          key={i}
                          className="border-b border-border/10 hover:bg-secondary/20 transition-colors"
                        >
                          <td className="py-2 px-3 font-mono text-foreground">
                            {String(local?.ip ?? "—")}
                          </td>
                          <td className="py-2 px-3 font-mono text-primary">
                            {String(local?.port ?? "—")}
                          </td>
                          <td className="py-2 px-3 font-mono text-muted-foreground">
                            {String(remote?.ip ?? "—")}
                          </td>
                          <td className="py-2 px-3 font-mono text-muted-foreground">
                            {String(remote?.port ?? "—")}
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {String(p.protocol ?? "—")}
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {String(p.state ?? "—")}
                          </td>
                          <td className="py-2 px-3 font-mono text-muted-foreground">
                            {String(p.pid ?? "—")}
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {String(p.process ?? "—")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {Math.ceil(portsData.total / pageSize) > 1 && (
                <Pagination
                  page={page}
                  totalPages={Math.ceil(portsData.total / pageSize)}
                  onPageChange={setPage}
                  total={portsData.total}
                />
              )}
            </GlassPanel>
          </TabsContent>

          {/* Processes Tab */}
          <TabsContent value="processes">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground">
                  {processesData.total} processes
                </span>
                <div className="flex items-center gap-2">
                  <ExportButton getData={() => processesData.items} baseName="processes" columns={EXPORT_COLUMNS.processes} context={`agent-${agentId}`} compact />
                  {processesQ.data ? (
                    <RawJsonViewer
                      data={processesQ.data as Record<string, unknown>}
                      title="Processes JSON"
                    />
                  ) : null}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30">
                      {[
                        "PID",
                        "Name",
                        "State",
                        "User",
                        "PPID",
                        "Priority",
                        "Threads",
                        "CMD",
                      ].map((h) => (
                        <th
                          key={h}
                          className="text-left py-2 px-3 text-muted-foreground font-medium"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {processesData.items.map((p, i) => (
                      <tr
                        key={i}
                        className="border-b border-border/10 hover:bg-secondary/20 transition-colors"
                      >
                        <td className="py-2 px-3 font-mono text-primary">
                          {String(p.pid ?? "—")}
                        </td>
                        <td className="py-2 px-3 text-foreground font-medium">
                          {String(p.name ?? "—")}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {String(p.state ?? "—")}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {String(p.euser ?? p.ruser ?? "—")}
                        </td>
                        <td className="py-2 px-3 font-mono text-muted-foreground">
                          {String(p.ppid ?? "—")}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {String(p.priority ?? "—")}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {String(p.nlwp ?? "—")}
                        </td>
                        <td className="py-2 px-3 font-mono text-muted-foreground truncate max-w-[300px]">
                          {String(p.cmd ?? "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {Math.ceil(processesData.total / pageSize) > 1 && (
                <Pagination
                  page={page}
                  totalPages={Math.ceil(processesData.total / pageSize)}
                  onPageChange={setPage}
                  total={processesData.total}
                />
              )}
            </GlassPanel>
          </TabsContent>

          {/* Network Tab */}
          <TabsContent value="network">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <GlassPanel>
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Network className="h-4 w-4 text-primary" /> Network
                  Interfaces
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30">
                        {[
                          "Name",
                          "Type",
                          "State",
                          "MAC",
                          "MTU",
                          "TX Packets",
                          "RX Packets",
                        ].map((h) => (
                          <th
                            key={h}
                            className="text-left py-2 px-3 text-muted-foreground font-medium"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {netifaceData.items.map((iface, i) => {
                        const tx = iface.tx as
                          | Record<string, unknown>
                          | undefined;
                        const rx = iface.rx as
                          | Record<string, unknown>
                          | undefined;
                        return (
                          <tr
                            key={i}
                            className="border-b border-border/10 hover:bg-secondary/20 transition-colors"
                          >
                            <td className="py-2 px-3 text-foreground font-medium">
                              {String(iface.name ?? "—")}
                            </td>
                            <td className="py-2 px-3 text-muted-foreground">
                              {String(iface.type ?? "—")}
                            </td>
                            <td className="py-2 px-3 text-muted-foreground">
                              {String(iface.state ?? "—")}
                            </td>
                            <td className="py-2 px-3 font-mono text-muted-foreground">
                              {String(iface.mac ?? "—")}
                            </td>
                            <td className="py-2 px-3 text-muted-foreground">
                              {String(iface.mtu ?? "—")}
                            </td>
                            <td className="py-2 px-3 font-mono text-muted-foreground">
                              {String(tx?.packets ?? "—")}
                            </td>
                            <td className="py-2 px-3 font-mono text-muted-foreground">
                              {String(rx?.packets ?? "—")}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </GlassPanel>

              <GlassPanel>
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" /> Network Addresses
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30">
                        {[
                          "Interface",
                          "Protocol",
                          "Address",
                          "Netmask",
                          "Broadcast",
                        ].map((h) => (
                          <th
                            key={h}
                            className="text-left py-2 px-3 text-muted-foreground font-medium"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {netaddrData.items.map((addr, i) => (
                        <tr
                          key={i}
                          className="border-b border-border/10 hover:bg-secondary/20 transition-colors"
                        >
                          <td className="py-2 px-3 text-foreground font-medium">
                            {String(addr.iface ?? "—")}
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {String(addr.proto ?? "—")}
                          </td>
                          <td className="py-2 px-3 font-mono text-primary">
                            {String(addr.address ?? "—")}
                          </td>
                          <td className="py-2 px-3 font-mono text-muted-foreground">
                            {String(addr.netmask ?? "—")}
                          </td>
                          <td className="py-2 px-3 font-mono text-muted-foreground">
                            {String(addr.broadcast ?? "—")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassPanel>
            </div>

              {/* Network Protocols */}
              <GlassPanel className="lg:col-span-2">
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Network className="h-4 w-4 text-primary" /> Network Protocols
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30">
                        {["Interface", "Type", "Gateway", "DHCP"].map((h) => (
                          <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {netprotoData.items.length === 0 ? (
                        <tr><td colSpan={4} className="py-4 text-center text-muted-foreground/50">No protocol data available</td></tr>
                      ) : netprotoData.items.map((proto, i) => (
                        <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                          <td className="py-2 px-3 text-foreground font-medium">{String(proto.iface ?? "—")}</td>
                          <td className="py-2 px-3 text-muted-foreground">{String(proto.type ?? "—")}</td>
                          <td className="py-2 px-3 font-mono text-primary">{String(proto.gateway ?? "—")}</td>
                          <td className="py-2 px-3 text-muted-foreground">{String(proto.dhcp ?? "—")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GlassPanel>
          </TabsContent>

          {/* Hotfixes Tab */}
          <TabsContent value="hotfixes">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground">
                  {hotfixesData.total} hotfixes
                </span>
                <div className="flex items-center gap-2">
                  <ExportButton getData={() => hotfixesData.items} baseName="hotfixes" context={`agent-${agentId}`} compact />
                  {hotfixesQ.data ? (
                    <RawJsonViewer
                      data={hotfixesQ.data as Record<string, unknown>}
                      title="Hotfixes JSON"
                    />
                  ) : null}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30">
                      {["Hotfix ID", "Scan Time"].map((h) => (
                        <th
                          key={h}
                          className="text-left py-2 px-3 text-muted-foreground font-medium"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {hotfixesData.items.map((h, i) => (
                      <tr
                        key={i}
                        className="border-b border-border/10 hover:bg-secondary/20 transition-colors"
                      >
                        <td className="py-2 px-3 font-mono text-primary">
                          {String(h.hotfix ?? "—")}
                        </td>
                        <td className="py-2 px-3 font-mono text-muted-foreground">
                          {String(
                            (h.scan as Record<string, unknown>)?.time ?? "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {Math.ceil(hotfixesData.total / pageSize) > 1 && (
                <Pagination
                  page={page}
                  totalPages={Math.ceil(hotfixesData.total / pageSize)}
                  onPageChange={setPage}
                  total={hotfixesData.total}
                />
              )}
            </GlassPanel>
          </TabsContent>

          {/* ── EXTENSIONS & SERVICES COLUMN ─────────────────────────── */}

          {/* Browser Extensions Tab */}
          <TabsContent value="extensions">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground">
                  {extensionsData.total} browser extensions
                </span>
                <ExportButton getData={() => extensionsData.items} baseName="browser-extensions" context={`agent-${agentId}`} compact />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30">
                      {[
                        "Name",
                        "Browser",
                        "Version",
                        "Description",
                        "Path",
                      ].map((h) => (
                        <th
                          key={h}
                          className="text-left py-2 px-3 text-muted-foreground font-medium"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {extensionsData.items.map((ext, i) => (
                      <tr
                        key={i}
                        className="border-b border-border/10 hover:bg-secondary/20 transition-colors"
                      >
                        <td className="py-2 px-3 text-foreground font-medium">
                          {String(ext.name ?? "—")}
                        </td>
                        <td className="py-2 px-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 border border-primary/20 text-primary">
                            {String(ext.browser ?? "—")}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-primary">
                          {String(ext.version ?? "—")}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground truncate max-w-[350px]">
                          {String(ext.description ?? "—")}
                        </td>
                        <td className="py-2 px-3 font-mono text-muted-foreground/60 truncate max-w-[250px]">
                          {String(ext.path ?? "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {Math.ceil(extensionsData.total / pageSize) > 1 && (
                <Pagination
                  page={page}
                  totalPages={Math.ceil(extensionsData.total / pageSize)}
                  onPageChange={setPage}
                  total={extensionsData.total}
                />
              )}

              {/* Extension Security Summary */}
              <div className="mt-4 pt-4 border-t border-border/30">
                <h4 className="text-xs font-medium text-muted-foreground mb-3">
                  Browser Distribution
                </h4>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(
                    extensionsData.items.reduce<Record<string, number>>(
                      (acc, ext) => {
                        const browser = String(ext.browser ?? "Unknown");
                        acc[browser] = (acc[browser] || 0) + 1;
                        return acc;
                      },
                      {}
                    )
                  ).map(([browser, count]) => (
                    <div
                      key={browser}
                      className="glass-card px-3 py-2 flex items-center gap-2"
                    >
                      <Puzzle className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs text-foreground font-medium">
                        {browser}
                      </span>
                      <span className="text-xs font-mono text-primary">
                        {String(count)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </GlassPanel>
          </TabsContent>

          {/* System Services Tab */}
          <TabsContent value="services">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground">
                    {servicesData.total} services
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.765_0.177_163.223)]" />
                      {runningServices} running
                    </span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.637_0.237_25.331)]" />
                      {servicesData.total - runningServices} stopped
                    </span>
                  </div>
                </div>
                <ExportButton getData={() => servicesData.items} baseName="services" columns={EXPORT_COLUMNS.services} context={`agent-${agentId}`} compact />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30">
                      {[
                        "Service",
                        "Display Name",
                        "State",
                        "Start Type",
                        "PID",
                        "Description",
                      ].map((h) => (
                        <th
                          key={h}
                          className="text-left py-2 px-3 text-muted-foreground font-medium"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {servicesData.items.map((svc, i) => (
                      <tr
                        key={i}
                        className="border-b border-border/10 hover:bg-secondary/20 transition-colors"
                      >
                        <td className="py-2 px-3 font-mono text-foreground font-medium">
                          {String(svc.name ?? "—")}
                        </td>
                        <td className="py-2 px-3 text-foreground">
                          {String(svc.display_name ?? "—")}
                        </td>
                        <td className="py-2 px-3">
                          <ServiceStateBadge
                            state={String(svc.state ?? "unknown")}
                          />
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full border ${
                              String(svc.start_type) === "auto"
                                ? "bg-primary/10 text-primary border-primary/20"
                                : String(svc.start_type) === "disabled"
                                  ? "bg-destructive/10 text-destructive border-destructive/20"
                                  : "bg-secondary/50 text-muted-foreground border-border"
                            }`}
                          >
                            {String(svc.start_type ?? "—")}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-muted-foreground">
                          {svc.pid ? String(svc.pid) : "—"}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground truncate max-w-[300px]">
                          {String(svc.description ?? "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {Math.ceil(servicesData.total / pageSize) > 1 && (
                <Pagination
                  page={page}
                  totalPages={Math.ceil(servicesData.total / pageSize)}
                  onPageChange={setPage}
                  total={servicesData.total}
                />
              )}

              {/* Service Startup Type Summary */}
              <div className="mt-4 pt-4 border-t border-border/30">
                <h4 className="text-xs font-medium text-muted-foreground mb-3">
                  Startup Type Distribution
                </h4>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(
                    servicesData.items.reduce<Record<string, number>>(
                      (acc, svc) => {
                        const type = String(svc.start_type ?? "unknown");
                        acc[type] = (acc[type] || 0) + 1;
                        return acc;
                      },
                      {}
                    )
                  ).map(([type, count]) => (
                    <div
                      key={type}
                      className="glass-card px-3 py-2 flex items-center gap-2"
                    >
                      <Server className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs text-foreground font-medium capitalize">
                        {type}
                      </span>
                      <span className="text-xs font-mono text-primary">
                        {String(count)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </GlassPanel>
          </TabsContent>

          {/* ── IDENTITY COLUMN ──────────────────────────────────────── */}

          {/* Users Tab */}
          <TabsContent value="users">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground">
                    {usersData.total} local users
                  </span>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Shield className="h-3 w-3 text-threat-high" />
                    {interactiveUsers} interactive
                  </span>
                </div>
                <ExportButton getData={() => usersData.items} baseName="users" columns={EXPORT_COLUMNS.users} context={`agent-${agentId}`} compact />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30">
                      {[
                        "Username",
                        "UID",
                        "GID",
                        "Home",
                        "Shell",
                        "Type",
                        "Last Login",
                      ].map((h) => (
                        <th
                          key={h}
                          className="text-left py-2 px-3 text-muted-foreground font-medium"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {usersData.items.map((user, i) => (
                      <tr
                        key={i}
                        className="border-b border-border/10 hover:bg-secondary/20 transition-colors"
                      >
                        <td className="py-2 px-3 font-mono text-foreground font-medium">
                          <span className="flex items-center gap-1.5">
                            <UserCheck className="h-3 w-3 text-primary" />
                            {String(user.name ?? "—")}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono text-primary">
                          {String(user.uid ?? "—")}
                        </td>
                        <td className="py-2 px-3 font-mono text-muted-foreground">
                          {String(user.gid ?? "—")}
                        </td>
                        <td className="py-2 px-3 font-mono text-muted-foreground truncate max-w-[200px]">
                          {String(user.home ?? "—")}
                        </td>
                        <td className="py-2 px-3 font-mono text-muted-foreground/70 truncate max-w-[180px]">
                          {String(user.shell ?? "—")}
                        </td>
                        <td className="py-2 px-3">
                          <ShellBadge shell={String(user.shell ?? "")} />
                        </td>
                        <td className="py-2 px-3 text-muted-foreground">
                          {user.last_login
                            ? new Date(
                                String(user.last_login)
                              ).toLocaleDateString()
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {Math.ceil(usersData.total / pageSize) > 1 && (
                <Pagination
                  page={page}
                  totalPages={Math.ceil(usersData.total / pageSize)}
                  onPageChange={setPage}
                  total={usersData.total}
                />
              )}

              {/* Privilege Summary */}
              <div className="mt-4 pt-4 border-t border-border/30">
                <h4 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-threat-high" />
                  Privilege Summary
                </h4>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="glass-card px-3 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Root / UID 0
                    </p>
                    <p className="text-lg font-display font-bold text-threat-critical">
                      {
                        usersData.items.filter(
                          (u) => String(u.uid) === "0"
                        ).length
                      }
                    </p>
                  </div>
                  <div className="glass-card px-3 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Interactive
                    </p>
                    <p className="text-lg font-display font-bold text-threat-high">
                      {interactiveUsers}
                    </p>
                  </div>
                  <div className="glass-card px-3 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      System Accounts
                    </p>
                    <p className="text-lg font-display font-bold text-threat-info">
                      {usersData.total - interactiveUsers}
                    </p>
                  </div>
                  <div className="glass-card px-3 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Recent Login
                    </p>
                    <p className="text-lg font-display font-bold text-primary">
                      {
                        usersData.items.filter(
                          (u) => u.last_login != null
                        ).length
                      }
                    </p>
                  </div>
                </div>
              </div>
            </GlassPanel>
          </TabsContent>

          {/* Groups Tab */}
          <TabsContent value="groups">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground">
                  {groupsData.total} local groups
                </span>
                <ExportButton getData={() => groupsData.items} baseName="groups" columns={EXPORT_COLUMNS.groups} context={`agent-${agentId}`} compact />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/30">
                      {["Group Name", "GID", "Members", "Member Count"].map(
                        (h) => (
                          <th
                            key={h}
                            className="text-left py-2 px-3 text-muted-foreground font-medium"
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {groupsData.items.map((grp, i) => {
                      const members = (grp.members as string[]) ?? [];
                      return (
                        <tr
                          key={i}
                          className="border-b border-border/10 hover:bg-secondary/20 transition-colors"
                        >
                          <td className="py-2 px-3 font-mono text-foreground font-medium">
                            <span className="flex items-center gap-1.5">
                              <Users className="h-3 w-3 text-primary" />
                              {String(grp.name ?? "—")}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono text-primary">
                            {String(grp.gid ?? "—")}
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex flex-wrap gap-1">
                              {members.map((m) => (
                                <span
                                  key={m}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-secondary/50 border border-border/30 text-muted-foreground"
                                >
                                  {m}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2 px-3 font-mono text-muted-foreground">
                            {members.length}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {Math.ceil(groupsData.total / pageSize) > 1 && (
                <Pagination
                  page={page}
                  totalPages={Math.ceil(groupsData.total / pageSize)}
                  onPageChange={setPage}
                  total={groupsData.total}
                />
              )}

              {/* Privileged Groups Highlight */}
              <div className="mt-4 pt-4 border-t border-border/30">
                <h4 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-threat-high" />
                  Privileged Groups
                </h4>
                <div className="flex flex-wrap gap-2">
                  {groupsData.items
                    .filter((g) => {
                      const name = String(g.name ?? "").toLowerCase();
                      return (
                        name === "root" ||
                        name === "sudo" ||
                        name === "wheel" ||
                        name === "docker" ||
                        name === "adm" ||
                        name === "admin" ||
                        name === "staff"
                      );
                    })
                    .map((g) => {
                      const members = (g.members as string[]) ?? [];
                      return (
                        <div
                          key={String(g.name)}
                          className="glass-card px-3 py-2"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Shield className="h-3 w-3 text-threat-high" />
                            <span className="text-xs font-mono text-foreground font-medium">
                              {String(g.name)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              ({members.length} members)
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {members.map((m) => (
                              <span
                                key={m}
                                className="text-[10px] font-mono text-primary"
                              >
                                {m}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </GlassPanel>
          </TabsContent>
        </Tabs>
        </>)}
      </div>
    </WazuhGuard>
  );
}

function Pagination({
  page,
  totalPages,
  onPageChange,
  total,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  total: number;
}) {
  return (
    <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/30">
      <p className="text-xs text-muted-foreground">
        Page {page + 1} of {totalPages} ({total} items)
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
          className="h-7 bg-transparent border-border"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
          className="h-7 bg-transparent border-border"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
