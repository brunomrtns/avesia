# Worker Local — Transcrição Whisper Local

Este worker roda localmente no PC do Bruno (com GPU) e transcreve áudios da
plataforma Avesia usando Whisper, conectando-se à VPS via WireGuard.

## Pré-requisitos

- Python 3.10+
- GPU NVIDIA com CUDA (recomendado) — também funciona em CPU (mais lento)
- Acesso à VPS via WireGuard (10.0.0.1)

## Instalação

```bash
cd /home/bruno/Desenvolvimento/brunointegrations/avesia
python3 -m venv .venv-worker-local
source .venv-worker-local/bin/activate
pip install -r scripts/worker-local-requirements.txt
```

> Para GPU: instale o CUDA toolkit compatível com o CTranslate2
> (`faster-whisper` usa CTranslate2). Veja:
> https://github.com/SYSTRAN/faster-whisper#installation

## Configuração

Crie/edite o arquivo `.env` na raiz do projeto (ou exporte as variáveis):

```env
# Redis (VPS via WireGuard)
REDIS_URL=redis://10.0.0.1:6379/0

# MinIO (VPS)
MINIO_ENDPOINT=10.0.0.1
MINIO_PORT=9100
MINIO_ROOT_USER=avesia
MINIO_ROOT_PASSWORD=<sua-senha>
MINIO_BUCKET=avesia

# API (VPS)
API_BASE_URL=http://10.0.0.1:3100
# Autenticação: use JWT (API_TOKEN) OU API key (API_KEY)
API_TOKEN=<jwt-token>
# ou
API_KEY=<api-key>

# Whisper
WHISPER_MODEL=base          # tiny | base | small | medium | large-v3
WHISPER_DEVICE=cuda         # cuda | cpu
WHISPER_COMPUTE_TYPE=auto   # auto | float16 | int8 (auto = float16 p/ cuda)
WHISPER_LANGUAGE=pt
WHISPER_BEAM_SIZE=5

# Worker
WORKER_ID=local-worker-bruno-pc
HEARTBEAT_INTERVAL=25       # segundos
```

## Execução

```bash
source .venv-worker-local/bin/activate
python scripts/worker-local.py
```

## O que esperar

1. O worker conecta ao Redis e envia um heartbeat para a API.
2. Carrega o modelo Whisper (pode levar alguns segundos na primeira vez).
3. Fica aguardando tarefas na fila `transcription` (BLPOP bloqueante).
4. Quando uma tarefa chega:
   - Baixa o áudio do MinIO
   - Transcreve com Whisper (GPU)
   - Envia a transcrição para a API (`POST /sessions/:sessionId/transcript`)
   - Exclui o áudio do MinIO
   - Marca a gravação como `COMPLETED`
5. Em caso de erro, marca a gravação como `FAILED`.
6. `Ctrl+C` encerra o worker de forma limpa.

## Notas

- O worker **não** usa o Celery worker — ele consome diretamente da lista
  Redis que o Celery usa como fila, o que é mais simples e robusto para um
  worker local.
- O formato da mensagem é o protocolo Celery v2 (body base64 + JSON).
- Heartbeats são enviados a cada 25s para a API saber que o worker está online.
