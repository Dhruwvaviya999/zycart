import type { Types } from 'mongoose';
import { RETURN_WINDOW_DAYS, type ReturnReason } from '../../models/return.model';

/**
 * The return rules, as pure functions.
 *
 * ## Why they are here rather than in the service
 *
 * Everything in this file decides something — is this returnable, how much of
 * this line is left, what is this refund worth — and none of it touches a
 * database. That separation is what makes the rules testable: the whole of
 * ZyCart's return policy can be exercised against plain objects, with no
 * MongoDB in the way and nothing mocked, which is the same choice the inventory
 * rules made in Phase 12.
 *
 * It also keeps the policy in one readable place. "When may a customer return
 * something, and what do they get back?" is a question a person should be able
 * to answer by reading one file, not by tracing conditionals through a
 * controller.
 *
 * ## The one rule that is not here
 *
 * Reserving quantity is a write, and its correctness under concurrency comes
 * entirely from being one atomic update. It lives in `return.service` beside
 * the update it guards, because separating a guard from the operation it
 * guards is how guards stop being applied.
 */

/**
 * The order fields the policy is allowed to read.
 *
 * Structural and deliberately tolerant of `undefined`, so a hydrated Mongoose
 * document satisfies it directly and no caller has to build an adapter object
 * first. The tolerance is honest rather than lazy: `returnedQuantity`,
 * `refundedAmount` and `deliveredAt` really are absent on documents written
 * before Phase 13, and a type that pretended otherwise would push the
 * `?? 0` into every call site instead of handling it once, here.
 */
export interface PolicyOrderItem {
  _id: Types.ObjectId | unknown;
  quantity: number;
  returnedQuantity?: number | null;
  unitPrice: number;
  productName: string;
}

export interface PolicyOrder {
  status: string;
  deliveredAt?: Date | null;
  items: readonly PolicyOrderItem[];
  pricing: { subtotal: number; shipping: number; discount: number; tax: number; total: number };
  payment: {
    method: string;
    status: string;
    razorpayPaymentId?: string | null;
    refundedAmount?: number | null;
  };
}

/**
 * When the return window closes for an order delivered at `deliveredAt`.
 *
 * ## The rule, in full
 *
 * - **The clock starts** at the moment delivery was recorded on the order, not
 *   at dispatch and not at purchase.
 * - **It runs for `RETURN_WINDOW_DAYS` days**, and closes at the *end* of the
 *   final day rather than at the same clock time. A parcel delivered at
 *   11:58 pm therefore gets the same number of usable days as one delivered at
 *   noon, which is the difference between a rule and a trap.
 * - **The timezone is the server process's**, which is the same convention
 *   every other date boundary in ZyCart uses — the dashboard's "last 7 days",
 *   the audit filter's "today". Deploy the API with `TZ` set to the store's
 *   timezone and every boundary moves together. A per-rule timezone setting
 *   that only some queries honoured would be worse than one consistent answer.
 * - **Weekends and public holidays are not excluded.** ZyCart has no holiday
 *   calendar, and a rule that depended on data nobody maintains would be a rule
 *   nobody could predict.
 * - **Partial returns are allowed**, per line and per unit; see
 *   `returnableQuantity`.
 */
