/**
 * Shared TLS Agent — gates `rejectUnauthorized` on the `SKIP_TLS_VERIFY` env flag.
 *
 * Default: TLS verification is ENABLED (rejectUnauthorized: true).
 * Set `SKIP_TLS_VERIFY=true` in the environment to disable TLS verification
 * for self-signed certificates (common in Wazuh lab deployments).
 *
 * Audit finding #4: All 4 call sites previously hardcoded `rejectUnauthorized: false`,
 * creating a MITM risk on all integrations. This module centralizes the decision.
 */
import https from "https";

/**
 * Whether TLS verification should be skipped.
 * Only `true` when the env var `SKIP_TLS_VERIFY` is explicitly set to "true" or "1".
 */
export const SKIP_TLS_VERIFY =
  process.env.SKIP_TLS_VERIFY === "true" || process.env.SKIP_TLS_VERIFY === "1";

/**
 * Pre-built HTTPS agent that respects the `SKIP_TLS_VERIFY` env flag.
 * Reuse this across all Axios instances that connect to Wazuh / Indexer.
 */
export const sharedHttpsAgent = new https.Agent({
  rejectUnauthorized: !SKIP_TLS_VERIFY,
});

/**
 * Create a new HTTPS agent with the same TLS policy.
 * Use when you need a separate agent instance (e.g., for connection pooling isolation).
 */
export function createTlsAgent(): https.Agent {
  return new https.Agent({
    rejectUnauthorized: !SKIP_TLS_VERIFY,
  });
}

// Log the TLS policy at boot time
if (SKIP_TLS_VERIFY) {
  console.warn(
    "[TLS] ⚠️  TLS verification DISABLED (SKIP_TLS_VERIFY=true). " +
    "This is acceptable for self-signed certs in lab environments but MUST NOT be used in production."
  );
} else {
  console.log("[TLS] ✅ TLS verification enabled (default). Set SKIP_TLS_VERIFY=true for self-signed certs.");
}
