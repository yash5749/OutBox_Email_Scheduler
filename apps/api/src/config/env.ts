import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Render provides PORT. Keep API_PORT available for local development and
  // allow an explicit override when running outside Render.
  API_PORT: z.coerce.number().default(Number(process.env.PORT) || 4000),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  API_BASE_URL: z.string().url().default('http://localhost:4000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  ELASTICSEARCH_URL: z.string().url().default('http://localhost:9200'),
  ELASTICSEARCH_USERNAME: z.string().optional(),
  ELASTICSEARCH_PASSWORD: z.string().optional(),
  ELASTICSEARCH_INDEX: z.string().default('scheduled-emails-v1'),

  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
  GOOGLE_CALLBACK_URL: z.string().url(),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  SESSION_COOKIE_NAME: z.string().default('reachinbox.sid'),

  SLACK_CLIENT_ID: z.string().min(1, 'SLACK_CLIENT_ID is required'),
  SLACK_CLIENT_SECRET: z.string().min(1, 'SLACK_CLIENT_SECRET is required'),
  SLACK_CALLBACK_URL: z.string().url(),

  TOKEN_ENCRYPTION_KEY: z.string().length(64, 'TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)'),

  ETHEREAL_FROM_NAME: z.string().default('ReachInbox Demo'),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(10),
  MIN_DELAY_BETWEEN_EMAILS_MS: z.coerce.number().int().positive().default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().positive().default(200),
  RATE_LIMIT_WINDOW: z.enum(['UTC_FIXED_HOUR']).default('UTC_FIXED_HOUR'),
  EMAIL_JOB_ATTEMPTS: z.coerce.number().int().positive().default(5),
  EMAIL_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(5000),

  CSV_MAX_BYTES: z.coerce.number().int().positive().default(5242880),

  BULL_BOARD_ADMIN_EMAILS: z.string().default(''),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Environment validation failed:\n${errors}`);
  }

  cachedEnv = result.data;
  return cachedEnv;
}

export function getAdminEmails(): Set<string> {
  const env = getEnv();
  if (!env.BULL_BOARD_ADMIN_EMAILS) return new Set();
  return new Set(env.BULL_BOARD_ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()));
}
