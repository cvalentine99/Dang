import {
  SquareMousePointer, CheckSquare, Square, EyeOff, Pin, Copy, FolderPlus, X,
} from "lucide-react";

interface MultiSelectToolbarProps {
  selectedCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBulkHide: () => void;
  onBulkPin: () => void;
  onBulkCopyIds: () => void;
  onBulkAddToInvestigation: () => void;
  onExit: () => void;
}

export function MultiSelectToolbar({
  selectedCount,
  onSelectAll,
  onDeselectAll,
  onBulkHide,
  onBulkPin,
  onBulkCopyIds,
  onBulkAddToInvestigation,
  onExit,
}: MultiSelectToolbarProps): React.JSX.Element {
  const hasSelection = selectedCount > 0;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 glass-panel rounded-xl border border-cyan-500/20 px-2 py-1.5 z-20 flex items-center gap-1">
      <div className="flex items-center gap-1.5 px-2 border-r border-white/10">
        <SquareMousePointer className="w-3.5 h-3.5 text-cyan-400" />
        <span className="text-xs text-cyan-300 font-mono">
          {hasSelection ? `${selectedCount} selected` : "Click or drag to select"}
        </span>
      </div>

      {/* Select All / Deselect All */}
      <button
        onClick={onSelectAll}
        className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground hover:bg-white/5 hover:text-foreground rounded transition-colors"
        title="Select all visible nodes"
      >
        <CheckSquare className="w-3 h-3" />
        All
      </button>
      <button
        onClick={onDeselectAll}
        className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground hover:bg-white/5 hover:text-foreground rounded transition-colors"
        title="Deselect all"
      >
        <Square className="w-3 h-3" />
        None
      </button>

      <div className="w-px h-5 bg-white/10" />

      {/* Bulk actions */}
      <button
        onClick={onBulkHide}
        disabled={!hasSelection}
        className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ${
          hasSelection ? "text-orange-300 hover:bg-orange-500/10" : "text-muted-foreground/40 cursor-not-allowed"
        }`}
        title="Hide selected nodes"
      >
        <EyeOff className="w-3 h-3" />
        Hide
      </button>
      <button
        onClick={onBulkPin}
        disabled={!hasSelection}
        className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ${
          hasSelection ? "text-blue-300 hover:bg-blue-500/10" : "text-muted-foreground/40 cursor-not-allowed"
        }`}
        title="Pin/Unpin selected nodes"
      >
        <Pin className="w-3 h-3" />
        Pin
      </button>
      <button
        onClick={onBulkCopyIds}
        disabled={!hasSelection}
        className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ${
          hasSelection ? "text-green-300 hover:bg-green-500/10" : "text-muted-foreground/40 cursor-not-allowed"
        }`}
        title="Copy node IDs"
      >
        <Copy className="w-3 h-3" />
        IDs
      </button>
      <button
        onClick={onBulkAddToInvestigation}
        disabled={!hasSelection}
        className={`flex items-center gap-1 px-2 py-1 text-[10px] rounded transition-colors ${
          hasSelection ? "text-indigo-300 hover:bg-indigo-500/10" : "text-muted-foreground/40 cursor-not-allowed"
        }`}
        title="Add selected to investigation"
      >
        <FolderPlus className="w-3 h-3" />
        Investigate
      </button>

      <div className="w-px h-5 bg-white/10" />

      {/* Exit multi-select */}
      <button
        onClick={onExit}
        className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground hover:bg-white/5 hover:text-foreground rounded transition-colors"
        title="Exit multi-select (Esc)"
      >
        <X className="w-3 h-3" />
        Exit
      </button>
    </div>
  );
}
