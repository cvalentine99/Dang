/**
 * Agent Group Management — read-only view of Wazuh agent groups
 *
 * Wires: agentGroups, agentGroupMembers, agentsOutdated, agentsNoGroup,
 *        agentsStatsDistinct, groupConfiguration, groupFiles, groupFileContent
 */
import { trpc } from "@/lib/trpc";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { TableSkeleton } from "@/components/shared/TableSkeleton";
import { RawJsonViewer } from "@/components/shared/RawJsonViewer";
import { BrokerWarnings } from "@/components/shared/BrokerWarnings";
import { WazuhGuard } from "@/components/shared/WazuhGuard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FolderOpen,
  Users,
  AlertTriangle,
  UserMinus,
  BarChart3,
  Settings,
  FileText,
  File,
  Search,
  Layers,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";

function extractItems(raw: unknown): { items: Array<Record<string, unknown>>; total: number } {
  const d = (raw as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  const items = (d?.affected_items as Array<Record<string, unknown>>) ?? [];
  const total = Number(d?.total_affected_items ?? items.length);
  return { items, total };
}

type MainTab = "groups" | "outdated" | "noGroup" | "distinct";

export default function GroupManagement() {
  const [mainTab, setMainTab] = useState<MainTab>("groups");
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [groupTab, setGroupTab] = useState<"members" | "config" | "files">("members");
  const [membersPage, setMembersPage] = useState(0);
  const [outdatedPage, setOutdatedPage] = useState(0);
  const [noGroupPage, setNoGroupPage] = useState(0);
  const [distinctField, setDistinctField] = useState("os.platform");
  const [fileToView, setFileToView] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const statusQ = trpc.wazuh.status.useQuery(undefined, { retry: 1, staleTime: 30_000 });
  const isConnected = statusQ.data?.configured === true && statusQ.data?.data != null;

  // ── Queries ──────────────────────────────────────────────────────────────
  const groupsQ = trpc.wazuh.agentGroups.useQuery(
    { limit: 500, offset: 0 },
    { retry: 1, staleTime: 60_000, enabled: isConnected }
  );
  const outdatedQ = trpc.wazuh.agentsOutdated.useQuery(
    { limit: 100, offset: outdatedPage * 100 },
    { retry: 1, staleTime: 60_000, enabled: isConnected }
  );
  const noGroupQ = trpc.wazuh.agentsNoGroup.useQuery(
    { limit: 100, offset: noGroupPage * 100 },
    { retry: 1, staleTime: 60_000, enabled: isConnected }
  );
  const distinctQ = trpc.wazuh.agentsStatsDistinct.useQuery(
    { fields: distinctField },
    { retry: 1, staleTime: 60_000, enabled: isConnected }
  );
  const membersQ = trpc.wazuh.agentGroupMembers.useQuery(
    { groupId: selectedGroup ?? "", limit: 100, offset: membersPage * 100 },
    { retry: 1, staleTime: 60_000, enabled: isConnected && !!selectedGroup }
  );
  const groupConfigQ = trpc.wazuh.groupConfiguration.useQuery(
    { groupId: selectedGroup ?? "" },
    { retry: 1, staleTime: 60_000, enabled: isConnected && !!selectedGroup && groupTab === "config" }
  );
  const groupFilesQ = trpc.wazuh.groupFiles.useQuery(
    { groupId: selectedGroup ?? "" },
    { retry: 1, staleTime: 60_000, enabled: isConnected && !!selectedGroup && groupTab === "files" }
  );
  const groupFileContentQ = trpc.wazuh.groupFileContent.useQuery(
    { groupId: selectedGroup ?? "", fileName: fileToView ?? "" },
    { retry: 1, staleTime: 60_000, enabled: isConnected && !!selectedGroup && !!fileToView }
  );

  // ── Derived data ─────────────────────────────────────────────────────────
  const groupsData = useMemo(() => extractItems(groupsQ.data), [groupsQ.data]);
  const outdatedData = useMemo(() => extractItems(outdatedQ.data), [outdatedQ.data]);
  const noGroupData = useMemo(() => extractItems(noGroupQ.data), [noGroupQ.data]);
  const membersData = useMemo(() => extractItems(membersQ.data), [membersQ.data]);
  const groupFilesData = useMemo(() => extractItems(groupFilesQ.data), [groupFilesQ.data]);

  const handleRefresh = useCallback(() => { utils.wazuh.invalidate(); }, [utils]);

  const filterItems = useCallback((items: Array<Record<string, unknown>>) => {
    if (!search) return items;
    const lower = search.toLowerCase();
    return items.filter(item =>
      Object.values(item).some(v => String(v ?? "").toLowerCase().includes(lower))
    );
  }, [search]);

  // ── Group Detail Panel ───────────────────────────────────────────────────
  if (selectedGroup) {
    return (
      <WazuhGuard>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setSelectedGroup(null); setFileToView(null); }}
              className="gap-1.5"
            >
              <ChevronLeft className="h-4 w-4" /> Back to Groups
            </Button>
            <PageHeader
              title={`Group: ${selectedGroup}`}
              subtitle="Members, configuration, and files for this agent group"
              onRefresh={handleRefresh}
              isLoading={membersQ.isLoading}
            />
          </div>

          <Tabs value={groupTab} onValueChange={(v) => { setGroupTab(v as typeof groupTab); setFileToView(null); }}>
            <TabsList className="bg-secondary/20 border border-border/30 p-1">
              <TabsTrigger value="members" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs gap-1.5">
                <Users className="h-3.5 w-3.5" /> Members ({membersData.total})
              </TabsTrigger>
              <TabsTrigger value="config" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs gap-1.5">
                <Settings className="h-3.5 w-3.5" /> Configuration
              </TabsTrigger>
              <TabsTrigger value="files" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Files ({groupFilesData.total})
              </TabsTrigger>
            </TabsList>

            {/* Members */}
            <TabsContent value="members" className="mt-4">
              <GlassPanel>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" /> Group Members
                  </h3>
                  {membersQ.data ? <RawJsonViewer data={membersQ.data as Record<string, unknown>} title="Group Members JSON" /> : null}
                </div>
                <BrokerWarnings data={membersQ.data} context="Group Members" />
                {membersQ.isLoading ? <TableSkeleton columns={5} rows={8} /> : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border/30">
                            {["ID", "Name", "IP", "Status", "OS", "Version"].map(h => (
                              <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {membersData.items.map((agent, i) => (
                            <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                              <td className="py-2 px-3 font-mono text-primary">{String(agent.id ?? "—")}</td>
                              <td className="py-2 px-3 text-foreground font-medium">{String(agent.name ?? "—")}</td>
                              <td className="py-2 px-3 font-mono text-muted-foreground">{String(agent.ip ?? "—")}</td>
                              <td className="py-2 px-3">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  String(agent.status) === "active" ? "bg-emerald-500/10 text-emerald-400" :
                                  String(agent.status) === "disconnected" ? "bg-red-500/10 text-red-400" :
                                  "bg-amber-500/10 text-amber-400"
                                }`}>{String(agent.status ?? "—")}</span>
                              </td>
                              <td className="py-2 px-3 text-muted-foreground">{String((agent.os as Record<string, unknown>)?.platform ?? agent.os ?? "—")}</td>
                              <td className="py-2 px-3 font-mono text-muted-foreground">{String(agent.version ?? "—")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {membersData.items.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          <Users className="h-6 w-6 mx-auto mb-2 opacity-40" />
                          No members in this group
                        </div>
                      )}
                    </div>
                    {membersData.total > 100 && (
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/20">
                        <span className="text-xs text-muted-foreground">
                          Showing {membersPage * 100 + 1}–{Math.min((membersPage + 1) * 100, membersData.total)} of {membersData.total}
                        </span>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" disabled={membersPage === 0} onClick={() => setMembersPage(p => p - 1)}>
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="outline" size="sm" disabled={(membersPage + 1) * 100 >= membersData.total} onClick={() => setMembersPage(p => p + 1)}>
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </GlassPanel>
            </TabsContent>

            {/* Configuration */}
            <TabsContent value="config" className="mt-4">
              <GlassPanel>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Settings className="h-4 w-4 text-primary" /> Group Configuration (agent.conf)
                  </h3>
                  {groupConfigQ.data ? <RawJsonViewer data={groupConfigQ.data as Record<string, unknown>} title="Group Configuration JSON" /> : null}
                </div>
                <BrokerWarnings data={groupConfigQ.data} context="Group Configuration" />
                {groupConfigQ.isLoading ? <TableSkeleton columns={2} rows={6} /> : (
                  <div className="space-y-2">
                    {(() => {
                      const d = (groupConfigQ.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
                      const items = (d?.affected_items as Array<Record<string, unknown>>) ?? [];
                      if (items.length > 0) {
                        return items.map((item, i) => (
                          <div key={i} className="bg-secondary/10 rounded-lg p-3 border border-border/20">
                            {Object.entries(item).map(([k, v]) => (
                              <div key={k} className="flex items-start gap-3 py-1 border-b border-border/10 last:border-0">
                                <span className="text-[11px] font-mono text-primary min-w-[140px] shrink-0">{k}</span>
                                <span className="text-[11px] font-mono text-foreground break-all">
                                  {typeof v === "object" && v !== null ? JSON.stringify(v, null, 2) : String(v ?? "—")}
                                </span>
                              </div>
                            ))}
                          </div>
                        ));
                      }
                      // Flat config
                      if (d && typeof d === "object") {
                        return Object.entries(d).filter(([k]) =>
                          !["affected_items", "total_affected_items", "total_failed_items", "failed_items"].includes(k)
                        ).map(([k, v]) => (
                          <div key={k} className="flex items-start gap-3 py-1.5 border-b border-border/10">
                            <span className="text-[11px] font-mono text-primary min-w-[140px] shrink-0">{k}</span>
                            <span className="text-[11px] font-mono text-foreground break-all">
                              {typeof v === "object" && v !== null ? JSON.stringify(v, null, 2) : String(v ?? "—")}
                            </span>
                          </div>
                        ));
                      }
                      return (
                        <div className="text-center py-8 text-muted-foreground text-sm">
                          <Settings className="h-6 w-6 mx-auto mb-2 opacity-40" />
                          No configuration data available
                        </div>
                      );
                    })()}
                  </div>
                )}
              </GlassPanel>
            </TabsContent>

            {/* Files */}
            <TabsContent value="files" className="mt-4 space-y-4">
              <GlassPanel>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" /> Group Files
                  </h3>
                  {groupFilesQ.data ? <RawJsonViewer data={groupFilesQ.data as Record<string, unknown>} title="Group Files JSON" /> : null}
                </div>
                <BrokerWarnings data={groupFilesQ.data} context="Group Files" />
                {groupFilesQ.isLoading ? <TableSkeleton columns={3} rows={4} /> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/30">
                          {["Filename", "Hash", "Actions"].map(h => (
                            <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {groupFilesData.items.map((file, i) => (
                          <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                            <td className="py-2 px-3 font-mono text-primary flex items-center gap-1.5">
                              <File className="h-3.5 w-3.5 text-muted-foreground" />
                              {String(file.filename ?? "—")}
                            </td>
                            <td className="py-2 px-3 font-mono text-muted-foreground text-[10px]">{String(file.hash ?? "—")}</td>
                            <td className="py-2 px-3">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-[10px] gap-1"
                                onClick={() => setFileToView(String(file.filename))}
                              >
                                <Eye className="h-3 w-3" /> View Content
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {groupFilesData.items.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        <FileText className="h-6 w-6 mx-auto mb-2 opacity-40" />
                        No files in this group
                      </div>
                    )}
                  </div>
                )}
              </GlassPanel>

              {/* File Content Viewer */}
              {fileToView && (
                <GlassPanel>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <File className="h-4 w-4 text-primary" /> {fileToView}
                    </h3>
                    <div className="flex items-center gap-2">
                      {groupFileContentQ.data ? <RawJsonViewer data={groupFileContentQ.data as Record<string, unknown>} title={`${fileToView} Content`} /> : null}
                      <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setFileToView(null)}>Close</Button>
                    </div>
                  </div>
                  {groupFileContentQ.isLoading ? (
                    <div className="animate-pulse bg-secondary/20 rounded h-32" />
                  ) : (
                    <pre className="bg-secondary/10 rounded-lg p-4 text-[11px] font-mono text-foreground overflow-x-auto max-h-[400px] overflow-y-auto border border-border/20">
                      {typeof groupFileContentQ.data === "string"
                        ? groupFileContentQ.data
                        : JSON.stringify(groupFileContentQ.data, null, 2)}
                    </pre>
                  )}
                </GlassPanel>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </WazuhGuard>
    );
  }

  // ── Main View ────────────────────────────────────────────────────────────
  return (
    <WazuhGuard>
      <div className="space-y-6">
        <PageHeader
          title="Agent Group Management"
          subtitle="Read-only view of Wazuh agent groups, membership, outdated agents, and field distributions"
          onRefresh={handleRefresh}
          isLoading={groupsQ.isLoading}
        />

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Groups" value={groupsData.total} icon={FolderOpen} colorClass="text-primary" />
          <StatCard label="Outdated Agents" value={outdatedData.total} icon={AlertTriangle} colorClass="text-threat-medium" />
          <StatCard label="Ungrouped Agents" value={noGroupData.total} icon={UserMinus} colorClass="text-threat-high" />
          <StatCard label="Distinct Fields" value={distinctField} icon={BarChart3} colorClass="text-cyan-400" />
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
        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as MainTab)}>
          <TabsList className="bg-secondary/20 border border-border/30 p-1">
            <TabsTrigger value="groups" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs gap-1.5">
              <FolderOpen className="h-3.5 w-3.5" /> Groups ({groupsData.total})
            </TabsTrigger>
            <TabsTrigger value="outdated" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Outdated ({outdatedData.total})
            </TabsTrigger>
            <TabsTrigger value="noGroup" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs gap-1.5">
              <UserMinus className="h-3.5 w-3.5" /> Ungrouped ({noGroupData.total})
            </TabsTrigger>
            <TabsTrigger value="distinct" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary text-xs gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" /> Field Distribution
            </TabsTrigger>
          </TabsList>

          {/* Groups List */}
          <TabsContent value="groups" className="mt-4">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 text-primary" /> Agent Groups ({groupsData.total})
                </h3>
                {groupsQ.data ? <RawJsonViewer data={groupsQ.data as Record<string, unknown>} title="Agent Groups JSON" /> : null}
              </div>
              <BrokerWarnings data={groupsQ.data} context="Agent Groups" />
              {groupsQ.isLoading ? <TableSkeleton columns={5} rows={8} /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30">
                        {["Name", "Agent Count", "Merged Sum", "Config Sum", "Actions"].map(h => (
                          <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filterItems(groupsData.items).map((group, i) => (
                        <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                          <td className="py-2 px-3 font-mono text-primary font-medium">{String(group.name ?? "—")}</td>
                          <td className="py-2 px-3 text-foreground">{String(group.count ?? "—")}</td>
                          <td className="py-2 px-3 font-mono text-muted-foreground text-[10px]">{String(group.mergedSum ?? group.merged_sum ?? "—")}</td>
                          <td className="py-2 px-3 font-mono text-muted-foreground text-[10px]">{String(group.configSum ?? group.config_sum ?? "—")}</td>
                          <td className="py-2 px-3">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] gap-1"
                              onClick={() => { setSelectedGroup(String(group.name)); setMembersPage(0); setGroupTab("members"); }}
                            >
                              <Eye className="h-3 w-3" /> Drill Down
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filterItems(groupsData.items).length === 0 && (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <Layers className="h-6 w-6 mx-auto mb-2 opacity-40" />
                      No groups found
                    </div>
                  )}
                </div>
              )}
            </GlassPanel>
          </TabsContent>

          {/* Outdated Agents */}
          <TabsContent value="outdated" className="mt-4">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-threat-medium" /> Outdated Agents ({outdatedData.total})
                </h3>
                {outdatedQ.data ? <RawJsonViewer data={outdatedQ.data as Record<string, unknown>} title="Outdated Agents JSON" /> : null}
              </div>
              <BrokerWarnings data={outdatedQ.data} context="Outdated Agents" />
              {outdatedQ.isLoading ? <TableSkeleton columns={4} rows={6} /> : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/30">
                          {["ID", "Name", "Version", "Manager Version"].map(h => (
                            <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filterItems(outdatedData.items).map((agent, i) => (
                          <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                            <td className="py-2 px-3 font-mono text-primary">{String(agent.id ?? "—")}</td>
                            <td className="py-2 px-3 text-foreground font-medium">{String(agent.name ?? "—")}</td>
                            <td className="py-2 px-3 font-mono text-threat-medium">{String(agent.version ?? "—")}</td>
                            <td className="py-2 px-3 font-mono text-muted-foreground">{String(agent.manager_version ?? "—")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filterItems(outdatedData.items).length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        <AlertTriangle className="h-6 w-6 mx-auto mb-2 opacity-40" />
                        No outdated agents found
                      </div>
                    )}
                  </div>
                  {outdatedData.total > 100 && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/20">
                      <span className="text-xs text-muted-foreground">
                        Page {outdatedPage + 1} of {Math.ceil(outdatedData.total / 100)}
                      </span>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" disabled={outdatedPage === 0} onClick={() => setOutdatedPage(p => p - 1)}>
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" disabled={(outdatedPage + 1) * 100 >= outdatedData.total} onClick={() => setOutdatedPage(p => p + 1)}>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </GlassPanel>
          </TabsContent>

          {/* Ungrouped Agents */}
          <TabsContent value="noGroup" className="mt-4">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <UserMinus className="h-4 w-4 text-threat-high" /> Ungrouped Agents ({noGroupData.total})
                </h3>
                {noGroupQ.data ? <RawJsonViewer data={noGroupQ.data as Record<string, unknown>} title="Ungrouped Agents JSON" /> : null}
              </div>
              <BrokerWarnings data={noGroupQ.data} context="Ungrouped Agents" />
              {noGroupQ.isLoading ? <TableSkeleton columns={4} rows={6} /> : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/30">
                          {["ID", "Name", "IP", "Status", "OS"].map(h => (
                            <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filterItems(noGroupData.items).map((agent, i) => (
                          <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                            <td className="py-2 px-3 font-mono text-primary">{String(agent.id ?? "—")}</td>
                            <td className="py-2 px-3 text-foreground font-medium">{String(agent.name ?? "—")}</td>
                            <td className="py-2 px-3 font-mono text-muted-foreground">{String(agent.ip ?? "—")}</td>
                            <td className="py-2 px-3">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                String(agent.status) === "active" ? "bg-emerald-500/10 text-emerald-400" :
                                String(agent.status) === "disconnected" ? "bg-red-500/10 text-red-400" :
                                "bg-amber-500/10 text-amber-400"
                              }`}>{String(agent.status ?? "—")}</span>
                            </td>
                            <td className="py-2 px-3 text-muted-foreground">{String((agent.os as Record<string, unknown>)?.platform ?? agent.os ?? "—")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filterItems(noGroupData.items).length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        <UserMinus className="h-6 w-6 mx-auto mb-2 opacity-40" />
                        All agents are assigned to groups
                      </div>
                    )}
                  </div>
                  {noGroupData.total > 100 && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/20">
                      <span className="text-xs text-muted-foreground">
                        Page {noGroupPage + 1} of {Math.ceil(noGroupData.total / 100)}
                      </span>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" disabled={noGroupPage === 0} onClick={() => setNoGroupPage(p => p - 1)}>
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" disabled={(noGroupPage + 1) * 100 >= noGroupData.total} onClick={() => setNoGroupPage(p => p + 1)}>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </GlassPanel>
          </TabsContent>

          {/* Field Distribution */}
          <TabsContent value="distinct" className="mt-4">
            <GlassPanel>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" /> Agent Field Distribution
                </h3>
                {distinctQ.data ? <RawJsonViewer data={distinctQ.data as Record<string, unknown>} title="Distinct Stats JSON" /> : null}
              </div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-muted-foreground">Field:</span>
                {["os.platform", "os.name", "version", "status", "node_name", "group"].map(f => (
                  <Button
                    key={f}
                    variant={distinctField === f ? "default" : "outline"}
                    size="sm"
                    className="h-6 text-[10px]"
                    onClick={() => setDistinctField(f)}
                  >
                    {f}
                  </Button>
                ))}
              </div>
              {distinctQ.isLoading ? <TableSkeleton columns={2} rows={6} /> : (
                <div className="space-y-2">
                  {(() => {
                    const d = (distinctQ.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
                    const items = (d?.affected_items as Array<Record<string, unknown>>) ?? [];
                    if (items.length > 0) {
                      return (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border/30">
                                {Object.keys(items[0]).map(h => (
                                  <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((item, i) => (
                                <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                                  {Object.values(item).map((v, j) => (
                                    <td key={j} className="py-2 px-3 font-mono text-foreground">
                                      {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "—")}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    }
                    // Flat object response
                    if (d && typeof d === "object") {
                      return Object.entries(d).filter(([k]) =>
                        !["affected_items", "total_affected_items", "total_failed_items", "failed_items"].includes(k)
                      ).map(([k, v]) => (
                        <div key={k} className="flex items-center gap-3 py-1.5 border-b border-border/10">
                          <span className="text-[11px] font-mono text-primary min-w-[200px]">{k}</span>
                          <span className="text-[11px] font-mono text-foreground">
                            {typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "—")}
                          </span>
                        </div>
                      ));
                    }
                    return (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        <BarChart3 className="h-6 w-6 mx-auto mb-2 opacity-40" />
                        No distribution data available
                      </div>
                    );
                  })()}
                </div>
              )}
            </GlassPanel>
          </TabsContent>
        </Tabs>
      </div>
    </WazuhGuard>
  );
}
