import { ENV } from "./env";
import { stripThinkBlocks } from "../llm/extractJson";

/**
 * H-L4: Sampling parameters for STRUCTURED output (any request that sets
 * response_format). Security judgements (triage severity, correlation,
 * hypotheses, classification) must be near-deterministic, so we use a low
 * temperature regardless of model or tool presence. The Nemotron
 * conversational/tool-calling presets (temperature 1.0 / 0.6) apply only to
 * free-form chat. Shared by the fallback client and server/llm/llmService.ts.
 */
export const STRUCTURED_OUTPUT_INFERENCE_PARAMS = Object.freeze({
  temperature: 0.1,
  top_p: 0.9,
});

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  /** H-L5: triggering user for per-user fairness in the LLM dispatcher (not sent upstream). */
  userId?: number | string;
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

/** Host/port of the built-in (fallback) client. Used by llmService (M10) to
 *  refuse a "fallback" that is the same server as the primary. */
export const getBuiltInEndpoint = (): { host: string; port: string } => ({
  host: process.env.LLM_HOST ?? "192.168.50.110",
  port: process.env.LLM_PORT ?? "30000",
});

const resolveApiUrl = () => {
  const { host, port } = getBuiltInEndpoint();
  return `http://${host}:${port}/v1/chat/completions`;
};

/** M9: default/ceiling for max_tokens (LLM_MAX_OUTPUT_TOKENS, default 32768). */
export const getMaxOutputTokensCap = (): number => {
  const n = parseInt(process.env.LLM_MAX_OUTPUT_TOKENS ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 32768;
};

/**
 * M9: honor the caller's requested max tokens (maxTokens / max_tokens),
 * capped by LLM_MAX_OUTPUT_TOKENS; the cap is also the default.
 */
export const resolveMaxTokens = (params: { maxTokens?: number; max_tokens?: number }): number => {
  const cap = getMaxOutputTokensCap();
  const requested = params.maxTokens ?? params.max_tokens;
  if (typeof requested !== "number" || !Number.isFinite(requested) || requested <= 0) return cap;
  return Math.min(Math.floor(requested), cap);
};

const assertApiKey = () => {
  // No API key needed for local llama.cpp
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const payload: Record<string, unknown> = {
    model: process.env.LLM_MODEL ?? "Nemotron-3-Nano-30B-A3B-UD-Q8_K_XL.gguf",
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  payload.max_tokens = resolveMaxTokens(params);

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
    // H-L4: structured output → low-temperature sampling.
    if (normalizedResponseFormat.type !== "text") {
      payload.temperature = STRUCTURED_OUTPUT_INFERENCE_PARAMS.temperature;
      payload.top_p = STRUCTURED_OUTPUT_INFERENCE_PARAMS.top_p;
    }
  }

  const response = await fetch(resolveApiUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120_000), // 2 minute timeout for large model inference
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  const result = (await response.json()) as InvokeResult;

  // H-L3: Nemotron/reasoning-model post-processing for the fallback client —
  // strip <think>…</think> blocks (including unterminated ones) from visible
  // content, using the same helper as extractJson.
  for (const choice of result.choices ?? []) {
    const msg = choice?.message;
    if (msg && typeof msg.content === "string" && /<\/?think\b/i.test(msg.content)) {
      msg.content = stripThinkBlocks(msg.content);
    }
  }

  return result;
}
