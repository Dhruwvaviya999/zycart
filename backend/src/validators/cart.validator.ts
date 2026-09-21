import { z } from 'zod';
import { objectIdSchema } from './common';

/**
 * The ceiling on a single cart line. One constant so the model, the API and the
 * quantity control cannot disagree about what the limit is.
 */
export const MAX_CART_QUANTITY = 10;

const quantitySchema = z
  .number()
  .int('must be a whole number')
  .min(1, 'must be at least 1')
  .max(MAX_CART_QUANTITY, `must be at most ${MAX_CART_QUANTITY}`);

/** Variant labels are matched against the product's own options, never trusted. */
const variantSchema = z.string().trim().min(1).max(60).nullish();

export const addCartItemSchema = z
  .object({
    productId: objectIdSchema,
    quantity: quantitySchema.default(1),
    selectedColor: variantSchema,
    selectedSize: variantSchema,
  })
  .strict();

export const updateCartItemSchema = z
  .object({
    quantity: quantitySchema,
  })
  .strict();

/**
 * The guest cart as it is handed over at sign-in. Only identifiers and
 * quantities: everything else is looked up server-side.
 */
export const mergeCartSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            productId: objectIdSchema,
            quantity: quantitySchema,
            selectedColor: variantSchema,
            selectedSize: variantSchema,
          })
          .strict(),
      )
      .max(100, 'too many items'),
  })
  .strict();

/** Same payload as a merge, but resolved and thrown away rather than stored. */
export const previewCartSchema = mergeCartSchema;

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type MergeCartInput = z.infer<typeof mergeCartSchema>;
