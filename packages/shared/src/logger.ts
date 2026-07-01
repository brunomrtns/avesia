import pino from 'pino';

export function createLogger(name: string, bindings?: Record<string, unknown>): pino.Logger {
  return pino({
    name,
    level: process.env['LOG_LEVEL'] ?? 'info',
    base: { app: 'avesia' },
    ...bindings,
  });
}
