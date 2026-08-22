import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    globalSetup: ['src/tests/global-setup.ts'],
    setupFiles: ['src/tests/setup.ts'],

    // One shared MySQL database, and several tests deliberately exercise row
    // locks. Running files in parallel would have them truncating each other's
    // fixtures mid-test.
    fileParallelism: false,
    sequence: { concurrent: false },

    testTimeout: 30_000,
    hookTimeout: 120_000,

    // Set before any application module loads, so config/env.ts sees them.
    // dotenv does not override existing process.env values, which is what keeps
    // a developer's real Stripe keys in .env out of the test run.
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret-value-at-least-16-chars',
      BCRYPT_ROUNDS: '4',
      STRIPE_SECRET_KEY: 'sk_test_dummy_key_never_used_for_a_real_call',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_secret_used_only_by_the_suite',
      STRIPE_PAYMENT_CURRENCY: 'inr',
      FRONTEND_URL: 'http://localhost:5173',
    },
  },
});
