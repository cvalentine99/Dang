import { defineConfig } from "vitest/config";
import path from "path";

const root = path.resolve(import.meta.dirname);

/**
 * "client" vitest project (listed in `projects` in vitest.workspace.ts).
 *
 * Environment is `node`: jsdom/happy-dom are not installed, so only pure
 * client modules (no DOM) can be tested here. Add jsdom as a devDependency
 * and switch `environment` to "jsdom" before adding component tests.
 */
export default defineConfig({
  root,
  resolve: {
    alias: {
      "@": path.resolve(root, "client", "src"),
      "@shared": path.resolve(root, "shared"),
      "@assets": path.resolve(root, "attached_assets"),
    },
  },
  test: {
    name: "client",
    environment: "node",
    setupFiles: ["./server/testHelpers/loadTestEnv.ts"],
    include: ["client/**/*.test.{ts,tsx}"],
    testTimeout: 10_000,
  },
});
