-- ============================================================================
-- Migration 0018: Schema Reconciliation
--
-- Fixes fresh-deploy crashers and missing constraints.
-- All statements are single-statement DDL (drizzle-kit compatible).
--
-- PREFLIGHT: run scripts/preflight-0018.sql to check for duplicate data.
-- ============================================================================

-- Crasher #1: Add 'triaged' to alert_queue.status enum
-- Migration 0011 omits 'triaged'. Pipeline writes it. Crashes on fresh deploy.
-- MODIFY COLUMN is idempotent — safe if value already present.
ALTER TABLE `alert_queue`
  MODIFY COLUMN `status` enum('queued','processing','triaged','completed','failed','dismissed') NOT NULL DEFAULT 'queued';
--> statement-breakpoint

-- Crasher #2: Add 'partial' to pipeline_runs.responseActionsStatus enum
-- Migration 0011 omits 'partial'. Pipeline writes it. Crashes on fresh deploy.
ALTER TABLE `pipeline_runs`
  MODIFY COLUMN `responseActionsStatus` enum('pending','running','completed','failed','skipped','partial') NOT NULL DEFAULT 'pending';
--> statement-breakpoint

-- Crasher #3: Add scheduleId column to config_baselines
-- schema.ts declares it; migration 0004 created the table without it.
ALTER TABLE `config_baselines` ADD COLUMN `scheduleId` int NULL;
--> statement-breakpoint

-- Integrity: UNIQUE(category, settingKey) on connection_settings
-- schema.ts declares uniqueIndex("cs_category_key_uniq"); no migration creates it.
ALTER TABLE `connection_settings` ADD UNIQUE INDEX `cs_category_key_uniq` (`category`, `settingKey`);
--> statement-breakpoint

-- Integrity: UNIQUE(actionId) on response_actions
-- schema.ts declares .unique() on actionId. Migration 0011 may have created a
-- non-unique ra_actionId_idx. This unique index coexists safely; the non-unique
-- index (if present) is redundant but harmless.
ALTER TABLE `response_actions` ADD UNIQUE INDEX `ra_actionId_unique_idx` (`actionId`);
