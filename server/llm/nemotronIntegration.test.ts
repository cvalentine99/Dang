import { describe, it, expect } from "vitest";
import {
  isNemotronModel,
  getNemotronInferenceParams,
  parseNemotronToolCalls,
  convertXmlToolCallsToOpenAI,
  extractThinkingTrace,
  buildXmlSchemaReminder,
} from "./llmService";

// ── Nemotron Model Detection ───────────────────────────────────────────────

describe("isNemotronModel", () => {
  it("should detect Nemotron model from full GGUF name", () => {
    expect(isNemotronModel("unsloth/Nemotron-3-Nano-30B-A3B-GGUF")).toBe(true);
  });

  it("should detect Nemotron model case-insensitively", () => {
    expect(isNemotronModel("NEMOTRON-3-Nano-30B")).toBe(true);
    expect(isNemotronModel("nemotron-3-nano-30b")).toBe(true);
  });

  it("should detect nvidia-nemotron variant", () => {
    expect(isNemotronModel("nvidia-nemotron-3-nano")).toBe(true);
    expect(isNemotronModel("nvidia/Nemotron-3-Nano-30B-A3B")).toBe(true);
  });

  it("should return false for non-Nemotron models", () => {
    expect(isNemotronModel("gpt-4")).toBe(false);
    expect(isNemotronModel("llama-3.1-70b")).toBe(false);
    expect(isNemotronModel("claude-3-opus")).toBe(false);
    expect(isNemotronModel("mistral-7b")).toBe(false);
  });

  it("should return false for empty string", () => {
    expect(isNemotronModel("")).toBe(false);
  });
});

// ── NVIDIA-Mandated Inference Parameters ───────────────────────────────────

describe("getNemotronInferenceParams", () => {
  it("should return tool_calling parameters (temp=0.6, top_p=0.95)", () => {
    const params = getNemotronInferenceParams("tool_calling");
    expect(params.temperature).toBe(0.6);
    expect(params.top_p).toBe(0.95);
  });

  it("should return conversational parameters (temp=1.0, top_p=1.0)", () => {
    const params = getNemotronInferenceParams("conversational");
    expect(params.temperature).toBe(1.0);
    expect(params.top_p).toBe(1.0);
  });
});

// ── XML Tool-Call Parser ───────────────────────────────────────────────────

describe("parseNemotronToolCalls", () => {
  it("should parse a single well-formed XML tool call", () => {
    const content = `<tool_call>
<function=search_alerts>
<parameter=agentId>
001
</parameter>
<parameter=level>
12
</parameter>
</function>
</tool_call>`;

    const result = parseNemotronToolCalls(content);

    expect(result).toHaveLength(1);
    expect(result[0].functionName).toBe("search_alerts");
    expect(result[0].parameters).toEqual({
      agentId: "001",
      level: "12",
    });
  });

  it("should parse multiple tool calls in one response", () => {
    const content = `<tool_call>
<function=get_agent_info>
<parameter=agentId>
003
</parameter>
</function>
</tool_call>
<tool_call>
<function=search_vulnerabilities>
<parameter=agentId>
003
</parameter>
<parameter=severity>
Critical
</parameter>
</function>
</tool_call>`;

    const result = parseNemotronToolCalls(content);

    expect(result).toHaveLength(2);
    expect(result[0].functionName).toBe("get_agent_info");
    expect(result[0].parameters).toEqual({ agentId: "003" });
    expect(result[1].functionName).toBe("search_vulnerabilities");
    expect(result[1].parameters).toEqual({ agentId: "003", severity: "Critical" });
  });

  it("should handle tool call with no parameters", () => {
    const content = `<tool_call>
<function=get_cluster_status>
</function>
</tool_call>`;

    const result = parseNemotronToolCalls(content);

    expect(result).toHaveLength(1);
    expect(result[0].functionName).toBe("get_cluster_status");
    expect(result[0].parameters).toEqual({});
  });

  it("should return empty array when no tool calls present", () => {
    const content = "This is a regular response with no tool calls.";
    const result = parseNemotronToolCalls(content);
    expect(result).toHaveLength(0);
  });

  it("should handle malformed XML gracefully (missing function tag)", () => {
    const content = `<tool_call>
<parameter=agentId>001</parameter>
</tool_call>`;

    const result = parseNemotronToolCalls(content);
    // Should return empty because no <function=...> tag found
    expect(result).toHaveLength(0);
  });

  it("should handle tool call with multiline parameter values", () => {
    const content = `<tool_call>
<function=search_alerts>
<parameter=query>
rule.level >= 12 AND
agent.id = "001" AND
timestamp > "2025-01-01"
</parameter>
</function>
</tool_call>`;

    const result = parseNemotronToolCalls(content);

    expect(result).toHaveLength(1);
    expect(result[0].parameters.query).toContain("rule.level >= 12");
    expect(result[0].parameters.query).toContain('agent.id = "001"');
  });

  it("should handle tool call mixed with conversational text", () => {
    const content = `Let me search for that information.

<tool_call>
<function=search_alerts>
<parameter=agentId>
001
</parameter>
</function>
</tool_call>

I found the following results.`;

    const result = parseNemotronToolCalls(content);

    expect(result).toHaveLength(1);
    expect(result[0].functionName).toBe("search_alerts");
  });

  it("should trim whitespace from parameter names and values", () => {
    const content = `<tool_call>
<function=  search_alerts  >
<parameter=  agentId  >
  001  
</parameter>
</function>
</tool_call>`;

    const result = parseNemotronToolCalls(content);

    expect(result).toHaveLength(1);
    expect(result[0].functionName).toBe("search_alerts");
    expect(result[0].parameters.agentId).toBe("001");
  });
});

