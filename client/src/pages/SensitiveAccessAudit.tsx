import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { PageHeader } from "@/components/shared/PageHeader";
import { GlassPanel } from "@/components/shared/GlassPanel";
import { Button } from "@/components/ui/button";
import { exportCSV } from "@/lib/exportUtils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ShieldAlert,
  Eye,
  Copy,
  Calendar,
  User,
  Key,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  AlertTriangle,
  Clock,
  Filter,
  X,
  Download,
} from "lucide-react";

export default function SensitiveAccessAudit() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [resourceType, setResourceType] = useState<string | undefined>();
  const [actionFilter, setActionFilter] = useState<"reveal" | "copy" | undefined>();
  const [resourceId, setResourceId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Admin gate — non-admins see a locked panel
  if (user?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldAlert className="w-16 h-16 text-red-400/60" />
        <h2 className="text-xl font-semibold text-foreground/80 font-heading">Access Denied</h2>
        <p className="text-sm text-muted-foreground max-w-md text-center">
          The Sensitive Access Audit log is restricted to administrators. Contact your security team
          if you believe you need access to this data.
        </p>
      </div>
    );
  }

  const listInput = useMemo(() => ({
    page,
    limit,
    ...(resourceType ? { resourceType } : {}),
    ...(actionFilter ? { action: actionFilter } : {}),
    ...(resourceId.trim() ? { resourceId: resourceId.trim() } : {}),
    ...(startDate ? { startDate: new Date(startDate).toISOString() } : {}),
    ...(endDate ? { endDate: new Date(endDate).toISOString() } : {}),
  }), [page, limit, resourceType, actionFilter, resourceId, startDate, endDate]);

  const listQ = trpc.sensitiveAccess.list.useQuery(listInput, {
    staleTime: 10_000,
    retry: 1,
  });

  const statsQ = trpc.sensitiveAccess.stats.useQuery(undefined, {
    staleTime: 30_000,
    retry: 1,
  });

  const totalPages = Math.max(1, Math.ceil((listQ.data?.total ?? 0) / limit));

  const clearFilters = () => {
    setResourceType(undefined);
    setActionFilter(undefined);
    setResourceId("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const hasActiveFilters = resourceType || actionFilter || resourceId.trim() || startDate || endDate;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sensitive Access Audit"
        subtitle="Compliance trail for privileged data disclosures — who accessed what, when, and how"
      />

      {/* ── Summary Stats ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassPanel className="flex items-center gap-3 p-4">
          <div className="p-2 rounded-lg bg-violet-500/10">
            <BarChart3 className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Records</p>
            <p className="text-2xl font-bold font-heading text-foreground">
              {statsQ.data?.totalRecords ?? "—"}
            </p>
          </div>
        </GlassPanel>

        <GlassPanel className="flex items-center gap-3 p-4">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <User className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Unique Users</p>
            <p className="text-2xl font-bold font-heading text-foreground">
              {statsQ.data?.uniqueUsers ?? "—"}
            </p>
          </div>
        </GlassPanel>

        <GlassPanel className="flex items-center gap-3 p-4">
          <div className="p-2 rounded-lg bg-cyan-500/10">
            <Key className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Resource Types</p>
            <div className="flex gap-2 mt-1 flex-wrap">
              {statsQ.data?.resourceTypes?.length ? (
                statsQ.data.resourceTypes.map((rt) => (
                  <Badge key={rt.type} variant="outline" className="text-xs border-violet-500/30 text-violet-300">
                    {rt.type}: {rt.count}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </div>
          </div>
        </GlassPanel>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <GlassPanel className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Filters</span>
          <div className="ml-auto flex items-center gap-2">
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground">
                <X className="w-3 h-3 mr-1" /> Clear all
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={!listQ.data?.rows?.length}
              onClick={() => {
                if (listQ.data?.rows?.length) {
                  exportCSV(listQ.data.rows as Array<Record<string, unknown>>, "sensitive-access-audit", {
                    columns: [
                      { key: "id", label: "ID" },
                      { key: "userId", label: "User ID" },
                      { key: "userName", label: "User Name" },
                      { key: "action", label: "Action" },
                      { key: "resourceType", label: "Resource Type" },
                      { key: "resourceId", label: "Resource ID" },
                      { key: "metadata", label: "Metadata" },
                      { key: "ipAddress", label: "IP Address" },
                      { key: "createdAt", label: "Timestamp" },
                    ],
                  });
                }
              }}
              className="text-xs border-violet-500/30 hover:bg-violet-500/10"
            >
              <Download className="w-3 h-3 mr-1" /> Export CSV
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Select
            value={resourceType ?? "__all__"}
            onValueChange={(v) => { setResourceType(v === "__all__" ? undefined : v); setPage(1); }}
          >
            <SelectTrigger className="bg-background/40 border-white/10">
              <SelectValue placeholder="Resource Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Types</SelectItem>
              <SelectItem value="agent_key">Agent Key</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={actionFilter ?? "__all__"}
            onValueChange={(v) => { setActionFilter(v === "__all__" ? undefined : v as "reveal" | "copy"); setPage(1); }}
          >
            <SelectTrigger className="bg-background/40 border-white/10">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Actions</SelectItem>
              <SelectItem value="reveal">Reveal</SelectItem>
              <SelectItem value="copy">Copy</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder="Resource ID (e.g., agent 001)"
            value={resourceId}
            onChange={(e) => { setResourceId(e.target.value); setPage(1); }}
            className="bg-background/40 border-white/10"
          />

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" /> From
            </label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="bg-background/40 border-white/10"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" /> To
            </label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="bg-background/40 border-white/10"
            />
          </div>
        </div>
      </GlassPanel>

      {/* ── Audit Table ────────────────────────────────────────────────── */}
      <GlassPanel className="p-0 overflow-hidden">
        {listQ.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-400" />
          </div>
        ) : listQ.isError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <AlertTriangle className="w-8 h-8 text-red-400" />
            <p className="text-sm text-red-400">Failed to load audit records</p>
            <p className="text-xs text-muted-foreground">{listQ.error.message}</p>
          </div>
        ) : !listQ.data?.rows.length ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <ShieldAlert className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No audit records found</p>
            {hasActiveFilters && (
              <p className="text-xs text-muted-foreground">Try adjusting your filters</p>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.02]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <Clock className="w-3 h-3 inline mr-1" />Timestamp
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <User className="w-3 h-3 inline mr-1" />User ID
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Action
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Resource Type
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Resource ID
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      IP Address
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {listQ.data.rows.map((row) => (
                    <tr key={row.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-foreground/80">
                        {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-foreground/90">
                        {row.userId}
                      </td>
                      <td className="px-4 py-3">
                        {row.action === "reveal" ? (
                          <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30 gap-1">
                            <Eye className="w-3 h-3" /> Reveal
                          </Badge>
                        ) : row.action === "copy" ? (
                          <Badge className="bg-red-500/15 text-red-300 border-red-500/30 gap-1">
                            <Copy className="w-3 h-3" /> Copy
                          </Badge>
                        ) : (
                          <Badge variant="outline">{row.action}</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="border-violet-500/30 text-violet-300 gap-1">
                          <Key className="w-3 h-3" /> {row.resourceType}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-foreground/80">
                        {row.resourceId}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {row.ipAddress ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ──────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
              <p className="text-xs text-muted-foreground">
                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, listQ.data.total)} of {listQ.data.total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </GlassPanel>
    </div>
  );
}
