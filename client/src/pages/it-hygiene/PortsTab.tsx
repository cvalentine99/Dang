import { GlassPanel } from "@/components/shared/GlassPanel";
import { RawJsonViewer } from "@/components/shared/RawJsonViewer";
import { ExportButton } from "@/components/shared/ExportButton";
import { EXPORT_COLUMNS } from "@/lib/exportUtils";
import { Pagination } from "./Pagination";
import type { TabCommonProps } from "./types";

export function PortsTab({ data, page, pageSize, onPageChange, agentId, rawData }: TabCommonProps) {
  const totalPages = Math.ceil(data.total / pageSize);
  return (
    <GlassPanel>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">{data.total} open ports</span>
        <div className="flex items-center gap-2">
          <ExportButton getData={() => data.items} baseName="ports" columns={EXPORT_COLUMNS.ports} context={`agent-${agentId}`} compact />
          {rawData ? <RawJsonViewer data={rawData} title="Ports JSON" /> : null}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/30">
              {["Local IP", "Local Port", "Remote IP", "Remote Port", "Protocol", "State", "PID", "Process"].map((h) => (
                <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((p, i) => {
              const local = p.local as Record<string, unknown> | undefined;
              const remote = p.remote as Record<string, unknown> | undefined;
              return (
                <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                  <td className="py-2 px-3 font-mono text-foreground">{String(local?.ip ?? "—")}</td>
                  <td className="py-2 px-3 font-mono text-primary">{String(local?.port ?? "—")}</td>
                  <td className="py-2 px-3 font-mono text-muted-foreground">{String(remote?.ip ?? "—")}</td>
                  <td className="py-2 px-3 font-mono text-muted-foreground">{String(remote?.port ?? "—")}</td>
                  <td className="py-2 px-3 text-muted-foreground">{String(p.protocol ?? "—")}</td>
                  <td className="py-2 px-3 text-muted-foreground">{String(p.state ?? "—")}</td>
                  <td className="py-2 px-3 font-mono text-muted-foreground">{String(p.pid ?? "—")}</td>
                  <td className="py-2 px-3 text-muted-foreground">{String(p.process ?? "—")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} total={data.total} />}
    </GlassPanel>
  );
}
