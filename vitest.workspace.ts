import { configDefaults, type TestProjectConfiguration } from "vitest/config";
// Load .env.test (never .env) here too, so TEST_DB / DATABASE_URL from it
// select DB mode below exactly as they do in the workers and globalSetup.
import { loadTestEnv } from "./server/testHelpers/loadTestEnv";

loadTestEnv();

/**
 * Vitest project definitions.
 *
 * Vitest >= 4 no longer reads workspace files: this module is now imported by
 * vitest.config.ts, which passes `projects` to `test.projects`. The file keeps
 * its name so DB_KNOWN_FAILING stays where the CI workflow and docs point.
 *
 *   unit           server/**  behavioral tests. DB-gated suites skip unless
 *                  DATABASE_URL is set; when it is, testDb.ts migrates the test
 *                  database once with the real ./drizzle chain first.
 *   source-checks  server/__source_checks__/**  quarantined tests whose only
 *                  assertions are on source text (readFileSync + toContain).
 *                  They guard against regressions of past fixes but exercise
 *                  no runtime behavior; run separately so they are not counted
 *                  as behavioral coverage.
 *   client         client/**  pure client modules (node environment).
 */
/**
 * DB-gated suites that FAIL against a freshly migrated test database.
 *
 * Before H-T1 (2026-10-21) no DB-gated suite ever ran under `pnpm test`, and
 * these drifted from the current agent/pipeline code (stale LLM mock shapes,
 * severity mapping, hypothesis schema, investigation_sessions.userId NOT NULL).
 * `pnpm test:db` (blocking in CI) excludes them; `pnpm test:db:known-failing`
 * runs only them (non-blocking in CI) so the burn-down stays visible. Their
 * non-DB tests still run in `pnpm test`. Remove a file from this list once it
 * passes under `pnpm test:db:known-failing`.
 */
export const DB_KNOWN_FAILING: string[] = [
  // Empty since the Phase 3 burn-down (2026-10-21): all nine agenticPipeline
  // suites pass against a freshly migrated test DB. Tests blocked by a genuine
  // application bug are it.todo in their suite, not listed here.
];

const dbMode = process.env.TEST_DB === "1";
const knownFailingMode = process.env.DB_KNOWN_FAILING; // "only" | undefined

const unitInclude =
  dbMode && knownFailingMode === "only" ? DB_KNOWN_FAILING : ["server/**/*.test.ts", "server/**/*.spec.ts"];
const unitExclude = [
  ...configDefaults.exclude,
  "server/__source_checks__/**",
  ...(dbMode && knownFailingMode !== "only" ? DB_KNOWN_FAILING : []),
];

export const projects: TestProjectConfiguration[] = [
  {
    // `extends: true` inherits the shared base in vitest.config.ts (aliases,
    // node env, setupFiles, timeout, fileParallelism: false).
    extends: true,
    test: {
      name: "unit",
      include: unitInclude,
      exclude: unitExclude,
      globalSetup: ["./server/testHelpers/testDb.ts"],
    },
  },
  {
    extends: true,
    test: {
      name: "source-checks",
      include: ["server/__source_checks__/**/*.test.ts"],
    },
  },
  "./vitest.config.client.ts",
];
