import bcrypt from 'bcryptjs';
import { env } from '../config/env';

/** Only the hash is ever persisted; the plaintext never leaves this module. */
export function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, env.BCRYPT_ROUNDS);
}

export function verifyPassword(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}
