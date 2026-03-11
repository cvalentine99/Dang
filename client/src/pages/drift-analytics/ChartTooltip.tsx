import { CARD_BG, BORDER, MUTED, formatPct } from "./theme";

export function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg backdrop-blur-md"
      style={{ background: CARD_BG, borderColor: BORDER, color: "oklch(0.85 0.01 286)" }}
    >
      <div className="mb-1 font-semibold">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span style={{ color: MUTED }}>{p.name}:</span>
          <span className="font-mono">{typeof p.value === "number" ? formatPct(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}
