-- ============================================================================
-- Migration 0011: Create all tables that were applied via webdev_execute_sql
-- during development but never had migration files generated.
-- This migration is idempotent: uses CREATE TABLE IF NOT EXISTS.
-- Note: CREATE INDEX statements use plain syntax (no IF NOT EXISTS) because
-- MySQL 8.0 does not support that syntax for indexes. Drizzle-kit journal
-- ensures each migration runs exactly once, so duplicate index errors cannot occur.
-- ============================================================================

-- ── Baseline Schedules ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `baseline_schedules` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `name` varchar(256) NOT NULL,
  `agentIds` json NOT NULL,
  `frequency` varchar(32) NOT NULL,
  `enabled` boolean NOT NULL DEFAULT true,
  `lastRunAt` timestamp NULL,
  `nextRunAt` timestamp NOT NULL,
  `retentionCount` int NOT NULL DEFAULT 10,
  `lastError` text,
  `successCount` int NOT NULL DEFAULT 0,
  `failureCount` int NOT NULL DEFAULT 0,
  `driftThreshold` int NOT NULL DEFAULT 0,
  `notifyOnDrift` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `baseline_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
-- ── Drift Snapshots ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `drift_snapshots` (
  `id` int AUTO_INCREMENT NOT NULL,
  `scheduleId` int NOT NULL,
  `userId` int NOT NULL,
  `baselineId` int NOT NULL,
  `previousBaselineId` int NOT NULL,
  `driftPercent` float NOT NULL DEFAULT 0,
  `driftCount` int NOT NULL DEFAULT 0,
  `totalItems` int NOT NULL DEFAULT 0,
  `byCategory` json NOT NULL,
  `byAgent` json NOT NULL,
  `agentIds` json NOT NULL,
  `notificationSent` boolean NOT NULL DEFAULT false,
  `topDriftItems` json,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `drift_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ds_scheduleId_idx` ON `drift_snapshots` (`scheduleId`);
--> statement-breakpoint
CREATE INDEX `ds_userId_idx` ON `drift_snapshots` (`userId`);
--> statement-breakpoint
CREATE INDEX `ds_createdAt_idx` ON `drift_snapshots` (`createdAt`);
--> statement-breakpoint
-- ── Drift Anomalies ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `drift_anomalies` (
  `id` int AUTO_INCREMENT NOT NULL,
  `snapshotId` int NOT NULL,
  `scheduleId` int NOT NULL,
  `userId` int NOT NULL,
  `driftPercent` float NOT NULL,
  `rollingAvg` float NOT NULL,
  `rollingStdDev` float NOT NULL,
  `zScore` float NOT NULL,
  `sigmaThreshold` float NOT NULL DEFAULT 2,
  `severity` enum('critical','high','medium') NOT NULL,
  `acknowledged` boolean NOT NULL DEFAULT false,
  `acknowledgeNote` text,
  `acknowledgedAt` timestamp NULL,
  `notificationSent` boolean NOT NULL DEFAULT false,
  `scheduleName` varchar(256) NOT NULL DEFAULT '',
  `agentIds` json NOT NULL,
  `byCategory` json,
  `topDriftItems` json,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `drift_anomalies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `anomalies_userId_idx` ON `drift_anomalies` (`userId`);
