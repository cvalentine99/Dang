/**
 * Knowledge Graph Query Service — 4-Layer Nemotron-3 Nano Architecture
 *
 * Provides structured queries against the 4-layer Knowledge Graph:
 *   Layer 1: API Ontology (endpoints, parameters, responses, auth, resources)
 *   Layer 2: Operational Semantics (use cases, risk classification)
 *   Layer 3: Schema & Field Lineage (indices, fields)
 *   Layer 4: Error & Failure (error patterns, causes, mitigations)
 *
 * All queries are read-only. No mutations to the KG from this service.
 */

import { eq, like, sql, desc, and, or } from "drizzle-orm";
import { getDb } from "../db";
import {
  kgEndpoints,
  kgParameters,
  kgResponses,
  kgAuthMethods,
  kgResources,
  kgUseCases,
  kgIndices,
  kgFields,
  kgErrorPatterns,
  kgTrustHistory,
  kgAnswerProvenance,
  kgSyncStatus,
} from "../../drizzle/schema";

// ── Types ───────────────────────────────────────────────────────────────────

export type KgNodeType =
  | "endpoint"
  | "resource"
  | "parameter"
  | "response"
  | "auth_method"
  | "use_case"
  | "index"
  | "field"
  | "error_pattern";

export interface GraphNode {
  id: string;
  type: KgNodeType;
  label: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  relationship: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface KgStats {
  endpoints: number;
  parameters: number;
  responses: number;
  authMethods: number;
  resources: number;
  useCases: number;
  indices: number;
  fields: number;
  errorPatterns: number;
  /**
   * DORMANT — kgTrustHistory table exists in schema but has NO runtime writer.
   * This count will always be 0 in the current release. The table is reserved
   * for a future feature that tracks trust-score-over-time per endpoint.
   * Do not present this as an active/operational metric.
   */
  trustHistory: number;
  answerProvenance: number;
  byRiskLevel: { safe: number; mutating: number; destructive: number };
  byMethod: { GET: number; POST: number; PUT: number; DELETE: number };
}

// ── Stats ───────────────────────────────────────────────────────────────────

export async function getGraphStats(): Promise<KgStats> {
  const db = await getDb();
  if (!db) return {
    endpoints: 0, parameters: 0, responses: 0, authMethods: 0,
    resources: 0, useCases: 0, indices: 0, fields: 0,
    errorPatterns: 0, trustHistory: 0, answerProvenance: 0,
    byRiskLevel: { safe: 0, mutating: 0, destructive: 0 },
    byMethod: { GET: 0, POST: 0, PUT: 0, DELETE: 0 },
  };

  const [ep, pa, re, au, rs, uc, ix, fi, er, th, ap] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(kgEndpoints),
    db.select({ count: sql<number>`count(*)` }).from(kgParameters),
    db.select({ count: sql<number>`count(*)` }).from(kgResponses),
    db.select({ count: sql<number>`count(*)` }).from(kgAuthMethods),
    db.select({ count: sql<number>`count(*)` }).from(kgResources),
    db.select({ count: sql<number>`count(*)` }).from(kgUseCases),
    db.select({ count: sql<number>`count(*)` }).from(kgIndices),
    db.select({ count: sql<number>`count(*)` }).from(kgFields),
    db.select({ count: sql<number>`count(*)` }).from(kgErrorPatterns),
    db.select({ count: sql<number>`count(*)` }).from(kgTrustHistory),
    db.select({ count: sql<number>`count(*)` }).from(kgAnswerProvenance),
  ]);

  // Risk level breakdown
  const riskRows = await db
    .select({ riskLevel: kgEndpoints.riskLevel, count: sql<number>`count(*)` })
    .from(kgEndpoints)
    .groupBy(kgEndpoints.riskLevel);

  const byRiskLevel = { safe: 0, mutating: 0, destructive: 0 };
  for (const r of riskRows) {
    const key = r.riskLevel.toLowerCase() as keyof typeof byRiskLevel;
    if (key in byRiskLevel) byRiskLevel[key] = r.count;
  }

  // Method breakdown
  const methodRows = await db
    .select({ method: kgEndpoints.method, count: sql<number>`count(*)` })
    .from(kgEndpoints)
    .groupBy(kgEndpoints.method);

  const byMethod = { GET: 0, POST: 0, PUT: 0, DELETE: 0 };
  for (const m of methodRows) {
    const key = m.method as keyof typeof byMethod;
    if (key in byMethod) byMethod[key] = m.count;
  }

  return {
    endpoints: ep[0]?.count ?? 0,
    parameters: pa[0]?.count ?? 0,
    responses: re[0]?.count ?? 0,
    authMethods: au[0]?.count ?? 0,
    resources: rs[0]?.count ?? 0,
    useCases: uc[0]?.count ?? 0,
    indices: ix[0]?.count ?? 0,
    fields: fi[0]?.count ?? 0,
    errorPatterns: er[0]?.count ?? 0,
    // DORMANT: kgTrustHistory has no runtime writer — this will always be 0.
    // Kept in stats for schema completeness. See drizzle/schema.ts kgTrustHistory.
    trustHistory: th[0]?.count ?? 0,
    answerProvenance: ap[0]?.count ?? 0,
    byRiskLevel,
    byMethod,
  };
}

