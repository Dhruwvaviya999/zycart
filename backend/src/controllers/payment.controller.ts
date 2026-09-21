import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import * as paymentService from '../services/payment.service';
import { AppError } from '../utils/AppError';
import { orderRefSchema } from '../validators/order.validator';
import { createPaymentSchema, verifyPaymentSchema } from '../validators/payment.validator';

function currentUserId(req: Request): string {
  if (!req.user) throw new AppError('Not authenticated', 401);
  return req.user.id;
}

/**
 * Opens a Razorpay Checkout session for one of the customer's own orders.
 *
 * The response carries the minimum the browser needs to open Checkout: the
 * gateway order id, the publishable key id, and the amount — which is sent so
 * the interface can show what is about to be charged, not so it can influence
 * it. The key secret and the webhook secret never appear in any response.
 */
export async function createPayment(req: Request, res: Response): Promise<void> {
  const { orderId } = createPaymentSchema.parse(req.body);

  const data = await paymentService.createCheckoutSession(req.env, currentUserId(req), orderId);

  res.json({ success: true, data });
}

/**
 * The customer-facing half of payment confirmation.
 *
 * Answers with the order as it now stands in the database, so the interface
 * renders server state rather than its own optimism, plus the outcome so it can
 * tell "confirmed" from "still settling" from "we refunded you".
 */
export async function verifyPayment(req: Request, res: Response): Promise<void> {
  const input = verifyPaymentSchema.parse(req.body);

  const { outcome, order } = await paymentService.verifyClientPayment(
    req.env,
    currentUserId(req),
    input,
  );

  const paid = outcome === 'FINALIZED' || outcome === 'ALREADY_FINALIZED';

  res.status(paid ? 200 : 202).json({ success: true, data: { outcome, paid, order } });
}

/** Authoritative payment state for one order, used by the confirming screen. */
export async function getPaymentStatus(req: Request, res: Response): Promise<void> {
  const { orderRef } = orderRefSchema.parse({ orderRef: req.params.orderRef });

  const data = await paymentService.getPaymentStatus(req.env, currentUserId(req), orderRef);

  res.json({ success: true, data });
}

/**
 * Razorpay's webhook.
 *
 * Public by necessity — Razorpay has no ZyCart session — and therefore
 * authenticated by signature instead. `req.body` is a Buffer here, not a parsed
 * object, because the signature is computed over the exact bytes that were
 * sent; see the raw-body mount in app.ts.
 *
 * Razorpay documents `x-razorpay-event-id` as the identifier for recognising a
 * duplicate delivery. If a delivery somehow arrives without one, a digest of
 * the signed body stands in: the same event redelivered carries the same body
 * and the same signature, so it collapses to the same key.
 */
export async function razorpayWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.get('x-razorpay-signature');
  const rawBody = req.body as unknown;

  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    throw new AppError('Invalid webhook payload', 400);
  }

  if (!signature) {
    throw new AppError('Missing webhook signature', 400);
  }

  const headerEventId = req.get('x-razorpay-event-id');
  const eventId =
    headerEventId && headerEventId.trim().length > 0
      ? headerEventId.trim()
      : `sha256:${createHash('sha256').update(signature).digest('hex')}`;

  const result = await paymentService.handleWebhookEvent(req.env, { rawBody, signature, eventId });

  // 200 means "received and dealt with", which is true of a duplicate and of an
  // event ZyCart has no use for. Anything Razorpay should retry has already
  // thrown by this point and becomes a 4xx or 5xx.
  res.status(200).json({ success: true, data: result });
}
