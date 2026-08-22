import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from './errors';

export interface AuthTokenPayload {
  /** User id. Named `sub` to follow the JWT registered-claim convention. */
  sub: number;
  email: string;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/**
 * Verifies signature and expiry. Any failure surfaces as the same 401, so a
 * tampered token is indistinguishable from an expired one to the caller.
 */
export function verifyAuthToken(token: string): AuthTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);

    if (typeof decoded === 'string' || typeof decoded.sub !== 'number') {
      throw AppError.unauthorized('Malformed authentication token.');
    }

    return { sub: decoded.sub, email: String(decoded.email ?? '') };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.unauthorized('Invalid or expired authentication token.');
  }
}
