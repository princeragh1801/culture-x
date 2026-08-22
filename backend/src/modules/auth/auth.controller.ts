import type { Request, Response } from 'express';
import { requireAuthContext } from '../../middleware/require-auth';
import type { LoginInput, SignupInput } from './auth.schemas';
import { getCurrentUser, login, signup } from './auth.service';

export async function signupHandler(req: Request, res: Response): Promise<void> {
  const result = await signup(req.body as SignupInput);
  res.status(201).json(result);
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const result = await login(req.body as LoginInput);
  res.status(200).json(result);
}

export async function meHandler(req: Request, res: Response): Promise<void> {
  const { userId } = requireAuthContext(req);
  const user = await getCurrentUser(userId);
  res.status(200).json({ user });
}
