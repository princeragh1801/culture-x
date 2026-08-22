import { Op, Transaction, UniqueConstraintError, literal } from 'sequelize';
import { LedgerEntry, WalletBalance } from '../../db/models';
import type { LedgerReferenceType } from '../../db/models';
import { AppError } from '../../lib/errors';
import { ensureBalanceRow } from './wallet.service';

/**
 * The only two ways credits ever move.
 *
 * Both take a caller-supplied transaction rather than opening their own, so the
 * credit movement and whatever caused it — marking a purchase PAID, marking a
 * campaign FUNDED — commit or roll back together. There is no window in which
 * the ledger and the thing it refers to disagree.
 *
 * Both are keyed by an idempotencyKey backed by a unique index. Calling either
 * twice with the same key applies the movement once and reports
 * alreadyApplied: true the second time. The caller decides what that means:
 * a replayed webhook is a success, a second attempt to fund the same campaign
 * is a 409.
 */

export interface CreditMovement {
  walletId: number;
  currencyId: number;
  /** Whole credits, always positive. Direction comes from the function called. */
  credits: number;
  idempotencyKey: string;
  referenceType: LedgerReferenceType;
  referenceId: number;
  description?: string;
}

export interface LedgerResult {
  entry: LedgerEntry;
  balanceAfter: number;
  /** True when this key had already been applied and nothing changed now. */
  alreadyApplied: boolean;
}

function assertWholePositive(credits: number): void {
  // Credits are integers by definition. This also makes the arithmetic below
  // safe to inline into SQL.
  if (!Number.isSafeInteger(credits) || credits <= 0) {
    throw AppError.validation('Credits must be a positive whole number.');
  }
}

/**
 * Takes SELECT ... FOR UPDATE on the balance row.
 *
 * This is the serialisation point for a wallet and currency: two concurrent
 * spends for the same user queue here rather than both reading the same balance
 * and both deciding they can afford it. Two spends against *different*
 * currencies do not contend, since they are different rows.
 */
async function lockBalanceRow(
  walletId: number,
  currencyId: number,
  transaction: Transaction,
): Promise<WalletBalance> {
  const locked = await WalletBalance.findOne({
    where: { walletId, currencyId },
    lock: Transaction.LOCK.UPDATE,
    transaction,
  });

  if (locked) return locked;

  // Only reachable for a currency added after this wallet was provisioned.
  await ensureBalanceRow(walletId, currencyId, transaction);

  const created = await WalletBalance.findOne({
    where: { walletId, currencyId },
    lock: Transaction.LOCK.UPDATE,
    transaction,
  });

  if (!created) {
    throw new AppError('INTERNAL_ERROR', 500, 'Could not lock the wallet balance.');
  }

  return created;
}

async function findByIdempotencyKey(
  idempotencyKey: string,
  transaction: Transaction,
): Promise<LedgerEntry | null> {
  return LedgerEntry.findOne({ where: { idempotencyKey }, transaction });
}

/**
 * An idempotency key is globally unique, and by construction it encodes exactly
 * one movement: purchase:<payment_intent> or campaign_funding:<campaign_id>.
 *
 * So finding an existing entry under this key means "this exact movement already
 * happened" — unless the entry describes a different wallet, currency or amount,
 * in which case two unrelated movements have collided on one key. That is a bug
 * in whoever built the key, and reporting it as a successful no-op would quietly
 * skip a real credit movement. Fail loudly instead.
 */
function assertSameMovement(
  existing: LedgerEntry,
  movement: CreditMovement,
  expectedAmount: number,
): void {
  const matches =
    existing.walletId === movement.walletId &&
    existing.currencyId === movement.currencyId &&
    existing.amount === expectedAmount;

  if (!matches) {
    throw new AppError(
      'INTERNAL_ERROR',
      500,
      `Idempotency key "${movement.idempotencyKey}" already describes a different credit movement.`,
    );
  }
}

/**
 * Adds credits. Used only by the Stripe webhook, after a payment is confirmed.
 */
