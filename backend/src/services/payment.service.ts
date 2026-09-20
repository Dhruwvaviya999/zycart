import mongoose, { Types } from 'mongoose';
import type { Env } from '../config/env';
import { isRazorpayConfigured } from '../config/env';
import { Order, PAYABLE_PAYMENT_STATUSES, type PaymentStatus } from '../models/order.model';
import { ReturnRequest } from '../models/return.model';
import { User } from '../models/user.model';
import { WebhookEvent } from '../models/webhook-event.model';
import { AppError } from '../utils/AppError';
import { paiseMatchRupees, rupeesToPaise } from '../utils/money';
import * as razorpay from './razorpay.service';
import {
  AvailabilityError,
  clearPurchasedCartLines,
  commitStock,
  findOwnedOrder,
  toDetail,
  type OrderDetail,
} from './order.service';
import { applyRefundOutcome } from './returns/refund.service';
import { webhookEnvelopeSchema, type WebhookEnvelope } from '../validators/payment.validator';

type OrderDoc = InstanceType<typeof Order>;

/**
 * Payment states a successful payment may be finalised from.
 *
 * Wider than the set that may open a new Checkout: AUTHORIZED means the bank
 * has approved the money but Razorpay has not captured it, so a later capture
 * must still be able to complete the order.
 */
const FINALIZABLE_FROM: readonly PaymentStatus[] = ['PENDING', 'FAILED', 'AUTHORIZED'];

/** What a finalisation attempt did. Every caller branches on this, not on exceptions. */
export type FinalizeOutcome =
  /** This call took the order from unpaid to paid and confirmed. */
  | 'FINALIZED'
  /** Someone else got there first — the browser callback, or an earlier webhook. */
  | 'ALREADY_FINALIZED'
  /** Money is in but the items are gone; a refund has been started. */
  | 'REFUNDED_UNFULFILLABLE'
  /** Authorised, not yet captured. Nothing to confirm until capture arrives. */
  | 'AWAITING_CAPTURE'
  /** The gateway says this payment did not succeed. */
  | 'PAYMENT_FAILED'
  /** The order cannot accept this payment at all (cancelled, or already refunded). */
  | 'NOT_PAYABLE';

export interface FinalizeResult {
  outcome: FinalizeOutcome;
  order: OrderDoc;
}

export const isOnlinePaymentAvailable = (env: Env): boolean => isRazorpayConfigured(env);

/**
 * Re-derives the order total from the lines and refuses to proceed if it has
 * drifted.
 *
 * The stored total is the authority on what the customer agreed to pay, and it
 * is written once at creation and never updated. Checking it against the lines
 * before every gateway interaction is cheap, and it is what makes "the amount
 * charged equals the amount stored" an invariant that is actually enforced
 * rather than merely intended. A mismatch means the document was tampered with
 * or corrupted, and either way no money should move.
 */
function assertOrderTotalIntact(order: OrderDoc): void {
  for (const item of order.items) {
    if (item.unitPrice * item.quantity !== item.lineTotal) {
      throw new AppError('This order is no longer available for payment.', 409);
    }
  }

  const subtotal = order.items.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = subtotal + order.pricing.shipping + order.pricing.tax - order.pricing.discount;

  if (subtotal !== order.pricing.subtotal || total !== order.pricing.total) {
    throw new AppError('This order is no longer available for payment.', 409);
  }

  if (order.pricing.total <= 0) {
    throw new AppError('This order is no longer available for payment.', 409);
  }
}

/**
 * Finds the ZyCart order a gateway order id belongs to.
 *
 * Superseded ids are searched too: a customer who fails, retries and then has
 * the first attempt succeed late produces a webhook against an id that is no
 * longer the current one, and that payment is still real money against this
 * order.
 *
 * When `userId` is given the lookup is scoped to that customer, so a gateway
 * order id belonging to somebody else resolves to nothing rather than to their
 * order. The webhook path passes no user, because Razorpay is not a customer —
 * its authority comes from the signature instead.
 */
async function findOrderByGatewayOrderId(
  razorpayOrderId: string,
  userId?: string,
): Promise<OrderDoc | null> {
  return Order.findOne({
    ...(userId ? { user: new Types.ObjectId(userId) } : {}),
    $or: [
      { 'payment.razorpayOrderId': razorpayOrderId },
      { 'payment.supersededRazorpayOrderIds': razorpayOrderId },
    ],
  });
}

