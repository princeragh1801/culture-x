import type { Transaction } from 'sequelize';
import { Currency, Wallet, WalletBalance } from '../../db/models';
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
