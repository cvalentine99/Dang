# Remediation Cleanup — Wazuh Broker Coverage

**Date:** 2026-03-10
**Spec Version:** Wazuh REST API v4.14.3
**Source:** Broker Coverage GAP Assessment + `/admin/broker-coverage` page
**Status:** Planning

---

## Current State Snapshot

| Metric | Current | Target |
|---|---|---|
| Total Endpoints | 121 | 121 |
| Broker-Wired | 40 (33%) | 57 (47%) |
| Manual-Param | 40 (33%) | 23 (19%) |
| Passthrough | 41 (34%) | 41 (34%) |
| Param Coverage | 66% | 100% of spec-defined params |
| Silently Dropped Spec Params | 31 | 0 |
| Manual Endpoints with 6+ Params | 14 | 0 |
| Spec-Param Parity CI Check | Missing | Enforced |

---

## Critical Finding: End-to-End Gap

The coverage gap is not backend-only. Frontend analysis reveals that **the UI passes zero query parameters** to all Phase 1 endpoints and only basic pagination (limit/offset) to Phase 2 endpoints. Backend broker-wiring alone will not restore functionality — each endpoint also needs frontend UI controls.

**Parameters never sent anywhere in the client codebase:**
`sort`, `select`, `distinct`, `date`, `role_ids`, `policy_ids`, `user_ids`, `section`, `field`, `raw`, `endpoint`, `agents_list`, `tag`, `level`

### Frontend Param Usage Matrix — Phase 1 Endpoints

| Endpoint | Frontend File | Params Currently Passed | Spec Params Not Wired |
|---|---|---|---|
| `securityRoles` | SecurityExplorer.tsx | `undefined` (none) | offset, limit, sort, search, select, q, distinct, role_ids |
| `securityPolicies` | SecurityExplorer.tsx | `undefined` (none) | offset, limit, sort, search, select, q, distinct, policy_ids |
| `securityUsers` | SecurityExplorer.tsx | `undefined` (none) | offset, limit, sort, search, select, q, distinct, user_ids |
| `securityActions` | SecurityExplorer.tsx | `{}` (none) | endpoint |
| `managerStats` | Status.tsx | `undefined` (none) | date |
| `agentsUpgradeResult` | AgentHealth.tsx | `{}` (none) | agents_list |
| `clusterNodeConfiguration` | ClusterHealth.tsx | `{ nodeId }` (path only) | section, field, raw |
| `clusterNodeStats` | ClusterHealth.tsx | `{ nodeId }` (path only) | date |
| `securityUserById` | — | Not used in frontend | — |
| `securityRoleById` | — | Not used in frontend | — |
| `securityPolicyById` | — | Not used in frontend | — |
| `securityRuleById` | — | Not used in frontend | — |

### Frontend Param Usage Matrix — Phase 2 Endpoints

| Endpoint | Frontend File | Params Currently Passed | Params NOT Passed |
|---|---|---|---|
| `expSyscollectorNetiface` | FleetInventory.tsx | limit, offset, q | sort, search, select, distinct + 14 specific |
| `expSyscollectorNetaddr` | FleetInventory.tsx | limit, offset, q | sort, search, select, distinct + 4 specific |
| `expSyscollectorNetproto` | FleetInventory.tsx | limit, offset, q | sort, search, select, distinct |
| `expSyscollectorOs` | FleetInventory.tsx | limit, offset, q | sort, search, select, distinct |
| `expSyscollectorHardware` | FleetInventory.tsx | limit, offset, q | sort, search, select, distinct |
| `expSyscollectorHotfixes` | FleetInventory.tsx | limit, offset, q | sort, search, select, distinct, hotfix |
| `taskStatus` | Status.tsx | `{}` (none) | All 12 params unused |
| `agentBrowserExtensions` | ITHygiene.tsx | agentId, limit, offset | sort, search, q, distinct, select |
| `agentUsers` | ITHygiene.tsx, DriftComparison.tsx | agentId, limit, offset | sort, search, q, distinct, select |
| `agentGroups2` | ITHygiene.tsx | agentId, limit, offset | sort, search, q, distinct, select |
| `clusterNodeLogs` | ClusterHealth.tsx | nodeId, limit, offset, search | sort, tag, level |
| `agentsOutdated` | AgentHealth.tsx, GroupManagement.tsx | limit, offset | sort, search, select, q |
| `agentsNoGroup` | AgentHealth.tsx, GroupManagement.tsx | limit, offset | sort, search, select, q |
| `agentsStatsDistinct` | GroupManagement.tsx | fields | offset, limit, sort, search, q |

