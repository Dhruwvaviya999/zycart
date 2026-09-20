import type { Env } from '../../config/env';
import { Order, type OrderStatus, type PaymentStatus } from '../../models/order.model';
import { ReturnRequest } from '../../models/return.model';
import { Shipment } from '../../models/shipment.model';
import { AppError } from '../../utils/AppError';
import { setOrderStatus } from '../order.service';
import type { AuditActor } from './audit.service';

/**
 * Orders that need a person.
 *
 * ## The rule this file obeys
 *
 * Every condition below is decidable from what is already stored. Nothing here
 * infers, estimates or guesses: an alert an operator cannot verify by opening
 * the order is an alert they will learn to ignore, and once they ignore one
 * they ignore the panel. So there is no "likely fraud", no "at risk of
 * cancellation" and no scoring — only facts about state and elapsed time, each
 * with an action attached.
 *
 * ## Why each rule is written twice
 *
 * A rule needs a Mongo filter (to count and to page through matching orders)
 * and a JavaScript predicate (to tell a row *which* rule flagged it). Those
 * cannot be derived from one another, so they are written side by side and
 * checked against each other by a test that runs both over the same sample
 * orders. Keeping them adjacent is what makes the duplication reviewable;
 * the test is what keeps it honest.
 */

const HOUR = 60 * 60 * 1000;

/**
 * How long an online payment may sit unfinished before it is worth looking at.
 *
 * Most abandoned Razorpay windows are simply shoppers who changed their mind,
 * and flagging those within minutes would bury the panel. A full day is long
 * enough that the customer is not coming back on their own, and short enough
 * that following up still makes sense.
 */
const PAYMENT_STALL_HOURS = 24;

/**
 * How long a confirmed order may sit before dispatch is overdue.
 *
 * Three days is a warehouse-service assumption rather than a law of commerce,
 * and it is stated here so it can be argued with. It is deliberately not
 * configurable: a setting nobody ever changes is a setting that hides the
 * assumption instead of exposing it.
 */
const FULFILMENT_STALL_DAYS = 3;

export const ATTENTION_KEYS = [
  'PAYMENT_FAILED',
  'PAYMENT_STALLED',
  'REFUND_PENDING',
  'PAID_NOT_CONFIRMED',
  'STOCK_NOT_HELD',
  'FULFILMENT_OVERDUE',
] as const;
export type AttentionKey = (typeof ATTENTION_KEYS)[number];

export type AttentionSeverity = 'critical' | 'warning';

/** The order fields every rule below is allowed to read. */
export interface AttentionOrder {
  status: OrderStatus;
  stockCommitted: boolean;
  createdAt: Date;
  payment: { method: string; status: PaymentStatus };
}

interface AttentionRule {
  key: AttentionKey;
  label: string;
  /** What an operator should do about it, in one line. */
  action: string;
  severity: AttentionSeverity;
  /** The Mongo form, for counting and paging. */
  filter: (now: Date) => Record<string, unknown>;
  /** The same condition in JavaScript, for labelling a row. */
  matches: (order: AttentionOrder, now: Date) => boolean;
}

const ago = (now: Date, ms: number): Date => new Date(now.getTime() - ms);

const OPEN_STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED'];

