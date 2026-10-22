/**
 * Wazuh 5.0 de-risk — indexer states → Manager API field mapping.
 *
 * Fixture `_source` docs are copied from a live Wazuh 4.14.9 indexer
 * (wazuh-states-inventory-*-<cluster>, 2026-10-21) with identifying values
 * (IPs, hostnames, MACs, serials, user names, cluster name) redacted.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import yaml from "js-yaml";
import { TRPCError } from "@trpc/server";

const searchMock = vi.fn();
vi.mock("./indexerClient", async (orig) => {
  const real = await orig<typeof import("./indexerClient")>();
  return { ...real, indexerSearch: (...args: unknown[]) => searchMock(...args) };
});

import {
  STATES_MAPPINGS,
  buildStatesBody,
  buildSort,
  buildSearch,
  buildQ,
  translateDoc,
  statesQuery,
  toStatesQuery,
  scaPolicyItems,
  escapeWildcard,
  type StatesKind,
} from "./statesClient";
import { resolveSpecPath } from "../../shared/specPath";

const CFG = { host: "idx", port: 9200, user: "u", pass: "p", protocol: "https" as const };
const AGENT = { host: { ip: "10.0.0.1" }, id: "001", name: "agent-a", version: "v4.14.4" };
const WAZUH = { cluster: { name: "cluster-x" }, schema: { version: "1.0" } };

const FIXTURES: Partial<Record<StatesKind, Record<string, unknown>>> = {
  packages: { agent: AGENT, package: { architecture: "all", description: "Update Configuration File(s): preserve user changes to config files", name: "ucf", size: 219136, type: "deb", vendor: "Ubuntu Developers <redacted@example.com>", version: "3.0043+nmu1" }, wazuh: WAZUH },
  ports: { agent: AGENT, destination: { ip: "0.0.0.0", port: 0 }, file: { inode: "132180047" }, host: { network: { egress: { queue: 0 }, ingress: { queue: 0 } } }, network: { transport: "udp" }, process: { name: "systemd-resolve", pid: 2184245 }, source: { ip: "127.0.0.54", port: 53 }, wazuh: WAZUH },
  processes: { agent: AGENT, process: { args_count: 0, name: "kworker/0:0H-ev", parent: { pid: 2 }, pid: 10, start: "2026-08-27T10:26:03.000Z" }, wazuh: WAZUH },
  netaddr: { agent: AGENT, interface: { name: "ens33" }, network: { broadcast: "10.0.0.255", ip: "10.0.0.1", netmask: "255.255.255.0", type: "IPv4" }, wazuh: WAZUH },
  netiface: { agent: AGENT, host: { mac: "00:00:00:00:00:01", network: { egress: { bytes: 924227408, drops: 0, errors: 0, packets: 5385758 }, ingress: { bytes: 2931711769, drops: 0, errors: 0, packets: 64683133 } } }, interface: { mtu: 1500, name: "ens33", state: "up", type: "ethernet" }, wazuh: WAZUH },
  netproto: { agent: AGENT, interface: { name: "ens33" }, network: { dhcp: false, gateway: "10.0.0.254", metric: 100, type: "ipv4" }, wazuh: WAZUH },
  os: { agent: AGENT, host: { architecture: "x86_64", hostname: "host-a", os: { codename: "noble", kernel: { name: "Linux", release: "6.17.0-29-generic", version: "#29~24.04.1-Ubuntu SMP PREEMPT_DYNAMIC" }, name: "Ubuntu", platform: "ubuntu", version: "24.04.4 LTS (Noble Numbat)" } }, wazuh: WAZUH },
  hardware: { agent: AGENT, host: { cpu: { cores: 8, name: "AMD EPYC 7443P 24-Core Processor", speed: 2845 }, memory: { free: 24954810368, total: 33653166080, usage: 0.26, used: 8698355712 }, serial_number: "REDACTED" }, wazuh: WAZUH },
  users: { agent: AGENT, login: { status: false }, process: { pid: 0 }, user: { auth_failures: { count: 0 }, group: { id: 65534, id_signed: 65534 }, groups: ["nogroup"], home: "/nonexistent", id: "42", is_hidden: false, is_remote: true, name: "_apt", shell: "/usr/sbin/nologin", uid_signed: 42 }, wazuh: WAZUH },
  groups: { agent: AGENT, group: { id: 104, id_signed: 104, is_hidden: false, name: "_ssh" }, wazuh: WAZUH },
  services: { agent: AGENT, log: {}, process: { executable: "/usr/lib/systemd/system/ModemManager.service", pid: 0, user: { name: "root" } }, service: { description: "Modem Manager", enabled: "enabled", exit_code: 0, frequency: 0, id: "ModemManager", inetd_compatibility: false, name: "ModemManager", object_path: "/org/freedesktop/systemd1/unit/ModemManager_2eservice", starts: { on_mount: false }, state: "active", sub_state: "running", target: { address: "/", ephemeral_id: "0" }, win32_exit_code: 0 }, wazuh: WAZUH },
  browser_extensions: { agent: AGENT, browser: { name: "firefox", profile: { path: "app-builtin", referenced: false } }, package: { autoupdate: true, description: "Follow the operating system setting for buttons, menus, and windows.", enabled: true, from_webstore: false, id: "default-theme@mozilla.org", name: "System theme — auto", persistent: false, type: "theme", vendor: "Mozilla", version: "1.4.2", visible: true }, user: { id: "1000" }, wazuh: WAZUH },
};

// ── Spec: manager response item schema per endpoint ─────────────────────────
type Schema = Record<string, unknown>;
const spec = yaml.load(readFileSync(resolveSpecPath(), "utf-8")) as Schema;
function resolve(o: unknown, depth = 0): unknown {
  if (depth > 40) return {};
  if (Array.isArray(o)) return o.map(x => resolve(x, depth + 1));
  if (o && typeof o === "object") {
    const r = (o as Schema).$ref as string | undefined;
    if (r) {
      let x: unknown = spec;
      for (const p of r.split("/").slice(1)) x = (x as Schema)[p];
      return resolve(x, depth + 1);
    }
    return Object.fromEntries(Object.entries(o as Schema).map(([k, v]) => [k, resolve(v, depth + 1)]));
  }
  return o;
}
function leafPaths(sch: Schema, pre = ""): string[] {
  if (Array.isArray(sch.allOf)) return (sch.allOf as Schema[]).flatMap(s => leafPaths(s, pre));
  if (sch.type === "array" && sch.items && (sch.items as Schema).properties) return leafPaths(sch.items as Schema, pre);
  const props = sch.properties as Record<string, Schema> | undefined;
  if (!props) return [];
  return Object.entries(props).flatMap(([k, v]) => {
    const sub = leafPaths(v, pre + k + ".");
    return sub.length ? sub : [pre + k];
  });
}
function specItemFields(endpoint: string): { fields: string[]; example: Schema | undefined } {
  const path = endpoint.split("?")[0];
  const op = (spec.paths as Schema)[path] as Schema;
  const res = resolve(((op.get as Schema).responses as Schema)["200"]) as Schema;
  const json = (res.content as Schema)["application/json"] as Schema;
  const all = leafPaths(json.schema as Schema);
  const fields = all.filter(f => f.startsWith("data.affected_items.")).map(f => f.slice("data.affected_items.".length));
  return { fields, example: (json.example as Schema | undefined) };
}

/** Indexer-sourced fields documented as present in 4.14 responses but missing from the spec schema. */
const SPEC_ABSENT_OK = new Set(["packages:location", "packages:install_time", "netiface:adapter", "netproto:metric", "os:os.build", "syscheck_files:type", "syscheck_files:attributes", "syscheck_registries:type", "syscheck_registries:arch", "syscheck_registries:value.name", "syscheck_registries:value.type", "sca_checks:reason", "sca_policies:invalid", "sca_policies:total_checks", "hotfixes:agent_id"]);

