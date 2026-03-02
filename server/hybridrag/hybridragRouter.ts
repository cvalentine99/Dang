/**
 * HybridRAG Router — Agentic AI assistant for Dang!
 *
 * Architecture:
 * - Primary: NVIDIA Nemotron 3 Nano (local Ollama/OpenAI-compatible endpoint)
 * - Fallback: Built-in LLM API (invokeLLM) if local model unavailable
 * - RAG context: injects live Wazuh telemetry snapshot into system prompt
 * - Analyst notes: full CRUD for local forensic annotations
 *
 * The assistant is read-only — it cannot trigger Wazuh actions.
 */

import { requireDb } from "../dbGuard";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and } from "drizzle-orm";
import axios from "axios";
import { nanoid } from "nanoid";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { analystNotes, ragSessions } from "../../drizzle/schema";
import { invokeLLMWithFallback, getEffectiveLLMConfig } from "../llm/llmService";
import { isWazuhConfigured, wazuhGet, getWazuhConfig, getEffectiveWazuhConfig } from "../wazuh/wazuhClient";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Call the LLM using the unified service (custom endpoint → built-in fallback).
 * Configuration is managed through Connection Settings UI.
 */
async function callLLM(messages: ChatMessage[]): Promise<string> {
  const result = await invokeLLMWithFallback({
    messages: messages.map(m => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content as string,
    })),
    max_tokens: 2048,
  });
  const rawContent = result.choices?.[0]?.message?.content;
  return typeof rawContent === 'string' ? rawContent : "Unable to generate response.";
}

/**
 * Check if the custom LLM is configured and reachable.
 */
async function checkLLMAvailability(): Promise<{ available: boolean; model: string; endpoint: string; enabled: boolean }> {
  try {
    const config = await getEffectiveLLMConfig();
    if (!config.enabled || !config.host) {
      return { available: false, model: config.model, endpoint: `${config.protocol}://${config.host}:${config.port}`, enabled: false };
    }
    const url = `${config.protocol}://${config.host}:${config.port}/v1/models`;
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return {
      available: response.ok,
      model: config.model,
      endpoint: `${config.protocol}://${config.host}:${config.port}`,
      enabled: true,
    };
  } catch {
    const config = await getEffectiveLLMConfig();
    return { available: false, model: config.model, endpoint: `${config.protocol}://${config.host}:${config.port}`, enabled: config.enabled };
  }
}

/**
 * Build a RAG context snapshot from live Wazuh telemetry.
 * This is injected into the system prompt for grounded responses.
 */
