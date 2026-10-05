import { LOW_STOCK_THRESHOLD } from '../../src/models/product.model';
import {
  deriveSizeAvailability,
  planNewVariants,
  type PlannedVariant,
} from '../../src/services/inventory/variant-stock';
import { slugify } from '../../src/utils/slugify';
import { CATALOG } from './catalog';
import { pickImages } from './images';
import { clamp, Rng } from './random';
import type { CategoryDef, ColorOption, ProductDraft, Spec, SubcategoryDef, Tier } from './types';

/**
 * Every SKU this generator writes starts with this, and nothing else in the
 * catalogue does. It is how `--clear` finds generated products again without
 * a schema change: the Product model has no "source" field, and adding one for
 * test data alone would not be worth a migration.
 */
export const GENERATED_SKU_PREFIX = 'ZG-';

const DAY_MS = 86_400_000;
const MAX_NAME_ATTEMPTS = 40;

export interface GeneratedProduct {
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  images: string[];
  price: number;
  compareAtPrice: number | null;
  sku: string;
  stock: number;
  variants: PlannedVariant[];
  lowStockThreshold: number | null;
  colors: ColorOption[];
  sizes: { label: string; inStock: boolean }[];
  tags: string[];
  highlights: string[];
  specifications: Spec[];
  rating: number;
  reviewCount: number;
  ratingSum: number;
  ratingBreakdown: { 1: number; 2: number; 3: number; 4: number; 5: number };
  isFeatured: boolean;
  isBestSeller: boolean;
  isNewArrival: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Resolved to ObjectIds once the reference documents exist. */
  categorySlug: string;
  brandName: string;
  /** Not stored; kept for the summary and the tests. */
  subcategory: string;
}

export interface GenerateOptions {
  count: number;
  seed: string;
  /** "Today" for the dataset. Ages and the new-arrival flag are measured back from it. */
  anchor: Date;
  /** Write rating aggregates. Off leaves every product unrated, as the hand-written seed does. */
  withRatings: boolean;
  /** Names, slugs and SKUs already in the database, so an `--append` run cannot collide with them. */
  reserved?: { names: Iterable<string>; slugs: Iterable<string>; skus: Iterable<string> };
  onProgress?: (done: number, total: number) => void;
}

export interface GenerateResult {
  products: GeneratedProduct[];
  /** Slots that ran out of unique names and were refilled from other subcategories. */
  refilled: number;
}

/* ------------------------------------------------------------------ */
/* Prices                                                              */
/* ------------------------------------------------------------------ */

/**
 * Rounds to a price an Indian shop would print: ₹349, ₹1,299, ₹24,999,
 * ₹1,19,999. Below ₹100 nothing is sold, so it floors there.
 */
export function charmPrice(value: number): number {
  const step = value < 500 ? 10 : value < 5_000 ? 50 : value < 50_000 ? 100 : 500;
  return Math.max(99, Math.round(value / step) * step - 1);
}

const DISCOUNT_DEPTH: Record<Tier, number> = { budget: 1.15, mid: 1, premium: 0.55 };
const NO_DISCOUNT_CHANCE: Record<Tier, number> = { budget: 0.04, mid: 0.08, premium: 0.2 };

function priceProduct(rng: Rng, mrpRaw: number, tier: Tier, range: [number, number]) {
  const mrp = charmPrice(mrpRaw);
  const discount = rng.chance(NO_DISCOUNT_CHANCE[tier])
    ? 0
    : clamp(rng.float(range[0], range[1]) * DISCOUNT_DEPTH[tier], 0.03, 0.8);
  const price = charmPrice(mrp * (1 - discount));

  // Rounding can swallow a small discount; a "sale" price equal to the MRP is no sale.
  if (price >= mrp) return { price: mrp, compareAtPrice: null, discount: 0 };
  return { price, compareAtPrice: mrp, discount: 1 - price / mrp };
}

/* ------------------------------------------------------------------ */
/* Ratings                                                             */
/* ------------------------------------------------------------------ */

type Breakdown = GeneratedProduct['ratingBreakdown'];

/**
 * Star probabilities with a given mean, in the J shape real review data has:
 * mostly fours and fives, a long thin middle and a small spike of one-star
 * reviews from unhappy buyers. Found by bisection on an exponential tilt.
 */
