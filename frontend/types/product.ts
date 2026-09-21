import type { RatingDistribution } from '@/types/review';

/** A populated `category` or `brand` reference as the API returns it. */
export interface ProductReference {
  id: string;
  name: string;
  slug: string;
}

export interface ProductColor {
  name: string;
  hex: string;
}

export interface ProductSize {
  label: string;
  inStock: boolean;
}

export interface ProductSpecification {
  label: string;
  value: string;
}

/**
 * What the list endpoints return. They deliberately omit the long-form fields,
 * so anything rendering a grid of cards works with this narrower shape.
 */
export interface ProductSummary {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  images: string[];
  price: number;
  compareAtPrice?: number | null;
  category: ProductReference;
  brand: ProductReference;
  sku: string;
  stock: number;
  colors: ProductColor[];
  sizes: ProductSize[];
  tags: string[];
  /** Derived from approved reviews; zero until a product has been reviewed. */
  rating: number;
  reviewCount: number;
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  createdAt: string;
}

/** The detail endpoint adds everything the product page needs. */
export interface Product extends ProductSummary {
  description: string;
  highlights: string[];
  specifications: ProductSpecification[];
  /**
   * How many approved reviews gave each star.
   *
   * Carried on the product so the review section can draw its distribution
   * without a second request. The list endpoints leave it behind — a card only
   * needs the average.
   */
  ratingBreakdown: RatingDistribution;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  isActive: boolean;
  /** Active products in this category, supplied by the list endpoint. */
  productCount: number;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo: string;
  isActive: boolean;
}

/**
 * Matches the API's sort keys exactly — the storefront never invents its own.
 *
 * `relevance` arrived in Phase 11 and is the only one whose order depends on
 * the search term; with no term the API falls back to `newest` rather than
 * rejecting it, so a shared link that lost its query still renders.
 */
export type SortKey = 'newest' | 'oldest' | 'price_asc' | 'price_desc' | 'rating' | 'relevance';

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type ProductBadgeKind = 'new' | 'sale' | 'bestseller' | 'limited';

/** A cart line stores only what the shopper chose; prices always come from the API. */
export interface CartLine {
  productId: string;
  quantity: number;
  size?: string;
  color?: string;
}
