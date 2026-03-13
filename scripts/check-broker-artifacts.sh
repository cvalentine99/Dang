#!/usr/bin/env bash
# check-broker-artifacts.sh
#
# Advisory check: warns if broker coverage enrichment artifacts are
# missing or stale. Does NOT fail the build — exits 0 with warnings.
#
# Usage:
#   ./scripts/check-broker-artifacts.sh
#   # or in CI:
#   bash scripts/check-broker-artifacts.sh

set -euo pipefail

DOCS_DIR="$(cd "$(dirname "$0")/.." && pwd)/docs"
WARN=0

check_artifact() {
  local file="$1"
  local label="$2"
  local generator="$3"

  if [ ! -f "$DOCS_DIR/$file" ]; then
    echo "WARNING: $label not found at docs/$file"
    echo "  → Run: node scripts/$generator"
    WARN=1
  else
    local age_days
    age_days=$(( ( $(date +%s) - $(stat -c %Y "$DOCS_DIR/$file" 2>/dev/null || stat -f %m "$DOCS_DIR/$file" 2>/dev/null) ) / 86400 ))
    if [ "$age_days" -gt 7 ]; then
      echo "WARNING: $label is ${age_days} days old (docs/$file)"
      echo "  → Consider regenerating: node scripts/$generator"
      WARN=1
    else
      echo "OK: $label (${age_days}d old)"
    fi
  fi
}

echo "=== Broker Coverage Artifact Check ==="
check_artifact "wiring-ledger.json" "Wiring ledger" "generate-wiring-ledger.mjs"
check_artifact "ui-param-parity.json" "Param parity audit" "audit-ui-param-parity.mjs"

if [ "$WARN" -eq 1 ]; then
  echo ""
  echo "Some enrichment artifacts are missing or stale."
  echo "Broker Coverage will still work but with reduced callsite/parity data."
fi

exit 0
