import { configDefaults, defineWorkspace } from "vitest/config";
// Load .env.test (never .env) here too, so TEST_DB / DATABASE_URL from it
// select DB mode below exactly as they do in the workers and globalSetup.
import { loadTestEnv } from "./server/testHelpers/loadTestEnv";

loadTestEnv();

/**
 * Vitest projects (vitest 2 workspace).
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
export const DB_KNOWN_FAILING = [
  "server/agenticPipeline/auditBugRegression.test.ts",
  "server/agenticPipeline/correlationAgent.test.ts",
  "server/agenticPipeline/hypothesisAgent.test.ts",
  "server/agenticPipeline/liveFireValidation.test.ts",
  "server/agenticPipeline/pipelineIntegration.test.ts",
  "server/agenticPipeline/resumePipelineHelper.test.ts",
  "server/agenticPipeline/stageOutput.test.ts",
  "server/agenticPipeline/stateMachine.test.ts",
  "server/agenticPipeline/triageAgent.test.ts",
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

export default defineWorkspace([
  {
    extends: "./vitest.config.ts",
    test: {
      name: "unit",
      include: unitInclude,
      exclude: unitExclude,
      globalSetup: ["./server/testHelpers/testDb.ts"],
    },
  },
  {
    extends: "./vitest.config.ts",
    test: {
      name: "source-checks",
      include: ["server/__source_checks__/**/*.test.ts"],
    },
  },
  "./vitest.config.client.ts",
]);
