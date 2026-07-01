import { BaseOpenAICompatibleProvider } from './base-openai-compatible.js';

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}

export class OpenRouterProvider extends BaseOpenAICompatibleProvider {
  constructor(config: OpenRouterConfig) {
    super({
      name: 'openrouter',
      baseUrl: config.baseUrl ?? 'https://openrouter.ai/api/v1',
      apiKey: config.apiKey,
      isLocal: false,
      defaultModel: config.defaultModel ?? 'anthropic/claude-3.5-sonnet',
      defaultHeaders: {
        'HTTP-Referer': 'https://avesia.app',
        'X-Title': 'Avesia',
      },
    });
  }
}
