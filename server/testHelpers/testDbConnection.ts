/**
 * mysql2 connection options for DB-gated tests that open their own connection.
 *
 * Mirrors server/db.ts#getDb: TLS only when DB_SSL=true. (These suites used to
 * hard-code `ssl: {...}`, which only worked against the hosted dev database and
 * fails against a plain MySQL test container with "self-signed certificate".)
 */
export function testDbSslOptions(): { ssl?: { rejectUnauthorized: boolean } } {
  if (process.env.DB_SSL !== "true") return {};
  return {
    ssl: {
      rejectUnauthorized:
        process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" &&
        !(process.env.SKIP_TLS_VERIFY === "true" || process.env.SKIP_TLS_VERIFY === "1"),
    },
  };
}
