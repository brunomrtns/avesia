import type { HealthStatus } from '../types.js';

export async function performHealthCheck(
  providerName: string,
  checkFn: () => Promise<void>,
): Promise<HealthStatus> {
  const start = Date.now();
  try {
    await checkFn();
    return {
      provider: providerName,
      healthy: true,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      provider: providerName,
      healthy: false,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
