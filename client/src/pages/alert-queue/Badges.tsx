import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  Ticket,
  ExternalLink,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

// ── Severity helpers ────────────────────────────────────────────────────────

export function severityColor(level: number): string {
  if (level >= 12) return "text-red-400 bg-red-500/10 border-red-500/20";
  if (level >= 8) return "text-orange-400 bg-orange-500/10 border-orange-500/20";
  if (level >= 4) return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
  return "text-blue-400 bg-blue-500/10 border-blue-500/20";
}

export function severityLabel(level: number): string {
  if (level >= 12) return "Critical";
  if (level >= 8) return "High";
  if (level >= 4) return "Medium";
  return "Low";
}

// ── Status badge ────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: typeof Clock; color: string; label: string }> = {
    queued: { icon: Clock, color: "text-amber-400 bg-amber-500/10 border-amber-500/20", label: "Queued" },
    processing: { icon: Loader2, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20", label: "Analyzing" },
    completed: { icon: CheckCircle2, color: "text-green-400 bg-green-500/10 border-green-500/20", label: "Completed" },
    failed: { icon: XCircle, color: "text-red-400 bg-red-500/10 border-red-500/20", label: "Failed" },
    dismissed: { icon: Trash2, color: "text-muted-foreground bg-white/5 border-white/10", label: "Dismissed" },
  };

  const c = config[status] ?? config.queued;
  const Icon = c.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-mono ${c.color}`}>
      <Icon className={`h-2.5 w-2.5 ${status === "processing" ? "animate-spin" : ""}`} />
      {c.label}
    </span>
  );
}

// ── Pipeline triage badges ──────────────────────────────────────────────────

const ROUTE_BADGE_COLORS: Record<string, { label: string; color: string }> = {
  A_DUPLICATE_NOISY: { label: "Duplicate/Noisy", color: "text-gray-400 bg-gray-500/10 border-gray-500/20" },
  B_LOW_CONFIDENCE: { label: "Low Confidence", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  C_HIGH_CONFIDENCE: { label: "High Confidence", color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  D_LIKELY_BENIGN: { label: "Likely Benign", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
};

const SEVERITY_BADGE_COLORS: Record<string, string> = {
  critical: "text-red-400 bg-red-500/15 border-red-500/30",
  high: "text-orange-400 bg-orange-500/15 border-orange-500/30",
  medium: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30",
  low: "text-blue-400 bg-blue-500/15 border-blue-500/30",
  info: "text-gray-400 bg-gray-500/15 border-gray-500/30",
};

export function TriageRouteBadge({ route }: { route: string }) {
  const r = ROUTE_BADGE_COLORS[route] ?? ROUTE_BADGE_COLORS.B_LOW_CONFIDENCE;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${r.color}`}>
      {r.label}
    </span>
  );
}

export function TriageSeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${SEVERITY_BADGE_COLORS[severity] ?? ""}`}>
      {severity}
    </span>
  );
}

// ── Splunk ticket link ──────────────────────────────────────────────────────

export function SplunkTicketLink({ ticketId }: { ticketId: string }) {
  const splunkBaseUrl = trpc.splunk.getSplunkBaseUrl.useQuery(undefined, { staleTime: 60_000 });

  const url = splunkBaseUrl.data?.incidentReviewUrl
    ? `${splunkBaseUrl.data.incidentReviewUrl}?search=${encodeURIComponent(`ticket_id="${ticketId}"`)}`
    : null;

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-mono hover:bg-emerald-500/20 hover:text-emerald-200 transition-all group"
        title="Open in Splunk ES Mission Control"
      >
        <Ticket className="h-3 w-3" />
        {ticketId}
        <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
      </a>
    );
  }

  return (
    <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-mono">
      <Ticket className="h-3 w-3" />
      {ticketId}
    </span>
  );
}
