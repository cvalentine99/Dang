/**
 * Wazuh Indexer "states" client — Wazuh 5.0 de-risk (CODE_REVIEW_2026-10-21 §8 Phase 3).
 *
 * Wazuh 5.0 removes the Manager API `/syscollector/*`, `/syscheck*` and `/sca/*`
 * endpoints. The same data lives in the indexer's `wazuh-states-*` indices, which
 * exist in 4.14 (inventory + vulnerabilities) and survive 5.0. This module reads
 * those indices and returns the **Manager API envelope with Manager field names**
 * so the client and the broker configs need no change:
 *
 *   { data: { affected_items, total_affected_items, total_failed_items: 0, failed_items: [] }, message, error: 0 }
 *
 * Field mappings below were derived from (a) the 4.14 spec response schemas
 * (shared/specPath.ts) and (b) live documents + `_mapping` of a Wazuh 4.14.9
 * indexer (2026-10-21). Kinds with `verified: false` (FIM, SCA) have no index on
 * 4.14.9; their mapping follows the Wazuh 5.0 WCS state templates and must be
 * re-checked against a live 5.0 indexer — see docs/architecture/wazuh-5-compat.md.
 *
 * Manager fields with no indexer equivalent are omitted (listed per kind in
 * `omitted`). Manager `scan.id` / `scan.time` / `checksum` are never available.
 */
import { TRPCError } from "@trpc/server";
import {
  INDEX_PATTERNS,
  indexerSearch,
  type ESSearchBody,
  type ESSearchResponse,
  type IndexerConfig,
} from "./indexerClient";

export const STATES_RATE_LIMIT_GROUP = "states";

export type StatesKind =
  | "packages" | "ports" | "processes" | "netaddr" | "netiface" | "netproto"
  | "hotfixes" | "os" | "hardware" | "users" | "groups" | "services"
  | "browser_extensions" | "syscheck_files" | "syscheck_registries"
  | "sca_policies" | "sca_checks";

type Transform = (v: unknown) => unknown;

export interface FieldMap {
  /** Manager API field (dotted = nested object in the response). */
  m: string;
  /** Indexer `_source` field; an array lists fallbacks (first defined wins). */
  i: string | string[];
  /** indexer value → manager value */
  t?: Transform;
  /** manager filter value → indexer term value(s) */
  rev?: (v: string | number | boolean) => unknown;
  /** keyword field eligible for the free-text `search` wildcard */
  search?: boolean;
}

export interface KindMapping {
  index: string;
  managerEndpoint: string;
  message: string;
  fields: FieldMap[];
  defaultSort: string;
  /** Manager response fields with no indexer equivalent. */
  omitted: string[];
  /** true = mapping checked against a live 4.14.9 indexer document. */
  verified: boolean;
  /** Extra manager filter names accepted as aliases of a mapped field. */
  filterAliases?: Record<string, string>;
  /** Constant fields added to every item (e.g. syscheck `type`). */
  constants?: Record<string, unknown>;
}

// ── Transforms ───────────────────────────────────────────────────────────────
const toInt01: Transform = v => (typeof v === "boolean" ? (v ? 1 : 0) : v);
const toNum: Transform = v => {
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return v;
};
const isoToEpoch: Transform = v => {
  if (typeof v !== "string") return v;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : v;
};
const join = (sep: string): Transform => v => (Array.isArray(v) ? v.join(sep) : v);
const bytesToKB: Transform = v => (typeof v === "number" ? Math.round(v / 1024) : v);
const fracToPct: Transform = v => (typeof v === "number" ? Math.round(v <= 1 ? v * 100 : v) : v);
const lower: Transform = v => (typeof v === "string" ? v.toLowerCase() : v);
const dhcp: Transform = v => (v === true ? "enabled" : v === false ? "disabled" : v ?? "unknown");
const revDhcp = (v: string | number | boolean) => (v === "enabled" ? true : v === "disabled" ? false : v);
const revBool01 = (v: string | number | boolean) => (v === 1 || v === "1" || v === true || v === "true");
/** live 4.14 stores `IPv4`; manager returns `ipv4` — match either */
const revCaseVariants = (v: string | number | boolean) => {
  const s = String(v);
  return Array.from(new Set([s, s.toLowerCase(), s.toUpperCase(), s.replace(/^ipv/i, "IPv")]));
};

const AGENT: FieldMap = { m: "agent_id", i: "agent.id" };

