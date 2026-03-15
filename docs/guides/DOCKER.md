# Dang! SIEM — Docker Deployment Guide

Self-hosted deployment of Dang! SIEM on Linux x86_64 systems using Docker.

---

## Prerequisites

| Requirement | Minimum | Recommended |
|---|---|---|
| OS | Ubuntu 22.04+ x86_64 | Ubuntu 24.04 LTS |
| Kernel | 5.15+ | 6.8+ |
| Docker | 24.0+ | 27.0+ |
| Docker Compose | v2.20+ | v2.30+ |
| RAM | 2 GB | 4 GB |
| Disk | 5 GB | 20 GB |
| Wazuh Manager | 4.7+ | 4.9+ |

The application connects to your **existing Wazuh Manager API** and **Wazuh Indexer (OpenSearch)**. It does not install or manage Wazuh itself.

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/cvalentine99/Dang-.git
cd Dang-

# 2. Create environment file from template
cp env.docker.template .env

# 3. Edit .env with your credentials
nano .env
#    Required: JWT_SECRET (generate with: openssl rand -hex 32)
#    Recommended: WAZUH_HOST, WAZUH_USER, WAZUH_PASS
#    Optional: LOCAL_ADMIN_USER, LOCAL_ADMIN_PASS (seeded admin account)

# 4. Build and start
chmod +x deploy.sh
./deploy.sh
```

The application will be available at **http://localhost:3000** (or the port configured in `APP_PORT`).

For HTTPS, add `--proxy caddy` (automatic Let's Encrypt) or `--proxy nginx` (bring your own certs):

```bash
# HTTPS with automatic certificates
./deploy.sh --proxy caddy

# HTTPS with your own certificates
./deploy.sh --generate-certs   # or place your own in proxy/nginx/ssl/
./deploy.sh --proxy nginx
```

See the [HTTPS Reverse Proxy](#https-reverse-proxy) section for full details.

---

## Environment Variables

### Required

| Variable | Description | Example |
|---|---|---|
| `JWT_SECRET` | Session signing key (generate with `openssl rand -hex 32`) | `a1b2c3d4e5f6...` |

### Authentication (Local Auth Mode)

When `OAUTH_SERVER_URL` is empty (the default for self-hosted), the app runs in **local auth mode** with JWT-based username/password login. If you set `LOCAL_ADMIN_USER` and `LOCAL_ADMIN_PASS`, that account is seeded as admin on first startup. Otherwise, the first user to register via the `/register` page becomes admin.

| Variable | Description | Default |
|---|---|---|
| `LOCAL_ADMIN_USER` | Seeded admin username | *(none — first registrant becomes admin)* |
| `LOCAL_ADMIN_PASS` | Seeded admin password | *(none)* |

### Wazuh Manager API (Recommended)

The app can start without Wazuh credentials, but all agent, alert, and vulnerability features will show "not configured" on the `/status` page.

| Variable | Description | Default |
|---|---|---|
| `WAZUH_HOST` | Wazuh Manager hostname or IP | *(none)* |
| `WAZUH_PORT` | Wazuh Manager API port | `55000` |
| `WAZUH_USER` | Wazuh API username | *(none)* |
| `WAZUH_PASS` | Wazuh API password | *(none)* |

### Wazuh Indexer (Recommended for SIEM Events and Threat Hunting)

| Variable | Description | Default |
|---|---|---|
| `WAZUH_INDEXER_HOST` | Indexer hostname or IP | *(none)* |
| `WAZUH_INDEXER_PORT` | Indexer port | `9200` |
| `WAZUH_INDEXER_USER` | Indexer username | *(none)* |
| `WAZUH_INDEXER_PASS` | Indexer password | *(none)* |
| `WAZUH_INDEXER_PROTOCOL` | `https` or `http` | `https` |

### Database

| Variable | Description | Default |
|---|---|---|
| `MYSQL_ROOT_PASSWORD` | MySQL root password | `dang_root_secret` |
| `MYSQL_DATABASE` | Database name | `dang` |
| `MYSQL_USER` | Application DB user | `dang` |
| `MYSQL_PASSWORD` | Application DB password | `dang_db_secret` |

### HTTPS Proxy (Optional)

| Variable | Description | Default |
|---|---|---|
| `DANG_DOMAIN` | Public domain for Caddy auto-TLS | *(empty = localhost)* |
| `ACME_EMAIL` | Email for Let's Encrypt notifications | `admin@example.com` |

### Optional

| Variable | Description | Default |
|---|---|---|
| `APP_PORT` | External web UI port (HTTP-only mode) | `3000` |
| `DB_EXTERNAL_PORT` | External MySQL port | `3306` |
| `RUN_MIGRATIONS` | Run DB migrations on startup | `true` |
| `OTX_API_KEY` | AlienVault OTX API key for threat intel | *(none)* |
| `VITE_APP_TITLE` | Application title | `Dang! SIEM` |

---

## Architecture

**Without proxy (HTTP only):**
```
┌─────────────────────────────────────────────────────┐
│  Docker Host (Linux x86_64)                         │
│                                                     │
│  ┌──────────────┐    ┌──────────────┐               │
│  │  dang-app    │    │  dang-db     │               │
│  │  (Node 22)   │───▶│  (MySQL 8)   │               │
│  │  :3000       │    │  :3306       │               │
│  └──────┬───────┘    └──────────────┘               │
│         │                                           │
└─────────┼───────────────────────────────────────────┘
          │
          ▼
