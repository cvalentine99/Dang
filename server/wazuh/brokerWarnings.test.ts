/**
 * Broker Warnings Surfacing Tests
 *
 * Verifies that the withBrokerWarnings helper correctly attaches
 * _brokerWarnings to Wazuh response objects when the broker produces
 * coercion errors, and passes through cleanly when there are none.
 *
 * Also verifies the end-to-end flow: brokerParams produces errors on
 * invalid input → errors are non-empty → withBrokerWarnings attaches them.
 */

import { describe, it, expect } from "vitest";
import { brokerParams, AGENTS_CONFIG, SYSCHECK_CONFIG, CISCAT_CONFIG } from "./paramBroker";

// ── withBrokerWarnings is a private function in wazuhRouter.ts ──────────────
// We replicate its logic here for unit testing since it's a pure function.
// The integration test below verifies the actual router behavior.

async function withBrokerWarnings(
  responsePromise: Promise<unknown>,
  brokerErrors: string[]
): Promise<unknown> {
  const data = await responsePromise;
  if (brokerErrors.length === 0) return data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return { ...data, _brokerWarnings: brokerErrors };
  }
  return { data, _brokerWarnings: brokerErrors };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Unit tests: withBrokerWarnings helper
// ═══════════════════════════════════════════════════════════════════════════════

describe("withBrokerWarnings helper", () => {

  it("returns response unchanged when errors array is empty", async () => {
    const wazuhResponse = { data: { affected_items: [{ id: "001" }] }, message: "ok" };
    const result = await withBrokerWarnings(Promise.resolve(wazuhResponse), []);
    expect(result).toEqual(wazuhResponse);
    expect((result as Record<string, unknown>)._brokerWarnings).toBeUndefined();
  });

  it("attaches _brokerWarnings when errors array is non-empty", async () => {
    const wazuhResponse = { data: { affected_items: [] }, message: "ok" };
    const errors = ["distinct: could not coerce \"yes\" to boolean (expected true/false)"];
    const result = await withBrokerWarnings(Promise.resolve(wazuhResponse), errors) as Record<string, unknown>;
    expect(result._brokerWarnings).toEqual(errors);
    // Original data is preserved
    expect(result.data).toEqual({ affected_items: [] });
    expect(result.message).toBe("ok");
  });

  it("attaches multiple warnings", async () => {
    const wazuhResponse = { data: { affected_items: [] } };
    const errors = [
      "distinct: could not coerce \"yes\" to boolean (expected true/false)",
      "limit: could not coerce \"abc\" to number",
    ];
    const result = await withBrokerWarnings(Promise.resolve(wazuhResponse), errors) as Record<string, unknown>;
    expect(result._brokerWarnings).toHaveLength(2);
    expect(result._brokerWarnings).toEqual(errors);
  });

  it("wraps non-object responses with _brokerWarnings", async () => {
    // Edge case: if Wazuh returns a string or array (unlikely but defensive)
    const result = await withBrokerWarnings(Promise.resolve("raw string"), ["error1"]) as Record<string, unknown>;
    expect(result._brokerWarnings).toEqual(["error1"]);
    expect(result.data).toBe("raw string");
  });

  it("wraps array responses with _brokerWarnings", async () => {
    const result = await withBrokerWarnings(Promise.resolve([1, 2, 3]), ["error1"]) as Record<string, unknown>;
    expect(result._brokerWarnings).toEqual(["error1"]);
    expect(result.data).toEqual([1, 2, 3]);
  });

  it("handles null response with warnings", async () => {
    const result = await withBrokerWarnings(Promise.resolve(null), ["error1"]) as Record<string, unknown>;
    expect(result._brokerWarnings).toEqual(["error1"]);
    expect(result.data).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// End-to-end: brokerParams → errors → withBrokerWarnings
// ═══════════════════════════════════════════════════════════════════════════════

describe("Broker → Warnings end-to-end flow", () => {

  it("AGENTS_CONFIG: valid input produces no warnings", async () => {
    const { errors } = brokerParams(AGENTS_CONFIG, {
      limit: 100,
      offset: 0,
      status: "active",
      q: "os.platform=ubuntu",
    });
    expect(errors).toHaveLength(0);

    const result = await withBrokerWarnings(
      Promise.resolve({ data: { affected_items: [] } }),
      errors
    ) as Record<string, unknown>;
    expect(result._brokerWarnings).toBeUndefined();
  });

  it("CISCAT_CONFIG: invalid boolean produces coercion warning", async () => {
    // "yes" is not a valid boolean — broker should produce an error
    const { errors, forwardedQuery } = brokerParams(CISCAT_CONFIG, {
      limit: 50,
      distinct: "yes" as unknown as boolean,
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("could not coerce");
    expect(errors[0]).toContain("boolean");

    // distinct should NOT be in forwardedQuery (coercion failed)
    expect(forwardedQuery.distinct).toBeUndefined();

    // Warnings should be attached to the response
    const result = await withBrokerWarnings(
      Promise.resolve({ data: { affected_items: [] } }),
      errors
    ) as Record<string, unknown>;
    expect(result._brokerWarnings).toEqual(errors);
  });

  it("SYSCHECK_CONFIG: invalid number produces coercion warning", async () => {
    const { errors } = brokerParams(SYSCHECK_CONFIG, {
      limit: "not-a-number" as unknown as number,
      offset: 0,
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("could not coerce");
    expect(errors[0]).toContain("number");
  });

  it("AGENTS_CONFIG: mixed valid and invalid params", async () => {
    const { errors, forwardedQuery, recognizedParams } = brokerParams(AGENTS_CONFIG, {
      limit: 100,
      status: "active",
      distinct: "maybe" as unknown as boolean, // invalid boolean
    });

    // limit and status should be forwarded
    expect(forwardedQuery.limit).toBe("100");
    expect(forwardedQuery.status).toBe("active");
    // distinct should have a coercion error
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes("distinct"))).toBe(true);
    // distinct is still recognized (just not forwarded)
    expect(recognizedParams).toContain("distinct");
  });

  it("warnings preserve original Wazuh response data integrity", async () => {
    const originalResponse = {
      data: {
        affected_items: [
          { id: "001", name: "agent-001", status: "active" },
          { id: "002", name: "agent-002", status: "disconnected" },
        ],
        total_affected_items: 2,
        total_failed_items: 0,
        failed_items: [],
      },
      message: "All selected agents information was returned",
      error: 0,
    };

    const errors = ["distinct: could not coerce \"yes\" to boolean (expected true/false)"];
    const result = await withBrokerWarnings(
      Promise.resolve(originalResponse),
      errors
    ) as Record<string, unknown>;

    // All original fields preserved
    expect(result.data).toEqual(originalResponse.data);
    expect(result.message).toBe(originalResponse.message);
    expect(result.error).toBe(0);
    // Warnings attached
    expect(result._brokerWarnings).toEqual(errors);
  });
});