// ── Convert XML Tool Calls to OpenAI Format ────────────────────────────────

describe("convertXmlToolCallsToOpenAI", () => {
  it("should convert parsed tool calls to OpenAI format", () => {
    const xmlToolCalls = [
      {
        functionName: "search_alerts",
        parameters: { agentId: "001", level: "12" },
      },
    ];

    const result = convertXmlToolCallsToOpenAI(xmlToolCalls);

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("function");
    expect(result[0].function.name).toBe("search_alerts");
    expect(JSON.parse(result[0].function.arguments)).toEqual({
      agentId: "001",
      level: "12",
    });
    expect(result[0].id).toMatch(/^nemotron_tc_/);
  });

  it("should generate unique IDs for multiple tool calls", () => {
    const xmlToolCalls = [
      { functionName: "func_a", parameters: {} },
      { functionName: "func_b", parameters: {} },
    ];

    const result = convertXmlToolCallsToOpenAI(xmlToolCalls);

    expect(result[0].id).not.toBe(result[1].id);
  });

  it("should handle empty tool calls array", () => {
    const result = convertXmlToolCallsToOpenAI([]);
    expect(result).toHaveLength(0);
  });
});

// ── Thinking Trace Extraction ──────────────────────────────────────────────

describe("extractThinkingTrace", () => {
  it("should extract thinking trace from response", () => {
    const content = `<think>
The user is asking about agent 001's recent alerts.
I should search for high-severity alerts first.
Let me check the alert timeline.
</think>

Based on my analysis, agent 001 has 3 critical alerts.`;

    const { thinkingTrace, cleanContent } = extractThinkingTrace(content);

    expect(thinkingTrace).not.toBeNull();
    expect(thinkingTrace!.content).toContain("agent 001's recent alerts");
    expect(thinkingTrace!.content).toContain("high-severity alerts");
    expect(thinkingTrace!.durationEstimateTokens).toBeGreaterThan(0);
    expect(cleanContent).toBe("Based on my analysis, agent 001 has 3 critical alerts.");
    expect(cleanContent).not.toContain("<think>");
  });

  it("should return null trace when no thinking block present", () => {
    const content = "This is a direct response without thinking.";
    const { thinkingTrace, cleanContent } = extractThinkingTrace(content);

    expect(thinkingTrace).toBeNull();
    expect(cleanContent).toBe(content);
  });

  it("should handle empty thinking block", () => {
    const content = "<think></think>Some response.";
    const { thinkingTrace, cleanContent } = extractThinkingTrace(content);

    expect(thinkingTrace).not.toBeNull();
    expect(thinkingTrace!.content).toBe("");
    expect(cleanContent).toBe("Some response.");
  });

  it("should estimate token count roughly (4 chars per token)", () => {
    const thinkContent = "A".repeat(400); // 400 chars ≈ 100 tokens
    const content = `<think>${thinkContent}</think>Response.`;
    const { thinkingTrace } = extractThinkingTrace(content);

    expect(thinkingTrace!.durationEstimateTokens).toBe(100);
  });

  it("should handle thinking trace with tool calls after it", () => {
    const content = `<think>
I need to check the agent status first.
</think>

<tool_call>
<function=get_agent_info>
<parameter=agentId>001</parameter>
</function>
</tool_call>`;

    const { thinkingTrace, cleanContent } = extractThinkingTrace(content);

    expect(thinkingTrace).not.toBeNull();
    expect(thinkingTrace!.content).toContain("check the agent status");
    // The clean content should still contain the tool call (tool call removal is separate)
    expect(cleanContent).toContain("<tool_call>");
  });
});