┌─────────────────────┐    ┌─────────────────────┐
│  Wazuh Manager API  │    │  Wazuh Indexer       │
│  :55000 (HTTPS)     │    │  :9200 (HTTPS)       │
└─────────────────────┘    └─────────────────────┘
```

**With HTTPS proxy (Caddy or Nginx):**
```
                    ┌──────────────────────────────────────────────────────┐
  Browser           │  Docker Host (Linux x86_64)                          │
  (HTTPS)           │                                                      │
     │              │  ┌────────────────┐                                  │
     └─────────────▶│  │  Caddy / Nginx │                                  │
       :443         │  │  :80 → :443    │                                  │
                    │  └───────┬────────┘                                  │
                    │          │ (internal HTTP)                           │
                    │          ▼                                           │
                    │  ┌──────────────┐    ┌──────────────┐               │
                    │  │  dang-app    │    │  dang-db     │               │
                    │  │  (Node 22)   │───▶│  (MySQL 8)   │               │
                    │  │  :3000       │    │  :3306       │               │
                    │  └──────┬───────┘    └──────────────┘               │
                    │         │                                           │
                    └─────────┼───────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────┐    ┌─────────────────────┐
                    │  Wazuh Manager API  │    │  Wazuh Indexer       │
                    │  :55000 (HTTPS)     │    │  :9200 (HTTPS)       │
                    └─────────────────────┘    └─────────────────────┘
```

The application acts as a **read-only proxy** to Wazuh. All API calls flow through the backend, which enforces authentication, rate limiting, and field filtering. No Wazuh tokens are ever exposed to the browser. When a reverse proxy is enabled, the app container is not exposed to the host — all traffic flows through Caddy or Nginx on ports 80/443.

---

## Deploy Script Commands

```bash
# Basic (HTTP only)
./deploy.sh                        # Build and start all services
./deploy.sh --rebuild              # Force rebuild without Docker cache
./deploy.sh --stop                 # Stop all services
./deploy.sh --logs                 # Follow container logs
./deploy.sh --status               # Show service status + health check

# With HTTPS proxy
./deploy.sh --proxy caddy          # Start with Caddy (auto Let's Encrypt)
./deploy.sh --proxy nginx          # Start with Nginx (bring your own certs)
./deploy.sh --proxy caddy --stop   # Stop Caddy stack
./deploy.sh --proxy nginx --stop   # Stop Nginx stack
./deploy.sh --generate-certs       # Generate self-signed certs for Nginx
```

---

## Manual Docker Commands

```bash
# Build the image
docker compose build

# Start in background
docker compose up -d

# View logs
docker compose logs -f app

# Stop services
docker compose down

# Stop and remove volumes (WARNING: deletes database)
docker compose down -v

