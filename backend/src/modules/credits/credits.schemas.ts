import { z } from 'zod';

/**
 * Buy by plan or by quantity, never both and never neither.
 *
 * Note what the client cannot send: an amount. The price is always recomputed
 * server-side from the currency and plan rows, so a tampered request can only
 * ask for a different quantity, never for a different price.
 */
export const createPurchaseSchema = z
  .object({
    currencyId: z.number().int().positive(),
    planId: z.number().int().positive().optional(),
    quantity: z.number().int().min(1).max(100_000).optional(),
  })
  .refine((value) => (value.planId === undefined) !== (value.quantity === undefined), {
    message: 'Provide exactly one of planId or quantity.',
    path: ['planId'],
  });

export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
