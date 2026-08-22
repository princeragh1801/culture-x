import { UniqueConstraintError } from 'sequelize';
import type Stripe from 'stripe';
import { env } from '../../config/env';
import { CreditPurchase, Currency, CurrencyPlan } from '../../db/models';
import { AppError } from '../../lib/errors';
import { getStripe } from '../../lib/stripe';
import { getCurrencyById } from '../currencies/currency.service';
import { getWalletForUser } from '../wallet/wallet.service';
import type { CreatePurchaseInput } from './credits.schemas';
import { quotePurchase } from './pricing';

export interface CreatePurchaseResult {
  purchase: CreditPurchase;
  checkoutUrl: string;
  /** True when an Idempotency-Key matched an existing purchase. */
  reused: boolean;
}

/**
 * Starts a credit purchase.
 *
 * The order of operations is the point:
 *
 *   1. price the request from database rows — never from the client;
 *   2. write the purchase as PENDING, before Stripe knows anything about it;
 *   3. create the Checkout Session, outside the transaction;
 *   4. store the session id and URL back on the purchase.
 *
 * Writing the row first is what makes the webhook robust. The session carries
 * purchase_id in its metadata, so even if step 4 never happens — the process
 * dies, the network drops — a webhook arriving later still finds its purchase.
 * The reverse order would leave a paid session with no row to attach it to.
 *
 * Step 3 is outside the transaction deliberately: holding a database
 * transaction open across a network call to Stripe would pin a connection and a
 * row lock for the duration of somebody else's outage.
 */
export async function createPurchase(
  userId: number,
  input: CreatePurchaseInput,
  requestIdempotencyKey: string | null,
): Promise<CreatePurchaseResult> {
  if (requestIdempotencyKey) {
    const existing = await findByRequestKey(userId, requestIdempotencyKey);
    if (existing) {
      return { purchase: existing, checkoutUrl: existing.stripeCheckoutUrl ?? '', reused: true };
    }
  }

  // Checked before anything is written. Without this, a server missing its
  // Stripe key would leave a PENDING purchase behind on every attempt.
  getStripe();

  const currency = await getCurrencyById(input.currencyId);
  const quote = await quotePurchase(currency, input);
  const wallet = await getWalletForUser(userId);

  let purchase: CreditPurchase;
  try {
    purchase = await CreditPurchase.create({
      userId,
      walletId: wallet.id,
      currencyId: currency.id,
      planId: quote.planId,
      credits: quote.credits,
      unitPricePaise: quote.unitPricePaise,
      amountPaise: quote.amountPaise,
      status: 'PENDING',
      requestIdempotencyKey,
    });
  } catch (error) {
    // Two retries of the same request arrived at once; the loser reuses the
    // purchase the winner created.
    if (error instanceof UniqueConstraintError && requestIdempotencyKey) {
      const winner = await findByRequestKey(userId, requestIdempotencyKey);
      if (winner) {
        return { purchase: winner, checkoutUrl: winner.stripeCheckoutUrl ?? '', reused: true };
      }
    }
    throw error;
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await createCheckoutSession(purchase, currency, quote.planName);
  } catch (error) {
    // The purchase never became payable, so record that rather than leaving a
    // PENDING row nothing will ever resolve.
    //
    // FAILED here is local bookkeeping, not a verdict on the payment. If Stripe
    // did create the session and only the response was lost, that session can
    // still be paid — so the webhook treats a verified payment as the truth and
    // grants regardless of the status stored here. Exactly-once still holds,
    // because every grant goes through the unique ledger idempotency key.
    await purchase.update({ status: 'FAILED' });
    throw error;
  }

  if (!session.url) {
    await purchase.update({ status: 'FAILED' });
    throw new AppError('INTERNAL_ERROR', 502, 'Stripe did not return a checkout URL.');
  }

  await purchase.update({
    stripeCheckoutSessionId: session.id,
    stripeCheckoutUrl: session.url,
  });

  // Reloaded with its associations so the response carries the same shape as
  // every other purchase read.
  const withAssociations = await getPurchaseForUser(userId, purchase.id);

  return { purchase: withAssociations, checkoutUrl: session.url, reused: false };
}

