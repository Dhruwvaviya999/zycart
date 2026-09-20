import { AI_LIMITS } from '../../../config/ai';
import { stockStateOf, thresholdOf, type StockState } from '../../../models/product.model';

/**
 * The projection every AI tool returns for a product.
 *
 * Two things decide what is in here. The first is that the model should see
 * what a shopper sees and nothing else: no `_id`, no `isActive`, no `ratingSum`
 * or `ratingBreakdown`, no SKU, no timestamps. The second is context budget —
 * a Mongo document is mostly fields the assistant will never mention, and every
 * one of them costs tokens on every turn it stays in the conversation.
 *
 * The same object is what the storefront renders as a product card, so the
 * price on the card is the price the model was reasoning about, both of them
 * read from the database moments earlier.
 */
export interface AiProductView {
  id: string;
  name: string;
  slug: string;
  brand: string;
  brandSlug: string;
  category: string;
  categorySlug: string;
  price: number;
  compareAtPrice: number | null;
  rating: number;
  reviewCount: number;
  stock: number;
  availability: StockState;
  colors: string[];
  sizes: { label: string; inStock: boolean }[];
  images: string[];
  shortDescription: string;
}

/** What `get_product` adds: the long-form fields a detail question needs. */
export interface AiProductDetailView extends AiProductView {
  description: string;
  highlights: string[];
  specifications: { label: string; value: string }[];
}

/**
 * The catalogue document as `productService` hands it over.
 *
 * Declared locally rather than imported from Mongoose: this is the shape the
 * projection depends on, and writing it down means a change to the model that
 * would break the assistant fails to compile instead of failing at runtime.
 */
interface CatalogueReference {
  name?: string;
  slug?: string;
}

export interface CatalogueProduct {
  id?: string;
  _id?: unknown;
  name?: string;
  slug?: string;
  description?: string;
  shortDescription?: string;
  images?: string[];
  price?: number;
  compareAtPrice?: number | null;
  category?: CatalogueReference | null;
  brand?: CatalogueReference | null;
  stock?: number;
  /** The product's own low-stock threshold, when it has one. */
  lowStockThreshold?: number | null;
  colors?: { name?: string }[];
  sizes?: { label?: string; inStock?: boolean }[];
  highlights?: string[];
  specifications?: { label?: string; value?: string }[];
  rating?: number;
  reviewCount?: number;
}

/** Keeps a merchant's 4,000-character description from filling the context. */
export function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

export function toProductView(product: CatalogueProduct): AiProductView {
  const stock = product.stock ?? 0;

  return {
    id: product.id ?? String(product._id ?? ''),
    name: product.name ?? '',
    slug: product.slug ?? '',
    brand: product.brand?.name ?? '',
    brandSlug: product.brand?.slug ?? '',
    category: product.category?.name ?? '',
    categorySlug: product.category?.slug ?? '',
    price: product.price ?? 0,
    compareAtPrice: product.compareAtPrice ?? null,
    rating: product.rating ?? 0,
    reviewCount: product.reviewCount ?? 0,
    stock,
    // The catalogue's own definition of low stock, so the assistant cannot say
    // "only a few left" about a product the storefront calls well stocked.
    availability: stockStateOf(stock, thresholdOf(product)),
    colors: (product.colors ?? []).map((color) => color.name ?? '').filter(Boolean),
    sizes: (product.sizes ?? []).map((size) => ({
      label: size.label ?? '',
      inStock: size.inStock !== false,
    })),
    // Two images is what a card renders. The rest are alternate angles the
    // assistant has no use for.
    images: (product.images ?? []).slice(0, AI_LIMITS.maxImagesPerProduct),
    shortDescription: truncate(product.shortDescription ?? '', 200),
  };
}

export function toProductDetailView(product: CatalogueProduct): AiProductDetailView {
  return {
    ...toProductView(product),
    description: truncate(product.description ?? '', AI_LIMITS.maxDescriptionLength),
    highlights: (product.highlights ?? [])
      .slice(0, AI_LIMITS.maxHighlights)
      .map((highlight) => truncate(highlight, 160)),
    specifications: (product.specifications ?? [])
      .slice(0, AI_LIMITS.maxSpecifications)
      .map((spec) => ({ label: spec.label ?? '', value: truncate(spec.value ?? '', 160) })),
  };
}

/**
 * Records what the customer has now been shown.
 *
 * Insertion-ordered, so "the second one" means the second card on screen, and
 * de-duplicated, so a product that appears in both a search and a comparison is
 * one card rather than two.
 */
export function remember(shown: Map<string, AiProductView>, views: AiProductView[]): void {
  for (const view of views) {
    if (view.id && !shown.has(view.id)) shown.set(view.id, view);
  }
}
