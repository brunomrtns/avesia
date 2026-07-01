import type { AIProvider, AIProviderName } from './types.js';
import type { ProviderConfig } from './provider-config.js';
import { createProvider } from './provider-factory.js';

export interface LocalWorkerStatus {
  workerId: string;
  lastHeartbeatAt: Date;
  online: boolean;
}

export interface ProviderRouterOptions {
  offlineThresholdMs?: number;
  maxLatencyHistory?: number;
}

export type AICapability = 'simple' | 'complex';

export interface ProviderMetrics {
  latencies: number[];
  successes: number;
  failures: number;
  lastFailureAt: Date | null;
}

const DEFAULT_OFFLINE_THRESHOLD_MS = 15_000;
const DEFAULT_MAX_LATENCY_HISTORY = 10;

export class ProviderRouter {
  private localStatus: LocalWorkerStatus | null = null;
  private readonly offlineThresholdMs: number;
  private readonly maxLatencyHistory: number;
  private readonly metrics: Record<AIProviderName, ProviderMetrics> = {
    ollama: { latencies: [], successes: 0, failures: 0, lastFailureAt: null },
    openrouter: { latencies: [], successes: 0, failures: 0, lastFailureAt: null },
    'nvidia-nim': { latencies: [], successes: 0, failures: 0, lastFailureAt: null },
  };

  constructor(
    private readonly config: ProviderConfig,
    options: ProviderRouterOptions = {},
  ) {
    this.offlineThresholdMs = options.offlineThresholdMs ?? DEFAULT_OFFLINE_THRESHOLD_MS;
    this.maxLatencyHistory = options.maxLatencyHistory ?? DEFAULT_MAX_LATENCY_HISTORY;
  }

  updateLocalWorkerStatus(status: LocalWorkerStatus): void {
    this.localStatus = {
      ...status,
      online: Date.now() - status.lastHeartbeatAt.getTime() < this.offlineThresholdMs,
    };
  }

  isLocalWorkerOnline(): boolean {
    if (!this.localStatus) return false;
    return (
      Date.now() - this.localStatus.lastHeartbeatAt.getTime() < this.offlineThresholdMs
    );
  }

  /**
   * Records a latency metric or success/failure result for a specific provider.
   */
  recordMetric(provider: AIProviderName, latencyMs: number, success: boolean): void {
    const stats = this.metrics[provider];
    if (!stats) return;

    if (success) {
      stats.successes += 1;
      stats.latencies.push(latencyMs);
      if (stats.latencies.length > this.maxLatencyHistory) {
        stats.latencies.shift();
      }
    } else {
      stats.failures += 1;
      stats.lastFailureAt = new Date();
    }
  }

  /**
   * Calculates the average latency of the provider.
   */
  getAverageLatency(provider: AIProviderName): number {
    const stats = this.metrics[provider];
    if (!stats || stats.latencies.length === 0) return 0;
    const sum = stats.latencies.reduce((acc, val) => acc + val, 0);
    return sum / stats.latencies.length;
  }

  /**
   * Resolves the best provider based on capability, latency, health, and availability.
   */
  getProviderForCapability(capability: AICapability): AIProvider {
    // Always respect the active provider from config. The "local-first"
    // fallback to Ollama is only used when the active provider IS ollama.
    // This prevents the router from sending requests to Ollama when the user
    // has explicitly configured a cloud provider (nvidia-nim / openrouter).
    if (this.config.activeProvider !== 'ollama') {
      return createProvider(this.config);
    }

    const ollamaStats = this.metrics.ollama;

    // 1. If simple task and Ollama is online, healthy, and not failing, prioritize it (local-first)
    if (capability === 'simple' && this.config.ollama && this.isLocalWorkerOnline()) {
      const ollamaRecentlyFailed = ollamaStats.lastFailureAt &&
        (Date.now() - ollamaStats.lastFailureAt.getTime() < 30_000); // cooldown of 30s on failure

      if (!ollamaRecentlyFailed) {
        return createProvider({
          activeProvider: 'ollama',
          ollama: this.config.ollama,
        });
      }
    }

    // 2. For complex reasoning tasks, route to the cloud provider with the best capabilities and latency
    // Let's sort cloud options based on metrics
    const cloudProviders: Array<{ name: AIProviderName; provider: AIProvider }> = [];

    if (this.config.openrouter) {
      cloudProviders.push({
        name: 'openrouter',
        provider: createProvider({
          activeProvider: 'openrouter',
          openrouter: this.config.openrouter,
        }),
      });
    }

    if (this.config.nvidiaNim) {
      cloudProviders.push({
        name: 'nvidia-nim',
        provider: createProvider({
          activeProvider: 'nvidia-nim',
          nvidiaNim: this.config.nvidiaNim,
        }),
      });
    }

    if (cloudProviders.length === 0) {
      // Fallback to whatever is active in configuration
      return createProvider(this.config);
    }

    // Sort by success rate and latency
    cloudProviders.sort((a, b) => {
      const statsA = this.metrics[a.name];
      const statsB = this.metrics[b.name];

      // Prefer provider without recent failures (cooldown of 30s)
      const failedA = statsA.lastFailureAt && (Date.now() - statsA.lastFailureAt.getTime() < 30_000);
      const failedB = statsB.lastFailureAt && (Date.now() - statsB.lastFailureAt.getTime() < 30_000);

      if (failedA && !failedB) return 1;
      if (!failedA && failedB) return -1;

      // Prefer provider with lower average latency
      const latA = this.getAverageLatency(a.name);
      const latB = this.getAverageLatency(b.name);

      if (latA > 0 && latB > 0) {
        return latA - latB;
      }
      return 0;
    });

    return cloudProviders[0]!.provider;
  }

  /**
   * Legacy method for backwards compatibility
   */
  getProvider(): AIProvider {
    return this.getProviderForCapability('simple');
  }

  getDebugInfo(): {
    activeProvider: AIProviderName;
    localOnline: boolean;
    localStatus: LocalWorkerStatus | null;
    metrics: Record<AIProviderName, { avgLatencyMs: number; successes: number; failures: number }>;
  } {
    return {
      activeProvider: this.config.activeProvider,
      localOnline: this.isLocalWorkerOnline(),
      localStatus: this.localStatus,
      metrics: {
        ollama: {
          avgLatencyMs: this.getAverageLatency('ollama'),
          successes: this.metrics.ollama.successes,
          failures: this.metrics.ollama.failures,
        },
        openrouter: {
          avgLatencyMs: this.getAverageLatency('openrouter'),
          successes: this.metrics.openrouter.successes,
          failures: this.metrics.openrouter.failures,
        },
        'nvidia-nim': {
          avgLatencyMs: this.getAverageLatency('nvidia-nim'),
          successes: this.metrics['nvidia-nim'].successes,
          failures: this.metrics['nvidia-nim'].failures,
        },
      },
    };
  }
}
