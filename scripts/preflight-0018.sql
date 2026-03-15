-- ============================================================================
-- Preflight for Migration 0018: Schema Reconciliation
--
-- Run BEFORE applying 0018_schema_reconciliation.sql.
-- If any query returns rows, fix the data before migrating.
-- ============================================================================

-- ── Check 1: Duplicate (category, settingKey) in connection_settings ──────
-- If this returns rows, deduplicate before migration (keep lowest id per pair).
SELECT '=== DUPLICATE connection_settings (category, settingKey) ===' AS check_name;
SELECT category, settingKey, COUNT(*) AS cnt, GROUP_CONCAT(id ORDER BY id) AS ids
FROM connection_settings
GROUP BY category, settingKey
HAVING cnt > 1;

-- Fix (if needed): keep oldest, delete newer duplicates
-- DELETE cs FROM connection_settings cs
-- INNER JOIN (
--   SELECT category, settingKey, MIN(id) AS keep_id
--   FROM connection_settings GROUP BY category, settingKey HAVING COUNT(*) > 1
-- ) dup ON cs.category = dup.category AND cs.settingKey = dup.settingKey AND cs.id != dup.keep_id;

-- ── Check 2: Duplicate actionId in response_actions ───────────────────────
-- If this returns rows, deduplicate before migration.
SELECT '=== DUPLICATE response_actions.actionId ===' AS check_name;
SELECT actionId, COUNT(*) AS cnt, GROUP_CONCAT(id ORDER BY id) AS ids
FROM response_actions
GROUP BY actionId
HAVING cnt > 1;

-- Fix (if needed): keep oldest, delete newer duplicates
-- DELETE ra FROM response_actions ra
-- INNER JOIN (
--   SELECT actionId, MIN(id) AS keep_id
--   FROM response_actions GROUP BY actionId HAVING COUNT(*) > 1
-- ) dup ON ra.actionId = dup.actionId AND ra.id != dup.keep_id;

-- ── Check 3: Current enum values (informational) ─────────────────────────
SELECT '=== alert_queue.status current enum values ===' AS check_name;
SELECT COLUMN_TYPE FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'alert_queue' AND COLUMN_NAME = 'status';

SELECT '=== pipeline_runs.responseActionsStatus current enum values ===' AS check_name;
SELECT COLUMN_TYPE FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pipeline_runs' AND COLUMN_NAME = 'responseActionsStatus';

SELECT '=== config_baselines.scheduleId existence ===' AS check_name;
SELECT COUNT(*) AS scheduleId_exists FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'config_baselines' AND COLUMN_NAME = 'scheduleId';