# Rebuild after code changes
docker compose build --no-cache && docker compose up -d
```

---

## Database Migrations

Migrations run automatically on startup when `RUN_MIGRATIONS=true`. For manual control:

```bash
# Disable auto-migration
RUN_MIGRATIONS=false

# Run migrations manually
docker compose exec app npx drizzle-kit migrate
```

---

## Health Check

The application exposes a health endpoint at `/api/health`:

```bash
curl http://localhost:3000/api/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-22T14:00:00.000Z",
  "database": "connected"
}
```

Docker uses this endpoint for automatic health monitoring. Unhealthy containers are restarted automatically with the `unless-stopped` restart policy.

### Status Dashboard

For a comprehensive view of all service connections, visit the **Status Dashboard** at `/status` in the web UI (requires login). This page shows:

- **MySQL** — database connectivity and latency
- **Wazuh Manager** — API reachability, version, and cluster info
- **Wazuh Indexer** — OpenSearch connectivity and cluster health
- **Auth mode** — whether local auth or Manus OAuth is active
- **Feature availability** — which features are enabled based on current configuration

The raw JSON is also available at `/api/status`:

```bash
curl http://localhost:3000/api/status
```

---

## Environment Validation

On startup, the server validates all environment variables and prints a diagnostic summary to the console. If critical variables (`DATABASE_URL`, `JWT_SECRET`) are missing, the server exits immediately with a clear error message. Optional variables (Wazuh, Indexer, OAuth) produce warnings but allow the server to start in degraded mode.

Example startup output:

```
╔══════════════════════════════════════════════════╗
║          Dang! SIEM — Environment Check          ║
╚══════════════════════════════════════════════════╝

  ┌─ Core (Required)
  │  ✅ DATABASE_URL = mysql://dang:****@db:3306/dang
  │  ✅ JWT_SECRET = a1b2****
  └─
  ┌─ Wazuh Manager API
  │  ✅ WAZUH_HOST = localhost
  │  ✅ WAZUH_USER = wazu****
  │  ✅ WAZUH_PASS = MyS3****
  └─

  🔐 Auth mode: LOCAL (JWT + bcrypt)
  ✅ All environment checks passed
```

---

## Network Configuration

### Firewall Rules

The application needs outbound access to your Wazuh infrastructure:

```bash
# Allow outbound to Wazuh Manager API
sudo ufw allow out to <WAZUH_HOST> port 55000

# Allow outbound to Wazuh Indexer
sudo ufw allow out to <WAZUH_INDEXER_HOST> port 9200

# Allow inbound to web UI
sudo ufw allow in 3000/tcp
```

### Self-Signed Certificates

The application accepts self-signed TLS certificates from Wazuh Manager and Indexer by default (`rejectUnauthorized: false`). This is standard for internal Wazuh deployments.

---

## HTTPS Reverse Proxy

Two reverse proxy options are included as Docker Compose overrides. Both terminate TLS in front of the application and add security headers (HSTS, X-Content-Type-Options, X-Frame-Options, XSS protection).

| Feature | Caddy | Nginx |
|---|---|---|
| TLS provisioning | Automatic (Let's Encrypt) | Manual (bring your own certs) |
| Configuration | 1 file, minimal | Full control, more verbose |
| HTTP/2 | Automatic | Configured |
| Best for | Public-facing, quick setup | Internal/air-gapped, existing PKI |

---

### Option A: Caddy (Recommended for Public Deployments)

Caddy automatically provisions and renews TLS certificates from Let's Encrypt. No certificate management required.

**Prerequisites:**
- A public domain pointing to your server (A record)
- Ports 80 and 443 open to the internet (Let's Encrypt validation)

**Setup:**

```bash
# 1. Set your domain and email in .env
nano .env
# Add/edit:
#   DANG_DOMAIN=siem.yourdomain.com
#   ACME_EMAIL=admin@yourdomain.com

# 2. Deploy with Caddy
./deploy.sh --proxy caddy

