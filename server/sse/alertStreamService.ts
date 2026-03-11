/**
 * SSE Alert Stream Service
 *
 * Polls the Wazuh Indexer for new critical/high alerts and pushes them
 * to connected SSE clients. Operator-controlled — no silent automation.
 *
 * Design:
 * - Poll interval: configurable, default 30s, minimum 15s
 * - Severity threshold: configurable (default: level >= 10, i.e. high+critical)
 * - Deduplication: tracks last-seen alert timestamp to avoid replays
 * - Connection management: heartbeat every 15s, cleanup on disconnect
 * - Rate-limited: uses the indexer client's built-in rate limiter
 */

import type { Request, Response } from "express";
import {
  getEffectiveIndexerConfig,
  indexerSearch,
  INDEX_PATTERNS,
  boolQuery,
  type ESSearchResponse,
} from "../indexer/indexerClient";

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

interface SSEClient {
  id: string;
  res: Response;
  connectedAt: number;
  severityThreshold: number;
}

// ── State ────────────────────────────────────────────────────────────────────

const clients = new Map<string, SSEClient>();
let pollInterval: ReturnType<typeof setInterval> | null = null;
let lastPollTimestamp: string | null = null;
let isPolling = false;

// ── Configuration ────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = Math.max(
  15_000,
  parseInt(process.env.SSE_ALERT_POLL_INTERVAL ?? "30000", 10)
);
const HEARTBEAT_INTERVAL_MS = 15_000;
const DEFAULT_SEVERITY_THRESHOLD = 10; // rule.level >= 10 (high + critical)
const MAX_ALERTS_PER_POLL = 50;
const LOOKBACK_WINDOW = "now-2m"; // On first poll, look back 2 minutes

// ── Client Management ────────────────────────────────────────────────────────

