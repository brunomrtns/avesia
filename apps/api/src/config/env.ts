import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // BI Identity Service URL (Docker internal: http://bi-api:3300)
  BI_IDENTITY_URL: z.string().default('http://bi-api:3300'),

  // JWT secrets — optional (kept for backward compat; BI Identity handles auth)
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters').optional(),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters').optional(),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().default(9100),
  MINIO_ROOT_USER: z.string().default(''),
  MINIO_ROOT_PASSWORD: z.string().default(''),
  MINIO_BUCKET: z.string().default('avesia'),

  CORS_ORIGINS: z.string().default('http://localhost:3101,http://localhost:5173'),
});

export type EnvConfig = z.infer<typeof envSchema>;

function loadEnv(): EnvConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const errors = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    // eslint-disable-next-line no-console
    console.error('\nEnvironment variable validation failed:\n', errors, '\n');
    process.exit(1);
  }

  return parsed.data;
}

export const env: EnvConfig = loadEnv();

export const isProduction: boolean = env.NODE_ENV === 'production';
export const isDevelopment: boolean = env.NODE_ENV === 'development';

export const corsOrigins: readonly string[] = env.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);