// ── Mappings (indexer → manager) ─────────────────────────────────────────────
export const STATES_MAPPINGS: Record<StatesKind, KindMapping> = {
  packages: {
    index: INDEX_PATTERNS.STATES_PACKAGES,
    managerEndpoint: "/syscollector/{agent_id}/packages",
    message: "All specified syscollector information was returned",
    verified: true,
    defaultSort: "name",
    fields: [
      AGENT,
      { m: "name", i: "package.name", search: true },
      { m: "version", i: "package.version", search: true },
      { m: "vendor", i: "package.vendor", search: true },
      { m: "architecture", i: "package.architecture", search: true },
      { m: "format", i: "package.type", search: true },
      { m: "description", i: "package.description", search: true },
      { m: "multiarch", i: "package.multiarch" },
      { m: "priority", i: "package.priority" },
      { m: "section", i: "package.category" },
      { m: "source", i: "package.source", search: true },
      { m: "size", i: "package.size" },
      { m: "location", i: "package.path" },
      { m: "install_time", i: "package.installed" },
    ],
    // indexer package.size is bytes; manager `size` is reported in KiB on deb — left as-is (documented)
    omitted: ["scan.id", "scan.time"],
  },
  ports: {
    index: INDEX_PATTERNS.STATES_PORTS,
    managerEndpoint: "/syscollector/{agent_id}/ports",
    message: "All specified syscollector information was returned",
    verified: true,
    defaultSort: "local.port",
    fields: [
      AGENT,
      { m: "local.ip", i: "source.ip" },
      { m: "local.port", i: "source.port" },
      { m: "remote.ip", i: "destination.ip" },
      { m: "remote.port", i: "destination.port" },
      { m: "protocol", i: "network.transport", search: true },
      { m: "state", i: "interface.state", search: true },
      { m: "rx_queue", i: "host.network.ingress.queue" },
      { m: "tx_queue", i: "host.network.egress.queue" },
      { m: "inode", i: "file.inode", t: toNum },
      { m: "pid", i: "process.pid" },
      { m: "process", i: "process.name", search: true },
    ],
    omitted: ["scan.id", "scan.time"],
  },
  processes: {
    index: INDEX_PATTERNS.STATES_PROCESSES,
    managerEndpoint: "/syscollector/{agent_id}/processes",
    message: "All specified syscollector information was returned",
    verified: true,
    defaultSort: "pid",
    fields: [
      AGENT,
      { m: "pid", i: "process.pid", t: v => (typeof v === "number" ? String(v) : v) },
      { m: "ppid", i: "process.parent.pid" },
      { m: "name", i: "process.name", search: true },
      { m: "cmd", i: "process.command_line", search: true },
      { m: "argvs", i: "process.args", t: join(" "), search: true },
      { m: "state", i: "process.state" },
      { m: "start_time", i: "process.start", t: isoToEpoch },
      { m: "stime", i: "process.stime" },
      { m: "utime", i: "process.utime" },
    ],
    omitted: [
      "egroup", "euser", "fgroup", "nice", "nlwp", "pgrp", "priority", "processor", "resident",
      "rgroup", "ruser", "session", "sgroup", "share", "size", "suser", "tgid", "tty", "vm_size",
      "scan.id", "scan.time",
    ],
  },
  netaddr: {
    index: INDEX_PATTERNS.STATES_NETWORKS,
    managerEndpoint: "/syscollector/{agent_id}/netaddr",
    message: "All specified syscollector information was returned",
    verified: true,
    defaultSort: "iface",
    fields: [
      AGENT,
      { m: "iface", i: "interface.name", search: true },
      { m: "proto", i: "network.type", t: lower, rev: revCaseVariants, search: true },
      { m: "address", i: "network.ip" },
      { m: "netmask", i: "network.netmask" },
      { m: "broadcast", i: "network.broadcast" },
    ],
    omitted: ["scan_id"],
  },
  netiface: {
    index: INDEX_PATTERNS.STATES_INTERFACES,
    managerEndpoint: "/syscollector/{agent_id}/netiface",
    message: "All specified syscollector information was returned",
    verified: true,
    defaultSort: "name",
    fields: [
      AGENT,
      { m: "name", i: "interface.name", search: true },
      { m: "adapter", i: "interface.alias", search: true },
      { m: "type", i: "interface.type", search: true },
      { m: "state", i: "interface.state", search: true },
      { m: "mtu", i: "interface.mtu" },
      { m: "mac", i: "host.mac", search: true },
      { m: "rx.bytes", i: "host.network.ingress.bytes" },
      { m: "rx.packets", i: "host.network.ingress.packets" },
      { m: "rx.error", i: "host.network.ingress.errors" },
      { m: "rx.dropped", i: "host.network.ingress.drops" },
      { m: "tx.bytes", i: "host.network.egress.bytes" },
      { m: "tx.packets", i: "host.network.egress.packets" },
      { m: "tx.error", i: "host.network.egress.errors" },
      { m: "tx.dropped", i: "host.network.egress.drops" },
    ],
    // broker filter names are plural (`rx.errors`); response field is singular
    filterAliases: { "rx.errors": "rx.error", "tx.errors": "tx.error" },
    omitted: ["scan.id", "scan.time"],
  },
  netproto: {
    index: INDEX_PATTERNS.STATES_PROTOCOLS,
    managerEndpoint: "/syscollector/{agent_id}/netproto",
    message: "All specified syscollector information was returned",
    verified: true,
    defaultSort: "iface",
    fields: [
      AGENT,
      { m: "iface", i: "interface.name", search: true },
      { m: "type", i: "network.type", t: lower, rev: revCaseVariants, search: true },
      { m: "gateway", i: "network.gateway" },
      { m: "dhcp", i: "network.dhcp", t: dhcp, rev: revDhcp },
      { m: "metric", i: "network.metric" },
    ],
    omitted: ["scan_id"],
  },
  hotfixes: {
    index: INDEX_PATTERNS.STATES_HOTFIXES,
    managerEndpoint: "/syscollector/{agent_id}/hotfixes",
    message: "All specified syscollector information was returned",
    verified: true, // index + mapping verified; 0 docs on the Linux-only test host
    defaultSort: "hotfix",
    fields: [AGENT, { m: "hotfix", i: "package.hotfix.name", search: true }],
    omitted: ["scan.id", "scan.time"],
  },
  os: {
    index: INDEX_PATTERNS.STATES_SYSTEM,
    managerEndpoint: "/syscollector/{agent_id}/os",
    message: "All specified syscollector information was returned",
    verified: true,
    defaultSort: "hostname",
    fields: [
      AGENT,
      { m: "architecture", i: "host.architecture" },
      { m: "hostname", i: "host.hostname", search: true },
      { m: "os.name", i: "host.os.name", search: true },
      { m: "os.platform", i: "host.os.platform", search: true },
      { m: "os.version", i: "host.os.version", search: true },
      { m: "os.codename", i: "host.os.codename" },
      { m: "os.major", i: "host.os.major" },
      { m: "os.minor", i: "host.os.minor" },
      { m: "os.build", i: "host.os.build" },
      { m: "sysname", i: "host.os.kernel.name" },
      { m: "release", i: "host.os.kernel.release" },
      { m: "version", i: "host.os.kernel.version" },
    ],
    omitted: ["scan.id", "scan.time"],
  },
  hardware: {
    index: INDEX_PATTERNS.STATES_HARDWARE,
    managerEndpoint: "/syscollector/{agent_id}/hardware",
    message: "All specified syscollector information was returned",
    verified: true,
    defaultSort: "board_serial",
    fields: [
      AGENT,
      { m: "board_serial", i: "host.serial_number" },
      { m: "cpu.name", i: "host.cpu.name" },
      { m: "cpu.cores", i: "host.cpu.cores" },
      { m: "cpu.mhz", i: "host.cpu.speed" },
      // indexer memory is bytes / usage is a 0..1 fraction; manager reports KiB / integer percent
      { m: "ram.total", i: "host.memory.total", t: bytesToKB },
      { m: "ram.free", i: "host.memory.free", t: bytesToKB },
      { m: "ram.usage", i: "host.memory.usage", t: fracToPct },
    ],
    omitted: ["scan.id", "scan.time"],
  },
  users: {
    index: INDEX_PATTERNS.STATES_USERS,
    managerEndpoint: "/syscollector/{agent_id}/users",
    message: "All specified syscollector information was returned",
    verified: true,
    defaultSort: "user.name",
    fields: [
      AGENT,
      { m: "user.name", i: "user.name", search: true },
      { m: "user.full_name", i: "user.full_name", search: true },
      { m: "user.home", i: "user.home", search: true },
      { m: "user.id", i: "user.id", t: toNum },
      { m: "user.uid_signed", i: "user.uid_signed" },
      { m: "user.uuid", i: "user.uuid" },
      { m: "user.groups", i: "user.groups", t: join(","), search: true },
      { m: "user.group_id", i: "user.group.id" },
      { m: "user.group_id_signed", i: "user.group.id_signed" },
      { m: "user.created", i: "user.created", t: isoToEpoch },
      { m: "user.roles", i: "user.roles", t: join(",") },
      { m: "user.shell", i: "user.shell", search: true },
      { m: "user.type", i: "user.type" },
      { m: "user.is_hidden", i: "user.is_hidden", t: toInt01, rev: revBool01 },
      { m: "user.is_remote", i: "user.is_remote", t: toInt01, rev: revBool01 },
      { m: "user.last_login", i: "user.last_login", t: isoToEpoch },
      { m: "user.auth_failed_count", i: "user.auth_failures.count" },
      { m: "user.auth_failed_timestamp", i: "user.auth_failures.timestamp", t: isoToEpoch },
      { m: "process_pid", i: "process.pid" },
      { m: "host_ip", i: "host.ip" },
      { m: "login.status", i: "login.status", t: toInt01, rev: revBool01 },
      { m: "login.tty", i: "login.tty" },
      { m: "login.type", i: "login.type" },
    ],
    // user.password.* exists in the index but both the indexer client and the
    // Manager client strip any key containing "password" — parity by omission.
    omitted: [
      "user.password_expiration_date", "user.password_hash_algorithm", "user.password_inactive_days",
      "user.password_last_change", "user.password_max_days_between_changes",
      "user.password_min_days_between_changes", "user.password_status",
      "user.password_warning_days_before_expiration", "checksum", "scan.id", "scan.time",
    ],
  },
  groups: {
    index: INDEX_PATTERNS.STATES_GROUPS,
    managerEndpoint: "/syscollector/{agent_id}/groups",
    message: "All specified syscollector information was returned",
    verified: true,
    defaultSort: "group.name",
    fields: [
      AGENT,
      { m: "group.name", i: "group.name", search: true },
      { m: "group.id", i: "group.id" },
      { m: "group.id_signed", i: "group.id_signed" },
      { m: "group.description", i: "group.description" },
      { m: "group.uuid", i: "group.uuid" },
      { m: "group.is_hidden", i: "group.is_hidden", t: toInt01, rev: revBool01 },
      { m: "group.users", i: "group.users", t: join(","), search: true },
    ],
    omitted: ["checksum", "scan.id", "scan.time"],
  },
  services: {
    index: INDEX_PATTERNS.STATES_SERVICES,
    managerEndpoint: "/syscollector/{agent_id}/services",
    message: "All specified syscollector information was returned",
    verified: true,
    defaultSort: "service.name",
    fields: [
      AGENT,
      { m: "service.id", i: "service.id", search: true },
      { m: "service.name", i: "service.name", search: true },
      { m: "service.description", i: "service.description", search: true },
      { m: "service.type", i: "service.type" },
      { m: "service.state", i: "service.state", search: true },
      { m: "service.sub_state", i: "service.sub_state" },
      { m: "service.enabled", i: "service.enabled" },
      { m: "service.start_type", i: "service.start_type" },
      { m: "service.restart", i: "service.restart" },
      { m: "service.frequency", i: "service.frequency" },
      { m: "service.starts_on_mount", i: "service.starts.on_mount" },
      { m: "service.starts_on_path_modified", i: "service.starts.on_path_modified", t: join(",") },
      { m: "service.starts_on_not_empty_directory", i: "service.starts.on_not_empty_directory", t: join(",") },
      { m: "service.inetd_compatibility", i: "service.inetd_compatibility" },
      { m: "service.exit_code", i: "service.exit_code" },
      { m: "service.win32_exit_code", i: "service.win32_exit_code" },
      { m: "service.following", i: "service.following" },
      { m: "service.object_path", i: "service.object_path" },
      { m: "service.target_ephemeral_id", i: "service.target.ephemeral_id", t: toNum },
      { m: "service.target_type", i: "service.target.type" },
      { m: "service.target_address", i: "service.target.address" },
      { m: "service.address", i: "service.address" },
      { m: "process.pid", i: "process.pid" },
      { m: "process.executable", i: "process.executable", search: true },
      { m: "process.args", i: "process.args", t: join(" ") },
      { m: "process.user_name", i: "process.user.name" },
      { m: "process.group_name", i: "process.group.name" },
      { m: "process.working_directory", i: "process.working_directory" },
      { m: "process.root_directory", i: "process.root_directory" },
      { m: "file.path", i: "file.path" },
      { m: "log_file.path", i: "log.file.path" },
      { m: "error_log_file.path", i: "error.log.file.path" },
    ],
    omitted: ["checksum", "scan.id", "scan.time"],
  },
  browser_extensions: {
    index: INDEX_PATTERNS.STATES_BROWSER_EXTENSIONS,
    managerEndpoint: "/syscollector/{agent_id}/browser_extensions",
    message: "All specified syscollector information was returned",
    verified: true,
    defaultSort: "package.name",
    fields: [
      AGENT,
      { m: "browser.name", i: "browser.name", search: true },
      { m: "browser.profile_name", i: "browser.profile.name" },
      { m: "browser.profile_path", i: "browser.profile.path" },
      { m: "browser.profile_referenced", i: "browser.profile.referenced" },
      { m: "file_hash.sha256", i: "file.hash.sha256" },
      { m: "package.id", i: "package.id", search: true },
      { m: "package.name", i: "package.name", search: true },
      { m: "package.version", i: "package.version" },
      { m: "package.path", i: "package.path" },
      { m: "package.autoupdate", i: "package.autoupdate" },
      { m: "package.visible", i: "package.visible" },
      { m: "package.build_version", i: "package.build_version" },
      { m: "package.description", i: "package.description", search: true },
      { m: "package.enabled", i: "package.enabled" },
      { m: "package.from_webstore", i: "package.from_webstore" },
      { m: "package.installed", i: "package.installed" },
      { m: "package.permissions", i: "package.permissions", t: join(",") },
      { m: "package.persistent", i: "package.persistent" },
      { m: "package.reference", i: "package.reference" },
      { m: "package.type", i: "package.type" },
      { m: "package.vendor", i: "package.vendor", search: true },
    ],
    omitted: ["checksum", "scan.id", "scan.time"],
  },
  // ── FIM — UNVERIFIED (no wazuh-states-fim-* index on 4.14.9; 5.0 WCS names) ─
  syscheck_files: {
    index: INDEX_PATTERNS.STATES_FIM_FILES,
    managerEndpoint: "/syscheck/{agent_id}",
    message: "FIM findings of the agent were returned",
    verified: false,
    defaultSort: "file",
    constants: { type: "file" },
    fields: [
      { m: "file", i: "file.path", search: true },
      { m: "md5", i: "file.hash.md5", search: true },
      { m: "sha1", i: "file.hash.sha1", search: true },
      { m: "sha256", i: "file.hash.sha256", search: true },
      { m: "size", i: "file.size" },
      { m: "inode", i: "file.inode", t: toNum },
      { m: "uid", i: "file.uid" },
      { m: "gid", i: "file.gid" },
      { m: "uname", i: "file.owner", search: true },
      { m: "gname", i: "file.group" },
      { m: "perm", i: ["file.mode", "file.permissions"], t: join(",") },
      { m: "attributes", i: "file.attributes", t: join(",") },
      { m: "mtime", i: "file.mtime" },
      { m: "date", i: ["state.modified_at", "@timestamp"] },
    ],
    omitted: ["changes"],
  },
  syscheck_registries: {
    index: INDEX_PATTERNS.STATES_FIM_REGISTRIES,
    managerEndpoint: "/syscheck/{agent_id}?type=registry",
    message: "FIM findings of the agent were returned",
    verified: false,
    defaultSort: "file",
    constants: { type: "registry" },
    fields: [
      { m: "file", i: ["registry.path", "registry.key"], search: true },
      { m: "arch", i: "registry.architecture" },
      { m: "value.name", i: "registry.value", search: true },
      { m: "value.type", i: "registry.data.type" },
      { m: "md5", i: "registry.data.hash.md5" },
      { m: "sha1", i: "registry.data.hash.sha1" },
      { m: "sha256", i: "registry.data.hash.sha256" },
      { m: "size", i: "registry.size" },
      { m: "uid", i: "registry.uid" },
      { m: "gid", i: "registry.gid" },
      { m: "uname", i: "registry.owner" },
      { m: "gname", i: "registry.group" },
      { m: "mtime", i: "registry.mtime" },
      { m: "date", i: ["state.modified_at", "@timestamp"] },
    ],
    omitted: ["changes", "inode", "perm"],
  },
  // ── SCA — UNVERIFIED (no wazuh-states-sca* index on 4.14.9; 5.0 WCS names) ─
  sca_checks: {
    index: INDEX_PATTERNS.STATES_SCA,
    managerEndpoint: "/sca/{agent_id}/checks/{policy_id}",
    message: "All selected SCA/policy information was returned",
    verified: false,
    defaultSort: "id",
    fields: [
      { m: "policy_id", i: "policy.id" },
      { m: "id", i: "check.id", t: toNum },
      { m: "title", i: ["check.name", "check.title"], search: true },
      { m: "description", i: "check.description", search: true },
      { m: "rationale", i: "check.rationale", search: true },
      { m: "remediation", i: "check.remediation", search: true },
      { m: "references", i: "check.references", t: join(",") },
      { m: "condition", i: "check.condition" },
      { m: "result", i: "check.result", t: lower },
      { m: "reason", i: "check.reason" },
    ],
    omitted: ["command", "directory", "file", "process", "registry", "compliance", "rules"],
  },
  sca_policies: {
    index: INDEX_PATTERNS.STATES_SCA,
    managerEndpoint: "/sca/{agent_id}",
    message: "All selected SCA information was returned",
    verified: false,
    defaultSort: "name",
    // Built from a terms aggregation on policy.id (one doc per check in 5.0);
    // these "fields" describe the aggregated item, used for sort/search/select.
    fields: [
      { m: "policy_id", i: "policy.id" },
      { m: "name", i: "policy.name", search: true },
      { m: "description", i: "policy.description", search: true },
      { m: "references", i: "policy.references", t: join(","), search: true },
      { m: "pass", i: "_agg.pass" },
      { m: "fail", i: "_agg.fail" },
      { m: "invalid", i: "_agg.invalid" },
      { m: "total_checks", i: "_agg.total" },
      { m: "score", i: "_agg.score" },
    ],
    omitted: ["start_scan", "end_scan", "hash_file"],
  },
};