/**
 * Checks a gateway payment against the order it claims to pay for.
 *
 * A valid signature proves Razorpay issued these two ids together. It says
 * nothing about how much was paid, in what currency, or whether the money was
 * actually captured — so all three are read from the Razorpay API and compared
 * against the stored order here. This is the check that stops a real payment
 * for ₹1 from completing an order for ₹5,300.
 */
function assertPaymentMatchesOrder(
  order: OrderDoc,
  payment: razorpay.FetchedRazorpayPayment,
): void {
  const belongsToThisOrder =
    payment.orderId !== null &&
    (payment.orderId === order.payment.razorpayOrderId ||
      order.payment.supersededRazorpayOrderIds.includes(payment.orderId));

  if (!belongsToThisOrder) {
    console.warn(
      `[payment] rejected ${payment.id}: gateway order ${payment.orderId} is not attached to order ${order.orderNumber}`,
    );
    throw new AppError('We could not match this payment to your order.', 409);
  }

  if (payment.currency !== razorpay.CURRENCY) {
    console.warn(
      `[payment] rejected ${payment.id}: currency ${payment.currency} on order ${order.orderNumber}`,
    );
    throw new AppError('We could not confirm this payment. Please contact support.', 409);
  }

  if (!paiseMatchRupees(payment.amountInPaise, order.pricing.total)) {
    console.warn(
      `[payment] rejected ${payment.id}: ${payment.amountInPaise} paise against an order of ${order.pricing.total} rupees (${order.orderNumber})`,
    );
    throw new AppError('We could not confirm this payment. Please contact support.', 409);
  }
}

/** Re-reads the order to explain why a finalisation claim did not match. */
function classifySettled(order: OrderDoc): FinalizeOutcome {
  if (order.payment.status === 'PAID') return 'ALREADY_FINALIZED';
  if (order.payment.status === 'REFUNDED' || order.payment.status === 'REFUND_PENDING') {
    return 'REFUNDED_UNFULFILLABLE';
  }
  return 'NOT_PAYABLE';
}

/**
 * Money is in, the items are not. Reverse it.
 *
 * Reached only when a payment was genuinely captured and the atomic stock
 * decrement then failed — someone else bought the last unit between the
 * customer opening Checkout and the payment landing. Pretending the order
 * succeeded would leave a paid order that can never ship; silently keeping the
 * money is worse still.
 *
 * The claim is a conditional update, so a duplicate webhook arriving mid-refund
 * matches nothing and cannot start a second one. The refund itself is the only
 * part that can fail without the state being recoverable, and it leaves the
 * order in REFUND_PENDING with a loud log rather than a quiet success.
 */
async function refundUnfulfillablePayment(
  env: Env,
  order: OrderDoc,
  razorpayPaymentId: string,
  reason: string,
): Promise<FinalizeResult> {
  const claimed = await Order.findOneAndUpdate(
    {
      _id: order._id,
      'payment.refundId': null,
      'payment.status': { $nin: ['REFUND_PENDING', 'REFUNDED'] },
    },
    {
      $set: {
        'payment.status': 'REFUND_PENDING',
        'payment.razorpayPaymentId': razorpayPaymentId,
        'payment.failureReason': reason,
        'payment.refundReason': reason,
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: `${reason} Your payment is being refunded.`,
      },
    },
    { new: true },
  );

  // Another request is already refunding this payment. Leave it alone.
  if (!claimed) {
    const current = await Order.findById(order._id);
    return { outcome: 'REFUNDED_UNFULFILLABLE', order: current ?? order };
  }

  console.warn(
    `[payment] order ${claimed.orderNumber} paid but unfulfillable; refunding payment ${razorpayPaymentId}`,
  );

  try {
    const refund = await razorpay.refundPaymentInFull(env, {
      razorpayPaymentId,
      amountInRupees: claimed.pricing.total,
      reason: 'stock_unavailable',
      receipt: claimed.orderNumber,
    });

    const settled = refund.status === 'processed';

    const updated = await Order.findByIdAndUpdate(
      claimed._id,
      {
        $set: {
          'payment.refundId': refund.id,
          'payment.status': settled ? 'REFUNDED' : 'REFUND_PENDING',
          'payment.refundedAt': settled ? new Date() : null,
          /**
           * The running total Phase 13 added, kept accurate by this path too.
           *
           * Set rather than incremented, because this refund is always the
           * whole order and this is the only refund such an order can have —
           * the return flow cannot reach a cancelled, unfulfillable order. An
           * increment here would double-count if this ever ran twice, and the
           * conditional claim above is what guarantees it does not.
           */
          'payment.refundedAmount': claimed.pricing.total,
        },
      },
      { new: true },
    );

    return { outcome: 'REFUNDED_UNFULFILLABLE', order: updated ?? claimed };
  } catch (error) {
    // The order stays REFUND_PENDING, which is exactly what it is: owed a
    // refund that has not been issued. Nothing here pretends otherwise.
    console.error(
      `[payment] AUTOMATIC REFUND FAILED for order ${claimed.orderNumber}, payment ${razorpayPaymentId} - needs manual action`,
      error instanceof Error ? error.message : error,
    );

    return { outcome: 'REFUNDED_UNFULFILLABLE', order: claimed };
  }
}

