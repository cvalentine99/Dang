/**
 * Trust Doc Sprint Tests
 *
 * Covers:
 * 1. OTX test preflight ping (skipIf pattern)
 * 2. System Status page — managerVersionCheck, securityConfig, apiInfo wiring
 * 3. Sensitive Access Audit — date-range filtering UI wiring
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ── 1. OTX Preflight Ping ──────────────────────────────────────────────────

describe("OTX test preflight ping", () => {
  const otxTestPath = path.resolve(__dirname, "otx/otxRouter.test.ts");

  it("otxRouter.test.ts exists", () => {
    expect(fs.existsSync(otxTestPath)).toBe(true);
  });

  it("uses canReachOtx preflight variable", () => {
    const content = fs.readFileSync(otxTestPath, "utf-8");
    expect(content).toContain("canReachOtx");
  });

  it("uses skipIf(!canReachOtx) for network tests", () => {
    const content = fs.readFileSync(otxTestPath, "utf-8");
    expect(content).toMatch(/skipIf\(!canReachOtx\)/);
  });

  it("performs a preflight HEAD request to otx.alienvault.com", () => {
    const content = fs.readFileSync(otxTestPath, "utf-8");
    expect(content).toContain("otx.alienvault.com");
    expect(content).toMatch(/method.*HEAD|HEAD/);
  });

  it("has a 3-second timeout on the preflight ping", () => {
    const content = fs.readFileSync(otxTestPath, "utf-8");
    expect(content).toMatch(/timeout.*3[_,]?000|3000/);
  });

  it("also uses skipIf(!hasOtxKey) for key-dependent tests", () => {
    const content = fs.readFileSync(otxTestPath, "utf-8");
    expect(content).toMatch(/skipIf\(!hasOtxKey\)/);
  });

  it("does not hardcode OTX_API_KEY values", () => {
    const content = fs.readFileSync(otxTestPath, "utf-8");
    // Should reference process.env, not a literal key
    expect(content).toContain("process.env.OTX_API_KEY");
    // No 40-char hex strings that look like API keys
    const keyPattern = /['"][a-f0-9]{40}['"]/;
    expect(content).not.toMatch(keyPattern);
  });
});

// ── 2. System Status — Wazuh API Intelligence ──────────────────────────────

describe("System Status page — Wazuh API Intelligence wiring", () => {
  const statusPath = path.resolve(__dirname, "../client/src/pages/Status.tsx");

  it("Status.tsx exists", () => {
    expect(fs.existsSync(statusPath)).toBe(true);
  });

  it("imports trpc", () => {
    const content = fs.readFileSync(statusPath, "utf-8");
    expect(content).toMatch(/import.*trpc.*from/);
  });

  it("imports RawJsonViewer", () => {
    const content = fs.readFileSync(statusPath, "utf-8");
    expect(content).toMatch(/import.*RawJsonViewer.*from/);
  });

  it("imports BrokerWarnings", () => {
    const content = fs.readFileSync(statusPath, "utf-8");
    expect(content).toMatch(/import.*BrokerWarnings.*from/);
  });

  it("queries trpc.wazuh.apiInfo", () => {
    const content = fs.readFileSync(statusPath, "utf-8");
    expect(content).toContain("trpc.wazuh.apiInfo.useQuery");
  });

  it("queries trpc.wazuh.managerVersionCheck", () => {
    const content = fs.readFileSync(statusPath, "utf-8");
    expect(content).toContain("trpc.wazuh.managerVersionCheck.useQuery");
  });

  it("queries trpc.wazuh.securityConfig", () => {
    const content = fs.readFileSync(statusPath, "utf-8");
    expect(content).toContain("trpc.wazuh.securityConfig.useQuery");
  });

  it("renders BrokerWarnings for apiInfo", () => {
    const content = fs.readFileSync(statusPath, "utf-8");
    expect(content).toMatch(/BrokerWarnings.*context.*apiInfo/s);
  });

  it("renders BrokerWarnings for managerVersionCheck", () => {
    const content = fs.readFileSync(statusPath, "utf-8");
    expect(content).toMatch(/BrokerWarnings.*context.*managerVersionCheck/s);
  });

  it("renders BrokerWarnings for securityConfig", () => {
    const content = fs.readFileSync(statusPath, "utf-8");
    expect(content).toMatch(/BrokerWarnings.*context.*securityConfig/s);
  });

  it("renders RawJsonViewer for each endpoint", () => {
    const content = fs.readFileSync(statusPath, "utf-8");
    expect(content).toMatch(/RawJsonViewer.*title.*API Info/s);
    expect(content).toMatch(/RawJsonViewer.*title.*Version Check/s);
    expect(content).toMatch(/RawJsonViewer.*title.*Security Config/s);
  });

  it("shows the Wazuh API endpoint paths in the UI", () => {
    const content = fs.readFileSync(statusPath, "utf-8");
    expect(content).toContain("GET /");
    expect(content).toContain("GET /manager/version/check");
    expect(content).toContain("GET /security/config");
  });

  it("has a WazuhApiIntelligence component", () => {
    const content = fs.readFileSync(statusPath, "utf-8");
    expect(content).toContain("WazuhApiIntelligence");
  });

  it("handles loading, error, and empty states for each panel", () => {
    const content = fs.readFileSync(statusPath, "utf-8");
    // Each panel has isLoading, isError, and data checks
    expect(content).toContain("apiInfoQ.isLoading");
    expect(content).toContain("apiInfoQ.isError");
    expect(content).toContain("versionCheckQ.isLoading");
    expect(content).toContain("versionCheckQ.isError");
    expect(content).toContain("securityConfigQ.isLoading");
    expect(content).toContain("securityConfigQ.isError");
  });
});

// ── 3. Wazuh Router — apiInfo, managerVersionCheck, securityConfig exist ────

describe("Wazuh Router — API Intelligence procedures exist", () => {
  const routerPath = path.resolve(__dirname, "wazuh/wazuhRouter.ts");

  it("wazuhRouter.ts exists", () => {
    expect(fs.existsSync(routerPath)).toBe(true);
  });

  it("has apiInfo procedure", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toMatch(/apiInfo\s*:/);
  });

  it("apiInfo calls GET /", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    // Find the apiInfo procedure and verify it proxies to "/"
    const apiInfoMatch = content.match(/apiInfo\s*:.*?proxyGet\s*\(\s*["']\/["']\s*\)/s);
    expect(apiInfoMatch).not.toBeNull();
  });

  it("has managerVersionCheck procedure", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toMatch(/managerVersionCheck\s*:/);
  });

  it("has securityConfig procedure", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toMatch(/securityConfig\s*:/);
  });

  it("securityConfig calls GET /security/config (broker-wired)", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain('SECURITY_CONFIG_CONFIG');
    expect(content).toContain('/security/config');
  });
});

// ── 4. Sensitive Access Audit — Date-Range Filtering ────────────────────────

describe("Sensitive Access Audit — date-range filtering", () => {
  const auditPagePath = path.resolve(__dirname, "../client/src/pages/SensitiveAccessAudit.tsx");
  const auditRouterPath = path.resolve(__dirname, "admin/sensitiveAccessRouter.ts");

  it("SensitiveAccessAudit.tsx exists", () => {
    expect(fs.existsSync(auditPagePath)).toBe(true);
  });

  it("has startDate and endDate state variables", () => {
    const content = fs.readFileSync(auditPagePath, "utf-8");
    expect(content).toContain("startDate");
    expect(content).toContain("endDate");
    expect(content).toMatch(/useState.*startDate|setStartDate/);
    expect(content).toMatch(/useState.*endDate|setEndDate/);
  });

  it("renders date input fields with labels", () => {
    const content = fs.readFileSync(auditPagePath, "utf-8");
    expect(content).toMatch(/type.*date/);
    expect(content).toContain("From");
    expect(content).toContain("To");
  });

  it("passes startDate to the query as ISO string", () => {
    const content = fs.readFileSync(auditPagePath, "utf-8");
    expect(content).toMatch(/startDate.*toISOString/);
  });

  it("passes endDate to the query as ISO string", () => {
    const content = fs.readFileSync(auditPagePath, "utf-8");
    expect(content).toMatch(/endDate.*toISOString/);
  });

  it("clearFilters resets date fields", () => {
    const content = fs.readFileSync(auditPagePath, "utf-8");
    expect(content).toMatch(/setStartDate\s*\(\s*["']["']\s*\)/);
    expect(content).toMatch(/setEndDate\s*\(\s*["']["']\s*\)/);
  });

  it("includes dates in hasActiveFilters check", () => {
    const content = fs.readFileSync(auditPagePath, "utf-8");
    const hasActiveFiltersLine = content.match(/hasActiveFilters\s*=.*$/m)?.[0] ?? "";
    expect(hasActiveFiltersLine).toContain("startDate");
    expect(hasActiveFiltersLine).toContain("endDate");
  });

  // Backend validation
  it("sensitiveAccessRouter.ts accepts startDate and endDate params", () => {
    const content = fs.readFileSync(auditRouterPath, "utf-8");
    expect(content).toContain("startDate: z.string().datetime().optional()");
    expect(content).toContain("endDate: z.string().datetime().optional()");
  });

  it("backend applies gte/lte conditions for date range", () => {
    const content = fs.readFileSync(auditRouterPath, "utf-8");
    expect(content).toMatch(/gte\(sensitiveAccessAudit\.createdAt.*startDate/s);
    expect(content).toMatch(/lte\(sensitiveAccessAudit\.createdAt.*endDate/s);
  });
});

// ── 5. UI Parity Audit — new callsites are registered ──────────────────────

describe("UI parity — new callsites registered", () => {
  const statusPath = path.resolve(__dirname, "../client/src/pages/Status.tsx");

  it("Status.tsx has at least 3 trpc.wazuh.*.useQuery calls", () => {
    const content = fs.readFileSync(statusPath, "utf-8");
    const matches = content.match(/trpc\.wazuh\.\w+\.useQuery/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it("Status.tsx uses staleTime to avoid excessive polling", () => {
    const content = fs.readFileSync(statusPath, "utf-8");
    const staleTimeMatches = content.match(/staleTime/g) ?? [];
    expect(staleTimeMatches.length).toBeGreaterThanOrEqual(3);
  });

  it("Status.tsx uses retry: 1 for graceful degradation", () => {
    const content = fs.readFileSync(statusPath, "utf-8");
    const retryMatches = content.match(/retry:\s*1/g) ?? [];
    expect(retryMatches.length).toBeGreaterThanOrEqual(3);
  });
});
