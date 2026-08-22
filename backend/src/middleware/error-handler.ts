import type { NextFunction, Request, Response } from 'express';
import { BaseError, UniqueConstraintError, ValidationError } from 'sequelize';
import { dbEnv } from '../config/db-env';
import { AppError, isAppError } from '../lib/errors';

/** Nothing matched a route. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}.` },
  });
}

/**
 * The single place an error becomes an HTTP response.
 *
 * Express 5 forwards rejected promises from handlers here automatically, so
 * async routes need no wrapper.
 *
 * Unrecognised errors are reported as a generic 500: a database message can
 * carry table and column names, and those should not leave the server.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (isAppError(error)) {
    res.status(error.httpStatus).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }

  // A unique index rejected the write. This is a normal outcome of a race, not a
  // bug: two signups for the same email, or two attempts to grant the same
  // payment. Callers that expect it catch it themselves; anything reaching here
  // is reported as a conflict rather than a server fault.
  if (error instanceof UniqueConstraintError) {
    res.status(409).json({
      error: { code: 'CONFLICT', message: 'That record already exists.' },
    });
    return;
  }

  if (error instanceof ValidationError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request failed validation.',
        details: error.errors.map((item) => ({ field: item.path, message: item.message })),
      },
    });
    return;
  }

  const internal = new AppError('INTERNAL_ERROR', 500, 'Something went wrong.');
  console.error('[unhandled]', error instanceof BaseError ? error.message : error);

  res.status(internal.httpStatus).json({
    error: {
      code: internal.code,
      message: internal.message,
      // Only ever in development, and only the message.
      ...(dbEnv.NODE_ENV === 'development' && error instanceof Error
        ? { debug: error.message }
        : {}),
    },
  });
}