/**
 * The one place a payment is ever turned into a confirmed order.
 *
 * The browser callback and the Razorpay webhook both arrive here, which is what
 * makes them agree by construction rather than by two implementations being
 * kept in step. It is safe to call any number of times, from any number of
 * requests, concurrently, for the same payment.
 *
 * Three things do the work:
 *
 *  - **The gateway is the source of truth.** Amount, currency, status and the
 *    order the payment belongs to are read from Razorpay, never from the
 *    caller.
 *  - **The claim is a conditional update.** Taking the order from unpaid to paid
 *    is one atomic operation with the filter carrying the precondition, so the
 *    second caller's update matches nothing and it returns ALREADY_FINALIZED.
 *  - **The transaction covers the consequences.** Stock, confirmation and cart
 *    clearing commit together with the claim or not at all, so a payment can
 *    never take stock twice, nor be marked paid against stock it did not get.
 */
export async function finalizeSuccessfulPayment(
  env: Env,
  order: OrderDoc,
  razorpayPaymentId: string,
): Promise<FinalizeResult> {
  // Cheap exit for the common duplicate: the webhook arriving after the
  // callback has already done the work.
  if (order.payment.status === 'PAID') {
    return { outcome: 'ALREADY_FINALIZED', order };
  }

  if (!FINALIZABLE_FROM.includes(order.payment.status) || order.status === 'CANCELLED') {
    return { outcome: classifySettled(order), order };
  }

  assertOrderTotalIntact(order);

  const payment = await razorpay.fetchPayment(env, razorpayPaymentId);
  assertPaymentMatchesOrder(order, payment);

  if (payment.status === 'failed') {
    return {
      outcome: 'PAYMENT_FAILED',
      order: await recordPaymentFailure(order, payment.errorDescription),
    };
  }

  // Authorised but not captured. ZyCart's Razorpay account auto-captures, so
  // this is transient; the capture webhook will bring it back here. Nothing is
  // confirmed and no stock is taken on the strength of an authorisation.
  if (payment.status === 'authorized' && !payment.captured) {
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, 'payment.status': { $in: ['PENDING', 'FAILED'] } },
      {
        $set: {
          'payment.status': 'AUTHORIZED',
          'payment.razorpayPaymentId': payment.id,
          'payment.failureReason': null,
        },
      },
      { new: true },
    );

    return { outcome: 'AWAITING_CAPTURE', order: updated ?? order };
  }

  if (payment.status !== 'captured') {
    // 'created' (never completed) or 'refunded' (already reversed elsewhere).
    return { outcome: classifySettled(order), order };
  }

  const session = await mongoose.startSession();

  /**
   * Why the reason travels in a box rather than a plain variable: an
   * AvailabilityError has to abort the transaction, so it must be thrown, but
   * the refund it triggers can only run once the abort is complete. The box
   * carries the reason out through the `catch`.
   */
  const unfulfillable: { reason: string | null } = { reason: null };

  let result: FinalizeResult;

  try {
    result = await session.withTransaction<FinalizeResult>(async () => {
      // Reset per attempt: withTransaction re-runs this callback on a write
      // conflict, and a stale verdict from the losing attempt must not survive.
      unfulfillable.reason = null;

      const claimed = await Order.findOneAndUpdate(
        {
          _id: order._id,
          status: 'PENDING',
          'payment.status': { $in: FINALIZABLE_FROM },
          stockCommitted: false,
        },
        {
          $set: {
            'payment.status': 'PAID',
            'payment.razorpayPaymentId': payment.id,
            'payment.paidAt': new Date(),
            'payment.failureReason': null,
            status: 'CONFIRMED',
            stockCommitted: true,
          },
        },
        { session, new: true },
      );

      if (!claimed) {
        const current = await Order.findById(order._id).session(session);

        return {
          outcome: current ? classifySettled(current) : 'NOT_PAYABLE',
          order: current ?? order,
        };
      }

      try {
        await commitStock(claimed.items, session, {
          id: claimed._id,
          orderNumber: claimed.orderNumber,
        });
      } catch (error) {
        if (error instanceof AvailabilityError) {
          // Recorded on the way past, not swallowed: the transaction must abort
          // so the order stays unpaid, and the refund happens outside it.
          unfulfillable.reason = error.message;
        }
        throw error;
      }

      await clearPurchasedCartLines(claimed.user, claimed.sourceCartItemIds, session);

      return { outcome: 'FINALIZED', order: claimed };
    });
  } catch (error) {
    if (unfulfillable.reason === null) throw error;

    // The transaction rolled back cleanly: the order is untouched and unpaid,
    // no stock moved. What remains is captured money with nothing to ship.
    return refundUnfulfillablePayment(env, order, payment.id, unfulfillable.reason);
  } finally {
    await session.endSession();
  }

  if (result.outcome === 'FINALIZED') {
    console.info(
      `[payment] order ${result.order.orderNumber} confirmed by payment ${payment.id} (${payment.method ?? 'unknown method'})`,
    );
  }

  return result;
}

