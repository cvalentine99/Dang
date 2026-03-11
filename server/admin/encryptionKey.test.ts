import { describe, it, expect } from "vitest";

describe("ENCRYPTION_KEY environment variable", () => {
  it("should be set and at least 32 characters long", () => {
    const key = process.env.ENCRYPTION_KEY;
    expect(key).toBeDefined();
    expect(typeof key).toBe("string");
    expect(key!.length).toBeGreaterThanOrEqual(32);
  });

  it("should be different from JWT_SECRET", () => {
    const encKey = process.env.ENCRYPTION_KEY;
    const jwtSecret = process.env.JWT_SECRET;
    // Both should exist
    expect(encKey).toBeDefined();
    expect(jwtSecret).toBeDefined();
    // They must be different secrets
    expect(encKey).not.toBe(jwtSecret);
  });

  it("should be usable for encryption round-trip", async () => {
    // Dynamic import to pick up the env var
    const { encrypt, decrypt } = await import("./encryptionService");
    const plaintext = "wazuh-api-password-test-value";
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.length).toBeGreaterThan(0);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });
});
