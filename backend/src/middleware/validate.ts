import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../lib/errors';

interface FieldError {
  field: string;
  message: string;
}

function toDetails(issues: readonly { path: PropertyKey[]; message: string }[]): FieldError[] {
  return issues.map((issue) => ({
    field: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Replaces req.body with the parsed value, so handlers receive data that is
 * already the right shape and type rather than whatever was posted.
 */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      throw AppError.validation('Request body is invalid.', toDetails(result.error.issues));
    }

    req.body = result.data;
    next();
  };
}

/**
 * Same idea for query strings, which arrive as strings and need coercion.
 *
 * Express 5 exposes req.query through a getter, so the parsed value goes on
 * res.locals instead of being assigned back over it. Read it with
 * validatedQuery(res).
 */
export function validateQuery<T>(schema: ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      throw AppError.validation('Query parameters are invalid.', toDetails(result.error.issues));
    }

    res.locals.query = result.data;
    next();
  };
}

export function validatedQuery<T>(res: Response): T {
  return res.locals.query as T;
}
