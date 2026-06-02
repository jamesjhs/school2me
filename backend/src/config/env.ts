import dotenv from 'dotenv';
import { isAbsolute } from 'node:path';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['production', 'development']).default('development'),
  PORT: z.coerce.number().int().positive().default(4020),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  DB_PATH: z.string().min(1).refine((value) => isAbsolute(value), 'DB_PATH must be absolute'),
  DB_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  CF_TURNSTILE_SITE_KEY: z.string().min(1),
  CF_TURNSTILE_SECRET_KEY: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD_HASH: z.string().min(20),
  WEBHOOK_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  FRONTEND_BASE_URL: z.string().url().default('http://localhost:5173'),
  PUBLIC_BASE_URL: z.string().url().default('https://school2me.jahosi.co.uk')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration', parsed.error.flatten().fieldErrors);
  throw new Error('Environment validation failed');
}

export const env = parsed.data;
