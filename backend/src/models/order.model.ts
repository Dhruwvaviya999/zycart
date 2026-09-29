import { model, Schema, type InferSchemaType } from 'mongoose';
import { baseSchemaOptions } from './shared';

export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Only what this phase can honestly claim. The enum has room for the rest. */
export const PAYMENT_METHODS = ['COD', 'RAZORPAY'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * Payment state, kept deliberately separate from order state.
 *
 * They answer different questions — "has the money moved?" versus "where is the
 * parcel?" — and an order is routinely CONFIRMED/PAID, CONFIRMED/PENDING (cash
 * on delivery) or PENDING/FAILED (online payment not completed). Collapsing
 * them into one field would make those indistinguishable.
 *
 * AUTHORIZED is the gap Razorpay leaves between a customer's bank approving a
 * payment and the merchant capturing it. ZyCart uses auto-capture, so it should
 * be transient, but it is modelled rather than assumed away.
 */
export const PAYMENT_STATUSES = [
  'PENDING',
  'AUTHORIZED',
  'PAID',
  'FAILED',
  'REFUND_PENDING',
  'REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const CANCELLABLE_STATUSES: readonly OrderStatus[] = ['PENDING', 'CONFIRMED'];

/** Money has moved and has not come back; the customer cannot self-cancel these. */
export const SETTLED_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'PAID',
  'AUTHORIZED',
  'REFUND_PENDING',
];

/**
 * A payment in one of these states may still be attempted or re-attempted.
 * Anything else has either succeeded or been refunded, and opening a fresh
 * Razorpay order against it would risk charging twice.
 */
export const PAYABLE_PAYMENT_STATUSES: readonly PaymentStatus[] = ['PENDING', 'FAILED'];

/**
 * A line as it was bought, not a pointer to what the product is now.
 *
 * Every field the order page renders is copied here at creation, so renaming,
 * repricing, re-imaging or deleting the product cannot rewrite history. The
 * `product` reference is kept as well, but only for analytics — nothing on the
 * order page reads through it.
 */
const orderItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    productName: { type: String, required: true },
    productSlug: { type: String, default: '' },
    productImage: { type: String, default: '' },
    sku: { type: String, required: true },
    brand: { type: String, default: '' },
    quantity: { type: Number, required: true, min: 1 },
    /** Whole rupees, taken from the product at the moment of purchase. */
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    selectedColor: { type: String, default: null },
    selectedSize: { type: String, default: null },

    /**
     * How many of this line are spoken for by a return.
     *
     * ## Why the counter lives here and not on the returns
     *
     * "How much of this line is still returnable?" could be answered by summing
     * over `ReturnRequest`. It would also be a race: two tabs each requesting
     * the last unit are two *inserts*, into different documents, which conflict
     * with nothing — so both would read the same remaining quantity and both
     * would succeed.
     *
     * Incrementing a counter on the order closes that window, because the guard
     * can ride in the update's own array filter. One `updateOne` with
     * `arrayFilters: [{ 'it.returnedQuantity': { $lte: quantity - requested } }]`
     * is a single atomic operation with the sufficiency check inside it — the
     * same technique `commitStock` uses to stop two customers buying the last
     * unit, for the same reason.
     *
     * ## What it counts
     *
     * Units held by a return in any of `HOLDING_RETURN_STATUSES`. A rejected or
     * cancelled request gives its units back, so the customer can ask again.
     * The invariant `returnedQuantity <= quantity` is enforced by every write,
     * and `verify-returns` asserts this counter against the return collection.
     */
    returnedQuantity: { type: Number, required: true, default: 0, min: 0 },

    /**
     * The tax facts of this line, frozen at purchase (Phase 18).
     *
     * A category's GST rate can change, and a product can move between
     * categories; neither may rewrite what an invoice for this order says. So
     * the rate, the HSN code and the split of the line into taxable value and
     * tax are copied here once, by the same `priceOrder` call that produced the
     * total the customer paid.
     *
     * `discountShare` is this line's part of any coupon discount, in whole
     * rupees — the shares of an order always sum exactly to its discount.
     * `taxableValue` and `taxAmount` are carried to the paisa; see
     * `services/pricing/pricing.ts` for why tax is the one place paise appear.
     *
     * Null on every line bought before GST was computed. Those orders have no
     * breakdown to show, and nothing reconstructs one from today's rates.
     */
    discountShare: { type: Number, min: 0, default: 0 },
    gstRate: { type: Number, min: 0, default: null },
    hsnCode: { type: String, default: '' },
    taxableValue: { type: Number, min: 0, default: null },
    taxAmount: { type: Number, min: 0, default: null },
  },
  baseSchemaOptions,
);

