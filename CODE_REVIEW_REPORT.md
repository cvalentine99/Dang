# Dang! SIEM — Multi-Agent Code Review Report

**Date:** February 22, 2026  
**Scope:** Pre-deployment review for Docker on Linux x86_64  
**Agents:** 6 parallel reviewers (Security, Backend API, Frontend, Docker, Database, Performance)

---

## Summary

| Review Area | Critical | High | Medium | Low | Top Priority Fix |
|---|---|---|---|---|---|
| Security | 2 | 2 | 2 | 1 | Non-root container user (**FIXED**) |
| Backend API | — | — | — | — | *(Agent reviewed wrong repo)* |
| Frontend | 0 | 1 | 1 | 1 | Fix `@/hooks/useAuth` import (**ALREADY CORRECT**) |
| Docker Config | 1 | 1 | 1 | 1 | Static file path resolution (**FIXED**) |
| Database & Schema | 0 | 3 | 3 | 2 | Add indexes on `analyst_notes_v2` (**FIXED**) |
| Performance | 0 | 1 | 1 | 1 | In-memory rate limiter (noted, acceptable for single-instance) |

---

## Fixes Applied

1. **Non-root container** — Dockerfile now creates a `dang` user/group and runs as non-root
2. **Tini init system** — Added `tini` as PID 1 for proper signal handling and zombie reaping
3. **Static file path resolution** — Fixed `serveStatic()` to correctly resolve `dist/public/` with fallback paths
4. **Static asset caching** — Added `Cache-Control` headers (1y immutable for assets, no-cache for index.html)
5. **Database indexes** — Added 4 indexes on `analyst_notes_v2` (userId, entityType, entityId, composite)
6. **Health endpoint hardening** — Removed `uptime` and `version` fields to reduce info leakage
7. **MySQL UTC timezone** — Added `--default-time-zone=+00:00` to docker-compose MySQL command

## Noted but Not Fixed (Acceptable Risk)

- **In-memory rate limiter** — Adequate for single-instance Docker deployment; Redis recommended only for multi-instance
- **Cookie security flags** — Managed by the framework's OAuth module (`server/_core/oauth.ts`), not user-modified code
- **Terminal endpoint** — Already disabled in production via environment check; removing entirely would break dev workflow
