import { describe, it, expect } from "vitest";
import { extractJson, stripThinkBlocks, stripCodeFences } from "./extractJson";

describe("extractJson", () => {
  it("parses plain JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("strips ```json fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('```JSON\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("strips bare ``` fences", () => {
    expect(extractJson('```\n{"b":[1]}\n```')).toEqual({ b: [1] });
  });

  it("strips multi-line, case-insensitive think blocks", () => {
    const raw = '<THINK>\nlet me reason {"no":1}\nmore\n</Think>\n{"ok":true}';
    expect(extractJson(raw)).toEqual({ ok: true });
  });

  it("drops an unterminated think block to end of input", () => {
    const raw = '{"ok":true}\n<think>still reasoning {"bad":';
    expect(extractJson(raw)).toEqual({ ok: true });
    expect(stripThinkBlocks("<think>never closed")).toBe("");
  });

  it("handles think block followed by fenced JSON", () => {
    const raw = '<think>hmm</think>\n```json\n{"x":"y"}\n```';
    expect(extractJson(raw)).toEqual({ x: "y" });
  });

  it("extracts JSON after leading prose", () => {
    expect(extractJson('Here is the result: {"severity":"high"}')).toEqual({ severity: "high" });
  });

  it("extracts JSON before trailing text", () => {
    expect(extractJson('{"severity":"low","note":"a } in a string"} Hope this helps!')).toEqual({
      severity: "low",
      note: "a } in a string",
    });
  });

  it("extracts a top-level array from prose", () => {
    expect(extractJson("Results: [1, {\"a\": [2]}] done")).toEqual([1, { a: [2] }]);
  });

  it("throws on truncated input with a preview of the cleaned text", () => {
    expect(() => extractJson('{"workingTheory": {"statement": "trunc')).toThrow(/did not contain valid JSON/);
    expect(() => extractJson('{"workingTheory": {"statement": "trunc')).toThrow(/workingTheory/);
  });

  it("throws on empty or think-only input", () => {
    expect(() => extractJson("")).toThrow(/extractJson/);
    expect(() => extractJson("<think>only reasoning</think>")).toThrow(/extractJson/);
  });

  it("limits the preview in the error to 200 chars", () => {
    const long = "x".repeat(1000);
    try {
      extractJson(long);
      throw new Error("should have thrown");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("x".repeat(200));
      expect(msg).not.toContain("x".repeat(201));
    }
  });

  it("stripCodeFences handles an unterminated opening fence", () => {
    expect(stripCodeFences('```json\n{"a":1}')).toBe('{"a":1}');
  });
});
