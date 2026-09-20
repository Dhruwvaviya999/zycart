import Razorpay from 'razorpay';
import type { Env, RazorpayConfig } from '../config/env';
import { razorpayConfig } from '../config/env';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { rupeesToPaise } from '../utils/money';
import {
  verifyCheckoutSignature,
  verifyWebhookSignature as verifyWebhookHmac,
} from '../utils/payment-signature';

/**
 * The only module in ZyCart that talks to Razorpay.
 *
 * Everything above it — controllers, the payment service, the order service —
 * deals in rupees, ZyCart orders and plain results. Everything gateway-shaped
 * stops here: the SDK, the API secret, paise, and Razorpay's own error objects.
 * That is what makes "could a customer change the amount?" a question with one
 * place to look.
 */

/** ZyCart prices in rupees and accepts payment in rupees. Nothing else. */
export const CURRENCY = 'INR';

/**
 * One client per credential set, built on first use.
 *
 * The SDK holds only configuration and an HTTP agent, so a single instance is
 * safe to share; rebuilding it per request would discard connection reuse for
 * nothing.
 */
let cached: { keyId: string; client: Razorpay } | null = null;

function clientFor(config: RazorpayConfig): Razorpay {
  if (cached?.keyId !== config.keyId) {
    cached = {
      keyId: config.keyId,
      client: new Razorpay({ key_id: config.keyId, key_secret: config.keySecret }),
    };
  }

  return cached.client;
}

/**
 * The credentials, or a clear failure.
 *
 * A deployment with no Razorpay configuration is legitimate — cash on delivery
 * only — but a request that has reached this far has already been told online
 * payment was available, so the mismatch is reported as a server configuration
 * problem rather than a customer error.
 */
function requireConfig(env: Env): RazorpayConfig {
  const config = razorpayConfig(env);

  if (!config) {
    throw new AppError('Online payment is not available at the moment.', 503);
  }

  return config;
}

/**
 * Turns anything the SDK throws into an AppError with a message fit for a
 * customer.
 *
 * Razorpay's errors carry a description, a source and sometimes a reason —
 * useful in a log, but not text to render, and never text to render verbatim
 * in case it echoes something it should not. The original is logged with its
 * ids; the customer gets a sentence.
 */
function gatewayFailure(operation: string, error: unknown, customerMessage: string): AppError {
  const description =
    typeof error === 'object' && error !== null
      ? ((error as { error?: { description?: string }; message?: string }).error?.description ??
        (error as { message?: string }).message)
      : undefined;

  // The gateway's own description, never its response object: that carries
  // the request it echoes back, key id included.
  logger.error('payment_gateway_failed', { operation, detail: description ?? undefined });

  return new AppError(customerMessage, 502);
}

export interface CreatedRazorpayOrder {
  id: string;
  amountInPaise: number;
  currency: string;
  status: string;
}

/**
 * Creates the gateway order that Checkout will be opened against.
 *
 * The amount is converted from the ZyCart order total here, at the boundary and
 * nowhere earlier, which is what guarantees the figure Razorpay charges is the
 * figure the order stores. Nothing from the browser reaches this call.
 *
 * `receipt` carries the ZyCart order number so a Razorpay dashboard row can be
 * traced back without a database lookup. `notes` holds the same, plus the
 * order id — Razorpay echoes notes into webhook payloads, which makes an
 * unmatched event diagnosable.
 *
 * @see https://razorpay.com/docs/api/orders/create/
 */
export async function createOrder(
  env: Env,
  params: { amountInRupees: number; receipt: string; notes: Record<string, string> },
): Promise<CreatedRazorpayOrder> {
  const config = requireConfig(env);
  const amountInPaise = rupeesToPaise(params.amountInRupees, 'order total');

  try {
    const order = await clientFor(config).orders.create({
      amount: amountInPaise,
      currency: CURRENCY,
      // Razorpay caps receipts at 40 characters; an order number is well under.
      receipt: params.receipt.slice(0, 40),
      notes: params.notes,
    });

    logger.info('payment_gateway_order_created', {
      razorpayOrderId: order.id,
      receipt: params.receipt,
      amountInPaise: Number(order.amount),
    });

    return {
      id: order.id,
      amountInPaise: Number(order.amount),
      currency: order.currency,
      status: order.status,
    };
  } catch (error) {
    throw gatewayFailure(
      'orders.create',
      error,
      'We could not start the payment. Please try again in a moment.',
    );
  }
}

