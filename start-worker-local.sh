#!/usr/bin/env bash
# =============================================================================
# Avesia — Iniciar o worker local Whisper (transcrição de áudio)
#
# Uso:
#   ./start-worker-local.sh          # modo produção (VPS via WireGuard)
#   ./start-worker-local.sh --dev    # modo dev local (localhost)
#
# Em modo produção, o script lê automaticamente as credenciais do .env.prod
# (senha do Redis, senha do MinIO). A única coisa que você precisa configurar
# manualmente no .env-worker-local é a API_KEY (gerada uma vez na VPS).
#
# Ctrl+C para parar.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VENV_DIR="scripts/.venv"
WORKER_SCRIPT="scripts/worker-local.py"
ENV_WORKER=".env-worker-local"
ENV_PROD=".env.prod"
ENV_DEV=".env"

MODE="prod"
if [[ "${1:-}" == "--dev" ]]; then
  MODE="dev"
fi

# ── Cores ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_ok()   { echo -e "${GREEN}[✓]${NC} $1"; }
log_info() { echo -e "${CYAN}[i]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $1"; }
log_err()  { echo -e "${RED}[✗]${NC} $1"; }

# ── Pré-requisitos ───────────────────────────────────────────────────────────

# 1. Venv
if [[ ! -d "$VENV_DIR" ]]; then
  log_err "Venv não encontrado em $VENV_DIR"
  echo ""
  echo "  Rode uma vez para instalar:"
  echo "    python3 -m venv $VENV_DIR"
  echo "    source $VENV_DIR/bin/activate"
  echo "    pip install -r scripts/worker-local-requirements.txt"
  exit 1
fi

# 2. Script do worker
if [[ ! -f "$WORKER_SCRIPT" ]]; then
  log_err "Script do worker não encontrado: $WORKER_SCRIPT"
  exit 1
fi

# ── Helper: extrair variável de um arquivo .env ───────────────────────────────

env_val() {
  local file="$1" key="$2"
  grep "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2-
}

# ── Modo produção: WireGuard + credenciais do .env.prod ─────────────────────

if [[ "$MODE" == "prod" ]]; then
  log_info "Modo: ${YELLOW}produção${NC} (VPS via WireGuard)"

  # Verificar WireGuard
  if ! ip link show wg0 &>/dev/null; then
    log_err "WireGuard (wg0) não está ativo."
    echo ""
    echo "  Ative com:"
    echo "    sudo wg-quick up wg0"
    echo ""
    echo "  Ou rode em modo dev local:"
    echo "    ./start-worker-local.sh --dev"
    exit 1
  fi

  # Verificar conectividade com a VPS
  if ! ping -c 1 -W 2 10.0.0.1 &>/dev/null; then
    log_err "Não foi possível pingar a VPS (10.0.0.1). Verifique o WireGuard."
    exit 1
  fi
  log_ok "WireGuard ativo — VPS acessível em 10.0.0.1"

  # Verificar .env-worker-local (só precisa ter API_KEY)
  if [[ ! -f "$ENV_WORKER" ]]; then
    log_err "Arquivo $ENV_WORKER não encontrado."
    echo ""
    echo "  Crie com apenas a API key (o resto é lido do .env.prod automaticamente):"
    echo "    echo 'API_KEY=<sua-api-key-da-vps>' > $ENV_WORKER"
    echo ""
    echo "  Para gerar a API key, rode na VPS:"
    echo "    curl -s -X POST http://localhost:3100/api-keys \\"
    echo "      -H \"Authorization: Bearer \$TOKEN\" \\"
    echo "      -H 'Content-Type: application/json' \\"
    echo "      -d '{\"name\":\"local-whisper-worker\"}'"
    exit 1
  fi

  # Carregar .env-worker-local (tem API_KEY e possivelmente overrides)
  set -a
  source "$ENV_WORKER"
  set +a

  # Auto-preencher credenciais do .env.prod se não estiverem no .env-worker-local
  if [[ -f "$ENV_PROD" ]]; then
    if [[ -z "${REDIS_URL:-}" ]]; then
      REDIS_PASSWORD=$(env_val "$ENV_PROD" "REDIS_PASSWORD")
      if [[ -n "$REDIS_PASSWORD" ]]; then
        export REDIS_URL="redis://:${REDIS_PASSWORD}@10.0.0.1:6379/0"
        log_ok "REDIS_URL auto-preenchida do .env.prod"
      fi
    fi

    if [[ -z "${MINIO_ROOT_USER:-}" ]]; then
      MINIO_ROOT_USER=$(env_val "$ENV_PROD" "MINIO_ROOT_USER")
      export MINIO_ROOT_USER
    fi
    if [[ -z "${MINIO_ROOT_PASSWORD:-}" ]]; then
      MINIO_ROOT_PASSWORD=$(env_val "$ENV_PROD" "MINIO_ROOT_PASSWORD")
      export MINIO_ROOT_PASSWORD
    fi
    if [[ -z "${MINIO_ENDPOINT:-}" ]]; then
      export MINIO_ENDPOINT="10.0.0.1"
    fi
    if [[ -z "${MINIO_PORT:-}" ]]; then
      export MINIO_PORT="9100"
    fi
    if [[ -z "${MINIO_BUCKET:-}" ]]; then
      export MINIO_BUCKET="avesia"
    fi
    if [[ -z "${API_BASE_URL:-}" ]]; then
      export API_BASE_URL="http://10.0.0.1:3100"
    fi
    log_ok "Credenciais MinIO auto-preenchidas do .env.prod"
  else
    log_warn "Aviso: $ENV_PROD não encontrado — usando valores do $ENV_WORKER"
  fi

else
  log_info "Modo: ${YELLOW}dev local${NC} (localhost)"

  # Em dev, o worker-local.py lê o .env da raiz automaticamente via dotenv.
  if [[ ! -f "$ENV_DEV" ]]; then
    log_warn "Aviso: $ENV_DEV não encontrado. O worker usará defaults."
  fi
fi

# ── Ativar venv e iniciar ────────────────────────────────────────────────────

log_info "Ativando venv: $VENV_DIR"
source "$VENV_DIR/bin/activate"

# Verificar dependências críticas
if ! python -c "import faster_whisper, redis, minio, httpx" 2>/dev/null; then
  log_err "Dependências Python ausentes no venv."
  echo ""
  echo "  Instale com:"
  echo "    source $VENV_DIR/bin/activate"
  echo "    pip install -r scripts/worker-local-requirements.txt"
  exit 1
fi

echo ""
echo -e "${CYAN}═════════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Avesia — Worker Local Whisper${NC}"
if [[ "$MODE" == "prod" ]]; then
  echo -e "${CYAN}  API: ${API_BASE_URL:-?}  Redis: 10.0.0.1:6379${NC}"
  echo -e "${CYAN}  Modelo: ${WHISPER_MODEL:-medium}  Device: ${WHISPER_DEVICE:-cuda}${NC}"
else
  echo -e "${CYAN}  Conectando aos serviços locais (localhost)${NC}"
  echo -e "${CYAN}  Modelo: ${WHISPER_MODEL:-small}  Device: ${WHISPER_DEVICE:-cpu}${NC}"
fi
echo -e "${CYAN}  Ctrl+C para parar${NC}"
echo -e "${CYAN}═════════════════════════════════════════════════════════════════${NC}"
echo ""

# Iniciar o worker
exec python "$WORKER_SCRIPT"
