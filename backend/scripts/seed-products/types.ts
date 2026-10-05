import type { ImagePool } from './images';
import type { Rng } from './random';

/**
 * Where a brand sits in its market. It moves the price, how deep the discounts
 * go, how many people buy it and how well it tends to be rated — the four
 * numbers a shopper reads together, so they have to move together.
 */
export type Tier = 'budget' | 'mid' | 'premium';

export interface BrandDef {
  name: string;
  tier: Tier;
  /** Relative share of its subcategory's listings. Defaults to 1. */
  weight?: number;
}

export interface ColorOption {
  name: string;
  hex: string;
}

export interface Spec {
  label: string;
  value: string;
}

/** What a subcategory's builder decides about one product. */
export interface ProductDraft {
  /** The full display name, brand included. Must be unique; the generator retries if it is not. */
  name: string;
  /** List price (MRP) in whole rupees, before any discount. */
  mrp: number;
  shortDescription: string;
  description: string;
  highlights: string[];
  specifications: Spec[];
  /** Extra search tags; the generator adds subcategory, category and brand itself. */
  tags: string[];
  colors?: ColorOption[];
  /** Size labels. With `trackVariants`, stock is held per colour-and-size. */
  sizes?: string[];
  /** Hold stock per variant (apparel and footwear) rather than as one count. */
  trackVariants?: boolean;
  /** A narrower photo pool than the subcategory's, when the builder knows the product type. */
  images?: ImagePool;
}

export interface BuildContext {
  rng: Rng;
  brand: BrandDef;
}

export interface SubcategoryDef {
  /** Lowercase phrase used as a search tag: "smartphones", "running shoes". */
  key: string;
  name: string;
  /** Three letters, used in the SKU. */
  code: string;
  /** Relative share of the category's listings. */
  weight: number;
  images: ImagePool;
  brands: BrandDef[];
  /** Typical discount off MRP, as fractions: [0.1, 0.35] is 10–35% off. */
  discount: [number, number];
  /** Units a typical listing holds; big-ticket goods hold few, consumables many. */
  stockScale: number;
  /** Per-product low-stock warning level; `null` follows the store default. */
  lowStockThreshold?: number | null;
  build(ctx: BuildContext): ProductDraft;
}

export interface CategoryDef {
  slug: string;
  name: string;
  description: string;
  image: string;
  gstRate: number;
  hsnCode: string;
  tryOnEnabled: boolean;
  /** Three letters, used in the SKU. */
  code: string;
  /** Relative share of the whole catalogue. */
  weight: number;
  /** How many reviews a popular listing here gathers; electronics outdraw home decor. */
  reviewScale: number;
  subcategories: SubcategoryDef[];
}
