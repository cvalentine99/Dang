/**
 * L4 — connection settings resolve the credential set atomically per source.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let dbRows: Array<{ category: string; settingKey: string; settingValue: string; isEncrypted: number }> = [];
vi.mock("../db", () => ({
  getDb: async () => ({
    select: () => ({ from: () => ({ where: async () => dbRows }) }),
  }),
}));
vi.mock("./encryptionService", () => ({ encrypt: (v: string) => v, decrypt: (v: string) => v }));

import { getEffectiveSettings, getEffectiveWazuhConfig, invalidateCache, dbOwnsCredentialSet } from "./connectionSettingsService";

const ENV = { WAZUH_HOST: "env-host", WAZUH_USER: "env-user", WAZUH_PASS: "env-pass", WAZUH_PORT: "55001" };
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  invalidateCache();
  dbRows = [];
  for (const [k, v] of Object.entries(ENV)) { saved[k] = process.env[k]; process.env[k] = v; }
});
afterEach(() => {
  for (const k of Object.keys(ENV)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
});

const row = (settingKey: string, settingValue: string) => ({ category: "wazuh_manager", settingKey, settingValue, isEncrypted: 0 });

describe("L4 atomic credential resolution", () => {
  it("env-only: the whole set comes from env", async () => {
    const cfg = await getEffectiveWazuhConfig();
    expect(cfg).toEqual({ host: "env-host", port: 55001, user: "env-user", pass: "env-pass" });
  });

  it("DB host only: env user/pass are NOT paired with the DB host", async () => {
    dbRows = [row("host", "db-host")];
    const { values, sources } = await getEffectiveSettings("wazuh_manager");
    expect(values.host).toBe("db-host");
    expect(values.pass).toBeUndefined();
    expect(values.user).toBeUndefined();
    expect(sources.port).toBe("default"); // not env 55001
    expect(await getEffectiveWazuhConfig()).toBeNull();
  });

  it("DB pass only: the env host is not used either", async () => {
    dbRows = [row("pass", "db-pass")];
    const { values } = await getEffectiveSettings("wazuh_manager");
    expect(values.host).toBeUndefined();
    expect(values.pass).toBe("db-pass");
  });

  it("full DB set resolves entirely from DB", async () => {
    dbRows = [row("host", "db-host"), row("user", "db-user"), row("pass", "db-pass")];
    expect(await getEffectiveWazuhConfig()).toEqual({ host: "db-host", port: 55000, user: "db-user", pass: "db-pass" });
  });

  it("dbOwnsCredentialSet ignores non-identity keys", () => {
    expect(dbOwnsCredentialSet("wazuh_manager", { port: "1" })).toBe(false);
    expect(dbOwnsCredentialSet("llm", { model: "x" })).toBe(false);
    expect(dbOwnsCredentialSet("llm", { api_key: "k" })).toBe(true);
  });
});