// ── Query types ──────────────────────────────────────────────────────────────
export interface StatesQuery {
  agentId: string;
  limit?: number;
  offset?: number;
  search?: string;
  /** Manager style `+a,-b` / `a` or `a:asc|desc` */
  sort?: string;
  /** Manager `select` — comma list of manager fields */
  select?: string | string[];
  /** Manager `q` — `;` AND, `,` OR of `field(=|!=|<|>|~)value`; no parentheses */
  q?: string;
  distinct?: boolean;
  /** Field-specific filters, keyed by Manager field name. */
  filters?: Record<string, string | number | boolean | undefined>;
  /** sca_checks only */
  policyId?: string;
}

export interface ManagerEnvelope {
  data: {
    affected_items: Array<Record<string, unknown>>;
    total_affected_items: number;
    total_failed_items: 0;
    failed_items: [];
  };
  message: string;
  error: 0;
}

/** Keys of a broker `forwardedQuery` that are not field filters. */
export const UNIVERSAL_KEYS = new Set(["limit", "offset", "search", "sort", "select", "q", "distinct", "wait_for_complete", "pretty"]);

/** Split a broker forwardedQuery into StatesQuery (manager names preserved). */
export function toStatesQuery(
  agentId: string,
  forwarded: Record<string, string | number | boolean | undefined>,
): StatesQuery {
  const filters: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(forwarded)) {
    if (v === undefined || UNIVERSAL_KEYS.has(k)) continue;
    filters[k] = v;
  }
  return {
    agentId,
    limit: forwarded.limit !== undefined ? Number(forwarded.limit) : undefined,
    offset: forwarded.offset !== undefined ? Number(forwarded.offset) : undefined,
    search: forwarded.search !== undefined ? String(forwarded.search) : undefined,
    sort: forwarded.sort !== undefined ? String(forwarded.sort) : undefined,
    select: forwarded.select !== undefined ? String(forwarded.select) : undefined,
    q: forwarded.q !== undefined ? String(forwarded.q) : undefined,
    distinct: forwarded.distinct === true || forwarded.distinct === "true" ? true : undefined,
    filters,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function bad(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const seg of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const segs = path.split(".");
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const next = cur[segs[i]];
    if (next === null || typeof next !== "object") cur[segs[i]] = {};
    cur = cur[segs[i]] as Record<string, unknown>;
  }
  cur[segs[segs.length - 1]] = value;
}