---

## Phase 1: Critical — Recover Silently Dropped Spec Params

**Priority:** P0
**Effort:** Medium
**Impact:** 31 spec-defined parameters restored across 8 endpoints
**Goal:** Every Wazuh spec parameter reachable from the UI

### Task 1.1: Broker-Wire Security List Endpoints

The three security list endpoints are the worst offenders — each loses 8 spec-defined query params.

| # | Endpoint | Action | Params to Add | Files to Modify |
|---|---|---|---|---|
| 1.1.1 | `GET /security/roles` | Create `SECURITY_ROLES_CONFIG` in `paramBroker.ts` | offset, limit, sort, search, select, q, distinct, role_ids | `paramBroker.ts`, `wazuhRouter.ts`, `brokerCoverage.ts` |
| 1.1.2 | `GET /security/policies` | Create `SECURITY_POLICIES_CONFIG` in `paramBroker.ts` | offset, limit, sort, search, select, q, distinct, policy_ids | `paramBroker.ts`, `wazuhRouter.ts`, `brokerCoverage.ts` |
| 1.1.3 | `GET /security/users` | Create `SECURITY_USERS_CONFIG` in `paramBroker.ts` | offset, limit, sort, search, select, q, distinct, user_ids | `paramBroker.ts`, `wazuhRouter.ts`, `brokerCoverage.ts` |

**Steps per endpoint:**
1. Define config in `paramBroker.ts` with 7 universal + 1 entity-specific param
2. Update `wazuhRouter.ts` procedure from passthrough to broker-wired (use `brokerParams()`)
3. Add config to `BROKER_CONFIG_REGISTRY` in `brokerCoverage.ts`
4. Update `ENDPOINT_REGISTRY` entry: `wiringLevel: "broker"`, add `brokerConfig`, set `paramCount: 8`
5. Add tests in `brokerCoverage.test.ts`
6. Run `pnpm audit:broker` to verify param count alignment

**Acceptance:** `pnpm test` passes, `pnpm audit:broker` passes, `/admin/broker-coverage` shows Security at 69% coverage (up from 38%).

---

### Task 1.2: Broker-Wire Cluster Node Configuration

| # | Endpoint | Action | Params to Add |
|---|---|---|---|
| 1.2.1 | `GET /cluster/{node_id}/configuration` | Create `CLUSTER_NODE_CONFIG` or extend manual to broker | section, field, raw |

**Steps:**
1. Define `CLUSTER_NODE_CONFIGURATION_CONFIG` in `paramBroker.ts` with params: `distinct`, `section`, `field`, `raw` (mirrors `MANAGER_CONFIG` pattern)
2. Update `wazuhRouter.ts` — change from passthrough to broker-wired
3. Update registries in `brokerCoverage.ts`
4. Add tests

**Acceptance:** Cluster coverage rises from 30% to 35%.

---

### Task 1.3: Add Missing Params to Existing Passthrough Endpoints

These endpoints need specific params added via manual wiring (too few params to justify a full broker config).

| # | Endpoint | Current | Param to Add | Type | Wiring Target |
|---|---|---|---|---|---|
| 1.3.1 | `GET /manager/stats` | passthrough (0) | `date` | string | manual |
| 1.3.2 | `GET /cluster/{node_id}/stats` | passthrough (1) | `date` | string | manual |
| 1.3.3 | `GET /agents/upgrade_result` | passthrough (0) | `agents_list` | csv | manual |
| 1.3.4 | `GET /security/actions` | passthrough (0) | `endpoint` | string | manual |

