import { Types } from 'mongoose';
import { Product } from '../../models/product.model';

/**
 * "Similar products", decided by ordinary code.
 *
 * No model call happens here, ever. Deciding that one pair of running shoes
 * resembles another is a comparison of category, brand, tags, price and
 * colourway — five fields the database already holds — and code compares them
 * exactly, instantly, for free, and the same way twice. A model would be slower,
 * cost money per product page, and give a different answer on a refresh.
 *
 * That is the phase's dividing line in one file: AI reads sentences, code
 * compares data.
 */

/** What similarity needs from a product. */
interface SimilarityFields {
  _id: Types.ObjectId | string;
  name: string;
  price: number;
  category: Types.ObjectId | string;
  brand: Types.ObjectId | string;
  tags: string[];
  colors: { name: string }[];
  sizes: { label: string }[];
  rating: number;
  reviewCount: number;
  stock: number;
}

/**
 * The weights.
 *
 * Category dominates because it is what "similar" mostly means in a shop: a
 * shopper looking at a running shoe wants another shoe, not another Nike
 * product. Brand and tags refine within that. Price proximity matters because a
 * ₹90,000 laptop is not a useful alternative to a ₹9,000 one even though both
 * are laptops.
 */
export const SIMILARITY_WEIGHTS = {
  sameCategory: 5,
  sameBrand: 2,
  /** Per shared tag, capped by `MAX_TAG_MATCHES` so a tag-stuffed product cannot run away with it. */
  sharedTag: 1.2,
  /** Scaled 0..1 by how close the prices are; see `priceProximity`. */
  priceProximity: 2.5,
  sharedColor: 0.6,
  sharedSize: 0.4,
  /** Scaled by rating/5, and only for products that have been reviewed. */
  rating: 0.8,
  inStock: 0.5,
} as const;

const MAX_TAG_MATCHES = 4;

/**
 * 1 when the prices match, falling to 0 as they diverge.
 *
 * Relative rather than absolute: ₹500 apart is nothing on a laptop and is the
 * whole difference between two t-shirts, so the gap is measured against the
 * price of the product being viewed.
 */
export function priceProximity(source: number, candidate: number): number {
  if (source <= 0) return 0;
  const ratio = Math.abs(candidate - source) / source;
  return Math.max(0, 1 - ratio);
}

export function scoreSimilarity(source: SimilarityFields, candidate: SimilarityFields): number {
  let score = 0;

  if (String(candidate.category) === String(source.category))
    score += SIMILARITY_WEIGHTS.sameCategory;
  if (String(candidate.brand) === String(source.brand)) score += SIMILARITY_WEIGHTS.sameBrand;

  const sourceTags = new Set(source.tags.map((tag) => tag.toLowerCase()));
  const sharedTags = candidate.tags.filter((tag) => sourceTags.has(tag.toLowerCase())).length;
  score += Math.min(sharedTags, MAX_TAG_MATCHES) * SIMILARITY_WEIGHTS.sharedTag;

  score += priceProximity(source.price, candidate.price) * SIMILARITY_WEIGHTS.priceProximity;

  const sourceColors = new Set(source.colors.map((color) => color.name.toLowerCase()));
  if (candidate.colors.some((color) => sourceColors.has(color.name.toLowerCase()))) {
    score += SIMILARITY_WEIGHTS.sharedColor;
  }

  const sourceSizes = new Set(source.sizes.map((size) => size.label.toLowerCase()));
  if (candidate.sizes.some((size) => sourceSizes.has(size.label.toLowerCase()))) {
    score += SIMILARITY_WEIGHTS.sharedSize;
  }

  // An unrated product is new, not bad — it scores zero here, never negative.
  if (candidate.reviewCount > 0) score += (candidate.rating / 5) * SIMILARITY_WEIGHTS.rating;

  if (candidate.stock > 0) score += SIMILARITY_WEIGHTS.inStock;

  return score;
}

/**
 * The fields similarity reads, plus the ones a product card renders.
 *
 * Selected explicitly so a page of similar products costs one query returning
 * exactly what it needs, rather than whole documents.
 */
const CANDIDATE_FIELDS =
  'name slug shortDescription images price compareAtPrice category brand sku stock ' +
  'colors sizes variants tags rating reviewCount isFeatured isBestSeller isNewArrival createdAt';

const REFERENCE_FIELDS = 'name slug';

/**
 * How many products similarity will consider.
 *
 * Scored in this process, so it is bounded like every other ranking here. The
 * candidate query is already narrowed to the same category, brand or tags, so
 * this ceiling is generous rather than restrictive.
 */
const CANDIDATE_LIMIT = 80;

export interface SimilarProductsOptions {
  limit?: number;
  /**
   * Products to leave out — the one being viewed, and anything the caller has
   * already shown elsewhere on the page.
   */
  exclude?: string[];
}

/**
 * Products similar to the given one.
 *
 * Availability is a filter, not a penalty: `isActive: false` products never
 * reach the candidate set, so a deleted or unpublished product cannot be
 * recommended no matter how well it scores. Out-of-stock products are allowed
 * in but ranked below everything buyable, because "this exists and is coming
 * back" is occasionally useful and "buy this" is not.
 */
export async function findSimilarProducts(
  idOrSlug: string,
  options: SimilarProductsOptions = {},
): Promise<unknown[]> {
  const limit = Math.min(Math.max(options.limit ?? 4, 1), 12);

  const isObjectId = /^[0-9a-fA-F]{24}$/.test(idOrSlug);
  const source = await Product.findOne(
    isObjectId ? { _id: idOrSlug } : { slug: idOrSlug, isActive: true },
  ).select('name price category brand tags colors sizes rating reviewCount stock');

  if (!source) return [];

  const excluded = [String(source._id), ...(options.exclude ?? [])]
    .filter((id) => /^[0-9a-fA-F]{24}$/.test(id))
    .map((id) => new Types.ObjectId(id));

  /**
   * Candidates are anything that shares a category, a brand or a tag. Narrowing
   * to the category alone would miss the accessory that pairs with it; not
   * narrowing at all would mean scoring the whole catalogue on every product
   * page.
   */
  const candidates = await Product.find({
    isActive: true,
    _id: { $nin: excluded },
    $or: [
      { category: source.category },
      { brand: source.brand },
      ...(source.tags.length > 0 ? [{ tags: { $in: source.tags } }] : []),
    ],
  })
    .select(CANDIDATE_FIELDS)
    .populate('category', REFERENCE_FIELDS)
    .populate('brand', REFERENCE_FIELDS)
    // A stable read order, so the window holds the same products each time and
    // scoring is the only thing deciding position.
    .sort({ createdAt: -1, _id: 1 })
    .limit(CANDIDATE_LIMIT);

  const scored = candidates.map((candidate) => ({
    candidate,
    score: scoreSimilarity(
      source as unknown as SimilarityFields,
      candidate as unknown as SimilarityFields,
    ),
  }));

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Stable tiebreakers, so the same product page always lists the same
    // products in the same order.
    if (a.candidate.price !== b.candidate.price) return a.candidate.price - b.candidate.price;
    return String(a.candidate._id).localeCompare(String(b.candidate._id));
  });

  return scored.slice(0, limit).map((entry) => entry.candidate.toJSON());
}
