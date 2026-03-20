/**
 * Fleet-Wide Inventory — cross-agent syscollector data from /experimental/syscollector/*
 *
 * Provides fleet-level views of packages, processes, ports, network interfaces,
 * network addresses, network protocols, OS info, hardware, and hotfixes across
 * ALL agents without requiring a specific agent_id.
 */
import { trpc } from "@/lib/trpc";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { RawJsonViewer } from "@/components/shared/RawJsonViewer";
import { BrokerWarnings } from "@/components/shared/BrokerWarnings";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Package,
  Cpu,
  Network,
  Globe,
  HardDrive,
  Activity,
  Search,
  Server,
  Layers,
  Wrench,
  ChevronLeft,
  ChevronRight,
  Wifi,
  Shield,
  SortAsc,
  SortDesc,
  ArrowUpDown,
  Filter,
  X,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";

// ── Amethyst Nexus Colors ──────────────────────────────────────────────────
const COLORS = {
  gold: "oklch(0.795 0.184 85)",
  cyan: "oklch(0.75 0.15 195)",
  green: "oklch(0.723 0.219 149.579)",
  yellow: "oklch(0.769 0.188 70.08)",
  red: "oklch(0.628 0.258 29.234)",
};

type TabKey = "packages" | "processes" | "ports" | "os" | "hardware" | "hotfixes" | "netaddr" | "netiface" | "netproto";

const TAB_SORT_FIELDS: Partial<Record<TabKey, Record<string, string>>> = {
  packages:  { "Name": "name", "Version": "version", "Vendor": "vendor", "Architecture": "architecture" },
  processes: { "Name": "name", "PID": "pid", "State": "state", "User": "euser" },
  ports:     { "Protocol": "protocol", "Local Port": "local.port", "State": "state", "PID": "pid" },
  os:        { "OS Name": "os.name", "Platform": "os.platform", "Hostname": "hostname" },
  hardware:  { "CPU Cores": "cpu.cores", "RAM (MB)": "ram.total" },
  hotfixes:  { "Hotfix ID": "hotfix", "Scan Time": "scan.time" },
  netaddr:   { "Interface": "iface", "Address": "address", "Protocol": "proto" },
  netiface:  { "Name": "name", "Type": "type", "State": "state", "MTU": "mtu" },
  netproto:  { "Interface": "iface", "Type": "type", "Gateway": "gateway" },
};

const TAB_META: Record<TabKey, { label: string; icon: typeof Package; columns: string[] }> = {
  packages:  { label: "Packages",    icon: Package,  columns: ["Agent", "Name", "Version", "Architecture", "Vendor", "Format"] },
  processes: { label: "Processes",   icon: Activity, columns: ["Agent", "Name", "PID", "PPID", "State", "User", "CMD"] },
  ports:     { label: "Ports",       icon: Globe,    columns: ["Agent", "Protocol", "Local IP", "Local Port", "Remote IP", "State", "PID"] },
  os:        { label: "OS",          icon: Server,   columns: ["Agent", "OS Name", "OS Version", "Architecture", "Platform", "Hostname"] },
  hardware:  { label: "Hardware",    icon: HardDrive,columns: ["Agent", "CPU Name", "CPU Cores", "RAM (MB)", "Board Serial"] },
  hotfixes:  { label: "Hotfixes",    icon: Wrench,   columns: ["Agent", "Hotfix ID", "Scan Time"] },
  netaddr:   { label: "Addresses",   icon: Wifi,     columns: ["Agent", "Interface", "Address", "Netmask", "Broadcast", "Protocol"] },
  netiface:  { label: "Interfaces",  icon: Network,  columns: ["Agent", "Name", "Type", "State", "MAC", "MTU", "TX/RX Packets"] },
  netproto:  { label: "Protocols",   icon: Shield,   columns: ["Agent", "Interface", "Type", "Gateway", "DHCP"] },
};

