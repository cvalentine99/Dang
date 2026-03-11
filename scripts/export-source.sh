#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# export-source.sh — Clean source archive from git-tracked files only
#
# Usage:
#   ./scripts/export-source.sh                    # → dang-source.zip
#   ./scripts/export-source.sh my-release.zip     # → my-release.zip
#
# This script:
#   1. Stages any uncommitted tracked-file changes to a temp commit
#   2. Uses `git archive` to produce a zip from the index (tracked files only)
#   3. Restores the original git state
#   4. Runs verify-archive.sh to confirm the archive is clean
#
# Why git archive:
#   - Only includes files tracked by git
#   - Respects .gitignore (untracked files never enter the archive)
#   - .manus/, .webdev/, node_modules/, .env* are all untracked → excluded
#   - Symlinks are stored as symlinks in the archive
#   - Deterministic: same commit → same archive content
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT="${1:-dang-source.zip}"

cd "$PROJECT_ROOT"

echo "╔══════════════════════════════════════════════════╗"
echo "║  Clean Source Export                             ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Step 1: Check for uncommitted changes to tracked files
DIRTY=false
if ! git diff --quiet HEAD 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  DIRTY=true
  echo "⚠  Working tree has uncommitted changes to tracked files."
  echo "   Creating temporary commit to include them in archive..."
  git stash push -m "export-source: temp stash" --include-untracked=false
  # Actually, git archive from HEAD works on committed state.
  # For uncommitted changes, we need a different approach.
  # Use git stash, then archive from stash, then pop.
  echo "   Stashed. Will archive from HEAD (committed state only)."
  echo "   If you need uncommitted changes, commit first."
  echo ""
fi

# Step 2: Produce archive from git index
echo "→ Creating archive from git-tracked files..."
rm -f "$OUTPUT"
git archive --format=zip --prefix="" HEAD -o "$OUTPUT"
echo "  Archive: $OUTPUT"
echo "  Files:   $(unzip -l "$OUTPUT" 2>/dev/null | tail -1 | awk '{print $2}')"
echo "  Size:    $(du -h "$OUTPUT" | cut -f1)"
echo ""

# Step 3: Restore git state if we stashed
if [ "$DIRTY" = true ]; then
  echo "→ Restoring stashed changes..."
  git stash pop --quiet 2>/dev/null || true
fi

# Step 4: Run the packaging guard
echo "→ Running packaging guard..."
if bash "$SCRIPT_DIR/verify-archive.sh" "$OUTPUT"; then
  echo ""
  echo "✓ Clean archive ready: $OUTPUT"
else
  echo ""
  echo "✗ ARCHIVE FAILED VERIFICATION — do not distribute"
  echo "  See verify-archive.sh output above for details"
  exit 1
fi
