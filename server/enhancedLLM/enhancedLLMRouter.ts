/**
 * Enhanced LLM Router — Nemotron-3 Nano Agentic tRPC Endpoints
 *
 * Provides three endpoints:
 * - enhancedLLM.chat: Session-type-aware agentic chat with priority queuing
 * - enhancedLLM.classifyAlert: Structured alert classification with JSON schema
 * - enhancedLLM.dgxHealth: DGX Spark health metrics (admin)
 *
 * All optimization logic (context allocation, priority queue, prompt injection
 * defense, reasoning mode) is encapsulated server-side. The frontend only
 * provides the minimal input parameters.
 */
import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import {
  enhancedChat,
  classifyAlert,
  getDGXHealth,
  getContextAllocation,
  getQueueStats,
  type SessionType,
} from "./enhancedLLMService";

// ── Input Schemas ───────────────────────────────────────────────────────────

const sessionTypeSchema = z.enum([
  "alert_triage",
  "quick_lookup",
  "investigation",
  "deep_dive",
  "threat_hunt",
]);

const prioritySchema = z.enum(["critical", "high", "normal"]);

const chatInputSchema = z.object({
  query: z.string().min(1).max(4000),
  sessionType: sessionTypeSchema.default("quick_lookup"),
  priority: prioritySchema.default("normal"),
  untrustedData: z.unknown().optional(),
  includeTools: z.boolean().default(false),
  conversationHistory: z.array(z.object({
    role: z.enum(["user", "assistant", "system"]),
    content: z.string(),
  })).default([]),
});

const classifyAlertInputSchema = z.object({
  alertData: z.record(z.string(), z.unknown()),
  agentContext: z.object({
    agentId: z.string().optional(),
    agentName: z.string().optional(),
    os: z.string().optional(),
    groups: z.array(z.string()).optional(),
  }).optional(),
});

// ── Router ──────────────────────────────────────────────────────────────────

export const enhancedLLMRouter = router({
  /**
   * Enhanced chat — session-type-aware agentic chat with priority queuing.
   *
   * The frontend provides:
   *   { query, sessionType?, priority?, untrustedData?, includeTools? }
   *
   * The backend handles:
   *   - Context allocation (8K–64K based on session type)
   *   - Priority queue ordering (critical > high > normal)
   *   - Prompt injection defense (untrusted data wrapping)
   *   - Reasoning mode toggle (enabled for investigation/deep_dive)
   *   - Tool calling setup
   *   - Safety rails and output validation
   */
  chat: protectedProcedure
    .input(chatInputSchema)
    .mutation(async ({ input }) => {
      const result = await enhancedChat({
        query: input.query,
        sessionType: input.sessionType,
        priority: input.priority,
        untrustedData: input.untrustedData,
        includeTools: input.includeTools,
        conversationHistory: input.conversationHistory,
      });

      return {
        ...result,
        sessionType: input.sessionType,
        contextAllocation: getContextAllocation(input.sessionType),
      };
    }),

  /**
   * Structured alert classification — returns machine-parseable JSON.
   *
   * Uses JSON schema constrained output to guarantee the response shape.
   * Extracts IOCs, maps to MITRE ATT&CK, and recommends response actions.
   */
  classifyAlert: protectedProcedure
    .input(classifyAlertInputSchema)
    .mutation(async ({ input }) => {
      return classifyAlert({
        alertData: input.alertData,
        agentContext: input.agentContext,
      });
    }),

  /**
   * DGX Spark health metrics — model status, performance, memory.
   *
   * Queries the LLM server's /health, /metrics, and /v1/models endpoints.
   * Includes local queue stats (active requests, queue depth).
   */
  dgxHealth: protectedProcedure.query(async () => {
    return getDGXHealth();
  }),

  /**
   * Queue stats — lightweight endpoint for monitoring request queue.
   */
  queueStats: protectedProcedure.query(() => {
    return getQueueStats();
  }),

  /**
   * Session type metadata — returns context allocation details for all session types.
   * Used by the frontend to display session type descriptions and settings.
   */
  sessionTypes: protectedProcedure.query(() => {
    const types: SessionType[] = ["quick_lookup", "alert_triage", "investigation", "deep_dive", "threat_hunt"];
    return types.map((t) => ({
      type: t,
      ...getContextAllocation(t),
    }));
  }),
});
