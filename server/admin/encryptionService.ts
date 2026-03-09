/**
 * AES-256-GCM encryption for sensitive connection settings (passwords).
 * Derives a separate encryption key from JWT_SECRET using HKDF
 * with a distinct salt/context to avoid key reuse.
 * Never logs or exposes decrypted values.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const HKDF_SALT = "dang-encryption-key-v1";
const HKDF_INFO = "aes-256-gcm-connection-settings";

function getEncryptionKey(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required for encryption");
  // Derive a separate 32-byte key using HKDF with distinct salt and context
  // This ensures the AES key is cryptographically independent from the JWT signing key
  const derived = crypto.hkdfSync(
    "sha256",
    secret,
    HKDF_SALT,
    HKDF_INFO,
    32
  );
  return Buffer.from(derived);
}

/**
 * Encrypt a plaintext string.
 * Returns a base64 string: iv:ciphertext:authTag
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag();
  
  // Format: iv:ciphertext:authTag (all base64)
  return `${iv.toString("base64")}:${encrypted}:${authTag.toString("base64")}`;
}

/**
 * Decrypt a previously encrypted string.
 * Input format: iv:ciphertext:authTag (all base64)
 */
export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const parts = encryptedText.split(":");
  
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format");
  }
  
  const iv = Buffer.from(parts[0], "base64");
  const ciphertext = parts[1];
  const authTag = Buffer.from(parts[2], "base64");
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}
