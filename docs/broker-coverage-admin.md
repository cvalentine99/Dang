# Broker Coverage Admin Cockpit

Technical reference for `/admin/broker-coverage` and `/admin/broker-playground`.

## What it does

The Broker Coverage page is an admin-only cockpit that shows how each
tRPC→Wazuh endpoint is wired for query parameter handling. It answers:

- Which endpoints use the param broker (validated, coerced, safety-checked)?
- Which endpoints handle params manually (inline Zod, no broker warnings)?
- Which endpoints are simple passthrough (0-1 params, no query construction)?
- Which endpoints should be promoted to broker wiring next?

## Where coverage truth comes from

### Runtime truth (structurally guaranteed)

These values are computed at report-generation time from actual source
objects — they cannot drift unless the source code changes.

| Data | Source | Why it's reliable |
|------|--------|-------------------|
| Wiring level per endpoint | `ENDPOINT_REGISTRY` in `server/wazuh/brokerCoverage.ts` | Static array, each entry manually verified against `wazuhRouter.ts` |
| Broker config details | `BROKER_CONFIG_REGISTRY` → actual `paramBroker.ts` exports | Direct import of the config objects — param names, types, counts are runtime values |
| Coverage percentages | Computed from the above two registries | Pure arithmetic over the static data |
| Endpoint coverage | `totalProcedures/totalProcedures` | Every registry entry has a tRPC procedure; this is by construction |

### Generated enrichment (optional, can be stale)

These enrich the display but are not required for correctness.

| Artifact | Source | Staleness risk |
|----------|--------|----------------|
| `docs/wiring-ledger.json` | `scripts/generate-wiring-ledger.mjs` scans `wazuhRouter.ts` + `client/src/pages/*.tsx` | Stale if pages add/remove `trpc.wazuh.*` calls without regenerating |
| `docs/ui-param-parity.json` | `scripts/audit-ui-param-parity.mjs` scans all `trpc.wazuh.*` callsites | Stale if callsites change params without regenerating |

See `docs/broker-coverage-artifacts.md` for generation commands and
degradation behavior.

### Heuristics (best-effort, not guaranteed)

| Data | How it works | Limitation |
|------|-------------|------------|
| Route inference | Extracts `pageName` from callsite file paths, looks up `PAGE_ROUTE_MAP` | Only works for callsites in `client/src/pages/*.tsx` — hooks, utils, shared components resolve to null |
| Primary route selection | Prefers param-free routes, user-facing over admin, then by frequency | Tie-breaking by frequency assumes more callsites = stronger ownership |
| Remediation score | Manual=3 base, passthrough=1 base, +2 for no callsites, +2 for >=5 params, +1 for 2-4 params | Score is ordinal, not calibrated — use as a prioritization hint, not a severity metric |
| Parity level | none/minimal/moderate/rich based on unique param key count | Does not measure param correctness, only variety |

## How route inference works

`client/src/lib/routeInference.ts` imports `PAGE_ROUTE_MAP` from
`client/src/lib/routeRegistry.ts`. There is **no independent route map** —
inference derives routes exclusively from the registry.

Flow:
1. Callsite path `"client/src/pages/AgentHealth.tsx:87"` → regex extracts `"AgentHealth"`
2. `PAGE_ROUTE_MAP["AgentHealth"]` → `"/agents"`
3. Route checked for `:param` segments → `hasParams: false`
4. For multi-callsite endpoints, `inferPrimaryRoute` ranks by:
   - Param-free routes first
   - User-facing pages before admin pages
   - Higher callsite frequency wins ties

`App.tsx` also consumes `ROUTE_REGISTRY` — it maps `pageName` → imported
components and renders `<Route>` elements from the same array. No route
definitions exist outside the registry.

## What the remediation queue means

The remediation queue is a **prioritized suggestion list**, not a bug list.
It surfaces non-broker endpoints sorted by a composite score:

| Factor | Points | Rationale |
|--------|--------|-----------|
| Manual wiring | +3 | Inline params could benefit from broker validation |
| Passthrough wiring | +1 | Low complexity, less to gain |
| No frontend callsites | +2 | Possibly dead code or missing wiring |
| 5+ params unwired | +2 | More params = more to gain from broker |
| 2-4 params unwired | +1 | Moderate benefit |
| Callsites but no parity | +1 | UI calls the endpoint but passes no observed params |

Suggestions are deterministic (same input → same output):

| Suggestion | When |
|------------|------|
| "Add broker config" | Manual with >=3 params |
| "Expand frontend params" | Manual with callsites but no parity |
| "Verify if used" | No callsites, 0 params |
| "Verify dead code" | No callsites, >0 params |
| "OK as passthrough" | Passthrough with <=1 param |
| "Consider broker promotion" | Manual with <=2 params |

**What it does NOT mean:** The queue does not indicate bugs, security
issues, or broken endpoints. All endpoints work. The queue suggests where
broker promotion would add the most value.

## How Broker Playground handoff works

From the detail drawer in Broker Coverage, clicking "Open in Broker
Playground" navigates to:

```
/admin/broker-playground?config=CONFIG_NAME&procedure=PROC&wazuhPath=PATH&wiringLevel=broker
```

The Playground page:
1. Reads `?config` from the URL and auto-selects that broker config
2. Stores `procedure`, `wazuhPath`, `wiringLevel` as context
3. Displays a context banner with a back-link to `/admin/broker-coverage`
4. Cleans the URL params via `history.replaceState` (no re-render)
5. The context banner is dismissible

**Non-broker endpoints cannot deep-link** — the "Open in Broker Playground"
button is replaced by a disabled message explaining why (passthrough has no
config to test, manual has no broker config).

The Playground is also safe for direct navigation (no `?config` param) — it
shows a config selector and starts with no selection.

## Regression test coverage

Tests live in `server/wazuh/`:

| File | Tests | What it guards |
|------|-------|----------------|
| `brokerCoverage.test.ts` | 161 | Report structure, classification truth vs `wazuhRouter.ts` source, specific endpoints, categories |
| `brokerCoverageRegistry.test.ts` | 34 | Route registry single-source, inference alignment, remediation determinism, action gating, enrichment degradation, deep-link construction |

Run: `pnpm test`

## Drift risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| New procedure added to `wazuhRouter.ts` but not to `ENDPOINT_REGISTRY` | Medium | Classification truth tests will not catch additions (only verify existing). Add the entry manually. |
| Route added to `App.tsx` but not to `ROUTE_REGISTRY` | Low | `App.tsx` renders from the registry — can't add a route without adding to the registry. Structurally prevented. |
| Enrichment artifacts go stale | Medium | Run `node scripts/generate-wiring-ledger.mjs` and `node scripts/audit-ui-param-parity.mjs` after router or page changes. CI can use `scripts/check-broker-artifacts.sh`. |
| Remediation scoring logic changes in BrokerCoverage.tsx but not in tests | Low | Tests mirror the scoring logic — if they drift, assertions will fail on known-good inputs. |
| Procedure reclassified (e.g. manual→broker) but `ENDPOINT_REGISTRY` not updated | Low | Classification truth tests verify a sample of procedures against `wazuhRouter.ts` source. |
