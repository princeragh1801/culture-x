import express, { Router, type Request, type Response } from 'express';
import type Stripe from 'stripe';
import { assertWebhookSecretConfigured, getStripe } from '../../lib/stripe';
import { handleStripeEvent } from './webhook.service';

export const webhookRouter = Router();

/**
 * The only unauthenticated write endpoint in the API.
 *
 * express.raw is mandatory, not a style choice: the signature covers the exact
 * bytes Stripe sent, and a JSON parser destroys them by reparsing. This router
 * is mounted before express.json() in app.ts for the same reason.
 *
 * Status codes are chosen for how Stripe reacts to them:
 *   400 — the signature does not verify. Not transient, so no retry is wanted.
 *   200 — handled, duplicate, or an event type this server does not care about.
 *   500 — handling failed. Stripe retries, and the retry carries the same event
 *         id, so the unique index makes the retry safe.
 */
webhookRouter.post(
  '/stripe',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response): Promise<void> => {
    const signature = req.header('stripe-signature');

    if (!signature) {
      res.status(400).json({
        error: { code: 'INVALID_SIGNATURE', message: 'Missing Stripe-Signature header.' },
      });
      return;
    }

    let event: Stripe.Event;

    try {
      // Nothing has touched the database at this point. A forged or tampered
      // payload is rejected here, before any row is read or written.
      event = getStripe().webhooks.constructEvent(
        req.body as Buffer,
        signature,
        assertWebhookSecretConfigured(),
      );
    } catch (error) {
      res.status(400).json({
        error: {
          code: 'INVALID_SIGNATURE',
          message: error instanceof Error ? error.message : 'Signature verification failed.',
        },
      });
      return;
    }

    const outcome = await handleStripeEvent(event);

    res.status(200).json({ received: true, outcome: outcome.status, detail: outcome.detail });
  },
);
