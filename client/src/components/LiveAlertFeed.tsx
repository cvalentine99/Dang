/**
 * LiveAlertFeed — Real-time alert stream panel for the SOC Console.
 *
 * Connects to the SSE endpoint and displays incoming high/critical alerts
 * with severity badges, agent info, and MITRE tactic tags.
 */

import { useAlertStream, type StreamedAlert, type StreamStatus } from "@/hooks/useAlertStream";
import { ThreatBadge, threatLevelFromNumber } from "@/components/shared/ThreatBadge";
import { GlassPanel } from "@/components/shared/GlassPanel";
import {
  Radio, X, Bell, BellOff, CheckCheck, Trash2,
  AlertTriangle, Wifi, WifiOff, Clock,
} from "lucide-react";
import { useState, useMemo } from "react";

// ── Status indicator ─────────────────────────────────────────────────────────

function StatusDot({ status }: { status: StreamStatus }) {
  const config: Record<StreamStatus, { color: string; label: string; pulse: boolean }> = {
    connected: { color: "bg-threat-low", label: "Live", pulse: true },
    connecting: { color: "bg-yellow-500", label: "Connecting...", pulse: true },
    disconnected: { color: "bg-muted-foreground", label: "Disconnected", pulse: false },
    error: { color: "bg-threat-high", label: "Error", pulse: true },
    indexer_unavailable: { color: "bg-threat-medium", label: "Indexer N/A", pulse: false },
  };
  const c = config[status];
  return (
    <span className="flex items-center gap-1.5">
      <span className={`relative h-2 w-2 rounded-full ${c.color}`}>
        {c.pulse && (
          <span className={`absolute inset-0 rounded-full ${c.color} animate-ping opacity-75`} />
        )}
      </span>
      <span className="text-[10px] text-muted-foreground">{c.label}</span>
    </span>
  );
}

// ── Single alert row ─────────────────────────────────────────────────────────

