import {
  downloadFile,
  request,
  requestList,
  send,
  sendFile,
  sendMessage,
  type RequestOptions,
} from '@/services/api';
import { fetchHealth } from '@/services/api';
import type { HealthData } from '@/types/api';
import type {
  Shipment,
  ShipmentInput,
  ShipmentStatus,
  ShipmentUpdateInput,
} from '@/types/fulfillment';
import type { Invoice } from '@/types/invoice';
import type { OrderStatus } from '@/types/order';
import type {
  AdjustStockInput,
  AdjustmentResult,
  AdminCouponDetail,
  AdminCouponQuery,
  AdminCouponRow,
  CouponInput,
  SubscriberCounts,
  SubscriberQuery,
  SubscriberRow,
  UploadedImage,
  AdminCatalogueQuery,
  AdminProduct,
  AdminCustomerDetail,
  AdminCustomerQuery,
  AdminCustomerRow,
  AdminDashboard,
  AdminList,
  AdminOrderDetail,
  AdminOrderQuery,
  AdminOrderRow,
  AdminProductQuery,
  AdminProductRow,
  AdminReturnDetail,
  AdminReturnQuery,
  AdminReturnRow,
  AdminReviewDetail,
  AdminReviewQuery,
  AdminReviewRow,
  CommunicationSummary,
  NotificationDetail,
  NotificationQuery,
  NotificationRetryResult,
  NotificationRow,
  ReturnsSummary,
  AdminTaxonomyRow,
  AuditLogRow,
  AuditQuery,
  BulkResult,
  InventoryDetail,
  InventoryQuery,
  InventoryRow,
  InventorySummary,
  MovementRow,
  OperationsSummary,
  ProductInput,
  ProductUpdateInput,
  TaxonomyInput,
} from '@/types/admin';
import type { ReviewStatus } from '@/types/review';

/**
 * Every call the admin console makes.
 *
 * One module for one API namespace, so the console never reaches for a
 * storefront service by accident — and so "what can an administrator do?" is
 * answerable by reading a single file.
 */

/**
 * Drops undefined and empty values before they become query parameters.
 *
 * The backend schemas are `.strict()` and reject unknown keys, and `?search=`
 * with nothing after it is not a search — this is what lets callers pass a
 * whole filter object without first pruning it.
 */
function params(source: object): Record<string, string | number> {
  const query: Record<string, string | number> = {};

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null || value === '') continue;
    query[key] = typeof value === 'boolean' ? String(value) : (value as string | number);
  }

  return query;
}

/* ---------------------------------------------------------------- */
/* Dashboard                                                         */
/* ---------------------------------------------------------------- */

export function getDashboard(
  period: '7d' | '30d' = '30d',
  options?: RequestOptions,
): Promise<AdminDashboard> {
  return request<AdminDashboard>('/api/admin/dashboard', { period }, options);
}

/* ---------------------------------------------------------------- */
/* Products                                                          */
/* ---------------------------------------------------------------- */

export async function getProducts(
  query: AdminProductQuery = {},
  options?: RequestOptions,
): Promise<AdminList<AdminProductRow>> {
  const { items, pagination } = await requestList<AdminProductRow>(
    '/api/admin/products',
    params(query),
    options,
  );

  return { items, pagination };
}

/** The full product, including the `isActive` flag the storefront never sees. */
export function getProduct(id: string, options?: RequestOptions): Promise<AdminProduct> {
  return request<AdminProduct>(`/api/admin/products/${encodeURIComponent(id)}`, undefined, options);
}

/**
 * Creates a product.
 *
 * Send `stock` for a product that holds one count, or `variants` with their
 * opening counts and no `stock` — the server sums them, and refuses a `stock`
 * that disagrees with that sum.
 */
export function createProduct(input: ProductInput): Promise<AdminProduct> {
  return send<AdminProduct>('post', '/api/admin/products', input);
}

