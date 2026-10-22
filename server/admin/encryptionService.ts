/**
 * AES-256-GCM encryption for sensitive connection settings (passwords, tokens).
 * Never logs or exposes decrypted values.
 *
 * Ciphertext formats
 * ──────────────────
 *   v2 (written by encrypt()):  "v2:<iv_b64>:<ct_b64>:<tag_b64>"
 *       - 12-byte random IV (the GCM standard size)
 *       - AAD = the row identity "<category>:<settingKey>", so a ciphertext
 *         copied into another row (or another category) fails authentication
 *       - key = HKDF-SHA256(ENCRYPTION_KEY, "dang-encryption-key-v2")
 *
 *   v1 (legacy, read-only):     "<iv_b64>:<ct_b64>:<tag_b64>"
 *       - 16-byte IV, no AAD
 *       - key = HKDF-SHA256(JWT_SECRET, "dang-encryption-key-v1") — and, for
 *         deployments that already had a >= 32-char ENCRYPTION_KEY, the old
 *         SHA-256(ENCRYPTION_KEY) key is tried second (GCM authentication makes
 *         trial decryption safe: a wrong key throws, it never returns garbage).
 *       The legacy keys do NOT depend on whether ENCRYPTION_KEY is set now, so
 *       introducing a new ENCRYPTION_KEY never orphans existing v1 rows.
 *       connectionSettingsService.reencryptLegacySettings() rewrites v1 rows as
 *       v2 once at boot; after that, JWT_SECRET can be rotated freely.
 *
 * Key requirements (review L3/M3)
 * ───────────────────────────────
 *   NODE_ENV=production: ENCRYPTION_KEY is REQUIRED (>= 32 chars). envValidation
 *     refuses to boot without it, and getV2Key() throws as a second line.
 *   otherwise (development / test): a missing or short ENCRYPTION_KEY falls
 *     back to HKDF-SHA256(JWT_SECRET, "dang-encryption-key-v2-dev-fallback")
 *     with a loud one-time warning. v2 decryption tries ENCRYPTION_KEY first
 *     and then this fallback (non-production only), so adding a key to a dev
 *     box later does not brick values saved before it.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const TAG_LENGTH = 16;

// v1 (legacy) parameters — must never change, existing rows depend on them.
const V1_IV_LENGTH = 16;
const HKDF_SALT = "dang-encryption-key-v1";
const HKDF_INFO = "aes-256-gcm-connection-settings";

// v2 parameters
const V2_PREFIX = "v2:";
const V2_IV_LENGTH = 12;
const V2_HKDF_SALT = "dang-encryption-key-v2";
const V2_DEV_FALLBACK_SALT = "dang-encryption-key-v2-dev-fallback";

export const MIN_ENCRYPTION_KEY_LENGTH = 32;

function hkdf(secret: string, salt: string): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", secret, salt, HKDF_INFO, 32));
}

function dedicatedKey(): string | null {
  const k = process.env.ENCRYPTION_KEY;
  return k && k.length >= MIN_ENCRYPTION_KEY_LENGTH ? k : null;
}

let warnedDevFallback = false;

/**
 * Keys usable for v2, in trial order. The first entry is the one encrypt()
 * uses. Production: exactly [HKDF(ENCRYPTION_KEY)], or throw.
 */
function getV2Keys(): Buffer[] {
  const k = dedicatedKey();
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    if (!k) {
      throw new Error(
        `ENCRYPTION_KEY (>= ${MIN_ENCRYPTION_KEY_LENGTH} chars) is required in production to encrypt/decrypt connection credentials`
      );
    }
    return [hkdf(k, V2_HKDF_SALT)];
  }

  const keys: Buffer[] = [];
  if (k) keys.push(hkdf(k, V2_HKDF_SALT));
  const jwt = process.env.JWT_SECRET;
  if (jwt) {
    if (!k && !warnedDevFallback) {
      warnedDevFallback = true;
      console.warn(
        "\n[Encryption] ⚠️  ENCRYPTION_KEY is not set (or < 32 chars) — deriving the credential-encryption key from JWT_SECRET.\n" +
          "[Encryption] ⚠️  This is a DEVELOPMENT-ONLY fallback; production refuses to start without ENCRYPTION_KEY.\n" +
          "[Encryption] ⚠️  Generate one with: openssl rand -hex 32\n"
      );
    }
    keys.push(hkdf(jwt, V2_DEV_FALLBACK_SALT));
  }
  if (keys.length === 0) {
    throw new Error("ENCRYPTION_KEY (or, outside production, JWT_SECRET) is required for encryption");
  }
  return keys;
}

