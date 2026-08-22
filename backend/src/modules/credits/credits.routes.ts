import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth';
import { validateBody } from '../../middleware/validate';
import {
  createPurchaseHandler,
  getPurchaseHandler,
  listPurchasesHandler,
} from './credits.controller';
import { createPurchaseSchema } from './credits.schemas';

export const creditsRouter = Router();

creditsRouter.use(requireAuth);

creditsRouter.post('/purchases', validateBody(createPurchaseSchema), createPurchaseHandler);
creditsRouter.get('/purchases', listPurchasesHandler);

// Polled by the checkout return page. It reports what the webhook has done, and
// is the only thing the redirect is allowed to trigger.
creditsRouter.get('/purchases/:id', getPurchaseHandler);
