import { z } from 'zod';

/**
 * `Types.ObjectId.isValid()` accepts any 12-character string, so a slug like
 * `footwear-men` would pass as an id. Match the hex form explicitly instead.
 */
export const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

export const isObjectId = (value: string): boolean => OBJECT_ID_PATTERN.test(value);

export const objectIdSchema = z.string().regex(OBJECT_ID_PATTERN, 'must be a valid id');

export const idParamSchema = z.object({ id: objectIdSchema });

export const slugParamSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be a valid slug'),
});

/** Either handle works on the single-resource routes. */
export const idOrSlugParamSchema = z.object({ idOrSlug: z.string().min(1).max(200) });

/** Query strings carry booleans as text; nothing else is accepted. */
export const queryBoolean = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

/** Escapes user input before it reaches a `$regex`, so `(` cannot throw. */
export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
