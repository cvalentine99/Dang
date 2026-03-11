import {
  TriangleAlert, CheckCircle2, ChevronRight, X,
} from "lucide-react";
import {
  PURPLE, RED, AMBER, GREEN, MUTED, BORDER, formatPct,
} from "./theme";

interface AnomalyDetailPanelProps {
  anomaly: any;
  isLoading: boolean;
  onClose: () => void;
  onAcknowledge: (id: number) => void;
  ackPending: boolean;
}

export function AnomalyDetailPanel({
  anomaly,
  isLoading,
  onClose,
  onAcknowledge,
  ackPending,
}: AnomalyDetailPanelProps): React.JSX.Element {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg overflow-y-auto border-l shadow-2xl"
        style={{ background: "oklch(0.14 0.025 286)", borderColor: BORDER }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b px-5 py-4" style={{ background: "oklch(0.14 0.025 286)", borderColor: BORDER }}>
          <h3 className="font-display text-sm font-semibold flex items-center gap-2">
            <TriangleAlert className="h-4 w-4" style={{ color: RED }} />
            Anomaly Detail
          </h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-white/10" aria-label="Close anomaly detail panel">
            <X className="h-4 w-4" style={{ color: MUTED }} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: PURPLE }} />
            </div>
          ) : anomaly ? (
            (() => {
              const a = anomaly;
              const sevColor = a.severity === "critical" ? RED : a.severity === "high" ? "oklch(0.705 0.191 22.216)" : AMBER;
              const byCat = a.byCategory as { packages: { added: number; removed: number; changed: number }; services: { added: number; removed: number; changed: number }; users: { added: number; removed: number; changed: number } } | null;
              const topItems = (a.topDriftItems as Array<{ category: string; agentId: string; name: string; changeType: string; previousValue?: string; currentValue?: string }>) || [];

              return (
                <>
                  {/* Severity + Status */}
                  <div className="flex items-center gap-3">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase"
                      style={{ background: `${sevColor}20`, color: sevColor }}
                    >
                      <TriangleAlert className="h-3.5 w-3.5" />
                      {a.severity}
                    </span>
                    {a.acknowledged ? (
                      <span className="inline-flex items-center gap-1 text-xs" style={{ color: GREEN }}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Acknowledged
                      </span>
                    ) : (
                      <button
                        onClick={() => onAcknowledge(a.id)}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-white/5"
                        style={{ borderColor: BORDER, color: PURPLE }}
                        disabled={ackPending}
                      >
                        <CheckCircle2 className="h-3 w-3" /> Acknowledge
                      </button>
                    )}
                  </div>

                  {/* Statistical summary */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border p-3 text-center" style={{ borderColor: BORDER }}>
                      <div className="text-[10px] uppercase" style={{ color: MUTED }}>Drift</div>
                      <div className="font-display text-2xl font-bold" style={{ color: sevColor }}>
                        {formatPct(a.driftPercent)}
                      </div>
                    </div>
                    <div className="rounded-lg border p-3 text-center" style={{ borderColor: BORDER }}>
                      <div className="text-[10px] uppercase" style={{ color: MUTED }}>Z-Score</div>
                      <div className="font-display text-2xl font-bold" style={{ color: "oklch(0.9 0.005 286)" }}>
                        {a.zScore.toFixed(2)}σ
                      </div>
                    </div>
                    <div className="rounded-lg border p-3 text-center" style={{ borderColor: BORDER }}>
                      <div className="text-[10px] uppercase" style={{ color: MUTED }}>Threshold</div>
                      <div className="font-display text-2xl font-bold" style={{ color: MUTED }}>
                        {a.sigmaThreshold}σ
                      </div>
                    </div>
                  </div>

                  {/* Rolling stats */}
                  <div className="rounded-lg border p-4" style={{ borderColor: BORDER }}>
                    <h4 className="text-xs font-semibold mb-2" style={{ color: MUTED }}>Statistical Context</h4>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span style={{ color: MUTED }}>Rolling Average</span>
                        <span className="font-mono" style={{ color: "oklch(0.85 0.01 286)" }}>{a.rollingAvg.toFixed(2)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: MUTED }}>Standard Deviation</span>
                        <span className="font-mono" style={{ color: "oklch(0.85 0.01 286)" }}>±{a.rollingStdDev.toFixed(2)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: MUTED }}>Expected Range</span>
                        <span className="font-mono" style={{ color: "oklch(0.85 0.01 286)" }}>
                          {Math.max(0, a.rollingAvg - a.sigmaThreshold * a.rollingStdDev).toFixed(2)}% – {(a.rollingAvg + a.sigmaThreshold * a.rollingStdDev).toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: MUTED }}>Actual Drift</span>
                        <span className="font-mono font-bold" style={{ color: sevColor }}>{formatPct(a.driftPercent)}</span>
                      </div>
                      {/* Visual deviation bar */}
                      <div className="mt-2">
                        <div className="h-3 rounded-full relative overflow-hidden" style={{ background: "oklch(0.2 0.02 286 / 50%)" }}>
                          <div
                            className="absolute h-full rounded-full"
                            style={{
                              left: `${Math.max(0, (a.rollingAvg - a.sigmaThreshold * a.rollingStdDev) / Math.max(a.driftPercent * 1.2, 1) * 100)}%`,
                              width: `${Math.min(100, (a.sigmaThreshold * a.rollingStdDev * 2) / Math.max(a.driftPercent * 1.2, 1) * 100)}%`,
                              background: `${GREEN}30`,
                            }}
                          />
                          <div
                            className="absolute h-full w-1 rounded-full"
                            style={{
                              left: `${Math.min(100, a.driftPercent / Math.max(a.driftPercent * 1.2, 1) * 100)}%`,
                              background: sevColor,
                              boxShadow: `0 0 6px ${sevColor}`,
                            }}
                          />
                        </div>
                        <div className="flex justify-between mt-1 text-[9px]" style={{ color: MUTED }}>
                          <span>0%</span>
                          <span>Expected</span>
                          <span>Actual</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Category breakdown */}
                  {byCat && (
                    <div>
                      <h4 className="text-xs font-semibold mb-2" style={{ color: MUTED }}>Category Breakdown</h4>
                      <div className="space-y-1.5">
                        {(["packages", "services", "users"] as const).map((cat) => {
                          const d = byCat[cat];
                          const total = d.added + d.removed + d.changed;
                          return (
                            <div key={cat} className="flex items-center gap-3 text-xs">
                              <span className="w-16 capitalize" style={{ color: "oklch(0.85 0.01 286)" }}>{cat}</span>
                              <div className="flex gap-2 font-mono" style={{ color: MUTED }}>
                                {d.added > 0 && <span style={{ color: GREEN }}>+{d.added}</span>}
                                {d.changed > 0 && <span style={{ color: AMBER }}>~{d.changed}</span>}
                                {d.removed > 0 && <span style={{ color: RED }}>-{d.removed}</span>}
                                {total === 0 && <span>—</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Top drift items */}
                  {topItems.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold mb-2" style={{ color: MUTED }}>Top Changes ({topItems.length})</h4>
                      <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                        {topItems.map((item, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 rounded border px-2 py-1.5 text-xs"
                            style={{ borderColor: "oklch(0.25 0.02 286 / 30%)" }}
                          >
                            <span
                              className="shrink-0 rounded px-1 py-0.5 text-[10px] font-bold"
                              style={{
                                background: item.changeType === "added" ? `${GREEN}20` : item.changeType === "removed" ? `${RED}20` : `${AMBER}20`,
                                color: item.changeType === "added" ? GREEN : item.changeType === "removed" ? RED : AMBER,
                              }}
                            >
                              {item.changeType === "added" ? "+" : item.changeType === "removed" ? "−" : "~"}
                            </span>
                            <span className="font-mono truncate" style={{ color: "oklch(0.85 0.01 286)" }}>
                              {item.name}
                            </span>
                            <span className="shrink-0 text-[10px]" style={{ color: MUTED }}>[{item.category}]</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="rounded-lg border p-3 text-xs" style={{ borderColor: BORDER }}>
                    <h4 className="font-semibold mb-1.5" style={{ color: MUTED }}>Metadata</h4>
                    <div className="space-y-1 font-mono" style={{ color: "oklch(0.75 0.01 286)" }}>
                      <div>Anomaly ID: {a.id}</div>
                      <div>Snapshot ID: {a.snapshotId}</div>
                      <div>Schedule: {a.scheduleName} (ID: {a.scheduleId})</div>
                      <div>Agents: {(a.agentIds as string[])?.join(", ") || "—"}</div>
                      <div>Notification: {a.notificationSent ? "Sent" : "Not sent"}</div>
                      <div>Detected: {new Date(a.timestamp).toLocaleString()}</div>
                      {a.acknowledged && a.acknowledgedAtTs && (
                        <div>Acknowledged: {new Date(a.acknowledgedAtTs).toLocaleString()}</div>
                      )}
                      {a.acknowledgeNote && <div>Note: {a.acknowledgeNote}</div>}
                    </div>
                  </div>

                  {/* Raw JSON */}
                  <details className="group">
                    <summary className="cursor-pointer text-xs font-semibold flex items-center gap-1" style={{ color: MUTED }}>
                      <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                      Raw JSON
                    </summary>
                    <pre
                      className="mt-2 max-h-64 overflow-auto rounded-lg border p-3 font-mono text-[10px] leading-relaxed"
                      style={{ background: "oklch(0.12 0.02 286)", borderColor: BORDER, color: "oklch(0.75 0.01 286)" }}
                    >
                      {JSON.stringify(a, null, 2)}
                    </pre>
                  </details>
                </>
              );
            })()
          ) : (
            <div className="text-sm" style={{ color: MUTED }}>Anomaly not found</div>
          )}
        </div>
      </div>
    </div>
  );
}
