/**
 * QueueNotifier — Global notification component for Alert Queue alerts.
 *
 * Mounted inside DashboardLayout so it runs on every page. Polls the
 * alertQueue.recentAlerts endpoint every 10s to detect newly queued alerts.
 * When a new alert arrives:
 *   - Critical (12+): Urgent alarm sound + persistent red toast (15s)
 *   - High (8-11): Warning chime + amber toast (10s)
 *   - Medium/Low: Subtle click + standard toast (5s)
 *
 * Features:
 * - Notification history panel (last 20 notifications) in bell dropdown
 * - Notification preferences (per-severity toggles)
 * - Sound effects respecting global mute toggle
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { SoundEngine } from "@/lib/soundEngine";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  ShieldAlert,
  Bell,
  BellOff,
  Inbox,
  Clock,
  Trash2,
  Settings2,
  ChevronRight,
} from "lucide-react";

// ── Notification preferences (localStorage) ────────────────────────────────

const NOTIF_PREFS_KEY = "dang-queue-notifications";
const NOTIF_HISTORY_KEY = "dang-queue-notif-history";

interface NotifPrefs {
  critical: boolean;
  high: boolean;
  low: boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  critical: true,
  high: true,
  low: false,
};

function getNotifPrefs(): NotifPrefs {
  try {
    const stored = localStorage.getItem(NOTIF_PREFS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate structure — only accept boolean fields
      if (parsed && typeof parsed === "object") {
        return {
          critical: typeof parsed.critical === "boolean" ? parsed.critical : DEFAULT_PREFS.critical,
          high: typeof parsed.high === "boolean" ? parsed.high : DEFAULT_PREFS.high,
          low: typeof parsed.low === "boolean" ? parsed.low : DEFAULT_PREFS.low,
        };
      }
    }
  } catch {
    // ignore JSON parse errors
  }
  return DEFAULT_PREFS;
}

function setNotifPrefs(prefs: NotifPrefs): void {
  try {
    localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

// ── Notification history (localStorage, last 20) ───────────────────────────

interface NotifHistoryItem {
  id: string;
  alertId: string;
  ruleDescription: string | null;
  ruleLevel: number;
  agentName: string | null;
  timestamp: string;
  read: boolean;
}

function getNotifHistory(): NotifHistoryItem[] {
  try {
    const stored = localStorage.getItem(NOTIF_HISTORY_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate it's an array with proper structure
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is NotifHistoryItem =>
          item &&
          typeof item === "object" &&
          typeof item.id === "string" &&
          typeof item.alertId === "string" &&
          typeof item.timestamp === "string" &&
          typeof item.read === "boolean"
        );
      }
    }
  } catch {
    // ignore JSON parse errors
  }
  return [];
}

function setNotifHistory(history: NotifHistoryItem[]): void {
  try {
    // Keep only last 20
    localStorage.setItem(NOTIF_HISTORY_KEY, JSON.stringify(history.slice(0, 20)));
  } catch {
    // ignore
  }
}

// ── Severity classification ─────────────────────────────────────────────────

function getSeverityTier(level: number): "critical" | "high" | "low" {
  if (level >= 12) return "critical";
  if (level >= 8) return "high";
  return "low";
}

function getSeverityLabel(level: number): string {
  if (level >= 12) return "CRITICAL";
  if (level >= 8) return "HIGH";
  if (level >= 4) return "MEDIUM";
  return "LOW";
}

function getSeverityDotColor(level: number): string {
  if (level >= 12) return "bg-red-500";
  if (level >= 8) return "bg-orange-500";
  if (level >= 4) return "bg-yellow-500";
  return "bg-blue-500";
}

function getSeverityBgColor(level: number): string {
  if (level >= 12) return "bg-red-500/5 border-red-500/15 hover:bg-red-500/10";
  if (level >= 8) return "bg-orange-500/5 border-orange-500/15 hover:bg-orange-500/10";
  if (level >= 4) return "bg-yellow-500/5 border-yellow-500/15 hover:bg-yellow-500/10";
  return "bg-blue-500/5 border-blue-500/15 hover:bg-blue-500/10";
}

function getSeverityTextColor(level: number): string {
  if (level >= 12) return "text-red-300";
  if (level >= 8) return "text-orange-300";
  if (level >= 4) return "text-yellow-300";
  return "text-blue-300";
}

// ── Sound effects for notifications ─────────────────────────────────────────

function playCriticalAlarm(): void {
  if (SoundEngine.isMuted()) return;
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const vol = 0.18;
    [0, 0.15, 0.3].forEach((offset, i) => {
      const freq = 880 - i * 120;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, now + offset);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.7, now + offset + 0.12);
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(vol, now + offset + 0.005);
      gain.gain.setValueAtTime(vol, now + offset + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.13);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.14);
    });
    // Audit #88: Close AudioContext after all oscillators finish to prevent leak
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    // Web Audio not available
  }
}

function playHighWarning(): void {
  if (SoundEngine.isMuted()) return;
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const vol = 0.14;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "triangle";
    osc1.frequency.setValueAtTime(600, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(vol, now + 0.01);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.21);
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(800, now + 0.12);
    gain2.gain.setValueAtTime(0, now + 0.12);
    gain2.gain.linearRampToValueAtTime(vol * 1.1, now + 0.13);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.36);
    // Audit #88: Close AudioContext after oscillators finish to prevent leak
    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch {
    // Web Audio not available
  }
}

// ── Toast renderers ─────────────────────────────────────────────────────────

function showCriticalToast(alert: {
  alertId: string;
  ruleDescription: string | null;
  ruleLevel: number;
  agentName: string | null;
}, navigate: (path: string) => void): void {
  toast.error(
    `🚨 CRITICAL ALERT — Level ${alert.ruleLevel}`,
    {
      description: (
        <div className="space-y-1.5 mt-1">
          <p className="text-xs text-red-200/90 font-medium leading-snug">
            {alert.ruleDescription ?? "Unknown rule"}
          </p>
          <div className="flex items-center gap-2 text-[10px] text-red-300/60 font-mono">
            <span>Alert: {alert.alertId}</span>
            {alert.agentName && <span>· Agent: {alert.agentName}</span>}
          </div>
          <button
            onClick={() => {
              toast.dismiss();
              navigate("/alert-queue");
            }}
            className="mt-1 flex items-center gap-1 text-[11px] font-medium text-red-300 hover:text-red-200 transition-colors"
          >
            <Inbox className="h-3 w-3" />
            View in Alert Queue →
          </button>
        </div>
      ),
      duration: 15000,
      icon: <ShieldAlert className="h-5 w-5 text-red-400" />,
      className: "!bg-red-950/90 !border-red-500/40 !backdrop-blur-xl",
    }
  );
}

function showHighToast(alert: {
  alertId: string;
  ruleDescription: string | null;
  ruleLevel: number;
  agentName: string | null;
}, navigate: (path: string) => void): void {
  toast.warning(
    `⚠ HIGH ALERT — Level ${alert.ruleLevel}`,
    {
      description: (
        <div className="space-y-1.5 mt-1">
          <p className="text-xs text-orange-200/90 font-medium leading-snug">
            {alert.ruleDescription ?? "Unknown rule"}
          </p>
          <div className="flex items-center gap-2 text-[10px] text-orange-300/60 font-mono">
            <span>Alert: {alert.alertId}</span>
            {alert.agentName && <span>· Agent: {alert.agentName}</span>}
          </div>
          <button
            onClick={() => {
              toast.dismiss();
              navigate("/alert-queue");
            }}
            className="mt-1 flex items-center gap-1 text-[11px] font-medium text-orange-300 hover:text-orange-200 transition-colors"
          >
            <Inbox className="h-3 w-3" />
            View in Alert Queue →
          </button>
        </div>
      ),
      duration: 10000,
      icon: <AlertTriangle className="h-5 w-5 text-orange-400" />,
      className: "!bg-orange-950/90 !border-orange-500/40 !backdrop-blur-xl",
    }
  );
}

function showLowToast(alert: {
  alertId: string;
  ruleDescription: string | null;
  ruleLevel: number;
}): void {
  toast.info(
    `Alert queued — Level ${alert.ruleLevel}`,
    {
      description: alert.ruleDescription ?? alert.alertId,
      duration: 5000,
    }
  );
}

// ── Time formatting ─────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ── QueueNotifier Component ─────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000;

export function QueueNotifier() {
  const [, navigate] = useLocation();
  const [prefs, setPrefs] = useState<NotifPrefs>(getNotifPrefs);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [history, setHistory] = useState<NotifHistoryItem[]>(getNotifHistory);
  const panelRef = useRef<HTMLDivElement>(null);

  const notifiedIdsRef = useRef<Set<string>>(new Set());
  const [sinceValue] = useState(() => new Date().toISOString());

  const recentAlerts = trpc.alertQueue.recentAlerts.useQuery(
    { since: sinceValue },
    {
      refetchInterval: POLL_INTERVAL_MS,
      staleTime: 0,
      enabled: prefs.critical || prefs.high || prefs.low,
    }
  );

  // Process new alerts and trigger notifications
  useEffect(() => {
    const alerts = recentAlerts.data?.alerts;
    if (!alerts || alerts.length === 0) return;

    let historyUpdated = false;

    for (const alert of alerts) {
      if (notifiedIdsRef.current.has(alert.alertId)) continue;
      notifiedIdsRef.current.add(alert.alertId);

      const tier = getSeverityTier(alert.ruleLevel);
      if (!prefs[tier]) continue;

      // Add to history
      const historyItem: NotifHistoryItem = {
        id: `${alert.alertId}-${Date.now()}`,
        alertId: alert.alertId,
        ruleDescription: alert.ruleDescription,
        ruleLevel: alert.ruleLevel,
        agentName: alert.agentName,
        timestamp: new Date().toISOString(),
        read: false,
      };

      setHistory((prev) => {
        const next = [historyItem, ...prev].slice(0, 20);
        setNotifHistory(next);
        return next;
      });
      historyUpdated = true;

      // Trigger sound + toast
      switch (tier) {
        case "critical":
          playCriticalAlarm();
          showCriticalToast(alert, navigate);
          break;
        case "high":
          playHighWarning();
          showHighToast(alert, navigate);
          break;
        case "low":
          SoundEngine.stepComplete();
          showLowToast(alert);
          break;
      }
    }

    if (notifiedIdsRef.current.size > 100) {
      const arr = Array.from(notifiedIdsRef.current);
      notifiedIdsRef.current = new Set(arr.slice(-50));
    }
  }, [recentAlerts.data, prefs, navigate]);

  // Close panel on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
        setShowSettings(false);
      }
    }
    if (panelOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [panelOpen]);

  const updatePrefs = useCallback((update: Partial<NotifPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...update };
      setNotifPrefs(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setHistory((prev) => {
      const next = prev.map((item) => ({ ...item, read: true }));
      setNotifHistory(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    setNotifHistory([]);
  }, []);

  const handleNotifClick = useCallback(
    (item: NotifHistoryItem) => {
      // Mark as read
      setHistory((prev) => {
        const next = prev.map((n) =>
          n.id === item.id ? { ...n, read: true } : n
        );
        setNotifHistory(next);
        return next;
      });
      setPanelOpen(false);
      navigate("/alert-queue");
    },
    [navigate]
  );

  const isAnyEnabled = prefs.critical || prefs.high || prefs.low;
  const unreadCount = history.filter((n) => !n.read).length;

  return (
    <div className="fixed bottom-4 right-4 z-50" ref={panelRef}>
      {/* Panel */}
      {panelOpen && (
        <div className="absolute bottom-12 right-0 w-80 max-h-[480px] rounded-xl border border-white/10 bg-black/90 backdrop-blur-xl shadow-2xl shadow-amber-500/5 animate-in slide-in-from-bottom-2 fade-in duration-200 flex flex-col overflow-hidden">
          {/* Panel header */}
          <div className="flex-none flex items-center justify-between px-4 py-3 border-b border-white/5">
            {showSettings ? (
              <>
                <button
                  onClick={() => setShowSettings(false)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← Back
                </button>
                <h4 className="text-xs font-display font-semibold text-foreground">Settings</h4>
                <div className="w-8" />
              </>
            ) : (
              <>
                <h4 className="text-xs font-display font-semibold text-foreground">
                  Notifications
                  {unreadCount > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[9px] font-mono">
                      {unreadCount}
                    </span>
                  )}
                </h4>
                <div className="flex items-center gap-1">
                  {history.length > 0 && (
                    <>
                      <button
                        onClick={markAllRead}
                        className="px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
                        title="Mark all as read"
                      >
                        Mark read
                      </button>
                      <button
                        onClick={clearHistory}
                        className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all"
                        title="Clear all notifications"
                        aria-label="Clear all notifications"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setShowSettings(true)}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
                    title="Notification settings"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Panel body */}
          <div className="flex-1 overflow-y-auto" aria-live="polite" aria-label="Notification history">
            {showSettings ? (
              /* Settings view */
              <div className="p-4 space-y-1">
                <p className="text-[10px] text-muted-foreground mb-3 leading-relaxed">
                  Get notified when alerts enter the Alert Queue. Sounds respect the global mute toggle.
                </p>

                {/* Critical toggle */}
                <label className="flex items-center justify-between py-2 cursor-pointer group">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-[11px] text-foreground/80 group-hover:text-foreground">
                      Critical (12+)
                    </span>
                  </div>
                  <button
                    onClick={() => updatePrefs({ critical: !prefs.critical })}
                    className={`w-8 h-4 rounded-full transition-colors ${
                      prefs.critical ? "bg-red-500/60" : "bg-white/10"
                    }`}
                  >
                    <div
                      className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${
                        prefs.critical ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </label>

                {/* High toggle */}
                <label className="flex items-center justify-between py-2 cursor-pointer group">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    <span className="text-[11px] text-foreground/80 group-hover:text-foreground">
                      High (8–11)
                    </span>
                  </div>
                  <button
                    onClick={() => updatePrefs({ high: !prefs.high })}
                    className={`w-8 h-4 rounded-full transition-colors ${
                      prefs.high ? "bg-orange-500/60" : "bg-white/10"
                    }`}
                  >
                    <div
                      className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${
                        prefs.high ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </label>

                {/* Low toggle */}
                <label className="flex items-center justify-between py-2 cursor-pointer group">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-[11px] text-foreground/80 group-hover:text-foreground">
                      Medium/Low (0–7)
                    </span>
                  </div>
                  <button
                    onClick={() => updatePrefs({ low: !prefs.low })}
                    className={`w-8 h-4 rounded-full transition-colors ${
                      prefs.low ? "bg-blue-500/60" : "bg-white/10"
                    }`}
                  >
                    <div
                      className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${
                        prefs.low ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </label>

                <div className="mt-3 pt-2 border-t border-white/5">
                  <p className="text-[9px] text-muted-foreground">
                    {SoundEngine.isMuted()
                      ? "🔇 Sounds muted — toggle in analyst settings"
                      : "🔊 Sounds enabled"}
                  </p>
                </div>
              </div>
            ) : history.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Bell className="h-8 w-8 text-muted-foreground/20 mb-3" />
                <p className="text-xs text-muted-foreground">No notifications yet</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  Alerts queued for structured triage will appear here
                </p>
              </div>
            ) : (
              /* Notification list */
              <div className="divide-y divide-white/5">
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleNotifClick(item)}
                    className={`w-full text-left px-4 py-3 transition-all border-l-2 ${
                      item.read
                        ? "border-l-transparent hover:bg-white/3"
                        : `${getSeverityBgColor(item.ruleLevel)}`
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={`mt-1.5 w-2 h-2 rounded-full flex-none ${getSeverityDotColor(
                          item.ruleLevel
                        )} ${!item.read ? "shadow-[0_0_6px] shadow-current" : "opacity-50"}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-[10px] font-bold ${getSeverityTextColor(
                              item.ruleLevel
                            )} ${item.read ? "opacity-60" : ""}`}
                          >
                            {getSeverityLabel(item.ruleLevel)} — Level {item.ruleLevel}
                          </span>
                          <span className="text-[9px] text-muted-foreground/60 flex-none flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {timeAgo(item.timestamp)}
                          </span>
                        </div>
                        <p
                          className={`text-[11px] leading-snug mt-0.5 truncate ${
                            item.read ? "text-muted-foreground/60" : "text-foreground/80"
                          }`}
                        >
                          {item.ruleDescription ?? "Unknown rule"}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-[9px] text-muted-foreground/50 font-mono">
                          <span>{item.alertId}</span>
                          {item.agentName && <span>· {item.agentName}</span>}
                        </div>
                      </div>
                      <ChevronRight className="h-3 w-3 text-muted-foreground/30 mt-2 flex-none" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Panel footer */}
          {!showSettings && history.length > 0 && (
            <div className="flex-none border-t border-white/5 px-4 py-2">
              <button
                onClick={() => {
                  setPanelOpen(false);
                  navigate("/alert-queue");
                }}
                className="w-full text-center text-[11px] text-primary hover:text-primary/80 font-medium transition-colors"
              >
                View Alert Queue →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bell button */}
      <button
        onClick={() => {
          setPanelOpen(!panelOpen);
          if (!panelOpen) setShowSettings(false);
        }}
        className={`group relative w-9 h-9 rounded-full border backdrop-blur-xl flex items-center justify-center transition-all shadow-lg ${
          isAnyEnabled
            ? "bg-amber-500/15 border-amber-500/30 hover:bg-amber-500/25 shadow-amber-500/10"
            : "bg-black/40 border-white/10 hover:bg-white/10"
        }`}
        title="Notifications"
      >
        {isAnyEnabled ? (
          <Bell className="h-4 w-4 text-amber-400 group-hover:text-amber-300" />
        ) : (
          <BellOff className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
        )}

        {/* Unread count badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center shadow-lg shadow-red-500/30 animate-in zoom-in duration-200">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}

        {/* Active indicator (when no unread but enabled) */}
        {unreadCount === 0 && isAnyEnabled && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        )}
      </button>
    </div>
  );
}

export default QueueNotifier;
