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
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";

function extractItems(raw: unknown): { items: Array<Record<string, unknown>>; total: number } {
  const d = (raw as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  const items = (d?.affected_items as Array<Record<string, unknown>>) ?? [];
  const total = Number(d?.total_affected_items ?? items.length);
  return { items, total };
}

type TabKey = "rules" | "actions" | "resources" | "policies" | "roles" | "users" | "allPolicies" | "currentUser";

export default function SecurityExplorer() {
  const [activeTab, setActiveTab] = useState<TabKey>("rules");
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();

  const statusQ = trpc.wazuh.status.useQuery(undefined, { retry: 1, staleTime: 60_000 });
  const isConnected = statusQ.data?.configured === true && statusQ.data?.data != null;

  const rulesQ = trpc.wazuh.securityRbacRules.useQuery({ limit: 500, offset: 0 }, { retry: 1, staleTime: 60_000, enabled: isConnected });
  const actionsQ = trpc.wazuh.securityActions.useQuery({}, { retry: 1, staleTime: 60_000, enabled: isConnected });
  const resourcesQ = trpc.wazuh.securityResources.useQuery({}, { retry: 1, staleTime: 60_000, enabled: isConnected });
  const policiesQ = trpc.wazuh.securityCurrentUserPolicies.useQuery(undefined, { retry: 1, staleTime: 60_000, enabled: isConnected });
  const securityRolesQ = trpc.wazuh.securityRoles.useQuery(undefined, { retry: 1, staleTime: 60_000, enabled: isConnected });
  const securityUsersQ = trpc.wazuh.securityUsers.useQuery(undefined, { retry: 1, staleTime: 60_000, enabled: isConnected });
  const securityPoliciesQ = trpc.wazuh.securityPolicies.useQuery(undefined, { retry: 1, staleTime: 60_000, enabled: isConnected });
  const securityCurrentUserQ = trpc.wazuh.securityCurrentUser.useQuery(undefined, { retry: 1, staleTime: 60_000, enabled: isConnected });

  const rulesData = useMemo(() => extractItems(rulesQ.data), [rulesQ.data]);
  const actionsData = useMemo(() => {
    // Actions endpoint may return a flat object of action→description, not affected_items
    const d = (actionsQ.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    if (d?.affected_items) {
      return extractItems(actionsQ.data);
    }
    // Flat object format
    if (d && typeof d === "object") {
      const entries = Object.entries(d).filter(([k]) =>
        !["affected_items", "total_affected_items", "total_failed_items", "failed_items"].includes(k)
      );
      return {
        items: entries.map(([action, desc]) => ({ action, description: String(desc ?? "") })),
        total: entries.length,
      };
    }
    return { items: [], total: 0 };
  }, [actionsQ.data]);

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
        items: entries.map(([resource, desc]) => ({ resource, description: String(desc ?? "") })),
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

  const policiesData = useMemo(() => {
    const d = (policiesQ.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    if (d?.affected_items) {
      return extractItems(policiesQ.data);
    }
    // May be a flat policies object
    if (d && typeof d === "object") {
      const entries = Object.entries(d).filter(([k]) =>
        !["affected_items", "total_affected_items", "total_failed_items", "failed_items"].includes(k)
      );
      return {
        items: entries.map(([key, val]) => ({ key, value: val })),
        total: entries.length,
      };
    }
    return { items: [], total: 0 };
  }, [policiesQ.data]);

  const handleRefresh = useCallback(() => { utils.wazuh.invalidate(); }, [utils]);

  // Filter items by search
  const filterItems = useCallback((items: Array<Record<string, unknown>>) => {
    if (!search) return items;
    const lower = search.toLowerCase();
    return items.filter(item =>
      Object.values(item).some(v => String(v ?? "").toLowerCase().includes(lower))
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
              onChange={(e) => setSearch(e.target.value)}
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

          {/* RBAC Rules */}
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
                        <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                          <td className="py-2 px-3 font-mono text-primary">{String(rule.id ?? i)}</td>
                          <td className="py-2 px-3 text-foreground font-medium">{String(rule.name ?? "—")}</td>
                          <td className="py-2 px-3 font-mono text-muted-foreground max-w-[400px]">
                            <span className="truncate block">{typeof rule.body === "object" ? JSON.stringify(rule.body) : String(rule.rule ?? rule.body ?? "—")}</span>
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
            </GlassPanel>
          </TabsContent>

          {/* Actions */}
          <TabsContent value="actions" className="mt-4">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" /> Available Actions ({actionsData.total})
                </h3>
                {actionsQ.data ? <RawJsonViewer data={actionsQ.data as Record<string, unknown>} title="Actions JSON" /> : null}
              </div>
              {actionsQ.isLoading ? <TableSkeleton columns={2} rows={8} /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30">
                        {["Action", "Description"].map(h => (
                          <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filterItems(actionsData.items).map((item, i) => (
                        <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                          <td className="py-2 px-3 font-mono text-primary">{String(item.action ?? item.name ?? Object.keys(item)[0] ?? "—")}</td>
                          <td className="py-2 px-3 text-muted-foreground">{String(item.description ?? Object.values(item)[0] ?? "—")}</td>
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

          {/* Resources */}
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
                          <td className="py-2 px-3 font-mono text-primary">{String(item.resource ?? item.name ?? Object.keys(item)[0] ?? "—")}</td>
                          <td className="py-2 px-3 text-muted-foreground">{String(item.description ?? Object.values(item)[0] ?? "—")}</td>
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

          {/* Current User Policies */}
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
                          {["Policy / Key", "Value / Effect"].map(h => (
                            <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filterItems(policiesData.items).map((item, i) => (
                          <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                            <td className="py-2 px-3 font-mono text-primary">{String(item.key ?? item.name ?? item.id ?? "—")}</td>
                            <td className="py-2 px-3 font-mono text-muted-foreground max-w-[500px]">
                              <span className="truncate block">
                                {typeof item.value === "object" ? JSON.stringify(item.value) : String(item.value ?? item.effect ?? "—")}
                              </span>
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
                        {["ID", "Name", "Policies", "Rules"].map(h => (
                          <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filterItems(securityRolesData.items).map((role, i) => (
                        <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                          <td className="py-2 px-3 font-mono text-primary">{String(role.id ?? i)}</td>
                          <td className="py-2 px-3 text-foreground font-medium">{String(role.name ?? "\u2014")}</td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {Array.isArray(role.policies) ? (role.policies as Array<unknown>).map((p, j) => (
                              <span key={j} className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary mr-1 mb-0.5">
                                {String(typeof p === "object" && p !== null ? (p as Record<string, unknown>).id ?? JSON.stringify(p) : p)}
                              </span>
                            )) : "\u2014"}
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {Array.isArray(role.rules) ? (role.rules as Array<unknown>).map((r, j) => (
                              <span key={j} className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-secondary/30 text-foreground mr-1 mb-0.5">
                                {String(typeof r === "object" && r !== null ? (r as Record<string, unknown>).id ?? JSON.stringify(r) : r)}
                              </span>
                            )) : "\u2014"}
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
                        {["ID", "Username", "Roles", "Allow Run As"].map(h => (
                          <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filterItems(securityUsersData.items).map((user, i) => (
                        <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                          <td className="py-2 px-3 font-mono text-primary">{String(user.id ?? i)}</td>
                          <td className="py-2 px-3 text-foreground font-medium">{String(user.username ?? "\u2014")}</td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {Array.isArray(user.roles) ? (user.roles as Array<unknown>).map((r, j) => (
                              <span key={j} className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary mr-1 mb-0.5">
                                {String(typeof r === "object" && r !== null ? (r as Record<string, unknown>).id ?? JSON.stringify(r) : r)}
                              </span>
                            )) : "\u2014"}
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">{String(user.allow_run_as ?? "\u2014")}</td>
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
                        {["ID", "Name", "Policy", "Roles"].map(h => (
                          <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filterItems(securityPoliciesData.items).map((pol, i) => (
                        <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                          <td className="py-2 px-3 font-mono text-primary">{String(pol.id ?? i)}</td>
                          <td className="py-2 px-3 text-foreground font-medium">{String(pol.name ?? "\u2014")}</td>
                          <td className="py-2 px-3 font-mono text-muted-foreground max-w-[400px]">
                            <span className="truncate block">{typeof pol.policy === "object" ? JSON.stringify(pol.policy) : String(pol.policy ?? "\u2014")}</span>
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {Array.isArray(pol.roles) ? (pol.roles as Array<unknown>).map((r, j) => (
                              <span key={j} className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-secondary/30 text-foreground mr-1 mb-0.5">
                                {String(typeof r === "object" && r !== null ? (r as Record<string, unknown>).id ?? JSON.stringify(r) : r)}
                              </span>
                            )) : "\u2014"}
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
                        {typeof v === "object" && v !== null ? JSON.stringify(v, null, 2) : String(v ?? "\u2014")}
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
