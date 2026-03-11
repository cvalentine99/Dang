/**
 * AddNoteDialog — Inline note creation dialog for annotating entities.
 * Can be triggered from Alerts Timeline, Vulnerabilities, Fleet Command, etc.
 * Uses the notes v2 API with entity linking.
 */
import { useState } from "react";
import { StickyNote, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { toast } from "sonner";

type Severity = "critical" | "high" | "medium" | "low" | "info";
type EntityType = "alert" | "agent" | "cve" | "rule" | "general";

interface AddNoteDialogProps {
  /** Pre-filled entity type */
  entityType: EntityType;
  /** Pre-filled entity ID */
  entityId?: string;
  /** Pre-filled title */
  defaultTitle?: string;
  /** Pre-filled severity */
  defaultSeverity?: Severity;
  /** Compact trigger (icon only) */
  compact?: boolean;
  /** Trigger label */
  triggerLabel?: string;
  /** Callback after successful creation */
  onCreated?: () => void;
}

export function AddNoteDialog({
  entityType,
  entityId = "",
  defaultTitle = "",
  defaultSeverity = "info",
  compact = false,
  triggerLabel = "Add Note",
  onCreated,
}: AddNoteDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [content, setContent] = useState("");
  const [severity, setSeverity] = useState<Severity>(defaultSeverity);
  const [tags, setTags] = useState("");
  const utils = trpc.useUtils();

  const createMut = trpc.notes.create.useMutation({
    onSuccess: () => {
      utils.notes.list.invalidate();
      utils.notes.entityCounts.invalidate();
      if (entityId) {
        utils.notes.byEntity.invalidate({ entityType, entityId });
      }
      setOpen(false);
      resetForm();
      toast.success("Note created");
      onCreated?.();
    },
    onError: (err) => toast.error(err.message),
  });

  const resetForm = () => {
    setTitle(defaultTitle);
    setContent("");
    setSeverity(defaultSeverity);
    setTags("");
  };

  const handleCreate = () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    createMut.mutate({
      entityType,
      entityId,
      title: title.trim(),
      content,
      severity,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
  };

  const entityLabel =
    entityType === "alert"
      ? "Alert"
      : entityType === "agent"
        ? "Agent"
        : entityType === "cve"
          ? "CVE"
          : entityType === "rule"
            ? "Rule"
            : "General";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setTitle(defaultTitle);
          setSeverity(defaultSeverity);
        }
      }}
    >
      <DialogTrigger asChild>
        {compact ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0 bg-transparent border-glass-border hover:bg-primary/10 hover:border-primary/40 text-muted-foreground hover:text-foreground"
            title={triggerLabel}
          >
            <StickyNote className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 bg-transparent border-glass-border hover:bg-primary/10 hover:border-primary/40 text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="text-xs">{triggerLabel}</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-foreground flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-primary" />
            Annotate {entityLabel}
            {entityId && (
              <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
                {entityId}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-xs text-muted-foreground">Title *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Investigation summary..."
              className="mt-1 bg-secondary/50 border-border"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              Content (Markdown)
            </Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Detailed investigation notes..."
              className="mt-1 bg-secondary/50 border-border min-h-[120px] font-mono text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Severity</Label>
              <Select
                value={severity}
                onValueChange={(v) => setSeverity(v as Severity)}
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
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="incident, phishing, ..."
                className="mt-1 bg-secondary/50 border-border"
              />
            </div>
          </div>
          <Button
            onClick={handleCreate}
            disabled={createMut.isPending}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
          >
            {createMut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <StickyNote className="h-3.5 w-3.5" />
            )}
            {createMut.isPending ? "Creating..." : "Create Note"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * NoteCountBadge — Shows a small badge with the number of notes for an entity.
 * Returns null if count is 0.
 */
export function NoteCountBadge({
  entityType,
  entityId,
}: {
  entityType: EntityType;
  entityId: string;
}) {
  const notesQ = trpc.notes.byEntity.useQuery(
    { entityType, entityId },
    { staleTime: 30_000, enabled: !!entityId }
  );

  const count = notesQ.data?.length ?? 0;
  if (count === 0) return null;

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono
        bg-primary/15 border border-primary/25 text-primary"
      title={`${count} analyst note${count > 1 ? "s" : ""}`}
    >
      <StickyNote className="h-2.5 w-2.5" />
      {count}
    </span>
  );
}
