/**
 * Custom LLM Service — Routes LLM requests to a self-hosted endpoint or falls back to built-in.
 *
 * Supports OpenAI-compatible APIs (e.g., llama.cpp, vLLM, Ollama, TGI).
 * Configuration is read from the connection_settings table (category: 'llm')
 * with fallback to environment variables (LLM_HOST, LLM_PORT, LLM_MODEL, LLM_ENABLED).
 *
 * Nemotron-3-Nano-30B-A3B Specific Enhancements:
 * - NVIDIA-mandated temperature/top_p per inference mode (tool calling vs conversational)
 * - XML <tool_call> parser: converts Nemotron's native XML tool-call format to OpenAI JSON
 * - <think>...</think> reasoning trace extraction
 * - System prompt XML schema reminder injection (prevents 86% parser failure rate)
 * - Model auto-detection for Nemotron-specific parameter tuning
 */

import { getEffectiveSettings } from "../admin/connectionSettingsService";
import { invokeLLM as invokeBuiltInLLM, type InvokeParams, type InvokeResult } from "../_core/llm";
import { getDb } from "../db";
import { llmUsage } from "../../drizzle/schema";

// ── Types ───────────────────────────────────────────────────────────────────

export interface LLMConfig {
  host: string;
  port: number;
  model: string;
  apiKey?: string;
  enabled: boolean;
  protocol: string;
}

export interface LLMTestResult {
  success: boolean;
  message: string;
  latencyMs: number;
  models?: string[];
}

/** Parsed XML tool call from Nemotron's native format */
export interface ParsedToolCall {
  functionName: string;
  parameters: Record<string, string>;
}

/** Extracted thinking trace from <think>...</think> blocks */
export interface ThinkingTrace {
  content: string;
  durationEstimateTokens: number;
}

// ── Nemotron Model Detection ───────────────────────────────────────────────

/**
 * Detect if the configured model is a Nemotron variant.
 * Used to apply Nemotron-specific inference parameters automatically.
 */
export function isNemotronModel(modelName: string): boolean {
  const lower = modelName.toLowerCase();
  return lower.includes("nemotron") || lower.includes("nvidia-nemotron");
}

// ── NVIDIA-Mandated Inference Parameters ───────────────────────────────────

/**
 * Per Section 4.3 of the Nemotron integration analysis:
 * - Tool calling: temperature=0.6, top_p=0.95 (NVIDIA mandated)
 * - Conversational: temperature=1.0, top_p=1.0
 *
 * These values are critical — deviating causes:
 * - Higher temperature → tool hallucination (premature EOS, \boxed{} format)
 * - Lower temperature → repetitive/degenerate outputs
 */
export function getNemotronInferenceParams(mode: "tool_calling" | "conversational"): {
  temperature: number;
  top_p: number;
} {
  if (mode === "tool_calling") {
    return { temperature: 0.6, top_p: 0.95 };
  }
  return { temperature: 1.0, top_p: 1.0 };
}

// ── XML Tool-Call Parser ───────────────────────────────────────────────────

/**
 * Parse Nemotron's native XML tool-call format into structured data.
 *
 * Nemotron-3-Nano uses XML-style syntax (NOT OpenAI JSON) for function calls:
 *
 * ```xml
 * <tool_call>
 * <function=function_name>
 * <parameter=param_name>
 * value
 * </parameter>
 * </function>
 * </tool_call>
 * ```
 *
 * Crucial constraints (Section 4.2):
 * 1. Perfect nesting: <function> inside <tool_call>
 * 2. No conversational suffixes after </tool_call>
 * 3. Reasoning dependency: disabling thinking trace increases hallucination rate
 */
