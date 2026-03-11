# Code Style and Conventions

## Formatting (Prettier)
- Semicolons: yes
- Trailing commas: es5
- Single quotes: no (double quotes)
- Print width: 80
- Tab width: 2 (spaces)
- Arrow parens: avoid
- End of line: LF

## TypeScript
- Strict mode enabled
- Module: ESNext, moduleResolution: bundler
- Path aliases: @/* -> client/src/*, @shared/* -> shared/*
- No explicit return types required but encouraged on exports
- Zod schemas for LLM output validation (triageAgent, hypothesisAgent, correlationAgent)

## Naming Conventions
- Files: camelCase for modules (otxClient.ts), PascalCase for React components (AgentDetail.tsx)
- Variables/functions: camelCase
- Types/interfaces: PascalCase
- Database tables: camelCase in Drizzle schema, snake_case in SQL
- Constants: UPPER_SNAKE_CASE for enums and config arrays
- Test files: *.test.ts colocated with source

## Architecture Patterns
- tRPC procedures in server/routers.ts (merged from domain routers)
- Domain routers in server/{domain}/{domain}Router.ts
- DB helpers in server/db.ts (reusable across procedures)
- Frontend pages in client/src/pages/*.tsx
- Shared components in client/src/components/shared/
- shadcn/ui components in client/src/components/ui/

## Data Flow
- Frontend -> tRPC hooks (useQuery/useMutation) -> Backend procedures -> Wazuh/DB
- Never call Wazuh directly from browser
- All external API calls go through backend proxy layer
- LLM calls always server-side with caller param for token tracking

## Error Handling
- Fail closed: show glass-panel error state, no blind retries
- TRPCError with appropriate codes (UNAUTHORIZED, FORBIDDEN, NOT_FOUND)
- Zod validation on all LLM output with lenient defaults

## Security Patterns
- protectedProcedure for authenticated endpoints
- adminProcedure for admin-only operations
- validateHostSafety() for any user-supplied hostnames
- getSkipTlsVerify() for TLS configuration
- Rate limiting on auth endpoints
- isDisabled check on every authenticated request