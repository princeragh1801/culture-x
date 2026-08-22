import Stripe from 'stripe';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import { QueryTypes } from 'sequelize';
import { Currency, LedgerEntry, WalletBalance, sequelize } from '../db/models';
import { getWalletForUser } from '../modules/wallet/wallet.service';
import { TEST_WEBHOOK_SECRET, stubCheckoutSession } from './stripe-mock';

export const app: Express = createApp();

export interface TestUser {
  userId: number;
  email: string;
  token: string;
  walletId: number;
  auth: string;
}

let counter = 0;

/** Signs a user up through the real endpoint, so they get a real wallet. */
export async function createUser(): Promise<TestUser> {
  counter += 1;
  const email = `user-${counter}-${process.pid}@example.test`;

  const response = await request(app)
    .post('/api/auth/signup')
    .send({ email, password: 'correct-horse-battery' })
    .expect(201);

  const userId = response.body.user.id as number;
  const wallet = await getWalletForUser(userId);

  return {
    userId,
    email,
    token: response.body.token as string,
    walletId: wallet.id,
    auth: `Bearer ${response.body.token as string}`,
  };
}

export async function currencyByCode(code: string): Promise<Currency> {
  const currency = await Currency.findOne({ where: { code } });
  if (!currency) throw new Error(`No currency seeded with code ${code}`);
  return currency;
}

export async function balanceOf(walletId: number, currencyId: number): Promise<number> {
  const row = await WalletBalance.findOne({ where: { walletId, currencyId } });
  return row?.balance ?? 0;
}

export async function ledgerSum(walletId: number, currencyId: number): Promise<number> {
  const entries = await LedgerEntry.findAll({ where: { walletId, currencyId } });
  return entries.reduce((total, entry) => total + entry.amount, 0);
}

export async function ledgerCount(walletId: number): Promise<number> {
  return LedgerEntry.count({ where: { walletId } });
}

/**
 * Asserts the headline acceptance criterion for every wallet and currency in
 * the database: the balance is exactly the sum of that currency's ledger.
 */
export async function expectLedgerToBalance(): Promise<void> {
  const drift = await sequelize.query<{
    wallet_id: number;
    currency_id: number;
    balance: number;
    ledger_sum: number;
  }>(
    `SELECT wb.wallet_id, wb.currency_id,
            CAST(wb.balance AS SIGNED) AS balance,
            CAST(COALESCE(SUM(le.amount), 0) AS SIGNED) AS ledger_sum
       FROM wallet_balances wb
       LEFT JOIN ledger_entries le
              ON le.wallet_id = wb.wallet_id AND le.currency_id = wb.currency_id
      GROUP BY wb.wallet_id, wb.currency_id, wb.balance
     HAVING balance <> ledger_sum`,
    { type: QueryTypes.SELECT },
  );

  if (drift.length > 0) {
    throw new Error(`Balance drifted from the ledger: ${JSON.stringify(drift)}`);
  }
}

export interface SessionEventOptions {
  eventId: string;
  type?: string;
  purchaseId: number;
  sessionId?: string;
  paymentIntentId?: string | null;
  amountTotal: number;
  paymentStatus?: 'paid' | 'unpaid' | 'no_payment_required';
}

/** Builds the JSON body of a Checkout Session event, exactly as Stripe sends it. */
export function checkoutSessionEvent(options: SessionEventOptions): string {
  return JSON.stringify({
    id: options.eventId,
    object: 'event',
    api_version: '2024-06-20',
    created: 1_787_000_000,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: options.type ?? 'checkout.session.completed',
    data: {
      object: {
        id: options.sessionId ?? `cs_test_${options.purchaseId}`,
        object: 'checkout.session',
        amount_total: options.amountTotal,
        currency: 'inr',
        payment_status: options.paymentStatus ?? 'paid',
        payment_intent: options.paymentIntentId === undefined
          ? `pi_test_${options.purchaseId}`
          : options.paymentIntentId,
        client_reference_id: String(options.purchaseId),
        metadata: { purchase_id: String(options.purchaseId) },
      },
    },
  });
}

/** Signs a payload with the suite's webhook secret, using Stripe's own helper. */
export function signPayload(payload: string, secret: string = TEST_WEBHOOK_SECRET): string {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret });
}

/** POSTs to the webhook route the way Stripe would: raw body plus signature. */
export function postWebhook(payload: string, signature?: string | null) {
  const pending = request(app)
    .post('/api/webhooks/stripe')
    .set('Content-Type', 'application/json');

  if (signature !== null) {
    pending.set('Stripe-Signature', signature ?? signPayload(payload));
  }

  return pending.send(payload);
}

/**
 * Buys credits and pays for them the only way the system permits: a verified
 * webhook. Returns the purchase id.
 */
export async function buyAndPay(
  user: TestUser,
  currencyId: number,
  credits: number,
  tag = 'seed',
): Promise<number> {
  stubCheckoutSession();

  const created = await request(app)
    .post('/api/credits/purchases')
    .set('Authorization', user.auth)
    .send({ currencyId, quantity: credits })
    .expect(201);

  const purchase = created.body.purchase as { id: number; amountPaise: number };

  const payload = checkoutSessionEvent({
    eventId: `evt_${tag}_${purchase.id}`,
    purchaseId: purchase.id,
    paymentIntentId: `pi_${tag}_${purchase.id}`,
    amountTotal: purchase.amountPaise,
  });

  await postWebhook(payload).expect(200);

  return purchase.id;
}