/**
 * Updates a product — everything except its stock.
 *
 * The type says so: `ProductUpdateInput` has no `stock`, because the endpoint
 * no longer honours one. Stock moves through `adjustStock`, which takes a
 * signed change and a reason.
 *
 * `variants` (Phase 20) says which colour-and-size combinations are sold. Left
 * out, the list is untouched; empty, the product goes back to one count with
 * its total kept. The server's `planVariantEdit` refuses anything that would
 * move units without a ledger entry, and its messages are worded for the form
 * to show as they are.
 */
export function updateProduct(
  id: string,
  input: Partial<ProductUpdateInput>,
): Promise<AdminProduct> {
  return send<AdminProduct>('patch', `/api/admin/products/${encodeURIComponent(id)}`, input);
}

export function deleteProduct(id: string): Promise<string> {
  return sendMessage('delete', `/api/admin/products/${encodeURIComponent(id)}`);
}

/* ---------------------------------------------------------------- */
/* Categories and brands                                             */
/* ---------------------------------------------------------------- */

export async function getCategories(
  query: AdminCatalogueQuery = {},
  options?: RequestOptions,
): Promise<AdminList<AdminTaxonomyRow>> {
  const { items, pagination } = await requestList<AdminTaxonomyRow>(
    '/api/admin/categories',
    params(query),
    options,
  );

  return { items, pagination };
}

export const createCategory = (input: TaxonomyInput) =>
  send<AdminTaxonomyRow>('post', '/api/admin/categories', input);

export const updateCategory = (id: string, input: Partial<TaxonomyInput>) =>
  send<AdminTaxonomyRow>('patch', `/api/admin/categories/${encodeURIComponent(id)}`, input);

export const deleteCategory = (id: string) =>
  sendMessage('delete', `/api/admin/categories/${encodeURIComponent(id)}`);

export async function getBrands(
  query: AdminCatalogueQuery = {},
  options?: RequestOptions,
): Promise<AdminList<AdminTaxonomyRow>> {
  const { items, pagination } = await requestList<AdminTaxonomyRow>(
    '/api/admin/brands',
    params(query),
    options,
  );

  return { items, pagination };
}

export const createBrand = (input: TaxonomyInput) =>
  send<AdminTaxonomyRow>('post', '/api/admin/brands', input);

export const updateBrand = (id: string, input: Partial<TaxonomyInput>) =>
  send<AdminTaxonomyRow>('patch', `/api/admin/brands/${encodeURIComponent(id)}`, input);

export const deleteBrand = (id: string) =>
  sendMessage('delete', `/api/admin/brands/${encodeURIComponent(id)}`);

/* ---------------------------------------------------------------- */
/* Orders                                                            */
/* ---------------------------------------------------------------- */

export async function getOrders(
  query: AdminOrderQuery = {},
  options?: RequestOptions,
): Promise<AdminList<AdminOrderRow>> {
  const { items, pagination } = await requestList<AdminOrderRow>(
    '/api/admin/orders',
    params(query),
    options,
  );

  return { items, pagination };
}

/** The same invoice the customer sees, for any order that has one. */
export function getOrderInvoice(orderRef: string, options?: RequestOptions): Promise<Invoice> {
  return request<Invoice>(
    `/api/admin/orders/${encodeURIComponent(orderRef)}/invoice`,
    undefined,
    options,
  );
}

export function getOrder(orderRef: string, options?: RequestOptions): Promise<AdminOrderDetail> {
  return request<AdminOrderDetail>(
    `/api/admin/orders/${encodeURIComponent(orderRef)}`,
    undefined,
    options,
  );
}

/**
 * Moves an order along its lifecycle.
 *
 * Fulfilment only — there is no payment parameter here, and none on the server
 * either. Which statuses are reachable comes back on the order as
 * `allowedStatuses`.
 */
export function updateOrderStatus(
  orderRef: string,
  status: OrderStatus,
  note?: string,
): Promise<AdminOrderDetail> {
  return send<AdminOrderDetail>(
    'patch',
    `/api/admin/orders/${encodeURIComponent(orderRef)}/status`,
    { status, ...(note?.trim() ? { note: note.trim() } : {}) },
  );
}

