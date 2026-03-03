import { trpc } from "@/lib/trpc";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { WazuhGuard } from "@/components/shared/WazuhGuard";

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
  Layers,
  Puzzle,
  Server,
  Users,
  UserCheck,
  Shield,
  Activity,
  ChevronDown,
  GitCompare,
} from "lucide-react";
import { useState, useMemo, useCallback, lazy, Suspense } from "react";
import { LazyTabFallback } from "@/components/shared/LazyTabFallback";

// Lazy-loaded tab sub-components — each loads its own chunk on first render
const PackagesTab = lazy(() => import("./it-hygiene/PackagesTab").then(m => ({ default: m.PackagesTab })));
const PortsTab = lazy(() => import("./it-hygiene/PortsTab").then(m => ({ default: m.PortsTab })));
const ProcessesTab = lazy(() => import("./it-hygiene/ProcessesTab").then(m => ({ default: m.ProcessesTab })));
const NetworkTab = lazy(() => import("./it-hygiene/NetworkTab").then(m => ({ default: m.NetworkTab })));
const HotfixesTab = lazy(() => import("./it-hygiene/HotfixesTab").then(m => ({ default: m.HotfixesTab })));
const ExtensionsTab = lazy(() => import("./it-hygiene/ExtensionsTab").then(m => ({ default: m.ExtensionsTab })));
const ServicesTab = lazy(() => import("./it-hygiene/ServicesTab").then(m => ({ default: m.ServicesTab })));
const UsersTab = lazy(() => import("./it-hygiene/UsersTab").then(m => ({ default: m.UsersTab })));
const GroupsTab = lazy(() => import("./it-hygiene/GroupsTab").then(m => ({ default: m.GroupsTab })));

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
    { agentId, limit: pageSize, offset: page * pageSize, search: search || undefined },
    { retry: 1, staleTime: 30_000, enabled: isConnected && tab === "packages" }
  );
  const portsQ = trpc.wazuh.agentPorts.useQuery(
    { agentId, limit: pageSize, offset: page * pageSize },
    { retry: 1, staleTime: 30_000, enabled: isConnected && tab === "ports" }
  );
  const processesQ = trpc.wazuh.agentProcesses.useQuery(
    { agentId, limit: pageSize, offset: page * pageSize, search: search || undefined },
    { retry: 1, staleTime: 30_000, enabled: isConnected && tab === "processes" }
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
    { retry: 1, staleTime: 60_000, enabled: isConnected && tab === "hotfixes" }
  );

  // ── Extensions column queries ────────────────────────────────────────────
  const extensionsQ = trpc.wazuh.agentBrowserExtensions.useQuery(
    { agentId, limit: pageSize, offset: page * pageSize },
    { retry: 1, staleTime: 60_000, enabled: isConnected && tab === "extensions" }
  );

  // ── Services column queries ──────────────────────────────────────────────
  const servicesQ = trpc.wazuh.agentServices.useQuery(
    { agentId, limit: pageSize, offset: page * pageSize },
    { retry: 1, staleTime: 60_000, enabled: isConnected && tab === "services" }
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
  const columns: { id: ColumnView; label: string; icon: typeof Package; description: string }[] = [
    { id: "software", label: "Software & Network", icon: Package, description: "Packages, ports, processes, network, hotfixes" },
    { id: "services", label: "Extensions & Services", icon: Server, description: "Browser extensions, system services" },
    { id: "identity", label: "Identity & Access", icon: Users, description: "Local users, groups, privileges" },
  ];

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

  const handleColumnChange = (col: ColumnView) => {
    setActiveColumn(col);
    setTab(columnTabs[col][0].key);
    setPage(0);
    setSearch("");
  };

  // ── Shared tab props ─────────────────────────────────────────────────────
  const tabProps = { page, pageSize, onPageChange: setPage, agentId };

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
          <StatCard label="Packages" value={packagesData.total} icon={Package} colorClass="text-primary" />
          <StatCard label="Open Ports" value={portsData.total} icon={Globe} colorClass="text-threat-info" />
          <StatCard label="Processes" value={processesData.total} icon={Cpu} colorClass="text-[oklch(0.795_0.184_86.047)]" />
          <StatCard label="Extensions" value={extensionsData.total} icon={Puzzle} colorClass="text-[oklch(0.789_0.154_211.53)]" />
          <StatCard label="Services" value={servicesData.total} icon={Server} colorClass="text-[oklch(0.765_0.177_163.223)]" />
          <StatCard label="Running" value={runningServices} icon={Activity} colorClass="text-[oklch(0.765_0.177_163.223)]" />
          <StatCard label="Users" value={usersData.total} icon={UserCheck} colorClass="text-[oklch(0.705_0.191_22.216)]" />
          <StatCard label="Interactive" value={interactiveUsers} icon={Shield} colorClass="text-threat-high" />
        </div>

        {/* ── Agent Selector + Search ──────────────────────────────────── */}
        <GlassPanel className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">Target Agent:</span>
          </div>
          <Select value={agentId} onValueChange={(v) => { setAgentId(v); setPage(0); }}>
            <SelectTrigger className="w-[280px] h-8 text-xs bg-secondary/50 border-border">
              <SelectValue placeholder="Select agent" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border max-h-60">
              {agentList.map((a) => (
                <SelectItem key={String(a.id)} value={String(a.id)}>
                  {String(a.id)} — {String(a.name ?? "Unknown")} ({String(a.ip ?? "")})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
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
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                    isActive ? "bg-primary/15 border border-primary/30" : "bg-secondary/50 border border-border/30"
                  }`}>
                    <Icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${isActive ? "text-primary" : "text-foreground"}`}>{col.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{col.description}</p>
                  </div>
                  {isActive && <ChevronDown className="h-4 w-4 text-primary shrink-0" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Tab Content Area ─────────────────────────────────────────── */}
        <Tabs value={tab} onValueChange={(v) => { setTab(v as TabKey); setPage(0); setSearch(""); }}>
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
          <TabsContent value="packages">
            <Suspense fallback={<LazyTabFallback />}>
              <PackagesTab {...tabProps} data={packagesData} rawData={packagesQ.data as Record<string, unknown>} />
            </Suspense>
          </TabsContent>
          <TabsContent value="ports">
            <Suspense fallback={<LazyTabFallback />}>
              <PortsTab {...tabProps} data={portsData} rawData={portsQ.data as Record<string, unknown>} />
            </Suspense>
          </TabsContent>
          <TabsContent value="processes">
            <Suspense fallback={<LazyTabFallback />}>
              <ProcessesTab {...tabProps} data={processesData} rawData={processesQ.data as Record<string, unknown>} />
            </Suspense>
          </TabsContent>
          <TabsContent value="network">
            <Suspense fallback={<LazyTabFallback />}>
              <NetworkTab netifaceData={netifaceData} netaddrData={netaddrData} netprotoData={netprotoData} />
            </Suspense>
          </TabsContent>
          <TabsContent value="hotfixes">
            <Suspense fallback={<LazyTabFallback />}>
              <HotfixesTab {...tabProps} data={hotfixesData} rawData={hotfixesQ.data as Record<string, unknown>} />
            </Suspense>
          </TabsContent>

          {/* ── EXTENSIONS & SERVICES COLUMN ─────────────────────────── */}
          <TabsContent value="extensions">
            <Suspense fallback={<LazyTabFallback />}>
              <ExtensionsTab {...tabProps} data={extensionsData} />
            </Suspense>
          </TabsContent>
          <TabsContent value="services">
            <Suspense fallback={<LazyTabFallback />}>
              <ServicesTab {...tabProps} data={servicesData} />
            </Suspense>
          </TabsContent>

          {/* ── IDENTITY COLUMN ──────────────────────────────────────── */}
          <TabsContent value="users">
            <Suspense fallback={<LazyTabFallback />}>
              <UsersTab {...tabProps} data={usersData} interactiveUsers={interactiveUsers} />
            </Suspense>
          </TabsContent>
          <TabsContent value="groups">
            <Suspense fallback={<LazyTabFallback />}>
              <GroupsTab {...tabProps} data={groupsData} />
            </Suspense>
          </TabsContent>
        </Tabs>
        </>)}
      </div>
    </WazuhGuard>
  );
}