/**
 * Records that an attempt failed, without disturbing anything that succeeded.
 *
 * Razorpay does not promise webhook events in chronological order, so a
 * `payment.failed` for an abandoned first attempt can very well arrive after
 * the `payment.captured` for the retry that worked. The guard is the filter:
 * only an order still waiting for payment can be marked failed, so a late
 * failure against a paid order updates nothing.
 *
 * The order itself stays PENDING and is not deleted — it is the thing the
 * customer retries against.
 */
async function recordPaymentFailure(
  order: OrderDoc,
  description: string | null,
): Promise<OrderDoc> {
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, 'payment.status': { $in: ['PENDING', 'AUTHORIZED'] }, status: 'PENDING' },
    {
      $set: {
        'payment.status': 'FAILED',
        'payment.failureReason': description?.slice(0, 300) ?? 'The payment did not go through.',
      },
    },
    { new: true },
  );

  if (updated) {
    console.info(`[payment] order ${updated.orderNumber} payment marked failed`);
  }

  return updated ?? order;
}

export interface CheckoutSessionData {
  orderId: string;
  orderNumber: string;
  razorpayOrderId: string;
  keyId: string;
  /** Currency subunits, for Razorpay Checkout. The rupee figure is `amountInRupees`. */
  amount: number;
  amountInRupees: number;
  currency: string;
  prefill: { name: string; email: string; contact: string };
}

/**
 * Opens — or re-opens — the gateway order that Checkout will be run against.
 *
 * Everything the browser is trusted for is an order reference. The amount, the
 * currency and the receipt are derived from the stored order on the server;
 * there is no field in the request through which a client could suggest what it
 * should cost.
 *
 * An existing gateway order is reused rather than replaced wherever it is still
 * open. That is what makes a double-click harmless — the second call returns
 * the same `razorpayOrderId` instead of stacking up abandoned gateway orders —
 * and it is also a recovery path: if the gateway says that order was already
 * paid, the money is already in and the right response is to finalise, not to
 * ask the customer to pay again.
 */
