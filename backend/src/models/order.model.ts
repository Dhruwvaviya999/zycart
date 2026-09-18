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
export const PAYMENT_METHODS = ['COD'] as const;
export const PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'] as const;

export const CANCELLABLE_STATUSES: readonly OrderStatus[] = ['PENDING', 'CONFIRMED'];

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

const paymentSchema = new Schema(
  {
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    status: { type: String, enum: PAYMENT_STATUSES, required: true, default: 'PENDING' },
    /** Set once a gateway is involved; null for cash on delivery. */
    provider: { type: String, default: null },
    reference: { type: String, default: null },
    paidAt: { type: Date, default: null },
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

    cancellationReason: { type: String, default: null },
    cancelledAt: { type: Date, default: null },
  },
  baseSchemaOptions,
);

// The order history query: this customer's orders, newest first.
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1 });

export type OrderDocument = InferSchemaType<typeof orderSchema>;

export const Order = model('Order', orderSchema);
