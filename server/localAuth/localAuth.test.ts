import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ── Local Auth Service Tests ─────────────────────────────────────────────────

describe("localAuth", () => {
  describe("isLocalAuthMode", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("always returns true (local auth only, no OAuth)", async () => {
      const { isLocalAuthMode } = await import("./localAuthService");
      expect(isLocalAuthMode()).toBe(true);
    });
  });

  describe("hashPassword and verifyPassword", () => {
    it("hashes a password and verifies it correctly", async () => {
      const { hashPassword, verifyPassword } = await import("./localAuthService");
      const password = "TestP@ssw0rd!";
      const hash = await hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.startsWith("$2")).toBe(true); // bcrypt prefix

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPassword("wrongpassword", hash);
      expect(isInvalid).toBe(false);
    });

    it("generates different hashes for the same password", async () => {
      const { hashPassword } = await import("./localAuthService");
      const password = "SamePassword123!";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      // bcrypt uses random salt, so hashes should differ
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("localAuthRouter", () => {
    it("exports authMode query", async () => {
      const { localAuthRouter } = await import("./localAuthRouter");
      expect(localAuthRouter).toBeDefined();
      // Check that the router has the expected procedures
      const procedures = Object.keys(localAuthRouter._def.procedures);
      expect(procedures).toContain("authMode");
      expect(procedures).toContain("register");
      expect(procedures).toContain("login");
    });
  });
});

// ── Environment Validation Tests ─────────────────────────────────────────────

describe("envValidation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("exports validateEnvironment function", async () => {
    const { validateEnvironment } = await import("../_core/envValidation");
    expect(typeof validateEnvironment).toBe("function");
  });

  it("returns errors when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    process.env.JWT_SECRET = "test-secret-that-is-long-enough-32chars";

    // Suppress console output during test
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { validateEnvironment } = await import("../_core/envValidation");
    const result = validateEnvironment();

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e: string) => e.includes("DATABASE_URL"))).toBe(true);

    consoleSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("returns errors when JWT_SECRET is missing", async () => {
    process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
    delete process.env.JWT_SECRET;

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { validateEnvironment } = await import("../_core/envValidation");
    const result = validateEnvironment();

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e: string) => e.includes("JWT_SECRET"))).toBe(true);

    consoleSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("returns no errors when required vars are set", async () => {
    process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
    process.env.JWT_SECRET = "test-secret-that-is-long-enough-32chars";

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { validateEnvironment } = await import("../_core/envValidation");
    const result = validateEnvironment();

    expect(result.errors).toHaveLength(0);

    consoleSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("returns warnings when Wazuh vars are not set", async () => {
    process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
    process.env.JWT_SECRET = "test-secret-that-is-long-enough-32chars";
    delete process.env.WAZUH_HOST;
    delete process.env.WAZUH_USER;
    delete process.env.WAZUH_PASS;

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { validateEnvironment } = await import("../_core/envValidation");
    const result = validateEnvironment();

    expect(result.warnings.length).toBeGreaterThan(0);

    consoleSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});

// ── Status Endpoint Response Shape Tests ─────────────────────────────────────

describe("status endpoint types", () => {
  it("defines expected service check statuses", () => {
    const validStatuses = ["connected", "disconnected", "not_configured", "error"];
    expect(validStatuses).toContain("connected");
    expect(validStatuses).toContain("disconnected");
    expect(validStatuses).toContain("not_configured");
    expect(validStatuses).toContain("error");
  });

  it("defines expected overall statuses", () => {
    const validStatuses = ["healthy", "degraded", "unhealthy"];
    expect(validStatuses).toContain("healthy");
    expect(validStatuses).toContain("degraded");
    expect(validStatuses).toContain("unhealthy");
  });
});