/**
 * Moves several orders at once.
 *
 * Answers with a per-order outcome rather than a single success, because a
 * partial result is the normal case. There is no bulk cancellation — the
 * server's schema does not accept one.
 */
export function bulkUpdateOrderStatus(
  orderNumbers: string[],
  status: 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED',
  note?: string,
): Promise<BulkResult> {
  return send<BulkResult>('patch', '/api/admin/orders/bulk-status', {
    orderNumbers,
    status,
    ...(note?.trim() ? { note: note.trim() } : {}),
  });
}

/* ---------------------------------------------------------------- */
/* Inventory                                                         */
/* ---------------------------------------------------------------- */

export async function getInventory(
  query: InventoryQuery = {},
  options?: RequestOptions,
): Promise<AdminList<InventoryRow>> {
  const { items, pagination } = await requestList<InventoryRow>(
    '/api/admin/inventory',
    params(query),
    options,
  );

  return { items, pagination };
}

export function getInventorySummary(options?: RequestOptions): Promise<InventorySummary> {
  return request<InventorySummary>('/api/admin/inventory/summary', undefined, options);
}

export function getInventoryItem(id: string, options?: RequestOptions): Promise<InventoryDetail> {
  return request<InventoryDetail>(
    `/api/admin/inventory/${encodeURIComponent(id)}`,
    undefined,
    options,
  );
}

export async function getProductMovements(
  id: string,
  query: { page?: number; limit?: number } = {},
  options?: RequestOptions,
): Promise<AdminList<MovementRow>> {
  const { items, pagination } = await requestList<MovementRow>(
    `/api/admin/inventory/${encodeURIComponent(id)}/movements`,
    params(query),
    options,
  );

  return { items, pagination };
}

export async function getMovements(
  query: { page?: number; limit?: number; type?: string } = {},
  options?: RequestOptions,
): Promise<AdminList<MovementRow>> {
  const { items, pagination } = await requestList<MovementRow>(
    '/api/admin/inventory/movements',
    params(query),
    options,
  );

  return { items, pagination };
}

/**
 * Corrects a product's stock.
 *
 * Sends a signed change and a reason — never a total. The response carries the
 * quantity the server actually found, which is what the dialog reports back
 * rather than the figure it was showing.
 *
 * A product that tracks stock per variant is adjusted one variant at a time:
 * `variantId` names it, and `shownStock` and `expectedStock` are then that
 * variant's count. Leaving it out for such a product is refused with a 409.
 */
export function adjustStock(id: string, input: AdjustStockInput): Promise<AdjustmentResult> {
  return send<AdjustmentResult>(
    'post',
    `/api/admin/inventory/${encodeURIComponent(id)}/adjust`,
    input,
  );
}

/** Null restores the store default rather than pinning today's value. */
export function setLowStockThreshold(
  id: string,
  lowStockThreshold: number | null,
): Promise<{ id: string; lowStockThreshold: number; usesDefaultThreshold: boolean }> {
  return send('patch', `/api/admin/inventory/${encodeURIComponent(id)}/threshold`, {
    lowStockThreshold,
  });
}

/* ---------------------------------------------------------------- */
/* Operations and audit                                              */
/* ---------------------------------------------------------------- */

export function getOperations(options?: RequestOptions): Promise<OperationsSummary> {
  return request<OperationsSummary>('/api/admin/operations', undefined, options);
}

export async function getAuditLogs(
  query: AuditQuery = {},
  options?: RequestOptions,
): Promise<AdminList<AuditLogRow>> {
  const { items, pagination } = await requestList<AuditLogRow>(
    '/api/admin/audit-logs',
    params(query),
    options,
  );

  return { items, pagination };
}

