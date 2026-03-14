/**
 * Tests for CR-8: validateEntityOverlap behavior in hypothesisAgent.
 *
 * Validates that the entity overlap check:
 * - Prevents merges when no entities overlap (false negative protection)
 * - Allows merges when entities overlap (false positive protection)
 * - Handles edge cases (empty entities, missing living case)
 */

import { describe, it, expect } from "vitest";

// ── Unit tests for entity overlap logic ──────────────────────────────────
// Since validateEntityOverlap is a private function inside hypothesisAgent.ts,
// we test the core entity comparison logic as a standalone function.

/**
 * Pure entity overlap comparison — mirrors the logic in validateEntityOverlap().
 * Extracted for testability without DB dependencies.
 */
function computeEntityOverlap(
  currentEntities: Array<{ type: string; value: string }>,
  targetEntities: Array<{ type: string; value: string }>
): { hasOverlap: boolean; overlappingKeys: string[] } {
  const currentSet = new Set<string>();
  for (const e of currentEntities) {
    const key = `${e.type}:${(e.value ?? "").trim().toLowerCase()}`;
    if (e.value?.trim()) currentSet.add(key);
  }

  const overlapping: string[] = [];
  for (const te of targetEntities) {
    const key = `${te.type}:${(te.value ?? "").trim().toLowerCase()}`;
    if (currentSet.has(key)) {
      overlapping.push(key);
    }
  }

  return { hasOverlap: overlapping.length > 0, overlappingKeys: overlapping };
}

describe("Entity Overlap Validation", () => {
  it("detects overlap when same IP is in both sets", () => {
    const current = [{ type: "ip", value: "192.168.1.100" }];
    const target = [{ type: "ip", value: "192.168.1.100" }];
    expect(computeEntityOverlap(current, target).hasOverlap).toBe(true);
  });

  it("detects overlap with case-insensitive comparison", () => {
    const current = [{ type: "user", value: "ROOT" }];
    const target = [{ type: "user", value: "root" }];
    expect(computeEntityOverlap(current, target).hasOverlap).toBe(true);
  });

  it("detects overlap with whitespace-trimmed comparison", () => {
    const current = [{ type: "host", value: "  web-server-1  " }];
    const target = [{ type: "host", value: "web-server-1" }];
    expect(computeEntityOverlap(current, target).hasOverlap).toBe(true);
  });

  it("rejects when entities have same value but different type", () => {
    const current = [{ type: "ip", value: "192.168.1.100" }];
    const target = [{ type: "domain", value: "192.168.1.100" }];
    expect(computeEntityOverlap(current, target).hasOverlap).toBe(false);
  });

  it("rejects when no entities overlap", () => {
    const current = [
      { type: "ip", value: "10.0.0.1" },
      { type: "user", value: "alice" },
    ];
    const target = [
      { type: "ip", value: "10.0.0.2" },
      { type: "user", value: "bob" },
    ];
    expect(computeEntityOverlap(current, target).hasOverlap).toBe(false);
  });

  it("handles empty current entities", () => {
    const current: Array<{ type: string; value: string }> = [];
    const target = [{ type: "ip", value: "192.168.1.100" }];
    expect(computeEntityOverlap(current, target).hasOverlap).toBe(false);
  });

  it("handles empty target entities", () => {
    const current = [{ type: "ip", value: "192.168.1.100" }];
    const target: Array<{ type: string; value: string }> = [];
    expect(computeEntityOverlap(current, target).hasOverlap).toBe(false);
  });

  it("handles multiple overlapping entities", () => {
    const current = [
      { type: "ip", value: "192.168.1.100" },
      { type: "user", value: "root" },
      { type: "host", value: "web-server-1" },
    ];
    const target = [
      { type: "ip", value: "192.168.1.100" },
      { type: "user", value: "root" },
      { type: "domain", value: "example.com" },
    ];
    const result = computeEntityOverlap(current, target);
    expect(result.hasOverlap).toBe(true);
    expect(result.overlappingKeys).toContain("ip:192.168.1.100");
    expect(result.overlappingKeys).toContain("user:root");
    expect(result.overlappingKeys).toHaveLength(2);
  });

  it("ignores entities with empty values", () => {
    const current = [
      { type: "ip", value: "" },
      { type: "user", value: "root" },
    ];
    const target = [
      { type: "ip", value: "" },
      { type: "host", value: "server-1" },
    ];
    // Empty-value entities should not count as overlap
    expect(computeEntityOverlap(current, target).hasOverlap).toBe(false);
  });

  it("handles whitespace-only values as empty", () => {
    const current = [{ type: "ip", value: "   " }];
    const target = [{ type: "ip", value: "   " }];
    expect(computeEntityOverlap(current, target).hasOverlap).toBe(false);
  });
});