// ── Layer 1: API Ontology Queries ──────────────────────────────────────────

/**
 * Get all endpoints for a specific resource category.
 */
export async function getEndpointsByResource(resource: string): Promise<GraphData> {
  const db = await getDb();
  if (!db) return { nodes: [], edges: [] };

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Resource node
  const resources = await db.select().from(kgResources).where(eq(kgResources.name, resource)).limit(1);
  if (resources.length === 0) return { nodes, edges };
  const res = resources[0];
  const resNodeId = `resource-${res.id}`;
  nodes.push({
    id: resNodeId,
    type: "resource",
    label: res.name,
    properties: {
      endpointCount: res.endpointCount,
    },
  });

  // Endpoints in this resource
  const endpoints = await db.select().from(kgEndpoints).where(eq(kgEndpoints.resource, resource));
  for (const ep of endpoints) {
    const epNodeId = `endpoint-${ep.id}`;
    nodes.push({
      id: epNodeId,
      type: "endpoint",
      label: `${ep.method} ${ep.path}`,
      properties: {
        method: ep.method,
        path: ep.path,
        summary: ep.summary,
        operationType: ep.operationType,
        riskLevel: ep.riskLevel,
        allowedForLlm: ep.allowedForLlm,
        trustScore: ep.trustScore,
      },
    });
    edges.push({ source: resNodeId, target: epNodeId, relationship: "CONTAINS" });
  }

  return { nodes, edges };
}

/**
 * Get full detail for a specific endpoint including parameters and responses.
 */
export async function getEndpointDetail(endpointId: number): Promise<GraphData> {
  const db = await getDb();
  if (!db) return { nodes: [], edges: [] };

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const endpoints = await db.select().from(kgEndpoints).where(eq(kgEndpoints.id, endpointId)).limit(1);
  if (endpoints.length === 0) return { nodes, edges };
  const ep = endpoints[0];
  const epNodeId = `endpoint-${ep.id}`;

  nodes.push({
    id: epNodeId,
    type: "endpoint",
    label: `${ep.method} ${ep.path}`,
    properties: { ...ep },
  });

  // Parameters
  const params = await db.select().from(kgParameters).where(eq(kgParameters.endpointId, ep.id));
  for (const p of params) {
    const nodeId = `param-${p.id}`;
    nodes.push({
      id: nodeId,
      type: "parameter",
      label: p.name,
      properties: { location: p.location, paramType: p.paramType, required: p.required, description: p.description },
    });
    edges.push({ source: epNodeId, target: nodeId, relationship: "ACCEPTS" });
  }

  // Responses
  const responses = await db.select().from(kgResponses).where(eq(kgResponses.endpointId, ep.id));
  for (const r of responses) {
    const nodeId = `response-${r.id}`;
    nodes.push({
      id: nodeId,
      type: "response",
      label: `${r.httpStatus}`,
      properties: { httpStatus: r.httpStatus, description: r.description },
    });
    edges.push({ source: epNodeId, target: nodeId, relationship: "RETURNS" });
  }

  return { nodes, edges };
}

/**
 * Get the overview graph showing all 4 layers and their connections.
 */
