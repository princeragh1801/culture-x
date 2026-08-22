import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth';
import { validateQuery } from '../../middleware/validate';
import { getLedgerHandler, getWalletHandler } from './wallet.controller';
import { ledgerQuerySchema } from './wallet.schemas';

export const walletRouter = Router();

// Every wallet route is behind the guard: a wallet is only ever readable by the
// user the token belongs to, and the user id comes from the token, never the URL.
walletRouter.use(requireAuth);

walletRouter.get('/', getWalletHandler);
walletRouter.get('/ledger', validateQuery(ledgerQuerySchema), getLedgerHandler);
