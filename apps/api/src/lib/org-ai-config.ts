/**
 * Organization-scoped AI provider config loader.
 *
 * Reads from the `ai_provider_configs` table for the given org.
 * Falls back to global env vars if the org has no active provider configured.
 *
 * Fallback logic:
 * - If the active provider is "local" (ollama), do a quick health check.
 * - If the health check fails (PC off, network down), use the fallback provider.
 * - Cloud providers (nvidia-nim, openrouter) are assumed always available.
 */
import type { PrismaClient } from '@prisma/client';
import type { ProviderConfig } from '@avesia/ai-providers';
import type { AIProviderName } from '@avesia/ai-providers';
import { loadProviderConfigFromEnv, createProvider } from '@avesia/ai-providers';

function isAIProviderName(v: string): v is AIProviderName {
  return v === 'openrouter' || v === 'nvidia-nim' || v === 'ollama';
}

/** Build a ProviderConfig from a DB row. */
function buildConfigFromRow(row: {
  provider: string;
  apiKey: string | null;
  baseUrl: string | null;
  model: string;
}): ProviderConfig | null {
  if (!isAIProviderName(row.provider)) return null;
  const provider = row.provider;

  switch (provider) {
    case 'nvidia-nim':
      return {
        activeProvider: 'nvidia-nim',
        nvidiaNim: {
          apiKey: row.apiKey ?? '',
          ...(row.baseUrl ? { baseUrl: row.baseUrl } : {}),
          ...(row.model ? { defaultModel: row.model } : {}),
        },
      };
    case 'openrouter':
      return {
        activeProvider: 'openrouter',
        openrouter: {
          apiKey: row.apiKey ?? '',
          ...(row.baseUrl ? { baseUrl: row.baseUrl } : {}),
          ...(row.model ? { defaultModel: row.model } : {}),
        },
      };
    case 'ollama':
      return {
        activeProvider: 'ollama',
        ollama: {
          ...(row.baseUrl ? { baseUrl: row.baseUrl } : {}),
          ...(row.model ? { defaultModel: row.model } : {}),
        },
      };
  }
}

/** Quick health check with short timeout — used for local providers. */
async function isProviderOnline(config: ProviderConfig, _timeoutMs = 3000): Promise<boolean> {
  try {
    const provider = createProvider(config);
    const health = await provider.healthCheck();
    return health.healthy;
  } catch {
    return false;
  }
}

/** Update lastStatus in DB (fire-and-forget). */
function updateStatus(prisma: PrismaClient, id: string, status: 'ok' | 'fail'): void {
  void prisma.aIProviderConfig.update({
    where: { id },
    data: { lastStatus: status, lastCheckedAt: new Date() },
  }).catch(() => {});
}

/**
 * Load the active provider config for an organization.
 *
 * 1. Get the active provider from DB.
 * 2. If it's a local provider (ollama), health-check it (3s timeout).
 * 3. If offline, try the fallback provider.
 * 4. If no DB config or all fail, fall back to env vars.
 */
export async function loadProviderConfigForOrg(
  prisma: PrismaClient,
  organizationId: string,
): Promise<ProviderConfig> {
  const configs = await prisma.aIProviderConfig.findMany({
    where: { organizationId },
  });

  const active = configs.find((c) => c.isActive);
  const fallback = configs.find((c) => c.isFallback);

  if (!active || !isAIProviderName(active.provider)) {
    return loadProviderConfigFromEnv();
  }

  const activeConfig = buildConfigFromRow(active);
  if (!activeConfig) return loadProviderConfigFromEnv();

  // Cloud providers — assume online, no health check needed
  if (active.provider !== 'ollama') {
    updateStatus(prisma, active.id, 'ok');
    return activeConfig;
  }

  // Local provider (ollama) — health check with short timeout
  const online = await isProviderOnline(activeConfig, 3000);
  updateStatus(prisma, active.id, online ? 'ok' : 'fail');

  if (online) {
    return activeConfig;
  }

  // Primary is offline — try fallback
  if (fallback && isAIProviderName(fallback.provider)) {
    const fallbackConfig = buildConfigFromRow(fallback);
    if (fallbackConfig) {
      console.log(`[org-ai-config] Primary "${active.provider}" offline — using fallback "${fallback.provider}"`);
      updateStatus(prisma, fallback.id, 'ok');
      return fallbackConfig;
    }
  }

  // No fallback in DB — use env vars as last resort
  console.log(`[org-ai-config] Primary "${active.provider}" offline and no DB fallback — using env vars`);
  return loadProviderConfigFromEnv();
}

/**
 * Get the embedding model for an organization.
 * Falls back to env EMBEDDING_MODEL.
 */
export async function getEmbeddingModelForOrg(
  prisma: PrismaClient,
  organizationId: string,
): Promise<string> {
  const active = await prisma.aIProviderConfig.findFirst({
    where: { organizationId, isActive: true },
  });

  if (active?.embeddingModel) {
    return active.embeddingModel;
  }

  return process.env.EMBEDDING_MODEL ?? 'nvidia/llama-nemotron-embed-1b-v2';
}

/**
 * Mask an API key for display (show only last 4 chars).
 */
export function maskApiKey(key: string | null | undefined): string {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return `${'•'.repeat(Math.min(key.length - 4, 20))}${key.slice(-4)}`;
}
