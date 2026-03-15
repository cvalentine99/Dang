-- ============================================================================
-- Preflight for Migration 0019: Foreign Keys
--
-- Run BEFORE applying 0019_foreign_keys.sql.
-- Each query checks for orphan rows that would violate a FK constraint.
-- If any query returns rows, fix the data before migrating.
-- ============================================================================

-- ── User FK orphans ─────────────────────────────────────────────────────────

SELECT '=== saved_searches: orphan userId ===' AS check_name;
SELECT ss.id, ss.userId FROM saved_searches ss
LEFT JOIN users u ON ss.userId = u.id WHERE u.id IS NULL;

SELECT '=== config_baselines: orphan userId ===' AS check_name;
SELECT cb.id, cb.userId FROM config_baselines cb
LEFT JOIN users u ON cb.userId = u.id WHERE u.id IS NULL;

SELECT '=== baseline_schedules: orphan userId ===' AS check_name;
SELECT bs.id, bs.userId FROM baseline_schedules bs
LEFT JOIN users u ON bs.userId = u.id WHERE u.id IS NULL;

SELECT '=== drift_snapshots: orphan userId ===' AS check_name;
SELECT ds.id, ds.userId FROM drift_snapshots ds
LEFT JOIN users u ON ds.userId = u.id WHERE u.id IS NULL;

SELECT '=== drift_anomalies: orphan userId ===' AS check_name;
SELECT da.id, da.userId FROM drift_anomalies da
LEFT JOIN users u ON da.userId = u.id WHERE u.id IS NULL;

SELECT '=== drift_notification_history: orphan userId ===' AS check_name;
SELECT dnh.id, dnh.userId FROM drift_notification_history dnh
LEFT JOIN users u ON dnh.userId = u.id WHERE u.id IS NULL;

SELECT '=== anomaly_suppression_rules: orphan userId ===' AS check_name;
SELECT asr.id, asr.userId FROM anomaly_suppression_rules asr
LEFT JOIN users u ON asr.userId = u.id WHERE u.id IS NULL;

SELECT '=== analyst_notes_v2: orphan userId ===' AS check_name;
SELECT anv2.id, anv2.userId FROM analyst_notes_v2 anv2
LEFT JOIN users u ON anv2.userId = u.id WHERE u.id IS NULL;

SELECT '=== investigation_sessions: orphan userId (non-null only) ===' AS check_name;
SELECT s.id, s.userId FROM investigation_sessions s
LEFT JOIN users u ON s.userId = u.id WHERE u.id IS NULL AND s.userId IS NOT NULL;

SELECT '=== investigation_notes: orphan userId ===' AS check_name;
SELECT n.id, n.userId FROM investigation_notes n
LEFT JOIN users u ON n.userId = u.id WHERE u.id IS NULL;

SELECT '=== saved_hunts: orphan userId ===' AS check_name;
SELECT sh.id, sh.userId FROM saved_hunts sh
LEFT JOIN users u ON sh.userId = u.id WHERE u.id IS NULL;

SELECT '=== sensitive_access_audit: orphan userId ===' AS check_name;
SELECT saa.id, saa.userId FROM sensitive_access_audit saa
LEFT JOIN users u ON saa.userId = u.id WHERE u.id IS NULL;

-- ── Baseline / Drift chain orphans ──────────────────────────────────────────

SELECT '=== config_baselines: orphan scheduleId ===' AS check_name;
-- scheduleId column may not exist yet (added by migration 0018).
-- Only check if the column is present; skip gracefully otherwise.
SET @has_col = (SELECT COUNT(1) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'config_baselines' AND COLUMN_NAME = 'scheduleId');
SET @q = IF(@has_col > 0,
  'SELECT cb.id, cb.scheduleId FROM config_baselines cb LEFT JOIN baseline_schedules bs ON cb.scheduleId = bs.id WHERE bs.id IS NULL AND cb.scheduleId IS NOT NULL',
  'SELECT "SKIPPED — scheduleId column does not exist yet" AS note');
PREPARE stmt FROM @q; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT '=== drift_snapshots: orphan scheduleId ===' AS check_name;
SELECT ds.id, ds.scheduleId FROM drift_snapshots ds
LEFT JOIN baseline_schedules bs ON ds.scheduleId = bs.id WHERE bs.id IS NULL;

SELECT '=== drift_snapshots: orphan baselineId ===' AS check_name;
SELECT ds.id, ds.baselineId FROM drift_snapshots ds
LEFT JOIN config_baselines cb ON ds.baselineId = cb.id
WHERE cb.id IS NULL AND ds.baselineId IS NOT NULL;

SELECT '=== drift_snapshots: orphan previousBaselineId ===' AS check_name;
SELECT ds.id, ds.previousBaselineId FROM drift_snapshots ds
LEFT JOIN config_baselines cb ON ds.previousBaselineId = cb.id
WHERE cb.id IS NULL AND ds.previousBaselineId IS NOT NULL;

SELECT '=== drift_anomalies: orphan snapshotId ===' AS check_name;
SELECT da.id, da.snapshotId FROM drift_anomalies da
LEFT JOIN drift_snapshots ds ON da.snapshotId = ds.id WHERE ds.id IS NULL;

SELECT '=== drift_anomalies: orphan scheduleId ===' AS check_name;
SELECT da.id, da.scheduleId FROM drift_anomalies da
LEFT JOIN baseline_schedules bs ON da.scheduleId = bs.id WHERE bs.id IS NULL;

