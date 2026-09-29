import { z } from 'zod';
import { passwordSchema } from './auth.validator';

/** Deliberately permissive: international numbers vary more than a regex can hold. */
const phoneSchema = z
  .string()
  .trim()
  .max(20, 'must be at most 20 characters')
  .regex(/^[+()\d\s-]*$/, 'may contain digits, spaces and + ( ) - only');

const optionalText = (max: number) => z.string().trim().max(max);

/**
 * Only the four fields a customer owns. `role`, `isActive`, `isEmailVerified`
 * and `email` are absent by design, and `.strict()` turns an attempt to send one
 * into a 400 rather than a silent no-op.
 */
export const updateProfileSchema = z
  .object({
    firstName: z.string().trim().min(1, 'is required').max(60),
    lastName: z.string().trim().min(1, 'is required').max(60),
    phone: phoneSchema,
    avatar: z.union([z.url('must be a valid URL').max(600), z.literal('')]),
  })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'at least one field must be provided');

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'is required'),
    newPassword: passwordSchema,
  })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ['newPassword'],
    error: 'must be different from the current password',
  });

export const addressSchema = z
  .object({
    label: optionalText(40).optional(),
    fullName: z.string().trim().min(1, 'is required').max(120),
    phone: phoneSchema.min(6, 'must be at least 6 characters'),
    addressLine1: z.string().trim().min(1, 'is required').max(200),
    addressLine2: optionalText(200).optional(),
    landmark: optionalText(120).optional(),
    city: z.string().trim().min(1, 'is required').max(80),
    state: z.string().trim().min(1, 'is required').max(80),
    postalCode: z
      .string()
      .trim()
      .min(3, 'is required')
      .max(16)
      .regex(/^[A-Za-z0-9 -]+$/, 'may contain letters, digits, spaces and hyphens only'),
    country: z.string().trim().min(1, 'is required').max(80),
    isDefault: z.boolean().optional(),
  })
  .strict();

export const updateAddressSchema = addressSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'at least one field must be provided');

/**
 * The optional messages a customer can switch off (Phase 18). One today — cart
 * reminders — and transactional mail is deliberately not among them.
 */
export const updatePreferencesSchema = z.object({ cartReminders: z.boolean() }).strict();

/** The body of the one-click opt-out a reminder email links to. */
export const cartReminderOptOutSchema = z
  .object({
    u: z.string().regex(/^[0-9a-fA-F]{24}$/, 'is not a valid link'),
    s: z.string().min(20).max(100),
  })
  .strict();

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateAddressInput = z.infer<typeof addressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
