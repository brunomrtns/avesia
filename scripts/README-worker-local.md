# Worker Local — Transcrição Whisper Local

Este worker roda localmente no seu PC e transcreve áudios da plataforma Avesia
usando Whisper, conectando-se à VPS via WireGuard VPN.

## Pré-requisitos

- Python 3.10+
- GPU NVIDIA com CUDA (recomendado) — também funciona em CPU (mais lento)
- WireGuard VPN configurado entre PC e VPS (ver `DEPLOY.md`)
- Acesso à VPS via WireGuard (10.0.0.1)

## Instalação (uma vez)

```bash
cd /home/bruno/Desenvolvimento/brunointegrations/avesia

# Criar venv dedicado para o worker local
python3 -m venv scripts/.venv
source scripts/.venv/bin/activate
pip install -r scripts/worker-local-requirements.txt
```

> Para GPU: instale o CUDA toolkit compatível com o CTranslate2
> (`faster-whisper` usa CTranslate2). Veja:
> https://github.com/SYSTRAN/faster-whisper#installation

## Configuração para PRODUÇÃO (VPS via WireGuard)

1. **Na VPS**: gere uma API key para o worker:
```bash
# Na VPS, com a API rodando:
TOKEN=$(curl -s http://localhost:3100/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"owner@demo.avesia","password":"SUA_SENHA"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['accessToken'])")

curl -s -X POST http://localhost:3100/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"local-whisper-worker"}'
# Anote o campo "key" retornado
```

2. **No PC**: crie o arquivo de configuração:
```bash
cp .env-worker-local.example .env-worker-local
# Edite .env-worker-local com a API key gerada e a senha do MinIO da VPS
```

3. **No PC**: ative o WireGuard:
```bash
sudo wg-quick up wg0
# Verificar: ping 10.0.0.1
```

## Como iniciar o worker (produção)

```bash
cd /home/bruno/Desenvolvimento/brunointegrations/avesia

# Carregar variáveis de ambiente
set -a; source .env-worker-local; set +a

# Ativar venv
source scripts/.venv/bin/activate

# Iniciar worker
python scripts/worker-local.py
```

## Como iniciar o worker (DEV LOCAL)

Em desenvolvimento, o `.env` na raiz já tem as configurações corretas
(localhost:6380, localhost:9100, localhost:3100). O worker lê o `.env`
automaticamente via `python-dotenv`.

```bash
cd /home/bruno/Desenvolvimento/brunointegrations/avesia
source scripts/.venv/bin/activate
python scripts/worker-local.py
```

## O que esperar

1. O worker conecta ao Redis e envia um heartbeat para a API.
2. Carrega o modelo Whisper (pode levar alguns segundos na primeira vez).
3. Fica aguardando tarefas na fila `transcription` (BLPOP bloqueante).
4. Quando uma tarefa chega:
   - Marca a gravação como `PROCESSING`
   - Baixa o áudio do MinIO
   - Transcreve com Whisper (GPU)
   - Envia a transcrição para a API (`POST /sessions/:sessionId/transcript`)
   - Exclui o áudio do MinIO
   - Marca a gravação como `COMPLETED`
5. Em caso de erro, marca a gravação como `FAILED`.
6. `Ctrl+C` encerra o worker de forma limpa.

## Variáveis de ambiente

| Variável | Default | Descrição |
|----------|---------|-----------|
| `REDIS_URL` | `redis://10.0.0.1:6379/0` | Redis (VPS via WireGuard) |
| `MINIO_ENDPOINT` | `10.0.0.1` | MinIO endpoint |
| `MINIO_PORT` | `9100` | MinIO port |
| `MINIO_ROOT_USER` | — | MinIO access key |
| `MINIO_ROOT_PASSWORD` | — | MinIO secret key |
| `MINIO_BUCKET` | `avesia` | MinIO bucket name |
| `API_BASE_URL` | `http://10.0.0.1:3100` | API URL |
| `API_KEY` | — | API key (recomendado) |
| `API_TOKEN` | — | JWT token (alternativo) |
| `WHISPER_MODEL` | `base` | Modelo: `tiny`/`base`/`small`/`medium`/`large-v3` |
| `WHISPER_DEVICE` | `cuda` | `cuda` ou `cpu` |
| `WHISPER_COMPUTE_TYPE` | `auto` | `auto`/`float16`/`int8` |
| `WHISPER_LANGUAGE` | `pt` | Idioma do áudio |
| `WHISPER_BEAM_SIZE` | `5` | Beam size |
| `WORKER_ID` | `local-worker-<hostname>` | ID único do worker |
| `HEARTBEAT_INTERVAL` | `25` | Segundos entre heartbeats |

## Notas

- O worker **não** usa o Celery worker — ele consome diretamente da lista
  Redis que o Celery usa como fila, o que é mais simples e robusto para um
  worker local.
- O formato da mensagem é o protocolo Celery v2 (body base64 + JSON).
- Heartbeats são enviados a cada 25s para a API saber que o worker está online.
- O worker pode ser iniciado/parado a qualquer momento — não precisa ficar 24/7.
- Áudios são deletados do MinIO após a transcrição (pelo worker e pela API).
- MinIO tem lifecycle rule de 24h como safety net (áudios não transcritos somem).
