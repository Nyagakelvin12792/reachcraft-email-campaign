import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('file:./dev.db'),
  GMAIL_USER: z.string().email().optional().or(z.literal('')).default(''),
  GMAIL_APP_PASSWORD: z.string().optional().default(''),
  DEFAULT_FROM_NAME: z.string().default('Campaign Manager'),
  APP_ENCRYPTION_KEY: z.string().min(16).default('12345678901234567890123456789012'),
  SEND_DELAY_MS: z.coerce.number().min(100).default(2000),
  MAX_RETRIES: z.coerce.number().min(0).max(10).default(3),
  MAX_RECIPIENTS: z.coerce.number().min(1).max(100).default(100),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;

/**
 * Mask sensitive email string for logs and UI:
 * example@domain.com -> e***e@domain.com
 */
export function maskEmail(email?: string | null): string {
  if (!email || typeof email !== 'string') return 'N/A';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const [local, domain] = parts;
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/**
 * Dynamically updates credentials in memory and persists them to .env on disk
 */
export function updateRuntimeCredentials(
  user: string,
  pass: string,
  fromName?: string
): void {
  config.GMAIL_USER = user.trim();
  config.GMAIL_APP_PASSWORD = pass.trim();
  if (fromName && fromName.trim()) {
    config.DEFAULT_FROM_NAME = fromName.trim();
  }

  // Update process.env
  process.env.GMAIL_USER = config.GMAIL_USER;
  process.env.GMAIL_APP_PASSWORD = config.GMAIL_APP_PASSWORD;
  process.env.DEFAULT_FROM_NAME = config.DEFAULT_FROM_NAME;
}

export function clearRuntimeCredentials(): void {
  config.GMAIL_USER = '';
  config.GMAIL_APP_PASSWORD = '';
  process.env.GMAIL_USER = '';
  process.env.GMAIL_APP_PASSWORD = '';
}