export function parseNemotronToolCalls(content: string): ParsedToolCall[] {
  const toolCalls: ParsedToolCall[] = [];

  // Match all <tool_call>...</tool_call> blocks
  const toolCallRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let toolCallMatch: RegExpExecArray | null;

  while ((toolCallMatch = toolCallRegex.exec(content)) !== null) {
    const block = toolCallMatch[1];

    // Extract function name: <function=function_name>
    const funcMatch = block.match(/<function=([^>]+)>/);
    if (!funcMatch) continue;

    const functionName = funcMatch[1].trim();
    const parameters: Record<string, string> = {};

    // Extract all parameters: <parameter=param_name>value</parameter>
    const paramRegex = /<parameter=([^>]+)>\s*([\s\S]*?)\s*<\/parameter>/g;
    let paramMatch: RegExpExecArray | null;

    while ((paramMatch = paramRegex.exec(block)) !== null) {
      const paramName = paramMatch[1].trim();
      const paramValue = paramMatch[2].trim();
      parameters[paramName] = paramValue;
    }

    toolCalls.push({ functionName, parameters });
  }

  return toolCalls;
}

/**
 * Convert Nemotron XML tool calls to OpenAI-compatible tool_calls format.
 * This allows the rest of the pipeline to work with a unified format
 * regardless of whether the model uses XML or JSON tool calling.
 */
export function convertXmlToolCallsToOpenAI(
  xmlToolCalls: ParsedToolCall[]
): Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> {
  return xmlToolCalls.map((tc, idx) => ({
    id: `nemotron_tc_${Date.now()}_${idx}`,
    type: "function" as const,
    function: {
      name: tc.functionName,
      arguments: JSON.stringify(tc.parameters),
    },
  }));
}

// ── Thinking Trace Extraction ──────────────────────────────────────────────

/**
 * Extract <think>...</think> reasoning traces from Nemotron responses.
 *
 * Per Section 4.1: The model uses <think> tags (Token IDs 12 and 13)
 * for chain-of-thought reasoning before tool calls.
 * Disabling thinking traces increases hallucination rate.
 */
export function extractThinkingTrace(content: string): {
  thinkingTrace: ThinkingTrace | null;
  cleanContent: string;
} {
  const thinkRegex = /<think>([\s\S]*?)<\/think>/;
  const match = content.match(thinkRegex);

  if (!match) {
    return { thinkingTrace: null, cleanContent: content };
  }

  const thinkContent = match[1].trim();
  // Rough token estimate: ~4 chars per token for English text
  const estimatedTokens = Math.ceil(thinkContent.length / 4);

  const cleanContent = content.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();

  return {
    thinkingTrace: {
      content: thinkContent,
      durationEstimateTokens: estimatedTokens,
    },
    cleanContent,
  };
}

// ── XML Schema Reminder for System Prompts ─────────────────────────────────

/**
 * Build the XML tool-calling schema reminder that MUST be included in system prompts
 * when using Nemotron with tool calling.
 *
 * Per Section 4.3: Without this reminder, the parser failure rate is 86%.
 * The reminder ensures the model outputs well-formed XML tool calls.
 */
export function buildXmlSchemaReminder(tools: Array<{ function: { name: string; parameters: unknown } }>): string {
  const toolList = tools.map(t => `  - ${t.function.name}`).join("\n");

  return [
    "",
    "TOOL CALLING FORMAT (MANDATORY):",
    "When you need to call a tool, you MUST use this exact XML format:",
    "",
    "<tool_call>",
    "<function=FUNCTION_NAME>",
    "<parameter=PARAM_NAME>",
    "value",
    "</parameter>",
    "</function>",
    "</tool_call>",
    "",
    "CRITICAL RULES:",
    "1. <function> MUST be nested inside <tool_call>",
    "2. Each <parameter> MUST be nested inside <function>",
    "3. Do NOT add any conversational text after </tool_call>",
    "4. Do NOT use JSON format for tool calls — use XML only",
    "5. Parameter values must be plain text, not JSON-encoded",
    "",
    "Available tools:",
    toolList,
    "",
  ].join("\n");
}

// ── Environment variable defaults ───────────────────────────────────────────

const ENV_DEFAULTS: LLMConfig = {
  host: process.env.LLM_HOST ?? "",
  port: parseInt(process.env.LLM_PORT ?? "30000", 10),
  model: process.env.LLM_MODEL ?? "unsloth/Nemotron-3-Nano-30B-A3B-GGUF",
  apiKey: "",
  enabled: process.env.LLM_ENABLED === "true",
  protocol: "http",
};

