/**
 * driftComparison.test.ts — Source-level regression tests for DriftComparison.tsx
 *
 * Ensures the hooks-in-map pattern uses a fixed-size padded array
 * so the hook count is always 15 (5 × 3 query types) regardless of
 * how many agents are actually selected.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const DRIFT_PATH = resolve(__dirname, "../../client/src/components/DriftComparison.tsx");

describe("DriftComparison — hooks-in-map safety", () => {
  const source = readFileSync(DRIFT_PATH, "utf8");

  it("pads agentDataQueries to MAX_COMPARE_AGENTS (fixed hook count)", () => {
    // Must have the MAX_COMPARE_AGENTS constant
    expect(source).toContain("MAX_COMPARE_AGENTS");
    // Must pad with empty strings
    expect(source).toContain('padded.push("")');
    // Must slice to the max
    expect(source).toContain("padded.slice(0, MAX_COMPARE_AGENTS)");
  });

  it("all three query blocks use the padded agentDataQueries array", () => {
    // All .map() calls should be on agentDataQueries (the padded version)
    const mapCalls = source.match(/agentDataQueries\.map\(/g);
    expect(mapCalls).not.toBeNull();
    expect(mapCalls!.length).toBe(3); // pkgQueries, svcQueries, usrQueries
  });

  it("all three query blocks have agentId !== '' in the enabled flag", () => {
    // Each query block must guard against empty padding slots
    const enabledGuards = source.match(/agentId !== ""/g);
    expect(enabledGuards).not.toBeNull();
    // 3 query blocks + 3 data map builders = 6 total guards
    expect(enabledGuards!.length).toBeGreaterThanOrEqual(3);
  });

  it("data map builders skip empty padding slots", () => {
    // Each forEach in the data map builders must have the early return
    const skipGuards = source.match(/if \(agentId === ""\) return;/g);
    expect(skipGuards).not.toBeNull();
    expect(skipGuards!.length).toBe(3); // agentPackages, agentServicesMap, agentUsersMap
  });

  it("MAX_COMPARE_AGENTS is 5 (matches UI max)", () => {
    expect(source).toContain("MAX_COMPARE_AGENTS = 5");
  });

  it("query inputs use fallback agentId for padding slots", () => {
    // Padded slots need a non-empty agentId to satisfy the input schema
    const fallbacks = source.match(/agentId: agentId \|\| "__noop__"/g);
    expect(fallbacks).not.toBeNull();
    expect(fallbacks!.length).toBe(3); // one per query type
  });
});
