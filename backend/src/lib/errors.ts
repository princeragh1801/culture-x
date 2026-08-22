/**
 * Application errors.
 *
 * Every failure the client is allowed to see is an AppError carrying a stable
 * machine-readable `code`. The frontend and the tests assert on the code, never
 * on the message, so wording can change without breaking anything.
 *
 * Anything that is not an AppError is treated as a bug and reported as a generic
 * 500 — internal messages never reach the client.
 */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_ALREADY_REGISTERED'
  | 'NOT_FOUND'
  | 'CURRENCY_INACTIVE'
  | 'CURRENCY_NOT_ALLOWED_FOR_MODULE'
  | 'INSUFFICIENT_CREDITS'
  | 'CAMPAIGN_ALREADY_FUNDED'
  | 'PAYMENT_NOT_CONFIRMED'
  | 'STRIPE_NOT_CONFIGURED'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, httpStatus: number, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }

  static unauthorized(message = 'Authentication required.'): AppError {
    return new AppError('UNAUTHORIZED', 401, message);
  }

  static invalidCredentials(): AppError {
    // Deliberately identical whether the email is unknown or the password is
    // wrong, so the endpoint cannot be used to enumerate registered accounts.
    return new AppError('INVALID_CREDENTIALS', 401, 'Email or password is incorrect.');
  }

  static emailAlreadyRegistered(): AppError {
    return new AppError('EMAIL_ALREADY_REGISTERED', 409, 'That email is already registered.');
  }

  static notFound(what: string): AppError {
    return new AppError('NOT_FOUND', 404, `${what} not found.`);
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError('VALIDATION_ERROR', 422, message, details);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