export interface FetchedRazorpayOrder {
  id: string;
  amountInPaise: number;
  amountPaidInPaise: number;
  currency: string;
  status: 'created' | 'attempted' | 'paid';
}

/** Reads a gateway order back, for checking what actually happened against it. */
export async function fetchOrder(env: Env, razorpayOrderId: string): Promise<FetchedRazorpayOrder> {
  const config = requireConfig(env);

  try {
    const order = await clientFor(config).orders.fetch(razorpayOrderId);

    return {
      id: order.id,
      amountInPaise: Number(order.amount),
      amountPaidInPaise: Number(order.amount_paid),
      currency: order.currency,
      status: order.status,
    };
  } catch (error) {
    throw gatewayFailure(
      'orders.fetch',
      error,
      'We could not confirm your payment yet. Please try again shortly.',
    );
  }
}

export interface FetchedRazorpayPayment {
  id: string;
  orderId: string | null;
  amountInPaise: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  captured: boolean;
  method: string | null;
  errorDescription: string | null;
}

/**
 * Reads a payment from Razorpay.
 *
 * This is the trusted source for amount, currency, status and the order the
 * payment belongs to. A valid signature proves the ids were issued together; it
 * says nothing about whether the money was actually captured or how much of it,
 * and those are exactly the facts finalisation turns on.
 *
 * @see https://razorpay.com/docs/api/payments/fetch-payment/
 */
export async function fetchPayment(
  env: Env,
  razorpayPaymentId: string,
): Promise<FetchedRazorpayPayment> {
  const config = requireConfig(env);

  try {
    const payment = await clientFor(config).payments.fetch(razorpayPaymentId);
    const raw = payment as unknown as {
      method?: string;
      error_description?: string | null;
      order_id?: string | null;
    };

    return {
      id: payment.id,
      orderId: raw.order_id ?? null,
      amountInPaise: Number(payment.amount),
      currency: payment.currency,
      status: payment.status,
      captured: Boolean(payment.captured),
      method: raw.method ?? null,
      errorDescription: raw.error_description ?? null,
    };
  } catch (error) {
    throw gatewayFailure(
      'payments.fetch',
      error,
      'We could not confirm your payment yet. Please try again shortly.',
    );
  }
}

/**
 * The payments attempted against one gateway order.
 *
 * Used only on the recovery path: when neither the browser callback nor a
 * webhook delivered the payment id, but the gateway order says it was paid,
 * this is how the payment behind it is found.
 *
 * @see https://razorpay.com/docs/api/orders/fetch-payments/
 */
export async function fetchOrderPayments(
  env: Env,
  razorpayOrderId: string,
): Promise<{ id: string; status: string; amountInPaise: number }[]> {
  const config = requireConfig(env);

  try {
    const result = await clientFor(config).orders.fetchPayments(razorpayOrderId);

    return (result.items ?? []).map((payment) => ({
      id: payment.id,
      status: payment.status,
      amountInPaise: Number(payment.amount),
    }));
  } catch (error) {
    throw gatewayFailure(
      'orders.fetchPayments',
      error,
      'We could not confirm your payment yet. Please try again shortly.',
    );
  }
}

export interface IssuedRefund {
  id: string;
  status: 'pending' | 'processed' | 'failed';
  amountInPaise: number;
}

/**
 * Refunds part or all of a captured payment.
 *
 * ## The amount is never the caller's idea
 *
 * There is an amount parameter, and it is still not a decision anybody upstream
 * of the domain gets to make. Phase 7's only refund was "the money was taken
 * and the order cannot be fulfilled", always the whole payment. Phase 13 added
 * returns, where the correct figure is the approved quantities priced at the
 * order's own historical snapshot — computed by `plannedRefund`, capped at what
 * remains refundable on the order, and never present in any request body.
 *
 * What this function guarantees is the boundary: rupees in, paise at the
 * gateway, and a conversion that throws rather than rounds. What it does not
 * guarantee is that the figure is right — that is the domain's job, and it is
 * why the caller is a service and not a controller.
 *
 * ## Idempotency
 *
 * Not provided here, deliberately. Razorpay's refund API has no idempotency key
 * this SDK forwards, so a retry at this level could genuinely refund twice.
 * Duplicate protection therefore lives one layer up, as an atomic database
 * claim that must succeed before this is ever called — the same technique
 * `refundUnfulfillablePayment` has used since Phase 7. See `issueReturnRefund`.
 *
 * @see https://razorpay.com/docs/api/refunds/create-instant/
 */