function AlertRow({
  alert,
  onDismiss,
  onSelect,
  isSelected,
}: {
  alert: StreamedAlert;
  onDismiss: (id: string) => void;
  onSelect: (alert: StreamedAlert) => void;
  isSelected: boolean;
}) {
  const ts = useMemo(() => {
    const d = new Date(alert.timestamp);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }, [alert.timestamp]);

  const mitreTactics = alert.rule.mitre?.tactic ?? [];

  return (
    <div
      className={`group flex items-start gap-2 py-2 px-2.5 rounded-lg transition-all cursor-pointer border ${
        isSelected
          ? "bg-primary/10 border-primary/30"
          : "border-transparent hover:bg-secondary/30 hover:border-border/30"
      }`}
      onClick={() => onSelect(alert)}
    >
      <div className="shrink-0 mt-0.5">
        <ThreatBadge level={threatLevelFromNumber(alert.rule.level)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground leading-tight truncate">
          {alert.rule.description}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-[9px] font-mono text-primary">
            Rule {alert.rule.id}
          </span>
          <span className="text-[9px] text-muted-foreground">
            {alert.agent.name}
            {alert.agent.ip ? ` (${alert.agent.ip})` : ""}
          </span>
          {mitreTactics.slice(0, 2).map((t) => (
            <span
              key={t}
              className="text-[8px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[9px] text-muted-foreground font-mono">{ts}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(alert.id);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/20"
          title="Dismiss"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

// ── Alert detail panel ───────────────────────────────────────────────────────

function AlertDetail({ alert }: { alert: StreamedAlert }) {
  return (
    <div className="space-y-3 p-3 rounded-lg bg-secondary/20 border border-border/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ThreatBadge level={threatLevelFromNumber(alert.rule.level)} />
          <span className="text-xs font-medium text-foreground">
            Rule {alert.rule.id} — Level {alert.rule.level}
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted-foreground">
          {new Date(alert.timestamp).toLocaleString()}
        </span>
      </div>
      <p className="text-xs text-foreground">{alert.rule.description}</p>
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div>
          <span className="text-muted-foreground">Agent:</span>{" "}
          <span className="font-mono text-foreground">
            {alert.agent.name} ({alert.agent.id})
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">IP:</span>{" "}
          <span className="font-mono text-foreground">{alert.agent.ip ?? "—"}</span>
        </div>
        {alert.decoder?.name && (
          <div>
            <span className="text-muted-foreground">Decoder:</span>{" "}
            <span className="font-mono text-foreground">{alert.decoder.name}</span>
          </div>
        )}
        {alert.location && (
          <div>
            <span className="text-muted-foreground">Location:</span>{" "}
            <span className="font-mono text-foreground truncate">{alert.location}</span>
          </div>
        )}
      </div>
      {alert.rule.groups && alert.rule.groups.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {alert.rule.groups.slice(0, 8).map((g) => (
            <span
              key={g}
              className="text-[8px] px-1.5 py-0.5 rounded bg-secondary/40 text-muted-foreground border border-border/20"
            >
              {g}
            </span>
          ))}
        </div>
      )}
      {alert.rule.mitre && (
        <div className="flex flex-wrap gap-1">
          {alert.rule.mitre.tactic?.map((t) => (
            <span
              key={t}
              className="text-[8px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
            >
              {t}
            </span>
          ))}
          {alert.rule.mitre.technique?.map((t) => (
            <span
              key={t}
              className="text-[8px] px-1.5 py-0.5 rounded bg-threat-high/10 text-threat-high border border-threat-high/20"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface LiveAlertFeedProps {
  /** Whether to enable the stream (default: true) */
  enabled?: boolean;
  /** Minimum severity threshold (default: 10) */
  severityThreshold?: number;
  /** CSS class for the outer container */
  className?: string;
}

export function LiveAlertFeed({
  enabled = true,
  severityThreshold = 10,
  className = "",
}: LiveAlertFeedProps) {
  const {
    alerts,
    unreadCount,
    status,
    errorMessage,
    acknowledgeAll,
    dismissAlert,
    clearAlerts,
  } = useAlertStream({ enabled, severityThreshold });

  const [selectedAlert, setSelectedAlert] = useState<StreamedAlert | null>(null);
  const [isStreamEnabled, setIsStreamEnabled] = useState(enabled);

  // Toggle stream on/off
  const toggleStream = () => setIsStreamEnabled((prev) => !prev);

  return (
    <GlassPanel className={`flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Radio className="h-4 w-4 text-threat-critical" />
            Live Alert Feed
          </h3>
          <StatusDot status={isStreamEnabled ? status : "disconnected"} />
          {unreadCount > 0 && (
            <span className="flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-threat-critical text-white text-[10px] font-bold">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={acknowledgeAll}
              className="p-1.5 rounded-lg hover:bg-secondary/40 transition-colors"
              title="Mark all as read"
              aria-label="Mark all alerts as read"
            >
              <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
          {alerts.length > 0 && (
            <button
              onClick={() => { clearAlerts(); setSelectedAlert(null); }}
              className="p-1.5 rounded-lg hover:bg-secondary/40 transition-colors"
              title="Clear all alerts"
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
          <button
            onClick={toggleStream}
            className={`p-1.5 rounded-lg transition-colors ${
              isStreamEnabled
                ? "hover:bg-secondary/40"
                : "bg-threat-high/10 hover:bg-threat-high/20"
            }`}
            title={isStreamEnabled ? "Pause stream" : "Resume stream"}
          >
            {isStreamEnabled ? (
              <Bell className="h-3.5 w-3.5 text-primary" />
            ) : (
              <BellOff className="h-3.5 w-3.5 text-threat-high" />
            )}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {errorMessage && (
        <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg bg-threat-high/10 border border-threat-high/20">
          <AlertTriangle className="h-3.5 w-3.5 text-threat-high shrink-0" />
          <span className="text-[10px] text-threat-high truncate">{errorMessage}</span>
        </div>
      )}

      {/* Alert list */}
      <div className="flex-1 overflow-y-auto space-y-0.5 min-h-0 max-h-[350px]" aria-live="polite" aria-label="Live alert feed" role="log">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            {status === "connected" ? (
              <>
                <Wifi className="h-8 w-8 text-primary/30 mb-2" />
                <p className="text-xs text-muted-foreground">
                  Listening for alerts (level {">"}= {severityThreshold})
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  New alerts will appear here in real-time
                </p>
              </>
            ) : status === "disconnected" || !isStreamEnabled ? (
              <>
                <WifiOff className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">Stream paused</p>
              </>
            ) : (
              <>
                <Clock className="h-8 w-8 text-muted-foreground/30 mb-2 animate-pulse" />
                <p className="text-xs text-muted-foreground">Connecting to alert stream...</p>
              </>
            )}
          </div>
        ) : (
          alerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onDismiss={dismissAlert}
              onSelect={setSelectedAlert}
              isSelected={selectedAlert?.id === alert.id}
            />
          ))
        )}
      </div>

      {/* Detail panel */}
      {selectedAlert && (
        <div className="mt-3 pt-3 border-t border-border/30">
          <AlertDetail alert={selectedAlert} />
        </div>
      )}
    </GlassPanel>
  );
}

// ── Notification Bell (for DashboardLayout header) ───────────────────────────

export function AlertNotificationBell({ collapsed = false }: { collapsed?: boolean }) {
  const {
    alerts,
    unreadCount,
    status,
    acknowledgeAll,
    dismissAlert,
    clearAlerts,
  } = useAlertStream({ severityThreshold: 10 });
  const [open, setOpen] = useState(false);
  const isLive = status === "connected";

  const statusConfig: Record<StreamStatus, { color: string; label: string }> = {
    connected: { color: "bg-threat-low", label: "Live" },
    connecting: { color: "bg-yellow-500", label: "Connecting..." },
    disconnected: { color: "bg-muted-foreground", label: "Disconnected" },
    error: { color: "bg-threat-high", label: "Error" },
    indexer_unavailable: { color: "bg-threat-medium", label: "Indexer N/A" },
  };
  const sc = statusConfig[status];

  return (
    <div className="relative">
      {/* Bell trigger */}
      <button
        onClick={() => {
          setOpen((prev) => !prev);
          if (!open && unreadCount > 0) acknowledgeAll();
        }}
        className={`relative p-2 rounded-lg transition-colors ${
          open ? "bg-primary/15" : "hover:bg-sidebar-accent"
        }`}
        title={`${unreadCount} unread alerts`}
      >
        <Bell className={`h-4 w-4 ${isLive ? "text-primary" : "text-muted-foreground"}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 min-w-[16px] px-0.5 rounded-full bg-threat-critical text-white text-[8px] font-bold animate-pulse">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown popover */}
      {open && (
        <div
          className={`absolute z-50 ${
            collapsed ? "left-full ml-2 top-0" : "left-0 top-full mt-2"
          } w-80 max-h-[480px] flex flex-col rounded-xl border border-border/40 bg-popover/95 backdrop-blur-xl shadow-2xl shadow-black/40`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
            <div className="flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 text-threat-critical" />
              <span className="text-xs font-medium text-foreground">Alert Stream</span>
              <span className="flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${sc.color} ${status === "connected" ? "animate-pulse" : ""}`} />
                <span className="text-[9px] text-muted-foreground">{sc.label}</span>
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              {alerts.length > 0 && (
                <button
                  onClick={clearAlerts}
                  className="p-1 rounded hover:bg-secondary/40 transition-colors"
                  title="Clear all"
                  aria-label="Clear all alerts"
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-secondary/40 transition-colors"
                title="Close"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Alert list */}
          <div className="flex-1 overflow-y-auto min-h-0 max-h-[360px]">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                {isLive ? (
                  <>
                    <Bell className="h-6 w-6 text-primary/20 mb-2" />
                    <p className="text-[10px] text-muted-foreground">Listening for critical alerts...</p>
                    <p className="text-[9px] text-muted-foreground/50 mt-0.5">Level 10+ alerts appear here</p>
                  </>
                ) : (
                  <>
                    <BellOff className="h-6 w-6 text-muted-foreground/20 mb-2" />
                    <p className="text-[10px] text-muted-foreground">{sc.label}</p>
                  </>
                )}
              </div>
            ) : (
              <div className="py-1">
                {alerts.slice(0, 20).map((alert) => (
                  <BellAlertRow key={alert.id} alert={alert} onDismiss={dismissAlert} />
                ))}
                {alerts.length > 20 && (
                  <p className="text-center text-[9px] text-muted-foreground py-2">
                    +{alerts.length - 20} more alerts
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-border/30">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                setOpen(false);
                window.location.href = "/";
              }}
              className="text-[10px] text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
            >
              Open SOC Console
              <span className="text-muted-foreground">→</span>
            </a>
          </div>
        </div>
      )}

      {/* Click-outside overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// ── Compact alert row for the bell dropdown ─────────────────────────────────

function BellAlertRow({ alert, onDismiss }: { alert: StreamedAlert; onDismiss: (id: string) => void }) {
  const ts = useMemo(() => {
    const d = new Date(alert.timestamp);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }, [alert.timestamp]);

  return (
    <div className="group flex items-start gap-2 px-3 py-2 hover:bg-secondary/30 transition-colors">
      <div className="shrink-0 mt-0.5">
        <ThreatBadge level={threatLevelFromNumber(alert.rule.level)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-foreground leading-tight truncate">
          {alert.rule.description}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[9px] font-mono text-primary">R:{alert.rule.id}</span>
          <span className="text-[9px] text-muted-foreground truncate">{alert.agent.name}</span>
          {alert.rule.mitre?.tactic?.slice(0, 1).map((t) => (
            <span key={t} className="text-[8px] px-1 py-0 rounded bg-primary/10 text-primary border border-primary/20">{t}</span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[9px] text-muted-foreground font-mono">{ts}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(alert.id); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/20"
          title="Dismiss"
        >
          <X className="h-2.5 w-2.5 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
