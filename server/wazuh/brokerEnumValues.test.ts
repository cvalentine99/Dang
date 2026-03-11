/**
 * Tests for broker enum values — validates that enumValues are correctly
 * defined on param configs and exposed through the brokerConfigList API.
 */
import { describe, it, expect } from "vitest";
import {
  AGENTS_CONFIG,
  RULES_CONFIG,
  MANAGER_LOGS_CONFIG,
  CLUSTER_NODE_LOGS_CONFIG,
  ROOTCHECK_CONFIG,
  SYSCHECK_CONFIG,
} from "./paramBroker";
import { BROKER_CONFIG_REGISTRY } from "./brokerCoverage";

describe("Broker enum values", () => {
  // ── Specific param enums ──────────────────────────────────────────────────

  it("AGENTS_CONFIG.status has correct enum values", () => {
    const statusParam = AGENTS_CONFIG.params.status;
    expect(statusParam.enumValues).toBeDefined();
    expect(statusParam.enumValues).toContain("active");
    expect(statusParam.enumValues).toContain("disconnected");
    expect(statusParam.enumValues).toContain("never_connected");
    expect(statusParam.enumValues).toContain("pending");
  });

  it("RULES_CONFIG.status has rule-specific enum values (not agent status)", () => {
    const statusParam = RULES_CONFIG.params.status;
    expect(statusParam.enumValues).toBeDefined();
    expect(statusParam.enumValues).toContain("enabled");
    expect(statusParam.enumValues).toContain("disabled");
    expect(statusParam.enumValues).toContain("all");
    // Must NOT contain agent status values
    expect(statusParam.enumValues).not.toContain("active");
    expect(statusParam.enumValues).not.toContain("disconnected");
  });

  it("MANAGER_LOGS_CONFIG.level has log level enum values", () => {
    const levelParam = MANAGER_LOGS_CONFIG.params.level;
    expect(levelParam.enumValues).toBeDefined();
    expect(levelParam.enumValues).toContain("error");
    expect(levelParam.enumValues).toContain("warning");
    expect(levelParam.enumValues).toContain("info");
    expect(levelParam.enumValues).toContain("debug");
  });

  it("CLUSTER_NODE_LOGS_CONFIG.level has log level enum values", () => {
    const levelParam = CLUSTER_NODE_LOGS_CONFIG.params.level;
    expect(levelParam.enumValues).toBeDefined();
    expect(levelParam.enumValues).toContain("critical");
    expect(levelParam.enumValues).toContain("debug2");
  });

  it("hash params have algorithm enum values (not boolean)", () => {
    const hashParam = SYSCHECK_CONFIG.params.hash;
    expect(hashParam).toBeDefined();
    expect(hashParam.enumValues).toBeDefined();
    expect(hashParam.enumValues).toContain("md5");
    expect(hashParam.enumValues).toContain("sha256");
    // Must NOT be boolean values
    expect(hashParam.enumValues).not.toContain("true");
    expect(hashParam.enumValues).not.toContain("false");
  });

  it("ROOTCHECK_CONFIG.status has agent status enum values", () => {
    const statusParam = ROOTCHECK_CONFIG.params.status;
    expect(statusParam.enumValues).toBeDefined();
    expect(statusParam.enumValues).toContain("active");
    expect(statusParam.enumValues).toContain("pending");
  });

  // ── No duplicate enumValues in any config ─────────────────────────────────

  it("no config has duplicate enumValues on the same param", () => {
    for (const entry of BROKER_CONFIG_REGISTRY) {
      for (const [key, def] of Object.entries(entry.config.params)) {
        if (def.enumValues) {
          const unique = new Set(def.enumValues);
          expect(
            unique.size,
            `${entry.name}.${key} has duplicate enumValues`
          ).toBe(def.enumValues.length);
        }
      }
    }
  });

  // ── brokerConfigList shape ────────────────────────────────────────────────

  it("BROKER_CONFIG_REGISTRY entries expose enumValues in params", () => {
    // Find the AGENTS_CONFIG entry
    const agentsEntry = BROKER_CONFIG_REGISTRY.find(e => e.name === "AGENTS_CONFIG");
    expect(agentsEntry).toBeDefined();

    const statusParam = agentsEntry!.config.params.status;
    expect(statusParam.enumValues).toBeDefined();
    expect(statusParam.enumValues!.length).toBeGreaterThan(0);
  });

  it("configs with boolean-only params do NOT have enumValues", () => {
    // wait_for_complete and distinct should NOT have enumValues
    for (const entry of BROKER_CONFIG_REGISTRY) {
      const wfc = entry.config.params.wait_for_complete;
      if (wfc) {
        // wait_for_complete is boolean — should not have enum values
        // (it's a flag, not a dropdown)
        if (wfc.enumValues) {
          expect(
            wfc.enumValues,
            `${entry.name}.wait_for_complete should not have enumValues`
          ).toEqual([]);
        }
      }
    }
  });

  // ── Enum values are arrays of strings ─────────────────────────────────────

  it("all enumValues are arrays of non-empty strings", () => {
    for (const entry of BROKER_CONFIG_REGISTRY) {
      for (const [key, def] of Object.entries(entry.config.params)) {
        if (def.enumValues && def.enumValues.length > 0) {
          for (const val of def.enumValues) {
            expect(
              typeof val,
              `${entry.name}.${key} enumValue must be string, got ${typeof val}`
            ).toBe("string");
            expect(
              val.length,
              `${entry.name}.${key} has empty enumValue`
            ).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  // ── Count check: at least N configs have enumValues ───────────────────────

  it("at least 10 configs have params with enumValues", () => {
    let configsWithEnums = 0;
    for (const entry of BROKER_CONFIG_REGISTRY) {
      const hasEnum = Object.values(entry.config.params).some(
        def => def.enumValues && def.enumValues.length > 0
      );
      if (hasEnum) configsWithEnums++;
    }
    expect(configsWithEnums).toBeGreaterThanOrEqual(10);
  });
});
