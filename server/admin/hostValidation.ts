/**
 * Host Validation — SSRF defense for admin-configurable connection hosts.
 *
 * Allowlist approach:
 * - RFC 1918 private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 * - Blocks cloud metadata endpoints (169.254.169.254, fd00::, etc.)
 * - Blocks localhost/loopback (127.0.0.0/8, ::1, 0.0.0.0)
 * - Hostnames are resolved to IPs and validated against the same rules
 */

import { lookup } from "dns/promises";

// ── IP Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse an IPv4 address string into a 32-bit number.
 * Returns null if the string is not a valid IPv4 address.
 */
function parseIPv4(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    const num = parseInt(part, 10);
    if (isNaN(num) || num < 0 || num > 255 || part !== String(num)) return null;
    result = (result << 8) | num;
  }
  return result >>> 0; // Ensure unsigned 32-bit
}

/**
 * Check if an IP (as 32-bit number) falls within a CIDR range.
 */
function isInCIDR(ip: number, network: number, prefixLen: number): boolean {
  const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
  return (ip & mask) === (network & mask);
}

// ── Blocked Ranges ─────────────────────────────────────────────────────────

/** Ranges that are ALWAYS blocked regardless of other rules. */
const BLOCKED_RANGES = [
  // Loopback: 127.0.0.0/8
  { network: parseIPv4("127.0.0.0")!, prefix: 8, label: "loopback (127.0.0.0/8)" },
  // Link-local / cloud metadata: 169.254.0.0/16 (includes 169.254.169.254)
  { network: parseIPv4("169.254.0.0")!, prefix: 16, label: "link-local / cloud metadata (169.254.0.0/16)" },
  // Current network: 0.0.0.0/8
  { network: parseIPv4("0.0.0.0")!, prefix: 8, label: "current network (0.0.0.0/8)" },
  // Broadcast: 255.255.255.255/32
  { network: parseIPv4("255.255.255.255")!, prefix: 32, label: "broadcast (255.255.255.255)" },
];

/** Blocked hostname patterns (case-insensitive). */
const BLOCKED_HOSTNAMES = [
  "localhost",
  "metadata.google.internal",
  "metadata.internal",
  "instance-data",
];

/** RFC 1918 private ranges — these are ALLOWED. */
const ALLOWED_PRIVATE_RANGES = [
  // 10.0.0.0/8
  { network: parseIPv4("10.0.0.0")!, prefix: 8, label: "10.0.0.0/8" },
  // 172.16.0.0/12
  { network: parseIPv4("172.16.0.0")!, prefix: 12, label: "172.16.0.0/12" },
  // 192.168.0.0/16
  { network: parseIPv4("192.168.0.0")!, prefix: 16, label: "192.168.0.0/16" },
];

// ── Validation ─────────────────────────────────────────────────────────────

export interface HostValidationResult {
  allowed: boolean;
  reason: string;
  resolvedIP?: string;
  /** The IP that was validated and should be used for the actual connection.
   *  Callers MUST connect to this IP (not re-resolve the hostname) to prevent DNS rebinding. */
  pinnedIP?: string;
}

/**
 * Validate an IPv4 address against the allowlist.
 * Returns { allowed, reason } indicating whether the IP is safe to connect to.
 */
export function validateIPv4(ip: string): HostValidationResult {
  const parsed = parseIPv4(ip);
  if (parsed === null) {
    return { allowed: false, reason: `Invalid IPv4 address: ${ip}` };
  }

  // Check blocked ranges first
  for (const range of BLOCKED_RANGES) {
    if (isInCIDR(parsed, range.network, range.prefix)) {
      return {
        allowed: false,
        reason: `Blocked: ${ip} is in ${range.label}`,
        resolvedIP: ip,
      };
    }
  }

  // Check if in allowed RFC 1918 ranges
  for (const range of ALLOWED_PRIVATE_RANGES) {
    if (isInCIDR(parsed, range.network, range.prefix)) {
      return {
        allowed: true,
        reason: `Allowed: ${ip} is in RFC 1918 range ${range.label}`,
        resolvedIP: ip,
      };
    }
  }

  // Not in any allowed range — block by default
  return {
    allowed: false,
    reason: `Blocked: ${ip} is not in any allowed RFC 1918 range (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)`,
    resolvedIP: ip,
  };
}

/**
 * Validate a hostname by resolving it to an IP and checking the allowlist.
 * Also checks for blocked hostname patterns.
 */
export async function validateHost(host: string): Promise<HostValidationResult> {
  // Strip any surrounding whitespace
  const trimmed = host.trim();

  if (!trimmed) {
    return { allowed: false, reason: "Host is empty" };
  }

  // Block IPv6 addresses (we only support IPv4 for Wazuh connections)
  if (trimmed.includes(":") && !trimmed.includes(".")) {
    return { allowed: false, reason: `Blocked: IPv6 addresses are not supported (${trimmed})` };
  }

  // Check for blocked hostnames
  const lowerHost = trimmed.toLowerCase();
  for (const blocked of BLOCKED_HOSTNAMES) {
    if (lowerHost === blocked || lowerHost.endsWith(`.${blocked}`)) {
      return { allowed: false, reason: `Blocked hostname: ${trimmed}` };
    }
  }

  // If it looks like an IPv4 address, validate directly
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) {
    return validateIPv4(trimmed);
  }

  // Resolve hostname to IP
  try {
    const result = await lookup(trimmed, { family: 4 });
    const resolvedIP = result.address;
    const ipResult = validateIPv4(resolvedIP);
    return {
      ...ipResult,
      reason: ipResult.allowed
        ? `Allowed: ${trimmed} resolves to ${resolvedIP} (${ipResult.reason})`
        : `Blocked: ${trimmed} resolves to ${resolvedIP} — ${ipResult.reason}`,
      resolvedIP,
      // Pin the resolved IP so callers connect to this exact address
      // instead of re-resolving (which could return a different IP — DNS rebinding)
      pinnedIP: ipResult.allowed ? resolvedIP : undefined,
    };
  } catch {
    return {
      allowed: false,
      reason: `Cannot resolve hostname: ${trimmed}`,
    };
  }
}
