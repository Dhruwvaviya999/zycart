import { request, requestList } from '@/services/api';
import type { Pagination, Product, ProductSummary, SortKey } from '@/types/product';

/** Mirrors the query parameters `GET /api/products` accepts. */
export interface ProductListParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStock?: boolean;
  /** Matched against the product's own colourways, on a word boundary. */
  color?: string;
  sort?: SortKey;
  /** Resolves the ids the cart and wishlist keep in local storage. */
  ids?: string[];
}

export interface ProductListResult {
  items: ProductSummary[];
  pagination: Pagination;
}

/** Drops empty values so the URL only carries filters that are actually set. */
function toQuery(params: ProductListParams): Record<string, string | number | boolean> {
  const query: Record<string, string | number | boolean> = {};

  if (params.page !== undefined) query.page = params.page;
  if (params.limit !== undefined) query.limit = params.limit;
  if (params.search) query.search = params.search;
  if (params.category) query.category = params.category;
  if (params.brand) query.brand = params.brand;
  if (params.minPrice !== undefined) query.minPrice = params.minPrice;
  if (params.maxPrice !== undefined) query.maxPrice = params.maxPrice;
  if (params.minRating !== undefined) query.minRating = params.minRating;
  if (params.inStock !== undefined) query.inStock = params.inStock;
  if (params.color) query.color = params.color;
  if (params.sort) query.sort = params.sort;
  if (params.ids?.length) query.ids = params.ids.join(',');

  return query;
}

export function getProducts(params: ProductListParams = {}): Promise<ProductListResult> {
  return requestList<ProductSummary>('/api/products', toQuery(params));
}

export function getProductBySlug(slug: string): Promise<Product> {
  return request<Product>(`/api/products/${encodeURIComponent(slug)}`);
}

/**
 * Colour families worth offering as a filter, from what the catalogue stocks.
 * Fails soft: the shop renders without a colour filter rather than not at all.
 */
export async function getColorFamilies(): Promise<string[]> {
  try {
    return await request<string[]>('/api/products/colors');
  } catch {
    return [];
  }
}

export function getFeaturedProducts(limit = 8): Promise<ProductSummary[]> {
  return request<ProductSummary[]>('/api/products/featured', { limit });
}

export function getBestSellingProducts(limit = 8): Promise<ProductSummary[]> {
  return request<ProductSummary[]>('/api/products/best-sellers', { limit });
}

export function getNewArrivals(limit = 8): Promise<ProductSummary[]> {
  return request<ProductSummary[]>('/api/products/new-arrivals', { limit });
}

export function getRelatedProducts(slug: string, limit = 4): Promise<ProductSummary[]> {
  return request<ProductSummary[]>(`/api/products/${encodeURIComponent(slug)}/related`, { limit });
}

/**
 * Resolves stored ids back to products. Returns an empty list for an empty
 * input rather than asking the API for everything.
 */
export async function getProductsByIds(ids: string[]): Promise<ProductSummary[]> {
  if (ids.length === 0) return [];

  const { items } = await getProducts({ ids, limit: 100 });
  return items;
}
