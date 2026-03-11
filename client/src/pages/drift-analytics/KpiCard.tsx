import { PURPLE, CARD_BG, BORDER, MUTED } from "./theme";

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  color = PURPLE,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color?: string;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg border px-4 py-3"
      style={{ background: CARD_BG, borderColor: BORDER }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}20` }}>
        <Icon className="h-5 w-5" style={{ color }} />
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider" style={{ color: MUTED }}>{label}</div>
        <div className="font-display text-xl font-bold" style={{ color: "oklch(0.93 0.005 286)" }}>{value}</div>
        {sub && <div className="text-xs" style={{ color: MUTED }}>{sub}</div>}
      </div>
    </div>
  );
}