function generateClientId(): string {
  return `sse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getConnectedClientCount(): number {
  return clients.size;
}

function sendEvent(client: SSEClient, event: string, data: unknown): boolean {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    // Client disconnected
    clients.delete(client.id);
    return false;
  }
}

function broadcastAlerts(alerts: StreamedAlert[]): void {
  Array.from(clients.entries()).forEach(([id, client]) => {
    const filtered = alerts.filter(
      (a) => a.rule.level >= client.severityThreshold
    );
    if (filtered.length > 0) {
      const ok = sendEvent(client, "alerts", {
        alerts: filtered,
        count: filtered.length,
        timestamp: new Date().toISOString(),
      });
      if (!ok) clients.delete(id);
    }
  });
}

// ── Polling ──────────────────────────────────────────────────────────────────

async function pollForAlerts(): Promise<void> {
  if (isPolling || clients.size === 0) return;
  isPolling = true;

  try {
    const config = await getEffectiveIndexerConfig();
    if (!config) {
      // Indexer not configured — send status event
      Array.from(clients.entries()).forEach(([id, client]) => {
        const ok = sendEvent(client, "status", {
          type: "indexer_unavailable",
          message: "Wazuh Indexer not configured",
        });
        if (!ok) clients.delete(id);
      });
      return;
    }

    // Find the minimum severity threshold across all clients
    const minThreshold = Math.min(
      ...Array.from(clients.values()).map((c) => c.severityThreshold)
    );

    const fromTime = lastPollTimestamp ?? LOOKBACK_WINDOW;
    const toTime = "now";

    // Audit #50: Use `gt` (strictly greater-than) for the lower bound when
    // resuming from a previous poll timestamp. The old code used `gte` via
    // timeRangeFilter(), which re-fetched the last alert every cycle.
    // On the first poll (fromTime is a relative expression like "now-2m"),
    // `gte` is correct because there's no overlap risk.
    const timeFilter = lastPollTimestamp
      ? { range: { timestamp: { gt: fromTime, lte: toTime, format: "strict_date_optional_time" } } }
      : { range: { timestamp: { gte: fromTime, lte: toTime, format: "strict_date_optional_time" } } };

    const query = boolQuery({
      filter: [
        timeFilter,
        { range: { "rule.level": { gte: minThreshold } } },
      ],
    });

    const result: ESSearchResponse = await indexerSearch(
      config,
      INDEX_PATTERNS.ALERTS,
      {
        query,
        size: MAX_ALERTS_PER_POLL,
        sort: [{ timestamp: { order: "desc" } }],
        _source: [
          "timestamp",
          "rule.id",
          "rule.level",
          "rule.description",
          "rule.groups",
          "rule.mitre",
          "agent.id",
          "agent.name",
          "agent.ip",
          "decoder.name",
          "location",
        ],
      },
      "sse-alerts"
    );

    const hits = result.hits?.hits ?? [];
    if (hits.length > 0) {
      const alerts: StreamedAlert[] = hits.map((h) => {
        const s = h._source;
        return {
          id: h._id,
          timestamp: (s.timestamp as string) ?? new Date().toISOString(),
          rule: {
            id: (s.rule as Record<string, unknown>)?.id as string | number ?? 0,
            level: ((s.rule as Record<string, unknown>)?.level as number) ?? 0,
            description: ((s.rule as Record<string, unknown>)?.description as string) ?? "",
            groups: (s.rule as Record<string, unknown>)?.groups as string[] | undefined,
            mitre: (s.rule as Record<string, unknown>)?.mitre as StreamedAlert["rule"]["mitre"],
          },
          agent: {
            id: ((s.agent as Record<string, unknown>)?.id as string) ?? "000",
            name: ((s.agent as Record<string, unknown>)?.name as string) ?? "unknown",
            ip: (s.agent as Record<string, unknown>)?.ip as string | undefined,
          },
          decoder: s.decoder as { name?: string } | undefined,
          location: s.location as string | undefined,
        };
      });

      // Update last poll timestamp to the newest alert
      const newestTimestamp = alerts[0]?.timestamp;
      if (newestTimestamp) {
        lastPollTimestamp = newestTimestamp;
      }

      broadcastAlerts(alerts);
    }
  } catch (err) {
    // Send error status to clients but don't disconnect them
    Array.from(clients.entries()).forEach(([id, client]) => {
      const ok = sendEvent(client, "status", {
        type: "poll_error",
        message: (err as Error).message?.substring(0, 200) ?? "Unknown error",
      });
      if (!ok) clients.delete(id);
    });
  } finally {
    isPolling = false;
  }
}

function startPolling(): void {
  if (pollInterval) return;
  pollInterval = setInterval(pollForAlerts, POLL_INTERVAL_MS);
  // Also do an immediate first poll
  pollForAlerts();
}

function stopPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ── SSE Handler ──────────────────────────────────────────────────────────────

export function handleSSEConnection(req: Request, res: Response): void {
  // Parse severity threshold from query string
  const severityParam = req.query.severity;
  const severityThreshold =
    typeof severityParam === "string"
      ? Math.max(1, Math.min(15, parseInt(severityParam, 10) || DEFAULT_SEVERITY_THRESHOLD))
      : DEFAULT_SEVERITY_THRESHOLD;

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // Disable Nginx buffering
  });

  const clientId = generateClientId();
  const client: SSEClient = {
    id: clientId,
    res,
    connectedAt: Date.now(),
    severityThreshold,
  };

  clients.set(clientId, client);

  // Send initial connection event
  sendEvent(client, "connected", {
    clientId,
    severityThreshold,
    pollIntervalMs: POLL_INTERVAL_MS,
    connectedClients: clients.size,
  });

  // Start polling if this is the first client
  if (clients.size === 1) {
    startPolling();
  }

  // Heartbeat to keep connection alive
  const heartbeat = setInterval(() => {
    const ok = sendEvent(client, "heartbeat", {
      timestamp: new Date().toISOString(),
      connectedClients: clients.size,
    });
    if (!ok) {
      clearInterval(heartbeat);
      clients.delete(clientId);
      if (clients.size === 0) stopPolling();
    }
  }, HEARTBEAT_INTERVAL_MS);

  // Cleanup on disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(clientId);
    if (clients.size === 0) {
      stopPolling();
      lastPollTimestamp = null; // Reset on last disconnect
    }
  });
}

// ── Stats (for admin/debug) ──────────────────────────────────────────────────

export function getStreamStats() {
  return {
    connectedClients: clients.size,
    isPolling: !!pollInterval,
    pollIntervalMs: POLL_INTERVAL_MS,
    lastPollTimestamp,
    clients: Array.from(clients.values()).map((c) => ({
      id: c.id,
      connectedAt: new Date(c.connectedAt).toISOString(),
      severityThreshold: c.severityThreshold,
    })),
  };
}
