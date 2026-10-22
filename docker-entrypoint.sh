#!/bin/sh
# ============================================================================
# Dang! SIEM — Docker Entrypoint
# Handles: DB readiness wait, pre-migration repair, migrations, KG seed, start
# ============================================================================

set -e

echo "╔══════════════════════════════════════════════════╗"
echo "║  Dang! SIEM — Starting Production Server        ║"
echo "╚══════════════════════════════════════════════════╝"

# ── Wait for database if DATABASE_URL is set ─────────────────────────────────
if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] DATABASE_URL detected, waiting for database..."

  # Use Node.js URL parser — handles passwords with @, :, / safely
  DB_HOST=$(node -e "try{console.log(new URL(process.env.DATABASE_URL).hostname)}catch(e){console.log('')}")
  DB_PORT=$(node -e "try{const p=new URL(process.env.DATABASE_URL).port;console.log(p||'3306')}catch(e){console.log('3306')}")

  if [ -z "$DB_HOST" ]; then
    echo "[entrypoint] WARNING: Could not parse DATABASE_URL — skipping DB wait"
  else
    MAX_RETRIES=30
    RETRY_COUNT=0

    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
      if node -e "const net=require('net');const s=net.createConnection({host:'${DB_HOST}',port:${DB_PORT}},()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))" 2>/dev/null; then
        echo "[entrypoint] Database is reachable at ${DB_HOST}:${DB_PORT}"
        break
      fi
      RETRY_COUNT=$((RETRY_COUNT + 1))
      echo "[entrypoint] Waiting for database... (${RETRY_COUNT}/${MAX_RETRIES})"
      sleep 2
    done

    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
      echo "[entrypoint] WARNING: Database not reachable after ${MAX_RETRIES} attempts, starting anyway..."
    fi
  fi
fi