export async function createCheckoutSession(
  env: Env,
  userId: string,
  orderRef: string,
): Promise<CheckoutSessionData> {
  const order = await findOwnedOrder(userId, orderRef);

  if (order.payment.method !== 'RAZORPAY') {
    throw new AppError('This order is not set up for online payment.', 409);
  }

  if (order.status === 'CANCELLED') {
    throw new AppError('This order is no longer available for payment.', 409);
  }

  if (order.payment.status === 'PAID') {
    throw new AppError('This order has already been paid.', 409);
  }

  if (!PAYABLE_PAYMENT_STATUSES.includes(order.payment.status)) {
    throw new AppError('This order is no longer available for payment.', 409);
  }

  assertOrderTotalIntact(order);

  const expectedPaise = rupeesToPaise(order.pricing.total, 'order total');

  let razorpayOrderId = order.payment.razorpayOrderId ?? null;

  if (razorpayOrderId) {
    const existing = await razorpay.fetchOrder(env, razorpayOrderId);

    /**
     * The gateway says this order is already paid, but ZyCart still has it as
     * unpaid — the callback and the webhook both went missing. Asking the
     * customer to pay a second time would be charging them twice, so the right
     * move is to finish confirming the payment that already exists.
     */
    if (existing.status === 'paid') {
      const paymentId = await latestPaymentIdFor(env, razorpayOrderId);

      if (paymentId) await finalizeSuccessfulPayment(env, order, paymentId);

      throw new AppError(
        'A payment for this order has already gone through. Refresh to see your order.',
        409,
      );
    }

    const reusable =
      existing.amountInPaise === expectedPaise && existing.currency === razorpay.CURRENCY;

    if (!reusable) {
      // The order total can only differ from a gateway order created for it if
      // that gateway order was made for something else; supersede rather than
      // charge against a stale amount.
      await Order.updateOne(
        { _id: order._id },
        {
          $addToSet: { 'payment.supersededRazorpayOrderIds': razorpayOrderId },
          $set: { 'payment.razorpayOrderId': null },
        },
      );
      razorpayOrderId = null;
    }
  }

  if (!razorpayOrderId) {
    const created = await razorpay.createOrder(env, {
      amountInRupees: order.pricing.total,
      receipt: order.orderNumber,
      notes: { zycartOrderNumber: order.orderNumber, zycartOrderId: String(order._id) },
    });

    /**
     * Attached with the same precondition the finalisation claim uses. Two
     * simultaneous "pay now" clicks can each create a gateway order; only one
     * can attach, and the loser's is recorded as superseded so a payment made
     * against it still resolves back to this order.
     */
    const attached = await Order.findOneAndUpdate(
      {
        _id: order._id,
        'payment.status': { $in: PAYABLE_PAYMENT_STATUSES },
        'payment.razorpayOrderId': null,
      },
      { $set: { 'payment.razorpayOrderId': created.id, 'payment.provider': 'razorpay' } },
      { new: true },
    );

    if (attached) {
      razorpayOrderId = created.id;
    } else {
      const current = await Order.findById(order._id);

      if (!current?.payment.razorpayOrderId) {
        throw new AppError('We could not start the payment. Please try again.', 409);
      }

      await Order.updateOne(
        { _id: order._id },
        { $addToSet: { 'payment.supersededRazorpayOrderIds': created.id } },
      );

      razorpayOrderId = current.payment.razorpayOrderId;
    }
  }

  const user = await User.findById(order.user).select('email name');

  return {
    orderId: String(order._id),
    orderNumber: order.orderNumber,
    razorpayOrderId,
    keyId: razorpay.publicKeyId(env),
    amount: expectedPaise,
    amountInRupees: order.pricing.total,
    currency: razorpay.CURRENCY,
    // Convenience only — Razorpay Checkout lets the customer change any of it,
    // and none of it affects what is charged.
    prefill: {
      name: order.shippingAddress.fullName,
      email: user?.email ?? '',
      contact: order.shippingAddress.phone,
    },
  };
}