export function returnWindowEndsAt(deliveredAt: Date): Date {
  const end = new Date(deliveredAt.getTime());
  end.setDate(end.getDate() + RETURN_WINDOW_DAYS);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * How many units of one line may still be asked for.
 *
 * `returnedQuantity` counts everything currently held by a return that has not
 * been rejected or cancelled, so this is "purchased, minus spoken for". It can
 * reach zero and never goes below it.
 */
export function returnableQuantity(item: Pick<PolicyOrderItem, 'quantity' | 'returnedQuantity'>) {
  return Math.max(0, item.quantity - (item.returnedQuantity ?? 0));
}

export interface ReturnableLine {
  orderItemId: string;
  productName: string;
  purchasedQuantity: number;
  returnableQuantity: number;
}

export interface Returnability {
  /** Whether a return may be started right now. The browser never decides this. */
  returnable: boolean;
  /** Why not, phrased for the customer. Null when it is returnable. */
  reason: string | null;
  /** ISO, or null when there is no window to compute. */
  windowEndsAt: string | null;
  windowDays: number;
  lines: ReturnableLine[];
}

/**
 * Whether this order may be returned, and how much of it.
 *
 * ## The order of the checks is the design
 *
 * Each one produces a different sentence, and a customer who is refused
 * deserves to know which rule refused them. "Returns open once your order is
 * delivered" and "the return window closed on 4 October" are different pieces
 * of information, and collapsing them into one "not eligible" would make the
 * page useless precisely when somebody needs it.
 *
 * ## Delivered before ZyCart recorded delivery dates
 *
 * `deliveredAt` was added in Phase 13 and backfilled from the audit trail where
 * a row existed. Where it did not, the window has no honest start, so the
 * answer is no — with an explanation and a route to support, rather than an
 * unbounded window or a start date somebody made up. That is the same principle
 * the timeline follows: a gap is honest, and a plausible invention is not.
 */
export function returnability(order: PolicyOrder, now: Date = new Date()): Returnability {
  const lines: ReturnableLine[] = order.items.map((item) => ({
    orderItemId: String(item._id),
    productName: item.productName,
    purchasedQuantity: item.quantity,
    returnableQuantity: returnableQuantity(item),
  }));

  const windowEndsAt = order.deliveredAt ? returnWindowEndsAt(order.deliveredAt) : null;

  const base = {
    windowEndsAt: windowEndsAt ? windowEndsAt.toISOString() : null,
    windowDays: RETURN_WINDOW_DAYS,
    lines,
  };

  const refuse = (reason: string): Returnability => ({ returnable: false, reason, ...base });

  if (order.status === 'CANCELLED') {
    return refuse('This order was cancelled, so there is nothing to send back.');
  }

  if (order.status !== 'DELIVERED') {
    return refuse('Returns open once your order has been delivered.');
  }

  if (!order.deliveredAt) {
    return refuse(
      'This order was delivered before we started recording delivery dates, so we cannot work ' +
        'out its return window here. Contact support and we will sort it out.',
    );
  }

  if (windowEndsAt && now > windowEndsAt) {
    return refuse(`The ${RETURN_WINDOW_DAYS}-day return window for this order has closed.`);
  }

  if (lines.every((line) => line.returnableQuantity === 0)) {
    return refuse('Everything on this order has already been requested for return.');
  }

  return { returnable: true, reason: null, ...base };
}

/* ---------------------------------------------------------------- */
/* Refunds                                                           */
/* ---------------------------------------------------------------- */

/**
 * What one unit of a line is worth back, in whole rupees.
 *
 * ## The rules, and why each one is what it is
 *
 * - **The price comes from the order's own snapshot.** Never from the live
 *   catalogue. A product repriced since the purchase must not change what a
 *   refund for that purchase is worth, in either direction.
 * - **Shipping is not refunded.** ZyCart charges none today, so the line below
 *   is about intent rather than arithmetic: delivery was performed, and a
 *   partial return does not undo it. The day shipping is charged, refunding it
 *   on a one-item return of a five-item order would be wrong, and this is where
 *   that decision is written down.
 * - **Discount is taken off, proportionally.** A customer who paid ₹900 for a
 *   ₹1,000 item after a basket discount is owed ₹900, not ₹1,000.
 * - **Tax is added back, proportionally.** They paid it; it comes back.
 * - **Everything is integer arithmetic.** `Math.floor` on both shares, never a
 *   float — ZyCart stores whole rupees and paise exist only inside a call to
 *   Razorpay. Flooring the discount share rounds in the customer's favour by at
 *   most a rupee per unit, and flooring the tax share rounds against them by at
 *   most the same; both are bounded and neither can compound.
 *
 * Both proportional terms are zero today, because `pricing.discount` and
 * `pricing.tax` are both zero on every order ZyCart has ever written. They are
 * computed anyway so that the day either engine lands, this does not silently
 * over-refund.
 */
export function refundableUnitPrice(order: PolicyOrder, unitPrice: number): number {
  const subtotal = order.pricing.subtotal;

  // A zero subtotal cannot be apportioned, and an order with one is not
  // something to refund against.
  if (subtotal <= 0) return 0;

  const discountShare = Math.floor((order.pricing.discount * unitPrice) / subtotal);
  const taxShare = Math.floor((order.pricing.tax * unitPrice) / subtotal);

  return Math.max(0, unitPrice - discountShare + taxShare);
}

/** How much of this order could still be refunded at all. */
export function remainingRefundable(order: PolicyOrder): number {
  return Math.max(0, order.pricing.total - (order.payment.refundedAmount ?? 0));
}

export interface RefundLine {
  unitPrice: number;
  quantity: number;
}

/**
 * What a set of approved lines is worth, capped at what is left to refund.
 *
 * The cap is not defensive decoration. Two returns against one order are
 * refunded independently, and without it a rounding artefact or a mistaken
 * approval could take the cumulative total past what the customer ever paid.
 * With it, the worst case is that the last return is short by the amount the
 * earlier ones over-claimed — which is visible on the admin screen and
 * correctable, rather than money leaving the account.
 */
export function plannedRefund(order: PolicyOrder, lines: RefundLine[]): number {
  const gross = lines.reduce(
    (sum, line) => sum + refundableUnitPrice(order, line.unitPrice) * line.quantity,
    0,
  );

  return Math.max(0, Math.min(gross, remainingRefundable(order)));
}

export type RefundBlocker =
  | 'COD_ORDER'
  | 'NOT_PAID'
  | 'NO_GATEWAY_PAYMENT'
  | 'NOTHING_LEFT'
  | 'ZERO_AMOUNT';

export interface Refundability {
  refundable: boolean;
  blocker: RefundBlocker | null;
  /** One line an operator can act on. Never shown to the customer verbatim. */
  explanation: string;
  amount: number;
}

/**
 * Whether ZyCart can put money back through the gateway for this return.
 *
 * ## Cash on delivery is the interesting case
 *
 * A COD order's `payment.status` never becomes PAID — nothing in ZyCart records
 * cash changing hands at the door, because nothing in ZyCart witnesses it. So
 * there is no captured payment to reverse and no refund this system can issue.
 *
 * That is reported as a fact rather than hidden: the return still runs its
 * course and ends at RECEIVED, and the console says the money has to go back
 * some other way. An "Issue refund" button that always failed would be worse
 * than a sentence explaining why there is none.
 */
export function refundability(order: PolicyOrder, amount: number): Refundability {
  const no = (blocker: RefundBlocker, explanation: string): Refundability => ({
    refundable: false,
    blocker,
    explanation,
    amount,
  });

  if (order.payment.method !== 'RAZORPAY') {
    return no(
      'COD_ORDER',
      'This order was paid cash on delivery, so there is no online payment to refund. ' +
        'Arrange the refund directly with the customer.',
    );
  }

  if (order.payment.status !== 'PAID') {
    return no(
      'NOT_PAID',
      `This order's payment is ${order.payment.status.toLowerCase().replace(/_/g, ' ')}, so there ` +
        'is nothing captured to refund.',
    );
  }

  if (!order.payment.razorpayPaymentId) {
    return no(
      'NO_GATEWAY_PAYMENT',
      'No gateway payment is recorded against this order, so a refund cannot be issued from here.',
    );
  }

  if (remainingRefundable(order) <= 0) {
    return no('NOTHING_LEFT', 'The full value of this order has already been refunded.');
  }

  if (amount <= 0) {
    return no('ZERO_AMOUNT', 'There is nothing to refund for the approved quantities.');
  }

  return { refundable: true, blocker: null, explanation: '', amount };
}

/** `SIZE_ISSUE` -> `Size issue`. The presentation form of a reason. */
export function humanReturnReason(reason: ReturnReason): string {
  return reason.charAt(0) + reason.slice(1).toLowerCase().replace(/_/g, ' ');
}
