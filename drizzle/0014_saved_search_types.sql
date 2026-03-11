-- Migration: Expand saved_searches.searchType enum
-- Adds 'alerts', 'vulnerabilities', 'fleet' to the existing ('siem','hunting') enum.
-- This is a non-destructive ALTER — existing rows with 'siem' or 'hunting' are preserved.
-- Corresponds to shared/searchTypes.ts SAVED_SEARCH_TYPES constant.

ALTER TABLE `saved_searches`
  MODIFY COLUMN `searchType` enum('siem','hunting','alerts','vulnerabilities','fleet') NOT NULL;
