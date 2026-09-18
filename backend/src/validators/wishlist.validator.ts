import { z } from 'zod';
import { objectIdSchema } from './common';

export const addWishlistItemSchema = z
  .object({
    productId: objectIdSchema,
  })
  .strict();

/** Variant choices carried through when moving a saved product into the cart. */
export const moveToCartSchema = z
  .object({
    quantity: z.number().int().min(1).max(10).default(1),
    selectedColor: z.string().trim().min(1).max(60).nullish(),
    selectedSize: z.string().trim().min(1).max(60).nullish(),
  })
  .strict();

export type AddWishlistItemInput = z.infer<typeof addWishlistItemSchema>;
export type MoveToCartInput = z.infer<typeof moveToCartSchema>;
