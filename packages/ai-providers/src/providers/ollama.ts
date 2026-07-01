import { BaseOpenAICompatibleProvider } from './base-openai-compatible.js';

export interface OllamaConfig {
  baseUrl?: string;
  defaultModel?: string;
}

export class OllamaProvider extends BaseOpenAICompatibleProvider {
  constructor(config: OllamaConfig = {}) {
    super({
      name: 'ollama',
      baseUrl: config.baseUrl ?? 'http://localhost:11434/v1',
      isLocal: true,
      defaultModel: config.defaultModel ?? 'llama3.1',
      timeouts: {
        requestMs: 180_000, // 3 minutes timeout for local inference
        maxRetries: 1,      // Minimize retries for local errors
      },
    });
  }
}
