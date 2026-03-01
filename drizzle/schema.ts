import {
  boolean,
  index,
  int,
  bigint,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  float,
} from "drizzle-orm/mysql-core";

import type {
  TriageObject,
  CorrelationBundle,
  LivingCaseObject,
} from "../shared/agenticSchemas";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  /** Bcrypt hash for local auth (null for OAuth-only users) */
  passwordHash: varchar("passwordHash", { length: 256 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  /** Whether the user account is disabled (blocked from login) */
  isDisabled: int("isDisabled").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Analyst notes — local-only, never written back to Wazuh.
 * Supports linking notes to agent IDs, rule IDs, CVE IDs, or free-form tags.
 */
export const analystNotes = mysqlTable("analyst_notes", {
  id: int("id").autoincrement().primaryKey(),
  /** Title / headline of the note */
  title: varchar("title", { length: 512 }).notNull(),
  /** Markdown body */
  content: text("content").notNull(),
  /** Severity classification chosen by analyst */
  severity: mysqlEnum("severity", ["critical", "high", "medium", "low", "info"])
    .default("info")
    .notNull(),
  /** Wazuh agent ID this note relates to (optional) */
  agentId: varchar("agentId", { length: 32 }),
  /** Wazuh rule ID this note relates to (optional) */
  ruleId: varchar("ruleId", { length: 32 }),
  /** CVE identifier (optional) */
  cveId: varchar("cveId", { length: 32 }),
  /** Arbitrary JSON tags for flexible categorization */
  tags: json("tags").$type<string[]>(),
  /** Whether the note has been resolved/closed */
  resolved: int("resolved").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AnalystNote = typeof analystNotes.$inferSelect;
export type InsertAnalystNote = typeof analystNotes.$inferInsert;

/**
 * HybridRAG chat sessions — stores conversation history for the AI assistant.
 */
export const ragSessions = mysqlTable("rag_sessions", {
  id: int("id").autoincrement().primaryKey(),
  /** Session identifier for grouping messages */
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  /** Role: user | assistant | system */
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  /** Message content */
  content: text("content").notNull(),
  /** Optional context snapshot injected for this message */
  contextSnapshot: json("contextSnapshot").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RagSession = typeof ragSessions.$inferSelect;
export type InsertRagSession = typeof ragSessions.$inferInsert;

/**
 * Saved search queries — persists SIEM and Threat Hunting search filters.
 */
export const savedSearches = mysqlTable("saved_searches", {
  id: int("id").autoincrement().primaryKey(),
  /** User who saved this search */
  userId: int("userId").notNull(),
  /** Human-readable name for the saved search */
  name: varchar("name", { length: 256 }).notNull(),
  /** Type of search: 'siem' or 'hunting' */
  searchType: mysqlEnum("searchType", ["siem", "hunting"]).notNull(),
  /** Serialized filter state (JSON) */
  filters: json("filters").$type<Record<string, unknown>>().notNull(),
  /** Optional description */
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SavedSearch = typeof savedSearches.$inferSelect;
export type InsertSavedSearch = typeof savedSearches.$inferInsert;

/**
 * Configuration baselines — "known-good" snapshots of agent packages, services, and users.
 * Used for drift detection over time. Never written back to Wazuh.
 */
export const configBaselines = mysqlTable("config_baselines", {
  id: int("id").autoincrement().primaryKey(),
  /** User who created this baseline */
  userId: int("userId").notNull(),
  /** If auto-captured, the schedule that triggered this baseline */
  scheduleId: int("scheduleId"),
  /** Human-readable name for the baseline */
  name: varchar("name", { length: 256 }).notNull(),
  /** Optional description */
  description: text("description"),
  /** Comma-separated agent IDs included in this baseline */
  agentIds: json("agentIds").$type<string[]>().notNull(),
  /** Full snapshot: { packages: Record<agentId, pkg[]>, services: Record<agentId, svc[]>, users: Record<agentId, usr[]> } */
  snapshotData: json("snapshotData").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ConfigBaseline = typeof configBaselines.$inferSelect;
export type InsertConfigBaseline = typeof configBaselines.$inferInsert;

/**
 * Scheduled baseline auto-capture — cron-like schedules that automatically
 * snapshot agent configuration at defined intervals.
 * Each execution creates a row in config_baselines with a scheduleId reference.
 */
export const BASELINE_FREQUENCIES = ["hourly", "every_6h", "every_12h", "daily", "weekly", "monthly"] as const;
export type BaselineFrequency = (typeof BASELINE_FREQUENCIES)[number];

export const baselineSchedules = mysqlTable("baseline_schedules", {
  id: int("id").autoincrement().primaryKey(),
  /** User who created this schedule */
  userId: int("userId").notNull(),
  /** Human-readable schedule name */
  name: varchar("name", { length: 256 }).notNull(),
  /** Agent IDs to capture (JSON array of strings) */
  agentIds: json("agentIds").$type<string[]>().notNull(),
  /** Capture frequency */
  frequency: varchar("frequency", { length: 32 }).$type<BaselineFrequency>().notNull(),
  /** Whether the schedule is active */
  enabled: boolean("enabled").default(true).notNull(),
  /** Last successful execution time */
  lastRunAt: timestamp("lastRunAt"),
  /** Next scheduled execution time */
  nextRunAt: timestamp("nextRunAt").notNull(),
  /** Max baselines to retain per schedule (older ones auto-pruned) */
  retentionCount: int("retentionCount").default(10).notNull(),
  /** Last error message if the most recent run failed */
  lastError: text("lastError"),
  /** Total successful runs */
  successCount: int("successCount").default(0).notNull(),
  /** Total failed runs */
  failureCount: int("failureCount").default(0).notNull(),
  /** Drift threshold percentage (0 = disabled, 1-100 = notify when drift exceeds this %) */
  driftThreshold: int("driftThreshold").default(0).notNull(),
  /** Whether to send owner notification when drift exceeds threshold */
  notifyOnDrift: boolean("notifyOnDrift").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BaselineSchedule = typeof baselineSchedules.$inferSelect;
export type InsertBaselineSchedule = typeof baselineSchedules.$inferInsert;

/**
 * Drift Snapshots — Persisted drift analysis results from baseline comparisons.
 * Created after each scheduled baseline capture when a previous baseline exists.
 * Powers the Drift Analytics dashboard with historical trend data.
 */
export const driftSnapshots = mysqlTable("drift_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  /** Schedule that produced this drift snapshot */
  scheduleId: int("scheduleId").notNull(),
  /** User who owns the schedule */
  userId: int("userId").notNull(),
  /** ID of the new baseline (the "current" in the comparison) */
  baselineId: int("baselineId").notNull(),
  /** ID of the previous baseline used for comparison */
  previousBaselineId: int("previousBaselineId").notNull(),
  /** Overall drift percentage (0-100, 2 decimal places) */
  driftPercent: float("driftPercent").default(0).notNull(),
  /** Total number of changed items (added + removed + changed) */
  driftCount: int("driftCount").default(0).notNull(),
  /** Total items compared (max of previous, current) */
  totalItems: int("totalItems").default(0).notNull(),
  /** Per-category breakdown: { packages: { added, removed, changed }, services: {...}, users: {...} } */
  byCategory: json("byCategory").$type<{
    packages: { added: number; removed: number; changed: number };
    services: { added: number; removed: number; changed: number };
    users: { added: number; removed: number; changed: number };
  }>().notNull(),
  /** Per-agent drift counts: { "001": { driftCount, totalItems }, "002": {...} } */
  byAgent: json("byAgent").$type<Record<string, { driftCount: number; totalItems: number }>>().notNull(),
  /** Agent IDs included in this comparison */
  agentIds: json("agentIds").$type<string[]>().notNull(),
  /** Whether a notification was sent for this drift event */
  notificationSent: boolean("notificationSent").default(false).notNull(),
  /** Top drift items (max 20) for quick display without loading full baselines */
  topDriftItems: json("topDriftItems").$type<Array<{
    category: string;
    agentId: string;
    name: string;
    changeType: string;
    previousValue?: string;
    currentValue?: string;
  }>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DriftSnapshot = typeof driftSnapshots.$inferSelect;
export type InsertDriftSnapshot = typeof driftSnapshots.$inferInsert;

/**
 * Drift anomalies — Statistical outliers detected by the anomaly engine.
 *
 * When a drift snapshot's driftPercent exceeds 2 standard deviations from
 * the rolling average for that schedule, an anomaly record is created.
 * Anomalies are surfaced in the SOC Console and Drift Analytics dashboard.
 */
export const driftAnomalies = mysqlTable("drift_anomalies", {
  id: int("id").autoincrement().primaryKey(),
  /** The drift snapshot that triggered this anomaly */
  snapshotId: int("snapshotId").notNull(),
  /** Schedule that produced the anomalous drift */
  scheduleId: int("scheduleId").notNull(),
  /** User who owns the schedule */
  userId: int("userId").notNull(),
  /** The observed drift percentage that triggered the anomaly */
  driftPercent: float("driftPercent").notNull(),
  /** Rolling average drift % at the time of detection (window of N previous snapshots) */
  rollingAvg: float("rollingAvg").notNull(),
  /** Rolling standard deviation at the time of detection */
  rollingStdDev: float("rollingStdDev").notNull(),
  /** Z-score: (driftPercent - rollingAvg) / rollingStdDev */
  zScore: float("zScore").notNull(),
  /** Sigma threshold used for detection (default 2.0) */
  sigmaThreshold: float("sigmaThreshold").default(2).notNull(),
  /** Computed severity: critical (z>=4), high (z>=3), medium (z>=2) */
  severity: mysqlEnum("severity", ["critical", "high", "medium"]).notNull(),
  /** Whether the anomaly has been acknowledged by an analyst */
  acknowledged: boolean("acknowledged").default(false).notNull(),
  /** Optional analyst note when acknowledging */
  acknowledgeNote: text("acknowledgeNote"),
  /** Timestamp when acknowledged */
  acknowledgedAt: timestamp("acknowledgedAt"),
  /** Whether a notification was sent for this anomaly */
  notificationSent: boolean("notificationSent").default(false).notNull(),
  /** Schedule name at time of detection (denormalized for fast display) */
  scheduleName: varchar("scheduleName", { length: 256 }).default("").notNull(),
  /** Agent IDs involved in this anomaly */
  agentIds: json("agentIds").$type<string[]>().notNull(),
  /** Per-category breakdown at time of anomaly */
  byCategory: json("byCategory").$type<{
    packages: { added: number; removed: number; changed: number };
    services: { added: number; removed: number; changed: number };
    users: { added: number; removed: number; changed: number };
  }>(),
  /** Top drift items for quick display */
  topDriftItems: json("topDriftItems").$type<Array<{
    category: string;
    agentId: string;
    name: string;
    changeType: string;
    previousValue?: string;
    currentValue?: string;
  }>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ([
  index("anomalies_userId_idx").on(table.userId),
  index("anomalies_scheduleId_idx").on(table.scheduleId),
  index("anomalies_severity_idx").on(table.severity),
  index("anomalies_acknowledged_idx").on(table.acknowledged),
  index("anomalies_createdAt_idx").on(table.createdAt),
]));

export type DriftAnomaly = typeof driftAnomalies.$inferSelect;
export type InsertDriftAnomaly = typeof driftAnomalies.$inferInsert;

/**
 * Drift Notification History — Audit trail for all drift and anomaly notifications.
 * Tracks delivery status, retry attempts, and notification content.
 */
export const driftNotificationHistory = mysqlTable("drift_notification_history", {
  id: int("id").autoincrement().primaryKey(),
  /** Type of notification: drift_threshold or anomaly */
  notificationType: mysqlEnum("notificationType", ["drift_threshold", "anomaly"]).notNull(),
  /** Related schedule */
  scheduleId: int("scheduleId").notNull(),
  /** Related drift snapshot (if applicable) */
  snapshotId: int("snapshotId"),
  /** Related anomaly (if applicable) */
  anomalyId: int("anomalyId"),
  /** User who owns the schedule */
  userId: int("userId").notNull(),
  /** Severity level */
  severity: mysqlEnum("severity", ["critical", "high", "medium", "info"]).notNull(),
  /** Notification title */
  title: varchar("title", { length: 512 }).notNull(),
  /** Notification content (markdown) */
  content: text("content").notNull(),
  /** Delivery status */
  deliveryStatus: mysqlEnum("deliveryStatus", ["sent", "failed", "retrying", "suppressed"]).default("sent").notNull(),
  /** Error message if delivery failed */
  errorMessage: text("errorMessage"),
  /** Number of retry attempts */
  retryCount: int("retryCount").default(0).notNull(),
  /** Max retries allowed */
  maxRetries: int("maxRetries").default(3).notNull(),
  /** Next retry timestamp */
  nextRetryAt: timestamp("nextRetryAt"),
  /** Last retry timestamp */
  lastRetryAt: timestamp("lastRetryAt"),
  /** Schedule name at time of notification (denormalized) */
  scheduleName: varchar("scheduleName", { length: 256 }).default("").notNull(),
  /** Drift percentage at time of notification */
  driftPercent: float("driftPercent"),
  /** Agent IDs involved */
  agentIds: json("agentIds").$type<string[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ([
  index("notif_history_userId_idx").on(table.userId),
  index("notif_history_scheduleId_idx").on(table.scheduleId),
  index("notif_history_status_idx").on(table.deliveryStatus),
  index("notif_history_type_idx").on(table.notificationType),
  index("notif_history_createdAt_idx").on(table.createdAt),
  index("notif_history_nextRetry_idx").on(table.nextRetryAt),
]));

export type DriftNotificationHistory = typeof driftNotificationHistory.$inferSelect;
export type InsertDriftNotificationHistory = typeof driftNotificationHistory.$inferInsert;

/**
 * Anomaly Suppression Rules — Allows analysts to suppress anomaly alerts
 * for specific schedules and severity levels during maintenance windows.
 */
export const anomalySuppressionRules = mysqlTable("anomaly_suppression_rules", {
  id: int("id").autoincrement().primaryKey(),
  /** User who created the rule */
  userId: int("userId").notNull(),
  /** Schedule to suppress (null = all schedules) */
  scheduleId: int("scheduleId"),
  /** Minimum severity to suppress: suppress this level and below */
  severityFilter: mysqlEnum("severityFilter", ["critical", "high", "medium", "all"]).default("medium").notNull(),
  /** Duration in hours for the suppression window */
  durationHours: int("durationHours").notNull(),
  /** Reason for suppression (analyst note) */
  reason: text("reason").notNull(),
  /** Whether the rule is currently active */
  active: boolean("active").default(true).notNull(),
  /** When the rule expires */
  expiresAt: timestamp("expiresAt").notNull(),
  /** Count of anomalies suppressed by this rule */
  suppressedCount: int("suppressedCount").default(0).notNull(),
  /** Schedule name at time of creation (denormalized) */
  scheduleName: varchar("scheduleName", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ([
  index("suppression_userId_idx").on(table.userId),
  index("suppression_scheduleId_idx").on(table.scheduleId),
  index("suppression_active_idx").on(table.active),
  index("suppression_expiresAt_idx").on(table.expiresAt),
]));

export type AnomalySuppressionRule = typeof anomalySuppressionRules.$inferSelect;
export type InsertAnomalySuppressionRule = typeof anomalySuppressionRules.$inferInsert;

/**
 * Analyst Notes v2 — Enhanced note-taking system with entity linking.
 * Supports annotating alerts, agents, CVEs, rules, and free-form notes.
 * Local-only: never written back to Wazuh.
 */
export const analystNotesV2 = mysqlTable("analyst_notes_v2", {
  id: int("id").autoincrement().primaryKey(),
  /** User who created this note */
  userId: int("userId").notNull(),
  /** Entity type this note is attached to */
  entityType: mysqlEnum("entityType", ["alert", "agent", "cve", "rule", "general"]).notNull(),
  /** Entity identifier (alert ID, agent ID, CVE ID, rule ID, or empty for general) */
  entityId: varchar("entityId", { length: 128 }).default("").notNull(),
  /** Title / headline of the note */
  title: varchar("title", { length: 512 }).notNull(),
  /** Markdown body */
  content: text("content").notNull(),
  /** Severity classification chosen by analyst */
  severity: mysqlEnum("severity", ["critical", "high", "medium", "low", "info"])
    .default("info")
    .notNull(),
  /** Comma-separated tags for flexible categorization */
  tags: json("tags").$type<string[]>(),
  /** Whether the note has been resolved/closed */
  resolved: int("resolved").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("notes_v2_userId_idx").on(table.userId),
  index("notes_v2_entityType_idx").on(table.entityType),
  index("notes_v2_entityId_idx").on(table.entityId),
  index("notes_v2_entity_lookup_idx").on(table.entityType, table.entityId),
]));

export type AnalystNoteV2 = typeof analystNotesV2.$inferSelect;
export type InsertAnalystNoteV2 = typeof analystNotesV2.$inferInsert;

// ══════════════════════════════════════════════════════════════════════════════
// Knowledge Graph — 4-Layer Nemotron-3 Nano Architecture
// Layer 1: API Ontology Graph (endpoints, parameters, responses, auth, resources)
// Layer 2: Operational Semantics Graph (use cases, risk classification)
// Layer 3: Schema & Field Lineage Graph (indices, fields, data flow)
// Layer 4: Error & Failure Graph (error patterns, causes, mitigations)
// Plus: Trust scoring, answer provenance, sync status
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Layer 1: API Endpoints — every Wazuh REST endpoint with risk classification.
 */
export const kgEndpoints = mysqlTable("kg_endpoints", {
  id: int("id").autoincrement().primaryKey(),
  endpointId: varchar("endpoint_id", { length: 128 }),
  path: varchar("path", { length: 512 }).notNull(),
  method: varchar("method", { length: 10 }).notNull(),
  summary: text("summary"),
  description: text("description"),
  tags: json("tags").$type<string[]>(),
  operationId: varchar("operation_id", { length: 128 }),
  resource: varchar("resource", { length: 64 }).notNull(),
  operationType: varchar("operation_type", { length: 16 }).notNull(),
  riskLevel: varchar("risk_level", { length: 16 }).notNull(),
  allowedForLlm: int("allowed_for_llm").default(1).notNull(),
  authMethod: varchar("auth_method", { length: 64 }),
  trustScore: varchar("trust_score", { length: 8 }).default("1.0").notNull(),
  deprecated: int("deprecated").default(0).notNull(),
  lastVerifiedAt: timestamp("last_verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("kge_method_idx").on(table.method),
  index("kge_resource_idx").on(table.resource),
  index("kge_risk_level_idx").on(table.riskLevel),
  index("kge_path_idx").on(table.path),
]));

export type KgEndpoint = typeof kgEndpoints.$inferSelect;
export type InsertKgEndpoint = typeof kgEndpoints.$inferInsert;

/**
 * Layer 1: API Parameters — query/path/body parameters for each endpoint.
 */
export const kgParameters = mysqlTable("kg_parameters", {
  id: int("id").autoincrement().primaryKey(),
  endpointId: int("endpoint_id").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  location: varchar("location", { length: 16 }).notNull(),
  required: int("required").default(0).notNull(),
  paramType: varchar("param_type", { length: 32 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ([
  index("kgp_endpoint_id_idx").on(table.endpointId),
  index("kgp_name_idx").on(table.name),
]));

export type KgParameter = typeof kgParameters.$inferSelect;

/**
 * Layer 1: API Responses — response codes and schemas for each endpoint.
 */
export const kgResponses = mysqlTable("kg_responses", {
  id: int("id").autoincrement().primaryKey(),
  endpointId: int("endpoint_id").notNull(),
  httpStatus: int("http_status").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ([
  index("kgr_endpoint_id_idx").on(table.endpointId),
]));

export type KgResponse = typeof kgResponses.$inferSelect;

/**
 * Layer 1: Auth Methods — authentication mechanisms supported by the API.
 */
export const kgAuthMethods = mysqlTable("kg_auth_methods", {
  id: int("id").autoincrement().primaryKey(),
  authId: varchar("auth_id", { length: 64 }).notNull(),
  authType: varchar("auth_type", { length: 32 }).notNull(),
  description: text("description"),
  ttlSeconds: int("ttl_seconds"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type KgAuthMethod = typeof kgAuthMethods.$inferSelect;

/**
 * Layer 1: Resources — API resource categories (agents, manager, cluster, etc.).
 */
export const kgResources = mysqlTable("kg_resources", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  endpointCount: int("endpoint_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type KgResource = typeof kgResources.$inferSelect;

/**
 * Layer 2: Use Cases — operational use case patterns that map to endpoint groups.
 */
export const kgUseCases = mysqlTable("kg_use_cases", {
  id: int("id").autoincrement().primaryKey(),
  intent: varchar("intent", { length: 128 }).notNull(),
  semanticType: varchar("semantic_type", { length: 64 }).notNull(),
  domain: varchar("domain", { length: 64 }).notNull(),
  description: text("description"),
  endpointIds: json("endpoint_ids").$type<number[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type KgUseCase = typeof kgUseCases.$inferSelect;

/**
 * Layer 3: Index Patterns — Wazuh Indexer index patterns and their schemas.
 */
export const kgIndices = mysqlTable("kg_indices", {
  id: int("id").autoincrement().primaryKey(),
  pattern: varchar("pattern", { length: 256 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type KgIndex = typeof kgIndices.$inferSelect;

/**
 * Layer 3: Fields — individual fields within index patterns.
 */
export const kgFields = mysqlTable("kg_fields", {
  id: int("id").autoincrement().primaryKey(),
  indexId: int("index_id").notNull(),
  fieldName: varchar("field_name", { length: 256 }).notNull(),
  fieldType: varchar("field_type", { length: 32 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ([
  index("kgf_index_id_idx").on(table.indexId),
  index("kgf_field_name_idx").on(table.fieldName),
]));

export type KgField = typeof kgFields.$inferSelect;

/**
 * Layer 4: Error Patterns — known error codes, causes, and mitigations.
 */
export const kgErrorPatterns = mysqlTable("kg_error_patterns", {
  id: int("id").autoincrement().primaryKey(),
  httpStatus: int("http_status").notNull(),
  description: text("description"),
  cause: text("cause"),
  mitigation: text("mitigation"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type KgErrorPattern = typeof kgErrorPatterns.$inferSelect;

/**
 * Trust History — tracks trust score changes for endpoints over time.
 *
 * STATUS: DORMANT — DEFINED BUT NOT RUNTIME-POPULATED
 *
 * This table exists in the schema and is created by migrations, but NO code
 * currently inserts rows into it. The read-side (getGraphStats) counts rows
 * but the result will always be 0 in the current release.
 *
 * Intended future use: when an endpoint's trust score changes (e.g., after
 * a security incident or API behavior change), a writer would INSERT a row
 * recording the old score, new score, and reason for the change.
 *
 * Do not claim this feature is operational. It is scaffolded for a future release.
 */
export const kgTrustHistory = mysqlTable("kg_trust_history", {
  id: int("id").autoincrement().primaryKey(),
  endpointId: int("endpoint_id").notNull(),
  oldScore: varchar("old_score", { length: 8 }).notNull(),
  newScore: varchar("new_score", { length: 8 }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ([
  index("kgth_endpoint_id_idx").on(table.endpointId),
]));

export type KgTrustHistory = typeof kgTrustHistory.$inferSelect;

/**
 * Answer Provenance — tracks which KG nodes were used to generate each LLM answer.
 */
export const kgAnswerProvenance = mysqlTable("kg_answer_provenance", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  question: text("question").notNull(),
  answer: text("answer"),
  confidence: varchar("confidence", { length: 8 }),
  endpointIds: json("endpoint_ids").$type<number[]>(),
  parameterIds: json("parameter_ids").$type<number[]>(),
  docChunkIds: json("doc_chunk_ids").$type<number[]>(),
  warnings: json("warnings").$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ([
  index("kgap_session_id_idx").on(table.sessionId),
]));

export type KgAnswerProvenance = typeof kgAnswerProvenance.$inferSelect;

/**
 * KG Sync Status — tracks extraction pipeline runs per layer.
 */
export const kgSyncStatus = mysqlTable("kg_sync_status", {
  id: int("id").autoincrement().primaryKey(),
  layer: varchar("layer", { length: 64 }).notNull().unique(),
  entityCount: int("entity_count").default(0).notNull(),
  lastSyncAt: timestamp("last_sync_at"),
  status: mysqlEnum("status", ["idle", "syncing", "completed", "error"]).default("idle").notNull(),
  errorMessage: text("error_message"),
  durationMs: int("duration_ms"),
  specVersion: varchar("spec_version", { length: 32 }),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type KgSyncStatus = typeof kgSyncStatus.$inferSelect;

/**
 * Investigation Sessions — analyst investigation workspaces.
 * Each session groups evidence, notes, and chat history for a specific investigation.
 */
export const investigationSessions = mysqlTable("investigation_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["active", "closed", "archived"]).default("active").notNull(),
  /** JSON array of evidence items collected during investigation */
  evidence: json("evidence").$type<Array<{
    type: string;
    label: string;
    data: Record<string, unknown>;
    addedAt: string;
  }>>(),
  /** JSON array of timeline entries */
  timeline: json("timeline").$type<Array<{
    timestamp: string;
    event: string;
    source: string;
    severity?: string;
  }>>(),
  tags: json("tags").$type<string[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("is_userId_idx").on(table.userId),
  index("is_status_idx").on(table.status),
]));

export type InvestigationSession = typeof investigationSessions.$inferSelect;
export type InsertInvestigationSession = typeof investigationSessions.$inferInsert;

/**
 * Investigation Notes — per-investigation analyst notes.
 */
export const investigationNotes = mysqlTable("investigation_notes", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull(),
  userId: int("userId").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("in_sessionId_idx").on(table.sessionId),
]));

export type InvestigationNote = typeof investigationNotes.$inferSelect;

/**
 * Connection Settings — runtime-configurable connection parameters.
 * Allows admins to update Wazuh Manager and Indexer credentials from the UI
 * without restarting Docker. Values override environment variables.
 * Sensitive values (passwords) are AES-256 encrypted at rest.
 */
export const connectionSettings = mysqlTable("connection_settings", {
  id: int("id").autoincrement().primaryKey(),
  /** Setting category: 'wazuh_manager' | 'wazuh_indexer' */
  category: varchar("category", { length: 64 }).notNull(),
  /** Setting key: 'host', 'port', 'user', 'pass', 'protocol' */
  settingKey: varchar("settingKey", { length: 64 }).notNull(),
  /** Setting value (encrypted for sensitive fields like passwords) */
  settingValue: text("settingValue").notNull(),
  /** Whether this value is encrypted */
  isEncrypted: int("isEncrypted").default(0).notNull(),
  /** Admin who last updated this setting */
  updatedBy: int("updatedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("cs_category_key_idx").on(table.category, table.settingKey),
]));

export type ConnectionSetting = typeof connectionSettings.$inferSelect;
export type InsertConnectionSetting = typeof connectionSettings.$inferInsert;

/**
 * LLM Usage Tracking — logs every LLM invocation for monitoring and analytics.
 * Tracks token counts, latency, model used, and whether it was custom or built-in.
 */
export const llmUsage = mysqlTable("llm_usage", {
  id: int("id").autoincrement().primaryKey(),
  /** Model identifier (e.g., 'unsloth/Nemotron-3-Nano-30B-A3B-GGUF' or 'gemini-2.5-flash') */
  model: varchar("model", { length: 256 }).notNull(),
  /** Source of the response: 'custom', 'builtin', or 'fallback' (custom failed, fell back) */
  source: varchar("source", { length: 32 }).notNull(),
  /** Number of tokens in the prompt */
  promptTokens: int("promptTokens").default(0).notNull(),
  /** Number of tokens in the completion */
  completionTokens: int("completionTokens").default(0).notNull(),
  /** Total tokens (prompt + completion) */
  totalTokens: int("totalTokens").default(0).notNull(),
  /** Latency in milliseconds for the LLM call */
  latencyMs: int("latencyMs").default(0).notNull(),
  /** Caller context: which feature triggered this call */
  caller: varchar("caller", { length: 128 }),
  /** Whether the call succeeded */
  success: int("success").default(1).notNull(),
  /** Error message if the call failed */
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ([
  index("lu_source_idx").on(table.source),
  index("lu_model_idx").on(table.model),
  index("lu_created_idx").on(table.createdAt),
]));

export type LlmUsage = typeof llmUsage.$inferSelect;
export type InsertLlmUsage = typeof llmUsage.$inferInsert;

/**
 * Alert Queue — 10-deep FIFO queue for alerts awaiting Walter analysis.
 * Analysts queue alerts from the Alerts Timeline, then click to trigger
 * Walter's full agentic pipeline on demand. Max 10 items; oldest evicted.
 */
export const alertQueue = mysqlTable("alert_queue", {
  id: int("id").autoincrement().primaryKey(),
  /** Wazuh alert ID (from _id or id field) */
  alertId: varchar("alertId", { length: 128 }).notNull(),
  /** Rule ID that fired */
  ruleId: varchar("ruleId", { length: 32 }).notNull(),
  /** Rule description */
  ruleDescription: text("ruleDescription"),
  /** Rule severity level (0-15) */
  ruleLevel: int("ruleLevel").default(0).notNull(),
  /** Agent ID */
  agentId: varchar("agentId", { length: 16 }),
  /** Agent name */
  agentName: varchar("agentName", { length: 128 }),
  /** Alert timestamp from Wazuh */
  alertTimestamp: varchar("alertTimestamp", { length: 64 }),
  /** Full raw alert JSON for Walter context */
  rawJson: json("rawJson").$type<Record<string, unknown>>(),
  /** Queue status: queued → processing → completed → failed → dismissed */
  status: mysqlEnum("status", ["queued", "processing", "completed", "failed", "dismissed"]).default("queued").notNull(),
  /** Walter's triage result (stored after analysis completes) */
  triageResult: json("triageResult").$type<{
    answer: string;
    reasoning?: string;
    trustScore?: number;
    confidence?: number;
    safetyStatus?: string;
    agentSteps?: Array<Record<string, unknown>>;
    sources?: Array<Record<string, unknown>>;
    suggestedFollowUps?: string[];
    provenance?: Record<string, unknown>;
  }>(),
  /** User who queued this alert */
  queuedBy: int("queuedBy"),
  /** When the alert was queued */
  queuedAt: timestamp("queuedAt").defaultNow().notNull(),
  /** When Walter started processing */
  processedAt: timestamp("processedAt"),
  /** When Walter completed analysis */
  completedAt: timestamp("completedAt"),
  /** Pipeline triage ID (links to triage_objects.triageId for auto-triage) */
  pipelineTriageId: varchar("pipelineTriageId", { length: 64 }),
  /** Auto-triage pipeline status */
  autoTriageStatus: varchar("autoTriageStatus", { length: 20 }).default("pending"),
}, (table) => ([
  index("aq_status_idx").on(table.status),
  index("aq_alertId_idx").on(table.alertId),
  index("aq_queuedAt_idx").on(table.queuedAt),
]));

export type AlertQueueItem = typeof alertQueue.$inferSelect;
export type InsertAlertQueueItem = typeof alertQueue.$inferInsert;

/**
 * Auto-queue rules — configurable rules that automatically send matching
 * Wazuh alerts to Walter's queue without manual analyst intervention.
 *
 * Rules are evaluated against incoming alerts from the Wazuh Indexer.
 * When an alert matches a rule, it is automatically enqueued for Walter analysis.
 *
 * Rule types:
 * - severity_threshold: Queue any alert at or above a severity level
 * - rule_id: Queue alerts matching specific Wazuh rule IDs
 * - agent_pattern: Queue alerts from agents matching a name/ID pattern
 * - combined: All conditions must match (AND logic)
 */
export const autoQueueRules = mysqlTable("auto_queue_rules", {
  id: int("id").autoincrement().primaryKey(),
  /** Human-readable name for the rule */
  name: varchar("name", { length: 256 }).notNull(),
  /** Whether this rule is active */
  enabled: int("enabled").default(1).notNull(),
  /** Minimum severity level (0-15) to trigger auto-queue. Null = no severity filter */
  minSeverity: int("minSeverity"),
  /** Comma-separated Wazuh rule IDs to match. Null = no rule ID filter */
  ruleIds: text("ruleIds"),
  /** Agent name/ID pattern (supports * wildcard). Null = no agent filter */
  agentPattern: varchar("agentPattern", { length: 256 }),
  /** MITRE technique IDs to match (comma-separated). Null = no MITRE filter */
  mitreTechniqueIds: text("mitreTechniqueIds"),
  /** Maximum alerts this rule can auto-queue per hour (rate limit) */
  maxPerHour: int("maxPerHour").default(10).notNull(),
  /** Count of alerts auto-queued by this rule in the current hour window */
  currentHourCount: int("currentHourCount").default(0).notNull(),
  /** Timestamp of the current hour window start */
  currentHourStart: timestamp("currentHourStart"),
  /** User who created this rule */
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("aqr_enabled_idx").on(table.enabled),
]));

export type AutoQueueRule = typeof autoQueueRules.$inferSelect;
export type InsertAutoQueueRule = typeof autoQueueRules.$inferInsert;

/**
 * Saved Hunt Results — persists threat hunting correlation results.
 * Analysts can save hunt results to share findings across sessions,
 * review historical hunts, and export correlation reports.
 * Local-only: never written back to Wazuh.
 */
export const savedHunts = mysqlTable("saved_hunts", {
  id: int("id").autoincrement().primaryKey(),
  /** User who executed and saved this hunt */
  userId: int("userId").notNull(),
  /** Human-readable title for the saved hunt */
  title: varchar("title", { length: 512 }).notNull(),
  /** Optional analyst notes / description */
  description: text("description"),
  /** Original search query */
  query: varchar("query", { length: 500 }).notNull(),
  /** IOC type used for the hunt */
  iocType: varchar("iocType", { length: 32 }).notNull(),
  /** Time range start */
  timeFrom: varchar("timeFrom", { length: 32 }).notNull(),
  /** Time range end */
  timeTo: varchar("timeTo", { length: 32 }).notNull(),
  /** Total hits across all sources */
  totalHits: int("totalHits").default(0).notNull(),
  /** Total execution time in milliseconds */
  totalTimeMs: int("totalTimeMs").default(0).notNull(),
  /** Number of sources that returned results */
  sourcesWithHits: int("sourcesWithHits").default(0).notNull(),
  /** Agent IDs that were searched */
  agentsSearched: json("agentsSearched").$type<string[]>(),
  /** Full correlation results — array of source objects with matches */
  results: json("results").$type<Array<{
    source: string;
    sourceLabel: string;
    matches: unknown[];
    count: number;
    searchTimeMs: number;
  }>>().notNull(),
  /** Tags for categorization */
  tags: json("tags").$type<string[]>(),
  /** Severity assessment by analyst */
  severity: mysqlEnum("severity", ["critical", "high", "medium", "low", "info"])
    .default("info")
    .notNull(),
  /** Whether this hunt has been marked as resolved */
  resolved: int("resolved").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("sh_userId_idx").on(table.userId),
  index("sh_query_idx").on(table.query),
  index("sh_iocType_idx").on(table.iocType),
  index("sh_severity_idx").on(table.severity),
  index("sh_createdAt_idx").on(table.createdAt),
]));

export type SavedHunt = typeof savedHunts.$inferSelect;
export type InsertSavedHunt = typeof savedHunts.$inferInsert;


// ══════════════════════════════════════════════════════════════════════════════
// Agentic SOC Pipeline — Canonical Schema Tables
// Contract 1: Triage Objects
// Contract 2: Correlation Bundles
// Contract 3: Living Case Object (extends investigation_sessions)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Triage Objects — the canonical alert handoff artifact.
 * Every alert that enters the agentic pipeline produces exactly one triage object.
 * Downstream agents (Correlation, Hypothesis, Case) consume this, never raw alert blobs.
 */
export const triageObjects = mysqlTable("triage_objects", {
  id: int("id").autoincrement().primaryKey(),
  /** Unique triage ID (UUID-style, generated by the system) */
  triageId: varchar("triageId", { length: 64 }).notNull().unique(),
  /** Original Wazuh alert ID */
  alertId: varchar("alertId", { length: 128 }).notNull(),
  /** Wazuh rule ID that fired */
  ruleId: varchar("ruleId", { length: 32 }).notNull(),
  /** Wazuh rule description */
  ruleDescription: text("ruleDescription"),
  /** Original Wazuh rule level (0–15) */
  ruleLevel: int("ruleLevel").default(0).notNull(),
  /** Alert timestamp from Wazuh (preserved verbatim) */
  alertTimestamp: varchar("alertTimestamp", { length: 64 }),
  /** Agent ID that generated this alert */
  agentId: varchar("agentId", { length: 16 }),
  /** Agent name */
  agentName: varchar("agentName", { length: 128 }),
  /** Normalized alert type/family */
  alertFamily: varchar("alertFamily", { length: 128 }),
  /** AI-assigned severity */
  severity: mysqlEnum("severity", ["critical", "high", "medium", "low", "info"]).default("info").notNull(),
  /** Confidence in severity (0.0–1.0) */
  severityConfidence: float("severityConfidence").default(0).notNull(),
  /** Route recommendation */
  route: mysqlEnum("route", [
    "A_DUPLICATE_NOISY",
    "B_LOW_CONFIDENCE",
    "C_HIGH_CONFIDENCE",
    "D_LIKELY_BENIGN",
  ]).notNull(),
  /** Is this a duplicate? */
  isDuplicate: int("isDuplicate").default(0).notNull(),
  /** Similarity score to closest recent triage (0.0–1.0) */
  similarityScore: float("similarityScore").default(0).notNull(),
  /** Similar triage ID if duplicate */
  similarTriageId: varchar("similarTriageId", { length: 64 }),
  /** Concise analyst-readable summary */
  summary: text("summary"),
  /** Full structured triage object (JSON) — the canonical contract */
  triageData: json("triageData").$type<TriageObject>().notNull(),
  /** Who performed this triage */
  triagedBy: mysqlEnum("triagedBy", ["triage_agent", "analyst_manual"]).default("triage_agent").notNull(),
  /** User who triggered the triage (if manual or queued) */
  triggeredByUserId: int("triggeredByUserId"),
  /** Alert queue item ID that triggered this triage (if from queue) */
  alertQueueItemId: int("alertQueueItemId"),
  /** Linked investigation session ID (if case-linked) */
  linkedCaseId: int("linkedCaseId"),
  /** Processing status */
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  /** Error message if triage failed */
  errorMessage: text("errorMessage"),
  /** LLM latency in milliseconds */
  latencyMs: int("latencyMs"),
  /** Tokens used for this triage */
  tokensUsed: int("tokensUsed"),
  // ── Analyst Feedback ──────────────────────────────────────────────────────
  /** Analyst override of AI severity */
  analystSeverityOverride: mysqlEnum("analystSeverityOverride", ["critical", "high", "medium", "low", "info"]),
  /** Analyst override of AI route */
  analystRouteOverride: mysqlEnum("analystRouteOverride", [
    "A_DUPLICATE_NOISY", "B_LOW_CONFIDENCE", "C_HIGH_CONFIDENCE", "D_LIKELY_BENIGN",
  ]),
  /** Analyst notes on the triage */
  analystNotes: text("analystNotes"),
  /** Whether the analyst confirmed the triage */
  analystConfirmed: int("analystConfirmed").default(0).notNull(),
  /** User ID of the analyst who provided feedback */
  analystUserId: int("analystUserId"),
  /** When feedback was provided */
  feedbackAt: timestamp("feedbackAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("to_alertId_idx").on(table.alertId),
  index("to_ruleId_idx").on(table.ruleId),
  index("to_agentId_idx").on(table.agentId),
  index("to_severity_idx").on(table.severity),
  index("to_route_idx").on(table.route),
  index("to_status_idx").on(table.status),
  index("to_isDuplicate_idx").on(table.isDuplicate),
  index("to_createdAt_idx").on(table.createdAt),
  index("to_alertFamily_idx").on(table.alertFamily),
  index("to_linkedCaseId_idx").on(table.linkedCaseId),
]));

export type TriageObjectRow = typeof triageObjects.$inferSelect;
export type InsertTriageObjectRow = typeof triageObjects.$inferInsert;

/**
 * Correlation Bundles — the canonical evidence synthesis handoff.
 * Produced by the Correlation Agent after consuming a triage object.
 * Contains related alerts, entities, blast radius, and case recommendations.
 */
export const correlationBundles = mysqlTable("correlation_bundles", {
  id: int("id").autoincrement().primaryKey(),
  /** Unique correlation ID (UUID-style) */
  correlationId: varchar("correlationId", { length: 64 }).notNull().unique(),
  /** The triage object that triggered this correlation */
  sourceTriageId: varchar("sourceTriageId", { length: 64 }).notNull(),
  /** Number of related alerts found */
  relatedAlertCount: int("relatedAlertCount").default(0).notNull(),
  /** Number of discovered entities */
  discoveredEntityCount: int("discoveredEntityCount").default(0).notNull(),
  /** Blast radius: number of affected hosts */
  blastRadiusHosts: int("blastRadiusHosts").default(0).notNull(),
  /** Blast radius: number of affected users */
  blastRadiusUsers: int("blastRadiusUsers").default(0).notNull(),
  /** Asset criticality of affected systems */
  assetCriticality: mysqlEnum("assetCriticality", ["critical", "high", "medium", "low", "unknown"]).default("unknown").notNull(),
  /** Is this likely part of a campaign? */
  likelyCampaign: int("likelyCampaign").default(0).notNull(),
  /** Case recommendation: merge_existing, create_new, defer_to_analyst */
  caseAction: mysqlEnum("caseAction", ["merge_existing", "create_new", "defer_to_analyst"]).default("defer_to_analyst").notNull(),
  /** Merge target investigation ID (if merge_existing) */
  mergeTargetId: int("mergeTargetId"),
  /** Overall correlation confidence (0.0–1.0) */
  confidence: float("confidence").default(0).notNull(),
  /** Full structured correlation bundle (JSON) — the canonical contract */
  bundleData: json("bundleData").$type<CorrelationBundle>().notNull(),
  /** Processing status */
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  /** Error message if correlation failed */
  errorMessage: text("errorMessage"),
  /** LLM latency in milliseconds */
  latencyMs: int("latencyMs"),
  /** Tokens used */
  tokensUsed: int("tokensUsed"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("cb_sourceTriageId_idx").on(table.sourceTriageId),
  index("cb_status_idx").on(table.status),
  index("cb_caseAction_idx").on(table.caseAction),
  index("cb_likelyCampaign_idx").on(table.likelyCampaign),
  index("cb_createdAt_idx").on(table.createdAt),
]));

export type CorrelationBundleRow = typeof correlationBundles.$inferSelect;
export type InsertCorrelationBundleRow = typeof correlationBundles.$inferInsert;

/**
 * Living Case State — extends investigation_sessions with structured agentic state.
 * This is a separate table that links 1:1 with investigation_sessions,
 * keeping the original table stable while adding the agentic case fields.
 */
export const livingCaseState = mysqlTable("living_case_state", {
  id: int("id").autoincrement().primaryKey(),
  /** Links to investigation_sessions.id */
  sessionId: int("sessionId").notNull().unique(),
  /** Full structured living case object (JSON) — the canonical contract */
  caseData: json("caseData").$type<LivingCaseObject>().notNull(),
  /** Current working theory (denormalized for quick display) */
  workingTheory: text("workingTheory"),
  /** Working theory confidence (0.0–1.0) */
  theoryConfidence: float("theoryConfidence").default(0).notNull(),
  /** Number of completed pivots */
  completedPivotCount: int("completedPivotCount").default(0).notNull(),
  /** Number of evidence gaps */
  evidenceGapCount: int("evidenceGapCount").default(0).notNull(),
  /** Number of pending recommended actions */
  pendingActionCount: int("pendingActionCount").default(0).notNull(),
  /** Number of actions requiring approval */
  approvalRequiredCount: int("approvalRequiredCount").default(0).notNull(),
  /** Primary triage ID that originated this case (exact lineage, not recency) */
  sourceTriageId: varchar("sourceTriageId", { length: 64 }),
  /** Primary correlation ID that originated this case (exact lineage, not recency) */
  sourceCorrelationId: varchar("sourceCorrelationId", { length: 64 }),
  /** Linked triage IDs (JSON array of triageId strings) */
  linkedTriageIds: json("linkedTriageIds").$type<string[]>(),
  /** Linked correlation IDs (JSON array of correlationId strings) */
  linkedCorrelationIds: json("linkedCorrelationIds").$type<string[]>(),
  /** Who last updated this case state */
  lastUpdatedBy: mysqlEnum("lastUpdatedBy", ["case_agent", "hypothesis_agent", "response_agent", "analyst_manual"]).default("analyst_manual").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("lcs_sessionId_idx").on(table.sessionId),
  index("lcs_theoryConfidence_idx").on(table.theoryConfidence),
  index("lcs_updatedAt_idx").on(table.updatedAt),
]));

export type LivingCaseStateRow = typeof livingCaseState.$inferSelect;
export type InsertLivingCaseStateRow = typeof livingCaseState.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// Response Actions — first-class, structured, queryable, stateful, auditable
// NOT embedded in LLM output. Every action is its own DB row with its own lifecycle.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Action categories — typed, not free-text.
 * Each represents a concrete SOC response capability.
 */
export const RESPONSE_ACTION_CATEGORIES = [
  "isolate_host",
  "disable_account",
  "block_ioc",
  "escalate_ir",
  "suppress_alert",
  "tune_rule",
  "add_watchlist",
  "collect_evidence",
  "notify_stakeholder",
  "custom",
] as const;

/**
 * State machine:
 *   proposed → approved → executed
 *   proposed → rejected
 *   proposed → deferred → proposed (re-propose)
 *   approved → executed
 *   approved → rejected (revoke approval)
 *
 * Every transition is logged to response_action_audit.
 */
export const RESPONSE_ACTION_STATES = [
  "proposed",
  "approved",
  "rejected",
  "executed",
  "deferred",
] as const;

export const RESPONSE_ACTION_URGENCY = [
  "immediate",
  "next",
  "scheduled",
  "optional",
] as const;

export const responseActions = mysqlTable("response_actions", {
  id: int("id").autoincrement().primaryKey(),

  // ── Identity ───────────────────────────────────────────────────────────────
  /** Unique action ID (e.g., "ra-abc123") */
  actionId: varchar("actionId", { length: 64 }).notNull(),

  // ── Classification ─────────────────────────────────────────────────────────
  /** What kind of response action */
  category: mysqlEnum("category", [
    "isolate_host", "disable_account", "block_ioc", "escalate_ir",
    "suppress_alert", "tune_rule", "add_watchlist", "collect_evidence",
    "notify_stakeholder", "custom",
  ]).notNull(),

  /** Human-readable title (e.g., "Block IP 10.0.1.45 at perimeter firewall") */
  title: varchar("title", { length: 512 }).notNull(),

  /** Detailed description of what this action entails */
  description: text("description"),

  /** How urgent is this action? */
  urgency: mysqlEnum("urgency", ["immediate", "next", "scheduled", "optional"]).default("next").notNull(),

  /** Does this action require human approval before execution? */
  requiresApproval: int("requiresApproval").default(1).notNull(),

  // ── State Machine ──────────────────────────────────────────────────────────
  /** Current state of this action */
  state: mysqlEnum("state", ["proposed", "approved", "rejected", "executed", "deferred"]).default("proposed").notNull(),

  // ── Provenance ─────────────────────────────────────────────────────────────
  /** Who/what proposed this action (e.g., "hypothesis_agent", "analyst:42") */
  proposedBy: varchar("proposedBy", { length: 128 }).notNull(),
  /** When proposed */
  proposedAt: timestamp("proposedAt").defaultNow().notNull(),

  /** Who approved (null if not yet approved) */
  approvedBy: varchar("approvedBy", { length: 128 }),
  /** When approved */
  approvedAt: timestamp("approvedAt"),

  /** Who executed (null if not yet executed) */
  executedBy: varchar("executedBy", { length: 128 }),
  /** When executed */
  executedAt: timestamp("executedAt"),

  /** Who rejected or deferred (null if neither) */
  decidedBy: varchar("decidedBy", { length: 128 }),
  /** When the last decision was made */
  decidedAt: timestamp("decidedAt"),
  /** Reason for rejection/deferral */
  decisionReason: text("decisionReason"),

  // ── Evidence Basis ─────────────────────────────────────────────────────────
  /** JSON array of evidence strings that support this recommendation */
  evidenceBasis: json("evidenceBasis").$type<string[]>(),

  /** Linked playbook reference, if any */
  playbookRef: varchar("playbookRef", { length: 256 }),

  // ── Target Details ─────────────────────────────────────────────────────────
  /** The specific target of this action (e.g., IP, hostname, username, rule ID) */
  targetValue: varchar("targetValue", { length: 512 }),
  /** Target type for structured queries */
  targetType: varchar("targetType", { length: 64 }),

  // ── Linkage ────────────────────────────────────────────────────────────────
  /** Living case ID this action belongs to (FK to living_case_state.id) */
  caseId: int("caseId"),
  /** Correlation ID that generated this action */
  correlationId: varchar("correlationId", { length: 64 }),
  /** Triage ID that originated this action chain */
  triageId: varchar("triageId", { length: 64 }),
  /** Alert IDs related to this action (JSON array) */
  linkedAlertIds: json("linkedAlertIds").$type<string[]>(),
  /** Agent IDs affected by this action (JSON array) */
  linkedAgentIds: json("linkedAgentIds").$type<string[]>(),

  // ── Semantic Validation ────────────────────────────────────────────────────
  /** Warning if LLM output had category-target mismatch */
  semanticWarning: text("semanticWarning"),

  // ── Execution Result ───────────────────────────────────────────────────────
  /** Result of execution (success/failure details) */
  executionResult: text("executionResult"),
  /** Whether execution succeeded */
  executionSuccess: int("executionSuccess"),

  // ── Timestamps ─────────────────────────────────────────────────────────────
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ([
  index("ra_actionId_idx").on(table.actionId),
  index("ra_state_idx").on(table.state),
  index("ra_category_idx").on(table.category),
  index("ra_urgency_idx").on(table.urgency),
  index("ra_caseId_idx").on(table.caseId),
  index("ra_triageId_idx").on(table.triageId),
  index("ra_proposedAt_idx").on(table.proposedAt),
  index("ra_requiresApproval_state_idx").on(table.requiresApproval, table.state),
]));

export type ResponseActionRow = typeof responseActions.$inferSelect;
export type InsertResponseActionRow = typeof responseActions.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// Response Action Audit — immutable log of every state transition
// ═══════════════════════════════════════════════════════════════════════════════

export const responseActionAudit = mysqlTable("response_action_audit", {
  id: int("id").autoincrement().primaryKey(),

  /** FK to response_actions.id */
  actionId: int("actionId").notNull(),

  /** The unique action ID string (denormalized for fast queries) */
  actionIdStr: varchar("actionIdStr", { length: 64 }).notNull(),

  /** State before this transition */
  fromState: varchar("fromState", { length: 20 }).notNull(),

  /** State after this transition */
  toState: varchar("toState", { length: 20 }).notNull(),

  /** Who performed this transition (e.g., "user:42", "hypothesis_agent", "system") */
  performedBy: varchar("performedBy", { length: 128 }).notNull(),

  /** Why this transition was made */
  reason: text("reason"),

  /** Additional metadata (JSON) */
  metadata: json("metadata").$type<Record<string, unknown>>(),

  /** When this transition occurred */
  performedAt: timestamp("performedAt").defaultNow().notNull(),
}, (table) => ([
  index("raa_actionId_idx").on(table.actionId),
  index("raa_actionIdStr_idx").on(table.actionIdStr),
  index("raa_performedAt_idx").on(table.performedAt),
  index("raa_toState_idx").on(table.toState),
]));

export type ResponseActionAuditRow = typeof responseActionAudit.$inferSelect;
export type InsertResponseActionAuditRow = typeof responseActionAudit.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════════
// Pipeline Runs — track end-to-end pipeline execution state
// ═══════════════════════════════════════════════════════════════════════════════

export const pipelineRuns = mysqlTable("pipeline_runs", {
  id: int("id").autoincrement().primaryKey(),

  /** Unique run ID (e.g., "run-abc123") */
  runId: varchar("runId", { length: 64 }).notNull(),

  /** Alert queue item ID that triggered this run */
  queueItemId: int("queueItemId"),

  /** Alert ID from Wazuh */
  alertId: varchar("alertId", { length: 128 }),

  /** Current pipeline stage */
  currentStage: mysqlEnum("currentStage", [
    "triage", "correlation", "hypothesis", "response_actions", "completed", "failed",
  ]).default("triage").notNull(),

  /** Overall run status */
  status: mysqlEnum("status", ["running", "completed", "failed", "partial"]).default("running").notNull(),

  // ── Stage Results ──────────────────────────────────────────────────────────
  /** Triage ID produced by stage 1 */
  triageId: varchar("triageId", { length: 64 }),
  triageStatus: mysqlEnum("triageStatus", ["pending", "running", "completed", "failed", "skipped"]).default("pending").notNull(),
  triageLatencyMs: int("triageLatencyMs"),

  /** Correlation ID produced by stage 2 */
  correlationId: varchar("correlationId", { length: 64 }),
  correlationStatus: mysqlEnum("correlationStatus", ["pending", "running", "completed", "failed", "skipped"]).default("pending").notNull(),
  correlationLatencyMs: int("correlationLatencyMs"),

  /** Living case ID produced by stage 3 */
  livingCaseId: int("livingCaseId"),
  hypothesisStatus: mysqlEnum("hypothesisStatus", ["pending", "running", "completed", "failed", "skipped"]).default("pending").notNull(),
  hypothesisLatencyMs: int("hypothesisLatencyMs"),

  /** Number of response actions generated by stage 4 */
  responseActionsCount: int("responseActionsCount").default(0).notNull(),
  responseActionsStatus: mysqlEnum("responseActionsStatus", ["pending", "running", "completed", "failed", "skipped"]).default("pending").notNull(),

  /** Total pipeline latency */
  totalLatencyMs: int("totalLatencyMs"),

  /** Error message if failed */
  error: text("error"),

  /** Who triggered this run */
  triggeredBy: varchar("triggeredBy", { length: 128 }).notNull(),

  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, (table) => ([
  index("pr_runId_idx").on(table.runId),
  index("pr_status_idx").on(table.status),
  index("pr_queueItemId_idx").on(table.queueItemId),
  index("pr_alertId_idx").on(table.alertId),
  index("pr_startedAt_idx").on(table.startedAt),
]));

export type PipelineRunRow = typeof pipelineRuns.$inferSelect;
export type InsertPipelineRunRow = typeof pipelineRuns.$inferInsert;

