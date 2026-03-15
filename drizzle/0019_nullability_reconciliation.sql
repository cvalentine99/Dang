-- ============================================================================
-- Migration 0019: Nullability Reconciliation
--
-- Fixes column nullability where migration SQL diverges from schema.ts intent.
--
-- investigation_sessions.userId:
--   schema.ts declares: int("userId") — nullable (no .notNull())
--   migration 0009 created: int NOT NULL
--   Live DB was hand-patched to NULL; fresh deploy remains NOT NULL.
--   Required before FK migration: fk_is_userId uses ON DELETE SET NULL,
--   which MySQL rejects on NOT NULL columns.
-- ============================================================================

ALTER TABLE `investigation_sessions` MODIFY COLUMN `userId` int NULL;
