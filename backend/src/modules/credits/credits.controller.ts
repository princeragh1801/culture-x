import type { Request, Response } from 'express';
import { requireAuthContext } from '../../middleware/require-auth';
import type { CreatePurchaseInput } from './credits.schemas';
import {
  createPurchase,
  getPurchaseForUser,
  listPurchasesForUser,
  serialisePurchase,
} from './credits.service';

/** Optional client-supplied key, so a retried POST reuses its purchase. */
function readIdempotencyKey(req: Request): string | null {
  const header = req.header('Idempotency-Key');
  if (!header) return null;

  const trimmed = header.trim();
  return trimmed.length > 0 && trimmed.length <= 191 ? trimmed : null;
}

export async function createPurchaseHandler(req: Request, res: Response): Promise<void> {
  const { userId } = requireAuthContext(req);

  const result = await createPurchase(
    userId,
    req.body as CreatePurchaseInput,
    readIdempotencyKey(req),
  );

  res.status(result.reused ? 200 : 201).json({
    purchase: serialisePurchase(result.purchase),
    checkoutUrl: result.checkoutUrl,
  });
}

export async function getPurchaseHandler(req: Request, res: Response): Promise<void> {
  const { userId } = requireAuthContext(req);
  const purchase = await getPurchaseForUser(userId, Number(req.params.id));
  res.json({ purchase: serialisePurchase(purchase) });
}

export async function listPurchasesHandler(req: Request, res: Response): Promise<void> {
  const { userId } = requireAuthContext(req);
  const purchases = await listPurchasesForUser(userId);
  res.json({ purchases: purchases.map(serialisePurchase) });
}
