import { defineConfig } from "vitest/config";
import path from "path";

const root = path.resolve(import.meta.dirname);

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
    environment: "node",
    include: ["client/**/*.test.ts"],
    testTimeout: 10_000,
  },
});
