import { z } from 'zod';

/**
 * Stored and queried in one canonical form, so `USER@Example.COM` and
 * `user@example.com` can never become two accounts.
 */
export const normalisedEmail = z
  .email('must be a valid email address')
  .max(254)
  .transform((value) => value.trim().toLowerCase());

/**
 * Length is the requirement that actually matters. Character-class rules push
 * people towards `Password1!` and are not asked for here.
 */
export const passwordSchema = z
  .string()
  .min(8, 'must be at least 8 characters')
  .max(128, 'must be at most 128 characters');

const nameSchema = z.string().trim().min(1, 'is required').max(60, 'must be at most 60 characters');

/**
 * `.strict()` matters here: it is what makes `{ ..., "role": "ADMIN" }` a
 * validation failure rather than a silently ignored field.
 */
export const registerSchema = z
  .object({
    firstName: nameSchema,
    lastName: nameSchema,
    email: normalisedEmail,
    password: passwordSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: normalisedEmail,
    password: z.string().min(1, 'is required'),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