**Steps per endpoint:**
1. Add inline Zod input schema in `wazuhRouter.ts`
2. Forward param in the Wazuh request
3. Update `ENDPOINT_REGISTRY` in `brokerCoverage.ts`: change `wiringLevel` to `"manual"`, update `paramCount`
4. Add test coverage

**Acceptance:** Zero silently-dropped spec params remaining.

---

### Task 1.4: Frontend Wiring — Security Explorer

The SecurityExplorer.tsx page calls `securityRoles`, `securityPolicies`, and `securityUsers` with `undefined` — no pagination, no search, no filters. After broker-wiring the backend (Tasks 1.1), the frontend must be updated to pass parameters.

| # | Component | Action | UI Controls to Add |
|---|---|---|---|
| 1.4.1 | SecurityExplorer.tsx — Roles tab | Add paginated table with search | offset, limit, search, sort (column headers), role_ids filter |
| 1.4.2 | SecurityExplorer.tsx — Policies tab | Add paginated table with search | offset, limit, search, sort (column headers), policy_ids filter |
| 1.4.3 | SecurityExplorer.tsx — Users tab | Add paginated table with search | offset, limit, search, sort (column headers), user_ids filter |
| 1.4.4 | SecurityExplorer.tsx — Actions tab | Add endpoint filter dropdown | endpoint |

**Steps per component:**
1. Add `useState` for page, pageSize, search, sort state
2. Pass params to tRPC hook: `trpc.wazuh.securityRoles.useQuery({ offset: page * pageSize, limit: pageSize, search, sort })`
3. Add search input, pagination controls, sortable column headers
4. Handle loading/empty states

### Task 1.5: Frontend Wiring — Manager & Cluster Stats

| # | Component | Action | UI Controls to Add |
|---|---|---|---|
| 1.5.1 | Status.tsx — Manager Stats | Add date picker | date |
| 1.5.2 | ClusterHealth.tsx — Node Stats | Add date picker | date |
| 1.5.3 | ClusterHealth.tsx — Node Configuration | Add section/field filter dropdowns | section, field, raw toggle |
| 1.5.4 | AgentHealth.tsx — Upgrade Results | Add agent selector/filter | agents_list |

---

### Phase 1 Verification Checklist

- [ ] `pnpm test` — all tests pass
- [ ] `pnpm audit:broker` — registry-to-config param counts match
- [ ] `pnpm audit:openapi` — no missing or undocumented endpoints
- [ ] `/admin/broker-coverage` shows:
  - Security category: 69% (up from 38%)
  - Cluster category: 35% (up from 30%)
  - Manager category: 47% (up from 41%)
  - Dropped spec params: 0 (down from 31)
- [ ] `tsc --noEmit` — no TypeScript errors
- [ ] SecurityExplorer.tsx — roles/policies/users tables have pagination, search, sort controls
- [ ] SecurityExplorer.tsx — actions tab has endpoint filter
- [ ] Status.tsx — manager stats has date picker
- [ ] ClusterHealth.tsx — node stats has date picker, node config has section/field filters
- [ ] AgentHealth.tsx — upgrade results has agent filter

---

## Phase 2: High — Migrate High-Param Manual Endpoints to Broker

**Priority:** P1
**Effort:** High
**Impact:** 14 endpoints (144 params) gain coercion auditing, `errors[]` tracking, and CI enforcement
**Goal:** Every endpoint with 6+ params uses the broker framework

### Task 2.1: Experimental Syscollector Migrations (Priority — Highest Param Counts)

| # | Procedure | Path | Params | New Config Name |
|---|---|---|---|---|
| 2.1.1 | `expSyscollectorNetiface` | `/experimental/syscollector/netiface` | 21 | `EXP_SYSCOLLECTOR_NETIFACE_CONFIG` |
| 2.1.2 | `expSyscollectorNetaddr` | `/experimental/syscollector/netaddr` | 11 | `EXP_SYSCOLLECTOR_NETADDR_CONFIG` |
| 2.1.3 | `expSyscollectorNetproto` | `/experimental/syscollector/netproto` | 7 | `EXP_SYSCOLLECTOR_NETPROTO_CONFIG` |
| 2.1.4 | `expSyscollectorOs` | `/experimental/syscollector/os` | 7 | `EXP_SYSCOLLECTOR_OS_CONFIG` |
| 2.1.5 | `expSyscollectorHardware` | `/experimental/syscollector/hardware` | 7 | `EXP_SYSCOLLECTOR_HARDWARE_CONFIG` |
| 2.1.6 | `expSyscollectorHotfixes` | `/experimental/syscollector/hotfixes` | 8 | `EXP_SYSCOLLECTOR_HOTFIXES_CONFIG` |