export function getAuditActors(options?: RequestOptions): Promise<{ id: string; name: string }[]> {
  return request<{ id: string; name: string }[]>(
    '/api/admin/audit-logs/actors',
    undefined,
    options,
  );
}

/* ---------------------------------------------------------------- */
/* Customers                                                         */
/* ---------------------------------------------------------------- */

export async function getCustomers(
  query: AdminCustomerQuery = {},
  options?: RequestOptions,
): Promise<AdminList<AdminCustomerRow>> {
  const { items, pagination } = await requestList<AdminCustomerRow>(
    '/api/admin/customers',
    params(query),
    options,
  );

  return { items, pagination };
}

export function getCustomer(id: string, options?: RequestOptions): Promise<AdminCustomerDetail> {
  return request<AdminCustomerDetail>(
    `/api/admin/customers/${encodeURIComponent(id)}`,
    undefined,
    options,
  );
}

/** Takes effect on the customer's next request; the API re-reads the account. */
export function setCustomerActive(id: string, isActive: boolean): Promise<AdminCustomerDetail> {
  return send<AdminCustomerDetail>(
    'patch',
    `/api/admin/customers/${encodeURIComponent(id)}/status`,
    { isActive },
  );
}

/* ---------------------------------------------------------------- */
/* Reviews                                                           */
/* ---------------------------------------------------------------- */

export async function getReviews(
  query: AdminReviewQuery = {},
  options?: RequestOptions,
): Promise<AdminList<AdminReviewRow>> {
  const { items, pagination } = await requestList<AdminReviewRow>(
    '/api/admin/reviews',
    params(query),
    options,
  );

  return { items, pagination };
}

export function getReview(id: string, options?: RequestOptions): Promise<AdminReviewDetail> {
  return request<AdminReviewDetail>(
    `/api/admin/reviews/${encodeURIComponent(id)}`,
    undefined,
    options,
  );
}

/** Approving or rejecting moves the product's rating in the same transaction. */
export function moderateReview(
  id: string,
  status: Extract<ReviewStatus, 'APPROVED' | 'REJECTED'>,
): Promise<AdminReviewDetail> {
  return send<AdminReviewDetail>('patch', `/api/admin/reviews/${encodeURIComponent(id)}/status`, {
    status,
  });
}

/* ---------------------------------------------------------------- */
/* Fulfilment                                                        */
/* ---------------------------------------------------------------- */

/**
 * The parcel for one order.
 *
 * Three calls, because the server has three endpoints, because they obey three
 * different rules. Creation takes no status — the server derives it from the
 * order, so the console cannot ask for a parcel state that contradicts it.
 */
export function createShipment(
  orderRef: string,
  input: ShipmentInput,
): Promise<Shipment> {
  return send<Shipment>(
    'post',
    `/api/admin/orders/${encodeURIComponent(orderRef)}/shipment`,
    input,
  );
}

export function updateShipment(
  orderRef: string,
  input: ShipmentUpdateInput,
): Promise<Shipment> {
  return send<Shipment>(
    'patch',
    `/api/admin/orders/${encodeURIComponent(orderRef)}/shipment`,
    input,
  );
}

/** Moves the parcel; the server carries the order along with it. */
export function updateShipmentStatus(
  orderRef: string,
  status: ShipmentStatus,
  note?: string,
): Promise<Shipment> {
  return send<Shipment>(
    'post',
    `/api/admin/orders/${encodeURIComponent(orderRef)}/shipment/status`,
    { status, ...(note?.trim() ? { note: note.trim() } : {}) },
  );
}

/* ---------------------------------------------------------------- */
/* Returns                                                           */
/* ---------------------------------------------------------------- */

export async function getReturns(
  query: AdminReturnQuery = {},
  options?: RequestOptions,
): Promise<AdminList<AdminReturnRow>> {
  const { items, pagination } = await requestList<AdminReturnRow>(
    '/api/admin/returns',
    params(query),
    options,
  );

  return { items, pagination };
}

