# @avesia/ai-providers

AI provider abstraction layer for Avesia. Provides a unified `AIProvider` interface backed by concrete OpenAI-compatible HTTP clients for **OpenRouter**, **NVIDIA NIM**, and **Ollama**.

Implements [ADR-004](../../docs/decisions.md#adr-004) (provider abstraction) and [ADR-005](../../docs/decisions.md#adr-005) (local-first with cloud fallback).

## Quick Start

```typescript
import { loadProviderConfigFromEnv, createProvider } from '@avesia/ai-providers';

const config = loadProviderConfigFromEnv();
const provider = createProvider(config);

const response = await provider.chat({
  model: 'anthropic/claude-3.5-sonnet',
  messages: [{ role: 'user', content: 'Hello' }],
});

console.log(response.choices[0]?.message.content);
```

## Streaming

```typescript
for await (const chunk of provider.chatStream({
  model: 'llama3.1',
  messages: [{ role: 'user', content: 'Write a haiku about therapy' }],
})) {
  process.stdout.write(chunk.delta.content ?? '');
}
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `AI_PROVIDER` | Yes | Active provider: `openrouter`, `nvidia-nim`, or `ollama` |
| `OPENROUTER_API_KEY` | If provider=openrouter | OpenRouter API key |
| `OPENROUTER_BASE_URL` | No | Override OpenRouter base URL |
| `OPENROUTER_DEFAULT_MODEL` | No | Override default model |
| `NVIDIA_NIM_API_KEY` | If provider=nvidia-nim | NVIDIA NIM API key |
| `NVIDIA_NIM_BASE_URL` | No | Override NIM base URL |
| `NVIDIA_NIM_DEFAULT_MODEL` | No | Override default model |
| `OLLAMA_BASE_URL` | No | Override Ollama base URL (default: `http://localhost:11434/v1`) |
| `OLLAMA_DEFAULT_MODEL` | No | Override default model (default: `llama3.1`) |

## ProviderRouter (Local-First Routing)

The `ProviderRouter` automatically routes to a local Ollama instance when the local worker is online, falling back to the configured cloud provider otherwise:

```typescript
import { ProviderRouter, loadProviderConfigFromEnv } from '@avesia/ai-providers';

const router = new ProviderRouter(loadProviderConfigFromEnv());

// Called by WebSocket heartbeat handler
router.updateLocalWorkerStatus({
  workerId: 'worker-1',
  lastHeartbeatAt: new Date(),
  online: true,
});

// Automatically picks Ollama if local worker is fresh, else cloud provider
const provider = router.getProvider();
```

## Architecture

All three providers expose OpenAI-compatible REST APIs (`POST /v1/chat/completions`, `GET /v1/models`). They differ only in base URL, auth, and default models. `BaseOpenAICompatibleProvider` implements the shared HTTP/SSE/retry logic; each concrete provider extends it with provider-specific config.

**Zero runtime dependencies** — uses native `fetch` (Node 22+), manual SSE parsing, and manual retry with exponential backoff + jitter.

## Error Handling

All errors extend `ProviderError`:

| Error | Retryable | Cause |
|---|---|---|
| `ProviderConfigError` | No | Missing API key, bad config |
| `ProviderUnavailableError` | Yes | Network failure, 5xx |
| `ProviderRateLimitError` | Yes | HTTP 429 |
| `ProviderTimeoutError` | Yes | Request exceeded timeout |
| `ProviderResponseError` | No | Malformed response, 4xx |

```typescript
import { ProviderRateLimitError, ProviderConfigError } from '@avesia/ai-providers';

try {
  await provider.chat(req);
} catch (err) {
  if (err instanceof ProviderConfigError) {
    // Fix config and restart
  } else if (err instanceof ProviderRateLimitError) {
    // Already retried with backoff; surface to user
  }
}
```