**Steps per endpoint:**
1. Define config in `paramBroker.ts` — copy universal params, add endpoint-specific params from existing Zod schema
2. Replace inline Zod `.input()` with `brokerParams()` call in `wazuhRouter.ts`
3. Remove now-redundant inline schema
4. Register in `BROKER_CONFIG_REGISTRY` and update `ENDPOINT_REGISTRY`
5. Add coercion tests (especially for the `agents_list` CSV param)
6. Run `pnpm audit:broker`

**Risk:** The `expSyscollectorNetiface` endpoint has 21 params — the largest manual endpoint. Careful param-by-param migration needed. Cross-reference with the already-broker-wired per-agent `SYSCOLLECTOR_NETIFACE_CONFIG` to ensure param parity.

---

### Task 2.2: Syscollector Per-Agent Migrations

| # | Procedure | Path | Params | New Config Name |
|---|---|---|---|---|
| 2.2.1 | `agentBrowserExtensions` | `/syscollector/{agent_id}/browser_extensions` | 8 | `SYSCOLLECTOR_BROWSER_EXTENSIONS_CONFIG` |
| 2.2.2 | `agentUsers` | `/syscollector/{agent_id}/users` | 8 | `SYSCOLLECTOR_USERS_CONFIG` |
| 2.2.3 | `agentGroups2` | `/syscollector/{agent_id}/groups` | 8 | `SYSCOLLECTOR_GROUPS_CONFIG` |

**Note:** These three share the same param signature (agent_id + 7 universal). Consider a shared base config pattern.

---

### Task 2.3: Tasks Endpoint Migration

| # | Procedure | Path | Params | New Config Name |
|---|---|---|---|---|
| 2.3.1 | `taskStatus` | `/tasks/status` | 12 | `TASKS_STATUS_CONFIG` |

**Params to model:** task_list, agents_list, command, node, module, status, offset, limit, sort, search, select, q

**Risk:** Complex CSV params (`task_list`, `agents_list`). Ensure `coerceCsv` handles these correctly. This was a C-2 fix endpoint — verify all 12 params carry forward.

---

### Task 2.4: Cluster Node Logs Migration

| # | Procedure | Path | Params | New Config Name |
|---|---|---|---|---|
| 2.4.1 | `clusterNodeLogs` | `/cluster/{node_id}/logs` | 7 | `CLUSTER_NODE_LOGS_CONFIG` |

**Params to model:** node_id, offset, limit, sort, search, tag, level

**Note:** Mirrors `MANAGER_LOGS_CONFIG` (9 params) minus `select`, `q`, `distinct`. Consider whether those should be added for consistency.

---

### Task 2.5: Agent List Endpoint Migrations

| # | Procedure | Path | Params | New Config Name |
|---|---|---|---|---|
| 2.5.1 | `agentsOutdated` | `/agents/outdated` | 6 | `AGENTS_OUTDATED_CONFIG` |
| 2.5.2 | `agentsNoGroup` | `/agents/no_group` | 6 | `AGENTS_NO_GROUP_CONFIG` |
| 2.5.3 | `agentsStatsDistinct` | `/agents/stats/distinct` | 6 | `AGENTS_STATS_DISTINCT_CONFIG` |

**Params to model:** offset, limit, sort, search, select/fields, q

**Note:** `agentsStatsDistinct` uses `fields` instead of `select` — ensure the broker config maps this correctly.

---

### Task 2.6: Frontend Wiring — FleetInventory Sort/Filter

FleetInventory.tsx uses a shared `qInput()` helper that only passes `limit`, `offset`, and `q`. All 6 experimental syscollector endpoints need sort and filter controls.

