import { Route, X, Loader2, Shield } from "lucide-react";
import { RiskPath, RISK_COLORS } from "./types";

interface RiskPathPanelProps {
  paths: RiskPath[];
  selectedPathId: string | null;
  onSelectPath: (id: string | null) => void;
  isLoading: boolean;
  onClose: () => void;
}

export function RiskPathPanel({
  paths,
  selectedPathId,
  onSelectPath,
  isLoading,
  onClose,
}: RiskPathPanelProps): React.JSX.Element {
  return (
    <div className="absolute top-4 left-14 w-80 glass-panel rounded-xl border border-white/10 shadow-2xl z-20 overflow-hidden max-h-[calc(100%-2rem)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Route className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-medium text-foreground">Risk Paths</h3>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-muted-foreground" aria-label="Close risk paths panel">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {isLoading ? (
        <div className="px-4 py-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
        </div>
      ) : paths.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <Shield className="w-8 h-8 text-green-400 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No high-risk paths detected.</p>
          <p className="text-[10px] text-muted-foreground mt-1">All endpoints are within acceptable risk thresholds.</p>
        </div>
      ) : (
        <div className="overflow-y-auto max-h-[calc(100vh-12rem)]">
          {paths.map((path) => {
            const isSelected = selectedPathId === path.id;
            const riskColor = RISK_COLORS[path.riskLevel] ?? "#fbbf24";

            return (
              <button
                key={path.id}
                onClick={() => onSelectPath(isSelected ? null : path.id)}
                className={`w-full text-left px-4 py-3 border-b border-white/5 transition-all hover:bg-white/[0.03] ${
                  isSelected ? "bg-purple-500/10 border-l-2 border-l-purple-500" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{path.hops[0]?.label ?? "Unknown"}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{path.summary}</p>
                  </div>
                  <div className="flex-shrink-0 flex flex-col items-end gap-1">
                    <span
                      className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded"
                      style={{ color: riskColor, backgroundColor: `${riskColor}15`, border: `1px solid ${riskColor}30` }}
                    >
                      {path.score}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{path.hops.length} nodes</span>
                  </div>
                </div>

                {isSelected && (
                  <div className="mt-2 space-y-1">
                    {path.hops.map((hop, i) => {
                      const hopColor = RISK_COLORS[hop.riskLevel ?? "SAFE"] ?? "#888";
                      return (
                        <div key={`${hop.nodeId}-${i}`} className="flex items-center gap-2">
                          <div className="w-4 flex flex-col items-center">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: hopColor }} />
                            {i < path.hops.length - 1 && (
                              <div className="w-px h-3 mt-0.5" style={{ backgroundColor: `${hopColor}40` }} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] text-foreground truncate">{hop.label}</p>
                            <p className="text-[9px] text-muted-foreground font-mono">{hop.stage} &middot; {hop.nodeType}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
