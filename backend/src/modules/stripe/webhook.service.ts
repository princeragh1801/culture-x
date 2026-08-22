import type Stripe from 'stripe';
import { UniqueConstraintError } from 'sequelize';
import { CreditPurchase, sequelize, StripeWebhookEvent } from '../../db/models';
import { idempotencyKeys } from '../../lib/constants';
import { creditWallet } from '../wallet/ledger.service';

/**
 * Turning a verified Stripe event into credits.
 *
 * There are two independent layers of idempotency, and they guard different
 * things:
 *
 *   1. stripe_webhook_events.stripe_event_id is unique. A redelivery — Stripe's
 *      own retry, or `stripe events resend` — collides on insert and returns 200
 *      without doing any work. This layer is an optimisation.
 *
 *   2. ledger_entries.idempotency_key is unique, and the grant is keyed on the
 *      payment intent, not the event. This is the actual guarantee. Stripe can
 *      describe one payment through more than one event — checkout.session.completed
 *      and checkout.session.async_payment_succeeded both carry the same payment
 *      intent — and layer 1 would happily process both, because they are two
 *      different event ids. Layer 2 is what makes the second one a no-op.
 *
 * Nothing in here trusts the locally stored purchase status. A verified payment
 * is the truth; the status column is a hint that may be stale or wrong.
 */

const GRANTING_EVENTS = new Set<string>([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
]);

export interface WebhookOutcome {
  status: 'processed' | 'duplicate' | 'ignored';
  detail: string;
}

/**
 * Records the event, then handles it.
 *
 * Recording first means an event that later blows up mid-handling is still on
 * file, marked FAILED, rather than vanishing.
 */
export async function handleStripeEvent(event: Stripe.Event): Promise<WebhookOutcome> {
  let record: StripeWebhookEvent;

  try {
    record = await StripeWebhookEvent.create({
      stripeEventId: event.id,
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
      status: 'RECEIVED',
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      // Seen this exact event before. Whatever it was going to do, it already did.
      return { status: 'duplicate', detail: `Event ${event.id} was already received.` };
    }
    throw error;
  }

  try {
    const outcome = await dispatch(event);

    await record.update({
      status: outcome.status === 'ignored' ? 'IGNORED' : 'PROCESSED',
      processedAt: new Date(),
    });

    return outcome;
  } catch (error) {
    await record.update({
      status: 'FAILED',
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    // Rethrown so the route answers 5xx and Stripe retries. The event row stays
    // FAILED, and the retry arrives with the same event id — caught by layer 1
    // above, so a poison event cannot be retried into a double grant.
    throw error;
  }
}

async function dispatch(event: Stripe.Event): Promise<WebhookOutcome> {
  if (GRANTING_EVENTS.has(event.type)) {
    return grantForSession(event.data.object as Stripe.Checkout.Session);
  }

  if (event.type === 'checkout.session.expired') {
    return expireSession(event.data.object as Stripe.Checkout.Session);
  }

  return { status: 'ignored', detail: `No handler for ${event.type}.` };
}

/** Resolves the purchase from metadata, falling back to the session id. */
async function findPurchase(session: Stripe.Checkout.Session): Promise<CreditPurchase | null> {
  const fromMetadata = session.metadata?.purchase_id ?? session.client_reference_id;

  if (fromMetadata) {
    const purchase = await CreditPurchase.findByPk(Number(fromMetadata));
    if (purchase) return purchase;
  }

  // Only reached if the metadata is missing, which would mean a session this
  // server did not create.
  return CreditPurchase.findOne({ where: { stripeCheckoutSessionId: session.id } });
}

async function grantForSession(session: Stripe.Checkout.Session): Promise<WebhookOutcome> {
  if (session.payment_status !== 'paid') {
    // checkout.session.completed also fires for sessions that completed without
    // payment — a delayed payment method, for example. Those settle later via
    // async_payment_succeeded, so nothing is granted now.
    return {
      status: 'ignored',
      detail: `Session ${session.id} is ${session.payment_status}, not paid.`,
    };
  }

  const purchase = await findPurchase(session);

  if (!purchase) {
    // A paid session with no purchase row. Not something to swallow: answering
    // 5xx makes Stripe retry, which buys time if the row is simply late.
    throw new Error(`No purchase found for checkout session ${session.id}.`);
  }

  // The amount Stripe actually collected must match what was quoted. Guards
  // against a session created elsewhere, or a purchase repriced after the fact.
  if (session.amount_total !== purchase.amountPaise) {
    throw new Error(
      `Amount mismatch for purchase ${purchase.id}: session collected ${session.amount_total}, purchase expects ${purchase.amountPaise}.`,
    );
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  // Keyed on the payment, so every event describing this payment maps to one key.
  const idempotencyKey = idempotencyKeys.purchase(paymentIntentId ?? session.id);

  const result = await sequelize.transaction(async (transaction) => {
    const ledger = await creditWallet(
      {
        walletId: purchase.walletId,
        currencyId: purchase.currencyId,
        credits: purchase.credits,
        idempotencyKey,
        referenceType: 'CREDIT_PURCHASE',
        referenceId: purchase.id,
        description: `Purchased ${purchase.credits} credits`,
      },
      transaction,
    );

    // Conditional on not already being PAID, so a late duplicate cannot rewrite
    // paid_at or repoint the ledger link. Note it deliberately does not require
    // PENDING: a purchase marked EXPIRED or FAILED locally still gets its
    // credits, because the verified payment outranks local bookkeeping.
    await CreditPurchase.update(
      {
        status: 'PAID',
        paidAt: new Date(),
        ledgerEntryId: ledger.entry.id,
        stripePaymentIntentId: paymentIntentId,
        stripeCheckoutSessionId: purchase.stripeCheckoutSessionId ?? session.id,
      },
      { where: { id: purchase.id, status: ['PENDING', 'EXPIRED', 'FAILED'] }, transaction },
    );

    return ledger;
  });

  if (result.alreadyApplied) {
    return {
      status: 'duplicate',
      detail: `Purchase ${purchase.id} was already granted; no credits added.`,
    };
  }

  return {
    status: 'processed',
    detail: `Granted ${purchase.credits} credits for purchase ${purchase.id}.`,
  };
}

async function expireSession(session: Stripe.Checkout.Session): Promise<WebhookOutcome> {
  const purchase = await findPurchase(session);

  if (!purchase) {
    return { status: 'ignored', detail: `No purchase for expired session ${session.id}.` };
  }

  // Only a PENDING purchase expires. This is the out-of-order guard: an expiry
  // event arriving after the payment succeeded cannot undo a PAID purchase.
  const [affected] = await CreditPurchase.update(
    { status: 'EXPIRED' },
    { where: { id: purchase.id, status: 'PENDING' } },
  );

  return affected === 1
    ? { status: 'processed', detail: `Purchase ${purchase.id} expired.` }
    : { status: 'ignored', detail: `Purchase ${purchase.id} is not PENDING; left as is.` };
}