const primary = (f: FieldMap): string => (Array.isArray(f.i) ? f.i[0] : f.i);

function fieldFor(mapping: KindMapping, managerField: string, purpose: string): FieldMap {
  const name = mapping.filterAliases?.[managerField] ?? managerField;
  const f = mapping.fields.find(x => x.m === name);
  if (!f) {
    bad(`${purpose} '${managerField}' is not available from the indexer states source for ${mapping.managerEndpoint}`);
  }
  return f;
}

/** Escape Lucene wildcard metacharacters in user input. */
export function escapeWildcard(s: string): string {
  return s.replace(/[\\*?]/g, ch => `\\${ch}`);
}

function termClause(f: FieldMap, value: string | number | boolean): Record<string, unknown> {
  const v = f.rev ? f.rev(value) : value;
  if (Array.isArray(f.i)) {
    return { bool: { should: f.i.map(field => (Array.isArray(v) ? { terms: { [field]: v } } : { term: { [field]: v } })), minimum_should_match: 1 } };
  }
  return Array.isArray(v) ? { terms: { [f.i]: v } } : { term: { [f.i]: v } };
}

/** `+name,-version` | `name` | `name:asc` → OpenSearch sort; allowlisted by the mapping. */
export function buildSort(mapping: KindMapping, sort?: string): Array<Record<string, unknown>> {
  const spec = sort && sort.trim() !== "" ? sort : mapping.defaultSort;
  return spec.split(",").map(raw => {
    let s = raw.trim();
    let order: "asc" | "desc" = "asc";
    if (s.startsWith("-")) { order = "desc"; s = s.slice(1); }
    else if (s.startsWith("+") || s.startsWith(" ")) s = s.slice(1).trim();
    const m = /^(.+):(asc|desc)$/i.exec(s);
    if (m) { s = m[1]; order = m[2].toLowerCase() as "asc" | "desc"; }
    const f = fieldFor(mapping, s, "Sort field");
    return { [primary(f)]: { order, unmapped_type: "keyword" } };
  });
}

