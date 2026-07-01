import type { AIProvider } from './types.js';
import type { ProviderConfig } from './provider-config.js';
import { ProviderConfigError } from './errors.js';
import { OpenRouterProvider } from './providers/openrouter.js';
import { NvidiaNimProvider } from './providers/nvidia-nim.js';
import { OllamaProvider } from './providers/ollama.js';

export function createProvider(config: ProviderConfig): AIProvider {
  switch (config.activeProvider) {
    case 'openrouter':
      if (!config.openrouter?.apiKey) {
        throw new ProviderConfigError(
          'OPENROUTER_API_KEY required for openrouter provider',
          'openrouter',
        );
      }
      return new OpenRouterProvider(config.openrouter);

    case 'nvidia-nim':
      if (!config.nvidiaNim?.apiKey) {
        throw new ProviderConfigError(
          'NVIDIA_NIM_API_KEY required for nvidia-nim provider',
          'nvidia-nim',
        );
      }
      return new NvidiaNimProvider(config.nvidiaNim);

    case 'ollama':
      return new OllamaProvider(config.ollama ?? {});

    default: {
      const exhaustive: never = config.activeProvider;
      throw new ProviderConfigError(
        `Unknown provider: ${String(exhaustive)}`,
        String(exhaustive),
      );
    }
  }
}