# ── Pre-migration backup (H-D8) ──────────────────────────────────────────────
# Takes a consistent mysqldump of the application database to
#   ${BACKUP_DIR:-/app/backups}/pre-migrate-<UTC timestamp>.sql.gz
# Fails the boot if the dump fails. Prunes pre-migrate dumps older than
# ${BACKUP_RETENTION_DAYS:-14} days. Credentials are parsed from DATABASE_URL by
# node and written to a 0600 temp option file — the password is never echoed,
# never placed on a command line, and never stored in a shell variable.
backup_before_migrate() {
  BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
  BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

  if ! command -v mysqldump >/dev/null 2>&1; then
    echo "[entrypoint] FATAL: mysqldump not found — cannot take pre-migration backup."
    return 1
  fi
  if ! mkdir -p "$BACKUP_DIR" 2>/dev/null || [ ! -w "$BACKUP_DIR" ]; then
    echo "[entrypoint] FATAL: backup directory $BACKUP_DIR is not writable by $(id -un)."
    return 1
  fi

  TS=$(date -u +%Y%m%dT%H%M%SZ)
  DUMP_SQL="$BACKUP_DIR/pre-migrate-$TS.sql"
  DUMP_CNF=$(mktemp)
  chmod 600 "$DUMP_CNF"

  # Same URL-parsing pattern as the DB wait above (handles @ : / in passwords).
  # The JS is single-quoted so the shell performs no interpolation inside it.
  DB_NAME=$(DUMP_CNF="$DUMP_CNF" node -e '
    const fs = require("fs");
    const u = new URL(process.env.DATABASE_URL);
    const q = (v) => "\"" + String(v).replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"";
    fs.writeFileSync(process.env.DUMP_CNF,
      "[client]\n" +
      "host=" + q(u.hostname) + "\n" +
      "port=" + (u.port || "3306") + "\n" +
      "user=" + q(decodeURIComponent(u.username)) + "\n" +
      "password=" + q(decodeURIComponent(u.password)) + "\n",
      { mode: 0o600 });
    console.log(decodeURIComponent(u.pathname.slice(1)));
  ') || { rm -f "$DUMP_CNF"; echo "[entrypoint] FATAL: could not parse DATABASE_URL for backup."; return 1; }

  if [ -z "$DB_NAME" ]; then
    rm -f "$DUMP_CNF"
    echo "[entrypoint] FATAL: DATABASE_URL has no database name — cannot back up."
    return 1
  fi

  echo "[entrypoint] Pending migrations detected — backing up database '$DB_NAME' to $DUMP_SQL.gz ..."
  # Dump to a plain file first (no pipe) so a mysqldump failure is not masked by
  # gzip's exit status under POSIX sh (no pipefail).
  if ! mysqldump --defaults-extra-file="$DUMP_CNF" --single-transaction --quick \
        --routines --triggers --no-tablespaces "$DB_NAME" > "$DUMP_SQL"; then
    rm -f "$DUMP_CNF" "$DUMP_SQL"
    echo "[entrypoint] FATAL: pre-migration mysqldump failed — refusing to migrate without a backup."
    return 1
  fi
  rm -f "$DUMP_CNF"

  if ! tail -n 1 "$DUMP_SQL" | grep -q "Dump completed"; then
    rm -f "$DUMP_SQL"
    echo "[entrypoint] FATAL: pre-migration dump looks truncated — refusing to migrate."
    return 1
  fi
  if ! gzip -f "$DUMP_SQL"; then
    rm -f "$DUMP_SQL" "$DUMP_SQL.gz"
    echo "[entrypoint] FATAL: could not compress pre-migration dump."
    return 1
  fi
  chmod 600 "$DUMP_SQL.gz" 2>/dev/null || true
  echo "[entrypoint] Backup written: $DUMP_SQL.gz ($(du -h "$DUMP_SQL.gz" | cut -f1))"

  # Retention: prune only our own pre-migrate dumps.
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'pre-migrate-*.sql.gz' -mtime +"$BACKUP_RETENTION_DAYS" -print -delete \
    | sed 's/^/[entrypoint] Pruned old backup: /' || true
  return 0
}

# ── Run migrations if requested ──────────────────────────────────────────────
if [ "$RUN_MIGRATIONS" = "true" ] && [ -n "$DATABASE_URL" ]; then
  # Step 1: Pending probe + backup. Nothing touches the database before this.
  # docker-pre-migrate.mjs --has-pending exits 0 = pending, 3 = nothing pending.
  PENDING_EXIT=0
  node scripts/docker-pre-migrate.mjs --has-pending 2>&1 || PENDING_EXIT=$?
  if [ "$PENDING_EXIT" -eq 0 ]; then
    if ! backup_before_migrate; then
      exit 1
    fi
  elif [ "$PENDING_EXIT" -eq 3 ]; then
    echo "[entrypoint] No pending migrations — skipping pre-migration backup."
  else
    echo "[entrypoint] FATAL: could not determine pending migrations (exit $PENDING_EXIT)."
    exit 1
  fi

  # Step 2: Backfill migration journal — ensures all previously-applied migrations
  # are recorded in __drizzle_migrations so drizzle-kit doesn't try to re-apply them.
  # This is idempotent: it only inserts entries that are missing.
  echo "[entrypoint] Checking migration journal integrity..."
  if ! node scripts/backfill-migrations.mjs 2>&1; then
    echo "[entrypoint] FATAL: migration journal backfill failed — refusing to start with an unknown schema state."
    exit 1
  fi

  # Step 3: Read-only pre-migration check (H-D5). It never modifies the schema;
  # it exits non-zero and lists every pending statement that would collide with
  # the live schema (index/column/FK already present, DROP target missing).
  echo "[entrypoint] Running pre-migration check..."
  if ! node scripts/docker-pre-migrate.mjs 2>&1; then
    echo "[entrypoint] FATAL: pre-migration check failed — reconcile the listed statements by hand (a backup was taken above if migrations were pending)."
    exit 1
  fi

  # Step 4: Run drizzle-kit migrate — apply any genuinely new migrations
  echo "[entrypoint] Running database migrations..."
  MIGRATE_EXIT=0
  npx drizzle-kit migrate 2>&1 || MIGRATE_EXIT=$?

  if [ "$MIGRATE_EXIT" -ne 0 ]; then
    echo "[entrypoint] ╔═══════════════════════════════════════════════════════════╗"
    echo "[entrypoint] ║  FATAL: drizzle-kit migrate failed (exit $MIGRATE_EXIT)             ║"
    echo "[entrypoint] ║  Cannot start with broken schema — fix migrations first. ║"
    echo "[entrypoint] ╚═══════════════════════════════════════════════════════════╝"
    if [ "$ALLOW_MIGRATION_FAILURE" != "true" ]; then
      exit 1
    fi
    echo "[entrypoint] WARNING: ALLOW_MIGRATION_FAILURE=true — starting with broken schema (unsafe)."
  else
    echo "[entrypoint] Migrations applied successfully."
  fi

  # Step 5: Seed Knowledge Graph tables if they're empty
  # The KG seeder parses the Wazuh OpenAPI spec and populates kg_* tables
  echo "[entrypoint] Checking Knowledge Graph tables..."
  KG_COUNT=$(node -e "
    const mysql = require('mysql2/promise');
    (async () => {
      try {
        const conn = await mysql.createConnection(process.env.DATABASE_URL);
        const [rows] = await conn.query('SELECT COUNT(*) as cnt FROM kg_endpoints');
        console.log(rows[0].cnt);
        await conn.end();
      } catch { console.log('0'); }
    })();
  " 2>/dev/null || echo "0")

  if [ "$KG_COUNT" = "0" ] || [ -z "$KG_COUNT" ]; then
    echo "[entrypoint] KG tables empty — running Knowledge Graph seeder..."
    # tsx is a runtime dependency (see package.json) so this never reaches out to the registry.
    if node_modules/.bin/tsx seed-kg.mjs 2>&1; then
      echo "[entrypoint] KG seeder complete."
    else
      echo "[entrypoint] ERROR: KG seeder failed."
      if [ "$ALLOW_SEED_FAILURE" != "true" ]; then
        echo "[entrypoint] Set ALLOW_SEED_FAILURE=true to start without a populated Knowledge Graph."
        exit 1
      fi
      echo "[entrypoint] WARNING: ALLOW_SEED_FAILURE=true — starting with an empty Knowledge Graph."
    fi
  else
    echo "[entrypoint] KG tables already populated ($KG_COUNT endpoints) — skipping seeder."
  fi
fi

# ── Start the production server ──────────────────────────────────────────────
echo "[entrypoint] Starting Node.js server on port ${PORT:-3000}..."
exec node dist/index.js
