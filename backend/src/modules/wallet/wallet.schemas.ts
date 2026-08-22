import { z } from 'zod';

export const ledgerQuerySchema = z.object({
  currencyId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type LedgerQueryInput = z.infer<typeof ledgerQuerySchema>;
