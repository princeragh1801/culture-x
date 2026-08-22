import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { Campaign, LedgerEntry } from '../db/models';
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
 * Campaign funding: at most once, only in Campaign Credits, never below zero.
 *
 * This file contains the required over-spend test. Every balance here got there
 * through a paid webhook, so the tests exercise the same path production does.
 */
describe('campaign funding', () => {
  let user: TestUser;
  let campaignCurrencyId: number;
  let reportCurrencyId: number;
  let discoveryCurrencyId: number;

  async function createCampaign(name: string): Promise<number> {
    const response = await request(app)
      .post('/api/campaigns')
      .set('Authorization', user.auth)
      .send({ name })
      .expect(201);

    return response.body.campaign.id as number;
  }

  function fund(campaignId: number, currencyId: number, credits: number) {
    return request(app)
      .post(`/api/campaigns/${campaignId}/fund`)
      .set('Authorization', user.auth)
      .send({ currencyId, credits });
  }

  beforeEach(async () => {
    user = await createUser();
    campaignCurrencyId = (await currencyByCode('CAMPAIGN_CREDITS')).id;
    reportCurrencyId = (await currencyByCode('REPORT_CREDITS')).id;
    discoveryCurrencyId = (await currencyByCode('DISCOVERY_CREDITS')).id;
  });

  /**
   * The required test. Two requests that individually fit but together do not.
   */
  it('cannot be made to over-spend by concurrent funding requests', async () => {
    await buyAndPay(user, campaignCurrencyId, 100, 'overspend');
    expect(await balanceOf(user.walletId, campaignCurrencyId)).toBe(100);

    const first = await createCampaign('Race A');
    const second = await createCampaign('Race B');

    // 60 + 60 = 120 against a balance of 100. Exactly one must win.
    const responses = await Promise.all([
      fund(first, campaignCurrencyId, 60),
      fund(second, campaignCurrencyId, 60),
    ]);

    const succeeded = responses.filter((r) => r.status === 200);
    const rejected = responses.filter((r) => r.status === 422);

    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.body.error.code).toBe('INSUFFICIENT_CREDITS');

    expect(await balanceOf(user.walletId, campaignCurrencyId)).toBe(40);
    expect(await ledgerSum(user.walletId, campaignCurrencyId)).toBe(40);
    await expectLedgerToBalance();
  });

  it('holds under heavier contention', async () => {
    await buyAndPay(user, campaignCurrencyId, 100, 'contention');

    // Ten campaigns wanting 30 each: 300 requested, 100 available.
    const campaignIds = await Promise.all(
      Array.from({ length: 10 }, (_unused, index) => createCampaign(`Campaign ${index}`)),
    );

    const responses = await Promise.all(
      campaignIds.map((id) => fund(id, campaignCurrencyId, 30)),
    );

    const succeeded = responses.filter((r) => r.status === 200);

    // Three fit into 100; the rest must be refused.
    expect(succeeded).toHaveLength(3);
    expect(await balanceOf(user.walletId, campaignCurrencyId)).toBe(10);
    expect(await ledgerSum(user.walletId, campaignCurrencyId)).toBe(10);
    await expectLedgerToBalance();
  });

  it('never drives a balance negative and leaves nothing behind when refused', async () => {
    await buyAndPay(user, campaignCurrencyId, 50, 'insufficient');
    const campaignId = await createCampaign('Too expensive');

    const response = await fund(campaignId, campaignCurrencyId, 51).expect(422);
    expect(response.body.error.code).toBe('INSUFFICIENT_CREDITS');

    expect(await balanceOf(user.walletId, campaignCurrencyId)).toBe(50);
    // The grant is the only ledger row: the refused spend wrote nothing.
    expect(await LedgerEntry.count({ where: { walletId: user.walletId } })).toBe(1);
    expect((await Campaign.findByPk(campaignId))?.status).toBe('DRAFT');
  });

  describe('currency isolation', () => {
    it.each([
      ['Report Credits', 'REPORT_CREDITS'],
      ['Discovery Credits', 'DISCOVERY_CREDITS'],
    ])('refuses to fund a campaign with %s', async (_label, code) => {
      await buyAndPay(user, campaignCurrencyId, 100, `iso-${code}`);

      const otherCurrencyId = code === 'REPORT_CREDITS' ? reportCurrencyId : discoveryCurrencyId;
      // Fund the other currency too, so the refusal is about the module binding
      // and not about an empty balance.
      await buyAndPay(user, otherCurrencyId, 100, `iso-fund-${code}`);

      const campaignId = await createCampaign('Wrong currency');
      const response = await fund(campaignId, otherCurrencyId, 10).expect(422);

      expect(response.body.error.code).toBe('CURRENCY_NOT_ALLOWED_FOR_MODULE');

      // Both balances untouched, and the campaign is still a draft.
      expect(await balanceOf(user.walletId, campaignCurrencyId)).toBe(100);
      expect(await balanceOf(user.walletId, otherCurrencyId)).toBe(100);
      expect((await Campaign.findByPk(campaignId))?.status).toBe('DRAFT');
      await expectLedgerToBalance();
    });
  });

  describe('funded at most once', () => {
    it('refuses a second funding of the same campaign', async () => {
      await buyAndPay(user, campaignCurrencyId, 500, 'twice');
      const campaignId = await createCampaign('Fund me once');

      await fund(campaignId, campaignCurrencyId, 100).expect(200);
      const second = await fund(campaignId, campaignCurrencyId, 100).expect(409);

      expect(second.body.error.code).toBe('CAMPAIGN_ALREADY_FUNDED');
      expect(await balanceOf(user.walletId, campaignCurrencyId)).toBe(400);
      expect(await LedgerEntry.count({ where: { referenceType: 'CAMPAIGN' } })).toBe(1);
    });

    it('funds once when five requests for the same campaign arrive together', async () => {
      await buyAndPay(user, campaignCurrencyId, 500, 'race');
      const campaignId = await createCampaign('Contended');

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => fund(campaignId, campaignCurrencyId, 100)),
      );

      expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
      expect(responses.filter((r) => r.status === 409)).toHaveLength(4);

      expect(await balanceOf(user.walletId, campaignCurrencyId)).toBe(400);
      expect(await LedgerEntry.count({ where: { referenceType: 'CAMPAIGN' } })).toBe(1);
      await expectLedgerToBalance();
    });
  });

  it('records the campaign against its ledger entry and its own currency', async () => {
    await buyAndPay(user, campaignCurrencyId, 300, 'link');
    const campaignId = await createCampaign('Summer launch');

    const response = await fund(campaignId, campaignCurrencyId, 120).expect(200);
    const campaign = response.body.campaign;

    expect(campaign.status).toBe('FUNDED');
    expect(campaign.currency.code).toBe('CAMPAIGN_CREDITS');
    expect(campaign.fundedCredits).toBe(120);
    expect(campaign.ledgerEntryId).toEqual(expect.any(Number));

    const entry = await LedgerEntry.findByPk(campaign.ledgerEntryId as number);
    expect(entry?.amount).toBe(-120);
    expect(entry?.idempotencyKey).toBe(`campaign_funding:${campaignId}`);
  });

  it('will not let one user fund another user’s campaign', async () => {
    await buyAndPay(user, campaignCurrencyId, 100, 'owner');
    const campaignId = await createCampaign('Private');

    const outsider = await createUser();
    const response = await request(app)
      .post(`/api/campaigns/${campaignId}/fund`)
      .set('Authorization', outsider.auth)
      .send({ currencyId: campaignCurrencyId, credits: 10 })
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(await balanceOf(user.walletId, campaignCurrencyId)).toBe(100);
  });
});
