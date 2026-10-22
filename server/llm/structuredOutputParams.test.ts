/**
 * H-L4 / H-L3 regression tests for the LLM clients:
 *  - structured output (response_format set) uses low-temperature sampling
 *  - the fallback client strips <think> blocks from content
 *  - the custom client downgrade path appends the JSON-only instruction
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { invokeLLM, STRUCTURED_OUTPUT_INFERENCE_PARAMS } from "../_core/llm";

const originalFetch = global.fetch;

function mockFetch(content: string) {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      id: "x",
      created: 0,
      model: "m",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    }),
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe("STRUCTURED_OUTPUT_INFERENCE_PARAMS", () => {
  it("is low temperature (<= 0.2)", () => {
    expect(STRUCTURED_OUTPUT_INFERENCE_PARAMS.temperature).toBe(0.1);
    expect(STRUCTURED_OUTPUT_INFERENCE_PARAMS.top_p).toBe(0.9);
  });
});

describe("_core/llm invokeLLM (fallback client)", () => {
  it("sends structured-output sampling params when response_format is set", async () => {
    const fn = mockFetch('{"a":1}');
    await invokeLLM({
      messages: [{ role: "user", content: "hi" }],
      response_format: { type: "json_object" },
    });
    const body = JSON.parse(fn.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.1);
    expect(body.top_p).toBe(0.9);
  });

  it("does not force temperature for free-form chat", async () => {
    const fn = mockFetch("hello");
    await invokeLLM({ messages: [{ role: "user", content: "hi" }] });
    const body = JSON.parse(fn.mock.calls[0][1].body);
    expect(body.temperature).toBeUndefined();
  });

  it("strips <think> blocks from returned content", async () => {
    mockFetch('<think>\nreasoning\n</think>\n{"ok":true}');
    const res = await invokeLLM({ messages: [{ role: "user", content: "hi" }] });
    expect(res.choices[0].message.content).toBe('{"ok":true}');
  });

  it("drops unterminated <think> content", async () => {
    mockFetch("answer<think>never closed");
    const res = await invokeLLM({ messages: [{ role: "user", content: "hi" }] });
    expect(res.choices[0].message.content).toBe("answer");
  });
});

describe("llmService custom client (source guards)", () => {
  const src = readFileSync(resolve(__dirname, "llmService.ts"), "utf-8");

  it("uses STRUCTURED_OUTPUT_INFERENCE_PARAMS when response_format is set", () => {
    expect(src).toContain("STRUCTURED_OUTPUT_INFERENCE_PARAMS.temperature");
    expect(src).toMatch(/if \(!structuredOutput\) \{\s*const inferenceMode = hasTools/);
  });

  it("appends a JSON-only instruction and logs the downgrade once", () => {
    expect(src).toContain("JSON_ONLY_INSTRUCTION");
    expect(src).toContain("jsonSchemaDowngradeLogged");
    expect(src).toContain("console.debug(");
  });
});
