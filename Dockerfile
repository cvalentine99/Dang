# ============================================================================
# Dang! SIEM — Multi-stage Docker build
# Target: Linux x86_64 (Ubuntu 22.04+)
# ============================================================================

# ── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM node:22-slim AS deps

# Install pnpm via npm (more reliable than corepack in restricted networks)
RUN npm install -g pnpm@10.4.1

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ───────────────────────────────────────────────────────────
FROM node:22-slim AS builder

RUN npm install -g pnpm@10.4.1

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build frontend (Vite → dist/public/) and backend (esbuild → dist/index.js)
# DOCKER_BUILD flag tells vite.config.ts to exclude hosted-platform plugins
# (runtime overlay, analytics, debug collector) that only work on hosted platforms.
ENV DOCKER_BUILD=1
RUN pnpm run build

# ── Stage 3: Production ─────────────────────────────────────────────────────
FROM node:22-slim AS production

RUN npm install -g pnpm@10.4.1

# Install curl for health checks and tini for proper signal handling
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package.json for npm_package_version at runtime
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# #94: Production-only dependencies — vite is now dynamically imported
# in dev mode only, so devDependencies are not needed at runtime.
RUN pnpm install --frozen-lockfile --prod && pnpm store prune

# Copy built artifacts from builder
# esbuild bundles server → dist/index.js
# Vite builds client  → dist/public/ (index.html, assets/)
COPY --from=builder /app/dist ./dist

# Copy drizzle migrations for runtime migration support
COPY drizzle/ ./drizzle/
COPY drizzle.config.ts ./

# Copy pre-migration repair script and KG seeder
COPY scripts/docker-pre-migrate.mjs ./scripts/
COPY seed-kg.mjs ./
COPY spec-v4.14.3.yaml ./

# Copy shared KG ETL source modules (seed-kg.mjs imports these via tsx)
COPY server/graph/kgExtractor.ts ./server/graph/
COPY server/graph/kgLoader.ts ./server/graph/
COPY server/graph/kgTypes.ts ./server/graph/
COPY server/graph/kgMetadata.ts ./server/graph/

# Copy entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Non-root user for security
RUN groupadd -r dang && useradd -r -g dang -d /app dang
RUN chown -R dang:dang /app
USER dang

# Default environment
ENV NODE_ENV=production
ENV PORT=3000
ENV SKIP_TLS_VERIFY=true

EXPOSE 3000

# Health check — hits the lightweight /api/health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}/api/health || exit 1

# Use tini as init system for proper signal handling
ENTRYPOINT ["tini", "--"]
CMD ["./docker-entrypoint.sh"]
