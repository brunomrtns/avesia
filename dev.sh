#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# dev.sh — Avesia Development Environment Bootstrap
#
# Usage:  ./dev.sh
#
# Steps:
#   1. Check prerequisites (node, pnpm, docker)
#   2. Ensure .env exists
#   3. Start infra (postgres, redis, minio)
#   4. Wait for healthchecks
#   5. Install dependencies
#   6. Run migrations + seed
#   7. Start dev servers (turbo dev)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

# ── Colors ─────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_step() { echo -e "\n${CYAN}═══ $* ═══${NC}"; }
log_ok()   { echo -e "${GREEN}[✓]${NC} $*"; }
log_fail() { echo -e "${RED}[✗]${NC} $*" >&2; exit 1; }
log_warn() { echo -e "${YELLOW}[!]${NC} $*"; }

# ── Helper: check command exists ──────────────────────────────────────────────
check_command() {
    local cmd="$1"
    local label="${2:-$1}"
    if command -v "${cmd}" &>/dev/null; then
        log_ok "${label} found: $(command -v "${cmd}")"
    else
        log_fail "${label} is required but not found in PATH."
    fi
}

# ── Helper: wait for docker service health ────────────────────────────────────
wait_for_health() {
    local service="$1"
    local label="${2:-$1}"
    local max_wait=60
    local elapsed=0

    printf "  Waiting for %s to become healthy" "${label}"
    while ! docker compose ps "${service}" --format json 2>/dev/null | grep -q '"Health":"healthy"'; do
        printf "."
        sleep 2
        elapsed=$((elapsed + 2))
        if [[ ${elapsed} -ge ${max_wait} ]]; then
            echo ""
            log_fail "Timeout waiting for ${label} (>${max_wait}s). Check: docker compose logs ${service}"
        fi
    done
    echo ""
    log_ok "${label} is healthy"
}

# ═══════════════════════════════════════════════════════════════════════════════
# 1. Prerequisites
# ═══════════════════════════════════════════════════════════════════════════════
log_step "Checking prerequisites"
check_command node "Node.js"
check_command pnpm "pnpm"
check_command docker "Docker"
check_command python3 "Python 3"

# Verify docker compose subcommand
docker compose version &>/dev/null || log_fail "docker compose plugin not found"

# ── inotify: Turbo runs 6+ file watchers simultaneously (tsc --watch, vite).
# The default max_user_instances (128) is too low and causes EMFILE errors.
# We try to raise it; if we don't have root, we warn and continue (may fail).
INOTIFY_INSTANCES="/proc/sys/fs/inotify/max_user_instances"
CURRENT_INSTANCES=$(cat "${INOTIFY_INSTANCES}" 2>/dev/null || echo 0)
if [[ "${CURRENT_INSTANCES}" -lt 512 ]]; then
    if sudo -n true 2>/dev/null; then
        sudo sysctl -w fs.inotify.max_user_instances=512 &>/dev/null
        log_ok "inotify max_user_instances raised to 512"
    else
        log_warn "inotify max_user_instances=${CURRENT_INSTANCES} (need 512). Run: sudo sysctl fs.inotify.max_user_instances=512"
        log_warn "Without this, Vite may crash with EMFILE: too many open files."
    fi
else
    log_ok "inotify max_user_instances=${CURRENT_INSTANCES} (sufficient)"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 2. Environment file
# ═══════════════════════════════════════════════════════════════════════════════
log_step "Environment configuration"
if [[ ! -f .env ]]; then
    log_warn ".env not found — copying from .env.example"
    cp .env.example .env
    log_warn "Review .env and update secrets before proceeding to production."
    log_ok ".env created from template"
else
    log_ok ".env exists"
fi

# Load and export environment variables
log_ok "Exporting environment variables from .env"
set -a
source .env
set +a

# Free up target ports (3100, 3101, 3102) if in use
log_step "Cleaning up lingering ports"
for port in 3100 3101 3102; do
    if lsof -t -i:"${port}" &>/dev/null || fuser "${port}/tcp" &>/dev/null; then
        log_warn "Port ${port} is in use. Terminating process..."
        fuser -k "${port}/tcp" &>/dev/null || kill -9 $(lsof -t -i:"${port}") &>/dev/null || true
    fi
done
# Also kill any lingering Celery workers from previous runs
pkill -f "celery.*avesia" &>/dev/null || true
log_ok "Ports cleared and ready"


# ═══════════════════════════════════════════════════════════════════════════════
# 3. Start infrastructure
# ═══════════════════════════════════════════════════════════════════════════════
log_step "Starting infrastructure (postgres, redis, minio)"
docker compose up -d postgres redis minio
log_ok "Infrastructure containers started"

# ═══════════════════════════════════════════════════════════════════════════════
# 4. Wait for healthchecks
# ═══════════════════════════════════════════════════════════════════════════════
log_step "Waiting for healthchecks"
wait_for_health postgres "PostgreSQL"
wait_for_health redis "Redis"
wait_for_health minio "MinIO"

