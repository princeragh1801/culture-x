import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  app,
  balanceOf,
  buyAndPay,
  createUser,
  currencyByCode,
  expectLedgerToBalance,
  ledgerSum,
  type TestUser,
} from './helpers';

/**
 * The headline acceptance criterion: for each currency, the balance is the sum
 * of that currency's ledger entries, and the three currencies are separate pots.
 */
describe('wallet invariants', () => {
  let user: TestUser;
  let campaignId: number;
  let reportId: number;
  let discoveryId: number;

  beforeEach(async () => {
    user = await createUser();
    campaignId = (await currencyByCode('CAMPAIGN_CREDITS')).id;
    reportId = (await currencyByCode('REPORT_CREDITS')).id;
    discoveryId = (await currencyByCode('DISCOVERY_CREDITS')).id;
  });

  async function fundNewCampaign(name: string, credits: number): Promise<number> {
    const created = await request(app)
      .post('/api/campaigns')
      .set('Authorization', user.auth)
      .send({ name })
      .expect(201);

    const id = created.body.campaign.id as number;

    await request(app)
      .post(`/api/campaigns/${id}/fund`)
      .set('Authorization', user.auth)
      .send({ currencyId: campaignId, credits })
      .expect(200);

    return id;
  }

  it('holds after a mixed sequence of purchases and spends across all three currencies', async () => {
    await buyAndPay(user, campaignId, 1000, 'mix-a');
    await buyAndPay(user, reportId, 50, 'mix-b');
    await buyAndPay(user, discoveryId, 200, 'mix-c');
    await buyAndPay(user, campaignId, 500, 'mix-d');

    await fundNewCampaign('One', 300);
    await fundNewCampaign('Two', 450);
    await fundNewCampaign('Three', 125);

    expect(await balanceOf(user.walletId, campaignId)).toBe(1500 - 875);
    expect(await balanceOf(user.walletId, reportId)).toBe(50);
    expect(await balanceOf(user.walletId, discoveryId)).toBe(200);

    for (const currencyId of [campaignId, reportId, discoveryId]) {
      expect(await ledgerSum(user.walletId, currencyId)).toBe(
        await balanceOf(user.walletId, currencyId),
      );
    }

    await expectLedgerToBalance();
  });

  it('keeps the three currencies independent', async () => {
    await buyAndPay(user, campaignId, 400, 'iso-a');
    await buyAndPay(user, reportId, 400, 'iso-b');
    await buyAndPay(user, discoveryId, 400, 'iso-c');

    await fundNewCampaign('Spender', 400);

    // Spending Campaign Credits to zero leaves the other two untouched.
    expect(await balanceOf(user.walletId, campaignId)).toBe(0);
    expect(await balanceOf(user.walletId, reportId)).toBe(400);
    expect(await balanceOf(user.walletId, discoveryId)).toBe(400);
    await expectLedgerToBalance();
  });

  it('exposes balances and a per-currency ledger through the API', async () => {
    await buyAndPay(user, campaignId, 300, 'read-a');
    await buyAndPay(user, discoveryId, 100, 'read-b');
    await fundNewCampaign('Readable', 120);

    const wallet = await request(app)
      .get('/api/wallet')
      .set('Authorization', user.auth)
      .expect(200);

    const byCode = Object.fromEntries(
      wallet.body.balances.map((b: { currency: { code: string }; balance: number }) => [
        b.currency.code,
        b.balance,
      ]),
    );

    // Every currency appears, including the one never topped up.
    expect(byCode).toEqual({
      CAMPAIGN_CREDITS: 180,
      REPORT_CREDITS: 0,
      DISCOVERY_CREDITS: 100,
    });

    const all = await request(app)
      .get('/api/wallet/ledger')
      .set('Authorization', user.auth)
      .expect(200);
    expect(all.body.total).toBe(3);

    const campaignOnly = await request(app)
      .get(`/api/wallet/ledger?currencyId=${campaignId}`)
      .set('Authorization', user.auth)
      .expect(200);

    expect(campaignOnly.body.total).toBe(2);
    expect(
      campaignOnly.body.entries.every(
        (e: { currency: { code: string } }) => e.currency.code === 'CAMPAIGN_CREDITS',
      ),
    ).toBe(true);

    // Signed amounts: the purchase is positive, the spend negative.
    const amounts = campaignOnly.body.entries.map((e: { amount: number }) => e.amount);
    expect(amounts).toEqual([-120, 300]);
  });

  it('shows one user nothing of another user’s wallet', async () => {
    await buyAndPay(user, campaignId, 750, 'priv');

    const outsider = await createUser();
    const wallet = await request(app)
      .get('/api/wallet')
      .set('Authorization', outsider.auth)
      .expect(200);

    expect(wallet.body.balances.every((b: { balance: number }) => b.balance === 0)).toBe(true);

    const ledger = await request(app)
      .get('/api/wallet/ledger')
      .set('Authorization', outsider.auth)
      .expect(200);

    expect(ledger.body.total).toBe(0);
  });
});
