/**
 * kgTypes.ts — Shared type definitions for the KG ETL pipeline.
 *
 * These types are the single source of truth for the shape of data
 * flowing through the extraction, loading, and sync-status layers.
 * Both seed-kg.mjs (CLI) and etlService.ts (runtime) consume these
 * types via the shared kgExtractor and kgLoader modules.
 */

// ── Extracted entities (output of kgExtractor) ──────────────────────────────

export interface KgEndpoint {
  endpoint_id: string;   // e.g. "GET:/agents"
  path: string;
  method: string;        // GET | POST | PUT | DELETE | PATCH
  summary: string | null;
  description: string | null;
  tags: string;          // JSON-stringified array
  operation_id: string | null;
  resource: string;
  operation_type: string; // READ | CREATE | UPDATE | DELETE
  risk_level: string;     // SAFE | MUTATING | DESTRUCTIVE
  allowed_for_llm: number; // 0 | 1
  auth_method: string;
  trust_score: string;
  deprecated: number;     // 0 | 1
}

export interface KgParameter {
  endpoint_id: string;
  name: string;
  location: string;      // query | path | body | header
  required: number;       // 0 | 1
  param_type: string;
  description: string | null;
}

export interface KgResponse {
  endpoint_id: string;
  http_status: number;
  description: string;
}

export interface KgAuthMethod {
  auth_id: string;
  auth_type: string;
  description: string;
  ttl_seconds: number | null;
}

export interface KgResource {
  name: string;
  endpoint_count: number;
}

export interface KgUseCase {
  intent: string;
  semantic_type: string;
  domain: string;
  description: string;
  endpoint_ids: string[];
}

export interface KgIndex {
  pattern: string;
  description: string;
}

export interface KgField {
  index_id: number;      // 1-based, referencing indices array order
  field_name: string;
  field_type: string;
  description: string;
}

export interface KgErrorPattern {
  http_status: number;
  description: string;
  cause: string;
  mitigation: string;
}

// ── Extraction result (full output of kgExtractor.extract()) ────────────────

export interface KgExtractionResult {
  specTitle: string;
  specVersion: string;
  endpoints: KgEndpoint[];
  parameters: KgParameter[];
  responses: KgResponse[];
  authMethods: KgAuthMethod[];
  resources: KgResource[];
  useCases: KgUseCase[];
  indices: KgIndex[];
  fields: KgField[];
  errorPatterns: KgErrorPattern[];
}

// ── endpointIds Type Contract ───────────────────────────────────────────────
//
// Two tables store "endpointIds" with DIFFERENT types. This is intentional:
//
//   kg_use_cases.endpoint_ids: string[]
//     Stores endpoint PATH identifiers, e.g. ["GET:/agents", "PUT:/agents/{agent_id}"]
//     Used for semantic/display purposes — maps use cases to human-readable endpoint keys.
//     Populated by kgExtractor.extract() from static use case definitions.
//
//   kg_answer_provenance.endpoint_ids: number[]
//     Stores DB row IDs (kg_endpoints.id auto-increment integers).
//     Used for traceability/provenance — links agentic pipeline answers to specific
//     endpoint records. Populated at runtime by graphQueryService when recording
//     which endpoints contributed to an answer.
//
// The transformation from number (DB id) → string (path) happens in
// graphQueryService.getEndpointsByIds(). Never assume they're the same type.
//
// See also: drizzle/schema.ts (kgUseCases vs kgAnswerProvenance)
// ────────────────────────────────────────────────────────────────────────────

// ── Sync status (matches kg_sync_status schema) ─────────────────────────────

export type KgLayerName =
  | "api_ontology"
  | "operational_semantics"
  | "schema_lineage"
  | "error_graph";

export interface KgSyncLayerResult {
  layer: KgLayerName;
  entityCount: number;
  status: "idle" | "syncing" | "completed" | "error";
  errorMessage: string | null;
  durationMs: number | null;
}

// ── Load result (output of kgLoader.load()) ─────────────────────────────────

export interface KgLoadResult {
  success: boolean;
  totalRecords: number;
  layers: Record<KgLayerName, KgSyncLayerResult>;
  specVersion: string;
  durationMs: number;
}
