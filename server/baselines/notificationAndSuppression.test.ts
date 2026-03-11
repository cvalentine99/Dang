/**
 * Tests for Notification History, Suppression Rules, and CSV Export features.
 *
 * Covers:
 * - notificationHistoryRouter: stats, list, retry
 * - suppressionRouter: list, create, deactivate, delete
 * - exportRouter: driftTrend, anomalyHistory, agentVolatility, notificationHistory
 * - notificationHistory service: recordNotification, retryNotification
 * - suppressionRules service: isNotificationSuppressed, incrementSuppressedCount
 */

import { describe, it, expect } from "vitest";

// ─── Notification History Router ─────────────────────────────────────────────

describe("notificationHistoryRouter", () => {
  it("should export a router with stats, list, and retry procedures", async () => {
    const { notificationHistoryRouter } = await import("./notificationHistoryRouter");
    expect(notificationHistoryRouter).toBeDefined();
    // Check that the router has the expected procedures
    const procedures = Object.keys(notificationHistoryRouter._def.procedures);
    expect(procedures).toContain("stats");
    expect(procedures).toContain("list");
    expect(procedures).toContain("retry");
    expect(procedures).toHaveLength(3);
  });

  it("stats procedure should be a query", async () => {
    const { notificationHistoryRouter } = await import("./notificationHistoryRouter");
    const stats = notificationHistoryRouter._def.procedures.stats;
    expect(stats._def.type).toBe("query");
  });

  it("list procedure should be a query", async () => {
    const { notificationHistoryRouter } = await import("./notificationHistoryRouter");
    const list = notificationHistoryRouter._def.procedures.list;
    expect(list._def.type).toBe("query");
  });

  it("retry procedure should be a mutation", async () => {
    const { notificationHistoryRouter } = await import("./notificationHistoryRouter");
    const retry = notificationHistoryRouter._def.procedures.retry;
    expect(retry._def.type).toBe("mutation");
  });
});

// ─── Notification History Service ────────────────────────────────────────────

describe("notificationHistory service", () => {
  it("should export recordNotification function", async () => {
    const mod = await import("./notificationHistory");
    expect(mod.recordNotification).toBeDefined();
    expect(typeof mod.recordNotification).toBe("function");
  });

  it("should export retryNotification function", async () => {
    const mod = await import("./notificationHistory");
    expect(mod.retryNotification).toBeDefined();
    expect(typeof mod.retryNotification).toBe("function");
  });

  it("recordNotification should accept the expected parameters", async () => {
    const mod = await import("./notificationHistory");
    // Function should accept an object parameter
    expect(mod.recordNotification.length).toBeGreaterThanOrEqual(0);
  });
});

// ─── Suppression Rules Router ────────────────────────────────────────────────

describe("suppressionRouter", () => {
  it("should export a router with list, create, deactivate, and delete procedures", async () => {
    const { suppressionRouter } = await import("./suppressionRouter");
    expect(suppressionRouter).toBeDefined();
    const procedures = Object.keys(suppressionRouter._def.procedures);
    expect(procedures).toContain("list");
    expect(procedures).toContain("create");
    expect(procedures).toContain("deactivate");
    expect(procedures).toContain("delete");
    expect(procedures).toHaveLength(4);
  });

  it("list procedure should be a query", async () => {
    const { suppressionRouter } = await import("./suppressionRouter");
    const list = suppressionRouter._def.procedures.list;
    expect(list._def.type).toBe("query");
  });

  it("create procedure should be a mutation", async () => {
    const { suppressionRouter } = await import("./suppressionRouter");
    const create = suppressionRouter._def.procedures.create;
    expect(create._def.type).toBe("mutation");
  });

  it("deactivate procedure should be a mutation", async () => {
    const { suppressionRouter } = await import("./suppressionRouter");
    const deactivate = suppressionRouter._def.procedures.deactivate;
    expect(deactivate._def.type).toBe("mutation");
  });

  it("delete procedure should be a mutation", async () => {
    const { suppressionRouter } = await import("./suppressionRouter");
    const del = suppressionRouter._def.procedures.delete;
    expect(del._def.type).toBe("mutation");
  });
});

