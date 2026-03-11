# Task Completion Checklist

When completing any task on this project, follow these steps:

## Before Committing
1. Run `pnpm check` (tsc --noEmit) — must pass with 0 errors
2. Run `pnpm test` (vitest run) — all 91+ test files must pass
3. Run `pnpm format` — ensure consistent formatting
4. Update todo.md — mark completed items as [x], add new items as [ ]

## Code Quality
- Every new tRPC procedure must have a corresponding test in server/*.test.ts
- Every LLM invocation must include a caller param for token tracking
- Every new invokeLLM/invokeLLMWithFallback call must pass Zod validation on output
- Never use replace() when replaceAll() is needed (safety rails)
- Never use || for numeric defaults that could be 0 — use ?? instead
- Never hardcode rejectUnauthorized: false — use getSkipTlsVerify()
- Never expose Wazuh tokens to the frontend

## Database Changes
- Update drizzle/schema.ts first
- Generate migration: pnpm drizzle-kit generate
- Apply via webdev_execute_sql (not drizzle-kit migrate)
- Add DB helpers in server/db.ts

## Frontend Changes
- Use Amethyst Nexus dark theme tokens only
- Use shadcn/ui components from @/components/ui/*
- Use GlassPanel from @/components/shared/GlassPanel for containers
- Handle loading/empty/error states
- Never call Wazuh directly — always go through tRPC

## Security Review
- Any new endpoint accepting user input: validate with Zod
- Any new host/URL input: pass through validateHostSafety()
- Any write endpoint: gate behind feature flag + named role
- Any new LLM call: add caller param, validate output with Zod schema

## Deployment
- Save checkpoint via webdev_save_checkpoint
- Push to GitHub
- Docker build tested if Dockerfile changes made