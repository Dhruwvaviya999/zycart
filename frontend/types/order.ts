import type { Pagination } from '@/types/product';

export type OrderStatus =
  'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

export type PaymentMethod = 'COD';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

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
  reference: string | null;
  paidAt: string | null;
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
  preview: { name: string; image: string }[];
}

export interface Order extends Omit<OrderListItem, 'preview'> {
  items: OrderItem[];
  shippingAddress: OrderShippingAddress;
  pricing: OrderPricing;
  payment: OrderPayment;
  cancellationReason: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  canCancel: boolean;
}

export interface OrderListResponse {
  items: OrderListItem[];
  pagination: Pagination;
}
