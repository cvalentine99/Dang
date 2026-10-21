/**
 * H-P3 — Parameter Broker value enforcement.
 *
 * The broker is a real backstop behind each procedure's zod schema:
 * enumValues, min/max, maxLength and allowedFields are ENFORCED. A violating
 * value is never forwarded, is listed in `rejectedParams`, and carries a
 * brokerError naming the param and what is allowed. In the router,
 * withBrokerWarnings() turns any rejection into BAD_REQUEST.
 */
import { describe, it, expect, vi } from "vitest";
import {
  brokerParams,
  brokerError,
  isBrokerRejection,
  UNIVERSAL_PARAMS,
  AGENTS_CONFIG,
  MANAGER_LOGS_CONFIG,
  CLUSTER_NODE_LOGS_CONFIG,
  type EndpointParamConfig,
} from "./paramBroker";
import { ENDPOINT_REGISTRY, BROKER_CONFIG_REGISTRY, deriveParamCount, generateCoverageReport } from "./brokerCoverage";

describe("brokerParams — enumValues enforcement", () => {
  it("forwards a value listed in enumValues", () => {
    const r = brokerParams(MANAGER_LOGS_CONFIG, { level: "error" });
    expect(r.forwardedQuery.level).toBe("error");
    expect(r.rejectedParams).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it("rejects a string value outside enumValues, naming the param and allowed values", () => {
    const r = brokerParams(MANAGER_LOGS_CONFIG, { level: "verbose" });
    expect(r.forwardedQuery.level).toBeUndefined();
    expect(r.rejectedParams).toEqual(["level"]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain("level: rejected —");
    expect(r.errors[0]).toContain('"verbose"');
    expect(r.errors[0]).toContain("allowed: critical, debug, debug2, error, info, warning");
    expect(isBrokerRejection(r.errors[0])).toBe(true);
  });

  it("checks every element of a csv param", () => {
    const ok = brokerParams(AGENTS_CONFIG, { status: ["active", "disconnected"] });
    expect(ok.forwardedQuery.status).toBe("active,disconnected");
    const bad = brokerParams(AGENTS_CONFIG, { status: ["active", "zombie"] });
    expect(bad.rejectedParams).toEqual(["status"]);
    expect(bad.errors[0]).toContain('"zombie"');
    expect(bad.forwardedQuery.status).toBeUndefined();
  });

  it("does not enforce enumValues on booleans (strict coercion already applies)", () => {
    const cfg: EndpointParamConfig = {
      endpoint: "/x",
      params: { raw: { wazuhName: "raw", description: "", type: "boolean", enumValues: ["true", "false"] } },
    };
    expect(brokerParams(cfg, { raw: true }).forwardedQuery.raw).toBe("true");
  });

  it("other params still forward when one is rejected", () => {
    const r = brokerParams(CLUSTER_NODE_LOGS_CONFIG, { level: "nope", tag: "wazuh-db", limit: 10 });
    expect(r.rejectedParams).toEqual(["level"]);
    expect(r.forwardedQuery.tag).toBe("wazuh-db");
    expect(r.forwardedQuery.limit).toBe("10");
  });
});

describe("brokerParams — numeric min/max (UNIVERSAL limit 1..500, offset >= 0)", () => {
  it("declares the bounds on UNIVERSAL_PARAMS", () => {
    expect(UNIVERSAL_PARAMS.limit.min).toBe(1);
    expect(UNIVERSAL_PARAMS.limit.max).toBe(500);
    expect(UNIVERSAL_PARAMS.offset.min).toBe(0);
  });

  it.each([1, 100, 500])("accepts limit=%i", (limit) => {
    expect(brokerParams(AGENTS_CONFIG, { limit }).forwardedQuery.limit).toBe(String(limit));
  });

  it.each([0, -5, 501, 100000])("rejects limit=%i", (limit) => {
    const r = brokerParams(AGENTS_CONFIG, { limit });
    expect(r.rejectedParams).toEqual(["limit"]);
    expect(r.forwardedQuery.limit).toBeUndefined();
    expect(r.errors[0]).toMatch(/limit: rejected — must be (>= 1|<= 500)/);
  });

  it("rejects negative offset, accepts 0", () => {
    expect(brokerParams(AGENTS_CONFIG, { offset: 0 }).forwardedQuery.offset).toBe("0");
    expect(brokerParams(AGENTS_CONFIG, { offset: -1 }).rejectedParams).toEqual(["offset"]);
  });

  it("aliases are reported under the name the caller used", () => {
    const cfg: EndpointParamConfig = {
      endpoint: "/x",
      params: { limit: { ...UNIVERSAL_PARAMS.limit, aliases: ["pageSize"] } },
    };
    const r = brokerParams(cfg, { pageSize: 9999 });
    expect(r.rejectedParams).toEqual(["pageSize"]);
    expect(r.errors[0]).toMatch(/^pageSize: rejected — /);
  });
});

describe("brokerParams — maxLength and allowedFields", () => {
  it("rejects an over-long q", () => {
    const r = brokerParams(AGENTS_CONFIG, { q: "x".repeat(4097) });
    expect(r.rejectedParams).toEqual(["q"]);
    expect(r.errors[0]).toContain("exceeds max length 4096");
    expect(brokerParams(AGENTS_CONFIG, { q: "status=active" }).forwardedQuery.q).toBe("status=active");
  });

  const cfg: EndpointParamConfig = {
    endpoint: "/x",
    params: {
      sort: { ...UNIVERSAL_PARAMS.sort, allowedFields: ["name", "id", "os.name"] },
      select: { ...UNIVERSAL_PARAMS.select, allowedFields: ["name", "id"] },
    },
  };

  it("accepts known sort fields with +/- direction", () => {
    expect(brokerParams(cfg, { sort: "-name,+os.name" }).forwardedQuery.sort).toBe("-name,+os.name");
  });

  it("rejects an unknown sort field", () => {
    const r = brokerParams(cfg, { sort: "+name,-password" });
    expect(r.rejectedParams).toEqual(["sort"]);
    expect(r.errors[0]).toContain('unknown field "password"; allowed: name, id, os.name');
  });

  it("rejects an unknown select field (csv array input)", () => {
    const r = brokerParams(cfg, { select: ["id", "key"] });
    expect(r.rejectedParams).toEqual(["select"]);
    expect(r.errors[0]).toContain('"key"');
  });

  it("params without allowedFields stay free-form", () => {
    expect(brokerParams(AGENTS_CONFIG, { sort: "+anything" }).forwardedQuery.sort).toBe("+anything");
  });
});

describe("brokerError / isBrokerRejection", () => {
  it("distinguishes rejections from coercion warnings", () => {
    expect(isBrokerRejection(brokerError("limit", "must be <= 500"))).toBe(true);
    const warn = brokerParams(AGENTS_CONFIG, { distinct: "yes" as unknown as boolean }).errors[0];
    expect(warn).toContain("could not coerce");
    expect(isBrokerRejection(warn)).toBe(false);
  });
});

describe("brokerCoverage — paramCount derived at report time", () => {
  it("no broker-wired registry entry carries a hand-typed paramCount (cross-check fails loudly)", () => {
    const offenders = ENDPOINT_REGISTRY
      .filter(e => e.wiringLevel === "broker" && e.paramCount !== undefined)
      .map(e => e.procedure);
    expect(offenders).toEqual([]);
  });

  it("every broker entry references a registered config", () => {
    const names = new Set(BROKER_CONFIG_REGISTRY.map(c => c.name));
    for (const e of ENDPOINT_REGISTRY.filter(x => x.wiringLevel === "broker")) {
      expect(names.has(e.brokerConfig!), `${e.procedure} → ${e.brokerConfig}`).toBe(true);
    }
  });

  it("report paramCount equals Object.keys(config.params).length", () => {
    const report = generateCoverageReport();
    for (const ep of report.endpoints.filter(e => e.wiringLevel === "broker")) {
      const cfg = BROKER_CONFIG_REGISTRY.find(c => c.name === ep.brokerConfig)!;
      expect(ep.paramCount, ep.procedure).toBe(Object.keys(cfg.config.params).length);
    }
  });

  it("deriveParamCount throws on an unknown config name", () => {
    expect(() => deriveParamCount({ brokerConfig: "NOPE_CONFIG" })).toThrow(/unknown broker config/);
    expect(deriveParamCount({ paramCount: 3 })).toBe(3);
  });
});

// ── Router integration: a rejection becomes BAD_REQUEST ──────────────────────
vi.mock("./wazuhClient", () => ({
  isWazuhConfigured: vi.fn(() => true),
  getWazuhConfig: vi.fn(() => ({ host: "wazuh.test", port: 55000, user: "u", pass: "p" })),
  wazuhGet: vi.fn(async () => ({ data: { affected_items: [], total_affected_items: 0 } })),
  getEffectiveWazuhConfig: vi.fn(async () => ({ host: "wazuh.test", port: 55000, user: "u", pass: "p" })),
  isWazuhEffectivelyConfigured: vi.fn(async () => true),
}));

describe("wazuhRouter — broker rejection is BAD_REQUEST", () => {
  async function caller() {
    const { wazuhRouter } = await import("./wazuhRouter");
    return wazuhRouter.createCaller({
      user: { id: 1, openId: "t", email: "t@example.com", name: "t", loginMethod: "local", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { protocol: "https", headers: {} },
      res: { clearCookie: () => {} },
    } as never);
  }

  it("clusterNodeLogs with an out-of-enum level is rejected with the allowed list", async () => {
    const c = await caller();
    await expect(c.clusterNodeLogs({ nodeId: "node01", level: "verbose" } as never))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("level: rejected —") });
  });

  it("valid enum value passes through", async () => {
    const c = await caller();
    await expect(c.clusterNodeLogs({ nodeId: "node01", level: "error" } as never)).resolves.toBeDefined();
  });
});
