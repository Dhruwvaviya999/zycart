import { z } from 'zod';

export const createBrandSchema = z.object({
  name: z.string().trim().min(2).max(80),
  logo: z.url().max(500).optional(),
  isActive: z.boolean().optional(),
});

/** `slug` is omitted deliberately: it is derived from the name and owns the URL. */
export const updateBrandSchema = createBrandSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'at least one field must be provided');

export const brandQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
