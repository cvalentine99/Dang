-- Migration 0017: Upgrade pipeline_runs.runId index to UNIQUE
-- Purpose: Enforce uniqueness of pipeline run IDs at the DB level
-- Note: Drizzle schema declares .unique() on runId, but migration 0011
--       created a non-unique index (pr_runId_idx). This migration drops
--       it and adds a unique index instead.
-- Safety: No duplicate runId values should exist (each run generates a unique ID)
DROP INDEX `pr_runId_idx` ON `pipeline_runs`;
--> statement-breakpoint
ALTER TABLE `pipeline_runs` ADD UNIQUE INDEX `pr_runId_unique_idx` (`runId`);
