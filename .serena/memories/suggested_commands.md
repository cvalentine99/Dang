# Suggested Commands

## Development
- `pnpm dev` — Start dev server (tsx watch on server/_core/index.ts)
- `pnpm build` — Build frontend (Vite) + backend (esbuild)
- `pnpm start` — Run production build

## Testing
- `pnpm test` — Run all Vitest tests (91 files, 2785+ tests)
- `npx vitest run server/path/to/file.test.ts` — Run a single test file
- `npx vitest run --reporter=verbose` — Verbose test output
- Tests run sequentially (fileParallelism: false) due to DB dependencies

## Type Checking
- `pnpm check` — Run tsc --noEmit (full type check)
- `npx tsc --noEmit 2>&1 | head -50` — Quick type error scan

## Formatting
- `pnpm format` — Run Prettier on all files

## Database
- `pnpm drizzle-kit generate` — Generate migration SQL from schema changes
- Schema: drizzle/schema.ts
- Migrations applied via webdev_execute_sql (not drizzle-kit migrate)

## Audit Scripts
- `pnpm audit:ui-parity` — Check UI param parity with Wazuh API
- `pnpm audit:broker` — Verify param counts
- `pnpm audit:openapi` — Diff against Wazuh OpenAPI spec
- `pnpm audit:splitbrain` — Check for split-brain patterns
- `pnpm proof:generate` — Generate CI proof artifacts

## Docker
- `docker compose up --build` — Build and run with Docker
- `docker compose -f docker-compose.caddy.yml up` — With Caddy reverse proxy
- `docker compose -f docker-compose.nginx.yml up` — With Nginx reverse proxy

## System Utilities
- `git`, `ls`, `cd`, `grep -rn`, `find`, `sed`, `awk` — Standard Linux tools
- `grep -rn "pattern" server/` — Search server code
- `find server client/src -name "*.ts" | xargs wc -l` — Count lines