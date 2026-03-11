import { useState } from "react";
import {
  Plus, Shield, ShieldOff, PauseCircle, PlayCircle, Trash2,
} from "lucide-react";
import { GlassPanel } from "./GlassPanel";
import {
  PURPLE, PURPLE_DIM, VIOLET, RED, AMBER, GREEN, MUTED, BORDER, CYAN,
} from "./theme";

interface SuppressionRulesTabProps {
  schedules: Array<{ id: number; name: string }>;
  suppressionListQ: { data?: any; isLoading: boolean };
  createSuppressionMut: { mutate: (args: any) => void; isPending: boolean };
  deactivateSuppressionMut: { mutate: (args: { id: number }) => void; isPending: boolean };
  deleteSuppressionMut: { mutate: (args: { id: number }) => void; isPending: boolean };
}

export function SuppressionRulesTab({
  schedules,
  suppressionListQ,
  createSuppressionMut,
  deactivateSuppressionMut,
  deleteSuppressionMut,
}: SuppressionRulesTabProps): React.JSX.Element {
  const [showCreateRule, setShowCreateRule] = useState(false);
  const [newRule, setNewRule] = useState({
    scheduleId: null as number | null,
    severityFilter: "all" as "all" | "critical" | "high" | "medium",
    durationHours: 4,
    reason: "",
  });

  return (
    <div className="space-y-5">
      {/* Header with Create button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold" style={{ color: "oklch(0.9 0.005 286)" }}>Suppression Rules</h2>
          <p className="text-xs" style={{ color: MUTED }}>Mute anomaly alerts during maintenance windows or known-noisy periods</p>
        </div>
        <button
          onClick={() => setShowCreateRule(true)}
          className="flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-medium transition-colors hover:bg-white/5"
          style={{ borderColor: PURPLE, color: PURPLE }}
        >
          <Plus className="h-3.5 w-3.5" />
          Create Rule
        </button>
      </div>

      {/* Create Rule Form */}
      {showCreateRule && (
        <GlassPanel title="New Suppression Rule" icon={ShieldOff}>
          <div className="px-5 pb-5 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Schedule selector */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: MUTED }}>Target Schedule</label>
                <select
                  value={newRule.scheduleId ?? ""}
                  onChange={(e) => setNewRule({ ...newRule, scheduleId: e.target.value ? Number(e.target.value) : null })}
                  className="w-full rounded-lg border px-3 py-2 text-xs"
                  style={{ background: "oklch(0.12 0.02 286)", borderColor: BORDER, color: "oklch(0.85 0.01 286)" }}
                >
                  <option value="">All Schedules</option>
                  {schedules.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Severity filter */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: MUTED }}>Suppress Severity</label>
                <select
                  value={newRule.severityFilter}
                  onChange={(e) => setNewRule({ ...newRule, severityFilter: e.target.value as any })}
                  className="w-full rounded-lg border px-3 py-2 text-xs"
                  style={{ background: "oklch(0.12 0.02 286)", borderColor: BORDER, color: "oklch(0.85 0.01 286)" }}
                >
                  <option value="all">All Severities</option>
                  <option value="critical">Critical &amp; below</option>
                  <option value="high">High &amp; below</option>
                  <option value="medium">Medium only</option>
                </select>
              </div>

              {/* Duration */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: MUTED }}>Duration (hours)</label>
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={newRule.durationHours}
                  onChange={(e) => setNewRule({ ...newRule, durationHours: Math.max(1, Math.min(720, Number(e.target.value))) })}
                  className="w-full rounded-lg border px-3 py-2 text-xs"
                  style={{ background: "oklch(0.12 0.02 286)", borderColor: BORDER, color: "oklch(0.85 0.01 286)" }}
                />
                <div className="mt-1 flex gap-2">
                  {[1, 4, 8, 24, 72, 168].map((h) => (
                    <button
                      key={h}
                      onClick={() => setNewRule({ ...newRule, durationHours: h })}
                      className="rounded px-2 py-0.5 text-[10px] transition-colors hover:bg-white/10"
                      style={{ color: newRule.durationHours === h ? CYAN : MUTED, background: newRule.durationHours === h ? `${CYAN}15` : "transparent" }}
                    >
                      {h < 24 ? `${h}h` : `${h / 24}d`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: MUTED }}>Reason</label>
                <input
                  type="text"
                  value={newRule.reason}
                  onChange={(e) => setNewRule({ ...newRule, reason: e.target.value })}
                  placeholder="e.g., Scheduled maintenance window"
                  className="w-full rounded-lg border px-3 py-2 text-xs"
                  style={{ background: "oklch(0.12 0.02 286)", borderColor: BORDER, color: "oklch(0.85 0.01 286)" }}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => {
                  if (!newRule.reason.trim()) return;
                  createSuppressionMut.mutate(newRule);
                }}
                disabled={!newRule.reason.trim() || createSuppressionMut.isPending}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-colors disabled:opacity-50"
                style={{ background: PURPLE, color: "oklch(0.98 0.005 285)" }}
              >
                {createSuppressionMut.isPending ? "Creating..." : "Create Rule"}
              </button>
              <button
                onClick={() => setShowCreateRule(false)}
                className="rounded-lg border px-4 py-2 text-xs transition-colors hover:bg-white/5"
                style={{ borderColor: BORDER, color: MUTED }}
              >
                Cancel
              </button>
            </div>
          </div>
        </GlassPanel>
      )}

      {/* Rules List */}
      <GlassPanel title="Active & Expired Rules" icon={Shield}>
        <div className="px-5 pb-5">
          {suppressionListQ.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: PURPLE }} />
            </div>
          ) : (suppressionListQ.data?.rules.length ?? 0) === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center">
              <ShieldOff className="mb-3 h-10 w-10" style={{ color: PURPLE_DIM }} />
              <p className="text-sm" style={{ color: MUTED }}>No suppression rules configured.</p>
              <p className="text-xs mt-1" style={{ color: MUTED }}>Create a rule to mute anomaly alerts during maintenance windows.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {suppressionListQ.data!.rules.map((rule: any) => {
                const isActive = rule.active && !rule.isExpired;
                const sevColor = rule.severityFilter === "critical" ? RED : rule.severityFilter === "high" ? "oklch(0.705 0.191 22.216)" : rule.severityFilter === "medium" ? AMBER : VIOLET;
                return (
                  <div
                    key={rule.id}
                    className="flex items-center gap-4 rounded-lg border px-4 py-3"
                    style={{ borderColor: isActive ? `${PURPLE}40` : BORDER, background: isActive ? "oklch(0.16 0.025 286)" : "oklch(0.13 0.015 286)" }}
                  >
                    {/* Status icon */}
                    <div className="shrink-0">
                      {isActive ? (
                        <PauseCircle className="h-5 w-5" style={{ color: AMBER }} />
                      ) : (
                        <PlayCircle className="h-5 w-5" style={{ color: MUTED }} />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold" style={{ color: isActive ? "oklch(0.9 0.005 286)" : MUTED }}>
                          {rule.scheduleName || "All Schedules"}
                        </span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                          style={{ background: `${sevColor}20`, color: sevColor }}
                        >
                          {rule.severityFilter === "all" ? "all severities" : `≤ ${rule.severityFilter}`}
                        </span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ background: isActive ? `${GREEN}15` : `${RED}15`, color: isActive ? GREEN : RED }}
                        >
                          {isActive ? "Active" : rule.isExpired ? "Expired" : "Deactivated"}
                        </span>
                      </div>
                      <div className="text-xs" style={{ color: MUTED }}>
                        {rule.reason}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-[10px] font-mono" style={{ color: MUTED }}>
                        <span>Duration: {rule.durationHours}h</span>
                        <span>Expires: {new Date(rule.expiresAtTs).toLocaleString()}</span>
                        <span>Suppressed: {rule.suppressedCount} alerts</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isActive && (
                        <button
                          onClick={() => deactivateSuppressionMut.mutate({ id: rule.id })}
                          className="rounded p-1.5 transition-colors hover:bg-white/10"
                          title="Deactivate rule"
                          disabled={deactivateSuppressionMut.isPending}
                        >
                          <PauseCircle className="h-4 w-4" style={{ color: AMBER }} />
                        </button>
                      )}
                      <button
                        onClick={() => deleteSuppressionMut.mutate({ id: rule.id })}
                        className="rounded p-1.5 transition-colors hover:bg-white/10"
                        title="Delete rule"
                        disabled={deleteSuppressionMut.isPending}
                      >
                        <Trash2 className="h-4 w-4" style={{ color: RED }} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </GlassPanel>
    </div>
  );
}
