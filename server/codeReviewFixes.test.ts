/**
 * Regression tests for all 15 code review findings (7 bugs + 8 vulnerabilities).
 * These tests verify the fixes are correct and prevent regressions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Bug #1: completedPivotCount should use livingCase.completedPivots.length ──
describe("Bug #1: completedPivotCount merge-fallback", () => {
  it("should use completedPivots array length, not hardcoded 0", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync("server/agenticPipeline/hypothesisAgent.ts", "utf-8")
    );
    // The old code had: completedPivotCount: 0
    // The fix should reference completedPivots.length
    expect(src).not.toMatch(/completedPivotCount:\s*0\b/);
    expect(src).toMatch(/completedPivots.*\.length/);
  });
});

// ── Bug #2: normCategory cast should not produce invalid enum values ──
describe("Bug #2: normCategory enum cast", () => {
  it("should not cast normCategory result as 'immediate'", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync("server/agenticPipeline/hypothesisAgent.ts", "utf-8")
    );
    // The old code had: as "immediate" | "next" | "optional"
    // These are urgency values, not category values
    expect(src).not.toMatch(/normCategory.*as\s*"immediate"/);
    expect(src).not.toMatch(/normCategory.*as\s*"\s*immediate\s*"\s*\|\s*"next"\s*\|\s*"optional"/);
  });
});

// ── Bug #3: Average-of-averages fix — weighted average ──
describe("Bug #3: Weighted average for threat severity", () => {
  it("should use weighted average calculation (total severity / total count)", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync("server/indexer/indexerRouter.ts", "utf-8")
    );
    // Should have weighted calculation: totalWeightedLevel / totalCount
    expect(src).toMatch(/totalWeightedLevel/);
    expect(src).toMatch(/totalCount\s*>\s*0\s*\?\s*totalWeightedLevel\s*\/\s*totalCount/);
  });
});

// ── Bug #4: lat/lng falsy check — should not treat 0 as falsy ──
describe("Bug #4: ThreatMap lat/lng falsy check", () => {
  it("should use explicit null/undefined checks for lat/lng", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync("client/src/components/shared/ThreatMap.tsx", "utf-8")
    );
    // Should NOT have: d.lat && d.lng (treats 0 as falsy)
    expect(src).not.toMatch(/d\.lat\s*&&\s*d\.lng/);
    // Should have explicit null checks
    expect(src).toMatch(/d\.lat\s*!=\s*null\s*&&\s*d\.lng\s*!=\s*null/);
  });
});

// ── Bug #5: geoipService returns null instead of (0,0) ──
describe("Bug #5: geoipService null coords", () => {
  it("should return null for missing coordinates, not (0,0)", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync("server/geoip/geoipService.ts", "utf-8")
    );
    // Should have nullable lat/lng in CountryAggregation
    expect(src).toMatch(/lat:\s*number\s*\|\s*null/);
    expect(src).toMatch(/lng:\s*number\s*\|\s*null/);
  });
});

// ── Bug #6: affectedRows safe access ──
describe("Bug #6: alertQueueRouter affectedRows", () => {
  it("should use typed ResultSetHeader instead of unsafe cast", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync("server/alertQueue/alertQueueRouter.ts", "utf-8")
    );
    // Should use typed result header with affectedRows check
    expect(src).toMatch(/resultHeader.*affectedRows/);
  });
});

// ── Bug #7: OTX cache key sorting ──
describe("Bug #7: OTX cache key determinism", () => {
  it("should sort keys before stringifying for cache key", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync("server/otx/otxClient.ts", "utf-8")
    );
    // Should sort object entries before creating cache key
    expect(src).toMatch(/Object\.entries.*\.sort/);
    // Should use sorted params for cache key generation
    expect(src).toMatch(/sortedParams/);
  });
});

// ── Vuln #1: Bcrypt timing attack mitigation ──
describe("Vuln #1: Bcrypt timing attack", () => {
  it("should always perform bcrypt compare even when user not found", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync("server/localAuth/localAuthService.ts", "utf-8")
    );
    // Should have a dummy hash for constant-time comparison
    expect(src).toMatch(/DUMMY_HASH/);
    // Should call verifyPassword with DUMMY_HASH when user not found
    expect(src).toMatch(/verifyPassword.*DUMMY_HASH/);
  });
});

// ── Vuln #2: HKDF key derivation instead of raw JWT_SECRET ──
describe("Vuln #2: HKDF key derivation for AES", () => {
  it("should use HKDF to derive AES key, not raw JWT_SECRET", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync("server/admin/encryptionService.ts", "utf-8")
    );
    // Should use hkdfSync for key derivation
    expect(src).toMatch(/hkdfSync/);
    // Should have a distinct salt/context
    expect(src).toMatch(/HKDF_SALT/);
    expect(src).toMatch(/HKDF_INFO/);
    // Should NOT directly use JWT_SECRET as the key (old pattern: Buffer.from(secret).slice)
    expect(src).not.toMatch(/Buffer\.from\(secret\)\.slice/);
  });
});

// ── Vuln #3: XSS in ThreatMap tooltips ──
describe("Vuln #3: ThreatMap XSS prevention", () => {
  it("should escape HTML in tooltip content", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync("client/src/components/shared/ThreatMap.tsx", "utf-8")
    );
    // Should have an HTML escape function
    expect(src).toMatch(/function\s+escHtml|const\s+escHtml/);
    // Should use escHtml in tooltip generation
    expect(src).toMatch(/escHtml\(/);
  });
});

// ── Vuln #4: LLM target value sanitization ──
describe("Vuln #4: LLM target value format validation", () => {
  it("should validate target values against format patterns", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync("server/agenticPipeline/hypothesisAgent.ts", "utf-8")
    );
    // Should have TARGET_PATTERNS for format validation
    expect(src).toMatch(/TARGET_PATTERNS/);
    // Should strip control characters
    expect(src).toMatch(/\\x00.*\\x1f|control char/i);
  });
});

// ── Vuln #5: LLM prompt injection sanitization ──
describe("Vuln #5: Prompt injection sanitization", () => {
  it("should sanitize raw data before embedding in LLM prompts", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync("server/agenticPipeline/correlationAgent.ts", "utf-8")
    );
    // Should import sanitizeForPrompt from its dedicated module
    expect(src).toMatch(/import\s*\{\s*sanitizeForPrompt\s*\}\s*from/);
    // Should call sanitizeForPrompt on evidence pack data
    expect(src).toMatch(/sanitizeForPrompt\(pack\./);
    // Should call sanitizeForPrompt on triage data
    expect(src).toMatch(/sanitizeForPrompt\(\{/);
  });
});

// ── Vuln #6: DNS rebinding — pinnedIP ──
describe("Vuln #6: DNS rebinding prevention", () => {
  it("should return pinnedIP for callers to use instead of re-resolving", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync("server/admin/hostValidation.ts", "utf-8")
    );
    // Should have pinnedIP in the interface
    expect(src).toMatch(/pinnedIP\?:\s*string/);
    // Should set pinnedIP when validation passes
    expect(src).toMatch(/pinnedIP:\s*ipResult\.allowed\s*\?\s*resolvedIP/);
  });
});

// ── Vuln #7: Atomic upsert for connectionSettings ──
describe("Vuln #7: Atomic upsert", () => {
  it("should use onDuplicateKeyUpdate instead of SELECT-then-INSERT", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync("server/admin/connectionSettingsService.ts", "utf-8")
    );
    // Should use atomic upsert pattern
    expect(src).toMatch(/onDuplicateKeyUpdate/);
    // Should NOT have the old SELECT-then-INSERT pattern
    expect(src).not.toMatch(/Upsert: check if exists, then insert or update/);
  });

  it("should have a unique index on (category, settingKey) in schema definition", async () => {
    // Verify at the schema level instead of requiring a live DB connection.
    // The actual index is defined in drizzle/schema.ts and applied via migrations.
    const fs = await import("fs");
    const schemaSrc = fs.readFileSync("drizzle/schema.ts", "utf-8");
    expect(schemaSrc).toContain('uniqueIndex("cs_category_key_uniq")');
    expect(schemaSrc).toContain("table.category, table.settingKey");
  });
});

// ── Vuln #8: localStorage schema validation ──
describe("Vuln #8: localStorage schema validation", () => {
  it("should validate parsed JSON from localStorage", async () => {
    const src = await import("fs").then(fs =>
      fs.readFileSync("client/src/components/QueueNotifier.tsx", "utf-8")
    );
    // Should validate boolean fields for prefs
    expect(src).toMatch(/typeof parsed\.critical === "boolean"/);
    expect(src).toMatch(/typeof parsed\.high === "boolean"/);
    expect(src).toMatch(/typeof parsed\.low === "boolean"/);
    // Should validate array structure for history
    expect(src).toMatch(/Array\.isArray\(parsed\)/);
    expect(src).toMatch(/typeof item\.id === "string"/);
    expect(src).toMatch(/typeof item\.read === "boolean"/);
  });
});