export async function refundPayment(
  env: Env,
  params: {
    razorpayPaymentId: string;
    amountInRupees: number;
    reason: string;
    receipt: string;
    /** Echoed into the gateway's notes, so a dashboard row traces back here. */
    notes?: Record<string, string>;
  },
): Promise<IssuedRefund> {
  const config = requireConfig(env);
  const amountInPaise = rupeesToPaise(params.amountInRupees, 'refund amount');

  try {
    const refund = await clientFor(config).payments.refund(params.razorpayPaymentId, {
      amount: amountInPaise,
      speed: 'normal',
      notes: { reason: params.reason, receipt: params.receipt, ...(params.notes ?? {}) },
    });

    logger.info('refund_initiated', {
      reason: 'requested',
      refundId: refund.id,
      razorpayPaymentId: params.razorpayPaymentId,
      status: refund.status,
      amountInPaise: Number(refund.amount),
    });

    return { id: refund.id, status: refund.status, amountInPaise: Number(refund.amount) };
  } catch (error) {
    throw gatewayFailure('payments.refund', error, 'We could not start the refund automatically.');
  }
}

/**
 * Refunds a captured payment in full.
 *
 * Kept as its own name rather than folded into the call above, because the
 * unfulfillable-payment path has no business choosing an amount and this
 * signature is what says so. It is the whole order total or nothing.
 */
export async function refundPaymentInFull(
  env: Env,
  params: { razorpayPaymentId: string; amountInRupees: number; reason: string; receipt: string },
): Promise<IssuedRefund> {
  return refundPayment(env, params);
}

/**
 * Reads a refund back from the gateway.
 *
 * ## Why an admin cannot simply "mark it refunded"
 *
 * A refund Razorpay reports as `pending` has been accepted and not settled, and
 * that can take days through a bank. The console needs a way to find out
 * whether it landed — and the honest way is to ask the gateway, not to offer a
 * button that writes REFUNDED on somebody's say-so. A refund is money leaving
 * the merchant account; whether it did is a fact at Razorpay, exactly as
 * whether a payment was captured is.
 *
 * So this exists, the console's action is "check with Razorpay", and the state
 * only moves when the answer says it may.
 *
 * @see https://razorpay.com/docs/api/refunds/fetch-refund/
 */
export async function fetchRefund(
  env: Env,
  razorpayRefundId: string,
): Promise<{ id: string; status: string; amountInPaise: number; paymentId: string | null }> {
  const config = requireConfig(env);

  try {
    const refund = await clientFor(config).refunds.fetch(razorpayRefundId);
    const raw = refund as unknown as { payment_id?: string | null };

    return {
      id: refund.id,
      status: String(refund.status),
      amountInPaise: Number(refund.amount),
      paymentId: raw.payment_id ?? null,
    };
  } catch (error) {
    throw gatewayFailure(
      'refunds.fetch',
      error,
      'We could not check the refund with the payment provider just now.',
    );
  }
}

/**
 * Verifies the signature Checkout returned to the browser.
 *
 * Kept here so the API secret is read in one module, even though the HMAC
 * itself lives in a util. A `false` from this is a forgery attempt or a bug —
 * either way the payment does not exist as far as ZyCart is concerned.
 */
export function verifyPaymentSignature(
  env: Env,
  params: { razorpayOrderId: string; razorpayPaymentId: string; signature: string },
): boolean {
  return verifyCheckoutSignature({ ...params, keySecret: requireConfig(env).keySecret });
}

/**
 * Verifies a webhook against the raw request body.
 *
 * Takes a Buffer, not a string or an object, because the signature is over the
 * exact bytes Razorpay sent. Anything that has been through `JSON.parse` has
 * already lost the only thing this check depends on.
 */
export function verifyWebhook(env: Env, params: { rawBody: Buffer; signature: string }): boolean {
  return verifyWebhookHmac({ ...params, webhookSecret: requireConfig(env).webhookSecret });
}

/** The key id is public by design — Checkout needs it in the browser. */
export function publicKeyId(env: Env): string {
  return requireConfig(env).keyId;
}