export interface VerificationInput {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface VerificationResult {
  outcome: FinalizeOutcome;
  order: OrderDetail;
}

/**
 * The browser's report of a completed payment, checked rather than believed.
 *
 * In order: the gateway order id is resolved to one of *this customer's* orders
 * through ZyCart's own database, the signature is verified against the API
 * secret, and only then does finalisation read the real amount and status from
 * Razorpay. A forged callback fails at the signature; a genuine callback
 * replayed against someone else's order fails at the lookup; a genuine callback
 * for a genuine payment of the wrong amount fails at the amount check.
 *
 * Nothing in the request body describes money. Only identifiers are accepted.
 */
export async function verifyClientPayment(
  env: Env,
  userId: string,
  input: VerificationInput,
): Promise<VerificationResult> {
  console.info(`[payment] verification attempted for gateway order ${input.razorpayOrderId}`);

  const order = await findOrderByGatewayOrderId(input.razorpayOrderId, userId);

  if (!order) {
    throw new AppError('We could not match this payment to your order.', 404);
  }

  const signatureValid = razorpay.verifyPaymentSignature(env, {
    razorpayOrderId: input.razorpayOrderId,
    razorpayPaymentId: input.razorpayPaymentId,
    signature: input.razorpaySignature,
  });

  if (!signatureValid) {
    console.warn(
      `[payment] INVALID SIGNATURE on order ${order.orderNumber} for gateway order ${input.razorpayOrderId}`,
    );
    throw new AppError('We could not verify this payment.', 400);
  }

  const result = await finalizeSuccessfulPayment(env, order, input.razorpayPaymentId);

  return { outcome: result.outcome, order: toDetail(result.order) };
}

export interface PaymentStatusView {
  order: OrderDetail;
  /** True while the server has reason to believe a payment is still resolving. */
  pending: boolean;
}

/**
 * The authoritative payment state for one order, with one reconciliation pass.
 *
 * Backs the "we are confirming your payment" screen. If the browser callback
 * was lost and the webhook has not arrived yet, purely local state would say
 * PENDING forever, so an order that still has an open gateway order is checked
 * against Razorpay once per call — no polling loop of its own, no timers, just
 * the truth at the moment somebody asks.
 */
export async function getPaymentStatus(
  env: Env,
  userId: string,
  orderRef: string,
): Promise<PaymentStatusView> {
  let order = await findOwnedOrder(userId, orderRef);

  const worthChecking =
    order.payment.method === 'RAZORPAY' &&
    order.payment.razorpayOrderId !== null &&
    order.status !== 'CANCELLED' &&
    FINALIZABLE_FROM.includes(order.payment.status) &&
    isOnlinePaymentAvailable(env);

  if (worthChecking && order.payment.razorpayOrderId) {
    const gatewayOrder = await razorpay.fetchOrder(env, order.payment.razorpayOrderId);

    if (gatewayOrder.status === 'paid') {
      const paymentId = await latestPaymentIdFor(env, order.payment.razorpayOrderId);

      if (paymentId) {
        const result = await finalizeSuccessfulPayment(env, order, paymentId);
        order = result.order;
      }
    }
  }

  return {
    order: toDetail(order),
    pending: order.payment.method === 'RAZORPAY' && order.payment.status === 'AUTHORIZED',
  };
}

/**
 * The captured payment against a gateway order, if there is one.
 *
 * A gateway order carries its status but not its payment, so in every normal
 * flow the payment id arrives with the callback or the webhook. This is the
 * recovery path for when neither did, and the only reason to list payments.
 */
async function latestPaymentIdFor(env: Env, razorpayOrderId: string): Promise<string | null> {
  const payments = await razorpay.fetchOrderPayments(env, razorpayOrderId);

  return payments.find((payment) => payment.status === 'captured')?.id ?? null;
}

export interface WebhookResult {
  /** True when this exact event had already been dealt with. */
  duplicate: boolean;
  event: string;
  outcome: string;
}

/**
 * Handles one signed Razorpay webhook.
 *
 * The order of operations is the security property: the signature is verified
 * against the raw bytes **before** the payload is parsed, and the payload is
 * parsed before anything is looked up. An unsigned or wrongly-signed request
 * never reaches any business logic, and never gets a 200.
 *
 * Duplicate delivery is expected rather than exceptional, so the event id is
 * claimed through a unique index: the second delivery loses the insert and is
 * acknowledged without doing the work again. The claim is released if handling
 * throws, so a genuine failure is still retried by Razorpay.
 */
export async function handleWebhookEvent(
  env: Env,
  raw: { rawBody: Buffer; signature: string; eventId: string },
): Promise<WebhookResult> {
  if (!razorpay.verifyWebhook(env, { rawBody: raw.rawBody, signature: raw.signature })) {
    console.warn('[payment] webhook rejected: signature mismatch');
    throw new AppError('Invalid webhook signature', 400);
  }

  let envelope: WebhookEnvelope;
  try {
    envelope = webhookEnvelopeSchema.parse(JSON.parse(raw.rawBody.toString('utf8')));
  } catch {
    console.warn('[payment] webhook rejected: unexpected payload shape');
    throw new AppError('Unsupported webhook payload', 400);
  }

  console.info(`[payment] webhook received ${envelope.event} (event ${raw.eventId})`);

  let claim: InstanceType<typeof WebhookEvent>;
  try {
    claim = await WebhookEvent.create({ eventId: raw.eventId, event: envelope.event });
  } catch (error) {
    const duplicate =
      typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;

    if (!duplicate) throw error;

    console.info(`[payment] webhook ${raw.eventId} already handled, ignoring duplicate`);
    return { duplicate: true, event: envelope.event, outcome: 'DUPLICATE' };
  }

  try {
    const outcome = await dispatchWebhook(env, envelope);

    await WebhookEvent.updateOne(
      { _id: claim._id },
      {
        $set: {
          status: outcome.handled ? 'PROCESSED' : 'IGNORED',
          outcome: outcome.outcome,
          razorpayOrderId: outcome.razorpayOrderId ?? null,
          razorpayPaymentId: outcome.razorpayPaymentId ?? null,
          order: outcome.orderId ?? null,
        },
      },
    );

    return { duplicate: false, event: envelope.event, outcome: outcome.outcome };
  } catch (error) {
    // Release the claim so Razorpay's retry is not mistaken for a duplicate of
    // an event that was never actually handled.
    await WebhookEvent.deleteOne({ _id: claim._id });
    throw error;
  }
}

interface DispatchResult {
  handled: boolean;
  outcome: string;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  orderId?: Types.ObjectId | null;
}

/**
 * Routes an event to the same business logic the browser callback uses.
 *
 * Only the three events ZyCart actually acts on are handled. Everything else is
 * acknowledged and ignored — a webhook endpoint that 500s on an event somebody
 * enabled in the dashboard would be retried forever for no reason.
 */
async function dispatchWebhook(env: Env, envelope: WebhookEnvelope): Promise<DispatchResult> {
  const payment = envelope.payload.payment?.entity ?? null;

  /**
   * Refund events resolve to a return, not to an order's gateway order id.
   *
   * Handled before the order lookup below because a `refund.*` payload carries
   * no `order_id` at all — routing it through that lookup would have it
   * discarded as "no order reference" and a refund that settled would never
   * close its own loop.
   */
  if (envelope.event === 'refund.processed' || envelope.event === 'refund.failed') {
    return dispatchRefundWebhook(envelope);
  }

  const gatewayOrderId = payment?.order_id ?? envelope.payload.order?.entity.id ?? null;

  if (!gatewayOrderId) {
    return { handled: false, outcome: 'NO_ORDER_REFERENCE' };
  }

  const order = await findOrderByGatewayOrderId(gatewayOrderId);

  if (!order) {
    // Another application sharing the same Razorpay account, or a test event
    // fired from the dashboard. Acknowledged, not an error.
    console.info(`[payment] webhook for unknown gateway order ${gatewayOrderId}, ignoring`);
    return { handled: false, outcome: 'UNKNOWN_ORDER', razorpayOrderId: gatewayOrderId };
  }

  const base = {
    razorpayOrderId: gatewayOrderId,
    razorpayPaymentId: payment?.id ?? null,
    orderId: order._id,
  };

  switch (envelope.event) {
    case 'payment.captured':
    case 'order.paid': {
      if (!payment?.id) return { handled: false, outcome: 'NO_PAYMENT_ID', ...base };

      try {
        const result = await finalizeSuccessfulPayment(env, order, payment.id);
        return { handled: true, outcome: result.outcome, ...base };
      } catch (error) {
        /**
         * A rejection — wrong amount, wrong currency, a payment that does not
         * belong to this order — is a permanent verdict. Redelivering the same
         * event cannot change it, so it is recorded and acknowledged rather
         * than left to be retried for days.
         *
         * Anything else (the gateway being unreachable, a database failure) is
         * transient and is rethrown, so Razorpay does retry it.
         */
        if (error instanceof AppError && error.statusCode >= 400 && error.statusCode < 500) {
          console.warn(
            `[payment] webhook for order ${order.orderNumber} rejected permanently: ${error.message}`,
          );
          return { handled: false, outcome: 'REJECTED', ...base };
        }

        throw error;
      }
    }

    case 'payment.failed': {
      if (!payment?.id) return { handled: false, outcome: 'NO_PAYMENT_ID', ...base };

      // Deliberately not a blanket overwrite. A failure for an abandoned first
      // attempt can arrive after the retry that succeeded, and the filter
      // inside `recordPaymentFailure` is what stops it undoing a paid order.
      const updated = await recordPaymentFailure(order, payment.error_description ?? null);

      return {
        handled: true,
        outcome: updated.payment.status === 'FAILED' ? 'PAYMENT_FAILED' : 'IGNORED_STALE_FAILURE',
        ...base,
      };
    }

    default:
      return { handled: false, outcome: 'UNHANDLED_EVENT', ...base };
  }
}

/**
 * Closes the loop on a refund the gateway has finished with.
 *
 * ## Why this is worth having
 *
 * A refund Razorpay accepts is frequently `pending` for a day or more while a
 * bank moves the money. Before Phase 13 that left an order sitting in
 * REFUND_PENDING until somebody happened to look — the operations panel
 * surfaced it precisely because nothing resolved it. Now the gateway says when
 * it lands, through the same signed and deduplicated pipeline every other event
 * uses.
 *
 * ## Two kinds of refund reach here
 *
 * A return's refund resolves to a `ReturnRequest` by its refund id, and is
 * settled by `applyRefundOutcome` — the *same* function the console's "check
 * with Razorpay" action calls, so a refund reaches the same state whichever
 * told us first.
 *
 * Phase 7's unfulfillable-order refund is not attached to any return, so it is
 * matched against the order's own `payment.refundId` and settles the payment
 * directly. Both are conditional updates, so a duplicate delivery that slipped
 * past the event-id claim still changes nothing.
 *
 * Anything that matches neither is acknowledged and ignored. A refund issued
 * from the Razorpay dashboard by hand is a real possibility, and 500-ing on it
 * would have Razorpay retry it for days.
 */
async function dispatchRefundWebhook(envelope: WebhookEnvelope): Promise<DispatchResult> {
  const refund = envelope.payload.refund?.entity ?? null;

  if (!refund?.id) return { handled: false, outcome: 'NO_REFUND_ID' };

  const status = envelope.event === 'refund.processed' ? 'processed' : 'failed';

  const request = await ReturnRequest.findOne({ 'refund.razorpayRefundId': refund.id }).select(
    '_id returnNumber',
  );

  if (request) {
    const outcome = await applyRefundOutcome({
      returnId: request._id,
      refundId: refund.id,
      status,
      // No actor: nobody performed this. The audit trail records administrative
      // action, and a bank settling a transfer is not one.
      actor: null,
    });

    console.info(`[payment] refund ${refund.id} for return ${request.returnNumber}: ${outcome}`);

    return { handled: true, outcome: `RETURN_REFUND_${outcome}`, razorpayPaymentId: refund.payment_id ?? null };
  }

  const order = await Order.findOne({ 'payment.refundId': refund.id });

  if (!order) {
    console.info(`[payment] refund webhook for unknown refund ${refund.id}, ignoring`);
    return { handled: false, outcome: 'UNKNOWN_REFUND' };
  }

  if (status === 'processed') {
    await Order.updateOne(
      { _id: order._id, 'payment.status': 'REFUND_PENDING' },
      { $set: { 'payment.status': 'REFUNDED', 'payment.refundedAt': new Date() } },
    );

    return { handled: true, outcome: 'ORDER_REFUND_SETTLED', orderId: order._id };
  }

  // A failed automatic refund is left exactly as it is: REFUND_PENDING, which
  // is the truthful description of an order that is owed money it has not been
  // sent. The operations panel already surfaces that, and marking it anything
  // else would hide a debt.
  console.error(
    `[payment] AUTOMATIC REFUND ${refund.id} FAILED for order ${order.orderNumber} - needs manual action`,
  );

  return { handled: true, outcome: 'ORDER_REFUND_FAILED', orderId: order._id };
}