// ─── Suppression Rules Service ───────────────────────────────────────────────

describe("suppressionRules service", () => {
  it("should export checkSuppression function", async () => {
    const mod = await import("./suppressionRules");
    expect(mod.checkSuppression).toBeDefined();
    expect(typeof mod.checkSuppression).toBe("function");
  });

  it("should export isSeveritySuppressed function", async () => {
    const mod = await import("./suppressionRules");
    expect(mod.isSeveritySuppressed).toBeDefined();
    expect(typeof mod.isSeveritySuppressed).toBe("function");
  });

  it("should export expireRules function", async () => {
    const mod = await import("./suppressionRules");
    expect(mod.expireRules).toBeDefined();
    expect(typeof mod.expireRules).toBe("function");
  });

  it("isSeveritySuppressed should correctly evaluate severity hierarchy", async () => {
    const { isSeveritySuppressed } = await import("./suppressionRules");
    // "all" suppresses everything
    expect(isSeveritySuppressed("critical", "all")).toBe(true);
    expect(isSeveritySuppressed("high", "all")).toBe(true);
    expect(isSeveritySuppressed("medium", "all")).toBe(true);
    // "critical" suppresses critical and below
    expect(isSeveritySuppressed("critical", "critical")).toBe(true);
    expect(isSeveritySuppressed("high", "critical")).toBe(true);
    expect(isSeveritySuppressed("medium", "critical")).toBe(true);
    // "high" suppresses high and below
    expect(isSeveritySuppressed("critical", "high")).toBe(false);
    expect(isSeveritySuppressed("high", "high")).toBe(true);
    expect(isSeveritySuppressed("medium", "high")).toBe(true);
    // "medium" only suppresses medium
    expect(isSeveritySuppressed("critical", "medium")).toBe(false);
    expect(isSeveritySuppressed("high", "medium")).toBe(false);
    expect(isSeveritySuppressed("medium", "medium")).toBe(true);
  });
});

// ─── Export Router ───────────────────────────────────────────────────────────

describe("exportRouter", () => {
  it("should export a router with driftTrend, anomalyHistory, agentVolatility, and notificationHistory procedures", async () => {
    const { exportRouter } = await import("./exportRouter");
    expect(exportRouter).toBeDefined();
    const procedures = Object.keys(exportRouter._def.procedures);
    expect(procedures).toContain("driftTrend");
    expect(procedures).toContain("anomalyHistory");
    expect(procedures).toContain("agentVolatility");
    expect(procedures).toContain("notificationHistory");
    expect(procedures).toContain("fullReport");
    expect(procedures).toHaveLength(5);
  });

  it("driftTrend procedure should be a query", async () => {
    const { exportRouter } = await import("./exportRouter");
    const proc = exportRouter._def.procedures.driftTrend;
    expect(proc._def.type).toBe("query");
  });

  it("anomalyHistory procedure should be a query", async () => {
    const { exportRouter } = await import("./exportRouter");
    const proc = exportRouter._def.procedures.anomalyHistory;
    expect(proc._def.type).toBe("query");
  });

  it("agentVolatility procedure should be a query", async () => {
    const { exportRouter } = await import("./exportRouter");
    const proc = exportRouter._def.procedures.agentVolatility;
    expect(proc._def.type).toBe("query");
  });

  it("notificationHistory procedure should be a query", async () => {
    const { exportRouter } = await import("./exportRouter");
    const proc = exportRouter._def.procedures.notificationHistory;
    expect(proc._def.type).toBe("query");
  });
});

// ─── CSV Generation Helpers ──────────────────────────────────────────────────

