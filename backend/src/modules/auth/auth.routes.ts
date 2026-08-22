import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth';
import { validateBody } from '../../middleware/validate';
import { loginHandler, meHandler, signupHandler } from './auth.controller';
import { loginSchema, signupSchema } from './auth.schemas';

export const authRouter = Router();

authRouter.post('/signup', validateBody(signupSchema), signupHandler);
authRouter.post('/login', validateBody(loginSchema), loginHandler);
authRouter.get('/me', requireAuth, meHandler);