# 3. Access via HTTPS
curl https://siem.yourdomain.com/api/health
```

**How it works:**
- `docker-compose.caddy.yml` adds a Caddy container and removes the app's direct port exposure
- Caddy listens on ports 80 (redirect) and 443 (TLS)
- Certificates are stored in a persistent Docker volume (`caddy-data`)
- Renewal happens automatically ~30 days before expiry

**Caddy for localhost / internal use:**

If `DANG_DOMAIN` is empty or set to `localhost`, Caddy generates a self-signed certificate automatically. Browsers will show a warning, but the connection is still encrypted.

```bash
# Internal use — no domain required
DANG_DOMAIN=localhost
./deploy.sh --proxy caddy
```

**Files:**

```
proxy/caddy/Caddyfile          # Caddy configuration
docker-compose.caddy.yml       # Docker Compose override
```

---

### Option B: Nginx (For Internal / Air-Gapped Networks)

Nginx requires you to provide your own TLS certificates. This is ideal for internal SOC deployments, air-gapped networks, or environments with an existing PKI.

**Setup with self-signed certificates (testing):**

```bash
# 1. Generate self-signed certs
./deploy.sh --generate-certs
#    Creates: proxy/nginx/ssl/dang.crt and proxy/nginx/ssl/dang.key
#    Valid for 365 days, CN=dang.local

# 2. Deploy with Nginx
./deploy.sh --proxy nginx

# 3. Access via HTTPS (accept the self-signed cert warning)
curl -k https://localhost/api/health
```

**Setup with real certificates (production):**

```bash
# 1. Place your certificates
cp /path/to/fullchain.pem proxy/nginx/ssl/dang.crt
cp /path/to/privkey.pem   proxy/nginx/ssl/dang.key

# 2. (Optional) Generate DH parameters for extra security
openssl dhparam -out proxy/nginx/ssl/dhparam.pem 2048
# Then uncomment the ssl_dhparam line in proxy/nginx/nginx.conf

# 3. Deploy with Nginx
./deploy.sh --proxy nginx
```

**Setup with Let's Encrypt via Certbot (on host):**

```bash
# 1. Install Certbot on the host
sudo apt install certbot

# 2. Obtain certificates (stop any service on port 80 first)
sudo certbot certonly --standalone -d siem.yourdomain.com

# 3. Copy certs to the proxy directory
sudo cp /etc/letsencrypt/live/siem.yourdomain.com/fullchain.pem proxy/nginx/ssl/dang.crt
sudo cp /etc/letsencrypt/live/siem.yourdomain.com/privkey.pem   proxy/nginx/ssl/dang.key

# 4. Deploy
./deploy.sh --proxy nginx

# 5. Set up auto-renewal (add to crontab)
# 0 3 * * * certbot renew --quiet && cp /etc/letsencrypt/live/siem.yourdomain.com/fullchain.pem /path/to/Dang-/proxy/nginx/ssl/dang.crt && cp /etc/letsencrypt/live/siem.yourdomain.com/privkey.pem /path/to/Dang-/proxy/nginx/ssl/dang.key && docker compose -f docker-compose.yml -f docker-compose.nginx.yml exec nginx nginx -s reload
```

**Nginx features included:**
- HTTP to HTTPS redirect (port 80 → 443)
- TLS 1.2+ with modern cipher suite
- OCSP stapling
- Gzip compression
- Rate limiting (30 req/s for API, 5 req/min for login)
- Separate rate limit zones for `/api/` routes
- Health check endpoint excluded from rate limiting
- Static asset caching (1 year for Vite-hashed files)
- 120s read timeout for slow Wazuh queries

**Files:**

```
proxy/nginx/nginx.conf         # Full Nginx configuration
proxy/nginx/ssl/dang.crt       # TLS certificate (you provide)
proxy/nginx/ssl/dang.key       # TLS private key (you provide)
docker-compose.nginx.yml       # Docker Compose override
```

---

### Managing Proxy Services

```bash
# Start with proxy
./deploy.sh --proxy caddy
./deploy.sh --proxy nginx

# Stop everything (including proxy)
./deploy.sh --proxy caddy --stop
./deploy.sh --proxy nginx --stop

