import {
  Eye, EyeOff, Pin, PinOff, Copy, FolderPlus, CheckSquare, Square,
} from "lucide-react";
import { GraphNode } from "./types";

interface GraphContextMenuProps {
  x: number;
  y: number;
  node: GraphNode;
  pinnedNodes: Set<string>;
  selectedNodes: Set<string>;
  multiSelectMode: boolean;
  onShowConnected: (node: GraphNode) => void;
  onHideNode: (nodeId: string) => void;
  onTogglePin: (node: GraphNode) => void;
  onCopyNodeId: (nodeId: string) => void;
  onAddToInvestigation: (node: GraphNode) => void;
  onToggleSelect: (node: GraphNode) => void;
}

export function GraphContextMenu({
  x,
  y,
  node,
  pinnedNodes,
  selectedNodes,
  onShowConnected,
  onHideNode,
  onTogglePin,
  onCopyNodeId,
  onAddToInvestigation,
  onToggleSelect,
}: GraphContextMenuProps): React.JSX.Element {
  return (
    <div
      className="absolute z-50 glass-panel rounded-xl border border-white/10 shadow-2xl py-1 min-w-[200px]"
      style={{ left: x, top: y }}
      onClick={e => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 border-b border-white/5">
        <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[180px]">{node.label}</p>
        <p className="text-[9px] text-muted-foreground">{node.type}</p>
      </div>
      {(node.type === "resource" || node.type === "endpoint") && (
        <button
          onClick={() => onShowConnected(node)}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-white/5 transition-colors"
        >
          <Eye className="w-3.5 h-3.5 text-purple-400" />
          Show Connected Nodes
        </button>
      )}
      <button
        onClick={() => onHideNode(node.id)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-white/5 transition-colors"
      >
        <EyeOff className="w-3.5 h-3.5 text-orange-400" />
        Hide This Node
      </button>
      <button
        onClick={() => onTogglePin(node)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-white/5 transition-colors"
      >
        {pinnedNodes.has(node.id) ? (
          <><PinOff className="w-3.5 h-3.5 text-blue-400" /> Unpin Position</>
        ) : (
          <><Pin className="w-3.5 h-3.5 text-blue-400" /> Pin Position</>
        )}
      </button>
      <button
        onClick={() => onCopyNodeId(node.id)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-white/5 transition-colors"
      >
        <Copy className="w-3.5 h-3.5 text-green-400" />
        Copy Node ID
      </button>
      <div className="border-t border-white/5 mt-1 pt-1">
        <button
          onClick={() => onAddToInvestigation(node)}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-white/5 transition-colors"
        >
          <FolderPlus className="w-3.5 h-3.5 text-indigo-400" />
          Add to Investigation
        </button>
      </div>
      <div className="border-t border-white/5 mt-1 pt-1">
        <button
          onClick={() => onToggleSelect(node)}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-white/5 transition-colors"
        >
          {selectedNodes.has(node.id) ? (
            <><Square className="w-3.5 h-3.5 text-cyan-400" /> Deselect Node</>
          ) : (
            <><CheckSquare className="w-3.5 h-3.5 text-cyan-400" /> Select Node</>
          )}
        </button>
      </div>
    </div>
  );
}
