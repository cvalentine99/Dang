import { GlassPanel, ThreatBadge, StatCard } from "@/components/shared";
import { PageHeader } from "@/components/shared/PageHeader";
import { AddNoteDialog } from "@/components/shared/AddNoteDialog";
import { ExportButton } from "@/components/shared/ExportButton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Plus,
  StickyNote,
  CheckCircle,
  Trash2,
  Search,
  Edit3,
  AlertTriangle,
  Shield,
  Bug,
  Hash,
  FileText,
  Tag,
  Clock,
  Filter,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useCallback, useState, useMemo } from "react";
import { toast } from "sonner";

type Severity = "critical" | "high" | "medium" | "low" | "info";
type EntityType = "alert" | "agent" | "cve" | "rule" | "general";

const ENTITY_ICONS: Record<EntityType, typeof AlertTriangle> = {
  alert: AlertTriangle,
  agent: Shield,
  cve: Bug,
  rule: Hash,
  general: FileText,
};

const ENTITY_LABELS: Record<EntityType, string> = {
  alert: "Alert",
  agent: "Agent",
  cve: "CVE",
  rule: "Rule",
  general: "General",
};

export default function AnalystNotes() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [resolvedFilter, setResolvedFilter] = useState<string>("all");
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [expandedNote, setExpandedNote] = useState<number | null>(null);

  // Edit form state
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editSeverity, setEditSeverity] = useState<Severity>("info");
  const [editTags, setEditTags] = useState("");

  const utils = trpc.useUtils();

  const notesQ = trpc.notes.list.useQuery(
    {
      entityType:
        entityFilter !== "all" ? (entityFilter as EntityType) : undefined,
      severity:
        severityFilter !== "all" ? (severityFilter as Severity) : undefined,
      resolved:
        resolvedFilter === "all"
          ? undefined
          : resolvedFilter === "resolved"
            ? true
            : false,
      search: searchQuery || undefined,
      limit: 200,
    },
    { staleTime: 10_000, enabled: !!user }
  );

  const countsQ = trpc.notes.entityCounts.useQuery(undefined, {
    staleTime: 30_000,
    enabled: !!user,
  });

  const updateMut = trpc.notes.update.useMutation({
    onSuccess: () => {
      utils.notes.list.invalidate();
      utils.notes.entityCounts.invalidate();
      setEditingNote(null);
      toast.success("Note updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = trpc.notes.delete.useMutation({
    onSuccess: () => {
      utils.notes.list.invalidate();
      utils.notes.entityCounts.invalidate();
      toast.success("Note deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleRefresh = useCallback(() => {
    utils.notes.list.invalidate();
    utils.notes.entityCounts.invalidate();
  }, [utils]);

  const openEdit = (note: (typeof notes)[number]) => {
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditSeverity(note.severity as Severity);
    setEditTags((note.tags as string[] | null)?.join(", ") ?? "");
    setEditingNote(note.id);
  };

  const handleUpdate = () => {
    if (!editingNote) return;
    updateMut.mutate({
      id: editingNote,
      title: editTitle.trim(),
      content: editContent,
      severity: editSeverity,
      tags: editTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
  };

  const clearFilters = () => {
    setSearchQuery("");
    setEntityFilter("all");
    setSeverityFilter("all");
    setResolvedFilter("all");
  };

  const notes = notesQ.data?.notes ?? [];
  const total = notesQ.data?.total ?? 0;
  const counts = countsQ.data ?? {
    alert: 0,
    agent: 0,
    cve: 0,
    rule: 0,
    general: 0,
  };
  const totalNotes = Object.values(counts).reduce((a, b) => a + b, 0);
  const activeFilters =
    (entityFilter !== "all" ? 1 : 0) +
    (severityFilter !== "all" ? 1 : 0) +
    (resolvedFilter !== "all" ? 1 : 0) +
    (searchQuery ? 1 : 0);

  // Export data preparation
  const exportData = useMemo(
    () =>
      notes.map((n) => ({
        id: n.id,
        entityType: n.entityType,
        entityId: n.entityId,
        title: n.title,
        content: n.content,
        severity: n.severity,
        tags: (n.tags as string[] | null)?.join(", ") ?? "",
        resolved: n.resolved ? "Yes" : "No",
        createdAt: new Date(n.createdAt).toISOString(),
        updatedAt: new Date(n.updatedAt).toISOString(),
      })),
    [notes]
  );

  if (!user) {
    return (
      <div>
        <PageHeader
          title="Analyst Notes"
          subtitle="Local forensic annotations — never written to Wazuh"
        />
        <GlassPanel className="p-12 text-center">
          <StickyNote className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            Sign in to create and manage analyst notes.
          </p>
        </GlassPanel>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Analyst Notes"
        subtitle="Local forensic annotations — never written to Wazuh"
        onRefresh={handleRefresh}
        isLoading={notesQ.isLoading}
      >
        <div className="flex items-center gap-2">
          <ExportButton
            getData={() => exportData as Array<Record<string, unknown>>}
            baseName="analyst-notes"
            label="Export"
          />
          <AddNoteDialog
            entityType="general"
            triggerLabel="New Note"
            onCreated={handleRefresh}
          />
        </div>
      </PageHeader>

      {/* ── KPI Row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <StatCard
          label="Total Notes"
          value={totalNotes}
          icon={StickyNote}
          colorClass="text-primary"
        />
        <StatCard
          label="Alert Notes"
          value={counts.alert}
          icon={AlertTriangle}
          colorClass="text-red-400"
        />
        <StatCard
          label="Agent Notes"
          value={counts.agent}
          icon={Shield}
          colorClass="text-orange-400"
        />
        <StatCard
          label="CVE Notes"
          value={counts.cve}
          icon={Bug}
          colorClass="text-yellow-400"
        />
        <StatCard
          label="Rule Notes"
          value={counts.rule}
          icon={Hash}
          colorClass="text-cyan-400"
        />
        <StatCard
          label="General Notes"
          value={counts.general}
          icon={FileText}
          colorClass="text-muted-foreground"
        />
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <GlassPanel className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-[400px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes by title, content, entity..."
              className="pl-9 h-8 text-xs bg-secondary/50 border-border"
            />
          </div>

          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs bg-secondary/50 border-border">
              <SelectValue placeholder="Entity Type" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="all">All Entities</SelectItem>
              <SelectItem value="alert">Alerts</SelectItem>
              <SelectItem value="agent">Agents</SelectItem>
              <SelectItem value="cve">CVEs</SelectItem>
              <SelectItem value="rule">Rules</SelectItem>
              <SelectItem value="general">General</SelectItem>
            </SelectContent>
          </Select>

          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs bg-secondary/50 border-border">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="all">All Severity</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>

          <Select value={resolvedFilter} onValueChange={setResolvedFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs bg-secondary/50 border-border">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>

          {activeFilters > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="h-8 gap-1 bg-transparent border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <X className="h-3 w-3" /> Clear ({activeFilters})
            </Button>
          )}

          <span className="text-xs text-muted-foreground ml-auto">
            {total} note{total !== 1 ? "s" : ""}
          </span>
        </div>
      </GlassPanel>

      {/* ── Notes List ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {notes.map((note) => {
          const EntityIcon = ENTITY_ICONS[note.entityType as EntityType] ?? FileText;
          const isExpanded = expandedNote === note.id;
          const noteTags = (note.tags as string[] | null) ?? [];

          return (
            <GlassPanel key={note.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Header row */}
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium
                        bg-primary/10 border border-primary/20 text-primary"
                    >
                      <EntityIcon className="h-3 w-3" />
                      {ENTITY_LABELS[note.entityType as EntityType]}
                    </span>
                    {note.entityId && (
                      <span className="text-[10px] font-mono text-primary bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10">
                        {note.entityId}
                      </span>
                    )}
                    <ThreatBadge level={note.severity as Severity} />
                    {note.resolved === 1 && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-[oklch(0.765_0.177_163.223)]">
                        <CheckCircle className="h-3 w-3" /> Resolved
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h3
                    className="font-display font-semibold text-foreground text-sm cursor-pointer hover:text-primary transition-colors"
                    onClick={() =>
                      setExpandedNote(isExpanded ? null : note.id)
                    }
                  >
                    {note.title}
                    {note.content && (
                      <span className="inline-block ml-1.5">
                        {isExpanded ? (
                          <ChevronUp className="h-3 w-3 inline" />
                        ) : (
                          <ChevronDown className="h-3 w-3 inline" />
                        )}
                      </span>
                    )}
                  </h3>

                  {/* Content (expandable) */}
                  {note.content && (
                    <div
                      className={`mt-1.5 text-xs text-muted-foreground whitespace-pre-wrap font-mono ${
                        isExpanded ? "" : "line-clamp-2"
                      }`}
                    >
                      {note.content}
                    </div>
                  )}

                  {/* Tags */}
                  {noteTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {noteTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono
                            bg-secondary/50 border border-border/30 text-muted-foreground"
                        >
                          <Tag className="h-2.5 w-2.5" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="flex flex-wrap gap-3 mt-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(note.createdAt).toLocaleString()}
                    </span>
                    {note.updatedAt &&
                      new Date(note.updatedAt).getTime() !==
                        new Date(note.createdAt).getTime() && (
                        <span className="flex items-center gap-1">
                          <Edit3 className="h-3 w-3" />
                          Updated{" "}
                          {new Date(note.updatedAt).toLocaleString()}
                        </span>
                      )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(note)}
                    className="h-7 w-7 p-0 bg-transparent border-border text-muted-foreground hover:text-foreground"
                    title="Edit note"
                  >
                    <Edit3 className="h-3 w-3" />
                  </Button>
                  {note.resolved === 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        updateMut.mutate({ id: note.id, resolved: true })
                      }
                      className="h-7 text-xs bg-transparent border-border gap-1 text-muted-foreground hover:text-[oklch(0.765_0.177_163.223)]"
                      title="Mark as resolved"
                    >
                      <CheckCircle className="h-3 w-3" />
                    </Button>
                  )}
                  {note.resolved === 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        updateMut.mutate({ id: note.id, resolved: false })
                      }
                      className="h-7 text-xs bg-transparent border-border gap-1 text-muted-foreground hover:text-yellow-400"
                      title="Reopen note"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (confirm("Delete this note?"))
                        deleteMut.mutate({ id: note.id });
                    }}
                    className="h-7 w-7 p-0 bg-transparent border-border text-destructive hover:text-destructive hover:bg-destructive/10"
                    title="Delete note"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </GlassPanel>
          );
        })}

        {notes.length === 0 && (
          <GlassPanel className="p-12 text-center">
            <StickyNote className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {notesQ.isLoading
                ? "Loading notes..."
                : activeFilters > 0
                  ? "No notes match the current filters."
                  : "No analyst notes yet. Create one to start documenting findings."}
            </p>
            {activeFilters > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                className="mt-3 bg-transparent border-border"
              >
                Clear Filters
              </Button>
            )}
          </GlassPanel>
        )}
      </div>

      {/* ── Edit Dialog ────────────────────────────────────────────────── */}
      <Dialog
        open={editingNote !== null}
        onOpenChange={(v) => !v && setEditingNote(null)}
      >
        <DialogContent className="max-w-lg bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-display text-foreground flex items-center gap-2">
              <Edit3 className="h-4 w-4 text-primary" />
              Edit Note
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-xs text-muted-foreground">Title *</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-1 bg-secondary/50 border-border"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Content (Markdown)
              </Label>
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="mt-1 bg-secondary/50 border-border min-h-[120px] font-mono text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">
                  Severity
                </Label>
                <Select
                  value={editSeverity}
                  onValueChange={(v) => setEditSeverity(v as Severity)}
                >
                  <SelectTrigger className="mt-1 bg-secondary/50 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">
                  Tags (comma-separated)
                </Label>
                <Input
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="mt-1 bg-secondary/50 border-border"
                />
              </div>
            </div>
            <Button
              onClick={handleUpdate}
              disabled={updateMut.isPending}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
            >
              {updateMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Edit3 className="h-3.5 w-3.5" />
              )}
              {updateMut.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
