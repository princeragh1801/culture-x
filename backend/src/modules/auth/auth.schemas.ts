import { z } from 'zod';

/**
 * Emails are trimmed and lower-cased before validation, so the value that
 * reaches the unique index is already normalised — "A@x.com" and "a@x.com"
 * cannot become two accounts.
 */
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(191));

const passwordSchema = z
  .string()
  .min(8, 'Must be at least 8 characters.')
  .max(128, 'Must be at most 128 characters.');

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(128).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  // Deliberately only a presence check: applying the signup rules here would
  // reject an old password that predates them, with a different status code than
  // a wrong password.
  password: z.string().min(1, 'Password is required.'),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