export const ATTENTION_RULES: readonly AttentionRule[] = [
  {
    key: 'PAYMENT_FAILED',
    label: 'Payment failed',
    action: 'The customer can retry from their order page, or the order can be cancelled.',
    severity: 'critical',
    filter: () => ({
      status: { $ne: 'CANCELLED' },
      'payment.method': 'RAZORPAY',
      'payment.status': 'FAILED',
    }),
    matches: (order) =>
      order.status !== 'CANCELLED' &&
      order.payment.method === 'RAZORPAY' &&
      order.payment.status === 'FAILED',
  },
  {
    key: 'PAYMENT_STALLED',
    /** Not "abandoned": the customer may still pay, and the wording should not decide that. */
    label: 'Payment not completed',
    action: `Unpaid for more than ${PAYMENT_STALL_HOURS} hours. Worth chasing or cancelling.`,
    severity: 'warning',
    filter: (now) => ({
      status: 'PENDING',
      'payment.method': 'RAZORPAY',
      'payment.status': { $in: ['PENDING', 'AUTHORIZED'] },
      createdAt: { $lt: ago(now, PAYMENT_STALL_HOURS * HOUR) },
    }),
    matches: (order, now) =>
      order.status === 'PENDING' &&
      order.payment.method === 'RAZORPAY' &&
      (order.payment.status === 'PENDING' || order.payment.status === 'AUTHORIZED') &&
      order.createdAt < ago(now, PAYMENT_STALL_HOURS * HOUR),
  },
  {
    key: 'REFUND_PENDING',
    label: 'Refund owed',
    action: 'Money was taken and a refund was started but has not settled. Check Razorpay.',
    severity: 'critical',
    filter: () => ({ 'payment.status': 'REFUND_PENDING' }),
    matches: (order) => order.payment.status === 'REFUND_PENDING',
  },
  {
    /**
     * Paid, but still sitting in PENDING.
     *
     * Finalisation sets CONFIRMED and PAID in one atomic update, so this pair
     * should be unreachable. It is checked anyway precisely because it should
     * be: if it ever appears, something has written payment state outside that
     * path, and an operator finding out from this panel is far better than
     * finding out from a customer.
     */
    key: 'PAID_NOT_CONFIRMED',
    label: 'Paid but not confirmed',
    action: 'The payment landed but the order never moved on. Confirm it and check the logs.',
    severity: 'critical',
    filter: () => ({ status: 'PENDING', 'payment.status': 'PAID' }),
    matches: (order) => order.status === 'PENDING' && order.payment.status === 'PAID',
  },
  {
    /**
     * In flight without holding stock.
     *
     * `stockCommitted` is what every cancellation reads to decide whether there
     * is inventory to give back, so an order past PENDING with it false means
     * the catalogue never gave up the units this order is about to ship.
     */
    key: 'STOCK_NOT_HELD',
    label: 'Stock not held',
    action: 'This order is in progress but never took stock. Check inventory before dispatch.',
    severity: 'critical',
    filter: () => ({
      status: { $in: ['CONFIRMED', 'PROCESSING', 'SHIPPED'] },
      stockCommitted: false,
    }),
    matches: (order) =>
      ['CONFIRMED', 'PROCESSING', 'SHIPPED'].includes(order.status) && !order.stockCommitted,
  },
  {
    key: 'FULFILMENT_OVERDUE',
    label: 'Not dispatched',
    action: `Confirmed more than ${FULFILMENT_STALL_DAYS} days ago and still not shipped.`,
    severity: 'warning',
    filter: (now) => ({
      status: { $in: ['CONFIRMED', 'PROCESSING'] },
      createdAt: { $lt: ago(now, FULFILMENT_STALL_DAYS * 24 * HOUR) },
    }),
    matches: (order, now) =>
      (order.status === 'CONFIRMED' || order.status === 'PROCESSING') &&
      order.createdAt < ago(now, FULFILMENT_STALL_DAYS * 24 * HOUR),
  },
];

/**
 * One filter matching every order any rule would flag.
 *
 * The orders list and the counts both build on this, so "needs attention" means
 * the same thing in the queue, in the badge and on the dashboard.
 */
export function attentionFilter(now: Date = new Date()): Record<string, unknown> {
  return { $or: ATTENTION_RULES.map((rule) => rule.filter(now)) };
}

export interface AttentionFlag {
  key: AttentionKey;
  label: string;
  action: string;
  severity: AttentionSeverity;
}

/** Every rule this order trips. An order can trip more than one. */
export function attentionFlags(order: AttentionOrder, now: Date = new Date()): AttentionFlag[] {
  return ATTENTION_RULES.filter((rule) => rule.matches(order, now)).map((rule) => ({
    key: rule.key,
    label: rule.label,
    action: rule.action,
    severity: rule.severity,
  }));
}

export interface AttentionBreakdown {
  key: AttentionKey;
  label: string;
  action: string;
  severity: AttentionSeverity;
  count: number;
}

