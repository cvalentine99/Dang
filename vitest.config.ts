import { defineConfig } from "vitest/config";
import path from "path";
import { projects } from "./vitest.workspace";

const templateRoot = path.resolve(import.meta.dirname);

/**
 * Root vitest config. The projects ("unit", "source-checks", "client") and the
 * DB_KNOWN_FAILING / TEST_DB / DB_KNOWN_FAILING=only selection logic live in
 * vitest.workspace.ts (vitest >= 4 replaced workspace files with
 * `test.projects`). `pnpm test` runs unit + client, `pnpm test:source-checks`
 * the quarantined source-inspection suites, `pnpm test:db` the unit project
 * against a test DB.
 *
 * The settings below are the shared base that the unit and source-checks
 * projects inherit via `extends: true`; the client project is self-contained
 * in vitest.config.client.ts. Do not add `include` here: projects that extend
 * the root inherit and merge it.
 */
export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // H-T1: load .env.test (never .env) and pin TZ=UTC in every worker.
    setupFiles: ["./server/testHelpers/loadTestEnv.ts"],
    testTimeout: 15_000,
    fileParallelism: false, // DB-dependent tests must not race (ETL integration truncates tables)
    projects,
  },
});