async function buildWazuhContext(): Promise<string> {
  const config = await getEffectiveWazuhConfig();
  if (!config) {
    return "No Wazuh connection configured. Answering from general security knowledge only.";
  }
  const lines: string[] = ["## Live Wazuh Telemetry Context\n"];

  try {
    const summary = await wazuhGet(config, { path: "/agents/summary/status" }) as Record<string, unknown>;
    const data = (summary as { data?: Record<string, unknown> }).data ?? summary;
    lines.push(`### Agent Summary\n${JSON.stringify(data, null, 2)}\n`);
  } catch { lines.push("Agent summary: unavailable\n"); }

  try {
    const analysisd = await wazuhGet(config, { path: "/manager/stats/analysisd" }) as Record<string, unknown>;
    const data = (analysisd as { data?: Record<string, unknown> }).data ?? analysisd;
    lines.push(`### Analysis Engine Stats\n${JSON.stringify(data, null, 2)}\n`);
  } catch { lines.push("Analysisd stats: unavailable\n"); }

  return lines.join("\n");
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(wazuhContext: string): string {
  return `You are Dang! — an expert security analyst AI assistant embedded in a Wazuh SIEM platform.

Your capabilities:
- Analyze Wazuh alerts, agent health, vulnerabilities, and compliance data
- Explain MITRE ATT&CK techniques and map them to observed indicators
- Help analysts triage incidents, prioritize CVEs, and interpret FIM events
- Suggest investigative pivots and remediation steps (advisory only)
- Interpret compliance check failures for PCI-DSS, GDPR, HIPAA, NIST

Your constraints (non-negotiable):
- You are READ-ONLY. Never suggest commands that modify Wazuh configuration.
- Never trigger active responses, delete agents, or modify rules.
- Always cite the specific agent ID, rule ID, or CVE when referencing data.
- If data is unavailable, say so clearly — do not fabricate telemetry.
- Treat all data as forensic evidence. Preserve timestamps and identifiers.

Response format:
- Use structured markdown with clear headings
- Use code blocks for rule IDs, hashes, and JSON
- Use threat level terminology: Critical / High / Medium / Low / Info
- Be concise but thorough — analysts need actionable intelligence

${wazuhContext}

Current date: ${new Date().toISOString()}`;
}

// ── Router ────────────────────────────────────────────────────────────────────
export const hybridragRouter = router({

  // ── Model status ────────────────────────────────────────────────────────────
  modelStatus: protectedProcedure.query(async () => {
    const llmStatus = await checkLLMAvailability();
    return {
      nemotron: llmStatus,
      fallbackAvailable: true,
      activeModel: llmStatus.available && llmStatus.enabled ? llmStatus.model : "builtin-fallback",
    };
  }),

  // ── Chat ────────────────────────────────────────────────────────────────────
  chat: protectedProcedure
    .input(
      z.object({
        sessionId: z.string().default(() => nanoid()),
        message: z.string().min(1).max(4000),
        /** Optional context from the current page (agent IDs, alert data, etc.) */
        pageContext: z.record(z.string(), z.unknown()).optional(),
        /** Whether to inject live Wazuh telemetry into context */
        injectWazuhContext: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();

      // Load conversation history
      const history = db
        ? await db
            .select()
            .from(ragSessions)
            .where(eq(ragSessions.sessionId, input.sessionId))
            .orderBy(ragSessions.createdAt)
            .limit(20)
        : [];

      // Build context
      const wazuhContext = input.injectWazuhContext
        ? await buildWazuhContext()
        : "Wazuh context injection disabled for this query.";

      const pageContextStr = input.pageContext
        ? `\n## Current Page Context\n\`\`\`json\n${JSON.stringify(input.pageContext, null, 2)}\n\`\`\`\n`
        : "";

      const systemPrompt = buildSystemPrompt(wazuhContext + pageContextStr);

      // Build messages array
      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...history.map(h => ({
          role: h.role as "user" | "assistant",
          content: h.content,
        })),
        { role: "user", content: input.message },
      ];

      // Call model
      const response = await callLLM(messages);

      // Persist to DB
      if (db) {
        await db.insert(ragSessions).values([
          {
            sessionId: input.sessionId,
            role: "user",
            content: input.message,
            contextSnapshot: input.pageContext,
          },
          {
            sessionId: input.sessionId,
            role: "assistant",
            content: response,
          },
        ]);
      }

      return {
        sessionId: input.sessionId,
        response,
        model: (await checkLLMAvailability()).available ? (await getEffectiveLLMConfig()).model : "builtin-fallback",
      };
    }),

  // ── Session history ─────────────────────────────────────────────────────────
  sessionHistory: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return db
        .select()
        .from(ragSessions)
        .where(eq(ragSessions.sessionId, input.sessionId))
        .orderBy(ragSessions.createdAt);
    }),

  clearSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db.delete(ragSessions) as any).where(eq(ragSessions.sessionId, input.sessionId));
      return { success: true };
    }),

  // ── Analyst Notes CRUD ──────────────────────────────────────────────────────
  notes: router({
    list: protectedProcedure
      .input(
        z.object({
          agentId: z.string().optional(),
          ruleId: z.string().optional(),
          severity: z.enum(["critical", "high", "medium", "low", "info"]).optional(),
          resolved: z.boolean().optional(),
          limit: z.number().int().min(1).max(200).default(50),
          offset: z.number().int().min(0).default(0),
        })
      )
      .query(async ({ input }) => {
        const db = await requireDb();

        const conditions = [];
        if (input.agentId) conditions.push(eq(analystNotes.agentId, input.agentId));
        if (input.ruleId) conditions.push(eq(analystNotes.ruleId, input.ruleId));
        if (input.severity) conditions.push(eq(analystNotes.severity, input.severity));
        if (input.resolved !== undefined) {
          conditions.push(eq(analystNotes.resolved, input.resolved ? 1 : 0));
        }

        const query = db
          .select()
          .from(analystNotes)
          .orderBy(desc(analystNotes.createdAt))
          .limit(input.limit)
          .offset(input.offset);

        const notes = conditions.length > 0
          ? await db.select().from(analystNotes).where(and(...conditions)).orderBy(desc(analystNotes.createdAt)).limit(input.limit).offset(input.offset)
          : await query;

        return { notes };
      }),

    create: protectedProcedure
      .input(
        z.object({
          title: z.string().min(1).max(512),
          content: z.string().default(""),
          severity: z.enum(["critical", "high", "medium", "low", "info"]).default("info"),
          agentId: z.string().optional(),
          ruleId: z.string().optional(),
          cveId: z.string().optional(),
          tags: z.array(z.string()).default([]),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        const result = await db.insert(analystNotes).values({
          title: input.title,
          content: input.content,
          severity: input.severity,
          agentId: input.agentId,
          ruleId: input.ruleId,
          cveId: input.cveId,
          tags: input.tags,
          resolved: 0,
        });

        return { id: Number(result[0].insertId), success: true };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int(),
          title: z.string().min(1).max(512).optional(),
          content: z.string().optional(),
          severity: z.enum(["critical", "high", "medium", "low", "info"]).optional(),
          resolved: z.boolean().optional(),
          tags: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        const updates: Partial<typeof analystNotes.$inferInsert> = {};
        if (input.title !== undefined) updates.title = input.title;
        if (input.content !== undefined) updates.content = input.content;
        if (input.severity !== undefined) updates.severity = input.severity;
        if (input.resolved !== undefined) updates.resolved = input.resolved ? 1 : 0;
        if (input.tags !== undefined) updates.tags = input.tags;

        await db.update(analystNotes).set(updates).where(eq(analystNotes.id, input.id));
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
        await db.delete(analystNotes).where(eq(analystNotes.id, input.id));
        return { success: true };
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .query(async ({ input }) => {
        const db = await requireDb();
        const result = await db.select().from(analystNotes).where(eq(analystNotes.id, input.id)).limit(1);
        return result[0] ?? null;
      }),
  }),
});
