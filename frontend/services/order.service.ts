import { request, requestList, send, type RequestOptions } from '@/services/api';
import type { CheckoutSummary } from '@/types/checkout';
import type { CancellationReason, Order, OrderListResponse, OrderStatus } from '@/types/order';

export function getCheckoutSummary(
  addressId?: string,
  options?: RequestOptions,
): Promise<CheckoutSummary> {
  return request<CheckoutSummary>(
    '/api/checkout/summary',
    addressId ? { addressId } : undefined,
    options,
  );
}

/**
 * Places the order and answers with the order the server actually stored, so
 * the confirmation page renders what exists rather than what was hoped for.
 */
export function createOrder(addressId: string): Promise<Order> {
  return send<Order>('post', '/api/orders', { addressId, paymentMethod: 'COD' });
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
