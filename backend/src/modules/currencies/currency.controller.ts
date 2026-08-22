import type { Request, Response } from 'express';
import { listCurrencies, serialiseCurrency } from './currency.service';

/**
 * The buy-credits screen reads prices from here rather than hardcoding them, so
 * a price change is a database change.
 */
export async function listCurrenciesHandler(_req: Request, res: Response): Promise<void> {
  const currencies = await listCurrencies();
  res.json({ currencies: currencies.map(serialiseCurrency) });
}