| # | Component | Action | UI Controls to Add |
|---|---|---|---|
| 2.6.1 | FleetInventory.tsx — All tabs | Add sort control to `qInput()` helper | sort (column header click → +field/-field) |
| 2.6.2 | FleetInventory.tsx — All tabs | Add distinct toggle | distinct checkbox |
| 2.6.3 | FleetInventory.tsx — Hotfixes tab | Add hotfix ID filter | hotfix text input |

### Task 2.7: Frontend Wiring — ITHygiene Sort/Search

ITHygiene.tsx passes `agentId`, `limit`, `offset` but no sort or search to `agentBrowserExtensions`, `agentUsers`, `agentGroups2`.

| # | Component | Action | UI Controls to Add |
|---|---|---|---|
| 2.7.1 | ITHygiene.tsx — All tabs | Add search input | search or q text input |
| 2.7.2 | ITHygiene.tsx — All tabs | Add sortable column headers | sort |

### Task 2.8: Frontend Wiring — Cluster Logs Filter

ClusterHealth.tsx passes `nodeId`, `limit`, `offset`, `search` to `clusterNodeLogs` but not `tag` or `level` filters.

| # | Component | Action | UI Controls to Add |
|---|---|---|---|
| 2.8.1 | ClusterHealth.tsx — Node Logs | Add log level filter dropdown | level (error, warning, info, debug) |
| 2.8.2 | ClusterHealth.tsx — Node Logs | Add tag/daemon filter | tag text input |

### Task 2.9: Frontend Wiring — Task Status Filters

Status.tsx calls `taskStatus` with `{}` — none of the 12 available params are used.

| # | Component | Action | UI Controls to Add |
|---|---|---|---|
| 2.9.1 | Status.tsx — Tasks section | Add pagination | offset, limit |
| 2.9.2 | Status.tsx — Tasks section | Add status filter dropdown | status (in_progress, done, failed, cancelled) |
| 2.9.3 | Status.tsx — Tasks section | Add module/command filter | module, command dropdowns |
| 2.9.4 | Status.tsx — Tasks section | Add search | search text input |

### Task 2.10: Frontend Wiring — Agent Lists Sort/Search

AgentHealth.tsx and GroupManagement.tsx call `agentsOutdated` and `agentsNoGroup` with only `limit`/`offset`.

| # | Component | Action | UI Controls to Add |
|---|---|---|---|
| 2.10.1 | AgentHealth.tsx — Outdated agents | Add search and sort | search, sort |
| 2.10.2 | AgentHealth.tsx — No-group agents | Add search and sort | search, sort |
| 2.10.3 | GroupManagement.tsx — Outdated list | Add search and sort | search, sort |
| 2.10.4 | GroupManagement.tsx — No-group list | Add search and sort | search, sort |
| 2.10.5 | GroupManagement.tsx — Stats distinct | Add pagination | offset, limit |

---

### Phase 2 Verification Checklist

- [ ] `pnpm test` — all tests pass (expect new coercion tests)
- [ ] `pnpm audit:broker` — all 14 new configs validate
- [ ] Manual endpoint count drops from 40 to 26
- [ ] Broker-wired count rises from 40 to 54
- [ ] `/admin/broker-coverage` shows:
  - Broker coverage: 45% (up from 33%)
  - Param coverage: 79% (up from 66%)
  - Experimental category: 100% broker-wired
  - Syscollector category: 100% broker-wired
- [ ] `tsc --noEmit` — no TypeScript errors
- [ ] FleetInventory.tsx — all tabs have sort controls and `qInput()` passes sort param
- [ ] ITHygiene.tsx — all tabs have search input and sortable columns
- [ ] ClusterHealth.tsx — node logs has level dropdown and tag filter
- [ ] Status.tsx — tasks section has pagination, status filter, module/command filters, search
- [ ] AgentHealth.tsx and GroupManagement.tsx — outdated/no-group lists have search and sort

---

## Phase 3: Prevention — Spec-Param Parity CI Check

**Priority:** P1
**Effort:** Medium
**Impact:** Prevents all future silent param loss
**Goal:** CI fails if any broker config is missing a spec-defined parameter

