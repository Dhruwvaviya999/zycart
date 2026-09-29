import { request, requestList, send, type RequestOptions } from '@/services/api';
import type { CheckoutSummary } from '@/types/checkout';
import type { Invoice } from '@/types/invoice';
import type {
  CancellationReason,
  Order,
  OrderListResponse,
  OrderStatus,
  PaymentMethod,
} from '@/types/order';

export interface CheckoutSummaryParams {
  addressId?: string;
  /**
   * A code to price the checkout with. A code that does not apply is not an
   * error: the summary comes back without the discount and with `couponError`.
   */
  couponCode?: string;
}

export function getCheckoutSummary(
  params: CheckoutSummaryParams = {},
  options?: RequestOptions,
): Promise<CheckoutSummary> {
  const query: Record<string, string> = {};
  if (params.addressId) query.addressId = params.addressId;
  if (params.couponCode) query.couponCode = params.couponCode;

  return request<CheckoutSummary>(
    '/api/checkout/summary',
    Object.keys(query).length > 0 ? query : undefined,
    options,
  );
}

/**
 * Places the order and answers with the order the server actually stored, so
 * the confirmation page renders what exists rather than what was hoped for.
 *
 * For RAZORPAY this creates an **unpaid** order and nothing more — no stock is
 * taken and the cart is untouched until the payment is confirmed server-side.
 */
export function createOrder(
  addressId: string,
  paymentMethod: PaymentMethod = 'COD',
  couponCode?: string,
): Promise<Order> {
  // The code only — what it is worth is decided on the server, again, against
  // the basket as it is when the order is placed.
  return send<Order>('post', '/api/orders', {
    addressId,
    paymentMethod,
    ...(couponCode ? { couponCode } : {}),
  });
}

/**
 * The tax invoice for one of the customer's own orders. Refused with a reason
 * until the order ships, and for orders placed before invoices existed.
 */
export function getOrderInvoice(orderRef: string, options?: RequestOptions): Promise<Invoice> {
  return request<Invoice>(
    `/api/orders/${encodeURIComponent(orderRef)}/invoice`,
    undefined,
    options,
  );
}

export interface OrderListParams {
  page?: number;
  limit?: number;
  status?: OrderStatus;
}

export async function getOrders(
  params: OrderListParams = {},
  options?: RequestOptions,
): Promise<OrderListResponse> {
  const query: Record<string, string | number> = {};
  if (params.page !== undefined) query.page = params.page;
  if (params.limit !== undefined) query.limit = params.limit;
  if (params.status) query.status = params.status;

  const { items, pagination } = await requestList<OrderListResponse['items'][number]>(
    '/api/orders',
    query,
    options,
  );

  return { items, pagination };
}

/** Accepts an order number or an id; either way it is scoped to its owner. */
export function getOrderById(orderRef: string, options?: RequestOptions): Promise<Order> {
  return request<Order>(`/api/orders/${encodeURIComponent(orderRef)}`, undefined, options);
}

export function cancelOrder(
  orderRef: string,
  reason: CancellationReason,
  note?: string,
): Promise<Order> {
  return send<Order>('post', `/api/orders/${encodeURIComponent(orderRef)}/cancel`, {
    reason,
    ...(note?.trim() ? { note: note.trim() } : {}),
  });
}
