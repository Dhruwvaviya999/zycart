import { z } from 'zod';
import { objectIdSchema } from './common';

/**
 * Razorpay identifiers are prefixed and alphanumeric. Constraining the shape
 * here keeps a malformed id out of an HMAC comparison and out of a database
 * query, and costs nothing.
 */
const gatewayOrderId = z
  .string()
  .trim()
  .regex(/^order_[A-Za-z0-9]{6,32}$/, 'is not a valid Razorpay order id');

const gatewayPaymentId = z
  .string()
  .trim()
  .regex(/^pay_[A-Za-z0-9]{6,32}$/, 'is not a valid Razorpay payment id');

/** The HMAC-SHA256 digest Checkout returns, as 64 lowercase hex characters. */
const gatewaySignature = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{64}$/, 'is not a valid signature');

/**
 * Starting a payment takes an order reference and nothing else.
 *
 * `.strict()` is the point of this schema as much as the field is: a request
 * that tries to smuggle an `amount`, a `total` or a `userId` alongside the
 * order id is rejected outright rather than having the extra field quietly
 * ignored. The server reads every one of those from the stored order.
 */
export const createPaymentSchema = z.object({ orderId: objectIdSchema }).strict();

/**
 * Verification takes the three values Razorpay Checkout hands to the browser.
 *
 * Again, no money. The amount is not an input to this endpoint at any point;
 * it is read from the order and from the Razorpay API and compared.
 */
export const verifyPaymentSchema = z
  .object({
    razorpayOrderId: gatewayOrderId,
    razorpayPaymentId: gatewayPaymentId,
    razorpaySignature: gatewaySignature,
  })
  .strict();

/** A Razorpay payment entity, narrowed to the fields ZyCart reads. */
const paymentEntitySchema = z
  .object({
    id: z.string(),
    order_id: z.string().nullish(),
    amount: z.number().nullish(),
    currency: z.string().nullish(),
    status: z.string().nullish(),
    error_description: z.string().nullish(),
  })
  .loose();

const orderEntitySchema = z.object({ id: z.string(), status: z.string().nullish() }).loose();

/**
 * The webhook envelope.
 *
 * Deliberately permissive about everything it does not use — Razorpay adds
 * fields, and rejecting an event because it grew a new one would break the
 * integration for no benefit — and strict about the two things ZyCart needs to
 * find: the event name, and an identifier it can resolve to an order.
 *
 * This runs *after* the signature has been verified, never before. A payload
 * that fails this schema has already been proven to come from Razorpay.
 */
export const webhookEnvelopeSchema = z
  .object({
    event: z.string().min(1).max(100),
    payload: z
      .object({
        payment: z.object({ entity: paymentEntitySchema }).loose().optional(),
        order: z.object({ entity: orderEntitySchema }).loose().optional(),
      })
      .loose(),
  })
  .loose();

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
export type WebhookEnvelope = z.infer<typeof webhookEnvelopeSchema>;
