import { describe, it, expect, beforeAll } from "vitest";
import { generateCoverageReport, type CoverageReport } from "./brokerCoverage";

/**
 * Validates the truthful classification of 4 endpoints that were previously
 * falsely registered as "broker" but are actually passthrough in wazuhRouter.ts.
 *
 * These endpoints have broker configs defined in paramBroker.ts (e.g.
 * MANAGER_INFO_CONFIG), but the tRPC procedures do NOT call brokerParams()
 * at runtime — they are simple passthrough calls to proxyGet().
 *
 * The registry now correctly reflects the runtime behavior:
 *   - /manager/info               → passthrough (no brokerParams call)
 *   - /manager/status             → passthrough (no brokerParams call)
 *   - /mitre/metadata             → passthrough (no brokerParams call)
 *   - /security/users/me/policies → passthrough (no brokerParams call)
 */
describe("Truthful classification — 4 previously-overstated endpoints", () => {
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

    it("is passthrough (does not call brokerParams at runtime)", () => {
      const ep = report.endpoints.find(e => e.procedure === "managerInfo")!;
      expect(ep.wiringLevel).toBe("passthrough");
    });

    it("has paramCount 0 (no query params forwarded)", () => {
      const ep = report.endpoints.find(e => e.procedure === "managerInfo")!;
      expect(ep.paramCount).toBe(0);
    });

    it("has no brokerConfig (passthrough endpoints omit it)", () => {
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

    it("is passthrough (does not call brokerParams at runtime)", () => {
      const ep = report.endpoints.find(e => e.procedure === "managerStatus")!;
      expect(ep.wiringLevel).toBe("passthrough");
    });

    it("has paramCount 0 (no query params forwarded)", () => {
      const ep = report.endpoints.find(e => e.procedure === "managerStatus")!;
      expect(ep.paramCount).toBe(0);
    });

    it("has no brokerConfig (passthrough endpoints omit it)", () => {
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

    it("is passthrough (does not call brokerParams at runtime)", () => {
      const ep = report.endpoints.find(e => e.procedure === "mitreMetadata")!;
      expect(ep.wiringLevel).toBe("passthrough");
    });

    it("has paramCount 0 (no query params forwarded)", () => {
      const ep = report.endpoints.find(e => e.procedure === "mitreMetadata")!;
      expect(ep.paramCount).toBe(0);
    });

    it("has no brokerConfig (passthrough endpoints omit it)", () => {
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

    it("is passthrough (does not call brokerParams at runtime)", () => {
      const ep = report.endpoints.find(e => e.procedure === "securityCurrentUserPolicies")!;
      expect(ep.wiringLevel).toBe("passthrough");
    });

    it("has paramCount 0 (no data params)", () => {
      const ep = report.endpoints.find(e => e.procedure === "securityCurrentUserPolicies")!;
      expect(ep.paramCount).toBe(0);
    });

    it("has no brokerConfig (passthrough endpoints omit it)", () => {
      const ep = report.endpoints.find(e => e.procedure === "securityCurrentUserPolicies")!;
      expect(ep.brokerConfig).toBeFalsy();
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

    it("broker coverage is truthful — less than 100% since not all procedures call brokerParams()", () => {
      expect(report.passthrough).toBeGreaterThan(0);
      expect(report.manualParam).toBeGreaterThan(0);
      expect(report.brokerCoveragePercent).toBeLessThan(100);
      // Broker + manual + passthrough = total
      expect(report.brokerWired + report.manualParam + report.passthrough).toBe(report.totalProcedures);
    });

    it("no manual endpoint has a brokerConfig set", () => {
      const manualEps = report.endpoints.filter(e => e.wiringLevel === "manual");
      for (const ep of manualEps) {
        expect(ep.brokerConfig, `${ep.procedure} is manual but has brokerConfig=${ep.brokerConfig}`).toBeFalsy();
      }
    });
  });
});
