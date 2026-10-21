/**
 * extractJson — single shared parser for LLM structured output (H-L3).
 *
 * LLM providers (notably Nemotron and other reasoning models served via
 * OpenAI-compatible endpoints) frequently wrap JSON replies in:
 *   - `<think> ... </think>` reasoning blocks (sometimes unterminated when the
 *     reply is truncated),
 *   - Markdown code fences (```json ... ``` or ``` ... ```),
 *   - leading or trailing prose ("Here is the analysis: {...} Hope this helps").
 *
 * A raw `JSON.parse(content)` throws on all of those. This helper normalises
 * the reply and parses it, and on failure throws a descriptive Error that
 * includes the first 200 characters of the cleaned input so the failure is
 * diagnosable from logs / stage error messages.
 */

const THINK_BLOCK_RE = /<think\b[^>]*>[\s\S]*?<\/think\s*>/gi;
const THINK_OPEN_RE = /<think\b[^>]*>/i;
const STRAY_THINK_CLOSE_RE = /<\/think\s*>/gi;

/**
 * Remove `<think>…</think>` reasoning blocks. An unterminated `<think>` drops
 * everything from the tag to the end of the string. A stray closing tag (some
 * servers strip the opening tag but leave the close) drops everything before it.
 */
export function stripThinkBlocks(raw: string): string {
  let out = raw.replace(THINK_BLOCK_RE, "");
  const open = out.search(THINK_OPEN_RE);
  if (open !== -1) out = out.slice(0, open);
  // Stray close tag: reasoning text preceded it with no opening tag.
  let lastClose = -1;
  let m: RegExpExecArray | null;
  STRAY_THINK_CLOSE_RE.lastIndex = 0;
  while ((m = STRAY_THINK_CLOSE_RE.exec(out)) !== null) {
    lastClose = m.index + m[0].length;
  }
  if (lastClose !== -1) out = out.slice(lastClose);
  return out.trim();
}

/** Remove Markdown code fences (```json, ```JSON, ``` …). */
export function stripCodeFences(raw: string): string {
  let out = raw.trim();
  // Prefer the content of the first fenced block if one exists.
  const fenced = /```[a-zA-Z0-9_-]*[ \t]*\r?\n?([\s\S]*?)```/.exec(out);
  if (fenced) return fenced[1].trim();
  // Unterminated opening fence (truncated reply).
  out = out.replace(/^```[a-zA-Z0-9_-]*[ \t]*\r?\n?/, "");
  out = out.replace(/\r?\n?```\s*$/, "");
  return out.trim();
}

/**
 * Find the first balanced top-level `{…}` or `[…]` in `text`, respecting
 * string literals and escapes. Returns null if none is balanced.
 */
function findBalancedJson(text: string): string | null {
  for (let start = 0; start < text.length; start++) {
    const ch = text[start];
    if (ch !== "{" && ch !== "[") continue;
    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "{" || c === "[") stack.push(c === "{" ? "}" : "]");
      else if (c === "}" || c === "]") {
        if (stack.pop() !== c) break; // mismatched — try the next start
        if (stack.length === 0) {
          const candidate = text.slice(start, i + 1);
          try {
            JSON.parse(candidate);
            return candidate;
          } catch {
            break; // balanced but not JSON — try the next start
          }
        }
      }
    }
  }
  return null;
}

/** Strip think blocks and fences — the text that extractJson will parse. */
export function cleanLlmText(raw: string): string {
  return stripCodeFences(stripThinkBlocks(raw));
}

/**
 * Parse JSON out of an LLM reply. Throws a descriptive Error on failure.
 */
export function extractJson(raw: string): unknown {
  if (typeof raw !== "string") {
    throw new Error(`extractJson: expected string input, got ${typeof raw}`);
  }
  const cleaned = cleanLlmText(raw);
  if (cleaned.length > 0) {
    try {
      return JSON.parse(cleaned);
    } catch {
      // fall through to balanced-substring extraction
    }
    const candidate = findBalancedJson(cleaned);
    if (candidate !== null) return JSON.parse(candidate);
  }
  const preview = cleaned.slice(0, 200);
  throw new Error(
    `extractJson: LLM reply did not contain valid JSON (cleaned length ${cleaned.length}). ` +
      `First 200 chars: ${JSON.stringify(preview)}`
  );
}