# View logs (including proxy)
./deploy.sh --proxy caddy --logs
./deploy.sh --proxy nginx --logs

# Check status
./deploy.sh --proxy caddy --status
./deploy.sh --proxy nginx --status

# Rebuild after changes
./deploy.sh --proxy caddy --rebuild
./deploy.sh --proxy nginx --rebuild
```

**Manual Docker Compose commands (without deploy.sh):**

```bash
# Caddy
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d
docker compose -f docker-compose.yml -f docker-compose.caddy.yml down

# Nginx
docker compose -f docker-compose.yml -f docker-compose.nginx.yml up -d
docker compose -f docker-compose.yml -f docker-compose.nginx.yml down
```

---

### Switching Between Proxy Modes

To switch from one proxy to another, stop the current stack first:

```bash
# Stop Caddy stack
./deploy.sh --proxy caddy --stop

# Start with Nginx instead
./deploy.sh --proxy nginx
```

To go back to HTTP-only (no proxy):

```bash
./deploy.sh --proxy caddy --stop   # or --proxy nginx --stop
./deploy.sh                         # Starts on http://localhost:3000
```

---

## Troubleshooting

### Application won't start

```bash
# Check logs
docker compose logs app

# Verify database is healthy
docker compose exec db mysqladmin ping -h localhost -u root -p

# Test Wazuh connectivity from inside the container
docker compose exec app curl -k https://<WAZUH_HOST>:55000/ -u <WAZUH_USER>:<WAZUH_PASS>
```

### Database connection errors

```bash
# Check if MySQL is running
docker compose ps db

# Check MySQL logs
docker compose logs db

# Verify DATABASE_URL is correct
docker compose exec app env | grep DATABASE_URL
```

### Build failures

```bash
# Clean Docker build cache
docker builder prune -f

# Rebuild from scratch
docker compose build --no-cache
```

### Port conflicts

If port 3000 or 3306 is already in use, change `APP_PORT` or `DB_EXTERNAL_PORT` in `.env`:

```bash
APP_PORT=8080
DB_EXTERNAL_PORT=3307
```

---

## Updating

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
./deploy.sh --rebuild

# Or manually
docker compose build --no-cache
docker compose up -d
```

---

## Backup & Restore

### Database Backup

```bash
# Backup
docker compose exec db mysqldump -u root -p${MYSQL_ROOT_PASSWORD} ${MYSQL_DATABASE} > backup_$(date +%Y%m%d).sql

# Restore
docker compose exec -T db mysql -u root -p${MYSQL_ROOT_PASSWORD} ${MYSQL_DATABASE} < backup_20260222.sql
```

### Volume Backup

```bash
# Stop services first
docker compose stop

# Backup volume
docker run --rm -v dang_dang-db-data:/data -v $(pwd):/backup alpine tar czf /backup/db-volume-backup.tar.gz -C /data .

# Restore volume
docker run --rm -v dang_dang-db-data:/data -v $(pwd):/backup alpine sh -c "cd /data && tar xzf /backup/db-volume-backup.tar.gz"

# Restart
docker compose start
```

---

## Security Notes

The application follows a strict security model:

1. **Read-only Wazuh access** — Only GET endpoints are used. No agent deletion, rule modification, or active response triggers.
2. **Server-side token handling** — Wazuh API tokens are never exposed to the browser or logged.
3. **Rate limiting** — Per-endpoint rate limits prevent overloading the Wazuh API.
4. **Field stripping** — Sensitive fields (passwords, tokens, secrets) are stripped from all API responses.
5. **Non-root container** — The application runs as a non-root user inside the container.
6. **Fail closed** — Auth or network errors show error states rather than degrading silently.

For production deployments, also consider:
- **Enable HTTPS** — Use `./deploy.sh --proxy caddy` for automatic TLS or `--proxy nginx` with your own certificates
- Restricting network access to the Wazuh Manager and Indexer
- Using Docker secrets instead of environment variables for sensitive values
- Enabling Docker content trust for image verification
- Generating DH parameters for Nginx: `openssl dhparam -out proxy/nginx/ssl/dhparam.pem 2048`

---

