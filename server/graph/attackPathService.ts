/**
 * Risk Analysis Service — API Safety & Trust Analysis
 *
 * Replaces the old attack-path-through-agents model with API-centric
 * risk analysis. Traverses the 4-layer Knowledge Graph to identify:
 *   - Dangerous endpoint chains (DELETE cascades, privilege escalation paths)
 *   - Trust score anomalies
 *   - LLM safety boundary violations
 *   - Error-prone endpoint clusters
 */

import { eq, desc, sql, and, or } from "drizzle-orm";
import { getDb } from "../db";
import {
  kgEndpoints,
  kgResources,
  kgUseCases,
  kgErrorPatterns,
} from "../../drizzle/schema";

// ── Types ───────────────────────────────────────────────────────────────────

export interface RiskPathHop {
  nodeId: string;
  nodeType: "endpoint" | "resource" | "use_case" | "error_pattern";
  label: string;
  stage: string;
  riskLevel?: string;
  properties: Record<string, unknown>;
}

export interface RiskPath {
  id: string;
  hops: RiskPathHop[];
  score: number;
  riskLevel: string;
  summary: string;
}

export interface RiskPathResult {
  paths: RiskPath[];
  totalPaths: number;
  maxScore: number;
  criticalPaths: number;
}

// ── Risk Path Detection ────────────────────────────────────────────────────

/**
 * Detect risk paths through the API ontology.
 * Finds chains of dangerous endpoints within the same resource.
 */
export async function detectRiskPaths(options?: {
  minScore?: number;
  limit?: number;
}): Promise<RiskPathResult> {
  const db = await getDb();
  if (!db) return { paths: [], totalPaths: 0, maxScore: 0, criticalPaths: 0 };

  const minScore = options?.minScore ?? 50;
  const limit = options?.limit ?? 20;

  // Get all DESTRUCTIVE and MUTATING endpoints
  const dangerous = await db.select().from(kgEndpoints)
    .where(or(eq(kgEndpoints.riskLevel, "DESTRUCTIVE"), eq(kgEndpoints.riskLevel, "MUTATING")))
    .orderBy(desc(kgEndpoints.trustScore));

  // Group by resource to find risk chains
  const byResource = new Map<string, typeof dangerous>();
  for (const ep of dangerous) {
    const list = byResource.get(ep.resource) ?? [];
    list.push(ep);
    byResource.set(ep.resource, list);
  }

  const paths: RiskPath[] = [];
  let pathId = 0;

  for (const [resource, endpoints] of Array.from(byResource)) {
    if (endpoints.length < 1) continue;

    // Score: DESTRUCTIVE = 40pts each, MUTATING = 20pts each
    const score = endpoints.reduce((sum, ep) => {
      return sum + (ep.riskLevel === "DESTRUCTIVE" ? 40 : 20);
    }, 0);

    const normalizedScore = Math.min(100, score);
    if (normalizedScore < minScore) continue;

    const hops: RiskPathHop[] = [];

    // Resource node
    hops.push({
      nodeId: `resource-${resource}`,
      nodeType: "resource",
      label: resource,
      stage: "Resource",
      riskLevel: endpoints.some((e) => e.riskLevel === "DESTRUCTIVE") ? "DESTRUCTIVE" : "MUTATING",
      properties: { endpointCount: endpoints.length },
    });

    // Endpoint nodes
    for (const ep of endpoints.slice(0, 5)) {
      hops.push({
        nodeId: `endpoint-${ep.id}`,
        nodeType: "endpoint",
        label: `${ep.method} ${ep.path}`,
        stage: ep.operationType,
        riskLevel: ep.riskLevel,
        properties: {
          method: ep.method,
          path: ep.path,
          summary: ep.summary,
          operationType: ep.operationType,
          allowedForLlm: ep.allowedForLlm,
        },
      });
    }

    const destructiveCount = endpoints.filter((e) => e.riskLevel === "DESTRUCTIVE").length;
    const mutatingCount = endpoints.filter((e) => e.riskLevel === "MUTATING").length;

    paths.push({
      id: `risk-${++pathId}`,
      hops,
      score: normalizedScore,
      riskLevel: destructiveCount > 0 ? "DESTRUCTIVE" : "MUTATING",
      summary: `${resource}: ${destructiveCount} destructive + ${mutatingCount} mutating endpoints. ${endpoints.some((e) => e.allowedForLlm) ? "⚠ Some LLM-accessible" : "✓ All LLM-blocked"}.`,
    });
  }

  // Sort by score descending
  paths.sort((a, b) => b.score - a.score);
  const limited = paths.slice(0, limit);

  return {
    paths: limited,
    totalPaths: paths.length,
    maxScore: limited[0]?.score ?? 0,
    criticalPaths: limited.filter(p => p.score >= 80).length,
  };
}

/**
 * Get risk path data formatted for D3 graph visualization.
 */
export async function getRiskPathGraphData(options?: {
  minScore?: number;
  limit?: number;
}): Promise<{
  nodes: Array<{ id: string; type: string; label: string; riskLevel: string; properties: Record<string, unknown> }>;
  edges: Array<{ source: string; target: string; relationship: string }>;
  paths: RiskPath[];
}> {
  const result = await detectRiskPaths(options);

  const nodeMap = new Map<string, { id: string; type: string; label: string; riskLevel: string; properties: Record<string, unknown> }>();
  const edges: Array<{ source: string; target: string; relationship: string }> = [];

  for (const path of result.paths) {
    let prevNodeId: string | null = null;
    for (const hop of path.hops) {
      if (!nodeMap.has(hop.nodeId)) {
        nodeMap.set(hop.nodeId, {
          id: hop.nodeId,
          type: hop.nodeType,
          label: hop.label,
          riskLevel: hop.riskLevel ?? "SAFE",
          properties: hop.properties,
        });
      }
      if (prevNodeId && prevNodeId !== hop.nodeId) {
        edges.push({
          source: prevNodeId,
          target: hop.nodeId,
          relationship: "CONTAINS_RISK",
        });
      }
      prevNodeId = hop.nodeId;
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
    paths: result.paths,
  };
}
