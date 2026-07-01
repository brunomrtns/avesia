export const AIProviderName = {
  OpenAI: 'openai',
  Anthropic: 'anthropic',
  Google: 'google',
  Ollama: 'ollama',
} as const;
export type AIProviderName = (typeof AIProviderName)[keyof typeof AIProviderName];

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  readonly role: ChatRole;
  readonly content: string;
  readonly name?: string;
}

export interface ChatRequest {
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly stream?: boolean;
}

export interface ChatResponse {
  readonly model: string;
  readonly content: string;
  readonly tokensUsed: number;
  readonly finishReason: 'stop' | 'length' | 'tool_call' | 'error';
}

export interface ChatChunk {
  readonly delta: string;
  readonly done: boolean;
}

export interface ModelInfo {
  readonly id: string;
  readonly name: string;
  readonly provider: AIProviderName;
  readonly contextWindow: number;
  readonly supportsStreaming: boolean;
  readonly costPer1kInputTokens: number;
  readonly costPer1kOutputTokens: number;
}

export interface HealthStatus {
  readonly provider: AIProviderName;
  readonly healthy: boolean;
  readonly latencyMs: number;
  readonly checkedAt: string;
  readonly error: string | null;
}
