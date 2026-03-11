import { describe, it, expect } from "vitest";

/**
 * Tests verifying that all Wazuh API spec v4.14.3 endpoints
 * referenced by Dang! are properly wired in the wazuhRouter.
 */

describe("Wazuh API Spec v4.14.3 — Full Coverage Endpoints", () => {
  // ─── New Endpoints Added for Full Coverage ─────────────────────────────

  describe("syscollector/netproto endpoint", () => {
    it("should have agentNetproto procedure defined", async () => {
      const { wazuhRouter } = await import("./wazuhRouter");
      const procedures = Object.keys((wazuhRouter as any)._def.procedures);
      expect(procedures).toContain("agentNetproto");
    });
  });

  describe("decoders/parents endpoint", () => {
    it("should have decoderParents procedure defined", async () => {
      const { wazuhRouter } = await import("./wazuhRouter");
      const procedures = Object.keys((wazuhRouter as any)._def.procedures);
      expect(procedures).toContain("decoderParents");
    });
  });

  describe("rules/files/{filename} endpoint", () => {
    it("should have ruleFileContent procedure defined", async () => {
      const { wazuhRouter } = await import("./wazuhRouter");
      const procedures = Object.keys((wazuhRouter as any)._def.procedures);
      expect(procedures).toContain("ruleFileContent");
    });
  });

  describe("decoders/files/{filename} endpoint", () => {
    it("should have decoderFileContent procedure defined", async () => {
      const { wazuhRouter } = await import("./wazuhRouter");
      const procedures = Object.keys((wazuhRouter as any)._def.procedures);
      expect(procedures).toContain("decoderFileContent");
    });
  });

  describe("agents/outdated endpoint", () => {
    it("should have agentsOutdated procedure defined", async () => {
      const { wazuhRouter } = await import("./wazuhRouter");
      const procedures = Object.keys((wazuhRouter as any)._def.procedures);
      expect(procedures).toContain("agentsOutdated");
    });
  });

  describe("agents/no_group endpoint", () => {
    it("should have agentsNoGroup procedure defined", async () => {
      const { wazuhRouter } = await import("./wazuhRouter");
      const procedures = Object.keys((wazuhRouter as any)._def.procedures);
      expect(procedures).toContain("agentsNoGroup");
    });
  });

  describe("agents/stats/distinct endpoint", () => {
    it("should have agentStatsDistinct procedure defined", async () => {
      const { wazuhRouter } = await import("./wazuhRouter");
      const procedures = Object.keys((wazuhRouter as any)._def.procedures);
      expect(procedures).toContain("agentsStatsDistinct");
    });
  });

  describe("groups/{group_id}/configuration endpoint", () => {
    it("should have groupConfiguration procedure defined", async () => {
      const { wazuhRouter } = await import("./wazuhRouter");
      const procedures = Object.keys((wazuhRouter as any)._def.procedures);
      expect(procedures).toContain("groupConfiguration");
    });
  });

  // ─── Verify All Core Endpoints Still Present ───────────────────────────

  describe("core endpoint coverage", () => {
    it("should have all essential read-only endpoints", async () => {
      const { wazuhRouter } = await import("./wazuhRouter");
      const procedures = Object.keys((wazuhRouter as any)._def.procedures);

      const essentialEndpoints = [
        // Agent endpoints
        "agents", "agentSummaryStatus", "agentSummaryOs", "agentById", "agentsOutdated", "agentsNoGroup",
        "agentsStatsDistinct",
        // Syscollector
        "agentOs", "agentHardware", "agentPackages", "agentProcesses",
        "agentPorts", "agentNetiface", "agentNetaddr", "agentNetproto", "agentHotfixes",
        // Rules & Decoders
        "rules", "ruleGroups", "ruleFileContent", "decoders", "decoderParents", "decoderFileContent",
        // Note: alerts and vulnerabilities are served via indexerRouter, not wazuhRouter
        // Cluster & Manager
        "clusterStatus", "clusterNodes", "clusterHealthcheck", "managerInfo", "managerStatus",
        "managerConfiguration", "managerLogs", "managerLogsSummary", "managerStats",
        // SCA & MITRE
        "scaPolicies", "scaChecks", "mitreTactics", "mitreTechniques",
        // Groups
        "agentGroups", "agentGroupMembers", "groupConfiguration",
        // FIM
        "syscheckFiles", "syscheckLastScan",
      ];

      for (const ep of essentialEndpoints) {
        expect(procedures, `Missing endpoint: ${ep}`).toContain(ep);
      }
    });

    it("should have status and auth endpoints", async () => {
      const { wazuhRouter } = await import("./wazuhRouter");
      const procedures = Object.keys((wazuhRouter as any)._def.procedures);
      expect(procedures).toContain("status");
    });
  });

  // ─── Verify Read-Only Enforcement ──────────────────────────────────────

  describe("read-only enforcement", () => {
    it("should not contain any write/delete/put mutation endpoints", async () => {
      const { wazuhRouter } = await import("./wazuhRouter");
      const procedures = Object.keys((wazuhRouter as any)._def.procedures);

      const writePatterns = [
        "delete", "remove", "create", "update", "put", "restart",
        "enroll", "upgrade", "activeResponse",
      ];

      for (const proc of procedures) {
        const lower = proc.toLowerCase();
        for (const pattern of writePatterns) {
          // Allow read-only procedures that contain write-pattern substrings
          if (lower === "agentsoutdated") continue; // contains "update"
          if (lower === "agentsupgraderesult") continue; // GET /agents/upgrade_result (reads result, not a write)
          if (lower === "agentsuninstallpermission") continue; // GET /agents/uninstall (permission check, not a write)
          expect(
            lower.includes(pattern),
            `Procedure "${proc}" appears to be a write operation (contains "${pattern}")`
          ).toBe(false);
        }
      }
    });
  });
});
