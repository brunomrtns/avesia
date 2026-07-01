// ============================================================================
//  Avesia AI Core — Async Semaphore
//
//  Limits concurrency for operations that can't run in parallel (e.g. Ollama
//  embedding requests, which crash the runner under concurrent load).
// ============================================================================

export class Semaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly maxConcurrency: number = 1) {
    this.available = maxConcurrency;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available -= 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
    this.available -= 1;
  }

  private release(): void {
    this.available += 1;
    const next = this.waiters.shift();
    if (next) {
      // Wake up the next waiter; it will decrement available in acquire's
      // continuation. We decrement here to avoid a brief over-release.
      this.available -= 1;
      next();
    }
  }
}
