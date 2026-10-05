import type { RatingDistribution } from '@/types/review';

/** A populated `category` or `brand` reference as the API returns it. */
export interface ProductReference {
  id: string;
  name: string;
  slug: string;
  /**
   * On a product page's category only: whether products in it can be tried
   * on virtually (Phase 19). The list endpoints leave it out.
   */
  tryOnEnabled?: boolean;
}

export interface ProductColor {
  name: string;
  hex: string;
}

export interface ProductSize {
  label: string;
  inStock: boolean;
}

/**
 * One colour-and-size combination with its own count (Phase 20).
 *
 * Identified by its pair, not its id: a cart line has only ever recorded the
 * colour and size the customer chose, and that pair is what the API matches
 * on. `color` is null on a product that comes in sizes only, `size` on one
 * that comes in colours only. The id and SKU are carried for completeness; the
 * storefront never sends either back.
 */
export interface ProductVariant {
  id: string;
  color: string | null;
  size: string | null;
  sku: string;
  stock: number;
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
  /**
   * Stock per combination, from Phase 20. Empty — or, on data cached before
   * the field existed, missing — for a product that holds one count, which
   * then behaves exactly as it always did. When present, `stock` is the sum
   * of these and a combination not listed is not sold. Read it through
   * `lib/variants.ts` rather than directly, so the two cases stay one rule.
   */
  variants?: ProductVariant[];
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
