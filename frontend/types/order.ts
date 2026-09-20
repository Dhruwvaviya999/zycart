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

/** Whole rupees. Shipping, discount and tax are zero until those engines exist. */
export interface OrderPricing {
  subtotal: number;
  shipping: number;
  discount: number;
  tax: number;
  total: number;
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
}

export interface OrderListResponse {
  items: OrderListItem[];
  pagination: Pagination;
}
