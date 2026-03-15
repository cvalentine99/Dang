/**
 * Tests for T2-04: SENTINEL_IDS handling in pipeline dedup logic.
 *
 * Verifies that sentinel alert IDs (unknown, none, null, etc.) are correctly
 * detected and replaced with content-hash dedup keys to prevent false collisions.
 */

import { describe, it, expect } from "vitest";
import { createHash } from "crypto";

// ── Extracted dedup logic from pipelineRouter.ts for unit testing ─────────

const SENTINEL_IDS = new Set(["unknown", "none", "null", "undefined", "n/a", ""]);

function resolveAlertId(rawAlert: Record<string, unknown>): string {
  const rawAlertId = rawAlert.id ?? rawAlert._id ?? rawAlert.alert_id ?? rawAlert.alertId;
  const resolvedRawId = rawAlertId ? String(rawAlertId).trim() : "";
  return (resolvedRawId && !SENTINEL_IDS.has(resolvedRawId.toLowerCase()))
    ? resolvedRawId
    : `hash-${createHash("sha256").update(JSON.stringify(rawAlert)).digest("hex").slice(0, 16)}`;
}

describe("Sentinel ID Dedup", () => {
  it("uses real alert ID when present and not sentinel", () => {
    const alert = { id: "alert-12345", rule: { id: "550" } };
    expect(resolveAlertId(alert)).toBe("alert-12345");
  });

  it("falls back to content hash for 'unknown' ID", () => {
    const alert = { id: "unknown", rule: { id: "550" }, data: { srcip: "10.0.0.1" } };
    const result = resolveAlertId(alert);
    expect(result).toMatch(/^hash-[a-f0-9]{16}$/);
  });

  it("falls back to content hash for 'none' ID", () => {
    const alert = { id: "none", rule: { id: "550" } };
    const result = resolveAlertId(alert);
    expect(result).toMatch(/^hash-[a-f0-9]{16}$/);
  });

  it("falls back to content hash for 'null' string ID", () => {
    const alert = { id: "null", rule: { id: "550" } };
    const result = resolveAlertId(alert);
    expect(result).toMatch(/^hash-[a-f0-9]{16}$/);
  });

  it("falls back to content hash for 'undefined' string ID", () => {
    const alert = { id: "undefined", rule: { id: "550" } };
    const result = resolveAlertId(alert);
    expect(result).toMatch(/^hash-[a-f0-9]{16}$/);
  });

  it("falls back to content hash for 'n/a' ID", () => {
    const alert = { id: "n/a", rule: { id: "550" } };
    const result = resolveAlertId(alert);
    expect(result).toMatch(/^hash-[a-f0-9]{16}$/);
  });

  it("falls back to content hash for empty string ID", () => {
    const alert = { id: "", rule: { id: "550" } };
    const result = resolveAlertId(alert);
    expect(result).toMatch(/^hash-[a-f0-9]{16}$/);
  });

  it("falls back to content hash when no ID field exists", () => {
    const alert = { rule: { id: "550" }, data: { srcip: "10.0.0.1" } };
    const result = resolveAlertId(alert);
    expect(result).toMatch(/^hash-[a-f0-9]{16}$/);
  });

  it("is case-insensitive for sentinel detection", () => {
    const alert1 = { id: "UNKNOWN", rule: { id: "550" } };
    const alert2 = { id: "Unknown", rule: { id: "550" } };
    expect(resolveAlertId(alert1)).toMatch(/^hash-/);
    expect(resolveAlertId(alert2)).toMatch(/^hash-/);
  });

  it("trims whitespace before sentinel check", () => {
    const alert = { id: "  unknown  ", rule: { id: "550" } };
    expect(resolveAlertId(alert)).toMatch(/^hash-/);
  });

  it("generates different hashes for different alert bodies", () => {
    const alert1 = { id: "unknown", data: { srcip: "10.0.0.1" } };
    const alert2 = { id: "unknown", data: { srcip: "10.0.0.2" } };
    const hash1 = resolveAlertId(alert1);
    const hash2 = resolveAlertId(alert2);
    expect(hash1).not.toBe(hash2);
  });

  it("generates same hash for identical alert bodies", () => {
    const alert = { id: "unknown", data: { srcip: "10.0.0.1" } };
    expect(resolveAlertId(alert)).toBe(resolveAlertId(alert));
  });

  it("reads from _id field as fallback", () => {
    const alert = { _id: "wazuh-alert-789" };
    expect(resolveAlertId(alert)).toBe("wazuh-alert-789");
  });

  it("reads from alert_id field as fallback", () => {
    const alert = { alert_id: "custom-id-456" };
    expect(resolveAlertId(alert)).toBe("custom-id-456");
  });

  it("reads from alertId field as fallback", () => {
    const alert = { alertId: "camelCase-id-123" };
    expect(resolveAlertId(alert)).toBe("camelCase-id-123");
  });
});
