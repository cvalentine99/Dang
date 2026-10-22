/**
 * DB-gated test helpers (Audit #33 / H-T1).
 *
 * Use `describeWithDb` instead of `describe` for any suite that needs a real
 * MySQL. It skips (not fails) when DATABASE_URL is unset, so `pnpm test` runs
 * anywhere; `pnpm test:db` (and CI) set DATABASE_URL to a `*_test` database
 * that the globalSetup in testDb.ts has migrated with the real ./drizzle chain.
 *
 * DATABASE_URL is read at call time, after setupFiles (loadTestEnv.ts) have
 * loaded `.env.test`.
 *
 * Usage:
 *   import { describeWithDb } from "../testHelpers/requireDb";
 *   describeWithDb("My DB tests", () => { ... });
 */
import { describe } from "vitest";

export function hasTestDb(): boolean {
  return !!process.env.DATABASE_URL;
}

/** Like `describe`, but skips the entire suite when DATABASE_URL is not set. */
export const describeWithDb = ((name: string, fn: () => void) =>
  describe.skipIf(!hasTestDb())(name, fn)) as unknown as typeof describe;
