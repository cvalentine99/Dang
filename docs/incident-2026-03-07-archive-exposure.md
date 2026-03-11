# Incident Report: Credential & Data Exposure in Source Archive

**Date:** 2026-03-07
**Severity:** High
**Status:** Open — credential rotation pending

## Summary

Source code archives shipped for review included the `.manus/db/` directory, which contains database query log files with plaintext TiDB Cloud connection credentials and SQL query history.

## Root Cause

The zip archive was created from the working tree (`zip -r . -x ...`) rather than from git-tracked files only. The `.manus/` directory is in `.gitignore` but was not excluded from the zip command's exclusion list.

## Exposed Credentials

| Field | Value |
|-------|-------|
| Host | `gateway02.us-east-1.prod.aws.tidbcloud.com` |
| Port | `4000` |
| User | `3xenzgJ3NGNThF2.96bc46f6ec2f` |
| Database | `9n2ukZGVgWAjZMdS2ZS3BU` |
| Password | Passed via `--password` flag in mysql CLI commands (value present in query logs) |

**Files containing credentials:** All 6 files in `.manus/db/db-query-*.json`

## Exposed Data

### Query History (commands visible, not result data)

The `.manus/db/` files record SQL commands issued via `webdev_execute_sql`. The query text and full mysql CLI commands are stored. Query **results** were not captured (`has_result=False` in all 6 files).

### Queries Exposed

1. `ALTER TABLE kg_endpoints ADD COLUMN broker_validated` — schema migration, no data
2. `ALTER TABLE kg_parameters ADD COLUMN app_aliases` — schema migration, no data
3. `SHOW TABLES LIKE 'baseline_schedules'` — schema probe, no data
4. `SELECT ... FROM triage_objects ORDER BY id DESC LIMIT 5` — **triage data query** (results NOT captured)
5. `SELECT triageData FROM triage_objects ORDER BY id DESC LIMIT 1` — **triage data query** (results NOT captured)
6. `ALTER TABLE kg_use_cases MODIFY COLUMN semantic_type` — schema migration, no data

### Triage Data Assessment

The triage_objects queries reveal **table structure** (column names: id, triageId, alertId, ruleId, severity, route, alertFamily, triageData) but **no actual row data** was captured in the dump files. The sensitivity of triage data depends on what analysts have routed through the system — it may contain alert context, rule match details, and analyst notes.

### Database Name Exposure

The database name `9n2ukZGVgWAjZMdS2ZS3BU` is exposed, which helps an attacker orient themselves even after credential rotation.

## Distribution Scope

Archives were shared within this Manus task conversation only. Determine whether any archive was forwarded or downloaded outside this controlled environment.

## Required Actions

1. **Rotate credentials** — Create new DB user/password in TiDB Cloud, update DATABASE_URL in all environments, invalidate old credential
2. **Packaging fix** — Replace ad-hoc zip with scripted `git archive` export
3. **Packaging guard** — Add machine-enforced check that fails if archive contains `.manus/`, `.env*`, credential patterns
4. **Assess triage sensitivity** — Review what data lives in triage_objects to determine if further incident response is needed
