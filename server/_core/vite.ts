import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // In production esbuild outputs to dist/index.js, so import.meta.dirname = dist/
  // Static files are at dist/public/ (Vite build output)
  const distPath = path.resolve(import.meta.dirname, "public");

  // Fallback: check alternative paths for different deployment layouts
  const altPath = path.resolve(import.meta.dirname, "..", "..", "dist", "public");
  const resolvedPath = fs.existsSync(distPath) ? distPath : fs.existsSync(altPath) ? altPath : distPath;

  if (!fs.existsSync(resolvedPath)) {
    console.error(
      `Could not find the build directory: ${resolvedPath}, make sure to build the client first`
    );
  } else {
    console.log(`[Static] Serving from: ${resolvedPath}`);
  }

  // Serve static assets with aggressive caching (Vite adds content hashes)
  app.use(
    express.static(resolvedPath, {
      maxAge: "1y",
      immutable: true,
    })
  );

  // fall through to index.html if the file doesn't exist (SPA routing)
  app.use("*", (_req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(path.resolve(resolvedPath, "index.html"));
  });
}
