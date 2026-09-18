import type { ProductBadgeKind, ProductSummary } from '@/types/product';

/** Below this, the storefront says so rather than letting it look plentiful. */
export const LOW_STOCK_THRESHOLD = 10;

export const isInStock = (product: Pick<ProductSummary, 'stock'>): boolean => product.stock > 0;

export const isLowStock = (product: Pick<ProductSummary, 'stock'>): boolean =>
  product.stock > 0 && product.stock <= LOW_STOCK_THRESHOLD;

/**
 * One badge per card, chosen by what a shopper most wants to know first.
 * The API stores the flags; which one wins is a presentation decision.
 */
export function productBadge(
  product: Pick<
    ProductSummary,
    'isNewArrival' | 'isBestSeller' | 'compareAtPrice' | 'price' | 'stock'
  >,
): ProductBadgeKind | undefined {
  if (product.isNewArrival) return 'new';
  if (product.compareAtPrice && product.compareAtPrice > product.price) return 'sale';
  if (product.isBestSeller) return 'bestseller';
  if (isLowStock(product)) return 'limited';
  return undefined;
}

/**
 * Images are bare URLs in the catalogue, so alt text is composed here. Only the
 * first image describes the product; the rest are alternate views of the same
 * thing and stay decorative.
 */
export function imageAlt(product: Pick<ProductSummary, 'name' | 'brand'>, index: number): string {
  return index === 0 ? `${product.brand.name} ${product.name}` : '';
}
