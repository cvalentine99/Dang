import { GlassPanel } from "@/components/shared/GlassPanel";
import { ExportButton } from "@/components/shared/ExportButton";
import { EXPORT_COLUMNS } from "@/lib/exportUtils";
import { Users, Shield } from "lucide-react";
import { Pagination } from "./Pagination";
import type { TabCommonProps } from "./types";

export function GroupsTab({ data, page, pageSize, onPageChange, agentId }: TabCommonProps) {
  const totalPages = Math.ceil(data.total / pageSize);
  return (
    <GlassPanel>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">{data.total} local groups</span>
        <ExportButton getData={() => data.items} baseName="groups" columns={EXPORT_COLUMNS.groups} context={`agent-${agentId}`} compact />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/30">
              {["Group Name", "GID", "Members", "Member Count"].map((h) => (
                <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((grp, i) => {
              const members = (grp.members as string[]) ?? [];
              return (
                <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                  <td className="py-2 px-3 font-mono text-foreground font-medium">
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3 w-3 text-primary" />
                      {String(grp.name ?? "—")}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-mono text-primary">{String(grp.gid ?? "—")}</td>
                  <td className="py-2 px-3">
                    <div className="flex flex-wrap gap-1">
                      {members.map((m) => (
                        <span key={m} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-secondary/50 border border-border/30 text-muted-foreground">
                          {m}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2 px-3 font-mono text-muted-foreground">{members.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} total={data.total} />}

      {/* Privileged Groups Highlight */}
      <div className="mt-4 pt-4 border-t border-border/30">
        <h4 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-threat-high" />
          Privileged Groups
        </h4>
        <div className="flex flex-wrap gap-2">
          {data.items
            .filter((g) => {
              const name = String(g.name ?? "").toLowerCase();
              return ["root", "sudo", "wheel", "docker", "adm", "admin", "staff"].includes(name);
            })
            .map((g) => {
              const members = (g.members as string[]) ?? [];
              return (
                <div key={String(g.name)} className="glass-card px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Shield className="h-3 w-3 text-threat-high" />
                    <span className="text-xs font-mono text-foreground font-medium">{String(g.name)}</span>
                    <span className="text-[10px] text-muted-foreground">({members.length} members)</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {members.map((m) => (
                      <span key={m} className="text-[10px] font-mono text-primary">{m}</span>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </GlassPanel>
  );
}
