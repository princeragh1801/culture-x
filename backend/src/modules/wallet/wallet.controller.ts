import type { Request, Response } from 'express';
import type { LedgerEntry } from '../../db/models';
import { requireAuthContext } from '../../middleware/require-auth';
import { validatedQuery } from '../../middleware/validate';
import { serialiseCurrency } from '../currencies/currency.service';
import type { LedgerQueryInput } from './wallet.schemas';
import { getLedgerPage, getWalletSummary } from './wallet.service';

function serialiseEntry(entry: LedgerEntry): Record<string, unknown> {
  return {
    id: entry.id,
    currency: entry.currency ? { id: entry.currency.id, code: entry.currency.code, name: entry.currency.name } : null,
    entryType: entry.entryType,
    // Signed: positive is a purchase, negative is a spend. The wallet screen
    // renders the sign directly rather than inferring direction from the type.
    amount: entry.amount,
    balanceAfter: entry.balanceAfter,
    referenceType: entry.referenceType,
    referenceId: entry.referenceId,
    description: entry.description,
    createdAt: entry.createdAt,
  };
}

export async function getWalletHandler(req: Request, res: Response): Promise<void> {
  const { userId } = requireAuthContext(req);
  const summary = await getWalletSummary(userId);

  res.json({
    walletId: summary.walletId,
    balances: summary.balances.map((item) => ({
      currency: serialiseCurrency(item.currency),
      balance: item.balance,
    })),
  });
}

export async function getLedgerHandler(req: Request, res: Response): Promise<void> {
  const { userId } = requireAuthContext(req);
  const query = validatedQuery<LedgerQueryInput>(res);

  const result = await getLedgerPage(userId, {
    ...(query.currencyId !== undefined ? { currencyId: query.currencyId } : {}),
    page: query.page,
    pageSize: query.pageSize,
  });

  res.json({
    entries: result.entries.map(serialiseEntry),
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
  });
}
