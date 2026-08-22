import type { Transaction } from 'sequelize';
import { Currency, LedgerEntry, PlatformModule, Wallet, WalletBalance } from '../../db/models';
import { AppError } from '../../lib/errors';

/**
 * Creates a user's wallet and one zeroed balance row per active currency.
 *
 * The balance rows are created up front rather than on first use, and that is a
 * concurrency decision rather than a convenience. Every spend begins by taking
 * SELECT ... FOR UPDATE on the wallet_balances row for that currency. If the row
 * had to be created on demand, two concurrent spends would race to insert it and
 * the lock would be a gap lock on an absent row instead of a row lock on a
 * present one. Guaranteeing the row exists from signup makes the lock target
 * always concrete.
 *
 * Must be called inside the same transaction that creates the user, so a user
 * can never exist without a wallet.
 */
export async function provisionWallet(userId: number, transaction: Transaction): Promise<Wallet> {
  const wallet = await Wallet.create({ userId }, { transaction });

  const currencies = await Currency.findAll({
    where: { isActive: true },
    attributes: ['id'],
    transaction,
  });

  if (currencies.length > 0) {
    await WalletBalance.bulkCreate(
      currencies.map((currency) => ({ walletId: wallet.id, currencyId: currency.id, balance: 0 })),
      { transaction },
    );
  }

  return wallet;
}

/**
 * Balance row for a wallet and currency, creating it if a currency was added to
 * the platform after this wallet was provisioned.
 *
 * findOrCreate leans on uq_wallet_balances_wallet_currency, so two callers
 * racing to create the same row end with one row, not two.
 */
export async function ensureBalanceRow(
  walletId: number,
  currencyId: number,
  transaction: Transaction,
): Promise<WalletBalance> {
  const [balance] = await WalletBalance.findOrCreate({
    where: { walletId, currencyId },
    defaults: { walletId, currencyId, balance: 0 },
    transaction,
  });

  return balance;
}

export async function getWalletForUser(userId: number): Promise<Wallet> {
  const wallet = await Wallet.findOne({ where: { userId } });

  if (!wallet) {
    // Unreachable while signup provisions in-transaction; treated as a fault
    // rather than silently repaired, so the invariant stays visible.
    throw AppError.notFound('Wallet');
  }

  return wallet;
}

/**
 * Per-currency balances for a user's wallet.
 *
 * Every active currency is returned, including ones the user has never topped
 * up, so the wallet screen always shows all three pots rather than only the
 * funded ones.
 */
export async function getWalletSummary(userId: number): Promise<{
  walletId: number;
  balances: { currency: Currency; balance: number }[];
}> {
  const wallet = await getWalletForUser(userId);

  const currencies = await Currency.findAll({
    where: { isActive: true },
    include: [{ model: PlatformModule, as: 'module' }],
    order: [['id', 'ASC']],
  });

  const rows = await WalletBalance.findAll({ where: { walletId: wallet.id } });
  const balanceByCurrency = new Map(rows.map((row) => [row.currencyId, row.balance]));

  return {
    walletId: wallet.id,
    balances: currencies.map((currency) => ({
      currency,
      balance: balanceByCurrency.get(currency.id) ?? 0,
    })),
  };
}

export interface LedgerQuery {
  currencyId?: number;
  page: number;
  pageSize: number;
}

/** Ledger history, newest first, optionally narrowed to one currency. */
export async function getLedgerPage(
  userId: number,
  query: LedgerQuery,
): Promise<{ entries: LedgerEntry[]; page: number; pageSize: number; total: number }> {
  const wallet = await getWalletForUser(userId);

  const where: { walletId: number; currencyId?: number } = { walletId: wallet.id };
  if (query.currencyId !== undefined) {
    where.currencyId = query.currencyId;
  }

  const { rows, count } = await LedgerEntry.findAndCountAll({
    where,
    include: [{ model: Currency, as: 'currency' }],
    order: [['id', 'DESC']],
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
  });

  return { entries: rows, page: query.page, pageSize: query.pageSize, total: count };
}
