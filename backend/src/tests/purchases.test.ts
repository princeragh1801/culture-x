import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { CreditPurchase, CurrencyPlan, LedgerEntry } from '../db/models';
import {
  app,
  balanceOf,
  createUser,
  currencyByCode,
  type TestUser,
} from './helpers';
import { checkoutSessionCreate, stubCheckoutSession } from './stripe-mock';

/**
 * Buying credits: priced from the database, and worth nothing until a webhook
 * confirms the payment.
 */
describe('credit purchases', () => {
  let user: TestUser;
  let campaignCurrencyId: number;
  let reportCurrencyId: number;

  function buy(body: Record<string, unknown>, idempotencyKey?: string) {
    const pending = request(app)
      .post('/api/credits/purchases')
      .set('Authorization', user.auth);

    if (idempotencyKey) pending.set('Idempotency-Key', idempotencyKey);

    return pending.send(body);
  }

  beforeEach(async () => {
    user = await createUser();
    campaignCurrencyId = (await currencyByCode('CAMPAIGN_CREDITS')).id;
    reportCurrencyId = (await currencyByCode('REPORT_CREDITS')).id;
    stubCheckoutSession();
    checkoutSessionCreate.mockClear();
  });

  describe('pricing comes from the database, never from the client', () => {
    it('prices a bundle at the bundle price', async () => {
      const plan = await CurrencyPlan.findOne({ where: { code: 'CAMPAIGN_1000' } });

      const response = await buy({ currencyId: campaignCurrencyId, planId: plan!.id }).expect(201);

      // Rs 2,700 for 1,000 credits — cheaper than 1,000 x Rs 3.
      expect(response.body.purchase.credits).toBe(1000);
      expect(response.body.purchase.amountPaise).toBe(270_000);
      expect(response.body.purchase.status).toBe('PENDING');
    });

    it('prices a quantity at the per-credit rate', async () => {
      const response = await buy({ currencyId: campaignCurrencyId, quantity: 100 }).expect(201);

      // 100 x Rs 3 = Rs 300.
      expect(response.body.purchase.credits).toBe(100);
      expect(response.body.purchase.amountPaise).toBe(30_000);
    });

    it('charges each currency its own rate', async () => {
      const response = await buy({ currencyId: reportCurrencyId, quantity: 10 }).expect(201);

      // 10 x Rs 10 = Rs 100.
      expect(response.body.purchase.amountPaise).toBe(10_000);
    });

    it('sends Stripe the amount it computed, not anything the client supplied', async () => {
      await buy({ currencyId: campaignCurrencyId, quantity: 100, amountPaise: 1 }).expect(201);

      const params = checkoutSessionCreate.mock.calls[0]?.[0] as {
        line_items: { price_data: { unit_amount: number } }[];
      };
      expect(params.line_items[0]?.price_data.unit_amount).toBe(30_000);
    });

    it('refuses a plan belonging to a different currency', async () => {
      const plan = await CurrencyPlan.findOne({ where: { code: 'CAMPAIGN_1000' } });

      const response = await buy({ currencyId: reportCurrencyId, planId: plan!.id }).expect(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it.each([
      ['neither planId nor quantity', {}],
      ['both planId and quantity', { planId: 1, quantity: 5 }],
      ['a zero quantity', { quantity: 0 }],
      ['a fractional quantity', { quantity: 1.5 }],
    ])('rejects %s', async (_label, extra) => {
      const response = await buy({ currencyId: campaignCurrencyId, ...extra }).expect(422);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(checkoutSessionCreate).not.toHaveBeenCalled();
    });
  });

  describe('idempotency of the request itself', () => {
    it('reuses the purchase when the same Idempotency-Key is retried', async () => {
      const key = 'client-retry-key';

      const first = await buy({ currencyId: campaignCurrencyId, quantity: 200 }, key).expect(201);
      const retry = await buy({ currencyId: campaignCurrencyId, quantity: 200 }, key).expect(200);

      expect(retry.body.purchase.id).toBe(first.body.purchase.id);
      expect(retry.body.checkoutUrl).toBe(first.body.checkoutUrl);

      expect(await CreditPurchase.count()).toBe(1);
      // The second request never reached Stripe.
      expect(checkoutSessionCreate).toHaveBeenCalledTimes(1);
    });

    it('treats requests without a key as separate purchases', async () => {
      await buy({ currencyId: campaignCurrencyId, quantity: 10 }).expect(201);
      await buy({ currencyId: campaignCurrencyId, quantity: 10 }).expect(201);

      expect(await CreditPurchase.count()).toBe(2);
    });

    it('passes Stripe a per-purchase idempotency key', async () => {
      const response = await buy({ currencyId: campaignCurrencyId, quantity: 10 }).expect(201);

      const options = checkoutSessionCreate.mock.calls[0]?.[1] as { idempotencyKey: string };
      expect(options.idempotencyKey).toBe(`checkout:${response.body.purchase.id as number}`);
    });
  });

  /**
   * The rule the brief is most explicit about: the browser coming back from
   * Stripe proves nothing.
   */
  describe('the redirect grants nothing', () => {
    it('leaves the purchase PENDING and the balance at zero until a webhook arrives', async () => {
      const response = await buy({ currencyId: campaignCurrencyId, quantity: 500 }).expect(201);
      const purchaseId = response.body.purchase.id as number;

      // Whatever the user's browser does with the success URL, this is all the
      // API will tell it — and all it can act on.
      const polled = await request(app)
        .get(`/api/credits/purchases/${purchaseId}`)
        .set('Authorization', user.auth)
        .expect(200);

      expect(polled.body.purchase.status).toBe('PENDING');
      expect(polled.body.purchase.ledgerEntryId).toBeNull();
      expect(await balanceOf(user.walletId, campaignCurrencyId)).toBe(0);
      expect(await LedgerEntry.count()).toBe(0);
    });
  });

  describe('ownership', () => {
    it('hides another user’s purchase behind a 404', async () => {
      const response = await buy({ currencyId: campaignCurrencyId, quantity: 10 }).expect(201);
      const outsider = await createUser();

      await request(app)
        .get(`/api/credits/purchases/${response.body.purchase.id as number}`)
        .set('Authorization', outsider.auth)
        .expect(404);
    });

    it('lists only the caller’s own purchases', async () => {
      await buy({ currencyId: campaignCurrencyId, quantity: 10 }).expect(201);

      const outsider = await createUser();
      const listed = await request(app)
        .get('/api/credits/purchases')
        .set('Authorization', outsider.auth)
        .expect(200);

      expect(listed.body.purchases).toHaveLength(0);
    });
  });
});
