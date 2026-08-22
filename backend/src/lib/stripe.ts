import Stripe from 'stripe';
import { env } from '../config/env';
import { AppError } from './errors';

let client: Stripe | null = null;

/**
 * The Stripe client, created lazily.
 *
 * Lazily, because the API is useful without Stripe configured — signup, login
 * and wallet reads all work — and a missing key should fail at the point of
 * payment with a clear 503 rather than preventing the server from booting.
 */
export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new AppError(
      'STRIPE_NOT_CONFIGURED',
      503,
      'Stripe is not configured. Set STRIPE_SECRET_KEY in the environment.',
    );
  }

  client ??= new Stripe(env.STRIPE_SECRET_KEY, {
    // Retries make Stripe's own transient failures survivable. Combined with the
    // per-purchase idempotency key on session creation, a retry can never
    // produce a second Checkout Session for the same purchase.
    maxNetworkRetries: 2,
    timeout: 20_000,
  });

  return client;
}

export function assertWebhookSecretConfigured(): string {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(
      'STRIPE_NOT_CONFIGURED',
      503,
      'Stripe webhooks are not configured. Set STRIPE_WEBHOOK_SECRET in the environment.',
    );
  }

  return env.STRIPE_WEBHOOK_SECRET;
}
