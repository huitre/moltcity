// ============================================
// MOLTCITY - Environment Configuration
// ============================================

import { z } from 'zod';

// Custom coerce helpers
const coerceNumber = z.coerce.number();
const coerceBoolean = z.string().transform(v => v === 'true');

const envSchema = z.object({
  // Server
  PORT: coerceNumber.default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DB_PATH: z.string().default('./moltcity.db'),

  // Auth
  JWT_SECRET: z.string().min(32).default('development-secret-key-change-in-production'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),

  // Payments
  RPC_URL: z.string().optional(),
  PAYMENT_WALLET_ADDRESS: z.string().optional(),
  CHAIN_ID: coerceNumber.optional(),

  // Feature flags for gradual rollout
  USE_NEW_AUTH: coerceBoolean.default(false),
  USE_NEW_BUILDINGS: coerceBoolean.default(false),
  USE_NEW_PARCELS: coerceBoolean.default(false),
  USE_NEW_AGENTS: coerceBoolean.default(false),
  USE_NEW_RENTALS: coerceBoolean.default(false),
  USE_NEW_PAYMENTS: coerceBoolean.default(false),

  // Beta access
  BETA_KEY: z.string().optional(),

  // Sprites
  SPRITES_DIR: z.string().default('./client/sprites'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    throw new Error('Invalid environment configuration');
  }

  return result.data;
}

export const env = loadEnv();

export function isDevelopment(): boolean {
  return env.NODE_ENV === 'development';
}

export function isProduction(): boolean {
  return env.NODE_ENV === 'production';
}

export function isTest(): boolean {
  return env.NODE_ENV === 'test';
}
