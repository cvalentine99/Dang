/**
 * useAlertStream — React hook for consuming real-time SSE alerts.
 *
 * Connects to /api/sse/alerts and provides:
 * - Live alert feed with severity filtering
 * - Connection status tracking
 * - Unread count with acknowledge/dismiss
 * - Auto-reconnect on disconnect
 */

import { useState, useEffect, useRef, useCallback } from "react";

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
  /** Auto-reconnect delay in ms (default: 5000) */
  reconnectDelay?: number;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAlertStream(options: UseAlertStreamOptions = {}) {
  const {
    enabled = true,
    severityThreshold = 10,
    maxAlerts = 100,
    reconnectDelay = 5000,
  } = options;

  const [state, setState] = useState<AlertStreamState>({
    alerts: [],
    unreadCount: 0,
    status: "disconnected",
    errorMessage: null,
    connectedClients: 0,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // FT-4: Acknowledge all alerts — browser-only UI state reset.
  // This does NOT write back to Wazuh or any backend; it only clears the
  // unread badge in the current browser session.
  const acknowledgeAll = useCallback(() => {
    setState((prev) => ({ ...prev, unreadCount: 0 }));
  }, []);

  // Dismiss a specific alert
  const dismissAlert = useCallback((alertId: string) => {
    setState((prev) => ({
      ...prev,
      alerts: prev.alerts.filter((a) => a.id !== alertId),
      unreadCount: Math.max(0, prev.unreadCount - 1),
    }));
  }, []);

  // Clear all alerts
  const clearAlerts = useCallback(() => {
    setState((prev) => ({
      ...prev,
      alerts: [],
      unreadCount: 0,
    }));
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Clean up if disabled
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setState((prev) => ({ ...prev, status: "disconnected" }));
      return;
    }

    function connect() {
      setState((prev) => ({ ...prev, status: "connecting", errorMessage: null }));

      const url = `/api/sse/alerts?severity=${severityThreshold}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.addEventListener("connected", (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          setState((prev) => ({
            ...prev,
            status: "connected",
            connectedClients: data.connectedClients ?? 0,
            errorMessage: null,
          }));
        } catch {
          setState((prev) => ({ ...prev, status: "connected" }));
        }
      });

      es.addEventListener("alerts", (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          const newAlerts: StreamedAlert[] = data.alerts ?? [];
          if (newAlerts.length > 0) {
            setState((prev) => {
              // Deduplicate by ID
              const existingIds = new Set(prev.alerts.map((a) => a.id));
              const unique = newAlerts.filter((a) => !existingIds.has(a.id));
              const merged = [...unique, ...prev.alerts].slice(0, maxAlerts);
              return {
                ...prev,
                alerts: merged,
                unreadCount: prev.unreadCount + unique.length,
              };
            });
          }
        } catch {
          // Ignore parse errors
        }
      });

      es.addEventListener("heartbeat", (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          setState((prev) => ({
            ...prev,
            connectedClients: data.connectedClients ?? prev.connectedClients,
          }));
        } catch {
          // Ignore
        }
      });

      es.addEventListener("status", (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          if (data.type === "indexer_unavailable") {
            setState((prev) => ({
              ...prev,
              status: "indexer_unavailable",
              errorMessage: data.message,
            }));
          } else if (data.type === "poll_error") {
            setState((prev) => ({
              ...prev,
              errorMessage: data.message,
            }));
          }
        } catch {
          // Ignore
        }
      });

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        setState((prev) => ({
          ...prev,
          status: "error",
          errorMessage: "Connection lost. Reconnecting...",
        }));

        // Auto-reconnect
        reconnectTimerRef.current = setTimeout(connect, reconnectDelay);
      };
    }

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [enabled, severityThreshold, maxAlerts, reconnectDelay]);

  return {
    ...state,
    acknowledgeAll,
    dismissAlert,
    clearAlerts,
  };
}
