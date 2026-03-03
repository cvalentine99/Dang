import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { FolderPlus, X, Loader2, Check } from "lucide-react";
import { GraphNode, NODE_CONFIG } from "./types";

interface AddToInvestigationDialogProps {
  node: GraphNode;
  onClose: () => void;
}

export function AddToInvestigationDialog({ node, onClose }: AddToInvestigationDialogProps): React.JSX.Element {
  const [selectedInvId, setSelectedInvId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const investigationsQ = trpc.graph.listInvestigations.useQuery({ status: "active" });
  const updateMutation = trpc.graph.updateInvestigation.useMutation();
  const utils = trpc.useUtils();

  const investigations = (investigationsQ.data as any)?.sessions ?? (Array.isArray(investigationsQ.data) ? investigationsQ.data : []);

  const handleAdd = async () => {
    if (!selectedInvId) return;
    setAdding(true);
    try {
      const inv = investigations.find((i: any) => i.id === selectedInvId);
      if (!inv) return;
      const existingEvidence = Array.isArray((inv as any).evidence) ? (inv as any).evidence : [];
      const newEvidence = {
        type: node.type,
        label: node.label,
        data: { ...node.properties, nodeId: node.id },
        addedAt: new Date().toISOString(),
      };
      await updateMutation.mutateAsync({
        id: selectedInvId,
        evidence: [...existingEvidence, newEvidence],
      });
      utils.graph.listInvestigations.invalidate();
      setAdded(true);
      toast.success("Evidence added", { description: `"${node.label}" added to investigation` });
      setTimeout(onClose, 1200);
    } catch (err) {
      toast.error("Failed to add evidence");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-display font-bold text-foreground">Add to Investigation</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-muted-foreground" aria-label="Close dialog"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Node preview */}
          <div className="glass-panel rounded-lg border border-white/5 px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: NODE_CONFIG[node.type]?.color ?? "#888" }} />
              <span className="text-sm text-foreground font-medium truncate">{node.label}</span>
              <span className="text-[10px] text-muted-foreground font-mono ml-auto">{node.type}</span>
            </div>
          </div>

          {/* Investigation selector */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Select Active Investigation</label>
            {investigationsQ.isLoading ? (
              <div className="flex items-center gap-2 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                <span className="text-xs text-muted-foreground">Loading investigations...</span>
              </div>
            ) : investigations.length === 0 ? (
              <div className="text-xs text-muted-foreground py-3">
                No active investigations. Create one from the Investigations page first.
              </div>
            ) : (
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {investigations.map((inv: any) => (
                  <button
                    key={inv.id}
                    onClick={() => setSelectedInvId(inv.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
                      selectedInvId === inv.id
                        ? "bg-purple-500/15 border border-purple-500/30"
                        : "bg-white/5 border border-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground truncate">{inv.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(inv.createdAt).toLocaleDateString()}
                        {inv.tags?.length > 0 && ` \u2022 ${(inv.tags as string[]).join(", ")}`}
                      </p>
                    </div>
                    {selectedInvId === inv.id && <Check className="w-4 h-4 text-purple-400 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!selectedInvId || adding || added}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              added
                ? "bg-green-500/15 text-green-300 border border-green-500/30"
                : !selectedInvId || adding
                  ? "bg-white/5 text-muted-foreground border border-white/10 cursor-not-allowed"
                  : "bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25"
            }`}
          >
            {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : added ? <Check className="w-3.5 h-3.5" /> : <FolderPlus className="w-3.5 h-3.5" />}
            {added ? "Added" : adding ? "Adding..." : "Add Evidence"}
          </button>
        </div>
      </div>
    </div>
  );
}