## CI/CD Pipeline

The project includes three GitHub Actions workflows that automate testing, building, and releasing. No additional secrets need to be configured in GitHub — the workflows use the built-in `GITHUB_TOKEN` for GHCR authentication and release creation.

### Workflows Overview

| Workflow | File | Trigger | Purpose |
|---|---|---|---|
| **CI** | `.github/workflows/ci.yml` | Push to `main`, PRs | Typecheck, test, build verification |
| **Docker Build** | `.github/workflows/docker.yml` | Push to `main`, version tags | Build multi-platform image, push to GHCR |
| **Release** | `.github/workflows/release.yml` | Version tags (`v*.*.*`) | Create GitHub Release with changelog |

### Continuous Integration (CI)

Every push to `main` and every pull request triggers three parallel jobs:

1. **Typecheck** — Runs `pnpm check` (TypeScript `--noEmit`) to catch type errors before merge.
2. **Test** — Runs `pnpm test` (Vitest) with minimal stub environment variables so server modules can load without real Wazuh credentials.
3. **Build** — Runs `pnpm build` (Vite + esbuild) and verifies that `dist/public/` and `dist/index.js` exist. This job depends on typecheck and test passing first.

Pull requests are blocked from merging until all three jobs pass (configure this under **Settings → Branches → Branch protection rules** in your GitHub repository).

### Docker Build & Push

When code is pushed to `main` or a version tag is created, the Docker workflow builds a multi-platform image (`linux/amd64` + `linux/arm64`) and pushes it to GitHub Container Registry.

**Image tagging strategy:**

| Event | Tags Applied |
|---|---|
| Push to `main` | `latest`, `sha-abc1234` |
| Tag `v1.2.3` | `1.2.3`, `1.2`, `1`, `latest`, `sha-abc1234` |

**Pull the image:**

```bash
# Latest from main
docker pull ghcr.io/cvalentine99/dang-siem:latest

# Specific version
docker pull ghcr.io/cvalentine99/dang-siem:1.2.3

# Specific commit
docker pull ghcr.io/cvalentine99/dang-siem:sha-abc1234
```

**Using the GHCR image instead of building locally:**

Replace the `build` section in `docker-compose.yml` with an `image` reference:

```yaml
services:
  app:
    image: ghcr.io/cvalentine99/dang-siem:latest
    # Remove the 'build' block
    # build:
    #   context: .
    #   dockerfile: Dockerfile
```

The workflow also generates SLSA build provenance attestations and an SBOM (Software Bill of Materials) for supply chain security.

### Creating a Release

To create a new versioned release:

```bash
# Tag the current commit with a semantic version
git tag v1.0.0
git push origin v1.0.0
```

This triggers both the Docker workflow (builds and tags the image as `1.0.0`) and the Release workflow (creates a GitHub Release with an auto-generated changelog of all commits since the previous tag).

### Dependabot

Dependabot is configured to check for updates weekly (Mondays at 9:00 AM CST) across three ecosystems:

| Ecosystem | What it updates | Grouping |
|---|---|---|
| **npm** | Node.js dependencies | Radix UI, TanStack, tRPC grouped; dev tools grouped |
| **github-actions** | Workflow action versions | Individual PRs |
| **docker** | Base image tags in Dockerfile | Individual PRs |

Each Dependabot PR triggers the CI workflow, so you can verify compatibility before merging. Major version bumps on React are excluded from automatic PRs to avoid breaking changes.

### Manual Docker Build

You can also trigger a Docker build manually from the Actions tab in GitHub. The workflow dispatch allows you to specify target platforms:

```
# Default: linux/amd64,linux/arm64
# For faster builds during development, you can specify just one:
# linux/amd64
```

### Recommended Branch Protection

After pushing the workflows to GitHub, configure branch protection for `main`:

1. Go to **Settings → Branches → Add rule**
2. Branch name pattern: `main`
3. Enable:
   - **Require status checks to pass before merging**
   - Select: `Typecheck`, `Test`, `Build`
   - **Require branches to be up to date before merging**
   - **Require pull request reviews before merging** (optional but recommended)