function extractItems(raw: unknown): { items: Array<Record<string, unknown>>; total: number } {
  const d = (raw as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  const items = (d?.affected_items as Array<Record<string, unknown>>) ?? [];
  const total = Number(d?.total_affected_items ?? items.length);
  return { items, total };
}

function Pagination({ page, totalPages, onPageChange, total }: { page: number; totalPages: number; onPageChange: (p: number) => void; total: number }) {
  return (
    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/10">
      <span className="text-xs text-muted-foreground">{total.toLocaleString()} total records</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1 rounded hover:bg-secondary/30 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1 rounded hover:bg-secondary/30 disabled:opacity-30 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Cell renderer for agent ID ──────────────────────────────────────────────
function AgentCell({ item }: { item: Record<string, unknown> }) {
  const agentId = String(item.agent_id ?? item.agent ?? "—");
  return (
    <span className="font-mono text-primary text-[11px]">{agentId}</span>
  );
}

// ── Generic data table ──────────────────────────────────────────────────────
function DataTable({ columns, rows, renderRow, sortableFields, currentSort, onSort }: {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  renderRow: (item: Record<string, unknown>, idx: number) => React.ReactNode;
  sortableFields?: Record<string, string>;
  currentSort?: string;
  onSort?: (sort: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Layers className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">No data available</p>
        <p className="text-xs mt-1">Connect to Wazuh API to see fleet-wide inventory</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/30">
            {columns.map((h) => {
              const sortField = sortableFields?.[h];
              if (sortField && onSort && currentSort !== undefined) {
                const isActive = currentSort.replace(/^[+-]/, "") === sortField;
                const isAsc = currentSort === `+${sortField}`;
                return (
                  <th
                    key={h}
                    className="text-left py-2 px-3 text-muted-foreground font-medium whitespace-nowrap cursor-pointer hover:text-foreground transition-colors select-none"
                    onClick={() => {
                      if (!isActive) onSort(`+${sortField}`);
                      else if (isAsc) onSort(`-${sortField}`);
                      else onSort("");
                    }}
                  >
                    <span className="inline-flex items-center gap-1">
                      {h}
                      {isActive ? (
                        isAsc ? <SortAsc className="h-3 w-3 text-primary" /> : <SortDesc className="h-3 w-3 text-primary" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </span>
                  </th>
                );
              }
              return (
                <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
              );
            })}
          </tr>
        </thead>
        <tbody>{rows.map((item, i) => renderRow(item, i))}</tbody>
      </table>
    </div>
  );
}

export default function FleetInventory() {
  const [activeTab, setActiveTab] = useState<TabKey>("packages");
  const [search, setSearch] = useState("");
  const [pages, setPages] = useState<Record<TabKey, number>>({
    packages: 1, processes: 1, ports: 1, os: 1, hardware: 1,
    hotfixes: 1, netaddr: 1, netiface: 1, netproto: 1,
  });
  const pageSize = 50;
  const utils = trpc.useUtils();

  // ── Sort state per tab ──
  const [sorts, setSorts] = useState<Record<TabKey, string>>({
    packages: "", processes: "", ports: "", os: "", hardware: "",
    hotfixes: "", netaddr: "", netiface: "", netproto: "",
  });

  // ── Distinct toggle ──
  const [distinct, setDistinct] = useState(false);

  // ── Hotfix filter ──
  const [hotfixFilter, setHotfixFilter] = useState("");

  // ── Connection check ──────────────────────────────────────────────────
  const statusQ = trpc.wazuh.status.useQuery(undefined, { retry: 1, staleTime: 60_000 });
  const isConnected = statusQ.data?.configured === true && statusQ.data?.data != null;

  // ── Common query options ──────────────────────────────────────────────
  const qOpts = useCallback((tab: TabKey) => ({
    retry: 1,
    staleTime: 30_000,
    enabled: isConnected && activeTab === tab,
  }), [isConnected, activeTab]);

  const qInput = useCallback((tab: TabKey) => ({
    limit: pageSize,
    offset: (pages[tab] - 1) * pageSize,
    ...(search ? { q: `name~${search}` } : {}),
    ...(sorts[tab] ? { sort: sorts[tab] } : {}),
    ...(distinct ? { distinct: true } : {}),
    ...(tab === "hotfixes" && hotfixFilter ? { hotfix: hotfixFilter } : {}),
  }), [pages, search, sorts, distinct, hotfixFilter]);

  // ── Queries (only active tab fetches) ─────────────────────────────────
  const packagesQ = trpc.wazuh.expSyscollectorPackages.useQuery(qInput("packages"), qOpts("packages"));
  const processesQ = trpc.wazuh.expSyscollectorProcesses.useQuery(qInput("processes"), qOpts("processes"));
  const portsQ = trpc.wazuh.expSyscollectorPorts.useQuery(qInput("ports"), qOpts("ports"));
  const osQ = trpc.wazuh.expSyscollectorOs.useQuery(qInput("os"), qOpts("os"));
  const hardwareQ = trpc.wazuh.expSyscollectorHardware.useQuery(qInput("hardware"), qOpts("hardware"));
  const hotfixesQ = trpc.wazuh.expSyscollectorHotfixes.useQuery(qInput("hotfixes"), qOpts("hotfixes"));
  const netaddrQ = trpc.wazuh.expSyscollectorNetaddr.useQuery(qInput("netaddr"), qOpts("netaddr"));
  const netifaceQ = trpc.wazuh.expSyscollectorNetiface.useQuery(qInput("netiface"), qOpts("netiface"));
  const netprotoQ = trpc.wazuh.expSyscollectorNetproto.useQuery(qInput("netproto"), qOpts("netproto"));

  const queryMap: Record<TabKey, typeof packagesQ> = {
    packages: packagesQ, processes: processesQ, ports: portsQ,
    os: osQ, hardware: hardwareQ, hotfixes: hotfixesQ,
    netaddr: netaddrQ, netiface: netifaceQ, netproto: netprotoQ,
  };

  const activeQuery = queryMap[activeTab];
  const { items, total } = useMemo(() => extractItems(activeQuery.data), [activeQuery.data]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // ── KPI data (from packages + processes + ports queries when available) ─
  const pkgData = useMemo(() => extractItems(packagesQ.data), [packagesQ.data]);
  const procData = useMemo(() => extractItems(processesQ.data), [processesQ.data]);
  const portData = useMemo(() => extractItems(portsQ.data), [portsQ.data]);
  const osData = useMemo(() => extractItems(osQ.data), [osQ.data]);

  const handleRefresh = useCallback(() => { utils.wazuh.invalidate(); }, [utils]);
  const handlePageChange = useCallback((tab: TabKey, p: number) => {
    setPages(prev => ({ ...prev, [tab]: p }));
  }, []);
  const handleSortChange = useCallback((tab: TabKey, sort: string) => {
    setSorts(prev => ({ ...prev, [tab]: sort }));
    setPages(prev => ({ ...prev, [tab]: 1 }));
  }, []);

  // ── Row renderers per tab ─────────────────────────────────────────────
  const rowRenderers: Record<TabKey, (item: Record<string, unknown>, idx: number) => React.ReactNode> = {
    packages: (item, i) => (
      <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
        <td className="py-2 px-3"><AgentCell item={item} /></td>
        <td className="py-2 px-3 text-foreground font-medium">{String(item.name ?? "—")}</td>
        <td className="py-2 px-3 font-mono text-primary">{String(item.version ?? "—")}</td>
        <td className="py-2 px-3 text-muted-foreground">{String(item.architecture ?? "—")}</td>
        <td className="py-2 px-3 text-muted-foreground truncate max-w-[200px]">{String(item.vendor ?? "—")}</td>
        <td className="py-2 px-3 text-muted-foreground">{String(item.format ?? "—")}</td>
      </tr>
    ),
    processes: (item, i) => (
      <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
        <td className="py-2 px-3"><AgentCell item={item} /></td>
        <td className="py-2 px-3 text-foreground font-medium">{String(item.name ?? "—")}</td>
        <td className="py-2 px-3 font-mono text-primary">{String(item.pid ?? "—")}</td>
        <td className="py-2 px-3 font-mono text-muted-foreground">{String(item.ppid ?? "—")}</td>
        <td className="py-2 px-3">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            String(item.state) === "R" ? "bg-green-500/20 text-green-300" :
            String(item.state) === "S" ? "bg-blue-500/20 text-blue-300" :
            String(item.state) === "Z" ? "bg-red-500/20 text-red-300" :
            "bg-secondary/40 text-muted-foreground"
          }`}>{String(item.state ?? "—")}</span>
        </td>
        <td className="py-2 px-3 text-muted-foreground">{String(item.euser ?? item.uname ?? "—")}</td>
        <td className="py-2 px-3 font-mono text-muted-foreground truncate max-w-[300px]">{String(item.cmd ?? "—")}</td>
      </tr>
    ),
    ports: (item, i) => (
      <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
        <td className="py-2 px-3"><AgentCell item={item} /></td>
        <td className="py-2 px-3 text-foreground">{String(item.protocol ?? "—")}</td>
        <td className="py-2 px-3 font-mono text-muted-foreground">{String((item.local as Record<string, unknown>)?.ip ?? item.local_ip ?? "—")}</td>
        <td className="py-2 px-3 font-mono text-primary">{String((item.local as Record<string, unknown>)?.port ?? item.local_port ?? "—")}</td>
        <td className="py-2 px-3 font-mono text-muted-foreground">{String((item.remote as Record<string, unknown>)?.ip ?? item.remote_ip ?? "—")}</td>
        <td className="py-2 px-3">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            String(item.state) === "listening" ? "bg-green-500/20 text-green-300" :
            String(item.state) === "established" ? "bg-cyan-500/20 text-cyan-300" :
            "bg-secondary/40 text-muted-foreground"
          }`}>{String(item.state ?? "—")}</span>
        </td>
        <td className="py-2 px-3 font-mono text-muted-foreground">{String(item.pid ?? item.process ?? "—")}</td>
      </tr>
    ),
    os: (item, i) => (
      <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
        <td className="py-2 px-3"><AgentCell item={item} /></td>
        <td className="py-2 px-3 text-foreground font-medium">{String(item.os_name ?? (item.os as Record<string, unknown>)?.name ?? "—")}</td>
        <td className="py-2 px-3 font-mono text-primary">{String(item.os_version ?? (item.os as Record<string, unknown>)?.version ?? "—")}</td>
        <td className="py-2 px-3 text-muted-foreground">{String(item.architecture ?? "—")}</td>
        <td className="py-2 px-3 text-muted-foreground">{String(item.os_platform ?? (item.os as Record<string, unknown>)?.platform ?? "—")}</td>
        <td className="py-2 px-3 text-muted-foreground">{String(item.hostname ?? "—")}</td>
      </tr>
    ),
    hardware: (item, i) => (
      <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
        <td className="py-2 px-3"><AgentCell item={item} /></td>
        <td className="py-2 px-3 text-foreground font-medium">{String((item.cpu as Record<string, unknown>)?.name ?? item.cpu_name ?? "—")}</td>
        <td className="py-2 px-3 font-mono text-primary">{String((item.cpu as Record<string, unknown>)?.cores ?? item.cpu_cores ?? "—")}</td>
        <td className="py-2 px-3 font-mono text-muted-foreground">{String((item.ram as Record<string, unknown>)?.total ?? item.ram_total ?? "—")}</td>
        <td className="py-2 px-3 font-mono text-muted-foreground truncate max-w-[200px]">{String(item.board_serial ?? "—")}</td>
      </tr>
    ),
    hotfixes: (item, i) => (
      <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
        <td className="py-2 px-3"><AgentCell item={item} /></td>
        <td className="py-2 px-3 font-mono text-primary">{String(item.hotfix ?? "—")}</td>
        <td className="py-2 px-3 text-muted-foreground">{String(item.scan_time ?? (item.scan as Record<string, unknown>)?.time ?? "—")}</td>
      </tr>
    ),
    netaddr: (item, i) => (
      <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
        <td className="py-2 px-3"><AgentCell item={item} /></td>
        <td className="py-2 px-3 text-foreground">{String(item.iface ?? "—")}</td>
        <td className="py-2 px-3 font-mono text-primary">{String(item.address ?? "—")}</td>
        <td className="py-2 px-3 font-mono text-muted-foreground">{String(item.netmask ?? "—")}</td>
        <td className="py-2 px-3 font-mono text-muted-foreground">{String(item.broadcast ?? "—")}</td>
        <td className="py-2 px-3 text-muted-foreground">{String(item.proto ?? item.protocol ?? "—")}</td>
      </tr>
    ),
    netiface: (item, i) => (
      <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
        <td className="py-2 px-3"><AgentCell item={item} /></td>
        <td className="py-2 px-3 text-foreground font-medium">{String(item.name ?? "—")}</td>
        <td className="py-2 px-3 text-muted-foreground">{String(item.type ?? "—")}</td>
        <td className="py-2 px-3">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            String(item.state) === "up" ? "bg-green-500/20 text-green-300" : "bg-secondary/40 text-muted-foreground"
          }`}>{String(item.state ?? "—")}</span>
        </td>
        <td className="py-2 px-3 font-mono text-muted-foreground">{String(item.mac ?? "—")}</td>
        <td className="py-2 px-3 font-mono text-muted-foreground">{String(item.mtu ?? "—")}</td>
        <td className="py-2 px-3 font-mono text-muted-foreground">
          {String((item.tx as Record<string, unknown>)?.packets ?? "—")} / {String((item.rx as Record<string, unknown>)?.packets ?? "—")}
        </td>
      </tr>
    ),
    netproto: (item, i) => (
      <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
        <td className="py-2 px-3"><AgentCell item={item} /></td>
        <td className="py-2 px-3 text-foreground">{String(item.iface ?? "—")}</td>
        <td className="py-2 px-3 text-muted-foreground">{String(item.type ?? "—")}</td>
        <td className="py-2 px-3 font-mono text-primary">{String(item.gateway ?? "—")}</td>
        <td className="py-2 px-3 text-muted-foreground">{String(item.dhcp ?? "—")}</td>
      </tr>
    ),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fleet Inventory"
        subtitle="Fleet-wide syscollector data across all agents — packages, processes, ports, network, hardware, OS, and hotfixes"
        onRefresh={handleRefresh}
        isLoading={activeQuery.isLoading}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Packages"
          value={pkgData.total.toLocaleString()}
          icon={Package}
          colorClass="text-primary"
        />
        <StatCard
          label="Total Processes"
          value={procData.total.toLocaleString()}
          icon={Activity}
          colorClass="text-threat-low"
        />
        <StatCard
          label="Open Ports"
          value={portData.total.toLocaleString()}
          icon={Globe}
          colorClass="text-threat-medium"
        />
        <StatCard
          label="OS Entries"
          value={osData.total.toLocaleString()}
          icon={Server}
          colorClass="text-cyan-400"
        />
      </div>

      {/* Search */}
      <GlassPanel className="py-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name (q filter)..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPages(prev => ({ ...prev, [activeTab]: 1 }));
              }}
              className="pl-10 bg-secondary/20 border-border/30 text-sm"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            Showing {items.length} of {total.toLocaleString()} records
          </span>
          <div className="flex items-center gap-3 ml-auto">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={distinct}
                onChange={(e) => {
                  setDistinct(e.target.checked);
                  setPages(prev => ({ ...prev, [activeTab]: 1 }));
                }}
                className="rounded border-border/30"
              />
              Distinct
            </label>
            {activeTab === "hotfixes" && (
              <div className="flex items-center gap-1">
                <Input
                  placeholder="Filter hotfix ID..."
                  value={hotfixFilter}
                  onChange={(e) => {
                    setHotfixFilter(e.target.value);
                    setPages(prev => ({ ...prev, hotfixes: 1 }));
                  }}
                  className="h-7 w-36 text-xs bg-secondary/20 border-border/30"
                />
                {hotfixFilter && (
                  <button onClick={() => { setHotfixFilter(""); setPages(prev => ({ ...prev, hotfixes: 1 })); }} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </GlassPanel>

      {/* Tabbed Content */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        <TabsList className="bg-secondary/20 border border-border/30 p-1 flex-wrap h-auto gap-1">
          {(Object.entries(TAB_META) as [TabKey, typeof TAB_META[TabKey]][]).map(([key, meta]) => {
            const Icon = meta.icon;
            return (
              <TabsTrigger
                key={key}
                value={key}
                className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs gap-1.5 px-3"
              >
                <Icon className="h-3.5 w-3.5" />
                {meta.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {(Object.keys(TAB_META) as TabKey[]).map((tab) => (
          <TabsContent key={tab} value={tab} className="mt-4">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {(() => { const Icon = TAB_META[tab].icon; return <Icon className="h-4 w-4 text-primary" />; })()}
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {TAB_META[tab].label}
                    <span className="ml-2 text-xs text-muted-foreground/60">
                      ({total.toLocaleString()} records)
                    </span>
                  </h3>
                </div>
                {activeQuery.data ? (
                  <RawJsonViewer data={activeQuery.data as Record<string, unknown>} title={`${TAB_META[tab].label} JSON`} />
                ) : null}
              </div>

              <BrokerWarnings data={activeQuery.data} context={TAB_META[tab].label} />

              {activeQuery.isLoading ? (
                <TableSkeleton columns={TAB_META[tab].columns.length} rows={8} />
              ) : (
                <>
                  <DataTable
                    columns={TAB_META[tab].columns}
                    rows={items}
                    renderRow={rowRenderers[tab]}
                    sortableFields={TAB_SORT_FIELDS[tab]}
                    currentSort={sorts[tab]}
                    onSort={(s) => handleSortChange(tab, s)}
                  />
                  {totalPages > 1 && (
                    <Pagination
                      page={pages[tab]}
                      totalPages={totalPages}
                      onPageChange={(p) => handlePageChange(tab, p)}
                      total={total}
                    />
                  )}
                </>
              )}
            </GlassPanel>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
