/**
 * L3/M3 — versioned, AAD-bound credential encryption + ENCRYPTION_KEY policy.
 *
 * Covers: v2 format (12-byte IV, AAD), legacy v1 decryption under the
 * HKDF(JWT_SECRET) key regardless of ENCRYPTION_KEY (the live-deploy migration
 * path), the pre-v2 SHA-256(ENCRYPTION_KEY) legacy key, production key
 * enforcement, the dev fallback, and envValidation's checkEncryptionKey().
 */
import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decrypt,
  encrypt,
  isLegacyCiphertext,
  settingAad,
  __resetEncryptionWarningsForTests,
} from "./encryptionService";
import { checkEncryptionKey } from "../_core/envValidation";

const JWT = "test-jwt-secret-0123456789abcdef0123456789abcdef";
const KEY_A = "a".repeat(16) + crypto.randomBytes(16).toString("hex");
const KEY_B = "b".repeat(16) + crypto.randomBytes(16).toString("hex");
const AAD = settingAad("wazuh_manager", "pass");

/** Byte-exact replica of the pre-v2 encrypt(): 16-byte IV, no AAD. */
function legacyEncrypt(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let enc = cipher.update(plaintext, "utf8", "base64");
  enc += cipher.final("base64");
  return `${iv.toString("base64")}:${enc}:${cipher.getAuthTag().toString("base64")}`;
}
const legacyJwtKey = (jwt: string) =>
  Buffer.from(crypto.hkdfSync("sha256", jwt, "dang-encryption-key-v1", "aes-256-gcm-connection-settings", 32));
const legacyDedicatedKey = (k: string) => crypto.createHash("sha256").update(k).digest();

const saved = { ...process.env };
function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  __resetEncryptionWarningsForTests();
  setEnv({ JWT_SECRET: JWT, ENCRYPTION_KEY: KEY_A, NODE_ENV: "test" });
});
afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
});

describe("v2 ciphertext", () => {
  it("round-trips and uses the v2:<iv>:<ct>:<tag> format with a 12-byte IV", () => {
    const ct = encrypt("wazuh-api-password", AAD);
    const parts = ct.split(":");
    expect(parts[0]).toBe("v2");
    expect(parts).toHaveLength(4);
    expect(Buffer.from(parts[1], "base64")).toHaveLength(12);
    expect(Buffer.from(parts[3], "base64")).toHaveLength(16);
    expect(isLegacyCiphertext(ct)).toBe(false);
    expect(decrypt(ct, AAD)).toBe("wazuh-api-password");
  });

  it("uses a fresh IV per call", () => {
    expect(encrypt("x", AAD)).not.toBe(encrypt("x", AAD));
  });

  it("is bound to the row identity: a different AAD fails", () => {
    const ct = encrypt("secret", AAD);
    expect(() => decrypt(ct, settingAad("wazuh_indexer", "pass"))).toThrow();
    expect(() => decrypt(ct, settingAad("wazuh_manager", "user"))).toThrow();
    expect(() => decrypt(ct, "")).toThrow();
  });

  it("detects tampering", () => {
    const ct = encrypt("secret", AAD);
    const [v, iv, body, tag] = ct.split(":");
    const flipped = Buffer.from(body, "base64");
    flipped[0] ^= 1;
    expect(() => decrypt(`${v}:${iv}:${flipped.toString("base64")}:${tag}`, AAD)).toThrow();
  });

  it("does not depend on JWT_SECRET when ENCRYPTION_KEY is set (JWT rotation is safe)", () => {
    const ct = encrypt("secret", AAD);
    setEnv({ JWT_SECRET: "rotated-jwt-secret-ffffffffffffffffffffffff" });
    expect(decrypt(ct, AAD)).toBe("secret");
  });

  it("fails under a different ENCRYPTION_KEY in production", () => {
    setEnv({ NODE_ENV: "production" });
    const ct = encrypt("secret", AAD);
    setEnv({ ENCRYPTION_KEY: KEY_B });
    expect(() => decrypt(ct, AAD)).toThrow();
  });

  it("requires an AAD to encrypt", () => {
    expect(() => encrypt("x", "")).toThrow();
  });
});

