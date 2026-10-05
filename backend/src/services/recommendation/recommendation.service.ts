import { Types } from 'mongoose';
import { Product } from '../../models/product.model';
import { recentActivity, type ActivityEntry } from '../activity/activity.service';
import { findSimilarProducts } from './similarity';

/**
 * Recommendations, decided by ordinary code.
 *
 * No model call happens here either. "This customer has looked at four pairs of
 * running shoes, so show them running shoes" is arithmetic over rows the
 * database already holds — and it has to be arithmetic, because a shopper who
 * refreshes the homepage must see the same products, and an engineer asked why
 * a product appeared must be able to answer.
 *
 * It is also not machine learning, and the documentation says so plainly. It is
 * a weighted count of recent interactions, scored against the catalogue.
 */

export type RecommendationContext = 'homepage' | 'product' | 'cart';

/** Why these products, in terms the storefront can label honestly. */
export type RecommendationReason =
  /** Scored against this customer's own recent activity. */
  | 'interests'
  /** Similar to the product being viewed. */
  | 'similar'
  /** No personal signal — the catalogue's own popular products. */
  | 'popular';

/**
 * A product as the API serialises it. Narrow on purpose: the only field this
 * service reads back off a serialised product is its id, for de-duplication.
 */
export type SerializedProduct = Record<string, unknown> & { id: string };

/**
 * `toJSON()` with the shape the API actually returns.
 *
 * The `_id` -> `id` rename happens in `baseSchemaOptions`, in a transform
 * function Mongoose's types cannot see through, so every model's `toJSON()` is
 * typed as still having `_id`. The cast is the one place that gap is bridged,
 * rather than at each of the four call sites.
 */
const serialize = (document: { toJSON: () => unknown }): SerializedProduct =>
  document.toJSON() as SerializedProduct;

export interface RecommendationResult {
  products: SerializedProduct[];
  /**
   * True only when the ranking actually used this customer's activity. The
   * storefront keys its heading off this, which is what stops "Recommended for
   * you" appearing above a list nobody was recommended.
   */
  personalized: boolean;
  reason: RecommendationReason;
}

/**
 * How much each kind of interaction says about what someone wants.
 *
 * A view is a glance; putting something in a cart is a decision. Buying is the
 * strongest signal of taste and the weakest signal of *demand* — you rarely
 * want a second one — which is why purchases raise the score of a category and
 * the purchased product itself is pushed down later.
 */
export const EVENT_WEIGHTS = {
  product_view: 1,
  search: 0.5,
  wishlist_add: 2.5,
  add_to_cart: 3,
  purchase: 3.5,
} as const;

/**
 * Recency, as a simple half-life rather than a decay model.
 *
 * Interest from this week should outweigh interest from two months ago, and
 * that is the entire requirement. A fortnight's half-life means a 30-day-old
 * view counts about a quarter of today's — enough to fade, not enough to
 * vanish while someone is still deciding.
 */
const HALF_LIFE_DAYS = 14;

