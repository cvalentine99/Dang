/**
 * Client smoke tests — validates the test infrastructure works and
 * exercises security-relevant pure functions without requiring a DOM.
 *
 * No @testing-library/react or jsdom needed — these test only pure
 * TypeScript modules (route registry, route inference, export utils,
 * auth constants).
 */

import { describe, it, expect } from "vitest";

// ── Route Registry ──────────────────────────────────────────────────────────

import {
  ROUTE_REGISTRY,
  PAGE_ROUTE_MAP,
  type RouteEntry,
} from "@/lib/routeRegistry";

describe("ROUTE_REGISTRY", () => {
  it("is a non-empty array of route entries", () => {
    expect(Array.isArray(ROUTE_REGISTRY)).toBe(true);
    expect(ROUTE_REGISTRY.length).toBeGreaterThan(0);
  });

  it("every entry has a path starting with /", () => {
    for (const entry of ROUTE_REGISTRY) {
      expect(entry.path).toMatch(/^\//);
    }
  });

  it("every entry has a non-empty pageName", () => {
    for (const entry of ROUTE_REGISTRY) {
      expect(entry.pageName).toBeTruthy();
      expect(typeof entry.pageName).toBe("string");
    }
  });

  it("marks /login and /register as auth routes", () => {
    const login = ROUTE_REGISTRY.find((r) => r.path === "/login");
    const register = ROUTE_REGISTRY.find((r) => r.path === "/register");
    expect(login?.auth).toBe(true);
    expect(register?.auth).toBe(true);
  });

  it("dashboard routes are NOT marked as auth", () => {
    const dashRoutes = ROUTE_REGISTRY.filter((r) => !r.auth);
    expect(dashRoutes.length).toBeGreaterThan(0);
    // The home route should be a dashboard route
    const home = dashRoutes.find((r) => r.path === "/");
    expect(home).toBeDefined();
    expect(home?.pageName).toBe("Home");
  });

  it("has no duplicate paths", () => {
    const paths = ROUTE_REGISTRY.map((r) => r.path);
    // LivingCaseView legitimately appears with /living-cases and /living-cases/:id
    // so we just check for exact duplicates
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const p of paths) {
      if (seen.has(p)) duplicates.push(p);
      seen.add(p);
    }
    expect(duplicates).toEqual([]);
  });

  it("contains security-critical admin routes", () => {
    const adminPaths = ROUTE_REGISTRY.filter((r) =>
      r.path.startsWith("/admin/")
    ).map((r) => r.path);
    expect(adminPaths).toContain("/admin/users");
    expect(adminPaths).toContain("/admin/settings");
    expect(adminPaths).toContain("/admin/audit");
  });
});

describe("PAGE_ROUTE_MAP", () => {
  it("maps pageName to path for key pages", () => {
    expect(PAGE_ROUTE_MAP["Home"]).toBe("/");
    expect(PAGE_ROUTE_MAP["Login"]).toBe("/login");
    expect(PAGE_ROUTE_MAP["AdminUsers"]).toBe("/admin/users");
    expect(PAGE_ROUTE_MAP["SensitiveAccessAudit"]).toBe("/admin/audit");
  });

  it("first-wins deduplication for multi-route pages", () => {
    // LivingCaseView has /living-cases and /living-cases/:id
    // The first entry should win
    expect(PAGE_ROUTE_MAP["LivingCaseView"]).toBe("/living-cases");
  });
});

// ── Route Inference (security: determines drill-through targets) ────────────

import {
  inferRouteFromCallsite,
  inferPrimaryRoute,
  inferAllRoutes,
} from "@/lib/routeInference";

describe("inferRouteFromCallsite", () => {
  it("extracts route for a page callsite", () => {
    const result = inferRouteFromCallsite(
      "client/src/pages/AgentHealth.tsx:87"
    );
    expect(result).toEqual({
      pageName: "AgentHealth",
      route: "/agents",
      hasParams: false,
    });
  });

  it("returns null for non-page callsites", () => {
    expect(
      inferRouteFromCallsite("client/src/hooks/useAlertStream.ts:12")
    ).toBeNull();
    expect(inferRouteFromCallsite("server/routes/api.ts:5")).toBeNull();
  });

  it("detects parameterized routes", () => {
    const result = inferRouteFromCallsite(
      "client/src/pages/AgentDetail.tsx:42"
    );
    expect(result).not.toBeNull();
    expect(result!.hasParams).toBe(true);
    expect(result!.route).toBe("/fleet/:agentId");
  });
});

