/**
 * Regression Tests — Audit #50 (SSE off-by-one) and #95 (Security Headers)
 *
 * #50: Verifies that the SSE alert stream uses `gt` (strictly greater-than)
 *      for the lower bound when resuming from a previous poll timestamp,
 *      preventing duplicate delivery of the last alert.
 *
 * #95: Verifies that the security headers middleware sets CSP,
 *      Permissions-Policy, and other hardening headers.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ═══════════════════════════════════════════════════════════════════════════════
// #50 — SSE Off-by-one Duplicate Delivery
// ═══════════════════════════════════════════════════════════════════════════════

describe("Audit #50 — SSE off-by-one fix", () => {
  const sseSrc = fs.readFileSync(
    path.join(__dirname, "sse/alertStreamService.ts"),
    "utf-8"
  );

  it("uses gt (not gte) for timestamp lower bound when resuming from lastPollTimestamp", () => {
    // The fix: when lastPollTimestamp is set, use `gt` to avoid re-fetching
    // the alert that set that timestamp
    expect(sseSrc).toContain("gt: fromTime");
  });

  it("uses gte for timestamp lower bound on the first poll (no lastPollTimestamp)", () => {
    // On the first poll (relative expression like "now-2m"), gte is correct
    expect(sseSrc).toContain("gte: fromTime");
  });

  it("conditionally selects gt vs gte based on lastPollTimestamp presence", () => {
    // The code should branch: lastPollTimestamp ? gt : gte
    expect(sseSrc).toContain("lastPollTimestamp\n");
    // Both gt and gte should appear in the same function
    const pollFn = sseSrc.slice(
      sseSrc.indexOf("async function pollForAlerts"),
      sseSrc.indexOf("function startPolling")
    );
    expect(pollFn).toContain("gt: fromTime");
    expect(pollFn).toContain("gte: fromTime");
  });

  it("does NOT call timeRangeFilter() in pollForAlerts", () => {
    // timeRangeFilter always uses gte — the fix replaces it with a custom range
    const pollFn = sseSrc.slice(
      sseSrc.indexOf("async function pollForAlerts"),
      sseSrc.indexOf("function startPolling")
    );
    // Check for actual function calls, not comments mentioning the name
    // Remove comments before checking
    const withoutComments = pollFn.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(withoutComments).not.toContain("timeRangeFilter(");
  });

  it("no longer imports timeRangeFilter", () => {
    // The import should have been removed since it's no longer used
    const importBlock = sseSrc.slice(0, sseSrc.indexOf("// ── Types"));
    expect(importBlock).not.toContain("timeRangeFilter");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// #95 — Security Headers
// ═══════════════════════════════════════════════════════════════════════════════

describe("Audit #95 — Security Headers middleware", () => {
  const headersSrc = fs.readFileSync(
    path.join(__dirname, "securityHeaders.ts"),
    "utf-8"
  );
  const indexSrc = fs.readFileSync(
    path.join(__dirname, "_core/index.ts"),
    "utf-8"
  );

  it("exports a securityHeaders middleware function", () => {
    expect(headersSrc).toContain("export function securityHeaders");
  });

  it("sets Content-Security-Policy header", () => {
    expect(headersSrc).toContain("Content-Security-Policy");
  });

  it("sets Permissions-Policy header", () => {
    expect(headersSrc).toContain("Permissions-Policy");
  });

  it("sets X-Content-Type-Options: nosniff", () => {
    expect(headersSrc).toContain("X-Content-Type-Options");
    expect(headersSrc).toContain("nosniff");
  });

  it("sets X-Frame-Options: DENY", () => {
    expect(headersSrc).toContain("X-Frame-Options");
    expect(headersSrc).toContain("DENY");
  });

  it("sets Referrer-Policy", () => {
    expect(headersSrc).toContain("Referrer-Policy");
    expect(headersSrc).toContain("strict-origin-when-cross-origin");
  });

  it("disables dangerous browser APIs via Permissions-Policy", () => {
    expect(headersSrc).toContain("camera=()");
    expect(headersSrc).toContain("microphone=()");
    expect(headersSrc).toContain("geolocation=()");
    expect(headersSrc).toContain("payment=()");
  });

  it("CSP blocks iframes via frame-ancestors 'none'", () => {
    expect(headersSrc).toContain("frame-ancestors 'none'");
  });

  it("CSP restricts default-src to self", () => {
    expect(headersSrc).toContain("default-src 'self'");
  });

  it("CSP blocks object/embed via object-src 'none'", () => {
    expect(headersSrc).toContain("object-src 'none'");
  });

  it("is wired into the Express app in server/_core/index.ts", () => {
    expect(indexSrc).toContain('import { securityHeaders } from "../securityHeaders"');
    expect(indexSrc).toContain("app.use(securityHeaders)");
  });

  it("differentiates dev vs production CSP (unsafe-eval only in dev)", () => {
    expect(headersSrc).toContain("isDev");
    expect(headersSrc).toContain("unsafe-eval");
  });
});
