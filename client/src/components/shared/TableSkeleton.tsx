import { cn } from "@/lib/utils";

/* ── Table Skeleton ────────────────────────────────────────────────────────
 * Shimmer placeholder for data tables during loading.
 * Renders faux header + configurable rows of pulsing cells
 * inside a glass-panel container matching the real table dimensions.
 * ────────────────────────────────────────────────────────────────────────── */

interface TableSkeletonProps {
  /** Number of columns */
  columns?: number;
  /** Number of shimmer rows */
  rows?: number;
  /** Column width ratios (e.g. [1, 2, 3, 1]) — auto-fills if shorter than columns */
  columnWidths?: number[];
  /** Extra class names on the outer wrapper */
  className?: string;
}

export function TableSkeleton({
  columns = 6,
  rows = 8,
  columnWidths,
  className,
}: TableSkeletonProps) {
  // Normalize column widths to percentages
  const widths = Array.from({ length: columns }, (_, i) => {
    const raw = columnWidths?.[i] ?? 1;
    return raw;
  });
  const totalWeight = widths.reduce((a, b) => a + b, 0);
  const pcts = widths.map((w) => `${((w / totalWeight) * 100).toFixed(1)}%`);

  return (
    <div className={cn("glass-panel overflow-hidden", className)}>
      {/* Header row */}
      <div
        className="flex gap-3 px-4 py-2.5 bg-white/5 border-b border-white/10"
      >
        {pcts.map((w, i) => (
          <div key={`hdr-${i}`} style={{ width: w }} className="flex items-center">
            <div className="h-2.5 rounded bg-white/8 animate-pulse" style={{ width: `${50 + Math.random() * 30}%` }} />
          </div>
        ))}
      </div>

      {/* Body rows */}
      <div className="divide-y divide-white/5">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div
            key={`row-${rowIdx}`}
            className="flex gap-3 px-4 py-3"
            style={{ opacity: 1 - rowIdx * 0.06 }}
          >
            {pcts.map((w, colIdx) => {
              // Vary cell widths for visual interest
              const cellWidth = `${40 + ((rowIdx * 7 + colIdx * 13) % 45)}%`;
              // First column often has an icon placeholder
              const isFirst = colIdx === 0;
              return (
                <div key={`cell-${rowIdx}-${colIdx}`} style={{ width: w }} className="flex items-center gap-2">
                  {isFirst && (
                    <div className="h-5 w-5 rounded bg-primary/8 animate-pulse shrink-0" />
                  )}
                  <div
                    className="h-3 rounded bg-white/6 chart-skeleton-shimmer"
                    style={{
                      width: cellWidth,
                      animationDelay: `${rowIdx * 80 + colIdx * 40}ms`,
                    }}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
