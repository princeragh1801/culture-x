import type { AuthTokenPayload } from '../lib/jwt';

declare global {
  namespace Express {
    interface Request {
      /**
       * Set by requireAuth. Present on every protected route and absent
       * everywhere else, so forgetting the middleware is a type error at the
       * point of use rather than a runtime surprise.
       */
      auth?: { userId: number; email: string };
      /** Raw request body, captured only for the Stripe webhook route. */
      rawBody?: Buffer;
    }
  }
}

export type { AuthTokenPayload };
