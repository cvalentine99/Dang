import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Bookmark, BookmarkPlus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { SavedSearchType } from "@shared/searchTypes";

interface SavedSearchPanelProps {
  /** The search type key for this page — must match a value in shared/searchTypes.ts */
  searchType: SavedSearchType;
  /** Label shown in the UI (e.g., "Alerts", "Vulnerability", "Fleet") */
  label: string;
  /** Returns the current filter state as a serializable object */
  getCurrentFilters: () => Record<string, unknown>;
  /** Called when a saved search is loaded — receives the stored filters */
  onLoadSearch: (filters: Record<string, unknown>) => void;
  /** Optional: summary of current filters for the save dialog */
  filterSummary?: { label: string; value: string }[];
}

export function SavedSearchPanel({
  searchType,
  label,
  getCurrentFilters,
  onLoadSearch,
  filterSummary,
}: SavedSearchPanelProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");

  const savedSearchesQ = trpc.savedSearches.list.useQuery({ searchType });
  const createSearchMut = trpc.savedSearches.create.useMutation({
    onSuccess: () => {
      savedSearchesQ.refetch();
      setShowSaveDialog(false);
      setSaveName("");
      setSaveDescription("");
      toast.success("Search saved successfully");
    },
    onError: (err: { message: string }) => toast.error(`Failed to save: ${err.message}`),
  });
  const deleteSearchMut = trpc.savedSearches.delete.useMutation({
    onSuccess: () => {
      savedSearchesQ.refetch();
      toast.success("Saved search deleted");
    },
    onError: (err: { message: string }) => toast.error(`Failed to delete: ${err.message}`),
  });

  const handleSaveSearch = () => {
    if (!saveName.trim()) {
      toast.error("Please enter a name for this search");
      return;
    }
    createSearchMut.mutate({
      name: saveName.trim(),
      searchType,
      filters: getCurrentFilters(),
      description: saveDescription.trim() || undefined,
    });
  };

  const handleLoadSearch = (filters: Record<string, unknown>) => {
    onLoadSearch(filters);
    setShowDropdown(false);
    toast.success("Search loaded");
  };

  return (
    <>
      {/* Saved Searches Dropdown */}
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDropdown(!showDropdown)}
          className="text-xs bg-transparent border-white/10 text-slate-300 hover:bg-white/10"
        >
          <Bookmark className="h-3.5 w-3.5 mr-1" />
          Saved ({savedSearchesQ.data?.searches?.length ?? 0})
        </Button>
        {showDropdown && (
          <div className="absolute right-0 top-full mt-1 w-80 bg-[oklch(0.17_0.025_286)] border border-white/10 rounded-lg shadow-xl z-50 max-h-[400px] overflow-y-auto">
            <div className="p-3 border-b border-white/10">
              <h4 className="text-xs font-semibold text-violet-300">Saved {label} Searches</h4>
            </div>
            {(savedSearchesQ.data?.searches ?? []).length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                No saved searches yet
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {(savedSearchesQ.data?.searches ?? []).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between px-3 py-2.5 hover:bg-white/5 cursor-pointer group"
                  >
                    <div
                      className="flex-1 min-w-0"
                      onClick={() => handleLoadSearch(s.filters as Record<string, unknown>)}
                    >
                      <p className="text-xs text-slate-200 truncate font-medium">{s.name}</p>
                      {s.description && (
                        <p className="text-[10px] text-slate-500 truncate mt-0.5">{s.description}</p>
                      )}
                      <p className="text-[10px] text-slate-600 mt-0.5">
                        {new Date(s.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSearchMut.mutate({ id: s.id });
                      }}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Save Current Search Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowSaveDialog(true)}
        className="text-xs bg-transparent border-white/10 text-slate-300 hover:bg-white/10"
      >
        <BookmarkPlus className="h-3.5 w-3.5 mr-1" />
        Save Search
      </Button>

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowSaveDialog(false)}>
          <div className="bg-[oklch(0.17_0.025_286)] border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-violet-300 mb-4 flex items-center gap-2">
              <Save className="h-4 w-4" /> Save {label} Search
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Name *</label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder={`e.g., Critical ${label.toLowerCase()} on prod servers`}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500/50"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  placeholder="Brief description of this search..."
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500/50"
                />
              </div>
              {filterSummary && filterSummary.length > 0 && (
                <div className="bg-white/5 rounded-lg p-3 text-xs text-slate-400 space-y-1">
                  <p className="font-semibold text-slate-300">Current Filters:</p>
                  {filterSummary.map((f) => (
                    <p key={f.label}>{f.label}: <span className="font-mono text-violet-300">{f.value}</span></p>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSaveDialog(false)}
                className="bg-transparent border-white/10 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveSearch}
                disabled={createSearchMut.isPending}
                className="bg-violet-600 hover:bg-violet-500 text-white"
              >
                {createSearchMut.isPending ? "Saving..." : "Save Search"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
