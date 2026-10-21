/**
 * L3/M3 — boot-time migration of legacy v1 credential ciphertexts to v2.
 * Uses a fake drizzle handle (no MySQL): verifies which rows are rewritten,
 * that the rewrite is AAD-bound to the row and decrypts under the NEW key,
 * and that undecryptable rows are left alone.
 */
import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const JWT = "test-jwt-secret-0123456789abcdef0123456789abcdef";
const NEW_KEY = crypto.randomBytes(32).toString("hex");

type Row = { id: number; category: string; settingKey: string; settingValue: string; isEncrypted: number };
const state: { rows: Row[]; updates: Array<{ set: Record<string, unknown> }> } = { rows: [], updates: [] };

vi.mock("../db", () => ({
  getDb: vi.fn(async () => ({
    select: () => ({ from: () => ({ where: async () => state.rows }) }),
    update: () => ({
      set: (set: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push({ set });
        },
      }),
    }),
  })),
}));

function legacyEncrypt(plaintext: string): string {
  const key = Buffer.from(
    crypto.hkdfSync("sha256", JWT, "dang-encryption-key-v1", "aes-256-gcm-connection-settings", 32)
  );
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return `${iv.toString("base64")}:${ct.toString("base64")}:${c.getAuthTag().toString("base64")}`;
}

const saved = { ...process.env };
beforeEach(() => {
  process.env.JWT_SECRET = JWT;
  process.env.NODE_ENV = "production";
  process.env.ENCRYPTION_KEY = NEW_KEY; // freshly generated key, rows still v1
  state.rows = [];
  state.updates = [];
});
afterEach(() => {
  process.env = { ...saved };
  vi.restoreAllMocks();
});

describe("reencryptLegacySettings", () => {
  it("rewrites v1 rows as AAD-bound v2 under the new ENCRYPTION_KEY and skips v2 rows", async () => {
    const { encrypt, decrypt, settingAad } = await import("./encryptionService");
    const { reencryptLegacySettings } = await import("./connectionSettingsService");
    vi.spyOn(console, "log").mockImplementation(() => {});
    state.rows = [
      { id: 1, category: "wazuh_manager", settingKey: "pass", settingValue: legacyEncrypt("mgr-pw"), isEncrypted: 1 },
      { id: 2, category: "splunk", settingKey: "hec_token", settingValue: legacyEncrypt("hec"), isEncrypted: 1 },
      { id: 3, category: "wazuh_indexer", settingKey: "pass", settingValue: encrypt("idx", settingAad("wazuh_indexer", "pass")), isEncrypted: 1 },
    ];

    const res = await reencryptLegacySettings();
    expect(res).toEqual({ migrated: 2, failed: 0 });
    expect(state.updates).toHaveLength(2);

    const [mgr, hec] = state.updates.map((u) => String(u.set.settingValue));
    expect(mgr.startsWith("v2:")).toBe(true);
    expect(decrypt(mgr, settingAad("wazuh_manager", "pass"))).toBe("mgr-pw");
    expect(decrypt(hec, settingAad("splunk", "hec_token"))).toBe("hec");
    // bound to its own row
    expect(() => decrypt(mgr, settingAad("splunk", "hec_token"))).toThrow();

    // Second boot: everything is v2 → nothing to do.
    state.rows = [
      { ...state.rows[0], settingValue: mgr },
      { ...state.rows[1], settingValue: hec },
      state.rows[2],
    ];
    state.updates = [];
    expect(await reencryptLegacySettings()).toEqual({ migrated: 0, failed: 0 });
    expect(state.updates).toHaveLength(0);
  });

  it("leaves rows it cannot decrypt untouched", async () => {
    const { reencryptLegacySettings } = await import("./connectionSettingsService");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const v1 = legacyEncrypt("pw");
    process.env.JWT_SECRET = "rotated-jwt-secret-000000000000000000000000";
    state.rows = [{ id: 1, category: "wazuh_manager", settingKey: "pass", settingValue: v1, isEncrypted: 1 }];
    expect(await reencryptLegacySettings()).toEqual({ migrated: 0, failed: 1 });
    expect(state.updates).toHaveLength(0);
  });
});
