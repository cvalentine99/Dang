/**
 * M3 / M1 / M5 / M6 / L5 — wazuhClient token cache, error sanitization,
 * axios limits, rate-limit errors and field stripping.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

const mockPost = vi.fn();
const mockGet = vi.fn();
const createCalls: Array<Record<string, unknown>> = [];

vi.mock("axios", () => {
  const isAxiosError = (e: unknown) => typeof e === "object" && e !== null && "isAxiosError" in e;
  const create = (cfg: Record<string, unknown>) => {
    createCalls.push(cfg);
    return {
      post: (...a: unknown[]) => mockPost(cfg.baseURL, ...a),
      get: (...a: unknown[]) => mockGet(cfg.baseURL, ...a),
    };
  };
  return { default: { create, isAxiosError }, isAxiosError };
});

import { wazuhGet, invalidateWazuhToken, _testing, type WazuhConfig } from "./wazuhClient";

const A: WazuhConfig = { host: "wazuh-a", port: 55000, user: "wui", pass: "pa" };
const B: WazuhConfig = { host: "wazuh-b", port: 55000, user: "wui", pass: "pb" };

let tokenSeq = 0;
function authOk() {
  tokenSeq++;
  return { data: { data: { token: `jwt-${tokenSeq}`, exp: Math.floor(Date.now() / 1000) + 900 } } };
}
const ok = { data: { data: { affected_items: [] } } };

beforeEach(() => {
  mockPost.mockReset();
  mockGet.mockReset();
  createCalls.length = 0;
  tokenSeq = 0;
  invalidateWazuhToken();
  _testing.resetRateLimits();
});

describe("M3: token cache keyed per connection, in-flight auth deduped", () => {
  it("N concurrent misses make exactly one POST /security/user/authenticate", async () => {
    mockPost.mockImplementation(async () => { await new Promise(r => setTimeout(r, 10)); return authOk(); });
    mockGet.mockResolvedValue(ok);
    await Promise.all(Array.from({ length: 8 }, (_, i) => wazuhGet(A, { path: "/agents", params: { offset: i } })));
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledTimes(8);
    for (const call of mockGet.mock.calls) {
      expect((call[2] as { headers: Record<string, string> }).headers.Authorization).toBe("Bearer jwt-1");
    }
  });

  it("a token for host A is never sent to host B", async () => {
    mockPost.mockImplementation(async () => authOk());
    mockGet.mockResolvedValue(ok);
    await wazuhGet(A, { path: "/agents" });
    await wazuhGet(B, { path: "/agents" });
    expect(mockPost).toHaveBeenCalledTimes(2);
    const [callA, callB] = mockGet.mock.calls;
    expect(callA[0]).toBe("https://wazuh-a:55000");
    expect((callA[2] as { headers: Record<string, string> }).headers.Authorization).toBe("Bearer jwt-1");
    expect(callB[0]).toBe("https://wazuh-b:55000");
    expect((callB[2] as { headers: Record<string, string> }).headers.Authorization).toBe("Bearer jwt-2");
  });

  it("a password change is a new identity (re-authenticates)", async () => {
    mockPost.mockImplementation(async () => authOk());
    mockGet.mockResolvedValue(ok);
    await wazuhGet(A, { path: "/agents" });
    await wazuhGet({ ...A, pass: "rotated" }, { path: "/agents" });
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it("reuses the cached token for the same identity", async () => {
    mockPost.mockImplementation(async () => authOk());
    mockGet.mockResolvedValue(ok);
    await wazuhGet(A, { path: "/agents" });
    await wazuhGet(A, { path: "/rules" });
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it("concurrent 401s collapse onto one re-authentication", async () => {
    mockPost.mockImplementation(async () => { await new Promise(r => setTimeout(r, 5)); return authOk(); });
    await wazuhGet(A, { path: "/warmup" }).catch(() => {}); // seeds jwt-1 (GET unmocked → rejects, fine)
    mockGet.mockImplementation(async (_base: string, _path: string, opts: { headers: Record<string, string> }) => {
      if (opts.headers.Authorization === "Bearer jwt-1") throw { isAxiosError: true, response: { status: 401, data: {} }, message: "401" };
      return ok;
    });
    mockPost.mockClear();
    await Promise.all(Array.from({ length: 5 }, () => wazuhGet(A, { path: "/agents" })));
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it("invalidateWazuhToken() forces re-authentication", async () => {
    mockPost.mockImplementation(async () => authOk());
    mockGet.mockResolvedValue(ok);
    await wazuhGet(A, { path: "/agents" });
    invalidateWazuhToken();
    await wazuhGet(A, { path: "/agents" });
    expect(mockPost).toHaveBeenCalledTimes(2);
  });
});

describe("M1: upstream bodies are not relayed", () => {
  it("HTTP errors surface as 'Wazuh upstream error (HTTP n) [id]' without the body", async () => {
    mockPost.mockImplementation(async () => authOk());
    mockGet.mockRejectedValue({ isAxiosError: true, response: { status: 500, data: { detail: "secret internal path /var/ossec" } }, message: "500" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await wazuhGet(A, { path: "/agents" }).catch(e => e as Error);
    expect(err.message).toMatch(/^Wazuh upstream error \(HTTP 500\) \[[0-9a-f]{8}\]$/);
    expect(err.message).not.toContain("/var/ossec");
    const id = err.message.match(/\[([0-9a-f]{8})\]/)![1];
    // full detail is in the server log under the same id
    expect(spy.mock.calls.some(c => String(c[0]).includes(id) && String(c[0]).includes("/var/ossec"))).toBe(true);
    spy.mockRestore();
  });

  it("auth failures are sanitized too", async () => {
    mockPost.mockRejectedValue({ isAxiosError: true, response: { status: 401, data: { detail: "Invalid credentials for user wui" } }, message: "401" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await wazuhGet(A, { path: "/agents" }).catch(e => e as Error);
    expect(err.message).toMatch(/HTTP 401/);
    expect(err.message).not.toContain("Invalid credentials");
  });
});

describe("M5: axios instances are bounded", () => {
  it("sets maxContentLength, maxBodyLength and maxRedirects: 0", async () => {
    mockPost.mockImplementation(async () => authOk());
    mockGet.mockResolvedValue(ok);
    await wazuhGet(A, { path: "/agents" });
    expect(createCalls.length).toBeGreaterThan(0);
    for (const cfg of createCalls) {
      expect(cfg.maxContentLength).toBe(25 * 1024 * 1024);
      expect(cfg.maxBodyLength).toBeGreaterThan(0);
      expect(cfg.maxRedirects).toBe(0);
    }
  });
});

describe("M6: rate limits → TRPCError TOO_MANY_REQUESTS; buckets pruned", () => {
  it("per-user violation is a 429 TRPCError", () => {
    const limit = _testing.PER_USER_RATE_LIMITS.default;
    for (let i = 0; i < limit; i++) _testing.checkRateLimit("default", 42);
    try {
      _testing.checkRateLimit("default", 42);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(TRPCError);
      expect((e as TRPCError).code).toBe("TOO_MANY_REQUESTS");
    }
  });

  it("expired per-user buckets are pruned", () => {
    _testing.perUserRateLimitState["7:default"] = { count: 3, resetAt: Date.now() - 1 };
    _testing.pruneRateLimitState(Date.now() + _testing.RATE_LIMIT_WINDOW_MS);
    expect(_testing.perUserRateLimitState["7:default"]).toBeUndefined();
  });
});

describe("L5: sensitive-field stripping (case-insensitive substring)", () => {
  it.each(["authToken", "client_secret", "PasswordHash", "rbac_token", "TOKEN", "api_key"])("strips %s", (k) => {
    expect(_testing.isSensitiveFieldName(k)).toBe(true);
  });
  it.each(["key", "name", "auth_token_exp_timeout", "id", "status"])("keeps %s", (k) => {
    expect(_testing.isSensitiveFieldName(k)).toBe(false);
  });
});