describe("mapping vs 4.14 spec response schema", () => {
  for (const kind of Object.keys(STATES_MAPPINGS) as StatesKind[]) {
    const m = STATES_MAPPINGS[kind];
    it(`${kind}: every mapped manager field exists in ${m.managerEndpoint}`, () => {
      const { fields } = specItemFields(m.managerEndpoint);
      expect(fields.length).toBeGreaterThan(0);
      for (const f of [...m.fields.map(x => x.m), ...Object.keys(m.constants ?? {})]) {
        if (SPEC_ABSENT_OK.has(`${kind}:${f}`)) continue;
        expect(fields, `${kind}: ${f}`).toContain(f);
      }
    });
    it(`${kind}: every spec field is mapped or documented as omitted`, () => {
      const { fields } = specItemFields(m.managerEndpoint);
      const mapped = new Set([...m.fields.map(x => x.m), ...Object.keys(m.constants ?? {})]);
      // compliance/rules are arrays of objects in the SCA checks schema
      const unaccounted = fields.filter(f => !mapped.has(f) && !m.omitted.some(o => f === o || f.startsWith(o + ".")));
      expect(unaccounted, `${kind} unaccounted`).toEqual([]);
    });
  }
});

describe("translateDoc (live fixtures)", () => {
  it("packages → manager names", () => {
    const item = translateDoc(STATES_MAPPINGS.packages, FIXTURES.packages!);
    expect(item).toEqual({
      agent_id: "001", name: "ucf", version: "3.0043+nmu1", vendor: "Ubuntu Developers <redacted@example.com>",
      architecture: "all", format: "deb", description: "Update Configuration File(s): preserve user changes to config files", size: 219136,
    });
  });
  it("ports nests local/remote and coerces inode", () => {
    const item = translateDoc(STATES_MAPPINGS.ports, FIXTURES.ports!);
    expect(item).toMatchObject({ local: { ip: "127.0.0.54", port: 53 }, remote: { ip: "0.0.0.0", port: 0 }, protocol: "udp", inode: 132180047, pid: 2184245, process: "systemd-resolve", rx_queue: 0, tx_queue: 0 });
  });
  it("processes: pid string, ppid, start_time epoch seconds", () => {
    const item = translateDoc(STATES_MAPPINGS.processes, FIXTURES.processes!);
    expect(item).toMatchObject({ pid: "10", ppid: 2, name: "kworker/0:0H-ev", start_time: Math.floor(Date.parse("2026-08-27T10:26:03.000Z") / 1000) });
  });
  it("netaddr lowercases proto", () => {
    expect(translateDoc(STATES_MAPPINGS.netaddr, FIXTURES.netaddr!)).toEqual({ agent_id: "001", iface: "ens33", proto: "ipv4", address: "10.0.0.1", netmask: "255.255.255.0", broadcast: "10.0.0.255" });
  });
  it("netiface maps ingress→rx / egress→tx", () => {
    expect(translateDoc(STATES_MAPPINGS.netiface, FIXTURES.netiface!)).toMatchObject({ name: "ens33", mtu: 1500, mac: "00:00:00:00:00:01", rx: { bytes: 2931711769, packets: 64683133, error: 0, dropped: 0 }, tx: { bytes: 924227408, packets: 5385758 } });
  });
  it("netproto dhcp boolean → enabled/disabled", () => {
    expect(translateDoc(STATES_MAPPINGS.netproto, FIXTURES.netproto!)).toMatchObject({ iface: "ens33", type: "ipv4", gateway: "10.0.0.254", dhcp: "disabled" });
  });
  it("os splits kernel into sysname/release/version", () => {
    expect(translateDoc(STATES_MAPPINGS.os, FIXTURES.os!)).toMatchObject({ hostname: "host-a", architecture: "x86_64", sysname: "Linux", release: "6.17.0-29-generic", os: { name: "Ubuntu", platform: "ubuntu", codename: "noble" } });
  });
  it("hardware converts bytes→KiB and fraction→percent", () => {
    expect(translateDoc(STATES_MAPPINGS.hardware, FIXTURES.hardware!)).toEqual({
      agent_id: "001", board_serial: "REDACTED", cpu: { name: "AMD EPYC 7443P 24-Core Processor", cores: 8, mhz: 2845 },
      ram: { total: Math.round(33653166080 / 1024), free: Math.round(24954810368 / 1024), usage: 26 },
    });
  });
  it("users: booleans → 0/1, groups joined, ids numeric", () => {
    expect(translateDoc(STATES_MAPPINGS.users, FIXTURES.users!)).toMatchObject({
      user: { name: "_apt", id: 42, groups: "nogroup", group_id: 65534, is_hidden: 0, is_remote: 1, auth_failed_count: 0 },
      login: { status: 0 }, process_pid: 0,
    });
  });
  it("groups / services / browser_extensions flatten nested indexer objects", () => {
    expect(translateDoc(STATES_MAPPINGS.groups, FIXTURES.groups!)).toMatchObject({ group: { name: "_ssh", id: 104, is_hidden: 0 } });
    expect(translateDoc(STATES_MAPPINGS.services, FIXTURES.services!)).toMatchObject({
      service: { id: "ModemManager", state: "active", starts_on_mount: false, target_address: "/", target_ephemeral_id: 0 },
      process: { executable: "/usr/lib/systemd/system/ModemManager.service", user_name: "root" },
    });
    expect(translateDoc(STATES_MAPPINGS.browser_extensions, FIXTURES.browser_extensions!)).toMatchObject({
      browser: { name: "firefox", profile_path: "app-builtin", profile_referenced: false },
      package: { id: "default-theme@mozilla.org", vendor: "Mozilla", autoupdate: true },
    });
  });
  it("select projects manager fields (incl. nested parents)", () => {
    expect(translateDoc(STATES_MAPPINGS.ports, FIXTURES.ports!, ["local", "pid"])).toEqual({ local: { ip: "127.0.0.54", port: 53 }, pid: 2184245 });
  });
});

