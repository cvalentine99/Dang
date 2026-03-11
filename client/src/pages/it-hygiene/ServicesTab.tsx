import { GlassPanel } from "@/components/shared/GlassPanel";
import { ExportButton } from "@/components/shared/ExportButton";
import { EXPORT_COLUMNS } from "@/lib/exportUtils";
import { Server } from "lucide-react";
import { ServiceStateBadge } from "./Badges";
import { Pagination } from "./Pagination";
import type { TabCommonProps } from "./types";

export function ServicesTab({ data, page, pageSize, onPageChange, agentId }: TabCommonProps) {
  const totalPages = Math.ceil(data.total / pageSize);
  return (
    <GlassPanel>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">{data.total} system services</span>
        <ExportButton getData={() => data.items} baseName="services" columns={EXPORT_COLUMNS.services} context={`agent-${agentId}`} compact />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/30">
              {["Service", "Display Name", "State", "Start Type", "PID", "Description"].map((h) => (
                <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((svc, i) => (
              <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                <td className="py-2 px-3 font-mono text-foreground font-medium">{String(svc.name ?? "—")}</td>
                <td className="py-2 px-3 text-foreground">{String(svc.display_name ?? "—")}</td>
                <td className="py-2 px-3">
                  <ServiceStateBadge state={String(svc.state ?? "unknown")} />
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
                <td className="py-2 px-3 font-mono text-muted-foreground">{svc.pid ? String(svc.pid) : "—"}</td>
                <td className="py-2 px-3 text-muted-foreground truncate max-w-[300px]">{String(svc.description ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} total={data.total} />}

      {/* Startup Type Distribution */}
      <div className="mt-4 pt-4 border-t border-border/30">
        <h4 className="text-xs font-medium text-muted-foreground mb-3">Startup Type Distribution</h4>
        <div className="flex flex-wrap gap-3">
          {Object.entries(
            data.items.reduce<Record<string, number>>((acc, svc) => {
              const type = String(svc.start_type ?? "unknown");
              acc[type] = (acc[type] || 0) + 1;
              return acc;
            }, {})
          ).map(([type, count]) => (
            <div key={type} className="glass-card px-3 py-2 flex items-center gap-2">
              <Server className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-foreground font-medium capitalize">{type}</span>
              <span className="text-xs font-mono text-primary">{String(count)}</span>
            </div>
          ))}
        </div>
      </div>
    </GlassPanel>
  );
}
