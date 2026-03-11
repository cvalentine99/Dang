#!/usr/bin/env bash
# ============================================================================
# Dang! SIEM — Deployment Script
# Target: Linux x86_64 (Ubuntu 22.04+, kernel 6.8+)
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh                     # HTTP only on port 3000
#   ./deploy.sh --proxy caddy       # HTTPS via Caddy (auto Let's Encrypt)
#   ./deploy.sh --proxy nginx       # HTTPS via Nginx (bring your own certs)
#   ./deploy.sh --gpu               # Include local Nemotron Nano on CUDA
#   ./deploy.sh --proxy caddy --gpu  # HTTPS + local LLM
#   ./deploy.sh --rebuild           # Force rebuild without cache
#   ./deploy.sh --stop              # Stop all services
#   ./deploy.sh --logs              # Follow logs
#   ./deploy.sh --status            # Show service status
#   ./deploy.sh --generate-certs    # Generate self-signed certs for Nginx
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

log()   { echo -e "${PURPLE}[dang]${NC} $1"; }
ok()    { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
err()   { echo -e "${RED}[✗]${NC} $1"; }
info()  { echo -e "${CYAN}[i]${NC} $1"; }

PROXY_MODE=""
GPU_MODE=""
COMPOSE_FILES="-f docker-compose.yml"

# ── Parse arguments ─────────────────────────────────────────────────────────
parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --proxy)
        PROXY_MODE="${2:-}"
        if [[ "$PROXY_MODE" != "caddy" && "$PROXY_MODE" != "nginx" ]]; then
          err "Invalid proxy mode: '$PROXY_MODE'. Use 'caddy' or 'nginx'."
          exit 1
        fi
        shift 2
        ;;
      --gpu)
        GPU_MODE="true"
        shift
        ;;
      --rebuild|--stop|--logs|--status|--generate-certs)
        # These are handled by the case statement in main
        break
        ;;
      *)
        break
        ;;
    esac
  done
}

# ── Build compose file list based on proxy mode ────────────────────────────
setup_compose_files() {
  if [ -n "$GPU_MODE" ]; then
    COMPOSE_FILES="${COMPOSE_FILES} -f docker-compose.gpu.yml"
    log "GPU mode: ${CYAN}Nemotron Nano (CUDA)${NC}"
  fi
  if [ -n "$PROXY_MODE" ]; then
    COMPOSE_FILES="${COMPOSE_FILES} -f docker-compose.${PROXY_MODE}.yml"
    log "Proxy mode: ${CYAN}${PROXY_MODE}${NC}"
  fi
}

