-- Migration 0016: Multi-valued index on living_case_state.linkedCorrelationIds
-- Purpose: Accelerate JSON_CONTAINS lookups in getLivingCaseByCorrelationId
-- Requires: MySQL 8.0.17+ / TiDB 6.6+ multi-valued index support
-- Before: Full table scan on every correlation → living case lookup
-- After: Index scan using MEMBER OF / JSON_CONTAINS
CREATE INDEX `lcs_linked_corr_ids_mvi` ON `living_case_state` ((CAST(`linkedCorrelationIds` AS CHAR(64) ARRAY)));
