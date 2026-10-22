/**
 * Upstream URL scheme validation.
 *
 * Every upstream base URL in this app is built by string concatenation
 * (`${protocol}://${host}:${port}`), so an unvalidated `protocol` value such as
 * `https://attacker.example/x#` would redirect the whole request — credentials
 * included — to another origin. Accept exactly two schemes everywhere.
 */
import { z } from "zod";

export const UPSTREAM_PROTOCOLS = ["https", "http"] as const;
export type UpstreamProtocol = (typeof UPSTREAM_PROTOCOLS)[number];

export const protocolSchema = z.enum(UPSTREAM_PROTOCOLS);

export function isUpstreamProtocol(v: unknown): v is UpstreamProtocol {
  return v === "https" || v === "http";
}

/** Coerce an untrusted value (env, DB row, form field) to a valid scheme, else `fallback`. */
export function asProtocol(v: unknown, fallback: UpstreamProtocol): UpstreamProtocol {
  if (typeof v !== "string") return fallback;
  const lower = v.trim().toLowerCase();
  return isUpstreamProtocol(lower) ? lower : fallback;
}
