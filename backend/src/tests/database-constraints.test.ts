import { QueryTypes, UniqueConstraintError } from 'sequelize';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  Campaign,
  LedgerEntry,
  PlatformModule,
  WalletBalance,
  sequelize,
  type LedgerEntryType,
  type LedgerReferenceType,
} from '../db/models';
import { createUser, currencyByCode, type TestUser } from './helpers';

/**
 * The guarantees, checked with the service layer removed.
 *
 * Everything here writes straight to the database, bypassing creditWallet,
 * debitWallet and fundCampaign entirely. If these pass, the acceptance criteria
 * do not depend on remembering to call the right function — they are properties
 * of the schema, and they survive whatever gets built on top of it next.
 */
/**
 * Runs the write and returns the error it was rejected with.
 *
 * Sequelize flattens a unique-index violation to the message "Validation
 * error", so the useful detail lives on the driver error underneath. These
 * tests assert on that, which lets each one name the exact constraint it
 * expects to be stopped by rather than just checking that something failed.
 */
async function captureRejection(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }

  throw new Error('Expected the write to be rejected, but it succeeded.');
}

function sqlMessageOf(error: unknown): string {
  const parent = (error as { parent?: { sqlMessage?: string }; message?: string }).parent;
  return parent?.sqlMessage ?? (error as { message?: string }).message ?? String(error);
}