async function findByRequestKey(
  userId: number,
  requestIdempotencyKey: string,
): Promise<CreditPurchase | null> {
  return CreditPurchase.findOne({
    where: { userId, requestIdempotencyKey },
    include: [
      { model: Currency, as: 'currency' },
      { model: CurrencyPlan, as: 'plan' },
    ],
  });
}

function createCheckoutSession(
  purchase: CreditPurchase,
  currency: Currency,
  planName: string | null,
): Promise<Stripe.Checkout.Session> {
  const label = planName ?? `${purchase.credits} ${currency.name}`;

  return getStripe().checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: env.STRIPE_PAYMENT_CURRENCY,
            // Already the total in the smallest unit. Credit quantity is not
            // Stripe's line-item quantity: the whole purchase is one line.
            unit_amount: purchase.amountPaise,
            product_data: {
              name: label,
              description: `${purchase.credits} ${currency.name} for the CultureX wallet`,
            },
          },
        },
      ],
      // The return URL carries only the purchase id, never a grant signal — the
      // page polls the purchase and waits for the webhook.
      success_url: `${env.FRONTEND_URL}/checkout/return?purchaseId=${purchase.id}&outcome=success`,
      cancel_url: `${env.FRONTEND_URL}/checkout/return?purchaseId=${purchase.id}&outcome=cancelled`,
      client_reference_id: String(purchase.id),
      // The webhook resolves the purchase from here, which is why it still works
      // if the session id never gets written back.
      metadata: {
        purchase_id: String(purchase.id),
        user_id: String(purchase.userId),
        currency_id: String(purchase.currencyId),
        credits: String(purchase.credits),
      },
      payment_intent_data: {
        metadata: { purchase_id: String(purchase.id) },
      },
    },
    {
      // A retried create returns the original session rather than making a
      // second one, so one purchase can never have two payable sessions.
      idempotencyKey: `checkout:${purchase.id}`,
    },
  );
}

export async function getPurchaseForUser(
  userId: number,
  purchaseId: number,
): Promise<CreditPurchase> {
  const purchase = await CreditPurchase.findOne({
    where: { id: purchaseId, userId },
    include: [
      { model: Currency, as: 'currency' },
      { model: CurrencyPlan, as: 'plan' },
    ],
  });

  if (!purchase) {
    // Scoped to the user, so another user's purchase id is indistinguishable
    // from one that does not exist.
    throw AppError.notFound('Purchase');
  }

  return purchase;
}

export async function listPurchasesForUser(userId: number): Promise<CreditPurchase[]> {
  return CreditPurchase.findAll({
    where: { userId },
    include: [
      { model: Currency, as: 'currency' },
      { model: CurrencyPlan, as: 'plan' },
    ],
    order: [['id', 'DESC']],
    limit: 50,
  });
}

export function serialisePurchase(purchase: CreditPurchase): Record<string, unknown> {
  return {
    id: purchase.id,
    status: purchase.status,
    credits: purchase.credits,
    amountPaise: purchase.amountPaise,
    unitPricePaise: purchase.unitPricePaise,
    currency: purchase.currency
      ? { id: purchase.currency.id, code: purchase.currency.code, name: purchase.currency.name }
      : null,
    plan: purchase.plan ? { id: purchase.plan.id, code: purchase.plan.code, name: purchase.plan.name } : null,
    checkoutUrl: purchase.stripeCheckoutUrl,
    // Present only once the webhook has granted the credits, so the return page
    // can show "credits added" rather than guessing from the redirect.
    ledgerEntryId: purchase.ledgerEntryId,
    paidAt: purchase.paidAt,
    createdAt: purchase.createdAt,
  };
}
