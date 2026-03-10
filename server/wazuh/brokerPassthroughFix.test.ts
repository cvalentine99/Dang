import { describe, it, expect, beforeAll } from "vitest";
import { generateCoverageReport, type CoverageReport } from "./brokerCoverage";

/**
 * Validates the fix for 4 endpoints that were incorrectly registered as
 * "broker-wired" in brokerCoverage.ts but actually perform bare proxyGet()
 * with no parameter wiring.
 *
 * Per the Wazuh API spec v4.14.3:
 *   - /manager/info          → only pretty, wait_for_complete (cosmetic)
 *   - /manager/status        → only pretty, wait_for_complete (cosmetic)
 *   - /mitre/metadata        → only pretty, wait_for_complete (cosmetic)
 *   - /security/users/me/policies → only pretty (cosmetic)
 *
 * None of these accept data-filtering params (offset, limit, sort, search,
 * section, field, raw, distinct, q, reference_ids). The router's bare
 * proxyGet() is correct; the registry was wrong.
 */
describe("Broker passthrough fix — 4 endpoints", () => {
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

    it("is passthrough (not broker-wired)", () => {
      const ep = report.endpoints.find(e => e.procedure === "managerInfo")!;
      expect(ep.wiringLevel).toBe("passthrough");
    });

    it("has paramCount 0", () => {
      const ep = report.endpoints.find(e => e.procedure === "managerInfo")!;
      expect(ep.paramCount).toBe(0);
    });

    it("has no brokerConfig reference", () => {
      const ep = report.endpoints.find(e => e.procedure === "managerInfo")!;
      expect(ep.brokerConfig).toBeFalsy();
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

    it("is passthrough (not broker-wired)", () => {
      const ep = report.endpoints.find(e => e.procedure === "managerStatus")!;
      expect(ep.wiringLevel).toBe("passthrough");
    });

    it("has paramCount 0", () => {
      const ep = report.endpoints.find(e => e.procedure === "managerStatus")!;
      expect(ep.paramCount).toBe(0);
    });

    it("has no brokerConfig reference", () => {
      const ep = report.endpoints.find(e => e.procedure === "managerStatus")!;
      expect(ep.brokerConfig).toBeFalsy();
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

    it("is passthrough (not broker-wired)", () => {
      const ep = report.endpoints.find(e => e.procedure === "mitreMetadata")!;
      expect(ep.wiringLevel).toBe("passthrough");
    });

    it("has paramCount 0", () => {
      const ep = report.endpoints.find(e => e.procedure === "mitreMetadata")!;
      expect(ep.paramCount).toBe(0);
    });

    it("has no brokerConfig reference", () => {
      const ep = report.endpoints.find(e => e.procedure === "mitreMetadata")!;
      expect(ep.brokerConfig).toBeFalsy();
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

    it("is passthrough (not broker-wired)", () => {
      const ep = report.endpoints.find(e => e.procedure === "securityCurrentUserPolicies")!;
      expect(ep.wiringLevel).toBe("passthrough");
    });

    it("has paramCount 0", () => {
      const ep = report.endpoints.find(e => e.procedure === "securityCurrentUserPolicies")!;
      expect(ep.paramCount).toBe(0);
    });

    it("has no brokerConfig reference", () => {
      const ep = report.endpoints.find(e => e.procedure === "securityCurrentUserPolicies")!;
      expect(ep.brokerConfig).toBeFalsy();
    });

    it("maps to /security/users/me/policies", () => {
      const ep = report.endpoints.find(e => e.procedure === "securityCurrentUserPolicies")!;
      expect(ep.wazuhPath).toBe("/security/users/me/policies");
    });
  });

  // ── Cross-validation: these endpoints must NOT appear in broker configs ────

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

    it("all broker-wired endpoints still have brokerConfig set", () => {
      const brokerEps = report.endpoints.filter(e => e.wiringLevel === "broker");
      for (const ep of brokerEps) {
        expect(ep.brokerConfig, `${ep.procedure} is broker-wired but missing brokerConfig`).toBeTruthy();
      }
    });
  });
});
