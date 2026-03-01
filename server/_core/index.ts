import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

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
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Simple health check for Docker / load balancers
  app.get("/api/health", async (_req, res) => {
    try {
      const { getDb } = await import("../db");
      const db = await getDb();
      const dbOk = !!db;
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

  // Comprehensive status endpoint for the /status dashboard
  app.get("/api/status", async (_req, res) => {
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

  // SSE alert stream endpoint
  const { handleSSEConnection, getStreamStats } = await import("../sse/alertStreamService");
  app.get("/api/sse/alerts", handleSSEConnection);
  app.get("/api/sse/stats", (_req, res) => {
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
      const { startBaselineScheduler } = require("../baselines/baselineSchedulerService");
      startBaselineScheduler();
    } catch (err) {
      console.warn(`[BaselineScheduler] Failed to start: ${(err as Error).message}`);
    }
  });
}

startServer().catch(console.error);