### Task 3.1: Build the Fourth Audit Check

Create `scripts/verify-spec-param-parity.mjs`:

**Behavior:**
1. Parse the Wazuh OpenAPI v4.14.3 spec YAML
2. For each broker-wired endpoint in the registry:
   - Extract the spec's query parameters for that path + GET method
   - Extract the broker config's param keys
   - Diff: spec params not in broker = **MISSING**
   - Diff: broker params not in spec = **EXTRA** (warn, not fail — some are intentional)
3. Exit non-zero on any MISSING param
4. Output a summary table

**Files:**
- `scripts/verify-spec-param-parity.mjs` (new)
- `package.json` — add `"audit:params": "node scripts/verify-spec-param-parity.mjs"`
- `.github/workflows/ci.yml` — add `spec-param-parity` job, make `build` depend on it

### Task 3.2: Extend to Manual Endpoints

Create a lighter-weight check for manual endpoints:
1. For each manual endpoint, extract the Zod schema's `.shape` keys
2. Compare against spec params
3. Report missing params as warnings (not failures initially)

### Task 3.3: Add Allowlist for Intentional Omissions

Create `spec/param-allowlist.json`:
```json
{
  "_comment": "Spec params intentionally NOT modeled in broker configs",
  "omissions": {
    "/manager/configuration": {
      "params": ["pretty"],
      "reason": "Wazuh pretty-print param — not useful for JSON API consumers"
    }
  }
}
```

---

### Phase 3 Verification Checklist

- [ ] `pnpm audit:params` exits 0 with all broker configs at parity
- [ ] `pnpm audit:params` exits non-zero when a param is intentionally removed (canary test)
- [ ] CI pipeline includes `spec-param-parity` job
- [ ] `build` job depends on `broker-registry`, `openapi-diff`, and `spec-param-parity`
- [ ] Allowlist covers all intentional omissions with documented reasons

---

## Phase 4: Low — Remaining Passthrough Assessment

**Priority:** P2
**Effort:** Low
**Impact:** Documentation-only for most endpoints
**Goal:** Confirm every passthrough endpoint is passthrough by design, not by omission

### Task 4.1: Audit Remaining Passthrough Endpoints

Review each of the ~37 remaining passthrough endpoints (after Phase 1 converts 4 to manual):

| Status | Count | Action |
|---|---|---|
| Genuinely zero-param (summaries, healthchecks, config reads) | ~30 | Document as "passthrough by design" in ledger |
| Has undocumented runtime params | TBD | Convert to manual or broker |
| Deprecated or redundant | TBD | Consider removal from registry |

### Task 4.2: Update Broker Coverage Ledger

Update `docs/broker-coverage-ledger.md`:
- Move newly broker-wired endpoints from Manual/Passthrough sections to Broker section
- Update inventory summary counts
- Add Phase 1-3 to correctness fixes table
- Update audit guarantee matrix to include the fourth check

### Task 4.3: Update Broker Coverage Registry

Update `server/wazuh/brokerCoverage.ts`:
- All `ENDPOINT_REGISTRY` entries reflect new wiring levels
- All new configs added to `BROKER_CONFIG_REGISTRY`
- `generateCoverageReport()` reflects accurate counts

---

## Work Tracking — Per-Endpoint Checklist

### Phase 1 Endpoints (8 endpoints, 31 params)

| Endpoint | Config Created | Router Updated | Registry Updated | Tests Added | Audit Passes |
|---|---|---|---|---|---|
| `/security/roles` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `/security/policies` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `/security/users` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `/cluster/{node_id}/configuration` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `/manager/stats` | N/A (manual) | [ ] | [ ] | [ ] | [ ] |
| `/cluster/{node_id}/stats` | N/A (manual) | [ ] | [ ] | [ ] | [ ] |
| `/agents/upgrade_result` | N/A (manual) | [ ] | [ ] | [ ] | [ ] |
| `/security/actions` | N/A (manual) | [ ] | [ ] | [ ] | [ ] |

### Phase 2 Endpoints (14 endpoints, 144 params)

