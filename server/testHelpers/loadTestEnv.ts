/**
 * Vitest setupFile (H-T1) — runs in every test worker before any test file,
 * and is also imported by the DB globalSetup (testDb.ts).
 *
 * - Loads `.env.test` if present. NEVER loads `.env`: that file points at the
 *   live deployment database. Variables already set in the environment win
 *   (CI sets DATABASE_URL directly).
 * - Pins TZ=UTC so date formatting/bucketing tests are machine-independent.
 *
 * DB-gated suites check `process.env.DATABASE_URL` (see requireDb.ts), so with
 * no `.env.test` and no exported DATABASE_URL they skip, and `pnpm test` stays
 * runnable on a machine with no MySQL.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";

export const REPO_ROOT = path.resolve(__dirname, "..", "..");

export function loadTestEnv(): void {
  process.env.TZ = "UTC";
  const envTestPath = path.join(REPO_ROOT, ".env.test");
  if (existsSync(envTestPath)) {
    loadDotenv({ path: envTestPath, override: false, quiet: true });
  }
}

loadTestEnv();