/** Keys that v1 (legacy) ciphertexts may have been written with, in trial order. */
function getLegacyKeys(): Buffer[] {
  const keys: Buffer[] = [];
  const jwt = process.env.JWT_SECRET;
  if (jwt) keys.push(hkdf(jwt, HKDF_SALT));
  // Pre-v2 code used SHA-256(ENCRYPTION_KEY) when a >= 32-char key was set.
  const k = dedicatedKey();
  if (k) keys.push(crypto.createHash("sha256").update(k).digest());
  if (keys.length === 0) {
    throw new Error("JWT_SECRET is required to decrypt legacy (v1) ciphertext");
  }
  return keys;
}

/** Build the AAD for a connection_settings row. */
export function settingAad(category: string, settingKey: string): string {
  return `${category}:${settingKey}`;
}

/** True for the un-prefixed legacy v1 format (16-byte IV, no AAD). */
export function isLegacyCiphertext(value: string): boolean {
  return !value.startsWith(V2_PREFIX) && value.split(":").length === 3;
}

function gcmDecrypt(key: Buffer, iv: Buffer, ct: Buffer, tag: Buffer, aad?: Buffer): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

function tryKeys(keys: Buffer[], attempt: (key: Buffer) => string): string {
  for (const key of keys) {
    try {
      return attempt(key);
    } catch {
      // wrong key / tampered data → GCM auth failure; try the next key
    }
  }
  throw new Error("Decryption failed (wrong key, wrong row identity, or tampered ciphertext)");
}

/**
 * Encrypt a plaintext string as v2, bound to `aad` (use settingAad()).
 * Returns "v2:<iv_b64>:<ct_b64>:<tag_b64>".
 */
export function encrypt(plaintext: string, aad: string): string {
  if (typeof aad !== "string" || aad.length === 0) throw new Error("encrypt() requires a non-empty AAD");
  const key = getV2Keys()[0];
  const iv = crypto.randomBytes(V2_IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${V2_PREFIX}${iv.toString("base64")}:${ct.toString("base64")}:${tag.toString("base64")}`;
}

/**
 * Decrypt a v2 ciphertext (AAD must match the one used to encrypt) or a
 * legacy v1 ciphertext (AAD ignored — v1 had none).
 */
export function decrypt(ciphertext: string, aad: string): string {
  if (ciphertext.startsWith(V2_PREFIX)) {
    if (typeof aad !== "string" || aad.length === 0) throw new Error("decrypt() of v2 ciphertext requires the AAD");
    const parts = ciphertext.slice(V2_PREFIX.length).split(":");
    if (parts.length !== 3) throw new Error("Invalid encrypted format");
    const iv = Buffer.from(parts[0], "base64");
    const ct = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    if (iv.length !== V2_IV_LENGTH || tag.length !== TAG_LENGTH) throw new Error("Invalid encrypted format");
    const aadBuf = Buffer.from(aad, "utf8");
    return tryKeys(getV2Keys(), (key) => gcmDecrypt(key, iv, ct, tag, aadBuf));
  }

  if (!isLegacyCiphertext(ciphertext)) throw new Error("Invalid encrypted format");
  const parts = ciphertext.split(":");
  const iv = Buffer.from(parts[0], "base64");
  const ct = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  if (iv.length !== V1_IV_LENGTH || tag.length !== TAG_LENGTH) throw new Error("Invalid encrypted format");
  return tryKeys(getLegacyKeys(), (key) => gcmDecrypt(key, iv, ct, tag));
}

/** @internal test hook */
export function __resetEncryptionWarningsForTests(): void {
  warnedDevFallback = false;
}
