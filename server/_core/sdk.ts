/**
 * SDK Server — JWT session management for local auth.
 *
 * Handles:
 * - Session token creation (JWT signing)
 * - Session token verification
 * - Request authentication (cookie → JWT → user lookup)
 *
 * No OAuth. No external auth providers.
 */

import { COOKIE_NAME } from "@shared/const";

// Audit #15: Reduce session lifetime from 1 year to 24 hours
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
import { ForbiddenError } from "@shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import { and, eq, sql } from "drizzle-orm";
import { users, type User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
  /** users.tokenVersion at mint time. Required — tokens without it are rejected. */
  tv: number;
};

/** A cryptographically verified session (not yet checked against the user row). */
export type VerifiedSession = {
  openId: string;
  appId: string;
  name: string;
  tv: number;
  /** issued-at, epoch seconds */
  iat: number;
  /** expiry, epoch seconds */
  exp: number;
};

/**
 * P2-10 / H-A7 / H-A8: Session revocation is DB-backed via users.tokenVersion
 * (the old per-process in-memory blocklist was unbounded — an unauthenticated
 * OOM via junk cookies on logout — and lost on restart). A session is current
 * only if its `tv` claim equals the row's tokenVersion (bumped on logout,
 * password reset, role change, disable) and it was issued no earlier than
 * passwordChangedAt (second precision; passwordChangedAt is written truncated
 * to the second so a login in the same second as a reset is not rejected —
 * older tokens from that second are still killed by the tokenVersion bump).
 */
export function isSessionCurrent(
  session: Pick<VerifiedSession, "tv" | "iat">,
  user: Pick<User, "tokenVersion" | "passwordChangedAt">
): boolean {
  if (!Number.isInteger(session.tv) || session.tv !== user.tokenVersion) return false;
  if (user.passwordChangedAt) {
    const changedMs = new Date(user.passwordChangedAt).getTime();
    if (session.iat * 1000 < changedMs) return false;
  }
  return true;
}

/** passwordChangedAt value for "now", truncated to whole seconds (see isSessionCurrent). */
export function passwordChangedAtNow(): Date {
  return new Date(Math.floor(Date.now() / 1000) * 1000);
}

class SDKServer {
  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  private getSessionSecret() {
    const secret = ENV.cookieSecret;
    if (!secret || secret.length < 16) {
      throw new Error(
        "JWT_SECRET is missing or too weak (< 16 chars). " +
        "Generate a strong secret with: openssl rand -hex 32"
      );
    }
    return new TextEncoder().encode(secret);
  }

  /**
   * Create a session token for a local user.
   */
  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string; tokenVersion: number }
  ): Promise<string> {
    return this.signSession(
      {
        openId,
        appId: ENV.appId || "dang-local",
        name: options.name || "",
        tv: options.tokenVersion,
      },
      options
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? SESSION_TTL_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    // Audit #16: Include issuer and audience for JWT binding
    const appId = payload.appId || ENV.appId || "dang-local";
    if (!Number.isInteger(payload.tv) || payload.tv < 0) {
      throw new Error("signSession: tv (users.tokenVersion) is required");
    }
    return new SignJWT({
      openId: payload.openId,
      appId,
      name: payload.name,
      tv: payload.tv,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(Math.floor(issuedAt / 1000))
      .setExpirationTime(expirationSeconds)
      .setIssuer("dang-siem")
      .setAudience(appId)
      .sign(secretKey);
  }

  /**
   * Verify the JWT signature/claims. Does NOT check revocation — that needs the
   * user row; see isSessionCurrent / authenticateRequest.
   */
  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<VerifiedSession | null> {
    if (!cookieValue) {
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      // Audit #16: Enforce issuer and audience on verification
      const expectedAppId = ENV.appId || "dang-local";
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
        issuer: "dang-siem",
        audience: expectedAppId,
      });
      const { openId, appId, name, tv, iat, exp } = payload as Record<string, unknown>;

      if (
        !isNonEmptyString(openId) ||
        !isNonEmptyString(appId) ||
        !isNonEmptyString(name) ||
        typeof tv !== "number" ||
        !Number.isInteger(tv) ||
        typeof iat !== "number" ||
        typeof exp !== "number"
      ) {
        // Tokens minted before tokenVersion existed carry no `tv` → rejected
        // (one forced re-login after upgrade).
        return null;
      }

      return { openId, appId, name, tv, iat, exp };
    } catch {
      return null;
    }
  }

  /**
   * Revoke every session of the token's owner by bumping users.tokenVersion.
   * Only acts if the token VERIFIES and is still current (tv matches), so
   * unauthenticated input is never stored anywhere and a stale/stolen-but-
   * already-revoked token cannot keep logging the user out. Returns true if a
   * row was bumped.
   */
  async revokeSessionToken(cookieValue: string | undefined | null): Promise<boolean> {
    const session = await this.verifySession(cookieValue);
    if (!session) return false;
    const database = await db.getDb();
    if (!database) return false;
    const result = await database
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(and(eq(users.openId, session.openId), eq(users.tokenVersion, session.tv)));
    const header = (Array.isArray(result) ? result[0] : result) as { affectedRows?: number } | undefined;
    return (header?.affectedRows ?? 0) > 0;
  }

  /**
   * Re-check a long-lived connection (SSE) against the user row: the user must
   * still exist, not be disabled, and have the same tokenVersion the stream was
   * opened with. Fails closed on DB errors.
   */
  async isUserSessionStillValid(openId: string, tokenVersion: number): Promise<boolean> {
    try {
      const user = await db.getUserByOpenId(openId);
      return !!user && !user.isDisabled && user.tokenVersion === tokenVersion;
    } catch {
      return false;
    }
  }

  /**
   * Authenticate a request by verifying the session cookie and looking up the user.
   * Local auth only — no OAuth fallback.
   */
  async authenticateRequest(req: Request): Promise<User> {
    return (await this.authenticateRequestWithSession(req)).user;
  }

  /** As authenticateRequest, but also returns the verified session claims. */
  async authenticateRequestWithSession(
    req: Request
  ): Promise<{ user: User; session: VerifiedSession }> {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    const user = await db.getUserByOpenId(session.openId);

    if (!user) {
      throw ForbiddenError("User not found");
    }

    // Audit #13: Block disabled users from authenticating
    if (user.isDisabled) {
      throw ForbiddenError("Account is disabled");
    }

    // P2-10: DB-backed revocation (logout / password reset / role change / disable)
    if (!isSessionCurrent(session, user)) {
      throw ForbiddenError("Session revoked");
    }

    // Audit #37: Lightweight last-signed-in update — only UPDATE (not upsert),
    // and only if stale > 15 minutes to reduce DB writes on hot auth paths.
    const STALE_THRESHOLD_MS = 15 * 60 * 1000;
    if (!user.lastSignedIn || Date.now() - new Date(user.lastSignedIn).getTime() > STALE_THRESHOLD_MS) {
      // Fire-and-forget — don't block the auth response
      db.updateLastSignedIn(user.openId).catch(() => {});
    }

    return { user, session };
  }
}

export const sdk = new SDKServer();
