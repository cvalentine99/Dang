-- Migration 0017: Upgrade pipeline_runs.runId index to UNIQUE
-- Purpose: Enforce uniqueness of pipeline run IDs at the DB level
-- Note: Drizzle schema declares .unique() on runId, but the original 0011
--       migration may or may not have created a non-unique index depending
--       on the database's migration history. This migration reconciles
--       the schema declaration with the actual database constraint.
-- Safety: No duplicate runId values should exist (each run generates a unique ID)
-- Drop prior non-unique index only if it exists (may be absent on fresh DBs)
SET @idx_exists = (SELECT COUNT(1) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'pipeline_runs' AND index_name = 'pr_runId_idx');
SET @drop_sql = IF(@idx_exists > 0, 'ALTER TABLE `pipeline_runs` DROP INDEX `pr_runId_idx`', 'SELECT 1');
PREPARE stmt FROM @drop_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
ALTER TABLE `pipeline_runs` ADD UNIQUE INDEX `pr_runId_unique_idx` (`runId`);
