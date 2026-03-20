/**
 * Security RBAC Explorer — read-only view of Wazuh security configuration
 *
 * Wires: securityRbacRules, securityActions, securityResources, securityCurrentUserPolicies,
 *        securityCurrentUser, securityPolicies, securityRoles, securityUsers
 */
import { trpc } from "@/lib/trpc";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { RawJsonViewer } from "@/components/shared/RawJsonViewer";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { WazuhGuard } from "@/components/shared/WazuhGuard";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { BrokerWarnings } from "@/components/shared/BrokerWarnings";
import {
  Shield,
  Lock,
  Key,
  FileText,
  Search,
  Layers,
  UserCheck,
  Zap,
  Database,
  Users,
  User,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { SortableHeader } from "@/components/shared/SortableHeader";
import { SimplePagination } from "@/components/shared/SimplePagination";

// ── Helpers ────────────────────────────────────────────────────────────────

function extractItems(raw: unknown): { items: Array<Record<string, unknown>>; total: number } {
  const d = (raw as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  const items = (d?.affected_items as Array<Record<string, unknown>>) ?? [];
  const total = Number(d?.total_affected_items ?? items.length);
  return { items, total };
}

/** Safely render any value — objects become formatted JSON, primitives become strings */
function safeDisplay(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

/** Extract a human-readable description from an action/resource value object.
 *  Wazuh actions API returns: { description: "...", resources: [...], example: {...}, related_endpoints: [...] }
 *  Wazuh resources API returns: { description: "..." }
 */
function extractDescription(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "string") return val;
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    if (typeof obj.description === "string") return obj.description;
    return JSON.stringify(val);
  }
  return String(val);
}

/** Render a compact inline JSON badge for small objects (RBAC rule bodies, policy effects) */
function InlineJson({ value, maxLen = 120 }: { value: unknown; maxLen?: number }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  const str = typeof value === "string" ? value : JSON.stringify(value);
  const truncated = str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
  return (
    <code className="text-[10px] leading-relaxed font-mono text-foreground/80 bg-white/[0.03] px-1.5 py-0.5 rounded border border-white/5 break-all">
      {truncated}
    </code>
  );
}

/** Render policy effect entries: {"*:*:*": "allow", "agent:id:001": "deny"} as colored badges */
function PolicyEffectBadges({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  if (typeof value !== "object") return <span className="font-mono text-muted-foreground">{String(value)}</span>;

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([resource, effect], i) => {
        const effectStr = String(effect ?? "");
        const isAllow = effectStr.toLowerCase() === "allow";
        const isDeny = effectStr.toLowerCase() === "deny";
        return (
          <span
            key={i}
            className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-mono border ${
              isAllow
                ? "bg-green-500/10 text-green-300 border-green-500/20"
                : isDeny
                  ? "bg-red-500/10 text-red-300 border-red-500/20"
                  : "bg-white/5 text-muted-foreground border-white/10"
            }`}
          >
            <span className="opacity-70">{resource}</span>
            <span className="font-semibold">{effectStr}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Render action detail sub-fields (resources, related_endpoints) */
function ActionDetailCell({ value }: { value: unknown }) {
  if (value === null || value === undefined || typeof value === "string") {
    return <span className="text-muted-foreground">{extractDescription(value)}</span>;
  }
  const obj = value as Record<string, unknown>;
  const desc = typeof obj.description === "string" ? obj.description : null;
  const resources = Array.isArray(obj.resources) ? obj.resources : null;
  const endpoints = Array.isArray(obj.related_endpoints) ? obj.related_endpoints : null;

  return (
    <div className="space-y-1.5">
      {desc && <p className="text-muted-foreground">{desc}</p>}
      {resources && resources.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {resources.map((r, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 font-mono">
              {String(r)}
            </span>
          ))}
        </div>
      )}
      {endpoints && endpoints.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {endpoints.map((ep, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
              {String(ep)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

type TabKey = "rules" | "actions" | "resources" | "policies" | "roles" | "users" | "allPolicies" | "currentUser";

export default function SecurityExplorer() {
  const [activeTab, setActiveTab] = useState<TabKey>("rules");
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();

  // ── Pagination state per tab ──
  const [rolesPage, setRolesPage] = useState(0);
  const [policiesPage, setPoliciesPage] = useState(0);
  const [usersPage, setUsersPage] = useState(0);
  const pageSize = 25;

  // ── Sort state ──
  const [rolesSort, setRolesSort] = useState("");
  const [policiesSort, setPoliciesSort] = useState("");
  const [usersSort, setUsersSort] = useState("");

  // ── Server search (debounced) ──
  const [serverSearch, setServerSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setServerSearch(value);
      setRolesPage(0);
      setPoliciesPage(0);
      setUsersPage(0);
    }, 300);
  }, []);

  // ── Detail selection state ──
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedPolicyId, setSelectedPolicyId] = useState<number | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null);

  // ── Actions endpoint filter ──
  const [actionsEndpointFilter, setActionsEndpointFilter] = useState("");

  const statusQ = trpc.wazuh.status.useQuery(undefined, { retry: 1, staleTime: 60_000 });
  const isConnected = statusQ.data?.configured === true && statusQ.data?.data != null;

  const rulesQ = trpc.wazuh.securityRbacRules.useQuery({ limit: 500, offset: 0 }, { retry: 1, staleTime: 60_000, enabled: isConnected });
  const actionsQ = trpc.wazuh.securityActions.useQuery(
    {
      ...(actionsEndpointFilter ? { endpoint: actionsEndpointFilter } : {}),
    },
    { retry: 1, staleTime: 60_000, enabled: isConnected }
  );
  const resourcesQ = trpc.wazuh.securityResources.useQuery({}, { retry: 1, staleTime: 60_000, enabled: isConnected });
  const policiesQ = trpc.wazuh.securityCurrentUserPolicies.useQuery(undefined, { retry: 1, staleTime: 60_000, enabled: isConnected });
  const securityRolesQ = trpc.wazuh.securityRoles.useQuery(
    {
      offset: rolesPage * pageSize,
      limit: pageSize,
      ...(serverSearch ? { search: serverSearch } : {}),
      ...(rolesSort ? { sort: rolesSort } : {}),
    },
    { retry: 1, staleTime: 60_000, enabled: isConnected }
  );
  const securityUsersQ = trpc.wazuh.securityUsers.useQuery(
    {
      offset: usersPage * pageSize,
      limit: pageSize,
      ...(serverSearch ? { search: serverSearch } : {}),
      ...(usersSort ? { sort: usersSort } : {}),
    },
    { retry: 1, staleTime: 60_000, enabled: isConnected }
  );
  const securityPoliciesQ = trpc.wazuh.securityPolicies.useQuery(
    {
      offset: policiesPage * pageSize,
      limit: pageSize,
      ...(serverSearch ? { search: serverSearch } : {}),
      ...(policiesSort ? { sort: policiesSort } : {}),
    },
    { retry: 1, staleTime: 60_000, enabled: isConnected }
  );
  const securityCurrentUserQ = trpc.wazuh.securityCurrentUser.useQuery(undefined, { retry: 1, staleTime: 60_000, enabled: isConnected });

  // ── Detail queries (by ID) ──
  const roleDetailQ = trpc.wazuh.securityRoleById.useQuery({ roleId: selectedRoleId! }, { retry: 1, staleTime: 30_000, enabled: isConnected && selectedRoleId !== null });
  const userDetailQ = trpc.wazuh.securityUserById.useQuery({ userId: selectedUserId! }, { retry: 1, staleTime: 30_000, enabled: isConnected && selectedUserId !== null });
  const policyDetailQ = trpc.wazuh.securityPolicyById.useQuery({ policyId: selectedPolicyId! }, { retry: 1, staleTime: 30_000, enabled: isConnected && selectedPolicyId !== null });
  const ruleDetailQ = trpc.wazuh.securityRuleById.useQuery({ ruleId: selectedRuleId! }, { retry: 1, staleTime: 30_000, enabled: isConnected && selectedRuleId !== null });

  const rulesData = useMemo(() => extractItems(rulesQ.data), [rulesQ.data]);

  // ── Actions parser ─────────────────────────────────────────────────────
  // Wazuh GET /security/actions returns a flat dict:
  //   { "agent:create": { description: "...", resources: [...], example: {...}, related_endpoints: [...] }, ... }
  const actionsData = useMemo(() => {
    const d = (actionsQ.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    if (d?.affected_items) {
      return extractItems(actionsQ.data);
    }
    if (d && typeof d === "object") {
      const entries = Object.entries(d).filter(([k]) =>
        !["affected_items", "total_affected_items", "total_failed_items", "failed_items"].includes(k)
      );
      return {
        items: entries.map(([action, val]) => ({
          action,
          description: extractDescription(val),
          _raw: val, // preserve full object for detail rendering
        })),
        total: entries.length,
      };
    }
    return { items: [], total: 0 };
  }, [actionsQ.data]);

  // ── Resources parser ───────────────────────────────────────────────────
  // Wazuh GET /security/resources returns a flat dict:
  //   { "agent:id": { description: "..." }, "agent:group": { description: "..." }, ... }
  const resourcesData = useMemo(() => {
    const d = (resourcesQ.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    if (d?.affected_items) {
      return extractItems(resourcesQ.data);
    }
    if (d && typeof d === "object") {
      const entries = Object.entries(d).filter(([k]) =>
        !["affected_items", "total_affected_items", "total_failed_items", "failed_items"].includes(k)
      );
      return {
        items: entries.map(([resource, val]) => ({
          resource,
          description: extractDescription(val),
        })),
        total: entries.length,
      };
    }
    return { items: [], total: 0 };
  }, [resourcesQ.data]);

  const securityRolesData = useMemo(() => extractItems(securityRolesQ.data), [securityRolesQ.data]);
  const securityUsersData = useMemo(() => extractItems(securityUsersQ.data), [securityUsersQ.data]);
  const securityPoliciesData = useMemo(() => extractItems(securityPoliciesQ.data), [securityPoliciesQ.data]);
  const currentUserData = useMemo(() => {
    const d = (securityCurrentUserQ.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    const items = (d?.affected_items as Array<Record<string, unknown>>) ?? [];
    return items[0] ?? (d && typeof d === "object" ? d : {});
  }, [securityCurrentUserQ.data]);

  // ── My Policies parser ─────────────────────────────────────────────────
  // Wazuh GET /security/user/policies returns a flat dict:
  //   { "agent:create": { "*:*:*": "allow" }, "agent:delete": { "*:*:*": "deny" }, ... }
  const policiesData = useMemo(() => {
    const d = (policiesQ.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    if (d?.affected_items) {
      return extractItems(policiesQ.data);
    }
    if (d && typeof d === "object") {
      const entries = Object.entries(d).filter(([k]) =>
        !["affected_items", "total_affected_items", "total_failed_items", "failed_items", "rbac_mode"].includes(k)
      );
      return {
        items: entries.map(([key, val]) => ({ key, value: val })),
        total: entries.length,
      };
    }
    return { items: [], total: 0 };
  }, [policiesQ.data]);

  const handleRefresh = useCallback(() => { utils.wazuh.invalidate(); }, [utils]);

  // Filter items by search — uses safeDisplay for object-safe stringification
  const filterItems = useCallback((items: Array<Record<string, unknown>>) => {
    if (!search) return items;
    const lower = search.toLowerCase();
    return items.filter(item =>
      Object.values(item).some(v => safeDisplay(v).toLowerCase().includes(lower))
    );
  }, [search]);

  const isLoading = statusQ.isLoading;

  return (
    <WazuhGuard>
      <div className="space-y-6">
        <PageHeader
          title="Security & RBAC"
          subtitle="Read-only view of Wazuh security RBAC rules, available actions, resources, and current user effective policies"
          onRefresh={handleRefresh}
          isLoading={isLoading}
        />

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
          <StatCard label="RBAC Rules" value={rulesData.total} icon={Shield} colorClass="text-primary" />
          <StatCard label="Actions" value={actionsData.total} icon={Zap} colorClass="text-threat-medium" />
          <StatCard label="Resources" value={resourcesData.total} icon={Database} colorClass="text-cyan-400" />
          <StatCard label="Policies" value={policiesData.total} icon={Lock} colorClass="text-threat-low" />
          <StatCard label="Roles" value={securityRolesData.total} icon={Key} colorClass="text-amber-400" />
          <StatCard label="Users" value={securityUsersData.total} icon={Users} colorClass="text-emerald-400" />
          <StatCard label="All Policies" value={securityPoliciesData.total} icon={FileText} colorClass="text-sky-400" />
        </div>

        {/* Search */}
        <GlassPanel className="py-3">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by keyword..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 bg-secondary/20 border-border/30 text-sm"
            />
          </div>
        </GlassPanel>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
          <TabsList className="bg-secondary/20 border border-border/30 p-1">
            <TabsTrigger value="rules" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs gap-1.5">
              <Shield className="h-3.5 w-3.5" /> RBAC Rules
            </TabsTrigger>
            <TabsTrigger value="actions" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs gap-1.5">
              <Zap className="h-3.5 w-3.5" /> Actions
            </TabsTrigger>
            <TabsTrigger value="resources" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs gap-1.5">
              <Database className="h-3.5 w-3.5" /> Resources
            </TabsTrigger>
            <TabsTrigger value="policies" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs gap-1.5">
              <UserCheck className="h-3.5 w-3.5" /> My Policies
            </TabsTrigger>
            <TabsTrigger value="roles" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs gap-1.5">
              <Key className="h-3.5 w-3.5" /> Roles
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs gap-1.5">
              <Users className="h-3.5 w-3.5" /> Users
            </TabsTrigger>
            <TabsTrigger value="allPolicies" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs gap-1.5">
              <FileText className="h-3.5 w-3.5" /> All Policies
            </TabsTrigger>
            <TabsTrigger value="currentUser" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs gap-1.5">
              <User className="h-3.5 w-3.5" /> Current User
            </TabsTrigger>
          </TabsList>

          {/* ═══════════════════════════════════════════════════════════════
              RBAC Rules Tab
              API shape: affected_items[].{ id, name, rule: {FIND: {...}}, body: {...}, roles: [...] }
              FIX: rule.rule is an object — must JSON.stringify it, not String() it
              ═══════════════════════════════════════════════════════════════ */}
          <TabsContent value="rules" className="mt-4">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" /> RBAC Rules ({rulesData.total})
                </h3>
                {rulesQ.data ? <RawJsonViewer data={rulesQ.data as Record<string, unknown>} title="RBAC Rules JSON" /> : null}
              </div>
              {rulesQ.isLoading ? <TableSkeleton columns={4} rows={6} /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30">
                        {["ID", "Name", "Body / Rule", "Roles"].map(h => (
                          <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filterItems(rulesData.items).map((rule, i) => (
                        <tr key={i} className={`border-b border-border/10 hover:bg-secondary/20 transition-colors cursor-pointer ${selectedRuleId === Number(rule.id) ? "bg-primary/10" : ""}`} onClick={() => setSelectedRuleId(selectedRuleId === Number(rule.id) ? null : Number(rule.id))}>
                          <td className="py-2 px-3 font-mono text-primary">{String(rule.id ?? i)}</td>
                          <td className="py-2 px-3 text-foreground font-medium">{String(rule.name ?? "—")}</td>
                          <td className="py-2 px-3 font-mono text-muted-foreground max-w-[400px]">
                            {/* FIX: both rule.body AND rule.rule can be objects */}
                            <InlineJson value={rule.rule ?? rule.body} />
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {Array.isArray(rule.roles) ? (rule.roles as Array<unknown>).map((r, j) => (
                              <span key={j} className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary mr-1 mb-0.5">
                                {String(typeof r === "object" && r !== null ? (r as Record<string, unknown>).id ?? r : r)}
                              </span>
                            )) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filterItems(rulesData.items).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <Layers className="h-6 w-6 mx-auto mb-2 opacity-40" />
                      No RBAC rules found
                    </div>
                  )}
                </div>
              )}
              {selectedRuleId !== null && (
                <div className="mt-3 pt-3 border-t border-border/20">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-medium text-primary flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> Rule Detail — ID {selectedRuleId}</h4>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSelectedRuleId(null)}><X className="h-3 w-3 mr-1" /> Close</Button>
                  </div>
                  {ruleDetailQ.isLoading ? <TableSkeleton columns={2} rows={4} /> : ruleDetailQ.data ? (
                    <div className="space-y-1">
                      {Object.entries(extractItems(ruleDetailQ.data).items[0] ?? {}).map(([k, v]) => (
                        <div key={k} className="flex items-start gap-3 py-1 border-b border-border/5">
                          <span className="text-[10px] font-mono text-primary min-w-[120px] shrink-0">{k}</span>
                          <span className="text-[10px] font-mono text-foreground break-all">{typeof v === "object" && v !== null ? JSON.stringify(v, null, 2) : String(v ?? "—")}</span>
                        </div>
                      ))}
                      <RawJsonViewer data={ruleDetailQ.data as Record<string, unknown>} title={`Rule ${selectedRuleId} JSON`} />
                    </div>
                  ) : <p className="text-xs text-muted-foreground">No data</p>}
                </div>
              )}
            </GlassPanel>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════
              Actions Tab
              API shape: flat dict { "agent:create": { description, resources, example, related_endpoints }, ... }
              FIX: each value is a complex object — extract .description for display,
                   show resources/endpoints as colored badges
              ═══════════════════════════════════════════════════════════════ */}
          <TabsContent value="actions" className="mt-4">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" /> Available Actions ({actionsData.total})
                </h3>
                {actionsQ.data ? <RawJsonViewer data={actionsQ.data as Record<string, unknown>} title="Actions JSON" /> : null}
              </div>
              <div className="flex items-center gap-2 mb-3">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Filter by endpoint..."
                  value={actionsEndpointFilter}
                  onChange={(e) => setActionsEndpointFilter(e.target.value)}
                  className="h-7 w-48 text-xs bg-secondary/20 border-border/30"
                />
                {actionsEndpointFilter && (
                  <button onClick={() => setActionsEndpointFilter("")} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {actionsQ.isLoading ? <TableSkeleton columns={3} rows={8} /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30">
                        {["Action", "Description", "Resources / Endpoints"].map(h => (
                          <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filterItems(actionsData.items).map((item, i) => (
                        <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors align-top">
                          <td className="py-2 px-3 font-mono text-primary whitespace-nowrap">
                            {String(item.action ?? item.name ?? "—")}
                          </td>
                          <td className="py-2 px-3 text-muted-foreground max-w-[400px]">
                            {String(item.description ?? "—")}
                          </td>
                          <td className="py-2 px-3">
                            <ActionDetailCell value={(item as any)._raw} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filterItems(actionsData.items).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <Layers className="h-6 w-6 mx-auto mb-2 opacity-40" />
                      No actions found
                    </div>
                  )}
                </div>
              )}
            </GlassPanel>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════
              Resources Tab
              API shape: flat dict { "agent:id": { description: "..." }, ... }
              FIX: each value is { description: "..." } — extract .description
              ═══════════════════════════════════════════════════════════════ */}
          <TabsContent value="resources" className="mt-4">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary" /> Available Resources ({resourcesData.total})
                </h3>
                {resourcesQ.data ? <RawJsonViewer data={resourcesQ.data as Record<string, unknown>} title="Resources JSON" /> : null}
              </div>
              {resourcesQ.isLoading ? <TableSkeleton columns={2} rows={8} /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30">
                        {["Resource", "Description"].map(h => (
                          <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filterItems(resourcesData.items).map((item, i) => (
                        <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                          <td className="py-2 px-3 font-mono text-primary">{String(item.resource ?? item.name ?? "—")}</td>
                          <td className="py-2 px-3 text-muted-foreground">{String(item.description ?? "—")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filterItems(resourcesData.items).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <Layers className="h-6 w-6 mx-auto mb-2 opacity-40" />
                      No resources found
                    </div>
                  )}
                </div>
              )}
            </GlassPanel>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════
              My Policies Tab
              API shape: flat dict { "agent:create": { "*:*:*": "allow" }, ... }
              FIX: render effect entries as colored allow/deny badges
              ═══════════════════════════════════════════════════════════════ */}
          <TabsContent value="policies" className="mt-4">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <UserCheck className="h-4 w-4 text-primary" /> Current User Effective Policies ({policiesData.total})
                </h3>
                {policiesQ.data ? <RawJsonViewer data={policiesQ.data as Record<string, unknown>} title="Policies JSON" /> : null}
              </div>
              {policiesQ.isLoading ? <TableSkeleton columns={3} rows={6} /> : (
                <div className="overflow-x-auto">
                  {policiesData.items.length > 0 ? (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/30">
                          {["Action / Key", "Resource → Effect"].map(h => (
                            <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filterItems(policiesData.items).map((item, i) => (
                          <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors align-top">
                            <td className="py-2 px-3 font-mono text-primary whitespace-nowrap">
                              {String(item.key ?? item.name ?? item.id ?? "—")}
                            </td>
                            <td className="py-2 px-3">
                              <PolicyEffectBadges value={item.value} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <UserCheck className="h-6 w-6 mx-auto mb-2 opacity-40" />
                      No policies data available. Connect to Wazuh to view effective policies.
                    </div>
                  )}
                </div>
              )}
            </GlassPanel>
          </TabsContent>

          {/* Roles */}
          <TabsContent value="roles" className="mt-4">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Key className="h-4 w-4 text-primary" /> Security Roles ({securityRolesData.total})
                </h3>
                {securityRolesQ.data ? <RawJsonViewer data={securityRolesQ.data as Record<string, unknown>} title="Security Roles JSON" /> : null}
              </div>
              <BrokerWarnings data={securityRolesQ.data} context="Security Roles" />
              {securityRolesQ.isLoading ? <TableSkeleton columns={4} rows={6} /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30">
                        <SortableHeader label="ID" field="id" currentSort={rolesSort} onSort={(s) => { setRolesSort(s); setRolesPage(0); }} />
                        <SortableHeader label="Name" field="name" currentSort={rolesSort} onSort={(s) => { setRolesSort(s); setRolesPage(0); }} />
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">Policies</th>
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">Rules</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filterItems(securityRolesData.items).map((role, i) => (
                        <tr key={i} className={`border-b border-border/10 hover:bg-secondary/20 transition-colors cursor-pointer ${selectedRoleId === Number(role.id) ? "bg-primary/10" : ""}`} onClick={() => setSelectedRoleId(selectedRoleId === Number(role.id) ? null : Number(role.id))}>
                          <td className="py-2 px-3 font-mono text-primary">{String(role.id ?? i)}</td>
                          <td className="py-2 px-3 text-foreground font-medium">{String(role.name ?? "—")}</td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {Array.isArray(role.policies) ? (role.policies as Array<unknown>).map((p, j) => (
                              <span key={j} className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary mr-1 mb-0.5">
                                {String(typeof p === "object" && p !== null ? (p as Record<string, unknown>).id ?? JSON.stringify(p) : p)}
                              </span>
                            )) : "—"}
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {Array.isArray(role.rules) ? (role.rules as Array<unknown>).map((r, j) => (
                              <span key={j} className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-secondary/30 text-foreground mr-1 mb-0.5">
                                {String(typeof r === "object" && r !== null ? (r as Record<string, unknown>).id ?? JSON.stringify(r) : r)}
                              </span>
                            )) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filterItems(securityRolesData.items).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <Layers className="h-6 w-6 mx-auto mb-2 opacity-40" />
                      No roles found
                    </div>
                  )}
                  <SimplePagination
                    page={rolesPage}
                    totalPages={Math.max(1, Math.ceil(securityRolesData.total / pageSize))}
                    total={securityRolesData.total}
                    onPageChange={setRolesPage}
                    label="roles"
                  />
                </div>
              )}
              {selectedRoleId !== null && (
                <div className="mt-3 pt-3 border-t border-border/20">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-medium text-primary flex items-center gap-1.5"><Key className="h-3.5 w-3.5" /> Role Detail — ID {selectedRoleId}</h4>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSelectedRoleId(null)}><X className="h-3 w-3 mr-1" /> Close</Button>
                  </div>
                  {roleDetailQ.isLoading ? <TableSkeleton columns={2} rows={4} /> : roleDetailQ.data ? (
                    <div className="space-y-1">
                      {Object.entries(extractItems(roleDetailQ.data).items[0] ?? {}).map(([k, v]) => (
                        <div key={k} className="flex items-start gap-3 py-1 border-b border-border/5">
                          <span className="text-[10px] font-mono text-primary min-w-[120px] shrink-0">{k}</span>
                          <span className="text-[10px] font-mono text-foreground break-all">{typeof v === "object" && v !== null ? JSON.stringify(v, null, 2) : String(v ?? "—")}</span>
                        </div>
                      ))}
                      <RawJsonViewer data={roleDetailQ.data as Record<string, unknown>} title={`Role ${selectedRoleId} JSON`} />
                    </div>
                  ) : <p className="text-xs text-muted-foreground">No data</p>}
                </div>
              )}
            </GlassPanel>
          </TabsContent>

          {/* Users */}
          <TabsContent value="users" className="mt-4">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" /> Security Users ({securityUsersData.total})
                </h3>
                {securityUsersQ.data ? <RawJsonViewer data={securityUsersQ.data as Record<string, unknown>} title="Security Users JSON" /> : null}
              </div>
              <BrokerWarnings data={securityUsersQ.data} context="Security Users" />
              {securityUsersQ.isLoading ? <TableSkeleton columns={4} rows={6} /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30">
                        <SortableHeader label="ID" field="id" currentSort={usersSort} onSort={(s) => { setUsersSort(s); setUsersPage(0); }} />
                        <SortableHeader label="Username" field="username" currentSort={usersSort} onSort={(s) => { setUsersSort(s); setUsersPage(0); }} />
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">Roles</th>
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">Allow Run As</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filterItems(securityUsersData.items).map((user, i) => (
                        <tr key={i} className={`border-b border-border/10 hover:bg-secondary/20 transition-colors cursor-pointer ${selectedUserId === Number(user.id) ? "bg-primary/10" : ""}`} onClick={() => setSelectedUserId(selectedUserId === Number(user.id) ? null : Number(user.id))}>
                          <td className="py-2 px-3 font-mono text-primary">{String(user.id ?? i)}</td>
                          <td className="py-2 px-3 text-foreground font-medium">{String(user.username ?? "—")}</td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {Array.isArray(user.roles) ? (user.roles as Array<unknown>).map((r, j) => (
                              <span key={j} className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary mr-1 mb-0.5">
                                {String(typeof r === "object" && r !== null ? (r as Record<string, unknown>).id ?? JSON.stringify(r) : r)}
                              </span>
                            )) : "—"}
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">{String(user.allow_run_as ?? "—")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filterItems(securityUsersData.items).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <Layers className="h-6 w-6 mx-auto mb-2 opacity-40" />
                      No users found
                    </div>
                  )}
                  <SimplePagination
                    page={usersPage}
                    totalPages={Math.max(1, Math.ceil(securityUsersData.total / pageSize))}
                    total={securityUsersData.total}
                    onPageChange={setUsersPage}
                    label="users"
                  />
                </div>
              )}
              {selectedUserId !== null && (
                <div className="mt-3 pt-3 border-t border-border/20">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-medium text-primary flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> User Detail — ID {selectedUserId}</h4>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSelectedUserId(null)}><X className="h-3 w-3 mr-1" /> Close</Button>
                  </div>
                  {userDetailQ.isLoading ? <TableSkeleton columns={2} rows={4} /> : userDetailQ.data ? (
                    <div className="space-y-1">
                      {Object.entries(extractItems(userDetailQ.data).items[0] ?? {}).map(([k, v]) => (
                        <div key={k} className="flex items-start gap-3 py-1 border-b border-border/5">
                          <span className="text-[10px] font-mono text-primary min-w-[120px] shrink-0">{k}</span>
                          <span className="text-[10px] font-mono text-foreground break-all">{typeof v === "object" && v !== null ? JSON.stringify(v, null, 2) : String(v ?? "—")}</span>
                        </div>
                      ))}
                      <RawJsonViewer data={userDetailQ.data as Record<string, unknown>} title={`User ${selectedUserId} JSON`} />
                    </div>
                  ) : <p className="text-xs text-muted-foreground">No data</p>}
                </div>
              )}
            </GlassPanel>
          </TabsContent>

          {/* All Policies */}
          <TabsContent value="allPolicies" className="mt-4">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> All Security Policies ({securityPoliciesData.total})
                </h3>
                {securityPoliciesQ.data ? <RawJsonViewer data={securityPoliciesQ.data as Record<string, unknown>} title="All Policies JSON" /> : null}
              </div>
              <BrokerWarnings data={securityPoliciesQ.data} context="Security Policies" />
              {securityPoliciesQ.isLoading ? <TableSkeleton columns={4} rows={6} /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30">
                        <SortableHeader label="ID" field="id" currentSort={policiesSort} onSort={(s) => { setPoliciesSort(s); setPoliciesPage(0); }} />
                        <SortableHeader label="Name" field="name" currentSort={policiesSort} onSort={(s) => { setPoliciesSort(s); setPoliciesPage(0); }} />
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">Policy</th>
                        <th className="text-left py-2 px-3 text-muted-foreground font-medium">Roles</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filterItems(securityPoliciesData.items).map((pol, i) => (
                        <tr key={i} className={`border-b border-border/10 hover:bg-secondary/20 transition-colors cursor-pointer ${selectedPolicyId === Number(pol.id) ? "bg-primary/10" : ""}`} onClick={() => setSelectedPolicyId(selectedPolicyId === Number(pol.id) ? null : Number(pol.id))}>
                          <td className="py-2 px-3 font-mono text-primary">{String(pol.id ?? i)}</td>
                          <td className="py-2 px-3 text-foreground font-medium">{String(pol.name ?? "—")}</td>
                          <td className="py-2 px-3 font-mono text-muted-foreground max-w-[400px]">
                            <InlineJson value={pol.policy} />
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {Array.isArray(pol.roles) ? (pol.roles as Array<unknown>).map((r, j) => (
                              <span key={j} className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-secondary/30 text-foreground mr-1 mb-0.5">
                                {String(typeof r === "object" && r !== null ? (r as Record<string, unknown>).id ?? JSON.stringify(r) : r)}
                              </span>
                            )) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filterItems(securityPoliciesData.items).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <Layers className="h-6 w-6 mx-auto mb-2 opacity-40" />
                      No policies found
                    </div>
                  )}
                  <SimplePagination
                    page={policiesPage}
                    totalPages={Math.max(1, Math.ceil(securityPoliciesData.total / pageSize))}
                    total={securityPoliciesData.total}
                    onPageChange={setPoliciesPage}
                    label="policies"
                  />
                </div>
              )}
              {selectedPolicyId !== null && (
                <div className="mt-3 pt-3 border-t border-border/20">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-medium text-primary flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Policy Detail — ID {selectedPolicyId}</h4>
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setSelectedPolicyId(null)}><X className="h-3 w-3 mr-1" /> Close</Button>
                  </div>
                  {policyDetailQ.isLoading ? <TableSkeleton columns={2} rows={4} /> : policyDetailQ.data ? (
                    <div className="space-y-1">
                      {Object.entries(extractItems(policyDetailQ.data).items[0] ?? {}).map(([k, v]) => (
                        <div key={k} className="flex items-start gap-3 py-1 border-b border-border/5">
                          <span className="text-[10px] font-mono text-primary min-w-[120px] shrink-0">{k}</span>
                          <span className="text-[10px] font-mono text-foreground break-all">{typeof v === "object" && v !== null ? JSON.stringify(v, null, 2) : String(v ?? "—")}</span>
                        </div>
                      ))}
                      <RawJsonViewer data={policyDetailQ.data as Record<string, unknown>} title={`Policy ${selectedPolicyId} JSON`} />
                    </div>
                  ) : <p className="text-xs text-muted-foreground">No data</p>}
                </div>
              )}
            </GlassPanel>
          </TabsContent>

          {/* Current User */}
          <TabsContent value="currentUser" className="mt-4">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" /> Current Wazuh User
                </h3>
                {securityCurrentUserQ.data ? <RawJsonViewer data={securityCurrentUserQ.data as Record<string, unknown>} title="Current User JSON" /> : null}
              </div>
              <BrokerWarnings data={securityCurrentUserQ.data} context="Current User" />
              {securityCurrentUserQ.isLoading ? <TableSkeleton columns={2} rows={4} /> : (
                <div className="space-y-2">
                  {Object.entries(currentUserData).filter(([k]) => !["affected_items", "total_affected_items", "total_failed_items", "failed_items"].includes(k)).map(([k, v]) => (
                    <div key={k} className="flex items-start gap-3 py-1.5 border-b border-border/10">
                      <span className="text-[11px] font-mono text-primary min-w-[160px] shrink-0">{k}</span>
                      <span className="text-[11px] font-mono text-foreground break-all">
                        {typeof v === "object" && v !== null ? JSON.stringify(v, null, 2) : String(v ?? "—")}
                      </span>
                    </div>
                  ))}
                  {Object.keys(currentUserData).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <User className="h-6 w-6 mx-auto mb-2 opacity-40" />
                      No current user data available. Connect to Wazuh to view.
                    </div>
                  )}
                </div>
              )}
            </GlassPanel>
          </TabsContent>
        </Tabs>
      </div>
    </WazuhGuard>
  );
}
