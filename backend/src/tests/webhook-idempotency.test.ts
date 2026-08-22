import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { CreditPurchase, LedgerEntry, StripeWebhookEvent } from '../db/models';
import {
  app,
  balanceOf,
  checkoutSessionEvent,
  createUser,
  currencyByCode,
  expectLedgerToBalance,
  postWebhook,
  signPayload,
  type TestUser,
} from './helpers';
import { stubCheckoutSession } from './stripe-mock';

/**
 * Credits are granted exactly once per payment, and only on a verified webhook.
 *
 * This file contains the required duplicate-webhook test, plus the neighbouring
 * failure modes from the brief: forged signatures, unpaid sessions, and events
 * arriving out of order.
 */
describe('stripe webhook', () => {
  let user: TestUser;
  let campaignCurrencyId: number;

  async function startPurchase(credits: number): Promise<{ id: number; amountPaise: number }> {
    stubCheckoutSession();

    const response = await request(app)
      .post('/api/credits/purchases')
      .set('Authorization', user.auth)
      .send({ currencyId: campaignCurrencyId, quantity: credits })
      .expect(201);

    return response.body.purchase as { id: number; amountPaise: number };
  }

  beforeEach(async () => {
    user = await createUser();
    campaignCurrencyId = (await currencyByCode('CAMPAIGN_CREDITS')).id;
  });

  it('grants credits once when the same event is delivered repeatedly', async () => {
    const purchase = await startPurchase(100);

    const payload = checkoutSessionEvent({
      eventId: 'evt_duplicate_delivery',
      purchaseId: purchase.id,
      paymentIntentId: 'pi_duplicate_delivery',
      amountTotal: purchase.amountPaise,
    });

    const first = await postWebhook(payload).expect(200);
    expect(first.body.outcome).toBe('processed');

    // Stripe's own retry, or `stripe events resend <evt_id>` — the same event id
    // arriving four more times.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const repeat = await postWebhook(payload).expect(200);
      expect(repeat.body.outcome).toBe('duplicate');
    }

    expect(await balanceOf(user.walletId, campaignCurrencyId)).toBe(100);
    expect(await LedgerEntry.count({ where: { walletId: user.walletId } })).toBe(1);
    await expectLedgerToBalance();
  });

  it('grants credits once when five duplicate deliveries arrive concurrently', async () => {
    const purchase = await startPurchase(250);

    const payload = checkoutSessionEvent({
      eventId: 'evt_concurrent_delivery',
      purchaseId: purchase.id,
      paymentIntentId: 'pi_concurrent_delivery',
      amountTotal: purchase.amountPaise,
    });

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => postWebhook(payload)),
    );

    for (const response of responses) expect(response.status).toBe(200);
    expect(responses.filter((r) => r.body.outcome === 'processed')).toHaveLength(1);

    expect(await balanceOf(user.walletId, campaignCurrencyId)).toBe(250);
    expect(await LedgerEntry.count({ where: { walletId: user.walletId } })).toBe(1);
  });

  /**
   * The case a dedupe table keyed on the event id alone would miss. Stripe
   * describes one payment through more than one event, and both carry the same
   * payment intent. Only the ledger's unique idempotency key stops the second.
   */
  it('grants credits once when one payment arrives under two different event ids', async () => {
    const purchase = await startPurchase(100);
    const paymentIntentId = 'pi_one_payment_two_events';

    const completed = checkoutSessionEvent({
      eventId: 'evt_completed',
      type: 'checkout.session.completed',
      purchaseId: purchase.id,
      paymentIntentId,
      amountTotal: purchase.amountPaise,
    });

    const asyncSucceeded = checkoutSessionEvent({
      eventId: 'evt_async_payment_succeeded',
      type: 'checkout.session.async_payment_succeeded',
      purchaseId: purchase.id,
      paymentIntentId,
      amountTotal: purchase.amountPaise,
    });

    expect((await postWebhook(completed).expect(200)).body.outcome).toBe('processed');

    const second = await postWebhook(asyncSucceeded).expect(200);
    expect(second.body.outcome).toBe('duplicate');

    // Two distinct events were recorded, but only one grant happened.
    expect(await StripeWebhookEvent.count()).toBe(2);
    expect(await balanceOf(user.walletId, campaignCurrencyId)).toBe(100);
    expect(await LedgerEntry.count({ where: { walletId: user.walletId } })).toBe(1);
  });

  describe('rejects anything it cannot verify, before touching the database', () => {
    it.each([
      ['no signature header', null],
      ['a signature from the wrong secret', 'wrong-secret'],
      ['a well-formed but bogus header', 't=1,v1=deadbeef'],
    ])('%s', async (_label, mode) => {
      const purchase = await startPurchase(100);
      const payload = checkoutSessionEvent({
        eventId: 'evt_forged',
        purchaseId: purchase.id,
        amountTotal: purchase.amountPaise,
      });

      const signature =
        mode === null
          ? null
          : mode === 'wrong-secret'
            ? signPayload(payload, 'whsec_an_attacker_does_not_have_this')
            : mode;

      const response = await postWebhook(payload, signature).expect(400);
      expect(response.body.error.code).toBe('INVALID_SIGNATURE');

      expect(await StripeWebhookEvent.count()).toBe(0);
      expect(await LedgerEntry.count()).toBe(0);
      expect(await balanceOf(user.walletId, campaignCurrencyId)).toBe(0);
    });

    it('rejects a payload edited after it was signed', async () => {
      const purchase = await startPurchase(100);

      const original = checkoutSessionEvent({
        eventId: 'evt_tampered',
        purchaseId: purchase.id,
        amountTotal: purchase.amountPaise,
      });
      const signature = signPayload(original);

      // Ask for ten times the credits, keeping the signature of the original.
      const tampered = original.replace(
        `"amount_total":${purchase.amountPaise}`,
        `"amount_total":${purchase.amountPaise * 10}`,
      );

      await postWebhook(tampered, signature).expect(400);
      expect(await LedgerEntry.count()).toBe(0);
    });
  });

  it('grants nothing for a session that completed without being paid', async () => {
    const purchase = await startPurchase(100);

    const payload = checkoutSessionEvent({
      eventId: 'evt_unpaid',
      purchaseId: purchase.id,
      paymentIntentId: null,
      amountTotal: purchase.amountPaise,
      paymentStatus: 'unpaid',
    });

    const response = await postWebhook(payload).expect(200);
    expect(response.body.outcome).toBe('ignored');

    expect(await balanceOf(user.walletId, campaignCurrencyId)).toBe(0);
    expect((await CreditPurchase.findByPk(purchase.id))?.status).toBe('PENDING');
  });

  it('refuses to grant when the amount collected does not match the quote', async () => {
    const purchase = await startPurchase(100);

    const payload = checkoutSessionEvent({
      eventId: 'evt_amount_mismatch',
      purchaseId: purchase.id,
      paymentIntentId: 'pi_amount_mismatch',
      amountTotal: 1,
    });

    // 500 so Stripe retries rather than treating it as settled.
    await postWebhook(payload).expect(500);

    expect(await balanceOf(user.walletId, campaignCurrencyId)).toBe(0);
    expect((await StripeWebhookEvent.findOne({ where: { stripeEventId: 'evt_amount_mismatch' } }))?.status).toBe('FAILED');
  });

  describe('out-of-order delivery', () => {
    it('leaves a paid purchase alone when an expiry event arrives late', async () => {
      const purchase = await startPurchase(100);

      await postWebhook(
        checkoutSessionEvent({
          eventId: 'evt_paid_first',
          purchaseId: purchase.id,
          paymentIntentId: 'pi_paid_first',
          amountTotal: purchase.amountPaise,
        }),
      ).expect(200);

      const expired = await postWebhook(
        checkoutSessionEvent({
          eventId: 'evt_expired_late',
          type: 'checkout.session.expired',
          purchaseId: purchase.id,
          paymentIntentId: null,
          amountTotal: purchase.amountPaise,
          paymentStatus: 'unpaid',
        }),
      ).expect(200);

      expect(expired.body.outcome).toBe('ignored');
      expect((await CreditPurchase.findByPk(purchase.id))?.status).toBe('PAID');
      expect(await balanceOf(user.walletId, campaignCurrencyId)).toBe(100);
    });

    /**
     * A payment is the truth. If the session expired locally but the payment
     * later settles, the credits are still owed.
     */
    it('still grants when the payment arrives after the purchase expired', async () => {
      const purchase = await startPurchase(100);

      await postWebhook(
        checkoutSessionEvent({
          eventId: 'evt_expired_first',
          type: 'checkout.session.expired',
          purchaseId: purchase.id,
          paymentIntentId: null,
          amountTotal: purchase.amountPaise,
          paymentStatus: 'unpaid',
        }),
      ).expect(200);

      expect((await CreditPurchase.findByPk(purchase.id))?.status).toBe('EXPIRED');

      const paid = await postWebhook(
        checkoutSessionEvent({
          eventId: 'evt_paid_after_expiry',
          purchaseId: purchase.id,
          paymentIntentId: 'pi_paid_after_expiry',
          amountTotal: purchase.amountPaise,
        }),
      ).expect(200);

      expect(paid.body.outcome).toBe('processed');
      expect((await CreditPurchase.findByPk(purchase.id))?.status).toBe('PAID');
      expect(await balanceOf(user.walletId, campaignCurrencyId)).toBe(100);
      await expectLedgerToBalance();
    });
  });
});
