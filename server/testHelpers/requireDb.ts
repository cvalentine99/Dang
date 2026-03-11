/**
 * Audit #33: DB-gated test helper.
 *
 * Use `describeWithDb` instead of `describe` for any test suite that requires
 * a live database connection. The suite will be skipped (not failed) when
 * DATABASE_URL is not set, preventing false failures in CI environments
 * that don't provision a database.
 *
 * Usage:
 *   import { describeWithDb } from "../testHelpers/requireDb";
 *   describeWithDb("My DB tests", () => { ... });
 */
import { describe } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

/**
 * Like `describe`, but skips the entire suite when DATABASE_URL is not set.
 */
export const describeWithDb: typeof describe = hasDb
  ? describe
  : (describe.skip as unknown as typeof describe);
