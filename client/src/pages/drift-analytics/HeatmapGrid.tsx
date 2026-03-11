import { MUTED, formatDate, formatDateTime, formatPct } from "./theme";

export function HeatmapGrid({
  grid,
  agents,
  buckets,
}: {
  grid: Array<{ agentId: string; bucket: number; driftPercent: number }>;
  agents: string[];
  buckets: number[];
}) {
  if (agents.length === 0 || buckets.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm" style={{ color: MUTED }}>
        No heatmap data available
      </div>
    );
  }

  // Build lookup
  const lookup: Record<string, Record<number, number>> = {};
  for (const cell of grid) {
    if (!lookup[cell.agentId]) lookup[cell.agentId] = {};
    lookup[cell.agentId][cell.bucket] = cell.driftPercent;
  }

  // Show max 15 buckets to keep it readable
  const displayBuckets = buckets.length > 15 ? buckets.slice(-15) : buckets;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Header row */}
        <div className="flex items-center gap-0.5 mb-1">
          <div className="w-20 shrink-0 text-xs font-mono" style={{ color: MUTED }}>Agent</div>
          {displayBuckets.map((b) => (
            <div
              key={b}
              className="flex-1 text-center text-[10px] font-mono"
              style={{ color: MUTED }}
              title={formatDateTime(b)}
            >
              {formatDate(b)}
            </div>
          ))}
        </div>

        {/* Agent rows */}
        {agents.map((agentId) => (
          <div key={agentId} className="flex items-center gap-0.5 mb-0.5">
            <div
              className="w-20 shrink-0 truncate text-xs font-mono"
              style={{ color: "oklch(0.85 0.01 286)" }}
              title={agentId}
            >
              {agentId}
            </div>
            {displayBuckets.map((b) => {
              const val = lookup[agentId]?.[b] ?? 0;
              const intensity = Math.min(val / 50, 1);
              const bg = val === 0
                ? "oklch(0.2 0.02 286 / 30%)"
                : `oklch(${0.5 + intensity * 0.15} ${0.1 + intensity * 0.17} ${val > 30 ? 25 : 293} / ${0.3 + intensity * 0.7})`;
              return (
                <div
                  key={b}
                  className="flex-1 h-7 rounded-sm flex items-center justify-center text-[10px] font-mono cursor-default transition-all hover:ring-1 hover:ring-purple-400/40"
                  style={{ background: bg, color: val > 0 ? "oklch(0.95 0 0)" : "transparent" }}
                  title={`Agent ${agentId} | ${formatDate(b)} | ${formatPct(val)} drift`}
                >
                  {val > 0 ? Math.round(val) : ""}
                </div>
              );
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center gap-3 mt-3 text-[10px]" style={{ color: MUTED }}>
          <span>Drift intensity:</span>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-sm" style={{ background: "oklch(0.2 0.02 286 / 30%)" }} />
            <span>0%</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-sm" style={{ background: "oklch(0.55 0.15 293 / 50%)" }} />
            <span>Low</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-sm" style={{ background: "oklch(0.6 0.2 293 / 80%)" }} />
            <span>Medium</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-sm" style={{ background: "oklch(0.65 0.27 25 / 100%)" }} />
            <span>High</span>
          </div>
        </div>
      </div>
    </div>
  );
}
