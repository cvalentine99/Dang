#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# verify-archive.sh — Machine-enforced packaging guard
#
# Usage:
#   ./scripts/verify-archive.sh path/to/archive.zip
#
# Fails if the archive contains:
#   - .manus/           (platform artifacts, DB query logs with credentials)
#   - .env files        (actual dotenv files, not code that references env vars)
#   - node_modules/     (dependencies, not source)
#   - .git/             (repository internals)
#   - *.log             (log files)
#   - .webdev/          (webdev platform artifacts)
#   - .manus-logs/      (platform log directory)
#   - DB query dump files (db-query-*.json)
#   - Real credential values (cloud DB hostnames, raw connection strings))
#
# Exit codes:
#   0 = archive is clean
#   1 = archive contains prohibited content
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ARCHIVE="${1:?Usage: verify-archive.sh <archive.zip>}"

if [ ! -f "$ARCHIVE" ]; then
  echo "ERROR: File not found: $ARCHIVE"
  exit 1
fi

echo "Verifying archive: $ARCHIVE"
echo "────────────────────────────────────────────────"

FAILURES=0

fail() {
  echo "✗ FAIL: $1"
  FAILURES=$((FAILURES + 1))
}

pass() {
  echo "✓ PASS: $1"
}

# ── Path-based checks ────────────────────────────────────────────────────────
LISTING=$(unzip -l "$ARCHIVE" 2>/dev/null)
FILE_LIST=$(echo "$LISTING" | awk 'NR>3 {print $NF}' | head -n -2)

# Directories/prefixes that must not appear
for pattern in ".manus/" ".manus-logs/" "__manus__/" ".webdev/" "node_modules/" ".git/"; do
  MATCHES=$(echo "$FILE_LIST" | grep -c "^${pattern}\|/${pattern}" || true)
  if [ "$MATCHES" -gt 0 ]; then
    fail "Archive contains '$pattern' ($MATCHES entries)"
    echo "$FILE_LIST" | grep "^${pattern}\|/${pattern}" | head -5 | sed 's/^/  /'
  else
    pass "No '$pattern' entries"
  fi
done

# Actual .env files (not env.ts, envValidation.ts, env.docker.template, etc.)
# Match: .env, .env.local, .env.production, .env.development.local, etc.
ENV_FILES=$(echo "$FILE_LIST" | grep -E '(^|/)\.env(\.[a-zA-Z]+)*$' || true)
if [ -n "$ENV_FILES" ]; then
  ENV_COUNT=$(echo "$ENV_FILES" | wc -l)
  fail "Archive contains $ENV_COUNT dotenv file(s)"
  echo "$ENV_FILES" | head -5 | sed 's/^/  /'
else
  pass "No dotenv files (.env, .env.local, etc.)"
fi

# .log files
LOG_FILES=$(echo "$FILE_LIST" | grep '\.log$' || true)
if [ -n "$LOG_FILES" ]; then
  LOG_COUNT=$(echo "$LOG_FILES" | wc -l)
  fail "Archive contains $LOG_COUNT .log file(s)"
  echo "$LOG_FILES" | head -5 | sed 's/^/  /'
else
  pass "No .log files"
fi

# ── Content-based checks ─────────────────────────────────────────────────────
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

unzip -q -o "$ARCHIVE" -d "$TMPDIR" 2>/dev/null

echo ""
echo "Scanning file contents for credential patterns..."

# All patterns are built dynamically so this script does not self-match.

# Pattern 1: Cloud DB connection commands with credentials (host + user + database)
CLOUD_DB="tidb" && CLOUD_DB="${CLOUD_DB}cloud"
P1="gateway.*${CLOUD_DB}.*--user"
TIDB_LEAKS=$(grep -rl "$P1" "$TMPDIR" 2>/dev/null || true)
if [ -n "$TIDB_LEAKS" ]; then
  LEAK_COUNT=$(echo "$TIDB_LEAKS" | wc -l)
  fail "Cloud DB connection commands with credentials found in $LEAK_COUNT file(s)"
  echo "$TIDB_LEAKS" | sed "s|$TMPDIR/||g" | head -5 | sed 's/^/  /'
else
  pass "No cloud DB connection commands with credentials"
fi

# Pattern 2: Raw DB URL assignment with real connection string (not env var refs or placeholders)
DB_KEY="DATABASE"
DB_KEY="${DB_KEY}_URL"
P2="${DB_KEY}=mysql://[^$]"
RAW_DB_URLS=$(grep -rn "$P2" "$TMPDIR" --include="*.json" --include="*.sh" --include="*.yaml" --include="*.yml" 2>/dev/null | grep -v '\${' | grep -v 'testuser\|testpassword\|test:test\|user:pass\|x:x' || true)
if [ -n "$RAW_DB_URLS" ]; then
  fail "Raw DB URL with real connection string found"
  echo "$RAW_DB_URLS" | sed "s|$TMPDIR/||g" | head -5 | sed 's/^/  /'
else
  pass "No raw DB URL with real credentials (placeholders/test values OK)"
fi

# Pattern 3: DB password env var with a value
PWD_KEY="MYSQL"
PWD_KEY="${PWD_KEY}_PWD="
MYSQL_PWD_LEAKS=$(grep -rl "$PWD_KEY" "$TMPDIR" 2>/dev/null | grep -v '\${' || true)
if [ -n "$MYSQL_PWD_LEAKS" ]; then
  fail "DB password env var found in files"
  echo "$MYSQL_PWD_LEAKS" | sed "s|$TMPDIR/||g" | head -5 | sed 's/^/  /'
else
  pass "No DB password env var in file contents"
fi

# ── DB query dump check ──────────────────────────────────────────────────────
echo ""
DB_DUMPS=$(find "$TMPDIR" -name "db-query-*.json" 2>/dev/null || true)
if [ -n "$DB_DUMPS" ]; then
  DUMP_COUNT=$(echo "$DB_DUMPS" | wc -l)
  fail "Archive contains $DUMP_COUNT database query dump file(s)"
  echo "$DB_DUMPS" | sed "s|$TMPDIR/||g" | head -5 | sed 's/^/  /'
else
  pass "No database query dump files"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────────────"
TOTAL_FILES=$(echo "$FILE_LIST" | grep -c '.' || true)
echo "Archive: $TOTAL_FILES files"
if [ "$FAILURES" -gt 0 ]; then
  echo "✗ VERIFICATION FAILED: $FAILURES check(s) failed"
  echo "  DO NOT DISTRIBUTE this archive."
  exit 1
else
  echo "✓ ALL CHECKS PASSED: Archive is clean for distribution"
  exit 0
fi
