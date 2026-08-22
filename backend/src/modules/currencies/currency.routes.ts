import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth';
import { listCurrenciesHandler } from './currency.controller';

export const currencyRouter = Router();

currencyRouter.get('/', requireAuth, listCurrenciesHandler);
