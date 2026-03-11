import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  ArrowUpDown, ChevronUp, ChevronDown, Lock, Unlock,
} from "lucide-react";
import { TableSkeleton } from "@/components/shared";
import { RISK_COLORS, METHOD_COLORS } from "./types";

type SortField = "method" | "path" | "resource" | "riskLevel" | "trustScore";
type SortDir = "asc" | "desc";

export function EndpointTableView(): React.JSX.Element {
  const [page, setPage] = useState(0);
  const [methodFilter, setMethodFilter] = useState<string>("");
  const [riskFilter, setRiskFilter] = useState<string>("");
  const [resourceFilter, setResourceFilter] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("path");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const pageSize = 50;

  const endpointsQ = trpc.graph.endpoints.useQuery({
    method: methodFilter || undefined,
    riskLevel: riskFilter || undefined,
    resource: resourceFilter || undefined,
    limit: 200,
    offset: 0,
  });

  const resourcesQ = trpc.graph.resourceOverview.useQuery();

  const sortedEndpoints = useMemo(() => {
    if (!endpointsQ.data?.endpoints) return [];
    const eps = [...endpointsQ.data.endpoints];
    eps.sort((a: any, b: any) => {
      let va = a[sortField] ?? "";
      let vb = b[sortField] ?? "";
      if (typeof va === "number" && typeof vb === "number") {
        return sortDir === "asc" ? va - vb : vb - va;
      }
      va = String(va).toLowerCase();
      vb = String(vb).toLowerCase();
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return eps;
  }, [endpointsQ.data, sortField, sortDir]);

  const pagedEndpoints = useMemo(() => {
    return sortedEndpoints.slice(page * pageSize, (page + 1) * pageSize);
  }, [sortedEndpoints, page]);

  const totalPages = Math.ceil(sortedEndpoints.length / pageSize);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-muted-foreground/40" />;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-purple-400" /> : <ChevronDown className="w-3 h-3 text-purple-400" />;
  };

  const resources: string[] = useMemo(() => {
    if (!resourcesQ.data) return [];
    return (resourcesQ.data as any[]).map((r: any) => r.name).sort();
  }, [resourcesQ.data]);

  if (endpointsQ.isLoading) {
    return (
      <div className="p-6">
        <TableSkeleton columns={6} rows={12} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-white/5 flex items-center gap-3 flex-wrap">
        <select
          value={methodFilter}
          onChange={e => { setMethodFilter(e.target.value); setPage(0); }}
          className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-foreground outline-none focus:border-purple-500/30"
        >
          <option value="">All Methods</option>
          {["GET", "POST", "PUT", "DELETE"].map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        <select
          value={riskFilter}
          onChange={e => { setRiskFilter(e.target.value); setPage(0); }}
          className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-foreground outline-none focus:border-purple-500/30"
        >
          <option value="">All Risk</option>
          <option value="SAFE">SAFE</option>
          <option value="MUTATING">MUTATING</option>
          <option value="DESTRUCTIVE">DESTRUCTIVE</option>
        </select>

        <select
          value={resourceFilter}
          onChange={e => { setResourceFilter(e.target.value); setPage(0); }}
          className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-foreground outline-none focus:border-purple-500/30 max-w-[200px]"
        >
          <option value="">All Resources</option>
          {resources.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <span className="text-[10px] text-muted-foreground ml-auto font-mono">
          {sortedEndpoints.length} / {endpointsQ.data?.total ?? 0} endpoints
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-black/40 backdrop-blur-sm border-b border-white/5">
              {[
                { field: "method" as SortField, label: "Method", width: "w-20" },
                { field: "path" as SortField, label: "Path", width: "flex-1" },
                { field: "resource" as SortField, label: "Resource", width: "w-36" },
                { field: "riskLevel" as SortField, label: "Risk", width: "w-28" },
                { field: "trustScore" as SortField, label: "Trust", width: "w-20" },
              ].map(col => (
                <th
                  key={col.field}
                  onClick={() => toggleSort(col.field)}
                  className={`px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors ${col.width}`}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    <SortIcon field={col.field} />
                  </div>
                </th>
              ))}
              <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider w-20">LLM</th>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Summary</th>
            </tr>
          </thead>
          <tbody>
            {pagedEndpoints.map((ep: any) => {
              const riskColor = RISK_COLORS[ep.riskLevel] ?? "#888";
              const methodColor = METHOD_COLORS[ep.method] ?? "#888";
              return (
                <tr key={ep.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2">
                    <span className="font-mono font-bold text-[10px]" style={{ color: methodColor }}>{ep.method}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-foreground truncate max-w-[400px]" title={ep.path}>{ep.path}</td>
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[150px]">{ep.resource}</td>
                  <td className="px-3 py-2">
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{ color: riskColor, backgroundColor: `${riskColor}15`, border: `1px solid ${riskColor}30` }}
                    >
                      {ep.riskLevel}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-foreground">{ep.trustScore ?? "—"}</td>
                  <td className="px-3 py-2">
                    {ep.allowedForLlm ? (
                      <span className="text-green-400 flex items-center gap-0.5 text-[10px]"><Unlock className="w-3 h-3" /> OK</span>
                    ) : (
                      <span className="text-red-400 flex items-center gap-0.5 text-[10px]"><Lock className="w-3 h-3" /> No</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[300px]" title={ep.summary ?? ""}>{ep.summary ?? "—"}</td>
                </tr>
              );
            })}
            {pagedEndpoints.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-muted-foreground">
                  No endpoints match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex-shrink-0 px-6 py-2 border-t border-white/5 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-1 text-[10px] rounded border border-white/10 text-muted-foreground hover:bg-white/5 disabled:opacity-30 transition-colors"
            >
              Prev
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 text-[10px] rounded border border-white/10 text-muted-foreground hover:bg-white/5 disabled:opacity-30 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
