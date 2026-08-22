/**
 * Codes the application looks up by, matching the rows inserted by the seeder.
 *
 * Business logic resolves a currency through its module code rather than naming
 * a currency directly, so a module never has a currency hardcoded into it.
 */
export const MODULE_CODES = {
  CAMPAIGNS: 'campaigns',
  REPORTS: 'reports',
  DISCOVERY: 'discovery',
} as const;

export type ModuleCode = (typeof MODULE_CODES)[keyof typeof MODULE_CODES];

/** Builders for the unique keys that make credit movements exactly-once. */
export const idempotencyKeys = {
  /** One grant per Stripe payment, whichever event id reports it. */
  purchase: (paymentReference: string): string => `purchase:${paymentReference}`,
  /** One spend per campaign, however many times funding is retried. */
  campaignFunding: (campaignId: number): string => `campaign_funding:${campaignId}`,
} as const;