// ── Config Resolution ───────────────────────────────────────────────────────

/**
 * Get the effective LLM configuration (DB override → env → defaults).
 */
export async function getEffectiveLLMConfig(): Promise<LLMConfig> {
  try {
    const { values } = await getEffectiveSettings("llm");

    return {
      host: values.host || ENV_DEFAULTS.host,
      port: parseInt(values.port || String(ENV_DEFAULTS.port), 10),
      model: values.model || ENV_DEFAULTS.model,
      apiKey: values.api_key || ENV_DEFAULTS.apiKey,
      enabled: values.enabled === "true" || (values.enabled === undefined && ENV_DEFAULTS.enabled),
      protocol: values.protocol || ENV_DEFAULTS.protocol,
    };
  } catch {
    // If DB is unavailable, fall back to env
    return ENV_DEFAULTS;
  }
}

/**
 * Check if a custom LLM is configured and enabled.
 */
export async function isCustomLLMEnabled(): Promise<boolean> {
  const config = await getEffectiveLLMConfig();
  return config.enabled && !!config.host;
}

// ── Custom LLM Invocation ───────────────────────────────────────────────────

/**
 * Build the base URL for the custom LLM endpoint.
 */
function buildBaseUrl(config: LLMConfig): string {
  return `${config.protocol}://${config.host}:${config.port}`;
}

/**
 * Invoke the custom LLM endpoint (OpenAI-compatible /v1/chat/completions).
 *
 * When a Nemotron model is detected:
 * - Applies NVIDIA-mandated temperature/top_p based on whether tools are present
 * - Injects XML schema reminder into system prompt when tools are provided
 * - Parses XML tool calls from the response and converts to OpenAI format
 * - Extracts thinking traces from <think> blocks
 */