| Endpoint | Config Created | Router Updated | Registry Updated | Tests Added | Audit Passes |
|---|---|---|---|---|---|
| `/experimental/syscollector/netiface` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `/tasks/status` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `/experimental/syscollector/netaddr` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `/syscollector/{agent_id}/browser_extensions` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `/syscollector/{agent_id}/users` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `/syscollector/{agent_id}/groups` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `/experimental/syscollector/hotfixes` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `/cluster/{node_id}/logs` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `/experimental/syscollector/netproto` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `/experimental/syscollector/os` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `/experimental/syscollector/hardware` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `/agents/outdated` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `/agents/no_group` | [ ] | [ ] | [ ] | [ ] | [ ] |
| `/agents/stats/distinct` | [ ] | [ ] | [ ] | [ ] | [ ] |

### Frontend Wiring Checklist

| Component | Endpoints Affected | Controls to Add | Done |
|---|---|---|---|
| SecurityExplorer.tsx — Roles | securityRoles | Paginated table, search, sort, role_ids filter | [ ] |
| SecurityExplorer.tsx — Policies | securityPolicies | Paginated table, search, sort, policy_ids filter | [ ] |
| SecurityExplorer.tsx — Users | securityUsers | Paginated table, search, sort, user_ids filter | [ ] |
| SecurityExplorer.tsx — Actions | securityActions | endpoint filter dropdown | [ ] |
| Status.tsx — Manager Stats | managerStats | Date picker | [ ] |
| Status.tsx — Tasks | taskStatus | Pagination, status/module/command filters, search | [ ] |
| ClusterHealth.tsx — Node Stats | clusterNodeStats | Date picker | [ ] |
| ClusterHealth.tsx — Node Config | clusterNodeConfiguration | Section/field dropdowns, raw toggle | [ ] |
| ClusterHealth.tsx — Node Logs | clusterNodeLogs | Level dropdown, tag filter | [ ] |
| AgentHealth.tsx — Upgrade Results | agentsUpgradeResult | Agent selector/filter | [ ] |
| AgentHealth.tsx — Outdated | agentsOutdated | Search, sort | [ ] |
| AgentHealth.tsx — No Group | agentsNoGroup | Search, sort | [ ] |
| FleetInventory.tsx — All Tabs | expSyscollector* (6 endpoints) | Sort controls, distinct toggle | [ ] |
| FleetInventory.tsx — Hotfixes | expSyscollectorHotfixes | Hotfix ID filter | [ ] |
| ITHygiene.tsx — All Tabs | agentBrowserExtensions, agentUsers, agentGroups2 | Search input, sortable columns | [ ] |
| GroupManagement.tsx — Lists | agentsOutdated, agentsNoGroup, agentsStatsDistinct | Search, sort, pagination | [ ] |

### Phase 3 Scripts

| Deliverable | Created | CI Integrated | Canary Test |
|---|---|---|---|
| `scripts/verify-spec-param-parity.mjs` | [ ] | [ ] | [ ] |
| `spec/param-allowlist.json` | [ ] | [ ] | N/A |
| Manual endpoint schema check | [ ] | [ ] | [ ] |

---

## Definition of Done

All phases complete when:

1. **Zero silently-dropped spec params** — every Wazuh OpenAPI v4.14.3 query parameter for every wired endpoint is reachable from the tRPC router
2. **Every 6+ param endpoint is broker-wired** — no more high-param inline Zod schemas
3. **Four CI checks enforced** — broker count, openapi diff, spec-param parity, vitest suite
4. **Ledger updated** — `broker-coverage-ledger.md` reflects the new state
5. **Coverage page accurate** — `/admin/broker-coverage` shows the final metrics:
   - Broker-wired: 57 (47%)
   - Manual: 23 (19%)
   - Passthrough: 41 (34%)
   - Param coverage: 100% of spec-defined params
   - Broker coverage: 47%
6. **Full test suite green** — `pnpm test`, `tsc --noEmit`, all audit scripts exit 0
7. **Frontend controls wired** — every param exposed by the backend has a corresponding UI control (pagination, search, sort, filter dropdowns) in the relevant page component
