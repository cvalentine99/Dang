/**
 * useAlertStream — React hook for consuming real-time SSE alerts.
 *
 * Connects to /api/sse/alerts and provides:
 * - Live alert feed with severity filtering
 * - Connection status tracking
 * - Unread count with acknowledge/dismiss
 * - Auto-reconnect with exponential backoff + jitter (1s → 30s cap)
 * - One EventSource per tab (module singleton shared by all consumers)
 * - Stops on 401 / session_revoked (→ /login) and stream_limit (one toast)
 */

import { useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────────────

export interface StreamedAlert {
  id: string;
  timestamp: string;
  rule: {
    id: string | number;
    level: number;
    description: string;
    groups?: string[];
    mitre?: { id?: string[]; tactic?: string[]; technique?: string[] };
  };
  agent: {
    id: string;
    name: string;
    ip?: string;
  };
  decoder?: { name?: string };
  location?: string;
}

export type StreamStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "indexer_unavailable";

interface AlertStreamState {
  /** Live alerts (newest first), capped at maxAlerts */
  alerts: StreamedAlert[];
  /** Number of unread (unacknowledged) alerts */
  unreadCount: number;
  /** Connection status */
  status: StreamStatus;
  /** Error message if status is "error" */
  errorMessage: string | null;
  /** Number of connected SSE clients (from heartbeat) */
  connectedClients: number;
}

interface UseAlertStreamOptions {
  /** Whether to enable the stream (default: true) */
  enabled?: boolean;
  /** Minimum rule.level to receive (default: 10) */
  severityThreshold?: number;
  /** Maximum alerts to keep in memory (default: 100) */
  maxAlerts?: number;
  /** @deprecated ignored — reconnects use exponential backoff with jitter */
  reconnectDelay?: number;
}

// ── Shared stream (one EventSource per tab) ──────────────────────────────────
//
// Every useAlertStream() consumer (the SOC-console LiveAlertFeed and the
// header AlertNotificationBell) subscribes to this module singleton, so a tab
// opens at most ONE EventSource. The connection uses the lowest severity
// threshold among active subscribers; each subscriber filters client-side.

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_CAP_MS = 30_000;

interface Subscriber {
  severityThreshold: number;
  maxAlerts: number;
}

type Listener = () => void;

/** Exponential backoff with jitter: uniform in [d/2, d], d = min(cap, base·2^attempt). */
export function computeBackoffMs(attempt: number, random: () => number = Math.random): number {
  const d = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt));
  return Math.round(d / 2 + random() * (d / 2));
}

/** Probe the session after an HTTP-level SSE failure (EventSource hides the status code). */
async function sessionIsValid(): Promise<boolean | null> {
  try {
    const res = await fetch("/api/trpc/auth.me", { credentials: "include" });
    if (res.status === 401) return false;
    if (!res.ok) return null;
    const body = await res.json();
    const data = body?.result?.data;
    const user = data && typeof data === "object" && "json" in data ? data.json : data;
    return user != null;
  } catch {
    return null; // network trouble — unknown, keep backing off
  }
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  if (!path.startsWith("/login") && !path.startsWith("/register")) {
    window.location.href = "/login";
  }
}

class AlertStreamStore {
  private state: AlertStreamState = {
    alerts: [],
    unreadCount: 0,
    status: "disconnected",
    errorMessage: null,
    connectedClients: 0,
  };
  private listeners = new Set<Listener>();
  private subscribers = new Map<number, Subscriber>();
  private nextId = 1;
  private es: EventSource | null = null;
  private connectedThreshold: number | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  /** Set by session_revoked / stream_limit / 401 — no further reconnects this page load. */
  private halted = false;