export function starDistribution(mean: number): number[] {
  const oneStarSpike = 0.02 + 0.08 * clamp((4.5 - mean) / 2, 0, 1);
  const at = (beta: number) => {
    const raw = [1, 2, 3, 4, 5].map((k) => Math.exp(beta * k));
    const total = raw.reduce((a, b) => a + b, 0);
    return raw.map((p, i) => (1 - oneStarSpike) * (p / total) + (i === 0 ? oneStarSpike : 0));
  };
  const meanOf = (p: number[]) => p.reduce((sum, value, i) => sum + value * (i + 1), 0);

  let lo = -4;
  let hi = 6;
  for (let i = 0; i < 50; i += 1) {
    const mid = (lo + hi) / 2;
    if (meanOf(at(mid)) < mean) lo = mid;
    else hi = mid;
  }
  return at((lo + hi) / 2);
}

/** Splits `total` into whole numbers proportional to `weights`, summing exactly to `total`. */
export function apportion(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return weights.map(() => 0);

  const exact = weights.map((w) => (w / sum) * total);
  const counts = exact.map(Math.floor);
  let left = total - counts.reduce((a, b) => a + b, 0);

  const order = exact
    .map((value, i) => ({ i, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left -= 1) counts[order[k]!.i]! += 1;

  return counts;
}

/**
 * Rating aggregates that agree with each other exactly as the review service
 * keeps them: `ratingSum` is the sum of the breakdown, `reviewCount` its
 * total, and `rating` is `ratingSum / reviewCount` rounded to one decimal —
 * the same rounding `recomputeProductAggregates` uses. A real review approved
 * later moves them with `applyRatingDelta` and they stay consistent.
 */
function rateProduct(rng: Rng, reviewCount: number, mean: number) {
  const breakdown: Breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  if (reviewCount === 0)
    return { rating: 0, reviewCount: 0, ratingSum: 0, ratingBreakdown: breakdown };

  const probabilities = starDistribution(mean);
  let counts: number[];

  if (reviewCount <= 40) {
    // Few reviews: draw each one, so small samples are as lumpy as real ones.
    counts = [0, 0, 0, 0, 0];
    for (let i = 0; i < reviewCount; i += 1) {
      let roll = rng.next();
      let star = 0;
      while (star < 4 && roll >= probabilities[star]!) roll -= probabilities[star++]!;
      counts[star]! += 1;
    }
  } else {
    counts = apportion(
      reviewCount,
      probabilities.map((p) => p * Math.exp(rng.normal(0, 0.08))),
    );
  }

  counts.forEach((count, i) => (breakdown[(i + 1) as 1 | 2 | 3 | 4 | 5] = count));
  const ratingSum = counts.reduce((sum, count, i) => sum + count * (i + 1), 0);
  return {
    rating: Math.round((ratingSum / reviewCount) * 10) / 10,
    reviewCount,
    ratingSum,
    ratingBreakdown: breakdown,
  };
}

/* ------------------------------------------------------------------ */
/* Stock                                                               */
/* ------------------------------------------------------------------ */

function stockFor(rng: Rng, sub: SubcategoryDef, popularity: number, threshold: number): number {
  if (rng.chance(0.05)) return 0;
  if (rng.chance(0.07)) return rng.int(1, Math.max(1, threshold));
  const units = sub.stockScale * (0.4 + popularity ** 0.35) * Math.exp(rng.normal(0, 0.45));
  return clamp(Math.round(units), threshold + 1, 5_000);
}

/**
 * Divides a product's stock among its colour-and-size combinations: middle
 * sizes carry the most, the ends of the run the least, and a few combinations
 * have sold out entirely.
 */
function splitAcrossVariants(rng: Rng, stock: number, colors: string[], sizes: string[]) {
  const colorAxis = colors.length > 0 ? colors : [null];
  const sizeAxis = sizes.length > 0 ? sizes : [null];
  const centre = (sizeAxis.length - 1) / 2;
  const spread = Math.max(1, sizeAxis.length / 2.5);

  const combos = colorAxis.flatMap((color) => {
    const colorWeight = rng.float(0.6, 1.4);
    return sizeAxis.map((size, i) => ({
      color,
      size,
      weight: rng.chance(0.08) ? 0 : colorWeight * Math.exp(-(((i - centre) / spread) ** 2)),
    }));
  });

  if (combos.every((combo) => combo.weight === 0)) combos[0]!.weight = 1;
  const counts = apportion(
    stock,
    combos.map((combo) => combo.weight),
  );
  return combos.map((combo, i) => ({ color: combo.color, size: combo.size, stock: counts[i]! }));
}

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

const brandCode = (name: string) =>
  (name.toUpperCase().replace(/[^A-Z0-9]/g, '') + 'XXX').slice(0, 3);
const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

function uniqueSku(
  rng: Rng,
  category: CategoryDef,
  sub: SubcategoryDef,
  brand: string,
  taken: Set<string>,
): string {
  const stem = `${GENERATED_SKU_PREFIX}${category.code}-${sub.code}-${brandCode(brand)}`;
  for (let attempt = 0; ; attempt += 1) {
    const digits = attempt < 30 ? rng.int(1000, 9999) : rng.int(10000, 999999);
    const sku = `${stem}${digits}`;
    if (!taken.has(sku)) {
      taken.add(sku);
      return sku;
    }
  }
}

function uniqueSlug(name: string, sku: string, taken: Set<string>): string {
  const base = slugify(name).replace(/-+$/, '') || 'product';
  const candidates = [
    base,
    `${base}-${sku.split('-').pop()!.toLowerCase()}`,
    `${base}-${sku.toLowerCase()}`,
  ];
  const slug = candidates.find((candidate) => !taken.has(candidate)) ?? `${base}-${taken.size}`;
  taken.add(slug);
  return slug;
}

function tagsFor(
  category: CategoryDef,
  sub: SubcategoryDef,
  brand: string,
  draft: ProductDraft,
): string[] {
  const seen = new Set<string>();
  for (const raw of [sub.key, category.name, brand, ...draft.tags]) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    if (tag && tag.length <= 40) seen.add(tag);
  }
  return [...seen].slice(0, 30);
}

/* ------------------------------------------------------------------ */
/* Allocation                                                          */
/* ------------------------------------------------------------------ */

interface Slot {
  category: CategoryDef;
  sub: SubcategoryDef;
}

/** How many of `count` products each subcategory gets, in proportion to the weights. */
export function allocate(count: number): Slot[] {
  const leaves = CATALOG.flatMap((category) => {
    const subTotal = category.subcategories.reduce((sum, sub) => sum + sub.weight, 0);
    return category.subcategories.map((sub) => ({
      category,
      sub,
      weight: (category.weight * sub.weight) / subTotal,
    }));
  });
  const counts = apportion(
    count,
    leaves.map((leaf) => leaf.weight),
  );
  return leaves.flatMap((leaf, i) =>
    Array.from({ length: counts[i]! }, () => ({ category: leaf.category, sub: leaf.sub })),
  );
}

/* ------------------------------------------------------------------ */
/* The generator                                                       */
/* ------------------------------------------------------------------ */

export function generateProducts(options: GenerateOptions): GenerateResult {
  const { count, seed, anchor, withRatings } = options;
  const rng = new Rng(`zycart-products:${seed}`);

  const names = new Set([...(options.reserved?.names ?? [])].map(nameKey));
  const slugs = new Set(options.reserved?.slugs ?? []);
  const skus = new Set(options.reserved?.skus ?? []);
  const ordinals = new Map<string, number>();

  const products: GeneratedProduct[] = [];
  const slots = rng.shuffle(allocate(count));
  const weightedSlots = slots.map((slot) => [slot, 1] as const);
  let refilled = 0;

  const tryBuild = ({ category, sub }: Slot): GeneratedProduct | null => {
    for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt += 1) {
      const brand = rng.weighted(sub.brands.map((b) => [b, b.weight ?? 1] as const));
      const draft = sub.build({ rng, brand });
      const key = nameKey(draft.name);
      if (names.has(key)) continue;

      names.add(key);
      const ordinal = ordinals.get(sub.key) ?? 0;
      ordinals.set(sub.key, ordinal + 1);
      return assemble(rng, {
        category,
        sub,
        brand: brand.name,
        tier: brand.tier,
        draft,
        ordinal,
        anchor,
        withRatings,
        slugs,
        skus,
      });
    }
    return null;
  };

  for (const slot of slots) {
    const product = tryBuild(slot);
    if (product) products.push(product);
    options.onProgress?.(products.length, count);
  }

  // A subcategory with few name combinations can run dry on a very large run.
  // Its unfilled slots go to the rest of the catalogue, in proportion.
  for (let guard = 0; products.length < count && guard < count * 5; guard += 1) {
    const product = tryBuild(rng.weighted(weightedSlots));
    if (product) {
      products.push(product);
      refilled += 1;
      options.onProgress?.(products.length, count);
    }
  }

  markBestSellersAndFeatured(rng, products);
  return { products, refilled };
}

