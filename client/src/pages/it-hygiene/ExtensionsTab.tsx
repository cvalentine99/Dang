import { GlassPanel } from "@/components/shared/GlassPanel";
import { ExportButton } from "@/components/shared/ExportButton";
import { Puzzle } from "lucide-react";
import { Pagination } from "./Pagination";
import type { TabCommonProps } from "./types";

export function ExtensionsTab({ data, page, pageSize, onPageChange, agentId }: TabCommonProps) {
  const totalPages = Math.ceil(data.total / pageSize);
  return (
    <GlassPanel>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">{data.total} browser extensions</span>
        <ExportButton getData={() => data.items} baseName="browser-extensions" context={`agent-${agentId}`} compact />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/30">
              {["Name", "Browser", "Version", "Description", "Path"].map((h) => (
                <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((ext, i) => (
              <tr key={i} className="border-b border-border/10 hover:bg-secondary/20 transition-colors">
                <td className="py-2 px-3 text-foreground font-medium">{String(ext.name ?? "—")}</td>
                <td className="py-2 px-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 border border-primary/20 text-primary">
                    {String(ext.browser ?? "—")}
                  </span>
                </td>
                <td className="py-2 px-3 font-mono text-primary">{String(ext.version ?? "—")}</td>
                <td className="py-2 px-3 text-muted-foreground truncate max-w-[350px]">{String(ext.description ?? "—")}</td>
                <td className="py-2 px-3 font-mono text-muted-foreground/60 truncate max-w-[250px]">{String(ext.path ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} total={data.total} />}

      {/* Browser Distribution Summary */}
      <div className="mt-4 pt-4 border-t border-border/30">
        <h4 className="text-xs font-medium text-muted-foreground mb-3">Browser Distribution</h4>
        <div className="flex flex-wrap gap-3">
          {Object.entries(
            data.items.reduce<Record<string, number>>((acc, ext) => {
              const browser = String(ext.browser ?? "Unknown");
              acc[browser] = (acc[browser] || 0) + 1;
              return acc;
            }, {})
          ).map(([browser, count]) => (
            <div key={browser} className="glass-card px-3 py-2 flex items-center gap-2">
              <Puzzle className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs text-foreground font-medium">{browser}</span>
              <span className="text-xs font-mono text-primary">{String(count)}</span>
            </div>
          ))}
        </div>
      </div>
    </GlassPanel>
  );
}
