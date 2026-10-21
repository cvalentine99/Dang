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
import { recordAnalystAction, requireOwnerOrAdmin, isAdmin } from "../_core/analystAudit";
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
    caller: "hybridrag_chat",
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
  // M8: live Wazuh JSON is attacker-influenced (agent names, etc.) — frame it as untrusted.
  const { wrapUntrustedData } = await import("../enhancedLLM/enhancedLLMService");

  try {
    const summary = await wazuhGet(config, { path: "/agents/summary/status" }) as Record<string, unknown>;
    const data = (summary as { data?: Record<string, unknown> }).data ?? summary;
    lines.push(`### Agent Summary\n${wrapUntrustedData(data)}\n`);
  } catch { lines.push("Agent summary: unavailable\n"); }

  try {
    const analysisd = await wazuhGet(config, { path: "/manager/stats/analysisd" }) as Record<string, unknown>;
    const data = (analysisd as { data?: Record<string, unknown> }).data ?? analysisd;
    lines.push(`### Analysis Engine Stats\n${wrapUntrustedData(data)}\n`);
  } catch { lines.push("Analysisd stats: unavailable\n"); }

  return lines.join("\n");
}

// ── RAG session ownership (C8/H-A4) ───────────────────────────────────────────
/**
 * Chat sessions are strictly per-analyst. Returns normally when the caller may
 * read/write `sessionId`; throws FORBIDDEN otherwise. A sessionId with no rows
 * is a new session (caller becomes owner on first write). Legacy rows
 * (userId NULL) are admin-only. Admin may access any session.
 */
type RagDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export async function assertRagSessionAccess(
  db: RagDb,
  ctx: { user: { id: number; role?: string | null } },
  sessionId: string,
): Promise<void> {
  if (isAdmin(ctx)) return;
  const owners = await db
    .selectDistinct({ userId: ragSessions.userId })
    .from(ragSessions)
    .where(eq(ragSessions.sessionId, sessionId))
    .limit(5);
  if (owners.some((o) => o.userId !== ctx.user.id)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This chat session belongs to another analyst." });
  }
}

/** Row predicate for a session's messages: admin sees all rows, analysts only their own. */
function ragSessionScope(ctx: { user: { id: number; role?: string | null } }, sessionId: string) {
  return isAdmin(ctx)
    ? eq(ragSessions.sessionId, sessionId)
    : and(eq(ragSessions.sessionId, sessionId), eq(ragSessions.userId, ctx.user.id));
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
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();

      // C8/H-A4: a sessionId owned by another analyst is FORBIDDEN (read AND write —
      // injected turns would be replayed to the victim as trusted dialogue).
      if (db) await assertRagSessionAccess(db, ctx, input.sessionId);

      // Load conversation history (owner-scoped; admin sees the full session)
      const history = db
        ? await db
            .select()
            .from(ragSessions)
            .where(ragSessionScope(ctx, input.sessionId))
            .orderBy(ragSessions.createdAt)
            .limit(20)
        : [];

      // Build context
      const wazuhContext = input.injectWazuhContext
        ? await buildWazuhContext()
        : "Wazuh context injection disabled for this query.";

      // S-6 + Ticket 3: Standardize untrusted-data handling.
      // Use wrapUntrustedData() for consistent delimiter framing and anti-obedience
      // instruction, matching the Enhanced LLM path. Previously this used an
      // ad-hoc "treat as untrusted" label without the <<<>>> delimiters.
      let pageContextStr = "";
      if (input.pageContext) {
        const { wrapUntrustedData } = await import("../enhancedLLM/enhancedLLMService");
        pageContextStr = `\n## Current Page Context\n${wrapUntrustedData(input.pageContext)}\n`;
      }

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
            userId: ctx.user.id,
          },
          {
            sessionId: input.sessionId,
            role: "assistant",
            content: response,
            userId: ctx.user.id,
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
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      await assertRagSessionAccess(db, ctx, input.sessionId);
      return db
        .select()
        .from(ragSessions)
        .where(ragSessionScope(ctx, input.sessionId))
        .orderBy(ragSessions.createdAt);
    }),

  clearSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await assertRagSessionAccess(db, ctx, input.sessionId);
      if (isAdmin(ctx)) {
        // Admin may clear any session (incl. legacy NULL-owner rows) — attributed.
        await recordAnalystAction(db, {
          userId: ctx.user.id,
          action: "hybridrag.clearSession",
          targetType: "rag_session",
          targetId: input.sessionId,
        });
      }
      await db.delete(ragSessions).where(ragSessionScope(ctx, input.sessionId));
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
          /** Team-global read is allowed, but the default view is the caller's own notes (H-A4). */
          includeTeam: z.boolean().default(false),
        })
      )
      .query(async ({ input, ctx }) => {
        const db = await requireDb();

        const conditions = [];
        if (!input.includeTeam) conditions.push(eq(analystNotes.createdBy, ctx.user.id));
        if (input.agentId) conditions.push(eq(analystNotes.agentId, input.agentId));
        if (input.ruleId) conditions.push(eq(analystNotes.ruleId, input.ruleId));
        if (input.severity) conditions.push(eq(analystNotes.severity, input.severity));
        if (input.resolved !== undefined) {
          conditions.push(eq(analystNotes.resolved, input.resolved ? 1 : 0));
        }

        const notes = await db
          .select()
          .from(analystNotes)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(analystNotes.createdAt))
          .limit(input.limit)
          .offset(input.offset);

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
      .mutation(async ({ input, ctx }) => {
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
          createdBy: ctx.user.id,
        });

        return { id: Number(result[0].insertId), success: true };
      }),

    // Ownership enforcement: owner can update their own notes, admins can update any.
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
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        // Ownership check: must be owner or admin
        const [note] = await db.select({ createdBy: analystNotes.createdBy })
          .from(analystNotes).where(eq(analystNotes.id, input.id)).limit(1);
        if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
        // H-A4: no null-owner fail-open — a NULL owner (legacy note) is admin-only.
        requireOwnerOrAdmin(ctx, note.createdBy, "note");

        const updates: Partial<typeof analystNotes.$inferInsert> = {};
        if (input.title !== undefined) updates.title = input.title;
        if (input.content !== undefined) updates.content = input.content;
        if (input.severity !== undefined) updates.severity = input.severity;
        if (input.resolved !== undefined) updates.resolved = input.resolved ? 1 : 0;
        if (input.tags !== undefined) updates.tags = input.tags;

        await recordAnalystAction(db, {
          userId: ctx.user.id,
          action: "notes.update",
          targetType: "analyst_note",
          targetId: input.id,
          metadata: { ownerUserId: note.createdBy, fields: Object.keys(updates) },
        });
        await db.update(analystNotes).set(updates).where(eq(analystNotes.id, input.id));
        return { success: true };
      }),

    // Ownership enforcement: owner can delete their own notes, admins can delete any.
    delete: protectedProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

        const [note] = await db.select({ createdBy: analystNotes.createdBy })
          .from(analystNotes).where(eq(analystNotes.id, input.id)).limit(1);
        if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
        requireOwnerOrAdmin(ctx, note.createdBy, "note");

        await recordAnalystAction(db, {
          userId: ctx.user.id,
          action: "notes.delete",
          targetType: "analyst_note",
          targetId: input.id,
          metadata: { ownerUserId: note.createdBy },
        });
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