/** Manager free-text `search` → case-insensitive substring wildcard over keyword fields. */
export function buildSearch(mapping: KindMapping, search?: string): Record<string, unknown> | null {
  if (!search || search.trim() === "") return null;
  let term = search.trim();
  let negate = false;
  if (term.startsWith("-")) { negate = true; term = term.slice(1); } // manager: leading '-' = complementary search
  const value = `*${escapeWildcard(term)}*`;
  const should = mapping.fields
    .filter(f => f.search)
    .flatMap(f => (Array.isArray(f.i) ? f.i : [f.i]))
    .map(field => ({ wildcard: { [field]: { value, case_insensitive: true } } }));
  if (should.length === 0) return null;
  const clause = { bool: { should, minimum_should_match: 1 } };
  return negate ? { bool: { must_not: [clause] } } : clause;
}

/** Manager `q` subset: `a=1;b~x,c!=2` (`;` AND binds looser than `,` OR, no parentheses). */
export function buildQ(mapping: KindMapping, q?: string): Record<string, unknown> | null {
  if (!q || q.trim() === "") return null;
  if (/[()]/.test(q)) bad("q with parentheses is not supported by the indexer states source");
  const and = q.split(";").map(part => {
    const or = part.split(",").map(expr => {
      const m = /^\s*([\w.]+)\s*(!=|=|<|>|~)\s*(.*?)\s*$/.exec(expr);
      if (!m) bad(`Unsupported q expression '${expr}' for the indexer states source`);
      const [, field, op, value] = m;
      const f = fieldFor(mapping, field, "q field");
      const target = primary(f);
      switch (op) {
        case "=": return termClause(f, value);
        case "!=": return { bool: { must_not: [termClause(f, value)] } };
        case "<": return { range: { [target]: { lt: value } } };
        case ">": return { range: { [target]: { gt: value } } };
        default: return { wildcard: { [target]: { value: `*${escapeWildcard(value)}*`, case_insensitive: true } } };
      }
    });
    return or.length === 1 ? or[0] : { bool: { should: or, minimum_should_match: 1 } };
  });
  return and.length === 1 ? and[0] : { bool: { filter: and } };
}

