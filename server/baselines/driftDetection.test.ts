import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock notifyOwner before importing the module
vi.mock("../_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

import { compareBaselines, checkDriftAndNotify } from "./driftDetection";
import { notifyOwner } from "../_core/notification";

// Helper to build snapshot in the shape the code expects:
// { packages: { "001": [...] }, services: { "001": [...] }, users: { "001": [...] } }
function makeSnapshot(agents: Record<string, {
  packages?: Array<{ name: string; version: string }>;
  services?: Array<{ name: string; state: string }>;
  users?: Array<{ name: string; shell?: string }>;
}>): Record<string, unknown> {
  const snapshot: Record<string, Record<string, unknown[]>> = {
    packages: {},
    services: {},
    users: {},
  };
  for (const [agentId, data] of Object.entries(agents)) {
    if (data.packages) snapshot.packages[agentId] = data.packages;
    if (data.services) snapshot.services[agentId] = data.services;
    if (data.users) snapshot.users[agentId] = data.users;
  }
  return snapshot;
}

// Helper to build a fake schedule object
function fakeSchedule(overrides: Partial<{
  id: number; name: string; notifyOnDrift: boolean; driftThreshold: number; agentIds: string[];
}> = {}) {
  return {
    id: overrides.id ?? 1,
    name: overrides.name ?? "Test Schedule",
    notifyOnDrift: overrides.notifyOnDrift ?? true,
    driftThreshold: overrides.driftThreshold ?? 10,
    agentIds: overrides.agentIds ?? ["001"],
    // Unused fields — satisfy the type
    userId: "u1",
    frequency: "daily",
    retentionCount: 10,
    enabled: true,
    successCount: 0,
    failureCount: 0,
    lastError: null,
    nextRunAt: null,
    lastRunAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never; // cast to satisfy BaselineSchedule type
}

// Helper to build a fake baseline object
function fakeBaseline(snapshotData: Record<string, unknown>) {
  return {
    id: 1,
    userId: "u1",
    name: "prev",
    agentIds: ["001"],
    snapshotData,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never; // cast to satisfy ConfigBaseline type
}

describe("driftDetection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("compareBaselines", () => {
    it("returns 0 drift when both snapshots are empty", () => {
      const result = compareBaselines({}, {});
      expect(result.totalItems).toBeGreaterThanOrEqual(0);
      expect(result.driftCount).toBe(0);
      expect(result.driftPercent).toBe(0);
    });

    it("returns 100% when previous is empty and current has items", () => {
      const current = makeSnapshot({
        "001": { packages: [{ name: "nginx", version: "1.18" }] },
      });
      const result = compareBaselines({}, current);
      expect(result.driftCount).toBe(1);
      expect(result.driftPercent).toBe(100);
    });

    it("returns 100% when current is empty and previous had items", () => {
      const previous = makeSnapshot({
        "001": {
          packages: [{ name: "nginx", version: "1.18" }],
          services: [{ name: "sshd", state: "running" }],
        },
      });
      const result = compareBaselines(previous, {});
      expect(result.driftCount).toBe(2);
      expect(result.driftPercent).toBe(100);
    });

    it("detects no drift when snapshots are identical", () => {
      const snapshot = makeSnapshot({
        "001": {
          packages: [
            { name: "nginx", version: "1.18" },
            { name: "curl", version: "7.68" },
          ],
          services: [{ name: "sshd", state: "running" }],
          users: [{ name: "root", shell: "/bin/bash" }],
        },
      });
      const result = compareBaselines(snapshot, snapshot);
      expect(result.totalItems).toBe(4);
      expect(result.driftCount).toBe(0);
      expect(result.driftPercent).toBe(0);
    });

    it("detects partial drift when some items change", () => {
      const previous = makeSnapshot({
        "001": {
          packages: [
            { name: "nginx", version: "1.18" },
            { name: "curl", version: "7.68" },
          ],
          services: [{ name: "sshd", state: "running" }],
          users: [{ name: "root", shell: "/bin/bash" }],
        },
      });
      const current = makeSnapshot({
        "001": {
          packages: [
            { name: "nginx", version: "1.20" }, // version changed
            { name: "curl", version: "7.68" },   // same
          ],
          services: [{ name: "sshd", state: "running" }], // same
          users: [{ name: "root", shell: "/bin/bash" }],   // same
        },
      });
      const result = compareBaselines(previous, current);
      expect(result.totalItems).toBe(4);
      expect(result.driftCount).toBe(1);
      expect(result.driftPercent).toBe(25);
    });

    it("detects drift across multiple agents", () => {
      const previous = makeSnapshot({
        "001": { packages: [{ name: "nginx", version: "1.18" }] },
        "002": {
          packages: [{ name: "apache", version: "2.4" }],
          services: [{ name: "httpd", state: "running" }],
        },
      });
      const current = makeSnapshot({
        "001": { packages: [{ name: "nginx", version: "1.20" }] }, // changed
        "002": {
          packages: [{ name: "apache", version: "2.4" }],           // same
          services: [{ name: "httpd", state: "stopped" }],           // changed
        },
      });
      const result = compareBaselines(previous, current);
      expect(result.totalItems).toBe(3);
      expect(result.driftCount).toBe(2);
      expect(Math.round(result.driftPercent)).toBe(67);
    });

    it("detects new agent as drift", () => {
      const previous = makeSnapshot({
        "001": { packages: [{ name: "nginx", version: "1.18" }] },
      });
      const current = makeSnapshot({
        "001": { packages: [{ name: "nginx", version: "1.18" }] },
        "002": { packages: [{ name: "apache", version: "2.4" }] },
      });
      const result = compareBaselines(previous, current);
      expect(result.driftCount).toBe(1); // new agent's package is "added"
      expect(result.driftPercent).toBe(50);
    });

    it("detects removed agent as drift", () => {
      const previous = makeSnapshot({
        "001": { packages: [{ name: "nginx", version: "1.18" }] },
        "002": { packages: [{ name: "apache", version: "2.4" }] },
      });
      const current = makeSnapshot({
        "001": { packages: [{ name: "nginx", version: "1.18" }] },
      });
      const result = compareBaselines(previous, current);
      expect(result.driftCount).toBe(1); // removed agent's package is "removed"
      expect(result.driftPercent).toBe(50);
    });

    it("populates byCategory breakdown correctly", () => {
      const previous = makeSnapshot({
        "001": {
          packages: [{ name: "nginx", version: "1.18" }],
          services: [{ name: "sshd", state: "running" }],
          users: [{ name: "root", shell: "/bin/bash" }],
        },
      });
      const current = makeSnapshot({
        "001": {
          packages: [
            { name: "nginx", version: "1.20" },  // changed
            { name: "htop", version: "3.0" },     // added
          ],
          services: [], // sshd removed
          users: [{ name: "root", shell: "/bin/bash" }], // same
        },
      });
      const result = compareBaselines(previous, current);
      expect(result.byCategory.packages.changed).toBe(1);
      expect(result.byCategory.packages.added).toBe(1);
      expect(result.byCategory.services.removed).toBe(1);
      expect(result.byCategory.users.added).toBe(0);
      expect(result.byCategory.users.removed).toBe(0);
      expect(result.byCategory.users.changed).toBe(0);
    });
  });

  describe("checkDriftAndNotify", () => {
    it("does not notify when drift is below threshold", async () => {
      const snapshot = makeSnapshot({
        "001": { packages: [{ name: "nginx", version: "1.18" }] },
      });

      const result = await checkDriftAndNotify(
        fakeSchedule({ driftThreshold: 10 }),
        fakeBaseline(snapshot),
        snapshot // identical — 0% drift
      );

      expect(result.notified).toBe(false);
      expect(result.driftResult.driftPercent).toBe(0);
      expect(notifyOwner).not.toHaveBeenCalled();
    });

    it("notifies when drift exceeds threshold", async () => {
      const previous = makeSnapshot({
        "001": {
          packages: [
            { name: "nginx", version: "1.18" },
            { name: "curl", version: "7.68" },
          ],
        },
      });
      const current = makeSnapshot({
        "001": {
          packages: [
            { name: "nginx", version: "1.20" }, // changed
            { name: "curl", version: "7.70" },   // changed
          ],
        },
      });

      const result = await checkDriftAndNotify(
        fakeSchedule({ name: "Production Baseline", driftThreshold: 10 }),
        fakeBaseline(previous),
        current
      );

      expect(result.notified).toBe(true);
      expect(result.driftResult.driftPercent).toBe(100);
      expect(notifyOwner).toHaveBeenCalledOnce();
      expect(notifyOwner).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining("Drift Alert"),
          content: expect.stringContaining("Production Baseline"),
        })
      );
    });

    it("does not notify when threshold is 0 (disabled)", async () => {
      const previous = makeSnapshot({
        "001": { packages: [{ name: "nginx", version: "1.18" }] },
      });
      const current = makeSnapshot({
        "001": { packages: [{ name: "nginx", version: "1.20" }] },
      });

      const result = await checkDriftAndNotify(
        fakeSchedule({ driftThreshold: 0 }),
        fakeBaseline(previous),
        current
      );

      expect(result.notified).toBe(false);
      expect(notifyOwner).not.toHaveBeenCalled();
    });

    it("does not notify when notifyOnDrift is false", async () => {
      const previous = makeSnapshot({
        "001": { packages: [{ name: "nginx", version: "1.18" }] },
      });
      const current = makeSnapshot({
        "001": { packages: [{ name: "nginx", version: "1.20" }] },
      });

      const result = await checkDriftAndNotify(
        fakeSchedule({ notifyOnDrift: false, driftThreshold: 10 }),
        fakeBaseline(previous),
        current
      );

      expect(result.notified).toBe(false);
      expect(notifyOwner).not.toHaveBeenCalled();
    });

    it("does not notify when drift is below threshold (strict less-than)", async () => {
      // 1 out of 4 items changed = 25%
      const previous = makeSnapshot({
        "001": {
          packages: [
            { name: "nginx", version: "1.18" },
            { name: "curl", version: "7.68" },
          ],
          services: [{ name: "sshd", state: "running" }],
          users: [{ name: "root", shell: "/bin/bash" }],
        },
      });
      const current = makeSnapshot({
        "001": {
          packages: [
            { name: "nginx", version: "1.20" }, // changed
            { name: "curl", version: "7.68" },
          ],
          services: [{ name: "sshd", state: "running" }],
          users: [{ name: "root", shell: "/bin/bash" }],
        },
      });

      const result = await checkDriftAndNotify(
        fakeSchedule({ driftThreshold: 30 }), // 25% < 30% — should NOT notify
        fakeBaseline(previous),
        current
      );

      expect(result.notified).toBe(false);
      expect(notifyOwner).not.toHaveBeenCalled();
    });

    it("notifies when drift exceeds threshold by small margin", async () => {
      // 2 out of 4 items changed = 50%
      const previous = makeSnapshot({
        "001": {
          packages: [
            { name: "nginx", version: "1.18" },
            { name: "curl", version: "7.68" },
          ],
          services: [{ name: "sshd", state: "running" }],
          users: [{ name: "root", shell: "/bin/bash" }],
        },
      });
      const current = makeSnapshot({
        "001": {
          packages: [
            { name: "nginx", version: "1.20" }, // changed
            { name: "curl", version: "7.70" },   // changed
          ],
          services: [{ name: "sshd", state: "running" }],
          users: [{ name: "root", shell: "/bin/bash" }],
        },
      });

      const result = await checkDriftAndNotify(
        fakeSchedule({ driftThreshold: 49 }), // 50% > 49% — should notify
        fakeBaseline(previous),
        current
      );

      expect(result.notified).toBe(true);
      expect(notifyOwner).toHaveBeenCalledOnce();
    });

    it("handles notifyOwner throwing gracefully", async () => {
      (notifyOwner as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Network error"));

      const previous = makeSnapshot({
        "001": { packages: [{ name: "nginx", version: "1.18" }] },
      });
      const current = makeSnapshot({
        "001": { packages: [{ name: "nginx", version: "1.20" }] },
      });

      const result = await checkDriftAndNotify(
        fakeSchedule({ driftThreshold: 10 }),
        fakeBaseline(previous),
        current
      );

      // notifyOwner threw, so notified = false
      expect(result.notified).toBe(false);
      expect(notifyOwner).toHaveBeenCalledOnce();
    });
  });
});
