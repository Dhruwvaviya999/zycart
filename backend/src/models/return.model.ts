import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

/**
 * What happens after delivery.
 *
 * ## The fourth lifecycle
 *
 * ZyCart already tracked three things separately, on purpose: what happened to
 * the order, what happened to the money, and — from Phase 13 — where the parcel
 * is. A return is the fourth, and it is not derivable from any of them. An
 * order is DELIVERED, its payment is PAID, its shipment is DELIVERED, and the
 * customer wants one of two pairs of shoes sent back. Nothing in those three
 * states can express that, so this document owns it.
 *
 * ## The quantity authority is not here
 *
 * How much of an order line is spoken for lives on the **order**, in
 * `items[].returnedQuantity`, not in an aggregate over this collection. That is
 * deliberate and it is the whole concurrency story: two browser tabs requesting
 * the last returnable unit are two inserts into *this* collection, which do not
 * conflict with each other, and no amount of reading before writing closes that
 * window. Incrementing a counter on one shared document does close it — the
 * guard rides in the update's array filter, exactly as `commitStock` puts the
 * stock check in its own filter. See `reserveReturnQuantities`.
 *
 * This document records *which* units and *why*. The order records *how many*
 * are no longer available to return.
 */

export const RETURN_STATUSES = [
  /** The customer has asked. Nothing has been decided. */
  'REQUESTED',
  /** An operator agreed. The customer is expected to send the goods back. */
  'APPROVED',
  /** An operator declined, with a reason the customer can read. */
  'REJECTED',
  /** The goods are physically back. Whether they are resellable is a separate call. */
  'RECEIVED',
  /** A refund has been issued at the gateway and has not settled yet. */
  'REFUND_PENDING',
  /** The money is back with the customer. */
  'REFUNDED',
  /** The customer changed their mind before sending anything. */
  'CANCELLED',
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

/**
 * The legal moves, declared once and enforced by the service.
 *
 * Two properties are worth naming:
 *
 *  - **REFUND_PENDING can go back to RECEIVED.** A refund that the gateway
 *    reports as failed has not happened, and the return must return to the
 *    state it can be retried from. Pretending a failed refund is a terminal
 *    state would strand the money.
 *  - **RECEIVED is terminal for a cash-on-delivery order.** There is no gateway
 *    payment to reverse, so there is no REFUNDED to reach. The interface says
 *    so in words rather than leaving an operator hunting for a button that
 *    would always be refused. See `refundability`.
 */
export const RETURN_STATUS_FLOW: Readonly<Record<ReturnStatus, readonly ReturnStatus[]>> = {
  REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['RECEIVED', 'CANCELLED'],
  RECEIVED: ['REFUND_PENDING', 'REFUNDED'],
  REFUND_PENDING: ['REFUNDED', 'RECEIVED'],
  REJECTED: [],
  REFUNDED: [],
  CANCELLED: [],
};

/**
 * Statuses that still hold units against the order line.
 *
 * A rejected or cancelled request releases what it asked for, so the customer
 * can ask again — for the right quantity, or with the right reason. Everything
 * else keeps its hold: a refunded unit is gone from the returnable pool for
 * good, and an approved one is on its way back.
 *
 * This list and `releaseReturnQuantities` are two halves of one rule; the test
 * suite asserts that every status is in exactly one of them.
 */
export const HOLDING_RETURN_STATUSES: readonly ReturnStatus[] = [
  'REQUESTED',
  'APPROVED',
  'RECEIVED',
  'REFUND_PENDING',
  'REFUNDED',
];

/** Statuses an operator still has work to do on. Drives the admin queue's default. */
export const OPEN_RETURN_STATUSES: readonly ReturnStatus[] = [
  'REQUESTED',
  'APPROVED',
  'RECEIVED',
  'REFUND_PENDING',
];

/**
 * Why the customer is sending it back.
 *
 * A controlled vocabulary rather than free text, for the same reason
 * `ADJUSTMENT_REASONS` is one: "too small", "Size issue" and "doesn't fit" are
 * one line on a report instead of three. The optional note carries the detail.
 *
 * The list is split by who is at fault, because that is the distinction an
 * operator acts on — a damaged item is a warehouse or carrier problem, a
 * changed mind is not — and because it is what any future policy on who pays
 * return shipping would key off.
 */
export const RETURN_REASONS = [
  /** Ours: the wrong thing was picked. */
  'WRONG_ITEM',
  /** Ours or the carrier's: it arrived broken. */
  'DAMAGED',
  /** The manufacturer's: it arrived intact and does not work. */
  'DEFECTIVE',
  /** Nobody's: it does not fit. */
  'SIZE_ISSUE',
  /** Nobody's: the listing and the object disagreed in the customer's judgement. */
  'NOT_AS_EXPECTED',
  /** The customer's. */
  'CHANGED_MIND',
  'OTHER',
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

/**
 * Reasons that mean the goods arrived in a state ZyCart would not sell.
 *
 * Used only to set the *default* of the resellable checkbox when an operator
 * marks a return received — never to decide it. The person holding the item
 * decides whether it can be sold again; this just stops the form defaulting to
 * "put it back on the shelf" for something the customer said was broken.
 */
export const DAMAGE_REASONS: readonly ReturnReason[] = ['DAMAGED', 'DEFECTIVE'];

export const MAX_RETURN_NOTE_LENGTH = 500;
export const MAX_RETURN_ITEMS = 20;

/**
 * How long after delivery a return may be started.
 *
 * ## The rule, stated once
 *
 * Thirty whole days, counted from the moment delivery was recorded, in the
 * server's timezone. The window closes at the *end* of the thirtieth day rather
 * than at the same clock time thirty days later, so a parcel delivered at
 * 11:58 pm does not get eleven hours less than one delivered at noon.
 *
 * Weekends and public holidays are not excluded. ZyCart has no holiday
 * calendar, and inventing one would make the rule depend on data nobody
 * maintains.
 *
 * ## Why thirty, and not a number chosen here
 *
 * Because the storefront had already promised it. "30-day returns" appears on
 * every product page and in the site footer, and those predate this phase — so
 * the number was never actually an open decision. Shipping an enforced window
 * of fourteen days would have meant the server quietly refusing returns the
 * shop was still advertising, which is the worst of both: a real rule and a
 * broken promise.
 *
 * If that promise ever changes, this constant and those two strings must move
 * together. They are marked with a pointer back here for exactly that reason.
 *
 * ## Why it lives here and only here
 *
 * One constant, exported, read by the eligibility check, by the API response
 * that tells the browser when the window closes, and by the documentation. The
 * number does not appear anywhere else in the backend — the failure mode this
 * avoids is four copies of `30` that stop agreeing the day somebody edits one.
 *
 * ## Orders delivered before ZyCart recorded delivery dates
 *
 * The clock starts at `Order.deliveredAt`. An order that has no such timestamp
 * has no window that can be computed honestly, and it is refused rather than
 * being given an unbounded one or a fabricated start. See `returnability`.
 */
export const RETURN_WINDOW_DAYS = 30;

/**
 * One line of a return, as it was bought.
 *
 * The product name, SKU, variant and unit price are copied from the order's own
 * snapshot — which was itself copied from the catalogue at purchase. Nothing
 * here is ever re-read from the live `Product`, so repricing an item cannot
 * change what a refund for a six-week-old order is worth.
 */
const returnItemSchema = new Schema(
  {
    /**
     * The `_id` of the line inside `Order.items`.
     *
     * The identity of a returned line is its position in that order, not the
     * product — an order can contain the same product twice in different sizes,
     * and those are different returnable lines.
     */
    orderItemId: { type: Schema.Types.ObjectId, required: true },

    /** Kept for analytics only, exactly as the order line does. Null if deleted. */
    product: { type: Schema.Types.ObjectId, ref: 'Product', default: null },

    productName: { type: String, required: true },
    productImage: { type: String, default: '' },
    sku: { type: String, default: '' },
    selectedColor: { type: String, default: null },
    selectedSize: { type: String, default: null },

    /** Whole rupees, from the order line. Never from the catalogue. */
    unitPrice: { type: Number, required: true, min: 0 },
    /** How many of this line the order contained, for context on the admin screen. */
    purchasedQuantity: { type: Number, required: true, min: 1 },

    requestedQuantity: { type: Number, required: true, min: 1 },

    /**
     * What the operator agreed to, which may be less than was asked for.
     *
     * Null until a decision is made. The refund is computed from this once it
     * is set, never from the requested figure — approving one of two units and
     * refunding both is precisely the class of mistake this separation exists
     * to make impossible.
     */
    approvedQuantity: { type: Number, default: null },

    reason: { type: String, enum: RETURN_REASONS, required: true },
  },
  baseSchemaOptions,
);

/**
 * The money going back, as a record of gateway facts.
 *
 * ## Why this is not on the order's payment sub-document
 *
 * `Order.payment` holds one `refundId` and one `refundedAt`, because the only
 * refund Phase 7 performed was "the whole order could not be fulfilled". A
 * partial return produces a *second* refund against the same payment, with its
 * own amount and its own gateway id, and there is nowhere on that sub-document
 * to put it without either overwriting the first or inventing an array whose
 * ordering means nothing.
 *
 * So each return owns its refund, and the order keeps a running
 * `payment.refundedAmount` that every refund path increments. That figure is
 * the one thing both paths must agree on, and it is what caps any further
 * refund at what is actually left.
 */
const returnRefundSchema = new Schema(
  {
    /**
     * Whole rupees, computed on the server from the order snapshot.
     *
     * There is no field anywhere in this phase through which a client can
     * suggest a refund amount. This is written by `plannedRefund`, which reads
     * approved quantities and historical unit prices and nothing else.
     */
    amount: { type: Number, default: 0, min: 0 },

    /**
     * The moment this return was claimed for refunding.
     *
     * Set by the same atomic update that moves the status to REFUND_PENDING,
     * and cleared if the gateway call fails. Its presence is what makes a
     * double-clicked "Issue refund" button harmless: the second update matches
     * nothing because this is no longer null.
     */
    claimedAt: { type: Date, default: null },

    razorpayRefundId: { type: String, default: null },
    initiatedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    /**
     * Why the last attempt did not work, in ZyCart's words rather than the
     * gateway's.
     *
     * Kept after a later success as well — a refund that failed twice before
     * settling is worth knowing about — and cleared only when a new attempt
     * starts.
     */
    failureReason: { type: String, default: null },
    failedAt: { type: Date, default: null },

    initiatedByName: { type: String, default: '' },
  },
  { _id: false },
);

const returnRequestSchema = new Schema(
  {
    /** The number the customer quotes. Never the ObjectId. */
    returnNumber: { type: String, required: true, unique: true },

    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    /** Snapshotted so an admin row and a customer list render without a join. */
    orderNumber: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    status: { type: String, enum: RETURN_STATUSES, required: true, default: 'REQUESTED' },

    items: { type: [returnItemSchema], required: true },

    /** The customer's own words. Rendered as text, never as markup. */
    customerNote: { type: String, trim: true, maxlength: MAX_RETURN_NOTE_LENGTH, default: '' },

    /**
     * The explanation the **customer** sees on a decision.
     *
     * Written by the operator when they approve or reject, and deliberately
     * distinct from `adminNote` below. Two fields rather than one because a
     * single note would either be withheld from the customer — leaving a
     * rejection with no reason — or shown to them, which would put internal
     * commentary in front of the person it is about.
     */
    resolutionNote: { type: String, trim: true, maxlength: MAX_RETURN_NOTE_LENGTH, default: '' },

    /**
     * Internal only. Never serialised onto any customer-facing response.
     *
     * The customer projection is built by naming fields rather than by deleting
     * them, so this cannot leak by somebody forgetting a `delete`.
     */
    adminNote: { type: String, trim: true, maxlength: MAX_RETURN_NOTE_LENGTH, default: '' },

    /** Only ever set when the thing happened. Absent means it has not. */
    requestedAt: { type: Date, required: true },
    decidedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },

    /** The operator behind the decision, by reference and by name. */
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedByName: { type: String, default: '' },

    /**
     * Whether the goods came back in a state ZyCart would sell again.
     *
     * Null until the return is received, and then an explicit yes or no made by
     * the person holding the item. It is **not** inferred from the return
     * reason: a customer who selected "changed mind" may still have worn them.
     *
     * Only `true` restocks, and the restock goes through the Phase 12 inventory
     * path so it lands in the ledger like every other movement.
     */
    resellable: { type: Boolean, default: null },
    /** True once units have actually been put back, so it cannot happen twice. */
    restocked: { type: Boolean, required: true, default: false },

    refund: { type: returnRefundSchema, default: () => ({}) },
  },
  baseSchemaOptions,
);

/** The customer's return history, newest first. */
returnRequestSchema.index({ user: 1, createdAt: -1 });

/** "Everything that has been returned from this order." */
returnRequestSchema.index({ order: 1, createdAt: -1 });

/** The admin queue, filtered by state and paged. */
returnRequestSchema.index({ status: 1, createdAt: -1 });

/**
 * Resolving a Razorpay refund webhook back to the return that caused it.
 *
 * Partial, because a refund id exists only once one has actually been issued,
 * and that is a minority of returns.
 */
returnRequestSchema.index(
  { 'refund.razorpayRefundId': 1 },
  { partialFilterExpression: { 'refund.razorpayRefundId': { $type: 'string' } } },
);

export type ReturnRequestDocument = InferSchemaType<typeof returnRequestSchema>;

export const ReturnRequest = model('ReturnRequest', returnRequestSchema);
