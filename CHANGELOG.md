# Changelog

All notable changes to Dang! SIEM are documented in this file.

---

## Beta 2 — 2026-03-07

### KG ETL Recovery (Major)

The Knowledge Graph ETL pipeline was rebuilt from the ground up to eliminate duplicate implementations and ensure truthful sync metadata.

**Shared ETL modules** (`server/graph/`):
- `kgExtractor.ts` — pure extraction from the Wazuh OpenAPI spec (endpoints, parameters, responses, auth methods, resources, use cases, indices, fields, error patterns)
- `kgLoader.ts` — database loading with FK mapping, layer-based truncate-and-reload, sync status tracking
- `kgTypes.ts` — shared type definitions with documented `endpointIds` type contract (string[] in `kg_use_cases` for route identifiers like `GET:/agents`, number[] in `kg_answer_provenance` for auto-increment FK references)
- `kgMetadata.ts` — spec version, hash, row counts, sync duration computation

**Runtime ETL** (`etlService.ts`):
- `runFullSync()` performs real extraction, truncation, and loading (previously a placeholder that only updated timestamps)
- Returns truthful metadata: specVersion, totalRecords, durationMs, per-layer results
- Correctly extracts the mysql2 pool from Drizzle's `$client` property

**CLI seeder** (`seed-kg.mjs`):
- Rewritten as a 59-line thin wrapper that imports shared modules via `tsx`
- Zero inline extraction, static data, or load logic
- Supports `--drop`, `--dry-run`, `--spec <path>` flags

**Canonical spec source:**
- Single source of truth: `spec-v4.14.3.yaml` at project root
- `spec/wazuh-api-v4.14.3.yaml` is a symlink to the root copy
- Runtime ETL, CLI seeder, and all tests use the same canonical path

**Schema fix:**
- `kg_use_cases.semantic_type` ENUM extended with `ADMIN` value
- `kg_use_cases.endpointIds` type corrected to `string[]` in Drizzle schema

**Layer name fix:**
- `error_failure` renamed to `error_graph` in `graphRouter.ts`, `graphQueryService.ts`

### Broker Coverage

- New `/broker-coverage` page showing parameter broker validation coverage by domain
- `brokerCoverage.ts` — coverage ledger computation
- `brokerCoverage.test.ts`, `apiContractGap.test.ts`, `expSyscollectorBroker.test.ts` — validation tests

### OpenAPI Diff Tool

- `scripts/diff-wazuh-openapi.mjs` — compare Wazuh OpenAPI spec versions, output structured diff
- `spec/openapi-allowlist.json` — governance allowlist for known spec differences
- `spec/openapi-diff-result.json` — latest diff output

### Splunk Triage Resolution

- `resolveTriageData.ts` — enhanced triage data resolution for Splunk ticket creation
- `resolveTriageData.test.ts` — 843 lines of test coverage

### Security: Archive Packaging Guard

- `scripts/export-source.sh` — clean source export via `git archive` (tracked files only)
- `scripts/verify-archive.sh` — 11 machine-enforced checks: prohibited paths (`.manus/`, `__manus__/`, `.env*`, `node_modules/`, `.git/`, `*.log`), credential patterns (cloud DB hosts, raw DB URLs, DB password env vars), query dumps
- `.gitattributes` — excludes `__manus__` debug collector from archives
- `docs/incident-2026-03-07-archive-exposure.md` — documented credential exposure incident and remediation

### CI Proof Chain-of-Custody

- `generate-ci-proof.mjs` now fails if `ci-proof-artifact.md` exists but `vitest.json` is absent
- Structural checks: verifies spec symlink, checks for hardcoded magic numbers
- `test-output/vitest.json` included in source archives for verification

### Docker Deployment Fix

- Dockerfile now copies shared KG ETL source modules (`server/graph/kgExtractor.ts`, `kgLoader.ts`, `kgTypes.ts`, `kgMetadata.ts`) to the production image
- `docker-entrypoint.sh` uses `npx tsx seed-kg.mjs` instead of `node seed-kg.mjs`

### Test Suite

- 85 test files, 716 suites, 2667 tests, 0 failures
- New: `etl.test.ts` (extraction determinism, schema alignment, failure paths, layer names, type contracts)
- New: `etl-integration.test.ts` (real DB: truncate, sync, verify rows, rerun stability, failure path, per-layer sync, metadata contract)
- `vitest.config.ts` updated with `fileParallelism: false` to prevent DB-dependent test races

### Documentation

- README updated with accurate test counts, new scripts, new pages, KG seeder notes
- DOCKER.md deploy instructions unchanged (no breaking changes to `deploy.sh` or `docker-compose.yml`)

---

## Beta 1 — 2026-03-02

Initial public beta. See README.md for full feature map.
