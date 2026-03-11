import { GlassPanel } from "@/components/shared/GlassPanel";
import { ExportButton } from "@/components/shared/ExportButton";
import { EXPORT_COLUMNS } from "@/lib/exportUtils";
import { UserCheck, Shield } from "lucide-react";
import { ShellBadge } from "./Badges";
import { Pagination } from "./Pagination";
import type { TabCommonProps } from "./types";

interface UsersTabProps extends TabCommonProps {
  interactiveUsers: number;
}

export function UsersTab({ data, page, pageSize, onPageChange, agentId, interactiveUsers }: UsersTabProps) {
  const totalPages = Math.ceil(data.total / pageSize);
  return (
    <GlassPanel>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted-foreground">{data.total} local users</span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Shield className="h-3 w-3 text-threat-high" />
            {interactiveUsers} interactive
          </span>
        </div>
        <ExportButton getData={() => data.items} baseName="users" columns={EXPORT_COLUMNS.users} context={`agent-${agentId}`} compact />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/30">
              {["Username", "UID", "GID", "Home", "Shell", "Type", "Last Login"].map((h) => (
                <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((user, i) => (
              <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                <td className="py-2 px-3 font-mono text-foreground font-medium">
                  <span className="flex items-center gap-1.5">
                    <UserCheck className="h-3 w-3 text-primary" />
                    {String(user.name ?? "—")}
                  </span>
                </td>
                <td className="py-2 px-3 font-mono text-primary">{String(user.uid ?? "—")}</td>
                <td className="py-2 px-3 font-mono text-muted-foreground">{String(user.gid ?? "—")}</td>
                <td className="py-2 px-3 font-mono text-muted-foreground truncate max-w-[200px]">{String(user.home ?? "—")}</td>
                <td className="py-2 px-3 font-mono text-muted-foreground/70 truncate max-w-[180px]">{String(user.shell ?? "—")}</td>
                <td className="py-2 px-3"><ShellBadge shell={String(user.shell ?? "")} /></td>
                <td className="py-2 px-3 text-muted-foreground">
                  {user.last_login ? new Date(String(user.last_login)).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} total={data.total} />}

      {/* Privilege Summary */}
      <div className="mt-4 pt-4 border-t border-border/30">
        <h4 className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-threat-high" />
          Privilege Summary
        </h4>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="glass-card px-3 py-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Root / UID 0</p>
            <p className="text-lg font-display font-bold text-threat-critical">
              {data.items.filter((u) => String(u.uid) === "0").length}
            </p>
          </div>
          <div className="glass-card px-3 py-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Interactive</p>
            <p className="text-lg font-display font-bold text-threat-high">{interactiveUsers}</p>
          </div>
          <div className="glass-card px-3 py-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">System Accounts</p>
            <p className="text-lg font-display font-bold text-threat-info">{data.total - interactiveUsers}</p>
          </div>
          <div className="glass-card px-3 py-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Recent Login</p>
            <p className="text-lg font-display font-bold text-primary">
              {data.items.filter((u) => u.last_login != null).length}
            </p>
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}
