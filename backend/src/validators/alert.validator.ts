import { z } from 'zod';
import { ALERT_TYPES } from '../models/product-alert.model';
import { objectIdSchema } from './common';

/**
 * What a customer may say when asking to be told about a product.
 *
 * Which product, which kind of alert and — for a restock — which colour and
 * size. Nothing else: not a price, not an address, not a user. The price a
 * drop is measured against is read from the catalogue by the server, and the
 * recipient is the signed-in account.
 */
export const createAlertSchema = z
  .object({
    productId: objectIdSchema,
    type: z.enum(ALERT_TYPES),
    selectedColor: z.string().trim().min(1).max(40).nullish(),
    selectedSize: z.string().trim().min(1).max(20).nullish(),
  })
  .strict()
  .refine(
    (value) => value.type === 'BACK_IN_STOCK' || (!value.selectedColor && !value.selectedSize),
    { message: 'a price alert is about the product, not one colour or size', path: ['type'] },
  );

/** `GET /alerts?productId=…` narrows the list to one product, for the product page. */
export const alertQuerySchema = z
  .object({
    productId: objectIdSchema.optional(),
  })
  .strict();

export type CreateAlertInput = z.infer<typeof createAlertSchema>;
export type AlertQuery = z.infer<typeof alertQuerySchema>;
