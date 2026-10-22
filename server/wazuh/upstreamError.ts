/**
 * Upstream error sanitization (review M1).
 *
 * Upstream response bodies (Wazuh, Indexer, Splunk, OTX) can carry internal
 * hostnames, index names, query fragments, stack traces or credential hints.
 * They are NEVER relayed to the browser. Instead every upstream failure is:
 *
 *   1. logged server-side in full, tagged with a short correlation id, and
 *   2. surfaced to the caller as a generic message carrying only that id,
 *      the HTTP status (if any) and a coarse network code (ECONNREFUSED, …).
 *
 * An analyst reports "Indexer upstream error (HTTP 400) [3f9a1c2e]" and an
 * operator greps the server log for `3f9a1c2e` to see the real body.
 */
import { randomBytes } from "node:crypto";
import axios from "axios";
import { TRPCError } from "@trpc/server";

/**
 * M5: response/redirect limits shared by every upstream axios instance.
 * 25 MB comfortably exceeds the largest legitimate page (500 rows) while
 * stopping a hostile or misconfigured upstream from exhausting memory, and
 * redirects are never followed (a redirect would re-send credentials to
 * whatever origin the Location header names).
 */
export const UPSTREAM_MAX_CONTENT_LENGTH = 25 * 1024 * 1024;
export const UPSTREAM_MAX_BODY_LENGTH = 1 * 1024 * 1024;
export const UPSTREAM_AXIOS_LIMITS = {
  maxContentLength: UPSTREAM_MAX_CONTENT_LENGTH,
  maxBodyLength: UPSTREAM_MAX_BODY_LENGTH,
  maxRedirects: 0,
} as const;

export type UpstreamName = "Wazuh" | "Indexer" | "Splunk" | "OTX";

/** 8-hex-char id, unique enough to grep a log for. */
export function newCorrelationId(): string {
  return randomBytes(4).toString("hex");
}

/** Network error codes that are safe (and useful) to show — they reveal no upstream content. */
const SAFE_NETWORK_CODES = new Set([
  "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ECONNABORTED", "ENOTFOUND", "EHOSTUNREACH",
  "ENETUNREACH", "EAI_AGAIN", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "ERR_FR_MAX_BODY_LENGTH_EXCEEDED",
  "ERR_BAD_RESPONSE", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_CONNECT_TIMEOUT",
]);

/** Error carrying only client-safe information; the full detail is in the server log under `correlationId`. */
export class UpstreamError extends Error {
  readonly upstream: UpstreamName;
  readonly correlationId: string;
  readonly status?: number;
  readonly code?: string;
  /**
   * @param fixedMessage optional client-safe text written by US (never upstream
   *   content), e.g. "OTX authentication failed. Check your API key." — the
   *   correlation id is appended.
   */
  constructor(upstream: UpstreamName, correlationId: string, status?: number, code?: string, fixedMessage?: string) {
    const what = status !== undefined ? ` (HTTP ${status})` : code ? ` (${code})` : "";
    super(fixedMessage ? `${fixedMessage} [${correlationId}]` : `${upstream} upstream error${what} [${correlationId}]`);
    this.name = "UpstreamError";
    this.upstream = upstream;
    this.correlationId = correlationId;
    this.status = status;
    this.code = code;
  }
}

/** Full, server-side-only description of an upstream failure (status, code, truncated body, message). */
function describeForLog(err: unknown): { status?: number; code?: string; detail: string } {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data;
    const body = data === undefined ? "" :
      typeof data === "string" ? data : (() => { try { return JSON.stringify(data); } catch { return String(data); } })();
    return {
      status,
      code: err.code,
      detail: `status=${status ?? "-"} code=${err.code ?? "-"} url=${err.config?.url ?? "-"} msg=${err.message} body=${body.slice(0, 2000)}`,
    };
  }
  const e = err as { statusCode?: number; status?: number; code?: string; message?: string; cause?: { code?: string } } | null;
  const status = typeof e?.statusCode === "number" ? e.statusCode : typeof e?.status === "number" ? e.status : undefined;
  const code = e?.code ?? e?.cause?.code;
  return { status, code, detail: `status=${status ?? "-"} code=${code ?? "-"} msg=${e?.message ?? String(err)}` };
}

/**
 * Log `err` in full under a fresh correlation id and return a sanitized
 * UpstreamError. Already-sanitized errors (UpstreamError, TRPCError) are
 * returned unchanged so wrapping is idempotent.
 */
export function sanitizeUpstreamError(upstream: UpstreamName, err: unknown, context = ""): Error {
  if (err instanceof UpstreamError || err instanceof TRPCError) return err;
  const id = newCorrelationId();
  const { status, code, detail } = describeForLog(err);
  console.error(`[${upstream}] upstream error [${id}]${context ? ` ${context}` : ""}: ${detail}`);
  return new UpstreamError(upstream, id, status, code && SAFE_NETWORK_CODES.has(code) ? code : undefined);
}

/** Client-safe message for any error thrown by an upstream call (sanitizes unknown errors). */
export function publicUpstreamMessage(upstream: UpstreamName, err: unknown, context = ""): string {
  return sanitizeUpstreamError(upstream, err, context).message;
}