// ── XML Schema Reminder Builder ────────────────────────────────────────────

describe("buildXmlSchemaReminder", () => {
  it("should build a valid XML schema reminder with tool names", () => {
    const tools = [
      { function: { name: "search_alerts", parameters: {} } },
      { function: { name: "get_agent_info", parameters: {} } },
    ];

    const reminder = buildXmlSchemaReminder(tools);

    expect(reminder).toContain("TOOL CALLING FORMAT (MANDATORY)");
    expect(reminder).toContain("<tool_call>");
    expect(reminder).toContain("<function=FUNCTION_NAME>");
    expect(reminder).toContain("<parameter=PARAM_NAME>");
    expect(reminder).toContain("search_alerts");
    expect(reminder).toContain("get_agent_info");
    expect(reminder).toContain("CRITICAL RULES:");
    expect(reminder).toContain("Do NOT use JSON format");
  });

  it("should handle empty tools array", () => {
    const reminder = buildXmlSchemaReminder([]);

    expect(reminder).toContain("TOOL CALLING FORMAT (MANDATORY)");
    expect(reminder).toContain("Available tools:");
  });

  it("should list all tool names", () => {
    const tools = [
      { function: { name: "tool_a", parameters: {} } },
      { function: { name: "tool_b", parameters: {} } },
      { function: { name: "tool_c", parameters: {} } },
    ];

    const reminder = buildXmlSchemaReminder(tools);

    expect(reminder).toContain("- tool_a");
    expect(reminder).toContain("- tool_b");
    expect(reminder).toContain("- tool_c");
  });
});

// ── End-to-End XML Parsing Pipeline ────────────────────────────────────────

describe("End-to-End: Thinking + Tool Call + Conversion", () => {
  it("should handle a complete Nemotron response with thinking and tool calls", () => {
    const rawResponse = `<think>
The analyst wants to know about critical vulnerabilities on agent 005.
I should search the vulnerability database for this agent.
</think>

Let me look up the vulnerability data for agent 005.

<tool_call>
<function=search_vulnerabilities>
<parameter=agentId>
005
</parameter>
<parameter=severity>
Critical
</parameter>
</function>
</tool_call>`;

    // Step 1: Extract thinking trace
    const { thinkingTrace, cleanContent } = extractThinkingTrace(rawResponse);
    expect(thinkingTrace).not.toBeNull();
    expect(thinkingTrace!.content).toContain("critical vulnerabilities on agent 005");

    // Step 2: Parse XML tool calls
    const xmlToolCalls = parseNemotronToolCalls(cleanContent);
    expect(xmlToolCalls).toHaveLength(1);
    expect(xmlToolCalls[0].functionName).toBe("search_vulnerabilities");
    expect(xmlToolCalls[0].parameters.agentId).toBe("005");
    expect(xmlToolCalls[0].parameters.severity).toBe("Critical");

    // Step 3: Convert to OpenAI format
    const openaiToolCalls = convertXmlToolCallsToOpenAI(xmlToolCalls);
    expect(openaiToolCalls).toHaveLength(1);
    expect(openaiToolCalls[0].type).toBe("function");
    expect(openaiToolCalls[0].function.name).toBe("search_vulnerabilities");
    expect(JSON.parse(openaiToolCalls[0].function.arguments)).toEqual({
      agentId: "005",
      severity: "Critical",
    });
  });

  it("should handle a conversational response (no tools, no thinking)", () => {
    const rawResponse = "Agent 005 has been online for 72 hours with no critical alerts.";

    const { thinkingTrace, cleanContent } = extractThinkingTrace(rawResponse);
    expect(thinkingTrace).toBeNull();

    const xmlToolCalls = parseNemotronToolCalls(cleanContent);
    expect(xmlToolCalls).toHaveLength(0);

    // Clean content should be the original response
    expect(cleanContent).toBe(rawResponse);
  });
});
