import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';
import { verifyAuthToken } from '../lib/jwt';

/**
 * Guards every wallet and campaign route.
 *
 * Only the token is checked here — the user row is not loaded. Services resolve
 * the wallet from req.auth.userId, so an authenticated request that names
 * somebody else's campaign still fails on ownership at the service layer.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    throw AppError.unauthorized('Missing Bearer token.');
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw AppError.unauthorized('Missing Bearer token.');
  }

  const payload = verifyAuthToken(token);
  req.auth = { userId: payload.sub, email: payload.email };
  next();
}

/**
 * Narrows req.auth for handlers that sit behind requireAuth. Throwing rather
 * than asserting means a route accidentally mounted without the guard fails
 * closed.
 */
export function requireAuthContext(req: Request): { userId: number; email: string } {
  if (!req.auth) {
    throw AppError.unauthorized();
  }
  return req.auth;
}
