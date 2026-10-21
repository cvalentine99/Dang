/**
 * Spec-vs-broker parameter audit (H-P3).
 *
 * Opens the bundled Wazuh OpenAPI spec (shared/specPath.ts), resolves every
 * `$ref` parameter for a GET endpoint, and compares the real query-parameter
 * names against the `wazuhName`s declared in a broker config. Used by
 * `specAudit.test.ts` and `npm run audit:broker` so neither relies on
 * hand-typed counts.
 */
import yaml from "js-yaml";
import { readFileSync } from "fs";
import { resolveSpecPath } from "../../shared/specPath";
import type { EndpointParamConfig } from "./paramBroker";

/** Query params the spec declares everywhere but that the broker intentionally never forwards. */
export const SPEC_PARAMS_IGNORED = new Set<string>(["pretty"]);

/**
 * Spec params a config may omit without counting as a mismatch.
 * `wait_for_complete` only changes Wazuh's server-side timeout behaviour; it
 * filters nothing, so leaving it out cannot drop an analyst's filter.
 */
export const SPEC_OPTIONAL_OMISSIONS = new Set<string>(["wait_for_complete"]);

/**
 * Broker configs whose endpoint is intentionally absent from the spec.
 * Each entry must say why; anything else not found in the spec is a mismatch.
 */
export const SPEC_ABSENT_ALLOWED: Record<string, string> = {
  AGENT_BY_ID_CONFIG:
    "synthetic Playground-only config — Wazuh has no GET /agents/{agent_id}; the agentById procedure calls GET /agents?agents_list=<id>",
};

type SpecParam = { name: string; in: string; $ref?: string; schema?: SpecSchema };
type SpecSchema = { type?: string; enum?: unknown[]; items?: SpecSchema };
type Spec = {
  paths: Record<string, { get?: { parameters?: SpecParam[] } }>;
  components?: { parameters?: Record<string, SpecParam> };
};

let cachedSpec: Spec | null = null;

export function loadWazuhSpec(): Spec {
  if (!cachedSpec) {
    cachedSpec = yaml.load(readFileSync(resolveSpecPath(), "utf8")) as Spec;
  }
  return cachedSpec;
}

/** Resolved query-parameter objects the spec defines for `GET <endpoint>`, or null if the path is absent. */
function specQueryParamDefs(endpoint: string, spec: Spec): SpecParam[] | null {
  const op = spec.paths[endpoint]?.get;
  if (!op) return null;
  const deref = (p: SpecParam): SpecParam =>
    p.$ref ? spec.components?.parameters?.[p.$ref.split("/").pop() ?? ""] ?? p : p;
  return (op.parameters ?? [])
    .map(deref)
    .filter(p => p.in === "query" && !SPEC_PARAMS_IGNORED.has(p.name));
}

/** Query-parameter names the spec defines for `GET <endpoint>`, or null if the path is absent. */
export function specQueryParams(endpoint: string, spec: Spec = loadWazuhSpec()): string[] | null {
  return specQueryParamDefs(endpoint, spec)?.map(p => p.name) ?? null;
}

export interface SpecParamDiff {
  endpoint: string;
  /** Spec path not found at all */
  notInSpec: boolean;
  /** In the spec, absent from the broker config */
  missing: string[];
  /** In the broker config, absent from the spec (phantom params) */
  extra: string[];
  /** Missing params that are tolerated (SPEC_OPTIONAL_OMISSIONS) — informational */
  toleratedMissing: string[];
  /** Params whose declared enumValues differ from the spec's enum (enforced values must be exact) */
  enumDrift: string[];
}

export function diffConfigAgainstSpec(config: EndpointParamConfig, spec: Spec = loadWazuhSpec()): SpecParamDiff {
  const specDefs = specQueryParamDefs(config.endpoint, spec);
  if (specDefs === null) {
    return { endpoint: config.endpoint, notInSpec: true, missing: [], extra: [], toleratedMissing: [], enumDrift: [] };
  }
  const specByName = new Map(specDefs.map(p => [p.name, p]));
  const cfgSet = new Set(Object.values(config.params).map(d => d.wazuhName));
  const allMissing = Array.from(specByName.keys()).filter(n => !cfgSet.has(n)).sort();

  const enumDrift: string[] = [];
  for (const [key, def] of Object.entries(config.params)) {
    if (def.type === "boolean") continue; // booleans are strictly coerced; their enum is UI-only
    const sch = specByName.get(def.wazuhName)?.schema;
    const specEnum = (sch?.enum ?? sch?.items?.enum ?? sch?.items?.items?.enum)?.map(String);
    const mine = def.enumValues;
    if (!mine && !specEnum) continue;
    const same = !!mine && !!specEnum &&
      JSON.stringify([...mine].sort()) === JSON.stringify([...specEnum].sort());
    if (!same) enumDrift.push(key);
  }

  return {
    endpoint: config.endpoint,
    notInSpec: false,
    missing: allMissing.filter(n => !SPEC_OPTIONAL_OMISSIONS.has(n)),
    extra: Array.from(cfgSet).filter(n => !specByName.has(n)).sort(),
    toleratedMissing: allMissing.filter(n => SPEC_OPTIONAL_OMISSIONS.has(n)),
    enumDrift,
  };
}

/** True when a diff counts as a mismatch (for the named config). */
export function isSpecMismatch(configName: string, d: SpecParamDiff): boolean {
  if (d.notInSpec) return !(configName in SPEC_ABSENT_ALLOWED);
  return d.missing.length > 0 || d.extra.length > 0 || d.enumDrift.length > 0;
}
