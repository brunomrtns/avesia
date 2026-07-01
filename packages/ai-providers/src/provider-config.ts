import type { AIProviderName } from './types.js';
import { isAIProviderName } from './types.js';
import { ProviderConfigError } from './errors.js';

export interface ProviderConfig {
  activeProvider: AIProviderName;
  openrouter?: { apiKey: string; baseUrl?: string; defaultModel?: string };
  nvidiaNim?: { apiKey: string; baseUrl?: string; defaultModel?: string };
  ollama?: { baseUrl?: string; defaultModel?: string };
}

export function loadProviderConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ProviderConfig {
  const raw = env.AI_PROVIDER;
  if (!raw) {
    throw new ProviderConfigError(
      'AI_PROVIDER env var is required (one of: openrouter, nvidia-nim, ollama)',
      'unknown',
    );
  }

  if (!isAIProviderName(raw)) {
    throw new ProviderConfigError(
      `Invalid AI_PROVIDER "${raw}". Must be one of: openrouter, nvidia-nim, ollama`,
      'unknown',
    );
  }

  const activeProvider: AIProviderName = raw;

  const openrouterApiKey = env.OPENROUTER_API_KEY;
  const openrouter: ProviderConfig['openrouter'] = openrouterApiKey
    ? {
        apiKey: openrouterApiKey,
        ...(env.OPENROUTER_BASE_URL ? { baseUrl: env.OPENROUTER_BASE_URL } : {}),
        ...(env.OPENROUTER_DEFAULT_MODEL
          ? { defaultModel: env.OPENROUTER_DEFAULT_MODEL }
          : {}),
      }
    : undefined;

  const nvidiaNimApiKey = env.NVIDIA_NIM_API_KEY;
  const nvidiaNim: ProviderConfig['nvidiaNim'] = nvidiaNimApiKey
    ? {
        apiKey: nvidiaNimApiKey,
        ...(env.NVIDIA_NIM_BASE_URL ? { baseUrl: env.NVIDIA_NIM_BASE_URL } : {}),
        ...(env.NVIDIA_NIM_DEFAULT_MODEL
          ? { defaultModel: env.NVIDIA_NIM_DEFAULT_MODEL }
          : {}),
      }
    : undefined;

  const ollamaBaseUrl = env.OLLAMA_BASE_URL;
  const ollama: ProviderConfig['ollama'] =
    ollamaBaseUrl || env.OLLAMA_DEFAULT_MODEL
      ? {
          ...(ollamaBaseUrl ? { baseUrl: ollamaBaseUrl } : {}),
          ...(env.OLLAMA_DEFAULT_MODEL
            ? { defaultModel: env.OLLAMA_DEFAULT_MODEL }
            : {}),
        }
      : undefined;

  const config: ProviderConfig = {
    activeProvider,
    ...(openrouter ? { openrouter } : {}),
    ...(nvidiaNim ? { nvidiaNim } : {}),
    ...(ollama ? { ollama } : {}),
  };

  validateActiveProvider(config);

  return config;
}

function validateActiveProvider(config: ProviderConfig): void {
  switch (config.activeProvider) {
    case 'openrouter':
      if (!config.openrouter?.apiKey) {
        throw new ProviderConfigError(
          'OPENROUTER_API_KEY is required when AI_PROVIDER=openrouter',
          'openrouter',
        );
      }
      break;
    case 'nvidia-nim':
      if (!config.nvidiaNim?.apiKey) {
        throw new ProviderConfigError(
          'NVIDIA_NIM_API_KEY is required when AI_PROVIDER=nvidia-nim',
          'nvidia-nim',
        );
      }
      break;
    case 'ollama':
      break;
  }
}
