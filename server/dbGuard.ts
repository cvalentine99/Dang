/**
 * Database availability guard — throws a TRPCError instead of
 * returning fake-empty data when the database is unavailable.
 *
 * Use `requireDb()` in any tRPC procedure that needs the database.
 * This ensures the UI sees an honest error state ("Database unavailable")
 * instead of a misleading empty list.
 */

import { TRPCError } from "@trpc/server";
import { getDb } from "./db";

export async function requireDb() {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable — cannot serve this request. Check database connectivity.",
    });
  }
  return db;
}
