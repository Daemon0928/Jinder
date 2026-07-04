import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env before reading anything. Import this module first in entry points.
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  DB_FILE: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash-lite'),
  AUTH_TOKEN: z.string().optional(),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  MOCK_GEMINI: z.string().optional(),
  ALLOW_PRIVATE_URLS: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),
  /** Jobs scoring at or above this trigger a Discord alert. */
  MATCH_ALERT_THRESHOLD: z.coerce.number().int().min(0).max(100).default(80),
  /** Default number of jobs matched per Gemini batch call. */
  DEFAULT_BATCH_SIZE: z.coerce.number().int().positive().default(10),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  isTest: parsed.data.NODE_ENV === 'test',
  isProduction: parsed.data.NODE_ENV === 'production',
  mockGemini: parsed.data.MOCK_GEMINI === 'true',
};

export default config;
