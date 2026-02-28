/**
 * Response Actions — first-class, structured, queryable, stateful, auditable.
 *
 * This page shows all response actions proposed by the pipeline or analysts,
 * with full approval workflow, filtering, statistics, and audit trail.
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { GlassPanel, StatCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Clock,
  CheckCircle2,
  XCircle,
  PauseCircle,
  Play,
  ChevronDown,
  ChevronUp,
  Filter,
  RotateCcw,
  AlertTriangle,
  Zap,
  Shield,
  Ban,
  UserX,
  Eye,
  FileText,
  Bell,
  Wrench,
  ListPlus,
  Search,
  History,
  BarChart3,
  ArrowUpDown,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

// ── Category Config ──────────────────────────────────────────────────────────
const CATEGORY_CONFIG: Record<string, { icon: LucideIcon; label: string; color: string; guidance: string }> = {
  isolate_host: { icon: Ban, label: "Isolate Host", color: "text-red-400", guidance: "Network-isolate the target host to contain lateral movement. Requires EDR/firewall integration." },
  disable_account: { icon: UserX, label: "Disable Account", color: "text-orange-400", guidance: "Disable the compromised account in Active Directory/IAM to prevent further access." },
  block_ioc: { icon: ShieldX, label: "Block IOC", color: "text-red-400", guidance: "Add the IOC (IP/domain/hash) to firewall/proxy blocklists to prevent communication." },
  escalate_ir: { icon: AlertTriangle, label: "Escalate to IR", color: "text-yellow-400", guidance: "Escalate to the Incident Response team for hands-on investigation and containment." },
  suppress_alert: { icon: Bell, label: "Suppress Alert", color: "text-blue-400", guidance: "Suppress this alert rule to reduce noise. Verify it is a confirmed false positive first." },
  tune_rule: { icon: Wrench, label: "Tune Rule", color: "text-violet-400", guidance: "Adjust detection rule thresholds or conditions to improve signal-to-noise ratio." },
  add_watchlist: { icon: Eye, label: "Add to Watchlist", color: "text-cyan-400", guidance: "Add the entity to a monitoring watchlist for enhanced visibility without blocking." },
  collect_evidence: { icon: Search, label: "Collect Evidence", color: "text-emerald-400", guidance: "Collect forensic artifacts (logs, memory dumps, disk images) for analysis." },
  notify_stakeholder: { icon: Bell, label: "Notify Stakeholder", color: "text-amber-400", guidance: "Notify relevant stakeholders (management, legal, compliance) about the incident." },
  custom: { icon: Zap, label: "Custom Action", color: "text-violet-300", guidance: "Custom response action. Review the description for specific instructions." },
};

const STATE_CONFIG: Record<string, { icon: LucideIcon; color: string; bg: string; label: string }> = {
  proposed: { icon: Clock, color: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/30", label: "Proposed" },
  approved: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/30", label: "Approved" },
  rejected: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/15 border-red-500/30", label: "Rejected" },
  executed: { icon: Play, color: "text-blue-400", bg: "bg-blue-500/15 border-blue-500/30", label: "Executed" },
  deferred: { icon: PauseCircle, color: "text-yellow-400", bg: "bg-yellow-500/15 border-yellow-500/30", label: "Deferred" },
};

const URGENCY_CONFIG: Record<string, { color: string; label: string; dot: string }> = {
  immediate: { color: "text-red-400", label: "Immediate", dot: "bg-red-400" },
  next: { color: "text-amber-400", label: "Next", dot: "bg-amber-400" },
  scheduled: { color: "text-blue-400", label: "Scheduled", dot: "bg-blue-400" },
  optional: { color: "text-muted-foreground/60", label: "Optional", dot: "bg-muted-foreground/40" },
};

type FilterState = {
  state?: string;
  category?: string;
  urgency?: string;
  requiresApproval?: boolean;
};

type ViewMode = "queue" | "stats" | "audit";

export default function ResponseActions() {

  const [viewMode, setViewMode] = useState<ViewMode>("queue");
  const [filters, setFilters] = useState<FilterState>({});
  const [showFilters, setShowFilters] = useState(false);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [deferReason, setDeferReason] = useState("");
  const [showRejectFor, setShowRejectFor] = useState<string | null>(null);
  const [showDeferFor, setShowDeferFor] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 25;

  // ── Queries ──────────────────────────────────────────────────────────────
  const actionsQ = trpc.responseActions.listAll.useQuery({
    limit: pageSize,
    offset: page * pageSize,
    state: filters.state as any,
    category: filters.category as any,
    urgency: filters.urgency as any,
    requiresApproval: filters.requiresApproval,
  }, { staleTime: 10_000 });

  const pendingQ = trpc.responseActions.pendingApproval.useQuery(undefined, { staleTime: 10_000 });
  const statsQ = trpc.responseActions.stats.useQuery(undefined, { staleTime: 30_000 });

  // ── Mutations ────────────────────────────────────────────────────────────
  const utils = trpc.useUtils();
  const invalidateAll = () => {
    utils.responseActions.listAll.invalidate();
    utils.responseActions.pendingApproval.invalidate();
    utils.responseActions.stats.invalidate();
  };

  const approveMut = trpc.responseActions.approve.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Action approved");
        invalidateAll();
      } else {
        toast.error(data.error ?? "Approval failed");
      }
    },
  });

  const rejectMut = trpc.responseActions.reject.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Action rejected");
        invalidateAll();
        setShowRejectFor(null);
        setRejectReason("");
      } else {
        toast.error(data.error ?? "Rejection failed");
      }
    },
  });

  const executeMut = trpc.responseActions.execute.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Action marked as executed");
        invalidateAll();
      } else {
        toast.error(data.error ?? "Execution failed");
      }
    },
  });

  const deferMut = trpc.responseActions.defer.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Action deferred");
        invalidateAll();
        setShowDeferFor(null);
        setDeferReason("");
      } else {
        toast.error(data.error ?? "Deferral failed");
      }
    },
  });

  const reproposeMut = trpc.responseActions.repropose.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("Action re-proposed");
        invalidateAll();
      } else {
        toast.error(data.error ?? "Re-propose failed");
      }
    },
  });

  const bulkApproveMut = trpc.responseActions.bulkApprove.useMutation({
    onSuccess: (data) => {
      toast.success(`Bulk approve: ${data.approved} approved, ${data.failed} failed`);
      invalidateAll();
    },
  });

  // ── Derived ──────────────────────────────────────────────────────────────
  const actions = actionsQ.data?.actions ?? [];
  const totalActions = actionsQ.data?.total ?? 0;
  const totalPages = Math.ceil(totalActions / pageSize);
  const pendingActions = pendingQ.data?.actions ?? [];
  const stats = statsQ.data;

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (filters.state) c++;
    if (filters.category) c++;
    if (filters.urgency) c++;
    if (filters.requiresApproval !== undefined) c++;
    return c;
  }, [filters]);

  return (
    <div className="space-y-6 max-w-[2400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight flex items-center gap-3">
            <ShieldAlert className="h-7 w-7 text-violet-400" />
            Response Actions
          </h1>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Structured, queryable, stateful, auditable response workflow
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode tabs */}
          {(["queue", "stats", "audit"] as ViewMode[]).map((mode) => {
            const icons: Record<ViewMode, LucideIcon> = { queue: ShieldAlert, stats: BarChart3, audit: History };
            const labels: Record<ViewMode, string> = { queue: "Queue", stats: "Statistics", audit: "Audit Log" };
            const Icon = icons[mode];
            return (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  viewMode === mode
                    ? "bg-violet-500/20 border border-violet-500/40 text-violet-300"
                    : "bg-white/[0.03] border border-white/[0.06] text-muted-foreground/60 hover:bg-white/[0.06]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {labels[mode]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <StatCard
          icon={ShieldAlert}
          label="Total Actions"
          value={stats?.total ?? 0}
        />
        <StatCard
          icon={Clock}
          label="Pending Approval"
          value={stats?.pendingApproval ?? 0}
          colorClass={stats?.pendingApproval ? "text-amber-400" : undefined}
        />
        <StatCard
          icon={CheckCircle2}
          label="Approved"
          value={stats?.byState?.approved ?? 0}
          colorClass="text-emerald-400"
        />
        <StatCard
          icon={Play}
          label="Executed"
          value={stats?.byState?.executed ?? 0}
          colorClass="text-blue-400"
        />
        <StatCard
          icon={XCircle}
          label="Rejected"
          value={stats?.byState?.rejected ?? 0}
          colorClass="text-red-400"
        />
        <StatCard
          icon={PauseCircle}
          label="Deferred"
          value={stats?.byState?.deferred ?? 0}
          colorClass="text-yellow-400"
        />
      </div>

      {/* Pending Approval Banner */}
      {pendingActions.length > 0 && viewMode === "queue" && (
        <GlassPanel className="p-4 border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/15">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-300">
                  {pendingActions.length} action{pendingActions.length !== 1 ? "s" : ""} awaiting approval
                </p>
                <p className="text-xs text-muted-foreground/50">
                  {pendingActions.filter(a => a.urgency === "immediate").length} immediate priority
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-500/30 text-amber-300 hover:bg-amber-500/15"
              onClick={() => {
                const ids = pendingActions.map(a => a.actionId);
                bulkApproveMut.mutate({ actionIds: ids });
              }}
              disabled={bulkApproveMut.isPending}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Approve All
            </Button>
          </div>
        </GlassPanel>
      )}

      {/* Queue View */}
      {viewMode === "queue" && (
        <>
          {/* Filter Bar */}
          <GlassPanel className="p-3">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 text-xs text-muted-foreground/60 hover:text-foreground/80 transition-colors"
              >
                <Filter className="h-3.5 w-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 text-[10px] font-mono">
                    {activeFilterCount}
                  </span>
                )}
                {showFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              <div className="flex items-center gap-2 text-xs text-muted-foreground/40">
                <span>{totalActions} total</span>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => { setFilters({}); setPage(0); }}
                    className="flex items-center gap-1 text-violet-400 hover:text-violet-300"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Clear
                  </button>
                )}
              </div>
            </div>

            {showFilters && (
              <div className="mt-3 pt-3 border-t border-white/[0.06] grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* State filter */}
                <div>
                  <label className="text-[10px] text-muted-foreground/40 mb-1 block">State</label>
                  <select
                    value={filters.state ?? ""}
                    onChange={(e) => { setFilters(f => ({ ...f, state: e.target.value || undefined })); setPage(0); }}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1.5 text-xs text-foreground/80"
                  >
                    <option value="">All States</option>
                    {Object.entries(STATE_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                {/* Category filter */}
                <div>
                  <label className="text-[10px] text-muted-foreground/40 mb-1 block">Category</label>
                  <select
                    value={filters.category ?? ""}
                    onChange={(e) => { setFilters(f => ({ ...f, category: e.target.value || undefined })); setPage(0); }}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1.5 text-xs text-foreground/80"
                  >
                    <option value="">All Categories</option>
                    {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                {/* Urgency filter */}
                <div>
                  <label className="text-[10px] text-muted-foreground/40 mb-1 block">Urgency</label>
                  <select
                    value={filters.urgency ?? ""}
                    onChange={(e) => { setFilters(f => ({ ...f, urgency: e.target.value || undefined })); setPage(0); }}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1.5 text-xs text-foreground/80"
                  >
                    <option value="">All Urgency</option>
                    {Object.entries(URGENCY_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                {/* Approval required filter */}
                <div>
                  <label className="text-[10px] text-muted-foreground/40 mb-1 block">Approval Required</label>
                  <select
                    value={filters.requiresApproval === undefined ? "" : filters.requiresApproval ? "yes" : "no"}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFilters(f => ({
                        ...f,
                        requiresApproval: v === "" ? undefined : v === "yes",
                      }));
                      setPage(0);
                    }}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1.5 text-xs text-foreground/80"
                  >
                    <option value="">All</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
              </div>
            )}
          </GlassPanel>

          {/* Action Cards */}
          <div className="space-y-3">
            {actionsQ.isLoading ? (
              <GlassPanel className="p-8 text-center">
                <div className="animate-pulse text-muted-foreground/40 text-sm">Loading response actions...</div>
              </GlassPanel>
            ) : actions.length === 0 ? (
              <GlassPanel className="p-8 text-center">
                <ShieldCheck className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground/40">No response actions found</p>
                <p className="text-xs text-muted-foreground/30 mt-1">
                  Actions are automatically generated by the pipeline when threats are detected
                </p>
              </GlassPanel>
            ) : (
              actions.map((action) => (
                <ResponseActionCard
                  key={action.id}
                  action={action}
                  isExpanded={expandedAction === action.actionId}
                  onToggle={() => setExpandedAction(expandedAction === action.actionId ? null : action.actionId)}
                  onApprove={() => approveMut.mutate({ actionId: action.actionId })}
                  onReject={(reason) => rejectMut.mutate({ actionId: action.actionId, reason })}
                  onExecute={() => executeMut.mutate({ actionId: action.actionId })}
                  onDefer={(reason) => deferMut.mutate({ actionId: action.actionId, reason })}
                  onRepropose={() => reproposeMut.mutate({ actionId: action.actionId })}
                  showReject={showRejectFor === action.actionId}
                  onShowReject={() => setShowRejectFor(showRejectFor === action.actionId ? null : action.actionId)}
                  showDefer={showDeferFor === action.actionId}
                  onShowDefer={() => setShowDeferFor(showDeferFor === action.actionId ? null : action.actionId)}
                  rejectReason={rejectReason}
                  onRejectReasonChange={setRejectReason}
                  deferReason={deferReason}
                  onDeferReasonChange={setDeferReason}
                  isPending={approveMut.isPending || rejectMut.isPending || executeMut.isPending || deferMut.isPending || reproposeMut.isPending}
                />
              ))
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground/40">
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 rounded bg-white/[0.04] text-xs text-foreground/60 hover:bg-white/[0.08] disabled:opacity-30 transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1 rounded bg-white/[0.04] text-xs text-foreground/60 hover:bg-white/[0.08] disabled:opacity-30 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Stats View */}
      {viewMode === "stats" && stats && <StatsView stats={stats} />}

      {/* Audit Log View */}
      {viewMode === "audit" && <AuditLogView />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Response Action Card
// ═══════════════════════════════════════════════════════════════════════════════

function ResponseActionCard({
  action,
  isExpanded,
  onToggle,
  onApprove,
  onReject,
  onExecute,
  onDefer,
  onRepropose,
  showReject,
  onShowReject,
  showDefer,
  onShowDefer,
  rejectReason,
  onRejectReasonChange,
  deferReason,
  onDeferReasonChange,
  isPending,
}: {
  action: any;
  isExpanded: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onExecute: () => void;
  onDefer: (reason: string) => void;
  onRepropose: () => void;
  showReject: boolean;
  onShowReject: () => void;
  showDefer: boolean;
  onShowDefer: () => void;
  rejectReason: string;
  onRejectReasonChange: (v: string) => void;
  deferReason: string;
  onDeferReasonChange: (v: string) => void;
  isPending: boolean;
}) {
  const cat = CATEGORY_CONFIG[action.category] ?? CATEGORY_CONFIG.custom;
  const state = STATE_CONFIG[action.state] ?? STATE_CONFIG.proposed;
  const urgency = URGENCY_CONFIG[action.urgency] ?? URGENCY_CONFIG.next;
  const CatIcon = cat.icon;
  const StateIcon = state.icon;

  return (
    <GlassPanel className={`p-0 overflow-hidden transition-all ${
      action.urgency === "immediate" && action.state === "proposed"
        ? "border-red-500/30 ring-1 ring-red-500/10"
        : "border-white/[0.08]"
    }`}>
      {/* Header Row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        {/* Category Icon */}
        <div className={`p-2 rounded-lg bg-white/[0.04] ${cat.color}`}>
          <CatIcon className="h-4 w-4" />
        </div>

        {/* Title + Meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground/90 truncate">{action.title}</span>
            {action.requiresApproval === 1 && action.state === "proposed" && (
              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[9px] font-mono uppercase tracking-wider">
                Approval Required
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-[10px] text-muted-foreground/40 font-mono">{action.actionId}</span>
            <span className={`text-[10px] ${cat.color}`}>{cat.label}</span>
            {action.targetValue && (
              <span className="text-[10px] text-muted-foreground/50 font-mono truncate max-w-[200px]">
                → {action.targetValue}
              </span>
            )}
          </div>
        </div>

        {/* Urgency */}
        <div className="flex items-center gap-1.5">
          <div className={`h-1.5 w-1.5 rounded-full ${urgency.dot}`} />
          <span className={`text-[10px] font-medium ${urgency.color}`}>{urgency.label}</span>
        </div>

        {/* State Badge */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${state.bg}`}>
          <StateIcon className={`h-3 w-3 ${state.color}`} />
          <span className={`text-[10px] font-medium ${state.color}`}>{state.label}</span>
        </div>

        {/* Expand */}
        <ChevronRight className={`h-4 w-4 text-muted-foreground/30 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
      </button>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-white/[0.06] p-4 space-y-4 bg-white/[0.01]">
          {/* Description */}
          {action.description && (
            <div>
              <label className="text-[10px] text-muted-foreground/40 mb-1 block uppercase tracking-wider">Description</label>
              <p className="text-xs text-foreground/70 leading-relaxed">{action.description}</p>
            </div>
          )}

          {/* Evidence Basis */}
          {action.evidenceBasis && action.evidenceBasis.length > 0 && (
            <div>
              <label className="text-[10px] text-muted-foreground/40 mb-1 block uppercase tracking-wider">Evidence Basis</label>
              <ul className="space-y-1">
                {(action.evidenceBasis as string[]).map((e: string, i: number) => (
                  <li key={i} className="text-xs text-foreground/60 flex items-start gap-2">
                    <span className="text-violet-400 mt-0.5">•</span>
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Target Details */}
          {(action.targetValue || action.targetType) && (
            <div className="grid grid-cols-2 gap-3">
              {action.targetType && (
                <div>
                  <label className="text-[10px] text-muted-foreground/40 mb-1 block uppercase tracking-wider">Target Type</label>
                  <span className="text-xs text-foreground/70 font-mono">{action.targetType}</span>
                </div>
              )}
              {action.targetValue && (
                <div>
                  <label className="text-[10px] text-muted-foreground/40 mb-1 block uppercase tracking-wider">Target Value</label>
                  <span className="text-xs text-foreground/70 font-mono">{action.targetValue}</span>
                </div>
              )}
            </div>
          )}

          {/* Provenance */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground/40 mb-1 block uppercase tracking-wider">Proposed By</label>
              <span className="text-xs text-foreground/70 font-mono">{action.proposedBy}</span>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground/40 mb-1 block uppercase tracking-wider">Proposed At</label>
              <span className="text-xs text-foreground/70">{new Date(action.proposedAt).toLocaleString()}</span>
            </div>
            {action.approvedBy && (
              <div>
                <label className="text-[10px] text-muted-foreground/40 mb-1 block uppercase tracking-wider">Approved By</label>
                <span className="text-xs text-foreground/70 font-mono">{action.approvedBy}</span>
              </div>
            )}
            {action.executedBy && (
              <div>
                <label className="text-[10px] text-muted-foreground/40 mb-1 block uppercase tracking-wider">Executed By</label>
                <span className="text-xs text-foreground/70 font-mono">{action.executedBy}</span>
              </div>
            )}
          </div>

          {/* Decision Reason */}
          {action.decisionReason && (
            <div>
              <label className="text-[10px] text-muted-foreground/40 mb-1 block uppercase tracking-wider">Decision Reason</label>
              <p className="text-xs text-foreground/60 italic">{action.decisionReason}</p>
            </div>
          )}

          {/* Execution Result */}
          {action.executionResult && (
            <div>
              <label className="text-[10px] text-muted-foreground/40 mb-1 block uppercase tracking-wider">Execution Result</label>
              <div className={`text-xs p-2 rounded border ${
                action.executionSuccess ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300" : "border-red-500/20 bg-red-500/5 text-red-300"
              }`}>
                {action.executionResult}
              </div>
            </div>
          )}

          {/* Category Guidance */}
          <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05]">
            <label className="text-[10px] text-muted-foreground/40 mb-1 block uppercase tracking-wider">Action Guidance</label>
            <p className="text-xs text-foreground/50 leading-relaxed">{cat.guidance}</p>
          </div>

          {/* Linked Entities */}
          {((action.linkedAgentIds && action.linkedAgentIds.length > 0) || (action.linkedAlertIds && action.linkedAlertIds.length > 0)) && (
            <div className="grid grid-cols-2 gap-3">
              {action.linkedAgentIds && action.linkedAgentIds.length > 0 && (
                <div>
                  <label className="text-[10px] text-muted-foreground/40 mb-1 block uppercase tracking-wider">Linked Agents</label>
                  <div className="flex flex-wrap gap-1">
                    {(action.linkedAgentIds as string[]).map((id: string) => (
                      <span key={id} className="px-1.5 py-0.5 rounded bg-violet-500/10 border border-violet-500/20 text-violet-300 text-[10px] font-mono">{id}</span>
                    ))}
                  </div>
                </div>
              )}
              {action.linkedAlertIds && action.linkedAlertIds.length > 0 && (
                <div>
                  <label className="text-[10px] text-muted-foreground/40 mb-1 block uppercase tracking-wider">Linked Alerts</label>
                  <div className="flex flex-wrap gap-1">
                    {(action.linkedAlertIds as string[]).slice(0, 10).map((id: string) => (
                      <span key={id} className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-mono truncate max-w-[120px]">{id}</span>
                    ))}
                    {(action.linkedAlertIds as string[]).length > 10 && (
                      <span className="text-[10px] text-muted-foreground/40">+{(action.linkedAlertIds as string[]).length - 10} more</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Lineage Links */}
          <div className="flex items-center gap-4 text-[10px]">
            {action.caseId && (
              <a href={`/living-cases/${action.caseId}`} className="text-violet-400 hover:text-violet-300 hover:underline transition-colors">
                Case #{action.caseId}
              </a>
            )}
            {action.correlationId && (
              <span className="font-mono text-muted-foreground/40" title="Correlation ID">
                Corr: {action.correlationId}
              </span>
            )}
            {action.triageId && (
              <span className="font-mono text-muted-foreground/40" title="Triage ID">
                Triage: {action.triageId}
              </span>
            )}
            {action.playbookRef && (
              <span className="text-cyan-400" title="Playbook Reference">
                Playbook: {action.playbookRef}
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
            {/* Proposed → Approve / Reject / Defer */}
            {action.state === "proposed" && (
              <>
                <button
                  onClick={onApprove}
                  disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium hover:bg-emerald-500/25 transition-all disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approve
                </button>
                <button
                  onClick={onShowReject}
                  disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-medium hover:bg-red-500/25 transition-all disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Reject
                </button>
                <button
                  onClick={onShowDefer}
                  disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 text-xs font-medium hover:bg-yellow-500/25 transition-all disabled:opacity-50"
                >
                  <PauseCircle className="h-3.5 w-3.5" />
                  Defer
                </button>
              </>
            )}

            {/* Approved → Execute / Reject (revoke) */}
            {action.state === "approved" && (
              <>
                <button
                  onClick={onExecute}
                  disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-medium hover:bg-blue-500/25 transition-all disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5" />
                  Mark Executed
                </button>
                <button
                  onClick={onShowReject}
                  disabled={isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-medium hover:bg-red-500/25 transition-all disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Revoke
                </button>
              </>
            )}

            {/* Deferred → Re-propose */}
            {action.state === "deferred" && (
              <button
                onClick={onRepropose}
                disabled={isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-300 text-xs font-medium hover:bg-violet-500/25 transition-all disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Re-propose
              </button>
            )}
          </div>

          {/* Reject Reason Input */}
          {showReject && (
            <div className="flex items-center gap-2 pt-2">
              <input
                type="text"
                placeholder="Reason for rejection (required)..."
                value={rejectReason}
                onChange={(e) => onRejectReasonChange(e.target.value)}
                className="flex-1 bg-white/[0.04] border border-red-500/20 rounded px-3 py-1.5 text-xs text-foreground/80 placeholder:text-muted-foreground/30"
              />
              <button
                onClick={() => onReject(rejectReason)}
                disabled={isPending || !rejectReason.trim()}
                className="px-3 py-1.5 rounded bg-red-500/20 text-red-300 text-xs font-medium hover:bg-red-500/30 disabled:opacity-50"
              >
                Confirm Reject
              </button>
            </div>
          )}

          {/* Defer Reason Input */}
          {showDefer && (
            <div className="flex items-center gap-2 pt-2">
              <input
                type="text"
                placeholder="Reason for deferral (required)..."
                value={deferReason}
                onChange={(e) => onDeferReasonChange(e.target.value)}
                className="flex-1 bg-white/[0.04] border border-yellow-500/20 rounded px-3 py-1.5 text-xs text-foreground/80 placeholder:text-muted-foreground/30"
              />
              <button
                onClick={() => onDefer(deferReason)}
                disabled={isPending || !deferReason.trim()}
                className="px-3 py-1.5 rounded bg-yellow-500/20 text-yellow-300 text-xs font-medium hover:bg-yellow-500/30 disabled:opacity-50"
              >
                Confirm Defer
              </button>
            </div>
          )}

          {/* Inline Audit Trail */}
          <ActionAuditTrail actionId={action.actionId} />
        </div>
      )}
    </GlassPanel>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Inline Audit Trail for a single action
// ═══════════════════════════════════════════════════════════════════════════════

function ActionAuditTrail({ actionId }: { actionId: string }) {
  const [show, setShow] = useState(false);
  const auditQ = trpc.responseActions.auditTrail.useQuery(
    { actionId },
    { enabled: show, staleTime: 15_000 }
  );

  return (
    <div className="pt-2 border-t border-white/[0.04]">
      <button
        onClick={() => setShow(!show)}
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40 hover:text-foreground/60 transition-colors"
      >
        <History className="h-3 w-3" />
        Audit Trail
        {show ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
      </button>

      {show && (
        <div className="mt-2 space-y-1.5">
          {auditQ.isLoading ? (
            <div className="text-[10px] text-muted-foreground/30 animate-pulse">Loading audit trail...</div>
          ) : (auditQ.data?.entries ?? []).length === 0 ? (
            <div className="text-[10px] text-muted-foreground/30">No audit entries</div>
          ) : (
            (auditQ.data?.entries ?? []).map((entry: any) => {
              const toConfig = STATE_CONFIG[entry.toState] ?? STATE_CONFIG.proposed;
              const ToIcon = toConfig.icon;
              return (
                <div key={entry.id} className="flex items-center gap-2 text-[10px]">
                  <span className="text-muted-foreground/30 font-mono w-[140px] shrink-0">
                    {new Date(entry.performedAt).toLocaleString()}
                  </span>
                  <span className="text-muted-foreground/40">{entry.fromState}</span>
                  <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/20" />
                  <ToIcon className={`h-3 w-3 ${toConfig.color}`} />
                  <span className={toConfig.color}>{entry.toState}</span>
                  <span className="text-muted-foreground/30 font-mono">{entry.performedBy}</span>
                  {entry.reason && (
                    <span className="text-muted-foreground/40 italic truncate max-w-[200px]">{entry.reason}</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Stats View
// ═══════════════════════════════════════════════════════════════════════════════

function StatsView({ stats }: { stats: any }) {
  return (
    <div className="space-y-6">
      {/* By State */}
      <GlassPanel className="p-5">
        <h3 className="text-sm font-semibold text-foreground/80 mb-4 flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-violet-400" />
          Actions by State
        </h3>
        <div className="grid grid-cols-5 gap-3">
          {Object.entries(STATE_CONFIG).map(([key, config]) => {
            const Icon = config.icon;
            const count = stats.byState?.[key] ?? 0;
            return (
              <div key={key} className={`p-3 rounded-lg border ${config.bg}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`h-4 w-4 ${config.color}`} />
                  <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                </div>
                <span className="text-2xl font-bold text-foreground/90 font-mono">{count}</span>
              </div>
            );
          })}
        </div>
      </GlassPanel>

      {/* By Category */}
      <GlassPanel className="p-5">
        <h3 className="text-sm font-semibold text-foreground/80 mb-4 flex items-center gap-2">
          <Shield className="h-4 w-4 text-violet-400" />
          Actions by Category
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
            const Icon = config.icon;
            const count = stats.byCategory?.[key] ?? 0;
            if (count === 0) return null;
            return (
              <div key={key} className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`h-4 w-4 ${config.color}`} />
                  <span className="text-xs text-muted-foreground/60">{config.label}</span>
                </div>
                <span className="text-xl font-bold text-foreground/90 font-mono">{count}</span>
              </div>
            );
          })}
        </div>
      </GlassPanel>

      {/* By Urgency */}
      <GlassPanel className="p-5">
        <h3 className="text-sm font-semibold text-foreground/80 mb-4 flex items-center gap-2">
          <Zap className="h-4 w-4 text-violet-400" />
          Actions by Urgency
        </h3>
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(URGENCY_CONFIG).map(([key, config]) => {
            const count = stats.byUrgency?.[key] ?? 0;
            return (
              <div key={key} className="p-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`h-2 w-2 rounded-full ${config.dot}`} />
                  <span className={`text-xs ${config.color}`}>{config.label}</span>
                </div>
                <span className="text-xl font-bold text-foreground/90 font-mono">{count}</span>
              </div>
            );
          })}
        </div>
      </GlassPanel>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Full Audit Log View
// ═══════════════════════════════════════════════════════════════════════════════

function AuditLogView() {
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const auditQ = trpc.responseActions.fullAuditLog.useQuery({
    limit: pageSize,
    offset: page * pageSize,
  }, { staleTime: 15_000 });

  const entries = auditQ.data?.entries ?? [];
  const total = auditQ.data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <GlassPanel className="p-0 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-white/[0.06]">
          <h3 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
            <History className="h-4 w-4 text-violet-400" />
            Full Audit Log
          </h3>
          <p className="text-[10px] text-muted-foreground/40 mt-1">
            Immutable record of every state transition across all response actions
          </p>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/[0.06] text-muted-foreground/40">
                <th className="text-left p-3 font-medium">Timestamp</th>
                <th className="text-left p-3 font-medium">Action ID</th>
                <th className="text-left p-3 font-medium">From</th>
                <th className="text-left p-3 font-medium">To</th>
                <th className="text-left p-3 font-medium">Performed By</th>
                <th className="text-left p-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {auditQ.isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground/30 animate-pulse">
                    Loading audit log...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground/30">
                    No audit entries yet
                  </td>
                </tr>
              ) : (
                entries.map((entry: any) => {
                  const toConfig = STATE_CONFIG[entry.toState] ?? STATE_CONFIG.proposed;
                  const fromConfig = STATE_CONFIG[entry.fromState];
                  const ToIcon = toConfig.icon;
                  return (
                    <tr key={entry.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                      <td className="p-3 font-mono text-muted-foreground/50">
                        {new Date(entry.performedAt).toLocaleString()}
                      </td>
                      <td className="p-3 font-mono text-violet-300/70">{entry.actionIdStr}</td>
                      <td className="p-3">
                        <span className={fromConfig ? fromConfig.color : "text-muted-foreground/40"}>
                          {entry.fromState}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`flex items-center gap-1 ${toConfig.color}`}>
                          <ToIcon className="h-3 w-3" />
                          {entry.toState}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-muted-foreground/50">{entry.performedBy}</td>
                      <td className="p-3 text-muted-foreground/40 max-w-[300px] truncate">
                        {entry.reason || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassPanel>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground/40">
            {total} entries — Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 rounded bg-white/[0.04] text-xs text-foreground/60 hover:bg-white/[0.08] disabled:opacity-30 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 rounded bg-white/[0.04] text-xs text-foreground/60 hover:bg-white/[0.08] disabled:opacity-30 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
