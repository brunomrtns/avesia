"""AI provider client — REST calls to NVIDIA NIM / OpenRouter / Ollama.

Supports chat completions and embeddings via OpenAI-compatible API.
Includes automatic retry with exponential backoff for transient errors
(502, 503, 429, connection timeouts).
"""

import time
from dataclasses import dataclass
from typing import Any

import httpx

from .config import get_settings

# Retry config for transient HTTP errors
RETRY_STATUS_CODES = {429, 502, 503, 504}
MAX_RETRIES = 5
INITIAL_BACKOFF = 2.0  # seconds


def _retry_request(client: httpx.Client, method: str, url: str, **kwargs) -> httpx.Response:
    """Execute an HTTP request with retry on transient errors."""
    last_exc = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = client.request(method, url, **kwargs)
            if resp.status_code in RETRY_STATUS_CODES and attempt < MAX_RETRIES - 1:
                backoff = INITIAL_BACKOFF * (2 ** attempt)
                time.sleep(backoff)
                continue
            resp.raise_for_status()
            return resp
        except (httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout,
                httpx.PoolTimeout, httpx.RemoteProtocolError) as exc:
            last_exc = exc
            if attempt < MAX_RETRIES - 1:
                backoff = INITIAL_BACKOFF * (2 ** attempt)
                time.sleep(backoff)
                continue
            raise
    # Should not reach here, but just in case
    if last_exc:
        raise last_exc
    return resp  # type: ignore[possibly-undefined]


@dataclass
class ChatResult:
    content: str
    tokens_used: int
    provider: str
    model: str
    latency_ms: int


@dataclass
class EmbeddingResult:
    embedding: list[float]
    provider: str
    model: str


class AIProviderClient:
    """OpenAI-compatible REST client for chat and embeddings."""

    def __init__(self):
        self._settings = get_settings()
        provider = self._settings.ai_provider
        if provider == "nvidia-nim":
            self._base_url = self._settings.nvidia_nim_base_url
            self._api_key = self._settings.nvidia_nim_api_key
            self._chat_model = self._settings.nvidia_nim_default_model
        elif provider == "openrouter":
            self._base_url = self._settings.openrouter_base_url
            self._api_key = self._settings.openrouter_api_key
            self._chat_model = self._settings.openrouter_default_model
        elif provider == "ollama":
            self._base_url = self._settings.ollama_base_url
            self._api_key = "ollama"  # Ollama doesn't need a real key
            self._chat_model = self._settings.ollama_default_model
        else:
            raise ValueError(f"Unknown AI provider: {provider}")

        self._provider_name = provider
        self._embedding_model = self._settings.embedding_model
        self._client = httpx.Client(
            timeout=httpx.Timeout(60.0, connect=10.0),
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
        )

    @property
    def provider_name(self) -> str:
        return self._provider_name

    @property
    def chat_model(self) -> str:
        return self._chat_model

    @property
    def embedding_model_name(self) -> str:
        return self._embedding_model

    def chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.3,
        system_prompt: str | None = None,
    ) -> ChatResult:
        """Send a chat completion request."""
        full_messages: list[dict[str, str]] = []
        if system_prompt:
            full_messages.append({"role": "system", "content": system_prompt})
        full_messages.extend(messages)

        payload = {
            "model": model or self._chat_model,
            "messages": full_messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        start = time.monotonic()
        resp = _retry_request(
            self._client, "POST",
            f"{self._base_url}/chat/completions",
            json=payload,
        )
        latency_ms = int((time.monotonic() - start) * 1000)

        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
        tokens = usage.get("total_tokens", 0)

        return ChatResult(
            content=content,
            tokens_used=tokens,
            provider=self._provider_name,
            model=payload["model"],
            latency_ms=latency_ms,
        )

    def chat_json(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        max_tokens: int = 1024,
        temperature: float = 0.1,
        system_prompt: str | None = None,
    ) -> dict[str, Any]:
        """Send a chat completion request and parse JSON from the response."""
        result = self.chat(
            messages,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system_prompt=system_prompt,
        )
        return _parse_json_from_response(result.content)

    def embed(self, text: str, *, input_type: str = "query") -> EmbeddingResult:
        """Generate an embedding for a single text."""
        payload = {
            "model": self._embedding_model,
            "input": text,
            "input_type": input_type,
            "encoding_format": "float",
        }

        resp = _retry_request(
            self._client, "POST",
            f"{self._base_url}/embeddings",
            json=payload,
        )

        data = resp.json()
        embedding = data["data"][0]["embedding"]

        return EmbeddingResult(
            embedding=embedding,
            provider=self._provider_name,
            model=self._embedding_model,
        )

    def embed_batch(self, texts: list[str], *, input_type: str = "query") -> list[list[float]]:
        """Generate embeddings for multiple texts (sequential to respect rate limits)."""
        results = []
        for text in texts:
            result = self.embed(text, input_type=input_type)
            results.append(result.embedding)
        return results

    def health_check(self) -> dict[str, Any]:
        """Check if the provider is reachable."""
        try:
            # Light request — just check if the base URL responds
            resp = self._client.get(f"{self._base_url}/models", timeout=10.0)
            return {
                "provider": self._provider_name,
                "status": "ok" if resp.status_code < 500 else "degraded",
                "model": self._chat_model,
            }
        except Exception as e:
            return {
                "provider": self._provider_name,
                "status": "error",
                "error": str(e),
            }

    def close(self):
        self._client.close()


def _parse_json_from_response(content: str) -> dict[str, Any]:
    """Extract JSON from an LLM response, handling markdown fences and extra text."""
    import json
    import re

    # Try direct parse first
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    # Try to extract from markdown code fence
    fence_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", content, re.DOTALL)
    if fence_match:
        try:
            return json.loads(fence_match.group(1))
        except json.JSONDecodeError:
            pass

    # Try to find the first { ... } block
    brace_match = re.search(r"\{.*\}", content, re.DOTALL)
    if brace_match:
        try:
            return json.loads(brace_match.group(0))
        except json.JSONDecodeError:
            pass

    # Try to find the first [ ... ] block
    bracket_match = re.search(r"\[.*\]", content, re.DOTALL)
    if bracket_match:
        try:
            return json.loads(bracket_match.group(0))
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not parse JSON from response: {content[:200]}")