describe("query building", () => {
  it("agent term filter, from/size, default sort, track_total_hits", () => {
    const { body } = buildStatesBody("packages", { agentId: "001", limit: 25, offset: 50 });
    expect(body).toMatchObject({ from: 50, size: 25, sort: [{ "package.name": { order: "asc", unmapped_type: "keyword" } }], track_total_hits: true });
    expect((body.query as any).bool.filter[0]).toEqual({ term: { "agent.id": "001" } });
  });
  it("manager sort syntax (+/-) and field:dir, allowlisted", () => {
    expect(buildSort(STATES_MAPPINGS.packages, "-version,+name")).toEqual([
      { "package.version": { order: "desc", unmapped_type: "keyword" } },
      { "package.name": { order: "asc", unmapped_type: "keyword" } },
    ]);
    expect(buildSort(STATES_MAPPINGS.ports, "local.port:desc")).toEqual([{ "source.port": { order: "desc", unmapped_type: "keyword" } }]);
    expect(() => buildSort(STATES_MAPPINGS.packages, "nope")).toThrow(TRPCError);
  });
  it("search is a case-insensitive escaped wildcard over keyword fields; '-' negates", () => {
    const s = buildSearch(STATES_MAPPINGS.hotfixes, "KB*1") as any;
    expect(s.bool.should).toEqual([{ wildcard: { "package.hotfix.name": { value: "*KB\\*1*", case_insensitive: true } } }]);
    expect((buildSearch(STATES_MAPPINGS.hotfixes, "-x") as any).bool.must_not).toBeDefined();
    expect(escapeWildcard("a?b\\c")).toBe("a\\?b\\\\c");
  });
  it("field filters translate manager names (with reverse transforms)", () => {
    const { body } = buildStatesBody("netproto", { agentId: "001", filters: { dhcp: "enabled", iface: "eth0" } });
    expect((body.query as any).bool.filter).toEqual(expect.arrayContaining([{ term: { "network.dhcp": true } }, { term: { "interface.name": "eth0" } }]));
    const { body: b2 } = buildStatesBody("netiface", { agentId: "001", filters: { "rx.errors": "0" } });
    expect((b2.query as any).bool.filter).toContainEqual({ term: { "host.network.ingress.errors": "0" } });
  });
  it("unmapped filter / select / distinct are BAD_REQUEST, not silently dropped", () => {
    expect(() => buildStatesBody("processes", { agentId: "001", filters: { euser: "root" } })).toThrow(/euser/);
    expect(() => buildStatesBody("processes", { agentId: "001", select: "euser" })).toThrow(/euser/);
    expect(() => buildStatesBody("processes", { agentId: "001", distinct: true })).toThrow(/distinct/);
    expect(() => buildStatesBody("processes", { agentId: "001", offset: 9990, limit: 100 })).toThrow(/10000/);
  });
  it("q subset: ; AND, , OR, operators", () => {
    expect(buildQ(STATES_MAPPINGS.packages, "name=ucf;vendor~ubuntu,format!=rpm")).toEqual({
      bool: { filter: [
        { term: { "package.name": "ucf" } },
        { bool: { should: [
          { wildcard: { "package.vendor": { value: "*ubuntu*", case_insensitive: true } } },
          { bool: { must_not: [{ term: { "package.type": "rpm" } }] } },
        ], minimum_should_match: 1 } },
      ] },
    });
    expect(() => buildQ(STATES_MAPPINGS.packages, "(name=a)")).toThrow(/parentheses/);
  });
  it("syscheck: hash fans out to md5/sha1/sha256, summary projects", () => {
    const { body, select } = buildStatesBody("syscheck_files", { agentId: "001", filters: { type: "file", hash: "abc", summary: true } });
    const f = (body.query as any).bool.filter;
    expect(f[1].bool.should).toHaveLength(3);
    expect(select).toEqual(["file", "mtime", "date", "type"]);
  });
  it("toStatesQuery splits universal params from field filters", () => {
    expect(toStatesQuery("001", { limit: 10, offset: 0, sort: "+name", vendor: "x", wait_for_complete: true })).toEqual({
      agentId: "001", limit: 10, offset: 0, search: undefined, sort: "+name", select: undefined, q: undefined, distinct: undefined, filters: { vendor: "x" },
    });
  });
});

