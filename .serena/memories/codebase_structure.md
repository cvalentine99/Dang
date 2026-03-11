# Codebase Structure

## Top-Level Layout
```
client/          — React frontend (Vite)
  src/
    pages/       — 43 page components (one per route)
    components/  — Reusable UI (shared/, ui/ shadcn)
    contexts/    — React contexts
    hooks/       — Custom hooks
    lib/trpc.ts  — tRPC client binding
    App.tsx      — Routes and DashboardLayout
    index.css    — Global Amethyst Nexus theme
server/          — Express + tRPC backend
  _core/         — Framework plumbing (DO NOT EDIT)
    index.ts     — Express server entry
    context.ts   — tRPC context builder
    trpc.ts      — tRPC init, publicProcedure, protectedProcedure
    env.ts       — Environment variable access
    llm.ts       — LLM invocation helper
    sdk.ts       — Auth (authenticateRequest)
    tlsAgent.ts  — Shared TLS configuration
  routers.ts     — Main tRPC router (merges all domain routers)
  db.ts          — Shared DB query helpers
  storage.ts     — S3 file storage helpers
  dbGuard.ts     — Database guard utilities
  admin/         — Admin settings, connection settings, user management
  agenticPipeline/ — LLM triage pipeline (triage, correlation, hypothesis agents)
    triageAgent.ts, correlationAgent.ts, hypothesisAgent.ts
    stateMachine.ts — Pipeline state machine
    pipelineRouter.ts — Pipeline tRPC procedures
    livingCaseReportService.ts — Living case report generation
    types/ — Zod schemas for LLM output (LLMTriageRaw, LLMHypothesisRaw)
  alertQueue/    — Alert queue management
  baselines/     — Configuration baselines and drift detection
  enhancedLLM/   — Enhanced LLM service with fallback
  graph/         — Knowledge graph (ETL, agentic pipeline, analyst chat)
  hunt/          — Threat hunting
  hybridrag/     — Hybrid RAG sessions
  indexer/       — Wazuh Indexer client (OpenSearch queries)
  llm/           — LLM usage tracking
  localAuth/     — Local auth (register, login, rate limiting)
  notes/         — Analyst notes
  otx/           — AlienVault OTX client (two-tier cache: RAM + DB)
  savedSearches/ — Saved search management
  splunk/        — Splunk HEC integration
  sse/           — Server-sent events
  wazuh/         — Wazuh REST API client (proxied)
drizzle/         — Database schema and migrations
  schema.ts      — 43 tables (Drizzle ORM)
shared/          — Shared types and constants
scripts/         — Audit and utility scripts
```

## Key Domain Routers (29 namespaces in server/routers.ts)
adminUsers, alertQueue, anomalies, auth, autoQueue, baselines,
baselineSchedules, connectionSettings, driftAnalytics, enhancedLLM,
export, graph, hunt, hybridrag, indexer, llm, localAuth, notes,
notificationHistory, otx, pipeline, readiness, responseActions,
savedSearches, sensitiveAccess, splunk, suppression, system, wazuh

## Key Frontend Pages
Home, AgentHealth, AgentDetail, AlertsTimeline, AlertQueue,
Vulnerabilities, Compliance, FileIntegrity, MitreAttack,
ThreatIntel, ThreatHunting, KnowledgeGraph, DataPipeline,
TriagePipeline, Investigations, LivingCaseView, DriftAnalytics,
ITHygiene, SecurityExplorer, FleetInventory, BrokerCoverage,
TokenUsage, AnalystChat, AnalystNotes, ResponseActions, Status