export async function creditWallet(
  movement: CreditMovement,
  transaction: Transaction,
): Promise<LedgerResult> {
  assertWholePositive(movement.credits);

  const balanceRow = await lockBalanceRow(movement.walletId, movement.currencyId, transaction);

  // Checked while holding the row lock, so a concurrent redelivery of the same
  // payment waits here and then sees the entry that the first one wrote.
  const existing = await findByIdempotencyKey(movement.idempotencyKey, transaction);
  if (existing) {
    assertSameMovement(existing, movement, movement.credits);
    return { entry: existing, balanceAfter: balanceRow.balance, alreadyApplied: true };
  }

  const balanceAfter = balanceRow.balance + movement.credits;

  let entry: LedgerEntry;
  try {
    entry = await LedgerEntry.create(
      {
        walletId: movement.walletId,
        currencyId: movement.currencyId,
        entryType: 'PURCHASE',
        amount: movement.credits,
        balanceAfter,
        referenceType: movement.referenceType,
        referenceId: movement.referenceId,
        idempotencyKey: movement.idempotencyKey,
        description: movement.description ?? null,
      },
      { transaction },
    );
  } catch (error) {
    // The unique index caught a duplicate the row lock did not — a caller that
    // reached here without locking, or the same payment arriving under two
    // event ids in separate transactions. Either way the grant already exists.
    if (error instanceof UniqueConstraintError) {
      const winner = await findByIdempotencyKey(movement.idempotencyKey, transaction);
      if (winner) {
        assertSameMovement(winner, movement, movement.credits);
        return { entry: winner, balanceAfter: balanceRow.balance, alreadyApplied: true };
      }
    }
    throw error;
  }

  await WalletBalance.update(
    { balance: literal(`balance + ${movement.credits}`) as unknown as number },
    { where: { id: balanceRow.id }, transaction },
  );

  return { entry, balanceAfter, alreadyApplied: false };
}

/**
 * Removes credits, and refuses to let a balance go negative.
 *
 * Three independent guards, deliberately overlapping:
 *   1. the row lock above, so concurrent spends are serialised;
 *   2. the balance check here, which produces the readable 422;
 *   3. "WHERE balance >= :credits" on the update, so a caller that somehow
 *      skipped the lock still cannot over-spend.
 * And underneath all three, BIGINT UNSIGNED with strict mode turns an underflow
 * into a database error rather than a negative row.
 */
export async function debitWallet(
  movement: CreditMovement,
  transaction: Transaction,
): Promise<LedgerResult> {
  assertWholePositive(movement.credits);

  const balanceRow = await lockBalanceRow(movement.walletId, movement.currencyId, transaction);

  const existing = await findByIdempotencyKey(movement.idempotencyKey, transaction);
  if (existing) {
    assertSameMovement(existing, movement, -movement.credits);
    return { entry: existing, balanceAfter: balanceRow.balance, alreadyApplied: true };
  }

  if (balanceRow.balance < movement.credits) {
    throw new AppError(
      'INSUFFICIENT_CREDITS',
      422,
      `Not enough credits: ${balanceRow.balance} available, ${movement.credits} required.`,
    );
  }

  const balanceAfter = balanceRow.balance - movement.credits;

  const entry = await LedgerEntry.create(
    {
      walletId: movement.walletId,
      currencyId: movement.currencyId,
      entryType: 'CAMPAIGN_FUNDING',
      amount: -movement.credits,
      balanceAfter,
      referenceType: movement.referenceType,
      referenceId: movement.referenceId,
      idempotencyKey: movement.idempotencyKey,
      description: movement.description ?? null,
    },
    { transaction },
  );

  const [affectedRows] = await WalletBalance.update(
    { balance: literal(`balance - ${movement.credits}`) as unknown as number },
    {
      where: { id: balanceRow.id, balance: { [Op.gte]: movement.credits } },
      transaction,
    },
  );

  if (affectedRows !== 1) {
    // Unreachable while the lock is held. If it ever fires, the balance moved
    // underneath us and rolling back is the only correct answer.
    throw new AppError('INSUFFICIENT_CREDITS', 422, 'Balance changed during the spend.');
  }

  return { entry, balanceAfter, alreadyApplied: false };
}
