import { GlassPanel } from "@/components/shared/GlassPanel";
import { RawJsonViewer } from "@/components/shared/RawJsonViewer";
import { ExportButton } from "@/components/shared/ExportButton";
import { EXPORT_COLUMNS } from "@/lib/exportUtils";
import { Pagination } from "./Pagination";
import type { TabCommonProps } from "./types";

export function ProcessesTab({ data, page, pageSize, onPageChange, agentId, rawData }: TabCommonProps) {
  const totalPages = Math.ceil(data.total / pageSize);
  return (
    <GlassPanel>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">{data.total} processes</span>
        <div className="flex items-center gap-2">
          <ExportButton getData={() => data.items} baseName="processes" columns={EXPORT_COLUMNS.processes} context={`agent-${agentId}`} compact />
          {rawData ? <RawJsonViewer data={rawData} title="Processes JSON" /> : null}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/30">
              {["PID", "Name", "State", "User", "PPID", "Priority", "Threads", "CMD"].map((h) => (
                <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((p, i) => (
              <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                <td className="py-2 px-3 font-mono text-primary">{String(p.pid ?? "—")}</td>
                <td className="py-2 px-3 text-foreground font-medium">{String(p.name ?? "—")}</td>
                <td className="py-2 px-3 text-muted-foreground">{String(p.state ?? "—")}</td>
                <td className="py-2 px-3 text-muted-foreground">{String(p.euser ?? p.ruser ?? "—")}</td>
                <td className="py-2 px-3 font-mono text-muted-foreground">{String(p.ppid ?? "—")}</td>
                <td className="py-2 px-3 text-muted-foreground">{String(p.priority ?? "—")}</td>
                <td className="py-2 px-3 text-muted-foreground">{String(p.nlwp ?? "—")}</td>
                <td className="py-2 px-3 font-mono text-muted-foreground truncate max-w-[300px]">{String(p.cmd ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} total={data.total} />}
    </GlassPanel>
  );
}