--> statement-breakpoint
CREATE INDEX `anomalies_scheduleId_idx` ON `drift_anomalies` (`scheduleId`);
--> statement-breakpoint
CREATE INDEX `anomalies_severity_idx` ON `drift_anomalies` (`severity`);
--> statement-breakpoint
CREATE INDEX `anomalies_acknowledged_idx` ON `drift_anomalies` (`acknowledged`);
--> statement-breakpoint
CREATE INDEX `anomalies_createdAt_idx` ON `drift_anomalies` (`createdAt`);
--> statement-breakpoint
-- ── Drift Notification History ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `drift_notification_history` (
  `id` int AUTO_INCREMENT NOT NULL,
  `notificationType` enum('drift_threshold','anomaly') NOT NULL,
  `scheduleId` int NOT NULL,
  `snapshotId` int,
  `anomalyId` int,
  `userId` int NOT NULL,
  `severity` enum('critical','high','medium','info') NOT NULL,
  `title` varchar(512) NOT NULL,
  `content` text NOT NULL,
  `deliveryStatus` enum('sent','failed','retrying','suppressed') NOT NULL DEFAULT 'sent',
  `errorMessage` text,
  `retryCount` int NOT NULL DEFAULT 0,
  `maxRetries` int NOT NULL DEFAULT 3,
  `nextRetryAt` timestamp NULL,
  `lastRetryAt` timestamp NULL,
  `scheduleName` varchar(256) NOT NULL DEFAULT '',
  `driftPercent` float,
  `agentIds` json,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `drift_notification_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `notif_history_userId_idx` ON `drift_notification_history` (`userId`);
--> statement-breakpoint
CREATE INDEX `notif_history_scheduleId_idx` ON `drift_notification_history` (`scheduleId`);
--> statement-breakpoint
CREATE INDEX `notif_history_status_idx` ON `drift_notification_history` (`deliveryStatus`);
--> statement-breakpoint
CREATE INDEX `notif_history_type_idx` ON `drift_notification_history` (`notificationType`);
--> statement-breakpoint
CREATE INDEX `notif_history_createdAt_idx` ON `drift_notification_history` (`createdAt`);
--> statement-breakpoint
CREATE INDEX `notif_history_nextRetry_idx` ON `drift_notification_history` (`nextRetryAt`);
--> statement-breakpoint
-- ── Anomaly Suppression Rules ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `anomaly_suppression_rules` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `scheduleId` int,
  `severityFilter` enum('critical','high','medium','all') NOT NULL DEFAULT 'medium',
  `durationHours` int NOT NULL,
  `reason` text NOT NULL,
  `active` boolean NOT NULL DEFAULT true,
  `expiresAt` timestamp NOT NULL,
  `suppressedCount` int NOT NULL DEFAULT 0,
  `scheduleName` varchar(256),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `anomaly_suppression_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `suppression_userId_idx` ON `anomaly_suppression_rules` (`userId`);
--> statement-breakpoint
CREATE INDEX `suppression_scheduleId_idx` ON `anomaly_suppression_rules` (`scheduleId`);
--> statement-breakpoint
CREATE INDEX `suppression_active_idx` ON `anomaly_suppression_rules` (`active`);
--> statement-breakpoint
CREATE INDEX `suppression_expiresAt_idx` ON `anomaly_suppression_rules` (`expiresAt`);
--> statement-breakpoint
-- ── Knowledge Graph Tables ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `kg_endpoints` (
  `id` int AUTO_INCREMENT NOT NULL,
  `endpoint_id` varchar(128),
  `path` varchar(512) NOT NULL,
  `method` varchar(10) NOT NULL,
  `summary` text,
  `description` text,
  `tags` json,
  `operation_id` varchar(128),
  `resource` varchar(64) NOT NULL,
  `operation_type` varchar(16) NOT NULL,
  `risk_level` varchar(16) NOT NULL,
  `allowed_for_llm` int NOT NULL DEFAULT 1,
  `auth_method` varchar(64),
  `trust_score` varchar(8) NOT NULL DEFAULT '1.0',
  `deprecated` int NOT NULL DEFAULT 0,
  `broker_validated` int NOT NULL DEFAULT 0,
  `last_verified_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `kg_endpoints_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `kge_method_idx` ON `kg_endpoints` (`method`);
--> statement-breakpoint
CREATE INDEX `kge_resource_idx` ON `kg_endpoints` (`resource`);
--> statement-breakpoint
CREATE INDEX `kge_risk_level_idx` ON `kg_endpoints` (`risk_level`);
--> statement-breakpoint
CREATE INDEX `kge_path_idx` ON `kg_endpoints` (`path`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kg_parameters` (
  `id` int AUTO_INCREMENT NOT NULL,
  `endpoint_id` int NOT NULL,
  `name` varchar(128) NOT NULL,
  `location` varchar(16) NOT NULL,
  `required` int NOT NULL DEFAULT 0,
  `param_type` varchar(32) NOT NULL,
  `description` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `kg_parameters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `kgp_endpoint_id_idx` ON `kg_parameters` (`endpoint_id`);
--> statement-breakpoint
CREATE INDEX `kgp_name_idx` ON `kg_parameters` (`name`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kg_responses` (
  `id` int AUTO_INCREMENT NOT NULL,
  `endpoint_id` int NOT NULL,
  `http_status` int NOT NULL,
  `description` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `kg_responses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `kgr_endpoint_id_idx` ON `kg_responses` (`endpoint_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kg_auth_methods` (
  `id` int AUTO_INCREMENT NOT NULL,
  `auth_id` varchar(64) NOT NULL,
  `auth_type` varchar(32) NOT NULL,
  `description` text,
  `ttl_seconds` int,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `kg_auth_methods_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kg_resources` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(64) NOT NULL,
  `endpoint_count` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `kg_resources_id` PRIMARY KEY(`id`),
  CONSTRAINT `kg_resources_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kg_use_cases` (
  `id` int AUTO_INCREMENT NOT NULL,
  `intent` varchar(128) NOT NULL,
  `semantic_type` varchar(64) NOT NULL,
  `domain` varchar(64) NOT NULL,
  `description` text,
  `endpoint_ids` json,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `kg_use_cases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kg_indices` (
  `id` int AUTO_INCREMENT NOT NULL,
  `pattern` varchar(256) NOT NULL,
  `description` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `kg_indices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kg_fields` (
  `id` int AUTO_INCREMENT NOT NULL,
  `index_id` int NOT NULL,
  `field_name` varchar(256) NOT NULL,
  `field_type` varchar(32) NOT NULL,
  `description` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `kg_fields_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `kgf_index_id_idx` ON `kg_fields` (`index_id`);
--> statement-breakpoint
CREATE INDEX `kgf_field_name_idx` ON `kg_fields` (`field_name`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kg_error_patterns` (
  `id` int AUTO_INCREMENT NOT NULL,
  `http_status` int NOT NULL,
  `description` text,
  `cause` text,
  `mitigation` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `kg_error_patterns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kg_trust_history` (
  `id` int AUTO_INCREMENT NOT NULL,
  `endpoint_id` int NOT NULL,
  `old_score` varchar(8) NOT NULL,
  `new_score` varchar(8) NOT NULL,
  `reason` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `kg_trust_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `kgth_endpoint_id_idx` ON `kg_trust_history` (`endpoint_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kg_answer_provenance` (
  `id` int AUTO_INCREMENT NOT NULL,
  `session_id` varchar(64) NOT NULL,
  `question` text NOT NULL,
  `answer` text,
  `confidence` varchar(8),
  `endpoint_ids` json,
  `parameter_ids` json,
  `doc_chunk_ids` json,
  `warnings` json,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `kg_answer_provenance_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `kgap_session_id_idx` ON `kg_answer_provenance` (`session_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kg_sync_status` (
  `id` int AUTO_INCREMENT NOT NULL,
  `layer` varchar(64) NOT NULL,
  `entity_count` int NOT NULL DEFAULT 0,
  `last_sync_at` timestamp NULL,
  `status` enum('idle','syncing','completed','error') NOT NULL DEFAULT 'idle',
  `error_message` text,
  `duration_ms` int,
  `spec_version` varchar(32),
  `updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `kg_sync_status_id` PRIMARY KEY(`id`),
  CONSTRAINT `kg_sync_status_layer_unique` UNIQUE(`layer`)
);
--> statement-breakpoint
-- ── LLM Usage Tracking ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `llm_usage` (
  `id` int AUTO_INCREMENT NOT NULL,
  `model` varchar(256) NOT NULL,
  `source` varchar(32) NOT NULL,
  `promptTokens` int NOT NULL DEFAULT 0,
  `completionTokens` int NOT NULL DEFAULT 0,
  `totalTokens` int NOT NULL DEFAULT 0,
  `latencyMs` int NOT NULL DEFAULT 0,
  `caller` varchar(128),
  `success` int NOT NULL DEFAULT 1,
  `errorMessage` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `llm_usage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `lu_source_idx` ON `llm_usage` (`source`);
--> statement-breakpoint
CREATE INDEX `lu_model_idx` ON `llm_usage` (`model`);
--> statement-breakpoint
CREATE INDEX `lu_created_idx` ON `llm_usage` (`createdAt`);
--> statement-breakpoint
-- ── Alert Queue ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `alert_queue` (
  `id` int AUTO_INCREMENT NOT NULL,
  `alertId` varchar(128) NOT NULL,
  `ruleId` varchar(32) NOT NULL,
  `ruleDescription` text,
  `ruleLevel` int NOT NULL DEFAULT 0,
  `agentId` varchar(16),
  `agentName` varchar(128),
  `alertTimestamp` varchar(64),
  `rawJson` json,
  `status` enum('queued','processing','completed','failed','dismissed') NOT NULL DEFAULT 'queued',
  `triageResult` json,
  `queuedBy` int,
  `queuedAt` timestamp NOT NULL DEFAULT (now()),
  `processedAt` timestamp NULL,
  `completedAt` timestamp NULL,
  `pipelineTriageId` varchar(64),
  `autoTriageStatus` varchar(20) DEFAULT 'pending',
  CONSTRAINT `alert_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `aq_status_idx` ON `alert_queue` (`status`);
--> statement-breakpoint
CREATE INDEX `aq_alertId_idx` ON `alert_queue` (`alertId`);
--> statement-breakpoint
CREATE INDEX `aq_queuedAt_idx` ON `alert_queue` (`queuedAt`);
--> statement-breakpoint
-- ── Auto-Queue Rules ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `auto_queue_rules` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(256) NOT NULL,
  `enabled` int NOT NULL DEFAULT 1,
  `minSeverity` int,
  `ruleIds` text,
  `agentPattern` varchar(256),
  `mitreTechniqueIds` text,
  `maxPerHour` int NOT NULL DEFAULT 10,
  `currentHourCount` int NOT NULL DEFAULT 0,
  `currentHourStart` timestamp NULL,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `auto_queue_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `aqr_enabled_idx` ON `auto_queue_rules` (`enabled`);
--> statement-breakpoint
-- ── Saved Hunts ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `saved_hunts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `title` varchar(512) NOT NULL,
  `description` text,
  `query` varchar(500) NOT NULL,
  `iocType` varchar(32) NOT NULL,
  `timeFrom` varchar(32) NOT NULL,
  `timeTo` varchar(32) NOT NULL,
  `totalHits` int NOT NULL DEFAULT 0,
  `totalTimeMs` int NOT NULL DEFAULT 0,
  `sourcesWithHits` int NOT NULL DEFAULT 0,
  `agentsSearched` json,
  `results` json NOT NULL,
  `tags` json,
  `severity` enum('critical','high','medium','low','info') NOT NULL DEFAULT 'info',
  `resolved` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `saved_hunts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `sh_userId_idx` ON `saved_hunts` (`userId`);
--> statement-breakpoint
CREATE INDEX `sh_query_idx` ON `saved_hunts` (`query`);
--> statement-breakpoint
CREATE INDEX `sh_iocType_idx` ON `saved_hunts` (`iocType`);
--> statement-breakpoint
CREATE INDEX `sh_severity_idx` ON `saved_hunts` (`severity`);
--> statement-breakpoint
CREATE INDEX `sh_createdAt_idx` ON `saved_hunts` (`createdAt`);
--> statement-breakpoint
-- ── Triage Objects ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `triage_objects` (
  `id` int AUTO_INCREMENT NOT NULL,
  `triageId` varchar(64) NOT NULL,
  `alertId` varchar(128) NOT NULL,
  `ruleId` varchar(32) NOT NULL,
  `ruleDescription` text,
  `ruleLevel` int NOT NULL DEFAULT 0,
  `alertTimestamp` varchar(64),
  `agentId` varchar(16),
  `agentName` varchar(128),
  `alertFamily` varchar(128),
  `severity` enum('critical','high','medium','low','info') NOT NULL DEFAULT 'info',
  `severityConfidence` float NOT NULL DEFAULT 0,
  `route` enum('A_DUPLICATE_NOISY','B_LOW_CONFIDENCE','C_HIGH_CONFIDENCE','D_LIKELY_BENIGN') NOT NULL,
  `isDuplicate` int NOT NULL DEFAULT 0,
  `similarityScore` float NOT NULL DEFAULT 0,
  `similarTriageId` varchar(64),
  `summary` text,
  `triageData` json NOT NULL,
  `triagedBy` enum('triage_agent','analyst_manual') NOT NULL DEFAULT 'triage_agent',
  `triggeredByUserId` int,
  `alertQueueItemId` int,
  `linkedCaseId` int,
  `status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
  `errorMessage` text,
  `latencyMs` int,
  `tokensUsed` int,
  `analystSeverityOverride` enum('critical','high','medium','low','info'),
  `analystRouteOverride` enum('A_DUPLICATE_NOISY','B_LOW_CONFIDENCE','C_HIGH_CONFIDENCE','D_LIKELY_BENIGN'),
  `analystNotes` text,
  `analystConfirmed` int NOT NULL DEFAULT 0,
  `analystUserId` int,
  `feedbackAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `triage_objects_id` PRIMARY KEY(`id`),
  CONSTRAINT `triage_objects_triageId_unique` UNIQUE(`triageId`)
);
--> statement-breakpoint
CREATE INDEX `to_alertId_idx` ON `triage_objects` (`alertId`);
--> statement-breakpoint
CREATE INDEX `to_ruleId_idx` ON `triage_objects` (`ruleId`);
--> statement-breakpoint
CREATE INDEX `to_agentId_idx` ON `triage_objects` (`agentId`);
--> statement-breakpoint
CREATE INDEX `to_severity_idx` ON `triage_objects` (`severity`);
--> statement-breakpoint
CREATE INDEX `to_route_idx` ON `triage_objects` (`route`);
--> statement-breakpoint
CREATE INDEX `to_status_idx` ON `triage_objects` (`status`);
--> statement-breakpoint
CREATE INDEX `to_isDuplicate_idx` ON `triage_objects` (`isDuplicate`);
--> statement-breakpoint
CREATE INDEX `to_createdAt_idx` ON `triage_objects` (`createdAt`);
--> statement-breakpoint
CREATE INDEX `to_alertFamily_idx` ON `triage_objects` (`alertFamily`);
--> statement-breakpoint
CREATE INDEX `to_linkedCaseId_idx` ON `triage_objects` (`linkedCaseId`);
--> statement-breakpoint
-- ── Correlation Bundles ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `correlation_bundles` (
  `id` int AUTO_INCREMENT NOT NULL,
  `correlationId` varchar(64) NOT NULL,
  `sourceTriageId` varchar(64) NOT NULL,
  `relatedAlertCount` int NOT NULL DEFAULT 0,
  `discoveredEntityCount` int NOT NULL DEFAULT 0,
  `blastRadiusHosts` int NOT NULL DEFAULT 0,
  `blastRadiusUsers` int NOT NULL DEFAULT 0,
  `assetCriticality` enum('critical','high','medium','low','unknown') NOT NULL DEFAULT 'unknown',
  `likelyCampaign` int NOT NULL DEFAULT 0,
  `caseAction` enum('merge_existing','create_new','defer_to_analyst') NOT NULL DEFAULT 'defer_to_analyst',
  `mergeTargetId` int,
  `confidence` float NOT NULL DEFAULT 0,
  `bundleData` json NOT NULL,
  `status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
  `errorMessage` text,
  `latencyMs` int,
  `tokensUsed` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `correlation_bundles_id` PRIMARY KEY(`id`),
  CONSTRAINT `correlation_bundles_correlationId_unique` UNIQUE(`correlationId`)
);
--> statement-breakpoint
CREATE INDEX `cb_sourceTriageId_idx` ON `correlation_bundles` (`sourceTriageId`);
--> statement-breakpoint
CREATE INDEX `cb_status_idx` ON `correlation_bundles` (`status`);
--> statement-breakpoint
CREATE INDEX `cb_caseAction_idx` ON `correlation_bundles` (`caseAction`);
--> statement-breakpoint
CREATE INDEX `cb_likelyCampaign_idx` ON `correlation_bundles` (`likelyCampaign`);
--> statement-breakpoint
CREATE INDEX `cb_createdAt_idx` ON `correlation_bundles` (`createdAt`);
--> statement-breakpoint
-- ── Living Case State ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `living_case_state` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sessionId` int NOT NULL,
  `caseData` json NOT NULL,
  `workingTheory` text,
  `theoryConfidence` float NOT NULL DEFAULT 0,
  `completedPivotCount` int NOT NULL DEFAULT 0,
  `evidenceGapCount` int NOT NULL DEFAULT 0,
  `pendingActionCount` int NOT NULL DEFAULT 0,
  `approvalRequiredCount` int NOT NULL DEFAULT 0,
  `sourceTriageId` varchar(64),
  `sourceCorrelationId` varchar(64),
  `linkedTriageIds` json,
  `linkedCorrelationIds` json,
  `lastUpdatedBy` enum('case_agent','hypothesis_agent','response_agent','analyst_manual') NOT NULL DEFAULT 'analyst_manual',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `living_case_state_id` PRIMARY KEY(`id`),
  CONSTRAINT `living_case_state_sessionId_unique` UNIQUE(`sessionId`)
);
--> statement-breakpoint
CREATE INDEX `lcs_sessionId_idx` ON `living_case_state` (`sessionId`);
--> statement-breakpoint
CREATE INDEX `lcs_theoryConfidence_idx` ON `living_case_state` (`theoryConfidence`);
--> statement-breakpoint
CREATE INDEX `lcs_updatedAt_idx` ON `living_case_state` (`updatedAt`);
--> statement-breakpoint
-- ── Response Actions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `response_actions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `actionId` varchar(64) NOT NULL,
  `category` enum('isolate_host','disable_account','block_ioc','escalate_ir','suppress_alert','tune_rule','add_watchlist','collect_evidence','notify_stakeholder','custom') NOT NULL,
  `title` varchar(512) NOT NULL,
  `description` text,
  `urgency` enum('immediate','next','scheduled','optional') NOT NULL DEFAULT 'next',
  `requiresApproval` int NOT NULL DEFAULT 1,
  `state` enum('proposed','approved','rejected','executed','deferred') NOT NULL DEFAULT 'proposed',
  `proposedBy` varchar(128) NOT NULL,
  `proposedAt` timestamp NOT NULL DEFAULT (now()),
  `approvedBy` varchar(128),
  `approvedAt` timestamp NULL,
  `executedBy` varchar(128),
  `executedAt` timestamp NULL,
  `decidedBy` varchar(128),
  `decidedAt` timestamp NULL,
  `decisionReason` text,
  `evidenceBasis` json,
  `playbookRef` varchar(256),
  `targetValue` varchar(512),
  `targetType` varchar(64),
  `caseId` int,
  `correlationId` varchar(64),
  `triageId` varchar(64),
  `linkedAlertIds` json,
  `linkedAgentIds` json,
  `semanticWarning` text,
  `executionResult` text,
  `executionSuccess` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `response_actions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ra_actionId_idx` ON `response_actions` (`actionId`);
--> statement-breakpoint
CREATE INDEX `ra_state_idx` ON `response_actions` (`state`);
--> statement-breakpoint
CREATE INDEX `ra_category_idx` ON `response_actions` (`category`);
--> statement-breakpoint
CREATE INDEX `ra_urgency_idx` ON `response_actions` (`urgency`);
--> statement-breakpoint
CREATE INDEX `ra_caseId_idx` ON `response_actions` (`caseId`);
--> statement-breakpoint
CREATE INDEX `ra_triageId_idx` ON `response_actions` (`triageId`);
--> statement-breakpoint
CREATE INDEX `ra_proposedAt_idx` ON `response_actions` (`proposedAt`);
--> statement-breakpoint
CREATE INDEX `ra_requiresApproval_state_idx` ON `response_actions` (`requiresApproval`, `state`);
--> statement-breakpoint
-- ── Response Action Audit ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `response_action_audit` (
  `id` int AUTO_INCREMENT NOT NULL,
  `actionId` int NOT NULL,
  `actionIdStr` varchar(64) NOT NULL,
  `fromState` varchar(20) NOT NULL,
  `toState` varchar(20) NOT NULL,
  `performedBy` varchar(128) NOT NULL,
  `reason` text,
  `metadata` json,
  `performedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `response_action_audit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `raa_actionId_idx` ON `response_action_audit` (`actionId`);
--> statement-breakpoint
CREATE INDEX `raa_actionIdStr_idx` ON `response_action_audit` (`actionIdStr`);
--> statement-breakpoint
CREATE INDEX `raa_performedAt_idx` ON `response_action_audit` (`performedAt`);
--> statement-breakpoint
CREATE INDEX `raa_toState_idx` ON `response_action_audit` (`toState`);
--> statement-breakpoint
-- ── Pipeline Runs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `pipeline_runs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `runId` varchar(64) NOT NULL,
  `queueItemId` int,
  `alertId` varchar(128),
  `currentStage` enum('triage','correlation','hypothesis','response_actions','completed','failed') NOT NULL DEFAULT 'triage',
  `status` enum('running','completed','failed','partial') NOT NULL DEFAULT 'running',
  `triageId` varchar(64),
  `triageStatus` enum('pending','running','completed','failed','skipped') NOT NULL DEFAULT 'pending',
  `triageLatencyMs` int,
  `correlationId` varchar(64),
  `correlationStatus` enum('pending','running','completed','failed','skipped') NOT NULL DEFAULT 'pending',
  `correlationLatencyMs` int,
  `livingCaseId` int,
  `hypothesisStatus` enum('pending','running','completed','failed','skipped') NOT NULL DEFAULT 'pending',
  `hypothesisLatencyMs` int,
  `responseActionsCount` int NOT NULL DEFAULT 0,
  `responseActionsStatus` enum('pending','running','completed','failed','skipped') NOT NULL DEFAULT 'pending',
  `totalLatencyMs` int,
  `error` text,
  `triggeredBy` varchar(128) NOT NULL,
  `startedAt` timestamp NOT NULL DEFAULT (now()),
  `completedAt` timestamp NULL,
  CONSTRAINT `pipeline_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `pr_runId_idx` ON `pipeline_runs` (`runId`);
--> statement-breakpoint
CREATE INDEX `pr_status_idx` ON `pipeline_runs` (`status`);
--> statement-breakpoint
CREATE INDEX `pr_queueItemId_idx` ON `pipeline_runs` (`queueItemId`);
--> statement-breakpoint
CREATE INDEX `pr_alertId_idx` ON `pipeline_runs` (`alertId`);
--> statement-breakpoint
CREATE INDEX `pr_startedAt_idx` ON `pipeline_runs` (`startedAt`);
--> statement-breakpoint
-- ── Drop orphaned graph_ tables from old migrations ─────────────────────────
-- These tables were created by early migrations but are no longer in the schema.
-- They have been replaced by the Knowledge Graph (kg_*) tables above.
DROP TABLE IF EXISTS `graph_vulnerabilities`;
--> statement-breakpoint
DROP TABLE IF EXISTS `graph_software_packages`;
--> statement-breakpoint
DROP TABLE IF EXISTS `graph_security_events`;
--> statement-breakpoint
DROP TABLE IF EXISTS `graph_processes`;
--> statement-breakpoint
DROP TABLE IF EXISTS `graph_network_ports`;
--> statement-breakpoint
DROP TABLE IF EXISTS `graph_identities`;
--> statement-breakpoint
DROP TABLE IF EXISTS `graph_endpoints`;
--> statement-breakpoint
DROP TABLE IF EXISTS `graph_sync_status`;
