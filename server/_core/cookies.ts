import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

/**
 * M7: `Secure` is forced in production and otherwise follows `req.secure`.
 * `req.secure` is Express's `req.protocol === "https"`, which only honours
 * X-Forwarded-Proto when the hop is trusted via the `trust proxy` setting —
 * never read X-Forwarded-Proto directly (any client can send it).
 * COOKIE_SECURE=false disables only the production forcing (plain-HTTP LAN
 * deployments); HTTPS requests always get Secure.
 */
function isSecureRequest(req: Request) {
  const forceInProd =
    process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false";
  return forceInProd || req.secure === true;
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  // const hostname = req.hostname;
  // const shouldSetDomain =
  //   hostname &&
  //   !LOCAL_HOSTS.has(hostname) &&
  //   !isIpAddress(hostname) &&
  //   hostname !== "127.0.0.1" &&
  //   hostname !== "::1";

  // const domain =
  //   shouldSetDomain && !hostname.startsWith(".")
  //     ? `.${hostname}`
  //     : shouldSetDomain
  //       ? hostname
  //       : undefined;

  const secure = isSecureRequest(req);
  return {
    httpOnly: true,
    path: "/",
    // Audit #12: Always use SameSite=Lax for CSRF protection.
    // SameSite=None is only needed for cross-origin iframe embedding,
    // which this app does not use. Lax allows same-site navigation
    // while blocking cross-origin POST-based CSRF attacks.
    sameSite: "lax",
    secure,
  };
}
