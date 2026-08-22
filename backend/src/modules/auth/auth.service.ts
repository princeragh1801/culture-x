import { UniqueConstraintError } from 'sequelize';
import { sequelize, User } from '../../db/models';
import { AppError } from '../../lib/errors';
import { signAuthToken } from '../../lib/jwt';
import { hashPassword, verifyPassword } from '../../lib/password';
import { provisionWallet } from '../wallet/wallet.service';
import type { LoginInput, SignupInput } from './auth.schemas';

export interface AuthResult {
  token: string;
  user: ReturnType<User['toSafeJSON']>;
}

/**
 * A bcrypt hash of a value nobody knows, compared against when an email is not
 * registered. Without it, login returns noticeably faster for unknown emails
 * than for known ones, which turns the endpoint into an account-enumeration
 * oracle.
 */
const DUMMY_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8.6R7rF5W0T1yQZmQZ0oMcJ0kK1sIS';

/**
 * Creates the user and their wallet in one transaction: there is no window in
 * which a user exists without a wallet.
 */
export async function signup(input: SignupInput): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password);

  try {
    const user = await sequelize.transaction(async (transaction) => {
      const created = await User.create(
        { email: input.email, passwordHash, name: input.name ?? null },
        { transaction },
      );

      await provisionWallet(created.id, transaction);
      return created;
    });

    return {
      token: signAuthToken({ sub: user.id, email: user.email }),
      user: user.toSafeJSON(),
    };
  } catch (error) {
    // Two simultaneous signups for the same email: one commits, the other hits
    // the unique index. The loser gets a clean 409, not a 500.
    if (error instanceof UniqueConstraintError) {
      throw AppError.emailAlreadyRegistered();
    }
    throw error;
  }
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await User.findOne({ where: { email: input.email } });

  if (!user) {
    await verifyPassword(input.password, DUMMY_HASH);
    throw AppError.invalidCredentials();
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);

  if (!passwordMatches) {
    throw AppError.invalidCredentials();
  }

  return {
    token: signAuthToken({ sub: user.id, email: user.email }),
    user: user.toSafeJSON(),
  };
}

export async function getCurrentUser(userId: number): Promise<ReturnType<User['toSafeJSON']>> {
  const user = await User.findByPk(userId);

  if (!user) {
    // The token verified but the account is gone.
    throw AppError.unauthorized('Account no longer exists.');
  }

  return user.toSafeJSON();
}
