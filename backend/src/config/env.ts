import { z } from 'zod';
import { dbEnv } from './db-env';

/**
 * Application environment.
 *
 * Imported by the HTTP server, not by the migration runner — see db-env.ts for
 * why the two are split.
 */
const appEnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  JWT_SECRET: z.string().min(16, 'must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),

  // Stripe test-mode credentials. Empty is tolerated so the API still boots for
  // the auth/wallet flows before keys are configured; creating a Checkout
  // Session or receiving a webhook without them fails loudly instead.
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),

  /** ISO-4217 code Stripe charges in. Credit prices are stored in paise. */
  STRIPE_PAYMENT_CURRENCY: z.string().length(3).default('inr'),

  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
});

const parsed = appEnvSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid application environment configuration:\n${details}`);
}

export const env = {
  ...parsed.data,
  NODE_ENV: dbEnv.NODE_ENV,
};

export const isStripeConfigured = Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
