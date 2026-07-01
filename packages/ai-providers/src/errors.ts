/**
 * Error hierarchy for the AI provider layer.
 *
 * Every error extends {@link ProviderError}, which carries:
 * - `provider` — which provider threw (e.g. `'openrouter'`)
 * - `statusCode` — HTTP status if applicable
 * - `retryable` — whether {@link withRetry} should retry
 * - `cause` — original error for chaining
 *
 * The retry layer checks `retryable` (or `instanceof` checks on specific
 * subclasses) to decide whether to retry.
 */

/** Base error for all provider-related failures. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
    cause?: unknown,
  ) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = this.constructor.name;
  }
}

/**
 * Configuration error — missing API key, invalid base URL, unknown provider.
 * Never retryable (fixing config requires a redeploy/restart).
 */
export class ProviderConfigError extends ProviderError {
  constructor(message: string, provider: string, cause?: unknown) {
    super(message, provider, undefined, false, cause);
  }
}

/**
 * Provider is unreachable — network failure, DNS resolution error, or 5xx.
 * Retryable (transient).
 */
export class ProviderUnavailableError extends ProviderError {
  constructor(
    message: string,
    provider: string,
    statusCode?: number,
    cause?: unknown,
  ) {
    super(message, provider, statusCode, true, cause);
  }
}

/** HTTP 429 Too Many Requests. Retryable after backoff. */
export class ProviderRateLimitError extends ProviderError {
  constructor(message: string, provider: string, cause?: unknown) {
    super(message, provider, 429, true, cause);
  }
}

/** Request exceeded the configured timeout. Retryable. */
export class ProviderTimeoutError extends ProviderError {
  constructor(message: string, provider: string, cause?: unknown) {
    super(message, provider, undefined, true, cause);
  }
}

/**
 * Provider returned a response that doesn't match the expected OpenAI shape.
 * Not retryable (the response won't change on retry).
 */
export class ProviderResponseError extends ProviderError {
  constructor(
    message: string,
    provider: string,
    statusCode?: number,
    cause?: unknown,
  ) {
    super(message, provider, statusCode, false, cause);
  }
}
