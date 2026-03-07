/**
 * Tests for the 3 promoted experimental syscollector broker configs:
 *   - EXP_SYSCOLLECTOR_PACKAGES_CONFIG  (13 params)
 *   - EXP_SYSCOLLECTOR_PROCESSES_CONFIG  (22 params)
 *   - EXP_SYSCOLLECTOR_PORTS_CONFIG      (16 params)
 *
 * Validates:
 *   1. Param counts match expected totals
 *   2. All universal params are forwarded correctly
 *   3. agents_list cross-agent filter works (csv coercion)
 *   4. All endpoint-specific field filters forward correctly
 *   5. Dotted keys (local.ip, local.port, remote.ip) forward correctly
 *   6. Unsupported params are rejected
 *   7. Aliases resolve to canonical wazuhName
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  brokerParams,
  EXP_SYSCOLLECTOR_PACKAGES_CONFIG,
  EXP_SYSCOLLECTOR_PROCESSES_CONFIG,
  EXP_SYSCOLLECTOR_PORTS_CONFIG,
} from "./paramBroker";

// ── EXP_SYSCOLLECTOR_PACKAGES_CONFIG ────────────────────────────────────────

describe("EXP_SYSCOLLECTOR_PACKAGES_CONFIG", () => {
  it("has exactly 13 params", () => {
    expect(Object.keys(EXP_SYSCOLLECTOR_PACKAGES_CONFIG.params)).toHaveLength(13);
  });

  it("targets /experimental/syscollector/packages", () => {
    expect(EXP_SYSCOLLECTOR_PACKAGES_CONFIG.endpoint).toBe("/experimental/syscollector/packages");
  });

  it("forwards all 7 universal params", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PACKAGES_CONFIG, {
      offset: 0,
      limit: 50,
      sort: "+name",
      search: "openssl",
      select: ["name", "version"],
      q: "vendor=Canonical",
      distinct: true,
    });
    expect(result.errors).toHaveLength(0);
    expect(result.forwardedQuery.offset).toBe("0");
    expect(result.forwardedQuery.limit).toBe("50");
    expect(result.forwardedQuery.sort).toBe("+name");
    expect(result.forwardedQuery.search).toBe("openssl");
    expect(result.forwardedQuery.select).toBe("name,version");
    expect(result.forwardedQuery.q).toBe("vendor=Canonical");
    expect(result.forwardedQuery.distinct).toBe("true");
  });

  it("forwards agents_list as csv", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PACKAGES_CONFIG, {
      agents_list: ["001", "002", "003"],
    });
    expect(result.errors).toHaveLength(0);
    expect(result.forwardedQuery.agents_list).toBe("001,002,003");
  });

  it("resolves agent_list alias to agents_list", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PACKAGES_CONFIG, {
      agent_list: "001,002",
    });
    expect(result.errors).toHaveLength(0);
    expect(result.forwardedQuery.agents_list).toBe("001,002");
  });

  it("forwards all 5 field filters", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PACKAGES_CONFIG, {
      vendor: "Canonical",
      name: "openssl",
      architecture: "amd64",
      format: "deb",
      version: "1.1.1",
    });
    expect(result.errors).toHaveLength(0);
    expect(result.forwardedQuery.vendor).toBe("Canonical");
    expect(result.forwardedQuery.name).toBe("openssl");
    expect(result.forwardedQuery.architecture).toBe("amd64");
    expect(result.forwardedQuery.format).toBe("deb");
    expect(result.forwardedQuery.version).toBe("1.1.1");
  });

  it("rejects unsupported params", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PACKAGES_CONFIG, {
      name: "openssl",
      bogus: "nope",
    });
    expect(result.unsupportedParams).toContain("bogus");
  });
});

// ── EXP_SYSCOLLECTOR_PROCESSES_CONFIG ───────────────────────────────────────

describe("EXP_SYSCOLLECTOR_PROCESSES_CONFIG", () => {
  it("has exactly 22 params", () => {
    expect(Object.keys(EXP_SYSCOLLECTOR_PROCESSES_CONFIG.params)).toHaveLength(22);
  });

  it("targets /experimental/syscollector/processes", () => {
    expect(EXP_SYSCOLLECTOR_PROCESSES_CONFIG.endpoint).toBe("/experimental/syscollector/processes");
  });

  it("forwards universal params", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PROCESSES_CONFIG, {
      offset: 10,
      limit: 100,
      sort: "-pid",
      search: "nginx",
    });
    expect(result.errors).toHaveLength(0);
    expect(result.forwardedQuery.offset).toBe("10");
    expect(result.forwardedQuery.limit).toBe("100");
    expect(result.forwardedQuery.sort).toBe("-pid");
    expect(result.forwardedQuery.search).toBe("nginx");
  });

  it("forwards agents_list cross-agent filter", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PROCESSES_CONFIG, {
      agents_list: "001,002",
    });
    expect(result.errors).toHaveLength(0);
    expect(result.forwardedQuery.agents_list).toBe("001,002");
  });

  it("forwards all 14 process field filters", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PROCESSES_CONFIG, {
      pid: "1234",
      state: "S",
      ppid: "1",
      egroup: "root",
      euser: "root",
      fgroup: "root",
      name: "nginx",
      nlwp: "4",
      pgrp: "1234",
      priority: "20",
      rgroup: "root",
      ruser: "root",
      sgroup: "root",
      suser: "root",
    });
    expect(result.errors).toHaveLength(0);
    expect(result.forwardedQuery.pid).toBe("1234");
    expect(result.forwardedQuery.state).toBe("S");
    expect(result.forwardedQuery.ppid).toBe("1");
    expect(result.forwardedQuery.egroup).toBe("root");
    expect(result.forwardedQuery.euser).toBe("root");
    expect(result.forwardedQuery.fgroup).toBe("root");
    expect(result.forwardedQuery.name).toBe("nginx");
    expect(result.forwardedQuery.nlwp).toBe("4");
    expect(result.forwardedQuery.pgrp).toBe("1234");
    expect(result.forwardedQuery.priority).toBe("20");
    expect(result.forwardedQuery.rgroup).toBe("root");
    expect(result.forwardedQuery.ruser).toBe("root");
    expect(result.forwardedQuery.sgroup).toBe("root");
    expect(result.forwardedQuery.suser).toBe("root");
  });

  it("resolves process_pid alias to pid", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PROCESSES_CONFIG, {
      process_pid: "5678",
    });
    expect(result.errors).toHaveLength(0);
    expect(result.forwardedQuery.pid).toBe("5678");
  });

  it("resolves process_name alias to name", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PROCESSES_CONFIG, {
      process_name: "sshd",
    });
    expect(result.errors).toHaveLength(0);
    expect(result.forwardedQuery.name).toBe("sshd");
  });

  it("resolves process_state alias to state", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PROCESSES_CONFIG, {
      process_state: "R",
    });
    expect(result.errors).toHaveLength(0);
    expect(result.forwardedQuery.state).toBe("R");
  });

  it("rejects unsupported params", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PROCESSES_CONFIG, {
      pid: "1234",
      cpu_usage: "50",
    });
    expect(result.unsupportedParams).toContain("cpu_usage");
  });
});

// ── EXP_SYSCOLLECTOR_PORTS_CONFIG ───────────────────────────────────────────

describe("EXP_SYSCOLLECTOR_PORTS_CONFIG", () => {
  it("has exactly 16 params", () => {
    expect(Object.keys(EXP_SYSCOLLECTOR_PORTS_CONFIG.params)).toHaveLength(16);
  });

  it("targets /experimental/syscollector/ports", () => {
    expect(EXP_SYSCOLLECTOR_PORTS_CONFIG.endpoint).toBe("/experimental/syscollector/ports");
  });

  it("forwards universal params", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PORTS_CONFIG, {
      offset: 0,
      limit: 500,
      sort: "+protocol",
      search: "tcp",
      select: "pid,protocol,local.port",
      q: "state=listening",
      distinct: true,
    });
    expect(result.errors).toHaveLength(0);
    expect(result.forwardedQuery.offset).toBe("0");
    expect(result.forwardedQuery.limit).toBe("500");
    expect(result.forwardedQuery.sort).toBe("+protocol");
    expect(result.forwardedQuery.search).toBe("tcp");
    expect(result.forwardedQuery.select).toBe("pid,protocol,local.port");
    expect(result.forwardedQuery.q).toBe("state=listening");
    expect(result.forwardedQuery.distinct).toBe("true");
  });

  it("forwards agents_list cross-agent filter", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PORTS_CONFIG, {
      agents_list: ["001", "005", "010"],
    });
    expect(result.errors).toHaveLength(0);
    expect(result.forwardedQuery.agents_list).toBe("001,005,010");
  });

  it("forwards dotted key local.ip correctly", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PORTS_CONFIG, {
      "local.ip": "192.168.1.100",
    });
    expect(result.errors).toHaveLength(0);
    expect(result.forwardedQuery["local.ip"]).toBe("192.168.1.100");
  });

  it("forwards dotted key local.port correctly", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PORTS_CONFIG, {
      "local.port": "443",
    });
    expect(result.errors).toHaveLength(0);
    expect(result.forwardedQuery["local.port"]).toBe("443");
  });

  it("forwards dotted key remote.ip correctly", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PORTS_CONFIG, {
      "remote.ip": "10.0.0.1",
    });
    expect(result.errors).toHaveLength(0);
    expect(result.forwardedQuery["remote.ip"]).toBe("10.0.0.1");
  });

  it("resolves local_ip alias to local.ip", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PORTS_CONFIG, {
      local_ip: "172.16.0.1",
    });
    expect(result.errors).toHaveLength(0);
    expect(result.forwardedQuery["local.ip"]).toBe("172.16.0.1");
  });

  it("resolves local_port alias to local.port", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PORTS_CONFIG, {
      local_port: "8080",
    });
    expect(result.errors).toHaveLength(0);
    expect(result.forwardedQuery["local.port"]).toBe("8080");
  });

  it("resolves remote_ip alias to remote.ip", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PORTS_CONFIG, {
      remote_ip: "10.0.0.2",
    });
    expect(result.errors).toHaveLength(0);
    expect(result.forwardedQuery["remote.ip"]).toBe("10.0.0.2");
  });

  it("forwards all non-dotted field filters", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PORTS_CONFIG, {
      pid: "1234",
      protocol: "tcp",
      tx_queue: "0",
      state: "listening",
      process: "nginx",
    });
    expect(result.errors).toHaveLength(0);
    expect(result.forwardedQuery.pid).toBe("1234");
    expect(result.forwardedQuery.protocol).toBe("tcp");
    expect(result.forwardedQuery.tx_queue).toBe("0");
    expect(result.forwardedQuery.state).toBe("listening");
    expect(result.forwardedQuery.process).toBe("nginx");
  });

  it("rejects unsupported params", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PORTS_CONFIG, {
      protocol: "tcp",
      rx_queue: "0",
    });
    expect(result.unsupportedParams).toContain("rx_queue");
  });

  it("handles full cross-agent query with all params", () => {
    const result = brokerParams(EXP_SYSCOLLECTOR_PORTS_CONFIG, {
      offset: 0,
      limit: 100,
      sort: "+local.port",
      search: "ssh",
      select: "pid,protocol",
      q: "state=listening",
      distinct: true,
      agents_list: "001,002",
      pid: "22",
      protocol: "tcp",
      "local.ip": "0.0.0.0",
      "local.port": "22",
      "remote.ip": "0.0.0.0",
      tx_queue: "0",
      state: "listening",
      process: "sshd",
    });
    expect(result.errors).toHaveLength(0);
    expect(result.unsupportedParams).toHaveLength(0);
    expect(Object.keys(result.forwardedQuery)).toHaveLength(16);
  });
});