function parseSelect(mapping: KindMapping, select?: string | string[]): string[] | null {
  if (select === undefined) return null;
  const list = (Array.isArray(select) ? select : select.split(",")).map(s => s.trim()).filter(Boolean);
  if (list.length === 0) return null;
  for (const s of list) {
    const known = mapping.fields.some(f => f.m === s || f.m.startsWith(s + ".")) || (mapping.constants && s in mapping.constants);
    if (!known) bad(`Select field '${s}' is not available from the indexer states source for ${mapping.managerEndpoint}`);
  }
  return list;
}

/** Translate one indexer `_source` into a Manager API item. */
export function translateDoc(mapping: KindMapping, src: Record<string, unknown>, select?: string[] | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of mapping.fields) {
    if (select && !select.some(s => f.m === s || f.m.startsWith(s + "."))) continue;
    let v: unknown;
    for (const field of Array.isArray(f.i) ? f.i : [f.i]) {
      v = getPath(src, field);
      if (v !== undefined) break;
    }
    if (v === undefined) continue;
    setPath(out, f.m, f.t ? f.t(v) : v);
  }
  for (const [k, v] of Object.entries(mapping.constants ?? {})) {
    if (!select || select.includes(k)) out[k] = v;
  }
  return out;
}

export function envelope(mapping: KindMapping, items: Array<Record<string, unknown>>, total: number): ManagerEnvelope {
  return {
    data: { affected_items: items, total_affected_items: total, total_failed_items: 0, failed_items: [] },
    message: mapping.message,
    error: 0,
  };
}