describe("inferPrimaryRoute", () => {
  it("picks user-facing page over admin page", () => {
    const callsites = [
      "client/src/pages/AlertsTimeline.tsx:10",
      "client/src/pages/AdminUsers.tsx:20",
    ];
    const result = inferPrimaryRoute(callsites);
    expect(result).not.toBeNull();
    expect(result!.pageName).toBe("AlertsTimeline");
  });

  it("picks higher-frequency route when no admin involved", () => {
    const callsites = [
      "client/src/pages/SiemEvents.tsx:10",
      "client/src/pages/SiemEvents.tsx:50",
      "client/src/pages/AlertsTimeline.tsx:20",
    ];
    const result = inferPrimaryRoute(callsites);
    expect(result).not.toBeNull();
    expect(result!.pageName).toBe("SiemEvents");
  });

  it("returns null for empty or non-page callsites", () => {
    expect(inferPrimaryRoute([])).toBeNull();
    expect(
      inferPrimaryRoute(["server/routes/api.ts:5"])
    ).toBeNull();
  });

  it("falls back to parameterized route if no param-free route exists", () => {
    const callsites = [
      "client/src/pages/AgentDetail.tsx:10",
      "client/src/pages/AgentDetail.tsx:20",
    ];
    const result = inferPrimaryRoute(callsites);
    expect(result).not.toBeNull();
    expect(result!.hasParams).toBe(true);
  });
});

describe("inferAllRoutes", () => {
  it("deduplicates routes from multiple callsites in same page", () => {
    const callsites = [
      "client/src/pages/Home.tsx:10",
      "client/src/pages/Home.tsx:55",
      "client/src/pages/AlertsTimeline.tsx:20",
    ];
    const results = inferAllRoutes(callsites);
    expect(results).toHaveLength(2);
    const routes = results.map((r) => r.route);
    expect(routes).toContain("/");
    expect(routes).toContain("/alerts");
  });
});

// ── Export Utils (pure transformations, no DOM needed) ───────────────────────

import { toCSV, toJSON, makeFilename } from "@/lib/exportUtils";

describe("toCSV", () => {
  it("returns empty string for empty data", () => {
    expect(toCSV([])).toBe("");
  });

  it("generates header + data rows", () => {
    const data = [
      { name: "Alice", role: "analyst" },
      { name: "Bob", role: "admin" },
    ];
    const csv = toCSV(data);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(3); // header + 2 rows
    expect(lines[0]).toContain("name");
    expect(lines[0]).toContain("role");
    expect(lines[1]).toContain("Alice");
  });

  it("escapes commas and quotes in values", () => {
    const data = [{ note: 'He said, "hello"' }];
    const csv = toCSV(data);
    // Value with comma+quote must be wrapped in quotes with doubled inner quotes
    expect(csv).toContain('"He said, ""hello"""');
  });

  it("flattens nested objects into dot-notation columns", () => {
    const data = [{ agent: { id: "001", name: "srv-web" } }];
    const csv = toCSV(data);
    expect(csv).toContain("agent.id");
    expect(csv).toContain("agent.name");
    expect(csv).toContain("001");
  });

  it("respects explicit column definitions", () => {
    const data = [{ a: 1, b: 2, c: 3 }];
    const columns = [
      { key: "c", label: "Col C" },
      { key: "a", label: "Col A" },
    ];
    const csv = toCSV(data, columns);
    const header = csv.split("\n")[0];
    expect(header).toBe("Col C,Col A");
  });
});

describe("toJSON", () => {
  it("pretty-prints JSON with 2-space indent", () => {
    const result = toJSON({ level: 15, rule: "ssh-brute" });
    expect(result).toBe(JSON.stringify({ level: 15, rule: "ssh-brute" }, null, 2));
  });
});

describe("makeFilename", () => {
  it("produces a filename with dang_ prefix and correct extension", () => {
    const name = makeFilename("alerts", "csv");
    expect(name).toMatch(/^dang_alerts_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.csv$/);
  });

  it("includes sanitized context in filename", () => {
    const name = makeFilename("events", "json", "level >= 12");
    // ">", " ", "=" each become "_", so "level >= 12" -> "level____12"
    expect(name).toMatch(/^dang_events_level____12_/);
    expect(name).toMatch(/\.json$/);
  });
});

// ── Auth Constants ──────────────────────────────────────────────────────────

import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getLoginUrl } from "@/const";

describe("auth constants", () => {
  it("COOKIE_NAME is a non-empty string", () => {
    expect(typeof COOKIE_NAME).toBe("string");
    expect(COOKIE_NAME.length).toBeGreaterThan(0);
  });

  it("ONE_YEAR_MS is approximately 365 days in milliseconds", () => {
    const expected = 1000 * 60 * 60 * 24 * 365;
    expect(ONE_YEAR_MS).toBe(expected);
  });

  it("getLoginUrl always returns /login (local auth only)", () => {
    expect(getLoginUrl()).toBe("/login");
    expect(getLoginUrl("/dashboard")).toBe("/login");
    expect(getLoginUrl(undefined)).toBe("/login");
  });
});