SELECT '=== drift_notification_history: orphan scheduleId ===' AS check_name;
SELECT dnh.id, dnh.scheduleId FROM drift_notification_history dnh
LEFT JOIN baseline_schedules bs ON dnh.scheduleId = bs.id WHERE bs.id IS NULL;

SELECT '=== drift_notification_history: orphan snapshotId ===' AS check_name;
SELECT dnh.id, dnh.snapshotId FROM drift_notification_history dnh
LEFT JOIN drift_snapshots ds ON dnh.snapshotId = ds.id
WHERE ds.id IS NULL AND dnh.snapshotId IS NOT NULL;

SELECT '=== drift_notification_history: orphan anomalyId ===' AS check_name;
SELECT dnh.id, dnh.anomalyId FROM drift_notification_history dnh
LEFT JOIN drift_anomalies da ON dnh.anomalyId = da.id
WHERE da.id IS NULL AND dnh.anomalyId IS NOT NULL;

SELECT '=== anomaly_suppression_rules: orphan scheduleId ===' AS check_name;
SELECT asr.id, asr.scheduleId FROM anomaly_suppression_rules asr
LEFT JOIN baseline_schedules bs ON asr.scheduleId = bs.id
WHERE bs.id IS NULL AND asr.scheduleId IS NOT NULL;

-- ── Knowledge Graph chain orphans ───────────────────────────────────────────

SELECT '=== kg_parameters: orphan endpoint_id ===' AS check_name;
SELECT kgp.id, kgp.endpoint_id FROM kg_parameters kgp
LEFT JOIN kg_endpoints kge ON kgp.endpoint_id = kge.id WHERE kge.id IS NULL;

SELECT '=== kg_responses: orphan endpoint_id ===' AS check_name;
SELECT kgr.id, kgr.endpoint_id FROM kg_responses kgr
LEFT JOIN kg_endpoints kge ON kgr.endpoint_id = kge.id WHERE kge.id IS NULL;

SELECT '=== kg_trust_history: orphan endpoint_id ===' AS check_name;
SELECT kgth.id, kgth.endpoint_id FROM kg_trust_history kgth
LEFT JOIN kg_endpoints kge ON kgth.endpoint_id = kge.id WHERE kge.id IS NULL;

SELECT '=== kg_fields: orphan index_id ===' AS check_name;
SELECT kgf.id, kgf.index_id FROM kg_fields kgf
LEFT JOIN kg_indices kgi ON kgf.index_id = kgi.id WHERE kgi.id IS NULL;

-- ── Investigation chain orphans ─────────────────────────────────────────────

SELECT '=== investigation_notes: orphan sessionId ===' AS check_name;
SELECT n.id, n.sessionId FROM investigation_notes n
LEFT JOIN investigation_sessions s ON n.sessionId = s.id WHERE s.id IS NULL;

-- ── Pipeline / Triage chain orphans ─────────────────────────────────────────

SELECT '=== triage_objects: orphan triggeredByUserId ===' AS check_name;
SELECT t.id, t.triggeredByUserId FROM triage_objects t
LEFT JOIN users u ON t.triggeredByUserId = u.id
WHERE u.id IS NULL AND t.triggeredByUserId IS NOT NULL;

SELECT '=== triage_objects: orphan alertQueueItemId ===' AS check_name;
SELECT t.id, t.alertQueueItemId FROM triage_objects t
LEFT JOIN alert_queue aq ON t.alertQueueItemId = aq.id
WHERE aq.id IS NULL AND t.alertQueueItemId IS NOT NULL;

SELECT '=== triage_objects: orphan analystUserId ===' AS check_name;
SELECT t.id, t.analystUserId FROM triage_objects t
LEFT JOIN users u ON t.analystUserId = u.id
WHERE u.id IS NULL AND t.analystUserId IS NOT NULL;

SELECT '=== triage_objects: orphan linkedCaseId ===' AS check_name;
SELECT t.id, t.linkedCaseId FROM triage_objects t
LEFT JOIN living_case_state lcs ON t.linkedCaseId = lcs.id
WHERE lcs.id IS NULL AND t.linkedCaseId IS NOT NULL;

SELECT '=== response_actions: orphan caseId ===' AS check_name;
SELECT ra.id, ra.caseId FROM response_actions ra
LEFT JOIN living_case_state lcs ON ra.caseId = lcs.id
WHERE lcs.id IS NULL AND ra.caseId IS NOT NULL;

SELECT '=== pipeline_runs: orphan queueItemId ===' AS check_name;
SELECT pr.id, pr.queueItemId FROM pipeline_runs pr
LEFT JOIN alert_queue aq ON pr.queueItemId = aq.id
WHERE aq.id IS NULL AND pr.queueItemId IS NOT NULL;

SELECT '=== pipeline_runs: orphan livingCaseId ===' AS check_name;
SELECT pr.id, pr.livingCaseId FROM pipeline_runs pr
LEFT JOIN living_case_state lcs ON pr.livingCaseId = lcs.id
WHERE lcs.id IS NULL AND pr.livingCaseId IS NOT NULL;

SELECT '=== ticket_artifacts: orphan queueItemId ===' AS check_name;
SELECT ta.id, ta.queueItemId FROM ticket_artifacts ta
LEFT JOIN alert_queue aq ON ta.queueItemId = aq.id
WHERE aq.id IS NULL AND ta.queueItemId IS NOT NULL;

SELECT '=== ticket_artifacts: orphan pipelineRunId ===' AS check_name;
SELECT ta.id, ta.pipelineRunId FROM ticket_artifacts ta
LEFT JOIN pipeline_runs pr ON ta.pipelineRunId = pr.id
WHERE pr.id IS NULL AND ta.pipelineRunId IS NOT NULL;