function totalOf(res: ESSearchResponse): number {
  const t = res.hits?.total;
  return typeof t === "number" ? t : t?.value ?? 0;
}

const MAX_WINDOW = 10_000; // OpenSearch index.max_result_window default

/** Build the search body for a document-per-item kind (exported for tests). */
export function buildStatesBody(kind: StatesKind, q: StatesQuery): { body: ESSearchBody; select: string[] | null } {
  const mapping = STATES_MAPPINGS[kind];
  if (q.distinct) bad("distinct is not supported by the indexer states source");
  const limit = Math.max(1, Math.min(q.limit ?? 500, 500));
  const offset = Math.max(0, q.offset ?? 0);
  if (offset + limit > MAX_WINDOW) bad(`offset+limit exceeds ${MAX_WINDOW} on the indexer states source`);

  const filter: Array<Record<string, unknown>> = [{ term: { "agent.id": q.agentId } }];
  if (kind === "sca_checks" && q.policyId) filter.push({ term: { "policy.id": q.policyId } });

  const filters = { ...(q.filters ?? {}) };
  // syscheck-specific filters
  if (kind === "syscheck_files" || kind === "syscheck_registries") {
    delete filters.type; // selects the index (see statesQuery)
    if (filters.hash !== undefined) {
      const h = filters.hash;
      delete filters.hash;
      filter.push({ bool: { should: ["md5", "sha1", "sha256"].map(m => termClause(fieldFor(mapping, m, "Filter"), h as string)), minimum_should_match: 1 } });
    }
  }
  let select = parseSelect(mapping, q.select);
  if ((kind === "syscheck_files" || kind === "syscheck_registries") && filters.summary !== undefined) {
    if (filters.summary === true || filters.summary === "true") select = ["file", "mtime", "date", "type"];
    delete filters.summary;
  }
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined) continue;
    filter.push(termClause(fieldFor(mapping, k, "Filter"), v));
  }
  const search = buildSearch(mapping, q.search);
  if (search) filter.push(search);
  const qClause = buildQ(mapping, q.q);
  if (qClause) filter.push(qClause);

  const body = {
    query: { bool: { filter } },
    from: offset,
    size: limit,
    sort: buildSort(mapping, q.sort),
    track_total_hits: true,
  } as ESSearchBody;
  return { body, select };
}

// ── Query functions ──────────────────────────────────────────────────────────
export async function statesQuery(
  config: IndexerConfig,
  kind: StatesKind,
  q: StatesQuery,
  userId?: string | number,
): Promise<ManagerEnvelope> {
  if (kind === "sca_policies") return scaPoliciesQuery(config, q, userId);
  const mapping = STATES_MAPPINGS[kind];
  const { body, select } = buildStatesBody(kind, q);
  const res = await indexerSearch(config, mapping.index, body, STATES_RATE_LIMIT_GROUP, userId);
  const items = (res.hits?.hits ?? []).map(h => translateDoc(mapping, h._source ?? {}, select));
  return envelope(mapping, items, totalOf(res));
}

