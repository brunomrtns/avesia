import type { AIProvider, AIProviderName, ChatRequest, ChatResponse, HealthStatus } from '../types.js';
import { ProviderRouter } from '../provider-router.js';
import type { ProviderConfig } from '../provider-config.js';
import { loadProviderConfigFromEnv } from '../provider-config.js';
import { ProviderError, ProviderUnavailableError } from '../errors.js';

export interface PromptTemplate {
  readonly name: string;
  readonly systemPrompt: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
}

export interface AICoreResult {
  readonly content: string;
  readonly tokensUsed: number;
  readonly provider: string;
  readonly model: string;
  readonly latencyMs: number;
}

export class AvesiaAICore {
  private readonly router: ProviderRouter;
  private readonly templates: Map<string, PromptTemplate> = new Map();

  constructor(config?: ProviderConfig) {
    const resolvedConfig = config ?? loadProviderConfigFromEnv();
    this.router = new ProviderRouter(resolvedConfig);
  }

  getRouter(): ProviderRouter {
    return this.router;
  }

  registerTemplate(template: PromptTemplate): void {
    this.templates.set(template.name, template);
  }

  registerTemplates(templates: PromptTemplate[]): void {
    for (const t of templates) {
      this.templates.set(t.name, t);
    }
  }

  getTemplate(name: string): PromptTemplate | undefined {
    return this.templates.get(name);
  }

  async chat(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: { template?: string; temperature?: number; maxTokens?: number; capability?: 'simple' | 'complex' },
  ): Promise<AICoreResult> {
    const { template: templateName, temperature: tempOverride, maxTokens: maxTokensOverride, capability = 'simple' } = options ?? {};

    let systemPrompt: string | undefined;
    let temperature = 0.7;
    let maxTokens: number | undefined;

    if (templateName) {
      const template = this.templates.get(templateName);
      if (template) {
        systemPrompt = template.systemPrompt;
        temperature = tempOverride ?? template.temperature ?? temperature;
        maxTokens = maxTokensOverride ?? template.maxTokens;
      }
    }

    const allMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    if (systemPrompt) {
      allMessages.push({ role: 'system', content: systemPrompt });
    }
    allMessages.push(...messages);

    const provider = this.getBestProvider(capability);

    const request: ChatRequest = {
      model: this.resolveModel(provider.name),
      messages: allMessages,
      temperature,
      ...(maxTokens !== undefined ? { maxTokens } : {}),
    };

    const startTime = Date.now();

    try {
      const response: ChatResponse = await provider.chat(request);
      const latencyMs = Date.now() - startTime;
      this.router.recordMetric(provider.name, latencyMs, true);

      const choice = response.choices[0];
      if (!choice) {
        throw new ProviderError('AI provider returned no choices', provider.name, undefined, false);
      }

      return {
        content: choice.message.content,
        tokensUsed: response.usage.totalTokens,
        provider: provider.name,
        model: response.model,
        latencyMs,
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      this.router.recordMetric(provider.name, latencyMs, false);
      throw err;
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    const debug = this.router.getDebugInfo();
    const errors: string[] = [];

    const providers: AIProvider[] = [];
    if (debug.localOnline) {
      try {
        const localProvider = this.router.getProviderForCapability('simple');
        const status = await localProvider.healthCheck();
        if (status.healthy) return status;
        errors.push(`local (${status.error ?? 'unhealthy'})`);
      } catch (err) {
        errors.push(`local (${err instanceof Error ? err.message : 'error'})`);
      }
    }

    try {
      const cloudProvider = this.router.getProviderForCapability('complex');
      const status = await cloudProvider.healthCheck();
      if (status.healthy) return status;
      errors.push(`cloud (${status.error ?? 'unhealthy'})`);
    } catch (err) {
      errors.push(`cloud (${err instanceof Error ? err.message : 'error'})`);
    }

    return {
      provider: this.router.getDebugInfo().activeProvider,
      healthy: false,
      latencyMs: 0,
      checkedAt: new Date().toISOString(),
      error: errors.length > 0 ? `All providers unhealthy: ${errors.join('; ')}` : 'No providers available',
    };
  }

  getActiveProviderName(): AIProviderName {
    return this.router.getDebugInfo().activeProvider;
  }

  getDebugInfo() {
    return this.router.getDebugInfo();
  }

  private getBestProvider(capability: 'simple' | 'complex'): AIProvider {
    try {
      return this.router.getProviderForCapability(capability);
    } catch {
      return this.router.getProvider();
    }
  }

  private resolveModel(providerName: AIProviderName): string {
    const config = loadProviderConfigFromEnv();
    switch (providerName) {
      case 'openrouter':
        return config.openrouter?.defaultModel ?? 'meta-llama/llama-3.3-70b-instruct';
      case 'nvidia-nim':
        return config.nvidiaNim?.defaultModel ?? 'meta/llama-3.3-70b-instruct';
      case 'ollama':
        return config.ollama?.defaultModel ?? 'gemma3:12b';
    }
  }
}
