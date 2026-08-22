import cors from 'cors';
import express, { type Express } from 'express';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { authRouter } from './modules/auth/auth.routes';
import { creditsRouter } from './modules/credits/credits.routes';
import { currencyRouter } from './modules/currencies/currency.routes';
import { walletRouter } from './modules/wallet/wallet.routes';

export function createApp(): Express {
  const app = express();

  app.use(cors({ origin: env.FRONTEND_URL, credentials: false }));

  // The Stripe webhook is mounted before express.json() once it exists: verifying
  // the Stripe-Signature header needs the exact bytes Stripe sent, and a JSON
  // parser destroys them.

  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/currencies', currencyRouter);
  app.use('/api/credits', creditsRouter);
  app.use('/api/wallet', walletRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