# ── Pre-flight checks ──────────────────────────────────────────────────────
preflight() {
  log "Running pre-flight checks..."

  if ! command -v docker &> /dev/null; then
    err "Docker is not installed. Install with: sudo apt install docker.io docker-compose-plugin"
    exit 1
  fi
  ok "Docker found: $(docker --version)"

  if ! docker compose version &> /dev/null; then
    err "Docker Compose V2 not found. Install with: sudo apt install docker-compose-plugin"
    exit 1
  fi
  ok "Docker Compose found: $(docker compose version --short)"

  if ! docker info &> /dev/null 2>&1; then
    err "Docker daemon is not running or current user lacks permissions."
    err "Try: sudo systemctl start docker && sudo usermod -aG docker \$USER"
    exit 1
  fi
  ok "Docker daemon is running"

  if [ ! -f ".env" ]; then
    if [ -f "env.docker.template" ]; then
      warn "No .env file found. Creating from template..."
      cp env.docker.template .env
      warn "IMPORTANT: Edit .env with your actual credentials before starting!"
      warn "  Required: JWT_SECRET, WAZUH_HOST, WAZUH_USER, WAZUH_PASS"
      warn "  Generate JWT_SECRET with: openssl rand -hex 32"
      exit 1
    else
      err "No .env file and no env.docker.template found."
      exit 1
    fi
  fi
  ok ".env file found"

  # Validate required variables
  local missing=0
  for var in JWT_SECRET; do
    val=$(grep "^${var}=" .env 2>/dev/null | cut -d'=' -f2-)
    if [ -z "$val" ] || [[ "$val" == *"CHANGE_ME"* ]]; then
      err "Required variable ${var} is not set or still has placeholder value"
      missing=1
    fi
  done

  if [ $missing -eq 1 ]; then
    err "Please update .env with your actual credentials."
    exit 1
  fi
  ok "Required environment variables are set"

  # Validate .env values don't contain shell expansion syntax
  if grep -qE '^[A-Z_]+=.*\$\(' .env 2>/dev/null; then
    err ".env contains shell expansion syntax \$(command) which will cause errors."
    err "Use literal values only. See env.docker.template for examples."
    grep -nE '^[A-Z_]+=.*\$\(' .env | while read line; do
      err "  $line"
    done
    exit 1
  fi
  if grep -qE '^[A-Z_]+=.*\`' .env 2>/dev/null; then
    err ".env contains backtick expansion which will cause errors."
    err "Use literal values only. See env.docker.template for examples."
    exit 1
  fi
  ok ".env values are safe (no shell expansion detected)"

  # Warn about optional but recommended variables
  local wazuh_host=$(grep "^WAZUH_HOST=" .env 2>/dev/null | cut -d'=' -f2-)
  if [ -z "$wazuh_host" ]; then
    warn "WAZUH_HOST not set — app will start but Wazuh features will be unavailable"
    info "Set WAZUH_HOST, WAZUH_USER, and WAZUH_PASS to enable Wazuh integration"
  fi

  # Check local auth credentials
  local admin_pass=$(grep "^LOCAL_ADMIN_PASS=" .env 2>/dev/null | cut -d'=' -f2-)
  if [ -n "$admin_pass" ] && [[ "$admin_pass" == *"CHANGE_ME"* ]]; then
    warn "LOCAL_ADMIN_PASS still has placeholder value — change it or remove it"
  fi

  # GPU-specific checks
  if [ -n "$GPU_MODE" ]; then
    if ! command -v nvidia-smi &> /dev/null; then
      err "nvidia-smi not found. NVIDIA drivers are required for GPU mode."
      err "Install with: sudo apt install nvidia-driver-535"
      exit 1
    fi
    ok "NVIDIA GPU detected: $(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)"

    if ! docker run --rm --gpus all nvidia/cuda:12.2.0-base-ubuntu22.04 nvidia-smi &> /dev/null; then
      warn "NVIDIA Container Toolkit may not be configured."
      info "Install with: sudo apt install nvidia-container-toolkit"
      info "Then: sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker"
    else
      ok "NVIDIA Container Toolkit is working"
    fi

    local vram=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1)
    if [ -n "$vram" ] && [ "$vram" -lt 20000 ]; then
      warn "GPU has ${vram}MB VRAM. Nemotron Nano Q4_K_M needs ~18GB."
      warn "Consider using a smaller quantization or reducing context size."
    else
      ok "GPU VRAM: ${vram:-unknown}MB"
    fi
  fi

  # Proxy-specific checks
  if [ "$PROXY_MODE" = "caddy" ]; then
    local domain=$(grep "^DANG_DOMAIN=" .env 2>/dev/null | cut -d'=' -f2-)
    if [ -z "$domain" ]; then
      warn "DANG_DOMAIN not set in .env — defaulting to 'localhost' (self-signed)"
      info "For production, set DANG_DOMAIN=your.domain.com and ACME_EMAIL=you@email.com"
    else
      ok "Caddy domain: ${domain}"
    fi
  fi

  if [ "$PROXY_MODE" = "nginx" ]; then
    if [ ! -f "proxy/nginx/ssl/dang.crt" ] || [ ! -f "proxy/nginx/ssl/dang.key" ]; then
      warn "SSL certificates not found in proxy/nginx/ssl/"
      warn "Generate self-signed certs with: ./deploy.sh --generate-certs"
      warn "Or place your own dang.crt and dang.key in proxy/nginx/ssl/"
      err "Cannot start Nginx without certificates."
      exit 1
    fi
    ok "SSL certificates found"
  fi
}

# ── Generate self-signed certificates ──────────────────────────────────────
cmd_generate_certs() {
  log "Generating self-signed SSL certificates for Nginx..."

  mkdir -p proxy/nginx/ssl

  local cn="${1:-dang.local}"

  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout proxy/nginx/ssl/dang.key \
    -out proxy/nginx/ssl/dang.crt \
    -subj "/C=US/ST=Security/L=SOC/O=Dang SIEM/CN=${cn}" \
    2>/dev/null

  ok "Self-signed certificate generated for CN=${cn}"
  info "Certificate: proxy/nginx/ssl/dang.crt"
  info "Private key: proxy/nginx/ssl/dang.key"
  info "Valid for: 365 days"
  echo ""
  warn "Self-signed certs will show browser warnings. For production, use Let's Encrypt."
  info "Consider using Caddy instead (--proxy caddy) for automatic Let's Encrypt certs."
}

