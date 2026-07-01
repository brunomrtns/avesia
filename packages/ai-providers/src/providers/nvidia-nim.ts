import { BaseOpenAICompatibleProvider } from './base-openai-compatible.js';

export interface NvidiaNimConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}

export class NvidiaNimProvider extends BaseOpenAICompatibleProvider {
  constructor(config: NvidiaNimConfig) {
    super({
      name: 'nvidia-nim',
      baseUrl: config.baseUrl ?? 'https://integrate.api.nvidia.com/v1',
      apiKey: config.apiKey,
      isLocal: false,
      defaultModel: config.defaultModel ?? 'nvidia/llama-3.1-nemotron-70b-instruct',
    });
  }
}