export async function getOverviewGraph(options?: { layer?: string; riskLevel?: string; limit?: number }): Promise<GraphData> {
  const db = await getDb();
  if (!db) return { nodes: [], edges: [] };

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const limit = options?.limit ?? 100;

  // Layer 1: Resources → Endpoints
  const resources = await db.select().from(kgResources);
  for (const res of resources) {
    const resNodeId = `resource-${res.id}`;
    nodes.push({
      id: resNodeId,
      type: "resource",
      label: res.name,
      properties: {
        endpointCount: res.endpointCount,
      },
    });

    // Get endpoints for this resource (limited)
    const conditions = [eq(kgEndpoints.resource, res.name)];
    if (options?.riskLevel) {
      conditions.push(eq(kgEndpoints.riskLevel, options.riskLevel));
    }

    const endpoints = await db.select().from(kgEndpoints)
      .where(conditions.length === 1 ? conditions[0] : and(...conditions))
      .limit(Math.min(limit, 20));

    for (const ep of endpoints) {
      const epNodeId = `endpoint-${ep.id}`;
      nodes.push({
        id: epNodeId,
        type: "endpoint",
        label: `${ep.method} ${ep.path}`,
        properties: {
          method: ep.method,
          path: ep.path,
          summary: ep.summary,
          operationType: ep.operationType,
          riskLevel: ep.riskLevel,
          allowedForLlm: ep.allowedForLlm,
          trustScore: ep.trustScore,
        },
      });
      edges.push({ source: resNodeId, target: epNodeId, relationship: "CONTAINS" });
    }
  }

  // Layer 2: Use Cases → Endpoints
  if (!options?.layer || options.layer === "operational_semantics" || options.layer === "all") {
    const useCases = await db.select().from(kgUseCases);
    for (const uc of useCases) {
      const ucNodeId = `usecase-${uc.id}`;
      nodes.push({
        id: ucNodeId,
        type: "use_case",
        label: uc.intent,
        properties: { description: uc.description, semanticType: uc.semanticType, domain: uc.domain },
      });

      // Link to endpoints
      if (uc.endpointIds && uc.endpointIds.length > 0) {
        for (const epId of uc.endpointIds.slice(0, 5)) {
          const epNodeId = `endpoint-${epId}`;
          if (nodes.some(n => n.id === epNodeId)) {
            edges.push({ source: ucNodeId, target: epNodeId, relationship: "USES" });
          }
        }
      }
    }
  }

  // Layer 3: Indices → Fields
  if (!options?.layer || options.layer === "schema_lineage" || options.layer === "all") {
    const indices = await db.select().from(kgIndices);
    for (const idx of indices) {
      const idxNodeId = `index-${idx.id}`;
      nodes.push({
        id: idxNodeId,
        type: "index",
        label: idx.pattern,
        properties: { description: idx.description },
      });

      // Get fields
      const fields = await db.select().from(kgFields).where(eq(kgFields.indexId, idx.id)).limit(10);
      for (const f of fields) {
        const fNodeId = `field-${f.id}`;
        nodes.push({
          id: fNodeId,
          type: "field",
          label: f.fieldName,
          properties: { fieldType: f.fieldType, description: f.description },
        });
        edges.push({ source: idxNodeId, target: fNodeId, relationship: "HAS_FIELD" });
      }
    }
  }

  // Layer 4: Error Patterns
  if (!options?.layer || options.layer === "error_failure" || options.layer === "all") {
    const errors = await db.select().from(kgErrorPatterns);
    for (const err of errors) {
      const errNodeId = `error-${err.id}`;
      nodes.push({
        id: errNodeId,
        type: "error_pattern",
        label: `${err.httpStatus}: ${(err.description ?? "").slice(0, 40)}`,
        properties: { httpStatus: err.httpStatus, description: err.description, cause: err.cause, mitigation: err.mitigation },
      });
    }
  }

  return { nodes, edges };
}

// ── Search ──────────────────────────────────────────────────────────────────

/**
 * Search across all KG layers by keyword.
 */