/** A copy, not a reference: the customer may edit or delete the address later. */
const shippingAddressSchema = new Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String, default: '' },
    landmark: { type: String, default: '' },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true },
  },
  { _id: false },
);

/**
 * Historical totals.
 *
 * Until Phase 18 shipping, discount and tax were stored as zero rather than
 * omitted, so the phase that introduced them changed the numbers without
 * changing the shape — which is what it did.
 *
 * `total = subtotal − discount + shipping`. GST is *contained* in those
 * figures, because catalogue prices are tax-inclusive; `tax` reports how much
 * of the total it is, and is never added to it. Every order written before
 * Phase 18 has `tax: 0`, so the formula reads them exactly as it always did.
 *
 * Whole rupees for everything charged. The two tax figures are carried to the
 * paisa, because GST extracted from a whole-rupee price rarely comes out whole
 * and an invoice may not round it away.
 */
const pricingSchema = new Schema(
  {
    subtotal: { type: Number, required: true, min: 0 },
    shipping: { type: Number, required: true, min: 0, default: 0 },
    discount: { type: Number, required: true, min: 0, default: 0 },
    tax: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },
    /** The GST inside `shipping`, already counted in `tax`. */
    shippingTax: { type: Number, min: 0, default: 0 },
    /** The rate delivery was taxed at — the highest rate in the basket. */
    shippingGstRate: { type: Number, min: 0, default: null },
  },
  { _id: false },
);

/**
 * The coupon this order used, as it was at the time.
 *
 * A copy rather than only a reference: an administrator can switch a code off,
 * change its value or delete it outright, and none of that may change what this
 * order says it was given. The reference is kept so a cancellation can hand
 * the use back to the right coupon.
 */
