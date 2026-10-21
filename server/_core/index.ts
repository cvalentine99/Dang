import "dotenv/config";
import express from "express";
// NOTE: requires `pnpm add cors @types/cors` — package not yet in dependencies
import cors from "cors";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { sdk } from "./sdk";
import { serveStatic, setupVite } from "./vite";
import { startBaselineScheduler } from "../baselines/baselineSchedulerService";
import { securityHeaders } from "../securityHeaders";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Validate environment variables before anything else
  const { validateEnvironment } = await import("./envValidation");
  const { errors: envErrors } = validateEnvironment();
  if (envErrors.length > 0) {
    console.error("\n[FATAL] Cannot start — fix the missing environment variables above.\n");
    process.exit(1);
  }

  // Seed admin user in local auth mode
  try {
    const { seedAdminUser } = await import("../localAuth/localAuthService");
    await seedAdminUser();
  } catch (e) {
    // Non-fatal: seeding may fail if DB isn't ready yet
    console.warn("[Startup] Admin seeding skipped:", (e as Error).message);
  }

  const app = express();

  // Configure trust proxy from environment.
  // Required when running behind nginx/caddy so req.ip reflects the real client
  // (the login/register rate limiter keys on req.ip; cookies use req.secure).
  // Values: "1"/N (hop count), "true" (treated as 1 hop), a comma-separated
  // list of CIDRs / proxy-addr keywords (loopback, linklocal, uniquelocal),
  // or unset/"false"/"0" (direct exposure — X-Forwarded-* ignored).
  // H-A3: "true" is NOT passed through as Express `true` (trust every hop),
  // because then req.ip is the left-most X-Forwarded-For entry — client-chosen.
  const trustProxyRaw = (process.env.TRUST_PROXY ?? "").trim();
  if (trustProxyRaw && trustProxyRaw !== "false" && trustProxyRaw !== "0") {
    let trustProxy: number | string[];
    if (trustProxyRaw === "true") {
      trustProxy = 1;
      console.warn('[Startup] TRUST_PROXY="true" interpreted as 1 trusted hop (trusting all hops allows client IP spoofing). Set a hop count or CIDR list to silence this.');
    } else if (/^\d+$/.test(trustProxyRaw)) {
      trustProxy = Number(trustProxyRaw);
    } else {
      trustProxy = trustProxyRaw.split(",").map((s) => s.trim()).filter(Boolean);
    }
    app.set("trust proxy", trustProxy);
    console.log(`[Startup] trust proxy = ${JSON.stringify(trustProxy)}`);
  } else {
    // Operator hint: X-Forwarded-For on a login attempt while TRUST_PROXY is unset
    // means a proxy is in front but untrusted — every client shares the proxy's
    // rate-limit bucket and cookies may lack Secure. Logged once.
    let warnedUntrustedXff = false;
    app.use("/api/trpc", (req, _res, next) => {
      if (!warnedUntrustedXff && req.headers["x-forwarded-for"] && /localAuth\.(?:login|register)/.test(req.path)) {
        warnedUntrustedXff = true;
        console.warn("[Startup] X-Forwarded-For seen on a login request but TRUST_PROXY is unset — set TRUST_PROXY=1 (one proxy hop) so rate limiting sees real client IPs.");
      }
      next();
    });
  }

  const server = createServer(app);
  // Body parser — 2mb is sufficient for JSON API payloads; the app does not
  // handle file uploads through the JSON body parser.
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ limit: "2mb", extended: true }));

  // Explicit CORS policy — same-origin by default, configurable via CORS_ORIGIN
  const corsOrigin = process.env.CORS_ORIGIN || false;
  app.use(cors({
    origin: corsOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }));

  // Audit #95: Security headers (CSP, Permissions-Policy, X-Frame-Options, etc.)
  app.use(securityHeaders);
  // Simple health check for Docker / load balancers
  app.get("/api/health", async (_req, res) => {
    try {
      const { getDb } = await import("../db");
      const db = await getDb();
      // createPool() is lazy — a pool object exists even when MySQL is down — so a
      // real round-trip is the only honest readiness signal. This endpoint drives the
      // container HEALTHCHECK and the proxies' depends_on.
      let dbOk = false;
      if (db) {
        try {
          const { sql } = await import("drizzle-orm");
          await db.execute(sql`SELECT 1`);
          dbOk = true;
        } catch {
          dbOk = false;
        }
      }
      res.status(dbOk ? 200 : 503).json({
        status: dbOk ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        database: dbOk ? "connected" : "unavailable",
      });
    } catch {
      res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Auth middleware for status endpoint — validates session cookie
  const statusAuthMiddleware: import("express").RequestHandler = async (req, res, next) => {
    try {
      await sdk.authenticateRequest(req);
      next();
    } catch {
      res.status(401).json({ error: "Authentication required for status endpoint" });
    }
  };

  // Comprehensive status endpoint for the /status dashboard (protected)
  app.get("/api/status", statusAuthMiddleware, async (_req, res) => {
    const startTime = Date.now();
    const HEALTH_CHECK_TIMEOUT = 5_000;

    type CheckResult = {
      status: "connected" | "disconnected" | "not_configured" | "error";
      latencyMs?: number;
      details?: Record<string, unknown>;
      error?: string;
    };

    function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
      return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Health check timed out after ${ms}ms`)), ms)
        ),
      ]);
    }

    // 1. MySQL / Database check
    async function checkDatabase(): Promise<CheckResult> {
      try {
        const dbStart = Date.now();
        const { getDb } = await import("../db");
        const db = await getDb();
        if (db) {
          const { sql } = await import("drizzle-orm");
          await db.execute(sql`SELECT 1`);
          return {
            status: "connected",
            latencyMs: Date.now() - dbStart,
            details: { url: process.env.DATABASE_URL ? "configured" : "missing" },
          };
        }
        return { status: "disconnected", error: "Database instance not available" };
      } catch (err) {
        return { status: "error", error: (err as Error).message.substring(0, 200) };
      }
    }

    // 2. Wazuh Manager API check
    async function checkWazuhManager(): Promise<CheckResult> {
      try {
        const { getEffectiveWazuhConfig } = await import("../wazuh/wazuhClient");
        const config = await getEffectiveWazuhConfig();
        if (!config) return { status: "not_configured" };

        const wStart = Date.now();
        const net = await import("net");
        await new Promise<void>((resolve, reject) => {
          const socket = net.createConnection({ host: config.host, port: config.port, timeout: HEALTH_CHECK_TIMEOUT });
          socket.on("connect", () => { socket.destroy(); resolve(); });
          socket.on("timeout", () => { socket.destroy(); reject(new Error(`Cannot reach ${config.host}:${config.port} (timeout)`)); });
          socket.on("error", (err) => { socket.destroy(); reject(err); });
        });

        return {
          status: "connected",
          latencyMs: Date.now() - wStart,
          details: { host: config.host, port: config.port },
        };
      } catch (err) {
        return { status: "error", error: (err as Error).message.substring(0, 200) };
      }
    }

    // 3. Wazuh Indexer (OpenSearch) check
    async function checkWazuhIndexer(): Promise<CheckResult> {
      try {
        const { getEffectiveIndexerConfig } = await import("../indexer/indexerClient");
        const config = await getEffectiveIndexerConfig();
        if (!config) return { status: "not_configured" };

        const iStart = Date.now();
        const net = await import("net");
        await new Promise<void>((resolve, reject) => {
          const socket = net.createConnection({ host: config.host, port: config.port, timeout: HEALTH_CHECK_TIMEOUT });
          socket.on("connect", () => { socket.destroy(); resolve(); });
          socket.on("timeout", () => { socket.destroy(); reject(new Error(`Cannot reach ${config.host}:${config.port} (timeout)`)); });
          socket.on("error", (err) => { socket.destroy(); reject(err); });
        });

        return {
          status: "connected",
          latencyMs: Date.now() - iStart,
          details: { host: config.host, port: config.port },
        };
      } catch (err) {
        return { status: "error", error: (err as Error).message.substring(0, 200) };
      }
    }

    // Run all checks in parallel with timeout
    const [database, wazuhManager, wazuhIndexer] = await Promise.all([
      withTimeout(checkDatabase(), HEALTH_CHECK_TIMEOUT),
      withTimeout(checkWazuhManager(), HEALTH_CHECK_TIMEOUT).catch(
        (err): CheckResult => ({ status: "error", error: (err as Error).message.substring(0, 200) })
      ),
      withTimeout(checkWazuhIndexer(), HEALTH_CHECK_TIMEOUT).catch(
        (err): CheckResult => ({ status: "error", error: (err as Error).message.substring(0, 200) })
      ),
    ]);

    const checks = { database, wazuhManager, wazuhIndexer };

    // Auth mode — always local
    const authMode = "local";

    // Determine overall status
    const statuses = Object.values(checks).map(c => c.status);
    const overallStatus = statuses.every(s => s === "connected" || s === "not_configured")
      ? "healthy"
      : statuses.some(s => s === "connected")
        ? "degraded"
        : "unhealthy";

    res.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      totalLatencyMs: Date.now() - startTime,
      authMode,
      version: process.env.npm_package_version || "dev",
      nodeEnv: process.env.NODE_ENV || "development",
      checks,
    });
  });

  // SSE alert stream endpoint — authenticated
  const { handleSSEConnection, getStreamStats, setSSEAuth } = await import("../sse/alertStreamService");

  // SSE auth middleware: validates session cookie before allowing connection.
  // H-A2: stores the verified identity on the request so the stream can
  // re-validate it on every heartbeat (logout / disable / role change / expiry).
  const sseAuthMiddleware: import("express").RequestHandler = async (req, res, next) => {
    try {
      const { user, session } = await sdk.authenticateRequestWithSession(req);
      setSSEAuth(req, {
        userId: user.id,
        openId: user.openId,
        tokenVersion: user.tokenVersion,
        expiresAtMs: session.exp * 1000,
      });
      next();
    } catch {
      res.status(401).json({ error: "Authentication required for SSE stream" });
    }
  };

  app.get("/api/sse/alerts", sseAuthMiddleware, handleSSEConnection);
  app.get("/api/sse/stats", sseAuthMiddleware, (_req, res) => {
    res.json(getStreamStats());
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);

    // Start the baseline auto-capture scheduler
    try {
      startBaselineScheduler();
    } catch (err) {
      console.warn(`[BaselineScheduler] Failed to start: ${(err as Error).message}`);
    }
  });

  // Graceful shutdown handler
  const shutdown = (signal: string) => {
    console.log(`\n[Shutdown] ${signal} received. Closing server...`);
    server.close(() => {
      console.log("[Shutdown] HTTP server closed.");
      process.exit(0);
    });

    // Force exit after timeout if graceful shutdown stalls
    setTimeout(() => {
      console.error("[Shutdown] Forced exit after 10s timeout.");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch(console.error);
