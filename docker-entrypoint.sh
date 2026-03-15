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

# ── Run migrations if requested ──────────────────────────────────────────────
if [ "$RUN_MIGRATIONS" = "true" ] && [ -n "$DATABASE_URL" ]; then
  # Step 1: Pre-migration repair — drop stale indexes from partially-applied migrations
  # This handles the MySQL 8.0 limitation where CREATE INDEX (without IF NOT EXISTS)
  # fails on re-run if the previous attempt partially completed
  echo "[entrypoint] Running pre-migration repair..."
  node scripts/docker-pre-migrate.mjs 2>&1 || echo "[entrypoint] WARNING: Pre-migration repair had issues, continuing..."

  # Step 2: Backfill migration journal — ensures all previously-applied migrations
  # are recorded in __drizzle_migrations so drizzle-kit doesn't try to re-apply them.
  # This is idempotent: it only inserts entries that are missing.
  echo "[entrypoint] Checking migration journal integrity..."
  node scripts/backfill-migrations.mjs 2>&1 || echo "[entrypoint] WARNING: Migration journal backfill had issues, continuing..."

  # Step 3: Run drizzle-kit migrate — apply any genuinely new migrations
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

  # Step 4: Seed Knowledge Graph tables if they're empty
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
    npx tsx seed-kg.mjs 2>&1 || echo "[entrypoint] WARNING: KG seeder failed, continuing..."
    echo "[entrypoint] KG seeder complete."
  else
    echo "[entrypoint] KG tables already populated ($KG_COUNT endpoints) — skipping seeder."
  fi
fi

# ── Start the production server ──────────────────────────────────────────────
echo "[entrypoint] Starting Node.js server on port ${PORT:-3000}..."
exec node dist/index.js
