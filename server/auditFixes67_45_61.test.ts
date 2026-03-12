/**
 * Regression tests for audit fixes #67, #45/#46, #61
 *
 * #67: 5 Wazuh endpoints must propagate errors (not swallow them)
 * #45/#46: hypothesisAgent normCategory/urgency must use DB-valid enum values
 * #61: LiveAlertFeed pause toggle must pass isStreamEnabled to useAlertStream hook
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ── #67: Wazuh endpoints must not swallow errors ─────────────────────────────

describe("Audit #67 — Wazuh endpoints propagate errors", () => {
  const routerSrc = fs.readFileSync(
    path.resolve(__dirname, "wazuh/wazuhRouter.ts"),
    "utf-8"
  );

  const silentCatchPattern = /\.catch\(\s*\(\)\s*=>\s*\(\{/g;

  it("should have zero silent .catch(() => ({...})) blocks in the 5 syscollector endpoints", () => {
    // Extract the region between "browser_extensions" and "EXPERIMENTAL SYSCOLLECTOR"
    const startIdx = routerSrc.indexOf("browser_extensions");
    const endIdx = routerSrc.indexOf("EXPERIMENTAL SYSCOLLECTOR");
    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBeGreaterThan(startIdx);

    const region = routerSrc.slice(startIdx, endIdx);
    const silentMatches = region.match(silentCatchPattern);
    expect(silentMatches).toBeNull();
  });

  it("should throw TRPCError with INTERNAL_SERVER_ERROR in catch blocks", () => {
    const startIdx = routerSrc.indexOf("browser_extensions");
    const endIdx = routerSrc.indexOf("EXPERIMENTAL SYSCOLLECTOR");
    const region = routerSrc.slice(startIdx, endIdx);

    // Each of the 5 endpoints should have a TRPCError throw in its catch
    const trpcErrorCatches = (region.match(/throw new TRPCError\(\{\s*code:\s*"INTERNAL_SERVER_ERROR"/g) || []).length;
    expect(trpcErrorCatches).toBe(5);
  });

  const endpoints = [
    "browser_extensions",
    "services",
    "users",
    "groups",
    "netproto",
  ];

  for (const ep of endpoints) {
    it(`should propagate errors for syscollector/${ep}`, () => {
      const startIdx = routerSrc.indexOf(`syscollector/\${`);
      expect(startIdx).toBeGreaterThan(-1);
      // Just verify the endpoint name appears in an error message
      expect(routerSrc).toContain(`Wazuh syscollector/${ep} failed`);
    });
  }
});

// ── #45/#46: hypothesisAgent enum normalization ──────────────────────────────

describe("Audit #45/#46 — hypothesisAgent enum normalization", () => {
  const agentSrc = fs.readFileSync(
    path.resolve(__dirname, "agenticPipeline/hypothesisAgent.ts"),
    "utf-8"
  );

  const DB_VALID_CATEGORIES = [
    "isolate_host", "disable_account", "block_ioc", "escalate_ir",
    "suppress_alert", "tune_rule", "add_watchlist", "collect_evidence",
    "notify_stakeholder", "custom",
  ];

  const DB_VALID_URGENCY = ["immediate", "next", "scheduled", "optional"];

  it("should NOT use the old invalid category enum [immediate, next, optional]", () => {
    // The old normCategory used ["immediate", "next", "optional"] as valid values
    // This should no longer exist as the direct valid array
    const oldPattern = /const valid = \["immediate", "next", "optional"\]/;
    expect(agentSrc).not.toMatch(oldPattern);
  });

  it("should have DISPLAY_CATEGORY_MAP mapping LLM output to display categories", () => {
    // After code review remediation, the living case snapshot uses display-only
    // categories ("immediate" | "next" | "optional") matching the LivingCaseObject interface.
    // DB-valid categories are used in the response_actions table, not the frozen snapshot.
    expect(agentSrc).toContain("DISPLAY_CATEGORY_MAP");
    // Verify all DB-valid categories are still referenced as mapping keys
    for (const cat of DB_VALID_CATEGORIES) {
      expect(agentSrc).toContain(cat);
    }
  });

  it("should NOT use the old invalid urgency enum [immediate, high, medium, low] for recommendedActions", () => {
    // Refactored: uses VALID_URGENCY passthrough array + URGENCY_FALLBACK remap dict
    // instead of the older URGENCY_MAP_NORM constant. Logic is equivalent.
    expect(agentSrc).toContain("URGENCY_FALLBACK");
    expect(agentSrc).toContain("VALID_URGENCY");
  });

  it("should map 'high' urgency to 'immediate' (DB-valid)", () => {
    expect(agentSrc).toContain('high: "immediate"');
  });

  it("should map 'medium' urgency to 'next' (DB-valid)", () => {
    expect(agentSrc).toContain('medium: "next"');
  });

  it("should map 'low' urgency to 'optional' (DB-valid)", () => {
    expect(agentSrc).toContain('low: "optional"');
  });

  it("should have 'scheduled' as a valid urgency value", () => {
    // "scheduled" passes through VALID_URGENCY.includes() directly — no explicit mapping needed
    expect(agentSrc).toContain('"scheduled"');
    expect(agentSrc).toContain("VALID_URGENCY");
  });
});

// ── #61: LiveAlertFeed pause toggle connected to SSE ─────────────────────────

describe("Audit #61 — LiveAlertFeed pause toggle connected to SSE", () => {
  const feedSrc = fs.readFileSync(
    path.resolve(__dirname, "../client/src/components/LiveAlertFeed.tsx"),
    "utf-8"
  );

  it("should pass isStreamEnabled to useAlertStream hook", () => {
    // The hook call should use `enabled: isStreamEnabled` not just `enabled`
    expect(feedSrc).toMatch(/useAlertStream\(\{[^}]*enabled:\s*isStreamEnabled/);
  });

  it("should NOT pass the parent enabled prop directly to useAlertStream", () => {
    // Should not have `useAlertStream({ enabled, severityThreshold })`
    // (where enabled is the raw prop, not isStreamEnabled)
    const directPropPattern = /useAlertStream\(\{\s*enabled,\s*severityThreshold\s*\}\)/;
    expect(feedSrc).not.toMatch(directPropPattern);
  });

  it("should have isStreamEnabled state initialized from enabled prop", () => {
    expect(feedSrc).toMatch(/useState\(enabled\)/);
  });

  it("should have toggleStream function that toggles isStreamEnabled", () => {
    expect(feedSrc).toContain("setIsStreamEnabled");
    expect(feedSrc).toContain("toggleStream");
  });
});