describe("legacy v1 ciphertext (migration path)", () => {
  it("isLegacyCiphertext recognises the un-prefixed 3-part format", () => {
    const v1 = legacyEncrypt("p", legacyJwtKey(JWT));
    expect(isLegacyCiphertext(v1)).toBe(true);
    expect(isLegacyCiphertext("plain")).toBe(false);
  });

  it("v1 rows written under HKDF(JWT_SECRET) decrypt after a NEW ENCRYPTION_KEY is introduced (live deploy)", () => {
    // Old deployment: no ENCRYPTION_KEY → rows encrypted under HKDF(JWT_SECRET).
    const v1 = legacyEncrypt("indexer-password", legacyJwtKey(JWT));
    // New deployment: production, freshly generated ENCRYPTION_KEY.
    setEnv({ NODE_ENV: "production", ENCRYPTION_KEY: KEY_B });
    expect(decrypt(v1, AAD)).toBe("indexer-password");
    // ...and it re-encrypts as v2 under the new key.
    const v2 = encrypt(decrypt(v1, AAD), AAD);
    expect(v2.startsWith("v2:")).toBe(true);
    expect(decrypt(v2, AAD)).toBe("indexer-password");
  });

  it("v1 ignores the AAD argument (v1 had none)", () => {
    const v1 = legacyEncrypt("p", legacyJwtKey(JWT));
    expect(decrypt(v1, "anything:else")).toBe("p");
  });

  it("v1 rows written by the pre-v2 code under SHA-256(ENCRYPTION_KEY) still decrypt", () => {
    const v1 = legacyEncrypt("splunk-token", legacyDedicatedKey(KEY_A));
    setEnv({ NODE_ENV: "production" });
    expect(decrypt(v1, AAD)).toBe("splunk-token");
  });

  it("v1 fails if JWT_SECRET changed and no matching ENCRYPTION_KEY exists", () => {
    const v1 = legacyEncrypt("p", legacyJwtKey(JWT));
    setEnv({ JWT_SECRET: "a-different-jwt-secret-000000000000000000" });
    expect(() => decrypt(v1, AAD)).toThrow();
  });

  it("rejects malformed input", () => {
    expect(() => decrypt("not-encrypted", AAD)).toThrow(/Invalid encrypted format/);
    expect(() => decrypt("v2:a:b", AAD)).toThrow(/Invalid encrypted format/);
  });
});

describe("key policy", () => {
  it("production without ENCRYPTION_KEY refuses to encrypt or decrypt v2", () => {
    const ct = encrypt("x", AAD);
    setEnv({ NODE_ENV: "production", ENCRYPTION_KEY: undefined });
    expect(() => encrypt("x", AAD)).toThrow(/ENCRYPTION_KEY/);
    expect(() => decrypt(ct, AAD)).toThrow(/ENCRYPTION_KEY/);
  });

  it("production with a short ENCRYPTION_KEY refuses to encrypt", () => {
    setEnv({ NODE_ENV: "production", ENCRYPTION_KEY: "short" });
    expect(() => encrypt("x", AAD)).toThrow(/ENCRYPTION_KEY/);
  });

  it("development without ENCRYPTION_KEY falls back to JWT_SECRET with a loud one-time warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setEnv({ NODE_ENV: "development", ENCRYPTION_KEY: undefined });
    const ct = encrypt("dev", AAD);
    encrypt("dev2", AAD);
    expect(decrypt(ct, AAD)).toBe("dev");
    const msgs = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("ENCRYPTION_KEY"));
    expect(msgs).toHaveLength(1);
  });

  it("development: values saved under the fallback still decrypt after an ENCRYPTION_KEY is added", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    setEnv({ NODE_ENV: "development", ENCRYPTION_KEY: undefined });
    const ct = encrypt("dev", AAD);
    setEnv({ ENCRYPTION_KEY: KEY_A });
    expect(decrypt(ct, AAD)).toBe("dev");
  });
});

describe("envValidation.checkEncryptionKey", () => {
  it("production: unset → error", () => {
    expect(checkEncryptionKey({ NODE_ENV: "production" }).errors).toHaveLength(1);
  });
  it("production: < 32 chars → error", () => {
    expect(checkEncryptionKey({ NODE_ENV: "production", ENCRYPTION_KEY: "x".repeat(31) }).errors).toHaveLength(1);
  });
  it("production: equal to JWT_SECRET → error", () => {
    expect(checkEncryptionKey({ NODE_ENV: "production", ENCRYPTION_KEY: KEY_A, JWT_SECRET: KEY_A }).errors).toHaveLength(1);
  });
  it("production: valid key → no errors", () => {
    expect(checkEncryptionKey({ NODE_ENV: "production", ENCRYPTION_KEY: KEY_A, JWT_SECRET: JWT })).toEqual({ errors: [], warnings: [] });
  });
  it("development: unset or short → warning only", () => {
    expect(checkEncryptionKey({ NODE_ENV: "development" })).toMatchObject({ errors: [], warnings: [expect.any(String)] });
    expect(checkEncryptionKey({ NODE_ENV: "development", ENCRYPTION_KEY: "short" })).toMatchObject({ errors: [], warnings: [expect.any(String)] });
  });
});
