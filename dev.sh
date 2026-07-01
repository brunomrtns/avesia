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
#   7. Open separate terminals for each dev service (API, Web, Python Worker)
#
# The main script finishes after setup. Each service runs in its own terminal
# window so logs are visible and errors don't get lost.
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

# ── Helper: detect terminal emulator ──────────────────────────────────────────
# Returns a command prefix that opens a new terminal window with a given title
# and runs a command in it. Falls back through common emulators.
detect_terminal() {
    # The function sets TERM_CMD as an array — the first element is the
    # emulator binary, followed by its flags. The caller appends the actual
    # command to run.

    if command -v konsole &>/dev/null; then
        # KDE Konsole — --new-tab opens in existing window, --hold keeps it open
        TERM_CMD=(konsole --new-tab --hold --workdir "${SCRIPT_DIR}")
        log_ok "Terminal: konsole (KDE)"
        return
    fi

    if command -v gnome-terminal &>/dev/null; then
        # GNOME Terminal — --tab opens in existing window
        TERM_CMD=(gnome-terminal --tab --working-directory="${SCRIPT_DIR}")
        log_ok "Terminal: gnome-terminal"
        return
    fi

    if command -v terminator &>/dev/null; then
        TERM_CMD=(terminator --new-tab --working-directory="${SCRIPT_DIR}")
        log_ok "Terminal: terminator"
        return
    fi

    if command -v xterm &>/dev/null; then
        TERM_CMD=(xterm -e "cd ${SCRIPT_DIR} &&")
        log_ok "Terminal: xterm"
        return
    fi

    # Fallback: no graphical terminal — use tmux if available
    if command -v tmux &>/dev/null; then
        TERM_CMD=(_tmux_new_window)
        log_ok "Terminal: tmux (no graphical emulator found)"
        return
    fi

    log_fail "No terminal emulator found. Install konsole, gnome-terminal, or tmux."
}

# tmux fallback: open a new window in an existing or new session
_tmux_new_window() {
    local title="$1"
    shift
    local cmd="$*"

    # Create or attach to a session named "avesia"
    if ! tmux has-session -t avesia 2>/dev/null; then
        tmux new-session -d -s avesia -n "main"
    fi

    tmux new-window -t avesia -n "${title}" "${cmd}; bash"
}

# ── Helper: open a terminal tab/window for a service ──────────────────────────
# Usage: open_service_term "Title" "command string"
open_service_term() {
    local title="$1"
    local cmd="$2"

    if [[ "${TERM_CMD[0]}" == "_tmux_new_window" ]]; then
        "${TERM_CMD[@]}" "${title}" "${cmd}"
    elif [[ "${TERM_CMD[0]}" == "xterm" ]]; then
        # xterm needs the command as part of the -e argument
        "${TERM_CMD[@]}" "${cmd}; exec bash" &
    else
        # konsole / gnome-terminal / terminator — use -e or -- to run the command
        # We wrap in bash -lc to ensure shell aliases and env are loaded
        if [[ "${TERM_CMD[0]}" == "konsole" ]]; then
            konsole --new-tab --hold --workdir "${SCRIPT_DIR}" -p tabtitle="${title}" -e bash -lc "${cmd}" &
        elif [[ "${TERM_CMD[0]}" == "gnome-terminal" ]]; then
            gnome-terminal --tab --working-directory="${SCRIPT_DIR}" --title="${title}" -- bash -lc "${cmd}" &
        elif [[ "${TERM_CMD[0]}" == "terminator" ]]; then
            terminator --new-tab --working-directory="${SCRIPT_DIR}" --title="${title}" -e "bash -lc '${cmd}'" &
        else
            "${TERM_CMD[@]}" -e bash -lc "${cmd}" &
        fi
    fi
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
# 7. Start dev servers in separate terminals
# ═══════════════════════════════════════════════════════════════════════════════
log_step "Starting dev servers (separate terminals)"

detect_terminal

# ── Terminal 1: API server ───────────────────────────────────────────────────
log_ok "Opening terminal: API (port 3100)"
open_service_term "Avesia API" \
    "echo -e '\033[0;36m═══ Avesia API (port 3100) ═══\033[0m' && pnpm --filter @avesia/api dev"

# Small delay so tabs open in order
sleep 0.5

# ── Terminal 2: Web (Vite) ───────────────────────────────────────────────────
log_ok "Opening terminal: Web (port 3101)"
open_service_term "Avesia Web" \
    "echo -e '\033[0;36m═══ Avesia Web (port 3101) ═══\033[0m' && pnpm --filter @avesia/web dev"

sleep 0.5

# ── Terminal 3: Python Celery worker ─────────────────────────────────────────
log_ok "Opening terminal: Python Worker (Celery)"
WORKER_PY_DIR="${SCRIPT_DIR}/apps/worker-python"
open_service_term "Avesia Worker" \
    "cd '${WORKER_PY_DIR}' && echo -e '\033[0;36m═══ Avesia Python Worker (Celery) ═══\033[0m' && .venv/bin/python -m celery -A src.tasks.celery_app worker --queues=transcription,analysis,summarization,notes-generation,rag-indexing --loglevel='${WORKER_LOG_LEVEL:-info}' --concurrency=4 --hostname='avesia@%h'"

sleep 0.5

# ── Terminal 4: Docker logs (infra) ──────────────────────────────────────────
log_ok "Opening terminal: Infra logs (Docker)"
open_service_term "Avesia Infra" \
    "echo -e '\033[0;36m═══ Avesia Infrastructure Logs ═══\033[0m' && docker compose logs -f postgres redis minio"

# ═══════════════════════════════════════════════════════════════════════════════
# Done — print summary
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Avesia Dev Environment Ready                                     ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  4 terminals opened — one per service:                           ║${NC}"
echo -e "${GREEN}║                                                                   ║${NC}"
echo -e "${GREEN}║  1. API           http://localhost:3100                          ║${NC}"
echo -e "${GREEN}║  2. Web           http://localhost:3101                          ║${NC}"
echo -e "${GREEN}║  3. Python Worker  (Celery, background tasks)                    ║${NC}"
echo -e "${GREEN}║  4. Infra logs    (postgres, redis, minio)                       ║${NC}"
echo -e "${GREEN}║                                                                   ║${NC}"
echo -e "${GREEN}║  Postgres:  localhost:5433                                        ║${NC}"
echo -e "${GREEN}║  Redis:     localhost:6380                                        ║${NC}"
echo -e "${GREEN}║  MinIO:     http://localhost:9100  (console: :9101)              ║${NC}"
echo -e "${GREEN}║                                                                   ║${NC}"
echo -e "${GREEN}║  To stop: Ctrl+C in each terminal, or:                           ║${NC}"
echo -e "${GREEN}║    docker compose down  (stop infra)                             ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# If using tmux, attach to the session
if [[ "${TERM_CMD[0]}" == "_tmux_new_window" ]]; then
    echo -e "${CYAN}tmux session 'avesia' created. Attaching...${NC}"
    echo -e "${YELLOW}Press Ctrl+B then D to detach without killing the session.${NC}"
    echo ""
    exec tmux attach -t avesia
fi

# For graphical terminals: the main script exits, leaving the tabs running.
log_ok "All services started in separate terminals. This window can be closed."