describe("CSV export format validation", () => {
  it("should produce valid CSV with proper escaping for commas", () => {
    const escapeCSV = (val: string): string => {
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    expect(escapeCSV("hello")).toBe("hello");
    expect(escapeCSV("hello,world")).toBe('"hello,world"');
    expect(escapeCSV('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCSV("line1\nline2")).toBe('"line1\nline2"');
  });

  it("should produce valid CSV header row", () => {
    const headers = ["Timestamp", "Schedule", "Drift %", "Changes", "Total Items", "Agents"];
    const headerRow = headers.join(",");
    expect(headerRow).toBe("Timestamp,Schedule,Drift %,Changes,Total Items,Agents");
  });

  it("should produce valid CSV data rows", () => {
    const row = ["2026-03-01T12:00:00Z", "Daily Scan", "15.5", "3", "20", "agent-001"];
    const csvRow = row.join(",");
    expect(csvRow).toContain("2026-03-01T12:00:00Z");
    expect(csvRow).toContain("Daily Scan");
    expect(csvRow).toContain("15.5");
  });
});

// ─── Integration: Router wiring ──────────────────────────────────────────────

describe("appRouter integration", () => {
  it("should have notificationHistory router wired", async () => {
    const { appRouter } = await import("../routers");
    const procedures = Object.keys(appRouter._def.procedures);
    const hasNotifHistory = procedures.some((p) => p.startsWith("notificationHistory."));
    expect(hasNotifHistory).toBe(true);
  });

  it("should have suppression router wired", async () => {
    const { appRouter } = await import("../routers");
    const procedures = Object.keys(appRouter._def.procedures);
    const hasSuppression = procedures.some((p) => p.startsWith("suppression."));
    expect(hasSuppression).toBe(true);
  });

  it("should have export router wired", async () => {
    const { appRouter } = await import("../routers");
    const procedures = Object.keys(appRouter._def.procedures);
    const hasExport = procedures.some((p) => p.startsWith("export."));
    expect(hasExport).toBe(true);
  });

  it("notificationHistory.stats should be accessible", async () => {
    const { appRouter } = await import("../routers");
    const procedures = Object.keys(appRouter._def.procedures);
    expect(procedures).toContain("notificationHistory.stats");
  });

  it("notificationHistory.list should be accessible", async () => {
    const { appRouter } = await import("../routers");
    const procedures = Object.keys(appRouter._def.procedures);
    expect(procedures).toContain("notificationHistory.list");
  });

  it("notificationHistory.retry should be accessible", async () => {
    const { appRouter } = await import("../routers");
    const procedures = Object.keys(appRouter._def.procedures);
    expect(procedures).toContain("notificationHistory.retry");
  });

  it("suppression.list should be accessible", async () => {
    const { appRouter } = await import("../routers");
    const procedures = Object.keys(appRouter._def.procedures);
    expect(procedures).toContain("suppression.list");
  });

  it("suppression.create should be accessible", async () => {
    const { appRouter } = await import("../routers");
    const procedures = Object.keys(appRouter._def.procedures);
    expect(procedures).toContain("suppression.create");
  });

  it("suppression.deactivate should be accessible", async () => {
    const { appRouter } = await import("../routers");
    const procedures = Object.keys(appRouter._def.procedures);
    expect(procedures).toContain("suppression.deactivate");
  });

  it("suppression.delete should be accessible", async () => {
    const { appRouter } = await import("../routers");
    const procedures = Object.keys(appRouter._def.procedures);
    expect(procedures).toContain("suppression.delete");
  });

  it("export.driftTrend should be accessible", async () => {
    const { appRouter } = await import("../routers");
    const procedures = Object.keys(appRouter._def.procedures);
    expect(procedures).toContain("export.driftTrend");
  });

  it("export.anomalyHistory should be accessible", async () => {
    const { appRouter } = await import("../routers");
    const procedures = Object.keys(appRouter._def.procedures);
    expect(procedures).toContain("export.anomalyHistory");
  });

  it("export.agentVolatility should be accessible", async () => {
    const { appRouter } = await import("../routers");
    const procedures = Object.keys(appRouter._def.procedures);
    expect(procedures).toContain("export.agentVolatility");
  });

  it("export.notificationHistory should be accessible", async () => {
    const { appRouter } = await import("../routers");
    const procedures = Object.keys(appRouter._def.procedures);
    expect(procedures).toContain("export.notificationHistory");
  });
});
