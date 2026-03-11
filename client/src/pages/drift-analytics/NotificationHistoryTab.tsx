import {
  Bell, BellOff, CheckCircle2, XCircle, ShieldOff, RotateCcw,
} from "lucide-react";
import { GlassPanel } from "./GlassPanel";
import { KpiCard } from "./KpiCard";
import {
  PURPLE, RED, AMBER, GREEN, CYAN, MUTED, BORDER, formatDateTime, formatPct,
} from "./theme";

interface NotificationHistoryTabProps {
  notifStatsQ: { data?: any; isLoading: boolean };
  notifListQ: { data?: any; isLoading: boolean };
  retryMutation: { mutate: (args: { id: number }) => void; isPending: boolean };
}

export function NotificationHistoryTab({
  notifStatsQ,
  notifListQ,
  retryMutation,
}: NotificationHistoryTabProps): React.JSX.Element {
  return (
    <div className="space-y-5">
      {/* Notification KPIs */}
      {notifStatsQ.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <KpiCard icon={Bell} label="Total Sent" value={notifStatsQ.data.sent} sub="notifications" color={GREEN} />
          <KpiCard icon={CheckCircle2} label="Delivered" value={notifStatsQ.data.delivered} sub="successful" color={CYAN} />
          <KpiCard icon={XCircle} label="Failed" value={notifStatsQ.data.failed} sub="errors" color={RED} />
          <KpiCard icon={ShieldOff} label="Suppressed" value={notifStatsQ.data.suppressed} sub="by rules" color={AMBER} />
          <KpiCard icon={RotateCcw} label="Retried" value={notifStatsQ.data.retried} sub="attempts" color={PURPLE} />
          <KpiCard icon={BellOff} label="Skipped" value={notifStatsQ.data.skipped} sub="below threshold" color={MUTED} />
        </div>
      )}

      {/* Notification History Table */}
      <GlassPanel title="Notification Log" icon={Bell}>
        <div className="px-5 pb-5">
          {notifListQ.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: PURPLE }} />
            </div>
          ) : (notifListQ.data?.notifications.length ?? 0) === 0 ? (
            <div className="flex h-48 items-center justify-center text-sm" style={{ color: MUTED }}>
              No notifications sent yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ color: MUTED }}>
                    <th className="pb-2 text-left font-medium">Time</th>
                    <th className="pb-2 text-left font-medium">Schedule</th>
                    <th className="pb-2 text-left font-medium">Type</th>
                    <th className="pb-2 text-left font-medium">Channel</th>
                    <th className="pb-2 text-left font-medium">Status</th>
                    <th className="pb-2 text-right font-medium">Drift %</th>
                    <th className="pb-2 text-right font-medium">Retries</th>
                    <th className="pb-2 text-center font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {notifListQ.data!.notifications.map((n: any) => {
                    const statusColor = n.deliveryStatus === "delivered" ? GREEN : n.deliveryStatus === "failed" ? RED : n.deliveryStatus === "suppressed" ? AMBER : MUTED;
                    return (
                      <tr
                        key={n.id}
                        className="border-t transition-colors hover:bg-white/3"
                        style={{ borderColor: "oklch(0.25 0.02 286 / 30%)" }}
                      >
                        <td className="py-2.5 pr-3 font-mono" style={{ color: MUTED }}>
                          {formatDateTime(n.sentAtTs)}
                        </td>
                        <td className="py-2.5 pr-3" style={{ color: "oklch(0.85 0.01 286)" }}>
                          {n.scheduleName || `Schedule #${n.scheduleId}`}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: `${PURPLE}20`, color: PURPLE }}>
                            {n.notificationType}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 font-mono" style={{ color: MUTED }}>
                          {n.channel}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                            style={{ background: `${statusColor}20`, color: statusColor }}
                          >
                            {n.deliveryStatus === "delivered" && <CheckCircle2 className="h-2.5 w-2.5" />}
                            {n.deliveryStatus === "failed" && <XCircle className="h-2.5 w-2.5" />}
                            {n.deliveryStatus === "suppressed" && <ShieldOff className="h-2.5 w-2.5" />}
                            {n.deliveryStatus}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono" style={{ color: "oklch(0.85 0.01 286)" }}>
                          {n.driftPercent != null ? formatPct(n.driftPercent) : "—"}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-mono" style={{ color: MUTED }}>
                          {n.retryCount}
                        </td>
                        <td className="py-2.5 text-center">
                          {n.deliveryStatus === "failed" && (
                            <button
                              onClick={() => retryMutation.mutate({ id: n.id })}
                              disabled={retryMutation.isPending}
                              className="rounded p-1 transition-colors hover:bg-white/10"
                              title="Retry notification"
                            >
                              <RotateCcw className="h-3.5 w-3.5" style={{ color: CYAN }} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </GlassPanel>
    </div>
  );
}
