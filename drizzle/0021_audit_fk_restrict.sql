-- ============================================================================
-- Migration 0021: Fix sensitive_access_audit FK behavior
--
-- Changes ON DELETE CASCADE to ON DELETE RESTRICT for the sensitive_access_audit
-- userId foreign key. Audit records must never be silently deleted when a user
-- is removed — this is a compliance requirement.
--
-- Impact: Attempting to DELETE a user who has audit records will now fail.
--         Admin must either reassign/archive audit records first, or use a
--         soft-delete (isDisabled) approach instead of hard delete.
--
-- Rollback: ALTER TABLE `sensitive_access_audit` DROP FOREIGN KEY `fk_saa_userId`;
--           ALTER TABLE `sensitive_access_audit` ADD CONSTRAINT `fk_saa_userId`
--             FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;
-- ============================================================================

ALTER TABLE `sensitive_access_audit` DROP FOREIGN KEY `fk_saa_userId`;
--> statement-breakpoint
ALTER TABLE `sensitive_access_audit` ADD CONSTRAINT `fk_saa_userId` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT;