interface ScaPolicyBucket {
  key: string;
  doc_count: number;
  meta: { hits: { hits: Array<{ _source: Record<string, unknown> }> } };
  results: { buckets: Array<{ key: string; doc_count: number }> };
}

/** SCA policy summary: 5.0 stores one doc per check — aggregate per policy.id. */
export function scaPolicyItems(buckets: ScaPolicyBucket[]): Array<Record<string, unknown>> {
  return buckets.map(b => {
    const count = (r: string) =>
      b.results.buckets.filter(x => String(x.key).toLowerCase() === r).reduce((n, x) => n + x.doc_count, 0);
    const pass = count("passed");
    const fail = count("failed");
    const src = b.meta.hits.hits[0]?._source ?? {};
    return {
      ...src,
      policy: { ...((src.policy as Record<string, unknown> | undefined) ?? {}), id: b.key },
      _agg: {
        pass,
        fail,
        invalid: b.doc_count - pass - fail,
        total: b.doc_count,
        score: pass + fail > 0 ? Math.floor((pass * 100) / (pass + fail)) : 0,
      },
    };
  });
}

async function scaPoliciesQuery(config: IndexerConfig, q: StatesQuery, userId?: string | number): Promise<ManagerEnvelope> {
  const mapping = STATES_MAPPINGS.sca_policies;
  if (q.distinct) bad("distinct is not supported by the indexer states source");
  if (q.q) bad("q is not supported for SCA policies on the indexer states source");
  const select = parseSelect(mapping, q.select);
  const filter: Array<Record<string, unknown>> = [{ term: { "agent.id": q.agentId } }];
  for (const [k, v] of Object.entries(q.filters ?? {})) {
    if (v === undefined) continue;
    const f = fieldFor(mapping, k, "Filter");
    if (primary(f).startsWith("_agg.")) bad(`Filter '${k}' is not available from the indexer states source for SCA policies`);
    filter.push(termClause(f, v));
  }
  const search = buildSearch(mapping, q.search);
  if (search) filter.push(search);
  const body = {
    size: 0,
    query: { bool: { filter } },
    aggs: {
      policies: {
        terms: { field: "policy.id", size: 500 },
        aggs: {
          meta: { top_hits: { size: 1, _source: ["policy"] } },
          results: { terms: { field: "check.result", size: 10 } },
        },
      },
    },
  } as ESSearchBody;
  const res = await indexerSearch(config, mapping.index, body, STATES_RATE_LIMIT_GROUP, userId);
  const buckets = ((res.aggregations?.policies as { buckets?: ScaPolicyBucket[] } | undefined)?.buckets) ?? [];
  let items = scaPolicyItems(buckets).map(src => translateDoc(mapping, src, null));
  // sort + paginate in memory (≤ 500 policies)
  const sortSpec = buildSort(mapping, q.sort); // validates the field
  const sortPairs = sortSpec.map(s => {
    const [field, opt] = Object.entries(s)[0] as [string, { order: string }];
    const f = mapping.fields.find(x => primary(x) === field)!;
    return { m: f.m, dir: opt.order === "desc" ? -1 : 1 };
  });
  items.sort((a, b) => {
    for (const { m, dir } of sortPairs) {
      const av = getPath(a, m) as string | number | undefined;
      const bv = getPath(b, m) as string | number | undefined;
      if (av === bv) continue;
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      return (av < bv ? -1 : 1) * dir;
    }
    return 0;
  });
  const total = items.length;
  const offset = Math.max(0, q.offset ?? 0);
  const limit = Math.max(1, Math.min(q.limit ?? 500, 500));
  items = items.slice(offset, offset + limit);
  if (select) items = items.map(it => translateDoc({ ...mapping, fields: mapping.fields.map(f => ({ m: f.m, i: f.m })) }, it, select));
  return envelope(mapping, items, total);
}

// Named per-kind wrappers (typed entry points)
type QueryFn = (config: IndexerConfig, q: StatesQuery, userId?: string | number) => Promise<ManagerEnvelope>;
const bind = (kind: StatesKind): QueryFn => (config, q, userId) => statesQuery(config, kind, q, userId);
export const queryPackages = bind("packages");
export const queryPorts = bind("ports");
export const queryProcesses = bind("processes");
export const queryNetaddr = bind("netaddr");
export const queryNetiface = bind("netiface");
export const queryNetproto = bind("netproto");
export const queryHotfixes = bind("hotfixes");
export const queryOs = bind("os");
export const queryHardware = bind("hardware");
export const queryUsers = bind("users");
export const queryGroups = bind("groups");
export const queryServices = bind("services");
export const queryBrowserExtensions = bind("browser_extensions");
export const queryFimFiles = bind("syscheck_files");
export const queryFimRegistries = bind("syscheck_registries");
export const queryScaPolicies = bind("sca_policies");
export const queryScaChecks = bind("sca_checks");
