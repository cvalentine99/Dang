/**
 * Auto-Queue Rules — admin page for configuring automatic alert-to-queue routing.
 *
 * Rules define conditions (severity threshold, rule IDs, agent patterns, MITRE techniques)
 * that automatically enqueue matching Wazuh alerts for structured triage.
 *
 * Features:
 * - CRUD for auto-queue rules
 * - Enable/disable individual rules
 * - Rate limiting per rule (max per hour)
 * - Polling engine status indicator
 * - Manual poll trigger for testing
 */

import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import {
  Zap,
  Plus,
  Trash2,
  Edit2,
  Power,
  PowerOff,
  Activity,
  Clock,
  AlertTriangle,
  Shield,
  Target,
  Server,
  RefreshCw,
  Settings,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";

function severityLabel(level: number): string {
  if (level >= 12) return "Critical";
  if (level >= 8) return "High";
  if (level >= 4) return "Medium";
  return "Low";
}

function severityColor(level: number): string {
  if (level >= 12) return "text-red-400";
  if (level >= 8) return "text-orange-400";
  if (level >= 4) return "text-yellow-400";
  return "text-blue-400";
}

interface RuleFormData {
  name: string;
  minSeverity: number | null;
  ruleIds: string;
  agentPattern: string;
  mitreTechniqueIds: string;
  maxPerHour: number;
  enabled: boolean;
}

const DEFAULT_FORM: RuleFormData = {
  name: "",
  minSeverity: null,
  ruleIds: "",
  agentPattern: "",
  mitreTechniqueIds: "",
  maxPerHour: 10,
  enabled: true,
};

function RuleForm({
  initial,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel,
}: {
  initial: RuleFormData;
  onSubmit: (data: RuleFormData) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  submitLabel: string;
}) {
  const [form, setForm] = useState<RuleFormData>(initial);

  return (
    <div className="glass-panel p-5 space-y-4">
      {/* Rule Name */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">Rule Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g., Critical Alerts Auto-Triage"
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Min Severity */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Minimum Severity Level (0–15)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={15}
              value={form.minSeverity ?? ""}
              onChange={(e) =>
                setForm({ ...form, minSeverity: e.target.value ? parseInt(e.target.value) : null })
              }
              placeholder="Any"
              className="w-24 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 font-mono"
            />
            {form.minSeverity != null && (
              <span className={`text-xs font-medium ${severityColor(form.minSeverity)}`}>
                {severityLabel(form.minSeverity)}+
              </span>
            )}
          </div>
        </div>

        {/* Max Per Hour */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Rate Limit (max per hour)
          </label>
          <input
            type="number"
            min={1}
            max={100}
            value={form.maxPerHour}
            onChange={(e) => setForm({ ...form, maxPerHour: parseInt(e.target.value) || 10 })}
            className="w-24 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>
      </div>

      {/* Rule IDs */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Wazuh Rule IDs (comma-separated, leave empty for any)
        </label>
        <input
          type="text"
          value={form.ruleIds}
          onChange={(e) => setForm({ ...form, ruleIds: e.target.value })}
          placeholder="e.g., 5710, 5711, 31101"
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-foreground font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
      </div>

      {/* Agent Pattern */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          Agent Pattern (supports * wildcard, leave empty for any)
        </label>
        <input
          type="text"
          value={form.agentPattern}
          onChange={(e) => setForm({ ...form, agentPattern: e.target.value })}
          placeholder="e.g., web-server-*, 001, prod-*"
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-foreground font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
      </div>

      {/* MITRE Technique IDs */}
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1.5">
          MITRE ATT&CK Technique IDs (comma-separated, leave empty for any)
        </label>
        <input
          type="text"
          value={form.mitreTechniqueIds}
          onChange={(e) => setForm({ ...form, mitreTechniqueIds: e.target.value })}
          placeholder="e.g., T1059, T1053.005, T1078"
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-foreground font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
      </div>

      {/* Enabled toggle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setForm({ ...form, enabled: !form.enabled })}
          className={`relative w-10 h-5 rounded-full transition-colors ${
            form.enabled ? "bg-emerald-500/40" : "bg-white/10"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform ${
              form.enabled ? "translate-x-5 bg-emerald-400" : "translate-x-0 bg-white/40"
            }`}
          />
        </button>
        <span className="text-xs text-muted-foreground">
          {form.enabled ? "Rule enabled — will auto-queue matching alerts" : "Rule disabled"}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={() => onSubmit(form)}
          disabled={isSubmitting || !form.name.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary/20 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/30 transition-all disabled:opacity-50"
        >
          {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {submitLabel}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-muted-foreground text-sm hover:bg-white/10 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function AutoQueueRules() {
  const rulesQuery = trpc.autoQueue.list.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const createMutation = trpc.autoQueue.create.useMutation({
    onSuccess: () => {
      toast.success("Auto-queue rule created");
      rulesQuery.refetch();
      setShowCreate(false);
    },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.autoQueue.update.useMutation({
    onSuccess: () => {
      toast.success("Rule updated");
      rulesQuery.refetch();
      setEditingId(null);
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.autoQueue.delete.useMutation({
    onSuccess: () => {
      toast.success("Rule deleted");
      rulesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });
  const triggerPollMutation = trpc.autoQueue.triggerPoll.useMutation({
    onSuccess: (result) => {
      toast.success(`Poll complete: ${result.matched} matched, ${result.queued} queued, ${result.skipped} skipped`);
      rulesQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedRules, setExpandedRules] = useState<Set<number>>(new Set());

  const rules = rulesQuery.data?.rules ?? [];
  const pollingActive = rulesQuery.data?.pollingActive ?? false;
  const lastPollTime = rulesQuery.data?.lastPollTime;
  const lastPollResult = rulesQuery.data?.lastPollResult;

  const toggleExpand = (id: number) => {
    setExpandedRules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleEnabled = (rule: { id: number; enabled: number }) => {
    updateMutation.mutate({ id: rule.id, enabled: rule.enabled === 0 });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex-none p-6 pb-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center amethyst-glow">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-display font-semibold tracking-tight text-foreground">
                Auto-Queue Rules
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically route matching Wazuh alerts to the queue for structured triage
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Polling status indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
              <div className={`h-2 w-2 rounded-full ${pollingActive ? "bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400/50 animate-pulse" : "bg-white/20"}`} />
              <span className="text-xs text-muted-foreground">
                {pollingActive ? "Polling active (60s)" : "Polling stopped"}
              </span>
            </div>

            {/* Manual poll trigger */}
            <button
              onClick={() => triggerPollMutation.mutate()}
              disabled={triggerPollMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-xs font-medium hover:bg-cyan-500/20 transition-all disabled:opacity-50"
              title="Manually trigger a poll cycle (for testing)"
            >
              {triggerPollMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Test Poll
            </button>

            {/* Create new rule */}
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/20 border border-primary/30 text-primary text-xs font-medium hover:bg-primary/30 transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              New Rule
            </button>
          </div>
        </div>

        {/* Last poll result */}
        {lastPollResult && lastPollTime && (
          <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last poll: {new Date(lastPollTime).toLocaleTimeString()}
            </span>
            <span className="flex items-center gap-1">
              <Activity className="h-3 w-3" />
              {lastPollResult.matched} matched
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              {lastPollResult.queued} queued
            </span>
            {lastPollResult.skipped > 0 && (
              <span className="flex items-center gap-1">
                <XCircle className="h-3 w-3 text-amber-400" />
                {lastPollResult.skipped} skipped
              </span>
            )}
            {lastPollResult.errors.length > 0 && (
              <span className="flex items-center gap-1 text-red-400">
                <AlertTriangle className="h-3 w-3" />
                {lastPollResult.errors.length} error(s)
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Create form */}
        {showCreate && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">Create New Rule</h3>
            <RuleForm
              initial={DEFAULT_FORM}
              onSubmit={(data) =>
                createMutation.mutate({
                  name: data.name,
                  minSeverity: data.minSeverity,
                  ruleIds: data.ruleIds || null,
                  agentPattern: data.agentPattern || null,
                  mitreTechniqueIds: data.mitreTechniqueIds || null,
                  maxPerHour: data.maxPerHour,
                  enabled: data.enabled,
                })
              }
              onCancel={() => setShowCreate(false)}
              isSubmitting={createMutation.isPending}
              submitLabel="Create Rule"
            />
          </div>
        )}

        {/* Rules list */}
        {rules.length === 0 && !showCreate ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Zap className="h-8 w-8 text-primary/40" />
            </div>
            <h3 className="text-lg font-display font-medium text-foreground mb-2">No Auto-Queue Rules</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Create rules to automatically route matching Wazuh alerts to the queue for structured triage.
              Rules can match by severity level, rule ID, agent name, or MITRE technique.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary/20 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/30 transition-all"
            >
              <Plus className="h-4 w-4" />
              Create First Rule
            </button>
          </div>
        ) : (
          rules.map((rule) => {
            const isExpanded = expandedRules.has(rule.id);
            const isEditing = editingId === rule.id;

            return (
              <div key={rule.id} className="glass-panel overflow-hidden">
                {/* Rule header */}
                <div className="flex items-center gap-3 p-4">
                  <button
                    onClick={() => toggleExpand(rule.id)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>

                  {/* Enable/disable toggle */}
                  <button
                    onClick={() => handleToggleEnabled(rule)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${
                      rule.enabled
                        ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20"
                        : "bg-white/5 border border-white/10 text-muted-foreground hover:bg-white/10"
                    }`}
                  >
                    {rule.enabled ? <Power className="h-3 w-3" /> : <PowerOff className="h-3 w-3" />}
                    {rule.enabled ? "ON" : "OFF"}
                  </button>

                  {/* Rule name */}
                  <span className="text-sm font-medium text-foreground flex-1">{rule.name}</span>

                  {/* Condition badges */}
                  <div className="flex items-center gap-2">
                    {rule.minSeverity != null && (
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono ${severityColor(rule.minSeverity)} bg-white/5 border border-white/10`}>
                        <AlertTriangle className="h-2.5 w-2.5" />
                        ≥{rule.minSeverity}
                      </span>
                    )}
                    {rule.ruleIds && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/20">
                        <Shield className="h-2.5 w-2.5" />
                        {rule.ruleIds.split(",").length} rules
                      </span>
                    )}
                    {rule.agentPattern && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-purple-300 bg-purple-500/10 border border-purple-500/20">
                        <Server className="h-2.5 w-2.5" />
                        {rule.agentPattern}
                      </span>
                    )}
                    {rule.mitreTechniqueIds && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/20">
                        <Target className="h-2.5 w-2.5" />
                        {rule.mitreTechniqueIds.split(",").length} techniques
                      </span>
                    )}
                  </div>

                  {/* Rate limit */}
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {rule.currentHourCount}/{rule.maxPerHour}/hr
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditingId(isEditing ? null : rule.id)}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all"
                      title="Edit rule"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete rule "${rule.name}"?`)) {
                          deleteMutation.mutate({ id: rule.id });
                        }
                      }}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-all"
                      title="Delete rule"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded details / edit form */}
                {isExpanded && !isEditing && (
                  <div className="px-4 pb-4 pt-0 border-t border-white/5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">Min Severity</span>
                        <div className="font-mono mt-0.5">
                          {rule.minSeverity != null ? (
                            <span className={severityColor(rule.minSeverity)}>
                              Level {rule.minSeverity}+ ({severityLabel(rule.minSeverity)})
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">Any</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Rule IDs</span>
                        <div className="font-mono mt-0.5">{rule.ruleIds || <span className="text-muted-foreground/50">Any</span>}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Agent Pattern</span>
                        <div className="font-mono mt-0.5">{rule.agentPattern || <span className="text-muted-foreground/50">Any</span>}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">MITRE Techniques</span>
                        <div className="font-mono mt-0.5">{rule.mitreTechniqueIds || <span className="text-muted-foreground/50">Any</span>}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground border-t border-white/5 pt-3">
                      <span>Created: {new Date(rule.createdAt).toLocaleString()}</span>
                      <span>Updated: {new Date(rule.updatedAt).toLocaleString()}</span>
                      <span>Rate: {rule.currentHourCount}/{rule.maxPerHour} this hour</span>
                    </div>
                  </div>
                )}

                {isEditing && (
                  <div className="px-4 pb-4 pt-2 border-t border-white/5">
                    <RuleForm
                      initial={{
                        name: rule.name,
                        minSeverity: rule.minSeverity,
                        ruleIds: rule.ruleIds ?? "",
                        agentPattern: rule.agentPattern ?? "",
                        mitreTechniqueIds: rule.mitreTechniqueIds ?? "",
                        maxPerHour: rule.maxPerHour,
                        enabled: rule.enabled === 1,
                      }}
                      onSubmit={(data) =>
                        updateMutation.mutate({
                          id: rule.id,
                          name: data.name,
                          minSeverity: data.minSeverity,
                          ruleIds: data.ruleIds || null,
                          agentPattern: data.agentPattern || null,
                          mitreTechniqueIds: data.mitreTechniqueIds || null,
                          maxPerHour: data.maxPerHour,
                          enabled: data.enabled,
                        })
                      }
                      onCancel={() => setEditingId(null)}
                      isSubmitting={updateMutation.isPending}
                      submitLabel="Save Changes"
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
