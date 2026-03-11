/**
 * Per-User Rate Limiting Tests
 *
 * Validates that the dual-layer rate limiting in wazuhClient.ts correctly
 * enforces both global and per-user limits independently.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { _testing } from "./wazuhClient";

const {
  checkRateLimit,
  resetRateLimits,
  GLOBAL_RATE_LIMITS,
  PER_USER_RATE_LIMITS,
} = _testing;

describe("Per-User Rate Limiting", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("allows requests within per-user limit", () => {
    const userLimit = PER_USER_RATE_LIMITS.default;
    // Should not throw for requests within the limit
    for (let i = 0; i < userLimit; i++) {
      expect(() => checkRateLimit("default", 1)).not.toThrow();
    }
  });

  it("blocks a single user who exceeds their per-user limit", () => {
    const userLimit = PER_USER_RATE_LIMITS.default;
    // Exhaust user 1's budget
    for (let i = 0; i < userLimit; i++) {
      checkRateLimit("default", 1);
    }
    // Next request from user 1 should be blocked
    expect(() => checkRateLimit("default", 1)).toThrow(/Per-user rate limit exceeded/);
  });

  it("allows other users to continue when one user is rate-limited", () => {
    const userLimit = PER_USER_RATE_LIMITS.default;
    // Exhaust user 1's budget
    for (let i = 0; i < userLimit; i++) {
      checkRateLimit("default", 1);
    }
    // User 1 is blocked
    expect(() => checkRateLimit("default", 1)).toThrow(/Per-user rate limit exceeded/);
    // User 2 should still be able to make requests
    expect(() => checkRateLimit("default", 2)).not.toThrow();
  });

  it("enforces per-user limits independently per endpoint group", () => {
    const alertsLimit = PER_USER_RATE_LIMITS.alerts;
    // Exhaust user 1's alerts budget
    for (let i = 0; i < alertsLimit; i++) {
      checkRateLimit("alerts", 1);
    }
    // User 1 is blocked on alerts
    expect(() => checkRateLimit("alerts", 1)).toThrow(/Per-user rate limit exceeded.*alerts/);
    // But user 1 can still use the default group
    expect(() => checkRateLimit("default", 1)).not.toThrow();
  });

  it("enforces global limit even when per-user limits are not exhausted", () => {
    const globalLimit = GLOBAL_RATE_LIMITS.default;
    const userLimit = PER_USER_RATE_LIMITS.default;
    // Use multiple users to stay under per-user limits but exhaust global
    const usersNeeded = Math.ceil(globalLimit / userLimit) + 1;
    let totalRequests = 0;
    let globalLimitHit = false;

    for (let userId = 1; userId <= usersNeeded; userId++) {
      for (let i = 0; i < userLimit; i++) {
        try {
          checkRateLimit("default", userId);
          totalRequests++;
        } catch (err) {
          if ((err as Error).message.includes("Global rate limit")) {
            globalLimitHit = true;
            break;
          }
        }
      }
      if (globalLimitHit) break;
    }

    expect(globalLimitHit).toBe(true);
    expect(totalRequests).toBe(globalLimit);
  });

  it("includes Retry-After in per-user rate limit error message", () => {
    const userLimit = PER_USER_RATE_LIMITS.default;
    for (let i = 0; i < userLimit; i++) {
      checkRateLimit("default", 1);
    }
    try {
      checkRateLimit("default", 1);
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect((err as Error).message).toMatch(/Retry-After: \d+s/);
      expect((err as Error).message).toMatch(/individual limit is \d+ requests per minute/);
    }
  });

  it("includes Retry-After in global rate limit error message", () => {
    const globalLimit = GLOBAL_RATE_LIMITS.default;
    // Use no userId to skip per-user check, exhaust global
    for (let i = 0; i < globalLimit; i++) {
      checkRateLimit("default");
    }
    try {
      checkRateLimit("default");
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect((err as Error).message).toMatch(/Global rate limit exceeded/);
      expect((err as Error).message).toMatch(/Retry-After: \d+s/);
      expect((err as Error).message).toMatch(/system-wide limit is \d+ requests per minute/);
    }
  });

  it("resets rate limits after the window expires", () => {
    // This test verifies the reset mechanism works by directly manipulating state
    const state = _testing.perUserRateLimitState;
    const key = "99:default";
    // Simulate an expired window
    state[key] = { count: 999, resetAt: Date.now() - 1000 };
    // Should not throw because the window has expired
    expect(() => checkRateLimit("default", 99)).not.toThrow();
  });

  it("works without userId (global-only enforcement)", () => {
    // When no userId is provided, only global limits apply
    const globalLimit = GLOBAL_RATE_LIMITS.default;
    for (let i = 0; i < globalLimit; i++) {
      expect(() => checkRateLimit("default")).not.toThrow();
    }
    expect(() => checkRateLimit("default")).toThrow(/Global rate limit exceeded/);
  });

  it("per-user limits match expected values from configuration", () => {
    // Verify the configured limits are reasonable fractions of global limits
    expect(PER_USER_RATE_LIMITS.default).toBeLessThanOrEqual(GLOBAL_RATE_LIMITS.default);
    expect(PER_USER_RATE_LIMITS.alerts).toBeLessThanOrEqual(GLOBAL_RATE_LIMITS.alerts);
    expect(PER_USER_RATE_LIMITS.vulnerabilities).toBeLessThanOrEqual(GLOBAL_RATE_LIMITS.vulnerabilities);
    expect(PER_USER_RATE_LIMITS.syscheck).toBeLessThanOrEqual(GLOBAL_RATE_LIMITS.syscheck);
  });
});
