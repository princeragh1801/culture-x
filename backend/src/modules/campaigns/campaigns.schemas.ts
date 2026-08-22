import { z } from 'zod';

export const createCampaignSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(191),
});

/**
 * currencyId is required rather than inferred.
 *
 * The server knows perfectly well that campaigns take Campaign Credits, so it
 * could fill this in. Making the client state it is what turns "spend the wrong
 * currency" into a request the API can actually receive — and reject with
 * CURRENCY_NOT_ALLOWED_FOR_MODULE. An inferred currency would make the rule
 * untestable from outside.
 */
export const fundCampaignSchema = z.object({
  currencyId: z.number().int().positive(),
  credits: z.number().int().min(1).max(10_000_000),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type FundCampaignInput = z.infer<typeof fundCampaignSchema>;