export function getReturnsSummary(options?: RequestOptions): Promise<ReturnsSummary> {
  return request<ReturnsSummary>('/api/admin/returns/summary', undefined, options);
}

export function getReturn(
  returnRef: string,
  options?: RequestOptions,
): Promise<AdminReturnDetail> {
  return request<AdminReturnDetail>(
    `/api/admin/returns/${encodeURIComponent(returnRef)}`,
    undefined,
    options,
  );
}

/**
 * Approving, with the quantities the operator agreed to.
 *
 * Omitting `items` approves what was asked for, which is the common case. The
 * server refuses an approval for more than was requested, so the console does
 * not have to police that either.
 */
export function approveReturn(
  returnRef: string,
  input: {
    items?: { orderItemId: string; approvedQuantity: number }[];
    resolutionNote?: string;
    adminNote?: string;
  } = {},
): Promise<AdminReturnDetail> {
  return send<AdminReturnDetail>(
    'post',
    `/api/admin/returns/${encodeURIComponent(returnRef)}/approve`,
    input,
  );
}

/** `resolutionNote` is required by the server — the customer will read it. */
export function rejectReturn(
  returnRef: string,
  resolutionNote: string,
  adminNote?: string,
): Promise<AdminReturnDetail> {
  return send<AdminReturnDetail>(
    'post',
    `/api/admin/returns/${encodeURIComponent(returnRef)}/reject`,
    { resolutionNote, ...(adminNote?.trim() ? { adminNote: adminNote.trim() } : {}) },
  );
}

/**
 * Marking the goods received, with the resellable judgement.
 *
 * `resellable` has no default here or on the server. Only `true` puts units
 * back into sellable stock, and it does so through the Phase 12 inventory
 * ledger — never by this console touching a product.
 */
export function receiveReturn(
  returnRef: string,
  resellable: boolean,
  adminNote?: string,
): Promise<AdminReturnDetail> {
  return send<AdminReturnDetail>(
    'post',
    `/api/admin/returns/${encodeURIComponent(returnRef)}/receive`,
    { resellable, ...(adminNote?.trim() ? { adminNote: adminNote.trim() } : {}) },
  );
}

/**
 * Issues the refund.
 *
 * No amount. The server computes it from the order's historical snapshot and
 * the approved quantities, and caps it at what is left refundable — there is no
 * figure for this call to get wrong.
 */
export function refundReturn(returnRef: string): Promise<AdminReturnDetail> {
  return send<AdminReturnDetail>(
    'post',
    `/api/admin/returns/${encodeURIComponent(returnRef)}/refund`,
  );
}

/**
 * Asks Razorpay whether a pending refund has landed.
 *
 * There is no "mark refunded" beside this on purpose: whether money moved is a
 * fact at the gateway, and asserting it from a console would make every
 * "Refunded" badge mean less.
 */
export function checkReturnRefund(returnRef: string): Promise<AdminReturnDetail> {
  return send<AdminReturnDetail>(
    'post',
    `/api/admin/returns/${encodeURIComponent(returnRef)}/refund/check`,
  );
}

/* ---------------------------------------------------------------- */
/* Transactional communication                                       */
/* ---------------------------------------------------------------- */

/**
 * Every call the notifications console makes — and notice what is not here.
 *
 * There is no `sendEmail`, no `composeMessage` and no way to name a recipient
 * or a template. Messages exist because a business transition happened on the
 * server, and the only write below asks for one to be attempted again. A
 * console that could compose mail would be a mail relay behind an admin login.
 */
export async function getNotifications(
  query: NotificationQuery = {},
  options?: RequestOptions,
): Promise<AdminList<NotificationRow>> {
  const { items, pagination } = await requestList<NotificationRow>(
    '/api/admin/notifications',
    params(query),
    options,
  );

  return { items, pagination };
}

/** Pending, failed and sent-today counts, plus which transport is configured. */
export function getCommunicationSummary(
  options?: RequestOptions,
): Promise<CommunicationSummary> {
  return request<CommunicationSummary>('/api/admin/notifications/summary', undefined, options);
}

