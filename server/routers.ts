import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { wazuhRouter } from "./wazuh/wazuhRouter";
import { hybridragRouter } from "./hybridrag/hybridragRouter";
import { savedSearchesRouter } from "./savedSearches/savedSearchesRouter";
import { baselinesRouter } from "./baselines/baselinesRouter";
import { baselineSchedulesRouter } from "./baselines/baselineSchedulesRouter";
import { indexerRouter } from "./indexer/indexerRouter";
import { otxRouter } from "./otx/otxRouter";
import { notesRouter } from "./notes/notesRouter";
import { localAuthRouter } from "./localAuth/localAuthRouter";
import { adminUsersRouter } from "./admin/adminUsersRouter";
import { graphRouter } from "./graph/graphRouter";
import { connectionSettingsRouter } from "./admin/connectionSettingsRouter";
import { llmRouter } from "./llm/llmRouter";
import { alertQueueRouter } from "./alertQueue/alertQueueRouter";
import { splunkRouter } from "./splunk/splunkRouter";
import { autoQueueRouter } from "./alertQueue/autoQueueRouter";
import { huntRouter } from "./hunt/huntRouter";
import { pipelineRouter } from "./agenticPipeline/pipelineRouter";
import { responseActionsRouter } from "./agenticPipeline/responseActionsRouter";
import { driftAnalyticsRouter } from "./baselines/driftAnalyticsRouter";
import { anomalyRouter } from "./baselines/anomalyRouter";
import { notificationHistoryRouter } from "./baselines/notificationHistoryRouter";
import { suppressionRouter } from "./baselines/suppressionRouter";
import { exportRouter } from "./baselines/exportRouter";
import { enhancedLLMRouter } from "./enhancedLLM/enhancedLLMRouter";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => {
      if (!opts.ctx.user) return null;
      // Never expose passwordHash to the client
      const { passwordHash, ...safeUser } = opts.ctx.user;
      return safeUser;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // Wazuh read-only proxy — all GET, no mutations
  wazuh: wazuhRouter,

  // HybridRAG agentic assistant + analyst notes
  hybridrag: hybridragRouter,

  // Saved search queries (SIEM + Threat Hunting)
  savedSearches: savedSearchesRouter,

  // Configuration baselines for drift detection
  baselines: baselinesRouter,

  // Scheduled baseline auto-capture
  baselineSchedules: baselineSchedulesRouter,

  // Wazuh Indexer (OpenSearch/Elasticsearch) — read-only queries
  indexer: indexerRouter,

  // AlienVault OTX Threat Intelligence — read-only
  otx: otxRouter,

  // Analyst Notes v2 — local-only entity-linked notes
  notes: notesRouter,

  // Local auth for Docker self-hosted mode
  localAuth: localAuthRouter,

  // Admin user management (admin-only)
  adminUsers: adminUsersRouter,

  // Knowledge Graph + HybridRAG Agentic Pipeline
  graph: graphRouter,
  // Connection Settings (admin-only)
  connectionSettings: connectionSettingsRouter,

  // LLM health monitoring and token usage tracking
  llm: llmRouter,

  // Alert-to-Walter queue (10-deep, human-initiated analysis)
  alertQueue: alertQueueRouter,

  // Splunk ES Mission Control — HEC ticket creation
  splunk: splunkRouter,

  // Auto-queue rules — automatic alert-to-Walter routing
  autoQueue: autoQueueRouter,

  // Threat Hunting — server-side multi-source IOC correlation
  hunt: huntRouter,

  // Agentic SOC Pipeline — structured triage, correlation, case management
  pipeline: pipelineRouter,

  // Response Actions — first-class, structured, queryable, stateful, auditable
  responseActions: responseActionsRouter,

  // Drift Analytics — read-only aggregated drift trend data
  driftAnalytics: driftAnalyticsRouter,

  // Drift Anomaly Detection — statistical outlier flagging
  anomalies: anomalyRouter,

  // Drift Notification History — audit trail for all drift/anomaly notifications
  notificationHistory: notificationHistoryRouter,

  // Anomaly Suppression Rules — maintenance window alert muting
  suppression: suppressionRouter,

  // Drift Report Export — CSV/PDF export for compliance reporting
  export: exportRouter,

  // Enhanced LLM — Nemotron-3 Nano session-type-aware chat, alert classification, DGX health
  enhancedLLM: enhancedLLMRouter,
});

export type AppRouter = typeof appRouter;
