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
 * Historical totals. Shipping, discount and tax are stored as zero rather than
 * omitted, so the phases that introduce them change the numbers without
 * changing the shape.
 *
 * Whole rupees, always. Paise exist only inside a call to the Razorpay API.
 */
const pricingSchema = new Schema(
  {
    subtotal: { type: Number, required: true, min: 0 },
    shipping: { type: Number, required: true, min: 0, default: 0 },
    discount: { type: Number, required: true, min: 0, default: 0 },
    tax: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },
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
  },
  baseSchemaOptions,
);

// The order history query: this customer's orders, newest first.
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1 });

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

export type OrderDocument = InferSchemaType<typeof orderSchema>;

export const Order = model('Order', orderSchema);
