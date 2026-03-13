/**
 * Shared prompt sanitization utility for the agentic pipeline.
 *
 * Extracted from correlationAgent.ts to be reusable across all pipeline stages
 * that embed external/telemetry data into LLM prompts.
 *
 * Audit: All raw data entering LLM prompts MUST pass through this function
 * or an equivalent boundary. See PROMPT-STACK-AUDIT-2026-03-13.md §5.
 */

/**
 * Sanitize raw data before embedding in LLM prompts to prevent prompt injection.
 *
 * - Strips control characters (keeps \n, \r, \t for readability)
 * - Escapes markdown code fences to prevent code block breakout
 * - Hard caps string fields at `maxFieldLength` (default 4096)
 * - Recursively handles nested objects and arrays
 */
export function sanitizeForPrompt(obj: unknown, maxFieldLength = 4096): unknown {
  if (typeof obj === "string") {
    return obj
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "") // control chars (keep \n, \r, \t)
      .replace(/```/g, "\u2018\u2018\u2018") // prevent markdown code fence escapes
      .slice(0, maxFieldLength); // hard length cap per field
  }
  if (Array.isArray(obj)) return obj.map(item => sanitizeForPrompt(item, maxFieldLength));
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = sanitizeForPrompt(v, maxFieldLength);
    }
    return result;
  }
  return obj;
}