# ── Commands ────────────────────────────────────────────────────────────────
cmd_start() {
  preflight
  setup_compose_files

  log "Building and starting Dang! SIEM..."
  if [ -n "$PROXY_MODE" ]; then
    info "HTTPS proxy: ${PROXY_MODE}"
  fi

  local build_args=""
  if [ "${1:-}" = "--rebuild" ]; then
    build_args="--no-cache"
    log "Forcing rebuild without cache..."
  fi

  docker compose $COMPOSE_FILES build $build_args
  ok "Docker image built successfully"

  docker compose $COMPOSE_FILES up -d
  ok "Services started"

  log "Waiting for health check..."
  sleep 10

  local retries=0
  local max_retries=12
  while [ $retries -lt $max_retries ]; do
    if docker compose exec -T app curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
      ok "Application is healthy!"
      break
    fi
    retries=$((retries + 1))
    sleep 5
  done

  if [ $retries -eq $max_retries ]; then
    warn "Health check did not pass within 60s. Check logs with: ./deploy.sh --logs"
  fi

  echo ""
  echo -e "${PURPLE}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${PURPLE}║${NC}  ${GREEN}Dang! SIEM is running${NC}                                      ${PURPLE}║${NC}"
  echo -e "${PURPLE}║${NC}                                                              ${PURPLE}║${NC}"

  if [ "$PROXY_MODE" = "caddy" ]; then
    local domain=$(grep "^DANG_DOMAIN=" .env 2>/dev/null | cut -d'=' -f2-)
    domain=${domain:-localhost}
    echo -e "${PURPLE}║${NC}  Web UI:  ${GREEN}https://${domain}${NC}                            ${PURPLE}║${NC}"
    echo -e "${PURPLE}║${NC}  Proxy:   ${CYAN}Caddy (auto TLS)${NC}                               ${PURPLE}║${NC}"
  elif [ "$PROXY_MODE" = "nginx" ]; then
    echo -e "${PURPLE}║${NC}  Web UI:  ${GREEN}https://localhost${NC}                              ${PURPLE}║${NC}"
    echo -e "${PURPLE}║${NC}  Proxy:   ${CYAN}Nginx (TLS)${NC}                                    ${PURPLE}║${NC}"
  else
    local port=$(grep "^APP_PORT=" .env 2>/dev/null | cut -d'=' -f2-)
    port=${port:-3000}
    echo -e "${PURPLE}║${NC}  Web UI:  ${GREEN}http://localhost:${port}${NC}                            ${PURPLE}║${NC}"
    echo -e "${PURPLE}║${NC}  Proxy:   ${YELLOW}None (HTTP only)${NC}                               ${PURPLE}║${NC}"
  fi

  echo -e "${PURPLE}║${NC}  Health:  ${GREEN}http://localhost:3000/api/health${NC} (internal)     ${PURPLE}║${NC}"
  echo -e "${PURPLE}╚══════════════════════════════════════════════════════════════╝${NC}"

  if [ -z "$PROXY_MODE" ]; then
    echo ""
    info "For HTTPS, re-run with: ./deploy.sh --proxy caddy"
  fi
}

cmd_stop() {
  setup_compose_files
  log "Stopping Dang! SIEM..."
  docker compose $COMPOSE_FILES down
  ok "All services stopped"
}

cmd_logs() {
  setup_compose_files
  docker compose $COMPOSE_FILES logs -f --tail=100
}

cmd_status() {
  setup_compose_files
  echo ""
  log "Service Status:"
  docker compose $COMPOSE_FILES ps
  echo ""
  log "Health Check:"
  local port=$(grep "^APP_PORT=" .env 2>/dev/null | cut -d'=' -f2-)
  port=${port:-3000}
  curl -s "http://localhost:${port}/api/health" 2>/dev/null | python3 -m json.tool 2>/dev/null || warn "App not reachable on port ${port}"

  if [ "$PROXY_MODE" = "caddy" ]; then
    echo ""
    log "Caddy Status:"
    docker compose $COMPOSE_FILES exec caddy caddy version 2>/dev/null || warn "Caddy not reachable"
  fi

  if [ "$PROXY_MODE" = "nginx" ]; then
    echo ""
    log "Nginx Status:"
    docker compose $COMPOSE_FILES exec nginx nginx -t 2>/dev/null || warn "Nginx not reachable"
  fi
}

# ── Main ────────────────────────────────────────────────────────────────────
# Extract --proxy before other args
ALL_ARGS=("$@")
parse_args "$@"

# Find the command arg (skip --proxy and its value)
CMD=""
for arg in "${ALL_ARGS[@]}"; do
    case "$arg" in
    --proxy|caddy|nginx|--gpu) continue ;;
    --*) CMD="$arg"; break ;;
  esac
done

case "${CMD:-start}" in
  --stop)
    cmd_stop
    ;;
  --logs)
    cmd_logs
    ;;
  --status)
    cmd_status
    ;;
  --rebuild)
    cmd_start --rebuild
    ;;
  --generate-certs)
    cmd_generate_certs "${2:-dang.local}"
    ;;
  *)
    cmd_start
    ;;
esac
