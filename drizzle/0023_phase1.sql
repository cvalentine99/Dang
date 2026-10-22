-- 0023_phase1 — Phase 1 schema changes (CODE_REVIEW_2026-10-21.md §8).
-- Generated with drizzle-kit against the live-DB snapshot (meta/0022_snapshot.json),
-- then hand-ordered around the data preconditions below. Rehearsed on a restored copy.
--
-- ── Data precondition 1: one correlation bundle per triage ─────────────────────
-- Two sourceTriageIds had forked bundles (H-L7). Keep the newest row per triage.
DELETE cb FROM `correlation_bundles` cb
JOIN (SELECT `sourceTriageId`, MAX(`id`) AS keepId FROM `correlation_bundles` GROUP BY `sourceTriageId` HAVING COUNT(*) > 1) d
  ON cb.`sourceTriageId` = d.`sourceTriageId` AND cb.`id` <> d.keepId;
--> statement-breakpoint
DROP INDEX `cb_sourceTriageId_idx` ON `correlation_bundles`;
--> statement-breakpoint
ALTER TABLE `correlation_bundles` ADD CONSTRAINT `cb_sourceTriageId_uniq` UNIQUE(`sourceTriageId`);
--> statement-breakpoint

-- ── Data precondition 2: response-action state `executed` → `acknowledged` ─────
-- Dang performs no external action; an analyst records the manual outcome (C11).
-- MySQL cannot drop an enum value that rows still hold, so widen → migrate → narrow.
ALTER TABLE `response_actions` ADD `executionOutcome` varchar(16);
--> statement-breakpoint
ALTER TABLE `response_actions` MODIFY COLUMN `state` enum('proposed','approved','rejected','executed','acknowledged','deferred') NOT NULL DEFAULT 'proposed';
--> statement-breakpoint
UPDATE `response_actions` SET `state` = 'acknowledged', `executionOutcome` = CASE WHEN `executionSuccess` = 1 THEN 'success' ELSE 'failed' END WHERE `state` = 'executed';
--> statement-breakpoint
UPDATE `response_action_audit` SET `toState` = 'acknowledged' WHERE `toState` = 'executed';
--> statement-breakpoint
UPDATE `response_action_audit` SET `fromState` = 'acknowledged' WHERE `fromState` = 'executed';
--> statement-breakpoint
ALTER TABLE `response_actions` MODIFY COLUMN `state` enum('proposed','approved','rejected','acknowledged','deferred') NOT NULL DEFAULT 'proposed';
--> statement-breakpoint

-- ── Remaining generated statements ─────────────────────────────────────────────
ALTER TABLE `kg_trust_history` DROP FOREIGN KEY `fk_kgth_endpointId`;
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `name` varchar(256);
--> statement-breakpoint
ALTER TABLE `pipeline_runs` ADD `resumedByRunId` varchar(64);
--> statement-breakpoint
ALTER TABLE `users` ADD `tokenVersion` int DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `passwordChangedAt` timestamp;
--> statement-breakpoint
ALTER TABLE `kg_endpoints` ADD CONSTRAINT `kg_endpoints_path_method_uniq` UNIQUE(`path`,`method`);
--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_name_uniq` UNIQUE(`name`);
--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_uniq` UNIQUE(`email`);
--> statement-breakpoint
ALTER TABLE `kg_trust_history` ADD CONSTRAINT `fk_kgth_endpointId` FOREIGN KEY (`endpoint_id`) REFERENCES `kg_endpoints`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `aq_status_ruleLevel_idx` ON `alert_queue` (`status`,`ruleLevel`);
--> statement-breakpoint
CREATE INDEX `aq_status_queuedAt_idx` ON `alert_queue` (`status`,`queuedAt`);
--> statement-breakpoint
CREATE INDEX `pr_status_startedAt_idx` ON `pipeline_runs` (`status`,`startedAt`);
--> statement-breakpoint
CREATE INDEX `pr_queueItemId_startedAt_idx` ON `pipeline_runs` (`queueItemId`,`startedAt`);
--> statement-breakpoint
CREATE INDEX `rs_sessionId_idx` ON `rag_sessions` (`sessionId`);
--> statement-breakpoint
CREATE INDEX `rs_createdAt_idx` ON `rag_sessions` (`createdAt`);
--> statement-breakpoint
CREATE INDEX `ss_userId_searchType_idx` ON `saved_searches` (`userId`,`searchType`);
--> statement-breakpoint
CREATE INDEX `ss_updatedAt_idx` ON `saved_searches` (`updatedAt`);
