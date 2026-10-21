/**
 * Boot-time environment variable validation.
 * Prints clear diagnostic messages and exits if critical vars are missing.
 */

interface EnvCheck {
  key: string;
  required: boolean;
  description: string;
  category: "core" | "wazuh" | "indexer" | "auth" | "optional";
}

const ENV_CHECKS: EnvCheck[] = [
  // Core — app cannot start without these
  {
    key: "DATABASE_URL",
    required: true,
    description: "MySQL/TiDB connection string",
    category: "core",
  },
  {
    key: "JWT_SECRET",
    required: true,
    description: "Session cookie signing secret (min 32 chars recommended)",
    category: "core",
  },

  {
    key: "ENCRYPTION_KEY",
    required: false, // production requirement enforced by checkEncryptionKey()
    description: "Credential-encryption key, >= 32 chars (REQUIRED in production)",
    category: "core",
  },

  // Wazuh Manager API
  {
    key: "WAZUH_HOST",
    required: false,
    description: "Wazuh Manager API hostname or IP",
    category: "wazuh",
  },
  {
    key: "WAZUH_USER",
    required: false,
    description: "Wazuh API username",
    category: "wazuh",
  },
  {
    key: "WAZUH_PASS",
    required: false,
    description: "Wazuh API password",
    category: "wazuh",
  },
  {
    key: "WAZUH_PORT",
    required: false,
    description: "Wazuh API port (default: 55000)",
    category: "wazuh",
  },

  // Wazuh Indexer (OpenSearch)
  {
    key: "WAZUH_INDEXER_HOST",
    required: false,
    description: "Wazuh Indexer hostname or IP",
    category: "indexer",
  },
  {
    key: "WAZUH_INDEXER_USER",
    required: false,
    description: "Wazuh Indexer username",
    category: "indexer",
  },
  {
    key: "WAZUH_INDEXER_PASS",
    required: false,
    description: "Wazuh Indexer password",
    category: "indexer",
  },
  {
    key: "WAZUH_INDEXER_PORT",
    required: false,
    description: "Wazuh Indexer port (default: 9200)",
    category: "indexer",
  },


  // Optional Docker local auth
  {
    key: "LOCAL_ADMIN_USER",
    required: false,
    description: "Default admin username for local auth mode",
    category: "optional",
  },
  {
    key: "LOCAL_ADMIN_PASS",
    required: false,
    description: "Default admin password for local auth mode",
    category: "optional",
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  core: "Core (Required)",
  wazuh: "Wazuh Manager API",
  indexer: "Wazuh Indexer (OpenSearch)",
  auth: "Authentication",
  optional: "Optional",
};

/**
 * Validate environment variables at boot time.
 * Exits the process if critical variables are missing.
 * Prints warnings for optional but recommended variables.
 */
// ── Log masking ───────────────────────────────────────────────────────────────
// Never emit any part of a secret to stdout: the boot banner lands in `docker logs`
// and log shippers. Secrets print as a fixed mask plus a coarse length bucket;
// connection URLs have their userinfo password replaced before printing.
const SECRET_KEY_PATTERN = /PASS|SECRET|KEY|TOKEN/;
const URL_CREDENTIAL_PATTERN = /\/\/([^/:@]+):[^@]*@/g;

function lengthBucket(n: number): string {
  if (n < 16) return "<16 chars";
  if (n < 32) return "16–31 chars";
  if (n < 64) return "32–63 chars";
  return "64+ chars";
}

export function maskEnvValue(key: string, value: string): string {
  if (SECRET_KEY_PATTERN.test(key)) return `******** (set, ${lengthBucket(value.length)})`;
  const scrubbed = value.replace(URL_CREDENTIAL_PATTERN, "//$1:***@");
  return scrubbed.length > 60 ? `${scrubbed.substring(0, 57)}...` : scrubbed;
}

export const MIN_ENCRYPTION_KEY_LENGTH = 32;

/** ENCRYPTION_KEY policy (exported for tests). */
export function checkEncryptionKey(env: NodeJS.ProcessEnv = process.env): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const key = env.ENCRYPTION_KEY ?? "";
  const isProd = env.NODE_ENV === "production";
  const gen = "Generate with: openssl rand -hex 32";
  if (key.trim() === "") {
    if (isProd) errors.push(`ENCRYPTION_KEY is required in production (>= ${MIN_ENCRYPTION_KEY_LENGTH} chars) — it encrypts stored connection credentials. ${gen}`);
    else warnings.push(`ENCRYPTION_KEY not set — credential encryption falls back to a JWT_SECRET-derived key (development only). ${gen}`);
  } else if (key.length < MIN_ENCRYPTION_KEY_LENGTH) {
    if (isProd) errors.push(`ENCRYPTION_KEY is shorter than ${MIN_ENCRYPTION_KEY_LENGTH} characters. ${gen}`);
    else warnings.push(`ENCRYPTION_KEY is shorter than ${MIN_ENCRYPTION_KEY_LENGTH} characters and is IGNORED — falling back to a JWT_SECRET-derived key (development only). ${gen}`);
  } else if (env.JWT_SECRET && key === env.JWT_SECRET) {
    if (isProd) errors.push("ENCRYPTION_KEY must differ from JWT_SECRET");
    else warnings.push("ENCRYPTION_KEY equals JWT_SECRET — use an independent secret");
  }
  return { errors, warnings };
}