export async function searchGraph(query: string, limit: number = 50, options?: { llmSafe?: boolean }): Promise<GraphNode[]> {
  const db = await getDb();
  if (!db) return [];

  const pattern = `%${query}%`;
  const results: GraphNode[] = [];

  // Search endpoints (path, summary)
  // When llmSafe=true, only return SAFE endpoints (allowedForLlm=1)
  const epConditions = [or(like(kgEndpoints.path, pattern), like(kgEndpoints.summary, pattern), like(kgEndpoints.description, pattern))];
  if (options?.llmSafe) {
    epConditions.push(eq(kgEndpoints.allowedForLlm, 1));
  }
  const eps = await db.select().from(kgEndpoints)
    .where(and(...epConditions))
    .limit(limit);
  for (const ep of eps) {
    results.push({
      id: `endpoint-${ep.id}`,
      type: "endpoint",
      label: `${ep.method} ${ep.path}`,
      properties: { method: ep.method, path: ep.path, summary: ep.summary, riskLevel: ep.riskLevel, operationType: ep.operationType, allowedForLlm: ep.allowedForLlm },
    });
  }

  // Search parameters
  const params = await db.select().from(kgParameters)
    .where(or(like(kgParameters.name, pattern), like(kgParameters.description, pattern)))
    .limit(limit);
  for (const p of params) {
    results.push({
      id: `param-${p.id}`,
      type: "parameter",
      label: p.name,
      properties: { location: p.location, paramType: p.paramType, endpointId: p.endpointId },
    });
  }

  // Search use cases
  const ucs = await db.select().from(kgUseCases)
    .where(or(like(kgUseCases.intent, pattern), like(kgUseCases.description, pattern)))
    .limit(limit);
  for (const uc of ucs) {
    results.push({
      id: `usecase-${uc.id}`,
      type: "use_case",
      label: uc.intent,
      properties: { description: uc.description, semanticType: uc.semanticType, domain: uc.domain },
    });
  }

  // Search index patterns
  const indices = await db.select().from(kgIndices)
    .where(or(like(kgIndices.pattern, pattern), like(kgIndices.description, pattern)))
    .limit(limit);
  for (const idx of indices) {
    results.push({
      id: `index-${idx.id}`,
      type: "index",
      label: idx.pattern,
      properties: { description: idx.description },
    });
  }

  // Search fields
  const fields = await db.select().from(kgFields)
    .where(or(like(kgFields.fieldName, pattern), like(kgFields.description, pattern)))
    .limit(limit);
  for (const f of fields) {
    results.push({
      id: `field-${f.id}`,
      type: "field",
      label: f.fieldName,
      properties: { fieldType: f.fieldType, description: f.description },
    });
  }

  // Search error patterns
  const errors = await db.select().from(kgErrorPatterns)
    .where(like(kgErrorPatterns.description, pattern))
    .limit(limit);
  for (const err of errors) {
    results.push({
      id: `error-${err.id}`,
      type: "error_pattern",
      label: `${err.httpStatus}: ${(err.description ?? "").slice(0, 40)}`,
      properties: { httpStatus: err.httpStatus, description: err.description },
    });
  }

  return results.slice(0, limit);
}

// ── Risk Analysis ───────────────────────────────────────────────────────────

/**
 * Get risk analysis: dangerous endpoints, trust scores, and safety classification.
 */
export async function getRiskAnalysis(): Promise<{
  dangerousEndpoints: Array<{ id: number; method: string; path: string; riskLevel: string; operationType: string; trustScore: string }>;
  resourceRiskMap: Array<{ resource: string; safe: number; mutating: number; destructive: number }>;
  llmBlockedCount: number;
}> {
  const db = await getDb();
  if (!db) return { dangerousEndpoints: [], resourceRiskMap: [], llmBlockedCount: 0 };

  // Get all DESTRUCTIVE and MUTATING endpoints
  const dangerousEndpoints = await db.select({
    id: kgEndpoints.id,
    method: kgEndpoints.method,
    path: kgEndpoints.path,
    riskLevel: kgEndpoints.riskLevel,
    operationType: kgEndpoints.operationType,
    trustScore: kgEndpoints.trustScore,
  }).from(kgEndpoints)
    .where(or(eq(kgEndpoints.riskLevel, "DESTRUCTIVE"), eq(kgEndpoints.riskLevel, "MUTATING")))
    .orderBy(kgEndpoints.riskLevel, kgEndpoints.path);

  // Resource risk map — compute from endpoints since kgResources only has endpointCount
  const resourceRiskRows = await db.select({
    resource: kgEndpoints.resource,
    riskLevel: kgEndpoints.riskLevel,
    count: sql<number>`count(*)`,
  }).from(kgEndpoints)
    .groupBy(kgEndpoints.resource, kgEndpoints.riskLevel);

  const resourceRiskMap: Record<string, { resource: string; safe: number; mutating: number; destructive: number }> = {};
  for (const row of resourceRiskRows) {
    if (!resourceRiskMap[row.resource]) {
      resourceRiskMap[row.resource] = { resource: row.resource, safe: 0, mutating: 0, destructive: 0 };
    }
    const key = row.riskLevel.toLowerCase() as "safe" | "mutating" | "destructive";
    if (key in resourceRiskMap[row.resource]) {
      resourceRiskMap[row.resource][key] = row.count;
    }
  }

  // LLM blocked count
  const blocked = await db.select({ count: sql<number>`count(*)` })
    .from(kgEndpoints)
    .where(eq(kgEndpoints.allowedForLlm, 0));

  return {
    dangerousEndpoints,
    resourceRiskMap: Object.values(resourceRiskMap).sort((a, b) => b.destructive - a.destructive),
    llmBlockedCount: blocked[0]?.count ?? 0,
  };
}

