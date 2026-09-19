import { request, requestList, send, sendMessage, type RequestOptions } from '@/services/api';
import type { OrderStatus } from '@/types/order';
import type {
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
  AdminReviewDetail,
  AdminReviewQuery,
  AdminReviewRow,
  AdminTaxonomyRow,
  ProductInput,
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

export function createProduct(input: ProductInput): Promise<AdminProduct> {
  return send<AdminProduct>('post', '/api/admin/products', input);
}

export function updateProduct(id: string, input: Partial<ProductInput>): Promise<AdminProduct> {
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
