import { z } from 'zod';
import { ORDER_STATUSES, PAYMENT_METHODS } from '../models/order.model';
import { objectIdSchema } from './common';
import { couponCodeSchema } from './coupon.validator';

/** Kept short and fixed: a free-text box here buys nothing. */
export const CANCELLATION_REASONS = [
  'Changed my mind',
  'Ordered by mistake',
  'Found another product',
  'Delivery timing',
  'Other',
] as const;

/**
 * Notice what is absent: price, subtotal, total, stock and userId. The server
 * recalculates all of them, so there is no field through which a client could
 * suggest what an order should cost.
 */
export const createOrderSchema = z
  .object({
    addressId: objectIdSchema,
    /**
     * Which of the two flows to run — not a claim about payment state. Choosing
     * RAZORPAY creates an unpaid order and nothing more; the money is a
     * separate, verified step.
     */
    paymentMethod: z.enum(PAYMENT_METHODS).default('COD'),
    /**
     * A code to apply, not a discount to grant. What it is worth — if anything —
     * is decided on the server against the basket as it is when the order is
     * placed; there is still no field through which a client names an amount.
     */
    couponCode: couponCodeSchema.optional(),
  })
  .strict();

export const cancelOrderSchema = z
  .object({
    reason: z.enum(CANCELLATION_REASONS),
    note: z.string().trim().max(300).optional(),
  })
  .strict();

export const orderQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    status: z.enum(ORDER_STATUSES).optional(),
  })
  .strict();

/** Orders are addressed by their number or their id; both resolve to one owner. */
export const orderRefSchema = z.object({
  orderRef: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, 'is not a valid order reference'),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type OrderQuery = z.infer<typeof orderQuerySchema>;