export function recencyWeight(at: Date, now = Date.now()): number {
  const ageDays = Math.max(0, (now - at.getTime()) / (24 * 60 * 60 * 1000));
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

/** Below this, the customer has not told us enough to claim personalisation. */
const MIN_SIGNAL_STRENGTH = 2;

/** How many products the scorer considers. Bounded like every other ranking here. */
const CANDIDATE_LIMIT = 100;

/**
 * What the customer's activity adds up to: weighted affinity per category,
 * brand and tag, plus the products they already interacted with.
 */
interface Affinity {
  categories: Map<string, number>;
  brands: Map<string, number>;
  tags: Map<string, number>;
  /** Products already seen, and how strongly — used to avoid repeating them. */
  seen: Map<string, number>;
  /** Products already bought. Recommending them again is rarely useful. */
  purchased: Set<string>;
  strength: number;
}

const bump = (map: Map<string, number>, key: string, amount: number) => {
  map.set(key, (map.get(key) ?? 0) + amount);
};

/**
 * Turns activity rows into affinities.
 *
 * Products that have since been deleted or deactivated simply do not come back
 * from this lookup, so their activity contributes nothing — a dangling
 * reference is absence, never an error.
 */
async function buildAffinity(activity: ActivityEntry[]): Promise<Affinity> {
  const affinity: Affinity = {
    categories: new Map(),
    brands: new Map(),
    tags: new Map(),
    seen: new Map(),
    purchased: new Set(),
    strength: 0,
  };

  if (activity.length === 0) return affinity;

  const ids = [...new Set(activity.map((entry) => entry.productId))]
    .filter((id) => /^[0-9a-fA-F]{24}$/.test(id))
    .map((id) => new Types.ObjectId(id));

  const products = await Product.find({ _id: { $in: ids }, isActive: true })
    .select('category brand tags')
    .lean();

  const byId = new Map(products.map((product) => [String(product._id), product]));
  const now = Date.now();

  for (const entry of activity) {
    const product = byId.get(entry.productId);
    if (!product) continue;

    const weight = EVENT_WEIGHTS[entry.event] * recencyWeight(entry.at, now);

    bump(affinity.categories, String(product.category), weight);
    bump(affinity.brands, String(product.brand), weight);
    for (const tag of product.tags) bump(affinity.tags, tag.toLowerCase(), weight);

    bump(affinity.seen, entry.productId, weight);
    if (entry.event === 'purchase') affinity.purchased.add(entry.productId);

    affinity.strength += weight;
  }

  return affinity;
}

/**
 * The scoring weights.
 *
 * Affinities are normalised to 0..1 against the customer's own strongest
 * signal first, so someone with fifty interactions and someone with five are
 * scored on the same scale and the weights below mean the same thing for both.
 */
export const SCORE_WEIGHTS = {
  category: 4,
  brand: 2.5,
  /** Summed across matching tags, then capped, so a tag-heavy product cannot run away with it. */
  tag: 1,
  maxTagContribution: 3,
  /** Quality, scaled by rating/5 and only once a product has been reviewed. */
  rating: 1.2,
  inStock: 0.8,
  /**
   * Already interacted with. Negative but survivable: a product someone looked
   * at twice is a reasonable thing to show again, and a product they *bought*
   * usually is not — hence the much larger penalty below.
   */
  alreadySeen: -1.5,
  alreadyPurchased: -6,
} as const;

interface ScorableProduct {
  _id: Types.ObjectId | string;
  price: number;
  category: Types.ObjectId | string;
  brand: Types.ObjectId | string;
  tags: string[];
  rating: number;
  reviewCount: number;
  stock: number;
}

function normalised(map: Map<string, number>, key: string): number {
  const max = Math.max(...map.values(), 0);
  if (max <= 0) return 0;
  return (map.get(key) ?? 0) / max;
}

export function scoreForCustomer(product: ScorableProduct, affinity: Affinity): number {
  let score = 0;

  score += normalised(affinity.categories, String(product.category)) * SCORE_WEIGHTS.category;
  score += normalised(affinity.brands, String(product.brand)) * SCORE_WEIGHTS.brand;

  const tagScore = product.tags.reduce(
    (total, tag) => total + normalised(affinity.tags, tag.toLowerCase()) * SCORE_WEIGHTS.tag,
    0,
  );
  score += Math.min(tagScore, SCORE_WEIGHTS.maxTagContribution);

  if (product.reviewCount > 0) score += (product.rating / 5) * SCORE_WEIGHTS.rating;
  if (product.stock > 0) score += SCORE_WEIGHTS.inStock;

  const id = String(product._id);
  if (affinity.seen.has(id)) score += SCORE_WEIGHTS.alreadySeen;
  if (affinity.purchased.has(id)) score += SCORE_WEIGHTS.alreadyPurchased;

  return score;
}

/**
 * Keeps the list from becoming five colourways of one shoe.
 *
 * Walks the ranked products in order and takes the next one whose brand has not
 * already been used twice — then, if that leaves the list short, relaxes and
 * fills from what remains. Order within the result is still the ranked order,
 * so this constrains the selection without making it unpredictable.
 */
export function diversify<T extends { brand: unknown; category: unknown }>(
  ranked: T[],
  limit: number,
): T[] {
  const MAX_PER_BRAND = 2;
  const perBrand = new Map<string, number>();

  const picked: T[] = [];
  const skipped: T[] = [];

  for (const product of ranked) {
    if (picked.length >= limit) break;

    const brand = String(product.brand);
    const used = perBrand.get(brand) ?? 0;

    if (used >= MAX_PER_BRAND) {
      skipped.push(product);
      continue;
    }

    perBrand.set(brand, used + 1);
    picked.push(product);
  }

  // A catalogue dominated by one brand should still fill the rail rather than
  // show two products because of a rule meant to improve variety.
  for (const product of skipped) {
    if (picked.length >= limit) break;
    picked.push(product);
  }

  return picked;
}

const CANDIDATE_FIELDS =
  'name slug shortDescription images price compareAtPrice category brand sku stock ' +
  'colors sizes variants tags rating reviewCount isFeatured isBestSeller isNewArrival createdAt';

const REFERENCE_FIELDS = 'name slug';

/**
 * The fallback everyone gets when there is nothing personal to go on: a new
 * account, a signed-out visitor, or a customer whose activity has aged out.
 *
 * Best sellers and highly rated products, in stock, ordered deterministically.
 * It is labelled `popular` rather than `interests`, which is what stops the
 * storefront calling it "Recommended for you".
 */
async function popularProducts(limit: number, exclude: string[]): Promise<SerializedProduct[]> {
  const excluded = exclude
    .filter((id) => /^[0-9a-fA-F]{24}$/.test(id))
    .map((id) => new Types.ObjectId(id));

  const products = await Product.find({
    isActive: true,
    stock: { $gt: 0 },
    ...(excluded.length > 0 ? { _id: { $nin: excluded } } : {}),
  })
    .select(CANDIDATE_FIELDS)
    .populate('category', REFERENCE_FIELDS)
    .populate('brand', REFERENCE_FIELDS)
    // Best sellers first, then by rating, then by review volume. `_id` last, so
    // two equally popular products never swap places between requests.
    .sort({ isBestSeller: -1, rating: -1, reviewCount: -1, _id: 1 })
    .limit(limit * 3);

  return diversify(products, limit).map(serialize);
}

export interface RecommendationOptions {
  userId: string | null;
  limit?: number;
  /** Products already on the page — the one being viewed, the cart's contents. */
  exclude?: string[];
}

/**
 * Products to show this customer.
 *
 * Every path ends in products: a signed-out visitor gets popular ones, a new
 * account gets popular ones, and a customer with real activity gets a ranked
 * selection. There is no branch that returns an empty rail, because an empty
 * rail on a homepage is a worse outcome than an unpersonalised one.
 */
export async function getRecommendations(
  options: RecommendationOptions,
): Promise<RecommendationResult> {
  const limit = Math.min(Math.max(options.limit ?? 8, 1), 20);
  const exclude = options.exclude ?? [];

  if (!options.userId) {
    return {
      products: await popularProducts(limit, exclude),
      personalized: false,
      reason: 'popular',
    };
  }

  const activity = await recentActivity(options.userId, { limit: 120, days: 90 });
  const affinity = await buildAffinity(activity);

  /**
   * Cold start. A couple of page views is not a taste, and dressing it up as
   * one produces both bad recommendations and a claim the data does not
   * support.
   */
  if (affinity.strength < MIN_SIGNAL_STRENGTH) {
    return {
      products: await popularProducts(limit, exclude),
      personalized: false,
      reason: 'popular',
    };
  }

  const excluded = exclude
    .filter((id) => /^[0-9a-fA-F]{24}$/.test(id))
    .map((id) => new Types.ObjectId(id));

  /**
   * Candidates are narrowed to what the customer has actually shown interest
   * in — their categories, brands and tags — rather than scoring the whole
   * catalogue. Availability is a filter, not a penalty: an inactive or
   * sold-out product never becomes a recommendation at all.
   */
  const candidates = await Product.find({
    isActive: true,
    stock: { $gt: 0 },
    ...(excluded.length > 0 ? { _id: { $nin: excluded } } : {}),
    $or: [
      { category: { $in: [...affinity.categories.keys()].map((id) => new Types.ObjectId(id)) } },
      { brand: { $in: [...affinity.brands.keys()].map((id) => new Types.ObjectId(id)) } },
      { tags: { $in: [...affinity.tags.keys()] } },
    ],
  })
    .select(CANDIDATE_FIELDS)
    .populate('category', REFERENCE_FIELDS)
    .populate('brand', REFERENCE_FIELDS)
    .sort({ createdAt: -1, _id: 1 })
    .limit(CANDIDATE_LIMIT);

  if (candidates.length === 0) {
    return {
      products: await popularProducts(limit, exclude),
      personalized: false,
      reason: 'popular',
    };
  }

  const scored = candidates.map((product) => ({
    product,
    score: scoreForCustomer(product as unknown as ScorableProduct, affinity),
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.product.price !== b.product.price) return a.product.price - b.product.price;
    return String(a.product._id).localeCompare(String(b.product._id));
  });

  const products = diversify(
    scored.map((entry) => entry.product),
    limit,
  ).map(serialize);

  /**
   * A short personalised list is worse than a full popular one, so it is topped
   * up rather than shipped half-empty — and it stays labelled `interests`,
   * because the products that decided its order did come from this customer's
   * activity.
   */
  if (products.length < limit) {
    const shown = products.map((product) => product.id);
    const filler = await popularProducts(limit - products.length, [...exclude, ...shown]);
    products.push(...filler);
  }

  return { products, personalized: true, reason: 'interests' };
}

/**
 * Products to show beside the one being viewed.
 *
 * Similarity decides the list; the customer's activity is deliberately not
 * consulted. Someone on a product page is asking about *that* product, and a
 * rail that quietly reordered itself per visitor would be both less useful and
 * impossible to explain.
 */
export async function getProductPageRecommendations(
  idOrSlug: string,
  limit: number,
  exclude: string[] = [],
): Promise<RecommendationResult> {
  const products = (await findSimilarProducts(idOrSlug, { limit, exclude })) as SerializedProduct[];

  if (products.length > 0) return { products, personalized: false, reason: 'similar' };

  return {
    products: await popularProducts(limit, exclude),
    personalized: false,
    reason: 'popular',
  };
}

/** Exposed for the product service's related rail and for tests. */
export { popularProducts };
