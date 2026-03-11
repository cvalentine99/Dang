/**
 * Canonical list of saved-search types.
 *
 * This file governs the allowed values for the saved-search enum.
 * Three layers derive their type definitions from this constant:
 *   - Drizzle schema enum (drizzle/schema.ts) — [...SAVED_SEARCH_TYPES]
 *   - Router Zod enum (server/savedSearches/savedSearchesRouter.ts) — z.enum(SAVED_SEARCH_TYPES)
 *   - UI prop type (client/src/components/shared/SavedSearchPanel.tsx) — SavedSearchType
 *
 * Consumer callsites in page components still pass literal strings
 * (e.g. searchType="alerts") — this is expected and type-checked by
 * TypeScript against the SavedSearchType union. The SSOT ensures that
 * adding or removing a value only requires editing this file + a DB
 * migration; it does NOT eliminate literal strings at callsites.
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
