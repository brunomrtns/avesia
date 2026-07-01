import { ProviderError, ProviderRateLimitError, ProviderUnavailableError } from '../errors.js';

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number) => void;
}

const DEFAULT_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30_000;

function defaultShouldRetry(error: unknown): boolean {
  if (error instanceof ProviderRateLimitError) return true;
  if (error instanceof ProviderUnavailableError) return true;
  if (error instanceof ProviderError) return error.retryable;
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
  const jitter = 0.5 + Math.random() * 0.5;
  return Math.floor(exponential * jitter);
}

/**
 * Execute `fn` with retry on failure.
 *
 * Retries on {@link ProviderRateLimitError}, {@link ProviderUnavailableError},
 * or any {@link ProviderError} with `retryable: true` by default.
 * Uses exponential backoff with jitter to avoid thundering herd.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.retries ?? DEFAULT_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const shouldRetry = options.shouldRetry ?? defaultShouldRetry;
  const onRetry = options.onRetry;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries || !shouldRetry(error)) {
        throw error;
      }

      onRetry?.(error, attempt + 1);
      await sleep(computeDelay(attempt, baseDelayMs, maxDelayMs));
    }
  }

  throw lastError;
}
