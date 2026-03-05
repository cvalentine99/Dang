# Dang! SIEM

[![CI](https://github.com/cvalentine99/Dang-/actions/workflows/ci.yml/badge.svg)](https://github.com/cvalentine99/Dang-/actions/workflows/ci.yml)
[![Docker Build](https://github.com/cvalentine99/Dang-/actions/workflows/docker.yml/badge.svg)](https://github.com/cvalentine99/Dang-/actions/workflows/docker.yml)
[![GHCR](https://img.shields.io/badge/ghcr.io-cvalentine99%2Fdang--siem-purple?logo=github)](https://ghcr.io/cvalentine99/dang-siem)
[![License: MIT](https://img.shields.io/badge/License-MIT-violet.svg)](LICENSE)

An analyst-grade security operations platform that visualizes, correlates, and investigates **Wazuh security telemetry** — agents, alerts, vulnerabilities, FIM, CIS compliance, MITRE ATT&CK mappings, and threat intelligence — through a read-only proxy architecture with an LLM-powered agentic investigation pipeline. Built for SOC analysts on ultrawide monitors.

---

## Table of Contents

- [Architecture](#architecture)
- [Feature Map](#feature-map)
- [Page Reference](#page-reference)
- [Agentic Investigation Pipeline](#agentic-investigation-pipeline)
- [Integrations](#integrations)
- [Security Model](#security-model)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [Testing](#testing)
- [Design Language](#design-language)
- [Backend API Surface](#backend-api-surface)
- [Project Structure](#project-structure)
- [License](#license)

---

## Architecture

```
                                    ┌─────────────────────────────────────────────┐
                                    │              Dang! SIEM Server               │
Browser ──► Caddy/Nginx TLS ──►    │  Express 4 + tRPC 11                        │
                                    │    ├── Wazuh Proxy (113 procedures)          │
                                    │    ├── Indexer Proxy (OpenSearch)             │
                                    │    ├── Agentic Pipeline (Triage → Hypothesis)│
                                    │    ├── Knowledge Graph ETL                   │
                                    │    ├── Drift Analytics Engine                │
                                    │    └── Parameter Broker (validation layer)   │
                                    │                                              │
                                    │  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
                                    │  │ Wazuh API │  │ Indexer   │  │ MySQL 8   │  │
                                    │  │ :55000    │  │ :9200     │  │ (Drizzle) │  │
                                    │  └──────────┘  └──────────┘  └───────────┘  │
                                    │                                              │
                                    │  Optional:                                   │
                                    │  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
                                    │  │ LLM/GPU  │  │ OTX API  │  │ Splunk ES │  │
                                    │  │ :8080    │  │ (cloud)  │  │ :8089     │  │
                                    │  └──────────┘  └──────────┘  └───────────┘  │
                                    └─────────────────────────────────────────────┘
```

The application acts as a **strict read-only proxy** to Wazuh. All API calls flow through the backend, which enforces authentication, rate limiting, parameter validation (via the Parameter Broker), and field filtering. No Wazuh tokens are ever exposed to the browser. Every response includes broker warnings when parameters are adjusted, giving analysts full transparency into what the backend modified.

---

## Feature Map

### Operations

| Page | Route | Description |
|---|---|---|
| **SOC Console** | `/` | Real-time KPI cards (Total Agents, Active, Alerts 24h, Critical Events, EPS), threat trend area charts, top talkers pie chart, MITRE tactic distribution bars, recent critical alerts table, manager daemon status, agent overview breakdown |
| **Fleet Command** | `/agents` | Agent health monitoring with OS distribution donut, version bar chart, status KPIs, agent search/filter with multi-column sort, connection stability timeline |
| **Agent Detail** | `/fleet/:agentId` | Per-agent drill-down with 6 tabs: Overview, Vulnerabilities, Compliance, FIM, Config & Stats (agentConfig, agentStats, agentDaemonStats, agentKey with disclosure policy), Related Investigations |
| **Agent Compare** | `/fleet-compare` | Side-by-side agent comparison for configuration drift detection |
| **Threat Intel** | `/threat-intel` | AlienVault OTX integration — subscribed pulses, IOC search, pulse detail with indicators |

### Detection

| Page | Route | Description |
|---|---|---|
| **SIEM Events** | `/siem` | Full-text search across Wazuh Indexer (`wazuh-alerts-*`) with field-level filtering, time range presets, raw JSON view |
| **Alerts Timeline** | `/alerts` | Dense SOC-grade alert table with severity heatmap (hour x day-of-week), rule level distribution, top firing rules, alert detail panel with raw JSON, time range selector |
| **Vulnerabilities** | `/vulnerabilities` | CVE tracking with severity distribution donut, CVSS score badges, NVD deep-links, affected agent counts, status breakdown (active/fixed/pending), top exploited packages |
| **MITRE ATT&CK** | `/mitre` | Full 14-column tactic x technique matrix (ATT&CK navigator style), detection coverage %, technique drill-down with alert counts, tactic distribution over time, threat group cards |
| **Threat Hunting** | `/hunting` | Query builder for Wazuh Indexer with saved searches, IOC type filtering, agent scoping, time range controls |
| **Ruleset Explorer** | `/rules` | Browse Wazuh rules and decoders — searchable tables with file content viewer, rule group filtering, decoder parent chains |

### Posture

| Page | Route | Description |
|---|---|---|
| **Compliance** | `/compliance` | Framework selector tabs (PCI DSS, NIST 800-53, HIPAA, GDPR, TSC), compliance score gauges, SCA pass/fail/not-applicable charts, failed checks table with remediation guidance |
| **File Integrity** | `/fim` | File change timeline, modified files table with before/after hash comparison, file permission tracking, agent-level scan status cards, syscheck event detail with raw JSON |
| **IT Hygiene** | `/hygiene` | System inventory across 8 tabs: Packages, Network (ports, interfaces, addresses, protocols), Processes, Browser Extensions, Services, Users, Groups, Hotfixes |
| **Fleet Inventory** | `/fleet-inventory` | Aggregated fleet-wide inventory with experimental syscollector endpoints for hardware, OS, packages, ports, processes |
| **Drift Analytics** | `/drift-analytics` | Baseline comparison engine — create snapshots, schedule drift checks, anomaly detection with suppression rules, notification history, agent volatility tracking |

### System

| Page | Route | Description |
|---|---|---|
| **Cluster Health** | `/cluster` | Cluster topology (master + workers), daemon status cards, hourly ingestion chart, node-level stats/logs/configuration, manager logs with level/tag filters, manager configuration section viewer |
| **System Status** | `/status` | Wazuh API connectivity diagnostics, broker health, endpoint latency, Wazuh API Intelligence panels (managerVersionCheck, securityConfig, apiInfo) |
| **Security Explorer** | `/security` | Wazuh RBAC inspection — roles, policies, users, rules, resources, actions, current user policies |

### Intelligence (Agentic)

| Page | Route | Description |
|---|---|---|
| **Security Analyst** | `/analyst` | LLM-powered chat with Wazuh context injection, knowledge graph awareness, alert enrichment, conversation history |
| **Knowledge Graph** | `/graph` | Interactive API knowledge graph — ETL sync, resource/endpoint visualization, risk path analysis, endpoint table view, multi-select operations |
| **Investigations** | `/investigations` | Investigation session management — create, list, add notes, link to alerts/agents/CVEs |
| **Data Pipeline** | `/pipeline` | Full agentic pipeline orchestration — triage, correlation, hypothesis with state machine visualization |
| **Alert Queue** | `/alert-queue` | Analyst work queue — enqueue alerts for triage, priority sorting, bulk operations |
| **Auto-Queue Rules** | `/auto-queue-rules` | Rule-based automatic alert queuing — severity thresholds, rule ID matching, agent patterns, MITRE technique filters, rate limiting |
| **Triage Pipeline** | `/triage` | Step-by-step triage execution with LLM-generated analysis, evidence collection, severity assessment |
| **Living Cases** | `/living-cases` | Evolving investigation cases that accumulate evidence across triage/correlation/hypothesis stages |
| **Response Actions** | `/response-actions` | Proposed response actions with approval workflow, urgency levels, playbook references, evidence basis |
| **Pipeline Inspector** | `/pipeline-inspector` | Debug view into pipeline run state — stage timings, token usage, error traces |
| **Feedback Analytics** | `/feedback-analytics` | Analyst feedback on LLM outputs — accuracy ratings, correction tracking, model performance metrics |

### Admin

| Page | Route | Description |
|---|---|---|
| **Token Usage** | `/admin/token-usage` | LLM token consumption tracking per user, per session type, cost estimation |
| **User Management** | `/admin/users` | Admin-only user list with role management (admin/user), account status |
| **Connection Settings** | `/admin/settings` | Runtime configuration for Wazuh host, port, credentials, Indexer settings, OTX API key, Splunk HEC |
| **Access Audit** | `/admin/audit` | Sensitive access audit trail — who accessed agent keys and when, with date-range filtering and resource type filters |

### Tools

| Page | Route | Description |
|---|---|---|
| **Analyst Notes** | `/notes` | Database-backed investigation notes attached to alerts, agents, or CVEs with severity tagging and resolve/delete workflow |

---

## Agentic Investigation Pipeline

The application includes a multi-stage LLM-powered investigation pipeline that automates alert triage and correlation. The pipeline is **opt-in** (requires `LLM_ENABLED=true` and a configured LLM endpoint) and operates in a supervised mode where analysts review and approve each stage.

```
Alert Queue ──► Triage Agent ──► Correlation Agent ──► Hypothesis Agent
                    │                   │                      │
                    ▼                   ▼                      ▼
              Severity Assessment  Cross-alert linking    Response Action
              Evidence Collection  OTX IOC enrichment     Proposals
              MITRE Mapping        Timeline construction   Living Case Update
```

**Triage Agent** analyzes a single alert with full Wazuh context (agent info, recent alerts, syscollector data). It produces a structured triage object with severity assessment, affected assets, MITRE mappings, and recommended next steps.

**Correlation Agent** links related triage objects across time and agents. It queries OTX for IOC enrichment and builds a correlation bundle with timeline, common indicators, and attack chain reconstruction.

**Hypothesis Agent** generates investigative hypotheses from correlation bundles. It proposes response actions with urgency levels, playbook references, and evidence basis. Actions are materialized into the `response_actions` table with partial-failure signaling — if some actions fail to persist, the pipeline reports exactly which succeeded and which failed rather than silently swallowing errors.

**Resume Pipeline** allows any failed stage to be resumed from the last successful checkpoint without re-running completed stages.

**Living Cases** accumulate evidence, triage objects, correlation bundles, and response actions over time as an investigation evolves.

---

## Integrations

| Integration | Purpose | Required |
|---|---|---|
| **Wazuh Manager API** (`:55000`) | Agent, alert, vulnerability, FIM, compliance, cluster, and ruleset data | Recommended |
| **Wazuh Indexer** (`:9200`) | Full-text alert search, SIEM events, threat hunting queries | Recommended |
| **MySQL 8** / TiDB | Analyst notes, investigation sessions, pipeline state, baselines, knowledge graph, audit trail | Required |
| **AlienVault OTX** | Threat intelligence — pulse subscriptions, IOC search, indicator enrichment | Optional |
| **Splunk Enterprise Security** | Alert forwarding via HEC for ticket creation workflows | Optional |
| **Self-hosted LLM** | Agentic pipeline (triage, correlation, hypothesis) — any OpenAI-compatible API (Ollama, vLLM, TGI, llama.cpp) | Optional |

---

## Security Model

**Read-Only by Default.** Only GET endpoints are proxied unless explicitly gated behind feature flags and named roles. No agent deletion, no rule modification, no active response triggers.

**Fail-Closed Architecture.** If an endpoint errors or auth fails, the UI shows a glass-panel error state. No blind retries, no partial data assumptions. The agentKey reveal flow is fail-closed: if the audit insert fails, the key is refused with "Audit logging unavailable; cannot reveal key."

**Server-Side Token Handling.** Wazuh API tokens are stored server-side only, never logged, never embedded in frontend code. The browser communicates exclusively through the tRPC layer.

**Parameter Broker.** Every Wazuh API call passes through a parameter broker that validates, caps, and normalizes parameters before forwarding. When parameters are adjusted, the response includes `_brokerWarnings` with human-readable diffs (e.g., "limit capped to 500; sort normalized to +name"). The UI surfaces these as inline amber banners on every data panel.

**Sensitive Access Audit.** Privileged operations (agent key reveal, copy-to-clipboard) are logged to the `sensitive_access_audit` table with who, when, which agent, and what action. The audit trail is viewable by admins at `/admin/audit` with date-range and resource type filtering.

**RBAC Gating.** Admin-only operations (user management, sensitive access audit, agent key reveal) are gated by `adminProcedure` which checks `ctx.user.role === 'admin'`. Non-admins receive a `FORBIDDEN` error.

**Rate Limiting.** Per-endpoint rate limits prevent Wazuh API overload. The Indexer proxy has separate rate limit groups for search vs. status operations.

**Non-Root Container.** The Docker image runs as an unprivileged user with tini as PID 1.

**Forensic Data Integrity.** Timestamps, agent IDs, rule IDs, decoder names, and raw JSON are preserved as-is. Every data panel includes a "Raw JSON" viewer for forensic inspection.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS 4, Recharts, shadcn/ui, Framer Motion |
| Backend | Express 4, tRPC 11, Drizzle ORM, SuperJSON |
| Database | MySQL 8 (TiDB compatible) — 38 tables |
| Auth | Local JWT (self-hosted) or Manus OAuth (cloud) |
| LLM | Any OpenAI-compatible API — Nemotron 3 Nano default, configurable |
| Threat Intel | AlienVault OTX v2 API |
| SIEM Forward | Splunk HEC (optional) |
| Container | Docker multi-stage, Node 22 slim, tini init |
| CI/CD | GitHub Actions, GHCR, Dependabot |
| Proxy | Caddy (auto TLS) or Nginx (manual TLS) |
| Testing | Vitest — 73 test files, 604 suites, 2208 tests |

---

## Quick Start

### Docker (Recommended)

```bash
git clone https://github.com/cvalentine99/Dang-.git && cd Dang-
cp env.docker.template .env
# Edit .env with your Wazuh credentials and JWT_SECRET
./deploy.sh                    # HTTP on port 3000
./deploy.sh --proxy caddy      # HTTPS with auto Let's Encrypt
./deploy.sh --proxy nginx      # HTTPS with your own certs
```

Or pull the pre-built image:

```bash
docker pull ghcr.io/cvalentine99/dang-siem:latest
```

### With GPU (for local LLM inference)

```bash
./deploy.sh --gpu              # Adds llama.cpp server with Nemotron 3 Nano
```

### Development

```bash
git clone https://github.com/cvalentine99/Dang-.git && cd Dang-
pnpm install
# Set environment variables (see env.docker.template for reference)
pnpm dev                       # Starts Vite + Express on port 3000
pnpm test                      # Runs full Vitest suite
```

See **[DOCKER.md](DOCKER.md)** for full deployment documentation including environment variables, HTTPS proxy setup, health checks, GPU overlay, and CI/CD pipeline details.

---

## Environment Variables

### Required

| Variable | Description |
|---|---|
| `JWT_SECRET` | Session signing key — generate with `openssl rand -hex 32` |
| `DATABASE_URL` | MySQL connection string (auto-configured in Docker) |

### Authentication

| Variable | Description | Default |
|---|---|---|
| `LOCAL_ADMIN_USER` | Seeded admin username | *(first registrant becomes admin)* |
| `LOCAL_ADMIN_PASS` | Seeded admin password | *(none)* |

### Wazuh Manager API

| Variable | Description | Default |
|---|---|---|
| `WAZUH_HOST` | Wazuh Manager hostname or IP | `localhost` |
| `WAZUH_PORT` | Wazuh Manager API port | `55000` |
| `WAZUH_USER` | Wazuh API username | `wazuh-wui` |
| `WAZUH_PASS` | Wazuh API password | — |

### Wazuh Indexer (OpenSearch)

| Variable | Description | Default |
|---|---|---|
| `WAZUH_INDEXER_HOST` | Indexer hostname | `localhost` |
| `WAZUH_INDEXER_PORT` | Indexer port | `9200` |
| `WAZUH_INDEXER_USER` | Indexer username | `admin` |
| `WAZUH_INDEXER_PASS` | Indexer password | — |
| `WAZUH_INDEXER_PROTOCOL` | `http` or `https` | `https` |

### Optional Integrations

| Variable | Description |
|---|---|
| `OTX_API_KEY` | AlienVault OTX API key for threat intelligence |
| `SPLUNK_HOST` | Splunk Enterprise Security hostname |
| `SPLUNK_PORT` | Splunk management port (default: `8089`) |
| `SPLUNK_HEC_PORT` | Splunk HTTP Event Collector port (default: `8088`) |
| `SPLUNK_HEC_TOKEN` | Splunk HEC authentication token |
| `LLM_ENABLED` | Enable agentic pipeline (`true`/`false`, default: `false`) |
| `LLM_HOST` | LLM endpoint hostname (any OpenAI-compatible API) |
| `LLM_PORT` | LLM endpoint port (default: `8080`) |
| `LLM_MODEL` | Model identifier (default: `unsloth/Nemotron-3-Nano-30B-A3B-GGUF`) |

### Branding

| Variable | Description |
|---|---|
| `VITE_APP_TITLE` | Application title (default: `Dang! SIEM`) |
| `VITE_APP_LOGO` | Custom logo URL |

---

## Database Schema

The application uses 38 MySQL tables managed by Drizzle ORM with migration files in `drizzle/`. Key table groups:

| Group | Tables | Purpose |
|---|---|---|
| **Auth** | `users` | User accounts with role-based access (admin/user) |
| **Notes** | `analyst_notes`, `analyst_notes_v2`, `investigation_notes`, `investigation_sessions` | Analyst investigation notes and session tracking |
| **Pipeline** | `pipeline_runs`, `triage_objects`, `correlation_bundles`, `response_actions`, `response_action_audit`, `living_case_state`, `ticket_artifacts` | Agentic investigation pipeline state |
| **Queue** | `alert_queue`, `auto_queue_rules` | Alert work queue and automatic queuing rules |
| **Baselines** | `config_baselines`, `baseline_schedules`, `drift_snapshots`, `drift_anomalies`, `anomaly_suppression_rules`, `drift_notification_history` | Configuration drift detection |
| **Knowledge Graph** | `kg_endpoints`, `kg_resources`, `kg_parameters`, `kg_fields`, `kg_responses`, `kg_auth_methods`, `kg_error_patterns`, `kg_use_cases`, `kg_indices`, `kg_answer_provenance`, `kg_trust_history`, `kg_sync_status` | API knowledge graph for the Security Analyst |
| **LLM** | `llm_usage`, `rag_sessions` | Token usage tracking and RAG session history |
| **Admin** | `connection_settings`, `sensitive_access_audit`, `saved_searches`, `saved_hunts` | Runtime configuration, audit trail, saved queries |

---

## Testing

The test suite uses **Vitest** with 73 test files covering backend procedures, parameter broker validation, UI wiring parity, security auth, and agentic pipeline stages.

```bash
pnpm test                      # Run full suite
pnpm test -- --reporter=json   # JSON output for CI
```

**Current status:** 604 suites, 2208 tests, all passing.

Key test categories:

| Category | Files | Coverage |
|---|---|---|
| Wazuh Proxy | `paramBroker.test.ts`, `paramPropagation.test.ts`, `brokerWarnings.test.ts`, `regressionFixture.test.ts` | Parameter validation, broker warnings, regression fixtures |
| UI Wiring | `uiWiring.test.ts`, `uiParamParity.test.ts`, `configStatsTab.test.ts`, `trustDocSprint.test.ts` | Every UI callsite maps to a real procedure, parameter shapes match |
| Security | `securityAuth.test.ts`, `perUserRateLimit.test.ts` | Auth enforcement, rate limiting, RBAC gating |
| Agentic Pipeline | `triageAgent.test.ts`, `correlationAgent.test.ts`, `hypothesisAgent.test.ts`, `resumePipelineHelper.test.ts`, `stateMachine.test.ts` | Pipeline stages, resume from failure, partial-failure signaling |
| Knowledge Graph | `kg-hydration.test.ts`, `agentIntrospection.test.ts`, `agenticGates.test.ts` | Graph ETL, introspection, capability gating |
| Drift Analytics | `readinessService.test.ts` | Baseline comparison, anomaly detection |
| OTX | `otxRouter.test.ts` | Preflight ping with `skipIf(!canReachOtx)`, API validation, pulse queries |

CI artifacts are generated from physics: `vitest.json` is produced by the test runner, then `scripts/generate-ci-proof.mjs` reads it to produce `docs/ci-proof-artifact.md`. The UI parity audit (`scripts/audit-ui-param-parity.mjs`) verifies that every frontend `trpc.wazuh.*` callsite maps to a real backend procedure with matching parameter shapes. Both scripts are deterministic — the proof artifact numbers always match the raw test output.

---

## Design Language

The UI follows the **Amethyst Nexus** dark-only theme, purpose-built for SOC environments:

- **Glass-morphism panels** with `backdrop-blur` and semi-transparent backgrounds
- **Purple/violet primary accents** in OKLCH color space
- **Threat-level semantic colors**: Critical (red), High (orange), Medium (amber), Low (blue), Info (slate)
- **Fonts**: Space Grotesk (headings), Inter (UI), JetBrains Mono (hashes, agent IDs, JSON, rule IDs)
- **Layout**: Optimized for ultrawide SOC monitors (up to 2400px), dense but readable dashboards
- **No bright colors, no flat white surfaces** — every surface is a dark glass panel

All data panels include **Raw JSON viewers** for forensic inspection. Every panel that communicates with the Wazuh API shows **BrokerWarnings** when parameters are adjusted. All data tables support **CSV/JSON export** for offline compliance reporting.

---

## Backend API Surface

The Wazuh proxy router exposes **113 tRPC procedures** organized by domain:

| Domain | Count | Examples |
|---|---|---|
| Agents | 22 | `agents`, `agentById`, `agentSummaryStatus`, `agentOverview`, `agentKey`, `agentConfig`, `agentStats`, `agentDaemonStats` |
| Syscollector | 18 | `agentPackages`, `agentPorts`, `agentProcesses`, `agentServices`, `agentUsers`, `agentHardware`, `agentOs`, `agentBrowserExtensions` |
| Manager | 12 | `managerInfo`, `managerStatus`, `managerLogs`, `managerConfiguration`, `managerStats`, `managerVersionCheck` |
| Cluster | 16 | `clusterStatus`, `clusterNodes`, `clusterHealthcheck`, `clusterNodeStats`, `clusterNodeLogs`, `clusterNodeConfiguration` |
| Rules/Decoders | 10 | `rules`, `ruleGroups`, `ruleFileContent`, `decoders`, `decoderFiles`, `lists` |
| MITRE | 7 | `mitreTactics`, `mitreTechniques`, `mitreGroups`, `mitreSoftware`, `mitreMitigations`, `mitreReferences` |
| SCA/FIM | 6 | `scaPolicies`, `scaChecks`, `syscheckFiles`, `syscheckLastScan`, `rootcheckResults` |
| Security RBAC | 9 | `securityRoles`, `securityPolicies`, `securityUsers`, `securityConfig`, `securityCurrentUser` |
| Experimental | 8 | `expSyscollectorPackages`, `expSyscollectorPorts`, `expSyscollectorProcesses`, `expSyscollectorHardware` |
| System | 5 | `status`, `isConfigured`, `apiInfo`, `taskStatus`, `agentsUninstallPermission` |

Beyond the Wazuh proxy, the application registers **28 sub-routers** covering: `indexer` (Wazuh Indexer search), `otx` (AlienVault OTX), `splunk` (Splunk HEC), `graph` (Knowledge Graph), `pipeline` (Agentic Pipeline), `responseActions`, `hunt` (Threat Hunting), `alertQueue`, `autoQueue`, `baselines`, `driftAnalytics`, `anomalies`, `suppression`, `notificationHistory`, `export`, `notes`, `savedSearches`, `hybridrag`, `llm`, `enhancedLLM`, `readiness`, `sensitiveAccess`, `adminUsers`, `connectionSettings`, `localAuth`, and `baselineSchedules`.

---

## Project Structure

```
client/
  src/
    pages/                 ← 35+ page components
    components/            ← Shared UI (GlassPanel, ThreatBadge, StatCard, BrokerWarnings,
                              RawJsonViewer, PageHeader, RefreshControl, WazuhGuard)
    contexts/              ← React contexts
    hooks/                 ← Custom hooks
    lib/trpc.ts            ← tRPC client binding
    App.tsx                ← Routes & layout (35+ routes)
    index.css              ← Amethyst Nexus theme tokens

server/
  wazuh/
    wazuhClient.ts         ← Wazuh API proxy with auth, rate limiting
    wazuhRouter.ts         ← 113 tRPC procedures
    paramBroker.ts         ← Parameter validation and normalization
  agenticPipeline/         ← Triage, Correlation, Hypothesis agents + resume helper
  agenticReadiness/        ← Pipeline readiness checks
  graph/                   ← Knowledge Graph ETL and query
  baselines/               ← Drift analytics engine (baselines, schedules, anomalies,
                              suppression, notifications, export)
  indexer/                 ← Wazuh Indexer (OpenSearch) proxy
  otx/                     ← AlienVault OTX client
  hunt/                    ← Threat hunting query builder
  alertQueue/              ← Alert work queue + auto-queue rules
  admin/                   ← User management, connection settings, sensitive access audit
  splunk/                  ← Splunk HEC forwarding
  enhancedLLM/             ← LLM with tool use and context injection
  hybridrag/               ← RAG with Wazuh telemetry context
  llm/                     ← Base LLM router
  notes/                   ← Analyst notes CRUD
  localAuth/               ← JWT username/password auth (self-hosted mode)
  savedSearches/           ← Saved search persistence
  routers.ts               ← 28 sub-routers registered

drizzle/
  schema.ts                ← 38 tables
  0001-0013_*.sql          ← Migration files
  meta/_journal.json       ← Migration journal

docs/
  ci-proof-artifact.md     ← Test results generated from vitest.json
  gap-closure-matrix.md    ← Wazuh API coverage tracking
  ui-param-parity-report.md ← UI <-> backend parameter parity audit

scripts/
  generate-ci-proof.mjs    ← vitest.json -> ci-proof-artifact.md
  audit-ui-param-parity.mjs ← UI callsite <-> procedure parity checker

proxy/
  caddy/                   ← Caddy reverse proxy config
  nginx/                   ← Nginx reverse proxy config + SSL

docker-compose.yml         ← Base compose (app + MySQL)
docker-compose.caddy.yml   ← HTTPS with Caddy overlay
docker-compose.nginx.yml   ← HTTPS with Nginx overlay
docker-compose.gpu.yml     ← GPU LLM overlay (llama.cpp)
deploy.sh                  ← One-command deployment script
```

---

## License

MIT
