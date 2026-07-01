import type {
  AIProvider,
  AIProviderName,
  ChatChunk,
  ChatRequest,
  ChatResponse,
  ChatRole,
  FinishReason,
  ModelInfo,
  HealthStatus,
} from '../types.js';
import {
  ProviderError,
  ProviderRateLimitError,
  ProviderResponseError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from '../errors.js';
import { withRetry } from '../utils/retry.js';
import { parseSSE } from '../utils/sse-parser.js';
import { performHealthCheck } from './health-check.js';

export interface ProviderTimeouts {
  requestMs: number;
  streamMs: number;
  maxRetries: number;
}

const DEFAULT_TIMEOUTS: ProviderTimeouts = {
  requestMs: 60_000,
  streamMs: 300_000,
  maxRetries: 1,
};

export interface BaseProviderConfig {
  name: AIProviderName;
  baseUrl: string;
  apiKey?: string;
  isLocal: boolean;
  defaultModel: string;
  defaultHeaders?: Record<string, string>;
  timeouts?: Partial<ProviderTimeouts>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

function asRole(value: unknown): ChatRole {
  if (
    value === 'system' ||
    value === 'user' ||
    value === 'assistant' ||
    value === 'tool'
  ) {
    return value;
  }
  throw new ProviderResponseError(`Invalid message role: ${String(value)}`, 'unknown');
}

function asFinishReason(value: unknown): FinishReason {
  if (value === null) return null;
  if (value === 'stop' || value === 'length' || value === 'tool_calls') return value;
  if (isString(value)) return 'stop';
  return null;
}


function parseChatResponse(json: unknown, provider: string): ChatResponse {
  if (!isObject(json)) {
    throw new ProviderResponseError('Response is not an object', provider);
  }

  const id = json.id;
  if (!isString(id)) {
    throw new ProviderResponseError('Response missing "id" string', provider);
  }

  const model = json.model;
  if (!isString(model)) {
    throw new ProviderResponseError('Response missing "model" string', provider);
  }

  const created = json.created;
  if (!isNumber(created)) {
    throw new ProviderResponseError('Response missing "created" number', provider);
  }

  const rawChoices = json.choices;
  if (!Array.isArray(rawChoices) || rawChoices.length === 0) {
    throw new ProviderResponseError('Response has no choices', provider);
  }

  const choices = rawChoices.map((raw, i): ChatResponse['choices'][number] => {
    if (!isObject(raw)) {
      throw new ProviderResponseError(`Choice ${i} is not an object`, provider);
    }
    const choiceIndex = raw['index'];
    if (!isNumber(choiceIndex)) {
      throw new ProviderResponseError(`Choice ${i} missing "index"`, provider);
    }

    const msg = raw['message'];
    if (!isObject(msg)) {
      throw new ProviderResponseError(`Choice ${i} missing "message"`, provider);
    }
    const content = isString(msg['content']) ? msg['content'] : '';
    const role = asRole(msg['role']);

    return {
      index: choiceIndex,
      message: { role, content },
      finishReason: asFinishReason(raw['finish_reason']),
    };
  });

  let usage: ChatResponse['usage'];
  if (isObject(json.usage)) {
    const u = json.usage;
    usage = {
      promptTokens: isNumber(u.prompt_tokens) ? u.prompt_tokens : 0,
      completionTokens: isNumber(u.completion_tokens) ? u.completion_tokens : 0,
      totalTokens: isNumber(u.total_tokens) ? u.total_tokens : 0,
    };
  } else {
    usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }

  return {
    id,
    model,
    created: new Date(created * 1000).toISOString(),
    choices,
    usage,
  };
}

function parseStreamChunk(json: unknown, provider: string): ChatChunk {
  if (!isObject(json)) {
    throw new ProviderResponseError('Stream chunk is not an object', provider);
  }

  const rawChoices = json.choices;
  if (!Array.isArray(rawChoices) || rawChoices.length === 0) {
    throw new ProviderResponseError('Stream chunk has no choices', provider);
  }

  const raw = rawChoices[0];
  if (!isObject(raw)) {
    throw new ProviderResponseError('Stream chunk choice is not an object', provider);
  }

  const deltaRaw = raw['delta'];
  const deltaObj = isObject(deltaRaw) ? deltaRaw : {};

  const delta: ChatChunk['delta'] = {};
  const roleRaw = deltaObj['role'];
  if (isString(roleRaw)) {
    delta.role = asRole(roleRaw);
  }
  const contentRaw = deltaObj['content'];
  if (isString(contentRaw)) {
    delta.content = contentRaw;
  }

  const indexRaw = raw['index'];
  return {
    index: isNumber(indexRaw) ? indexRaw : 0,
    delta,
    finishReason: asFinishReason(raw['finish_reason']),
  };
}

function buildRequestBody(
  params: ChatRequest,
  stream: boolean,
  defaultModel: string,
): Record<string, unknown> {
  const model = params.model || defaultModel;

  const messages = params.messages.map((m): Record<string, unknown> => {
    const msg: Record<string, unknown> = { role: m.role, content: m.content };
    if (m.name !== undefined) msg.name = m.name;
    if (m.toolCallId !== undefined) msg.tool_call_id = m.toolCallId;
    return msg;
  });

  const body: Record<string, unknown> = { model, messages, stream };

  if (params.temperature !== undefined) body.temperature = params.temperature;
  if (params.maxTokens !== undefined) body.max_tokens = params.maxTokens;
  if (params.topP !== undefined) body.top_p = params.topP;
  if (params.frequencyPenalty !== undefined)
    body.frequency_penalty = params.frequencyPenalty;
  if (params.presencePenalty !== undefined)
    body.presence_penalty = params.presencePenalty;
  if (params.stop !== undefined) body.stop = params.stop;
  if (params.tools !== undefined) body.tools = params.tools;
  if (params.toolChoice !== undefined) body.tool_choice = params.toolChoice;

  return body;
}

export abstract class BaseOpenAICompatibleProvider implements AIProvider {
  readonly name: AIProviderName;
  readonly isLocal: boolean;
  protected readonly baseUrl: string;
  protected readonly apiKey: string | undefined;
  protected readonly defaultModel: string;
  protected readonly defaultHeaders: Record<string, string>;
  protected readonly timeouts: ProviderTimeouts;

  constructor(config: BaseProviderConfig) {
    this.name = config.name;
    this.isLocal = config.isLocal;
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel;
    this.defaultHeaders = config.defaultHeaders ?? {};
    this.timeouts = { ...DEFAULT_TIMEOUTS, ...config.timeouts };
  }

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
      ...extra,
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  private createTimeoutSignal(timeoutMs: number): {
    signal: AbortSignal;
    cleanup: () => void;
  } {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(
        new ProviderTimeoutError(`Request timed out after ${timeoutMs}ms`, this.name),
      );
    }, timeoutMs);
    return {
      signal: controller.signal,
      cleanup: () => clearTimeout(timer),
    };
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    return withRetry(
      async () => {
        const response = await fetch(url, init);

        if (response.status === 429) {
          const body = await this.tryReadError(response);
          throw new ProviderRateLimitError(body ?? 'Rate limited (429)', this.name);
        }

        if (response.status >= 500) {
          const body = await this.tryReadError(response);
          throw new ProviderUnavailableError(
            `Provider error ${response.status}: ${body ?? response.statusText}`,
            this.name,
            response.status,
          );
        }

        if (response.status >= 400) {
          const body = await this.tryReadError(response);
          throw new ProviderResponseError(
            `Client error ${response.status}: ${body ?? response.statusText}`,
            this.name,
            response.status,
          );
        }

        return response;
      },
      {
        retries: this.timeouts.maxRetries,
        shouldRetry: (error) => {
          if (error instanceof ProviderRateLimitError) return true;
          if (error instanceof ProviderUnavailableError) return true;
          if (error instanceof ProviderError) return error.retryable;
          // Node fetch throws TypeError on network failures (DNS, ECONNREFUSED, etc.)
          if (error instanceof TypeError) return true;
          return false;
        },
      },
    );
  }

  private async tryReadError(response: Response): Promise<string | null> {
    try {
      const text = await response.text();
      const json = JSON.parse(text) as unknown;
      if (isObject(json) && isObject(json.error) && isString(json.error.message)) {
        return json.error.message;
      }
      return text.slice(0, 500) || null;
    } catch {
      return null;
    }
  }

  async chat(params: ChatRequest): Promise<ChatResponse> {
    const body = buildRequestBody(params, false, this.defaultModel);
    if (this.name === 'ollama') {
      body.options = {
        num_ctx: 4096,
        keep_alive: -1,
      };
    }
    const url = `${this.baseUrl}/chat/completions`;
    const { signal, cleanup } = this.createTimeoutSignal(this.timeouts.requestMs);

    try {
      const response = await this.fetchWithRetry(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        throw new ProviderResponseError(
          `Unexpected status ${response.status}`,
          this.name,
          response.status,
        );
      }

      const json: unknown = await response.json();
      return parseChatResponse(json, this.name);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof TypeError) {
        throw new ProviderUnavailableError(
          `Network error: ${error.message}`,
          this.name,
          undefined,
          error,
        );
      }
      throw new ProviderResponseError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        this.name,
        undefined,
        error,
      );
    } finally {
      cleanup();
    }
  }

  async *chatStream(params: ChatRequest): AsyncGenerator<ChatChunk, void, unknown> {
    const body = buildRequestBody(params, true, this.defaultModel);
    if (this.name === 'ollama') {
      body.options = {
        num_ctx: 4096,
        keep_alive: -1,
      };
    }
    const url = `${this.baseUrl}/chat/completions`;
    const { signal, cleanup } = this.createTimeoutSignal(this.timeouts.streamMs);

    try {
      const response = await this.fetchWithRetry(url, {
        method: 'POST',
        headers: this.buildHeaders({ Accept: 'text/event-stream' }),
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        throw new ProviderResponseError(
          `Unexpected status ${response.status}`,
          this.name,
          response.status,
        );
      }

      if (!response.body) {
        throw new ProviderResponseError('Streaming response has no body', this.name);
      }

      for await (const data of parseSSE(response.body)) {
        if (data === '[DONE]') return;

        let json: unknown;
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }

        yield parseStreamChunk(json, this.name);
      }
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof TypeError) {
        throw new ProviderUnavailableError(
          `Network error: ${error.message}`,
          this.name,
          undefined,
          error,
        );
      }
      throw new ProviderResponseError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        this.name,
        undefined,
        error,
      );
    } finally {
      cleanup();
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const url = `${this.baseUrl}/models`;
    const { signal, cleanup } = this.createTimeoutSignal(this.timeouts.requestMs);

    try {
      const response = await this.fetchWithRetry(url, {
        method: 'GET',
        headers: this.buildHeaders(),
        signal,
      });

      if (!response.ok) {
        throw new ProviderResponseError(
          `Unexpected status ${response.status}`,
          this.name,
          response.status,
        );
      }

      const json: unknown = await response.json();
      if (!isObject(json) || !Array.isArray(json.data)) {
        throw new ProviderResponseError('Models response missing "data" array', this.name);
      }

      return json.data.filter(isObject).map((m): ModelInfo => {
        const id = isString(m.id) ? m.id : String(m.id ?? 'unknown');
        return {
          id,
          ...(isString(m.name) ? { name: m.name } : {}),
          ...(isString(m.description) ? { description: m.description } : {}),
          ...(isNumber(m.context_length) ? { contextLength: m.context_length } : {}),
        };
      });
    } finally {
      cleanup();
    }
  }

  async embed(text: string, model?: string): Promise<number[]> {
    const embedModel = model ?? 'nomic-embed-text';
    const url = `${this.baseUrl}/embeddings`;
    const { signal, cleanup } = this.createTimeoutSignal(this.timeouts.requestMs);

    // NVIDIA NIM asymmetric models require input_type.
    // Pass both "query" and "passage" — for symmetric models it's ignored.
    const body: Record<string, unknown> = {
      model: embedModel,
      input: text,
      encoding_format: 'float',
    };
    if (this.name === 'nvidia-nim') {
      body['input_type'] = 'query';
    }

    try {
      const response = await this.fetchWithRetry(url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        throw new ProviderResponseError(
          `Embedding request failed with status ${response.status}`,
          this.name,
          response.status,
        );
      }

      const json: unknown = await response.json();
      if (!isObject(json) || !Array.isArray(json.data) || !isObject(json.data[0])) {
        throw new ProviderResponseError('Embedding response missing data[0]', this.name);
      }

      const embedding = json.data[0].embedding;
      if (!Array.isArray(embedding)) {
        throw new ProviderResponseError('Embedding response missing embedding array', this.name);
      }

      return embedding.map((v: unknown) => {
        if (!isNumber(v)) throw new ProviderResponseError('Embedding value is not a number', this.name);
        return v;
      });
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error instanceof TypeError) {
        throw new ProviderUnavailableError(
          `Network error during embedding: ${error.message}`,
          this.name,
        );
      }
      throw new ProviderResponseError(
        `Unexpected error during embedding: ${error instanceof Error ? error.message : String(error)}`,
        this.name,
      );
    } finally {
      cleanup();
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    return performHealthCheck(this.name, async () => {
      await this.listModels();
    });
  }
}
