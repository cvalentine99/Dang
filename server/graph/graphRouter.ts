/**
 * Graph Router — tRPC procedures for 4-Layer Knowledge Graph
 *
 * Provides endpoints for:
 * - KG sync pipeline management (sync status, re-extract)
 * - Graph queries (stats, overview, search, risk analysis)
 * - Resource/endpoint/use-case/error exploration
 * - Analyst chat (agentic LLM pipeline)
 * - Investigation sessions (CRUD)
 * - Answer provenance & trust auditing
 */

import { requireDb } from "../dbGuard";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { runFullSync, syncLayer, getSyncStatus } from "./etlService";
import {
  getGraphStats,
  getOverviewGraph,
  searchGraph,
  getEndpointsByResource,
  getEndpointDetail,
  getRiskAnalysis,
  getResourceOverview,
  getUseCases,
  getErrorPatterns,
  getEndpoints,
  getAnswerProvenance,
} from "./graphQueryService";
import { runAnalystPipeline, type AnalystMessage } from "./agenticPipeline";
import { getInvestigationReportData, generateMarkdownReport, generateHtmlReport } from "./reportService";
import { detectRiskPaths, getRiskPathGraphData } from "./attackPathService";
import { getDb } from "../db";
import {
  investigationSessions,
  investigationNotes,
} from "../../drizzle/schema";
import { eq, desc, and, sql, like } from "drizzle-orm";

