import { Router } from 'express';
import * as controller from '../controllers/payment.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rateLimit.middleware';
import { asyncHandler } from '../utils/asyncHandler';

export const paymentRouter = Router();

/**
 * The webhook is declared before the auth guard, and is the only public route
 * here. Razorpay holds no ZyCart session, so its authority is the HMAC
 * signature over the raw body — verified in the service before a single field
 * of the payload is read.
 *
 * The raw body itself is mounted in app.ts, ahead of the global JSON parser.
 */
paymentRouter.post('/payments/razorpay/webhook', asyncHandler(controller.razorpayWebhook));

paymentRouter.use('/payments', asyncHandler(requireAuth));

/**
 * Creating a gateway order is a call to a third party, so it is worth a ceiling
 * — enough for a customer who legitimately retries a few times, not enough to
 * be used as a way to hammer Razorpay through ZyCart.
 */
paymentRouter.post(
  '/payments/razorpay/create',
  rateLimit({
    windowMs: 60_000,
    max: 12,
    message: 'Too many payment attempts. Please wait a moment and try again.',
  }),
  asyncHandler(controller.createPayment),
);

paymentRouter.post(
  '/payments/razorpay/verify',
  rateLimit({
    windowMs: 60_000,
    max: 30,
    message: 'Too many verification attempts. Please wait a moment and try again.',
  }),
  asyncHandler(controller.verifyPayment),
);

/**
 * Answering this can reconcile against Razorpay, so it is a call to a third
 * party too. The allowance is generous enough for the confirming screen's
 * handful of checks and a customer refreshing the page, and no more.
 */
paymentRouter.get(
  '/payments/orders/:orderRef/status',
  rateLimit({
    windowMs: 60_000,
    max: 40,
    message: 'Please wait a moment before checking again.',
  }),
  asyncHandler(controller.getPaymentStatus),
);

/**
 * There is deliberately no refund endpoint.
 *
 * The only refund this phase performs is the automatic one for a payment that
 * cannot be fulfilled, and it is decided entirely on the server: which payment,
 * how much and why all come from the order. Exposing a route that took an order
 * id — let alone an amount — would be handing those decisions to the client.
 */
