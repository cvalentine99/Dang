import {
  X, ChevronRight, Loader2, Lock, Unlock, MousePointerClick, GitBranch, FolderPlus,
} from "lucide-react";
import { GraphNode, NODE_CONFIG, RISK_COLORS } from "./types";

interface NodeDetailPanelProps {
  node: GraphNode;
  onClose: () => void;
  onExpand: (node: GraphNode) => void;
  isExpanded: boolean;
  expandLoading: boolean;
  onAddToInvestigation: (node: GraphNode) => void;
}

export function NodeDetailPanel({
  node,
  onClose,
  onExpand,
  isExpanded,
  expandLoading,
  onAddToInvestigation,
}: NodeDetailPanelProps): React.JSX.Element {
  const config = NODE_CONFIG[node.type] || NODE_CONFIG.endpoint;
  const Icon = config.icon;
  const riskLevel = node.properties.riskLevel as string | undefined;
  const riskColor = riskLevel ? RISK_COLORS[riskLevel] ?? "#888" : undefined;
  const canExpand = node.type === "resource" || node.type === "endpoint";

  const properties = Object.entries(node.properties).filter(
    ([key]) => !["x", "y", "fx", "fy", "index", "vx", "vy"].includes(key)
  );

  return (
    <div className="absolute top-4 right-4 w-96 glass-panel rounded-xl border border-white/10 shadow-2xl z-20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${config.color}20`, border: `1px solid ${config.color}40` }}>
            <Icon className="w-4 h-4" style={{ color: config.color }} />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground truncate max-w-[220px]">{node.label}</p>
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-muted-foreground font-mono">{node.type}</p>
              {riskLevel && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ color: riskColor, backgroundColor: `${riskColor}15`, border: `1px solid ${riskColor}30` }}>
                  {riskLevel}
                </span>
              )}
              {node.properties.llmAllowed !== undefined && (
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                  node.properties.llmAllowed ? "text-green-400 bg-green-500/10 border border-green-500/20" : "text-red-400 bg-red-500/10 border border-red-500/20"
                }`}>
                  {node.properties.llmAllowed ? <Unlock className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                  {node.properties.llmAllowed ? "LLM OK" : "LLM Blocked"}
                </span>
              )}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-white/10 transition-colors text-muted-foreground" aria-label="Close node detail panel">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Expand button */}
      {canExpand && (
        <div className="px-4 py-2 border-b border-white/5">
          <button
            onClick={() => onExpand(node)}
            disabled={expandLoading || isExpanded}
            className={`w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isExpanded
                ? "bg-purple-500/10 text-purple-300 border border-purple-500/20 cursor-default"
                : expandLoading
                  ? "bg-white/5 text-muted-foreground border border-white/10 cursor-wait"
                  : "bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25"
            }`}
          >
            {expandLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isExpanded ? (
              <GitBranch className="w-3.5 h-3.5" />
            ) : (
              <MousePointerClick className="w-3.5 h-3.5" />
            )}
            {isExpanded
              ? `Expanded — ${node.type === "resource" ? "endpoints visible" : "params & responses visible"}`
              : `Expand ${node.type === "resource" ? "endpoints" : "params & responses"}`}
          </button>
        </div>
      )}

      <div className="px-4 py-3 max-h-80 overflow-y-auto space-y-1.5">
        {properties.map(([key, value]) => (
          <div key={key} className="flex items-start gap-2">
            <span className="text-[11px] text-muted-foreground font-mono flex-shrink-0 w-32 truncate">{key}</span>
            <span className="text-[11px] text-foreground font-mono break-all">
              {value === null || value === undefined
                ? <span className="text-muted-foreground italic">null</span>
                : Array.isArray(value)
                  ? value.join(", ")
                  : String(value)}
            </span>
          </div>
        ))}
        {properties.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No properties available</p>
        )}
      </div>
      {/* Add to Investigation */}
      <div className="px-4 py-2 border-t border-white/5">
        <button
          onClick={() => onAddToInvestigation(node)}
          className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25"
        >
          <FolderPlus className="w-3.5 h-3.5" />
          Add to Investigation
        </button>
      </div>

      <details className="border-t border-white/5">
        <summary className="px-4 py-2 text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors flex items-center gap-1.5">
          <ChevronRight className="w-3 h-3" />
          Raw JSON
        </summary>
        <pre className="px-4 pb-3 text-[10px] font-mono text-muted-foreground overflow-x-auto max-h-40 overflow-y-auto">
          {JSON.stringify(node.properties, null, 2)}
        </pre>
      </details>
    </div>
  );
}