export function validateEnvironment(): {
  errors: string[];
  warnings: string[];
  info: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║          Dang! SIEM — Environment Check          ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Group checks by category
  const grouped = new Map<string, EnvCheck[]>();
  for (const check of ENV_CHECKS) {
    const list = grouped.get(check.category) || [];
    list.push(check);
    grouped.set(check.category, list);
  }

  for (const [category, checks] of Array.from(grouped.entries())) {
    const label = CATEGORY_LABELS[category] || category;
    console.log(`  ┌─ ${label}`);

    for (const check of checks) {
      const value = process.env[check.key];
      const isSet = value !== undefined && value.trim() !== "";

      if (isSet) {
        console.log(`  │  ✅ ${check.key} = ${maskEnvValue(check.key, value!)}`);
      } else if (check.required) {
        console.log(`  │  ❌ ${check.key} — MISSING (${check.description})`);
        errors.push(`${check.key}: ${check.description}`);
      } else {
        console.log(`  │  ⚠️  ${check.key} — not set (${check.description})`);
        if (category === "wazuh" || category === "indexer") {
          warnings.push(`${check.key}: ${check.description}`);
        }
      }
    }
    console.log("  └─");
  }

  // Auth mode — always local (JWT + bcrypt)
  console.log(
    `\n  🔐 Auth mode: LOCAL (JWT + bcrypt)`
  );
  info.push("Running in local auth mode — users register/login with username + password");
  if (!process.env.LOCAL_ADMIN_USER || !process.env.LOCAL_ADMIN_PASS) {
    info.push(
      "No LOCAL_ADMIN_USER/LOCAL_ADMIN_PASS set — first registered user becomes admin"
    );
  }

  // Check Wazuh connectivity config
  const hasWazuh =
    process.env.WAZUH_HOST &&
    process.env.WAZUH_USER &&
    process.env.WAZUH_PASS;
  const hasIndexer =
    process.env.WAZUH_INDEXER_HOST &&
    process.env.WAZUH_INDEXER_USER &&
    process.env.WAZUH_INDEXER_PASS;

  if (!hasWazuh) {
    warnings.push(
      "Wazuh Manager API not configured — agent and alert data will be unavailable"
    );
    console.log(
      "  ⚠️  Wazuh Manager API not fully configured — some features will be unavailable"
    );
  }
  if (!hasIndexer) {
    warnings.push(
      "Wazuh Indexer not configured — SIEM events and search will be unavailable"
    );
    console.log(
      "  ⚠️  Wazuh Indexer not fully configured — some features will be unavailable"
    );
  }

  // Audit #14: JWT_SECRET strength check
  // Hard-fail only for obviously weak secrets (common defaults).
  // Short-but-random secrets (e.g., platform-injected 22-char tokens) get a warning.
  const jwtSecret = process.env.JWT_SECRET;
  const WEAK_SECRETS = ["secret", "changeme", "password", "jwt_secret", "test", "dev", "123456"];
  if (jwtSecret && WEAK_SECRETS.includes(jwtSecret.toLowerCase())) {
    errors.push(
      `JWT_SECRET is a well-known default ("${jwtSecret}") — this MUST be changed. Generate with: openssl rand -hex 32`
    );
    console.error(
      "  ❌  JWT_SECRET is a well-known default — change it immediately"
    );
  } else if (jwtSecret && jwtSecret.length < 16) {
    // Under 16 chars is dangerously short regardless of randomness
    errors.push(
      "JWT_SECRET is shorter than 16 characters — this is too weak. Generate with: openssl rand -hex 32"
    );
    console.error(
      "  ❌  JWT_SECRET is too short — run `openssl rand -hex 32`"
    );
  } else if (jwtSecret && jwtSecret.length < 32) {
    // 16-31 chars: warn but don't block (platform-injected secrets may be ~22 chars)
    warnings.push(
      "JWT_SECRET is shorter than 32 characters — consider using a stronger secret (openssl rand -hex 32)"
    );
    console.log(
      "  ⚠️  JWT_SECRET is short (< 32 chars) — consider `openssl rand -hex 32` for a stronger secret"
    );
  }

  // L3/M3: ENCRYPTION_KEY encrypts stored connection credentials (v2, AAD-bound).
  // Required in production; elsewhere encryptionService falls back to a key
  // derived from JWT_SECRET with a loud warning.
  const encErrors = checkEncryptionKey();
  for (const e of encErrors.errors) {
    errors.push(e);
    console.error(`  ❌  ${e}`);
  }
  for (const w of encErrors.warnings) {
    warnings.push(w);
    console.log(`  ⚠️  ${w}`);
  }

  // Summary
  console.log("\n  ─────────────────────────────────────────────────");
  if (errors.length > 0) {
    console.error(
      `\n  ❌ ${errors.length} CRITICAL ERROR(S) — server cannot start:\n`
    );
    for (const err of errors) {
      console.error(`     • ${err}`);
    }
    console.error(
      "\n  Fix the above variables in your .env file or docker-compose.yml and restart.\n"
    );
  } else if (warnings.length > 0) {
    console.log(
      `\n  ✅ Core checks passed | ⚠️  ${warnings.length} warning(s)\n`
    );
  } else {
    console.log("\n  ✅ All environment checks passed\n");
  }

  return { errors, warnings, info };
}
