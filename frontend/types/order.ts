import type { Pagination } from '@/types/product';
import type { Returnability, ReturnSummary, Shipment } from '@/types/fulfillment';

export type OrderStatus =
  'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

export type PaymentMethod = 'COD' | 'RAZORPAY';

/**
 * Payment state, which is not order state.
 *
 * An order is routinely CONFIRMED with payment PENDING (cash on delivery) or
 * PENDING with payment FAILED (an online payment that did not go through), so
 * the two are tracked and rendered separately.
 */
export type PaymentStatus =
  'PENDING' | 'AUTHORIZED' | 'PAID' | 'FAILED' | 'REFUND_PENDING' | 'REFUNDED';

/** The progression an order moves through; CANCELLED sits outside it. */
export const ORDER_PROGRESSION: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
];

export const CANCELLATION_REASONS = [
  'Changed my mind',
  'Ordered by mistake',
  'Found another product',
  'Delivery timing',
  'Other',
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

/** A line exactly as it was bought — never re-read from the live catalogue. */
export interface OrderItem {
  id: string;
  product: string | null;
  productName: string;
  productSlug: string;
  productImage: string;
  sku: string;
  brand: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  selectedColor: string | null;
  selectedSize: string | null;
  /**
   * How many of this line are already spoken for by a return.
   *
   * The server's counter, and the reason a customer cannot request the same
   * unit twice from two tabs. Rendered so the return dialog can say "1 of 2
   * left" rather than offering a quantity that would be refused.
   */
  returnedQuantity: number;
  /**
   * The line's tax facts, frozen at purchase (Phase 18). Its share of the
   * order's discount in whole rupees; the GST rate it was sold at; its taxable
   * value and tax, to the paisa. Null on every line bought before GST was
   * computed.
   */
  discountShare?: number;
  gstRate?: number | null;
  hsnCode?: string;
  taxableValue?: number | null;
  taxAmount?: number | null;
}

export interface OrderShippingAddress {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  landmark: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

/**
 * The money on an order or a checkout.
 *
 * `total = subtotal − discount + shipping`, all whole rupees. From Phase 18
 * prices include GST, so `tax` is how much of the total is GST — to the paisa —
 * and is never added to it. Orders placed before then carry `tax: 0`.
 */
export interface OrderPricing {
  subtotal: number;
  shipping: number;
  discount: number;
  tax: number;
  total: number;
  /** The GST inside `shipping`, already counted in `tax`. */
  shippingTax?: number;
  shippingGstRate?: number | null;
}

/** The coupon an order used, as it was when the order was placed. */
export interface OrderCoupon {
  code: string;
  description: string;
  discount: number;
}

/**
 * The tax invoice. Numbered when the order ships; `available` is the server's
 * answer to whether one can be shown now.
 */
export interface OrderInvoiceRef {
  number: string | null;
  issuedAt: string | null;
  available: boolean;
}

export interface OrderPayment {
  method: PaymentMethod;
  status: PaymentStatus;
  provider: string | null;
  /** Gateway references. Null on every cash-on-delivery order. */
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  paidAt: string | null;
  failureReason: string | null;
  refundId: string | null;
  refundedAt: string | null;
  /**
   * Total rupees refunded across every refund on this order.
   *
   * Needed because a return can refund part of an order, and a payment panel
   * that only said "Paid" would be hiding money that has already gone back.
   */
  refundedAmount: number;
}

/** What the order list returns: enough to recognise an order, no more. */
export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  itemCount: number;
  total: number;
  createdAt: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  /** The server's answer to whether this order may still be paid online. */
  canPayNow: boolean;
  preview: { name: string; image: string }[];
}

export interface Order extends Omit<OrderListItem, 'preview'> {
  items: OrderItem[];
  shippingAddress: OrderShippingAddress;
  pricing: OrderPricing;
  payment: OrderPayment;
  cancellationReason: string | null;
  cancelledAt: string | null;
  /** When delivery was recorded. Null on every order delivered before Phase 13. */
  deliveredAt: string | null;
  updatedAt: string;
  canCancel: boolean;
  /** Null when no coupon was used. */
  coupon: OrderCoupon | null;
  invoice: OrderInvoiceRef;

  /**
   * Null when nothing has been dispatched, and for every order placed before
   * shipments existed. The page says tracking is not available rather than
   * inventing a carrier and a date.
   */
  shipment: Shipment | null;
  /** Every return raised against this order, newest first. */
  returns: ReturnSummary[];
  /** The server's verdict on whether a return may be started, and for what. */
  returnability: Returnability;
  /**
   * When ZyCart last successfully emailed this customer about this, or null.
   *
   * Null covers three situations and the page says the same thing in all of
   * them — nothing: there was nothing worth emailing about, a message is still
   * waiting to go out, or one failed. Claiming "we've emailed you" for a
   * message a mail server refused is the one thing this field exists to make
   * impossible.
   */
  lastUpdateEmailedAt: string | null;
}

export interface OrderListResponse {
  items: OrderListItem[];
  pagination: Pagination;
}