  getState = (): AlertStreamState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private set(patch: Partial<AlertStreamState> | ((prev: AlertStreamState) => AlertStreamState)) {
    this.state = typeof patch === "function" ? patch(this.state) : { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  addSubscriber(sub: Subscriber): number {
    const id = this.nextId++;
    this.subscribers.set(id, sub);
    this.reconcile();
    return id;
  }

  removeSubscriber(id: number) {
    this.subscribers.delete(id);
    this.reconcile();
  }

  acknowledgeAll = () => this.set({ unreadCount: 0 });

  dismissAlert = (alertId: string) =>
    this.set((prev) => ({
      ...prev,
      alerts: prev.alerts.filter((a) => a.id !== alertId),
      unreadCount: Math.max(0, prev.unreadCount - 1),
    }));

  clearAlerts = () => this.set({ alerts: [], unreadCount: 0 });

  private maxAlerts(): number {
    let m = 0;
    this.subscribers.forEach((s) => (m = Math.max(m, s.maxAlerts)));
    return m || 100;
  }

  private minThreshold(): number | null {
    let t: number | null = null;
    this.subscribers.forEach((s) => (t = t === null ? s.severityThreshold : Math.min(t, s.severityThreshold)));
    return t;
  }

  /** Open/close/re-open the single EventSource to match current subscribers. */
  private reconcile() {
    const threshold = this.minThreshold();
    if (threshold === null) {
      this.teardown();
      if (!this.halted) this.set({ status: "disconnected" });
      return;
    }
    if (this.halted) return;
    if (this.es && this.connectedThreshold === threshold) return;
    if (this.reconnectTimer && this.connectedThreshold === threshold) return;
    this.teardown();
    this.attempt = 0;
    this.connect(threshold);
  }

  private teardown() {
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private halt(message: string) {
    this.halted = true;
    this.teardown();
    this.set({ status: "error", errorMessage: message });
  }

  private scheduleReconnect(threshold: number) {
    if (this.halted || this.subscribers.size === 0) return;
    const delay = computeBackoffMs(this.attempt++);
    this.set({
      status: "error",
      errorMessage: `Connection lost. Reconnecting in ${Math.ceil(delay / 1000)}s...`,
    });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(threshold);
    }, delay);
  }

  private handleTerminal(type: string, message?: string) {
    if (type === "session_revoked") {
      this.halt(message ?? "Session is no longer valid. Please sign in again.");
      redirectToLogin();
      return true;
    }
    if (type === "stream_limit") {
      this.halt(message ?? "Live stream closed: too many open streams. Reload to resume.");
      toast.info("Live alerts paused in this tab — too many tabs are streaming. Reload to resume.", {
        id: "sse-stream-limit",
      });
      return true;
    }
    return false;
  }

  private connect(threshold: number) {
    if (this.halted) return;
    this.connectedThreshold = threshold;
    this.set({ status: "connecting", errorMessage: null });

    const es = new EventSource(`/api/sse/alerts?severity=${threshold}`);
    this.es = es;
    const parse = (e: Event): any => {
      try {
        return JSON.parse((e as MessageEvent).data);
      } catch {
        return null;
      }
    };

    es.addEventListener("connected", (e) => {
      this.attempt = 0;
      const data = parse(e);
      this.set({ status: "connected", connectedClients: data?.connectedClients ?? 0, errorMessage: null });
    });

    es.addEventListener("alerts", (e) => {
      const newAlerts: StreamedAlert[] = parse(e)?.alerts ?? [];
      if (newAlerts.length === 0) return;
      const cap = this.maxAlerts();
      this.set((prev) => {
        const existingIds = new Set(prev.alerts.map((a) => a.id));
        const unique = newAlerts.filter((a) => !existingIds.has(a.id));
        return {
          ...prev,
          alerts: [...unique, ...prev.alerts].slice(0, cap),
          unreadCount: prev.unreadCount + unique.length,
        };
      });
    });

    es.addEventListener("heartbeat", (e) => {
      const data = parse(e);
      if (data) this.set((prev) => ({ ...prev, connectedClients: data.connectedClients ?? prev.connectedClients }));
    });

    es.addEventListener("status", (e) => {
      const data = parse(e);
      if (!data) return;
      if (this.handleTerminal(data.type, data.message)) return;
      if (data.type === "indexer_unavailable") {
        this.set({ status: "indexer_unavailable", errorMessage: data.message });
      } else if (data.type === "poll_error") {
        this.set({ errorMessage: data.message });
      }
    });

    // Server may also emit these as named events.
    for (const type of ["session_revoked", "stream_limit"] as const) {
      es.addEventListener(type, (e) => {
        this.handleTerminal(type, parse(e)?.message);
      });
    }

    es.onerror = () => {
      if (this.es !== es) return; // superseded / torn down
      // CLOSED = HTTP-level failure (e.g. 401); CONNECTING = dropped stream.
      const httpFailure = es.readyState === EventSource.CLOSED;
      es.close();
      this.es = null;
      if (this.halted) return;
      if (!httpFailure) {
        this.scheduleReconnect(threshold);
        return;
      }
      void sessionIsValid().then((valid) => {
        if (this.halted || this.es || this.reconnectTimer) return;
        if (valid === false) {
          this.halt("Not signed in.");
          redirectToLogin();
        } else {
          this.scheduleReconnect(threshold);
        }
      });
    };
  }
}

let sharedStore: AlertStreamStore | null = null;
function getStore(): AlertStreamStore {
  if (!sharedStore) sharedStore = new AlertStreamStore();
  return sharedStore;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAlertStream(options: UseAlertStreamOptions = {}) {
  const {
    enabled = true,
    severityThreshold = 10,
    maxAlerts = 100,
  } = options;

  const store = getStore();
  const shared = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  useEffect(() => {
    if (!enabled) return;
    const id = store.addSubscriber({ severityThreshold, maxAlerts });
    return () => store.removeSubscriber(id);
  }, [store, enabled, severityThreshold, maxAlerts]);

  // Paused consumers keep the snapshot they had when paused (the shared
  // stream may still be running for other consumers in this tab).
  const pausedSnapshot = useRef<AlertStreamState | null>(null);
  if (enabled) {
    pausedSnapshot.current = null;
  } else if (!pausedSnapshot.current) {
    pausedSnapshot.current = shared;
  }
  const view = enabled ? shared : pausedSnapshot.current!;

  const alerts = useMemo(
    () => view.alerts.filter((a) => a.rule.level >= severityThreshold).slice(0, maxAlerts),
    [view.alerts, severityThreshold, maxAlerts]
  );

  const acknowledgeAll = useCallback(() => store.acknowledgeAll(), [store]);
  const dismissAlert = useCallback((alertId: string) => store.dismissAlert(alertId), [store]);
  const clearAlerts = useCallback(() => store.clearAlerts(), [store]);

  return {
    ...view,
    alerts,
    status: enabled ? view.status : ("disconnected" as StreamStatus),
    acknowledgeAll,
    dismissAlert,
    clearAlerts,
  };
}