export function getNotification(
  id: string,
  options?: RequestOptions,
): Promise<NotificationDetail> {
  return request<NotificationDetail>(
    `/api/admin/notifications/${encodeURIComponent(id)}`,
    undefined,
    options,
  );
}

/**
 * One further attempt at one message.
 *
 * Takes an id and nothing else. The recipient, the subject and the body all
 * come from the stored delivery record, so a retry sends exactly the message
 * that was composed at the time — not whatever the templates say today, and
 * certainly not anything this browser could suggest.
 */
export function retryNotification(id: string): Promise<NotificationRetryResult> {
  return send<NotificationRetryResult>(
    'post',
    `/api/admin/notifications/${encodeURIComponent(id)}/retry`,
  );
}

/* ---------------------------------------------------------------- */
/* Promotions (Phase 18)                                             */
/* ---------------------------------------------------------------- */

export async function getCoupons(
  query: AdminCouponQuery = {},
  options?: RequestOptions,
): Promise<AdminList<AdminCouponRow>> {
  const { items, pagination } = await requestList<AdminCouponRow>(
    '/api/admin/coupons',
    params(query),
    options,
  );

  return { items, pagination };
}

export function getCoupon(id: string, options?: RequestOptions): Promise<AdminCouponDetail> {
  return request<AdminCouponDetail>(
    `/api/admin/coupons/${encodeURIComponent(id)}`,
    undefined,
    options,
  );
}

export const createCoupon = (input: CouponInput) =>
  send<AdminCouponDetail>('post', '/api/admin/coupons', input);

/** Everything but the code, which the server treats as immutable. */
export const updateCoupon = (id: string, input: Omit<Partial<CouponInput>, 'code'>) =>
  send<AdminCouponDetail>('patch', `/api/admin/coupons/${encodeURIComponent(id)}`, input);

export const deleteCoupon = (id: string) =>
  sendMessage('delete', `/api/admin/coupons/${encodeURIComponent(id)}`);

export async function getSubscribers(
  query: SubscriberQuery = {},
  options?: RequestOptions,
): Promise<AdminList<SubscriberRow>> {
  const { items, pagination } = await requestList<SubscriberRow>(
    '/api/admin/subscribers',
    params(query),
    options,
  );

  return { items, pagination };
}

export function getSubscriberCounts(options?: RequestOptions): Promise<SubscriberCounts> {
  return request<SubscriberCounts>('/api/admin/subscribers/summary', undefined, options);
}

/** The confirmed list as a CSV file, with each row's signed unsubscribe link. */
export const exportSubscribers = () => downloadFile('/api/admin/subscribers/export');

/**
 * Uploads one product image and answers with its URL.
 *
 * The file itself is the body; the server decides what it is from its bytes,
 * not from its name or the type the browser claims.
 */
export const uploadProductImage = (file: File) =>
  sendFile<UploadedImage>('/api/admin/uploads/images', file);

/* ---------------------------------------------------------------- */
/* System health                                                     */
/* ---------------------------------------------------------------- */

/**
 * The API's own view of whether it can do its job.
 *
 * ## Why this reuses the public endpoint
 *
 * There is deliberately no admin-only configuration endpoint. One would be the
 * obvious place to put "a bit more detail for an operator" — the SMTP host,
 * the key id, which variables are set — and that is precisely the endpoint
 * that turns an admin session into a configuration disclosure. `/api/health`
 * returns four enum values and is safe for anyone to read, so it is what the
 * console reads too. See `docs/phase-16.md`.
 *
 * ## Why it does not throw on a 503
 *
 * A 503 from health is the most useful answer it gives, and `fetchHealth`
 * preserves the body. The caller decides how to render "the API says it is not
 * ready", which is a different thing from "the API did not answer".
 */
export async function getSystemHealth(): Promise<HealthData | null> {
  const response = await fetchHealth();
  return response.data ?? null;
}
