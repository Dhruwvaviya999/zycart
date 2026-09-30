import { z } from 'zod';
import { GST_RATES, isGstRate } from '../config/commerce';

export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  image: z.url().max(500).optional(),
  isActive: z.boolean().optional(),
  /**
   * One of the GST slabs, or null to follow the store default (Phase 18).
   * Changing it affects orders placed afterwards only.
   */
  gstRate: z
    .number()
    .refine(isGstRate, `must be one of ${GST_RATES.join(', ')}`)
    .nullable()
    .optional(),
  /** Whether products in this category offer virtual try-on (Phase 19). */
  tryOnEnabled: z.boolean().optional(),
  /** 4, 6 or 8 digits, or empty — never a guess. */
  hsnCode: z
    .string()
    .trim()
    .regex(/^(?:\d{4}|\d{6}|\d{8})?$/, 'must be 4, 6 or 8 digits')
    .optional(),
});

export const updateCategorySchema = createCategorySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'at least one field must be provided');

export const categoryQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
