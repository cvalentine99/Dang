# Dang! SIEM — Project Overview

## Purpose
Dang! is a read-focused, analyst-grade web application that visualizes and correlates Wazuh security telemetry (agents, alerts, vulnerabilities, FIM, CIS, compliance) via the official Wazuh REST API. It is NOT a Wazuh replacement or management console. By default, it is read-only and must not mutate production Wazuh state.

## Tech Stack
- Frontend: React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui + Radix UI
- Backend: Express 4 + tRPC 11 (type-safe RPC, no REST routes)
- Database: MySQL/TiDB via Drizzle ORM
- Build: Vite (frontend) + esbuild (backend) + tsx (dev watch)
- Testing: Vitest (91 test files, 2785+ tests)
- Auth: Manus OAuth + local auth (bcryptjs + JWT)
- Deployment: Docker multi-stage build, Caddy/Nginx reverse proxy
- Package Manager: pnpm, Node.js v22

## Design Language
- Dark-only UI using Amethyst Nexus theme
- Glass-morphism panels, purple/violet primary accents, OKLCH color space
- Fonts: Space Grotesk (headings), Inter (UI), JetBrains Mono (code/hashes)
- Optimized for ultrawide SOC monitors (up to 2400px)

## Scale
- ~114,000 lines of TypeScript/TSX
- 277 source files, 91 test files
- 43 database tables, 29 tRPC router namespaces, 43 frontend pages

## Key Integrations
- Wazuh REST API (proxied through backend)
- Wazuh Indexer (OpenSearch-compatible)
- AlienVault OTX (threat intel with DB cache)
- Splunk HEC, GeoIP, LLM (agentic triage pipeline)

## Security Constraints
- Read-only by default, Wazuh tokens server-side only
- SSRF protection, TLS verification gated on env
- Login rate limiting, disabled user checks