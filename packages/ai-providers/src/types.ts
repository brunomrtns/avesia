/**
 * Core type definitions for the AI provider abstraction layer.
 *
 * All providers (OpenRouter, NVIDIA NIM, Ollama) implement the {@link AIProvider}
 * interface, giving the rest of the system a single contract for chat completions,
 * streaming, model listing, and health checks.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** ISO-8601 date string, e.g. `"2025-06-29T12:00:00.000Z"`. */
export type ISODateString = string;

/** Supported provider identifiers. Keep in sync with {@link isAIProviderName}. */
export type AIProviderName = 'openrouter' | 'nvidia-nim' | 'ollama';

/** Role of a message in a chat conversation. */
export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/** Reason the model stopped generating. */
export type FinishReason = 'stop' | 'length' | 'tool_calls' | null;

/** How the model should choose a tool to call. */
export type ToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } };

// ---------------------------------------------------------------------------
// User-facing types (ChatRequest / ChatResponse)
// ---------------------------------------------------------------------------

/** A single message in a chat completion request. */
export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Optional name for the participant (useful for multi-agent context). */
  name?: string;
  /** Required when `role` is `'tool'` — identifies which tool call this responds to. */
  toolCallId?: string;
}

/** Parameters for a chat completion request. */
export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  /** 0–2, default 0.7 if omitted. */
  temperature?: number;
  /** Hard cap on output tokens. */
  maxTokens?: number;
  /** 0–1 nucleus sampling. */
  topP?: number;
  /** -2 to 2. */
  frequencyPenalty?: number;
  /** -2 to 2. */
  presencePenalty?: number;
  /** Stop sequences — generation halts when any is encountered. */
  stop?: string[];
  /** If `true`, use {@link AIProvider.chatStream} instead. Ignored by the base provider (the method determines streaming). */
  stream?: boolean;
  /** Optional function-calling tool definitions. */
  tools?: ToolDefinition[];
  toolChoice?: ToolChoice;
}

/** A function-calling tool definition (OpenAI function-calling format). */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    /** JSON Schema object describing the function parameters. */
    parameters: Record<string, unknown>;
  };
}

/** Non-streaming chat completion response. */
export interface ChatResponse {
  id: string;
  model: string;
  created: ISODateString;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finishReason: FinishReason;
  }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/** A single chunk from a streaming chat completion. */
export interface ChatChunk {
  index: number;
  delta: {
    role?: ChatRole;
    content?: string;
  };
  finishReason: FinishReason;
}

// ---------------------------------------------------------------------------
// Model listing & health
// ---------------------------------------------------------------------------

/** Metadata about a model offered by a provider. */
export interface ModelInfo {
  id: string;
  name?: string;
  description?: string;
  contextLength?: number;
}

/** Result of a provider health check. Never throws — errors are captured here. */
export interface HealthStatus {
  provider: string;
  healthy: boolean;
  latencyMs: number;
  checkedAt: ISODateString;
  error?: string;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * The contract every AI provider implements.
 *
 * Consumers depend on this interface, never on a concrete provider class.
 */
export interface AIProvider {
  readonly name: AIProviderName;
  /** `true` for local providers (Ollama), `false` for cloud providers. */
  readonly isLocal: boolean;
  /** Non-streaming chat completion. */
  chat(params: ChatRequest): Promise<ChatResponse>;
  /** Streaming chat completion — yields chunks as they arrive. */
  chatStream(params: ChatRequest): AsyncGenerator<ChatChunk, void, unknown>;
  /** Generate text embedding vector. */
  embed(text: string, model?: string): Promise<number[]>;
  /** List available models. Optional — providers may not support this. */
  listModels?(): Promise<ModelInfo[]>;
  /** Check provider health. Never throws. */
  healthCheck(): Promise<HealthStatus>;
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

/**
 * Type guard: is the given string a valid {@link AIProviderName}?
 * Keep in sync with the {@link AIProviderName} union.
 */
export function isAIProviderName(value: string): value is AIProviderName {
  return value === 'openrouter' || value === 'nvidia-nim' || value === 'ollama';
}
