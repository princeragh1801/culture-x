import { CurrencyPlan, type Currency } from '../../db/models';
import { AppError } from '../../lib/errors';
import type { CreatePurchaseInput } from './credits.schemas';

export interface Quote {
  credits: number;
  /** The currency's list price per credit, snapshotted at purchase time. */
  unitPricePaise: number;
  /** What the customer is actually charged. */
  amountPaise: number;
  planId: number | null;
  planName: string | null;
}

/**
 * Turns a request into an amount, using only database rows.
 *
 * A bundle carries its own price rather than a derived one, because bundles are
 * deliberately cheaper than the per-credit rate: 1,000 Campaign Credits is
 * Rs 2,700, not Rs 3,000. Per-credit purchases multiply the list price instead.
 *
 * Everything is integer paise, so no rounding decision is ever made here.
 */
export async function quotePurchase(currency: Currency, input: CreatePurchaseInput): Promise<Quote> {
  if (input.planId !== undefined) {
    const plan = await CurrencyPlan.findByPk(input.planId);

    if (!plan || plan.currencyId !== currency.id) {
      throw AppError.notFound('Plan for this currency');
    }

    if (!plan.isActive) {
      throw AppError.validation(`The "${plan.name}" plan is no longer available.`);
    }

    return {
      credits: plan.credits,
      unitPricePaise: currency.pricePerCreditPaise,
      amountPaise: plan.pricePaise,
      planId: plan.id,
      planName: plan.name,
    };
  }

  const quantity = input.quantity as number;
  const amountPaise = quantity * currency.pricePerCreditPaise;

  // amount_paise is INT UNSIGNED. The quantity cap in the schema keeps this
  // unreachable; it is checked anyway so an overflow can never be written.
  if (!Number.isSafeInteger(amountPaise) || amountPaise > 4_294_967_295) {
    throw AppError.validation('That quantity is too large to purchase in one payment.');
  }

  return {
    credits: quantity,
    unitPricePaise: currency.pricePerCreditPaise,
    amountPaise,
    planId: null,
    planName: null,
  };
}
