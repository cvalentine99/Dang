import { describe, it, expect, beforeAll } from "vitest";
import { generateCoverageReport, type CoverageReport } from "./brokerCoverage";

/**
 * Validates that 4 endpoints previously registered as bare passthrough
 * are now properly broker-wired with wait_for_complete configs.
 *
 * Per the Wazuh API spec v4.14.3:
 *   - /manager/info          → wait_for_complete
 *   - /manager/status        → wait_for_complete
 *   - /mitre/metadata        → wait_for_complete
 *   - /security/users/me/policies → no data params (empty config)
 *
 * Full coverage sprint promoted all endpoints to broker level.
 */
describe("Broker full coverage — 4 previously-passthrough endpoints", () => {
  let report: CoverageReport;

  beforeAll(() => {
    report = generateCoverageReport();
  });

  // ── managerInfo ────────────────────────────────────────────────────────────

  describe("managerInfo", () => {
    it("is registered in the endpoint registry", () => {
      const ep = report.endpoints.find(e => e.procedure === "managerInfo");
      expect(ep).toBeDefined();
    });

    it("is broker-wired", () => {
      const ep = report.endpoints.find(e => e.procedure === "managerInfo")!;
      expect(ep.wiringLevel).toBe("broker");
    });

    it("has paramCount 1 (wait_for_complete)", () => {
      const ep = report.endpoints.find(e => e.procedure === "managerInfo")!;
      expect(ep.paramCount).toBe(1);
    });

    it("has brokerConfig MANAGER_INFO_CONFIG", () => {
      const ep = report.endpoints.find(e => e.procedure === "managerInfo")!;
      expect(ep.brokerConfig).toBe("MANAGER_INFO_CONFIG");
    });

    it("maps to /manager/info", () => {
      const ep = report.endpoints.find(e => e.procedure === "managerInfo")!;
      expect(ep.wazuhPath).toBe("/manager/info");
    });
  });

  // ── managerStatus ──────────────────────────────────────────────────────────

  describe("managerStatus", () => {
    it("is registered in the endpoint registry", () => {
      const ep = report.endpoints.find(e => e.procedure === "managerStatus");
      expect(ep).toBeDefined();
    });

    it("is broker-wired", () => {
      const ep = report.endpoints.find(e => e.procedure === "managerStatus")!;
      expect(ep.wiringLevel).toBe("broker");
    });

    it("has paramCount 1 (wait_for_complete)", () => {
      const ep = report.endpoints.find(e => e.procedure === "managerStatus")!;
      expect(ep.paramCount).toBe(1);
    });

    it("has brokerConfig MANAGER_STATUS_CONFIG", () => {
      const ep = report.endpoints.find(e => e.procedure === "managerStatus")!;
      expect(ep.brokerConfig).toBe("MANAGER_STATUS_CONFIG");
    });

    it("maps to /manager/status", () => {
      const ep = report.endpoints.find(e => e.procedure === "managerStatus")!;
      expect(ep.wazuhPath).toBe("/manager/status");
    });
  });

  // ── mitreMetadata ──────────────────────────────────────────────────────────

  describe("mitreMetadata", () => {
    it("is registered in the endpoint registry", () => {
      const ep = report.endpoints.find(e => e.procedure === "mitreMetadata");
      expect(ep).toBeDefined();
    });

    it("is broker-wired", () => {
      const ep = report.endpoints.find(e => e.procedure === "mitreMetadata")!;
      expect(ep.wiringLevel).toBe("broker");
    });

    it("has paramCount 1 (wait_for_complete)", () => {
      const ep = report.endpoints.find(e => e.procedure === "mitreMetadata")!;
      expect(ep.paramCount).toBe(1);
    });

    it("has brokerConfig MITRE_METADATA_CONFIG", () => {
      const ep = report.endpoints.find(e => e.procedure === "mitreMetadata")!;
      expect(ep.brokerConfig).toBe("MITRE_METADATA_CONFIG");
    });

    it("maps to /mitre/metadata", () => {
      const ep = report.endpoints.find(e => e.procedure === "mitreMetadata")!;
      expect(ep.wazuhPath).toBe("/mitre/metadata");
    });
  });

  // ── securityCurrentUserPolicies ────────────────────────────────────────────

  describe("securityCurrentUserPolicies", () => {
    it("is registered in the endpoint registry", () => {
      const ep = report.endpoints.find(e => e.procedure === "securityCurrentUserPolicies");
      expect(ep).toBeDefined();
    });

    it("is broker-wired", () => {
      const ep = report.endpoints.find(e => e.procedure === "securityCurrentUserPolicies")!;
      expect(ep.wiringLevel).toBe("broker");
    });

    it("has paramCount 0 (no data params)", () => {
      const ep = report.endpoints.find(e => e.procedure === "securityCurrentUserPolicies")!;
      expect(ep.paramCount).toBe(0);
    });

    it("has brokerConfig SECURITY_CURRENT_USER_POLICIES_CONFIG", () => {
      const ep = report.endpoints.find(e => e.procedure === "securityCurrentUserPolicies")!;
      expect(ep.brokerConfig).toBe("SECURITY_CURRENT_USER_POLICIES_CONFIG");
    });

    it("maps to /security/users/me/policies", () => {
      const ep = report.endpoints.find(e => e.procedure === "securityCurrentUserPolicies")!;
      expect(ep.wazuhPath).toBe("/security/users/me/policies");
    });
  });

  // ── Cross-validation ──────────────────────────────────────────────────────

  describe("cross-validation", () => {
    it("MANAGER_CONFIG is still used by managerConfiguration (not removed)", () => {
      const ep = report.endpoints.find(e => e.procedure === "managerConfiguration");
      expect(ep).toBeDefined();
      expect(ep!.wiringLevel).toBe("broker");
      expect(ep!.brokerConfig).toBe("MANAGER_CONFIG");
    });

    it("MITRE_REFERENCES_CONFIG is still used by mitreReferences (not removed)", () => {
      const ep = report.endpoints.find(e => e.procedure === "mitreReferences");
      expect(ep).toBeDefined();
      expect(ep!.wiringLevel).toBe("broker");
      expect(ep!.brokerConfig).toBe("MITRE_REFERENCES_CONFIG");
    });

    it("no passthrough endpoint has a brokerConfig set", () => {
      const passthroughEps = report.endpoints.filter(e => e.wiringLevel === "passthrough");
      for (const ep of passthroughEps) {
        expect(ep.brokerConfig, `${ep.procedure} is passthrough but has brokerConfig=${ep.brokerConfig}`).toBeFalsy();
      }
    });

    it("all broker-wired endpoints have brokerConfig set", () => {
      const brokerEps = report.endpoints.filter(e => e.wiringLevel === "broker");
      for (const ep of brokerEps) {
        expect(ep.brokerConfig, `${ep.procedure} is broker-wired but missing brokerConfig`).toBeTruthy();
      }
    });

    it("100% broker coverage — zero passthrough, zero manual", () => {
      expect(report.passthrough).toBe(0);
      expect(report.manualParam).toBe(0);
      expect(report.brokerCoveragePercent).toBe(100);
    });
  });
});
