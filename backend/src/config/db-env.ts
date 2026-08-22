import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { z } from 'zod';

// sequelize-cli, vitest and tsx each resolve process.cwd() differently, so the
// .env path is anchored to this file rather than to the working directory.
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true });

/**
 * Database configuration only.
 *
 * Kept separate from the application env (JWT secret, Stripe keys) so that
 * `npm run migrate` works in an environment that has no Stripe credentials.
 */
const dbEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3307),
  DB_USER: z.string().min(1).default('culturex'),
  DB_PASSWORD: z.string().default('culturex'),
  DB_NAME: z.string().min(1).default('culturex_dev'),
  DB_NAME_TEST: z.string().min(1).default('culturex_test'),
  DB_LOGGING: z.enum(['true', 'false']).default('false'),
});

const parsed = dbEnvSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Invalid database environment configuration:\n${details}`);
}

export const dbEnv = parsed.data;

export const isTestEnv = dbEnv.NODE_ENV === 'test';

/** The test suite runs against its own database so it can truncate freely. */
export const databaseName = isTestEnv ? dbEnv.DB_NAME_TEST : dbEnv.DB_NAME;
