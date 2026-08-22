import { vi } from 'vitest';

/**
 * The one Stripe call the suite stubs.
 *
 * Only session creation is faked — an outbound HTTP call to Stripe that a test
 * has no business making. Signature verification is NOT stubbed: the webhook
 * tests sign payloads with Stripe's own generateTestHeaderString and the route
 * verifies them with Stripe's own constructEvent, so a forged-signature test is
 * genuinely testing the library that guards production.
 */
export const checkoutSessionCreate = vi.fn();

/** Matches STRIPE_WEBHOOK_SECRET in vitest.config.ts. */
export const TEST_WEBHOOK_SECRET = 'whsec_test_secret_used_only_by_the_suite';

interface SessionStubOptions {
  id?: string;
  url?: string;
}

/** Makes session creation echo back a plausible session for the given purchase. */
export function stubCheckoutSession(options: SessionStubOptions = {}): void {
  checkoutSessionCreate.mockImplementation((params: { metadata?: { purchase_id?: string } }) => {
    const purchaseId = params.metadata?.purchase_id ?? '0';
    return Promise.resolve({
      id: options.id ?? `cs_test_${purchaseId}`,
      url: options.url ?? `https://checkout.stripe.test/session/${purchaseId}`,
    });
  });
}