async function invokeCustomLLM(params: InvokeParams, config: LLMConfig): Promise<InvokeResult> {
  const url = `${buildBaseUrl(config)}/v1/chat/completions`;
  const nemotron = isNemotronModel(config.model);
  const hasTools = !!(params.tools && params.tools.length > 0);

  // Build the payload — OpenAI-compatible format
  const payload: Record<string, unknown> = {
    model: config.model,
    messages: params.messages.map(m => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    })),
  };

  // Add optional parameters
  if (params.maxTokens || params.max_tokens) {
    payload.max_tokens = params.maxTokens || params.max_tokens;
  } else {
    payload.max_tokens = 32768;
  }

  if (hasTools) {
    payload.tools = params.tools;
  }

  if (params.toolChoice || params.tool_choice) {
    payload.tool_choice = params.toolChoice || params.tool_choice;
  }

  // Handle response_format — some local models don't support json_schema,
  // so we fall back to json_object for structured output
  const responseFormat = params.responseFormat || params.response_format;
  if (responseFormat) {
    if (responseFormat.type === "json_schema") {
      // Try json_schema first; if the model doesn't support it,
      // the caller should handle the error and retry with json_object
      payload.response_format = { type: "json_object" };
      // Inject the schema into the system prompt for guidance
      const schemaStr = JSON.stringify(
        (responseFormat as { type: "json_schema"; json_schema: { schema: unknown } }).json_schema.schema,
        null,
        2
      );
      // Prepend schema instruction to the first system message, or create one if none exists.
      const messages = payload.messages as Array<{ role: string; content: string }>;
      const schemaInstruction = `You MUST respond with valid JSON matching this exact schema:\n${schemaStr}`;
      const systemIdx = messages.findIndex(m => m.role === "system");
      if (systemIdx >= 0) {
        messages[systemIdx].content += `\n\n${schemaInstruction}`;
      } else {
        messages.unshift({ role: "system", content: schemaInstruction });
      }
    } else {
      payload.response_format = responseFormat;
    }
  }

  // ── Nemotron-specific inference parameters ────────────────────────────────
  if (nemotron) {
    // NVIDIA-mandated temperature/top_p (Section 4.3)
    const inferenceMode = hasTools ? "tool_calling" : "conversational";
    const { temperature, top_p } = getNemotronInferenceParams(inferenceMode);
    payload.temperature = temperature;
    payload.top_p = top_p;

    // Inject XML schema reminder into system prompt when tools are present (Section 4.3)
    // This prevents the documented 86% parser failure rate
    if (hasTools && params.tools) {
      const messages = payload.messages as Array<{ role: string; content: string }>;
      const xmlReminder = buildXmlSchemaReminder(
        params.tools as Array<{ function: { name: string; parameters: unknown } }>
      );
      const systemIdx = messages.findIndex(m => m.role === "system");
      if (systemIdx >= 0) {
        messages[systemIdx].content += xmlReminder;
      } else {
        messages.unshift({ role: "system", content: xmlReminder });
      }
    }
  } else {
    // Non-Nemotron models: use a reasonable default
    payload.temperature = 0.7;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000), // 2 minute timeout for large models
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Custom LLM request failed: ${response.status} ${response.statusText} — ${errorText}`
    );
  }

  const result = (await response.json()) as InvokeResult;

  // ── Nemotron post-processing ──────────────────────────────────────────────
  if (nemotron) {
    const firstChoice = result.choices?.[0];
    if (firstChoice?.message?.content && typeof firstChoice.message.content === "string") {
      const rawContent = firstChoice.message.content;

      // Extract thinking trace
      const { thinkingTrace, cleanContent } = extractThinkingTrace(rawContent);

      // Parse XML tool calls if present
      const xmlToolCalls = parseNemotronToolCalls(rawContent);
      if (xmlToolCalls.length > 0) {
        // Convert XML tool calls to OpenAI format and attach to the message
        const openaiToolCalls = convertXmlToolCallsToOpenAI(xmlToolCalls);
        (firstChoice.message as Record<string, unknown>).tool_calls = openaiToolCalls;

        // Remove the XML tool call text from the content
        const contentWithoutToolCalls = cleanContent
          .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "")
          .trim();
        (firstChoice.message as Record<string, unknown>).content = contentWithoutToolCalls || null;
      } else {
        // No tool calls — just clean up thinking traces from visible content
        firstChoice.message.content = cleanContent;
      }

      // Attach thinking trace as metadata (non-standard field for observability)
      if (thinkingTrace) {
        (firstChoice.message as Record<string, unknown>)._thinkingTrace = thinkingTrace;
      }
    }
  }

  return result;
}

// ── Unified LLM Invocation ──────────────────────────────────────────────────

/**
 * Log token usage to the database (fire-and-forget).
 */
async function logUsage(entry: {
  model: string;
  source: "custom" | "builtin" | "fallback";
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  caller?: string;
  success: boolean;
  errorMessage?: string;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(llmUsage).values({
      model: entry.model,
      source: entry.source,
      promptTokens: entry.promptTokens,
      completionTokens: entry.completionTokens,
      totalTokens: entry.totalTokens,
      latencyMs: entry.latencyMs,
      caller: entry.caller,
      success: entry.success ? 1 : 0,
      errorMessage: entry.errorMessage,
    });
  } catch (err) {
    console.error(`[LLM] Failed to log usage: ${(err as Error).message}`);
  }
}

/**
 * Extract token usage from an LLM response.
 */
function extractUsage(result: InvokeResult): { promptTokens: number; completionTokens: number; totalTokens: number } {
  const usage = (result as { usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }).usage;
  return {
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
    totalTokens: usage?.total_tokens ?? 0,
  };
}

/**
 * Invoke LLM — routes to custom endpoint if configured, otherwise falls back to built-in.
 * Logs token usage for every call.
 *
 * This is the primary entry point that should be used instead of the raw invokeLLM.
 */
export async function invokeLLMWithFallback(params: InvokeParams & { caller?: string }): Promise<InvokeResult> {
  const config = await getEffectiveLLMConfig();
  const startTime = Date.now();

  if (config.enabled && config.host) {
    try {
      console.log(`[LLM] Using custom endpoint: ${buildBaseUrl(config)} (model: ${config.model}${isNemotronModel(config.model) ? ", nemotron-optimized" : ""})`);
      const result = await invokeCustomLLM(params, config);
      const latencyMs = Date.now() - startTime;
      const usage = extractUsage(result);

      // Log successful custom call
      logUsage({
        model: config.model,
        source: "custom",
        ...usage,
        latencyMs,
        caller: params.caller,
        success: true,
      });

      return result;
    } catch (err) {
      const customLatency = Date.now() - startTime;
      console.error(`[LLM] Custom endpoint failed: ${(err as Error).message}`);
      console.log("[LLM] Falling back to built-in LLM...");

      // Log failed custom attempt
      logUsage({
        model: config.model,
        source: "custom",
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs: customLatency,
        caller: params.caller,
        success: false,
        errorMessage: (err as Error).message,
      });

      // Fall back to built-in
      const fallbackStart = Date.now();
      const result = await invokeBuiltInLLM(params);
      const fallbackLatency = Date.now() - fallbackStart;
      const usage = extractUsage(result);

      // Log fallback call
      logUsage({
        model: result.model ?? "builtin",
        source: "fallback",
        ...usage,
        latencyMs: fallbackLatency,
        caller: params.caller,
        success: true,
      });

      return result;
    }
  }

  // Use built-in LLM
  const result = await invokeBuiltInLLM(params);
  const latencyMs = Date.now() - startTime;
  const usage = extractUsage(result);

  logUsage({
    model: result.model ?? "builtin",
    source: "builtin",
    ...usage,
    latencyMs,
    caller: params.caller,
    success: true,
  });

  return result;
}

// ── Test Connection ─────────────────────────────────────────────────────────

/**
 * Test connectivity to a custom LLM endpoint.
 * Tries /v1/models first, then a lightweight /v1/chat/completions call.
 */
export async function testLLMConnection(settings: Record<string, string>): Promise<LLMTestResult> {
  const host = settings.host;
  const port = settings.port || "30000";
  const protocol = settings.protocol || "http";
  const apiKey = settings.api_key || "";

  if (!host) {
    return { success: false, message: "Host is required", latencyMs: 0 };
  }

  const baseUrl = `${protocol}://${host}:${port}`;
  const startTime = Date.now();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  try {
    // Step 1: Try /v1/models to list available models
    const modelsResponse = await fetch(`${baseUrl}/v1/models`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10_000),
    });

    const latencyMs = Date.now() - startTime;

    if (modelsResponse.ok) {
      const modelsData = await modelsResponse.json() as { data?: Array<{ id: string }> };
      const models = modelsData.data?.map(m => m.id) ?? [];

      return {
        success: true,
        message: `Connected to LLM at ${host}:${port} — ${models.length} model(s) available`,
        latencyMs,
        models,
      };
    }

    // Step 2: If /v1/models fails, try a minimal completion request
    const completionResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: settings.model || "default",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const completionLatency = Date.now() - startTime;

    if (completionResponse.ok) {
      return {
        success: true,
        message: `Connected to LLM at ${host}:${port} (completions API verified)`,
        latencyMs: completionLatency,
      };
    }

    return {
      success: false,
      message: `LLM endpoint responded with status ${completionResponse.status}`,
      latencyMs: completionLatency,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const error = err as Error;

    if (error.name === "TimeoutError" || error.message?.includes("timeout")) {
      return {
        success: false,
        message: `Connection timed out after ${latencyMs}ms — is the LLM server running at ${host}:${port}?`,
        latencyMs,
      };
    }

    if (error.message?.includes("ECONNREFUSED")) {
      return {
        success: false,
        message: `Connection refused at ${host}:${port} — verify the LLM server is running and the port is correct`,
        latencyMs,
      };
    }

    return {
      success: false,
      message: `Connection error: ${error.message}`,
      latencyMs,
    };
  }
}
