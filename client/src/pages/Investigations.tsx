import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  FolderSearch, Plus, Search, Clock, Tag, ChevronRight, FileText,
  Archive, CheckCircle2, Loader2, Trash2, X, AlertTriangle, StickyNote,
  Download, FileCode, FileType, RefreshCw,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────

type InvestigationStatus = "active" | "closed" | "archived";

// ── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: InvestigationStatus }): React.JSX.Element {
  const config = {
    active: { color: "bg-green-500/15 text-green-300 border-green-500/20", icon: Clock, label: "Active" },
    closed: { color: "bg-blue-500/15 text-blue-300 border-blue-500/20", icon: CheckCircle2, label: "Closed" },
    archived: { color: "bg-gray-500/15 text-gray-300 border-gray-500/20", icon: Archive, label: "Archived" },
  };
  const c = config[status] || config.active;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${c.color}`}>
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  );
}

// ── Create Dialog ───────────────────────────────────────────────────────────

function CreateDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const utils = trpc.useUtils();
  const createMutation = trpc.graph.createInvestigation.useMutation({
    onSuccess: () => {
      utils.graph.listInvestigations.invalidate();
      onClose();
    },
  });

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
      setTagInput("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-panel rounded-2xl border border-white/10 w-full max-w-lg mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <h2 className="text-lg font-display font-bold text-foreground">New Investigation</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-muted-foreground" aria-label="Close dialog"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., Suspicious lateral movement from Agent 003"
              className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/30"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of the investigation scope and initial findings..."
              rows={3}
              className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/30 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Tags</label>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                placeholder="Add tag..."
                className="flex-1 px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/30"
              />
              <button onClick={addTag} className="px-3 py-2 text-xs bg-purple-500/15 border border-purple-500/30 rounded-lg text-purple-300 hover:bg-purple-500/25 transition-colors">Add</button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map(t => (
                  <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/20">
                    {t}
                    <button onClick={() => setTags(tags.filter(x => x !== t))} className="hover:text-foreground"><X className="w-2.5 h-2.5" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-white/5">
          <button onClick={onClose} className="px-4 py-2 text-xs rounded-lg border border-white/10 text-muted-foreground hover:bg-white/5 transition-colors">Cancel</button>
          <button
            onClick={() => createMutation.mutate({ title, description: description || undefined, tags: tags.length > 0 ? tags : undefined })}
            disabled={!title.trim() || createMutation.isPending}
            className="px-4 py-2 text-xs rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-200 hover:bg-purple-500/30 disabled:opacity-50 transition-colors"
          >
            {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Create Investigation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Export Button ──────────────────────────────────────────────────────────

function ExportButton({ sessionId, format }: { sessionId: number; format: "markdown" | "html" }): React.JSX.Element {
  const [loading, setLoading] = useState(false);

  const mdQuery = trpc.graph.exportInvestigationMarkdown.useQuery(
    { sessionId },
    { enabled: false }
  );
  const htmlQuery = trpc.graph.exportInvestigationHtml.useQuery(
    { sessionId },
    { enabled: false }
  );

  const handleExport = async () => {
    setLoading(true);
    try {
      if (format === "markdown") {
        const result = await mdQuery.refetch();
        if (result.data) {
          const blob = new Blob([result.data.markdown], { type: "text/markdown" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${result.data.title.replace(/[^a-zA-Z0-9-_ ]/g, "").slice(0, 50)}_report.md`;
          a.click();
          URL.revokeObjectURL(url);
        }
      } else {
        const result = await htmlQuery.refetch();
        if (result.data) {
          const blob = new Blob([result.data.html], { type: "text/html" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${result.data.title.replace(/[^a-zA-Z0-9-_ ]/g, "").slice(0, 50)}_report.html`;
          a.click();
          URL.revokeObjectURL(url);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const Icon = format === "markdown" ? FileCode : FileType;
  const label = format === "markdown" ? "Export MD" : "Export HTML";

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-purple-500/20 text-purple-300 hover:bg-purple-500/10 disabled:opacity-50 transition-colors"
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
      {label}
    </button>
  );
}

// ── Investigation Detail View ───────────────────────────────────────────────

function InvestigationDetail({ id, onBack }: { id: number; onBack: () => void }): React.JSX.Element {
  const [noteInput, setNoteInput] = useState("");
  const { data, isLoading, refetch } = trpc.graph.getInvestigation.useQuery({ id });
  const utils = trpc.useUtils();

  const updateMutation = trpc.graph.updateInvestigation.useMutation({
    onSuccess: () => { refetch(); utils.graph.listInvestigations.invalidate(); },
  });

  const addNoteMutation = trpc.graph.addInvestigationNote.useMutation({
    onSuccess: () => { refetch(); setNoteInput(""); },
  });

  const deleteNoteMutation = trpc.graph.deleteInvestigationNote.useMutation({
    onSuccess: () => refetch(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle className="w-8 h-8 text-threat-high" />
        <p className="text-sm text-muted-foreground">Investigation not found</p>
        <button onClick={onBack} className="text-xs text-purple-400 hover:text-purple-300">Go back</button>
      </div>
    );
  }

  const tags = Array.isArray(data.tags) ? data.tags as string[] : [];
  const notes = Array.isArray(data.notes) ? data.notes : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="mt-1 p-1 rounded hover:bg-white/10 text-muted-foreground" aria-label="Go back to investigations list"><ChevronRight className="w-4 h-4 rotate-180" /></button>
          <div>
            <h2 className="text-xl font-display font-bold text-foreground">{data.title}</h2>
            {data.description && <p className="text-sm text-muted-foreground mt-1">{data.description}</p>}
            <div className="flex items-center gap-3 mt-2">
              <StatusBadge status={data.status as InvestigationStatus} />
              <span className="text-[10px] text-muted-foreground font-mono">ID: {data.id}</span>
              <span className="text-[10px] text-muted-foreground">Created: {new Date(data.createdAt).toLocaleString()}</span>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((t: string) => (
                  <span key={t} className="px-2 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/20">{t}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Status controls + Export */}
        <div className="flex gap-2">
          {/* Export buttons */}
          <ExportButton sessionId={id} format="markdown" />
          <ExportButton sessionId={id} format="html" />

          {data.status === "active" && (
            <button
              onClick={() => updateMutation.mutate({ id, status: "closed" })}
              className="px-3 py-1.5 text-xs rounded-lg border border-blue-500/20 text-blue-300 hover:bg-blue-500/10 transition-colors"
            >
              Close
            </button>
          )}
          {data.status === "closed" && (
            <>
              <button
                onClick={() => updateMutation.mutate({ id, status: "active" })}
                className="px-3 py-1.5 text-xs rounded-lg border border-green-500/20 text-green-300 hover:bg-green-500/10 transition-colors"
              >
                Reopen
              </button>
              <button
                onClick={() => updateMutation.mutate({ id, status: "archived" })}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-500/20 text-gray-300 hover:bg-gray-500/10 transition-colors"
              >
                Archive
              </button>
            </>
          )}
        </div>
      </div>

      {/* Notes section */}
      <div className="glass-panel rounded-xl border border-white/10 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-medium text-foreground">Analyst Notes</h3>
          <span className="text-[10px] text-muted-foreground ml-auto">{notes.length} note{notes.length !== 1 ? "s" : ""}</span>
        </div>

        {/* Add note */}
        <div className="px-4 py-3 border-b border-white/5">
          <textarea
            value={noteInput}
            onChange={e => setNoteInput(e.target.value)}
            placeholder="Add investigation notes, findings, or observations..."
            rows={3}
            className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/30 resize-none font-mono"
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={() => addNoteMutation.mutate({ sessionId: id, content: noteInput })}
              disabled={!noteInput.trim() || addNoteMutation.isPending}
              className="px-3 py-1.5 text-xs rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-200 hover:bg-purple-500/30 disabled:opacity-50 transition-colors"
            >
              {addNoteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add Note"}
            </button>
          </div>
        </div>

        {/* Notes list */}
        <div className="divide-y divide-white/5">
          {notes.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No notes yet. Add your first observation above.</p>
            </div>
          ) : (
            notes.map((note: { id: number; content: string; createdAt: string | Date }) => (
              <div key={note.id} className="px-4 py-3 hover:bg-white/[0.02] transition-colors group">
                <div className="flex items-start justify-between">
                  <pre className="text-sm text-foreground font-mono whitespace-pre-wrap flex-1">{note.content}</pre>
                  <button
                    onClick={() => deleteNoteMutation.mutate({ noteId: note.id })}
                    className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ml-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 font-mono">
                  {new Date(note.createdAt).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Investigations Page ────────────────────────────────────────────────

export default function Investigations(): React.JSX.Element {
  const utils = trpc.useUtils();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<InvestigationStatus | "all">("all");

  const { data, isLoading } = trpc.graph.listInvestigations.useQuery(
    statusFilter === "all" ? { limit: 50 } : { status: statusFilter, limit: 50 }
  );

  const sessions = data?.sessions ?? [];

  const filtered = useMemo(() => {
    if (!searchQuery) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter((s: { title: string; description: string | null; tags: unknown }) => {
      const tags = Array.isArray(s.tags) ? s.tags : [];
      return s.title.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        tags.some((t: string) => t.toLowerCase().includes(q));
    });
  }, [sessions, searchQuery]);

  if (selectedId !== null) {
    return (
      <div className="px-6 py-6 max-w-5xl mx-auto">
        <InvestigationDetail id={selectedId} onBack={() => setSelectedId(null)} />
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
            <FolderSearch className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h1 className="text-lg font-display font-bold text-foreground">Investigations</h1>
            <p className="text-xs text-muted-foreground">{data?.total ?? 0} investigation{(data?.total ?? 0) !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { utils.graph.listInvestigations.invalidate(); }}
            disabled={isLoading}
            className="p-2 rounded-lg border border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
            title="Refresh investigations"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-200 hover:bg-purple-500/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Investigation
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search investigations..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white/5 border border-white/10 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:border-purple-500/30"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "active", "closed", "archived"] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                statusFilter === s
                  ? "border-purple-500/30 bg-purple-500/15 text-purple-200"
                  : "border-white/10 text-muted-foreground hover:bg-white/5"
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Investigation list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel rounded-xl border border-white/10 px-8 py-12 text-center">
          <FolderSearch className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-display font-bold text-foreground mb-1">No Investigations</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {searchQuery ? "No investigations match your search." : "Start your first investigation to track security findings."}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 text-xs rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-200 hover:bg-purple-500/30 transition-colors"
            >
              Create Investigation
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((session: { id: number; title: string; description: string | null; status: string; tags: unknown; createdAt: string | Date; updatedAt: string | Date }) => {
            const tags = Array.isArray(session.tags) ? session.tags as string[] : [];
            return (
              <button
                key={session.id}
                onClick={() => setSelectedId(session.id)}
                className="w-full glass-panel rounded-xl border border-white/10 px-4 py-3 text-left hover:bg-white/[0.03] hover:border-purple-500/20 transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-foreground truncate">{session.title}</h3>
                      <StatusBadge status={session.status as InvestigationStatus} />
                    </div>
                    {session.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{session.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] text-muted-foreground font-mono">#{session.id}</span>
                      <span className="text-[10px] text-muted-foreground">
                        Updated {new Date(session.updatedAt).toLocaleDateString()}
                      </span>
                      {tags.length > 0 && (
                        <div className="flex items-center gap-1">
                          <Tag className="w-3 h-3 text-muted-foreground" />
                          {tags.slice(0, 3).map((t: string) => (
                            <span key={t} className="text-[10px] text-purple-300">{t}</span>
                          ))}
                          {tags.length > 3 && <span className="text-[10px] text-muted-foreground">+{tags.length - 3}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-purple-400 transition-colors flex-shrink-0 mt-1" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      {showCreate && <CreateDialog onClose={() => setShowCreate(false)} />}
    </div>
  );
}
