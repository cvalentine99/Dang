# Sprint v2 — Key Requirements

## P0 — Objective 1: Close Remaining Phase 3 Endpoint Gaps

### Security Family
- GET /security/rules
- GET /security/actions
- GET /security/resources
- GET /security/users/me/policies

### Agent Lifecycle
- GET /agents/upgrade_result
- GET /agents/uninstall
- GET /agents/{agent_id}/group/is_sync
- GET /

### Experimental Syscollector Bulk Endpoints
- GET /experimental/syscollector/packages
- GET /experimental/syscollector/processes
- GET /experimental/syscollector/ports
- GET /experimental/syscollector/netaddr
- GET /experimental/syscollector/netiface
- GET /experimental/syscollector/netproto
- GET /experimental/syscollector/network
- GET /experimental/syscollector/hardware
- GET /experimental/syscollector/os
- GET /experimental/syscollector/users

### Partial-Coverage Review
- /lists/files/{filename} vs existing /lists/files
- /groups/{group_id}/files/{file_name} vs existing /groups/{group_id}/files
- Cluster per-node endpoint variants

## P1 — Objective 2: Dashboard and UI Parameter Propagation
- Verify KG params visible in dashboard request builders, endpoint detail panels, parameter forms, validation schemas, API explorer, agentic-assisted UI
- Source-of-truth tracing: KG metadata vs Router/server metadata vs Hardcoded client config
- Minimum endpoints: PUT /active-response, POST /agents, one syscollector, one dashboard endpoint

## P1 — Objective 3: Agent Introspection Parity
- Verify agent parameter introspection reflects updated KG shapes
- Confirm no stale cached parameter list overrides live KG
- Add agent introspection test proving payload construction is correct

## P1 — Objective 4: Auth/RBAC Negative Tests on Security Endpoints
- GET /security/rules, /security/actions, /security/resources, /security/users/me/policies
- Negative test: unauthenticated/under-privileged → 401/403, not 200/500

## P1 — Objective 5: Regression Fixture for Previously Closed Gaps
- JSON fixture of known-good endpoint contracts for Phase 1/2 gaps
- Wire into CI so future hydration regressions fail the build

## P2 — Objective 6: KG Schema Versioning (Hardening)
## P2 — Objective 7: Full Error Contract Parity (Hardening)
## P2 — Objective 8: Syscollector Staleness/TTL UX (Hardening)

## Deliverable: Gap Closure Matrix with columns:
Gap/Objective | Priority | Phase | Status | Owner | Test | Proof | Disposition