interface AssembleContext {
  category: CategoryDef;
  sub: SubcategoryDef;
  brand: string;
  tier: Tier;
  draft: ProductDraft;
  ordinal: number;
  anchor: Date;
  withRatings: boolean;
  slugs: Set<string>;
  skus: Set<string>;
}

function assemble(rng: Rng, ctx: AssembleContext): GeneratedProduct {
  const { category, sub, brand, tier, draft, anchor } = ctx;

  // Age first: how long a product has been listed drives its reviews and flags.
  const ageDays = rng.chance(0.12) ? rng.int(0, 30) : rng.int(31, 720);
  const createdAt = new Date(anchor.getTime() - ageDays * DAY_MS - rng.int(0, 86_399) * 1000);
  const editedAfter = rng.int(0, Math.min(ageDays, 90)) * DAY_MS + rng.int(0, 86_399) * 1000;
  const updatedAt = new Date(Math.min(createdAt.getTime() + editedAfter, anchor.getTime()));

  const { price, compareAtPrice, discount } = priceProduct(rng, draft.mrp, tier, sub.discount);

  /**
   * One latent "popularity" per product ties the numbers together: cheaper,
   * better-discounted, mass-market products sell more, gather more reviews
   * and need deeper stock; premium products sell fewer but rate higher.
   */
  const tierPopularity = { budget: 1.35, mid: 1, premium: 0.6 }[tier];
  const pricePull = clamp((2_000 / price) ** 0.18, 0.5, 1.8);
  const popularity = Math.exp(rng.normal(0, 1)) * tierPopularity * pricePull * (1 + discount * 0.8);

  let ratings = rateProduct(rng, 0, 0);
  if (ctx.withRatings) {
    const ageFactor = Math.min(1, ageDays / 240) ** 0.8;
    const reviewCount =
      ageDays < 3 || rng.chance(0.04)
        ? 0
        : Math.round(category.reviewScale * popularity * ageFactor * rng.float(0.05, 0.6));
    const tierQuality = { budget: -0.18, mid: 0, premium: 0.22 }[tier];
    const mean = clamp(
      4.12 +
        tierQuality +
        rng.normal(0, 0.22) -
        (discount > 0.6 ? 0.12 : 0) +
        rng.normal(0, 0.5 / Math.sqrt(1 + reviewCount / 5)),
      2.3,
      4.85,
    );
    ratings = rateProduct(rng, reviewCount, mean);
  }

  const threshold = sub.lowStockThreshold ?? LOW_STOCK_THRESHOLD;
  const stock = stockFor(rng, sub, popularity, threshold);
  const sku = uniqueSku(rng, category, sub, brand, ctx.skus);

  const colors = draft.colors ?? [];
  const sizeLabels = draft.sizes ?? [];
  const variants = draft.trackVariants
    ? planNewVariants(
        splitAcrossVariants(
          rng,
          stock,
          colors.map((c) => c.name),
          sizeLabels,
        ),
        sku,
        { colors: colors.map((c) => c.name), sizes: sizeLabels },
      )
    : [];
  const sizes = deriveSizeAvailability(
    sizeLabels.map((label) => ({ label, inStock: stock > 0 })),
    variants,
  );

  return {
    name: draft.name,
    slug: uniqueSlug(draft.name, sku, ctx.slugs),
    description: draft.description,
    shortDescription: draft.shortDescription,
    images: pickImages(draft.images ?? sub.images, ctx.ordinal, rng),
    price,
    compareAtPrice,
    sku,
    stock,
    variants,
    lowStockThreshold: sub.lowStockThreshold ?? null,
    colors,
    sizes,
    tags: tagsFor(category, sub, brand, draft),
    highlights: draft.highlights.slice(0, 12),
    specifications: [...draft.specifications, { label: 'Brand', value: brand }].slice(0, 30),
    ...ratings,
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: ageDays <= 30,
    isActive: rng.chance(0.98),
    createdAt,
    updatedAt,
    categorySlug: category.slug,
    brandName: brand,
    subcategory: sub.key,
  };
}

/**
 * Best sellers are earned rather than sprinkled: the most-reviewed tenth of
 * each subcategory, provided they rate 4.0 or better. Featured products are a
 * small editorial pick from what is well rated and actually in stock.
 */
function markBestSellersAndFeatured(rng: Rng, products: GeneratedProduct[]): void {
  const bySub = new Map<string, GeneratedProduct[]>();
  for (const product of products) {
    const list = bySub.get(product.subcategory) ?? [];
    list.push(product);
    bySub.set(product.subcategory, list);
  }

  for (const list of bySub.values()) {
    const top = [...list]
      .sort((a, b) => b.reviewCount - a.reviewCount)
      .slice(0, Math.floor(list.length * 0.1));
    for (const product of top) {
      if (product.rating >= 4 && product.reviewCount >= 100) product.isBestSeller = true;
    }
  }

  // Without ratings (`--no-ratings`) there is nothing to rank by, so any live, in-stock product qualifies.
  const rated = products.some((p) => p.reviewCount > 0);
  const candidates = products.filter(
    (p) => p.isActive && p.stock > 0 && (!rated || p.rating >= 4.2),
  );
  for (const product of rng.sample(candidates, Math.max(1, Math.round(products.length * 0.04))))
    product.isFeatured = true;
}