/**
 * Get all resources with their endpoint counts for the overview.
 */
export async function getResourceOverview(): Promise<Array<{
  id: number;
  name: string;
  endpointCount: number;
}>> {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(kgResources).orderBy(desc(kgResources.endpointCount));
}

/**
 * Get all use cases.
 */
export async function getUseCases(): Promise<Array<{
  id: number;
  intent: string;
  description: string | null;
  semanticType: string;
  domain: string;
  endpointIds: number[] | null;
}>> {
  const db = await getDb();
  if (!db) return [];

  return db.select({
    id: kgUseCases.id,
    intent: kgUseCases.intent,
    description: kgUseCases.description,
    semanticType: kgUseCases.semanticType,
    domain: kgUseCases.domain,
    endpointIds: kgUseCases.endpointIds,
  }).from(kgUseCases);
}

/**
 * Get all error patterns.
 */
export async function getErrorPatterns(): Promise<Array<{
  id: number;
  httpStatus: number;
  description: string | null;
  cause: string | null;
  mitigation: string | null;
}>> {
  const db = await getDb();
  if (!db) return [];

  return db.select({
    id: kgErrorPatterns.id,
    httpStatus: kgErrorPatterns.httpStatus,
    description: kgErrorPatterns.description,
    cause: kgErrorPatterns.cause,
    mitigation: kgErrorPatterns.mitigation,
  }).from(kgErrorPatterns);
}

/**
 * Get sync status for all KG layers.
 */
export async function getSyncStatus() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(kgSyncStatus);
}

/**
 * Get all endpoints with optional filtering.
 */
export async function getEndpoints(options?: {
  resource?: string;
  method?: string;
  riskLevel?: string;
  llmAllowed?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ endpoints: any[]; total: number }> {
  const db = await getDb();
  if (!db) return { endpoints: [], total: 0 };

  const conditions = [];
  if (options?.resource) conditions.push(eq(kgEndpoints.resource, options.resource));
  if (options?.method) conditions.push(eq(kgEndpoints.method, options.method));
  if (options?.riskLevel) conditions.push(eq(kgEndpoints.riskLevel, options.riskLevel));
  if (options?.llmAllowed !== undefined) conditions.push(eq(kgEndpoints.allowedForLlm, options.llmAllowed ? 1 : 0));

  const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);

  const [endpoints, countResult] = await Promise.all([
    where
      ? db.select().from(kgEndpoints).where(where).limit(options?.limit ?? 50).offset(options?.offset ?? 0)
      : db.select().from(kgEndpoints).limit(options?.limit ?? 50).offset(options?.offset ?? 0),
    where
      ? db.select({ count: sql<number>`count(*)` }).from(kgEndpoints).where(where)
      : db.select({ count: sql<number>`count(*)` }).from(kgEndpoints),
  ]);

  return { endpoints, total: countResult[0]?.count ?? 0 };
}

/**
 * Get answer provenance records for trust auditing.
 */
export async function getAnswerProvenance(limit: number = 20) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(kgAnswerProvenance)
    .orderBy(desc(kgAnswerProvenance.createdAt))
    .limit(limit);
}

/**
 * Record answer provenance for a KG-assisted LLM response.
 */
export async function recordProvenance(data: {
  sessionId: string;
  question: string;
  answer?: string;
  confidence: string;
  endpointIds?: number[];
  parameterIds?: number[];
  docChunkIds?: number[];
  warnings?: string[];
}) {
  const db = await getDb();
  if (!db) return;

  await db.insert(kgAnswerProvenance).values({
    sessionId: data.sessionId,
    question: data.question,
    answer: data.answer ?? null,
    confidence: data.confidence,
    endpointIds: data.endpointIds ?? null,
    parameterIds: data.parameterIds ?? null,
    docChunkIds: data.docChunkIds ?? null,
    warnings: data.warnings ?? null,
  });
}
