import { cn } from "@/lib/utils";

/* ── Chart Skeleton ─────────────────────────────────────────────────────────
 * Shimmer placeholder for Recharts panels during loading.
 * Renders faux axis lines, grid lines, and a pulsing area shape
 * inside a glass-panel container that matches the real chart dimensions.
 * ────────────────────────────────────────────────────────────────────────── */

type ChartVariant = "area" | "bar" | "pie" | "heatmap";

interface ChartSkeletonProps {
  /** Height in pixels — should match the real chart's ResponsiveContainer height */
  height?: number;
  /** Visual variant hint — adjusts the placeholder shape */
  variant?: ChartVariant;
  /** Optional panel title shown above the skeleton */
  title?: string;
  /** Extra class names on the outer wrapper */
  className?: string;
}

export function ChartSkeleton({
  height = 220,
  variant = "area",
  title,
  className,
}: ChartSkeletonProps) {
  return (
    <div className={cn("glass-panel p-4", className)}>
      {/* Optional title placeholder */}
      {title ? (
        <div className="flex items-center gap-2 mb-4">
          <div className="h-4 w-4 rounded bg-primary/10" />
          <div className="h-3.5 rounded bg-white/5" style={{ width: `${Math.min(title.length * 7, 200)}px` }} />
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-4">
          <div className="h-4 w-4 rounded bg-primary/10 animate-pulse" />
          <div className="h-3 w-32 rounded bg-white/5 animate-pulse" />
        </div>
      )}

      {/* Chart area */}
      <div className="relative overflow-hidden rounded-md" style={{ height }}>
        {/* SVG skeleton matching the variant */}
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 400 ${height}`}
          preserveAspectRatio="none"
          className="absolute inset-0"
        >
          {/* Faux grid lines */}
          {Array.from({ length: 5 }).map((_, i) => {
            const y = (i / 4) * (height - 20) + 10;
            return (
              <line
                key={`grid-${i}`}
                x1="40"
                y1={y}
                x2="395"
                y2={y}
                stroke="oklch(0.3 0.04 286 / 12%)"
                strokeDasharray="3 3"
              />
            );
          })}

          {/* Faux Y-axis ticks */}
          {Array.from({ length: 5 }).map((_, i) => {
            const y = (i / 4) * (height - 20) + 10;
            return (
              <rect
                key={`ytick-${i}`}
                x="8"
                y={y - 3}
                width="22"
                height="6"
                rx="2"
                fill="oklch(0.3 0.04 286 / 15%)"
              />
            );
          })}

          {/* Faux X-axis ticks */}
          {Array.from({ length: 6 }).map((_, i) => {
            const x = 40 + (i / 5) * 355;
            return (
              <rect
                key={`xtick-${i}`}
                x={x - 12}
                y={height - 8}
                width="24"
                height="6"
                rx="2"
                fill="oklch(0.3 0.04 286 / 15%)"
              />
            );
          })}

          {/* Variant-specific shapes */}
          {variant === "area" && (
            <path
              d={`M40,${height * 0.7} C100,${height * 0.5} 150,${height * 0.6} 200,${height * 0.35} C250,${height * 0.15} 300,${height * 0.4} 395,${height * 0.25} L395,${height - 12} L40,${height - 12} Z`}
              fill="oklch(0.541 0.281 293 / 4%)"
              stroke="oklch(0.541 0.281 293 / 10%)"
              strokeWidth="1.5"
              className="chart-skeleton-shape"
            />
          )}

          {variant === "bar" &&
            Array.from({ length: 8 }).map((_, i) => {
              const x = 55 + i * 43;
              const barH = 30 + Math.sin(i * 1.3) * 40 + 40;
              return (
                <rect
                  key={`bar-${i}`}
                  x={x}
                  y={height - 12 - barH}
                  width="28"
                  height={barH}
                  rx="3"
                  fill="oklch(0.541 0.281 293 / 6%)"
                  stroke="oklch(0.541 0.281 293 / 10%)"
                  strokeWidth="0.5"
                  className="chart-skeleton-shape"
                />
              );
            })}

          {variant === "pie" && (
            <>
              <circle
                cx="200"
                cy={height / 2}
                r={Math.min(height / 2 - 20, 70)}
                fill="none"
                stroke="oklch(0.541 0.281 293 / 8%)"
                strokeWidth="24"
                className="chart-skeleton-shape"
              />
              <circle
                cx="200"
                cy={height / 2}
                r={Math.min(height / 2 - 20, 70)}
                fill="none"
                stroke="oklch(0.541 0.281 293 / 15%)"
                strokeWidth="24"
                strokeDasharray={`${Math.min(height / 2 - 20, 70) * 1.2} 999`}
                className="chart-skeleton-shape"
              />
            </>
          )}

          {variant === "heatmap" &&
            Array.from({ length: 7 }).map((_, row) =>
              Array.from({ length: 24 }).map((_, col) => (
                <rect
                  key={`hm-${row}-${col}`}
                  x={45 + col * 14.5}
                  y={10 + row * ((height - 30) / 7)}
                  width="12"
                  height={Math.max((height - 30) / 7 - 3, 8)}
                  rx="2"
                  fill={`oklch(0.541 0.281 293 / ${2 + Math.random() * 6}%)`}
                  className="chart-skeleton-shape"
                />
              ))
            )}
        </svg>

        {/* Shimmer overlay */}
        <div className="absolute inset-0 chart-skeleton-shimmer rounded-md" />
      </div>
    </div>
  );
}