export const graphRouter = router({
  // ── KG Sync Pipeline ──────────────────────────────────────────────────

  /** Run a full KG re-extraction from the OpenAPI spec. */
  etlFullSync: protectedProcedure.mutation(async () => {
    return runFullSync();
  }),

  /** Sync a single KG layer. */
  etlSyncLayer: protectedProcedure
    .input(z.object({ layerName: z.string() }))
    .mutation(async ({ input }) => {
      return syncLayer(input.layerName);
    }),

  /** Get current sync status for all KG layers. */
  etlStatus: protectedProcedure.query(async () => {
    return getSyncStatus();
  }),

  // ── Graph Queries ───────────────────────────────────────────────────────

  /** Get Knowledge Graph statistics (entity counts, risk breakdown, method breakdown). */
  graphStats: protectedProcedure.query(async () => {
    return getGraphStats();
  }),

  /** Get overview graph showing all 4 layers and their connections. */
  overviewGraph: protectedProcedure
    .input(z.object({
      layer: z.enum(["all", "api_ontology", "operational_semantics", "schema_lineage", "error_failure"]).default("all"),
      riskLevel: z.enum(["SAFE", "MUTATING", "DESTRUCTIVE"]).optional(),
      limit: z.number().min(1).max(500).default(100),
    }).optional())
    .query(async ({ input }) => {
      return getOverviewGraph({
        layer: input?.layer ?? "all",
        riskLevel: input?.riskLevel,
        limit: input?.limit ?? 100,
      });
    }),

  /** Get all endpoints for a specific resource category. */
  endpointsByResource: protectedProcedure
    .input(z.object({ resource: z.string() }))
    .query(async ({ input }) => {
      return getEndpointsByResource(input.resource);
    }),

  /** Get full detail for a specific endpoint (params, responses). */
  endpointDetail: protectedProcedure
    .input(z.object({ endpointId: z.number() }))
    .query(async ({ input }) => {
      return getEndpointDetail(input.endpointId);
    }),

  /** Search across all KG layers by keyword. */
  searchGraph: protectedProcedure
    .input(z.object({ query: z.string().min(1), limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ input }) => {
      return searchGraph(input.query, input.limit);
    }),

  /** Get all resources with endpoint counts. */
  resourceOverview: protectedProcedure.query(async () => {
    return getResourceOverview();
  }),

  /** Get all use cases. */
  useCases: protectedProcedure.query(async () => {
    return getUseCases();
  }),

  /** Get all error patterns. */
  errorPatterns: protectedProcedure.query(async () => {
    return getErrorPatterns();
  }),

  /** Get endpoints with optional filtering. */
  endpoints: protectedProcedure
    .input(z.object({
      resource: z.string().optional(),
      method: z.string().optional(),
      riskLevel: z.string().optional(),
      llmAllowed: z.boolean().optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      return getEndpoints(input ?? {});
    }),

  // ── Risk Analysis ─────────────────────────────────────────────────────

  /** Get risk analysis: dangerous endpoints, resource risk map, LLM safety. */
  riskAnalysis: protectedProcedure.query(async () => {
    return getRiskAnalysis();
  }),

  /** Detect risk paths through the API ontology. */
  detectRiskPaths: protectedProcedure
    .input(z.object({
      minScore: z.number().min(0).max(100).default(50),
      limit: z.number().min(1).max(50).default(20),
    }).optional())
    .query(async ({ input }) => {
      return detectRiskPaths({
        minScore: input?.minScore ?? 50,
        limit: input?.limit ?? 20,
      });
    }),

  /** Get risk path data formatted for D3 graph visualization. */
  riskPathGraph: protectedProcedure
    .input(z.object({
      minScore: z.number().min(0).max(100).default(50),
      limit: z.number().min(1).max(50).default(10),
    }).optional())
    .query(async ({ input }) => {
      return getRiskPathGraphData({
        minScore: input?.minScore ?? 50,
        limit: input?.limit ?? 10,
      });
    }),

  /** Get answer provenance records for trust auditing. */
  answerProvenance: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }).optional())
    .query(async ({ input }) => {
      return getAnswerProvenance(input?.limit ?? 20);
    }),

  // ── Analyst Chat (Agentic Pipeline) ───────────────────────────────────

  /** Run the agentic analysis pipeline with a natural language query. */
  analystQuery: protectedProcedure
    .input(z.object({
      query: z.string().min(1).max(2000),
      conversationHistory: z.array(z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      })).default([]),
    }))
    .mutation(async ({ input }) => {
      return runAnalystPipeline(input.query, input.conversationHistory as AnalystMessage[]);
    }),

  // ── Investigation Sessions ────────────────────────────────────────────

  /** List investigation sessions for the current user. */
  listInvestigations: protectedProcedure
    .input(z.object({
      status: z.enum(["active", "closed", "archived"]).optional(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      const conditions = [eq(investigationSessions.userId, ctx.user.id)];
      if (input?.status) {
        conditions.push(eq(investigationSessions.status, input.status));
      }

      const where = conditions.length === 1 ? conditions[0] : and(...conditions);

      const [sessions, countResult] = await Promise.all([
        db.select()
          .from(investigationSessions)
          .where(where)
          .orderBy(desc(investigationSessions.updatedAt))
          .limit(input?.limit ?? 20)
          .offset(input?.offset ?? 0),
        db.select({ count: sql<number>`count(*)` })
          .from(investigationSessions)
          .where(where),
      ]);

      return { sessions, total: countResult[0]?.count ?? 0 };
    }),

  /** Create a new investigation session. */
  createInvestigation: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(512),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const result = await db.insert(investigationSessions).values({
        userId: ctx.user.id,
        title: input.title,
        description: input.description ?? null,
        tags: input.tags ?? [],
        evidence: [],
        timeline: [],
      });

      return { id: Number(result[0].insertId) };
    }),

  /** Get a specific investigation session. */
  getInvestigation: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const sessions = await db.select()
        .from(investigationSessions)
        .where(and(eq(investigationSessions.id, input.id), eq(investigationSessions.userId, ctx.user.id)))
        .limit(1);

      if (sessions.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Investigation not found" });

      const notes = await db.select()
        .from(investigationNotes)
        .where(eq(investigationNotes.sessionId, input.id))
        .orderBy(desc(investigationNotes.createdAt));

      return { ...sessions[0], notes };
    }),

  /** Update investigation session. */
  updateInvestigation: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().min(1).max(512).optional(),
      description: z.string().optional(),
      status: z.enum(["active", "closed", "archived"]).optional(),
      tags: z.array(z.string()).optional(),
      evidence: z.array(z.object({
        type: z.string(),
        label: z.string(),
        data: z.record(z.string(), z.unknown()),
        addedAt: z.string(),
      })).optional(),
      timeline: z.array(z.object({
        timestamp: z.string(),
        event: z.string(),
        source: z.string(),
        severity: z.string().optional(),
      })).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const updates: Record<string, unknown> = {};
      if (input.title !== undefined) updates.title = input.title;
      if (input.description !== undefined) updates.description = input.description;
      if (input.status !== undefined) updates.status = input.status;
      if (input.tags !== undefined) updates.tags = input.tags;
      if (input.evidence !== undefined) updates.evidence = input.evidence;
      if (input.timeline !== undefined) updates.timeline = input.timeline;

      await db.update(investigationSessions)
        .set(updates)
        .where(and(eq(investigationSessions.id, input.id), eq(investigationSessions.userId, ctx.user.id)));

      return { success: true };
    }),

  /** Add a note to an investigation. */
  addInvestigationNote: protectedProcedure
    .input(z.object({
      sessionId: z.number(),
      content: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const sessions = await db.select({ id: investigationSessions.id })
        .from(investigationSessions)
        .where(and(eq(investigationSessions.id, input.sessionId), eq(investigationSessions.userId, ctx.user.id)))
        .limit(1);

      if (sessions.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Investigation not found" });

      const result = await db.insert(investigationNotes).values({
        sessionId: input.sessionId,
        userId: ctx.user.id,
        content: input.content,
      });

      return { id: Number(result[0].insertId) };
    }),

  /** Delete an investigation note. */
  deleteInvestigationNote: protectedProcedure
    .input(z.object({ noteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db.delete(investigationNotes)
        .where(and(eq(investigationNotes.id, input.noteId), eq(investigationNotes.userId, ctx.user.id)));

      return { success: true };
    }),

  /** Find investigations related to a specific agent ID (by evidence items or title/description). */
  investigationsByAgent: protectedProcedure
    .input(z.object({ agentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();

      // Fetch all user investigations and filter by evidence containing the agentId
      const allSessions = await db.select()
        .from(investigationSessions)
        .where(eq(investigationSessions.userId, ctx.user.id))
        .orderBy(desc(investigationSessions.updatedAt))
        .limit(100);

      const matched = allSessions.filter((s) => {
        // Check evidence array for agent-related items
        if (Array.isArray(s.evidence)) {
          for (const ev of s.evidence) {
            const data = ev.data ?? {};
            if (
              String(data.agentId ?? "") === input.agentId ||
              String(data.agent_id ?? "") === input.agentId ||
              String(data.id ?? "") === input.agentId ||
              String(ev.label ?? "").includes(`Agent ${input.agentId}`) ||
              String(ev.label ?? "").includes(`agent ${input.agentId}`)
            ) return true;
          }
        }
        // Check title/description for agent reference
        if (s.title?.includes(input.agentId) || s.description?.includes(input.agentId)) return true;
        return false;
      });

      return { sessions: matched };
    }),

  /** Export investigation as Markdown report. */
  exportInvestigationMarkdown: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const data = await getInvestigationReportData(input.sessionId, ctx.user.id);
      if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Investigation not found" });
      return { markdown: generateMarkdownReport(data), title: data.title };
    }),

  /** Export investigation as HTML report. */
  exportInvestigationHtml: protectedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const data = await getInvestigationReportData(input.sessionId, ctx.user.id);
      if (!data) throw new TRPCError({ code: "NOT_FOUND", message: "Investigation not found" });
      return { html: generateHtmlReport(data), title: data.title };
    }),
});
