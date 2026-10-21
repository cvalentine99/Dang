/**
 * Security Headers Middleware — Audit #95 + Code Review S-3, S-4, S-11
 *
 * Adds Content-Security-Policy, HSTS, and Permissions-Policy headers to all responses.
 * These headers provide defense-in-depth against XSS, clickjacking, and
 * unauthorized access to browser APIs.
 *
 * CSP Policy:
 *   - default-src 'self': Only allow resources from same origin by default
 *   - script-src 'self': Scripts from same origin only (no unsafe-inline in production)
 *   - style-src 'self' 'unsafe-inline' fonts.googleapis.com: Allow inline styles + Google Fonts CSS
 *   - font-src 'self' fonts.gstatic.com: Allow Google Fonts files
 *   - img-src 'self' data: blob:: Same-origin, inline and blob images only (charts).
 *     No `https:` — that would let LLM-authored markdown images beacon data
 *     to arbitrary hosts (review H-L8).
 *   - connect-src: dev 'self' wss: ws: https: (HMR); prod 'self' wss: + Google Fonts
 *   - frame-ancestors 'none': Prevent embedding in iframes (clickjacking protection)
 *     (dev only: `*`, for the preview iframe)
 *
 * Mode selection FAILS CLOSED: only NODE_ENV === "development" gets the relaxed
 * dev policy. Unset, "test", "staging", "production", or anything else gets
 * the production policy (no unsafe-inline/eval, frame-ancestors 'none', HSTS, XFO).
 *   - base-uri 'self': Prevent base tag hijacking
 *   - form-action 'self': Restrict form submissions to same origin
 *
 * Permissions-Policy:
 *   - Disables browser APIs not needed by a security dashboard:
 *     camera, microphone, geolocation, payment, usb, bluetooth, etc.
 *   - Allows fullscreen (for expanded dashboard views)
 */

import type { Request, Response, NextFunction } from "express";

// M2: fail closed — matches the server's own `=== "development"` serving switch.
const isDev = process.env.NODE_ENV === "development";

// In development, Vite HMR needs 'unsafe-inline' and 'unsafe-eval' for hot module replacement.
// In production, no inline scripts exist because:
// - vite.config.ts sets build.modulePreload.polyfill: false (no inline polyfill)
// - The built index.html only has <script type="module" src="..."> external references
// - 'strict-dynamic' is not needed since there are no inline bootstrapping scripts
const scriptSrc = isDev
  ? "'self' 'unsafe-inline' 'unsafe-eval'"
  : "'self'";

// S-11: Tighten connect-src in production to specific origins instead of blanket https:
const connectSrc = isDev
  ? "'self' wss: ws: https:"
  : "'self' wss: https://fonts.googleapis.com https://fonts.gstatic.com";

export const CSP_DIRECTIVES = [
  `default-src 'self'`,
  `script-src ${scriptSrc}`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' https://fonts.gstatic.com`,
  `img-src 'self' data: blob:`,
  `connect-src ${connectSrc}`,
  isDev ? `frame-ancestors *` : `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
].join("; ");

const PERMISSIONS_POLICY = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "bluetooth=()",
  "magnetometer=()",
  "gyroscope=()",
  "accelerometer=()",
  "autoplay=()",
  "fullscreen=(self)",
].join(", ");

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  // Content-Security-Policy
  res.setHeader("Content-Security-Policy", CSP_DIRECTIVES);

  // S-3: Strict-Transport-Security — enforce HTTPS for 1 year, include subdomains
  if (!isDev) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }

  // Permissions-Policy (successor to Feature-Policy)
  res.setHeader("Permissions-Policy", PERMISSIONS_POLICY);

  // Additional hardening headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  // In dev, allow iframe embedding for the Manus Preview panel;
  // in production, block all framing (clickjacking protection).
  if (!isDev) {
    res.setHeader("X-Frame-Options", "DENY");
  }
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");

  next();
}
