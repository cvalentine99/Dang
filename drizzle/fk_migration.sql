-- ============================================================================
-- Audit #58: Foreign Key Constraint Migration
-- Adds FK constraints across 25+ tables for data integrity.
-- Uses ON DELETE SET NULL for nullable FKs, ON DELETE CASCADE for required children.
-- ============================================================================

-- ── User FK constraints ─────────────────────────────────────────────────────

ALTER TABLE saved_searches
  ADD CONSTRAINT fk_ss_userId FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE config_baselines
  ADD CONSTRAINT fk_cb_userId FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE baseline_schedules
  ADD CONSTRAINT fk_bs_userId FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE drift_snapshots
  ADD CONSTRAINT fk_ds_userId FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE drift_anomalies
  ADD CONSTRAINT fk_da_userId FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE drift_notification_history
  ADD CONSTRAINT fk_dnh_userId FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE anomaly_suppression_rules
  ADD CONSTRAINT fk_asr_userId FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE analyst_notes_v2
  ADD CONSTRAINT fk_anv2_userId FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE investigation_sessions
  ADD CONSTRAINT fk_is_userId FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE investigation_notes
  ADD CONSTRAINT fk_in_userId FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE saved_hunts
  ADD CONSTRAINT fk_sh_userId FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE sensitive_access_audit
  ADD CONSTRAINT fk_saa_userId FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE;

-- ── Baseline / Drift chain ──────────────────────────────────────────────────

ALTER TABLE config_baselines
  ADD CONSTRAINT fk_cb_scheduleId FOREIGN KEY (scheduleId) REFERENCES baseline_schedules(id) ON DELETE SET NULL;

ALTER TABLE drift_snapshots
  ADD CONSTRAINT fk_ds_scheduleId FOREIGN KEY (scheduleId) REFERENCES baseline_schedules(id) ON DELETE CASCADE;

ALTER TABLE drift_snapshots
  ADD CONSTRAINT fk_ds_baselineId FOREIGN KEY (baselineId) REFERENCES config_baselines(id) ON DELETE SET NULL;

ALTER TABLE drift_snapshots
  ADD CONSTRAINT fk_ds_previousBaselineId FOREIGN KEY (previousBaselineId) REFERENCES config_baselines(id) ON DELETE SET NULL;

ALTER TABLE drift_anomalies
  ADD CONSTRAINT fk_da_snapshotId FOREIGN KEY (snapshotId) REFERENCES drift_snapshots(id) ON DELETE CASCADE;

ALTER TABLE drift_anomalies
  ADD CONSTRAINT fk_da_scheduleId FOREIGN KEY (scheduleId) REFERENCES baseline_schedules(id) ON DELETE CASCADE;

ALTER TABLE drift_notification_history
  ADD CONSTRAINT fk_dnh_scheduleId FOREIGN KEY (scheduleId) REFERENCES baseline_schedules(id) ON DELETE CASCADE;

ALTER TABLE drift_notification_history
  ADD CONSTRAINT fk_dnh_snapshotId FOREIGN KEY (snapshotId) REFERENCES drift_snapshots(id) ON DELETE SET NULL;

ALTER TABLE drift_notification_history
  ADD CONSTRAINT fk_dnh_anomalyId FOREIGN KEY (anomalyId) REFERENCES drift_anomalies(id) ON DELETE SET NULL;

ALTER TABLE anomaly_suppression_rules
  ADD CONSTRAINT fk_asr_scheduleId FOREIGN KEY (scheduleId) REFERENCES baseline_schedules(id) ON DELETE SET NULL;

-- ── Knowledge Graph chain ───────────────────────────────────────────────────

ALTER TABLE kg_parameters
  ADD CONSTRAINT fk_kgp_endpointId FOREIGN KEY (endpoint_id) REFERENCES kg_endpoints(id) ON DELETE CASCADE;

ALTER TABLE kg_responses
  ADD CONSTRAINT fk_kgr_endpointId FOREIGN KEY (endpoint_id) REFERENCES kg_endpoints(id) ON DELETE CASCADE;

ALTER TABLE kg_trust_history
  ADD CONSTRAINT fk_kgth_endpointId FOREIGN KEY (endpoint_id) REFERENCES kg_endpoints(id) ON DELETE CASCADE;

ALTER TABLE kg_fields
  ADD CONSTRAINT fk_kgf_indexId FOREIGN KEY (index_id) REFERENCES kg_indices(id) ON DELETE CASCADE;

-- ── Investigation chain ─────────────────────────────────────────────────────

ALTER TABLE investigation_notes
  ADD CONSTRAINT fk_in_sessionId FOREIGN KEY (sessionId) REFERENCES investigation_sessions(id) ON DELETE CASCADE;

-- ── Pipeline / Triage chain ─────────────────────────────────────────────────

ALTER TABLE triage_objects
  ADD CONSTRAINT fk_to_triggeredByUserId FOREIGN KEY (triggeredByUserId) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE triage_objects
  ADD CONSTRAINT fk_to_alertQueueItemId FOREIGN KEY (alertQueueItemId) REFERENCES alert_queue(id) ON DELETE SET NULL;

ALTER TABLE triage_objects
  ADD CONSTRAINT fk_to_analystUserId FOREIGN KEY (analystUserId) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE triage_objects
  ADD CONSTRAINT fk_to_linkedCaseId FOREIGN KEY (linkedCaseId) REFERENCES living_case_state(id) ON DELETE SET NULL;

ALTER TABLE response_actions
  ADD CONSTRAINT fk_ra_caseId FOREIGN KEY (caseId) REFERENCES living_case_state(id) ON DELETE SET NULL;

ALTER TABLE pipeline_runs
  ADD CONSTRAINT fk_pr_queueItemId FOREIGN KEY (queueItemId) REFERENCES alert_queue(id) ON DELETE SET NULL;

ALTER TABLE pipeline_runs
  ADD CONSTRAINT fk_pr_livingCaseId FOREIGN KEY (livingCaseId) REFERENCES living_case_state(id) ON DELETE SET NULL;

ALTER TABLE ticket_artifacts
  ADD CONSTRAINT fk_ta_queueItemId FOREIGN KEY (queueItemId) REFERENCES alert_queue(id) ON DELETE SET NULL;

ALTER TABLE ticket_artifacts
  ADD CONSTRAINT fk_ta_pipelineRunId FOREIGN KEY (pipelineRunId) REFERENCES pipeline_runs(id) ON DELETE SET NULL;
