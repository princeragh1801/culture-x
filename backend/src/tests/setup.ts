import { afterAll, beforeEach, vi } from 'vitest';
import { sequelize } from '../db/models';

/**
 * Replaces the Stripe client with one whose session creation is a spy, while
 * leaving signature verification as the real implementation. See stripe-mock.ts.
 */
vi.mock('../lib/stripe', async () => {
  const { checkoutSessionCreate, TEST_WEBHOOK_SECRET } = await import('./stripe-mock');
  const StripeModule = await import('stripe');
  const Stripe = StripeModule.default;

  return {
    getStripe: () => ({
      checkout: { sessions: { create: checkoutSessionCreate } },
      webhooks: {
        constructEvent: (payload: string | Buffer, header: string, secret: string) =>
          Stripe.webhooks.constructEvent(payload, header, secret),
      },
    }),
    assertWebhookSecretConfigured: () => TEST_WEBHOOK_SECRET,
  };
});

/**
 * Transactional tables only. Modules, currencies and plans are reference data
 * seeded once in global setup, and every test needs them present.
 */
const TRANSACTIONAL_TABLES = [
  'campaigns',
  'credit_purchases',
  'ledger_entries',
  'wallet_balances',
  'wallets',
  'users',
  'stripe_webhook_events',
];

beforeEach(async () => {
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of TRANSACTIONAL_TABLES) {
    await sequelize.query(`TRUNCATE TABLE \`${table}\``);
  }
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
});

afterAll(async () => {
  await sequelize.close();
});
