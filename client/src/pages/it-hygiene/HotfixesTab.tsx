import { GlassPanel } from "@/components/shared/GlassPanel";
import { RawJsonViewer } from "@/components/shared/RawJsonViewer";
import { ExportButton } from "@/components/shared/ExportButton";
import { Pagination } from "./Pagination";
import type { TabCommonProps } from "./types";

export function HotfixesTab({ data, page, pageSize, onPageChange, agentId, rawData }: TabCommonProps) {
  const totalPages = Math.ceil(data.total / pageSize);
  return (
    <GlassPanel>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">{data.total} hotfixes</span>
        <div className="flex items-center gap-2">
          <ExportButton getData={() => data.items} baseName="hotfixes" context={`agent-${agentId}`} compact />
          {rawData ? <RawJsonViewer data={rawData} title="Hotfixes JSON" /> : null}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/30">
              {["Hotfix ID", "Scan Time"].map((h) => (
                <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((h, i) => (
              <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                <td className="py-2 px-3 font-mono text-primary">{String(h.hotfix ?? "—")}</td>
                <td className="py-2 px-3 font-mono text-muted-foreground">
                  {String((h.scan as Record<string, unknown>)?.time ?? "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} total={data.total} />}
    </GlassPanel>
  );
}
