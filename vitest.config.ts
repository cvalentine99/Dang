import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

/**
 * Shared base for the server-side vitest projects. The projects themselves
 * ("unit", "source-checks", "client") are declared in vitest.workspace.ts;
 * `pnpm test` runs unit + client, `pnpm test:source-checks` the quarantined
 * source-inspection suites, `pnpm test:db` the unit project against a test DB.
 *
 * Do not add `include` here: project configs extend this file and vitest's
 * mergeConfig concatenates arrays.
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
  },
});
