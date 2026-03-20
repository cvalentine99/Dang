-- ============================================================================
-- Migration 0022: Add createdBy column to analyst_notes
--
-- Enables per-user ownership enforcement on note update/delete operations.
-- Previously, any authenticated user could modify any note (IDOR).
-- After this migration, update/delete check createdBy == caller OR admin role.
--
-- The column is nullable so existing rows remain valid (NULL = legacy/unowned).
-- New notes created after this migration will always have createdBy set.
--
-- Rollback: ALTER TABLE `analyst_notes` DROP COLUMN `createdBy`;
-- ============================================================================

ALTER TABLE `analyst_notes` ADD COLUMN `createdBy` int NULL;
--> statement-breakpoint
CREATE INDEX `an_createdBy_idx` ON `analyst_notes` (`createdBy`);