const orderCouponSchema = new Schema(
  {
    coupon: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true },
    code: { type: String, required: true },
    description: { type: String, default: '' },
    type: { type: String, required: true },
    value: { type: Number, required: true },
    /** Whole rupees, and always equal to `pricing.discount`. */
    discount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

/**
 * The tax invoice, once there is one.
 *
 * Numbered when the goods are supplied — the moment the order ships — from a
 * gap-free sequence per financial year. See `services/invoices` for why the
 * number is not issued at checkout.
 */
const orderInvoiceSchema = new Schema(
  {
    number: { type: String, required: true },
    issuedAt: { type: Date, required: true },
  },
  { _id: false },
);

/**
 * Everything needed to answer, months later, what happened to the money.
 *
 * What is deliberately absent: card number, CVV, OTP, UPI PIN, bank
 * credentials. Razorpay Checkout collects those in its own iframe and ZyCart
 * never receives them, so there is nothing here to leak. What is stored is
 * gateway identifiers, which are meaningless without the API secret.
 */
const paymentSchema = new Schema(
  {
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    status: { type: String, enum: PAYMENT_STATUSES, required: true, default: 'PENDING' },
    /** Set once a gateway is involved; null for cash on delivery. */
    provider: { type: String, default: null },

    razorpayOrderId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },

    /**
     * Razorpay orders from earlier attempts at this same ZyCart order.
     *
     * A retry after a failure opens a fresh gateway order, and the superseded
     * one has to remain traceable — a payment can still land against it, and
     * the webhook that carries it must resolve back to this order.
     */
    supersededRazorpayOrderIds: { type: [String], default: [] },

    paidAt: { type: Date, default: null },
    failureReason: { type: String, default: null },

    refundId: { type: String, default: null },
    refundedAt: { type: Date, default: null },
    refundReason: { type: String, default: null },

    /**
     * How many rupees of this order have been refunded, in total.
     *
     * ## Why a running total was needed
     *
     * Until Phase 13 there was exactly one kind of refund — "the money was
     * taken and the order cannot be fulfilled" — and it was always the whole
     * payment, so `refundId` and `refundedAt` said everything. Returns break
     * that: one order can produce several partial refunds, each with its own
     * amount and its own gateway id, and neither of those two fields can hold a
     * second one.
     *
     * The gateway ids and timestamps for return refunds therefore live on the
     * `ReturnRequest` that caused them. What has to stay on the order is the
     * figure every refund path must agree on, because it is the cap: no refund
     * may ever take the cumulative total past `pricing.total`. That check is
     * only meaningful against one number, and this is it.
     *
     * Incremented with `$inc` inside the transaction that records the refund,
     * never recomputed from a sum — so a refund that was issued at the gateway
     * cannot be forgotten by a later read.
     */
    refundedAmount: { type: Number, required: true, default: 0, min: 0 },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    /** The number the customer quotes. Never the ObjectId. */
    orderNumber: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    items: { type: [orderItemSchema], required: true },
    shippingAddress: { type: shippingAddressSchema, required: true },
    pricing: { type: pricingSchema, required: true },
    payment: { type: paymentSchema, required: true },

    /** Null when no coupon was used, and on every order before Phase 18. */
    coupon: { type: orderCouponSchema, default: null },

    /** Null until the order ships. */
    invoice: { type: orderInvoiceSchema, default: null },

    status: { type: String, enum: ORDER_STATUSES, required: true, default: 'PENDING' },

    /**
     * Whether this order is currently holding stock.
     *
     * The two payment methods take stock at different moments — cash on
     * delivery at creation, online payment only once the money is confirmed —
     * so "was stock taken?" stopped being derivable from the order's status the
     * moment Razorpay was added. Cancellation reads this to decide whether
     * there is anything to give back, which is what stops an abandoned online
     * order from inventing inventory on its way to CANCELLED.
     */
    stockCommitted: { type: Boolean, required: true, default: false },

    /**
     * The cart lines this order was built from.
     *
     * An online order clears the cart at payment, not at creation, so the lines
     * to remove have to be remembered across that gap. Removing by id means
     * anything the customer added in another tab meanwhile survives.
     */
    sourceCartItemIds: { type: [Schema.Types.ObjectId], default: [] },

    cancellationReason: { type: String, default: null },
    cancelledAt: { type: Date, default: null },

    /**
     * When this order was recorded as delivered.
     *
     * ## Why it had to exist
     *
     * The return window is counted from delivery, and before Phase 13 nothing
     * on the order recorded when that was. The audit trail knew — every
     * administrative status change writes a row — but a policy that decides
     * whether a customer may return something should not depend on a log that
     * exists for a different purpose and that a retention policy could one day
     * trim.
     *
     * Written by `transitionOrderStatus` in the same transaction as the move to
     * DELIVERED, and by nothing else.
     *
     * ## Orders delivered before this field existed
     *
     * Null, and deliberately not filled in with a guess. `migrate-phase13`
     * backfills it from the audit row that recorded the transition, which is a
     * timestamp somebody actually wrote down. Where no such row exists — an
     * order delivered before Phase 12's audit trail — it stays null, and the
     * return flow refuses rather than inventing a start date for a window it
     * cannot honestly compute. The customer is told to contact support.
     */
    deliveredAt: { type: Date, default: null },
  },
  baseSchemaOptions,
);

// The order history query: this customer's orders, newest first.
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1 });

/**
 * Delivered orders in a window — the denominator of the return rate.
 *
 * Added rather than leaning on `{ status: 1 }` because that index cannot serve
 * the date range, and the returns dashboard would otherwise scan every
 * delivered order ZyCart has ever had to count the last thirty days of them.
 */
orderSchema.index({ status: 1, deliveredAt: -1 });

/**
 * One Razorpay order belongs to exactly one ZyCart order, enforced by the
 * database rather than by remembering to check.
 *
 * Partial rather than sparse: cash-on-delivery orders store `null` here, and a
 * plain unique index would let only one of them exist. This is also the index
 * the webhook uses to resolve an incoming payment back to an order.
 */
orderSchema.index(
  { 'payment.razorpayOrderId': 1 },
  { unique: true, partialFilterExpression: { 'payment.razorpayOrderId': { $type: 'string' } } },
);

/** Resolves a webhook that arrives against a superseded attempt. */
orderSchema.index({ 'payment.supersededRazorpayOrderIds': 1 });

/**
 * An invoice number identifies one invoice, for ever.
 *
 * Partial for the same reason as the Razorpay index above: every order that has
 * not shipped stores null, and a plain unique index would admit only one.
 */
orderSchema.index(
  { 'invoice.number': 1 },
  { unique: true, partialFilterExpression: { 'invoice.number': { $type: 'string' } } },
);

/**
 * The reminder job's failed-payment sweep: unpaid online orders by how long
 * ago they last changed.
 */
orderSchema.index({ 'payment.status': 1, status: 1, updatedAt: -1 });

export type OrderDocument = InferSchemaType<typeof orderSchema>;

export const Order = model('Order', orderSchema);