export interface OperationsSummary {
  /**
   * Distinct orders needing attention.
   *
   * Counted separately from the breakdown rather than summed from it, because
   * one order can trip several rules and "9 things to look at" across 4 orders
   * would overstate the work. The breakdown says what kinds; this says how many
   * orders an operator actually has to open.
   */
  ordersNeedingAttention: number;
  breakdown: AttentionBreakdown[];
  /** Fulfilment queue depth, as counts an operator can click through. */
  queue: { pending: number; confirmed: number; processing: number; shipped: number };
  /**
   * What has stalled after the sale: returns and parcels.
   *
   * Kept in its own list rather than merged into `breakdown`, because those
   * count orders and these count returns and shipments. Summing them would
   * produce a total of unlike things, and clicking one would land in a
   * different queue from clicking its neighbour without warning.
   */
  postPurchase: PostPurchaseBreakdown[];
  checkedAt: string;
}

export async function getOperationsSummary(): Promise<OperationsSummary> {
  const now = new Date();

  const [ordersNeedingAttention, counts, statusCounts, postPurchase] = await Promise.all([
    Order.countDocuments(attentionFilter(now)),
    Promise.all(ATTENTION_RULES.map((rule) => Order.countDocuments(rule.filter(now)))),
    Order.aggregate<{ _id: OrderStatus; count: number }>([
      { $match: { status: { $in: OPEN_STATUSES } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    getPostPurchaseExceptions(now),
  ]);

  const byStatus = new Map(statusCounts.map((row) => [row._id, row.count]));

  return {
    ordersNeedingAttention,
    breakdown: ATTENTION_RULES.map((rule, index) => ({
      key: rule.key,
      label: rule.label,
      action: rule.action,
      severity: rule.severity,
      count: counts[index] ?? 0,
    })).filter((entry) => entry.count > 0),
    queue: {
      pending: byStatus.get('PENDING') ?? 0,
      confirmed: byStatus.get('CONFIRMED') ?? 0,
      processing: byStatus.get('PROCESSING') ?? 0,
      shipped: byStatus.get('SHIPPED') ?? 0,
    },
    postPurchase,
    checkedAt: now.toISOString(),
  };
}

/* ---------------------------------------------------------------- */
/* Post-purchase exceptions (Phase 13)                               */
/* ---------------------------------------------------------------- */

/**
 * What has stalled after the sale.
 *
 * ## Why these are counted separately from the order rules above
 *
 * The rules at the top of this file are predicates over an `Order`, written
 * twice — as a Mongo filter and as a JavaScript matcher — so a row in the
 * orders list can say which rule flagged it. These are predicates over a
 * `Shipment` or a `ReturnRequest`, and there is no order row to label with
 * them: an order whose refund has stalled is not itself in a bad state, its
 * return is.
 *
 * So they are counts with a link each, rather than flags. Each one names the
 * queue it came from and the filter that lists it, which is what makes them
 * actionable — a number an operator cannot click through to is a number they
 * learn to ignore.
 *
 * ## The same honesty rule applies
 *
 * Every condition below is decidable from a stored timestamp and a stored
 * status. There is no "likely to be disputed", no risk score and no prediction.
 * An operator can verify any of these by opening the record.
 */

/** How long a return may sit unreviewed before it is worth chasing. */
const RETURN_REVIEW_HOURS = 24;

/**
 * How long ZyCart waits for approved goods to come back.
 *
 * Seven days is a postal assumption rather than a policy — nothing expires at
 * it, and the return stays open. It is the point at which somebody should ask
 * the customer whether they have sent it.
 */
const RETURN_TRANSIT_DAYS = 7;

/** How long after receipt an unrefunded return is overdue. */
const REFUND_DUE_DAYS = 2;

/**
 * How long a refund may sit at the gateway before it is worth checking.
 *
 * Razorpay's normal-speed refunds settle in five to seven working days through
 * a bank, so three days is early enough to catch a stuck one and late enough
 * not to flag every healthy refund on its second morning.
 */
const REFUND_STALL_DAYS = 3;

export const POST_PURCHASE_KEYS = [
  'RETURN_REVIEW_DUE',
  'RETURN_AWAITING_GOODS',
  'RETURN_REFUND_DUE',
  'RETURN_REFUND_STALLED',
  'RETURN_REFUND_FAILED',
  'SHIPMENT_EXCEPTION',
  'DELIVERY_OVERDUE',
] as const;
export type PostPurchaseKey = (typeof POST_PURCHASE_KEYS)[number];

interface PostPurchaseRule {
  key: PostPurchaseKey;
  label: string;
  action: string;
  severity: AttentionSeverity;
  /** Which collection to count in. */
  source: 'RETURN' | 'SHIPMENT';
  filter: (now: Date) => Record<string, unknown>;
  /** Where the console sends an operator who clicks it. */
  href: string;
}

export const POST_PURCHASE_RULES: readonly PostPurchaseRule[] = [
  {
    key: 'RETURN_REVIEW_DUE',
    label: 'Returns awaiting review',
    action: `Requested more than ${RETURN_REVIEW_HOURS} hours ago and not yet approved or rejected.`,
    severity: 'warning',
    source: 'RETURN',
    filter: (now) => ({
      status: 'REQUESTED',
      requestedAt: { $lt: ago(now, RETURN_REVIEW_HOURS * HOUR) },
    }),
    href: '/admin/returns?status=REQUESTED&sort=oldest',
  },
  {
    key: 'RETURN_AWAITING_GOODS',
    label: 'Approved, nothing received',
    action: `Approved more than ${RETURN_TRANSIT_DAYS} days ago and the goods have not arrived.`,
    severity: 'warning',
    source: 'RETURN',
    filter: (now) => ({
      status: 'APPROVED',
      decidedAt: { $lt: ago(now, RETURN_TRANSIT_DAYS * 24 * HOUR) },
    }),
    href: '/admin/returns?status=APPROVED&sort=oldest',
  },
  {
    key: 'RETURN_REFUND_DUE',
    label: 'Refunds not started',
    action: `Goods received more than ${REFUND_DUE_DAYS} days ago and no refund has been issued.`,
    severity: 'critical',
    source: 'RETURN',
    filter: (now) => ({
      status: 'RECEIVED',
      receivedAt: { $lt: ago(now, REFUND_DUE_DAYS * 24 * HOUR) },
      'refund.failureReason': null,
    }),
    href: '/admin/returns?status=RECEIVED&sort=oldest',
  },
  {
    key: 'RETURN_REFUND_STALLED',
    label: 'Refunds not settled',
    action: `Sent to Razorpay more than ${REFUND_STALL_DAYS} days ago and still pending. Check the gateway.`,
    severity: 'critical',
    source: 'RETURN',
    filter: (now) => ({
      status: 'REFUND_PENDING',
      'refund.initiatedAt': { $lt: ago(now, REFUND_STALL_DAYS * 24 * HOUR) },
    }),
    href: '/admin/returns?status=REFUND_PENDING&sort=oldest',
  },
  {
    /**
     * A refund ZyCart tried to issue and could not.
     *
     * Critical and unconditioned on elapsed time, because this is money the
     * customer is owed and an attempt has already visibly failed. The return
     * sits back at RECEIVED so it can be retried; this is what makes sure
     * somebody does.
     */
    key: 'RETURN_REFUND_FAILED',
    label: 'Refund attempts failed',
    action: 'A refund was attempted and the gateway refused it. Open the return and try again.',
    severity: 'critical',
    source: 'RETURN',
    filter: () => ({ status: 'RECEIVED', 'refund.failureReason': { $ne: null } }),
    href: '/admin/returns?status=RECEIVED',
  },
  {
    key: 'SHIPMENT_EXCEPTION',
    label: 'Shipments in exception',
    action: 'A parcel reported a problem in transit. Contact the carrier or the customer.',
    severity: 'critical',
    source: 'SHIPMENT',
    filter: () => ({ status: 'EXCEPTION' }),
    href: '/admin/orders?status=SHIPPED',
  },
  {
    /**
     * Past its own estimate.
     *
     * Decidable only because the estimate was typed in by a person — there is
     * no transit-time model here inventing one. A parcel with no estimate can
     * never trip this rule, which is correct: nothing was promised.
     */
    key: 'DELIVERY_OVERDUE',
    label: 'Deliveries overdue',
    action: 'Past the estimated delivery date and not yet delivered.',
    severity: 'warning',
    source: 'SHIPMENT',
    filter: (now) => ({
      status: { $in: ['SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'EXCEPTION'] },
      estimatedDeliveryAt: { $ne: null, $lt: now },
    }),
    href: '/admin/orders?status=SHIPPED',
  },
];

export interface PostPurchaseBreakdown {
  key: PostPurchaseKey;
  label: string;
  action: string;
  severity: AttentionSeverity;
  href: string;
  count: number;
}

/**
 * Counts every post-purchase rule, in one round of parallel counts.
 *
 * Seven `countDocuments` rather than an aggregation, because each rule targets
 * a different shape and every one of them is served by an index — the return
 * queue's `{ status, createdAt }`, the shipment queue's `{ status, createdAt }`
 * and the partial index on `estimatedDeliveryAt`. An aggregation would have to
 * scan to produce what seven indexed counts answer directly.
 */
export async function getPostPurchaseExceptions(
  now: Date = new Date(),
): Promise<PostPurchaseBreakdown[]> {
  const counts = await Promise.all(
    POST_PURCHASE_RULES.map((rule) =>
      rule.source === 'RETURN'
        ? ReturnRequest.countDocuments(rule.filter(now))
        : Shipment.countDocuments(rule.filter(now)),
    ),
  );

  return POST_PURCHASE_RULES.map((rule, index) => ({
    key: rule.key,
    label: rule.label,
    action: rule.action,
    severity: rule.severity,
    href: rule.href,
    count: counts[index] ?? 0,
  })).filter((entry) => entry.count > 0);
}

/* ---------------------------------------------------------------- */
/* Bulk fulfilment                                                   */
/* ---------------------------------------------------------------- */

/**
 * How many orders one bulk action may touch.
 *
 * Each one runs its own transaction — see below for why — so this is a bound on
 * how long a single request may hold the event loop, and on how much damage one
 * mistaken click can do. Fifty is a page and a half of the orders list.
 */
export const BULK_LIMIT = 50;

export interface BulkOutcome {
  orderNumber: string;
  ok: boolean;
  /** Why it was skipped, in the same words the single-order action would use. */
  message: string;
}

export interface BulkResult {
  requested: number;
  succeeded: number;
  failed: number;
  outcomes: BulkOutcome[];
}

/**
 * Moves several orders to the same status.
 *
 * ## Deliberately not one transaction
 *
 * Twenty orders moved together, where one illegal transition rolls back the
 * other nineteen, is not what an operator selecting twenty orders wants. They
 * want the nineteen that can move to move, and to be told about the one that
 * could not. So each order runs `setOrderStatus` on its own — the *same*
 * function, with the same transition rules, the same inventory restoration and
 * the same audit row as moving one order by hand — and the failures are
 * collected rather than thrown.
 *
 * That makes this a convenience over the single-order operation and nothing
 * more. There is no bulk rule, no bulk shortcut and no bulk-only code path that
 * could drift from what the buttons on an order page do.
 *
 * Sequential rather than concurrent, because each transition opens a
 * transaction and fifty at once would be fifty concurrent sessions for an
 * operator's single click.
 */
export async function bulkUpdateOrderStatus(
  env: Env,
  orderNumbers: string[],
  status: OrderStatus,
  actor: AuditActor,
  note?: string,
): Promise<BulkResult> {
  if (orderNumbers.length === 0) {
    throw new AppError('Select at least one order', 400);
  }

  if (orderNumbers.length > BULK_LIMIT) {
    throw new AppError(`Up to ${BULK_LIMIT} orders can be updated at once`, 400);
  }

  const outcomes: BulkOutcome[] = [];

  // `Set` rather than the raw array: the same order selected twice must not be
  // attempted twice, and the second attempt would fail confusingly anyway.
  for (const orderNumber of new Set(orderNumbers)) {
    try {
      await setOrderStatus(env, orderNumber, status, note, actor);
      outcomes.push({ orderNumber, ok: true, message: '' });
    } catch (error) {
      outcomes.push({
        orderNumber,
        ok: false,
        message:
          error instanceof AppError
            ? error.message
            : 'This order could not be updated. Open it to see why.',
      });
    }
  }

  const succeeded = outcomes.filter((outcome) => outcome.ok).length;

  return {
    requested: outcomes.length,
    succeeded,
    failed: outcomes.length - succeeded,
    outcomes,
  };
}
