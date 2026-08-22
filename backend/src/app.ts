import cors from 'cors';
import express, { type Express } from 'express';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { authRouter } from './modules/auth/auth.routes';
import { campaignsRouter } from './modules/campaigns/campaigns.routes';
import { creditsRouter } from './modules/credits/credits.routes';
import { currencyRouter } from './modules/currencies/currency.routes';
import { webhookRouter } from './modules/stripe/webhook.routes';
import { walletRouter } from './modules/wallet/wallet.routes';

export function createApp(): Express {
  const app = express();

  app.use(cors({ origin: env.FRONTEND_URL, credentials: false }));

  // Mounted before express.json() on purpose. Verifying the Stripe-Signature
  // header needs the exact bytes Stripe sent, and a JSON parser destroys them by
  // reparsing. Moving this line below the parser silently breaks every webhook.
  app.use('/api/webhooks', webhookRouter);

  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/currencies', currencyRouter);
  app.use('/api/credits', creditsRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/campaigns', campaignsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