# ═══════════════════════════════════════════════════════════════════════════════
# 5. Install dependencies
# ═══════════════════════════════════════════════════════════════════════════════
log_step "Installing dependencies"
if [[ ! -d node_modules ]]; then
    pnpm install
    log_ok "Dependencies installed"
else
    log_ok "node_modules exists — skipping install (use 'pnpm install' to update)"
fi

# ── Python worker setup ──────────────────────────────────────────────────────
log_step "Setting up Python worker (worker-python)"
WORKER_PY_DIR="${SCRIPT_DIR}/apps/worker-python"
if [[ ! -d "${WORKER_PY_DIR}/.venv" ]]; then
    log_ok "Creating Python virtual environment"
    python3 -m venv "${WORKER_PY_DIR}/.venv"
fi

# Install/update Python dependencies
log_ok "Installing Python dependencies (this may take a few minutes on first run)"
"${WORKER_PY_DIR}/.venv/bin/pip" install --upgrade pip -q
"${WORKER_PY_DIR}/.venv/bin/pip" install -e "${WORKER_PY_DIR}" -q 2>&1 | tail -3 || log_warn "Some Python deps may have failed to install"

# Download spaCy Portuguese model (if not already downloaded)
if ! "${WORKER_PY_DIR}/.venv/bin/python" -c "import spacy; spacy.load('pt_core_news_sm')" &>/dev/null; then
    log_ok "Downloading spaCy Portuguese model (pt_core_news_sm)"
    "${WORKER_PY_DIR}/.venv/bin/python" -m spacy download pt_core_news_sm -q || log_warn "spaCy model download failed"
else
    log_ok "spaCy Portuguese model already installed"
fi

# Download NLTK data (if not already downloaded)
"${WORKER_PY_DIR}/.venv/bin/python" -c "import nltk; nltk.download('punkt_tab', quiet=True); nltk.download('stopwords', quiet=True)" -q 2>/dev/null || true
log_ok "Python worker ready"

# ═══════════════════════════════════════════════════════════════════════════════
# 6. Database migrations + seed
# ═══════════════════════════════════════════════════════════════════════════════
log_step "Database setup"

# Generate Prisma client first — the worker and API both import @prisma/client
# and depend on the generated types (new schema columns, pgvector, etc).
log_ok "Generating Prisma client"
pnpm db:generate || log_fail "Failed to generate Prisma client"

# Check if migrations directory exists
if [[ -d apps/api/prisma/migrations ]]; then
    log_ok "Migrations directory found"
    pnpm db:migrate || log_warn "Migration may already be applied"
else
    log_warn "No migrations directory found — pushing database schema directly"
    pnpm --filter @avesia/api exec prisma db push || log_fail "Failed to sync database schema"
fi

# Check if seed script exists
if pnpm --filter @avesia/api run --silent 2>/dev/null | grep -q "db:seed"; then
    pnpm db:seed || log_warn "Seed may have already been applied"
    log_ok "Seed completed"
else
    log_warn "No seed script found — skipping seed"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 7. Start dev servers
# ═══════════════════════════════════════════════════════════════════════════════
log_step "Starting dev servers"

# ── Start Python Celery worker (background) ──────────────────────────────────
log_ok "Starting Python Celery worker (background)"
WORKER_PY_DIR="${SCRIPT_DIR}/apps/worker-python"
cd "${WORKER_PY_DIR}"
.venv/bin/python -m celery -A src.tasks.celery_app worker \
    --queues=transcription,analysis,summarization,notes-generation,rag-indexing \
    --loglevel="${WORKER_LOG_LEVEL:-info}" \
    --concurrency=4 \
    --hostname="avesia@%h" \
    > /tmp/avesia-worker-python.log 2>&1 &
WORKER_PID=$!
log_ok "Python worker started (PID ${WORKER_PID}, logs: /tmp/avesia-worker-python.log)"
cd "${SCRIPT_DIR}"

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Avesia Dev Environment Ready                                     ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  API:          http://localhost:3100                              ║${NC}"
echo -e "${GREEN}║  Web:          http://localhost:3101                              ║${NC}"
echo -e "${GREEN}║  Worker Health: http://localhost:3102/health                      ║${NC}"
echo -e "${GREEN}║  Postgres:     localhost:5433                                     ║${NC}"
echo -e "${GREEN}║  Redis:        localhost:6380                                     ║${NC}"
echo -e "${GREEN}║  MinIO:        http://localhost:9100  (console: :9101)           ║${NC}"
echo -e "${GREEN}║  Worker logs:  tail -f /tmp/avesia-worker-python.log             ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Run turbo dev (foreground — starts api, web concurrently)
# The Python worker runs in the background and will be cleaned up on exit
trap "kill ${WORKER_PID} 2>/dev/null || true" EXIT INT TERM
exec pnpm dev
