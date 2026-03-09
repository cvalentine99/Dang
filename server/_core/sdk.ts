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
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
};

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
    return new TextEncoder().encode(secret);
  }

  /**
   * Create a session token for a local user.
   */
  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string } = {}
  ): Promise<string> {
    return this.signSession(
      {
        openId,
        appId: ENV.appId || "dang-local",
        name: options.name || "",
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
    return new SignJWT({
      openId: payload.openId,
      appId,
      name: payload.name,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(Math.floor(issuedAt / 1000))
      .setExpirationTime(expirationSeconds)
      .setIssuer("dang-siem")
      .setAudience(appId)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ openId: string; appId: string; name: string } | null> {
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
      const { openId, appId, name } = payload as Record<string, unknown>;

      if (
        !isNonEmptyString(openId) ||
        !isNonEmptyString(appId) ||
        !isNonEmptyString(name)
      ) {
        return null;
      }

      return { openId, appId, name };
    } catch {
      return null;
    }
  }

  /**
   * Authenticate a request by verifying the session cookie and looking up the user.
   * Local auth only — no OAuth fallback.
   */
  async authenticateRequest(req: Request): Promise<User> {
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

    // Audit #37: Lightweight last-signed-in update — only UPDATE (not upsert),
    // and only if stale > 15 minutes to reduce DB writes on hot auth paths.
    const STALE_THRESHOLD_MS = 15 * 60 * 1000;
    if (!user.lastSignedIn || Date.now() - new Date(user.lastSignedIn).getTime() > STALE_THRESHOLD_MS) {
      // Fire-and-forget — don't block the auth response
      db.updateLastSignedIn(user.openId).catch(() => {});
    }

    return user;
  }
}

export const sdk = new SDKServer();
