import { RISK_COLORS } from "./types";

interface StatsOverlayProps {
  stats: any;
}

export function StatsOverlay({ stats }: StatsOverlayProps): React.JSX.Element {
  return (
    <div className="absolute top-4 right-4 glass-panel rounded-xl border border-white/10 px-4 py-3 z-10 w-64">
      <p className="text-[10px] text-muted-foreground mb-2 font-medium">Knowledge Graph</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">Endpoints</span>
          <span className="text-[10px] font-mono text-foreground">{stats.endpoints}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">Resources</span>
          <span className="text-[10px] font-mono text-foreground">{stats.resources}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">Use Cases</span>
          <span className="text-[10px] font-mono text-foreground">{stats.useCases}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">Indices</span>
          <span className="text-[10px] font-mono text-foreground">{stats.indices}</span>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-white/5">
        <p className="text-[9px] text-muted-foreground mb-1">Risk Breakdown</p>
        <div className="flex gap-2">
          <span className="text-[10px] font-mono" style={{ color: RISK_COLORS.SAFE }}>
            {stats.byRiskLevel?.safe ?? 0} safe
          </span>
          <span className="text-[10px] font-mono" style={{ color: RISK_COLORS.MUTATING }}>
            {stats.byRiskLevel?.mutating ?? 0} mut
          </span>
          <span className="text-[10px] font-mono" style={{ color: RISK_COLORS.DESTRUCTIVE }}>
            {stats.byRiskLevel?.destructive ?? 0} destr
          </span>
        </div>
      </div>
      <div className="mt-2 pt-2 border-t border-white/5">
        <p className="text-[9px] text-muted-foreground mb-1">HTTP Methods</p>
        <div className="flex gap-2">
          {["GET", "POST", "PUT", "DELETE"].map(m => (
            <span key={m} className="text-[10px] font-mono text-foreground">
              <span className="text-muted-foreground">{m}:</span> {stats.byMethod?.[m] ?? 0}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