describe("envelope parity with the Manager API", () => {
  beforeEach(() => searchMock.mockReset());

  it("packages: same envelope keys/types as the spec example", async () => {
    searchMock.mockResolvedValue({ took: 1, timed_out: false, hits: { total: { value: 1860, relation: "eq" }, hits: [{ _index: "wazuh-states-inventory-packages-x", _id: "1", _score: null, _source: FIXTURES.packages }] } });
    const res = await statesQuery(CFG, "packages", { agentId: "001", limit: 1 }, 7);
    const { example } = specItemFields("/syscollector/{agent_id}/packages");
    const ex = example as any;
    expect(Object.keys(res).sort()).toEqual(Object.keys(ex).sort());
    expect(Object.keys(res.data).sort()).toEqual(Object.keys(ex.data).sort());
    expect(res.message).toBe(ex.message);
    expect(res.error).toBe(0);
    expect(res.data.total_affected_items).toBe(1860);
    expect(res.data.failed_items).toEqual([]);
    // every key we return exists in the manager example item (except documented extras)
    const exItem = ex.data.affected_items[0];
    for (const k of Object.keys(res.data.affected_items[0])) expect(Object.keys(exItem)).toContain(k);
    for (const [k, v] of Object.entries(res.data.affected_items[0])) expect(typeof v, k).toBe(typeof exItem[k]);
    // index pattern + rate-limit group + user passed through
    expect(searchMock).toHaveBeenCalledWith(CFG, "wazuh-states-inventory-packages*", expect.any(Object), "states", 7);
  });

  it("hardware: same nested shape and value types as the spec example", async () => {
    searchMock.mockResolvedValue({ took: 1, timed_out: false, hits: { total: 1, hits: [{ _index: "i", _id: "1", _score: null, _source: FIXTURES.hardware }] } });
    const res = await statesQuery(CFG, "hardware", { agentId: "001" });
    const ex = (specItemFields("/syscollector/{agent_id}/hardware").example as any).data.affected_items[0];
    const item = res.data.affected_items[0] as any;
    for (const k of ["cpu", "ram"]) for (const sub of Object.keys(ex[k])) expect(typeof item[k][sub], `${k}.${sub}`).toBe(typeof ex[k][sub]);
    expect(Number.isInteger(item.ram.usage)).toBe(true);
  });

  it("sca policies aggregate per policy.id with pass/fail/score", async () => {
    const items = scaPolicyItems([{ key: "cis_x", doc_count: 10, meta: { hits: { hits: [{ _source: { policy: { name: "CIS X", description: "d" } } }] } }, results: { buckets: [{ key: "passed", doc_count: 3 }, { key: "failed", doc_count: 6 }, { key: "not applicable", doc_count: 1 }] } }]);
    expect(translateDoc(STATES_MAPPINGS.sca_policies, items[0])).toEqual({ policy_id: "cis_x", name: "CIS X", description: "d", pass: 3, fail: 6, invalid: 1, total_checks: 10, score: 33 });
    searchMock.mockResolvedValue({ took: 1, timed_out: false, hits: { total: 0, hits: [] }, aggregations: { policies: { buckets: [] } } });
    const res = await statesQuery(CFG, "sca_policies", { agentId: "001" });
    expect(res).toEqual({ data: { affected_items: [], total_affected_items: 0, total_failed_items: 0, failed_items: [] }, message: "All selected SCA information was returned", error: 0 });
  });
});
