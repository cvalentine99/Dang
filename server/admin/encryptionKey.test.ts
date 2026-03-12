import { describe, it, expect } from "vitest";

const HAS_ENCRYPTION_KEY = !!process.env.ENCRYPTION_KEY;
const HAS_JWT_SECRET = !!process.env.JWT_SECRET;

describe("ENCRYPTION_KEY environment variable", () => {
  it.skipIf(!HAS_ENCRYPTION_KEY)("should be set and at least 32 characters long", () => {
    const key = process.env.ENCRYPTION_KEY;
    expect(key).toBeDefined();
    expect(typeof key).toBe("string");
    expect(key!.length).toBeGreaterThanOrEqual(32);
  });

  it.skipIf(!HAS_ENCRYPTION_KEY || !HAS_JWT_SECRET)("should be different from JWT_SECRET", () => {
    const encKey = process.env.ENCRYPTION_KEY;
    const jwtSecret = process.env.JWT_SECRET;
    // Both should exist
    expect(encKey).toBeDefined();
    expect(jwtSecret).toBeDefined();
    // They must be different secrets
    expect(encKey).not.toBe(jwtSecret);
  });

  it.skipIf(!HAS_ENCRYPTION_KEY && !HAS_JWT_SECRET)("should be usable for encryption round-trip", async () => {
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
