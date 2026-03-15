-- ============================================================================
-- Migration 0019: Foreign Key Constraints
--
-- Ports all constraints from the orphaned drizzle/fk_migration.sql into the
-- numbered migration sequence. Single-statement DDL (drizzle-kit compatible).
--
-- PREFLIGHT: run scripts/preflight-0019.sql to detect orphan rows.
-- Depends on: migration 0018 (config_baselines.scheduleId must exist).
-- ============================================================================

-- ── User FK constraints ─────────────────────────────────────────────────────

ALTER TABLE `saved_searches` ADD CONSTRAINT `fk_ss_userId` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `config_baselines` ADD CONSTRAINT `fk_cb_userId` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `baseline_schedules` ADD CONSTRAINT `fk_bs_userId` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `drift_snapshots` ADD CONSTRAINT `fk_ds_userId` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `drift_anomalies` ADD CONSTRAINT `fk_da_userId` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `drift_notification_history` ADD CONSTRAINT `fk_dnh_userId` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `anomaly_suppression_rules` ADD CONSTRAINT `fk_asr_userId` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `analyst_notes_v2` ADD CONSTRAINT `fk_anv2_userId` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `investigation_sessions` ADD CONSTRAINT `fk_is_userId` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `investigation_notes` ADD CONSTRAINT `fk_in_userId` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `saved_hunts` ADD CONSTRAINT `fk_sh_userId` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `sensitive_access_audit` ADD CONSTRAINT `fk_saa_userId` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE;
--> statement-breakpoint

-- ── Baseline / Drift chain ──────────────────────────────────────────────────

ALTER TABLE `config_baselines` ADD CONSTRAINT `fk_cb_scheduleId` FOREIGN KEY (`scheduleId`) REFERENCES `baseline_schedules`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `drift_snapshots` ADD CONSTRAINT `fk_ds_scheduleId` FOREIGN KEY (`scheduleId`) REFERENCES `baseline_schedules`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `drift_snapshots` ADD CONSTRAINT `fk_ds_baselineId` FOREIGN KEY (`baselineId`) REFERENCES `config_baselines`(`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `drift_snapshots` ADD CONSTRAINT `fk_ds_previousBaselineId` FOREIGN KEY (`previousBaselineId`) REFERENCES `config_baselines`(`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `drift_anomalies` ADD CONSTRAINT `fk_da_snapshotId` FOREIGN KEY (`snapshotId`) REFERENCES `drift_snapshots`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `drift_anomalies` ADD CONSTRAINT `fk_da_scheduleId` FOREIGN KEY (`scheduleId`) REFERENCES `baseline_schedules`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `drift_notification_history` ADD CONSTRAINT `fk_dnh_scheduleId` FOREIGN KEY (`scheduleId`) REFERENCES `baseline_schedules`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `drift_notification_history` ADD CONSTRAINT `fk_dnh_snapshotId` FOREIGN KEY (`snapshotId`) REFERENCES `drift_snapshots`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `drift_notification_history` ADD CONSTRAINT `fk_dnh_anomalyId` FOREIGN KEY (`anomalyId`) REFERENCES `drift_anomalies`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `anomaly_suppression_rules` ADD CONSTRAINT `fk_asr_scheduleId` FOREIGN KEY (`scheduleId`) REFERENCES `baseline_schedules`(`id`) ON DELETE SET NULL;
--> statement-breakpoint

-- ── Knowledge Graph chain ───────────────────────────────────────────────────

ALTER TABLE `kg_parameters` ADD CONSTRAINT `fk_kgp_endpointId` FOREIGN KEY (`endpoint_id`) REFERENCES `kg_endpoints`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `kg_responses` ADD CONSTRAINT `fk_kgr_endpointId` FOREIGN KEY (`endpoint_id`) REFERENCES `kg_endpoints`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `kg_trust_history` ADD CONSTRAINT `fk_kgth_endpointId` FOREIGN KEY (`endpoint_id`) REFERENCES `kg_endpoints`(`id`) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE `kg_fields` ADD CONSTRAINT `fk_kgf_indexId` FOREIGN KEY (`index_id`) REFERENCES `kg_indices`(`id`) ON DELETE CASCADE;
--> statement-breakpoint

-- ── Investigation chain ─────────────────────────────────────────────────────

ALTER TABLE `investigation_notes` ADD CONSTRAINT `fk_in_sessionId` FOREIGN KEY (`sessionId`) REFERENCES `investigation_sessions`(`id`) ON DELETE CASCADE;
--> statement-breakpoint

-- ── Pipeline / Triage chain ─────────────────────────────────────────────────

ALTER TABLE `triage_objects` ADD CONSTRAINT `fk_to_triggeredByUserId` FOREIGN KEY (`triggeredByUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `triage_objects` ADD CONSTRAINT `fk_to_alertQueueItemId` FOREIGN KEY (`alertQueueItemId`) REFERENCES `alert_queue`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `triage_objects` ADD CONSTRAINT `fk_to_analystUserId` FOREIGN KEY (`analystUserId`) REFERENCES `users`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `triage_objects` ADD CONSTRAINT `fk_to_linkedCaseId` FOREIGN KEY (`linkedCaseId`) REFERENCES `living_case_state`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `response_actions` ADD CONSTRAINT `fk_ra_caseId` FOREIGN KEY (`caseId`) REFERENCES `living_case_state`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `pipeline_runs` ADD CONSTRAINT `fk_pr_queueItemId` FOREIGN KEY (`queueItemId`) REFERENCES `alert_queue`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `pipeline_runs` ADD CONSTRAINT `fk_pr_livingCaseId` FOREIGN KEY (`livingCaseId`) REFERENCES `living_case_state`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `ticket_artifacts` ADD CONSTRAINT `fk_ta_queueItemId` FOREIGN KEY (`queueItemId`) REFERENCES `alert_queue`(`id`) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE `ticket_artifacts` ADD CONSTRAINT `fk_ta_pipelineRunId` FOREIGN KEY (`pipelineRunId`) REFERENCES `pipeline_runs`(`id`) ON DELETE SET NULL;
