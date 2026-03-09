/**
 * Security Headers Middleware — Audit #95
 *
 * Adds Content-Security-Policy and Permissions-Policy headers to all responses.
 * These headers provide defense-in-depth against XSS, clickjacking, and
 * unauthorized access to browser APIs.
 *
 * CSP Policy:
 *   - default-src 'self': Only allow resources from same origin by default
 *   - script-src 'self' 'unsafe-inline': Allow inline scripts (needed for Vite HMR in dev)
 *   - style-src 'self' 'unsafe-inline' fonts.googleapis.com: Allow inline styles + Google Fonts CSS
 *   - font-src 'self' fonts.gstatic.com: Allow Google Fonts files
 *   - img-src 'self' data: blob:: Allow inline images and blob URLs (for charts)
 *   - connect-src 'self' wss: https:: Allow WebSocket (HMR) and HTTPS API calls
 *   - frame-ancestors 'none': Prevent embedding in iframes (clickjacking protection)
 *   - base-uri 'self': Prevent base tag hijacking
 *   - form-action 'self': Restrict form submissions to same origin
 *
 * Permissions-Policy:
 *   - Disables browser APIs not needed by a security dashboard:
 *     camera, microphone, geolocation, payment, usb, bluetooth, etc.
 *   - Allows fullscreen (for expanded dashboard views)
 */

import type { Request, Response, NextFunction } from "express";

const isDev = process.env.NODE_ENV !== "production";

// In development, Vite HMR needs 'unsafe-eval' for script-src and ws: for connect-src
const scriptSrc = isDev
  ? "'self' 'unsafe-inline' 'unsafe-eval'"
  : "'self' 'unsafe-inline'";

const connectSrc = isDev
  ? "'self' wss: ws: https:"
  : "'self' wss: https:";

const CSP_DIRECTIVES = [
  `default-src 'self'`,
  `script-src ${scriptSrc}`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' https://fonts.gstatic.com`,
  `img-src 'self' data: blob: https:`,
  `connect-src ${connectSrc}`,
  `frame-ancestors 'none'`,
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

  // Permissions-Policy (successor to Feature-Policy)
  res.setHeader("Permissions-Policy", PERMISSIONS_POLICY);

  // Additional hardening headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");

  next();
}
