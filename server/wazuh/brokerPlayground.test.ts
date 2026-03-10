/**
 * Broker Playground & Config List — endpoint tests
 *
 * Validates the brokerPlayground mutation and brokerConfigList query
 * that power the Param Playground UI page.
 */

import { describe, it, expect } from "vitest";
import {
  brokerParams,
  AGENTS_CONFIG,
  RULES_CONFIG,
  MANAGER_CONFIG,
  SYSCHECK_CONFIG,
  MITRE_TECHNIQUES_CONFIG,
  SECURITY_ROLES_CONFIG,
  DECODER_FILE_CONTENT_CONFIG,
  SECURITY_ACTIONS_CONFIG,
} from "./paramBroker";
import { BROKER_CONFIG_REGISTRY } from "./brokerCoverage";

describe("Broker Config Registry", () => {
  it("exports a non-empty array of configs", () => {
    expect(Array.isArray(BROKER_CONFIG_REGISTRY)).toBe(true);
    expect(BROKER_CONFIG_REGISTRY.length).toBeGreaterThan(30);
  });

  it("every entry has a name, config with endpoint and params", () => {
    for (const entry of BROKER_CONFIG_REGISTRY) {
      expect(entry.name).toBeTruthy();
      expect(entry.config).toBeDefined();
      expect(entry.config.endpoint).toBeTruthy();
      expect(typeof entry.config.params).toBe("object");
    }
  });

  it("config names are unique", () => {
    const names = BROKER_CONFIG_REGISTRY.map(e => e.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("includes known configs", () => {
    const names = BROKER_CONFIG_REGISTRY.map(e => e.name);
    expect(names).toContain("AGENTS_CONFIG");
    expect(names).toContain("RULES_CONFIG");
    expect(names).toContain("SYSCHECK_CONFIG");
    expect(names).toContain("MITRE_TECHNIQUES_CONFIG");
    expect(names).toContain("SECURITY_ROLES_CONFIG");
    expect(names).toContain("DECODER_FILE_CONTENT_CONFIG");
    expect(names).toContain("SECURITY_ACTIONS_CONFIG");
  });
});

describe("Broker Playground — brokerParams validation", () => {
  it("recognizes valid AGENTS_CONFIG params", () => {
    const result = brokerParams(AGENTS_CONFIG, {
      limit: 10,
      offset: 0,
      sort: "+name",
      status: "active",
    });
    expect(result.recognizedParams).toContain("limit");
    expect(result.recognizedParams).toContain("offset");
    expect(result.recognizedParams).toContain("sort");
    expect(result.recognizedParams).toContain("status");
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("flags unsupported params", () => {
    const result = brokerParams(AGENTS_CONFIG, {
      limit: 10,
      nonexistent_param: "foo",
      another_fake: 42,
    });
    expect(result.recognizedParams).toContain("limit");
    expect(result.unsupportedParams).toContain("nonexistent_param");
    expect(result.unsupportedParams).toContain("another_fake");
  });

  it("handles empty input gracefully", () => {
    const result = brokerParams(AGENTS_CONFIG, {});
    expect(result.recognizedParams).toHaveLength(0);
    expect(result.unsupportedParams).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(Object.keys(result.forwardedQuery)).toHaveLength(0);
  });

  it("forwards correct Wazuh param names", () => {
    const result = brokerParams(RULES_CONFIG, {
      limit: 25,
      offset: 0,
      search: "ssh",
    });
    expect(result.forwardedQuery.limit).toBe("25");
    expect(result.forwardedQuery.offset).toBe("0");
    expect(result.forwardedQuery.search).toBe("ssh");
  });

  it("validates DECODER_FILE_CONTENT_CONFIG params", () => {
    const result = brokerParams(DECODER_FILE_CONTENT_CONFIG, {
      raw: true,
      relative_dirname: "etc/decoders",
      wait_for_complete: true,
    });
    expect(result.recognizedParams).toContain("raw");
    expect(result.recognizedParams).toContain("relative_dirname");
    expect(result.recognizedParams).toContain("wait_for_complete");
    expect(result.unsupportedParams).toHaveLength(0);
  });

  it("validates SECURITY_ACTIONS_CONFIG params", () => {
    const result = brokerParams(SECURITY_ACTIONS_CONFIG, {
      endpoint: "/agents",
    });
    expect(result.recognizedParams).toContain("endpoint");
    expect(result.unsupportedParams).toHaveLength(0);
  });

  it("handles boolean coercion", () => {
    const result = brokerParams(DECODER_FILE_CONTENT_CONFIG, {
      raw: true,
      wait_for_complete: false,
    });
    expect(result.recognizedParams).toContain("raw");
    expect(result.recognizedParams).toContain("wait_for_complete");
  });

  it("handles mixed valid and invalid params", () => {
    const result = brokerParams(SYSCHECK_CONFIG, {
      limit: 50,
      offset: 0,
      search: "test",
      fake_param: "bad",
      another_bad: 123,
    });
    expect(result.recognizedParams.length).toBeGreaterThanOrEqual(3);
    expect(result.unsupportedParams).toContain("fake_param");
    expect(result.unsupportedParams).toContain("another_bad");
  });
});

describe("Broker Config List — structure validation", () => {
  it("produces a valid config list for the playground dropdown", () => {
    const configList = BROKER_CONFIG_REGISTRY.map(e => ({
      name: e.name,
      endpoint: e.config.endpoint,
      paramCount: Object.keys(e.config.params).length,
      params: Object.entries(e.config.params).map(([key, def]) => ({
        key,
        wazuhName: def.wazuhName,
        type: def.type,
        description: def.description,
        aliases: def.aliases || [],
      })),
    }));

    expect(configList.length).toBeGreaterThan(30);

    for (const config of configList) {
      expect(config.name).toBeTruthy();
      expect(config.endpoint).toBeTruthy();
      expect(config.paramCount).toBeGreaterThanOrEqual(0);
      expect(config.params.length).toBe(config.paramCount);

      for (const param of config.params) {
        expect(param.key).toBeTruthy();
        expect(param.wazuhName).toBeTruthy();
        expect(["string", "number", "boolean", "enum", "csv"]).toContain(param.type);
        expect(param.description).toBeTruthy();
        expect(Array.isArray(param.aliases)).toBe(true);
      }
    }
  });

  it("AGENTS_CONFIG has the expected param count", () => {
    const agentsEntry = BROKER_CONFIG_REGISTRY.find(e => e.name === "AGENTS_CONFIG");
    expect(agentsEntry).toBeDefined();
    const paramCount = Object.keys(agentsEntry!.config.params).length;
    expect(paramCount).toBeGreaterThanOrEqual(15);
  });
});
