import { Transaction } from 'sequelize';
import { Campaign, Currency, LedgerEntry, PlatformModule, sequelize } from '../../db/models';
import { MODULE_CODES, idempotencyKeys } from '../../lib/constants';
import { AppError } from '../../lib/errors';
import { assertCurrencySpendableInModule } from '../currencies/currency.service';
import { debitWallet } from '../wallet/ledger.service';
import { getWalletForUser } from '../wallet/wallet.service';
import type { CreateCampaignInput, FundCampaignInput } from './campaigns.schemas';

const CAMPAIGN_INCLUDES = [
  { model: Currency, as: 'currency' },
  { model: LedgerEntry, as: 'ledgerEntry' },
];

async function getCampaignsModuleId(): Promise<number> {
  const module = await PlatformModule.findOne({ where: { code: MODULE_CODES.CAMPAIGNS } });

  if (!module) {
    throw AppError.notFound('Campaigns module');
  }

  return module.id;
}

export async function createCampaign(
  userId: number,
  input: CreateCampaignInput,
): Promise<Campaign> {
  // Stored, not assumed. module_id is half of the composite foreign key that
  // pins a funded campaign to its own module's currency.
  const moduleId = await getCampaignsModuleId();

  const campaign = await Campaign.create({
    userId,
    moduleId,
    name: input.name,
    status: 'DRAFT',
  });

  return campaign;
}

export async function listCampaigns(userId: number): Promise<Campaign[]> {
  return Campaign.findAll({
    where: { userId },
    include: CAMPAIGN_INCLUDES,
    order: [['id', 'DESC']],
  });
}

export async function getCampaignForUser(userId: number, campaignId: number): Promise<Campaign> {
  const campaign = await Campaign.findOne({
    where: { id: campaignId, userId },
    include: CAMPAIGN_INCLUDES,
  });

  if (!campaign) {
    // Scoped to the owner, so another user's campaign is indistinguishable from
    // one that does not exist.
    throw AppError.notFound('Campaign');
  }

  return campaign;
}

/**
 * Spends credits on a campaign. At most once, in the right currency, never below zero.
 *
 * Lock order inside the transaction is campaign row, then wallet balance row —
 * and it is the same order everywhere, which is what keeps this deadlock-free.
 * The webhook's grant path only ever takes the balance lock, so there is no
 * cycle between the two.
 *
 * Taking the campaign lock first is what makes concurrent funding of the *same*
 * campaign resolve cleanly: the second request waits, then sees FUNDED and gets
 * a 409, instead of racing into the ledger and colliding on the idempotency key.
 */
export async function fundCampaign(
  userId: number,
  campaignId: number,
  input: FundCampaignInput,
): Promise<Campaign> {
  // Rejected before any lock is taken, so a wrong-currency request never
  // contends with real traffic. The composite foreign key on campaigns is the
  // backstop if this check is ever bypassed.
  const currency = await assertCurrencySpendableInModule(
    input.currencyId,
    MODULE_CODES.CAMPAIGNS,
  );

  const wallet = await getWalletForUser(userId);

  await sequelize.transaction(async (transaction) => {
    const campaign = await Campaign.findOne({
      where: { id: campaignId, userId },
      lock: Transaction.LOCK.UPDATE,
      transaction,
    });

    if (!campaign) {
      throw AppError.notFound('Campaign');
    }

    if (campaign.status !== 'DRAFT') {
      throw new AppError(
        'CAMPAIGN_ALREADY_FUNDED',
        409,
        `Campaign "${campaign.name}" has already been funded.`,
      );
    }

    const ledger = await debitWallet(
      {
        walletId: wallet.id,
        currencyId: currency.id,
        credits: input.credits,
        // One key per campaign, so funding is at most once no matter how many
        // times the request is retried.
        idempotencyKey: idempotencyKeys.campaignFunding(campaign.id),
        referenceType: 'CAMPAIGN',
        referenceId: campaign.id,
        description: `Funded campaign "${campaign.name}"`,
      },
      transaction,
    );

    if (ledger.alreadyApplied) {
      // The campaign row said DRAFT but the ledger already holds this spend.
      // Rolling back is the only safe answer.
      throw new AppError(
        'CAMPAIGN_ALREADY_FUNDED',
        409,
        `Campaign "${campaign.name}" has already been funded.`,
      );
    }

    const [affectedRows] = await Campaign.update(
      {
        status: 'FUNDED',
        currencyId: currency.id,
        fundedCredits: input.credits,
        fundedAt: new Date(),
        ledgerEntryId: ledger.entry.id,
      },
      { where: { id: campaign.id, status: 'DRAFT' }, transaction },
    );

    if (affectedRows !== 1) {
      // Unreachable while the row lock is held; if it fires, the campaign moved
      // underneath us and the spend must not stand.
      throw new AppError('CAMPAIGN_ALREADY_FUNDED', 409, 'Campaign was funded concurrently.');
    }
  });

  return getCampaignForUser(userId, campaignId);
}

export function serialiseCampaign(campaign: Campaign): Record<string, unknown> {
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    currency: campaign.currency
      ? { id: campaign.currency.id, code: campaign.currency.code, name: campaign.currency.name }
      : null,
    fundedCredits: campaign.fundedCredits,
    fundedAt: campaign.fundedAt,
    ledgerEntryId: campaign.ledgerEntryId,
    createdAt: campaign.createdAt,
  };
}