describe('database-level guarantees', () => {
  let user: TestUser;
  let campaignCurrencyId: number;
  let reportCurrencyId: number;
  let campaignsModuleId: number;

  beforeEach(async () => {
    user = await createUser();
    campaignCurrencyId = (await currencyByCode('CAMPAIGN_CREDITS')).id;
    reportCurrencyId = (await currencyByCode('REPORT_CREDITS')).id;
    campaignsModuleId = (await PlatformModule.findOne({ where: { code: 'campaigns' } }))!.id;
  });

  interface LedgerEntryDraft {
    walletId: number;
    currencyId: number;
    entryType: LedgerEntryType;
    amount: number;
    balanceAfter: number;
    referenceType: LedgerReferenceType;
    referenceId: number;
    idempotencyKey: string;
  }

  /** Writes straight to the table, with no service in between. */
  function writeLedgerEntry(overrides: Partial<LedgerEntryDraft> = {}): Promise<LedgerEntry> {
    return LedgerEntry.create({
      walletId: user.walletId,
      currencyId: campaignCurrencyId,
      entryType: 'PURCHASE',
      amount: 100,
      balanceAfter: 100,
      referenceType: 'CREDIT_PURCHASE',
      referenceId: 1,
      idempotencyKey: 'purchase:pi_constraint_test',
      ...overrides,
    });
  }

  it('refuses a second ledger entry with the same idempotency key', async () => {
    await writeLedgerEntry();

    // The exactly-once guarantee, with no application code in the way.
    const error = await captureRejection(() => writeLedgerEntry({ referenceId: 2 }));

    expect(error).toBeInstanceOf(UniqueConstraintError);
    expect(sqlMessageOf(error)).toMatch(/uq_ledger_entries_idempotency_key/);

    expect(await LedgerEntry.count()).toBe(1);
  });

  it('refuses a balance update that would go below zero', async () => {
    const row = await WalletBalance.findOne({
      where: { walletId: user.walletId, currencyId: campaignCurrencyId },
    });

    // BIGINT UNSIGNED under STRICT_ALL_TABLES: an underflow is an error, not a
    // negative row and not a silent clamp to zero.
    await expect(
      sequelize.query('UPDATE wallet_balances SET balance = balance - 1 WHERE id = :id', {
        replacements: { id: row!.id },
        type: QueryTypes.UPDATE,
      }),
    ).rejects.toThrow(/out of range/i);

    await row!.reload();
    expect(row!.balance).toBe(0);
  });

  it('refuses a purchase entry that removes credits', async () => {
    await expect(
      writeLedgerEntry({ amount: -100, idempotencyKey: 'purchase:pi_wrong_sign' }),
    ).rejects.toThrow(/ck_ledger_entries_amount_sign|Check constraint/i);
  });

  it('refuses a campaign funded with another module’s currency', async () => {
    const campaign = await Campaign.create({
      userId: user.userId,
      moduleId: campaignsModuleId,
      name: 'Cross-module attempt',
    });

    // A perfectly valid Report Credits ledger entry, so every other constraint
    // is satisfied and the composite foreign key is the only thing left.
    const entry = await writeLedgerEntry({
      currencyId: reportCurrencyId,
      entryType: 'CAMPAIGN_FUNDING',
      amount: -10,
      balanceAfter: 0,
      referenceType: 'CAMPAIGN',
      referenceId: campaign.id,
      idempotencyKey: `campaign_funding:${campaign.id}`,
    });

    await expect(
      campaign.update({
        status: 'FUNDED',
        currencyId: reportCurrencyId,
        fundedCredits: 10,
        fundedAt: new Date(),
        ledgerEntryId: entry.id,
      }),
    ).rejects.toThrow(/fk_campaigns_currency_module|foreign key constraint/i);

    await campaign.reload();
    expect(campaign.status).toBe('DRAFT');
    expect(campaign.currencyId).toBeNull();
  });

  it('refuses a half-funded campaign', async () => {
    const campaign = await Campaign.create({
      userId: user.userId,
      moduleId: campaignsModuleId,
      name: 'Half funded',
    });

    // FUNDED without a currency, an amount or a ledger entry: a state the
    // funding service would never produce, and the schema will not store.
    await expect(campaign.update({ status: 'FUNDED' })).rejects.toThrow(
      /ck_campaigns_funding_consistent|Check constraint/i,
    );
  });

  it('refuses to point two campaigns at the same ledger entry', async () => {
    const first = await Campaign.create({
      userId: user.userId,
      moduleId: campaignsModuleId,
      name: 'First',
    });
    const second = await Campaign.create({
      userId: user.userId,
      moduleId: campaignsModuleId,
      name: 'Second',
    });

    const entry = await writeLedgerEntry({
      entryType: 'CAMPAIGN_FUNDING',
      amount: -10,
      balanceAfter: 0,
      referenceType: 'CAMPAIGN',
      referenceId: first.id,
      idempotencyKey: `campaign_funding:${first.id}`,
    });

    const funding = {
      status: 'FUNDED' as const,
      currencyId: campaignCurrencyId,
      fundedCredits: 10,
      fundedAt: new Date(),
      ledgerEntryId: entry.id,
    };

    await first.update(funding);

    const error = await captureRejection(() => second.update(funding));
    expect(error).toBeInstanceOf(UniqueConstraintError);
    expect(sqlMessageOf(error)).toMatch(/uq_campaigns_ledger_entry_id/);
  });

  it('refuses to bind a second currency to a module', async () => {
    // One currency per module is what makes "the currency my module may spend"
    // a question with a single answer.
    const error = await captureRejection(() =>
      sequelize.query(
        `INSERT INTO currencies (code, name, module_id, price_per_credit_paise)
         VALUES ('SECOND_CAMPAIGN_CREDITS', 'Second', :moduleId, 100)`,
        { replacements: { moduleId: campaignsModuleId }, type: QueryTypes.INSERT },
      ),
    );

    expect(sqlMessageOf(error)).toMatch(/uq_currencies_module_id/);
  });

  it('refuses to delete a wallet that has ledger history', async () => {
    await writeLedgerEntry();

    // A ledger is an audit record. RESTRICT means history cannot be erased by
    // deleting the thing it refers to.
    await expect(
      sequelize.query('DELETE FROM wallets WHERE id = :id', {
        replacements: { id: user.walletId },
        type: QueryTypes.DELETE,
      }),
    ).rejects.toThrow(/foreign key constraint/i);
  });
});
