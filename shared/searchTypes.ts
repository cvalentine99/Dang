/**
 * Canonical list of saved-search types.
 * This is the SINGLE SOURCE OF TRUTH — every layer derives from here:
 *   - Drizzle schema enum (drizzle/schema.ts)
 *   - Router Zod enums (server/savedSearches/savedSearchesRouter.ts)
 *   - UI prop types (client/src/components/shared/SavedSearchPanel.tsx)
 *
 * To add a new search type:
 *   1. Add it to SAVED_SEARCH_TYPES below
 *   2. Create a Drizzle migration to ALTER the DB enum
 *   3. Update the Drizzle snapshot to match
 *   4. Done — router and UI will pick it up automatically
 */
export const SAVED_SEARCH_TYPES = [
  "siem",
  "hunting",
  "alerts",
  "vulnerabilities",
  "fleet",
] as const;

/** Union type derived from the canonical list */
export type SavedSearchType = (typeof SAVED_SEARCH_TYPES)[number];
